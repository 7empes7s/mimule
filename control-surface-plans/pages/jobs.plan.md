# /jobs — Product Plan
> One-line: the durable work queue and execution ledger for operators who need to monitor, cancel, retry, inspect, and audit every background action.

## 1. Today (verified, with file:line)
- Frontend route: `/jobs` renders `JobsPage` in dashboard layout at `app/App.tsx:136` and `app/App.tsx:137`; nav marks it core at `app/lib/navRegistry.ts:28`.
- Sidebar copy: sidebar labels it "Jobs" at `app/components/DashSidebar.tsx:70`.
- Data polling: `JobsPage` fetches authenticated `/api/jobs?limit=100&status=&kind=` every 20s at `app/routes/JobsPage.tsx:48` through `app/routes/JobsPage.tsx:56`.
- Current UI: it shows counts for loaded/running/success/failed at `app/routes/JobsPage.tsx:160` through `app/routes/JobsPage.tsx:165`, filters by status/kind at `app/routes/JobsPage.tsx:169` through `app/routes/JobsPage.tsx:180`, and renders recent jobs in a searchable/sortable table at `app/routes/JobsPage.tsx:182` through `app/routes/JobsPage.tsx:214`.
- Detail drawer: selecting a job shows status, kind, target, timestamps, duration, actor, exit code, reason, command, error, output, request, and evidence at `app/routes/JobsPage.tsx:87` through `app/routes/JobsPage.tsx:149`.
- Backend route: `/api/jobs` and `/api/jobs/:id` are authenticated at `server/api/router.ts:547` through `server/api/router.ts:555`.
- Backend handler: `jobsHandler` returns degraded when the dashboard DB is disabled, otherwise reads jobs with limit/status/kind filters at `server/api/jobs.ts:24` through `server/api/jobs.ts:35`; `jobHandler` reads one job or returns 404 at `server/api/jobs.ts:37` through `server/api/jobs.ts:50`.
- Storage exists: `jobs` table includes status/state, actor, reason, target, command, request/evidence JSON, output tail, error, exit code, cancel requested, retry linkage, and retry counters at `server/db/dashboard.ts:200` through `server/db/dashboard.ts:224`.
- Writer support exists: `createJob`, `updateJobOutput`, and `finishJob` write durable rows/output/final status at `server/db/writer.ts:345` through `server/db/writer.ts:457`; reads sort by start time and filter by status/kind at `server/db/writer.ts:756` through `server/db/writer.ts:799`.
- Current action coverage is limited: direct jobs API is read-only, with only GET list/detail mounted at `server/api/router.ts:547` through `server/api/router.ts:555`.
- Some producers are durable, but not all: NewsBites deploy creates a durable job and falls back to an in-memory map at `server/api/actions.ts:317` through `server/api/actions.ts:333`, while infra and doctor actions execute directly at `server/api/actions.ts:209` through `server/api/actions.ts:257` and `server/api/actions.ts:410` through `server/api/actions.ts:548`.
- Readiness: 🟡 partial. Durable schema and read UI exist, but there is no cancel/retry/re-run UI, no job queue health, no action integration for all mutating endpoints, and no lifecycle enforcement.

## 2. Gaps, mock & broken parts
- No cancel/retry endpoints: router only exposes GET `/api/jobs` and GET `/api/jobs/:id` at `server/api/router.ts:547` through `server/api/router.ts:555`.
- UI has no row actions beyond details at `app/routes/JobsPage.tsx:204` through `app/routes/JobsPage.tsx:206`.
- Schema has `cancel_requested_at`, `retry_of_job_id`, `max_retries`, and `retry_count` at `server/db/dashboard.ts:218` through `server/db/dashboard.ts:221`, but no handler uses them for cancel/retry.
- `createJob` defaults status to running at `server/db/writer.ts:355` through `server/db/writer.ts:383`, so queued/pending semantics are underused.
- Direct actions bypass jobs: doctor scan fetches the pipeline endpoint directly at `server/api/actions.ts:214` through `server/api/actions.ts:243`; service restarts and timer runs call system commands directly at `server/api/actions.ts:419` through `server/api/actions.ts:533`.
- Degraded state is visible only as a banner if DB is disabled at `app/routes/JobsPage.tsx:167`, but there is no operational guidance or link to Settings/Infra.
- No queue health insight: there is no detector for stuck/running-too-long jobs or high failure rate in the jobs table.

## 3. Goal alignment (G1–G8)
- G1: make jobs durable, restart-safe, and readable under DB disabled, stale jobs, and failed producers.
- G2: cancel, retry, re-run, view output, copy command, open source target, and inspect audit from GUI.
- G3: all mutating features across the app must create job rows where work is asynchronous or long-running.
- G4: detect stuck jobs, retry storms, failed job spikes, missing output, and DB-disabled state.
- G5: sort by status/severity/action needed, not just recent; give one obvious place for all background work.
- G6: safe retries can be one-click; high-risk re-runs need confirmation/reason and use executor.
- G7: job failures should include AI failure summary and recommended next action before raw output.
- G8: sellable as a background job control plane and suite-wide execution ledger.

## 4. Best-practice research
- Use a queue-console pattern: queued/running/failed/retrying/canceled/succeeded states, progress, worker/producer, duration, attempts, and owner.
- Use failure triage: failed jobs are grouped by kind/error class with AI summary, likely cause, and retry safety.
- Use resumability: jobs have idempotency keys, retry parent/child lineage, cancellation flag, and safe checkpoint/output tail.
- Use audit linkage: each job links to the action that created it and every status transition.
- Use output hygiene: live tail is bounded/redacted, downloadable when allowed, and source evidence is structured.
- Use queue health SLOs: oldest queued age, longest running duration, failure rate, retry exhaustion, and worker availability.

## 5. Target design
- Layout: top queue health band with running, queued, failed, stuck, retry exhausted, and average duration by kind.
- Primary views: Active, Failed, Recent, Scheduled, Retried, Canceled; default highlights failed/stuck/retryable.
- Table/card rows: status, kind, target, actor, started/duration, attempts, risk, source route, linked audit, and next action.
- Detail drawer: AI failure summary first; then command/request/evidence/output/error, retry lineage, audit rows, and source page.
- Actions: cancel running job, retry failed job, re-run with same/diff params, mark stale, copy command, open target page, open audit.
- Empty state: "No active jobs" with recent completed jobs and guidance on where jobs are created.
- Error/degraded state: DB disabled or unavailable explains that durable queue is offline and links to Infra/Settings.
- Mobile parity: detail drawer becomes full-screen sheet; table converts to cards with 44px action buttons.

## 6. Features to add (prioritized)
- MUST: Add cancel/retry endpoints and UI; acceptance: failed jobs can retry into a child job, running jobs can request cancel, and both actions audit.
- MUST: Convert long-running/direct actions to durable producers; acceptance: doctor scan, infra restart, timer run-now, deploy, backup, log rotate, and model-health actions create/finish jobs consistently.
- MUST: Add stuck-job detector; acceptance: jobs running past kind-specific thresholds create insights with AI RCA and Apply/Retry where safe.
- MUST: Add job-to-audit linking; acceptance: detail drawer shows creating action audit and later transition audits.
- SHOULD: Add live output polling/SSE; acceptance: active job output updates without full page refresh.
- SHOULD: Add retry policy editor per kind; acceptance: max retries/backoff/risk tier are visible and persisted.
- SHOULD: Add job kind dashboards; acceptance: deploy/doctor/infra/model-health show failure rate and duration trends from `metric_samples`.
- EXTRA: Delight: a "why waiting" explanation that names the blocked resource, worker, approval, or dependency.

## 7. Sellable-in-parts
- Standalone module pitch: "Durable Job Control Plane: run, cancel, retry, audit, and AI-diagnose background work across admin actions."
- Suite fit: Jobs is the execution ledger behind Infra, Doctor, NewsBites deploy, Models, Gateway, Insights Apply, Reports export, and future automations.
- Packaging boundary: standalone can expose a job API and SDK; in-suite it reuses SQLite, action descriptors, executor, insights, and audit chain.

## 8. Backend work
- Add `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry`, and optionally `POST /api/jobs/:id/rerun` through `server/api/router.ts`, guarded by `requireMutation`.
- Add writer helpers: `requestJobCancel`, `retryJob`, `markJobQueued`, `appendJobOutput`, and transition audit helpers in `server/db/writer.ts`.
- Add producer contract: every async action accepts `jobId`, reports output, honors `cancel_requested_at`, and finishes with status/exit code/error.
- Convert direct handlers in `server/api/actions.ts` and executor paths in `server/api/execute.ts` to create durable jobs for long-running/system actions.
- Add `server/insights/scanners/jobs.ts` or aggregate jobs in existing scanner for stuck jobs, failure spikes, retry exhaustion, and DB-disabled state.
- Use existing `jobs`, `action_audit`, `events`, and `metric_samples`; avoid new schema unless worker leases/schedules require a small `job_workers` table.
- Add AI analysis by creating job failure insights and reusing `server/insights/ai.ts`; do not create a separate job reasoner.

## 9. Build slices
- Slice 1: Add cancel/retry writer helpers and API endpoints in `server/db/writer.ts`, `server/api/jobs.ts`, and `server/api/router.ts`, with tests.
- Slice 2: Add JobsPage row actions and detail audit links in `app/routes/JobsPage.tsx`; smoke active/failed/empty states.
- Slice 3: Convert doctor scan and infra timer/restart to durable job wrappers in `server/api/actions.ts`; validate backwards-compatible responses.
- Slice 4: Add jobs scanner and insights integration in `server/insights/scanners/jobs.ts` plus scheduler registration.
- Slice 5: Add live output updates and mobile card layout in `JobsPage`.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, job producer contract docs, action/executor docs, and operator runbook for cancel/retry semantics.

## 10. Verification
- Current behavior citations are rechecked against `app/routes/JobsPage.tsx`, `server/api/jobs.ts`, `server/db/writer.ts`, and `server/db/dashboard.ts`.
- G1/G3: restart during a running job preserves state and final status updates correctly.
- G2/G6: cancel/retry/re-run are GUI actions with risk gating and audit.
- G4/G7: stuck/failed job detector emits insights with AI RCA before output tail.
- G5: failed/stuck jobs are findable first, with filters and deep links from source pages.
- G8: Jobs works as the suite execution ledger and standalone job control module; desktop/mobile screenshots verify no table-only dead ends.
