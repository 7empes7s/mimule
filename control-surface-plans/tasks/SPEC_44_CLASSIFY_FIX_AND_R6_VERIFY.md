# SPEC 44 — classifyError "5" fix + R6 verification of the repair arc

> **SUPERSEDED 2026-07-18 UTC:** Do not implement this draft. `SPEC_45_CLASSIFY_ERROR_AND_R6_ACCEPTANCE.md` replaces it with the collision-safe, repository-accurate acceptance contract. This file remains intact as planning history.

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §2 rider (the `classifyError` "5" latent bug) + §6 (R6 — "make sure all works" + record a baseline) · **Date:** 2026-07-18 · **Builder:** Codex (gpt-5.6-terra, high) · **Verifier:** Claude
**Type:** repair (Part A: 1-line classifier fix) + verification tooling (Part B: a read-only script + tests). Backend-only. **No schema/migration. No frontend. No API route. No reprobe / litellm / mimoun / newsbites writes.**

> **Numbering note (read this):** the R3a classifier draft (`SPEC_43_R3a_HEALTH_STATE_CLASSIFIER.md`) reserves the label "SPEC 44" for the **health-states frontend** (`ModelsPage.tsx` consuming `healthState`/`healthGroup`/`healthSummary`). This spec — per the queue owner's assignment — uses the **file name** `SPEC_44_CLASSIFY_FIX_AND_R6_VERIFY.md` for a *different* deliverable (classifier fix + R6 verify). These do not touch the same files and can both land, but the shared "44" label is a collision the queue owner must resolve (rename one). This spec deliberately does **not** build any frontend, so it does not conflict in scope — only in number.

This spec covers the two remaining repair-arc items that need **no operator steer**:
- **Part A** — the tiny `classifyError` "5" bug (`REPAIR_PLAN` §2 rider, last line).
- **Part B** — **R6: Verify** (`REPAIR_PLAN` §6): prove the repair arc actually works and record a durable baseline, as a re-runnable script + hermetic tests, not manual steps.

It explicitly does **not** cover R2 (ledger-reconcile — live-infra design decision), R4 (creds + `github-gpt41` cost decision), or R5 (kimi route = live litellm config edit). Those need operator decisions and are out of scope here.

---

# Part A — `classifyError` misclassifies any message containing the digit "5"

## A1. The finding (evidence, verified live)

`server/gateway/router.ts:432-440`:
```ts
function classifyError(e: Error): string {
  const msg = e.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("abort")) return "timeout";
  if (msg.includes("429") || msg.includes("rate limit")) return "rate_limit";
  if (msg.includes("401") || msg.includes("unauthorized")) return "auth";
  if (msg.includes("503") || msg.includes("unavailable")) return "unavailable";
  if (msg.includes("5")) return "server_error";          // ← line 438: matches "5" ANYWHERE
  return "unknown";
}
```
`msg.includes("5")` matches the bare digit **5 anywhere in the string** — a model named `gpt-5`, a body saying `5 tokens`, a latency `1500ms`, `nemotron-super-49b` (`…-49b` has no 5, but `nemotron-3-super-120b` does not; `qwen2.5-coder` does). Any such message is stamped `server_error` even when it was a client error or an unrelated string. The plan flags it (`REPAIR_PLAN` §2 rider, final line: *"matches the digit 5 anywhere … misclassifies broadly. Low priority, tracked here."*).

**Why it is safe to fix now (and why the fix is small):** in `gatewayComplete` the caught error is routed to `isGatewayUnreachable(lastError)` **first** (`router.ts` ~348-390); only when that is false — i.e. the request *reached* LiteLLM — does `classifyError` run. The adapter (`server/gateway/adapters/litellm.ts:19`) formats every reached-LiteLLM error as **`LiteLLM <status>: <body>`**. So `classifyError` in practice only ever sees an adapter-prefixed `litellm <status>: …` string or a timeout/abort (caught by the first branch). A genuine 5xx is therefore `litellm 5xx: …`, and the intended catch is the HTTP **5xx status token**, not a bare `5`.

**No downstream code keys off `"server_error"`.** Grep confirms the string `server_error` appears **only** at `router.ts:438` — every consumer (`server/api/cost.ts`, `doctor.ts`, `home.ts`, `traces.ts`, `dataExplorer.ts`) aggregates `error_class` values generically. No test asserts a `server_error` classification (`grep server_error server/**/*.test.ts` = 0 hits). Reclassifying stray "5"-containing messages from `server_error` → `unknown` breaks nothing.

## A2. The change (`server/gateway/router.ts`, `classifyError` only)

1. Make the function testable by **exporting it** (matches the existing test-only-export pattern in this file: `getCircuitStates`, `resetGatewayRouteOverrideStateForTests`):
   ```ts
   export function classifyError(e: Error): string {
   ```
2. Replace line 438 only:
   ```ts
   // before
   if (msg.includes("5")) return "server_error";
   // after — a standalone 5xx HTTP status token, not a bare digit
   if (/\b5\d\d\b/.test(msg)) return "server_error";
   ```
   `\b5\d\d\b` matches `500`/`502`/`504`/`5xx` as a whole 3-digit token and rejects `gpt-5`, `5 tokens`, `1500ms`, `o5`, `qwen2.5`. `503` is untouched — it is caught one line earlier and stays `"unavailable"` (the more specific class).

3. **Do not touch any other branch**, and **do not touch `isGatewayUnreachable`** or the `gateway_unreachable` path (SPEC 40, shipped `bb4ce72`). The `timeout`/`rate_limit`/`auth`/`unavailable` substring branches are unchanged.

**Honest residual edge (state it, do not gold-plate it):** `\b5\d\d\b` still matches a 5xx-looking number embedded in a *non-5xx* body, e.g. `LiteLLM 400: expected 500 tokens` → `server_error` (should be `unknown`). This is rare, strictly better than the status quo, and out of scope to chase. If the builder prefers zero false positives, the stricter prefix-anchored form `/^litellm 5\d\d\b/` is acceptable (valid given the loop guarantee in A1) — but `\b5\d\d\b` is the mandated default because it does not couple the classifier to the caller's ordering. Pick one; the tests in A3 pin the behavior either way.

## A3. Tests (`server/gateway/router.test.ts`, new `describe("classifyError")`)

Import the now-exported `classifyError`. Assert (each is a plain `Error` with the given `.message`):

| input message | expected class | why |
|---|---|---|
| `LiteLLM 500: internal server error` | `server_error` | genuine 5xx |
| `LiteLLM 502: bad gateway` | `server_error` | genuine 5xx |
| `LiteLLM 504: upstream timeout` | `server_error` | 5xx (note: "timeout" in body would hit the timeout branch first — use `upstream gateway error` as the body to isolate the 5xx path) |
| `LiteLLM 400: model gpt-5 not found` | `unknown` | **the bug** — must NOT be `server_error` |
| `LiteLLM 400: expected 5 candidates` | `unknown` | bare 5, not a 5xx token |
| `request failed after 1500ms` | `unknown` | `1500` is not a `\b5\d\d\b` token |
| `LiteLLM 429: rate limited` | `rate_limit` | precedence preserved |
| `LiteLLM 401: unauthorized` | `auth` | precedence preserved |
| `LiteLLM 503: service unavailable` | `unavailable` | precedence preserved (503 ≠ generic 5xx) |
| `The operation was aborted` | `timeout` | precedence preserved |

The `gpt-5` and `1500ms` rows are the regression tests — they fail on the current code and pass on the fix.

---

# Part B — R6: verify the repair arc works, and record a baseline

## B0. What R6 must answer (`REPAIR_PLAN` §6)

The operator directive is *"make sure all works before creating the spec to add features."* The honest answer today is computable but must be **measured, not claimed**. R6 delivers a single re-runnable command that answers four questions and writes the numbers to disk as durable evidence:

1. **Trace correlation is live and request-level success is computable** (R0, shipped `9ba95af`/`0c3a29e`). Group `gateway_calls` by `trace_id`; report trace coverage on post-R0 rows, request-level success, `wasted_attempts`, and `time_to_first_success`.
2. **Reprobe hysteresis is behaving** (R1, shipped in `/opt/mimoun`, `f2e729f`). Read the reprobe state file **read-only** and confirm no in-pool code-0 model is being pruned before `HANG_STREAK`; report the LiteLLM restart count.
3. **Ledger and probe agree** (the R2 *goal*; R2's fix is out of scope). Reconcile the reprobe pool against the ledger's real outcomes and report every disagreement as the **pre-R2 baseline** — never as green.
4. **Health states render first-class** (R3a, SPEC 43 — assume merged). Confirm the 6+1-state taxonomy is populated and non-degenerate (not collapsed to binary).

Plus: **record the baseline** so Catalog S lands on a known-good, measured stack, and so re-running after R2/R4/R5 shows the delta.

**Hard rule — never fake green.** Every check returns exactly one of `PASS` / `PENDING` / `UNVERIFIABLE` / `FAIL`. When an input is missing (DB unreadable, reprobe file absent, journald unavailable) the affected check is `UNVERIFIABLE` with the reason — **not** `PASS`. When the data is present but too thin to trust (e.g. not enough natural multi-hop requests yet — the plan's own ~1-week note, §0b), the check is `PENDING`, not `PASS`. The overall report **never prints "all works"**; it prints the per-check verdicts.

## B1. New module — `server/api/repairArcVerify.ts` (pure computation, unit-testable)

No file I/O and no `journalctl` in this module — all I/O lives in the CLI (B2). The module takes assembled inputs and returns a structured report, mirroring how `modelHealthState.ts` is a pure classifier fed by `models.ts`.

```ts
import type { Database } from "bun:sqlite";
import { deriveHealthState, healthGroup, type HealthSignals, type HealthState } from "./modelHealthState.ts";

// R0 shipped 2026-07-17 (9ba95af). Rows before this legitimately have no trace_id (backfill impossible, plan §0b),
// so trace coverage is measured ONLY on rows at/after this cutoff.
const R0_CUTOFF_MS = Date.UTC(2026, 6, 17, 0, 0, 0);   // 2026-07-17T00:00:00Z
const MIN_MULTIHOP_FOR_TRUST = 5;                       // fewer natural fallbacks ⇒ request-level rate is PENDING, not trusted
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type CheckVerdict = "PASS" | "PENDING" | "UNVERIFIABLE" | "FAIL";
export interface CheckResult {
  id: "R0_trace" | "R1_hysteresis" | "R2_reconcile" | "R3_states";
  title: string;
  verdict: CheckVerdict;
  note: string;                          // the honest "why" — always populated
  metrics: Record<string, number | string | null>;
}
export interface ReprobeState {
  pool: string[];
  history: Record<string, { code: number; streak: number; ms: number; since?: number }>;
}
export interface RepairArcInputs {
  db: Database | null;                   // dashboard DB (gateway_calls); null ⇒ R0/R2 UNVERIFIABLE
  reprobe: ReprobeState | null;          // parsed reprobe state file; null ⇒ R1/R2/R3 UNVERIFIABLE
  litellmRestarts24h: number | null;     // from journald; null ⇒ reported as unknown, not a failure
  now: number;                           // Date.now(), injected for deterministic tests
}
export interface RepairArcReport {
  generatedAt: number;
  overall: "verified" | "partial" | "unverifiable" | "regressed";
  checks: CheckResult[];
}

export function runRepairArcVerification(inputs: RepairArcInputs): RepairArcReport;
```

### Check R0_trace — trace correlation live + request-level success
Query, no tenant filter (this is a whole-box ops verification, must see every production row):
```sql
SELECT trace_id, resolved_model, success, latency_ms, ts, error_class, backend
FROM gateway_calls WHERE ts >= ?            -- bind R0_CUTOFF_MS
```
- `traceCoveragePct` = rows with non-null `trace_id` ÷ total rows (over post-cutoff rows). Group rows by `trace_id` (rows with a null trace_id after the cutoff each count as their own 1-row group *and* are the coverage miss).
- Per trace group: `requestSuccess` = any hop `success=1`; `wastedAttempts` = failed hops before the first success (all hops if none succeeded); `timeToFirstSuccessMs` = `ts(first success) − ts(first hop)` when successful. Exclude `backend='cli-direct'` and `error_class='gateway_unreachable'` from the *waste* accounting (SPEC 37 §4 + SPEC 40 §4 — accounting rows / infra artifacts are not routing waste); count them in coverage.
- `multiHopRequests` = groups with ≥2 hops.
- Metrics: `postCutoffRows`, `traceCoveragePct`, `requestCount`, `requestSuccessPct`, `multiHopRequests`, `avgWastedAttempts`, `avgTimeToFirstSuccessMs`.
- Verdict:
  - `UNVERIFIABLE` if `db === null`.
  - `FAIL` if `postCutoffRows > 0` and `traceCoveragePct < 99` (R0 regressed — the plumbing stopped stamping ids).
  - `PENDING` if coverage is healthy but `multiHopRequests < MIN_MULTIHOP_FOR_TRUST` — note: *"trace plumbing live; too few natural multi-hop requests to trust a request-level rate yet (plan §0b: ~1 week)."* Still report the numbers, labelled provisional.
  - `PASS` only when coverage healthy **and** `multiHopRequests ≥ MIN_MULTIHOP_FOR_TRUST`.

### Check R1_hysteresis — reprobe not flapping (read-only)
- `UNVERIFIABLE` if `reprobe === null`.
- `PENDING` if `reprobe.history` is empty — note *"R1 history block not yet populated (first reprobe run seeds it); hysteresis not yet observable."*
- For every model in `reprobe.pool` with `history[m].code === 0`: it must have `streak < HANG_STREAK` (a code-0 model at `streak ≥ 3` should have been pruned — its presence in the pool is a hysteresis **violation**). Any violation ⇒ `FAIL`, list the offenders.
- Metrics: `historySize`, `heldCode0` (in-pool code-0 models with `1 ≤ streak < 3` — the flap population being correctly held), `litellmRestarts24h`. If `litellmRestarts24h !== null && litellmRestarts24h > 1`, append to note *"restart count above the ≤1/day target"* (soft flag — the restart count is live-ops, not this slice's to fix; does not force `FAIL`).
- `PASS` when history is non-empty and there is no violation.

> Import `HANG_STREAK`? It is a `const` local to `modelHealthState.ts` (value `3`) and not exported. **Do not edit `modelHealthState.ts` to export it** (that file is R3a territory, do not touch). Re-declare `const HANG_STREAK = 3;` at the top of `repairArcVerify.ts` with a comment pinning it to the reprobe's value, and pin it in the tests. Mirroring one integer is cheaper than widening the blast radius.

### Check R2_reconcile — ledger ⟂ probe agreement (BASELINE, R2 fix not shipped)
This measures the disagreement R2 will later close; it **changes nothing** (read-only). Build per-`resolved_model` ledger health with the *exact same exclusions* `readModelHealthLedger` uses (`server/api/models.ts:80-121`) — do not import it (models.ts is R3a territory); re-issue the query in this module:
```sql
SELECT resolved_model AS m,
  COUNT(*) AS allTimeN, SUM(success) AS allTimeSuccess,
  SUM(CASE WHEN ts>=? THEN 1 ELSE 0 END) AS recentN,
  SUM(CASE WHEN ts>=? THEN success ELSE 0 END) AS recentSuccess,
  SUM(CASE WHEN ts>=? AND success=0 AND error_class='auth' THEN 1 ELSE 0 END) AS recentAuth,
  SUM(CASE WHEN ts>=? AND success=0 AND error_class='rate_limit' THEN 1 ELSE 0 END) AS recentRateLimit,
  AVG(CASE WHEN ts>=? THEN latency_ms END) AS recentAvgLatencyMs
FROM gateway_calls
WHERE backend != 'cli-direct' AND (error_class IS NULL OR error_class != 'gateway_unreachable')
GROUP BY resolved_model
```
(bind the recent-window cutoff `now − RECENT_WINDOW_MS` to each `?`). For every model in `reprobe.pool`, build `HealthSignals { probe: reprobe.history[m] ?? null, ledger: <row for m> ?? null }` and call `deriveHealthState` (the shared vocabulary — this is the reuse that matters).
- `rotDisagreements` = in-pool models whose fused state ∈ `{dead, degraded, hang}` (the reprobe keeps a route the fused truth says is unroutable — e.g. `zen-deepseek-v4-flash-free`). List them with state + signal.
- `zeroRoutesInPool` = in-pool models with `recentN ≥ 20 && recentSuccess === 0` (the plan's headline §2 metric).
- `possibleFalsePrunes` = models with `recentN ≥ 3 && recentSuccess/recentN ≥ 0.5` that are **not** in `reprobe.pool` (informational — a healthy route the pruner dropped).
- Metrics: `poolSize`, `rotCount`, `zeroRoutesInPool`, `falsePruneCount`.
- Verdict:
  - `UNVERIFIABLE` if `db === null || reprobe === null`.
  - `PASS` if `rotCount === 0` (probe pool and ledger fully agree — the R2 end-state).
  - `PENDING` otherwise, note: *"R2 (ledger reconciliation) not shipped — {rotCount} in-pool routes the ledger proves dead. Recorded as the pre-R2 baseline; re-run after R2 to confirm →0."* **Not `FAIL`** — a non-zero here is expected until R2 lands, but it is **not green** either.

### Check R3_states — health taxonomy renders first-class (R3a / SPEC 43)
- `UNVERIFIABLE` if `reprobe === null` (no probe signals) **and** `db === null` (no ledger signals).
- For every model appearing in `reprobe.pool ∪ keys(reprobe.history)`, compute `deriveHealthState` (same signal assembly as R2_reconcile) and tally by state and by `healthGroup`.
- `distinctStates` = number of distinct `HealthState` values with count > 0.
- Verdict:
  - `PASS` if `distinctStates ≥ 2` **and** both a `healthy`-group and a non-`healthy`-group model exist (taxonomy is live and separates healthy from unhealthy — not collapsed to binary, not all `unknown`).
  - `PENDING` if everything lands in one state (e.g. all `unknown` — R3a inputs not populated) — note the degeneracy honestly.
- Metrics: `stateHistogram` (JSON string of `{live,limited,slow,degraded,dead,hang,unknown}`), `healthyCount`, `attentionCount`, `distinctStates`.

### Overall verdict
- `regressed` if **any** check is `FAIL`.
- else `unverifiable` if **any** check is `UNVERIFIABLE`.
- else `partial` if **any** check is `PENDING`.
- else `verified` (all four `PASS`).

The overall string is printed prominently but is **never** the word "works" — `verified` means "every applicable check passed *and* had enough data to be trusted"; `partial`/`unverifiable` are surfaced, not hidden.

## B2. New CLI — `scripts/verify-repair-arc.ts` (thin I/O wrapper; all reads, one write)

Run with `bun run scripts/verify-repair-arc.ts [--out <path>] [--json]`. It:
1. Opens the dashboard DB read-only via the existing `getDashboardDb()` (`server/db/dashboard.ts`) — respects `DASHBOARD_DB_PATH` (default `/var/lib/control-surface/dashboard.sqlite`). If unavailable → `db = null` (checks degrade to `UNVERIFIABLE`, script does not crash).
2. Reads the reprobe state file **read-only** at `process.env.DASHBOARD_MODEL_REPROBE_PATH ?? "/var/lib/mimule/model-fallback-reprobe.json"` (same path/override `models.ts:69` uses). Parse `{ pool, history }`. On any read/parse error → `reprobe = null`. **Never writes this file.**
3. Reads the LiteLLM restart count via `journalctl -u litellm.service --since "24 hours ago"` piped to a `Started`-line count, using Bun's subprocess. On any error (journald unavailable, permission) → `litellmRestarts24h = null` (reported as unknown, not a failure). **Journald read only — never touches `/etc/litellm/*`.**
4. Calls `runRepairArcVerification(...)`.
5. Prints a human-readable table (check id · verdict · one-line note · key metrics) and the overall verdict. With `--json`, prints the raw `RepairArcReport`.
6. Writes the `RepairArcReport` as JSON to `--out` (default `/var/lib/control-surface/repair-arc-baseline.json` — the dashboard data dir, writable, not source, not litellm/mimoun/newsbites). This is the durable baseline artifact. Idempotent: re-running overwrites with a fresh timestamped report.
7. Exit code: **2** if `overall === "regressed"` (a real regression — R0 broken or hysteresis violated); **0** otherwise (`verified`/`partial`/`unverifiable` all exit 0 — `PENDING`/`UNVERIFIABLE` are visible in output, not masked, but they are not build-breaking, since R2/R4/R5 are legitimately unshipped).

The CLI is intentionally not wired to any timer, route, or page — R6 is on-demand verification, not a product feature.

## B3. Tests — `server/api/repairArcVerify.test.ts` (hermetic; reuse the `INSERT INTO gateway_calls` seed idiom from `server/gateway/router.test.ts` / `server/api/cost.test.ts`)

Seed an in-memory or temp dashboard DB and pass fabricated `reprobe`/`litellmRestarts24h` directly to `runRepairArcVerification` (no file I/O, no journald in tests). Cover:

1. **R0 PASS** — seed ≥`MIN_MULTIHOP_FOR_TRUST` traces, each 2 hops (fail→success), all post-cutoff with `trace_id` set ⇒ `R0_trace` = `PASS`, `traceCoveragePct = 100`, `requestSuccessPct = 100`, `avgWastedAttempts ≈ 1`.
2. **R0 PENDING (thin data)** — seed post-cutoff traced rows but only single-hop (0 multi-hop) ⇒ `PENDING`, note mentions insufficient multi-hop. **Not `PASS`.**
3. **R0 FAIL (regression)** — seed post-cutoff rows with `trace_id = NULL` ⇒ `traceCoveragePct < 99` ⇒ `FAIL`. (This is the guard that catches R0 being undone.)
4. **R0 ignores pre-cutoff nulls** — rows before `R0_CUTOFF_MS` with null `trace_id` do **not** drag coverage down (they are excluded from the coverage denominator).
5. **R1 PASS** — `reprobe.history` non-empty, an in-pool model at `code:0, streak:2` (held) ⇒ `PASS`, `heldCode0 ≥ 1`.
6. **R1 FAIL (hysteresis violated)** — an in-pool model at `code:0, streak:3` ⇒ `FAIL`, offender listed.
7. **R1 PENDING** — `reprobe.history = {}` ⇒ `PENDING`.
8. **R1 restart soft-flag** — `litellmRestarts24h = 4` with an otherwise-clean pool ⇒ still `PASS`, note contains the above-target flag; `metrics.litellmRestarts24h = 4`.
9. **R2 PASS** — pool of models all with recent ledger success ⇒ `rotCount = 0` ⇒ `PASS`.
10. **R2 PENDING (baseline)** — a pool model seeded with 25 recent rows, 0 success (a `zen-deepseek-v4-flash-free` analogue) ⇒ `R2_reconcile` = `PENDING`, `zeroRoutesInPool ≥ 1`, `rotCount ≥ 1`, note names the pre-R2 baseline. **Never `PASS`, never `FAIL`.**
11. **R2 exclusions honored** — a pool model whose only recent failures are `error_class='gateway_unreachable'` (25 rows) is **not** counted as a zero-route/rot (SPEC 40 §4); a `backend='cli-direct'` row is likewise excluded (SPEC 37 §4). Assert it reads healthy/absent, not dead.
12. **R3 PASS** — signals producing ≥2 distinct states spanning healthy + attention ⇒ `PASS`, histogram populated.
13. **R3 PENDING (degenerate)** — all models resolve to `unknown` ⇒ `PENDING`.
14. **UNVERIFIABLE plumbing** — `db = null` ⇒ `R0`/`R2` = `UNVERIFIABLE`; `reprobe = null` ⇒ `R1`/`R3` = `UNVERIFIABLE`; overall reflects it and the function does not throw.
15. **Overall precedence** — a mix containing one `FAIL` ⇒ `overall = "regressed"`; a mix with no `FAIL` but one `UNVERIFIABLE` ⇒ `"unverifiable"`; no `FAIL`/`UNVERIFIABLE` but one `PENDING` ⇒ `"partial"`; all `PASS` ⇒ `"verified"`.

## B4. Honesty rules (restate — these are acceptance criteria, not prose)
- No check returns `PASS` on missing or thin data. Missing ⇒ `UNVERIFIABLE`; thin ⇒ `PENDING`.
- `R2_reconcile` is a **baseline**: `PASS` only at true zero disagreement, otherwise `PENDING` — it must never be `FAIL` (R2 unshipped is expected) and must never be `PASS` while rot exists.
- The word "works"/"all green"/"healthy stack" must not appear in the CLI's overall line. The overall enum is `verified|partial|unverifiable|regressed`.
- The baseline JSON records every metric even for `PENDING`/`UNVERIFIABLE` checks, so a later re-run shows the delta.

---

## Evidence gates (both parts, before anything lands)
- `bun run check` clean (typecheck + build).
- Focused tests green: `bun test server/gateway/router.test.ts server/api/repairArcVerify.test.ts`.
- **Full suite green, 0 failures**, hermetic (0 codex procs). The exact `N/0` grows once SPEC 43 R3a lands (SPEC 42 baseline was `1197/0`); the gate is **0 failures**, and the verifier records the actual `N/0` at landing.
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live R6 run on the box:** `bun run scripts/verify-repair-arc.ts` executes without crashing and writes `/var/lib/control-surface/repair-arc-baseline.json`. Expected today (honest, not green): `R0_trace = PENDING` (trace plumbing live, natural multi-hop volume still thin per plan §0b), `R1_hysteresis = PASS or PENDING` (PASS once the history block has populated; the live file already carries a 139-entry `history` block), `R2_reconcile = PENDING` (R2 unshipped — records the current rot count as baseline), `R3_states = PASS` (R3a merged). **If any check reads UNVERIFIABLE, report it as such — do not massage it to PASS.** Paste the printed table into the session evidence and append the summary to the AI Vault daily file.

## Rails — the precise file list (Codex: stay strictly within this list)

**Create:**
- `server/api/repairArcVerify.ts` — the pure verification module (B1).
- `server/api/repairArcVerify.test.ts` — hermetic tests (B3).
- `scripts/verify-repair-arc.ts` — the read-only CLI (B2).

**Edit (surgically):**
- `server/gateway/router.ts` — **only** `classifyError`: add `export`, change the one `msg.includes("5")` line (A2). No other line.
- `server/gateway/router.test.ts` — **only** add the `classifyError` describe block (A3).

**Must NOT be touched (read-only imports at most):**
- `server/api/router.ts` — uncommitted SPEC 35 showcase-routes work lives here; **do not open it.** (This is the *API* router; the classifier fix is in the *gateway* router `server/gateway/router.ts` — different file.)
- `server/api/models.ts`, `server/api/modelHealthState.ts`, `server/api/traces.ts`, `server/insights/health.ts`, `server/gateway/ledger.ts`, `server/gateway/adapters/*` — import from `modelHealthState.ts` (`deriveHealthState`, `healthGroup`, types) and use `getDashboardDb` from `server/db/dashboard.ts`; **edit none of them.** Do not export new symbols from `models.ts` — re-declare the one integer (`HANG_STREAK = 3`) and re-issue the ledger SQL inside `repairArcVerify.ts` instead.
- Any frontend (`app/**`, `ModelsPage.tsx`) — this spec adds **no** UI. (Health-state rendering is the separate reserved "SPEC 44-frontend" slice.)
- The reprobe (`/opt/mimoun/scripts/model-fallback-reprobe.py`) and its state file `/var/lib/mimule/model-fallback-reprobe.json` — **read-only** (B2 reads, never writes).
- `/etc/litellm/*` — never opened. R6 reads the LiteLLM **restart count from journald only**, never the config.
- `/opt/newsbites/*`, `/opt/mimoun/*` (except the read-only reprobe state file above) — untouched.
- No schema change, no migration, no new column (`repair-arc-baseline.json` is a plain file, not a DB object).

**Process rails:** No commit, no service restart by the builder — leave everything in the working tree for review (Claude verifies, commits, restarts). Kill by PID only; ps-check before any git op (a concurrent builder may be editing this repo). `error_class` values are unchanged by Part A (it only *reclassifies* existing free-text values; the column is TEXT, no migration).

---

## Appendix — run & reproduce

```bash
# ── Part A: the classifyError bug (before the fix) ────────────────────────────
cd /opt/opencode-control-surface
grep -n 'includes("5")' server/gateway/router.ts      # line 438 — the bug
grep -rn 'server_error' server/ --include='*.ts'      # only router.ts:438 — no consumer depends on it
grep -rn 'server_error' server/ --include='*.test.ts' # 0 hits — nothing pins the classification

# ── Part A: after the fix ─────────────────────────────────────────────────────
bun test server/gateway/router.test.ts                # classifyError describe block green

# ── Part B: run R6 verification (read-only; writes only the baseline JSON) ─────
bun run scripts/verify-repair-arc.ts                  # prints the per-check table + overall verdict
cat /var/lib/control-surface/repair-arc-baseline.json | python3 -m json.tool   # the durable baseline

# What R6 reads, for cross-checking the script's inputs by hand (all read-only):
#   trace coverage on post-R0 rows
sqlite3 /var/lib/control-surface/dashboard.sqlite "
  SELECT COUNT(*) rows, SUM(trace_id IS NOT NULL) traced
  FROM gateway_calls WHERE ts >= strftime('%s','2026-07-17')*1000;"
#   reprobe pool + history (the R1/R2/R3 inputs)
python3 -c "import json;d=json.load(open('/var/lib/mimule/model-fallback-reprobe.json'));print('pool',len(d['pool']),'history',len(d['history']))"
#   LiteLLM restart count (R1 metric — journald only, never the config)
journalctl -u litellm.service --since '24 hours ago' | grep -c Started
#   pre-R2 rot baseline — 0%-over-n≥20 routes still in the pool
sqlite3 /var/lib/control-surface/dashboard.sqlite "
  SELECT resolved_model, COUNT(*) c, ROUND(100.0*SUM(success)/COUNT(*),1) ok
  FROM gateway_calls
  WHERE backend!='cli-direct' AND (error_class IS NULL OR error_class!='gateway_unreachable')
  GROUP BY resolved_model HAVING c>=20 AND ok=0.0 ORDER BY c DESC;"

# ── Evidence gates ────────────────────────────────────────────────────────────
bun run check
bun test                                              # full suite, 0 failures (record N/0)
# fresh-host gate per repo convention → PASS 41/41, LEAK=no
```

**After a green run**, append the printed R6 summary to `/opt/ai-vault/daily/2026-07-18.md` (standing logging rule) so the baseline is captured outside the box's data dir too.
