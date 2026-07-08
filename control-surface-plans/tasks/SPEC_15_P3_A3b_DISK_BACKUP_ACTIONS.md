# SPEC 15 — A3b: disk-pressure reclaim + run-backup-now, wired to the existing detectors (ULTRAPLAN P3/A3)

**Builder**: Sonnet subagent. **Verifier/committer**: Fable (orchestrator). You NEVER commit, NEVER run systemctl/docker/pkill/restart, NEVER touch live services except read-only.

## Mission — the OTHER two A3 bullets

A3a (SPEC 14, shipped `7d04f2c`) made infra restart/timer job-backed via the `runShell` command seam. A3b finishes Catalog A3 with the two **remediation actions** — the fixes the operator clicks when the host is under disk pressure or the backup is stale/missing:

1. **`reclaim:disk:docker-prune`** (medium, job-backed): a bounded, audited Docker reclaim — `docker builder prune -f` + `docker image prune -f`, **NEVER `-a`** — with before/after `df` evidence recording GB reclaimed.
2. **`run:backup:now`** (low, job-backed): trigger the daily backup on demand, reusing the SPEC 14 timer-run worker for the already-allowlisted `mimule-backup` timer (DO NOT duplicate systemctl logic).

Then **wire the two EXISTING detectors** so their insight cards actually offer these fixes (they currently offer nothing).

## Ground truth (verified by orchestrator 2026-07-07 — re-confirm before building)

- **The detectors ALREADY EXIST — do NOT build or duplicate them.**
  - `server/insights/scanners/ops.ts` `mapHetznerFindings` (~line 168) emits insight `insight_ops_disk_pressure` / sourceKey `ops:disk-pressure` when `stats.diskUsedPct >= 85` (severity `medium`, or `high` at `>= 95`), evidence `df -BG /`. It sets **`actionDescriptorId: null`** — that null is the gap.
  - `server/insights/scanners/ops.ts` `mapBackupFreshnessFindings` (~line 352) emits insight `insight_ops_backup_stale` / sourceKey `ops:backup-stale` when the backup bucket is `stale` or `missing` (`getBackupFreshness()` from `server/db/sampler.ts`, root `DASHBOARD_BACKUP_ROOT ?? /opt/backups`, staleness `DASHBOARD_BACKUP_STALE_MS`). Confirm its current `actionDescriptorId` value; if `null`, that is the gap to close.
- **No remediation action exists for either.** `grep -rn "reclaim\|docker-prune\|run:backup\|backup:now"` over `server/api/{actionDescriptors,actions,execute}.ts` returns nothing.
- **The command seam is the mandatory execution path.** `server/api/shell.ts` exports `runShell(command, {timeout}) => {ok, stdout, stderr?, error?}` (never throws; surfaces stdout even on non-zero exit) and `setRunShellForTests(fn|null)` (assignment-based; do NOT use `mock.module` — it leaks across bun test files). SPEC 14's `runInfraServiceRestart` / `runInfraTimerRun` / `captureRestartState` in `server/api/actions.ts` are the job-backed pattern to mirror.
- **`mimule-backup` is already in `ALLOWED_TIMERS`** (`server/api/actions.ts` ~line 22). The SPEC 14 worker `runInfraTimerRun(jobId, timer, reason)` already issues `systemctl start --no-block mimule-backup.service` and captures post-enqueue state. `run:backup:now` MUST reuse this worker (via `createJob` + `runInfraTimerRun(jobId, "mimule-backup", reason)`), not reimplement it.
- **Descriptor execution path.** The InsightsPage "Apply" (`app/routes/InsightsPage.tsx` ~1188: `canApply = Boolean(insight.actionDescriptorId && insight.riskTier !== "none")`) POSTs the `actionDescriptorId` to `/api/execute` → `executeActionHandler` (`server/api/execute.ts`) → `parseActionId` → confirm/reason enforcement → **`routeAndExecute(parsed, body, req)`**. `routeAndExecute` is a `kind`/`targetType` switch (kinds today: navigate, copy-command, external-link, open-source, start-job). **Both new actions must be reachable through `routeAndExecute`** so the insight Apply button works — that is the closed loop. `executeActionHandler` already writes the dispatch `action_audit` row from `routeAndExecute`'s result; a job-backed action returns immediately with `{ok, jobId, message}` and its worker writes the second `.finished` audit row + job output (same two-row pattern as SPEC 14).
- **actionId format** is `kind:targetType:targetId[:suffix]` (`actionId()` / `parseActionId()` / `getRisk()` in `execute.ts`; `getEnforcement` sets confirm/reasonRequired). So `reclaim:disk:docker-prune` ⇒ kind `reclaim`, targetType `disk`, targetId `docker-prune`; `run:backup:now` ⇒ kind `run`, targetType `backup`, targetId `now`. Descriptors are emitted in `server/api/actionDescriptors.ts` (`descriptor()` / `actionId()` helpers; `ActionDescriptor` type + its `kind` union live in `server/api/types.ts`).
- **Current live disk state (context, not a test input)**: `/ 74% used`; `docker system df` ≈ 529 MB reclaimable images, ~2.36 GB reclaimable volumes, 0 build cache. **Do NOT touch volumes** — `docker image prune -f` (dangling/untagged only) and `docker builder prune -f` (build cache) never remove images in use by running containers (paperclip/goblin/openclaw) or tagged images. `-a` WOULD remove tagged-but-unused images and is forbidden.
- **Auto-remediation at >90% is OUT of scope for this spec** (it is the ULTRAPLAN "then detector+auto" clause). Promoting `reclaim:disk:docker-prune` to auto-tier requires `SAFE_AUTO_ACTIONS` + an `AUTO_ROLLBACK_AFFORDANCES` entry in `server/insights/autoapplyPolicy.ts` + a `docs/AUTOAPPLY_PROMOTION_REVIEW.md` entry + operator sign-off (the SPEC 10 process). Leave these actions at **review** tier (operator-confirmed). Do NOT add them to `SAFE_AUTO_ACTIONS`. Note the promotion as follow-up.

## Hard rails (non-negotiable)

- **NO real system mutation in build or test.** You must NOT run `docker builder prune`/`docker image prune`/`docker restart`, `systemctl start/restart`, or any host mutation. ALL behavioral proof is hermetic: route every command through `runShell` and **stub it with `setRunShellForTests`**, asserting exact command strings, before/after capture, job rows, audit rows, confirm-gating, and the reuse of `runInfraTimerRun` for backup. Read-only `df -BG /` / `docker system df` to understand output shapes is fine; nothing mutating.
- **The `-a` prohibition is a tested invariant.** A test must assert that neither issued command contains ` -a` (nor `--all`). This is the whole point of the "bounded" reclaim.
- **READ-ONLY toward /opt/mimoun, /opt/newsbites, /opt/paperclip, /opt/backups.** You may read `getBackupFreshness`, list `/opt/backups`, read the pipeline/ops source. You must NOT write to or delete anything under `/opt/backups`, and must NOT trigger the live backup.
- Live :3000 GET-only for you. NEVER commit/git-mutate; NEVER systemctl/pkill/restart/docker. Fable does all promotion, restart, and live-verify.
- Keep repo idioms: `createJob/finishJob/updateJobOutput`, `writeActionAudit`, risk tiers (reclaim **medium** → confirm required; backup **low** → no confirm), the UX/table standard, the envelope where applicable. Never widen a gate.sh matcher or an allowlist. Never echo secrets; never set DEMO_SEED.
- Keep the two SPEC 14 routes and all existing action behavior backward-compatible.

## Deliverable 1 — `reclaim:disk:docker-prune` (job-backed, bounded)

- **Descriptor** in `actionDescriptors.ts`: id `reclaim:disk:docker-prune`, kind `reclaim`, targetType `disk`, targetId `docker-prune`, risk `medium`, `confirm: true`, a clear title/plainSummary ("Reclaim disk: prune unused Docker build cache + dangling images (never `-a`)"), evidence refs for the two commands + `df -BG /`. Wire the new `kind: "reclaim"` cleanly through the `ActionDescriptor` kind union (`types.ts`), `getRisk` (medium for reclaim/disk), and `getEnforcement` (confirm=true, reasonRequired as you judge — medium elsewhere doesn't force reason, match the convention). If adding a new kind proves to touch more than these known sites, STOP and report rather than sprawling.
- **Worker** in `server/api/actions.ts` (co-located with the SPEC 14 infra workers), e.g. `runDiskReclaim(jobId, reason)`:
  1. Capture BEFORE via seam: `df -BG /` (or `df -B1 /` for exact bytes) → parse used GB / used%.
  2. Issue `docker builder prune -f` via seam, then `docker image prune -f` via seam (timeout ≈120 s each; named constant). Capture each command's stdout for evidence. **Never `-a`.**
  3. Capture AFTER `df` via seam; compute reclaimed = before.usedBytes − after.usedBytes (report `reclaimedGb`, and both used% values).
  4. `finishJob` **success** iff both prune commands returned `ok` (a prune that reclaims 0 bytes is still a legitimate success — nothing to reclaim ≠ failure; judge on command success + captured df, per the SPEC 13 lesson). Store `{beforePct, afterPct, beforeUsedGb, afterUsedGb, reclaimedGb, builderPruneOutput, imagePruneOutput, commands:[...]}` in job output + the `.finished` audit `evidence`/`resultJson`. If a prune command fails, `finishJob` failed with the captured stderr surfaced — never silent.
- **Route it through `routeAndExecute`**: add a `kind === "reclaim" && targetType === "disk"` (targetId `docker-prune`) case that `createJob({kind:"reclaim-disk", targetType:"disk", targetId:"docker-prune", command:"docker builder prune -f && docker image prune -f", …})`, kicks off `void runDiskReclaim(jobId, body.reason)`, and returns `{ok:true, action:"reclaim", jobId, message}` immediately. (Guard: only `docker-prune` is a valid targetId; anything else → `{ok:false, code:"NOT_FOUND"}`.)

## Deliverable 2 — `run:backup:now` (job-backed, reuses SPEC 14 timer worker)

- **Descriptor** in `actionDescriptors.ts`: id `run:backup:now`, kind `run`, targetType `backup`, targetId `now`, risk `low`, `confirm: false`, title "Run the stack backup now", plainSummary explaining it triggers the `mimule-backup` service immediately and records the enqueue (a `--no-block` start returns "queued", not "finished" — say so honestly). Evidence: `systemctl start --no-block mimule-backup.service`. Wire kind `run` / targetType `backup` through the kind union + `getRisk` (low) + `getEnforcement` (confirm=false).
- **Execution** in `routeAndExecute`: `kind === "run" && targetType === "backup" && targetId === "now"` → `createJob({kind:"run-backup", targetType:"timer", targetId:"mimule-backup", command:"systemctl start --no-block mimule-backup.service", …})` then `void runInfraTimerRun(jobId, "mimule-backup", body.reason)` (REUSE the SPEC 14 worker — do not write new systemctl code), return `{ok:true, action:"run", jobId, message}`. `mimule-backup` is already in `ALLOWED_TIMERS`; assert that guard still applies (a non-allowlisted timer path must be impossible here — you're hardcoding `mimule-backup`, so document that this action is fixed to the backup timer).

## Deliverable 3 — Wire the existing detectors to the actions (the closed loop)

- `ops.ts` `mapHetznerFindings`: set the disk-pressure insight's `actionDescriptorId: "reclaim:disk:docker-prune"` (was `null`). Keep `manualPageHref: "/infra"`.
- `ops.ts` `mapBackupFreshnessFindings`: set the backup-stale/missing insight's `actionDescriptorId: "run:backup:now"` (if currently null).
- Confirm the resulting insights resolve to **`riskTier: "review"`** (so `canApply` is true and the Apply button renders, gated by the medium/low confirm policy) and **NOT `"auto"`** (no unattended execution — that's the gated follow-up). Trace how `riskTier` is derived for an insight from its `actionDescriptorId` (the autoapply policy tiers map / default) and state it in your report; if a descriptor with no explicit policy tier resolves to `"none"` (which would hide the button), say so and set the minimal policy/default needed to make it `"review"` — without adding it to `SAFE_AUTO_ACTIONS`.
- No new UI component should be required — the InsightsPage Apply affordance already renders off `actionDescriptorId`. If the disk/backup insight also surfaces on `/infra` or an actions surface, ensure it stays consistent (never-silent job feedback). Do not restructure any page.

## Verification you must run (report verbatim)

1. `bun run check` clean.
2. `DASHBOARD_DB=1 timeout 500 bun test` — baseline **1045 pass / 0 fail** (SPEC 14); new tests add to it, nothing may fail; reconcile the count. (An unrelated env flake — LiteLLM 401 / missing `paperclip_db` — occasionally fails one non-hermetic test; if you see exactly that, re-run once and report both runs. Your new tests must be fully hermetic and pass every run.)
3. `bash e2e/fresh-host/gate.sh` — stays **PASS 41/41**, CRASH=0, ERROR-5xx=0, LEAK=no, zero exceptions; confirm `/insights` and `/infra` still pass.
4. New hermetic tests (seam stubbed via `setRunShellForTests`, NO real commands) covering:
   - reclaim creates a job + captures before/after `df` + issues **exactly** `docker builder prune -f` then `docker image prune -f`, in that order, and computes `reclaimedGb`; healthy→success including the **zero-bytes-reclaimed still succeeds** case.
   - **`-a`/`--all` never appears** in either issued command (explicit assertion).
   - a failing prune command → job `failed` with stderr surfaced (not a throw / not a silent success).
   - reclaim confirm-gating: unconfirmed medium → 400 CONFIRM_REQUIRED, no job.
   - `run:backup:now` creates a job and dispatches through `runInfraTimerRun("mimule-backup")` issuing `systemctl start --no-block mimule-backup.service` (assert `--no-block` present); low risk → no confirm required.
   - detector wiring: `mapHetznerFindings` disk-pressure insight now carries `actionDescriptorId === "reclaim:disk:docker-prune"`; backup insight carries `run:backup:now`; both resolve to a non-`none` riskTier (Apply renders).

## Report format

1. Files changed (paths + rough +/-), grouped by deliverable.
2. Test/gate output tails + count reconciliation vs 1045.
3. Design decisions where the spec left room (new `reclaim`/`run` kinds vs reusing `start-job`; df in GB vs bytes; how `riskTier` resolves to review for the wired insights; whether a dedicated `run:backup:now` descriptor vs pointing at an existing timer descriptor) — one line each, with the reasoning.
4. Explicit confirmation you ran NO real docker/systemctl/backup mutation, and how you proved behavior hermetically instead.
5. Anything not done/verified, stated plainly (incl. the auto-tier promotion left as a gated follow-up, and any execute.ts execSync sites still un-migrated).
