# /workflows — Product Plan
> One-line: the workflow-orchestration monitor for operators who need to inspect, signal, unblock, and govern long-running agent workflows.

## 1. Today (verified, with file:line)
- Frontend component: `/workflows` is routed to `WorkflowsPage` in `app/App.tsx:166`, marked `advanced` and `experimental` in `app/lib/navRegistry.ts:37`, and implemented in `app/routes/WorkflowsPage.tsx:294`; readiness is 🟡 partial / 🧪 experimental.
- Data source: the page polls `/api/orchestrator/instances` every 15 seconds in `app/routes/WorkflowsPage.tsx:295`.
- Current UI: the page expands an instance by fetching `/api/orchestrator/instances/:id` in `app/routes/WorkflowsPage.tsx:312`; it shows history rows with kind, status, duration, and payload in `app/routes/WorkflowsPage.tsx:235`.
- Current UI: operators can emit a signal through a modal that posts raw JSON to `/api/orchestrator/signals` in `app/routes/WorkflowsPage.tsx:93` and `app/routes/WorkflowsPage.tsx:99`.
- Current UI: signal history is fetched from `/api/orchestrator/signals?instanceId=...` in `app/routes/WorkflowsPage.tsx:278`.
- Backend routes: router requires token/mutation checks for orchestrator signals, lanes, instances, and detail in `server/api/router.ts:1189`, `server/api/router.ts:1193`, `server/api/router.ts:1198`, `server/api/router.ts:1202`, and `server/api/router.ts:1206`.
- Backend handlers: signal listing reads `orchestrator_signals` with tenant filtering in `server/api/orchestrator.ts:16`, `server/api/orchestrator.ts:27`, and `server/api/orchestrator.ts:39`; signal emit validates `instanceId` and `signalName` then calls `emitSignal` in `server/api/orchestrator.ts:81`, `server/api/orchestrator.ts:90`, and `server/api/orchestrator.ts:100`.
- Backend persistence: tables exist for orchestrator instances, history, signals, and lanes in `server/db/dashboard.ts:814`, `server/db/dashboard.ts:828`, `server/db/dashboard.ts:841`, and `server/db/dashboard.ts:851`.
- Backend adapter: instance listing orders by created time in `server/orchestrator/adapter.ts:140`, and detail loads ordered history in `server/orchestrator/adapter.ts:175` and `server/orchestrator/adapter.ts:193`.

## 2. Gaps, mock & broken parts
- The page has no error state for the top-level `/api/orchestrator/instances` request; it destructures only `data`, `loading`, and `refresh` in `app/routes/WorkflowsPage.tsx:295`.
- The signal modal requires hand-written JSON payload in `app/routes/WorkflowsPage.tsx:89` and `app/routes/WorkflowsPage.tsx:139`; that is powerful but unsafe for routine admin use.
- The API emits signals but does not write central `action_audit` in `server/api/orchestrator.ts:81` through `server/api/orchestrator.ts:101`.
- Instance listing does not tenant-filter in `listOrchestratorInstances`; it selects all rows ordered by created time in `server/orchestrator/adapter.ts:144`.
- The UI has a fixed desktop grid with eight columns in `app/routes/WorkflowsPage.tsx:186` and `app/routes/WorkflowsPage.tsx:352`; it lacks a verified mobile card path.
- Lanes are available via `/api/orchestrator/lanes` in `server/api/router.ts:1198`, but the page does not load or render lane capacity.

## 3. Goal alignment (G1–G8)
- G1: show load errors, stale data, and empty states clearly.
- G2: unblock workflows through named GUI actions, not raw JSON.
- G3: make lanes, signals, history, and builder linkage complete.
- G4: blocked/failed/long-running workflows should create insights.
- G5: surface blocked and failed instances first with recommended action.
- G6: safe signals can be one-click; risky signals require confirmation/approval.
- G7: show AI explanation of why a workflow is blocked before raw history.
- G8: make this a sellable workflow operations module for agent orchestration.

## 4. Best-practice research
- Adopt workflow engine patterns: instance timeline, state machine, waiting signal, retry/skip/cancel, parent/child tree, and SLA.
- Adopt queue/lane management: concurrency, saturation, backpressure, blocked instances, and lane policy.
- Adopt incident UX: failed/blocked instances should group by cause and show a recommended remediation.
- Adopt safe manual intervention: signal templates, typed payload schemas, dry-run, confirmation, and audit.
- Adopt observability correlation: connect workflow instance to builder run, project, audit rows, logs, and insights.

## 5. Target design
- Header: active, blocked, failed, completed, lane saturation, oldest waiting signal, and workflow health.
- Main view: "Needs attention" first; then active instances; then history/search.
- Instance detail: state timeline, current wait, parent/child tree, signals, related builder run/workflow, logs, audit, and AI summary.
- Signal UX: replace raw JSON first path with templates like Approve, Continue, Retry, Cancel, Escalate; advanced JSON behind disclosure.
- Lane panel: max concurrency, active count, queue pressure, and one-click safe adjustments with audit.
- Mobile: instance cards with expand/collapse; timeline and action bar remain reachable.

## 6. Features to add (prioritized)
- MUST: Top-level error/degraded state; acceptance: API failure shows retry and no blank page.
- MUST: Tenant-filter instance listing; acceptance: only current tenant instances render.
- MUST: Audit signal emission; acceptance: every signal creates an `action_audit` row with payload redacted where needed.
- MUST: Signal templates; acceptance: common signals can be sent without raw JSON.
- MUST: Blocked workflow insights; acceptance: blocked/failed/timeout instances appear in `/insights`.
- SHOULD: Lane capacity panel; acceptance: lanes render active/max and saturation status.
- SHOULD: Parent/child visualization; acceptance: child workflows can be traced to parent.
- EXTRA: Workflow replay/simulation view.
- EXTRA: AI "why blocked" summary generated from history and signals.

## 7. Sellable-in-parts
- Standalone pitch: "Operate long-running AI workflows with signal controls, timelines, lane capacity, and audit."
- Buyer: teams using agents for multi-step automation where humans must approve or unblock work.
- Packaging: Workflow Monitor, Signal Console, Lane/Capacity Manager, Blocked Workflow Insights.
- Suite fit: builder runs create workflow instances; failures feed `/insights`; operators audit interventions in `/audit`.

## 8. Backend work
- Change `listOrchestratorInstances(limit)` to filter by current tenant.
- Change `POST /api/orchestrator/signals` to write `action_audit` and validate signal templates.
- Add `GET /api/orchestrator/templates?definition=...` for available signals and payload schema.
- Add `POST /api/orchestrator/instances/:id/cancel|retry|skip` through executor/action descriptors.
- Add `GET /api/orchestrator/instances/:id/correlations` for builder run, workflow, insights, audit.
- Add scanner for blocked instance age, failed instance spike, lane saturation, undelivered signal age.
- Reuse `orchestrator_*`, `builder_runs`, `action_audit`, `insights`, `metric_samples`.

## 9. Build slices
- Slice 1: Add error state and mobile cards in `app/routes/WorkflowsPage.tsx`.
- Slice 2: Tenant-filter instance list and add API tests.
- Slice 3: Add audited signal templates and preserve advanced JSON mode.
- Slice 4: Add lane panel and capacity status.
- Slice 5: Add workflow insight scanner and deep-links.
- Docs to update when implemented: workflow operator guide, signal template docs, API docs, detector catalog, action catalog.

## 10. Verification
- `/workflows` renders loading, error, empty, active, failed, and blocked states.
- Signal template sends a signal, writes audit, and appears in signal log.
- Raw JSON mode is gated behind advanced disclosure and validates JSON.
- Tenant A cannot see tenant B instances.
- Blocked instance creates an insight with link to `/workflows`.
- Desktop and mobile can inspect history and send common signals.
