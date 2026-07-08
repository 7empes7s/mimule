# /opencode — Product Plan
> One-line: the primary OpenCode workbench for operators and builders who need live sessions, model choice, permission review, transcript evidence, and handoff into the admin suite.

## 1. Today (verified, with file:line)
- The route is registered as `/opencode` and `/opencode/*` inside the bare chat layout, and the route component initializes the OpenCode store before rendering `<OpenCodeView />`. `app/App.tsx:61`, `app/App.tsx:97`, `app/App.tsx:100`, `app/routes/OpenCodeRoute.tsx:5`, `app/routes/OpenCodeRoute.tsx:19`
- Navigation marks `/opencode` as a core page alongside `/codex`, `/claude`, and `/gemini`, so the product already treats it as part of the main console family. `app/lib/navRegistry.ts:34`, `app/lib/navRegistry.ts:35`, `app/lib/navRegistry.ts:36`, `app/lib/navRegistry.ts:37`
- There is no `server/api/opencode.ts`; OpenCode traffic goes through the `/opencode-api` proxy in `server/index.ts`, which forwards to `OPENCODE_URL` defaulting to `http://localhost:4096`. `server/index.ts:21`, `server/index.ts:74`, `server/index.ts:75`, `server/index.ts:292`, `server/index.ts:296`
- The proxy strips `/opencode-api`, buffers request bodies, normalizes `POST /session` directories through `normalizeWorkspace`, forwards to the upstream OpenCode server, and returns a JSON 502 when the upstream request fails. `server/index.ts:74`, `server/index.ts:82`, `server/index.ts:89`, `server/index.ts:105`, `server/index.ts:114`, `server/index.ts:130`
- The shared store uses `API = "/opencode-api"`, opens an SSE stream at `/event`, fetches OpenCode sessions from `/session`, and loads provider metadata during `init()`. `app/lib/store.ts:4`, `app/lib/store.ts:117`, `app/lib/store.ts:253`, `app/lib/store.ts:255`, `app/lib/store.ts:257`
- The OpenCode store implements select, create, delete, send, abort, permission reply, provider load, and global model updates against the proxied OpenCode API. `app/lib/store.ts:295`, `app/lib/store.ts:319`, `app/lib/store.ts:333`, `app/lib/store.ts:344`, `app/lib/store.ts:364`, `app/lib/store.ts:372`, `app/lib/store.ts:386`, `app/lib/store.ts:399`
- The page has real session UI: a sorted session drawer, new-session modal with preset and recent workspaces, model picker, transcript filters, attachment handling, permission banner, and shared `AgentComposer`. `app/components/OpenCodeView.tsx:60`, `app/components/OpenCodeView.tsx:106`, `app/components/OpenCodeView.tsx:194`, `app/components/OpenCodeView.tsx:275`, `app/components/OpenCodeView.tsx:301`, `app/components/OpenCodeView.tsx:29`, `app/components/OpenCodeView.tsx:561`
- Transcript rendering is real but local to OpenCode: `PartView` renders text, reasoning, tool, and patch parts, and `OpenCodeView` filters parts into action/thought/error/edit/delete views. `app/components/PartView.tsx:153`, `app/components/PartView.tsx:160`, `app/components/PartView.tsx:164`, `app/components/PartView.tsx:167`, `app/components/PartView.tsx:171`, `app/components/OpenCodeView.tsx:633`
- OpenCode already participates in the shared agent discovery surface: the strip loads `/api/agents/summary`, counts OpenCode sessions and agents, and the backend probes OpenCode version, MCP, sessions, agents, models, and stats. `app/components/AgentDiscoveryStrip.tsx:187`, `app/components/AgentDiscoveryStrip.tsx:203`, `app/components/AgentDiscoveryStrip.tsx:259`, `server/api/agents.ts:622`, `server/api/agents.ts:651`, `server/api/agents.ts:653`
- Current readiness is partial: the core page is real and proxied, but its lifecycle and permissions live mainly in upstream OpenCode rather than the dashboard DB, insights inbox, executor, or audit trail. `app/lib/store.ts:4`, `server/index.ts:292`, `server/db/dashboard.ts:226`, `server/db/writer.ts:260`, `server/api/insights.ts:152`, `server/api/execute.ts:238`

## 2. Gaps, mock & broken parts
- The page uses browser-native `confirm()` for session deletion instead of the existing `ConfirmModal`, which makes the destructive action visually inconsistent with the other console pages. `app/components/OpenCodeView.tsx:60`, `app/components/OpenCodeView.tsx:63`, `app/routes/CodexPage.tsx:211`, `app/routes/CodexPage.tsx:562`
- OpenCode permission decisions are sent directly to upstream OpenCode endpoints and are not recorded through `writeActionAudit`, so the dashboard cannot show a unified audit trail for allow/deny decisions. `app/lib/store.ts:372`, `app/lib/store.ts:377`, `app/lib/store.ts:382`, `server/db/writer.ts:260`, `server/api/router.ts:1091`
- The proxy only normalizes workspaces for `POST /session`; other proxied OpenCode mutations pass through without page-level risk labeling or executor policy. `server/index.ts:89`, `server/index.ts:105`, `server/index.ts:114`, `server/api/execute.ts:45`, `server/api/execute.ts:238`
- Zero-config gap: the suite-level inventory this page inherits is hardcoded to MIMULE service/container names, while OpenCode itself defaults to a single localhost upstream and the agent summary probes a fixed OpenCode binary path; in a fresh customer environment that can miss an unregistered OpenCode-compatible daemon, alternate binary, containerized agent, or exposed model endpoint. `server/adapters/system.ts:9`, `server/adapters/system.ts:18`, `server/index.ts:21`, `server/api/agents.ts:80`, `server/api/agents.ts:88`, `server/api/agents.ts:648`
- OpenCode state is read from the upstream OpenCode service and SSE stream, while the dashboard DB only has a generic `workspace_sessions` table that this page does not write to. `app/lib/store.ts:117`, `app/lib/store.ts:253`, `app/lib/store.ts:295`, `server/db/dashboard.ts:226`
- The route readiness fallback only says the service is unavailable or connecting, and it does not expose the proxied upstream target, last health check, related insight, or restart action. `app/routes/OpenCodeRoute.tsx:9`, `app/routes/OpenCodeRoute.tsx:12`, `server/index.ts:21`, `server/index.ts:130`, `server/insights/scanners/ops.ts:45`
- The model picker updates OpenCode global config, but the page does not connect that choice to the unified `/api/models` health, quality, cooldown, or fallback data. `app/components/OpenCodeView.tsx:194`, `app/lib/store.ts:386`, `app/lib/store.ts:399`, `server/api/models.ts:41`, `server/api/models.ts:117`
- Transcript filters count actions, thoughts, errors, edits, and deletes from local OpenCode parts, but those counts are not sent to the shared insights health score or AI analysis pipeline. `app/components/OpenCodeView.tsx:337`, `app/components/OpenCodeView.tsx:348`, `server/insights/health.ts:63`, `server/insights/ai.ts:141`
- The Builder and Vault buttons are local handoff controls, but they are not connected to a single executor path or insight lifecycle for OpenCode actions. `app/components/OpenCodeView.tsx:413`, `app/components/OpenCodeView.tsx:424`, `server/api/execute.ts:29`, `server/api/insights.ts:196`
- The upstream proxy returns 502 on failure, but the frontend does not classify that state into the product's one health score or unified inbox. `server/index.ts:130`, `app/routes/OpenCodeRoute.tsx:9`, `server/insights/health.ts:8`, `server/insights/store.ts:58`
- There is no fabricated OPA/Open Policy Agent layer here; governance is a local TypeScript policy evaluator and RBAC/approvals modules, so any OpenCode governance plan must use those real modules. `server/governance/policy.ts:1`, `server/governance/policy.ts:32`, `server/governance/rbac.ts:259`, `server/governance/approvals.ts:41`

## 3. Goal alignment (G1–G9)
- G1: Make `/opencode` feel like the flagship console in the suite, not a proxied island; keep its real-time transcript, attachments, permissions, and model picker, but wrap them in shared page chrome, health context, and audit links.
- G2: Preserve standalone sellability as an OpenCode admin console: session list, workspace guardrails, live transcript, permission review, model config, and team handoff should work without the rest of the stack.
- G3: Support global operation by showing upstream service health, allowed workspaces, model health, and recent permission decisions in one glance.
- G4: Tie every destructive or privileged permission to RBAC, approvals, and action audit records.
- G4: Detect unknown AI systems around OpenCode too: an unregistered OpenCode daemon, OpenAI-compatible endpoint, containerized agent, CLI, or shadow key should become a discovery finding before the operator registers it.
- G5: Keep the page dense and operational: drawer, transcript, composer, model/risk rail, insight/action rail.
- G6: Prefer automatic safe actions where policy allows, then one explicit Apply for risky permission, restart, or config changes.
- G7: Put AI reasoning before raw transcript details: summarize current session risk, proposed next action, tool-use deltas, and likely failure root cause.
- G8: Reuse shared console primitives across OpenCode, Codex, Claude, and Gemini so improvements ship once.
- G9: `/opencode` must work immediately in any environment: if no OpenCode daemon is discovered, show an honest connect/register state; if one is discovered but unregistered, offer Register without editing `server/index.ts` or `system.ts`.

## 4. Best-practice research
- Pattern: "adapter health gate." A console backed by another daemon should show upstream URL alias, service status, last successful event, and one safe recovery path before exposing controls.
- Pattern: "live transcript with evidence lanes." Keep the conversation center-stage, but split reasoning, tool calls, patches, permission prompts, errors, and attachments into filterable lanes that can be cited later.
- Pattern: "risk-aware permission inbox." Permission prompts should carry workspace, command/tool name, data touched, RBAC state, rollback hint, and Apply/Deny buttons that create audit evidence.
- Pattern: "model routing context chip." Model choice is not just a dropdown; it should show availability, quality tier, cooldown/fallback, and whether the route is local, cloud, or unavailable.
- Pattern: "single incident bridge." A failed daemon, denied permission, unsafe workspace, or repeated tool error should land in the same insights inbox as service and governance findings.
- Pattern: "session end package." When the operator closes a session, the page should offer a compact handoff: summary, files touched, decisions made, follow-up actions, and documentation targets.

## 5. Target design
- Layout: retain the three-part console shape: left session drawer, center live transcript/composer, right operational rail. The right rail should show upstream health, active model, workspace risk, open insights, permission audit, and one Apply area.
- Shared components: keep `AgentDiscoveryStrip`, `AgentComposer`, `TranscriptControls`, `ConfirmModal`, and `useSessionEndPrompt`; add a shared `SessionConsoleShell` that OpenCode can use through an OpenCode adapter while `/codex`, `/claude`, and `/gemini` use the same shell directly.
- AI reasoning: above the transcript filters, show a short "Current read" generated from session events: likely intent, risk, blockers, and recommended next action. Raw events stay below it.
- Fresh-environment state: the right rail starts from discovery results, not MIMULE constants. With no OpenCode assets, show empty/connect actions; with an unregistered daemon, port, container, or CLI, show it in an AI Inventory panel with Register, Ignore, and Re-scan; with a registered daemon, bind `/opencode-api` to the registered endpoint and show managed health.
- Actions: permission prompts become first-class action cards. Low-risk repeatable approvals can be auto-applied under policy; all other approvals use one Apply/Deny row that writes audit evidence.
- Empty state: if upstream OpenCode is unavailable, show service status, last 502 time, likely cause, related insight link, and a single recovery action if the user has permission.
- Mobile: convert the session drawer and operational rail into bottom sheets, keep composer buttons at least 44px, and make permission cards fully actionable without hover.

## 6. Features to add (prioritized)
- MUST: Replace native deletion confirmation with shared `ConfirmModal`; acceptance: deletion flow matches Codex/Gemini/Claude and stays keyboard accessible.
- MUST: Add OpenCode permission audit mirroring; acceptance: every allow/deny writes an `action_audit` row with workspace, tool, decision, and upstream permission id.
- MUST: Add OpenCode health adapter; acceptance: page can show connected, degraded, unavailable, and recovering states from upstream proxy failures and agent discovery.
- MUST: Add OpenCode discovery enrollment; acceptance: an unknown OpenCode process, CLI, container, or OpenAI-compatible model endpoint appears as `unregistered-ai-system` or `exposed-model-endpoint` with Register, Ignore, and Re-scan actions, and Register makes it the managed `/opencode` upstream without editing code.
- MUST: Add model health context beside the OpenCode model picker; acceptance: selected provider/model shows availability, quality, cooldown, and fallback status from `/api/models`.
- MUST: Add shared `SessionConsoleShell`; acceptance: OpenCode uses the common header, drawer, transcript controls, handoff, and operational rail without changing upstream protocol behavior.
- SHOULD: Detect OpenCode-related shadow credentials; acceptance: AI-provider keys found in env/config/dotfiles are reported only by presence/location as `shadow-api-key` findings and can be ignored or linked to the registered OpenCode asset.
- SHOULD: Mirror session metadata into existing `workspace_sessions`; acceptance: active OpenCode sessions appear in admin health, search, and audit context without storing full transcript in a new table.
- SHOULD: Add insight creation for repeated OpenCode proxy failures, permission denials, and tool errors; acceptance: findings link back to `/opencode?session=...`.
- EXTRA: Add "handoff packet" export that compacts transcript, patches, permissions, and next actions into a Vault entry.

## 7. Sellable-in-parts
- Standalone pitch: "OpenCode Operations Console" - a secured, auditable, model-aware web UI for an existing OpenCode daemon with live sessions, permission review, workspace guardrails, and handoff.
- Suite fit: the page becomes one adapter in the all-in-one AI tool/gateway/admin center, sharing health score, insights inbox, RBAC, approvals, executor, model routing, and audit trail.
- Packaging: sell it alone for teams already running OpenCode; bundle it with Codex/Gemini consoles for multi-agent operations; bundle with governance for regulated deployments.

## 8. Backend work
- Add `GET /api/opencode/health` as a dashboard-owned adapter endpoint that checks upstream reachability, last event age, and discovery status without replacing `/opencode-api`.
- Add `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts` probes plus `server/insights/scanners/discovery.ts`; OpenCode consumes discovered OpenCode-like daemons, CLIs, containers, compatible `/v1/models` endpoints, and credential-presence findings rather than relying only on `OPENCODE_SERVER_URL`.
- Add `discovered_assets` persistence and page endpoints: `GET /api/discovery/assets?kind=opencode`, `POST /api/discovery/assets/:id/register`, `POST /api/discovery/assets/:id/ignore`, and `POST /api/discovery/rescan`, returning status, fingerprint, source probe, first/last seen, and registration target.
- De-hardcode `server/adapters/system.ts` service/container/timer lists into discovery seed hints so `newsbites`, `litellm`, `vast-tunnel`, `openclaw_gateway`, and similar MIMULE names are suggestions, not the inventory source of truth. `server/adapters/system.ts:9`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`
- Add `POST /api/opencode/permissions/:id/audit` or wrap permission replies through a dashboard endpoint that forwards upstream and writes `action_audit`.
- Add `POST /api/opencode/sessions/:id/audit-delete` or route deletion through the dashboard so ConfirmModal decisions are recorded.
- Mirror session metadata into existing `workspace_sessions` rather than adding a new transcript table initially.
- Add insight detector hooks for repeated `/opencode-api` 502s, stale SSE, and high-risk permission prompts.
- Use the existing local governance stack: RBAC, approvals, local policy evaluator, budgets, secrets, retention, and audit export. Do not add or reference OPA.

## 9. Build slices
- Slice 1: UI consistency only in `app/components/OpenCodeView.tsx`; replace `confirm()` with `ConfirmModal`, keep existing store calls, run frontend typecheck and a browser smoke of delete cancel/confirm.
- Slice 2: Shared shell extraction in `app/components/agent-console/SessionConsoleShell.tsx`; adapt OpenCode first without changing Codex/Gemini/Claude behavior.
- Slice 3: Health adapter in `server/api/router.ts` plus a small OpenCode health module; display connected/degraded/unavailable in the route fallback and right rail.
- Slice 4: Permission audit wrapper; add server endpoint, wire `replyPermission`, and verify `action_audit` rows redact sensitive fields.
- Slice 5: Model-health chips; connect OpenCode provider/model UI to `/api/models` and show cooldown/fallback state.
- Slice 6: Insights bridge; add detector for proxy failures and repeated permission denials, then link findings to `/opencode`.
- Documentation updates for builders: update this plan file with implementation notes, update `/root/DASHBOARD_V5_PLAN.md` route status, add or update component docs for the shared console shell, and record any operator-facing behavior change in the AI vault/project handoff notes used by the existing Vault workflow.

## 10. Verification
- File grounding: implementation PR cites the actual route, store, proxy, governance, insights, and DB files changed.
- Functional smoke: `/opencode` loads with upstream available, shows sessions, sends a message, receives SSE updates, aborts, and handles proxy 502 without a blank page.
- G4/G9 discovery smoke: start an unregistered OpenCode-like process, container, or compatible model port; within one scan cycle it appears in `/opencode` and `/insights` as `unregistered-ai-system` or `exposed-model-endpoint` with Register/Ignore/Re-scan, and Register makes it the managed upstream.
- Fresh-host smoke: on a host with none of MIMULE's hardcoded services or containers, `/opencode` shows an honest no-daemon/connect state, no mock sessions, no crash, and no inventory rows sourced only from `system.ts` constants.
- Permission audit: allow and deny both create redacted audit records and preserve upstream behavior.
- Model context: selected OpenCode model displays health and fallback data from the unified model endpoint.
- Insights: repeated proxy failures or stale events create one deduplicated insight linked to `/opencode`.
- Mobile: session drawer, right rail, permission cards, attachments, and composer work at mobile widths with no hover-only controls.
- Documentation: builder updates the route plan, master V5 status, shared console component notes, and Vault/project handoff notes before marking the slice done.
