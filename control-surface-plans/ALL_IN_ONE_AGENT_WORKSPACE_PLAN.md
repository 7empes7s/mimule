# All-in-one agent workspace — design brief

**Date:** 2026-07-18 UTC
**Status:** proposed design; implementation awaits operator confirmation
**Scope:** terminal, Codex, OpenCode, Claude, and Gemini CLI surfaces in the control surface; Google Antigravity is a competitive reference and possible future adapter, not an existing Gemini backend

## 1. Summary

Replace the five disconnected pages with one persistent **Agent Workspace** backed by a canonical session registry. Terminal sessions and agent sessions remain independent runtimes, but share authenticated navigation, model and inference controls, permissions, worktree ownership, status, search, and trace history.

This is a workspace merger, not a lowest-common-denominator protocol rewrite. Each harness keeps an adapter that exposes its real capabilities. The UI renders normalized controls and events where the harness supports them, preserves raw events for audit, and explicitly labels unsupported controls instead of silently ignoring them.

The target state makes OpenCode probe sessions an immutable internal session class. They are excluded in the server query layer from every normal list, count, search result, restore path, event stream, and dashboard while remaining available to a root-only audit CLI.

That target is **not true today**. A verified raw OpenCode upstream bypass remains reachable outside the authenticated Control Surface, and its service configuration exposes credentials too broadly. Exact host, route, listener, and unit evidence is retained only in the private AI Vault. Slice 0 containment is therefore a hard prerequisite: the brief must not claim that test sessions are hidden forever until the raw service is private and its credentials are remediated.

## 2. Primary action

The dominant action is **start or resume a session**.

Creating a session requires four visible choices:

1. workspace or project;
2. harness: Terminal, Codex, OpenCode, Claude, or Gemini CLI;
3. model route and inference profile;
4. isolation, ownership, and permission profile.

Safe defaults should make this a two-click action for an authorized operator. Full controls remain one disclosure level away and are saved as named profiles. A displayed choice is never silently ignored: the launch response records both requested and effective values.

## 3. Design direction

Keep the existing dense operator-console character: compact typography, strong status color, explicit timestamps, keyboard-first navigation, and high information density without dashboard-card clutter.

The visual reference is a combination of:

- Warp's persistent terminal ergonomics;
- VS Code's cross-workspace Agents window and traceability;
- Zed's project-grouped thread rail and terminal threads;
- Claude's searchable session history and export;
- OpenCode's provider and inference variants;
- Windsurf/Devin's workspace and worktree lifecycle;
- Antigravity's review artifacts and asynchronous agent manager, as a future-facing reference rather than a claim about the current Gemini CLI page.

The interface must distinguish four concepts visually and semantically:

- **workspace** — a durable project context;
- **session** — one agent or terminal conversation;
- **run** — one model turn or command lifecycle;
- **artifact** — a diff, checkpoint, plan, report, screenshot, or receipt.

## 4. Layout

### Persistent application dock

A narrow global activity dock remains mounted while the authenticated operator navigates among private control-surface pages. It is not mounted on `/status`, before authentication, or for users who cannot view the underlying sessions. It shows running, waiting, failed, and completed runs attached to active sessions. Collapsing a session changes layout only; it never stops or detaches the runtime.

The dock supports:

- session status and harness icon;
- concise title, project, model, and elapsed time;
- unread/output and needs-input indicators;
- one-click restore to the Agent Workspace;
- stop only from an explicit action menu.

Every dock query is tenant-, owner-, and ACL-scoped on the server. In particular, the current root-terminal boundary remains bootstrap-owner-only; adding a global dock must not disclose root terminal titles, directories, or status to an ordinary viewer.

### Agent Workspace route

The full workspace has three resizable regions:

1. **Session rail** — grouped by workspace/project and then repository/worktree. It supports fuzzy search, saved filters, tags, archive, status, harness, model/provider, branch, and time filters.
2. **Active canvas** — structured conversation, raw terminal, or split view. A session can switch between structured and native-terminal views when its adapter supports both.
3. **Inspector** — collapsible tabs for Trace, Changes, Context, Runtime, and Artifacts.

The composer remains anchored at the bottom of the active canvas. Harness, model, inference profile, isolation, and permission posture are visible immediately above it.

### Multiple sessions

Sessions may open in tabs, vertical or horizontal splits, or remain collapsed in the dock. Layout is persisted per tenant, operator, and workspace. The same live session cannot accept conflicting input in two places. A server-enforced writer lease with a monotonic fencing epoch makes every other attachment read-only until control is explicitly transferred or the session is forked; this is not a UI-only convention.

## 5. Key states

Do not force session, run, and browser transport into one misleading state machine. The canonical record has three orthogonal axes plus an action flag:

- **Session lifecycle:** `active`, `archived`, `stopped`, `stale`.
- **Run lifecycle:** `queued`, `starting`, `running`, `waiting_for_tool`, `waiting_for_operator`, `completed`, `failed`, `canceled`.
- **Attachment state:** `attached`, `detached`, `reconnecting`, `unreachable`.
- **Action flag:** `needsOperator = true | false`, with a typed reason.

A completed turn does not complete its resumable conversation. A detached browser does not stop a runtime. Every state transition carries an adapter event sequence, registry revision, source timestamp, and ingest timestamp so a stale stream cannot overwrite newer truth.

The rail and dock show the active session lifecycle, latest run lifecycle, attachment state, last meaningful event, elapsed time, and whether operator action is required. Connection loss is never shown as process termination.

Important empty and failure states:

- no sessions yet, with one primary New Session action;
- adapter unavailable, with the exact failed dependency;
- model unavailable, with credential/model health evidence and safe alternatives;
- unsupported inference control, visibly disabled with the reason;
- stale or detached runtime, with attach, fork, archive, and inspect-log actions;
- conflicting worktree ownership, with an explicit isolation choice;
- trace incomplete, with the missing adapter capability identified.

## 6. Interaction model

### Session lifecycle

- New sessions default to the current workspace and last safe profile.
- Sessions survive route changes, refreshes, and browser disconnects. Control-surface restart survival is promised only for runtimes owned by a separate supervisor or a reconstructable external runtime; the current in-process Codex, Claude, and Gemini child maps do not meet that bar.
- Close collapses the view. Archive removes it from the active rail. Stop terminates the runtime. Delete permanently removes history and remains a separate destructive action.
- Resume attaches to the same canonical session. Fork copies context and creates a new identity. Handoff changes harness only when both adapters can express the required context and artifacts.

The control surface does not use a browser response as the run owner. A versioned adapter contract creates the run through an idempotent server command, a supervisor owns the process/cgroup and event spool, and any authorized browser or CLI may subscribe later. Stop targets the exact managed process group and proves that no descendants remain. On restart, reconciliation reports `restored`, `stale`, or `unreachable`; it never guesses that an in-memory `running` flag is authoritative.

Before any two write-capable sessions can target the same repository, the registry acquires a worktree or workspace writer lease. Model comparison is read-only unless each candidate has an isolated worktree; compare mode cannot ship ahead of this protection.

### Terminal lifecycle

Replace the single hard-coded `tib-root` terminal with a server-owned PTY registry. Each managed terminal receives an opaque stable session id and a dedicated tmux-backed process on a reserved control-surface tmux socket and namespace. User titles are display data and are never interpolated into shell commands. The existing `tib-root` session remains attach-only until an explicit migration. WebSockets attach and detach from the process; zero browser clients do not stop it.

Terminal actions include new, rename, duplicate layout, split, attach, detach, stop, archive, search scrollback, and open as an agent context attachment. The server enforces bounded concurrent sessions and per-session output retention. It owns scrollback capture so output produced while every browser is detached is available on reconnect. One attachment holds the input-and-resize lease; spectators cannot type or resize the pane until a fenced takeover succeeds. Stop can kill only an exact registry-owned tmux session and never a broad user tmux target.

### Model and inference controls

The model picker is fed by a future authoritative route inventory plus harness-local discovery and health evidence. The current `/api/models` response is not yet authoritative for tool, vision, structured-output, reasoning, output-limit, pricing, or harness compatibility, so unknown fields stay visibly unknown instead of being inferred. Each option shows:

- provider and endpoint;
- model id and friendly alias;
- availability and credential state;
- context/output limits;
- tool, vision, structured-output, and reasoning support;
- recent latency, success rate, cost, and last validation time;
- routing mode: exact model, fallback chain, automatic, or compare.

Controls are capability-negotiated per **harness + adapter version + route**, not merely per friendly model name. The inventory preserves distinct namespaces for LiteLLM logical routes, provider/model ids, and native Codex, Claude, Gemini, and OpenCode models. It also supports server-side custom connection profiles with an API dialect, base endpoint, credential reference, and capability probe; secret headers and values never enter browser state.

The shared schema includes reasoning effort or budget, variant, temperature, top-p, maximum output, verbosity, context/compaction, tool/MCP profile, sandbox, network access, and approval policy. Adapter-specific controls remain available under Advanced. Launch records both the requested configuration and the exact effective configuration or redacted invocation. Unsupported values fail validation rather than disappearing.

OpenCode model selection must become session/run-scoped; its current UI mutates `/global/config`, which would cause cross-session model changes. Gemini must consume the actual nested `data.models` response, send its selected `model`, and either implement or remove the currently ineffective `yolo` option. Concurrent adapter tests prove that two sessions can use different models and inference profiles without cross-talk.

Changing the model mid-session creates a trace event. If the harness cannot safely change it in place, the UI offers a context-preserving fork rather than pretending the change succeeded.

### Keyboard and customization

- command palette for every action;
- configurable shortcuts for new session, switcher, split, collapse, stop, fork, model picker, and trace;
- saved workspace layouts and named launch profiles;
- adjustable rail/inspector density, font size, terminal theme, status-line fields, and notification rules;
- responsive behavior preserves the session rail as a drawer and the global dock as a compact strip on narrow screens.

## 7. Content requirements

### Canonical session manifest

Every session records:

- stable session and parent/fork ids;
- tenant id, owner user id, ACL/share posture, required role, and created-by identity;
- visibility classification, immutable hidden flag, classifier version, and classification receipt;
- workspace, repository, directory, worktree, branch, and isolation type;
- harness, adapter version, transport, process identity, and host;
- requested and effective model route, provider, endpoint reference, inference parameters, and capability snapshot for every run;
- permission, sandbox, network, tool, MCP, skill, and instruction profiles;
- created, updated, attached, detached, stopped, archived, and completed timestamps;
- registry revision, event sequence cursor, writer-lease owner/fencing epoch, trace correlation id, and artifact references.

Secret values are never stored in the manifest or sent to the browser. It contains only server-side credential references and redacted command previews.

### Trace timeline

The normalized timeline contains prompts, streamed output, reasoning summaries when exposed, tool calls and results, approvals, file patches, checkpoints, route attempts, health decisions, tokens, cost, latency, cache usage, compaction, retries, and parent/subagent provenance. A server-side spool begins at run creation so navigation or a disconnected HTTP client cannot discard background events.

Raw adapter payloads are retained only under bounded, configurable retention with redaction at ingestion and protected storage. Normalized events carry a hash-chain or equivalent tamper-evident receipt. OpenTelemetry export is opt-in and applies the same redaction policy. Sessions export to human-readable Markdown and structured JSONL; the inspector can jump from a session event to the corresponding diff, terminal span, health record, or receipt.

Raw PTY bytes do not honestly prove shell command boundaries or exit codes. Trustworthy terminal command spans require explicit shell integration such as OSC 133 or audited shell hooks. Without it, the trace stores bounded raw output and labels command/exit metadata unavailable; it never reverse-engineers authoritative commands from prompt text.

Legacy migration promises preservation of all **available** history without additional loss, not reconstruction of data that was never persisted. Current Claude and Gemini wrappers stream some tool/usage events without saving them, and current OpenCode client state ignores non-active-session events. Legacy trace gaps are labeled with the adapter and missing capability.

### Durable OpenCode test-session invisibility

This is a backend invariant, not a CSS filter.

- Introduce `classification = internal_test` and `visibility = hidden` in the canonical registry.
- Future probes use the exact reserved namespace `__mimule_probe_v1__:` in producer-authored title/metadata. Every known health, validation, and agentic-model probe callsite must use it. Ordinary GUI clients cannot request the reserved classification.
- Backfill the verified legacy population once by snapshotting the exact OpenCode session ids that match the root-directory/default-title/status-probe evidence. Persist those ids as hidden. The signature is evidence for the migration receipt, not a permanent rule that could hide a legitimate future root session.
- Apply the exclusion before serialization in session lists, recents, search, counts, session-derived dashboards/analytics, imports, restored state, notifications, event streams, and the global registry.
- After Slice 0 makes the raw OpenCode service private, replace generic control-surface passthrough with a path-aware allowlist. Filter `/session`, deny every normal direct-id descendant for hidden sessions (messages, diffs, permissions, abort, delete), and parse/filter `/event` SSE before it reaches a browser.
- Hidden records are never auto-unhidden by a reindex, title edit, provider restart, or session import.
- A root-only diagnostic CLI may include them with an explicit `--include-internal` flag. No normal GUI path exposes them.
- Permanent deletion remains separate; hiding must not destroy trace evidence.

### Current gaps verified in the repository

- A raw OpenCode upstream currently bypasses the authenticated Control Surface; invisibility cannot be guaranteed until Slice 0 is accepted. Exact reproduction details are private operational evidence, not public documentation.
- Terminal currently attaches every client to one configured tmux session.
- Codex and Claude use hard-coded broad permission bypasses and expose no model/inference picker; Gemini also uses `--skip-trust`.
- Gemini has a model control in the UI, but reads the wrong `/api/models` envelope, omits the selected model from the stream request, and offers a `yolo` value the backend silently ignores.
- OpenCode has the richest model/permission controls, but its raw session list currently contains probe noise, its event stream is generically proxied, and model selection mutates global config rather than a session/run.
- Codex, Claude, and Gemini run ownership is held in in-memory process maps, so control-surface restart recovery is not currently durable.
- Codex, Claude, and Gemini persist whole-session JSON files without transactional concurrency; the existing `workspace_sessions` table is too small and lacks tenant/user ownership for the proposed registry.
- Claude and Gemini do not persist all streamed tool/usage events, so historical trace completeness cannot be fabricated.
- The four agent pages duplicate session state and lifecycle logic, so navigation and streaming behavior are inconsistent.

## 8. Recommended implementation references

Use the following design skills during implementation:

- `layout` for the three-region workspace and persistent activity dock;
- `adapt` for narrow-screen drawers, touch targets, and resizable regions;
- `clarify` for lifecycle verbs such as collapse, archive, stop, fork, and delete;
- `typeset` for dense trace and terminal readability;
- `polish` for status alignment, focus states, shortcuts, and empty states;
- `audit` before release for accessibility, responsive behavior, performance, and unsafe UI patterns.

Primary competitive references:

- [VS Code Agents window](https://code.visualstudio.com/docs/agents/agents-window), [session management](https://code.visualstudio.com/docs/chat/chat-sessions), and [agent monitoring](https://code.visualstudio.com/docs/agents/guides/monitoring-agents)
- [Zed parallel agents](https://zed.dev/docs/ai/parallel-agents), [Agent Panel](https://zed.dev/docs/assistant/assistant-panel), and [external agents](https://zed.dev/docs/ai/external-agents)
- [Warp sessions](https://docs.warp.dev/terminal/sessions) and [agent conversations](https://docs.warp.dev/agent-platform/local-agents/interacting-with-agents)
- [Claude sessions](https://code.claude.com/docs/en/sessions), [worktrees](https://code.claude.com/docs/en/worktrees), and [permissions](https://code.claude.com/docs/en/permissions)
- [OpenCode CLI](https://opencode.ai/docs/cli/), [server](https://opencode.ai/docs/server/), [models](https://opencode.ai/docs/models), and [permissions](https://opencode.ai/docs/permissions/)
- [Devin session tools](https://docs.devin.ai/work-with-devin/devin-session-tools) and [environment snapshots](https://docs.devin.ai/product-guides/snapshots)
- [Windsurf worktrees](https://docs.windsurf.com/windsurf/cascade/worktrees), [Memories and Rules](https://docs.windsurf.com/windsurf/cascade/memories), and [Workflows](https://docs.windsurf.com/windsurf/cascade/workflows)
- [Google Antigravity agent manager and Artifacts](https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/)
- [Arena side-by-side comparison](https://arena.ai/how-it-works) and [explicit routing/fallback trace](https://portal.api.preview.arena.ai/docs/routing)
- [Conductor](https://www.conductor.build/docs), [T3 Code](https://t3.codes/), and [Agent Deck](https://github.com/asheshgoplani/agent-deck)

### Competitive adoption scorecard

These are behaviors to adopt and verify, not claims that MIMULE already has parity. A reference earns a place only when it maps to a delivery slice and an executable acceptance gate.

| Reference | Behavior worth adopting | Current MIMULE fact or gap | Slice | Acceptance test |
|---|---|---|---|---|
| VS Code | One session history and monitoring surface across windows/workspaces | Sessions are split across four pages and terminal; no canonical monitor | 3 | Start one session per harness, navigate away, then find and restore each from one rail with correct live state |
| Zed | Project-grouped parallel agent threads with fast switching | OpenCode has one active client state; other pages auto-pick independently | 3 | Run three project-scoped sessions concurrently; switching never drops background events or changes another session's selection |
| Warp | Persistent terminal sessions with searchable, structured command blocks | One `tib-root` tmux attachment; detached server scrollback and trustworthy command spans are absent | 2 and 5 | Two detached terminals retain output; OSC/shell-integrated commands have exit codes, while raw PTY-only spans are labeled unstructured |
| Claude | Explicit resume, fork, worktree, and permission posture | Claude wrapper resumes but hard-codes a broad bypass and has no worktree ownership | 4 | Resume and fork preserve lineage; two write sessions receive distinct worktrees; every permission profile reaches the effective invocation |
| OpenCode | Broad provider/model choice, variants, structured events, and permission prompts | Model selection is global and hidden test sessions leak through raw list/event surfaces | 0, 1, and 4 | Public raw API is closed; hidden ids cannot leak; two sessions use different model/variant profiles without cross-talk |
| Cursor | Background agents plus user-visible checkpoints and rollback | Runs can continue, but there is no canonical checkpoint/rollback artifact | 5 | Create a checkpoint, make a patch, inspect the diff, restore it, and verify the rollback receipt and git state |
| Devin | Unified progress across shell/editor/browser, operator takeover, and reproducible environment snapshots | MIMULE exposes separate transcripts and terminal, with no supervised environment snapshot contract | 5 and 6 | One run correlates shell, diff, and optional browser artifacts; takeover uses a fenced lease; a profile recreates the same validated environment |
| Windsurf | Conversation-scoped worktrees plus explicit workspace rules, memories, and reusable workflows | Worktree isolation is optional/later and context sources are not presented as one inspectable profile | 1, 4, and 6 | A coding session gets an isolated worktree before launch; inspector shows exact AGENTS/rules/skills/workflows and their source digests |
| Antigravity | Agent-manager overview and reviewable Artifacts with feedback anchored to the artifact | No Antigravity adapter exists; current Gemini page is only Gemini CLI and artifacts are scattered | 3 and 5 | Manager view shows parallel runs; comment on a plan/diff/screenshot artifact creates a correlated follow-up event without mislabeling Gemini as Antigravity |
| Arena | Side-by-side model comparison plus explicit resolved-model, fallback-reason, and trace identity | Compare mode is only proposed; route resolution is not attached to every agent run | 4 and 5 | Read-only blind compare preserves equal prompt/context; reveal records each model; fallback run shows requested route, attempts, resolved model, reason, and trace id |
| Conductor | Parallel coding agents isolated by worktree with deliberate merge/review | Current pages can point multiple writers at the same checkout | 1 and 4 | Registry refuses a second shared-checkout writer; isolated results can be reviewed and merged independently |
| T3 Code | Local, harness-independent session workspace with a restrained common shell | MIMULE duplicates nearly identical page chrome and lifecycle code | 3 | Legacy deep links resolve into one shared shell while each adapter retains every feature in its parity checklist |
| Agent Deck | Keyboard-first terminal/agent session switching and compact status visibility | Current terminal has no multi-session deck or persistent collapsed activity strip | 2 and 3 | Keyboard-only operator can create, rename, filter, collapse, switch, attach, and stop the correct session with visible focus and status |

## 9. Delivery slices and acceptance gates

### Slice 0 — contain raw OpenCode exposure

This is an operational hard prerequisite, not a cosmetic workspace task. The verified current state includes an externally reachable raw upstream bypass and provider credentials stored too broadly in service configuration. Exact exploitation and service coordinates remain in the private AI Vault.

- Bind the raw OpenCode service to loopback or a root-owned Unix socket; firewall its listener from every non-loopback interface.
- Remove the public reverse-proxy/DNS route to the raw upstream. If a compatibility route must temporarily exist, place it behind the same authenticated, path-aware control-surface policy as the workspace; do not proxy `/session`, `/event`, `/global`, or arbitrary ids directly.
- Move provider credentials to a root-owned `0600` environment file, rotate every credential that was inline in the unit, and expose only credential names and one-way configuration digests to diagnostics.
- Permit upstream access only from the control-surface server and its explicit local health probe.

Gate: unauthenticated external session, model, event, and direct-id requests are unavailable; the raw listener is loopback-only; service-unit inspection contains no credential values; and the loopback health check plus authenticated Control Surface adapter still work. No later claim that internal sessions are hidden is valid until this gate passes. Production systemd, firewall, reverse-proxy, DNS, and credential rotation are separate one-shot operator-authorized actions.

### Slice 1 — visibility invariant, durable registry, and ownership foundation

- Add durable, migration-backed `agent_sessions`, `agent_runs`, `agent_events`, `visibility_receipts`, `artifacts`, and `leases` records with `tenant_id`, `owner_user_id`, ACL/role data, requested/effective launch configuration, monotonic sequence numbers, revisions, and `0600` local storage.
- Import the immutable exact set of known legacy test-session ids once, record a migration receipt, and classify every new internal probe only by the exact `__mimule_probe_v1__:` marker emitted by every known test producer. Do not retain a permanent heuristic that could hide an operator session.
- Replace the generic OpenCode passthrough with a path-and-method allowlist. Apply one shared authorization/visibility predicate to list/search/count endpoints, direct-id descendants, mutations, and filtered/resequenced SSE; deny unknown upstream paths by default.
- Introduce a versioned, idempotent adapter contract and durable event spool. Keep launch behavior unchanged until Slice 4, but make registry/event reconstruction independent of adapter process memory and whole-file JSON snapshots.
- Enforce tenant, owner, role, and root-diagnostic boundaries server-side. Add repository/worktree ownership and a fenced writer lease before permitting parallel coding sessions; reject a second writer against the same shared checkout.

Gate: all exact hidden sessions are absent from every normal list, direct-id descendant, event stream, search, count, restart, reindex, and import path, while an explicit root-only diagnostic can audit them. A viewer cannot discover or mutate another owner’s session; no public/raw upstream bypass remains; the registry and ordered event tail reconstruct after a control-surface restart; and a second shared-checkout writer is rejected before launch.

### Slice 2 — real multi-session terminal

- Add PTY/tmux creation and lifecycle APIs on a reserved socket/namespace with opaque control-surface ids. Treat the legacy `tib-root` session as attach-only during migration.
- Add attach/detach WebSockets, server-retained bounded scrollback, and an explicit writer lease/fencing epoch; additional attachments are read-only spectators until a deliberate takeover.
- Add tabs, splits, an authenticated collapsed global dock, reconnect, and per-owner persisted layout. Exact stop must address one owned session and never use broad tmux process matching.

Gate: two terminals remain alive while navigating between unrelated pages, survive browser and control-surface service restarts under a qualified supervisor, retain detached output, reconnect to the correct processes, and show no input/resize/scrollback cross-talk. A takeover fences the stale writer, and exact stop leaves unrelated tmux sessions untouched.

### Slice 3 — unified read surface

- Move existing Codex, Claude, Gemini, OpenCode, and Terminal sessions into the shared rail and canvas.
- Preserve each legacy route as a redirect/deep link until parity is demonstrated.
- Subscribe the shared shell to the durable registry/event spool rather than page-local active-session state; preserve all history that the current adapters actually retained and label unavoidable legacy gaps instead of fabricating completeness.
- Normalize lifecycle, run, attachment, search, archive, resume, failure, and `needsOperator` handling. Keep the dock and session data behind authenticated, tenant/owner-aware routes; the public `/status` surface must not bootstrap them.

Gate: every available existing transcript is reachable without additional migration loss, background-session events continue while another route is open, the public status page exposes no dock or session bootstrap, and each legacy harness passes a documented feature-parity checklist before its page becomes only a deep link.

### Slice 4 — complete launch controls

- Add capability negotiation from a harness-specific adapter schema and route-specific inventory. Show only combinations supported by the harness, adapter, selected route, modality, reasoning mode, tools, context limit, permission profile, isolation mode, and transport.
- Persist requested and effective configuration per run, including resolved model, route attempts, fallback reason, inference parameters, and unsupported-field errors. Treat arbitrary OpenAI-compatible endpoints as explicit connection profiles with redacted secrets, never as an unvalidated generic promise.
- Fix the three known integration traps before exposing the form: Gemini inventory envelope parsing, Gemini model propagation into the stream launch, and the currently ignored Gemini YOLO/permission value. Replace hard-coded Codex/Claude bypasses with named permission profiles, and make OpenCode model/variant selection session- or run-scoped rather than a mutation of global config.
- Add exact-route, fallback, auto, and comparison modes. A writable comparison must allocate distinct worktrees and writer leases before launch; otherwise comparison is read-only. Equal-prompt/blind comparison must capture an immutable context digest before revealing model identity.
- Launch every adapter under a qualified supervisor with an idempotent command, owned cgroup/process identity, restart policy, and durable completion receipt. Do not equate a browser reconnect to process survival.

Gate: an adapter contract test for every harness proves each displayed control reaches the effective invocation, the resolved model and permissions match the receipt, and unsupported combinations cannot be submitted. Two concurrent sessions can select different models/variants without global cross-talk; writable comparisons receive separate worktrees; forced supervisor/control-surface restarts recover or truthfully terminate each run.

### Slice 5 — trace, changes, artifacts, and CLI

- Build the trace inspector over the Slice 1 durable event spool: bounded/redacted raw envelopes, tamper-evident event and artifact digests, tool and route attempts, diff/checkpoint review, JSONL/Markdown export, and opt-in OpenTelemetry export.
- Record terminal commands and exit codes only when a verified OSC/shell-integration boundary supplies them. Label legacy and raw PTY byte ranges as unstructured; never infer a trustworthy command trace from terminal text alone.
- Add a versioned `mimule-agent` CLI that creates, lists, attaches, stops, forks, exports, and inspects through the same authenticated API and idempotency keys as the GUI. It may use a protected local Unix socket for root diagnostics, but must not create a second state store or bypass ownership policy.

Gate: one end-to-end session from each harness produces a correlated, exportable trace with requested/effective model route, permissions, available structured tools/commands, changes, usage, and explicitly typed terminal spans. GUI and CLI retries converge on one run; an export verifies its digest chain and redaction rules; a raw PTY-only run is truthfully marked as lacking command/exit-code evidence.

### Slice 6 — workspaces, profiles, and hardening

- Add saved Spaces, layout/launch profiles, container/remote isolation, advanced worktree review/merge flows, notifications, responsive polish, load testing, configurable retention, backup, and recovery drills.
- Add inspectable project context profiles that list the exact rules, `AGENTS.md`, skills, workflows, memories, environment snapshot, and source digests available to a run. Keep secrets out of client state and trace payloads.

Gate: concurrent sessions cannot overwrite one another’s worktree or controls; a saved profile recreates a validated environment and context manifest; secrets never reach client state or trace payloads; load, retention, backup, restore, browser restart, adapter restart, and service restart drills recover the registry deterministically.

## 10. Open questions and recommended defaults

The following defaults are recommended for operator confirmation:

1. **Canonical organization:** project/workspace first, then repository/worktree, then session.
2. **Legacy routes:** keep as redirects/deep links during migration; remove only after parity tests.
3. **Raw OpenCode containment:** bind loopback/Unix-socket only, remove the public raw route, move secrets to a root-only file, and rotate exposed credentials before trusting visibility controls.
4. **Tenancy and ownership:** design for one local organization initially, but require tenant, owner, ACL/role, and root-diagnostic fields at the durable boundary so “single operator” never becomes an implicit authorization rule.
5. **Default isolation:** shared checkout only for deliberately attached raw terminals; worktree plus a fenced writer lease for coding agents; read-only or distinct worktrees for comparisons; container/remote available per profile.
6. **Default permission posture:** confirm writes and risky commands; allow read-only inspection. Never silently inherit current bypass flags or translate an unsupported permission into a more permissive one.
7. **Trace retention:** keep normalized metadata, visibility receipts, launch/completion receipts, and artifact digests indefinitely; make redacted raw envelopes and terminal/output retention configurable per workspace.
8. **Internal tests:** retain the immutable exact legacy-id migration set and classify future probes only by `__mimule_probe_v1__:`. Hide them from every normal path forever, but preserve a root-only, audited diagnostic path; never use a broad name heuristic.
9. **Survival contract:** supervise each run explicitly and distinguish “browser detached,” “adapter disconnected,” “process alive,” “run terminal,” and “recoverable after supervisor/control-surface restart.”
10. **Protocol strategy:** use structured native adapters now, add Agent Client Protocol where it provides parity, retain PTY fallback for every harness, and label the evidence quality of each transport.
11. **Inference scope:** initially guarantee agentic text/code, tool use, structured output, multimodal input where the selected harness and route support it, and explicit reasoning controls. Treat image/audio/video generation, embeddings, reranking, and batch APIs as separately capability-gated adapters rather than claiming that “any inference” already works.
12. **Gemini versus Antigravity:** the current integration is Gemini CLI. Antigravity is a distinct future adapter/reference and must never be implied by renaming the Gemini page.

Explicit confirmation of this Shape brief authorizes bounded code specifications for Slice 1 and Slice 2 after the Slice 0 acceptance evidence exists. It does not authorize production systemd, firewall, reverse-proxy, DNS, or credential-rotation changes; those require a separate one-shot operator approval. Each later slice remains gated on the preceding acceptance tests, and no implementation may weaken the exact hidden-session, ownership, or trace-truthfulness invariants to reach parity sooner.
