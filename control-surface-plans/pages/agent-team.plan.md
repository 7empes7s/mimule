# /agent-team — Product Plan
> One-line: the autonomous improvement-team console for operators who queue, monitor, audit, and govern multi-agent work across projects.

## 1. Today (verified, with file:line)
- Frontend component: `/agent-team` is routed to `AgentTeamPage` in `app/App.tsx:139`, marked `core` in `app/lib/navRegistry.ts:22`, and implemented in `app/routes/AgentTeamPage.tsx:32`; readiness is 🟡 partial because it is functional but file-backed and not integrated with central audit/insights enough.
- Data source: the page polls `/api/agent-team` every 30 seconds in `app/routes/AgentTeamPage.tsx:33`.
- Current UI: top action runs an orchestrator pass through `/api/agent-team/action` in `app/routes/AgentTeamPage.tsx:108`; project scan/register/improve/remove and custom improvement actions are exposed in `app/routes/AgentTeamPage.tsx:165`, `app/routes/AgentTeamPage.tsx:177`, `app/routes/AgentTeamPage.tsx:222`, `app/routes/AgentTeamPage.tsx:224`, and `app/routes/AgentTeamPage.tsx:269`.
- Current UI: it shows job queues with transcript drill-down and cancel/requeue actions in `app/routes/AgentTeamPage.tsx:280`, `app/routes/AgentTeamPage.tsx:301`, `app/routes/AgentTeamPage.tsx:315`, and `app/routes/AgentTeamPage.tsx:318`.
- Current UI: it shows provider cooldowns with a clear action in `app/routes/AgentTeamPage.tsx:335` and `app/routes/AgentTeamPage.tsx:358`, model chains in `app/routes/AgentTeamPage.tsx:375`, model discovery summary in `app/routes/AgentTeamPage.tsx:403`, latest orchestrator report in `app/routes/AgentTeamPage.tsx:428`, and recent activity in `app/routes/AgentTeamPage.tsx:446`.
- Current UI: the page includes a mobile stacked-card alternative for registered projects in `app/routes/AgentTeamPage.tsx:232`.
- Backend data sources: job queues, guardrails, cooldowns, model inventory, roster, advisor reports, activity log, work dir, and projects file are read from `/var/lib/mimule`, `/opt/ai-vault/advisor`, and `/var/log/mimule-agents.log` constants in `server/api/agent-team.ts:6`.
- Backend handler: `agentTeamHandler` reads jobs, cooldowns, models, roles, projects, latest report, recent activity, and self-correction into one payload in `server/api/agent-team.ts:124`, `server/api/agent-team.ts:129`, `server/api/agent-team.ts:144`, `server/api/agent-team.ts:155`, `server/api/agent-team.ts:166`, `server/api/agent-team.ts:174`, `server/api/agent-team.ts:196`, and `server/api/agent-team.ts:208`.
- Backend actions: `agentTeamActionHandler` is mutation-gated in `server/api/agent-team.ts:304`; actions include run-orchestrator, register-project, scan-projects, unregister-project, enqueue-team, clear-cooldown, improve-project, requeue, and cancel in `server/api/agent-team.ts:324`, `server/api/agent-team.ts:333`, `server/api/agent-team.ts:341`, `server/api/agent-team.ts:372`, `server/api/agent-team.ts:380`, `server/api/agent-team.ts:391`, `server/api/agent-team.ts:401`, `server/api/agent-team.ts:409`, and `server/api/agent-team.ts:415`.

## 2. Gaps, mock & broken parts
- The handler claims governed/audited actions in its comment in `server/api/agent-team.ts:284`, but `auditAction` appends to `/var/log/mimule-agents.log` in `server/api/agent-team.ts:285`; it does not write central `action_audit`.
- `run-orchestrator` starts `mimule-orchestrator.service` directly with `systemctl` in `server/api/agent-team.ts:326`; this bypasses the shared executor/action descriptor path.
- Project registration/unregistration shell out to `/usr/local/bin/mimule-project` in `server/api/agent-team.ts:336` and `server/api/agent-team.ts:375`; this is operationally useful but not portable for standalone product packaging.
- Jobs are manipulated by moving JSON files between queue/rejected/failed directories in `server/api/agent-team.ts:289`; there is no durable jobs table, owner, SLA, or audit trail.
- Failures use browser `alert()` in `app/routes/AgentTeamPage.tsx:64` and `app/routes/AgentTeamPage.tsx:67`; sellable admin UX needs inline errors and audit links.
- The page has no integration from job failure/rollback into `/insights`, although self-correction is surfaced from audit files in `server/api/agent-team.ts:81`.

## 3. Goal alignment (G1–G8)
- G1: file-backed data should degrade gracefully and clearly, with missing-file states separated from healthy-empty states.
- G2: routine team operations must remain GUI-first, but routed through shared executor and central audit.
- G3: replace file-only job state with durable job records or a synchronized store.
- G4: team job failures, repeated rollbacks, provider cooldown pileups, and stale project improvements must create insights.
- G5: prioritize "needs action" jobs, failed jobs, rejected jobs, stale cooldowns, and latest orchestrator recommendations.
- G6: safe actions like requeue, clear stale cooldown, scan projects, and register discovered project should be one-click Apply.
- G7: orchestrator report findings should be summarized by AI before raw markdown/logs.
- G8: position this as an AI Team Operations module for continuous improvement across repos.

## 4. Best-practice research
- Adopt queue operations patterns: visible states, SLA timers, owner, retry count, backoff, cancel reason, and failure cause.
- Adopt automation-control patterns: every job is traceable to trigger, actor, policy, inputs, outputs, and changes.
- Adopt agent-team supervision: roles, model chains, cooldowns, and guardrails should be controllable with previews and audit.
- Adopt continuous-improvement product loops: project health, last improvement, queued goals, shipped changes, rollbacks, and next recommendation.
- Adopt incident learning: repeated rejected jobs should cluster into findings with a suggested fix.

## 5. Target design
- Header: team health, active queue, rejected/failed count, provider cooldown count, last orchestrator pass, and self-correction rate.
- Main layout: attention queue first; then projects; then job lanes; then model/cooldown/roster; then reports/activity.
- Project cards: capability, health, last improve, open jobs, recommended next improvement, and actions.
- Job detail: goal, timeline, agents, model chain, inputs, transcript, audit result, files touched, rollback/shipped outcome, and related insight.
- Orchestrator report: AI summary, top recommendations, Apply buttons, raw markdown tucked below.
- Actions: run orchestrator, enqueue improvement, cancel/requeue, clear cooldown, register/unregister project, all via executor and central audit.
- Mobile: project/job cards with action bars; no table-only controls.

## 6. Features to add (prioritized)
- MUST: Central action audit/executor integration; acceptance: every action writes `action_audit` and appears in `/audit`.
- MUST: Durable job mirror; acceptance: queue/running/done/failed/rejected jobs are queryable from SQLite with original file path evidence.
- MUST: Team insights; acceptance: repeated failures, rejected jobs, stale cooldowns, and stale projects create AI-reasoned insights.
- MUST: Inline action errors; acceptance: no `alert()` path for routine errors.
- MUST: Orchestrator report summary; acceptance: report shows AI summary, severity, recommendation, raw details.
- SHOULD: Guardrail editor; acceptance: operator can view and safely change team guardrails without editing JSON.
- SHOULD: Project improvement cadence; acceptance: stale projects and next improvement suggestions are visible.
- EXTRA: "Replay job" mode showing pass-by-pass transcript and diff.
- EXTRA: Team performance leaderboard by role/model/quality.

## 7. Sellable-in-parts
- Standalone pitch: "Run an AI improvement team across your repositories with queue control, guardrails, audits, and self-correction."
- Buyer: teams experimenting with autonomous maintenance, refactoring, QA, and continuous product improvement.
- Packaging: Team Queue, Project Improvement Registry, Agent Roster/Cooldowns, Self-Correction Evidence, Orchestrator Reports.
- Suite fit: project registry comes from `/projects`; changes can launch `/builder`; agent identities live in `/agents`; job failures feed `/insights`.

## 8. Backend work
- Add action descriptors/executor mapping for run-orchestrator, scan-projects, register-project, unregister-project, enqueue-team, improve-project, cancel, requeue, clear-cooldown.
- Add `GET /api/agent-team/jobs` and `GET /api/agent-team/jobs/:id` backed by SQLite mirror plus file evidence.
- Add `POST /api/agent-team/jobs/:id/requeue|cancel` routed through executor.
- Add `POST /api/agent-team/projects/:id/improve` and `POST /api/agent-team/projects/scan`.
- Add scanner: rejected-job spike, cooldown stale, project stale, orchestrator report high-priority recommendation.
- Prefer existing `jobs`, `action_audit`, `insights`, and `metric_samples`; keep legacy files as ingestion sources until migrated.

## 9. Build slices
- Slice 1: Wrap current actions in action descriptors and central audit while preserving behavior.
- Slice 2: Add job mirror ingestion from `/var/lib/mimule/jobs` to SQLite and update the API.
- Slice 3: Replace alerts with inline errors and action result toasts.
- Slice 4: Add team insight scanner and deep-links to job/project detail.
- Slice 5: Add guardrail editor and orchestrator-report summary.
- Docs to update when implemented: AI team operator runbook, action catalog, detector catalog, migration notes from file queues, and product docs.

## 10. Verification
- Every action creates an audit row and is visible on `/audit`.
- Queue counts match file-backed state and SQLite mirror.
- Failed/rejected jobs create actionable insights with deep-links.
- Requeue/cancel/clear-cooldown work from desktop and mobile.
- Orchestrator pass can be triggered only through mutation permission and shows result state.
- Missing job directories produce explicit degraded state rather than empty-success.
