# Dashboard V4 Plan

Last updated: 2026-05-07 UTC
Owner: Marouane Defili
Scope: Planning only. No implementation in this phase.
Predecessor: `/root/DASHBOARD_V3_PLAN.md`
Canonical app path: `/opt/opencode-control-surface/`
Public URL: `control.techinsiderbytes.com`

---

## Purpose

V3 turned the OpenCode control surface into a real stack dashboard: widget wall, domain detail pages, BFF endpoints, actions, SSE, incidents, and motion polish.

V4 should make the app more useful by moving from **status display** to **operator command intelligence**:

- Tell the operator what matters first.
- Preserve operational history instead of reading only current files.
- Explain why something changed.
- Let the operator act safely from mobile.
- Connect dashboard telemetry to editorial output, cost, model quality, agents, and growth.
- Make the dashboard the front door for running the media company, not only checking whether services are alive.

V4 extends the existing app. It does not fork, migrate frameworks, or replace V3.

---

## Evidence Checked Before This Plan

Checked on 2026-05-07 UTC.

### V3 planning state

- `/root/DASHBOARD_V3_PLAN.md` says Phase 1 through Phase 5, Phase 7 SSE, and `/incidents` are complete.
- V3 deferred items remain: OpenCode session count widget, SQLite historical sparklines, deeper polish, and some telemetry sources such as Vast host sampler.
- The V3 plan has stale sections: it still lists `wouter`, `recharts`, and `@tanstack/react-query` as missing, but `package.json` already contains `wouter` and `recharts`; `@tanstack/react-query` is not installed and the implementation uses a custom `useAction` hook.

### Last Claude dashboard changes

Latest commits in `/opt/opencode-control-surface`:

- `b9c312b` - `feat(control-surface): dashboard V3 - routing, BFF detail endpoints, all 5 detail pages`
- `6d85f55` - `feat(control-surface): dashboard V3 complete - all phases through SSE live updates`
- `2188c57` - `feat(control-surface): add motion layer - page-in, modal slide, button press, card lift, SSE pulse, prefers-reduced-motion`

Uncommitted dashboard route changes currently replace inline red loading-error styles with `.loading-dim.error` in the route pages. Those are small CSS-consistency edits and should be preserved.

The `/opt` repo view also shows unrelated backup deletions under `/opt/backups/*` and unrelated modified subtrees. V4 implementation must not revert or mix those into dashboard work.

### Codex review addendum - 2026-05-07 19:16 UTC

- Confirmed Claude's uncommitted route edits are consistent with existing CSS: `/opt/opencode-control-surface/app/globals.css` already defines `.loading-dim.error { color: var(--red); }`.
- Re-ran `bun run typecheck` in `/opt/opencode-control-surface`; it still fails only in legacy OpenCode components (`ChatView`, `ConnectionScreen`, `Layout`, `SessionListPanel`) with store/SDK shape drift.
- Confirmed `server/api/router.ts` still exposes `GET /api/config` and returns `{ operatorToken: process.env.OPERATOR_TOKEN ?? "" }`; this is the concrete token-vending path Phase 0 must remove.
- Confirmed `server/api/actions.ts` still treats a missing `OPERATOR_TOKEN` as dev mode by returning `true` from `checkToken()`. Phase 0 must preserve local development ergonomics while failing closed in production.
- Confirmed `POST /api/doctor/scan` is not registered in `server/api/router.ts`.
- Confirmed the current deploy job store is an in-memory `Map` in `server/api/actions.ts`; V4 jobs must be durable before deploy/restart/backup actions expand further.

### Live smoke checks

- `systemctl is-active control-surface.service` -> `active`
- `curl http://127.0.0.1:3000/api/home` returned `sourceStatus` all `ok` for services, hetzner, pipeline, models, doctor, newsbites, and vast.
- `bun run build` in `/opt/opencode-control-surface` succeeded.
- `bun run typecheck` failed in legacy OpenCode components (`ChatView`, `ConnectionScreen`, `Layout`, `SessionListPanel`) because their assumptions about the Zustand store and OpenCode SDK types drifted. V4 must start by repairing this; otherwise future work will keep building on a type-unsafe base.

### V3 verification pass - 2026-05-07

Live endpoint verification:

- `/api/home` -> ok, returns services, GPU, Vast, Hetzner, NewsBites, Autopipeline, Doctor, Models, Incidents.
- `/api/autopipeline` -> ok, queue 83, paused true, approvals waiting 75, current null.
- `/api/doctor` -> ok, 1214 returned entries from tail, stats total 1233.
- `/api/models` -> ok, 57 models, 0 cooldowns, 4 discovery-log entries, 1 degraded and 2 probation models.
- `/api/newsbites` -> ok, 383 articles, 381 published, 15 published today, site reachable, deploy git metadata unavailable.
- `/api/infra` -> ok, 11 services, 7 timers, GPU up, Vast host sampler missing, Vast runway about 9.5 hours at check time.
- `/api/incidents` -> ok, but no action lifecycle and no acknowledgement/resolve state.

Implemented V3 actions:

- Autopipeline: pause, resume, inject topic as `cmd:add` with vertical hardcoded to `ai`, rush, kill, publish.
- Models: run model health check, block, unblock, probation-clear backend support, but UI only exposes block/unblock/run check.
- NewsBites: redeploy via in-memory job.
- Infra: restart allowlisted systemd services and Docker containers, run model-health-check and mimule-backup timers.

V3 gaps that V4 must address:

- **Not everything reported is actionable.** Doctor, incidents, NewsBites article rows, model quality summaries, provider reachability, Vast runway, stale telemetry, and deploy metadata failures do not all expose direct next actions.
- **No durable action audit.** Mutations return feedback but are not persisted with actor, reason, request, result, and rollback hint.
- **Long jobs are volatile.** Deploy jobs are stored in memory and disappear on service restart or after eviction.
- **Security gap.** `/api/config` returns `OPERATOR_TOKEN` to the browser. V4 should remove token vending and rely on same-origin authenticated requests or a safer session mechanism.
- **Production token behavior is too permissive.** `checkToken()` allows all mutations when `OPERATOR_TOKEN` is unset. V4 should fail closed in production.
- **Doctor scan endpoint missing from router.** V3 plan mentions `POST /api/doctor/scan`; current router does not expose it.
- **V3 action coverage is partial.** No dossier-path inject, no vertical/priority selector for topic injection, no batch approval, no per-incident ack/resolve, no open dossier/article/source actions.
- **No historical state.** Trends, stale detection, service transitions, queue aging, and incident lifecycle need SQLite.
- **Typecheck is failing.** OpenCode legacy components must be repaired before the workspace expansion.
- **Bundle warning remains.** Build succeeds but ships a >500 KB JS chunk; V4 should code-split heavy routes.

---

## V4 Product Thesis

V3 answers: "What is happening?"

V4 answers:

- "What changed since the last time I looked?"
- "What needs a decision?"
- "What can I safely do from my phone?"
- "Which story, model, service, agent, or cost center is hurting the system?"
- "What should the system do next if I do nothing?"

The home page should become a **priority deck**, not a static wall. Widgets still exist, but the top of the product should rank operator attention.

---

## Everything Admin Center Requirement

This dashboard is the admin center for the whole MIMULE / TechInsiderBytes company. If the app reports something, the operator must be able to do something about it from the same surface.

V4 must treat every reported object as an **actionable entity**:

- Service
- Timer
- Container
- GPU instance
- Vast account/runway
- Model
- Provider
- Cooldown
- Story
- Dossier
- Article
- Deploy
- Doctor decision
- Incident
- Agent session
- Shell session
- Git repo/folder
- Backup
- Alert
- Cost anomaly
- Growth/content opportunity
- Knowledge note

Every actionable entity must expose:

1. **Primary action** - the safest most likely next step.
2. **Secondary actions** - inspect, refresh, open source, create task, mute, escalate.
3. **Evidence** - exact source file/API/log/command that produced the report.
4. **Impact preview** - what will change if the action runs.
5. **Risk level** - low/medium/high/destructive/live-service.
6. **Audit record** - who/when/what/request/result/rollback hint.
7. **Fallback path** - what to do if the action fails.

If an item cannot be acted on directly, the UI must say why and provide the nearest useful action, such as "open runbook", "open shell here", "create agent task", "copy command", or "mark as external".

No V4 card or table row should end at a dead end.

---

## Actionability Contract

All data returned by V4 BFF endpoints should use a shared action model.

```typescript
interface ActionDescriptor {
  id: string;
  label: string;
  kind:
    | "navigate"
    | "refresh"
    | "run-command"
    | "start-job"
    | "mutate-policy"
    | "open-shell"
    | "open-workspace"
    | "open-source"
    | "create-agent-task"
    | "acknowledge"
    | "resolve"
    | "mute"
    | "external-link"
    | "copy-command"
    | "export"
    | "preview";
  targetType: string;
  targetId: string;
  risk: "low" | "medium" | "high" | "destructive";
  confirm: boolean;
  reasonRequired: boolean;
  disabled?: boolean;
  disabledReason?: string;
  evidenceRefs: EvidenceRef[];
  impactPreview?: string;
  rollbackHint?: string;
  expectedDurationMs?: number;
  jobKind?: string;
  sourceRoute?: string;
  requiresOnline?: boolean;
}

interface EvidenceRef {
  label: string;
  kind: "file" | "api" | "command" | "log" | "git" | "url" | "db";
  ref: string;
  redacted?: boolean;
}
```

Every API entity should include:

```typescript
interface ActionableEntity<T> {
  entity: T;
  health: "ok" | "warn" | "critical" | "unknown";
  freshness: "fresh" | "stale" | "missing";
  evidence: EvidenceRef[];
  actions: ActionDescriptor[];
}
```

Frontend rules:

- A row click opens an evidence/action drawer, not only a passive detail view.
- The primary action appears inline when safe.
- High-risk actions require a confirm sheet and audit reason.
- Failed actions turn into incidents or jobs with retry controls.
- Every action result links back to the entity and source evidence.

Backend rules:

- The client may request an action by id, but the server re-resolves the action from allowlisted handlers.
- Never execute arbitrary client-provided shell.
- Every action writes `action_audit`.
- Every long-running action writes `jobs`.
- Every failed action can emit an `events` record.
- Server-generated action ids must be stable enough for command-palette search but must not be treated as authorization; authorization comes from the server-side handler, target allowlist, and operator session.
- Action descriptors should be generated beside the BFF entity that owns the evidence, not hand-written only in React. The frontend may reorder or hide actions, but it should not invent new mutation semantics.
- The action registry must support a dry-run or preview mode for high-risk actions so the confirm sheet can show exact target, command template, expected duration, and rollback hint before execution.

---

## Admin Action Matrix

V4 must add or expose these actions by domain.

### Services and Infra

- Restart service/container.
- Stop/start service where allowlisted.
- View logs tail.
- Open shell in related folder.
- Open runbook.
- Run health check.
- Run backup now.
- Verify backup.
- Mark restore drill done.
- Restart tunnel.
- Run Vast reconcile.
- Open Caddy route evidence.
- Create agent task to investigate recurring failure.

### GPU and Vast

- Run GPU health probe.
- Run model-health-check.
- Run Vast host sampler now.
- Start/restart Vast tunnel.
- Reconcile changed Vast IP/port.
- Open Vast account page.
- Set runway alert threshold.
- Enable cheap mode.
- Enable quality mode.
- Create top-up reminder.

### Autopipeline and Stories

- Pause/resume.
- Add topic with vertical, priority, and mode.
- Inject dossier path with validation.
- Rush story.
- Kill/abandon story with reason.
- Publish/approve story.
- Batch approve low-risk stories.
- Rerun from selected stage.
- Open dossier files.
- Open article preview.
- Send approval packet to Telegram.
- Create agent task to fix a failed story.
- Mark story as externally handled.

### Doctor and Repairs

- Run doctor scan now.
- Open affected dossier.
- Requeue story from recommended stage.
- Promote repeated failure to incident.
- Block/probation failed model.
- Add/adjust cooldown.
- Create prompt-fix or code-fix agent task.
- Export repair cluster summary.

### Models and Providers

- Run quick check.
- Run full discovery.
- Block/unblock/probation-clear with reason.
- Prefer/de-prefer model for stage.
- Simulate fallback chain.
- Run model evaluation job.
- Open provider status/evidence.
- Set max-cost or no-cloud policy.
- Clear cooldown with reason.

### NewsBites

- Redeploy with durable job.
- Open article on live site.
- Open article file in workspace.
- Preview article.
- Fix frontmatter task.
- Regenerate digest task.
- Add panel hints task.
- Mark article promoted.
- Create follow-up story candidate.
- Batch check broken images/links.

### Incidents

- Acknowledge.
- Assign to self/agent.
- Mute/snooze.
- Resolve with reason.
- Reopen.
- Link related story/model/service/action.
- Generate postmortem.
- Create runbook update task.

### Agents and Workspace

- Open session.
- Launch Claude/Codex/OpenCode/shell in selected folder.
- Stop session.
- Resume session.
- Generate handoff.
- Inspect touched files.
- Open diff.
- Run tests/build.
- Commit changes.
- Create PR or link external PR where supported.

### Costs and Growth

- Set alert threshold.
- Export report.
- Enable cost policy.
- Create promotion task.
- Create SEO cleanup task.
- Mark opportunity accepted/dismissed.

### Channels and Notifications

- View recent Telegram bot interactions (inbound and outbound).
- Resend failed Telegram notification with retry evidence.
- Silence/snooze a recurring alert class with expiry.
- Configure which event types trigger Telegram alerts.
- Manually send a custom Telegram message or alert from the dashboard.
- Trigger morning brief now.
- Preview morning brief draft before sending.
- View last N morning briefs with delivery status.
- View Paperclip notification delivery history.
- Configure alert routing: Telegram only, dashboard only, both.
- Export notification log.

### LiteLLM Proxy

- View request rate, latency, and error rate per logical model.
- View live routing decisions (which backend served the last N requests).
- View current fallback chain for each logical model name.
- Trigger model health check from the LiteLLM view.
- View LiteLLM config (read-only rendered view of `/etc/litellm/config.yaml`).
- Create a "regenerate config" agent task when routing needs to change.
- View recent request errors grouped by logical name and provider.
- View rate-limit signals per provider (derived from LiteLLM logs or model-health.json).
- Set provider-level max-cost or no-cloud policy.
- Restart LiteLLM service with audit reason.

### Paperclip

- View all agents with health, adapter, model, last run, last error.
- View pending tasks and approvals.
- View per-agent error history and failure patterns.
- Wake a sleeping agent.
- View agent throughput (tasks completed per day/week).
- Manually assign or re-assign a task.
- Open the Paperclip web interface (link out to paperclip.techinsiderbytes.com).
- View Paperclip DB health (last backup, row counts, replication state).
- View Paperclip agent adapter status (gemini_local, openclaw_gateway states).
- Create a Paperclip issue for a recurring pipeline failure.

### Content Health

- Run broken link check across all published articles.
- Run missing image check.
- Detect duplicate articles by slug proximity or content hash.
- Detect thin content (word count below quality threshold).
- Flag articles with weak digest (too short, same as lead, or missing).
- Flag articles with no panel hints for known verticals.
- Flag articles with malformed or missing frontmatter fields.
- Show articles never promoted to social/newsletter.
- Show stale articles (published >30d, no external link, no reader traffic).
- Create a batch "fix frontmatter" agent task for a set of flagged articles.
- Generate SEO quality report for published articles.
- Mark article as manually reviewed / health-cleared.

---

## V4 Principles

1. **Attention is the scarce resource.** The app should rank by severity, freshness, and business impact.
2. **Every recommendation needs evidence.** A recommendation must link to the events, metrics, logs, or files behind it.
3. **Every mutation needs an audit trail.** Actions record who, when, input, result, affected service, and rollback guidance.
4. **History beats snapshots.** Current JSON files are useful, but V4 needs durable time series and event records.
5. **Mobile first for decisions.** The operator should triage, pause, resume, approve, restart, or block from a phone.
6. **Desktop for investigation.** Dense tables, raw JSON, log tails, and comparison views can stay desktop-heavy.
7. **Use existing stack patterns.** Keep Vite, React, Bun server, wouter, Tailwind, Recharts, and server adapters.
8. **Degrade honestly.** If a source is stale or missing, show that clearly and keep the rest of the page usable.
9. **Always log to AI Vault.** Every meaningful dashboard/admin-center planning, implementation, verification, or operations session must update `/opt/ai-vault/daily/YYYY-MM-DD.md` and the relevant `/opt/ai-vault/projects/*.md` note, in addition to the master plan when stack-level state changes.

---

## V4 Information Architecture

Keep all V3 routes, but reorganize around operator jobs.

```text
/                         Mission Control - ranked priority deck + current widgets
/today                    Daily operating brief: overnight changes, decisions, schedule
/newsbites                Existing NewsBites detail, expanded into content performance
/autopipeline             Existing pipeline detail, expanded into story command center
/doctor                   Existing repair detail, expanded into reliability learning
/models                   Existing model inventory, expanded into model operations lab
/agents                   New: OpenCode, Paperclip, pipeline agents, sessions, tasks
/infra                    Existing infra detail, expanded into runbooks and restore state
/incidents                Existing incidents, expanded into lifecycle and postmortems
/growth                   New: traffic, SEO, social/newsletter, publishing outcomes
/costs                    New: Vast, API spend, model cost, runway, savings estimates
/knowledge                New: source reliability, dossiers, vault, reusable learnings
/jobs                     New: durable long-running work, output tails, retries
/audit                    New: action history, actor/reason/result/rollback
/settings                 New: widget preferences, alert thresholds, tokens, allowlists
/workspace                New: Claude Code-style agent workspace for Claude, Codex, and OpenCode
/opencode                 Compatibility redirect to `/workspace?agent=opencode`
/channels                 New: Telegram activity, alert routing, notification config, brief history
/litellm                  New: LiteLLM proxy request stats, routing decisions, fallback chain live state
/paperclip                New (restored from V2): Paperclip agents, task ledger, approvals, error history
/reports                  New: periodic report archive (daily, weekly), export history, postmortems
/content-health           New: broken links, missing images, thin content, duplicate detection, SEO checks
```

V4.0 should not try to fully build every route. It should build the shared foundations and deliver the highest-value route expansions first: `/`, `/today`, `/workspace`, `/autopipeline`, `/models`, `/agents`, and `/costs`.

Routes added in V4 review (2026-05-07) — now also included in the main IA table above:

```text
/channels                 New: Telegram activity, alert routing, notification config, brief history
/litellm                  New: LiteLLM proxy request stats, routing decisions, fallback chain live state
/paperclip                New (restored from V2): Paperclip agents, task ledger, approvals, error history
/reports                  New: periodic report archive (daily, weekly), export history, postmortems
/content-health           New: broken links, missing images, thin content, duplicate detection, SEO checks
```

These routes were present in the V2 product vision (Channels, Paperclip, History/Analytics) but were not carried forward into V3 or the original V4.0 draft. They are first-class operational surfaces, not stretch goals, and are now first-class entries in the route table above. Build phases for each are in Phase 9.

---

## Agent Workspace: Claude Code Web-Style IDE

The existing `/opencode` route should evolve into `/workspace`: a self-hosted browser IDE and agent command center that feels intentionally close to the current Claude Code web app, while adding local VPS capabilities Claude's hosted web app does not expose directly.

Research snapshot checked 2026-05-07:

- Claude Code on the web runs tasks on Anthropic-managed cloud VMs from `claude.ai/code`; sessions persist across browser/mobile, start from selected GitHub repositories/branches, clone repos into isolated VMs, and can push branches for review.
- Claude Code web supports repository/branch selection, multiple repositories in one session, built-in GitHub tools, background sessions, cloud planning/execution, PR creation, auto-fix for CI/review comments, and `--teleport` back into a local terminal checkout.
- Claude Code's VS Code interface uses a native graphical panel, sessions list, editor integration, inline diffs, file references, diagnostics sharing, and an integrated-terminal path for advanced CLI use.
- Codex web similarly delegates coding tasks to cloud environments connected to GitHub, works in parallel, can create PRs, and exists alongside local CLI/IDE surfaces. Codex CLI can run locally in a selected directory, edit files, run commands, and launch cloud tasks from the terminal.

V4 should copy the useful interaction model, not the hosted execution model:

- **Claude-like session shell**: left session rail, central chat/task transcript, right evidence/diff/file drawer, bottom integrated terminal.
- **Repo/folder switcher**: select from registered roots and recent folders, not only GitHub repos.
- **Branch/worktree awareness**: show current branch, dirty state, last commit, ahead/behind, and worktree path before launching an agent.
- **Agent launcher**: one composer can launch `claude`, `codex`, or `opencode` against the selected folder.
- **Persistent sessions**: session metadata, cwd, command, agent, model/profile, transcript path, PTY log, git branch, and touched files survive browser reloads.
- **In-page shell**: xterm-style terminal attached to a server-side PTY in the selected cwd.
- **Diff-first review**: file changes grouped by session with before/after diff, test output, and commit/PR options.
- **Mobile monitor mode**: mobile can start sessions, send prompts, approve commands, inspect diffs, and tail the shell; deep editing can remain desktop-first.

### Workspace layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar: repo/folder selector | branch | dirty | agent selector | run │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ Session rail  │ Chat / task transcript               │ Files / diff  │
│ - Claude      │ - messages                           │ - file tree   │
│ - Codex       │ - tool calls                          │ - patch view  │
│ - OpenCode    │ - approvals                           │ - tests       │
│ - Shells      │ - status                              │ - preview     │
├───────────────┴──────────────────────────────────────┴───────────────┤
│ Integrated shell tabs: shell | claude | codex | opencode | logs       │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile:

- Tabs: `Sessions`, `Chat`, `Shell`, `Diff`, `Files`.
- Sticky composer with agent selector and folder badge.
- Confirm sheets for launches, shell commands, commits, PRs, and destructive operations.

### Folder and repo registry

Add a server-side registry:

```text
/var/lib/mimule/workspace-registry.json
```

Initial allowed roots:

- `/root`
- `/opt/opencode-control-surface`
- `/opt/newsbites`
- `/opt/mimoun`
- `/opt/paperclip`
- `/home/agent`

Each entry:

```typescript
interface WorkspaceRoot {
  id: string;
  label: string;
  path: string;
  kind: "git" | "folder";
  defaultBranch?: string;
  risk: "low" | "medium" | "high";
  liveService?: string;
  notes?: string;
}
```

Rules:

- The browser can only open allowlisted roots.
- Nested folder selection must stay under an allowlisted root after resolving symlinks.
- Live repos such as `/opt/newsbites` and `/opt/mimoun` show a high-risk badge and require launch confirmation.
- The selected folder is displayed in every session, shell, action audit entry, and job record.

### Agent launch profiles

Add launch profiles instead of hardcoding one command path:

```typescript
interface AgentProfile {
  id: "claude" | "codex" | "opencode";
  label: string;
  command: string;
  args: string[];
  envAllowlist: string[];
  supportsPty: boolean;
  supportsResume: boolean;
  supportsDiffExtraction: boolean;
  supportsCloudDelegation?: boolean;
}
```

Initial profiles:

- **Claude Code local**: run `claude` in the selected cwd via PTY. Later: support `claude --remote` and `claude --teleport` as explicit cloud/terminal bridge actions.
- **Codex local**: run `codex` in the selected cwd via PTY. Later: expose cloud task delegation where the local CLI supports it.
- **OpenCode local**: use the existing OpenCode SDK when possible; fall back to spawning `opencode` via PTY for parity with Claude/Codex.
- **Plain shell**: `bash` in the selected cwd for non-agent inspection.

The UI should make the execution surface explicit:

- `local shell on VPS`
- `local agent on VPS`
- `provider cloud session`
- `external web task`

Do not blur these together. The operator needs to know where code is running and where credentials are available.

### Session broker

Add a local session broker under `server/workspace/`.

Responsibilities:

- Create PTY sessions with `node-pty` or Bun-compatible equivalent.
- Stream terminal output over WebSocket or SSE plus POST input.
- Store session metadata and bounded output logs in SQLite.
- Track selected cwd, env profile, agent, command, pid, startedAt, lastActivityAt, exitCode.
- Reattach browser clients after reload.
- Kill sessions with confirmation.
- Snapshot git state before and after each agent run.
- Detect touched files via `git status --short`, `git diff --name-only`, and filesystem mtimes for non-git folders.

Security:

- All shell/agent starts require `X-Operator-Token`.
- Only allowlisted directories.
- No arbitrary command templates from the client for agent launch.
- Shell tabs can run arbitrary commands because they are an intentional terminal, but opening a shell in high-risk roots requires a warning.
- Redact known secrets from captured logs.
- Do not expose `.env`, SSH keys, or token files through the file viewer by default.

### File, diff, and preview surfaces

Workspace should include:

- File tree rooted at selected folder, with hidden sensitive files by default.
- Read-only file viewer for common text files.
- Diff viewer for git changes.
- Test/build output panel.
- Markdown preview for docs.
- HTML preview for built artifacts where safe.
- "Open in route" links for dashboard files and NewsBites articles.

V4.0 target is read/diff/shell/session control. Full editor behavior can wait until V4.1; use the agent and shell for edits first.

### Launch flow

1. Select folder/repo.
2. Inspect branch/dirty/risk state.
3. Select agent: Claude, Codex, OpenCode, or shell.
4. Choose mode:
   - `Ask` for read-only investigation.
   - `Edit` for local changes.
   - `Plan` for no file writes unless the agent supports a native plan mode.
   - `Cloud` only where the provider supports it and the repo is connected.
5. Submit prompt.
6. Session opens with live transcript/shell.
7. On completion, show changed files, commands run, test output, and next actions: continue, stop, commit, create task, or discard manually.

### Relationship to official Claude/Codex web

The local dashboard should not try to impersonate Anthropic or OpenAI cloud services. It should provide a **similar UX over local tools**:

- For Claude cloud sessions, link out to `claude.ai/code` or expose CLI bridges (`--remote`, `--teleport`) only where authenticated locally.
- For Codex cloud sessions, link out to `chatgpt.com/codex` or launch via local CLI/SDK when supported.
- For local work, the dashboard is the source of truth: it owns cwd selection, PTY, logs, audit records, git snapshots, and session history.

V4 success criterion:

- From one browser page, the operator can switch from `/opt/opencode-control-surface` to `/opt/newsbites`, open a shell, start Claude/Codex/OpenCode, watch the session, inspect diffs, and return later without losing context.

### Agent pages addendum - 2026-05-09

Detailed child plan: `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md`.

This addendum captures the last Claude Code dashboard planning session and Marouane's follow-up direction:

- Claude Code in the control surface should keep using the working subscription-backed CLI path. The last Claude transcript shows a subscription usage-limit 429, not an Anthropic API-key exhaustion error.
- OpenCode should get the same operator experience as Claude and Codex wherever the SDK or CLI can support it.
- Skills, commands, options, models, profiles, and quick prompts must be dynamically discovered from the local environment. Do not hardcode a static list into the browser.
- Existing stack skills are first-class inputs: pipeline, NewsBites dev/debug/make, stack status, GPU health, deploy, dashboard, editorial pipeline, Mimule ops, Vast GPU, and OpenCode repo skills.

The first implementation bundle for the agent pages should be:

1. Add `server/api/agents.ts` and dynamic discovery for Claude, Codex, shared, plugin, and OpenCode skill sources.
2. Extract a shared `AgentComposer` and port Claude/Codex/OpenCode pages onto it without changing backend behavior.
3. Add slash/skill picker backed by the discovery endpoint.
4. Add cwd-aware quick prompts and manual AI Vault logging.

Additional research on 2026-05-09 expanded the child plan with provider-native action catalogs:

- Claude: custom commands, MCP resources, subagents, hooks, worktrees, add-dir, budget caps, PR resume/review, remote-control, plugins, and structured output controls.
- Codex: image input, web search, local review, cloud task list/status/diff/apply, app-server, MCP, plugins, skills, rules, hooks, approval/sandbox modes, and OSS/local-provider routes.
- OpenCode: live provider/model catalog, stats/costs, session export/import/delete, server attach/web/serve, agents/subagents, permission rules, MCP auth/debug, GitHub PR and GitHub agent workflows.

The agent-pages implementation should therefore include a shared action catalog and capability drawer rather than one-off controls per page.

---

## Home: Mission Control

The V3 home widget wall remains below the fold. The first viewport becomes a ranked operating deck.

### Top deck

1. **Now card**
   - One sentence: current stack posture.
   - Examples: "Pipeline paused with 74 approvals waiting", "GPU up but Vast runway under 12h", "Doctor abandoned 3 publish jobs in 24h".
   - Data: derived from incidents, pipeline, model health, GPU, Vast, and NewsBites.

2. **Decision queue**
   - Items requiring human action.
   - Examples: approve stories, resume paused pipeline, top up Vast, unblock a model, restart a failed service.
   - Each item has severity, age, evidence, recommended action, and "dismiss until" control.

3. **Change since last visit**
   - New articles, queue delta, model changes, incidents opened/resolved, cost/runway delta.
   - Requires per-operator-session state (stored in `operator_state` SQLite table keyed by `last_visit_ts`) plus server-side event history.

4. **Next best actions**
   - Ranked action buttons with guardrails.
   - Examples: "Approve 12 low-risk stories", "Run full model discovery", "Pause pipeline until publish queue is cleared".
   - Every action opens a confirm sheet with impact preview.

5. **Risk strip**
   - Credit runway, stale telemetry, failed checks, typecheck/build state, unresolved incidents.

### Widget wall changes

- Keep V3 widgets, but make them collapsible by domain.
- Persist hidden/reordered widgets server-side, not only local storage.
- Add stale badges per widget based on source freshness.
- Add "why this is red" links that open an evidence drawer.

### Global command center

Add a keyboard/mobile-accessible command palette that can act across the whole app.

Open with `/`, `Cmd/Ctrl+K`, or a visible command button.

Capabilities:

- Search entities: services, stories, articles, models, incidents, sessions, folders, timers, notes.
- Run safe actions directly: refresh, open, inspect, open shell, create agent task.
- Queue high-risk actions into confirm sheets.
- Show recent actions and jobs.
- Jump to source evidence.
- Start a Claude/Codex/OpenCode workspace session from any selected entity.

Examples:

- "restart litellm"
- "open shell newsbites"
- "approve low risk publish queue"
- "block degraded model"
- "run backup"
- "create codex task for failed deploy"
- "open latest incident"

The command palette is the fastest path for the admin center. Any action available in a drawer should also be discoverable here.

---

## New Domain: Today

`/today` is the daily operating brief. It should be the page opened in the morning.

Sections:

- **Overnight summary**: events since last local midnight UTC and since last visit.
- **Publishing summary**: stories published, pending approval, failed, and best candidates to approve.
- **Model summary**: best model changes, newly discovered models, blocked/degraded models, latency outliers.
- **Infra summary**: restarts, service flips, GPU downtime, Vast balance/runway.
- **Cost summary**: estimated daily burn and projected monthly spend.
- **Suggested schedule**: recommended operating sequence for the day.

Actions:

- Generate Telegram brief now.
- Mark brief reviewed.
- Export as Markdown into `/opt/ai-vault/daily/YYYY-MM-DD-dashboard.md`.

---

## New Domain: Agents

`/agents` should answer what every AI worker is doing and whether it is useful.

Coverage:

- Workspace sessions launched from `/workspace`: Claude, Codex, OpenCode, and shell.
- OpenCode sessions from the existing SDK.
- Paperclip editorial agents from DB/API where available.
- Autopipeline stage workers from pipeline state.
- Systemd timers that run agent-like jobs.
- Recent Codex/Claude work inferred from git commits and progress logs.

Views:

- **Active sessions**: title, model, started, last activity, cwd, branch, touched files.
- **Agent roster**: name, role, adapter, model, last success, last error, average runtime.
- **Task ledger**: pending/running/done tasks across agents.
- **Workspace changes**: recent git diffs grouped by agent/session.
- **Handoff packets**: generated summaries for resuming work.

Actions:

- Open `/workspace` scoped to the selected session.
- Start a new Claude, Codex, OpenCode, or shell session with a prefilled task and cwd.
- Stop/abort a runaway local PTY session.
- Generate a handoff summary.
- Link a session to a dashboard incident or story.

V4.0 target: workspace session registry, recent sessions, OpenCode/Claude/Codex/shell launch profiles, and deep links into `/workspace`. More advanced agent controls can wait for V4.1.

Relationship to `/paperclip`: `/agents` shows a unified cross-agent summary row for each Paperclip agent (name, role, status, last run). The full Paperclip-specific views — task ledger, per-agent error history, approval queue, adapter health, DB health — live at `/paperclip` (V4.1). The "Agent roster" view in `/agents` links out to `/paperclip` for depth.

---

## New Domain: Costs

`/costs` should make cost control explicit.

Inputs:

- Vast account balance, credit, hourly rate, instance uptime.
- LiteLLM request logs if available.
- Model health checks and pipeline stage durations.
- OpenRouter/GitHub/OpenAI usage if exposed through local logs or provider APIs.
- Story counts and publishing outcomes.

Metrics:

- Current hourly burn.
- Projected daily and monthly burn.
- Cost per article.
- Cost per completed pipeline stage.
- Cloud fallback usage versus GPU usage.
- Savings from local GPU versus cloud-only estimate.
- Runway and top-up threshold.

Actions:

- Set alert thresholds.
- Trigger "cheap mode" policy: prefer free/fast cloud models and avoid expensive fallbacks.
- Trigger "quality mode" policy: allow stronger models for verification-heavy stories.
- Export weekly cost report.

V4.0 target: Vast + estimated GPU burn + pipeline throughput cost estimate. Provider-level spend can be V4.2 unless local logs already expose it cleanly.

---

## NewsBites V4

V3 shows article counts and deploy health. V4 should connect editorial operations to product outcomes.

Add:

- Article lifecycle: draft -> approved -> published -> indexed -> promoted.
- Pending approval triage ranked by risk and freshness.
- Vertical performance: production volume, failure rate, approval lag, reader outcome if analytics are available.
- Content freshness: stale verticals, undercovered topics, overproduced categories.
- Article health: missing image, weak digest, duplicate tags, bad frontmatter, low word count, no panel hints.
- Deploy ledger: deploy jobs, output tails, rollback candidate.

Actions:

- Approve selected low-risk stories in batch.
- Open article preview.
- Redeploy with visible job log.
- Generate "fix frontmatter" task for an agent.
- Send top story candidates to Telegram for approval.

Exit criterion:

- The operator can clear the publish queue from mobile without opening SSH, while seeing risk and evidence for each story.

---

## Autopipeline V4

V3 exposes queue/actions. V4 should become the story command center.

Add:

- Story timeline per dossier: stage transitions, model used, duration, retries, doctor actions, files created.
- Queue aging and stuck detection by stage-specific thresholds.
- Stage SLA badges: scout, research, write, verify, publish-prep, publish.
- Throughput forecasts: estimated time to clear current queue.
- Approval backlog optimizer: rank items by confidence, vertical, age, and sensitivity.
- Replay controls: rerun from stage, fork story, abandon with reason.
- Dossier browser: links to `DOSSIER.md`, `sources.json`, `draft.md`, `publish.md`, validation output.
- Pipeline policy panel: cloud stages, GPU mutex stages, autopublish verticals, paused reason.

Actions:

- Batch approve.
- Batch abandon stale stories.
- Rerun a failed stage with selected model.
- Rush a story.
- Add a topic with vertical and priority.
- Inject dossier with path validation.

Guardrails:

- Confirm dangerous actions.
- Show expected downstream effect before action.
- Write every mutation to the V4 audit log.
- Keep allowlists for service and timer commands.

---

## Doctor V4

V3 shows repair history. V4 should turn failures into learning.

Add:

- Error taxonomy editor: map raw errors into stable classes.
- Recurrence detection: same slug/stage/model repeating.
- Repair effectiveness: requeue success, cooldown success, abandonment rate.
- Model blame versus prompt/data blame.
- Suggested rule changes: cooldown model, route stage elsewhere, change prompt, require human approval.
- Postmortem generator for severe incidents.

Actions:

- Promote a repeated issue into an incident.
- Create model block/probation policy from a failure cluster.
- Open affected dossier.
- Generate a patch task for a coding agent.

---

## Models V4

V3 shows best models, inventory, cooldowns, and actions. V4 should be the model operations lab.

Add:

- Model scorecards: latency, JSON reliability, quality state, failure types, cost, context size, capability.
- Fallback simulator: "If editorial-heavy fails, what route will be used and at what cost/latency?"
- A/B stage comparison: compare two models on research/write/verify outcomes.
- Model policy editor: blocked, probation, preferred, max cost, allowed stages.
- Route history: which model served each pipeline stage.
- Discovery diff: new, removed, degraded, improved models across checks.

Actions:

- Run quick check.
- Run full discovery.
- Block/unblock/probation-clear with audit reason.
- Promote a model to preferred for a stage.
- Start a controlled evaluation job on recent dossiers.

V4.0 target:

- Read-only scorecards plus audited block/unblock reason.
- Fallback simulator can be static against current `model-health.json` and LiteLLM config.

---

## Infra V4

V3 shows services, timers, Vast, GPU, and restart actions. V4 should add runbooks and restoration confidence.

Add:

- Service dependency graph: NewsBites, pipeline, Paperclip, OpenClaw, LiteLLM, Vast, Caddy, Cloudflared.
- Runbook drawer per service: health command, logs command, restart command, rollback path.
- Restart history and last result.
- Backup and restore status: last backup, backup size, restore drill date.
- SSL/tunnel/DNS health.
- GPU lifecycle: instance id, tunnel endpoint, model list, last OOM, last reconcile.
- Capacity trends: disk, memory, load, doctor-log growth, article count.

Actions:

- Restart service with runbook context.
- Run backup now.
- Run model-health-check now.
- Start Vast reconcile.
- Mark restore drill complete.

---

## Incidents V4

V3 has a timeline. V4 should manage incident lifecycle.

Incident states:

- Open
- Acknowledged
- Mitigating
- Resolved
- Postmortem needed
- Closed

Incident sources:

- Service down transition.
- GPU down transition.
- Provider outage.
- Doctor abandoned story.
- Queue stuck threshold.
- Vast runway below threshold.
- Failed deploy.
- Typecheck/build failure.

Features:

- Acknowledge and assign.
- Link evidence from source events.
- Suggested runbook.
- Timeline comments.
- Resolution reason.
- Markdown postmortem export.

V4.0 target: generated incident records from event history, acknowledge/resolve actions, and source links.

---

## Growth V4

This is the bridge from operations to the actual media business.

Add when data is available:

- Page views by article and vertical.
- Search impressions/clicks if Search Console is wired.
- Referrers.
- Reader mode usage for `/app`.
- Newsletter/social promotion state.
- Article freshness and evergreen candidates.
- Top underperforming articles that need headline/digest/image work.

Actions:

- Generate promotion copy.
- Mark article promoted.
- Create follow-up story candidate.
- Generate SEO cleanup task.

V4.0 can define the route and schema but defer real analytics if no source is currently connected.

---

## Knowledge V4

The dashboard should expose reusable operational memory.

Sources:

- `/opt/ai-vault/daily/*.md`
- `/opt/ai-vault/projects/*.md`
- Master plan progress logs
- Dossier directories
- Git commits
- Incident postmortems

Features:

- Search across recent operational notes.
- Link notes to incidents, stories, models, and agents.
- "What changed this week?" report.
- Continuation packet generator for Claude/Codex/OpenCode.

V4.0 target: read-only recent notes and generated handoff packet.

---

## Settings V4

`/settings` is the configuration and status surface for the admin center itself. It is the only place where alert thresholds, widget layout, and notification routing can be adjusted without editing server files.

Sections:

- **Widget preferences**: show/hide and reorder widgets on the home wall. Stored server-side in `operator_state` keyed as `widget.prefs`. Changes take effect immediately without page reload.
- **Alert thresholds**: configurable thresholds for each detection system. Examples: queue stuck timeout (default 20 min), disk fill warning (default 85%), Vast runway warning (default 24h) and critical (default 12h), approval backlog threshold (default 50 items), doctor-log rotation alert (default 50 MB). Stored in `operator_state` keyed by detector name (e.g. `threshold.queue.stuck_minutes`).
- **Notification routing**: summary view of active notification rules from the `notification_rules` table. Links to the `/channels` notification rule editor for full CRUD. Shows which event types route to Telegram and which are dashboard-only.
- **Workspace roots**: read-only view of allowlisted roots from `/var/lib/mimule/workspace-registry.json`. Shows risk badges, live-service annotations, and last-used timestamps.
- **Action allowlist status**: read-only view of which service names, timer names, and Docker containers are currently allowlisted for restart/run actions. Managed in server-side code; not editable through the UI. Change requires a server deploy and audit note.
- **Auth status**: shows whether `OPERATOR_TOKEN` is set, whether the server is in production-fail-closed mode, and whether Cloudflare Zero Trust headers are being forwarded. Never displays the token value.
- **AI Vault paths**: configured paths for automatic vault log exports. Read-only view of the daily and project vault paths used by the `/today` brief export and `/reports` generators.

Actions:
- Save widget preferences.
- Reset a detection system threshold to its default value with audit reason.
- Export full `operator_state` snapshot as JSON to AI Vault.
- Verify auth state (runs a server-side check and returns a status card).

Phase: the `operator_state` read/write API (`GET /api/settings/state`, `PUT /api/settings/state/:key`) should exist by Phase 1. The `/settings` UI for widget preferences and thresholds belongs in Phase 2 alongside Mission Control. Full notification rule editor belongs in Phase 9 (Channels).

---

## Channels and Notifications V4

V2 planned a full "Channels" domain. V4 must restore it. The Telegram bot, morning brief, and Paperclip notifications are real operational signals that are currently invisible in the dashboard.

### Telegram Activity

Sources:
- `/opt/mimoun/openclaw-config/` — OpenClaw session/activity logs
- Paperclip notification bridge logs: `paperclip-telegram.js`
- Systemd journal for `openclaw_gateway` Docker container
- `morning-brief.service` run history

Views:
- **Recent interactions**: timestamp, direction (in/out), message summary, delivery status, associated story or incident.
- **Alert log**: every dashboard-generated alert sent to Telegram, with delivery confirmation or failure.
- **Brief history**: last N morning brief titles, delivery status, and link to vault entry.
- **Pending approvals in Telegram**: stories waiting for Telegram approval ping, age, resend option.

### Notification Configuration

Stored in `operator_state` (SQLite) keyed by event class:
- Which event types trigger Telegram alerts.
- Silence rules: mute a class for N hours with expiry.
- Escalation rules: if an event class fires >N times in 1h, send urgent alert.
- Delivery failure retry: retry failed Telegram sends up to 3 times.

### Morning Brief

Actions:
- Preview draft: render the morning brief template with current data without sending.
- Send now: trigger `morning-brief.service` immediately.
- Export to AI Vault: write brief to `/opt/ai-vault/daily/YYYY-MM-DD-brief.md`.
- View archive: last 14 briefs with timestamps and delivery status.

V4.0 target: alert log, pending approval visibility, and "send brief now" action. Full notification rule editor can be V4.2.

---

## LiteLLM Observability V4

LiteLLM at `:4000` is the central routing layer for all editorial, GPU, and cloud model traffic. It is currently invisible in the dashboard. V4 must add `/litellm` as a first-class route.

Sources:
- `/etc/litellm/config.yaml` — canonical routing config
- LiteLLM internal `/health` and `/info` endpoints (`http://127.0.0.1:4000/health`, `/model/info`)
- LiteLLM request logs if stored (check `litellm.service` journal or log file)
- `/var/lib/mimule/model-health.json` — derived routing state
- `systemctl status litellm.service`

Views:

- **Routing config**: rendered view of all logical model names, their backends, timeouts, and fallback chains — derived from config.yaml plus live health state.
- **Live routing state**: for each logical model, which backend is currently preferred and why (health-file driven vs config default).
- **Request stats**: if LiteLLM exposes request/latency/error metrics through its API or logs, show per-model request count, p50/p95 latency, and error rate in the last 1h/24h.
- **Fallback simulation**: given a logical model name and a failure scenario, show the chain order and cost/latency implications — initially static against config.yaml + model-health.json.
- **Rate limit signals**: provider-level signals inferred from doctor-log, model-quality, and model-health files — "OpenRouter: 3 rate-limit errors in last 30 min".
- **Config drift**: compare current `config.yaml` against last known good state (git diff of the file, or a hash stored in SQLite).

Actions:
- Run model health check now.
- Restart `litellm.service` with audit reason and confirm sheet.
- Create an agent task to update routing config.
- Block/unblock a model directly from the LiteLLM view (writes to `model-quality.json`).
- Force reload of `config.yaml` without full restart if LiteLLM supports hot reload.
- Export current routing state as a snapshot to AI Vault.

Security: never expose API keys or backend auth tokens in the config view. Redact all `api_key` fields.

V4.0 target: config viewer, fallback chain display, restart action. Request stats only if LiteLLM exposes them without custom instrumentation.

---

## Paperclip V4

V2 planned Paperclip as a first-class domain equal to Pipeline and Models. V3 and the first V4 draft dropped it to a footnote under `/agents`. V4 must restore it.

Paperclip runs the verification agent and the agent infrastructure. It is a live production component whose health directly impacts editorial output quality.

Sources:
- `docker exec -it paperclip_db psql -U paperclip -d paperclip` — agent state, task history
- `GET http://localhost:3100/api/agents` — if exposed
- `docker compose logs paperclip --tail 50` — runtime errors
- `paperclip-telegram.js` notification bridge

Views:

- **Agent roster**: name, adapter, command, model, role, status (idle/busy/error), last run, last error, consecutive failures.
- **Task ledger**: pending, running, completed, and failed tasks — sortable by age, agent, and priority.
- **Approval queue**: tasks waiting for human approval, with age and risk level.
- **Error history**: per-agent error timeline. Cluster repeated errors by type.
- **Throughput**: tasks completed per day, per agent, over the last 7 and 30 days.
- **Adapter health**: status of `gemini_local`, `openclaw_gateway`, and any other active adapters.
- **DB health**: PostgreSQL connection status, table row counts, last backup.

Actions:
- Wake a sleeping agent (if API supports it).
- Pause/resume an agent queue.
- Open the Paperclip web interface (`paperclip.techinsiderbytes.com`).
- Create a new task for the verification agent from a selected dossier.
- View raw agent output for a specific task.
- Create an incident from a recurring Paperclip failure pattern.
- Restart `paperclip` Docker container with audit reason.
- Restart `paperclip_db` if health check fails (high-risk, confirm required).

V4.0 target: agent roster, adapter health status, task ledger (read-only), and restart action. Full task creation and approval management can be V4.1.

---

## Detection Systems V4

V3 built the **Doctor** as a detection system for story-level failures. V4 should extend this philosophy to other operational domains. Like the Doctor, each detection system should: observe a data stream, apply heuristics, classify findings, and propose specific actions. They do not replace human judgment — they make it faster.

Every detection system must write records into the `events` SQLite table with a source, fingerprint, and evidence refs so the dashboard can surface and act on them.

### Queue Health Detector

Purpose: detect stuck, overloaded, or aging pipeline queues before the operator notices manually.

Signals from `pipeline-state.json`:
- **Stuck queue**: no story has advanced a stage in the last N minutes (default: 20 min when not paused). Emit `queue.stuck` event.
- **Approval backlog spike**: `approvalsWaiting` grows beyond threshold (default: 50) or the oldest item exceeds age threshold (default: 6h). Emit `queue.approval_backlog` event.
- **Single-stage concentration**: >60% of queue items at the same stage for >10 min — likely a model or network problem. Emit `queue.stage_concentration` event.
- **Queue growth rate**: items arriving faster than completing for >30 min continuously. Emit `queue.growing_faster_than_processing`.
- **Empty after active**: queue drops to 0 after being >20 for the previous hour — rare, may indicate scout failure. Emit `queue.unexpected_drain`.

Thresholds stored in `operator_state` so the operator can tune them from the dashboard.

### Disk Growth Detector

Purpose: prevent silent disk exhaustion. Current pain point: `doctor-log.jsonl` is already 17 MB and growing.

Signals from host metrics (sampled every 60s into `metric_samples`):
- **Disk usage trend**: if 7-day linear projection crosses 90% capacity, emit `disk.projected_full` with days-to-full estimate.
- **Fast grower**: a single path growing faster than 100 MB/day. Scan `/var/lib/mimule/`, `/opt/backups/`, dossier root, and journal logs. Emit `disk.fast_growth` with path and rate.
- **Doctor log rotation**: if `doctor-log.jsonl` exceeds 50 MB without rotation, emit `disk.doctor_log_rotation_needed`.
- **Backup stale**: no backup in last 26h. Emit `backup.stale`.
- **Backup oversized**: backup size grew >20% vs. previous — may indicate runaway artifact accumulation. Emit `backup.unexpected_growth`.

Recommended action: create a "run log rotation" job or an "archive old dossiers" job. Never auto-delete without operator confirmation.

### Rate Limit and Quota Detector

Purpose: surface provider degradation before it causes story failures. Currently this is only visible via Doctor entries after damage is done.

Sources:
- `doctor-log.jsonl` error classes (`capacity_rate_limit`, `transport_provider_error`, `transport_timeout`).
- `model-health.json` probation/degraded states.
- LiteLLM logs (if accessible).

Signals:
- **Provider hot**: a single provider appears in >3 doctor entries with `capacity_rate_limit` in a 10-min window. Emit `provider.rate_limit_hot` with provider name and affected stories.
- **Fallback cascade**: primary model for a stage failed >2 times in a row — system is on fallback. Emit `model.fallback_cascade`.
- **All heavy models degraded**: no model in the `heavy` capability tier is available and healthy. Emit `model.heavy_tier_exhausted`.
- **Free tier exhaustion**: all free OpenRouter models in the health file are blocked or degraded. Emit `model.free_tier_exhausted`.
- **Quota warning**: if a provider exposes quota state and usage is >80%. Emit `provider.quota_warning`.

### Cost Anomaly Detector

Purpose: catch runaway spend before it drains Vast credit or hits API limits.

Signals from Vast API and pipeline metrics:
- **Runway below threshold**: Vast runway (balance / hourly rate) drops below 12h. Emit `vast.runway_critical`. Below 24h: emit `vast.runway_warning`.
- **Hourly burn spike**: Vast hourly rate is 2x the 7-day average (e.g., GPU is staying busy longer than normal). Emit `vast.burn_spike`.
- **Daily API spend above baseline**: if provider API spend (from OpenRouter/GitHub logs) exceeds 2x baseline for the rolling 3-day average. Emit `cost.api_spend_spike`.
- **Unexpected cloud usage when GPU is up**: if cloud model calls are high while GPU is healthy, it may indicate the pipeline is not routing correctly to local. Emit `routing.unexpected_cloud_usage`.

### Content Health Detector

Purpose: automated quality gate for published articles. Runs on a timer after each deploy.

Sources: `content/articles/*.md` frontmatter and body.

Checks:
- **Broken external links**: HTTP HEAD probe on all external URLs in published articles. Emit `article.broken_link` per URL.
- **Missing cover image**: article has no `coverImage` field or the path does not resolve. Emit `article.missing_image`.
- **Thin digest**: `digest` field is <40 words, identical to `lead`, or missing. Emit `article.thin_digest`.
- **Missing vertical**: `vertical` field is blank or not in the allowed list. Emit `article.invalid_vertical`.
- **Duplicate slug proximity**: two articles with >80% slug character overlap or >70% title overlap — likely duplicate coverage. Emit `content.near_duplicate`.
- **Overcrowded vertical**: a single vertical has >40% of the last 7-day publish volume. Emit `content.vertical_concentration`.
- **Coverage gap**: a vertical has zero published articles in the last 7 days. Emit `content.vertical_gap`.

Timer: run after each NewsBites deploy. Write results into `events` table. Dashboard surfaces as content health incidents that can be resolved via article-level actions.

### Infrastructure Anomaly Detector

Purpose: catch gradual degradation that is not a hard service failure.

Signals sampled into `metric_samples` every 60s:
- **Memory leak pattern**: RSS of a key process growing monotonically over 4h without restart. Emit `infra.memory_leak_suspected`.
- **Unusual restart frequency**: a service restarted >3 times in 1h. Emit `infra.restart_storm`.
- **SSH tunnel flapping**: `vast-tunnel.service` restarted >2 times in 30 min. Emit `infra.tunnel_flapping`.
- **Hetzner memory pressure**: host RAM above 90% for >5 min. Emit `infra.memory_pressure`.
- **Hetzner disk pressure**: disk above 85%. Emit `infra.disk_pressure`.
- **Long-absent service**: a service expected to be active has not been seen active in a sample window. Emit `infra.service_absent`.

### Source Reliability Tracker

Purpose: track which research sources the pipeline relies on and how often they produce usable output.

Sources: `DOSSIER.md` and `sources.json` files in dossier directories.

Metrics per source domain:
- Appearance count (times cited across all dossiers).
- Success rate (fraction of dossiers where the source appeared in a successfully published story vs. a failed one).
- Recency (last seen in a dossier).
- Source type: news outlet, academic, social, scraped page, etc. (manual classification via dashboard editor).

V4.0 target: read-only metrics derived from dossier scan. Source classification editor can wait for V4.2.

---

## Reports V4

V4 collects rich operational data but defines no formal report surface. Reports turn collected data into decisions and paper trails.

### Report Types

**Daily Pipeline Report** (auto-generated, exportable to AI Vault):
- Stories processed, approved, published, failed, and abandoned.
- Stage-by-stage success rates.
- Doctor interventions (count, verdict mix, most-affected models).
- Model usage: which logical models served which stages.
- Time to clear the morning approval queue.
- Export path: `/opt/ai-vault/daily/YYYY-MM-DD-pipeline.md`

**Weekly Content Report** (triggered manually or via timer):
- Articles published by vertical and status.
- Top-performing verticals (by volume and approval rate).
- Content gaps (verticals with no output).
- Freshness: stale articles vs. new additions.
- Duplicates and quality flags.
- Export path: `/opt/ai-vault/projects/newsbites-content-weekly.md`

**Model Performance Report** (after each full health check):
- Discovery results: new, removed, degraded, improved models.
- Latency trends per model (requires metric_samples history).
- Quality state transitions this period.
- Cost per model estimated from pipeline usage.
- Recommended routing changes.
- Export path: `/opt/ai-vault/projects/model-performance-YYYY-MM-DD.md`

**Cost Breakdown Report** (weekly, manual trigger):
- Vast spend: actual vs. baseline, runway forecast.
- Estimated API spend by provider.
- Cost per article (Vast burn / articles published).
- Free vs. paid model usage ratio.
- Top cost-saving opportunities.

**Incident Summary Report** (on demand or monthly):
- Incidents by severity and domain.
- Mean time to acknowledge and mean time to resolve.
- Recurring issues (same fingerprint >3 times).
- Postmortem links.
- Suggested policy changes.

**Infrastructure Health Report** (weekly):
- Service uptime percentages.
- Restart events.
- Disk and memory trend.
- Backup success rate.
- SSL/tunnel/DNS health summary.

### Report Surface

Route: `/reports`

Views:
- Report archive: list of generated reports, sortable by type and date.
- Generate now: trigger a report type with a date range.
- Export: download as Markdown or copy to clipboard.
- Link to AI Vault: push report to the correct vault path.

Actions:
- Generate and send daily pipeline report to Telegram.
- Schedule weekly content report export.
- Open previous postmortem in the incident view.

---

## Content Health V4

This is the dashboard surface for the Content Health Detector described above. It sits between `/newsbites` (raw article operations) and `/growth` (audience outcomes).

Route: `/content-health`

Sections:

- **Quality violations**: table of all flagged articles with violation type, severity, and recommended fix action.
- **Link health**: status of all external links probed in the last 24h — broken, redirecting, or unreachable. Filterable by article and vertical.
- **Coverage map**: which verticals are active, overproduced, or in a gap. Recommend topics based on gap detection.
- **Duplicate candidates**: pairs of articles with similar slugs or titles, with diff view.
- **Image audit**: articles with missing, unresolvable, or slow-loading cover images.
- **Digest quality**: articles with flagged digests — too short, identical to lead, or missing.
- **Freshness audit**: published articles by age bucket: <7d, 7–30d, 30–90d, >90d. Flag evergreen candidates for re-promotion vs. stale/time-bound content for possible archival.

Actions:
- Run full content health check now.
- Create a batch "fix frontmatter" agent task for flagged articles.
- Create a "regenerate digest" task for a single article.
- Mark article as manually reviewed and clear health flags.
- Open article file in workspace.
- Open article on live site.
- Suppress a specific violation class for a specific article with a reason.

---

## AI Vault Logging

AI Vault logging is mandatory for dashboard/admin-center work.

Write locations:

- Daily log: `/opt/ai-vault/daily/YYYY-MM-DD.md`
- Project log: relevant file under `/opt/ai-vault/projects/`
- Master plan: `/home/agent/MIMULE_MASTER_PLAN_V3.md` when stack-level state, runtime behavior, or planning state changes.

Log after:

- Plan changes.
- Code changes.
- Live verification.
- Deploys/restarts.
- Incident handling.
- Model/pipeline policy changes.
- Workspace/agent sessions that produce decisions or code.
- Any blocker discovery.

Minimum entry:

```markdown
### HH:MM UTC - <agent/tool>

**Goal**: one sentence
**Changed**: files/services/plans touched
**Evidence**: commands, endpoint checks, build/test results
**Next**: next action or blocker
```

The dashboard itself should eventually expose AI Vault logging:

- Quick "log this session" action from `/workspace`, `/jobs`, `/audit`, and incident pages.
- Auto-generated draft entries from action/job evidence.
- Links from project notes back to jobs, incidents, commits, and plans.

---

## Jobs and Audit V4

V3 starts some long-running work, but job state is not durable and action history is not first-class. V4 needs `/jobs` and `/audit` as core admin-center routes.

### `/jobs`

Shows every long-running or background operation:

- NewsBites deploys.
- Backups.
- Model health checks.
- Model discovery.
- Vast reconcile.
- Pipeline batch actions.
- Doctor scans.
- Workspace agent sessions.
- Test/build commands launched from workspace.
- Report exports.

Each job row:

- Status: queued/running/success/failed/canceled.
- Target entity.
- Started/finished time.
- Actor.
- Output tail.
- Evidence refs.
- Retry action when safe.
- Cancel action when supported.
- Create incident action on failure.
- Open workspace/shell action when investigation is needed.

### `/audit`

Shows every mutation:

- Actor.
- Timestamp.
- Action id and label.
- Target type/id.
- Reason.
- Request params.
- Result.
- Linked job id.
- Linked event/incident id.
- Rollback hint.

Audit filters:

- Actor.
- Domain.
- Risk.
- Success/failure.
- Date range.
- Target type.

V4 rule:

- No mutation without audit.
- No high-risk mutation without reason.
- No failed mutation without a next action.

---

## Data Foundation

V4 needs a durable backend state layer. Keep JSON files as source-of-truth where they already are, but ingest snapshots and events into SQLite for history and joins.

### Database

Path:

```text
/var/lib/mimule/dashboard.sqlite
```

Tables:

```sql
events(
  id text primary key,
  ts integer not null,
  source text not null,
  type text not null,
  severity text not null,
  entity_type text,
  entity_id text,
  title text not null,
  summary text,
  evidence_json text not null,
  fingerprint text not null,
  status text not null default 'open',
  resolved_at integer,
  acknowledged_at integer,
  mitigated_at integer,
  closed_at integer,
  created_by text not null default 'system'
);

metric_samples(
  ts integer not null,
  metric text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  value real not null,
  tags_json text not null default '{}',
  primary key (ts, metric, entity_type, entity_id)
);

action_audit(
  id text primary key,
  ts integer not null,
  actor text not null,
  actor_source text,
  action text not null,
  action_id text,
  reason text,
  target_type text not null,
  target_id text not null,
  risk text,
  request_json text not null,
  result_status text not null,
  result_json text,
  evidence_json text,
  job_id text,
  event_id text,
  rollback_hint text
);

operator_state(
  key text primary key,
  value_json text not null,
  updated_at integer not null
);

jobs(
  id text primary key,
  ts integer not null,
  kind text not null,
  status text not null,
  actor text,
  reason text,
  target_type text,
  target_id text,
  command text,
  request_json text,
  evidence_json text,
  output_tail text,
  started_at integer,
  finished_at integer,
  exit_code integer,
  cancel_requested_at integer,
  retry_of_job_id text,
  max_retries integer not null default 3,
  retry_count integer not null default 0
);
```

Schema review note (2026-05-07): the extra `action_audit` and `jobs` columns above are required by the V4 actionability contract. Without `reason`, `risk`, `job_id`, and `evidence_json`, the UI cannot prove why an operator action ran or link the result back to source evidence.

Additional tables needed for V4 additions (2026-05-07 review):

```sql
workspace_sessions(
  id text primary key,
  agent text not null,
  profile text not null,
  root_path text not null,
  cwd text not null,
  branch text,
  dirty integer,
  pid integer,
  status text not null,
  started_at integer not null,
  last_activity_at integer,
  exit_code integer,
  output_log_path text,
  touched_files_json text,
  git_before_json text,
  git_after_json text
);

notification_rules(
  id text primary key,
  event_type_pattern text not null,
  channel text not null default 'telegram',
  enabled integer not null default 1,
  silence_until integer,
  escalate_threshold integer,
  updated_at integer not null
);

channels_log(
  id text primary key,
  ts integer not null,
  direction text not null,
  channel text not null default 'telegram',
  summary text,
  status text not null,
  entity_type text,
  entity_id text,
  retry_count integer not null default 0
);

report_archive(
  id text primary key,
  ts integer not null,
  kind text not null,
  period_start integer,
  period_end integer,
  content_path text,
  vault_path text,
  generated_by text not null default 'system'
);

content_health_findings(
  id text primary key,
  ts integer not null,
  check_run_id text not null,
  slug text not null,
  violation text not null,
  severity text not null,
  detail text,
  resolved_at integer,
  suppressed_reason text
);

source_stats(
  domain text not null,
  last_seen integer not null,
  appearance_count integer not null default 0,
  success_rate real,
  source_type text,
  notes text,
  primary key (domain)
);

runbooks(
  id text primary key,
  service text not null,
  title text not null,
  content_md text not null,
  updated_at integer not null,
  updated_by text
);
```

Retention:

- Raw events: keep 90 days.
- Metric samples: keep 30 days at 1 minute, roll up to hourly for 1 year.
- Action audit: keep indefinitely unless manually pruned.
- Job output tail: keep last 64 KB per job.
- Content health findings: keep 30 days.
- Channels log: keep 60 days.
- Report archive metadata: keep indefinitely; report content files follow AI Vault rotation.

### Ingestor

Add one lightweight Bun process or timer:

```text
dashboard-ingestor.service
dashboard-ingestor.timer
```

It samples:

- `/api/home` derived values every 60s.
- Pipeline queue depth and stage breakdown every 60s.
- GPU, Vast, Hetzner every 60s.
- Model health after each health-check timestamp change.
- Doctor log tail every 5 minutes.
- NewsBites article counts every 10 minutes.
- Service status transitions every 60s.

Additional ingestor signals needed (2026-05-07 review):

- Hetzner disk and memory metrics every 60s (needed for Disk Growth Detector and Infrastructure Anomaly Detector).
- Doctor log error class counts every 5 min (needed for Rate Limit Detector).
- Vast balance and runway every 15 min (needed for Cost Anomaly Detector).
- `pipeline-alerts.json` fingerprint changes on every poll (needed for rate-limit hot detection).
- Content health check run after each NewsBites deploy job completes.
- Channels log entries: tail `openclaw_gateway` Docker logs for Telegram send/receive events.
- LiteLLM service health ping every 60s — just `curl http://127.0.0.1:4000/health`.

Detection systems (Queue Health, Disk Growth, Rate Limit, Cost Anomaly, Content Health, Infrastructure Anomaly) run inside the ingestor on their own cadences. They write to the `events` table using the shared fingerprint scheme to avoid duplicates.

Avoid high-cardinality noise. Use stable fingerprints to dedupe events.

---

## Backend API Additions

Keep V3 envelopes:

```typescript
interface ApiEnvelope<T> {
  generatedAt: string;
  sourceStatus: Record<string, "ok" | "error" | "stale">;
  data: T;
}
```

Add:

```text
GET  /api/action-descriptors?targetType=&targetId=
GET  /api/mission-control
GET  /api/today
GET  /api/events?source=&type=&severity=&state=&since=
POST /api/events/:id/ack
POST /api/events/:id/resolve
GET  /api/actions/registry
GET  /api/actions/audit
POST /api/actions/execute
GET  /api/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
GET  /api/agents
GET  /api/costs
GET  /api/knowledge/recent
POST /api/brief/export
POST /api/autopipeline/batch
POST /api/models/policy
POST /api/doctor/scan
POST /api/doctor/requeue
POST /api/incidents/:id/mute
POST /api/incidents/:id/reopen
POST /api/workspace/session
GET  /api/workspace/session/:id
POST /api/workspace/session/:id/input
POST /api/workspace/session/:id/stop
GET  /api/workspace/roots
GET  /api/workspace/git-status?root=
GET  /api/workspace/files?root=&path=
GET  /api/workspace/diff?root=&sessionId=

GET  /api/channels
GET  /api/channels/log?since=&direction=&status=
POST /api/channels/send
POST /api/channels/brief/preview
POST /api/channels/brief/send
GET  /api/channels/brief/history

GET  /api/litellm/status
GET  /api/litellm/routing
GET  /api/litellm/config
GET  /api/litellm/request-stats?model=&since=

GET  /api/paperclip
GET  /api/paperclip/agents
GET  /api/paperclip/tasks?status=&agent=
GET  /api/paperclip/approvals

GET  /api/notifications/rules
POST /api/notifications/rules/:id
POST /api/notifications/rules/:id/silence

GET  /api/reports
GET  /api/reports/:id
POST /api/reports/generate

GET  /api/content-health
GET  /api/content-health/findings?violation=&slug=
POST /api/content-health/run
POST /api/content-health/findings/:id/suppress
POST /api/content-health/findings/:id/resolve

GET  /api/detection/queue-health
GET  /api/detection/disk-health
GET  /api/detection/rate-limits
GET  /api/detection/cost-anomalies
GET  /api/detection/infra-anomalies
GET  /api/detection/source-reliability

GET  /api/settings/state
PUT  /api/settings/state/:key
GET  /api/settings/action-allowlist
GET  /api/settings/auth-status

POST /api/workspace/session/:id/resume
GET  /api/workspace/session/:id/output

GET  /api/newsbites/articles
POST /api/newsbites/articles/:slug/approve
POST /api/newsbites/articles/:slug/promote
POST /api/newsbites/articles/batch-approve

GET  /api/reports/:id/download
POST /api/reports/:id/send-telegram

GET  /api/knowledge/:id
POST /api/knowledge/export

POST /api/notifications/rules
DELETE /api/notifications/rules/:id
POST /api/notifications/rules/:id/enable
POST /api/notifications/rules/:id/disable

GET  /api/runbooks
GET  /api/runbooks/:id
POST /api/runbooks/:id

POST /api/infra/vast-reconcile
POST /api/infra/backup-verify
POST /api/infra/restore-drill/complete
GET  /api/infra/backup-status
```

Mutation requirements:

- Require `X-Operator-Token` while Zero Trust remains the outer auth layer.
- Add audit reason for every destructive or policy-changing action.
- Return a job id for long-running work.
- Never block the HTTP request on long deploys, backups, model discovery, or evaluation jobs.
- `POST /api/actions/execute` accepts only server-generated action ids plus required params. It must never accept raw shell text except through an explicitly opened shell session.
- Remove `/api/config` token vending. If a browser session needs auth bootstrap, use an HttpOnly same-site cookie or Cloudflare Access identity headers.
- Production must fail closed when `OPERATOR_TOKEN` or the chosen session secret is missing.
- Any route that returns file contents, command output, or rendered config must use the same redaction layer as jobs and workspace logs.
- File and diff APIs must resolve symlinks and enforce the workspace root allowlist after resolution, not before.

---

## Frontend Architecture

Keep:

- React 19
- Vite
- wouter
- Tailwind 4
- Recharts
- Zustand for OpenCode/local UI state
- Custom `useApi`, `useAction`, `useStream` unless mutation complexity justifies React Query later

Add:

- Shared page primitives: `PageHeader`, `MetricTile`, `EvidenceDrawer`, `ActionSheet`, `DataTable`, `SeverityBadge`, `Timeline`, `JobStatus`.
- Shared empty/loading/stale/error states.
- Route-level code splitting for heavy pages and charts to reduce the current bundle warning.
- Server-side preference store for widget order and hidden widgets.
- A route registry that powers nav, breadcrumbs, and "open evidence" links.
- Workspace primitives: `WorkspaceShell`, `RepoPicker`, `AgentLauncher`, `SessionRail`, `TerminalPane`, `DiffPane`, `FileTree`, `SessionTranscript`.
- Terminal stack: `xterm.js` on the client plus `node-pty` or a Bun-compatible PTY bridge on the server.
- Session transport: WebSocket preferred for interactive PTY input/output; SSE is acceptable only for read-only transcript streams.

Immediate type-safety repair:

- Align OpenCode components with `app/lib/store.ts` and the current SDK types.
- Make `bun run typecheck` part of the V4 gate.
- Add a lightweight `bun run check` script if useful: `typecheck` + `build`.

---

## Mobile UX Requirements

- First viewport must show the Now card, top 3 decisions, and risk strip.
- All operator actions available on mobile unless they require raw log inspection.
- Confirmation sheets use clear impact language and show the target entity.
- Tables collapse into row cards on narrow screens.
- Long model names, slugs, and paths must wrap or truncate predictably.
- No hover-only controls.
- Use sticky bottom action bars for story approval and batch queues.
- Keep motion subtle and respect `prefers-reduced-motion`.

---

## Security Requirements

V3 relies on Cloudflare Zero Trust plus `OPERATOR_TOKEN` for mutations. V4 should keep that but harden internal action handling.

Add:

- Audit reason field for policy changes, restarts, batch approvals, deploys, and destructive actions.
- Action allowlists stored in code or config, never free-form shell commands from the client.
- Job runner command templates instead of interpolated shell strings.
- Redaction for env vars, tokens, API keys, and SSH paths in job output.
- Read-only mode if `OPERATOR_TOKEN` is missing in production.
- Optional per-action second confirmation for deploy, restart, batch publish, and model policy changes.

Do not add multi-user auth unless the product becomes multi-operator. It is unnecessary overhead for V4.

---

## Reliability Requirements

- `bun run typecheck` must pass before V4 feature work is considered done.
- `bun run build` must pass.
- `/api/home`, `/api/mission-control`, `/api/today`, `/api/events`, `/api/agents`, and `/api/costs` must degrade source-by-source.
- SSE reconnect must be visible but not noisy.
- Ingestor must be safe if SQLite is locked or unavailable.
- Dashboard remains usable if `/var/lib/mimule/dashboard.sqlite` is missing; it should show "history unavailable" and current V3 data.
- Long jobs must survive page reload. In-memory jobs from V3 are not enough for V4.

---

## Compiled V4 Phase Index

This section is the single phase map for Dashboard V4. The detailed implementation notes remain in the sections below and in `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md`.

### Core dashboard phases

| Phase | Name | Primary outcome |
|---|---|---|
| Core 0 | Stabilize the V3 base | Typecheck/build clean, token vending removed, production auth fail-closed, Doctor scan route/action restored. |
| Core 1 | SQLite history and events | Durable metrics/events store, evidence refs, action descriptors, incident/event history. |
| Core 2 | Mission Control and Today | Ranked attention deck, `/today`, last-visit deltas, server-side operator state, basic settings. |
| Core 3 | Audited actions and durable jobs | SQLite-backed jobs, action audit, retry/rollback hints, output tails, failure incidents. |
| Core 4 | Story command center | Dossier timeline, batch approval queue, stuck story handling, queue-clearance estimates. |
| Core 5 | Model operations lab | Model scorecards, fallback simulator, model policy reasons, route/evaluation scaffolding. |
| Core 6 | Workspace, agents, and handoff | `/workspace`, folder selector, PTY shell, Claude/Codex/OpenCode launch profiles, file/diff view. |
| Core 7 | Costs and growth | Vast burn/runway, pipeline cost estimates, growth schema, weekly exports. |
| Core 8 | UX polish, accessibility, performance | Code splitting, mobile QA, accessibility, `/knowledge`, full `/settings`. |
| Core 9 | Channels, LiteLLM, Paperclip, detection, content health, reports | Operational domains restored from V2 and detection/reporting systems added. |

### Agent-pages phases

Detailed child plan: `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md`.

| Phase | Name | Primary outcome |
|---|---|---|
| Agent 0 | Discovery foundation | Dynamic discovery for skills, commands, MCP, models/providers, sessions, OpenCode stats, and degraded-state evidence. |
| Agent 1 | Shared composer shell | Claude, Codex, and OpenCode share the same composer/session UX without backend behavior changes. |
| Agent 2 | Slash and skill picker | `/` picker for discovered skills, commands, quick prompts, runbooks, risk, source path, and compatibility. |
| Agent 3 | Runtime selectors | Model/profile/effort, permission/sandbox, plan mode, OSS/local route, attachments, review target, execution surface. |
| Agent 4 | Cost, usage, and Doctor bar | Subscription/API/GPU/quota state, per-turn/session usage, OpenCode stats, clear failure reasons. |
| Agent 5 | Quick prompts and AI Vault logging | Cwd-aware presets, manual AI Vault logging, end-of-session log prompt, master-plan entry draft. |
| Agent 6 | Tool result polish | Typed tool views, diffs, shell output cards, file/diff/shell/follow-up actions. |
| Agent 7 | Background runs and notifications | Server-managed long-running sessions, bounded logs, orphan sweep, Telegram notifications, caps. |
| Agent 8 | MCP, providers, hooks, and agents admin | Capability drawer for MCP, hooks, rules, providers, models, agents, permissions, source config links. |
| Agent 9 | Session search and handoff | SQLite session index, search, continuation packets, links to incidents/stories/jobs/audit/vault. |
| Agent 10 | Cloud, review, and PR workflows | Claude PR/review, Codex review/cloud tasks, OpenCode PR/GitHub actions with audit/risk labels. |

### Claude-original agent-pages phase mapping

Claude's 2026-05-09 inline plan had eight agent-page phases. They are preserved and expanded in the Agent track:

| Claude original | Current mapping |
|---|---|
| Phase 0 - Foundations | Agent 0 and Agent 1 |
| Phase 1 - Slash command picker | Agent 2 |
| Phase 2 - Run-time selectors | Agent 3 |
| Phase 3 - Cost, tokens, Doctor bar | Agent 4 |
| Phase 4 - Quick prompts + AI Vault logging | Agent 5 |
| Phase 5 - Tool-result polish | Agent 6 |
| Phase 6 - Power features | Split across Agent 3, Agent 8, and Agent 10 |
| Phase 7 - Background runs + Telegram bridge | Agent 7 |
| Phase 8 - Session search + history | Agent 9 |

### Recommended execution sequence

1. Finish Core 1 and Core 3 foundations early enough that action descriptors, audit, jobs, and events exist before risky mutations expand.
2. Start Agent 0 and Agent 1 in parallel with Core 1 because discovery and shared composer are mostly read-only.
3. Ship Agent 2 and Agent 5 next for immediate operator value: dynamic skills, quick prompts, AI Vault logging, and master-plan drafts.
4. Ship Core 6 plus Agent 3-4 together so `/workspace` launches agents with visible permission, model, execution-surface, and cost state.
5. Ship Agent 8 before Agent 10 so cloud/review/PR actions inherit visible MCP/provider/permission state.

---

## Build Phases

### Phase 0 - Stabilize the V3 base

Goal: make the current codebase safe to extend.

Tasks:

- Fix OpenCode store/SDK type drift until `bun run typecheck` passes.
  - Current failing files verified 2026-05-07: `ChatView.tsx`, `ConnectionScreen.tsx`, `Layout.tsx`, and `SessionListPanel.tsx`.
- Decide whether legacy components are still used or should be removed from the build.
- Reconcile V3 plan stale sections with implementation reality.
- Preserve the existing `.loading-dim.error` uncommitted route edits.
  - Verified `.loading-dim.error` exists in `app/globals.css`; keep Claude's route cleanup intact.
- Remove `/api/config` token vending or replace it with a production-safe session bootstrap.
  - Current offending path: `server/api/router.ts` `GET /api/config`.
- Make mutation auth fail closed in production when operator auth is not configured.
  - Current offending behavior: `server/api/actions.ts` `checkToken()` returns `true` when `OPERATOR_TOKEN` is unset.
- Add missing `POST /api/doctor/scan` route or explicitly defer it behind the unified action registry.
- Confirm `control-surface.service`, `/api/home`, and production build still pass.
- Add `bun run check` if useful.
- Do not touch unrelated `/opt/backups/*` deletions, sibling project modifications, or the unrelated `/opt/newsbites` diff while stabilizing the dashboard.

Exit:

- Typecheck passes.
- Build passes.
- Current V3 routes still render.
- The operator token is no longer readable from browser JavaScript.
- Mutations have an explicit authenticated path in production and a documented development path for local work.

### Phase 1 - SQLite history and events

Goal: give the dashboard memory and make every reported entity addressable.

Tasks:

- Add `server/db/dashboard.ts` with schema migration.
- Add ingestor service/timer or embedded low-risk sampler.
- Write metric samples for services, GPU, Vast, Hetzner, queue, models, doctor, and NewsBites.
- Generate deduped events for state transitions.
- Add `/api/events`.
- Expand `/incidents` to read event records.
- Add evidence references to BFF payloads.
- Add server-generated action descriptors for services, timers, queue items, models, articles, incidents, doctor entries, and Vast/GPU state.
- Add an evidence/action drawer to the frontend and wire it to at least home, incidents, infra, autopipeline, and models.

Exit:

- The app can show 24h trends and incident state from SQLite.
- Missing SQLite degrades gracefully.
- Every top-level reported object has at least one action or a visible disabled action explaining why not.

### Phase 2 - Mission Control and Today

Goal: turn telemetry into attention ranking.

Tasks:

- Add `/api/mission-control`.
- Add Now card, decision queue, change-since-last-visit (reading `last_visit_ts` from `operator_state`), next best actions, and risk strip.
- Add `/today`.
- Add reviewed state and `last_visit_ts` in `operator_state`.
- Export daily brief to AI Vault.
- Add basic `/settings` route: widget preferences (read/write via `GET /api/settings/state` and `PUT /api/settings/state/:key`), alert threshold viewer, auth status card, and workspace roots viewer.

Exit:

- Operator can open home on mobile and know what to do first.
- Widget preferences persist across browser reloads via server-side `operator_state`.

### Phase 3 - Audited actions and durable jobs

Goal: make command execution trustworthy.

Tasks:

- Replace in-memory deploy jobs with SQLite-backed jobs.
- Wrap all mutations in `action_audit`.
- Add job status UI and output tails.
- Add redaction.
- Add audit reason to model policy, restarts, deploys, and batch actions.
- Add `/api/actions/audit` and `/api/jobs`.
- Add `/api/actions/execute` for server-generated action descriptors.
- Turn action failures into events/incidents with retry controls.
- Add rollback hints for deploy, restart, model policy, publish, and kill/abandon actions.

Exit:

- Every dashboard action can be traced after reload.
- Every dashboard action result has a visible next step: retry, inspect logs, open shell, create agent task, or resolve.

### Phase 4 - Story command center

Goal: make the pipeline easier to operate than Telegram/SSH.

Tasks:

- Add story timeline from dossier files, pipeline state, doctor log, and events.
- Add batch approval queue with risk sorting.
- Add dossier browser.
- Add stage SLA and stuck thresholds.
- Add estimated queue clearance time.

Exit:

- Operator can clear or triage publish backlog from mobile.

### Phase 5 - Model operations lab

Goal: make model routing visible, explainable, and adjustable.

Tasks:

- Add model scorecards.
- Add fallback simulator.
- Add model policy reasons.
- Add route history if stage logs expose model names.
- Add model evaluation job scaffold.

Exit:

- Operator can explain why a model is selected and safely change policy.

### Phase 6 - Workspace, agents, and handoff

Goal: make the dashboard a Claude Code web-style workspace for local Claude, Codex, OpenCode, and shell sessions.

Tasks:

- Add `/workspace` and redirect `/opencode` to the OpenCode-scoped workspace view.
- Add allowlisted repo/folder registry.
- Add repo/folder selector with branch, dirty state, risk badge, and live-service warnings.
- Add local PTY session broker.
- Add embedded shell tabs.
- Add launch profiles for `claude`, `codex`, `opencode`, and plain shell.
- Add session rail with persistent metadata and bounded output logs.
- Add file tree and git diff viewer.
- Add `/agents` page backed by the workspace session registry.
- Add OpenCode session count and recent session list.
- Add Paperclip roster if accessible.
- Add git/progress-log handoff packets.
- Link sessions/tasks to incidents and stories.

Exit:

- Operator can switch repos/folders, open a shell, launch Claude/Codex/OpenCode sessions, inspect diffs, and generate a continuation packet.

### Phase 7 - Costs and growth

Goal: connect operations to business results.

Tasks:

- Add `/costs` with Vast burn, runway, and pipeline cost estimates.
- Add growth schema and placeholder route.
- Wire analytics only if a reliable source exists.
- Add weekly report export.

Exit:

- Operator can see runway, expected spend, and cost per article estimate.

### Phase 8 - UX polish, accessibility, performance

Goal: make V4 feel like a finished operational product.

Tasks:

- Code split heavy routes.
- Add evidence drawer and shared components across pages.
- Run mobile QA.
- Run accessibility pass.
- Tune charts and tables for small screens.
- Add saved widget preferences (links to Phase 2 `operator_state` API — Phase 8 adds the full editor UI in `/settings`).
- Add `/knowledge` route: read-only recent AI Vault notes, dossier browser, and continuation packet generator for Claude/Codex/OpenCode. (Full knowledge search and handoff packet polish is V4.2.)
- Complete `/settings` route: full alert threshold editor for all detection systems, notification routing summary.

Exit:

- Mobile first viewport is useful.
- Bundle warning is addressed or explicitly accepted.
- Reduced-motion, keyboard, and contrast checks pass.
- `/knowledge` shows recent vault notes and can generate a handoff packet.
- `/settings` exposes all threshold and widget preference controls.

### Phase 9 - Channels, LiteLLM, Paperclip, Detection Systems, Content Health, and Reports

Goal: close the domains that were in V2 but dropped from V3/V4, and build the detection layer that turns passive observability into active alerting.

Version mapping: Phase 9 tasks split across V4.1 and V4.2. Detection systems (Queue Health, Disk Growth, Rate Limit, Infrastructure Anomaly), plus `/litellm`, `/channels`, `/paperclip` ship in V4.1. Cost Anomaly Detector, Content Health Detector, `/content-health`, and `/reports` ship in V4.2.

Tasks:

**Detection Systems** (deliver first — they feed everything else):
- [x] Add Queue Health Detector to the ingestor — emit `queue.stuck`, `queue.approval_backlog`, `queue.stage_concentration` events.
- [x] Add Disk Growth Detector — project disk-full date, alert on `doctor-log.jsonl` size, alert on stale backup.
- [x] Add Rate Limit and Quota Detector — surface provider hot signals before stories fail.
- [x] Add Cost Anomaly Detector — Vast runway threshold alerts, burn spike detection.
- [x] Add Infrastructure Anomaly Detector — restart storm, tunnel flapping, memory pressure.

**Channels and Notifications**:
- [x] Add `channels_log` ingestor (tail openclaw_gateway Docker logs for Telegram events).
- [x] Add `notification_rules` editor.
- [x] Add `/api/channels` and `/api/notifications/rules`.
- [x] Add `/channels` route with Telegram activity log, alert log, brief history.
- [x] Add "send brief now" and "preview brief" actions.

**LiteLLM Observability**:
- [x] Add `/api/litellm/status`, `/api/litellm/routing`, `/api/litellm/config`.
- [x] Add `/litellm` route with config viewer (redacted) and fallback chain display.
- [x] Add audited `litellm.service` restart action to `/litellm`.
- [x] Add LiteLLM service health to the ingestor's 60s probe.

**Paperclip**:
- [x] Add `/api/paperclip/agents` and `/api/paperclip/tasks` (read Paperclip API or DB).
- [x] Add `/paperclip` route with agent roster, task ledger (read-only), and adapter health.
- [x] Add restart action for the `paperclip` container.

**Content Health**:
- Build the Content Health Detector (broken links, missing images, thin digest, duplicate detection, vertical gap).
- Run it after each successful NewsBites deploy job.
- [x] Add `/api/content-health/findings` and `/api/content-health/run`.
- Add `/content-health` route.

**Reports**:
- [x] Add daily pipeline report generator triggered by the ingestor.
- [x] Add weekly content report generator.
- [x] Add `/reports` route and report archive.
- [x] Add "export to AI Vault" action from `/reports`.

Exit:

- Queue Health Detector fires a real event when the queue is stuck (verifiable by pausing the pipeline).
- Disk Growth Detector correctly projects disk-full date given current growth rate.
- Rate Limit Detector surfaces provider hot signals before they appear as doctor entries.
- `/channels` shows the last 24h Telegram activity.
- `/litellm` shows the current routing config with redacted keys.
- `/paperclip` shows all agents with their current health state.
- `/content-health` shows at least the broken-link and missing-image checks for published articles.
- Daily pipeline report is auto-generated and available at `/reports`.

---

## Version Cut Lines

### V4.0

- Phase 0 complete.
- SQLite events and metrics online.
- Mission Control and Today route live.
- Actionability contract live for core entities: service, timer, GPU, Vast, model, story, article, doctor decision, incident, agent session.
- Durable jobs and action audit for existing mutations.
- `/workspace` live with repo/folder switcher, embedded shell, and launch profiles for Claude, Codex, and OpenCode.
- Basic `/agents` session registry backed by workspace sessions.
- Basic `/costs` Vast runway and daily burn.
- AI Vault logging path documented in-app and available as a manual action from jobs/audit/workspace.

### V4.1

- Story command center with batch approval and dossier browser.
- Incidents lifecycle (Acknowledged → Mitigating → Resolved → Postmortem needed → Closed states).
- Model scorecards and fallback simulator.
- Server-side widget preferences via `/settings`.
- Workspace diff/file preview polish, commit helper, and cloud bridge actions for Claude/Codex where authenticated.
- Detection systems active (Phase 9, first batch): Queue Health Detector, Disk Growth Detector, Rate Limit and Quota Detector, Infrastructure Anomaly Detector — all writing to the `events` table.
- `/litellm` route: config viewer (API keys redacted), fallback chain display, and `litellm.service` restart action.
- `/channels` route: Telegram activity log (last 24h), alert log, and "send brief now" action.
- `/paperclip` route: agent roster, adapter health status, task ledger (read-only), and container restart action.
- `doctor-log.jsonl` size tracked in metric_samples; rotation action available in the Infra detail page.

### V4.2

- Model evaluation jobs.
- Growth analytics, if data source exists.
- Knowledge search and handoff packets.
- Runbook drawers and restore drill tracking.
- Full notification rule editor.
- Source reliability tracker and dossier archive search.
- Paperclip task creation and approval management from dashboard.
- Cost Anomaly Detector: Vast runway threshold alerts and hourly burn spike detection.
- Content Health Detector and `/content-health` route: broken-link probe, missing image, thin digest, duplicate detection, vertical gap.
- `/reports` route: daily pipeline report auto-generated by ingestor, weekly content report on demand, report archive and AI Vault export.

### V4.3

- Predictive recommendations from detection system history.
- Weekly cost/growth/operator reports with AI-generated summaries.
- More agent controls if OpenCode/Paperclip APIs support safe mutation.
- LiteLLM request stats (requires instrumented logging or LiteLLM's built-in analytics).
- Content freshness automation (archive stale articles, re-promote evergreen candidates).
- Full runbook editor with versioning.

---

## V4.0 Exit Criteria

The operator can open `control.techinsiderbytes.com` on a phone and answer:

- What is the single most important thing to handle right now?
- What changed since the last visit?
- Which decisions are waiting?
- Are any services, models, or stories getting worse over time?
- What will each proposed action do?
- Did the last action succeed, and where is its audit record?
- How much runway remains for the GPU?
- Is the dashboard itself healthy enough to trust?
- Can I switch folders, open a shell, and launch Claude, Codex, or OpenCode without leaving the browser?

Engineering gates:

- `bun run typecheck` passes.
- `bun run build` passes.
- `control-surface.service` active after deploy.
- `/api/home` and `/api/mission-control` return partial data if one source fails.
- Mutations are audited.
- Long jobs survive reload.
- Workspace sessions are constrained to allowlisted roots and survive browser reload.
- Every visible warning/error/stale/missing state has a primary action, evidence drawer, or explicit disabled reason.
- No table row in V4.0 core routes is purely informational if the underlying entity can be acted on.

Additional gates from V4 review (2026-05-07):

**Note**: the items below are Phase 9 items and have been reassigned to V4.1 in the Version Cut Lines. They depend on the SQLite `events` table from Phase 1 being stable. V4.0 must deliver the ingestor infrastructure that feeds these detectors, but the detectors themselves and their UI routes ship in V4.1.

- Queue Health Detector is active and has emitted at least one real event (can be tested by pausing the pipeline). — **V4.1 gate**
- Disk Growth Detector is active and shows current disk usage trend and projected-full date. — **V4.1 gate**
- Rate Limit Detector is active and surfaces provider hot signals from the doctor log. — **V4.1 gate**
- The `/litellm` route shows current routing config with API keys redacted. — **V4.1 gate**
- The `/channels` route shows the last 24h Telegram alert log. — **V4.1 gate**
- The `/paperclip` route shows all agents and their current health state. — **V4.1 gate**
- `doctor-log.jsonl` size is tracked and a rotation action exists even if not yet automated. — **V4.1 gate** (size tracking begins in V4.0 ingestor; rotation action ships in V4.1 `/infra`).

---

## Open Questions

1. Should V4.0 use a separate `dashboard-ingestor.service`, or embed the sampler in `control-surface.service` with a low-frequency interval? Recommended answer: separate `dashboard-ingestor.service` — as specified in the Data Foundation section — to isolate sampling failures from the dashboard HTTP server and allow independent restart/timer control.
2. Should operator preferences be local to the dashboard SQLite DB, or backed up into AI Vault as JSON?
3. Is there a reliable analytics source for NewsBites traffic today, or should `/growth` remain schema-first until one is wired?
4. Should batch publish/approval be allowed from dashboard V4.0, or require one more cycle of read-only risk scoring first?
5. Should production mode reject mutations when `OPERATOR_TOKEN` is unset? Recommended answer: yes.
6. Which PTY bridge should V4 use under Bun: `node-pty` through Node compatibility, a small sidecar Node service, or an existing terminal gateway?
7. Should `/workspace` support browser file editing in V4.0, or stay shell/agent/diff-first until V4.1? Recommended answer: shell/agent/diff-first.
8. Should Claude/Codex cloud delegation be deep-linked only, or should the dashboard execute `claude --remote` / Codex cloud commands when local auth is confirmed?
9. Should the detection systems (Queue Health, Disk Growth, etc.) be implemented as separate modules inside the ingestor, or as independent lightweight processes? Recommended: modules inside the ingestor, gated by a feature flag per detector.
10. LiteLLM does not currently write structured request logs. Should V4 enable LiteLLM's built-in logging to a local file or SQLite, or infer routing from `model-health.json` + doctor entries only? The former gives richer data but requires a LiteLLM config change.
11. Should Telegram channel log ingestion tail the `openclaw_gateway` Docker container logs, or should a structured event emitter be added to `telegram-menu.js` directly? Structured emitter is more reliable but requires code change in OpenClaw.
12. Is the Paperclip HTTP API (`http://localhost:3100/api/...`) documented and stable enough to read from the dashboard BFF, or should the BFF read the PostgreSQL DB directly? API is preferred to avoid coupling to DB schema.
13. Should the Content Health Detector run after every deploy, on a timer, or only on-demand? Recommended: after every deploy plus a daily timer for link-checking (HTTP probes are slow and should not block deploys).
14. Should `doctor-log.jsonl` rotation be implemented as part of V4 (before the Disk Growth Detector fires), or should the detector simply alert and let the operator run a manual cleanup job?
15. Should `/reports` auto-generate and push daily pipeline reports to Telegram, or only make them available in the dashboard? Recommended: dashboard-first with an explicit "send to Telegram" action.

---

## Immediate Next Step

Additive correction note (2026-05-09 16:11 UTC): Core Phase 0 security/typecheck work and Agent 0-2 first slices are now partially implemented in `/opt/opencode-control-surface/`. Claude/Codex/OpenCode agent APIs are operator-gated, workspace roots are allowlisted for agent session creation, `/api/agents/summary` is the cheap top-strip endpoint, and the shared composer has a `/` skill/command picker. The durable Core 1/Core 3 foundations below are still the next required base before expanding risky mutations.

Additive correction note (2026-05-09 16:30 UTC): Agent 5 first slice is now partially implemented. `/api/agents/vault-log` is an authenticated manual AI Vault logging endpoint, and Claude/Codex/OpenCode pages expose a shared topbar Vault action that writes reviewed session summaries to `/opt/ai-vault/daily/YYYY-MM-DD.md`, the dashboard project note, and optionally `/home/agent/MIMULE_MASTER_PLAN_V3.md`. Remaining Agent 5 work is cwd-aware prompt loading from disk/operator state plus end-of-session log prompts.

Additive correction note (2026-05-09 17:19 UTC): Agent 5 cwd-aware quick prompts are now partially implemented. `/api/agents/quick-prompts?agent=...&cwd=...` reads versioned prompts from `/opt/opencode-control-surface/config/agent-quick-prompts.json`, overlays optional operator prompts from `/var/lib/control-surface/agent-quick-prompts.json`, scopes results by allowed workspace root, and the shared composer loads those prompts before discovered skills/commands. Seeded prompt coverage now includes `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/opencode-control-surface`, and `/root`. Remaining Agent 5 work is the end-of-session "log this run?" preview prompt.

Additive correction note (2026-05-09 18:05 UTC): Core Phase 1 SQLite foundation added in `/opt/opencode-control-surface/` with `server/db/dashboard.ts`, `server/db/writer.ts`, `server/db/dashboard.test.ts`, and `server/index.ts` startup wiring behind `DASHBOARD_DB=1`; `bun run check` and `bun test server/db/` pass.

Additive correction note (2026-05-09 22:56 UTC): Core Phase 1 Slice 3 shipped — independent interval ingestor + disk-bucket transitions + GET /api/metrics. `server/api/home.ts` factored into `buildHomeData()` so both `homeHandler` and the new `server/db/ingestor.ts` share the same assembly path. The ingestor runs every 30s (configurable via `DASHBOARD_INGESTOR_INTERVAL_MS`) with an `unref()`'d timer, fires the first tick after one full interval, and is gated on `DASHBOARD_DB`. `server/index.ts` starts it after `initDashboardDb()` and stops it on SIGTERM/SIGINT. `server/db/sampler.ts` now emits `disk.bucket` events for `ok`/`warn-70`/`crit-85` transitions on `home.hetzner.diskUsedPct`. `server/api/metrics.ts` exposes `GET /api/metrics?source=&key=&since=&limit=` returning `{ samples, rollup, degraded }`. `bun run check` clean; `bun test server/db/ server/api/` → 19 pass / 0 fail. Live service restarted 22:56:01 UTC; journal confirms "dashboard ingestor started"; live `dashboard.sqlite` accumulating both home-driven and ingestor-driven samples. Remaining Core 1 work: doctor / rate-limit / quota transition kinds; numeric rollup math (min/max/avg) on `/api/metrics`; evidence-drawer wiring in `/incidents`.

Additive correction note (2026-05-10 06:35 UTC): Core Phase 1 Slice 4 shipped — numeric rollup math on `/api/metrics`. `server/api/metrics.ts` accepts an optional `field` query parameter (dotted paths supported, e.g. `field=stageBreakdown.research`). When provided and at least one sample at the matching `(source, key)` has a finite numeric leaf at that path, the rollup row gains `min`, `max`, `avg`, `sum`, `numericCount`, and `field`; otherwise those keys are omitted (back-compat preserved). Math is computed in JS after `JSON.parse` to keep the path identical for ephemeral SQLite. `bun run check` clean; `bun test server/db/ server/api/` → 22 pass / 0 fail (was 19; +3 new). Live service restarted 06:33:00 UTC; live `/api/metrics?source=hetzner&key=load&field=memUsedPct` returned `min=47, max=80, avg=54.49, sum=1990424, numericCount=36526` over the 24 h window. Procedural note: ephemeral seed via `bun -e` did not inherit `DASHBOARD_DB_PATH` and wrote 3 synthetic `vast.runwayHours` rows to the live SQLite at 06:28:49 UTC; rows removed at 06:34 UTC. Remaining Core 1 work: doctor / rate-limit / quota transition kinds; evidence-drawer wiring in `/incidents`; server-generated action descriptors.

Additive correction note (2026-05-10 13:51 UTC): Core Phase 1 doctor/rate-limit transition slice shipped. `server/adapters/doctor.ts` now normalizes current doctor-log fields (`class`, `model`, `diagnosis`) alongside legacy `errorType`/`failedModel`, classifies 429/rate-limit and quota signals from diagnosis text, and exposes normalized helpers reused by `server/api/doctor.ts`. `server/db/sampler.ts` now samples `doctor.decisions` metrics and emits `doctor.decision`, `doctor.rate_limit`, and `doctor.quota` events with minute-bucket dedupe. `server/db/sampler.test.ts` adds doctor decision, rate-limit, and quota transition coverage. Validation: `bun test server/db/sampler.test.ts` -> 11 pass; `bun run typecheck` passed; `bun test server/db/ server/api/` -> 25 pass / 0 fail; `bun run build` passed with the known Vite large-chunk warning. Ephemeral backend smoke on `:3399` used an explicit temp SQLite path and confirmed `/api/home` now reports live `rate_limit` doctor counts and top failing models. Live service restarted 13:50 UTC and `/health` returns `{"ok":true}`. Remaining Core 1 work: evidence-drawer wiring in `/incidents`; recommended next foundation is Core 1.5 server-generated action descriptors.

Additive correction note (2026-05-10 14:01 UTC): Core 1.5 server-generated action descriptor foundation shipped. Added shared `EvidenceRef`, `ActionDescriptor`, and `ActionableEntity` types in `server/api/types.ts`; exported the existing action allowlists from `server/api/actions.ts`; added `server/api/actionDescriptors.ts` and `GET /api/actions/catalog` in `server/api/router.ts`; and covered descriptor safety in `server/api/actionDescriptors.test.ts`. The catalog now generates read-only descriptors for services, timers, queue items, models, articles, pipeline incidents, doctor entries, Vast tunnel, and GPU probe state, including stable ids, evidence refs, risk, confirmation/reason requirements, disabled reasons for unimplemented lifecycle actions, expected duration, job kind, rollback hints, and source routes. Validation: `bun test server/api/actionDescriptors.test.ts` -> 4 pass; `bun test server/db/ server/api/` -> 29 pass / 0 fail; `bun run typecheck` passed; `bun run build` passed with the known Vite large-chunk warning; `git diff --check` passed for touched files. Ephemeral smoke on `:3398` confirmed `/api/actions/catalog` returns service and model-health descriptors with all sources `ok`; live service restarted 14:00 UTC and `/health` returns `{"ok":true}`. Live `/api/actions/catalog?targetType=incident` returned 84 disabled incident lifecycle descriptors with evidence refs and `degraded:false`. Remaining Core 1 work: wire the evidence/action drawer in `/incidents`, then move to Core 3 durable jobs/action audit so `start-job`/policy descriptors can execute through audit.

Additive correction note (2026-05-10 14:11 UTC): Core 1 incidents evidence/action drawer shipped. `/incidents` now lets the operator open a catalog-backed drawer per incident row, showing disabled lifecycle actions, risk/confirm/reason metadata, impact previews, rollback hints, and evidence refs. `server/api/incidents.ts` now exports shared incident entry assembly and normalizes doctor-abandoned error types through the Doctor adapter helper; `server/api/actionDescriptors.ts` reuses the same incident source and supplies doctor-log evidence for `doctor-abandoned` incidents; `server/api/actionDescriptors.test.ts` covers that catalog path. Validation: `bun test server/api/actionDescriptors.test.ts` -> 4 pass / 0 fail / 16 expects; `bun test server/db/ server/api/` -> 29 pass / 0 fail / 98 expects; `bun run typecheck` passed; `bun run build` passed with the known Vite large-chunk warning; `git diff --check` passed. Ephemeral smoke on `:3397` verified `/health`, `/api/incidents`, and `/api/actions/catalog?targetType=incident`; live service restarted 14:10 UTC and `/health` returns `{"ok":true}`. Playwright visual checks for `/incidents` passed on desktop/tablet/iPhone 16 Pro; drawer interaction checks showed 3 catalog actions and 2 evidence refs, no horizontal overflow, and no sub-44px visible controls on tablet/phone. Remaining next foundation: Core 3 durable jobs/action audit.

Additive correction note (2026-05-10 14:22 UTC): Core 3 durable jobs/action audit backend foundation shipped. The dashboard SQLite schema now migrates existing DBs with V4 audit/job metadata columns; `server/db/writer.ts` now provides redacted action-audit writes plus durable job create/update/finish/read helpers; `GET /api/jobs`, `GET /api/jobs/:id`, and `GET /api/actions/audit` are wired in `server/api/router.ts` behind operator auth; NewsBites deploy jobs now write SQLite-backed job records when `DASHBOARD_DB=1` with in-memory fallback retained; and existing mutation endpoints now write audit rows for autopipeline commands, model health/policy actions, doctor scans, NewsBites deploy start/finish, service/container restarts, and timer runs. Validation: `bun test server/db/dashboard.test.ts` -> 6 pass / 0 fail; `bun run typecheck` passed; `bun test server/db/ server/api/` -> 31 pass / 0 fail / 106 expects; `bun run build` passed with the known Vite large-chunk warning; `git diff --check` passed. Ephemeral smoke on `:3396` verified `/health`, `/api/jobs`, `/api/actions/audit`, and a guarded failed restart audit row without touching a real service. Final live service restart at 14:24 UTC is active; `/health` returns healthy, unauthenticated `/api/jobs?limit=1` returns `401`, and authenticated `/api/jobs?limit=3` plus `/api/actions/audit?limit=3` return non-degraded responses. Remaining Core 3 work: `/jobs` and `/audit` UI routes, then `/api/actions/execute` with high-risk reason enforcement and catalog descriptor execution.

Additive correction note (2026-05-10 14:43 UTC): Core 3 jobs/audit UI routes shipped. `/jobs` and `/audit` are now routed from the sidebar and use authenticated reads against the durable jobs/action-audit endpoints. The pages include read-only filters, summary counts, recent rows, and detail drawers for persisted request/evidence/result/output metadata. Validation: `bun run typecheck`; `bun run build` with the known Vite large-chunk warning; `bun test server/db/ server/api/` -> 31 pass / 0 fail / 106 expects; `git diff --check` for touched UI files; temp-DB smoke on `:3395`; live restart at 14:43 UTC with healthy `/health`; live authenticated `/api/jobs` and `/api/actions/audit` non-degraded; Playwright desktop/tablet/iPhone checks for `/jobs` and `/audit` passed with 0 console/page/request failures and no horizontal overflow or sub-44px visible controls. Remaining Core 3 work: `/api/actions/execute` with reason enforcement, then enabled incident lifecycle actions.

Additive correction note (2026-05-10 15:05 UTC): Phase 3 complete — POST /api/actions/execute shipped. `server/api/execute.ts` implements unified audited dispatch: static `getEnforcement()` gates (confirm/reasonRequired), routing table for navigate/copy-command/external-link/open-source/start-job (service/vast/timer/doctor/model-health)/mutate-policy/incident (NOT_IMPLEMENTED), audit write on every attempt, HTTP status codes per error code. `server/api/execute.test.ts` adds 13 tests covering all enforcement paths + low-side-effect routes; no mocking needed. `server/api/router.ts` wires `POST /api/actions/execute` behind checkToken. Validation: `bun run check` clean; `bun test server/db/ server/api/` → 44 pass / 0 fail / 141 expects (was 31); ephemeral smoke on :3199 confirmed auth gate, enforcement gate, routing, and audit writes; live restart 15:04 UTC healthy. Incident lifecycle (acknowledge/resolve/mute) returns NOT_IMPLEMENTED — requires incident state table, scoped to V4.1. Recommended next: Phase 2 Mission Control + /today route.

Additive correction note (2026-05-09 22:46 UTC): Core Phase 1 Slice 2 shipped — embedded home sampler + read endpoint. `server/db/sampler.ts` writes `metric_samples` rows for services/gpu/vast/hetzner/pipeline/models/newsbites and emits deduped `events` for service-state, gpu-status, vast-runway-bucket, and models-health-bucket transitions (1-minute dedupe window via `dedupeKey`). Hooked into `homeHandler` so writes happen on every `/api/home` request. `GET /api/events` (`server/api/events.ts`) supports `limit`/`since`/`kind`/`severity` filters and returns `{events:[], degraded:true, reason:"DASHBOARD_DB disabled"}` when the flag is off. `DASHBOARD_DB=1` is now set on the live `control-surface.service`; SQLite lives at `/var/lib/control-surface/dashboard.sqlite`. Ephemeral two-call test produced 34 metric rows across 17 (source,key) pairs and 0 events (steady state). `bun run check` clean; `bun test server/db/` → 10 pass / 0 fail. Remaining Core 1 work: interval-driven ingestor (current sampler only fires on `/api/home` requests), additional transition kinds (rate-limit / doctor / disk-growth), `/api/metrics` aggregate, and evidence-drawer wiring in `/incidents`.

Start V4 with Phase 0:

1. Fix the OpenCode component/store type drift.
2. Re-run `bun run typecheck` and `bun run build`.
3. Prototype the `/workspace` PTY broker in one allowlisted folder.
4. Add the SQLite schema (including the V4-review additions: `workspace_sessions`, `notification_rules`, `channels_log`, `report_archive`, `content_health_findings`, `source_stats`, `runbooks`) and a tiny event writer behind a feature flag.
5. Build `/api/mission-control` against current V3 sources before adding new UI.

Phase 9 (Channels, LiteLLM, Paperclip, Detection Systems, Content Health, Reports) should be scoped after Phase 3 (Audited Actions) is stable, since all detection systems depend on the `events` table and action audit being reliable. Detection systems can begin as read-only ingestor modules before their UI surfaces are built.

Recommended triage for Phase 9 delivery order:
1. Queue Health Detector (highest immediate operational value — approvals backlog is the daily pain).
2. Disk Growth Detector (low risk, catches a real threat — doctor-log.jsonl is already 17 MB).
3. Rate Limit Detector (closes the gap between model failures and visible alerts).
4. `/litellm` config viewer (low-risk read-only, adds instant visibility).
5. `/paperclip` agent roster (read-only, restores V2 visibility).
6. Cost Anomaly Detector (Vast runway alert is already partially handled — formalize it).
7. `/channels` Telegram activity log.
8. Content Health Detector + `/content-health` route.
9. `/reports` archive and daily pipeline report generator.

Additive correction note (2026-05-18 03:04 UTC): Phase 9 detector follow-up shipped queue/disk plan alignment. The ingestor now emits the plan-named queue events (`queue.stuck`, `queue.approval_backlog`, `queue.stage_concentration`) alongside the existing `pipeline.queue_health` compatibility event. Disk growth detection now covers projected full disk, oversized `/var/lib/mimule/doctor-log.jsonl` (configurable via `DASHBOARD_DOCTOR_LOG_*` env vars), and stale or missing `/opt/backups` entries (configurable via `DASHBOARD_BACKUP_*` env vars). Validation: `bun run typecheck` passed; `bun test server/db/sampler.test.ts` -> 29 pass / 0 fail. Next Phase 9 item: Channels and Notifications (`channels_log` ingestor, `notification_rules`, `/api/channels`, `/channels`).

Additive correction note (2026-05-18 02:35 UTC): Phase 9 Channels backend foundation shipped. The ingestor now samples `openclaw_gateway` Docker logs for Telegram/Paperclip notification lines, redacts tokens/secrets, dedupes recent lines in memory, and writes normalized rows to `channels_log`. Added protected `GET /api/channels`, `GET /api/notifications/rules`, `POST /api/notifications/rules`, and `PUT /api/notifications/rules/:id` backed by SQLite read/upsert helpers. Validation: `bun test server/api/channels.test.ts server/db/ingestor.test.ts --timeout 30000` -> 6 pass / 0 fail / 20 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; temp backend smoke on `:3312` returned healthy `/health`, authenticated channel/rule responses, and unauthenticated `/api/channels` returned 401; `control-surface.service` restarted active and live `/health` returned ok. Next Phase 9 item: add the notification rule editor and `/channels` route.

Additive correction note (2026-05-11 14:34 UTC): Phase 9 first detector slice shipped — Queue Health Detector foundation. `server/db/sampler.ts` now classifies pipeline queue health into `ok`, `approval-warn`, `approval-critical`, `paused-with-queue`, and `queue-large`, then emits deduped `pipeline.queue_health` events with severity, queue depth, approvals waiting, oldest approval age, pause state, stage breakdown, and current-story evidence. `server/db/sampler.test.ts` adds coverage for approval backlog warnings, old approval critical events, and paused queue errors. Validation: `bun test server/db/sampler.test.ts` -> 14 pass; `bun run typecheck` passed; `bun test server/db/ server/api/` -> 63 pass / 0 fail / 214 expects; `bun run build` passed with only the known Vite large-chunk warning; diff whitespace check passed for touched files; temp-DB smoke on `:3394` verified `/health`, `/api/home`, and `/api/events?kind=pipeline.queue_health`; live `control-surface.service` restarted healthy at 2026-05-11 14:33 UTC. Next detector candidates: Disk Growth Detector or Rate Limit Detector.

Additive correction note (2026-05-12 16:11 UTC): Post-Claude dashboard polish/fix pass shipped. `app/globals.css` now uses a theme-aware `--bg-card-end` variable so light-mode widget/chart cards no longer fade to the old hard-coded near-black lower gradient. Runtime OpenCode config at `/root/.config/opencode/opencode.json` now defaults bash permission to `allow`, with destructive command patterns and `git push` still denied, because browser-served sessions were hanging behind bash approvals that did not reliably reach the operator. Validation: `bun run build` passed with the known Vite large-chunk warning; `bun run typecheck` passed; live `control-surface.service` and `opencode-server.service` restarted healthy; browser check in terminal light mode verified a light `.w-card` gradient; OpenCode smoke session `ses_1e30b4fe0ffeHwuV5jgm9XQ0qK` ran bash `pwd` to completion with exit `0`. Next if this recurs: add a first-class OpenCode diagnostics strip for pending permission events, child process age, and permission config state.

Additive correction note (2026-05-12 16:32 UTC): OpenCode permission reply compatibility follow-up shipped. `app/lib/store.ts` now handles both legacy `permission.updated` and current `permission.asked` events, and approval replies target current OpenCode endpoints (`/permission/{requestID}/reply`, then `/session/{sessionID}/permissions/{permissionID}`) before falling back to the old singular session path. This addresses the observed failure where `/session/.../permission/...` returned the OpenCode SPA HTML with HTTP 200 instead of resolving the request. `app/components/PartView.tsx` and `app/globals.css` now use literal spaces in tool row labels so copied transcripts no longer attach tool names to titles/paths. Validation: `bun run typecheck` passed; `bun run build` passed with the known large-chunk warning; live proxy check against `/opencode-api/session/.../permissions/per_fake` returned JSON `true`; browser smoke on `/opencode` accepted raw `Space` keypress as textarea value `a b` and copied tool label text included a real separator.

Additive correction note (2026-05-12 18:33 UTC): Agent transcript visibility slice shipped for Codex and OpenCode. The shared transcript controls now expose `all`, `actions`, and `messages` modes, plus action subfilters for errored, edits, deletes, commands, reads, web, and other. Codex streaming now persists completed item records on assistant turns so action/thought details survive after completion instead of leaving only transient labels; the route also avoids duplicate final-answer rendering and is hardened against malformed/unauthorized session-list responses. OpenCode now uses the same controls and shows collapsed tool result previews, with tool/patch rows opening in action mode. Validation: `bun run typecheck`; `bun run build` with known large-chunk warning; `bun test server/db/ server/api/` -> 63 pass / 0 fail; fresh-build and live Playwright checks for `/codex,/opencode` passed on desktop/tablet/iPhone 16 Pro; `control-surface.service` restarted healthy at 2026-05-12 18:32 UTC. Remaining follow-up: categorize filters against real Codex edit/delete/error payloads rather than only generic text heuristics.

Additive correction note (2026-05-12 18:44 UTC): Agent browser-disconnect keepalive slice shipped. Codex and Claude streaming runs are now server-owned background processes instead of browser-owned requests: browser disconnects no longer trigger child-process `SIGTERM`, while explicit Stop/Escape calls new stop endpoints. Session list/get responses include in-memory `running` and `runStartedAt` metadata, and the Codex/Claude pages poll/reload running sessions after reconnect so the persisted final message appears when work completes. OpenCode Stop is wired to the current OpenCode `/session/{id}/abort` API, preserving normal SSE disconnects as non-fatal. Validation: `bun run typecheck`; `bun run build` with known large-chunk warning; `bun test server/db/ server/api/` -> 63 pass / 0 fail; `git diff --check`; ephemeral `:3302` stop/session metadata smoke; fresh-build and live Playwright checks for `/codex,/claude,/opencode` passed on desktop/tablet/iPhone 16 Pro; live service restarted healthy at 2026-05-12 18:44 UTC. Remaining follow-up: make active run supervision durable across `control-surface.service` restarts if required for truly year-scale jobs.

Additive correction note (2026-05-12 19:11 UTC): Created `/root/DASHBOARD_V4_SCHEDULER_PLAN.md` as the dedicated Builder Pipeline plan for durable scheduled/permanent development automation across Dashboard V4, NewsBites, Mimule/OpenClaw, Paperclip, and future projects. The plan separates `/builder` workflow configuration from `/jobs` execution history, requires plan-file discovery before autonomous work, defines provider/model fallback across Codex, Claude, OpenCode, LiteLLM, and local models, and specifies double validation, Playwright public/internal checks, backup/git/push policy, AI Vault/master-plan logging, context handoff packets, doctor mode, and new-project provisioning. This directly addresses the remaining keepalive gap by moving year-scale agent work into a durable scheduler/worker layer instead of browser-owned or request-owned sessions.

Additive correction note (2026-05-12 22:19 UTC): Builder Pipeline Phase 1 shipped. `/builder` is now a protected read-only discovery route backed by `server/builder/discovery.ts` and `server/api/builder.ts`; it dogfoods `/opt/opencode-control-surface` and surfaces registered projects, plan candidates, `dashboard-orchestrator` skill status, git dirty state, inferred validation commands, internal/public URL targets, agent CLI status, and model inventory. API routes added: `GET /api/builder/projects`, `GET /api/builder/discover`, and `GET /api/builder/models`. Validation: `bun test server/api/builder.test.ts` -> 4 pass; `bun run typecheck`; `bun test server/db/ server/api/` -> 67 pass / 0 fail; `bun run build` passed with the known Vite large-chunk warning; `git diff --check`; fresh-build and live Playwright checks for `/builder` passed on desktop/tablet/iPhone 16 Pro; live authenticated discovery confirmed `/root/DASHBOARD_V4_PLAN.md`, `dashboard-orchestrator`, current git state, three validation commands, internal/public URLs, available models, and zero missing prerequisites. Next: Builder Phase 2 durable workflow/read models and SQLite tables; no autonomous code-writing until Phase 3.

Additive correction note (2026-05-12 22:40 UTC): Builder Pipeline Phase 2 shipped. Dashboard SQLite now migrates durable Builder tables for projects, workflows, runs, passes, artifacts, validations, and locks. `server/builder/store.ts` provides workflow/read models; `server/api/builder.ts` and `server/api/router.ts` expose protected workflow CRUD/read endpoints plus run/artifact reads. Start/pause/resume/stop/retry/cancel/provision routes are wired but intentionally return `409` until the Phase 3 runner exists. `/builder` now lists saved workflows and can create draft/ready workflows with plan file, agent/model fallback, validation, git, backup, and risk policies; create/update writes `action_audit`. Validation: `bun test server/api/builder.test.ts` -> 6 pass; `bun run typecheck`; `bun test server/db/ server/api/` -> 69 pass / 0 fail; `bun run build` passed with the known Vite large-chunk warning; `git diff --check`; temp-DB API smoke created/listed a workflow and confirmed runner actions are disabled; fresh-build and live Playwright checks for `/builder` passed on desktop/tablet/iPhone 16 Pro; browser form smoke saved a workflow through the modal. Next: Phase 3 one-pass runner with supervised process isolation, jobs, passes, artifacts, validation evidence, and audit rows.

Additive correction note (2026-05-13 00:18 UTC): Builder Phase 8 Doctor Automation shipped. `server/builder/doctor.ts` (575-line new module) provides `DoctorReviewProfile`, `DoctorReport` interfaces, `buildDoctorReviewProfile()`, `runDoctorReview()`, `writeDoctorReport()`, and `createDoctorReportRow()` — covering code review (agent-based structured issue extraction), accessibility (playwright color contrast/touch targets/alt attributes), performance (LCP/CLS/FID/TTFB), security (curl headers/SSL), and runtime (endpoint smoke). Dashboard SQLite adds `builder_doctor_reports` table; runner integrates doctor mode in `reconcileRunStatus()` and `startWorkflowRun()` (one-shot, no auto-continue); store adds `readBuilderDoctorReports()`; API adds `GET /api/builder/doctor-reports` and `POST /api/builder/workflows/{id}/doctor-review`; UI adds doctor reports modal and "Run Doctor Review" button. Plus fix: `server/builder/modelSelector.ts` emergency fallback now filters for `isModelHealthy()` first, falls back to all-usable pool, and records `degraded-or-unknown` in reason string. Validation: `bun run typecheck`; `bun test server/db/ server/api/` -> 71 pass; ephemeral :3399 smoke confirmed all endpoints; live `control-surface.service` restarted healthy. Commit `bc44b04`. Next: Phase 9 Scheduled/Permanent Modes.

Additive correction note (2026-05-13 07:33 UTC): Builder Phase 10 follow-up shipped. `/builder` dialogs now stay fixed to the viewport because the dashboard page wrapper no longer leaves a transform on `.dash-page`; Builder workflow/provision dialogs now use ordered pickers for agent order and model fallbacks instead of text fields, with drag/drop plus up/down/remove controls; planner/builder/reviewer selectors use refreshed model inventory; Gemini CLI is discovered and available as a Builder agent (`gemini --version` -> `0.42.0`); root/project plan-file discovery now dynamically finds root `*_PLAN*.md`/operating docs and project-local nested planning docs; `plan` workflow mode was added so Builder can research and create/update a selected plan file; `/root/DASHBOARD_V4_GEMINI_PAGE_PLAN.md` was created as the small plan for a future `/gemini` agent page. Validation: `bun run typecheck`; `bun test server/api/builder.test.ts` -> 8 pass; `bun test server/db/ server/api/` -> 71 pass / 0 fail; `bun run build` passed with the known large-chunk warning; `git diff --check` passed; temp-DB API smoke confirmed Gemini and dynamic plan discovery; protected endpoint smoke confirmed chat sessions, OpenCode proxy, actions, jobs, audit, doctor, models, home, mission-control, today, metrics, and events; browser smoke saved a draft Builder workflow with `codex -> claude -> opencode -> gemini`; modal geometry check confirmed fixed overlay and 880px desktop modal width; live service restarted healthy; bundled visual check passed 21/21 captures across `/builder,/codex,/claude,/opencode,/doctor,/jobs,/audit`.

Additive correction note (2026-05-13 08:02 UTC): Builder workflow usability and load-time fixes shipped. The Gemini page workflow was not starting because it remained `draft` while the runner rejected manual starts from `draft`; `/builder` also lacked edit controls for saved workflows. Manual starts from draft are now accepted, saved workflows can be edited, and run detail reconciliation is awaited before details return. Builder model inventory now includes 36 OpenCode-native `provider/model` IDs from bounded/cached `opencode models`, and OpenCode passes no longer receive LiteLLM aliases such as `zen-minimax`; they use native IDs when selected and otherwise fall back to OpenCode default. Dashboard load was improved by caching/coalescing home/Vast probes and preventing overlapping ingestor ticks that had spawned many concurrent `vastai show instances` processes. Validation: `bun test server/api/builder.test.ts` -> 9 pass; `bun run typecheck`; `bun test server/db/ server/api/` -> 72 pass / 0 fail; `bun run build` passed with the known large-chunk warning; `git diff --check` passed; live timings after restart were `/` 0.0005s, `/api/home` 0.0265s, `/api/builder/discover` 0.0401s from cache; browser smoke confirmed Edit workflow modal, Start control, and OpenCode-native model options; bundled visual check passed 12/12 captures across `/builder,/codex,/claude,/opencode`.

Additive correction note (2026-05-14 10:32 UTC): Builder handoff/Gemini/style follow-up validated and deployed. The current worktree includes the shared agent-page Builder handoff controls, `/gemini` route integration, richer Builder workflow/model UI, mobile/layout style fixes, unified agent discovery/skills coverage, and backend Builder/source-session support. This pass made a focused runner taxonomy correction so stalled agent passes record `agent-stalled`, matching the scheduler-plan failure classes. Validation: `bun run typecheck`; `bun test server/api/builder.test.ts` -> 9 pass / 0 fail; `bun test server/db/ server/api/` -> 72 pass / 0 fail; `bun run build` passed with the known large-chunk warning; `git diff --check` passed; temp-DB smoke on `:3397` passed for Builder workflows/discover/models; disposable visual check passed 15/15 captures across `/builder,/codex,/claude,/opencode,/gemini`; `control-surface.service` restarted healthy and local `/health` returned `{"ok":true}`.

Additive correction note (2026-05-13 08:09 UTC): Session history panel congestion fix shipped for OpenCode. The session list in the left sidebar was overflowing and the last active session spilled on the bottom. Fixed by adding `height:100%` to `.oc-sessions` and `.oc-panel` to properly constrain overflow, reduced session item padding from 9px to 8px with `flex-shrink:0` to prevent squashing, and mobile drawer now has `height:100vh` and `max-width:340px` for proper mobile sizing. Validation: `bun run build` passed (837KB JS, 90KB CSS); `control-surface.service` restarted active.

Additive correction note (2026-05-13 20:17 UTC): BuilderPage model visibility and UX fixes shipped. Fixed opencode-go models not appearing in dropdowns — root cause was `commandStatus` buffer truncating at 800 chars; increased to 16,384 chars to capture all 116 opencode models including 12 opencode-go variants (deepseek-v4-pro, kimi-k2.6, mimo-v2.5-pro, qwen3.6-plus, etc.). Added `zen` and `alibaba` arrays to `BuilderModelsInventory` type; Zen models (zen-minimax, zen-gpt-5-4, etc.) now appear as separate optgroup in ModelSelect. Fixed mobile dialog overflow with CSS overrides for `.modal-overlay` (padding: 8px) and `.modal-box` (max-width/height calc). Added step progress bar to RunDetailPanel showing pass sequence with color-coded status dots and connectors. Added collapsible log sections per pass fetching stdout/stderr from new `GET /api/builder/log` endpoint. Updated modelOptions in WorkflowModal and ProvisionModal to include zen and alibaba models. Validation: `bun run typecheck`; `bun test server/db/ server/api/` -> 72 pass; `bun run build` passed (842KB JS, 93KB CSS); `control-surface.service` restarted healthy; inventory test confirmed opencode=116, opencode-go=12, zen=7.

Additive correction note (2026-05-14 10:37 UTC): Builder Pipeline runner and SPA fallback hardening shipped. `server/builder/runner.ts` persists no-output stall metadata in `builder_runs.result_json` and preserves failed pass exit-code capture; `server/index.ts` now serves `dist/index.html` directly for SPA client routes after Playwright exposed intermittent mobile/tablet deep-route 404 screenshots. Sub-agent contract status: child context file written, but `builder_spawn_child` was unavailable in the parent shell, so no child PID was spawned. Validation: typecheck, focused Builder API tests, 72 backend/API tests, build with known chunk warning, diff whitespace check, temp DB smoke, 15/15 multi-viewport captures across Builder and agent routes, and live service restart/health check.

Additive correction note (2026-05-17 14:47 UTC): Phase 9 Disk Growth Detector projection slice shipped. `server/db/sampler.ts` now reads recent `hetzner.load` metric samples from SQLite, estimates disk percentage growth over the last 7 days, and emits `disk.projected_full` when the trend projects crossing 90% within 7 days; payload includes current percent, percent/day growth, 7-day projection, days-to-90, sample count, and sample window. `server/db/sampler.test.ts` covers fast-growth projection events and flat/shrinking trends. Validation: `bun test server/db/sampler.test.ts` -> 16 pass; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; `bun test server/api/builder.test.ts --timeout 15000` -> 14 pass / 0 fail; `bun test server/db/ server/api/ --timeout 30000` -> 175 pass / 0 fail / 626 expects. A default-timeout broad run reached 174 pass / 1 fail on the Builder child-helper 5s timeout before the timed rerun passed. Live `control-surface.service` restarted active and `/health` returned `{"ok":true,"version":"0.8.0"}`. Next detector candidate: Rate Limit Detector provider/model events.

Additive correction note (2026-05-18 01:00 UTC): Phase 9 Rate Limit Detector provider/model event slice shipped. `server/adapters/doctor.ts` now derives 10-minute `rateLimitProviders` signals from `doctor-log.jsonl` when a provider has more than 3 rate-limit entries, plus `fallbackCascades` when the same model/stage fails more than 2 times in a row. `server/api/home.ts` and `server/api/types.ts` expose those signals in HomeData. `server/db/sampler.ts` now samples provider pressure and emits deduped `provider.rate_limit_hot`, `model.fallback_cascade`, and `model.heavy_tier_exhausted` events. `server/db/sampler.test.ts` covers all three event paths. Validation: `bun test server/db/sampler.test.ts` -> 19 pass / 0 fail / 56 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; `git diff --check` passed for touched repo files. Broad `bun test server/db/ server/api/ --timeout 30000` reached 194 pass / 7 fail / 708 expects due unrelated dirty-worktree `server/api/dossier.test.ts` and `server/api/financeIntel.test.ts` failures. Next detector candidate: Infrastructure Anomaly Detector restart/tunnel/memory pressure events.

Additive correction note (2026-05-18 01:07 UTC): Phase 9 Infrastructure Anomaly Detector sampler slice shipped. `server/db/sampler.ts` now derives sustained Hetzner memory pressure from recent `hetzner.load` metric samples, emits `infra.disk_pressure` when disk crosses 85%, detects sampled service restart storms over 1h, and detects `vast-tunnel` flapping over 30m. Events written: `infra.memory_pressure`, `infra.disk_pressure`, `infra.restart_storm`, and `infra.tunnel_flapping`. `server/db/sampler.test.ts` covers all four paths. Validation: `bun test server/db/sampler.test.ts` -> 23 pass / 0 fail / 76 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; `bun test server/db/ --timeout 30000` -> 35 pass / 0 fail / 171 expects; `git diff --check -- server/db/sampler.ts server/db/sampler.test.ts` passed. Broad `bun test server/db/ server/api/ --timeout 30000` reached 198 pass / 7 fail / 728 expects due unrelated dirty-worktree `server/api/dossier.test.ts` and `server/api/financeIntel.test.ts` failures. Repo-wide `git diff --check` is also blocked by pre-existing whitespace in unrelated dirty files. Next detector candidate: Cost Anomaly Detector.

Additive correction note (2026-05-18 01:12 UTC): Phase 9 Cost Anomaly Detector sampler slice shipped. `server/db/sampler.ts` now reads recent `vast.runway` metric samples, compares the current Vast hourly rate against the 7-day historical baseline, emits `vast.burn_spike` when hourly burn is at least 2x baseline with a meaningful delta, and emits explicit `vast.runway_warning` / `vast.runway_critical` events at the 24h and 12h runway thresholds. Severity escalates to error when the burn multiplier is at least 3x or remaining runway is under 24h. `server/db/sampler.test.ts` covers runway warning/critical emission, burn-spike emission, and small-drift suppression. Validation: `bun test server/db/sampler.test.ts` -> 26 pass / 0 fail / 89 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; `bun test server/db/ --timeout 30000` -> 38 pass / 0 fail / 184 expects; `git diff --check -- server/db/sampler.ts server/db/sampler.test.ts` passed. Broad `bun test server/db/ server/api/ --timeout 30000` reached 201 pass / 7 fail / 741 expects due unrelated dirty-worktree `server/api/dossier.test.ts` and `server/api/financeIntel.test.ts` failures. `control-surface.service` restarted active and `/health` returned `{"ok":true,"version":"0.8.0"}`. Next Phase 9 candidate: `/litellm` read-only config/status viewer.

Additive correction note (2026-05-18 01:19 UTC): Phase 9 LiteLLM Observability API slice shipped. Added protected `GET /api/litellm/status`, `GET /api/litellm/routing`, and `GET /api/litellm/config` endpoints. The API reports systemd/proxy/config status, summarizes `/etc/litellm/config.yaml` model inventory and fallback chains, and returns a redacted YAML view without exposing `api_key` or `master_key` values. Validation: `bun test server/api/litellm.test.ts` -> 2 pass / 0 fail / 7 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk warning; live endpoints returned 200 with `litellm.service` active, 112 config models, 7 fallback chains, and redaction active. Next LiteLLM item: add the `/litellm` route with config viewer and fallback chain display.

Additive correction note (2026-05-18 01:19 UTC): Phase 9 LiteLLM read-only route slice shipped. `app/routes/LiteLLMPage.tsx` adds the `/litellm` dashboard route with service/proxy status cards, fallback-chain display, configured model table, and redacted config viewer. `app/App.tsx`, `app/components/DashSidebar.tsx`, and `app/components/DashHeader.tsx` expose the route; `DashSidebar` primary navigation now resolves by path instead of brittle array indexes after the route additions. `server/api/litellm.test.ts` now covers parser extraction and redaction behavior. Validation: `bun test server/api/litellm.test.ts` -> 2 pass / 0 fail / 7 expects; direct handler smoke showed 112 models, 7 fallback chains, redaction marker present, no `OPENROUTER_API_KEY` leak, service active, and proxy reachable; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk-size warning; Playwright route check on temp dev server `:3307` rendered `/litellm`, confirmed no console errors after fixing duplicate nav, and captured `/tmp/litellm-route-loaded.png`; live `control-surface.service` restarted active with `/health` ok. Next LiteLLM items: audited `litellm.service` restart action and 60s ingestor service-health probe.

Additive correction note (2026-05-18 02:16 UTC): Phase 9 Paperclip read-only API slice shipped. Added protected `GET /api/paperclip/agents` and `GET /api/paperclip/tasks` endpoints backed by `server/api/paperclip.ts`; handlers prefer Paperclip HTTP API reads and fall back to local `paperclip_db` Docker/PostgreSQL queries for agent roster and recent heartbeat runs. Responses include normalized agent/task rows, adapter health summaries, task status summaries, source attribution, and non-fatal read errors. `server/api/paperclip.test.ts` covers API payload normalization and tab-separated DB row parsing. Also fixed Builder runner legacy path-helper call sites and the sampler snapshot shape so typecheck passes. Validation: `bun test server/api/paperclip.test.ts server/db/sampler.test.ts --timeout 30000` -> 31 pass / 0 fail / 101 expects; `bun run typecheck` passed; `bun run check` passed with the known Vite chunk warning; scoped `git diff --check` passed for touched repo files; `control-surface.service` restarted active, `/health` returned ok, and unauthenticated `/api/paperclip/agents` returned 401. Next Paperclip item: add the `/paperclip` route with agent roster, task ledger, and adapter health.

Additive correction note (2026-05-18 02:27 UTC): Phase 9 Paperclip route/action slice shipped. `app/routes/PaperclipPage.tsx` adds `/paperclip` with Paperclip agent roster, task ledger, adapter health, task summary, API/DB source status, refresh, and an audited restart control for the allowlisted `paperclip` container via `POST /api/actions/execute`. `app/App.tsx`, `app/components/DashSidebar.tsx`, and `app/components/DashHeader.tsx` expose the route. Also repaired the dirty Builder runner duplicate `runDir` helper so Bun can start the backend for smoke validation. Validation: `bun run check` passed with the known Vite chunk warning; `bun test server/api/paperclip.test.ts` -> 3 pass / 0 fail; temp backend on `:3309` returned healthy `/health` plus Paperclip agents/tasks from DB fallback; Playwright visual check passed `/paperclip` on desktop, tablet, and iPhone 16 Pro; live `control-surface.service` restarted active and `/health` returned ok. Next Phase 9 item: Channels and Notifications (`channels_log` ingestor, `notification_rules`, `/api/channels`, `/channels`).

---

## Research References

Checked 2026-05-07:

- Anthropic Claude Code web quickstart: `https://code.claude.com/docs/en/web-quickstart`
- Anthropic Claude Code on the web: `https://code.claude.com/docs/en/claude-code-on-the-web`
- Anthropic Claude Code VS Code integration: `https://code.claude.com/docs/en/ide-integrations`
- OpenAI Codex web docs: `https://developers.openai.com/codex/cloud`
- OpenAI Codex CLI docs: `https://developers.openai.com/codex/cli`
- OpenAI Codex product page: `https://openai.com/codex/`
## Status Note - 2026-05-18 07:40 UTC - Channels Notifications Closeout

- Completed the remaining Phase 9 Channels and Notifications checklist items: notification_rules editor, `/channels` route, Telegram activity/alert/brief history, and manual brief preview/send actions.
- Evidence: `bun run check`; `bun test server/api/channels.test.ts` (3 pass / 0 fail); ephemeral `:3308` `/health` + `/api/channels` smoke; Playwright `/channels` render check.
- No unchecked `[ ]` items remain in this plan as of this note.

## Status Note - 2026-05-19 09:36 UTC - Content Health Detector Backend Slice

- Continued the next Phase 9 Content Health detector slice even though the current plan has no unchecked `[ ]` checklist items.
- Added sampler-backed NewsBites article findings for published markdown files: `article.missing_image`, `article.thin_digest`, and `article.invalid_vertical`, with stable dedupe keys and evidence payloads.
- Evidence: `bun test server/db/sampler.test.ts --timeout 30000` (31 pass / 0 fail); `bun run typecheck`; `bun run check` with the known Vite chunk-size warning; `bun test server/db/ --timeout 30000` (52 pass / 0 fail); temp `:3314` `/health` + `/api/home` smoke; live service restart and `/health` ok.
- Next: add the `/content-health` dashboard read model/route or create explicit checklist items for the remaining Content Health and Reports work.

## Status Note - 2026-06-11 02:35 UTC - Content Health API Read Model

- Continued the Content Health V4 surface with a read-only `/api/content-health` endpoint backed by the existing `events` table findings.
- Added normalized finding rows with article slug/title/vertical/path extraction plus summary counts by kind, severity, affected articles, and latest timestamp.
- Added `server/api/content-health.test.ts` and smoke coverage for `/api/content-health`.
- Evidence: `bun test server/api/content-health.test.ts --timeout 30000` (3 pass / 0 fail); `bun test server/api/content-health.test.ts server/api/smoke.test.ts --timeout 30000` (16 pass / 0 fail; existing Docker daemon warning); `bun run typecheck`; `bun run check` with the known Vite chunk-size warning.
- Next: add the `/content-health` dashboard route for triaging findings, or add explicit remaining checklist items for Content Health and Reports work.

## Status Note - 2026-06-11 03:38 UTC - Content Health Route Triage

- Continued the Content Health V4 surface by tightening the existing `/content-health` dashboard route into a usable triage queue.
- Added client-side search, severity filtering, finding-kind filtering, pagination, and a filtered-empty state for content-health findings.
- Evidence: `bun run typecheck`; `bun test server/api/content-health.test.ts --timeout 30000` (2 pass / 0 fail / 10 expects); `bun run check` passed with the known Vite large-chunk warning; bundled visual check for `/content-health` passed desktop/tablet/iPhone on rerun. First visual attempt had a transient tablet 404 while direct `/content-health` curl checks returned 200.
- Next: continue Phase 9 with `/reports` archive and daily pipeline report generator, or add explicit remaining checklist items for Content Health and Reports.

## Status Note - 2026-06-11 03:49 UTC - Reports Generator Backend

- Continued Phase 9 Reports by adding `daily-pipeline` and `weekly-content-health` report templates backed by existing `action_audit` and `events` data.
- Added a stored report-run helper, a read-only `/api/reports` archive/list endpoint, and ingestor-triggered daily/weekly scheduled report generation with `operator_state` period guards.
- Marked the daily pipeline and weekly content report generator bullets complete; `/reports` route/archive UI and AI Vault export remain.
- Evidence: `bun test server/api/reports.test.ts server/db/ingestor.test.ts --timeout 30000` (12 pass / 0 fail / 34 expects); `bun run typecheck`; `bun run check` with the known Vite large-chunk warning; temp `:3321` `/health`, `/api/reports?limit=5`, and `/api/reports/templates` smoke passed; `control-surface.service` restarted active and live `/health` returned ok.
- Next: build the `/reports` dashboard route/archive UI, then add the "export to AI Vault" action.

## Status Note - 2026-06-11 12:14 UTC - Reports Route Archive UI

- Continued Phase 9 Reports by adding the `/reports` dashboard route and archive surface.
- Added archive totals, report-run search/pagination, template activity cards, generate-now controls, Markdown copy, and CSV download actions over the existing Reports API.
- Wired `/reports` into `App`, `DashSidebar`, and `NAV_REGISTRY`; scheduler-plan checkboxes remain unchanged because the scheduler plan has no unchecked `[ ]` items.
- Evidence: `bun run typecheck`; `bun test server/api/reports.test.ts --timeout 30000` (7 pass / 0 fail / 21 expects); `bun run check` passed with the known Vite large-chunk warning; temp backend `:3333` `/health` ok; bundled visual check for `/reports` passed desktop/tablet/iPhone with HTTP 200 and no console/page/request failures.
- Next: add the "export to AI Vault" action for successful report runs.

## Status Note - 2026-06-11 12:23 UTC - Reports AI Vault Export

- Completed the remaining Phase 9 Reports export item by adding a protected report-run AI Vault export endpoint and `/reports` archive action.
- Daily pipeline exports write to `/opt/ai-vault/daily/YYYY-MM-DD-pipeline.md`; weekly content health exports write to `/opt/ai-vault/projects/newsbites-content-weekly.md`; other report templates write project-scoped report Markdown.
- Hardened the dashboard SQLite v5-to-v6 migration so live DBs with historical v5 and v6 `schema_version` rows no longer start without durable history.
- Evidence: `bun run typecheck`; `bun test server/api/reports.test.ts server/db/dashboard.test.ts --timeout 30000` (19 pass / 0 fail / 132 expects); `bun run check` passed with the known Vite large-chunk warning; temp backend `:3334` generated/exported a daily report to a temp AI Vault path and served `/reports` HTTP 200; bundled visual check for `/reports` passed desktop/tablet/iPhone with HTTP 200 and no console/page/request failures; `control-surface.service` restarted active and live `/health` plus `/api/reports` returned 200.
- Next: add explicit new scheduler/V4 checklist items or continue the next V4.2 slice.

## Status Note - 2026-06-11 14:01 UTC - Content Health Duplicate and Coverage Detector

- Continued the next V4.2 Content Health slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Extended the sampler-backed content-health detector with threshold-based near-duplicate article detection, 7-day vertical concentration findings, and 7-day vertical gap findings.
- Preserved the existing `/api/content-health` read model contract; the route already surfaces `content.near_duplicate`, `content.vertical_concentration`, and `content.vertical_gap` event kinds.
- Evidence: `bun test server/db/sampler.test.ts --timeout 30000` (32 pass / 0 fail / 118 expects); `bun test server/api/content-health.test.ts --timeout 30000` (2 pass / 0 fail / 10 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning.
- Next: add external broken-link HTTP probing and/or explicit remaining Content Health checklist items for deploy-triggered runs and `/api/content-health/run`.

## Status Note - 2026-06-11 14:03 UTC - Content Health Broken Link Follow-Up

- Continued the V4.2 Content Health slice by adding deterministic local Markdown broken-link detection for published articles.
- The sampler now emits `article.broken_link` for missing root-relative or relative Markdown link targets, while keeping external HTTP probing out of the periodic sampler.
- Added `/api/content-health/findings` as a read-model alias and allowed `writeEvent({ ts })` for existing dated event test seeds.
- Evidence: `bun test server/db/sampler.test.ts server/api/content-health.test.ts server/api/cost.test.ts --timeout 30000` (35 pass / 0 fail / 135 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning; `control-surface.service` restarted active and live `/health` returned `{"ok":true,"version":"0.8.0"}`.
- Next: add external HTTP link probing or explicit remaining V4.2 Content Health checklist items.

## Status Note - 2026-06-11 14:02 UTC - Content Health On-Demand Run API

- Continued the active Dashboard V4 Content Health V4.2 slice by adding `POST /api/content-health/run`.
- Reused the existing sampler-backed detector through an exported `runContentHealthScan()` helper; the run endpoint executes the detector and returns the normal content-health read model plus scan metadata.
- Marked the `/api/content-health/findings` and `/api/content-health/run` checklist item complete.
- Evidence: `bun test server/api/content-health.test.ts` (3 pass / 0 fail / 15 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning; `bun test server/db/sampler.test.ts` (32 pass / 0 fail / 118 expects).
- Next: wire content-health scanning after successful NewsBites deploy jobs or add explicit new V4.2 checklist items for external HTTP link probing.

## Status Note - 2026-06-11 14:05 UTC - Cost Anomaly Surface

- Continued the next V4.2 cost-anomaly slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Added recent cost anomaly events to `/api/cost/summary`, sourced from `vast.runway_warning`, `vast.runway_critical`, `vast.burn_spike`, `cost.api_spend_spike`, and `routing.unexpected_cloud_usage` events.
- Added a `/cost` "Cost Anomalies" section so Vast runway/burn detector findings are visible beside runway and spend data.
- Evidence: `bun test server/api/cost.test.ts --timeout 30000` (1 pass / 0 fail / 7 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning; temp backend `:3336` served `/health`, `/api/cost/summary`, and `/cost`; current-build visual check on `:3337` passed desktop/tablet/iPhone; `control-surface.service` restarted active and live `/health` returned ok.
- Note: anonymous live visual check for `/cost` passed desktop/tablet but the iPhone navigation timed out; authenticated current-build visual validation passed all viewports.
- Next: add explicit V4.2 checklist items for model evaluation jobs, Knowledge handoff packets, or the next cost detector expansion.

## Status Note - 2026-06-11 14:06 UTC - Content Health External Link Probing

- Continued the active V4.2 Content Health slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Added bounded external HTTP Markdown link probing to the on-demand `POST /api/content-health/run` path, while keeping the periodic home sampler on local-only checks.
- `article.broken_link` findings now include `brokenExternalLinks` evidence with HTTP status or fetch error, escalate external failures to `error`, and retain existing local `brokenLinks` evidence.
- Added focused API coverage using a local Bun HTTP server and private-probe test override.
- Evidence: `bun test server/api/content-health.test.ts --timeout 30000` (4 pass / 0 fail / 21 expects); `bun test server/db/sampler.test.ts -t "content health detector" --timeout 30000` (3 pass / 0 fail / 14 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning.
- Live: `control-surface.service` restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.
- Next: wire content-health scanning after successful NewsBites deploy jobs or add explicit V4.2 checklist items for model evaluation jobs / Knowledge handoff packets.

## Status Note - 2026-06-11 14:07 UTC - Content Health Triage Actions UI

- Continued the active V4.2 Content Health slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Added a `/content-health` "Run check" control wired to the existing protected on-demand detector endpoint, with busy/error/result state and generated finding count feedback.
- Added an expanded finding action to open the live NewsBites article for findings that include a slug.
- Evidence: `bun run typecheck`; `bun test server/api/content-health.test.ts --timeout 30000` (3 pass / 0 fail / 15 expects); `bun run check` passed with the known Vite large-chunk warning; temp backend `:3335` served `/health` and `/content-health`, and a three-viewport Playwright smoke passed with HTTP 200, no console errors, and no failed requests.
- Note: live `/api/auth/session` timed out after 5 seconds, so authenticated live visual validation was not used; live `/health` still returned 200.
- Next: wire content-health scan execution after successful NewsBites deploy jobs or add explicit V4.2 checklist items.

## Status Note - 2026-06-17 12:18 UTC - Content Health Post-Deploy Scan Hook

- Continued the active V4.2 Content Health slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Successful NewsBites deploy jobs now trigger the existing content-health scanner with external link probing.
- The post-deploy scan appends deploy job output-tail evidence and writes `content-health.post-deploy-scan` audit rows for success/failure.
- Deploy success remains intact if the follow-up content-health scan fails.
- Evidence: `bun test server/api/actions.test.ts --timeout 30000` (1 pass / 0 fail / 4 expects); `bun run typecheck`; `bun run check` passed with the known Vite large-chunk warning; temp backend `:3299` authenticated `/health` ok and `/api/content-health?limit=1` returned non-degraded data.
- Next: surface post-deploy content-health scan status in the NewsBites deploy UI or add explicit V4.2 checklist items.

## Status Note - 2026-06-17 13:59 UTC - Builder Preview QR Fallback

- Investigated the active GaffrPro Builder preview issues and created/updated `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md`.
- Fixed Control Surface preview detection so Nx Expo metadata does not launch Expo unless the generated project actually depends on `expo`.
- `mobile-web` now falls back to the generated web preview with a phone-browser QR when Expo is absent.
- Evidence: `bun run typecheck`; `bun run build` passed with the known Vite large-chunk warning; `git diff --check -- server/builder/preview-server.ts app/routes/BuilderPage.tsx app/globals.css`; `control-surface.service` restarted active; fresh `mobile-web` preview is ready and exposes QR URL `https://reviews-ascii-salvation-remix.trycloudflare.com`.
- Remaining issue: the generated GaffrPro app still serves the stock Nx welcome page and the active builder run continues after repeated validation failures. Add runner guards and repair the generated app build baseline next.

## Status Note - 2026-06-17 14:18 UTC - Builder Guard Hardening

- Continued the Builder remediation slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Builder continuation context now turns a failed production-build validation into a repair-only next pass, including the failed command and captured error tail.
- Reconciliation now downgrades agent-exit-0 passes to failed when validation failed, and pauses runs after repeated timeouts or repeated build-recovery failures instead of advancing roadmap work indefinitely.
- Evidence: `bun test server/api/actions.test.ts server/api/modelQuality.test.ts server/api/models.test.ts --timeout 30000` (3 pass / 0 fail / 16 expects); `bun run typecheck`; `bun run build`; `bun run check`; `git diff --check`; `control-surface.service` restarted active and live `/health` returned `{"ok":true,"version":"0.8.0"}`; `/builder` visual check passed desktop/tablet/iPhone 16 Pro on retry after one transient iPhone timeout.
- Next: repair or dogfood the generated-project build baseline so Builder can prove the guard with a failing-build-to-green pass.

## Status Note - 2026-06-17 20:29 UTC - GaffrPro Build Baseline

- Continued the Builder remediation slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Restored generated GaffrPro buildability: `npx nx build api-api` and `npx nx build web` now pass in `/opt/provisioned/gaffrpro`.
- Marked the corresponding P0 remediation-plan baseline/API/web build checklist items complete in `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md`.
- Child PID `626557` failed on unsupported model `openai/gpt-5-codex`; retry PID `628597` completed without repair, so the parent implemented the baseline fixes.
- Evidence: GaffrPro `npx nx show projects`; GaffrPro `npx nx build api-api`; GaffrPro `npx nx build web`; Control Surface `bun run typecheck`; `bun run build`; `bun run check`; focused Control Surface API tests (3 pass / 0 fail); `git diff --check` in both repos.
- Next: retry GaffrPro fullstack preview now that the generated API and web builds are green.

## Status Note - 2026-06-18 08:58 UTC - Builder Preview Backend Preflight

- Continued the Builder preview reliability slice because the scheduler plan and main V4 plan still have no unchecked `[ ]` implementation items.
- Added async backend build preflight for fullstack Builder previews so generated-app backend build failures are caught before a preview is advertised.
- Nx backends use `npx nx build <project> --skip-nx-cache`; preflight diagnostics now also surface Nx workspace detection, mixed lockfiles, and package-manager mismatches.
- Added focused preview preflight tests and a Builder preview note that Cloudflare Quick Tunnel URLs are transient review links.
- Evidence: `bun test server/builder/preview-server.test.ts` (3 pass / 0 fail); `bun test server/builder/ server/api/builder.test.ts --timeout 30000` (42 pass / 0 fail); `bun run typecheck`; `bun run build`; `bun run check`; `git diff --check`. Build/check emitted only the known Vite large-chunk warning.
- Next: dogfood a generated fullstack preview with a deliberately broken backend build to confirm the UI failure path end-to-end, then add a substance gate before accepting builder pass checkmarks.

## Status Note - 2026-06-18 09:06 UTC - Operator Auth Clarity

- Continued from the scheduler-plan handoff through the active remediation plan because the scheduler and main V4 plans have no unchecked `[ ]` implementation items.
- Documented `x-operator-token` as the canonical Control Surface operator automation header.
- Added `Authorization: Bearer <OPERATOR_TOKEN>` compatibility for local operator routes while preserving `gwk_*` Bearer semantics on public gateway surfaces.
- Added `scripts/check-operator-api.sh` to smoke protected JSON endpoints with the canonical header.
- Evidence: focused auth/gateway tests (34 pass / 0 fail); `bun run typecheck`; `bun run build`; `bun run check`; `git diff --check`; ephemeral `:3299` protected API smoke; live service restart and `/health` ok.
- Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at P2 Whole-Site Continuous Checks, starting with `scripts/check-site-routes.sh`.

## Status Note - 2026-06-18 09:27 UTC - Whole-Site Route/API Checker

- Continued through the active remediation plan because the scheduler and main V4 plans have no unchecked `[ ]` implementation items.
- Added/validated `scripts/check-site-routes.sh` for static SPA route shell checks, public JSON API checks, and protected JSON API checks with `x-operator-token`.
- Evidence: `bash -n scripts/check-site-routes.sh`; isolated temp server on `:3318` passed the expanded default route/API check set with `OPERATOR_TOKEN=test`; `bun run typecheck`; `bun run build`; `bun run check`; `git diff --check`.
- Next: add the read-only dashboard tile for active builder run risk in `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md`.

Additive correction note (2026-06-25 11:55 UTC): Insights page now ships honest Apply semantics. Build diagnoses/incidents route Apply to the matching reasoner playbook (actionDescriptorId `reasoner-remediate:<playbookId>:<workflowId>:<passId>[:<incidentId>]`) or are manual-only when no playbook/workflow exists — the old blanket `start-job:doctor:scan` mapping is removed (0 remain live). New `POST /api/insights/bulk-apply` + per-group "Apply all safe (N)" button (skips high-risk/needs-approval). Registry scanner whitelists internal service accounts (INTERNAL_SYSTEM_ACTORS) so internal actors stop tripping the "unregistered actor" finding. Live + verified (371 tests, smoke, visual 9/9). Uncommitted pending operator commit.
## Status Note - 2026-06-29 20:44 UTC - Remediation P3 Completion

- Continued the scheduler-plan handoff through `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` because the scheduler and main V4 plans have no unchecked implementation checklist items.
- Marked the remaining P3 remediation items complete: repair-build-baseline workflow action, per-model quality telemetry, and pause-on-repeated-validation-failure policy.
- Evidence: focused insight scanner tests passed (32 tests), focused cost/governance/execute/builder API tests passed (43 tests), `bun run typecheck` passed, `bun run build` passed with the known Vite large-chunk warning, `bun run check` passed with the known Vite large-chunk warning, and `git diff --check` passed.
- Next: commit/restart the current Control Surface worktree when ready, or add the next explicit Dashboard V4/V5 plan slice.

## Status Note - 2026-06-29 20:46 UTC - Builder Validation-Failure Pause Policy

- Continued the scheduler-plan handoff through the active remediation P3 slice.
- Added configurable Builder pause-on-repeated-validation-failure policy in workflow config, `/builder` UI controls, workflow summary display, and runner enforcement.
- Evidence: `bun run typecheck` passed; `bun test server/api/builder.test.ts --timeout 30000` passed with 22 tests; `bun run build` passed with the known Vite large-chunk warning; `bun run check` passed with the known Vite large-chunk warning; `bun test server/db/ server/api/ --timeout 30000` passed with 411 tests; scoped `git diff --check` passed.
- Next: no unchecked scheduler/main/remediation checklist items remain; add the next explicit Dashboard V4/V5 plan slice.
## Status Note - 2026-07-07 10:07 UTC - ULTRAPLAN A4 Models Actions

Scheduler-plan implementation remains complete; active work continued in `/root/control-surface-plans/ULTRAPLAN.md` Phase 3 A4. Codex completed the `clear-cooldown:model:<name>` low-risk action and validated the existing `probe:model:<logicalName>` path end-to-end with catalog descriptors, audited executor routing, `/models` UI controls, temp-file adapter seams, focused tests, isolated catalog smoke, `/models` Playwright visual check, production build/check, and live service restart. Next active ULTRAPLAN item: A4 chain preview + apply.
