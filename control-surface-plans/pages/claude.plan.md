# /claude — Product Plan
> One-line: the Claude CLI session console for legacy or external Claude runs, currently designed as a degraded adapter because the local Claude adapter is exhausted.

## 1. Today (verified, with file:line)
- The route is registered at `/claude` in the bare chat layout and navigation marks it as a core page. `app/App.tsx:61`, `app/App.tsx:106`, `app/lib/navRegistry.ts:36`
- The local operational context says `claude_local` is exhausted and must not be assigned new work; it also says operators should use logical model names rather than direct adapter names. `/root/CLAUDE.md:165`, `/root/CLAUDE.md:166`, `/root/CLAUDE.md:259`, `/root/CLAUDE.md:267`
- The frontend is a real session console with new-session modal, session list, polling, stream parsing, transcript controls, Vault/Builder handoff, disabled model selector, and shared `AgentComposer`. `app/routes/ClaudePage.tsx:57`, `app/routes/ClaudePage.tsx:141`, `app/routes/ClaudePage.tsx:167`, `app/routes/ClaudePage.tsx:254`, `app/routes/ClaudePage.tsx:425`, `app/routes/ClaudePage.tsx:510`, `app/routes/ClaudePage.tsx:523`
- The page acknowledges the exhausted-credit condition only in the empty state, where it says sends may fail and errors will surface in the thread. `app/routes/ClaudePage.tsx:436`, `app/routes/ClaudePage.tsx:444`, `app/routes/ClaudePage.tsx:447`
- Claude sessions are listed from `GET /api/claude/sessions`, created with `POST /api/claude/sessions`, loaded with `GET /api/claude/sessions/:id`, streamed with `POST /api/claude/sessions/:id/stream`, stopped with `POST /api/claude/sessions/:id/stop`, and deleted with `DELETE /api/claude/sessions/:id`. `app/routes/ClaudePage.tsx:145`, `app/routes/ClaudePage.tsx:63`, `app/routes/ClaudePage.tsx:197`, `app/routes/ClaudePage.tsx:233`, `app/routes/ClaudePage.tsx:309`, `app/routes/ClaudePage.tsx:210`
- The router exposes unauthenticated Claude health at `/api/claude/health`, then protects all other Claude routes with token auth and mutation gating. `server/api/router.ts:1138`, `server/api/router.ts:1140`, `server/api/router.ts:1141`, `server/api/router.ts:1143`, `server/api/router.ts:1152`, `server/api/router.ts:1156`, `server/api/router.ts:1162`
- The backend health check only verifies the Claude binary exists and can print a version; it explicitly does not probe Anthropic authentication. `server/api/claude.ts:78`, `server/api/claude.ts:82`, `server/api/claude.ts:89`
- The backend persists Claude session state in `/var/lib/control-surface/claude-sessions.json`, tracks active processes in memory, normalizes new-session workspaces, and spawns `/root/.local/bin/claude`. `server/api/claude.ts:8`, `server/api/claude.ts:10`, `server/api/claude.ts:11`, `server/api/claude.ts:113`, `server/api/claude.ts:157`
- Streaming launches `claude -p` with `--dangerously-skip-permissions`, `--output-format stream-json`, and session resume flags, then parses assistant, tool_use, result, error, and done events. `server/api/claude.ts:195`, `server/api/claude.ts:203`, `server/api/claude.ts:219`, `server/api/claude.ts:253`, `server/api/claude.ts:264`, `server/api/claude.ts:278`, `server/api/claude.ts:294`
- Current readiness is partial/degraded: the page and handler are real, but the authoritative runtime context says the local Claude adapter is exhausted and the page still presents send controls. `/root/CLAUDE.md:165`, `/root/CLAUDE.md:166`, `app/routes/ClaudePage.tsx:523`, `server/api/claude.ts:157`

## 2. Gaps, mock & broken parts
- The page treats exhausted Claude capacity as empty-state copy instead of a top-level degraded adapter state, so users can still create sessions and send before seeing failure. `app/routes/ClaudePage.tsx:436`, `app/routes/ClaudePage.tsx:444`, `app/routes/ClaudePage.tsx:523`, `/root/CLAUDE.md:165`
- The health endpoint reports binary/version availability but not the exhausted adapter or auth-credit state that actually determines whether sends will work. `server/api/claude.ts:78`, `server/api/claude.ts:89`, `/root/CLAUDE.md:165`
- Zero-config gap: Claude is assumed to live at `/root/.local/bin/claude` with root-owned JSON state, while the shared host inventory is hardcoded to MIMULE services/containers; a fresh environment with Claude installed elsewhere, an unregistered Claude runner, or no MIMULE services will not be represented as a discovered asset. `server/api/claude.ts:8`, `server/api/claude.ts:10`, `server/api/claude.ts:79`, `server/api/agents.ts:80`, `server/api/agents.ts:86`, `server/adapters/system.ts:9`, `server/adapters/system.ts:18`
- The backend launches Claude with `--dangerously-skip-permissions`, while the frontend runtime bar shows only a disabled model selector and default approval label without an explicit preflight risk gate. `server/api/claude.ts:203`, `app/routes/ClaudePage.tsx:510`, `app/routes/ClaudePage.tsx:518`
- Claude session state is JSON-file backed with an in-memory active process map rather than durable DB job state. `server/api/claude.ts:8`, `server/api/claude.ts:11`, `server/api/claude.ts:94`, `server/db/dashboard.ts:200`
- Claude lifecycle mutations do not write `action_audit` rows, so create, stream, stop, and delete are missing from the unified audit trail. `server/api/router.ts:1143`, `server/api/router.ts:1156`, `server/api/router.ts:1162`, `server/api/claude.ts:113`, `server/api/claude.ts:157`, `server/api/claude.ts:353`, `server/db/writer.ts:260`
- The page duplicates the Codex/Gemini console implementation instead of using a shared component: modal, drawer, polling, stream parser, transcript controls, handoff, error bar, runtime bar, and composer are local to the route. `app/routes/ClaudePage.tsx:57`, `app/routes/CodexPage.tsx:57`, `app/routes/GeminiPage.tsx:57`, `app/routes/ClaudePage.tsx:381`, `app/routes/ClaudePage.tsx:523`
- Transcript counts hardcode actions and thoughts to zero, so Claude tool use is not represented consistently in filters or health context. `app/routes/ClaudePage.tsx:425`, `app/routes/ClaudePage.tsx:429`, `app/routes/ClaudePage.tsx:562`
- The page has no direct link from exhausted state to the recommended alternatives, even though the same route family includes Gemini, Codex, and OpenCode. `app/lib/navRegistry.ts:34`, `app/lib/navRegistry.ts:35`, `app/lib/navRegistry.ts:37`, `/root/CLAUDE.md:167`
- The disabled model selector does not explain the logical-model policy or prevent users from thinking `claude_local` is an assignable model. `app/routes/ClaudePage.tsx:510`, `/root/CLAUDE.md:39`, `/root/CLAUDE.md:73`, `/root/CLAUDE.md:267`
- The backend stop handler can kill active processes, but exhausted/auth failures are not promoted into insights or admin health. `server/api/claude.ts:353`, `server/api/claude.ts:367`, `server/insights/health.ts:63`, `server/insights/store.ts:58`

## 3. Goal alignment (G1–G9)
- G1: Keep `/claude` in the suite as a transparent adapter page that explains whether Claude is usable, exhausted, or unavailable.
- G2: Sell it as an optional Claude CLI connector only when capacity/auth exists; otherwise sell the suite by showing graceful fallback to active adapters.
- G3: Give operators a clear fleet view: Claude health, credits/auth, binary status, active sessions, alternatives, and audit trail.
- G4: Gate dangerous CLI execution and exhausted-adapter overrides through RBAC, policy, confirmation, and audit.
- G4: Detect unknown Claude and Claude-adjacent AI systems: alternate CLI installs, running Claude processes, MCP servers, containers, exposed model endpoints, and shadow API keys should appear as findings before the operator registers or ignores them.
- G5: Reduce duplicate UI by adopting the shared session-console shell used by Codex and Gemini.
- G6: Offer single-Apply recovery actions: switch to Gemini/Codex, open billing/auth runbook, stop stale run, or archive failed session.
- G7: Show AI reasoning first: why Claude is unavailable, which adapter should handle the work, and what risk changes when rerouting.
- G8: Make Claude an adapter state in the unified console family, not a separate bespoke page.
- G9: `/claude` must be install-anywhere: absent Claude shows a truthful connect state, discovered-but-unregistered Claude assets show Register/Ignore/Re-scan, and exhausted local capacity never depends on MIMULE-specific inventory.

## 4. Best-practice research
- Pattern: "degraded connector page." A connector that cannot currently execute should still be valuable: show why, impact, last success, recovery owner, and fallback routes.
- Pattern: "capability-aware send gate." The composer should reflect real capability state: ready, read-only, disabled, override-required, or routed-to-alternative.
- Pattern: "adapter status matrix." Separate binary health, auth/credits, policy permission, workspace access, and active process state so operators know which layer failed.
- Pattern: "fallback recommendation." When one model adapter is exhausted, recommend a logical model or alternate console based on task type rather than a raw vendor name.
- Pattern: "transparent deprecation/degradation." Keep transcripts and archival actions available even while new sends are blocked.
- Pattern: "shared console, adapter-specific banner." The page should look like Codex/Gemini, with only the Claude-specific health/routing banner differing.

## 5. Target design
- Layout: shared session console shell with a persistent top degraded-state banner when `claude_local` is exhausted, plus left sessions, center transcript, composer, and right adapter rail.
- State model: `ready`, `exhausted`, `auth-missing`, `binary-missing`, `running`, `stale`, and `archived`; exhausted state defaults to read-only for new sends.
- Fresh-environment state: the adapter rail starts with AI Inventory discovery. If Claude is absent, show an honest not-present/connect state and active alternatives; if an unknown Claude CLI/process/container/key is found, show Register, Ignore, and Re-scan; if registered but exhausted, keep transcript/archive/read-only flows while routing new work elsewhere.
- Send behavior: disable new sends when exhausted unless an owner/operator explicitly applies an override with reason; show Gemini/Codex/OpenCode alternatives beside the disabled composer.
- AI reasoning: "Adapter read" explains why Claude is unavailable, what work can still be reviewed, and which active adapter should take over.
- Actions: one Apply for "reroute prompt to Gemini", "open Codex with this context", "stop stale Claude run", or "archive failed session"; no multi-step hidden workflow.
- Mobile: degraded banner compresses to a status chip; alternative actions remain 44px controls; session drawer and rail collapse into sheets.

## 6. Features to add (prioritized)
- MUST: Move Claude onto the shared `SessionConsoleShell`; acceptance: UI parity with Codex/Gemini and no regression in transcript or stop/delete flows.
- MUST: Add degraded/exhausted adapter state; acceptance: composer disables new sends by default when local Claude is exhausted, while existing transcripts remain readable.
- MUST: Extend health to include configured adapter status, last auth/credit failure, and recommended fallback; acceptance: the page distinguishes binary healthy from execution unavailable.
- MUST: Add Claude discovery enrollment; acceptance: a Claude CLI outside `/root/.local/bin`, a Claude process/container, or related MCP server appears as `unregistered-ai-system` with Register, Ignore, and Re-scan, and Register becomes the source for Claude health and routing.
- MUST: Add lifecycle audit for create, send attempt, blocked send, override, stop, and delete; acceptance: exhausted-state blocks are visible in audit.
- MUST: Add preflight risk card for dangerous skip-permissions mode; acceptance: any override requires reason and policy decision.
- SHOULD: Add Claude credential/endpoint discovery; acceptance: Anthropic or AI-provider credentials are reported only by presence/location as `shadow-api-key`, and any exposed unauthenticated model endpoint becomes `exposed-model-endpoint` with a security link and one-click ignore/register flow.
- SHOULD: Add one-click reroute to Gemini/Codex/OpenCode; acceptance: prompt/context carries over without using the exhausted Claude adapter.
- SHOULD: Promote repeated Claude failures/exhaustion into insights; acceptance: one deduped insight links to `/claude` and recommended fallback.
- EXTRA: Add archival transcript mode that packages Claude history into Vault without requiring a working Claude adapter.

## 7. Sellable-in-parts
- Standalone pitch: "Claude CLI Connector Console" - a governed web UI for Claude CLI sessions when Claude capacity is available, with transparent degraded mode when it is not.
- Suite fit: it demonstrates that the product manages adapter reality honestly: exhausted adapters do not disappear, but they stop unsafe work and route operators to healthy paths.
- Packaging: include as an optional connector in enterprise bundles; sell fallback orchestration and audit as the core value when a connector is unavailable.

## 8. Backend work
- Extend `GET /api/claude/health` with adapter status from configuration/runtime checks: binary, auth/credits, last failure, active process count, and recommended fallback.
- Add `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts` probes plus `server/insights/scanners/discovery.ts`; Claude consumes discovered Claude binaries, running CLI processes, containers, MCP servers, reachable model endpoints, and credential-presence signals.
- Add `discovered_assets` persistence and page endpoints: `GET /api/discovery/assets?kind=claude`, `POST /api/discovery/assets/:id/register`, `POST /api/discovery/assets/:id/ignore`, and `POST /api/discovery/rescan`, so registration can choose binary path, owner, criticality, and fallback routing without SSH.
- De-hardcode `server/adapters/system.ts` service/container/timer constants into seed hints, and make Claude health prefer registered discovery assets over `/root/.local/bin/claude` when present. `server/adapters/system.ts:9`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`, `server/api/claude.ts:10`, `server/api/claude.ts:78`
- Add lifecycle audit in `server/api/claude.ts` for create, blocked send, stream start, stream finish, stop, delete, and override.
- Add a send preflight helper shared with Codex/Gemini that evaluates workspace risk, dangerous permission mode, and adapter availability.
- Mirror Claude session metadata into existing `workspace_sessions`/`jobs` where useful; keep full raw transcript in current JSON until a shared transcript store is designed.
- Add insights detector for exhausted Claude adapter and repeated auth/credit failures; link to `/claude` and fallback routes.
- Use local governance modules only: RBAC, approvals, policy evaluator, audit export, and retention. Do not add OPA.

## 9. Build slices
- Slice 1: Shared shell adoption in `app/routes/ClaudePage.tsx`; verify current read, transcript, stop, delete, and handoff still work.
- Slice 2: Health/degraded state; extend backend health and route banner, verify exhausted, binary-missing, and healthy states with controlled inputs.
- Slice 3: Composer gating and fallback buttons; block sends by default when exhausted and add reroute actions.
- Slice 4: Lifecycle audit and override reason; verify redacted audit rows and policy decisions.
- Slice 5: Insight hook for exhausted/auth failures; show related insight in the right rail.
- Slice 6: Session metadata mirroring for admin search/health context.
- Documentation updates for builders: update this plan file, `/root/DASHBOARD_V5_PLAN.md` route status, shared console component docs, Claude adapter runbook notes, and Vault/project handoff notes describing exhausted-state behavior.

## 10. Verification
- Exhausted state: `/claude` clearly shows read-only/degraded status, disables new sends by default, and offers active adapter alternatives.
- G4/G9 discovery smoke: install or start a Claude-compatible CLI/process/container outside the current hardcoded path; within one scan cycle `/claude` and `/insights` show `unregistered-ai-system` with Register/Ignore/Re-scan, and Register updates Claude health/routing.
- Fresh-host smoke: on a host with no MIMULE services and no Claude binary, `/claude` loads as a truthful not-present/connect or degraded connector state, with no mock sessions and no crash.
- Health state: binary healthy but credits/auth exhausted is not shown as ready.
- Shared shell: Claude shares the same console layout and controls as Codex/Gemini while retaining Claude stream rendering.
- Audit: blocked send, override, stream start, stop, delete, and failure produce redacted audit rows.
- Insights: repeated Claude failures create one deduplicated finding with fallback guidance.
- Mobile: degraded banner, fallback actions, transcript, drawer, and composer do not overlap and remain touch-accessible.
- Documentation: builder updates the page plan, master V5 plan, shared shell docs, Claude adapter runbook notes, and Vault/project handoff notes before closing the slice.
