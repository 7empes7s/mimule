# SPEC 25 — ULTRAPLAN Phase 3 line 93: Runbooks v1 — parameterized, audited action bundles

## Context (read first)
ULTRAPLAN A6: *"Runbooks v1 — generalize builder playbooks into parameterized, audited action
bundles usable outside builder context (e.g. 'restart service + verify health + notify'):
`runbooks` table, run history, GUI composer with the existing action catalog as building
blocks. This is the feature that makes 'more actions' scale without more code per action."*
Work in `/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD `414a38b` (verified — EXTEND, do not replace):
- `server/api/execute.ts`: `executeActionHandler` — parses actionId (`parseActionId`),
  enforcement (`getEnforcement`), risk (`getRisk`), dispatches via internal
  `routeAndExecute(parsed, body, req)`, then writes ONE `writeActionAudit` row
  (actionKind `kind.targetType`, rollbackHint via `rollbackHintForActionId`). These helpers
  are module-private today.
- `server/api/actionDescriptors.ts`: `buildActionCatalog` (or equivalent) — the catalog the
  composer must use as its palette. Descriptors carry id/kind/risk/confirm/reasonRequired.
- `server/db/dashboard.ts`: there is a VESTIGIAL `runbooks` table (slug/title/body,
  0 rows live, zero consumers). DO NOT reshape it — `CREATE TABLE IF NOT EXISTS` will NOT
  alter the existing empty live table, so a changed definition would silently diverge.
  Leave it untouched; use NEW table names.
- `server/reasoner/playbooks.ts` (builder-only playbooks, DB-backed with built-ins) and
  `server/insights/runbooks.ts` (documentation-only what/apply/revert registry) exist —
  neither is what we're building; do not modify either.
- Frontend: Vite/React/wouter, routes in `app/routes/`, registered in `app/App.tsx` with a
  sidebar nav. ALL tables must follow the shared table standard (paginate, sort,
  search/filter, row-expand, never-silent empty states).

## Build this

### 1. Data model (server/db/dashboard.ts — new tables only)
- `runbook_definitions`: id TEXT PK, name TEXT NOT NULL, description TEXT, steps_json TEXT
  NOT NULL (JSON array of `{actionId: string, params?: object}`), created_by TEXT,
  created_at INTEGER, updated_at INTEGER, archived_at INTEGER NULL.
- `runbook_runs`: id TEXT PK, runbook_id TEXT NOT NULL, status TEXT
  ('running'|'success'|'failed'), actor TEXT, reason TEXT, risk TEXT, started_at INTEGER,
  finished_at INTEGER NULL, error TEXT NULL. Index on runbook_id.
- `runbook_run_steps`: id TEXT PK, run_id TEXT NOT NULL, step_index INTEGER, action_id TEXT,
  status TEXT ('pending'|'running'|'success'|'failed'|'skipped'), message TEXT NULL,
  error TEXT NULL, started_at INTEGER NULL, finished_at INTEGER NULL. Index on run_id.

### 2. Engine (`server/runbooks/engine.ts`, new)
- In execute.ts, extract the post-dispatch audit write into an exported helper (used
  byte-identically by `executeActionHandler`) and export a programmatic entry
  `executeCatalogAction(actionId, {params, reason, confirmed: true, runbookRunId}, req)`
  that runs parse → dispatch (`routeAndExecute`) → the shared audit write, with the audit
  `request` gaining `runbookRunId` when set. Existing handler behavior and audit rows for
  normal executes must remain byte-identical.
- `startRunbookRun(runbookId, {actor, reason}, req)`: creates the run row + pending step
  rows, returns `{runId}` immediately, then executes steps SEQUENTIALLY in a detached async
  loop: per step set running → `executeCatalogAction` (outer 120s cap per step;
  honest timeout error) → success/failed + message/error. First failure marks the run
  failed and all remaining steps skipped (v1: no continue-on-error). All-success → run
  success. Run-level audit `runbook.run` on completion (resultStatus, per-step summary in
  resultJson).
- Step validation helper `validateSteps(steps)`: 1..20 steps; each actionId must parse AND
  exist in the CURRENT action catalog (build it and check ids). Used at create/update AND
  at run start (an action that vanished since authoring → 400 at run start with an honest
  message naming the missing actionId). Params optional passthrough.
- Run risk = max of the steps' catalog risk, floored at "medium" (a bundle that mutates
  deserves confirm even if every step is low).

### 3. API (`server/api/runbooks.ts`, new; register in `server/api/router.ts`)
All mutation-gated like sibling routes; JSON errors with proper status codes; audited.
- `GET /api/runbooks` — non-archived definitions + per-runbook last-run summary
  (status/started_at) + step count.
- `POST /api/runbooks` — {name, description?, steps}; validateSteps; audit
  `runbook.create` low. `PUT /api/runbooks/:id` — same validation; audit `runbook.update`
  low with before/after step counts. `DELETE /api/runbooks/:id` — soft archive
  (archived_at); audit `runbook.archive` low. 404 unknown for :id routes.
- `POST /api/runbooks/:id/run` — body {reason, confirmed}. ALWAYS requires confirmed===true
  and non-empty reason (CONFIRM_REQUIRED / REASON_REQUIRED like execute.ts, audited
  failures included). Re-validate steps; 404 unknown, 409 archived. Returns
  `{runId, status: "running", pollUrl: "/api/runbooks/runs/<runId>"}`.
- `GET /api/runbooks/runs/:runId` — run row + ordered steps (for polling). 404 unknown.
- `GET /api/runbooks/:id/runs` — run history for one runbook (bounded, newest first).

### 4. UI (`app/routes/RunbooksPage.tsx`, new; route `/runbooks` in App.tsx + sidebar nav near Jobs/Workflows)
- List of runbooks (shared table standard): name, description, steps count, last run
  status/time, Run / Edit / Archive. Honest empty state ("No runbooks yet — compose one
  from the action catalog").
- Composer (create/edit): name, description, ordered step list; step picker is a
  searchable select fed by `/api/actions/catalog` (show id + label + risk badge);
  add/remove/reorder steps. Save via POST/PUT.
- Run: confirm dialog with reason input (existing app idiom), showing the computed risk
  and the step list; after start, poll the run URL and render per-step progress
  (pending/running/success/failed/skipped) plus run history section per runbook.

### 5. Tests (hermetic — temp DASHBOARD_DB_PATH; never the live DB; never contact :3200)
- `server/api/runbooks.test.ts`: CRUD (create happy; 0 steps/21 steps/unknown-catalog
  actionId/garbage actionId → 400; update; archive → hidden from list, run → 409);
  run enforcement (no confirm → CONFIRM_REQUIRED, no reason → REASON_REQUIRED); run happy
  path using only safe in-process catalog actions (e.g. `scan:discovery:proc-cmdline`) —
  poll/await completion, assert run success, step rows, per-step audit rows carrying
  runbookRunId, run-level `runbook.run` audit; failure path via a step whose dispatch
  returns NOT_FOUND (e.g. `regen:article:<nonexistent-slug>:digest` with
  DASHBOARD_DOSSIERS_ROOT pointed at an empty temp dir) — run failed, later steps skipped.
- execute.test.ts: existing tests must stay green (audit extraction is behavior-neutral).
- If the engine exposes seams, prefer real catalog actions over mocks; never spawn
  processes, never hit the network (stub `globalThis.fetch` where a step would call out).

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts` (runbook runs must never be
  auto-appliable — they aren't in its allowlist and must stay out) or
  `server/reasoner/playbooks.ts` or `server/insights/runbooks.ts` or the vestigial
  `runbooks` table; never widen `e2e/fresh-host/gate.sh`.
- Existing execute handler responses and audit rows byte-identical.
- Tests never write `/var/lib/control-surface/dashboard.sqlite`; no real codex/tmux spawns.
- Do NOT touch builder/runner/terminal/gateway files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/runbooks.test.ts server/api/execute.test.ts server/api/actionDescriptors.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: dashboard.ts, engine.ts (new), runbooks.ts+test (new, api),
   execute.ts (+test if touched), router.ts, RunbooksPage.tsx (new), App.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed; the executeCatalogAction/audit-extraction diff summary; table DDL; the run
lifecycle snippet (sequential loop + failure/skip semantics); validateSteps snippet; test
summaries; explicit confirmation that normal execute behavior/audits are byte-identical,
autoapplyPolicy.ts and the vestigial runbooks table are untouched.
