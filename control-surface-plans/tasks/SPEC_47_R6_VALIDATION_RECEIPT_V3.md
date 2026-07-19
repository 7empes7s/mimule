# SPEC 47 — validation receipt schema v3 (candidate-bound static-validation acceptance)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §11 "Next implementation order" item 2 · **Date:** 2026-07-18 UTC · **Status:** accepted implementation contract
**Builds on:** `SPEC_45_CLASSIFY_ERROR_AND_R6_ACCEPTANCE.md` §11/§15 and commit `8dbe183` (strict repair-arc verifier).

**Type:** verification-tooling only. A new immutable-receipt **producer** plus a reader upgrade that makes the four static-validation checks (`classifier.contract`, `validation.bounded`, `r3.ui_contract`, `fresh_host.api_only`) able to reach `PASS` on trustworthy, candidate-bound evidence. No product-routing, config, service, timer, credential, schema, or migration change. The producer's **only** side effects are (a) a throwaway detached git worktree it creates and removes, and (b) new immutable root-owned receipt files under the fixed receipt directory.

## 1. Outcome

Today `collectValidationManifest` (scripts/verify-repair-arc.ts) fully parses a schema-v2 validation manifest and then **hard-throws** at line 1441 (`"validation schema v2 is non-authoritative; candidate-bound schema v3 is not implemented"`). Consequently the four static-validation checks are `PENDING` (no pointer) or `UNVERIFIABLE` (v2 pointer) and can never `PASS`. There is **no producer** that emits any validation manifest.

The v2 rejection is deliberate and documented (lines 1436-1440): v2 records exit codes and log-text hashes but does **not** bind commands to a detached candidate tree, does **not** derive counts from machine-readable output, and has **no** before/after process guard. Its route check scrapes `router.ts` with a fragile regex that both `probe.mjs` and the verifier share — so they agree with each other while both silently miss `||`-combined and dynamic routes.

This slice closes that gap by implementing schema **v3**:

1. **Bind every command to one detached candidate checkout** — all four commands run with `cwd` inside a single detached `git worktree` at the candidate commit/tree, with tracked-clean proof before and after each command.
2. **Derive test counts from immutable machine-readable output** — the focused `bun test` run emits a JUnit XML artifact; `focusedTestsPassed`, `testFiles`, classifier `cases`, and UI `assertions` are parsed from that immutable artifact, never from human `--reporter=dots` text or exit codes alone.
3. **Recompute a before/after process guard** — snapshot the forbidden-process set (Codex/builder/autonomous) before and after the run; `forbiddenProcessesSpawned` is computed from the measured delta, not a self-attested boolean.
4. **Consume a canonical candidate route inventory** — a single complete extractor (handling literal, `||`-alternation, and one-line-`return` GET route forms) is the one source of truth, consumed by both `probe.mjs` and the verifier; the fresh-host report's route set must equal that inventory.

`verified` still means every required gate passed with enough trustworthy evidence. This slice does **not** by itself accept the repair arc — R1's restart window, R2 scheduled shadow cycles, R4/R5 dispositions, and authorized R6 real-work all remain pending per SPEC 45. It only makes the static-validation quarter of the report honestly passable.

## 2. Verified repository facts (pin these; do not trust stale drafts)

- Reader: `scripts/verify-repair-arc.ts` → `export function collectValidationManifest(pointer, commit, now, candidateClean, candidateTree?, receiptRoot?, routerSourcePath?, classifierSourcePath?)`. Called at line ~2177: `collectValidationManifest(operator.validation, sourceCommits.controlSurface, now, worktree.clean)`.
- Core: `server/api/repairArcVerify.ts` → `export function evaluateValidation(input, candidateCommit, generatedAt)` returns the four checks and is **schema-agnostic**. It already `PASS`es when handed a `ValidationObservation` with `manifestVerified===true`, `candidateTrackedClean===true`, matching `recordedAt`/`commit`, and the per-check completeness+threshold gates below. **Do not change `evaluateValidation` semantics.** v3 is CLI-side (producer + reader) plus the shared route-inventory module and tests.
- `ValidationObservation` shape (see `failedValidation`, line ~1271): `{ recordedAt:number, commit:string, manifestVerified:boolean, candidateTrackedClean:boolean, manifestError?:string, classifier:{sourceVerified,testsPassed,cases,evidenceRef}, bounded:{focusedTestsPassed,testFiles,typecheckPassed,buildPassed,forbiddenProcessesSpawned,evidenceRef}, ui:{contractTestsPassed,assertions,evidenceRef}, freshHost:{apiOnly,total,honest,leak,crash,error5xx,commit,evidenceRef} }`.
- Core thresholds a passing observation must satisfy (from `evaluateValidation`): `classifier` → `sourceVerified && testsPassed && cases>=12`; `bounded` → `focusedTestsPassed && testFiles>=6 && typecheckPassed && buildPassed && forbiddenProcessesSpawned===false`; `ui` → `contractTestsPassed && assertions>=1`; `freshHost` → `apiOnly && total>=1 && honest===total && leak===0 && crash===0 && error5xx===0 && commit matches candidate`. Provenance: `recordedAt` in `(R0_CUTOFF_MS, generatedAt]`, `commit` a 40-hex that matches `candidateCommit`.
- Receipt plumbing: fixed receipt dir `join(DEFAULT_EVIDENCE_DIR,"receipts")` = `/var/lib/control-surface/repair-arc-evidence/receipts`. `readImmutableReceipt`/`readImmutableArtifact` require: file lives directly in that dir, name matches the fixed pattern, root-owned (`uid===0`), **non-writable** (`mode & 0o222 === 0`, i.e. `0444`), `nlink===1`, no symlink (`O_NOFOLLOW`), stable read, sha256 match. The producer must write receipts to satisfy every one of these.
- Helpers already present and reusable: `exactObjectKeys`, `isSha256`, `isUuidV4`, `gitTree(path)`, `readImmutableReceipt`, `readImmutableArtifact`, `readBoundedRegularFile`, `safeJsonParse`, `sanitizeError`, `failedValidation`. Constants: `DEFAULT_EVIDENCE_DIR`, `R0_CUTOFF_MS`, `COMMAND_MAX_BUFFER_BYTES` (16 MiB), `MAX_FIXED_INPUT_BYTES` (4 MiB).
- `VALIDATION_COMMANDS` (line ~1185): `focused` = `["bun","test", <6 files>, "--timeout=60000","--max-concurrency=4","--reporter=dots"]`, `focusedEnv` = `{DASHBOARD_DB:"1"}`, `typecheck` = `["bun","run","typecheck"]`, `build` = `["bun","run","build"]`, `freshHost` = `["e2e/fresh-host/run.sh"]`. The six focused files: `server/gateway/router.test.ts`, `server/api/modelHealthState.test.ts`, `server/api/models.test.ts`, `server/api/router.test.ts`, `server/api/repairArcVerify.test.ts`, `app/routes/modelsHealthView.test.ts`.
- Package scripts: `typecheck` = `tsc --noEmit`; `build` = `vite build` (writes untracked `dist/`); `check` = typecheck then build.
- Bun is `1.3.13`. `bun test --reporter=junit --reporter-outfile=<path>` emits `<testsuites tests assertions failures skipped>` with per-file `<testsuite name file tests assertions failures skipped>` and per-test `<testcase name classname time file line assertions/>`. Verified live. This is the machine-readable source.
- `e2e/fresh-host/run.sh` spins a Docker container, builds, boots the server, then runs `bun run e2e/fresh-host/probe.mjs "$REPO/server/api/router.ts" <baseUrl> <token> <REPORT_MD>`, writing tracked `e2e/fresh-host/REPORT.json` + `REPORT.md`. `probe.mjs:41-46` extracts routes with `re = /method === "GET" && pathname === "([^"]+)"/g`, prepends `"/"`, drops `/api/stream`. The verifier's line ~1420 uses the **identical** regex. Both are the fragile list to replace.
- Envelope constant `SCHEMA_VERSION = 2` (line 56) is the **evidence-envelope** version and is unrelated to the manifest `schemaVersion`. Do **not** change the envelope version. Only the validation-manifest `schemaVersion` goes to `3`.

These facts must be pinned by tests so later refactors fail visibly.

## 3. The canonical route inventory (fixes item 4)

Create one complete, shared GET-route extractor and make it the single source of truth.

### 3.1 Extractor module

Create `e2e/fresh-host/routeInventory.mjs` exporting `extractGetRoutes(routerSource: string): string[]`. It must recognise every static no-path-param GET route declared in `server/api/router.ts`, across all three forms actually present:

- `if (method === "GET" && pathname === "X")` (with or without a trailing block).
- `if (method === "GET" && (pathname === "X" || pathname === "Y" ...))` — every alternative counts.
- `if (method === "GET" && pathname === "X") return handler(req);` one-liners.

Rules: dedupe; sort ascending; **exclude** `/api/stream` (long-lived SSE, probed separately); **exclude** any route whose pathname contains a `${` template or is matched by a `RegExp`/`.match(` (those are path-param/dynamic and out of the static inventory — but the extractor must still not silently drop a *static* route). Prepend `"/"` only in the probe consumer, not in the extractor (keep the extractor = "GET routes declared in router.ts"). The extractor takes source text and returns an array — no filesystem, no import of the router runtime.

### 3.2 Both consumers use it

- `e2e/fresh-host/probe.mjs`: replace the inline `extractRoutes`/`re` (lines ~41-46) with `import { extractGetRoutes } from "./routeInventory.mjs"`, then `routes = extractGetRoutes(routerSrc)` before the existing `"/"` unshift and `/api/stream` filter. Behaviour otherwise unchanged.
- `collectValidationManifest`: replace the inline `routePattern` block (lines ~1418-1427) with the canonical set `new Set(["/", ...extractGetRoutes(routerSource)])` (mirroring probe's `"/"` + drop `/api/stream`), and keep the existing "fresh-host report route set does not match the candidate router" invariant against that canonical set. The verifier may import the `.mjs` directly (Bun resolves it).

### 3.3 Sync test

Add a test (`e2e/fresh-host/routeInventory.test.ts`, add its path to `VALIDATION_COMMANDS.focused` → this makes the focused set **7** files, so the `testFiles>=6` floor still holds and the manifest `testFiles` becomes 7) proving:

- The extractor returns the complete known set for a fixture covering all three declaration forms, including a `||`-alternation route that the old regex missed (e.g. `/api/content-health` **and** `/api/content-health/findings`).
- Every route the extractor returns from the **live** `server/api/router.ts` source is actually reachable in the router (the router serves exactly the inventory + `/` + `/api/stream`; no static GET route is served that the inventory omits). Assert by re-deriving from source with an independent complete parse, not by network.
- `/api/stream` and any `${`-template/dynamic route are excluded.

If the completed inventory adds routes the old regex missed, the fresh-host `total` rises accordingly and **every** added route must still be `HONEST`. A newly-included route that leaks/crashes/5xx is a **real defect to surface**, not to exclude — report it; do not trim the inventory to make the gate green.

## 4. The v3 producer

Create `scripts/record-validation-v3.ts` — a standalone CLI that performs the candidate-bound run and writes the immutable v3 manifest + artifacts. It never writes routing/config/services, never restarts anything, and confines all writes to the detached worktree (auto-removed) and the fixed receipt dir.

### 4.1 Sequence

1. Resolve `commit = git rev-parse HEAD` and `tree = git rev-parse HEAD^{tree}` of `/opt/opencode-control-surface`. Require the main worktree is tracked-clean for routing-relevant source (reuse the same clean notion the envelope uses). Mint `runId = crypto.randomUUID()` (v4).
2. **Process guard — before.** Snapshot the forbidden-process set: processes whose argv matches `codex exec`, an opencode builder run, `mimule-jobd`, project-improve, overseer, or autonomous-orchestrator patterns. Record the sorted, sanitized set (pid + normalized argv hash) as `processGuard.before`.
3. `git worktree add --detach <tmpWorktree> <commit>` under a `mktemp -d` root. Confirm the worktree HEAD is detached at `commit` and its `HEAD^{tree}` equals `tree`.
4. For each command in order `focused → typecheck → build → freshHost`, with `cwd = tmpWorktree`:
   - Assert **cleanBefore**: `git -C <tmpWorktree> diff --quiet HEAD --` (no tracked-file modification) **and** HEAD still detached at `commit`.
   - Run the command (argv exactly per §4.2), capturing combined stdout+stderr to a buffer bounded by `COMMAND_MAX_BUFFER_BYTES`. Record `startedAt`/`finishedAt` (epoch ms), `exitCode`.
   - Assert **cleanAfter**: `git -C <tmpWorktree> diff --quiet HEAD --` still holds, **except** the freshHost command may modify exactly `e2e/fresh-host/REPORT.json` and `e2e/fresh-host/REPORT.md` (its declared outputs) and nothing else tracked. Untracked build output (`dist/`, `node_modules/`, caches) is always permitted and ignored.
   - Write the command's captured output as an immutable receipt artifact (see §4.3).
5. **Process guard — after.** Re-snapshot; `processGuard.after`. `forbiddenProcessesSpawned = true` iff `after` contains any normalized-argv entry absent from `before`.
6. Copy the fresh-host `REPORT.json` from the worktree into an immutable receipt `fresh-host-<commit>-<runId>.json`, and the focused JUnit XML into `validation-<commit>-<runId>-focused.junit.xml`.
7. Assemble and write the immutable v3 manifest `validation-<commit>-<runId>.json`.
8. `git worktree remove --force <tmpWorktree>`; `rm -rf` the mktemp root. **Never** leave a worktree or touch the main tree's `REPORT.*`.
9. Print the manifest path and its SHA-256 (the exact `{manifestPath, manifestSha256}` pointer to feed `--operator-input`). Exit `0` only if all four commands exited `0`, both fresh-host report and JUnit parsed clean, and `forbiddenProcessesSpawned===false`; else exit non-zero and still leave a retained (non-accepted) manifest for forensics.

### 4.2 Command argv (v3)

- `focused`: `VALIDATION_COMMANDS.focused` base = the **7** test files + `--timeout=60000 --max-concurrency=4` **and** `--reporter=junit --reporter-outfile=<tmpWorktree>/.v3-focused.junit.xml`. Env `DASHBOARD_DB=1`. (Drop `--reporter=dots`; JUnit is the machine-readable channel.)
- `typecheck`: `["bun","run","typecheck"]`.
- `build`: `["bun","run","build"]`.
- `freshHost`: `["e2e/fresh-host/run.sh"]`.

Update `VALIDATION_COMMANDS` so the reader's expected-argv comparison matches what the producer runs (the reader validates the focused argv equals the base plus the two JUnit flags with the outfile path resolving to the receipt-bound name — see §5).

### 4.3 Immutable receipt writing

All receipts go directly in `/var/lib/control-surface/repair-arc-evidence/receipts` (create the dir root-owned `0755` if missing; it must be root-owned and non-group/other-writable). Each artifact: write bytes, `chmod 0444`, `chown root:root`, confirm `nlink===1` and no symlink. Names (exact, so the reader's fixed patterns match):

- Per-command output logs: `validation-<commit>-<runId>-<key>.log` for `key ∈ {focused,typecheck,build,freshHost}`.
- Focused JUnit: `validation-<commit>-<runId>-focused.junit.xml`.
- Fresh-host report: `fresh-host-<commit>-<runId>.json`.
- Manifest: `validation-<commit>-<runId>.json`.

`<commit>` is 40-hex lowercase; `<runId>` is a v4 UUID. Refuse to overwrite an existing receipt (exclusive create); a new run mints a new `runId`.

### 4.4 v3 manifest shape

```jsonc
{
  "schemaVersion": 3,
  "kind": "spec45-validation",
  "runId": "<uuid-v4>",
  "candidateCommit": "<40-hex>",
  "candidateTree": "<40-hex>",
  "recordedAt": <epoch-ms>,
  "processGuard": { "before": [<sanitized>], "after": [<sanitized>], "forbiddenProcessesSpawned": false },
  "routeInventory": { "routes": ["/","/api/..."], "sha256": "<hex>" },
  "commands": {
    "focused":  { "startedAt","finishedAt","argv","env","exitCode","source":{head,tree,detached,cleanBefore,cleanAfter},
                  "output":{path,sha256,bytes}, "junit":{path,sha256,bytes} },
    "typecheck":{ ...same minus junit, source block required },
    "build":    { ...same },
    "freshHost":{ ...plus "report":{path,sha256,bytes} and source.cleanAfter accounts for REPORT.* }
  }
}
```

Every command now carries its own `source` block (`head===commit`, `tree===tree`, `detached===true`, `cleanBefore===true`, `cleanAfter===true`) — not just freshHost. `recordedAt` is set after all commands finish and must be within 10 minutes of `freshHost.finishedAt`.

## 5. The v3 reader (`collectValidationManifest`)

Branch on `manifest.schemaVersion`:

- `=== 3`: run the full v3 validation below and, on success, return a `ValidationObservation` with `manifestVerified:true`.
- `=== 2`: keep the existing full parse **and** the existing terminal `throw` — v2 stays precisely rejected, so historical/malformed v2 receipts still get an exact error, never silent acceptance.
- anything else: `throw` "unsupported validation manifest schema".

v3 validation (all failures throw → `failedValidation` → `manifestVerified:false`):

1. **Provenance:** `kind==="spec45-validation"`, `isUuidV4(runId)`, `candidateCommit===commit` (40-hex), `candidateTree===candidateTree` arg (40-hex), manifest basename `=== validation-<commit>-<runId>.json`, `recordedAt` integer in `[R0_CUTOFF_MS, now]`.
2. **Commands:** exact keys `{focused,typecheck,build,freshHost}`. For each: exact key set (including per-command `source`), `argv`/`env` equal the expected v3 argv/env (focused argv = base 7-file set + timeout/concurrency + `--reporter=junit --reporter-outfile=<the tmp junit path>`; assert the outfile flag is present and its basename is stable — the receipt-bound JUnit is validated separately, so the outfile value need only be a well-formed `.junit.xml` path), `startedAt<finishedAt`, window ≤ 60 min, `finishedAt ≤ recordedAt`, `exitCode===0`, `source` block with `head===commit`, `tree===candidateTree`, `detached===true`, `cleanBefore===true`, `cleanAfter===true`. Windows must be non-overlapping in order `focused,typecheck,build,freshHost`. Each `output` log artifact re-read immutably (sha256 + byte match) via `readImmutableArtifact`.
3. **Process guard:** `processGuard` present; `before`/`after` are arrays of the sanitized shape; `forbiddenProcessesSpawned` recomputed from `after \ before` and must equal the stored value **and** be `false`. A malformed guard throws.
4. **Machine-readable counts (focused):** re-read the JUnit artifact immutably; parse it (bounded, no external XML lib — a small tolerant parser over the fixed Bun shape is fine). Require top-level `failures===0` and `errors` absent/`0`. Derive: `testFiles` = number of `<testsuite>` = **7**; `focusedTestsPassed` = failures 0 across all suites; `classifier.cases` = number of `<testcase>` under the `server/gateway/router.test.ts` suite whose name identifies the anchored-classifier precedence table (SPEC 45 §3.2; use a stable describe name), require `>=12`; `ui.assertions` = the `assertions` attribute of the `app/routes/modelsHealthView.test.ts` suite, require `>=1`; `ui.contractTestsPassed` = that suite `failures===0`. None of these may come from the `.log` text.
5. **Classifier source:** keep the existing anchored-regex presence check on the candidate gateway router (`/if \(\/\^litellm 5\\d\\d:\/\.test\(msg\)\) return "server_error";/`); `classifier.sourceVerified` = that result; `classifier.testsPassed` = the router.test.ts suite `failures===0`.
6. **Fresh-host report:** re-read `fresh-host-<commit>-<runId>.json` immutably; validate the existing v2 report contract **but** with `schemaVersion` per the report producer, `runId`/`candidateCommit`/`candidateTree` matching the manifest, `generatedAt` within `[freshHost.startedAt, freshHost.finishedAt]`, verdict counts recomputed, all `HONEST`, zero leak/crash/5xx, no duplicate routes, and the route set equal to the **canonical inventory** from §3.2 (not the old regex). Also require the manifest's `routeInventory.routes` equals that canonical set and `routeInventory.sha256` matches the sorted-JSON hash.
7. Map to `ValidationObservation`: `recordedAt`, `commit`, `manifestVerified:true`, `candidateTrackedClean: candidateClean`, `classifier`, `bounded` (`focusedTestsPassed`, `testFiles`, `typecheckPassed`= typecheck exit 0, `buildPassed`= build exit 0, `forbiddenProcessesSpawned`, `evidenceRef`= manifest path), `ui`, `freshHost` (`apiOnly:true`, `total`= results length, `honest`, `leak`, `crash`, `error5xx`, `commit`, `evidenceRef`). `evidenceRef`s point at the immutable receipt paths.

The `--operator-input` `validation` pointer parsing (lines ~1159-1168, only `{manifestPath, manifestSha256}`) is unchanged.

## 6. Tests (hermetic)

Extend `server/api/repairArcVerify.test.ts` (it already imports the CLI exports). Add fixtures in a temp receipt dir made root-owned+`0444` where the immutable reader requires it; if a test cannot create root-owned `0444` files in CI-of-one, gate those on a helper that builds the fixture via the same syscalls the producer uses. Prove at least:

- A well-formed **v3** manifest yields `manifestVerified:true` and the four checks `PASS` through `evaluateValidation`.
- A **v2** manifest still throws the precise non-authoritative rejection (`manifestVerified:false`, four checks `UNVERIFIABLE`).
- Each provenance breach fails: wrong `candidateCommit`, wrong `candidateTree`, non-v4 `runId`, basename mismatch, `recordedAt` before cutoff / in the future, overlapping/stale command windows, a non-zero `exitCode`.
- `source.cleanBefore`/`cleanAfter` false → reject; freshHost `cleanAfter` tolerates exactly `REPORT.json`/`REPORT.md` and nothing else.
- `forbiddenProcessesSpawned===true` (a Codex/builder/autonomous entry appears in `after\before`) → the recomputed guard rejects and, if it reached the core, `bounded` `FAIL`.
- JUnit-derived counts: `testFiles<7`, classifier `cases<12`, UI `assertions<1`, or any suite `failures>0` → reject/`FAIL`; counts are read from the JUnit artifact, and a tampered `.log` with different numbers does not change them.
- Route inventory: `extractGetRoutes` finds the `||`-alternation route the old regex missed; a fresh-host report missing a canonical route, or containing an extra route, → reject; `routeInventory.sha256` mismatch → reject.
- Immutable artifacts: sha256/byte mismatch, non-`0444`, non-root-owned, symlinked, or wrong-directory receipt → reject.
- Secret-like input never appears in serialized output or sanitized errors.

Add the classifier-table describe-name and the route-inventory sync assertions per §3.3. Keep all fixtures on temp files / in-memory; never read live `/var/lib`, `/etc/litellm`, journald, systemd, or the edge.

## 7. Bounded self-verification (what codex runs before stopping)

This slice's definition of done is **code + hermetic tests green + typecheck/build clean** — NOT a full live acceptance run (that needs Docker fresh-host + the aged restart window + operator authorization, and happens later per §8).

```bash
cd /opt/opencode-control-surface
bun run check
DASHBOARD_DB=1 bun test \
  server/gateway/router.test.ts server/api/modelHealthState.test.ts \
  server/api/models.test.ts server/api/router.test.ts \
  server/api/repairArcVerify.test.ts app/routes/modelsHealthView.test.ts \
  e2e/fresh-host/routeInventory.test.ts \
  --timeout=60000 --max-concurrency=4 --reporter=dots
```

Both must be clean. Do **not** run bare `bun test` (discovers unrelated E2E). Do **not** run `scripts/record-validation-v3.ts`, `e2e/fresh-host/run.sh`, `e2e/fresh-host/gate.sh`, Playwright, or any Docker. Do **not** commit, restart, or touch git. Leave the tree for review and report files changed + test results.

## 8. Rails

- **Read-only over production.** The verifier and producer never write `/etc/litellm/*`, `/etc/tib-builder/*`, `/opt/mimoun/*`, `/opt/newsbites/*`, and never restart LiteLLM, control-surface, reprobe, health-check, builder, or any autonomous service/timer.
- **Producer writes only:** the throwaway detached worktree (removed at the end) and new immutable receipts in the fixed receipt dir. It must **never** modify the main worktree's tracked files, including `e2e/fresh-host/REPORT.*`.
- **Do not change `evaluateValidation`** or any other core check. Do not change the evidence-envelope `SCHEMA_VERSION`.
- **v2 stays rejected**, precisely — keep its full parse + terminal throw.
- Kill by PID; no broad pkill; ps-check before any git op (a concurrent builder may be running — do not disturb it).
- The later live acceptance run (running the producer, feeding its pointer to `verify-repair-arc.ts --operator-input`) is a separate operator-authorized action, gated on the aged R1 restart window; this slice only makes it possible.

## 9. File scope

Create:
- `scripts/record-validation-v3.ts`
- `e2e/fresh-host/routeInventory.mjs`
- `e2e/fresh-host/routeInventory.test.ts`

Edit surgically:
- `scripts/verify-repair-arc.ts` — `VALIDATION_COMMANDS` (focused argv → 7 files + JUnit flags), `collectValidationManifest` (branch v3/v2, consume canonical inventory, JUnit counts, per-command source, process guard), and add the manifest `schemaVersion===3` path. Keep every existing export signature.
- `server/api/repairArcVerify.test.ts` — add the v3 hermetic cases.
- `e2e/fresh-host/probe.mjs` — consume `extractGetRoutes` instead of the inline regex.

Read only:
- `server/api/repairArcVerify.ts`, `server/api/router.ts`, `server/gateway/router.ts`, `server/api/models.ts`, `server/api/modelHealthState.ts`, `e2e/fresh-host/run.sh`.

Do not touch product routing, config, schema, migrations, or any service/timer.
