# /gemini — Product Plan
> One-line: the Gemini CLI session console for active coding-agent runs, model selection, approval mode control, and governed fallback inside the AI admin suite.

## 1. Today (verified, with file:line)
- The route is registered at `/gemini` in the bare chat layout and navigation marks it as a core page. `app/App.tsx:61`, `app/App.tsx:109`, `app/lib/navRegistry.ts:37`
- The frontend is a real session console with new-session modal, session list, polling, stream parsing, transcript controls, model/approval/output controls, yolo confirmation, Vault/Builder handoff, and shared `AgentComposer`. `app/routes/GeminiPage.tsx:57`, `app/routes/GeminiPage.tsx:153`, `app/routes/GeminiPage.tsx:205`, `app/routes/GeminiPage.tsx:299`, `app/routes/GeminiPage.tsx:472`, `app/routes/GeminiPage.tsx:552`, `app/routes/GeminiPage.tsx:622`, `app/routes/GeminiPage.tsx:587`
- Runtime options default to `model: "gemini-2.5-flash"`, `approvalMode: "default"`, and `outputFormat: "stream-json"`, and the UI exposes model, approval, and output selects in the runtime bar. `app/routes/GeminiPage.tsx:125`, `app/routes/GeminiPage.tsx:137`, `app/routes/GeminiPage.tsx:552`, `app/routes/GeminiPage.tsx:563`, `app/routes/GeminiPage.tsx:573`
- Gemini sessions are listed from `GET /api/gemini/sessions`, created with `POST /api/gemini/sessions`, loaded with `GET /api/gemini/sessions/:id`, streamed with `POST /api/gemini/sessions/:id/stream`, stopped with `POST /api/gemini/sessions/:id/stop`, and deleted with `DELETE /api/gemini/sessions/:id`. `app/routes/GeminiPage.tsx:157`, `app/routes/GeminiPage.tsx:63`, `app/routes/GeminiPage.tsx:235`, `app/routes/GeminiPage.tsx:286`, `app/routes/GeminiPage.tsx:356`, `app/routes/GeminiPage.tsx:248`
- The router exposes unauthenticated Gemini health at `/api/gemini/health`, then protects all other Gemini routes with token auth and mutation gating. `server/api/router.ts:1169`, `server/api/router.ts:1171`, `server/api/router.ts:1172`, `server/api/router.ts:1174`, `server/api/router.ts:1183`, `server/api/router.ts:1187`, `server/api/router.ts:1193`
- The backend health check verifies `/usr/bin/gemini` exists and can print a version, and new sessions normalize workspaces through the shared workspace guard. `server/api/gemini.ts:10`, `server/api/gemini.ts:78`, `server/api/gemini.ts:82`, `server/api/gemini.ts:89`, `server/api/gemini.ts:113`, `server/api/workspaces.ts:123`
- The backend stream body already accepts `model`, `approvalMode`, and `outputFormat`, and it pushes `--model` when a model is provided. `server/api/gemini.ts:186`, `server/api/gemini.ts:217`, `server/api/gemini.ts:226`, `server/api/gemini.ts:229`
- The frontend currently posts `text`, `approvalMode`, and `outputFormat` to the stream endpoint, but it omits `runtimeOptions.model`. `app/routes/GeminiPage.tsx:286`, `app/routes/GeminiPage.tsx:288`, `app/routes/GeminiPage.tsx:289`, `app/routes/GeminiPage.tsx:552`
- The frontend tries to load unified models from `/api/models`, while the backend models endpoint returns models under `data.models`. `app/routes/GeminiPage.tsx:179`, `app/routes/GeminiPage.tsx:182`, `app/routes/GeminiPage.tsx:185`, `server/api/models.ts:117`, `server/api/models.ts:125`
- Current readiness is partial: Gemini is the active local adapter in the operational context, the page is rich, and the backend model selector exists, but frontend model wiring and approval-mode consistency are broken. `/root/CLAUDE.md:167`, `app/routes/GeminiPage.tsx:552`, `app/routes/GeminiPage.tsx:286`, `server/api/gemini.ts:226`, `server/api/gemini.ts:231`

## 2. Gaps, mock & broken parts
- The model selector is visually wired but operationally unwired because the selected model is not included in the stream request body. `app/routes/GeminiPage.tsx:552`, `app/routes/GeminiPage.tsx:586`, `app/routes/GeminiPage.tsx:286`, `app/routes/GeminiPage.tsx:289`, `server/api/gemini.ts:226`
- The `/api/models` response shape does not match the frontend parser: the page reads `json.models`, while the handler returns `{ data: { models } }`. `app/routes/GeminiPage.tsx:182`, `app/routes/GeminiPage.tsx:185`, `server/api/models.ts:117`, `server/api/models.ts:125`
- The frontend offers `approvalMode` option `yolo`, but the backend only permits `default`, `auto_edit`, and `plan`, so a yolo send cannot be represented as the UI implies. `app/routes/GeminiPage.tsx:563`, `app/routes/GeminiPage.tsx:571`, `server/api/gemini.ts:231`, `server/api/gemini.ts:233`
- Zero-config gap: Gemini is assumed to live at `/usr/bin/gemini`, and the shared inventory still starts from MIMULE-specific services/containers; a fresh environment with Gemini installed elsewhere, a containerized Gemini runner, or no MIMULE services will not become a managed discovered asset. `server/api/gemini.ts:8`, `server/api/gemini.ts:10`, `server/api/gemini.ts:79`, `server/api/agents.ts:80`, `server/api/agents.ts:89`, `server/adapters/system.ts:9`, `server/adapters/system.ts:18`
- The yolo confirmation flow clears `input` before opening the confirmation modal, and the confirm handler calls `send()` again, so the confirmed send can return early with empty text. `app/routes/GeminiPage.tsx:259`, `app/routes/GeminiPage.tsx:271`, `app/routes/GeminiPage.tsx:278`, `app/routes/GeminiPage.tsx:283`, `app/routes/GeminiPage.tsx:628`
- Gemini session state is JSON-file backed with an in-memory active process map rather than durable DB job state. `server/api/gemini.ts:8`, `server/api/gemini.ts:11`, `server/api/gemini.ts:94`, `server/db/dashboard.ts:200`
- Gemini lifecycle mutations do not write `action_audit` rows for create, stream, stop, delete, model selection, or approval-mode choice. `server/api/router.ts:1174`, `server/api/router.ts:1187`, `server/api/router.ts:1193`, `server/api/gemini.ts:113`, `server/api/gemini.ts:157`, `server/api/gemini.ts:352`, `server/db/writer.ts:260`
- The page duplicates the Codex/Claude session-console implementation instead of using one shared component. `app/routes/GeminiPage.tsx:57`, `app/routes/CodexPage.tsx:57`, `app/routes/ClaudePage.tsx:57`, `app/routes/GeminiPage.tsx:428`, `app/routes/GeminiPage.tsx:587`
- Transcript counts hardcode actions and thoughts to zero, so Gemini tool use and reasoning are not fully reflected in filters or health context. `app/routes/GeminiPage.tsx:472`, `app/routes/GeminiPage.tsx:476`, `app/routes/GeminiPage.tsx:642`
- The backend sends an initial `started` event before parsing the model from Gemini output, then captures model in a later `message` event, so the UI cannot reliably show the effective model at stream start. `server/api/gemini.ts:254`, `server/api/gemini.ts:267`, `server/api/gemini.ts:270`
- Repeated Gemini failures, approval-mode mismatches, and model-load mismatches do not automatically create insights linked to `/gemini`. `app/routes/GeminiPage.tsx:313`, `server/insights/aggregate.ts:347`, `server/insights/scanners/ops.ts:162`, `server/insights/store.ts:58`

## 3. Goal alignment (G1–G9)
- G1: Make `/gemini` the active healthy CLI console for current agent work, with model choice and approval mode that actually affect execution.
- G2: Sell it standalone as a governed Gemini CLI operations UI with sessions, model selection, approval controls, transcript, stop, and audit.
- G3: Expose adapter health, workspace risk, model availability, and run status in one place.
- G4: Govern approval modes, yolo-like behavior, and model changes through RBAC, policy, confirmation, and audit.
- G4: Detect unknown Gemini and Gemini-adjacent AI systems: alternate CLI installs, running Gemini processes, containers, exposed model endpoints, MCP servers, and shadow provider keys should be surfaced before registration.
- G5: Use the shared console shell to keep the page dense, predictable, and consistent with Codex/Claude.
- G6: Make safe automatic actions possible, but require one explicit Apply for risky approval modes or high-risk workspaces.
- G7: Show AI reasoning before raw Gemini events: selected model rationale, approval risk, current run read, and recommended next action.
- G8: Make Gemini the reference implementation for active adapter pages and reuse its fixed patterns across Codex and OpenCode.
- G9: `/gemini` must work zero-config: absent Gemini shows an honest connect state, discovered Gemini assets can be registered in one click, and model options come from discovered/registered sources rather than stale hardcoded assumptions.

## 4. Best-practice research
- Pattern: "runtime controls must be executable controls." Every model/approval/output select must be reflected in the backend command and in audit evidence.
- Pattern: "confirmation preserves intent." Risk confirmation modals should hold a pending command object, not rely on mutable input state after the composer clears.
- Pattern: "capability-derived model menu." Model options should come from unified health/quality/fallback data, with defaults and unavailable states clearly marked.
- Pattern: "approval ladder." Present approval modes as increasing risk levels with policy requirements, not as raw CLI strings.
- Pattern: "effective runtime echo." Once a stream starts, show the effective model, approval mode, output mode, workspace, and CLI session id from backend events.
- Pattern: "shared session console." Active adapters should differ only by transport and item renderer; lifecycle, audit, health, handoff, and layout should be common.

## 5. Target design
- Layout: shared console shell with Gemini adapter. Left drawer for sessions, center transcript, bottom composer, right runtime rail for model, approval, output, workspace risk, health, related insights, and audit.
- Model selector: source options from `/api/models`, support `data.models`, show provider, logical name, availability, quality, cooldown, and fallback. Default to the best available Gemini route unless policy says otherwise.
- Fresh-environment state: the runtime rail starts with AI Inventory discovery. If Gemini is absent, show a no-runner/connect state; if a Gemini binary/process/container, model backend, provider key, or MCP server is discovered but unregistered, show Register, Ignore, and Re-scan before using it for model/routing decisions.
- Approval selector: replace raw `yolo` with governed labels: Default, Auto-edit, Plan-only, and High-risk override. High-risk override requires Apply with reason and policy decision.
- AI reasoning: show "Run read" before transcript with selected model rationale, approval risk, likely task intent, current blocker, and recommended action.
- Actions: send, stop, retry, archive, reroute, Vault handoff, and open insight use the same action rail as Codex/Claude.
- Empty/error states: missing binary, model unavailable, approval rejected, stream failed, stale run, and no sessions have distinct states and recovery actions.
- Mobile: runtime rail collapses into a sheet; model/approval/output controls stay touch-sized; confirmation modal preserves the pending prompt.

## 6. Features to add (prioritized)
- MUST: Send `runtimeOptions.model` to `/api/gemini/sessions/:id/stream`; acceptance: backend receives the selected model and launches Gemini with `--model`.
- MUST: Fix `/api/models` parsing; acceptance: model menu populates from `json.data.models` and gracefully handles legacy `json.models`.
- MUST: Add Gemini discovery enrollment; acceptance: a Gemini CLI outside `/usr/bin`, an unknown Gemini process/container, or related MCP/model endpoint appears as `unregistered-ai-system` or `exposed-model-endpoint` with Register, Ignore, and Re-scan, and Register updates Gemini health/model routing.
- MUST: Replace yolo flow with pending-send confirmation; acceptance: confirmed high-risk sends preserve prompt text, model, approval mode, output format, and attachments if later added.
- MUST: Align approval modes with backend; acceptance: UI only offers supported modes or maps high-risk override to an explicit backend-supported/policy-supported action.
- MUST: Move Gemini onto shared `SessionConsoleShell`; acceptance: no loss of runtime controls, transcript, yolo replacement, stop/delete, or handoff.
- MUST: Add lifecycle/runtime audit; acceptance: create, stream, stop, delete, selected model, approval mode, and high-risk override are audit-visible.
- SHOULD: Add credential discovery for Gemini/provider usage; acceptance: Google/Gemini or other AI-provider keys are reported only by presence/location as `shadow-api-key`, can be linked to the registered Gemini asset, and never expose secret values.
- SHOULD: Add effective runtime echo from backend stream start; acceptance: UI shows actual CLI session id/model once known.
- SHOULD: Add insights for repeated Gemini model/approval/stream failures; acceptance: findings link to `/gemini?session=...`.
- EXTRA: Add model recommendation chip that explains why a Gemini model was selected for this session.

## 7. Sellable-in-parts
- Standalone pitch: "Gemini CLI Control Console" - a governed web console for Gemini sessions with model-aware execution, approval controls, live transcript, and audit.
- Suite fit: Gemini is the active adapter in the all-in-one AI tool, sharing the health score, insights inbox, model registry, executor, RBAC, approvals, and Vault handoff.
- Packaging: sell as a Gemini operations module; bundle with Codex/OpenCode for multi-agent operations; bundle with gateway/model health for routing and fallback value.

## 8. Backend work
- Keep the existing backend model selector, but add tests around `body.model` and ensure the frontend sends it.
- Add `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts` probes plus `server/insights/scanners/discovery.ts`; Gemini consumes discovered Gemini binaries, running CLI processes, containers, MCP servers, model backends, and credential-presence signals.
- Add `discovered_assets` persistence and page endpoints: `GET /api/discovery/assets?kind=gemini`, `POST /api/discovery/assets/:id/register`, `POST /api/discovery/assets/:id/ignore`, and `POST /api/discovery/rescan`, returning fingerprints for binary path, process command, provider endpoint, source probe, and first/last seen.
- De-hardcode `server/adapters/system.ts` service/container/timer constants into seed hints, and make Gemini health prefer registered discovery assets over the fixed `/usr/bin/gemini` path. `server/adapters/system.ts:9`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`, `server/api/gemini.ts:10`, `server/api/gemini.ts:78`
- Consider emitting a richer `started` event after the effective model/session id is known, or add a follow-up `runtime` event for model/session metadata.
- Add lifecycle/runtime audit in `server/api/gemini.ts` for create, stream start, stream finish, stop, delete, selected model, approval mode, and high-risk override.
- Mirror session metadata into existing `workspace_sessions`/`jobs` where useful; keep raw transcript in current JSON until shared transcript schema work is justified.
- Add preflight helper shared with Codex/Claude for workspace risk, approval mode, model availability, and policy decision.
- Add insights detector hooks for repeated Gemini stream failures, model unavailable, approval mismatch, and stale active process.
- Use local governance modules only: RBAC, approvals, policy evaluator, audit export, and retention. Do not add OPA.

## 9. Build slices
- Slice 1: Minimal wiring fix in `app/routes/GeminiPage.tsx`; send `model`, fix `/api/models` response parsing, and add focused tests or smoke checks.
- Slice 2: Replace yolo confirm with pending-send object and backend-aligned approval modes; verify prompt is preserved after confirmation.
- Slice 3: Move Gemini onto shared console shell while keeping runtime controls and stream renderer intact.
- Slice 4: Add lifecycle/runtime audit and preflight risk decision; verify audit rows include model and approval mode.
- Slice 5: Add effective runtime event/display; verify selected model, backend effective model, and CLI session id agree.
- Slice 6: Add insights hooks for repeated Gemini failures and approval/model mismatches.
- Documentation updates for builders: update this plan file, `/root/DASHBOARD_V5_PLAN.md` route status, shared console component docs, Gemini runtime/API notes, and Vault/project handoff notes for approval-mode behavior.

## 10. Verification
- Model wiring: selecting a non-default Gemini model results in `--model <selection>` on the backend path and the UI shows the effective runtime.
- Models endpoint: the selector populates from `data.models` and does not fall back to stale hardcoded-only options when API data is present.
- G4/G9 discovery smoke: install or start a Gemini-compatible CLI/process/container outside `/usr/bin`; within one scan cycle `/gemini` and `/insights` show `unregistered-ai-system` with Register/Ignore/Re-scan, and Register updates Gemini health/model routing.
- Fresh-host smoke: on a host with no MIMULE services and no Gemini binary, `/gemini` loads as a truthful no-runner/connect state with no mock model/session data and no crash.
- Confirmation: high-risk confirmation preserves the original prompt and runtime options.
- Approval modes: UI labels map to backend-supported modes and policy decisions; unsupported yolo strings are gone or explicitly governed.
- Shared shell: Gemini shares layout and lifecycle controls with Codex/Claude without losing model/approval/output controls.
- Audit/insights: lifecycle and runtime choices are audited; repeated failures create a single linked insight.
- Mobile: runtime controls, transcript filters, modal confirmation, drawer, and composer remain readable and touch-accessible.
- Documentation: builder updates the page plan, master V5 plan, shared shell docs, Gemini runtime/API notes, and Vault/project handoff notes before closing the slice.
