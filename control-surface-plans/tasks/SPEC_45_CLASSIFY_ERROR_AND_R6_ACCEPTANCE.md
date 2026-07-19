# SPEC 45 — classifyError fix + strict R6 repair-arc acceptance

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` classifier rider + R6 · **Date:** 2026-07-18 UTC · **Status:** accepted implementation contract

**Supersedes:** `SPEC_44_CLASSIFY_FIX_AND_R6_VERIFY.md`. SPEC 44 collided with the health-state frontend slice and was based on pre-landing API and classifier drafts. Preserve SPEC 44 as history; implement this file.

**Type:** one bounded classifier repair plus deterministic verification tooling, API/UI contract tests, and operator acceptance evidence. No schema or migration. The verifier reads live systems but never changes routing, config, timers, services, credentials, or product data. Its only writes are timestamped evidence files.

## 1. Outcome

This slice closes two obligations without manufacturing a green result:

- Fix the latent `classifyError` rule that treats any message containing the digit `5` as a server error.
- Decide whether the model-routing repair arc is accepted, pending, unverifiable, or regressed using hard, reproducible gates.

The acceptance report covers R0 trace correlation, R1b reprobe stability, R2 ledger reconciliation and 429 decay, R3 API/UI health-state integration, and R6 real-work and regression evidence. R4 and R5 must have explicit operator dispositions before the whole arc can be accepted; they may not disappear from the report because they require a decision.

`verified` means every required gate passed with enough evidence. Missing input is never success. Thin input is never success. A pre-repair baseline is never an acceptance result.

## 2. Verified repository facts

The implementation must use the repository as it exists after the repair commits, not the stale names in SPEC 44:

- R0 gateway correlation landed in `9ba95af` at `2026-07-17T12:46:13Z`.
- R0b closed the direct ledger writer in `0c3a29e` at `2026-07-17T13:10:56Z`.
- The unified post-R0 cutoff is therefore `2026-07-17T13:10:56.000Z`, epoch milliseconds `1784293856000`.
- R1b stability ownership landed in `/opt/mimoun` commit `d117b84`; timeout-like probe codes are `0` and `408`, timeout prune streak is 3, and non-incumbent promotion streak is 3.
- R3 uses `healthState`, `healthBucket`, and `healthReason` on every `/api/models` row, with `healthStateSummary` and `healthBucketSummary` in the summary.
- The seven states are `live`, `limited`, `slow`, `degraded`, `dead`, `hang`, and `unknown`.
- The three buckets are `healthy`, `unhealthy`, and `unknown`.
- `server/api/modelHealthState.ts` exports `deriveHealthState` and `healthBucket`; there is no `healthGroup` export.
- `HealthSignals` is flat: fields include `probeCode`, `probeMs`, `probeStreak`, `recentCalls`, `recentSuccesses`, `allTimeCalls`, and `allTimeSuccesses`. It does not contain nested `probe` or `ledger` objects.
- The reprobe path override is `DASHBOARD_REPROBE_STATE_PATH`, defaulting to `/var/lib/mimule/model-fallback-reprobe.json`.
- `getDashboardDb()` only returns the process-global database previously opened by the server. It does not initialize a standalone CLI database.
- `initDashboardDb()` is a read-write initializer that creates directories, enables WAL, and runs migrations. The verification CLI must not call it.
- This VPS must not run Playwright. `e2e/fresh-host/gate.sh` invokes Playwright and is prohibited here.

These facts are pinned by tests so later refactors fail visibly rather than silently changing verification semantics.

## 3. Part A — correct `classifyError`

### 3.1 Change

In `server/gateway/router.ts`, export `classifyError` for its focused unit tests and replace the bare-digit branch:

```ts
// before
if (msg.includes("5")) return "server_error";

// after
if (/^litellm 5\d\d:/.test(msg)) return "server_error";
```

The prefix is guaranteed by `LiteLLMAdapter`, which formats reached-upstream failures as `LiteLLM <status>: <body>`. Anchoring prevents a non-5xx response body such as `LiteLLM 400: expected 500 tokens` from becoming a server error. Do not change `isGatewayUnreachable` or any other classification branch.

`\d` matches a digit, not the letter `x`; this rule recognizes concrete HTTP 500–599 statuses, not the literal text `5xx`.

### 3.2 Focused cases

Add table-driven tests to `server/gateway/router.test.ts`:

| Message | Expected |
|---|---|
| `LiteLLM 500: internal server error` | `server_error` |
| `LiteLLM 502: bad gateway` | `server_error` |
| `LiteLLM 504: upstream gateway error` | `server_error` |
| `LiteLLM 504: upstream timeout` | `timeout` |
| `LiteLLM 400: model gpt-5 not found` | `unknown` |
| `LiteLLM 400: expected 5 candidates` | `unknown` |
| `LiteLLM 400: expected 500 tokens` | `unknown` |
| `request failed after 1500ms` | `unknown` |
| `LiteLLM 429: rate limited` | `rate_limit` |
| `LiteLLM 401: unauthorized` | `auth` |
| `LiteLLM 503: service unavailable` | `unavailable` |
| `The operation was aborted` | `timeout` |

The 504 timeout case intentionally pins existing precedence: the specific timeout branch runs before generic 5xx classification.

## 4. Verification architecture

### 4.1 Deterministic core

Create `server/api/repairArcVerify.ts` as a deterministic computation module. It receives already-read rows and snapshots; it performs no filesystem, database, subprocess, journal, network, or clock I/O.

The core returns structured checks:

```ts
type CheckVerdict = "PASS" | "PENDING" | "UNVERIFIABLE" | "FAIL";

interface CheckResult {
  id: string;
  verdict: CheckVerdict;
  note: string;
  metrics: Record<string, number | string | boolean | null>;
  evidence: Array<Record<string, unknown>>;
}

interface RepairArcReport {
  generatedAt: number;
  overall: "verified" | "partial" | "unverifiable" | "regressed";
  checks: CheckResult[];
}
```

Arrays such as timeout offenders, ledger disagreements, and state samples belong in `evidence`; do not serialize them into a note or pretend the scalar `metrics` map can hold them.

Overall precedence is strict:

- Any `FAIL` means `regressed`.
- Otherwise, any `UNVERIFIABLE` means `unverifiable`.
- Otherwise, any `PENDING` means `partial`.
- Only all-`PASS` means `verified`.

### 4.2 Thin CLI

Create `scripts/verify-repair-arc.ts`. It reads inputs, calls the deterministic core, prints the report, and writes one new timestamped evidence file.

Open SQLite directly and read-only:

```ts
import { Database } from "bun:sqlite";
import { getDashboardDbPath } from "../server/db/dashboard.ts";

const db = new Database(getDashboardDbPath(), {
  readonly: true,
  create: false,
});
try {
  db.exec("PRAGMA query_only = ON");
  // SELECT only
} finally {
  db.close();
}
```

Do not call `getDashboardDb()` or `initDashboardDb()`. Failure to open the existing database is `UNVERIFIABLE`, with the error sanitized into the report.

Read the reprobe file from:

```ts
process.env.DASHBOARD_REPROBE_STATE_PATH
  ?? "/var/lib/mimule/model-fallback-reprobe.json"
```

Validate its shape. Do not cast malformed JSON into a trusted state. Read journald using fixed subprocess arguments, `--no-pager`, and UTC timestamps; never invoke a shell pipeline and never write a unit or config.

The CLI accepts an optional authenticated base URL for live API checks. It never prints, stores, hashes, or includes the operator token in errors or evidence.

### 4.3 Strict process result

Acceptance-mode exit codes are:

- `0`: overall `verified`; every required check is `PASS`.
- `2`: overall `regressed`; at least one required check is `FAIL`.
- `3`: overall `partial` or `unverifiable`; at least one required check lacks sufficient trustworthy evidence.
- `64`: invalid CLI arguments.

There is no exit-0 compatibility mode for a partial report. Capturing an observation may write its timestamped file, but it must still exit 3 until the acceptance set is complete.

## 5. R0 — trace correlation and request truth

### 5.1 Input query

Use the exact unified cutoff and select a stable row identifier:

```sql
SELECT id, ts, logical_model, resolved_model, backend,
       success, latency_ms, error_class, trace_id, caller, tenant_id
FROM gateway_calls
WHERE ts >= 1784293856000
ORDER BY ts ASC, id ASC;
```

Do not use midnight on 2026-07-17. Rows before R0 and R0b cannot be backfilled honestly.

### 5.2 Separate writer semantics

Compute request-level routing metrics only from `backend='litellm'`. A `cli-direct` row is builder accounting, not a fallback hop, and must not inflate request success.

Verify direct-writer trace and tenant coverage separately:

- Every post-cutoff `cli-direct` row must have a nonempty `trace_id` and `tenant_id`.
- Every post-cutoff LiteLLM row must have a nonempty `trace_id`.
- Zero post-cutoff rows means `PENDING`, not a divide-by-zero success.
- Any missing identifier after the cutoff means `FAIL`. The hard coverage target is 100%, not 99%.

For LiteLLM rows, group by `trace_id` in `(ts,id)` order:

- Request success is `any(success=1)`.
- Wasted attempts are model-attributable failures before the first success.
- `gateway_unreachable` is an infrastructure failure and not a wasted model hop, though an all-infrastructure-failure request still failed.
- Time to first success is the sum of non-null, nonnegative `latency_ms` values through the first successful hop. Do not label a difference between ledger write timestamps as end-to-end latency.
- Rows after the first success are a consistency violation and cause `FAIL`.

Trace plumbing is `PASS` only at 100% coverage. The request-rate evidence remains `PENDING` until at least five naturally occurring multi-hop LiteLLM requests exist, as required by the repair plan’s thin-data warning. Synthetic fallback tests prove code behavior but do not replace natural acceptance evidence.

## 6. R1b — three-cycle stability and restart target

One current state file cannot prove hysteresis. The verifier stores a new observation for each distinct successful scheduled reprobe invocation and evaluates the latest three.

Each observation records:

- The reprobe state `ts`, top-level `changed`, ordered `pool`, and sorted `live`, `limited`, `dead`, `hang`, and `timeout` sets.
- Validated history records with code, category, streak, since, and latency.
- The corresponding `model-fallback-reprobe.service` invocation ID and result from journald.
- The LiteLLM start events in the rolling 24-hour window.

Hard gates:

- Three distinct successful scheduled cycles are present. Manual dry runs do not count.
- Each cycle advanced the state timestamp; the newest state is no older than four hours.
- The final three pool hashes and state-distribution hashes are identical.
- `changed=false` in all three stable samples.
- Incumbents observed at timeout-like code `0` or `408` with streak 1 or 2 remain in the pool.
- A timeout-like incumbent at streak 3 is absent after a successful rebuild.
- Terminal dead codes are absent immediately.
- A non-incumbent routable observation is absent at promotion streak 1 and 2 and present only at streak 3.
- Missing or malformed prior history never grants a timeout hold.
- LiteLLM has at most one `Started litellm.service` event in the rolling 24-hour window. More than one is `FAIL`, not a soft note.

A failed/aborted timer run, stale state, unavailable journal, or fewer than three successful scheduled samples is not acceptance. Use `FAIL` for a proven invariant violation and `PENDING`/`UNVERIFIABLE` for incomplete/missing evidence.

## 7. R2 — observed outcomes outrank probes

### 7.1 Model-attributable ledger cohort

Hard dead-route reconciliation uses the recent seven-day cohort. Destructive
evidence is an allowlist, not every error that happens not to be called
`gateway_unreachable`:

```sql
WHERE ts >= ?
  AND backend != 'cli-direct'
  AND (tenant_id IS NULL OR tenant_id = 'mimule')
  AND (error_class IS NULL OR error_class != 'gateway_unreachable')
  AND (
    success = 1
    OR (success = 0 AND error_class IN ('rate_limit', 'auth', 'timeout', 'unavailable'))
  )
```

`gateway_unreachable` is explicitly infrastructure. Legacy `unknown` rows include pre-infra-retry restart artifacts and cannot prove model deadness. Historical `server_error` rows are also excluded because the broad `msg.includes("5")` classifier made that class unreliable before Part A. Report all excluded classes separately so the verifier does not erase the operational history. Demo/synthetic tenants cannot influence the MIMULE routing pool.

Compute the earned-history shield over all rows through the attested query ceiling that pass the same attribution, backend, tenant, route-identity, and trusted-error allowlist: at least 50 attributable calls and at least 60% success. This shield is historical; the hard-dead and credential/quota decision counts remain limited to the recent seven-day window. Infrastructure, future-dated, and legacy-unknown artifacts cannot create or erase an earned record.

The reprobe pool uses logical route names while the ledger records resolved models. Join through the same `logicalName` → `resolvedModel`/`modelId` mapping used by `server/api/models.ts`; do not assume the strings always match.

### 7.2 R2a hard gates

- Zero in-pool eligible routes have at least 20 model-attributable recent calls and zero successes.
- Every hard-dead route is absent from every managed fallback chain after the R2 apply point.
- No post-apply real request attempts a hard-dead route.
- Earned routes with at least five recent zero-success credential/quota calls appear in the degraded/quarantine evidence instead of being silently erased as never-proven dead.
- A rate-limit-only prune requires at least 48 hours between its first and last trusted 429 evidence. Mixed rate-limit/error decay remains R2b policy and cannot bypass that clock.
- False-prune analysis considers only the eligible reprobe roster. Weak, local, special, or policy-excluded models are not false prunes merely because they are absent from the editorial pool.
- No eligible ledger evidence means `PENDING`; an empty disagreement list alone is not proof.

R2a first lands in shadow mode. Persist proposed decisions as `would_prune` and `would_quarantine` with `enforced=false`; do not name a proposed action as if routing already changed. Observe the same proposed set across three successful scheduled reprobe cycles before any apply.

Before prune enforcement can be enabled, specify and test a durable tombstone and recovery rule. A pruned route must not re-promote merely because its seven-day failure evidence aged out or the ledger was briefly unavailable. Transient database failure must preserve the last fresh enforced decision or otherwise fail stable. The recovery exit must be explicit, evidence-based, and auditable; changing a mode constant alone is not an acceptable rollout.

### 7.3 R2b 429 clock

Category streak cannot verify continuous 429 behavior because R1b deliberately treats 200, 429, 500, and 503 as the same routable category. R2b passes only when the implementation supplies separately validated exact-code timing for continuous 429 observations.

Hard gates:

- A recent 429 with observed successes remains limited and deprioritized, not dead.
- A continuous 429-only route older than the decided decay window is absent from chain heads and follows the implemented demote/prune policy.
- A 200 observation resets the exact 429 clock.
- Missing exact-code timing makes R2b `PENDING`; category `since` is not accepted as a substitute.

### 7.4 Outcome delta

The historic 8.8% figure in the repair plan was an all-time snapshot and must not be compared to a later rolling seven-day percentage as if the cohorts matched.

Freeze a timestamped pre-R2 cohort at apply time. After at least 20 model-attributable post-apply calls:

- Post-apply rate-limit share must be lower than the frozen comparable baseline.
- Wasted attempts on hard-dead routes must be zero.
- Fewer than 20 post-apply calls leaves the delta `PENDING`.

## 8. R3 — verify the API and the UI contract

Recomputing `deriveHealthState` inside a verifier does not prove that `/api/models` or `ModelsPage` consumes it. Verify all three layers separately.

### 8.1 Classifier unit contract

`server/api/modelHealthState.test.ts` must pin:

- All seven states and all three bucket mappings.
- Exact thresholds and precedence.
- Earned degraded behavior.
- Codes 0 and 408 at streak 3 as hang.
- Unproven 410 as dead.
- A 429 without a successful ledger call never becoming healthy.

### 8.2 API handler and route contract

`server/api/models.test.ts` and `server/api/router.test.ts` must prove:

- The roster is the deterministic union of model-health, reprobe, and ledger evidence without duplicates.
- Alias/resolved-model ledger evidence reaches the correct logical row.
- `cli-direct` and `gateway_unreachable` rows do not manufacture model health.
- Every returned model has a valid `healthState`, valid `healthBucket`, and nonempty `healthReason`.
- Recomputed row histograms exactly equal `healthStateSummary` and `healthBucketSummary`.
- Each summary total equals `data.models.length`.
- A fresh host is honestly `unknown`, not falsely healthy or dead.
- Anonymous `GET /api/models` returns 401.
- Authenticated `GET /api/models` returns 200 with the contract above.

The live API check applies the same structural assertions. It requires at least one healthy-bucket and one unhealthy-bucket route to prove observed separation. It does not require all seven states to occur naturally at once; exhaustive state coverage belongs to deterministic tests.

### 8.3 UI unit contract without a browser

Extract the pure health presentation and grouping logic used by `ModelsPage.tsx` into `app/routes/modelsHealthView.ts`, with focused tests in `app/routes/modelsHealthView.test.ts`. `ModelsPage.tsx` must import and use those tested helpers.

Tests must prove:

- Seven state-to-badge mappings, including distinct degraded, dead, and hang presentation.
- Healthy = live/limited/slow; Needs attention = degraded/dead/hang; Unobserved = unknown.
- Missing legacy row fields fall back to unknown with an honest reason.
- Search, sorting, and pagination grouping preserve every visible row exactly once.
- Summary labels render healthy, needs-attention, and unobserved counts.
- Expanded degraded rows expose the recovery-oriented reason/callout.

Use plain Bun unit tests and pure functions. A React server-rendered pure component is acceptable because it launches no browser. Do not install or run Playwright, Chromium, jsdom, or a desktop browser on this VPS.

`bun run build` plus these unit contracts is the VPS UI integration gate. `GET /models` returning the application shell is a live smoke, not a substitute for the presentation tests.

## 9. R6 — real work and final disposition

The read-only report does not replace real-work acceptance.

Run, with explicit operator authorization, exactly one bounded editorial stage and one bounded one-off builder pass. Do not resume `mimule-jobd`, the autonomous orchestrator, project-improve, or overseer timers.

For both runs, record:

- Start and finish timestamps.
- Workflow/stage/run identifiers.
- Final success/failure.
- Associated trace IDs and ordered route hops.
- Whether any hop used an R2 hard-dead route.
- Whether output passed the existing stage/pass validator.

Both real-work runs must succeed and must not hit a hard-dead route. Missing authorization or missing natural evidence is `PENDING`; a proven failed acceptance run is `FAIL` with its evidence, not silently retried until green.

The report also contains explicit R4 and R5 dispositions:

- R4 credential routes: recovered, deliberately removed, or operator-deferred with UTC date and reason.
- R5 kimi capability: added, deliberately declined, or operator-deferred with UTC date and reason.

An absent disposition prevents whole-arc `verified`.

## 10. Timestamped evidence

Write each observation as a new file:

```text
/var/lib/control-surface/repair-arc-evidence/YYYYMMDDTHHMMSSZ.json
```

Requirements:

- Create with exclusive semantics; never overwrite an observation.
- Include the source commit hashes, exact cutoff, query windows, check results, and sanitized evidence.
- Never include tokens, environment values, request bodies, credentials, or model response content.
- A partial/unverifiable run is retained as an observation but never replaces accepted evidence.
- Update `latest-accepted.json` only after an overall `verified` report; the timestamped accepted file remains immutable.
- Append the accepted summary and evidence path to the UTC AI Vault daily log. Do not rewrite prior entries.

This preserves before/after history. A single repeatedly overwritten `repair-arc-baseline.json` is not an acceptable baseline.

## 11. Bounded VPS validation — no Playwright

Run the compiler and production build:

```bash
cd /opt/opencode-control-surface
bun run check
```

Run only the bounded relevant tests:

```bash
cd /opt/opencode-control-surface
DASHBOARD_DB=1 bun test \
  server/gateway/router.test.ts \
  server/api/modelHealthState.test.ts \
  server/api/models.test.ts \
  server/api/router.test.ts \
  server/api/repairArcVerify.test.ts \
  app/routes/modelsHealthView.test.ts \
  --timeout=60000 \
  --max-concurrency=4 \
  --reporter=dots
```

Do not run bare `bun test`; it can discover unrelated E2E files. Confirm no real Codex process, builder run, or autonomous timer was spawned by the bounded tests.

Run the API-only fresh-host harness from a temporary detached worktree at the candidate commit so the main worktree’s report artifacts remain untouched:

```bash
tmp_root="$(mktemp -d /tmp/cs-spec45-freshhost.XXXXXX)"
tmp_worktree="$tmp_root/worktree"
git worktree add --detach "$tmp_worktree" HEAD
cd "$tmp_worktree"
e2e/fresh-host/run.sh
jq -e '
  .counts.LEAK == 0 and
  .counts.CRASH == 0 and
  .counts["ERROR-5xx"] == 0 and
  (.results | length) > 0 and
  all(.results[]; .verdict == "HONEST")
' e2e/fresh-host/REPORT.json
cd /opt/opencode-control-surface
git worktree remove "$tmp_worktree"
rmdir "$tmp_root"
```

The route count is discovered dynamically and must not be pinned to the obsolete 41-route baseline. Record the actual count. Current HEAD evidence on 2026-07-18 was 145 `HONEST`, zero leak, zero crash, and zero 5xx.

Never run these commands on this VPS:

```bash
e2e/fresh-host/gate.sh
bunx playwright test
bun run test:e2e
```

The verifier also checks live, without printing the token:

- `/health` is 200 and reports `ok=true`.
- `/api/version` is 200 and identifies the deployed candidate commit.
- `/models` returns the application shell with HTTP 200.
- Anonymous `/api/models` returns 401.
- Authenticated `/api/models` returns 200 and passes the R3 structural checks.
- `control-surface.service` is active with no new error-level journal entries attributable to the deploy.

## 12. Hermetic test matrix

`server/api/repairArcVerify.test.ts` must include at least:

- Exact R0 cutoff inclusion/exclusion.
- Empty post-cutoff data is pending without NaN or division by zero.
- One null/empty post-cutoff trace fails 100% coverage.
- LiteLLM request grouping is ordered by timestamp and row ID.
- `cli-direct` is excluded from request success and waste, but checked for trace and tenant IDs.
- Cumulative latency through first success and model-attributable wasted-hop math.
- Rows after first success fail consistency.
- Three stable scheduled R1 samples pass; one or two are pending.
- Stale state, failed invocation, changed pool, timeout/promotion invariant breach, and restart count above one fail appropriately.
- Journald absent is unverifiable.
- R2 excludes cli-direct, gateway-unreachable, and legacy unknown from hard deadness while reporting exclusions.
- R2 excludes pre-fix server-error rows and non-MIMULE demo tenants from destructive evidence.
- R2 alias resolution, n=19 boundary, n=20 zero-success failure, five-call earned degradation, trusted-sample earned shield, and eligible-roster false-prune scope.
- R2 shadow decisions cannot change either rendered routing layer; three scheduled shadow observations agree before apply.
- Rate-limit-only evidence below 48 hours and mixed throttling remain non-destructive.
- An enforced tombstone survives evidence aging and transient ledger failure, and only the explicit recovery rule clears it.
- R2b refuses category `since` as an exact 429 clock and resets the exact clock on 200.
- No ledger evidence is pending rather than pass.
- R3 API histogram totals and enum validation.
- Missing API authentication, malformed API response, and degenerate observed separation do not pass.
- Overall and exit-code precedence.
- Timestamped evidence refuses overwrite and never promotes partial evidence to `latest-accepted`.
- Secret-like input is absent from serialized output and sanitized errors.

All fixtures use temporary files, an in-memory or temporary SQLite database, fabricated journal rows, and stubbed HTTP responses. Tests never read live `/var/lib`, `/etc/litellm`, journald, systemd, or the public edge.

## 13. File scope

Create:

- `server/api/repairArcVerify.ts`
- `server/api/repairArcVerify.test.ts`
- `scripts/verify-repair-arc.ts`
- `app/routes/modelsHealthView.ts`
- `app/routes/modelsHealthView.test.ts`

Edit surgically:

- `server/gateway/router.ts` — export `classifyError` and replace only the bare-digit branch.
- `server/gateway/router.test.ts` — add the focused classifier cases.
- `app/routes/ModelsPage.tsx` — consume the extracted, tested pure health presentation helpers without changing unrelated behavior.

Read only:

- `server/db/dashboard.ts`
- `server/api/models.ts`
- `server/api/modelHealthState.ts`
- `server/api/router.ts`
- `/var/lib/control-surface/dashboard.sqlite`
- `/var/lib/mimule/model-fallback-reprobe.json`
- systemd journals and unit metadata

Never write or restart from the verifier:

- `/etc/litellm/*`
- `/etc/tib-builder/*`
- `/opt/mimoun/*`
- `/opt/newsbites/*`
- LiteLLM, control-surface, reprobe, health-check, builder, or autonomous services/timers

The later operator deploy/restart and bounded real-work checks are explicit acceptance actions, separate from the verifier’s read-only execution.

## 14. Final acceptance checklist

- [ ] Anchored classifier fix and precedence tests pass.
- [ ] R0 LiteLLM and direct-writer trace coverage is 100% after epoch `1784293856000`.
- [ ] Natural multi-hop evidence meets the trust floor.
- [ ] Three scheduled R1 cycles are fresh, unchanged, and distribution-stable.
- [ ] Rolling 24-hour LiteLLM starts are at most one.
- [ ] R2a has zero n≥20/0-success model-attributable routes in the pool or managed chains.
- [ ] R2b has an exact continuous-429 clock and passes decay/reset tests.
- [ ] Comparable post-R2 rate-limit share falls and dead-route wasted attempts are zero after enough calls.
- [ ] R3 classifier, API handler, authenticated route, live payload, and UI presentation contracts pass.
- [ ] One authorized editorial stage succeeds without a hard-dead route.
- [ ] One authorized one-off builder pass succeeds without a hard-dead route.
- [ ] R4 and R5 have explicit operator dispositions.
- [ ] `bun run check` passes.
- [ ] Bounded tests pass with zero failures and no spawned autonomous work.
- [ ] API-only fresh-host report contains only `HONEST` verdicts.
- [ ] Live health, version, auth, models API, models shell, and service journal checks pass.
- [ ] Immutable timestamped evidence is written and the accepted summary is appended to the AI Vault.
- [ ] Acceptance-mode exit code is 0.

If any box remains open, the repair arc is not accepted. Report `partial`, `unverifiable`, or `regressed` with the concrete evidence and next required observation.

## 15. Evidence update — 2026-07-18 18:50 UTC

Control Surface `8dbe183` implements this specification's strict evaluator and evidence writer. The bounded six-file suite passed 131 tests and 512 expectations; typecheck and production build passed; a detached API-only fresh-host run was 145/145 `HONEST`; and deployed commit, health, shell, auth, models payload, service state, and post-deploy journal checks passed. Sonnet 5 found no remaining P1 in its final read-only verifier review.

Immutable evidence was written to `/var/lib/control-surface/repair-arc-evidence/20260718T185007Z.json` with SHA-256 `2b8b90ec4dbaaf371968be7bce2c530a6560f352e00eb496e2b849245fecb1f5`. It was not promoted to `latest-accepted` because the overall verdict is `regressed`.

The proven failure is R1's rolling restart target: seven LiteLLM starts exist in the attested 24-hour window. Passing checks are R0 writer trace coverage, immutable-history provenance, R3 API contract, and the live surface. R0 natural multi-hop evidence is 1/5. R2 remains shadow with one `would_prune`, no strict scheduled observations, and no exact-429 or comparable post-apply evidence. R4, R5, R6, authoritative static validation, and acceptance logging remain pending.

Validation manifest schema v2 is deliberately rejected. Exit codes, hashed plain-text logs, a regex-derived route list, and hardcoded assertion/process values cannot prove the candidate. A later v3 must bind every command to one detached candidate checkout (`cwd`, full commit/tree, detached state, clean before and after), derive test counts from immutable machine-readable output, recompute a before/after process guard, and consume a canonical candidate route inventory. Until then all four static-validation checks remain `PENDING` without a pointer or `UNVERIFIABLE` with a v2 pointer; they cannot pass.

The 18:18 scheduled reprobe is a second agreeing operational shadow cycle, but the strict evaluator counts 0/3 because no causal timer trigger/completion receipt producer is installed. Do not backfill or infer those receipts. The next scheduled opportunity and the aging restart window are passive observations, not permission to run acceptance work or enable enforcement.
