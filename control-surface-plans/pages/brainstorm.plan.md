# /brainstorm — Product Plan
> One-line: the AI product-planning studio for operators who shape ideas, research context, and implementation plans before handing work to Builder.

## 1. Today (verified, with file:line)
- Frontend component: `/brainstorm` is routed to `BrainstormPage` in `app/App.tsx:154`, marked `core` in `app/lib/navRegistry.ts:31`, and implemented in `app/routes/BrainstormPage.tsx:33`; readiness is 🟡 partial.
- Data source: the page fetches sessions from `/api/brainstorm/sessions` in `app/routes/BrainstormPage.tsx:40` and selected session detail from `/api/brainstorm/session/:id` in `app/routes/BrainstormPage.tsx:51`.
- Current UI: running sessions open SSE `/api/brainstorm/stream?sessionId=...` in `app/routes/BrainstormPage.tsx:63` and update pass state on events in `app/routes/BrainstormPage.tsx:68`.
- Current UI: session start posts to `/api/brainstorm/session/:id/start` in `app/routes/BrainstormPage.tsx:93`; completed sessions can create Builder workflows via `/api/brainstorm/session/:id/workflow` in `app/routes/BrainstormPage.tsx:108`.
- Current UI: left column has new intake and recent sessions in `app/routes/BrainstormPage.tsx:136` and `app/routes/BrainstormPage.tsx:142`; selected session shows pass config/timeline, plan detail, feedback injection, and create-workflow action in `app/routes/BrainstormPage.tsx:194`, `app/routes/BrainstormPage.tsx:201`, `app/routes/BrainstormPage.tsx:205`, and `app/routes/BrainstormPage.tsx:212`.
- Intake: form supports quick templates, AI pre-planning chat, existing project selection, new/existing mode, description/specs, and session creation in `app/components/brainstorm/IntakeForm.tsx:97`, `app/components/brainstorm/IntakeForm.tsx:101`, `app/components/brainstorm/IntakeForm.tsx:135`, `app/components/brainstorm/IntakeForm.tsx:140`, and `app/components/brainstorm/IntakeForm.tsx:55`.
- Preflight: project discovery scans `/opt`, `/home/agent`, and `/root` for git repos in `server/api/brainstorm-preflight.ts:59`; pre-planning chat calls LiteLLM with logical model `editorial-cloud-heavy` in `server/api/brainstorm-preflight.ts:138` and `server/api/brainstorm-preflight.ts:149`.
- Backend persistence: `brainstorm_sessions` and `brainstorm_pass_logs` tables exist in `server/db/dashboard.ts:436` and `server/db/dashboard.ts:461`, with extra codebase/research fields added in `server/db/dashboard.ts:478`.
- Backend handlers: create/config/start/message/session/detail/list/workflow endpoints are implemented in `server/api/brainstorm-actions.ts:10`, `server/api/brainstorm-actions.ts:49`, `server/api/brainstorm-actions.ts:83`, `server/api/brainstorm-actions.ts:115`, `server/api/brainstorm-actions.ts:141`, `server/api/brainstorm-actions.ts:161`, `server/api/brainstorm-actions.ts:207`, and `server/api/brainstorm-actions.ts:222`.

## 2. Gaps, mock & broken parts
- Brainstorm mutations use `checkToken` only in `server/api/brainstorm-actions.ts:10`, `server/api/brainstorm-actions.ts:49`, `server/api/brainstorm-actions.ts:83`, `server/api/brainstorm-actions.ts:115`, and `server/api/brainstorm-actions.ts:222`; they do not use `requireMutation` or central audit.
- Session start updates status then launches `runBrainstormLoop` in the background in `server/api/brainstorm-actions.ts:107` and `server/api/brainstorm-actions.ts:110`; no durable job record or action audit is created.
- Pass recommendation is currently a local length heuristic in `app/components/brainstorm/PassConfigPanel.tsx:4`; it is useful, but not AI-reasoned or grounded in project complexity.
- Pre-planning chat has weak error UX: failed chat appends a generic assistant error in `app/components/brainstorm/PrePlanningChat.tsx:57`, and finalize failure only stops loading in `app/components/brainstorm/PrePlanningChat.tsx:81`.
- Preflight project discovery uses a process-level in-memory cache in `server/api/brainstorm-preflight.ts:31`; this is fast but not inspectable or shared with `/projects`.
- Create Builder Workflow navigates to `/builder` without passing `workflowId` focus in `app/routes/BrainstormPage.tsx:114`.

## 3. Goal alignment (G1–G8)
- G1: planning sessions must recover from LLM/API failures with visible retry and resume.
- G2: idea intake, research, pass count, feedback injection, cancellation, and conversion must all be GUI controlled.
- G3: every stage must persist with audit, not only background loop status.
- G4: stalled brainstorms, failed planning loops, and low-quality plans should create insights.
- G5: show "ready to start", "running", "needs feedback", "failed", and "ready for Builder" as obvious queues.
- G6: safe actions like retry pass, resume stream, create workflow, and convert to builder should be one-click.
- G7: the final plan should start with AI reasoning: assumptions, risks, recommended path, and acceptance criteria.
- G8: make it a sellable AI Product Planning Studio that feeds Builder but also stands alone.

## 4. Best-practice research
- Adopt product-discovery workflows: problem, user, constraints, success criteria, risks, alternatives, and acceptance criteria.
- Adopt planning traceability: every plan output should cite inputs, research sources, decisions, and unresolved questions.
- Adopt multi-agent planning UX: roles, passes, model used, cost, and deltas between plan versions should be clear.
- Adopt handoff quality gates: Builder handoff should include repo context, validation commands, files likely touched, and risk level.
- Adopt conversational intake best practices: progressive disclosure, editable generated brief, and confirmation before expensive work.

## 5. Target design
- IA: sessions list, intake/brief builder, running timeline, research, plan docs, feedback, handoff.
- First screen: "New plan" and "Active planning sessions" with failed/stalled sessions first.
- Intake: template chips, existing-project picker from shared `/projects`, AI chat, editable generated brief, and complexity estimate with reasoning.
- Running session: pass timeline with role/model/cost/status, live stream, retry/abort controls, and AI summary.
- Plan detail: executive plan, technical plan, research evidence, decisions, risks, acceptance criteria, and Builder handoff checklist.
- Handoff: "Create Builder workflow" opens `/builder?workflow=<id>` or shows the created workflow id with deep link.
- Mobile: single-column wizard and timeline; feedback input remains reachable.

## 6. Features to add (prioritized)
- MUST: Audit/RBAC for all brainstorm mutations; acceptance: create/config/start/message/workflow writes audit and uses mutation permissions.
- MUST: Better failure/retry states; acceptance: chat/finalize/start/stream errors show inline retry and no silent console-only failure.
- MUST: Shared project source; acceptance: preflight project picker can use `/api/projects` and falls back to discovery.
- MUST: Deep-link Builder handoff; acceptance: create workflow opens `/builder?workflow=<id>` with the workflow selected.
- MUST: Brainstorm insights; acceptance: stalled/failed sessions create `/insights` findings with recommended action.
- SHOULD: Editable AI-generated brief before session creation.
- SHOULD: AI complexity and pass recommendation based on description, selected codebase, and risk.
- SHOULD: Plan diff between V1/V2/summary and "what changed after feedback."
- EXTRA: Shareable product-plan packet for stakeholders.
- EXTRA: "Turn this plan into marketplace skill" handoff.

## 7. Sellable-in-parts
- Standalone pitch: "Turn fuzzy ideas into researched, testable implementation plans with a governed AI planning loop."
- Buyer: product/engineering teams using AI builders but needing structured discovery before code.
- Packaging: AI Intake, Research Planner, Multi-Pass Planning, Builder Handoff, Planning Audit.
- Suite fit: `/projects` supplies repo context; `/builder` executes plans; `/workflows` tracks orchestration; `/audit` proves who approved what.

## 8. Backend work
- Change all `/api/brainstorm/session*` mutations to use `requireMutation` and `writeActionAudit`.
- Add `POST /api/brainstorm/session/:id/cancel|retry|archive` through action descriptors.
- Add `GET /api/brainstorm/session/:id/handoff` returning Builder-ready workflow config and validation profile.
- Add `POST /api/brainstorm/session/:id/workflow` response with deep-link URL and audit evidence.
- Add scanner for stalled brainstorm, failed brainstorm, missing plan doc, and handoff blocked.
- Reuse `brainstorm_sessions`, `brainstorm_pass_logs`, `builder_workflows`, `projects`, `action_audit`, `insights`.

## 9. Build slices
- Slice 1: Add mutation RBAC/audit to brainstorm actions and tests.
- Slice 2: Add inline error/retry/cancel states in `BrainstormPage` and child components.
- Slice 3: Deep-link handoff to Builder and selected workflow.
- Slice 4: Replace heuristic recommendation with backend complexity reasoning.
- Slice 5: Add brainstorm scanner and insights deep-links.
- Docs to update when implemented: brainstorm user guide, Builder handoff docs, API docs, detector catalog, action catalog.

## 10. Verification
- Create/config/start/message/workflow all require mutation permission and write audit.
- SSE stream updates pass state and recovers gracefully after disconnect.
- Failed chat/finalize/start paths show inline errors and retry.
- Completed session creates a Builder workflow and deep-links to it.
- Stalled or failed session creates an insight with recommended action.
- Mobile intake, timeline, feedback, and handoff are usable with 44px targets.
