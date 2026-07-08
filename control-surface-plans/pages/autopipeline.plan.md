# /autopipeline — Product Plan
> One-line: the editorial pipeline command center for monitoring queue health, approvals, story stages, and safe pipeline interventions.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `/autopipeline` is registered in the app router and marked `core` in nav (`app/App.tsx:5`, `app/App.tsx:116`, `app/App.tsx:117`, `app/lib/navRegistry.ts:22`). Readiness: ✅ functional but 🟡 not zero-config.
- The page polls `/api/autopipeline` every 10s and uses loading/error/null guards (`app/routes/AutopipelinePage.tsx:47`, `app/routes/AutopipelinePage.tsx:48`, `app/routes/AutopipelinePage.tsx:56`, `app/routes/AutopipelinePage.tsx:57`, `app/routes/AutopipelinePage.tsx:58`).
- Header metrics show queue depth, approvals waiting, and paused/running state with pause reason (`app/routes/AutopipelinePage.tsx:73`, `app/routes/AutopipelinePage.tsx:75`, `app/routes/AutopipelinePage.tsx:79`, `app/routes/AutopipelinePage.tsx:83`, `app/routes/AutopipelinePage.tsx:84`).
- The page can pause/resume, inject topic, rush, kill, and publish by opening a `ConfirmModal` and sending bodies to `/api/autopipeline/command` (`app/routes/AutopipelinePage.tsx:53`, `app/routes/AutopipelinePage.tsx:88`, `app/routes/AutopipelinePage.tsx:94`, `app/routes/AutopipelinePage.tsx:102`, `app/routes/AutopipelinePage.tsx:136`, `app/routes/AutopipelinePage.tsx:138`, `app/routes/AutopipelinePage.tsx:139`, `app/routes/AutopipelinePage.tsx:140`, `app/routes/AutopipelinePage.tsx:141`).
- Queue rows show dossier inspect, publish-approval action, rush, kill, priority, elapsed age, running flag, and approval flag (`app/routes/AutopipelinePage.tsx:173`, `app/routes/AutopipelinePage.tsx:184`, `app/routes/AutopipelinePage.tsx:187`, `app/routes/AutopipelinePage.tsx:191`, `app/routes/AutopipelinePage.tsx:194`, `app/routes/AutopipelinePage.tsx:197`, `app/routes/AutopipelinePage.tsx:199`, `app/routes/AutopipelinePage.tsx:200`, `app/routes/AutopipelinePage.tsx:202`, `app/routes/AutopipelinePage.tsx:203`).
- The page has an approvals section, stage breakdown chart, and stage-duration table (`app/routes/AutopipelinePage.tsx:220`, `app/routes/AutopipelinePage.tsx:222`, `app/routes/AutopipelinePage.tsx:247`, `app/routes/AutopipelinePage.tsx:252`, `app/routes/AutopipelinePage.tsx:288`, `app/routes/AutopipelinePage.tsx:291`).
- The API handler reads live pipeline state through `getPipelineState()`, computes stage breakdown, approval count, oldest approval age, queue elapsed time, and dossier metadata (`server/api/autopipeline.ts:45`, `server/api/autopipeline.ts:46`, `server/api/autopipeline.ts:49`, `server/api/autopipeline.ts:53`, `server/api/autopipeline.ts:55`, `server/api/autopipeline.ts:57`, `server/api/autopipeline.ts:60`, `server/api/autopipeline.ts:93`, `server/api/autopipeline.ts:99`, `server/api/autopipeline.ts:104`).
- The pipeline adapter tries `http://127.0.0.1:3200/queue` first and falls back to `/var/lib/mimule/pipeline-state.json`; if both fail, it returns an empty non-paused state (`server/adapters/pipeline.ts:3`, `server/adapters/pipeline.ts:4`, `server/adapters/pipeline.ts:24`, `server/adapters/pipeline.ts:29`, `server/adapters/pipeline.ts:42`, `server/adapters/pipeline.ts:44`, `server/adapters/pipeline.ts:46`).
- Dossier lookup and stage-duration sampling are hardcoded to `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers`; duration estimates divide dossier-to-publish time into a rough three-stage split (`server/api/autopipeline.ts:6`, `server/api/autopipeline.ts:12`, `server/api/autopipeline.ts:19`, `server/api/autopipeline.ts:20`, `server/api/autopipeline.ts:23`, `server/api/autopipeline.ts:69`, `server/api/autopipeline.ts:74`, `server/api/autopipeline.ts:76`).
- The command endpoint is mutation-gated in the router and proxied to the external autopipeline command API; the action handler writes an `autopipeline.command` audit row with risk `high` (`server/api/router.ts:1008`, `server/api/router.ts:1009`, `server/api/router.ts:1011`, `server/api/actions.ts:85`, `server/api/actions.ts:86`, `server/api/actions.ts:92`, `server/api/actions.ts:99`, `server/api/actions.ts:103`).
- The sampler already emits pipeline queue-health events when queue/approval conditions change, including approvals waiting, pause state, current story, and stage breakdown (`server/db/sampler.ts:206`, `server/db/sampler.ts:1744`, `server/db/sampler.ts:1749`, `server/db/sampler.ts:1750`, `server/db/sampler.ts:1754`, `server/db/sampler.ts:1758`, `server/db/sampler.ts:1761`, `server/db/sampler.ts:1764`, `server/db/sampler.ts:1770`, `server/db/sampler.ts:1774`).

## 2. Gaps, mock & broken parts
- Zero-config gap: the page assumes MIMULE autopipeline at `127.0.0.1:3200`, a MIMULE state file, and a MIMULE dossier root instead of discovering whether any editorial pipeline exists (`server/adapters/pipeline.ts:3`, `server/adapters/pipeline.ts:4`, `server/api/autopipeline.ts:6`, `server/api/actions.ts:13`).
- Fresh-environment failure mode is misleading: if no pipeline is present, the adapter returns empty queue/current/paused false, so the UI can look “running/empty” rather than “pipeline not discovered” (`server/adapters/pipeline.ts:42`, `server/adapters/pipeline.ts:46`, `app/routes/AutopipelinePage.tsx:83`, `app/routes/AutopipelinePage.tsx:174`, `app/routes/AutopipelinePage.tsx:175`).
- Stage duration data is approximate and not tied to real per-stage timestamps; the handler explicitly splits total DOSSIER-to-publish time evenly across three stages (`server/api/autopipeline.ts:19`, `server/api/autopipeline.ts:20`, `server/api/autopipeline.ts:21`, `server/api/autopipeline.ts:23`, `server/api/autopipeline.ts:24`).
- Inject topic hardcodes vertical `"ai"` in the UI, so the operator cannot choose vertical/candidate metadata from the command modal (`app/routes/AutopipelinePage.tsx:120`, `app/routes/AutopipelinePage.tsx:121`, `app/routes/AutopipelinePage.tsx:138`).
- All command types are audited as one high-risk `autopipeline.command`, so the audit/executor layer cannot distinguish pause vs publish vs kill for risk, rollback, or approvals (`server/api/actions.ts:99`, `server/api/actions.ts:100`, `server/api/actions.ts:101`, `server/api/actions.ts:103`, `app/routes/AutopipelinePage.tsx:136`, `app/routes/AutopipelinePage.tsx:141`).
- The page does not show AI reasoning before queue interventions even though queue-health events and the insights AI enrichment path exist (`server/db/sampler.ts:1750`, `server/db/sampler.ts:1770`, `server/insights/scheduler.ts:69`, `server/insights/scheduler.ts:71`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).
- Queue actions are table-only and compact; on narrow/touch layouts the multiple small buttons in a table cell risk poor mobile parity (`app/routes/AutopipelinePage.tsx:177`, `app/routes/AutopipelinePage.tsx:186`, `app/routes/AutopipelinePage.tsx:187`, `app/routes/AutopipelinePage.tsx:191`, `app/routes/AutopipelinePage.tsx:194`, `app/routes/AutopipelinePage.tsx:197`).
- There is no discovered `unregistered-ai-system`/model-backend context for the pipeline’s agent/model dependencies on this page; it only shows queue state (`app/routes/AutopipelinePage.tsx:73`, `server/adapters/pipeline.ts:29`, `server/insights/scanners/registry.ts:114`, `server/insights/scanners/registry.ts:146`).

## 3. Goal alignment (G1–G8)
- G1/G3: distinguish healthy empty queue from missing/unregistered pipeline.
- G2/G6: make each pipeline action a typed executor action with risk tier, confirmation, audit, and rollback/undo where possible.
- G4/G9: discover editorial pipeline APIs, process units, queue files, dossier roots, CLI agents, model backends, and secrets instead of assuming MIMULE.
- G5/G7: show AI-reasoned queue-health findings before raw queue rows.
- G8: make this a sellable “Editorial Workflow Orchestrator” module.

## 4. Best-practice research
- Research basis: NIST AI RMF’s Govern/Map/Measure/Manage lifecycle supports discovered AI/pipeline inventory; Google SRE golden signals support queue/API health; Microsoft HAX supports clear AI uncertainty and correction flows; OWASP LLM Top 10 supports controls for agent tools, model endpoints, excessive agency, and supply-chain exposure (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use incident-command-center layout: status banner, blockers/approvals, current work, then full queue.
- Use workflow-state-machine controls: every action is contextual, typed, reversible where possible, and shown with stage implications.
- Use SRE runbook cards: for “paused with queue”, “approval backlog”, and “stage concentration”, show cause, impact, and Apply.
- Use audit-first action UX: one action path regardless of whether action originates from queue row, insight card, or command palette.

## 5. Target design
- Top: discovered pipeline identity, registration status, API reachability, last state update, queue health, and open insights.
- Main: “Needs attention” queue of approval backlog/stuck stage/paused-with-queue findings with AI root cause and recommended action; then current story; then queue.
- Empty/fresh state: if no pipeline API/process/state file is discovered, show “No editorial pipeline discovered” with scan/register/connect; do not show “running”.
- Discovery: detect `:3200`-like APIs by `/queue` and `/command` shape, systemd units, process command lines, dossier roots, run roots, queue state files, and agent CLI/model dependencies.
- G6: safe actions like re-scan state are auto; pause/resume/rush/kill/publish are review-tier Apply; publish can require approvals.

## 6. Features to add (prioritized)
- MUST: Pipeline discovery + Register. Acceptance: fresh host shows connect state; discovered pipeline can be registered and its roots/API saved.
- MUST: Typed actions. Acceptance: `pause`, `resume`, `add`, `rush`, `kill`, `publish` have distinct action ids, risk tiers, audit rows, and rollback hints.
- MUST: Queue-health insight strip. Acceptance: page surfaces `pipeline.queue_health`, `queue.approval_backlog`, and stuck-stage findings with AI reasoning.
- MUST: Rich inject modal. Acceptance: topic, vertical, priority, source, target stage, and reason are configurable.
- SHOULD: Replace rough duration estimate with real event/stage timestamps from pipeline state/runs where available.
- SHOULD: Mobile queue cards for row actions.
- EXTRA: “Explain this queue” AI summary with likely bottleneck and safest next action.

## 7. Sellable-in-parts
- Standalone pitch: “Editorial pipeline operations with audited one-click interventions and AI bottleneck diagnosis.”
- Suite fit: publishes signals into Admin Health, Insights, Jobs, Audit, NewsBites, Scout, Dossier, and Today.

## 8. Backend work
- Add discovery/register endpoints for editorial pipelines under Capability X.
- Store registered pipeline API URL, state file, dossier root, run root, and command capabilities.
- Add typed executor descriptors for pipeline actions; keep `/api/autopipeline/command` as compatibility wrapper.
- Promote queue-health sampler events to first-class insights with manualPageHref `/autopipeline`.
- Add tests for missing pipeline, discovered-but-unregistered pipeline, and registered pipeline.

## 9. Build slices
- Slice 1: discovery-aware read model and absent/connect state in `server/adapters/pipeline.ts`, `server/api/autopipeline.ts`, `AutopipelinePage.tsx`.
- Slice 2: typed action descriptors and UI mapping; validate audit rows per action.
- Slice 3: insights strip/deep-link integration.
- Slice 4: real stage timing from pipeline artifacts.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md` Capability X/Phase 12 status, this plan, `README.md` editorial operations docs, and `/root/CLAUDE.md` only if the autopipeline API contract changes.

## 10. Verification
- No pipeline installed: page loads, says not discovered, no risky controls enabled.
- Registered pipeline: queue/current/approvals render from actual API or state file.
- Each command writes distinct audit evidence.
- Approval backlog and paused-with-queue show AI reasoning and link to `/insights`.
- Mobile queue actions are usable with >=44px targets.
