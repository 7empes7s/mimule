# Builder Platform Month 6 — Durable Workflow Engine (The Orchestrator)

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 6)
Related: `/root/BUILDER_MONTH5_REASONER_PLAN.md`

---

## Theme

**Replace the ad-hoc pass loop with a real workflow engine — generator-based definitions, deterministic resume from history, signals, timers, concurrency lanes, and child workflows.**

Today's `runner.ts` is a procedural loop with implicit state encoded in SQLite rows. Month 6 adds explicit workflow semantics so runs survive daemon restarts, can wait on external events, and compose into child workflows. This is the foundation for durable, replayable AI pipelines.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules (do not break these):
- `server/builder/runner.ts` — current pass loop; will become a *thin adapter* after this month
- `server/builder/store.ts` — `readBuilderRuns()`, `readBuilderPasses()`, `BuilderPass`, `BuilderRun`
- `server/db/dashboard.ts` — `getDashboardDb()`, `ensureTable()`, `ensureColumn()`
- `server/gateway/router.ts` — `gatewayComplete()` for LLM calls
- `server/api/router.ts` — add new routes here
- `app/routes/BuilderPage.tsx` — existing builder UI

**No new npm/bun packages.** Use only what's already in `package.json`.

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 2 (pre-existing in doctor.ts, actionDescriptors.ts)
- `bun test server/db/ server/api/ 2>&1 | grep -E "pass|fail" | tail -3` → 63+ pass
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — Engine Types + History Store

- [x] Create `server/orchestrator/` directory with `index.ts` barrel
- [x] Define types in `server/orchestrator/types.ts`:
  - `StepKind`: `"spawn-pass" | "run-validation" | "wait-signal" | "wait-timer" | "spawn-child" | "log-vault" | "pause-approval"`
  - `StepRequest`: `{ kind: StepKind; payload: unknown }`
  - `StepResult`: `{ status: "complete" | "failed" | "blocked" | "cancelled"; output?: unknown; error?: string }`
  - `WorkflowCtx`: interface with methods `spawnPass()`, `runValidation()`, `waitSignal()`, `waitTimer()`, `spawnChild()`, `pauseForApproval()`, `logToVault()` — each returns a `StepRequest`
  - `WorkflowDef`: `(ctx: WorkflowCtx) => Generator<StepRequest, void, StepResult>`
  - `HistoryEntry`: `{ id, workflowInstanceId, stepIndex, kind, payload_json, result_json, startedAt, finishedAt, status }`
  - `WorkflowInstance`: `{ id, definitionName, runId, workflowId, status, currentStepIndex, createdAt, finishedAt, error }`
- [x] Add SQLite tables via `ensureTable` in `server/db/dashboard.ts`:
  - `orchestrator_instances` (id TEXT PK, definition_name TEXT, run_id TEXT, workflow_id TEXT, status TEXT, current_step_index INTEGER default 0, created_at INTEGER, finished_at INTEGER, error TEXT)
  - `orchestrator_history` (id TEXT PK, instance_id TEXT, step_index INTEGER, kind TEXT, payload_json TEXT, result_json TEXT, status TEXT, started_at INTEGER, finished_at INTEGER)
  - `orchestrator_signals` (id TEXT PK, instance_id TEXT, signal_name TEXT, payload_json TEXT, delivered INTEGER default 0, created_at INTEGER)
  - `orchestrator_lanes` (id TEXT PK, lane_name TEXT, max_concurrency INTEGER default 3, active_count INTEGER default 0, updated_at INTEGER)
- [x] Write `server/orchestrator/history.ts`: appendStep(), getHistory(), updateStep(), getInstance(), upsertInstance()
- [x] Run typecheck + `bun run build`

## Phase 2 — Engine Execution + Replay

- [x] Implement `server/orchestrator/engine.ts`:
  - `createWorkflowCtx(instanceId, stepIndex)` — builds the ctx object; each method creates a typed `StepRequest`
  - `executeWorkflow(def, instance, stepHandlers)` — replays history up to `currentStepIndex` (fast-forward without re-executing), then drives the generator forward one step at a time; calls the appropriate `stepHandler` for each new step; persists each step to history before executing; resumes after daemon restart by replaying
  - `stepHandlers` is a `Record<StepKind, (payload, instanceId) => Promise<StepResult>>` — injected so engine stays pure
  - Guard: any non-`ctx.*` yield (i.e. a raw promise) throws `OrchestratorError("non-deterministic yield")` — detected by checking if yielded value has `kind` field
- [x] Implement the `buildUntilDone` built-in definition in `server/orchestrator/definitions.ts`:
  - Mirrors the current runner loop: runDoctor → spawnPass (loop until complete/blocked) → runFinalValidation → logToVault
  - Uses `ctx.spawnPass({ sequence })`, `ctx.runValidation()`, `ctx.logToVault()`
- [x] Add tests in `server/orchestrator/engine.test.ts`:
  - A 3-step workflow runs to completion; history has 3 rows
  - Simulate daemon restart: create instance + 2 history rows, call executeWorkflow again — asserts step 1 and 2 are not re-executed (fast-forward), only step 3 runs
  - Cancellation: step handler returns `{ status: "cancelled" }` → generator receives it, workflow stops
- [x] Run typecheck + `bun test server/orchestrator/engine.test.ts` + build

## Phase 3 — Signals + Timers

- [x] Implement `server/orchestrator/signals.ts`:
  - `emitSignal(instanceId, signalName, payload)` — inserts into `orchestrator_signals`
  - `consumeSignal(instanceId, signalName): SignalPayload | null` — returns first undelivered signal matching name, marks delivered
  - `waitSignalStepHandler(payload, instanceId)` — polls `consumeSignal` every 5s up to `payload.timeoutMs` (default 24h); returns `{ status: "complete", output: signalPayload }` when signal arrives, `{ status: "blocked", error: "timeout" }` on timeout
- [x] Add GET/POST /api/orchestrator/signals endpoints in server/api/orchestrator.ts; registered in router.ts
- [x] Add timer step handler in signals.ts: waitTimerStepHandler
- [x] Add tests: emit signal + timer tests in signals.test.ts
- [x] Run typecheck + tests + build

## Phase 4 — Concurrency Lanes

- [x] Implement `server/orchestrator/lanes.ts`:
  - `acquireLane(laneName): boolean` — atomically increments `active_count` if below `max_concurrency`; returns false if at limit
  - `releaseLane(laneName)` — decrements `active_count` (floor 0)
  - `getLaneStatus(laneName)` — returns `{ active, max, queued: number }`
  - `setLaneLimit(laneName, max)` — upserts lane config
- [x] Wire lane acquisition into `executeWorkflow`: before the `spawn-pass` step handler fires, call `acquireLane("builder-passes")`; on step completion (success or failure), call `releaseLane`; if lane is full, return `{ status: "blocked", error: "lane-full" }` so the workflow pauses and is retried by the watcher
- [x] Add `GET /api/orchestrator/lanes` endpoint
- [x] Seed default lane `builder-passes` with `max_concurrency=3` in `server/index.ts` startup
- [x] Add tests: 4 concurrent spawn-pass requests with lane max=3 → first 3 succeed, 4th returns blocked
- [x] Run typecheck + tests + build

## Phase 5 — Runner Adapter Refactoring

- [x] Add `orchestratorInstanceId` column to `builder_runs` via `ensureColumn` in `server/db/dashboard.ts`
- [x] In `server/builder/runner.ts`, wrap `startWorkflowRun()` to create an `orchestrator_instance` row with `definition_name: "buildUntilDone"` and store the instance ID on the run
- [x] Extract the per-pass execution logic into an `orchestratedSpawnPassHandler` that is registered as the `spawn-pass` step handler; the existing tmux launch, monitoring, and reconciliation stays as-is — just called through the step handler interface
- [x] On `reconcileRunStatus`, after a pass completes, advance the orchestrator instance to the next step (call `executeWorkflow` with the updated step index)
- [x] Add `GET /api/orchestrator/instances` (list recent instances, last 50) and `GET /api/orchestrator/instances/:id` (detail with history) endpoints
- [x] Back-compat: runs created before Month 6 (no `orchestratorInstanceId`) continue to use the legacy loop path; new runs use the orchestrator path
- [x] Run typecheck + existing builder tests still pass + build

## Phase 6 — Child Workflows

- [x] Add `spawn-child` step handler in `engine.ts`: creates a child `orchestrator_instance` row pointing to the same `runId`, executes it synchronously (inline, not via tmux — child workflows are light coordination, not full agent passes), returns the child's final status as the step result
- [x] Implement `doctorReviewWorkflow` in `definitions.ts` as a 2-step child workflow: `runValidation` → `logToVault`; wire it to the existing `runDoctorReview()` in `doctor.ts`
- [x] Add `parentInstanceId` column to `orchestrator_instances` so UI can show the tree
- [x] Add tests: parent spawns child → child completes → parent receives child result; child failure propagates as blocked
- [x] Run typecheck + tests + build

## Phase 7 — Dashboard `/workflows` View

- [x] Create `app/routes/WorkflowsPage.tsx`:
  - Header: "Workflows" + active instance count badge
  - Instance list (sorted by created_at desc): definition name, run ID link, status badge, step progress (`step N of M`), duration, last signal
  - Expandable instance row: history table (step index, kind, status, payload summary, duration), signal log, child instance tree
  - "Emit Signal" button per instance → modal to input signal name + JSON payload → calls `POST /api/orchestrator/signals`
  - "Replay" button on completed instances (future: no-op label if not yet implemented)
  - Empty state: "No workflow instances yet — start a builder run to create one"
- [x] Add `ReasonerStatusStrip`-style `OrchestratorStatusStrip` to `app/routes/DashHome.tsx`: "Orchestrator: N active · N signals pending · lanes: M/L busy"
- [x] Add `/workflows` to `app/App.tsx` route table
- [x] Ensure `app/components/DashSidebar.tsx` has Workflows nav entry with `GitBranch` or `Workflow` icon
- [x] Run typecheck + build + restart + verify `/workflows` loads and `GET /api/orchestrator/instances` returns 200

## Phase 8 — Exit Criteria Validation

- [x] Kill `control-surface.service` mid-pass; restart within 10s; verify workflow resumes at the correct next step (not from scratch)
- [x] Verify `orchestrator_history` row exists for each completed step of the last builder run
- [x] Verify back-compat: last Month 5 run (`br_6d964f7b`) is still readable through `/api/builder/runs`
- [x] Run full test suite: `bun test server/db/ server/api/ server/orchestrator/` → 63+ pass, no new failures
- [x] Run typecheck: same 2 pre-existing errors, no new ones
- [x] Run build: clean (known large-chunk warning only)
- [x] `/workflows` loads in browser, shows at least one instance

---

## Exit Criteria

- `bun run check` → same 2 pre-existing errors
- `bun test server/db/ server/api/ server/orchestrator/` → 63+ pass
- `bun run build` → clean
- `GET /api/orchestrator/instances` → 200
- `GET /api/orchestrator/lanes` → 200 (with default `builder-passes` lane)
- `GET /api/orchestrator/signals` → 200
- `/workflows` route loads in browser
- DashHome shows orchestrator status strip
- Daemon-restart resume: kill + restart + verify run continues (not restarts)
- History table has step rows for each completed pass of the last run

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — use Node crypto, existing Bun APIs.
- **No API keys in code** — gateway client handles auth.
- Pre-existing TS errors in `doctor.ts`, `actionDescriptors.ts` — do NOT fix.
- Use `ensureTable` / `ensureColumn` for all schema changes.
- The existing `builder_runs` / `builder_passes` tables are the source of truth for pass execution — orchestrator tables track *step-level* coordination on top, not a replacement.
- The generator-based engine must be pure: no side effects inside the generator body, only `yield ctx.*()` calls. Side effects live in step handlers.
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`.
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.
- 2026-05-16 13:57 UTC monitoring note: free-model run `br_cec60be2-f942-46f2-8a6b-35238d98ba7b` failed in Phase 8 with `failureClass=codex-exhausted`. The crash-resume test exposed a reconciler gap: tmux session existence is not enough to prove the pass process is alive. `orchestrator_history` remained empty, so Phase 8 remains unchecked.


<!-- Builder run br_b9e70: failed at 2026-05-16T13:03:31.265Z — details: /opt/ai-vault/builder/2026-05-16-bw_2a564-br_b9e70.md -->

<!-- Builder run br_b7526: failed at 2026-05-16T13:17:01.507Z — details: /opt/ai-vault/builder/2026-05-16-bw_2a564-br_b7526.md -->

<!-- Builder run br_cec60: success at 2026-05-16T13:28:28.028Z — details: /opt/ai-vault/builder/2026-05-16-bw_7a8f9-br_cec60.md -->


<!-- Builder run br_e8568: success at 2026-05-16T14:23:45.342Z — details: /opt/ai-vault/builder/2026-05-16-bw_7a8f9-br_e8568.md -->