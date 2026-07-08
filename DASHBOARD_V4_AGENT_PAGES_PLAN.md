# Dashboard V4 Agent Pages Plan

Last updated: 2026-05-09 UTC
Parent plan: `/root/DASHBOARD_V4_PLAN.md`
Canonical app path: `/opt/opencode-control-surface/`
Public URL: `control.techinsiderbytes.com`
Scope: Claude, Codex, and OpenCode pages plus shared workspace agent UX

---

## Session Context

Claude Code prepared this plan inline on 2026-05-09 but could not save it because its Write tool was denied in `dontAsk` mode. Marouane's follow-up message was queued, but Claude did not answer it because the session hit a 429 usage limit:

```text
You're out of extra usage - resets 11:10am (UTC)
```

That confirms the control-surface Claude path is using the logged-in Claude Code account/subscription path rather than the exhausted Anthropic API key path. The working implementation already launches Claude CLI with `--permission-mode dontAsk`, because `--dangerously-skip-permissions` is blocked by Claude CLI under UID 0.

Marouane's latest direction:

- Claude working and responding through the subscription-backed CLI path is the desired behavior.
- OpenCode can share the same experience as Claude Code and Codex; feature parity matters more than keeping OpenCode visually separate.
- Agent-page capabilities must be dynamic, not hardcoded.
- Existing stack skills must be discovered and surfaced, especially pipeline, NewsBites development, stack status, GPU, deploy, and dashboard skills.

---

## Product Goal

The agent pages should become a single operator cockpit for running local and cloud coding agents from the browser:

- Claude, Codex, and OpenCode should expose the same core controls where each CLI supports them.
- The UI should discover available skills, commands, profiles, models, and workspace roots from disk or live CLI probes.
- The operator should not need to remember exact slash commands, skill names, model flags, permission modes, or cwd-specific runbooks.
- Every launched run should preserve enough metadata to resume, audit, cost-check, and log to AI Vault.

This is part of Dashboard V4's `/workspace` and `/agents` work, not a separate product.

---

## Non-Goals

- Do not impersonate Anthropic or OpenAI hosted apps. Use local CLIs, local state, and documented flags.
- Do not fork Claude, Codex, or OpenCode. Wrap the installed tools.
- Do not hardcode the skill catalog, command list, or project roots beyond a minimal allowlist fallback.
- Do not make OpenCode a second-class page. If a feature is possible through OpenCode SDK or CLI, design it into the same shared composer model.
- Do not auto-run expensive or mutating work from a discovered skill without explicit operator action.

---

## Dynamic Discovery Contract

The agent pages must have a server-side discovery layer. The browser should render what the server finds at request time.

### Skill Sources

Current verified sources:

- Claude local skills: `/root/.claude/skills/*/SKILL.md`
- Codex skills: `/root/.codex/skills/*/SKILL.md`
- Shared design skills: `/root/.agents/skills/*/SKILL.md`
- OpenCode repo skills: `/opt/opencode-control-surface/.opencode/skills/*/SKILL.md`
- OpenCode root skill: `/opt/opencode-control-surface/.opencode/SKILL.md`
- Plugin-provided Codex skills: `/root/.codex/plugins/cache/*/skills/*/SKILL.md`
- Plugin-provided Claude commands, if present: `/root/.claude/plugins/cache/*/commands/*`

Known high-value stack skills already present:

- Claude: `pipeline`, `newsbites-devcheck`, `newsbites-make`, `newsbites-debugger`, `stack-status`, `gpu-health`, `tib-deploy`, `dashboard-v2`
- Codex: `editorial-pipeline`, `mimule-ops`, `newsbites-article`, `newsbites-debugger`, `newsbites-devcheck`, `newsbites-make`, `tib-stack`, `vast-gpu`
- OpenCode: `docker-cloudflare-deploy`, `mobile-control-surface`, `model-registry`, `opencode-primitives`, `ops-adapter-boundary`, `streaming-chat-ui`

### Runtime Options

Discover or probe:

- CLI availability and version for `claude`, `codex`, and `opencode`
- Auth state and last observed error
- Supported permission/sandbox modes
- Supported model/profile/effort modes
- Supported agent/subagent modes
- Supported hook/rule/permission configuration
- Supported image/file attachment modes
- Local GPU and LiteLLM health for OSS/local routes
- Workspace roots and current git state
- Existing sessions and resumable session IDs
- Existing MCP servers, OAuth state, exposed prompts, exposed resources, and enabled/disabled tools
- Existing provider/model lists, cost stats, and quota/rate-limit signals

If a probe fails, return a typed degraded state with evidence. Do not silently remove the feature from the UI.

---

## Research Addendum - 2026-05-09

Sources checked:

- Local CLI help for `claude`, `codex`, and `opencode`.
- Claude Code docs for CLI flags, skills, slash commands, MCP, subagents, and hooks.
- OpenAI Codex docs for CLI features, MCP, app-server, non-interactive execution, reviews, subagents, and cloud tasks.
- OpenCode docs for CLI commands, agents, sessions, stats, MCP, providers, GitHub agent flow, and permissions.

### Claude Features To Surface

Claude supports more than the first draft captured:

- **Skills and slash commands**: discover skills from user/project/add-dir skill directories, project and personal `.claude/commands`, plugin skills, bundled skills, and MCP-exposed prompts.
- **MCP resources**: support `@`-style resource references from MCP servers; the dashboard should expose a resource picker, not only a slash picker.
- **MCP management**: list, add, get, remove, serve, and reset project-scoped MCP choices; show OAuth/auth state where available.
- **Subagents**: discover configured agents, expose `--agent` selection, support `--agents` JSON definitions later, and record which subagents were invoked.
- **Hooks**: inspect configured hooks, show hook event counts, and surface hook failures; support async hook output as background job evidence.
- **Run modes**: model, effort, permission mode, plan mode, allowed/disallowed tools, add-dir, worktree, tmux, fork-session, continue/resume, PR resume, name, bare mode, remote-control, Chrome/IDE toggles where practical.
- **Output controls**: stream-json, partial messages, hook lifecycle events, JSON schema output, max budget, file resources, debug logs, and fallback model for print runs.
- **Cloud/review actions**: `ultrareview`, PR comment/review-oriented workflows, and remote-control sessions should appear as explicit advanced actions, not hidden CLI flags.

### Codex Features To Surface

Codex has a broader product surface than the current control page:

- **Input and output**: image attachment, JSONL events, output schema, output-last-message file, ephemeral sessions, ignore config/rules, and skip git repo checks.
- **Review**: local review against uncommitted changes, base branch, or commit, with custom instructions.
- **Cloud tasks**: list, status, submit, diff, and apply Codex Cloud tasks where authenticated.
- **Diff apply**: expose `codex apply` and cloud apply as reviewed, auditable actions with preview.
- **App server**: use `codex app-server` as a future deeper integration path for rich clients with authentication, conversation history, approvals, streamed events, and generated TypeScript/JSON schemas.
- **Remote control**: expose remote-control status and launch only behind explicit operator authentication.
- **MCP**: list/add/login/logout MCP servers, show required/enabled/disabled tools, startup/tool timeouts, OAuth callback config, and project-scoped config.
- **Skills, rules, hooks, plugins, and AGENTS.md**: discover and display as context sources; allow opening exact source files from the dashboard.
- **Slash/session controls**: model/reasoning, fast mode, web search, status, debug-config, statusline/title fields, and background terminal status.
- **Local/OSS route**: support `--oss` and `--local-provider ollama|lmstudio` as first-class controls when health checks pass.

### OpenCode Features To Surface

OpenCode already exposes enough to reach parity in most visible areas:

- **Sessions**: list/delete, continue by session, fork, export/import JSON or share URL, and attach to a running server.
- **Stats and costs**: `opencode stats` returns token/cost summaries by day, project, tool, and model; this should feed the shared `CostMeter`.
- **Providers and models**: `opencode models` returns a large live provider/model catalog; the model selector should read it dynamically.
- **Agents**: primary and subagent modes, global/project Markdown agents, JSON config agents, hidden agents, child sessions, max steps, temperature, top_p, provider-specific options, and per-agent model selection.
- **Permissions**: read/edit/bash/task/webfetch/websearch/MCP-style tool gates with `ask`, `allow`, and `deny`, including glob rules and per-command bash rules.
- **MCP**: add/list/auth/logout/debug MCP servers.
- **GitHub**: install/run GitHub agent and `opencode pr <number>` checkout/run workflow.
- **Server modes**: `serve`, `web`, `attach`, ACP server, and HTTP basic auth via `OPENCODE_SERVER_PASSWORD`.
- **Provider auth**: providers/auth command should be visible in doctor state, with redacted evidence.

Local probes confirmed OpenCode has:

- A live model list with OpenCode, GitHub Copilot, GitHub Models, Ollama, OpenRouter, and other providers.
- Agent profiles including `build`, `explore`, `plan`, `summary`, `title`, and `compaction`.
- Recent session metadata available through `opencode session list --format json`.
- Cost/token stats available through `opencode stats`.

---

## Action Catalog

Agent pages should be driven by an action catalog so new provider features can appear without bespoke buttons everywhere.

### Shared Actions

- Start session
- Continue/resume session
- Fork session
- Stop session
- Rename/session title
- Delete session
- Export session
- Import session
- Attach image/file
- Add working directory
- Open file reference
- Open MCP resource reference
- Run selected skill
- Insert selected command/prompt
- Log session to AI Vault
- Create continuation packet
- Open workspace shell
- Open diff drawer
- Open audit record
- Create follow-up job

### Claude Actions

- Start with model/effort/permission mode.
- Continue or resume by session ID.
- Fork a resumed session.
- Create worktree-backed run.
- Launch tmux-backed run where available.
- Add `--add-dir` directory access.
- Select custom agent.
- Create one-off custom agents JSON later.
- Run with budget cap.
- Run with JSON schema output.
- Include partial message chunks.
- Include hook lifecycle events.
- Show configured hooks.
- Show hook errors.
- Show MCP servers and OAuth state.
- Add/remove MCP server from a guarded admin drawer.
- Open PR resume/review flow.
- Launch remote-control session.
- Run doctor.
- Run update check.

### Codex Actions

- Start with model/profile/sandbox/approval policy.
- Start OSS/local-provider run.
- Attach image.
- Enable web search.
- Run non-interactive exec.
- Resume exec session.
- Run local review.
- Review uncommitted changes.
- Review against base branch or commit.
- Submit Codex Cloud task.
- List Cloud tasks.
- Show Cloud task status.
- Show Cloud task diff.
- Apply Cloud task diff locally after preview.
- Apply latest Codex diff locally after preview.
- Start app-server in stdio mode.
- Generate app-server TypeScript/JSON schemas.
- Manage MCP server list/login/logout.
- Show config layer/debug output.
- Show background terminal list.

### OpenCode Actions

- Start OpenCode run.
- Continue/fork session.
- Attach to running OpenCode server.
- Start/stop OpenCode serve/web mode.
- List sessions.
- Delete session.
- Export/import session JSON.
- Show token/cost stats.
- Show model catalog.
- Select provider/model.
- List/create agents.
- Select primary agent.
- Mention/invoke subagent.
- Show child sessions.
- Configure max steps, temperature, top_p where supported.
- Show effective permission rules.
- Manage MCP auth/list/debug.
- Run `opencode pr <number>` flow.
- Install/run GitHub agent only after explicit confirmation.

### Stack-Specific Quick Actions

These should be generated from skill metadata plus a curated runbook file, not hardcoded in React:

- Check stack status.
- Check GPU/Vast health.
- Run model health check.
- Continue NewsBites development.
- Debug NewsBites site.
- Create or publish NewsBites article.
- Check editorial pipeline queue.
- Pause/resume autopipeline.
- Open latest dossier.
- Approve low-risk publish backlog.
- Restart OpenClaw gateway.
- Restart Paperclip.
- Restart control surface.
- Deploy NewsBites.
- Log session to AI Vault.
- Append master-plan progress entry.

---

## UI Surfaces To Add

### Capability Drawer

One drawer per agent should show:

- CLI version and binary path.
- Auth/subscription state.
- Provider/model catalog.
- MCP servers and auth state.
- Skills and slash commands.
- Agents/subagents.
- Hooks/rules/permissions.
- Session storage paths.
- Cost/stat history.

### Context Picker

The composer should support inserting:

- Files and folders under the selected workspace root.
- Recent diffs.
- Dossier paths.
- Articles.
- AI Vault notes.
- MCP resources.
- Images/screenshots for Codex and any other agent that supports them.
- Prior session summaries.

### Run Governance Bar

Before starting a run, show:

- Execution surface: local VPS, local GPU, provider cloud, external web.
- Permission mode.
- Writable roots.
- Network/web-search state.
- Budget/time cap.
- Expected live-service risk.
- Whether the run can survive browser disconnect.

### Results And Next Actions

Every completed run should offer:

- Continue.
- Fork.
- Log to AI Vault.
- Generate continuation packet.
- Review changed files.
- Run tests/build.
- Commit or prepare commit message.
- Create dashboard job.
- Link to incident/story/dossier.
- Send summary to Telegram.

---

---

## Shared Agent Page Architecture

Add shared agent UI under `app/components/agent/`:

- `AgentComposer`
- `SlashPicker`
- `SkillPicker`
- `CommandPalette`
- `ModelSelector`
- `PermissionSelector`
- `SandboxSelector`
- `EffortSelector`
- `ProfileSelector`
- `CostMeter`
- `DoctorBar`
- `ToolCallView`
- `QuickPrompts`
- `VaultLogButton`
- `SessionRail`
- `WorkspaceRootSelector`

Add a shared server BFF module:

- `server/api/agents.ts`
- `server/adapters/agentDiscovery.ts`
- `server/adapters/agentSessions.ts`

Proposed endpoints:

```text
GET  /api/agents/discovery
GET  /api/agents/skills?agent=claude|codex|opencode|all
GET  /api/agents/commands?agent=claude|codex|opencode|all
GET  /api/agents/options?agent=claude|codex|opencode
GET  /api/agents/health?agent=claude|codex|opencode
GET  /api/agents/quick-prompts?cwd=/path
GET  /api/agents/sessions/search?q=...
POST /api/agents/vault-log
```

Each discovered item should include:

```typescript
type DiscoveredAgentCapability = {
  id: string;
  agent: "claude" | "codex" | "opencode" | "shared";
  kind: "skill" | "slash-command" | "profile" | "model" | "quick-prompt" | "mcp-server";
  name: string;
  description: string;
  sourcePath?: string;
  sourceMtime?: number;
  projectScope?: string;
  requiresAuth?: boolean;
  risk: "read-only" | "writes-files" | "runs-commands" | "live-service" | "unknown";
  available: boolean;
  unavailableReason?: string;
};
```

---

## Per-Agent Parity Rules

### Claude

Claude should keep using the CLI/subscription path that already works from the control surface.

Required behavior:

- Default to `--permission-mode dontAsk` under root.
- Surface plan mode when available.
- Surface model/profile options from CLI/help/config probes rather than hardcoding.
- Capture stream JSON tool calls and render them as typed blocks.
- Show subscription/rate-limit status clearly when Claude returns usage-limit errors.
- Support resume via Claude session ID.

Important constraint:

- Do not use `--dangerously-skip-permissions` while running as root. Claude CLI blocks it.

### Codex

Codex should keep the current no-timeout, persistent session behavior.

Required behavior:

- Keep explicit operator-facing permission/sandbox controls.
- Include an OSS/local-GPU route toggle only when the local route is healthy.
- Surface Codex skills dynamically from `/root/.codex/skills`, `/root/.agents/skills`, and plugin cache paths.
- Capture usage and command execution events into session metadata.
- Support resume and long-running runs without wall-clock kill.

### OpenCode

OpenCode should get the same operator experience as Claude and Codex where feasible.

Required behavior:

- Reuse the shared `AgentComposer`, slash picker, skill picker, workspace selector, doctor bar, and session rail.
- Prefer OpenCode SDK for existing session features.
- Fall back to spawning `opencode` via PTY when SDK coverage is missing.
- Discover repo-local `.opencode/skills` and root `.opencode/SKILL.md`.
- Render OpenCode tool parts with the same `ToolCallView` contract used by Claude/Codex.

OpenCode does not need to mimic every CLI flag if the underlying tool does not support it. The UI should show disabled controls with a reason instead of pretending parity exists.

---

## Phases

The main V4 plan now includes a compiled phase index. This child plan remains the detailed source for the Agent 0-10 workstream.

### Claude Original Phase Mapping

Claude's 2026-05-09 inline plan had eight phases. This plan preserves them and expands them into the current Agent 0-10 track:

| Claude original | Current mapping |
|---|---|
| Phase 0 - Foundations | Agent 0 Discovery Foundation and Agent 1 Shared Composer Shell |
| Phase 1 - Slash command picker | Agent 2 Slash and Skill Picker |
| Phase 2 - Run-time selectors | Agent 3 Runtime Selectors |
| Phase 3 - Cost, tokens, Doctor bar | Agent 4 Cost, Usage, and Doctor Bar |
| Phase 4 - Quick prompts + AI Vault logging | Agent 5 Quick Prompts and AI Vault Logging |
| Phase 5 - Tool-result polish | Agent 6 Tool Result Polish |
| Phase 6 - Power features | Split across Agent 3 Runtime Selectors, Agent 8 MCP/Providers/Hooks/Agents Admin, and Agent 10 Cloud/Review/PR Workflows |
| Phase 7 - Background runs + Telegram bridge | Agent 7 Background Runs and Notifications |
| Phase 8 - Session search + history | Agent 9 Session Search and Handoff |

### Phase 0 - Discovery Foundation

Goal: make the catalog dynamic before adding visible controls.

Tasks:

- Add `server/api/agents.ts` and discovery adapters.
- Implement skill scanning for Claude, Codex, shared, and OpenCode sources.
- Implement command scanning for `.claude/commands`, plugin commands, Codex slash/config capabilities, and OpenCode session/agent/provider capabilities.
- Implement MCP inventory probes for Claude, Codex, and OpenCode.
- Implement OpenCode probes for `models`, `agent list`, `session list --format json`, and `stats`.
- Parse `SKILL.md` frontmatter/name/description with safe fallbacks.
- Return source path and modified time for every item.
- Add discovery health states for missing directories and unreadable files.
- Add basic tests or fixture checks for duplicate skill names and symlinks.

Exit:

- `/api/agents/skills?agent=all` returns the current stack skills without hardcoded names.
- Pipeline and NewsBites skills appear from the existing directories.
- `/api/agents/discovery` returns CLI health, model/provider inventory, sessions summary, MCP summary, and degraded-state evidence per agent.

### Phase 1 - Shared Composer Shell

Goal: extract the common UX without changing behavior.

Tasks:

- Extract a shared `AgentComposer` from Claude and Codex pages.
- Port Claude and Codex pages onto the component.
- Adapt OpenCode page to render the same composer shell while keeping its current backend path.
- Keep current send/stop/resume behavior unchanged.

Exit:

- Claude, Codex, and OpenCode pages look and behave consistently.
- `bun run check` passes.

### Phase 2 - Slash and Skill Picker

Goal: make existing capabilities discoverable at the prompt.

Tasks:

- Add `/` trigger with fuzzy search over discovered skills, slash commands, quick prompts, and project runbooks.
- Add mobile bottom-sheet variant.
- Insert a clear prompt prefix or command payload rather than auto-running.
- Show source path, last modified date, risk, and agent compatibility.
- Add hide-list and pinned favorites in server-side operator state.

Exit:

- Typing `/pipeline`, `/newsbites`, `/stack`, or `/gpu` surfaces the existing stack skills dynamically.

### Phase 3 - Runtime Selectors

Goal: expose the important CLI knobs safely.

Tasks:

- Add model/profile/effort selectors.
- Add permission and sandbox selectors.
- Add plan-mode checkbox for Claude when available.
- Add Codex OSS/local toggle when LiteLLM/GPU health permits.
- Add Claude budget cap, add-dir, allowed/disallowed tools, and output format controls where supported.
- Add Codex image attachment, web-search toggle, output schema, review target, and approval policy controls.
- Add OpenCode agent/model/provider/max-steps/temperature controls where supported.
- Add execution-surface label: local VPS, local GPU, provider cloud, or external web.
- Persist selected options per session.
- Render disabled controls with a reason when an agent lacks support.

Exit:

- New sessions record the chosen model, effort/profile, permission mode, sandbox, and local/cloud route.
- The operator can see exactly which roots are writable and where the agent will execute before launch.

### Phase 4 - Cost, Usage, and Doctor Bar

Goal: make subscription, API, GPU, and quota state visible before runs.

Tasks:

- Capture Claude `usage` from result events when available.
- Capture Codex usage from stream events when available.
- Capture OpenCode cost/token summaries through `opencode stats` and per-session exports where available.
- Add per-turn and per-session cost/tokens fields.
- Add topbar doctor states: CLI auth, subscription/rate-limit, API-key exhaustion, LiteLLM health, GPU tunnel, current cwd risk.
- Show Claude subscription exhaustion as a recoverable state with reset time if the CLI reports it.

Exit:

- The operator can tell whether a failed Claude run is subscription limit, API key exhaustion, CLI missing, or tool error.
- The operator can compare Claude/Codex/OpenCode cost and token usage per day, project, model, and session.

### Phase 5 - Quick Prompts and AI Vault Logging

Goal: connect agent runs to operational memory.

Tasks:

- Add cwd-aware quick prompts loaded from disk and operator state.
- Seed quick prompts for `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/opencode-control-surface`, `/root`.
- Add manual `Log to AI Vault` action for any session.
- Add end-of-session "log this run?" prompt with preview.
- Write dashboard/admin-center work to `/opt/ai-vault/daily/YYYY-MM-DD.md` and project notes.
- Add `Append master-plan progress` action that drafts the required progress entry and asks for confirmation before writing.

Exit:

- A completed agent run can be logged to AI Vault from the browser without SSH.

### Phase 6 - Tool Result Polish

Goal: render agent work as inspectable operations instead of raw JSON.

Tasks:

- Typed views for Read, Edit, Write, Bash, Grep/RG, WebFetch/WebSearch, and command execution.
- Diff viewer with file links and line numbers.
- Bash block with command, cwd, duration, exit code, stdout/stderr collapse.
- "Open file", "open diff", "open shell here", and "create follow-up task" actions.

Exit:

- Edit/Write events show as real diffs and shell events show command status.

### Phase 7 - Background Runs and Notifications

Goal: let long runs survive browser disconnects.

Tasks:

- Move running children into a server-managed job/session registry.
- Persist bounded output logs.
- Sweep orphaned PID files on startup.
- Add optional Telegram notification through the existing Mimule path.
- Add cost/time caps per run.
- Show background terminals/processes from Codex and PTY-backed OpenCode/Claude runs.
- Attach async Claude hook results and long-running test/deploy outputs to the originating run.

Exit:

- Closing the browser does not kill a run unless the operator chooses Stop.

### Phase 8 - MCP, Providers, Hooks, and Agents Admin

Goal: make hidden agent infrastructure visible and safely adjustable.

Tasks:

- Add a capability drawer for each agent.
- List MCP servers for Claude, Codex, and OpenCode.
- Show MCP OAuth/auth state and exposed prompts/resources when available.
- Add guarded add/remove/login/logout MCP actions.
- List Claude hooks and hook errors.
- List Codex rules/hooks/plugins and AGENTS.md sources.
- List OpenCode providers, models, agents, permissions, and child-session relationships.
- Add "open source config" actions for every discovered config file.

Exit:

- The operator can answer "why does this agent have this tool/model/permission?" from the dashboard.

### Phase 9 - Session Search and Handoff

Goal: make prior work retrievable.

Tasks:

- Index Claude, Codex, and OpenCode session metadata into the V4 SQLite store.
- Add search over prompts, assistant output, tool calls, cwd, files touched, and tags.
- Add continuation packet generator for Claude/Codex/OpenCode.
- Link sessions to incidents, stories, jobs, audit records, and AI Vault notes.

Exit:

- The operator can find "the run that changed Claude root launch" or "the session that used the pipeline skill" from the dashboard.

### Phase 10 - Cloud, Review, and PR Workflows

Goal: expose provider cloud features without hiding where execution happens.

Tasks:

- Add Claude PR resume and `ultrareview` entry points.
- Add Codex local review actions.
- Add Codex Cloud list/status/diff/apply actions where authenticated.
- Add OpenCode `pr`, GitHub agent install, and GitHub agent run actions behind high-risk confirmation.
- Link cloud/review actions to the same audit and job system as local runs.

Exit:

- Review and cloud task flows are available, but every action labels execution surface, risk, source repo, and apply target.

---

## Implementation Order

Recommended first bundle:

1. Phase 0 discovery endpoints.
2. Phase 1 shared composer shell.
3. Phase 2 slash/skill picker.
4. Phase 5 quick prompts and manual AI Vault logging.

This gives immediate visible value while keeping model/cost/background-run complexity contained.

Phase 3 and Phase 4 should follow before adding more mutation-heavy workspace features. Phase 8 should land before Phase 10 so cloud/review features inherit visible MCP/provider/permission state.

---

## Open Questions

1. Should the first UI pass replace the current OpenCode composer immediately, or add the shared composer behind a route flag?
2. Should hidden/pinned skills be stored in the V4 SQLite `operator_state` table or a small JSON file until SQLite lands?
3. Should quick prompts and saved snippets share one storage model?
4. Should discovered skills be grouped by source (`Claude`, `Codex`, `OpenCode`, `shared`) or by task domain (`pipeline`, `NewsBites`, `stack`, `frontend`, `security`)?
5. Should Claude subscription usage be scraped only from CLI stream errors, or should the dashboard also read Claude CLI account/status metadata if the CLI exposes a stable command?
6. Should Codex app-server be adopted early for the Codex page, or kept as a later replacement for the current `codex exec --json` stream path?
7. Should MCP add/remove/login/logout be available in V4.0, or should V4.0 be read-only for MCP inventory?
8. Should OpenCode GitHub agent install/run be dashboard-accessible, or only surfaced as a copy-command/runbook action until the audit system is durable?

---

## Research References

Checked 2026-05-09:

- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Claude Code skills and slash commands: https://code.claude.com/docs/en/slash-commands
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- OpenAI Codex CLI: https://developers.openai.com/codex/cli
- OpenAI Codex CLI slash commands: https://developers.openai.com/codex/cli/slash-commands
- OpenAI Codex MCP: https://developers.openai.com/codex/mcp
- OpenAI Codex app-server: https://developers.openai.com/codex/app-server
- OpenCode CLI: https://opencode.ai/docs/cli/
- OpenCode agents: https://opencode.ai/docs/agents/

---

## Status Log

- 2026-05-09 10:42 UTC - Codex saved the agent-pages plan from Claude's failed-write session and incorporated Marouane's direction: subscription-backed Claude is desired, OpenCode should reach parity, and all skills/commands/options should be dynamically discovered from existing local sources.
- 2026-05-09 11:05 UTC - Codex researched current Claude/Codex/OpenCode CLI and documentation surfaces, then expanded this plan with provider-native feature backlogs, shared action catalog, capability drawer, context picker, run governance bar, MCP/provider/hook/admin phase, and cloud/review/PR workflows.
- 2026-05-09 14:32 UTC - Claude (Opus 4.7) completed Agent 1 / Phase 1 (Shared Composer Shell). Extracted `app/components/AgentComposer.tsx` and `app/hooks/useVoice.ts`. Ported `ClaudePage`, `CodexPage`, and `OpenCodeView` onto the shared composer; OpenCode keeps attach chips via `aboveRow` and the paperclip + file input via `leftButtons`. `bun run check` clean (CSS 64.75 kB, JS 711.41 kB). `control-surface.service` active; `/`, `/claude`, `/codex`, `/opencode`, `/opencode-api/session` all 200. Agent 2 (Slash and Skill Picker) is the next bundle.
- 2026-05-09 16:11 UTC - Codex stabilized Claude's Agent 1 work and shipped the first Agent 2 slice. Added operator auth to Claude/Codex session APIs and the OpenCode proxy, introduced server-side workspace allowlisting for Claude/Codex/OpenCode session creation, split the heavy discovery endpoint from a cheap `/api/agents/summary`, fixed the home SSE disconnect crash, removed OpenCode's fake disabled Stop control, and added a `/` picker in the shared composer for quick prompts, discovered skills, CLI commands, source paths, and inferred risk labels. `bun run check` clean; `control-surface.service` active; `/api/agents/summary` returns ~1.3 KB in ~9 ms; `/api/agents/skills?agent=codex` returns 48 skills and 20 commands in ~64 ms; unauthenticated `/api/codex/sessions` and `/opencode-api/session` return 401.
- 2026-05-09 16:30 UTC - Codex shipped the first Agent 5 slice. Added authenticated `POST /api/agents/vault-log`, a shared `AgentVaultLogButton` modal, and Claude/Codex/OpenCode topbar actions that write reviewed session summaries to the daily AI Vault note, dashboard project note, and optional master-plan progress log. `bun run check` clean; `control-surface.service` active; unauthenticated vault-log POST returns 401; authenticated vault-log POST wrote the 2026-05-09 AI Vault and master-plan entries through the live endpoint. Remaining Agent 5 work: cwd-aware quick prompts loaded from disk/operator state and end-of-session log prompts.
- 2026-05-09 17:19 UTC - Codex shipped the second Agent 5 slice. Added disk-backed `config/agent-quick-prompts.json`, optional operator overlay at `/var/lib/control-surface/agent-quick-prompts.json`, `GET /api/agents/quick-prompts?agent=...&cwd=...`, and composer loading for workspace-scoped prompts before discovered skills/commands. Seeded prompts for `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/opencode-control-surface`, and `/root`. `bun run check` clean; `control-surface.service` active; quick-prompt probes returned dashboard-specific, NewsBites-specific, and Paperclip-specific prompt sets. Remaining Agent 5 work: end-of-session "log this run?" prompt with preview.
- 2026-05-09 17:44 UTC - Codex shipped the final Agent 5 slice. Added shared `app/components/AgentVaultLogModal.tsx`, one-shot `app/hooks/useSessionEndPrompt.tsx`, end-of-session preview prompts in `ClaudePage`, `CodexPage`, and the OpenCode routed view, target toggles in `AgentVaultLogButton`, vault/project target support in `server/api/agents.ts`, and small modal CSS in `app/globals.css`; prompts summarize first/last messages, extract visible edited paths, and fire from New Session plus internal navigation away when sessions have more than five messages. `bun run check` clean: CSS 67.34 kB (gzip 13.80 kB), JS 725.07 kB (gzip 207.45 kB), with Vite's existing >500 kB chunk warning only.
