# /codex — Product Plan
> One-line: the Codex CLI session console for operators who need durable coding-agent runs, transcript evidence, stop/resume controls, and governed handoff into the admin center.

## 1. Today (verified, with file:line)
- The route is registered at `/codex` in the bare chat layout and navigation marks it as a core page. `app/App.tsx:61`, `app/App.tsx:103`, `app/lib/navRegistry.ts:35`
- The frontend is a substantial route component with its own modal, session drawer, polling, streaming parser, transcript controls, handoff buttons, and shared `AgentComposer`. `app/routes/CodexPage.tsx:57`, `app/routes/CodexPage.tsx:145`, `app/routes/CodexPage.tsx:171`, `app/routes/CodexPage.tsx:258`, `app/routes/CodexPage.tsx:447`, `app/routes/CodexPage.tsx:537`
- Codex sessions are listed from `GET /api/codex/sessions`, created with `POST /api/codex/sessions`, loaded with `GET /api/codex/sessions/:id`, streamed with `POST /api/codex/sessions/:id/stream`, stopped with `POST /api/codex/sessions/:id/stop`, and deleted with `DELETE /api/codex/sessions/:id`. `app/routes/CodexPage.tsx:149`, `app/routes/CodexPage.tsx:65`, `app/routes/CodexPage.tsx:201`, `app/routes/CodexPage.tsx:237`, `app/routes/CodexPage.tsx:312`, `app/routes/CodexPage.tsx:214`
- The router protects Codex session routes with token auth and mutation gating for create, delete, stream, and stop. `server/api/router.ts:1102`, `server/api/router.ts:1104`, `server/api/router.ts:1106`, `server/api/router.ts:1115`, `server/api/router.ts:1125`, `server/api/router.ts:1131`
- The backend persists Codex session state in `/var/lib/control-surface/codex-sessions.json`, tracks active processes in memory, and can discover a Codex resume id from `~/.codex/sessions`. `server/api/codex.ts:9`, `server/api/codex.ts:11`, `server/api/codex.ts:12`, `server/api/codex.ts:58`
- New sessions normalize the requested workspace through the shared workspace guard before creating a `cdx_` session. `server/api/codex.ts:184`, `server/api/codex.ts:189`, `server/api/workspaces.ts:123`, `server/api/workspaces.ts:147`
- Streaming Codex uses `codex exec --json` or `codex exec resume --json`, records the user message before spawning, emits SSE `item`, `done`, and `error` events, and saves completed items back into the assistant message. `server/api/codex.ts:327`, `server/api/codex.ts:338`, `server/api/codex.ts:341`, `server/api/codex.ts:374`, `server/api/codex.ts:388`, `server/api/codex.ts:400`
- The frontend parses streaming frames into `liveItems`, categorizes reasoning/tools/edits/errors/deletes, and renders each item with `CodexLiveItem`. `app/routes/CodexPage.tsx:258`, `app/routes/CodexPage.tsx:348`, `app/routes/CodexPage.tsx:576`, `app/routes/CodexPage.tsx:621`
- Stop is real: frontend posts to stop, and backend sends SIGTERM followed by SIGKILL after a timeout. `app/routes/CodexPage.tsx:312`, `server/api/codex.ts:459`, `server/api/codex.ts:467`
- Current readiness is partial: the core CLI session console works, but Codex runs are still JSON-file backed and process-local rather than first-class DB jobs with unified executor/audit/insight lifecycle. `server/api/codex.ts:9`, `server/api/codex.ts:12`, `server/db/dashboard.ts:200`, `server/db/writer.ts:260`, `server/api/execute.ts:238`, `server/api/insights.ts:152`

## 2. Gaps, mock & broken parts
- The backend launches Codex with `--dangerously-bypass-approvals-and-sandbox` for both resume and first-run paths, while the UI topbar only labels the runtime as `codex-cli` and does not surface that risk before sending. `server/api/codex.ts:103`, `server/api/codex.ts:113`, `server/api/codex.ts:341`, `server/api/codex.ts:350`, `app/routes/CodexPage.tsx:385`
- The session state is stored in a JSON file and active process map, so crashes or multi-process deployments can lose run status visibility outside that local state. `server/api/codex.ts:9`, `server/api/codex.ts:12`, `server/api/codex.ts:165`, `server/api/codex.ts:363`
- Zero-config gap: Codex is assumed to live at fixed root-owned paths and binary names, while the shared host inventory is hardcoded to MIMULE services/containers; a fresh environment with a different Codex install path, containerized Codex runner, or unknown AI process can be invisible or incorrectly treated as absent. `server/api/codex.ts:9`, `server/api/codex.ts:11`, `server/api/codex.ts:122`, `server/api/agents.ts:80`, `server/api/agents.ts:87`, `server/adapters/system.ts:9`, `server/adapters/system.ts:18`
- Codex create, stream, stop, and delete are mutating actions, but the handler does not write `action_audit` rows for those lifecycle events. `server/api/router.ts:1106`, `server/api/router.ts:1125`, `server/api/router.ts:1131`, `server/api/codex.ts:184`, `server/api/codex.ts:312`, `server/api/codex.ts:459`, `server/db/writer.ts:260`
- The frontend polls every five seconds while a session is running even though the stream already carries live events, which can duplicate load and still miss state after page refresh. `app/routes/CodexPage.tsx:171`, `app/routes/CodexPage.tsx:180`, `app/routes/CodexPage.tsx:258`
- The Codex page duplicates session-console structure that Claude and Gemini also carry: new modal, session list, polling, stream parser, transcript counts, handoff buttons, and composer wiring. `app/routes/CodexPage.tsx:57`, `app/routes/ClaudePage.tsx:57`, `app/routes/GeminiPage.tsx:57`, `app/routes/CodexPage.tsx:399`, `app/routes/ClaudePage.tsx:381`, `app/routes/GeminiPage.tsx:428`
- The page has transcript counts and filters, but those counts do not feed the shared health score, insight store, or AI analysis. `app/routes/CodexPage.tsx:348`, `server/insights/health.ts:63`, `server/insights/store.ts:58`, `server/insights/ai.ts:141`
- The route can hand off to Builder and Vault, but Codex runs are not represented as executor actions with rollback hints or approval requests. `app/routes/CodexPage.tsx:383`, `app/routes/CodexPage.tsx:394`, `server/api/execute.ts:45`, `server/api/execute.ts:238`, `server/governance/approvals.ts:41`
- Completed Codex items are stored inside the JSON session message, but the existing DB has jobs, action audit, metric samples, and workspace sessions that the page does not use for durable observability. `server/api/codex.ts:400`, `server/api/codex.ts:415`, `server/db/dashboard.ts:200`, `server/db/dashboard.ts:226`, `server/db/writer.ts:345`
- The page shows no explicit model routing context, cost/quality tier, or fallback status for Codex despite the product having a unified models endpoint and logical model guidance elsewhere. `app/routes/CodexPage.tsx:363`, `server/api/models.ts:117`, `/root/CLAUDE.md:39`, `/root/CLAUDE.md:73`
- The backend does not expose a Codex health endpoint like the Claude and Gemini handlers do, so the UI cannot distinguish missing binary, stale state, and stream failure cleanly. `server/api/router.ts:1138`, `server/api/router.ts:1169`, `server/api/codex.ts:1`

## 3. Goal alignment (G1–G9)
- G1: Make `/codex` a full coding-agent control surface with transcript, workspace guardrails, run status, risk, and follow-up actions.
- G2: Keep it sellable as a standalone Codex operations UI: secure launch, stop, resume, transcript, and audit.
- G3: Let operators manage Codex across allowed workspaces, with service health and session history visible in one console.
- G4: Put dangerous bypass mode under explicit policy, RBAC, confirmation, and audit.
- G4: Detect unknown Codex and Codex-adjacent AI systems: CLI installs outside `/usr/bin`, running agent processes, containers, MCP servers, model endpoints, and shadow credentials should become inventory findings before registration.
- G5: Provide a high-density session console that remains fast for repeated operational use.
- G6: Auto-apply only safe follow-ups; require one Apply for risky workspace, restart, or destructive actions.
- G7: Show an AI-generated run summary and risk read before raw stream events.
- G8: Share one session-console component with Claude and Gemini, and keep OpenCode visually aligned through an adapter.
- G9: `/codex` must be zero-config: first run on any host discovers whether Codex exists, shows empty/connect when absent, and registers discovered Codex assets without editing code or relying on MIMULE inventory.

## 4. Best-practice research
- Pattern: "job-backed interactive run." A CLI session page should treat every send as a job with status, owner, workspace, started/ended times, output, cancel, and retry semantics.
- Pattern: "preflight risk banner." Before launching an agent with relaxed approvals, show workspace risk, command mode, expected permissions, and policy outcome.
- Pattern: "event stream plus durable checkpoint." SSE gives live feedback, but every meaningful event should checkpoint enough state for refresh, audit, and incident reconstruction.
- Pattern: "reasoning before log." Put a short model-generated run read above the transcript: objective, current status, likely blockers, files touched, and recommended next step.
- Pattern: "one console family." Codex, Claude, and Gemini should share layout, keyboard behavior, empty states, stop/delete semantics, and handoff controls; only adapters differ.
- Pattern: "operator audit by default." Start, stop, delete, model/runtime choice, and dangerous-mode acknowledgment are audit events, not incidental UI state.

## 5. Target design
- Layout: shared console shell with left session drawer, center transcript, bottom composer, and right run rail for workspace, runtime, risk, health, insights, and audit trail.
- Shared component: create one reusable `SessionConsoleShell` and `useCliSessionConsole` adapter that drives Codex, Claude, and Gemini; Codex supplies stream item categorization and backend endpoints.
- Preflight: before first send in a session, show workspace risk, bypass mode, token/auth state, and whether the run will write to high-risk roots.
- Fresh-environment state: the Codex rail reads from AI Inventory discovery. If no Codex CLI/runner exists, the page shows a no-runner/connect state with install/register guidance; if an unknown Codex binary, container, process, MCP server, or key is found, it shows Register, Ignore, and Re-scan before enabling managed launches.
- AI reasoning: above raw events, show "Run read" with objective, changed files, risky operations, stalled state, and likely next action, backed by the insights AI analysis path.
- Actions: "Stop", "Retry", "Archive", "Vault handoff", and "Open related insight" are consistent buttons. Dangerous launches require a single Apply with reason.
- Empty/error states: no session, missing Codex binary, stream error, stopped, completed, stale active process, and reload-after-run each have distinct copy and recovery actions.
- Mobile: drawer and right rail collapse into sheets; transcript filters become segmented controls; composer remains fixed with 44px controls.

## 6. Features to add (prioritized)
- MUST: Build the shared console shell and move Codex onto it; acceptance: no loss of stream rendering, delete modal, vault handoff, or composer behavior.
- MUST: Add Codex health endpoint; acceptance: page shows healthy, missing binary, stale run, and stream-failed states.
- MUST: Add Codex discovery enrollment; acceptance: a Codex CLI outside `/usr/bin`, an unknown Codex process/container, or compatible agent service appears as `unregistered-ai-system` with Register, Ignore, and Re-scan, and Register binds it to the Codex health/launch path.
- MUST: Add lifecycle audit; acceptance: create, send, stop, delete, and dangerous-mode acknowledgment write redacted `action_audit` rows.
- MUST: Add preflight risk card; acceptance: workspace root, bypass mode, active policy decision, and confirmation state appear before first send.
- MUST: Mirror session metadata to existing DB structures; acceptance: running/completed Codex sessions appear in admin search/health context after refresh.
- SHOULD: Add credential and endpoint discovery for Codex-adjacent AI use; acceptance: discovered provider keys become `shadow-api-key` findings with presence/location only, and exposed local model APIs used by Codex become `exposed-model-endpoint` findings when unauthenticated.
- SHOULD: Convert polling to event plus durable checkpoint; acceptance: refresh during a run restores status without a five-second blind spot.
- SHOULD: Feed stream errors and repeated stops into insights; acceptance: deduplicated findings link back to `/codex?session=...`.
- EXTRA: Add "diff capsule" that groups completed edit/file items into a compact review packet.

## 7. Sellable-in-parts
- Standalone pitch: "Codex Control Console" - a governed web console for launching, monitoring, stopping, and auditing Codex CLI work across approved workspaces.
- Suite fit: it becomes the coding-agent module in the all-in-one AI tool, sharing the suite health score, insights inbox, gateway model context, RBAC, approvals, and executor path.
- Packaging: sell as a developer platform add-on; bundle with OpenCode/Gemini for multi-agent teams; bundle with governance for regulated agent execution.

## 8. Backend work
- Add `GET /api/codex/health` returning binary availability, version if available, active run count, stale active processes, and state-file health.
- Add `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts` probes plus `server/insights/scanners/discovery.ts`; Codex consumes discovered Codex binaries, running `codex exec` processes, containers, MCP servers, reachable model endpoints, and credential-presence signals.
- Add `discovered_assets` persistence and page endpoints: `GET /api/discovery/assets?kind=codex`, `POST /api/discovery/assets/:id/register`, `POST /api/discovery/assets/:id/ignore`, and `POST /api/discovery/rescan`, with audit rows for Register/Ignore and fingerprints for binary path, process command, source probe, and first/last seen.
- De-hardcode `server/adapters/system.ts` service/container/timer constants into seed hints, and make Codex health prefer registered discovery assets over fixed `/usr/bin/codex` assumptions. `server/adapters/system.ts:9`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`, `server/api/codex.ts:122`, `server/api/agents.ts:87`
- Add lifecycle audit calls in `server/api/codex.ts` using `writeActionAudit` for create, stream start, stream finish, stop, delete, and error.
- Mirror session metadata into existing `workspace_sessions` and run status into `jobs` where appropriate; keep raw transcript in current JSON until a normalized transcript schema is justified.
- Add policy preflight endpoint or shared helper that evaluates workspace, runtime mode, and requested action through RBAC/local policy/approval modules.
- Add insights detector hooks for repeated Codex stream failures, stale active processes, and high-risk bypass runs.
- Do not add OPA; use the repo's local governance modules: RBAC, approvals, policy evaluator, audit export, and retention.

## 9. Build slices
- Slice 1: Extract shared console shell from Codex first in `app/components/agent-console/*`; route Codex through it and verify no visual regression.
- Slice 2: Add Codex health endpoint and frontend health states; verify healthy and missing-binary cases with mocks or dependency injection, not service restarts.
- Slice 3: Add lifecycle audit to Codex handlers; verify redaction and audit rows through unit/integration tests with `DASHBOARD_DB=1` test DB.
- Slice 4: Add preflight risk card; wire workspace risk and bypass-mode acknowledgment before stream start.
- Slice 5: Mirror metadata into `workspace_sessions`/`jobs`; verify refresh during an active run restores state.
- Slice 6: Add Codex insight hooks and right-rail links to `/insights`.
- Documentation updates for builders: update this plan file, `/root/DASHBOARD_V5_PLAN.md` route status, the new shared console component README or local docs, API notes for `/api/codex/health`, and Vault/project handoff notes for changed operator workflow.

## 10. Verification
- Typecheck and route smoke: `/codex` creates a session, sends a stream, renders live items, stops, deletes with modal, and refreshes without losing status.
- G4/G9 discovery smoke: install or start a Codex-compatible binary/process/container in a non-default location; within one scan cycle `/codex` and `/insights` show `unregistered-ai-system` with Register/Ignore/Re-scan, and Register makes the asset drive Codex health and launch preflight.
- Fresh-host smoke: on a host with no MIMULE services and no Codex binary, `/codex` loads as an honest no-runner/connect state with no mock sessions, no crash, and no inventory sourced only from hardcoded service names.
- Audit evidence: create/send/stop/delete/dangerous acknowledgment produce redacted audit rows with user, workspace, session id, and result.
- Risk evidence: high-risk roots and bypass mode cannot be launched without the visible preflight Apply step.
- Health evidence: missing binary, stale process, stream error, and healthy cases display distinct states.
- Insights evidence: repeated stream failures create one deduplicated insight linked to the session.
- Shared-component evidence: Claude and Gemini can adopt the shell without copying Codex-only stream rendering.
- Documentation: builder updates the page plan, master V5 plan, shared component docs, API notes, and Vault/project handoff notes before closing the implementation slice.
