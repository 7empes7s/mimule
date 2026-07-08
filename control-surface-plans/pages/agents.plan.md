# /agents — Product Plan
> One-line: the AI workforce registry for operators who need ownership, permissions, spend, activity, and risk posture for every autonomous actor.

## 1. Today (verified, with file:line)
- Frontend component: `/agents` is routed to `AgentRegistryPage` in `app/App.tsx:109`, marked `core` in `app/lib/navRegistry.ts:19`, and implemented in `app/routes/AgentRegistryPage.tsx:291`; readiness is 🟡 partial because it is useful but read-only.
- Data source: the page loads `/api/agent-registry` every 15 seconds in `app/routes/AgentRegistryPage.tsx:292` and opens per-agent passports from `/api/agent-registry/:id` in `app/routes/AgentRegistryPage.tsx:81`.
- Current UI: the page shows total/active/paused/retired counts in `app/routes/AgentRegistryPage.tsx:319`, `app/routes/AgentRegistryPage.tsx:325`, `app/routes/AgentRegistryPage.tsx:330`, and `app/routes/AgentRegistryPage.tsx:335`.
- Current UI: the table shows name, kind, status, owner, risk, last seen, actions/7d, spend/30d, and models in `app/routes/AgentRegistryPage.tsx:351` and `app/routes/AgentRegistryPage.tsx:354`.
- Current UI: agent passport shows purpose, owner, aliases, allowed models, 30-day gateway calls/spend/last call, and recent audit rows in `app/routes/AgentRegistryPage.tsx:125`, `app/routes/AgentRegistryPage.tsx:156`, and `app/routes/AgentRegistryPage.tsx:174`.
- Backend handlers: router gates `/api/agent-registry` and `/api/agent-registry/:id` with `checkToken` in `server/api/router.ts:504` and `server/api/router.ts:508`.
- Backend behavior: `agentRegistryListHandler` requires `insights.view`, seeds default agents, lists agents, and returns counts in `server/api/agentRegistry.ts:13`, `server/api/agentRegistry.ts:14`, `server/api/agentRegistry.ts:17`, `server/api/agentRegistry.ts:18`, and `server/api/agentRegistry.ts:19`.
- Backend data: the `agents` table stores id, name, kind, owner, purpose, risk tier, status, model access, aliases, and tenant id in `server/db/dashboard.ts:999`.
- Backend enrichment: last-seen and 7-day action counts are read from `action_audit` in `server/agents/registry.ts:204` and `server/agents/registry.ts:209`; 30-day spend is read from `gateway_calls` in `server/agents/registry.ts:227`.
- Detection integration: registry scanner flags unregistered actors, idle agents, and ownerless agents and points them to `/agents` in `server/insights/scanners/registry.ts:146`, `server/insights/scanners/registry.ts:165`, and `server/insights/scanners/registry.ts:189`.

## 2. Gaps, mock & broken parts
- The page has no create/edit/pause/retire/owner/model-access controls; visible status/owner/risk/model fields are display-only in `app/routes/AgentRegistryPage.tsx:258` and `app/routes/AgentRegistryPage.tsx:291`.
- The API exposes only list and passport handlers in `server/api/agentRegistry.ts:13` and `server/api/agentRegistry.ts:28`; there are no mutation handlers for owner, status, risk tier, aliases, or model access.
- `seedDefaultAgents()` inserts defaults with owner `marouane` in `server/agents/registry.ts:263` and `server/agents/registry.ts:268`; this is fine for the current installation but must become tenant/operator configurable for a sellable product.
- Registry findings recommend fixing ownerless/idle/unregistered agents on `/agents` in `server/insights/scanners/registry.ts:153`, `server/insights/scanners/registry.ts:176`, and `server/insights/scanners/registry.ts:197`, but the page has no Apply action for those findings.
- The page shows model access as strings in `app/routes/AgentRegistryPage.tsx:145` and `app/routes/AgentRegistryPage.tsx:276`; it does not link to `/models`, `/gateway`, `/cost`, or policy controls.
- Spend is shown but there is no budget cap editor here, while security scanning flags active agent workflows without budget caps in `server/insights/scanners/security.ts:170`.

## 3. Goal alignment (G1–G8)
- G1: keep registry loading/error/empty states reliable and add retryable mutation errors.
- G2: owners, lifecycle state, risk tier, aliases, model access, and budget caps must be editable through GUI.
- G3: remove read-only "almost governance" behavior by wiring full CRUD and policy effects.
- G4: registry detectors should catch unregistered actors, ownerless agents, idle agents, overbroad model access, spend anomalies, and uncapped active agents.
- G5: make risk-sorted agents and findings obvious; every row should show "needs action" first.
- G6: safe fixes like set owner, pause idle agent, add alias, or cap budget should be single Apply actions.
- G7: each registry finding should explain why the actor is risky before showing audit details.
- G8: make this a standalone AI Workforce Governance module, not just an inventory table.

## 4. Best-practice research
- Adopt identity governance patterns: owner, role, lifecycle, last activity, access scope, and exceptions are first-class.
- Adopt cloud IAM review patterns: access review queues, least-privilege diffs, stale identity detection, and attestation history.
- Adopt FinOps allocation patterns: every agent has owner/team/project/cost center and budget guardrails.
- Adopt SOC-style investigation: click an agent to see timeline, model calls, actions, incidents, permissions, and related findings.
- Adopt policy-as-code UX: permissions should be explainable as human labels and previewable before enforcement.

## 5. Target design
- Header: workforce health score, active/paused/retired, unowned count, high-risk count, 30-day spend, and open registry findings.
- Main view: severity-sorted agent table with owner, risk, status, budget, model access, recent actions, spend, and policy exceptions.
- Agent drawer: passport timeline, current permissions, model routes, budget cap, recent gateway calls, audit trail, related insights, and change history.
- Actions: edit owner, pause/retire/reactivate, adjust risk tier, change model access, set budget, add alias, request approval.
- AI reasoning: show "why this agent is risky / stale / over-budget" above audit evidence.
- Empty states: guide to register default agents, discover actors from audit/gateway, or connect builder/team agents.
- Mobile: cards replace table, each card has visible owner/status/risk/action buttons.

## 6. Features to add (prioritized)
- MUST: Agent CRUD/lifecycle mutations; acceptance: owner/status/risk/aliases/model access can be changed and audited.
- MUST: Registry insight Apply actions; acceptance: ownerless, idle, and unregistered-agent findings can be fixed from `/insights` or `/agents`.
- MUST: Agent risk queue; acceptance: high-risk, ownerless, stale, over-budget, and unregistered actors are sorted first.
- MUST: Permission/budget drawer; acceptance: every agent shows allowed models, allowed actions, budget cap, spend, and effective policy.
- SHOULD: Access review workflow; acceptance: owner can attest or change permissions on a schedule.
- SHOULD: Agent-to-builder correlation; acceptance: an agent passport links to builder passes/runs it executed.
- SHOULD: Exportable workforce report; acceptance: CSV/PDF includes owner, risk, access, spend, and last activity.
- EXTRA: "What changed?" timeline comparing current and previous permissions.
- EXTRA: AI-generated least-privilege recommendation per agent.

## 7. Sellable-in-parts
- Standalone pitch: "Know every AI agent, what it can do, what it spent, who owns it, and what it changed."
- Buyer: platform, security, compliance, and engineering leaders governing coding/editorial/support agents.
- Packaging: Workforce Inventory, Agent Access Reviews, Agent FinOps, Agent Audit Explorer, Agent Risk Detection.
- Suite fit: `/builder` and `/agent-team` produce activity; `/gateway` and `/cost` provide model spend; `/insights` prioritizes findings; `/audit` proves actions.

## 8. Backend work
- Add `POST /api/agent-registry`: create/register agent with owner, kind, aliases, risk, model access, budget, and purpose.
- Add `PATCH /api/agent-registry/:id`: update owner/status/risk/aliases/model access; use `requireMutation` and `writeActionAudit`.
- Add `POST /api/agent-registry/:id/attest`: owner access review with expiry and evidence.
- Add `POST /api/agent-registry/:id/budget`: write through existing governance budget structures or a shared budget table.
- Add action descriptors: `agent:set-owner`, `agent:pause`, `agent:retire`, `agent:add-alias`, `agent:set-model-access`, `agent:set-budget`.
- Extend scanners: overbroad model access, over-budget spend, missing attestation, stale active agents, unknown gateway caller.
- Reuse tables: `agents`, `action_audit`, `gateway_calls`, `governance_budgets`, `insights`, `ai_analysis`.

## 9. Build slices
- Slice 1: Add API mutations and tests in `server/api/agentRegistry.ts`, `server/agents/registry.ts`, and `server/api/router.ts`.
- Slice 2: Add agent drawer edit controls in `app/routes/AgentRegistryPage.tsx`; validate with loading/error/success states.
- Slice 3: Add action descriptors and connect registry scanner findings to Apply.
- Slice 4: Add budget/model-access panel and cross-links to `/models`, `/gateway`, `/cost`, and `/audit`.
- Slice 5: Add access review and export.
- Docs to update when implemented: agent registry runbook, public API docs, detector catalog, action catalog, and admin onboarding docs.

## 10. Verification
- Agent owner/status/risk/aliases/model access changes persist after reload and create audit rows.
- Registry scanner findings can be fixed with Apply and auto-resolve after rescan.
- Unregistered audit actor appears as a finding and can be registered without CLI.
- Agent spend matches gateway calls for the same aliases.
- Mobile card layout exposes the same actions as desktop.
- Permissions enforce `insights.view` for reads and mutation RBAC for writes.
