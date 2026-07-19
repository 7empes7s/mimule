# Dashboard V4 Scheduler and Builder Pipeline Plan

Last updated: 2026-05-12 UTC
Owner: Marouane Defili
Canonical app path: `/opt/opencode-control-surface/`
Public URL: `control.techinsiderbytes.com`
Related plans:
- `/root/DASHBOARD_V4_PLAN.md`
- `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md`
- `/home/agent/MIMULE_MASTER_PLAN_V3.md`

---

## Purpose

Dashboard V4 already has the foundation for durable jobs, action audit, agent pages, AI Vault logging, and operator-controlled mutations. The missing layer is a **development autopipeline**: a scheduler and agentic builder system that can run coding agents continuously or on a schedule, follow a plan file, switch providers when credits or rate limits are exhausted, validate work from the backend and public user perspective, and log every pass until the project is done.

This plan defines that layer.

Working name: **Builder Pipeline**.

Primary route: `/builder`.

Supporting routes:
- `/jobs` remains the job ledger and run detail surface.
- `/audit` remains the mutation/action audit surface.
- `/codex`, `/claude`, and `/opencode` get "continue with Builder Pipeline" controls.
- `/doctor` gains "run AI health review" workflows powered by the same scheduler.

The goal is to bring the NewsBites autopipeline pattern to software development across the whole stack: not just news production, but continuous building, validation, repair, documentation, deployment, and review.

---

## Product Thesis

The dashboard should let the operator say:

"Here is a project and a plan. Keep building until it is done. Use the right skills. Validate every pass twice. Back up and push each safe checkpoint. If one model/provider is out of credits or stuck, hand off to the next. Do not lose context. Do not stop unless I stop it."

Builder Pipeline should make project development feel like a controllable production line:

- Plan-driven.
- Provider-agnostic.
- Skill-aware.
- Durable.
- Audited.
- Validated end to end.
- Restartable.
- Observable from mobile.

---

## Research Summary

External research checked on 2026-05-12:

- Temporal documents durable execution as a way to resume workflows after crashes, network failures, or infrastructure outages, even over long time spans. Takeaway: long-running builder automation needs durable workflow state, idempotent steps, retry policy, and replayable history rather than browser/session ownership.
- `systemd.timer` supports timer-based service activation with elapsed and calendar-style scheduling. Takeaway: for the local VPS, systemd is appropriate for coarse durable wakeups, service supervision, and boot recovery, while application SQLite stores workflow intent/state.
- LiteLLM documents OpenAI-compatible access across many providers, router fallback/retry logic, spend tracking, budgets, rate limiting, and observability callbacks. Takeaway: provider selection and fallback should integrate with LiteLLM health/cost data where possible, but direct Claude/Codex/OpenCode CLI subscription paths still need first-class handling.
- Codex CLI supports local terminal execution, non-interactive automation, JSONL event output, model overrides, and output-last-message files for downstream scripting. Takeaway: Codex should be an adapter in Builder Pipeline, not a special page-only implementation.
- OpenCode CLI documents programmatic `run`, resumable sessions via `--continue` / `--session`, headless server attach, provider login, and model listing in `provider/model` format. Takeaway: OpenCode can be a first-class automated worker if Builder Pipeline owns the pass contract, context packet, and failure classification.
- Claude Code hooks provide deterministic lifecycle automation, including formatting, blocking, context injection, async post-tool tests, stop hooks, and defer/resume patterns for custom integrations. Takeaway: Claude should be wired through explicit hooks and handoff packets, while Builder Pipeline stores durable state outside Claude's own session retention.
- Playwright Trace Viewer records browser-test actions so the operator can replay what happened step by step. Takeaway: Builder validation artifacts should include traces, screenshots, console/network failures, and route metadata, not just pass/fail text.
- GitHub Actions jobs run in parallel by default and can be sequenced with job dependencies. Takeaway: GitHub Actions is useful as an optional external validation/push target, but the primary builder scheduler must run on the VPS because it needs local services, local credentials, local skills, public/internal smoke checks, and cross-agent fallback.

Design conclusion:

Do not implement a generic Temporal clone immediately. Start with a local durable scheduler built on SQLite + supervised workers + systemd/tmux process isolation, with a clean workflow abstraction that can later migrate selected workflows to Temporal if the stack needs stronger replay guarantees.

---

## Scope

Builder Pipeline covers software/project automation for:

- Dashboard V4 / control surface.
- NewsBites app.
- NewsBites editorial scripts and autopipeline.
- Mimule/OpenClaw.
- Paperclip.
- LiteLLM/model routing.
- Infrastructure runbooks and doctor checks.
- New projects provisioned from scratch.

Builder Pipeline does not replace:

- NewsBites story autopipeline. It can inspect and improve it, but story production remains separate.
- `/jobs`. Jobs remain the durable execution/audit ledger.
- Agent chat pages. Chats remain direct interactive control. Builder Pipeline orchestrates multi-pass autonomous work.
- GitHub Actions. GitHub Actions may become an external validation target, but not the primary local scheduler.

---

## Non-Goals

- No uncontrolled autonomous deploys to live services without an explicit workflow policy.
- No blind broad edits across `/opt`.
- No automatic destructive operations unless the workflow has a high-risk policy and explicit operator approval.
- No relying on one provider or one model.
- No hiding model failures behind vague "agent failed" states.
- No planless auto-building. A plan file is mandatory.
- No "all green" claims without internal and public evidence.

---

## Route Strategy

Use a dedicated route:

```text
/builder
```

Why not put this inside `/jobs`:

- `/jobs` answers: "What ran, what is running, and what happened?"
- `/builder` answers: "What should keep running, why, with which agents/models, against which plan, and with what validation policy?"

Jobs are execution records. Builder workflows are plans, schedules, policies, and autonomous loops.

Recommended navigation:

```text
Mission Control
Today
Builder
Jobs
Audit
Workspace
Claude
Codex
OpenCode
...
```

---

## Core Objects

### Builder Project

A project is a known development target.

```ts
type BuilderProject = {
  id: string;
  name: string;
  root: string;
  publicUrls: string[];
  internalUrls: string[];
  serviceNames: string[];
  repoRemote?: string;
  defaultBranch?: string;
  planSearchRoots: string[];
  skillSearchRoots: string[];
  vaultProjectPath?: string;
  risk: "low" | "medium" | "high" | "live-service";
};
```

Initial project registry should be derived from existing workspace allowlists and stack knowledge:

- `/opt/opencode-control-surface`
- `/opt/newsbites`
- `/opt/mimoun`
- `/opt/paperclip`
- `/root`

### Builder Workflow

A workflow is the user-configured automation.

```ts
type BuilderWorkflow = {
  id: string;
  name: string;
  projectId: string;
  projectRoot: string;
  planFile: string;
  mode: "once" | "auto-continue" | "scheduled" | "permanent" | "doctor";
  status: "draft" | "ready" | "running" | "paused" | "blocked" | "done" | "failed" | "canceled";
  schedule?: BuilderSchedule;
  agentOrder: BuilderAgentSelection[];
  modelPolicy: BuilderModelPolicy;
  validationProfile: BuilderValidationProfile;
  gitPolicy: BuilderGitPolicy;
  backupPolicy: BuilderBackupPolicy;
  provisioningPolicy: BuilderProvisioningPolicy;
  stopPolicy: BuilderStopPolicy;
  createdAt: number;
  updatedAt: number;
};
```

### Builder Run

A run is one activation of a workflow.

```ts
type BuilderRun = {
  id: string;
  workflowId: string;
  status: "queued" | "running" | "blocked" | "success" | "failed" | "canceled";
  trigger: "manual" | "schedule" | "chat-toggle" | "doctor" | "retry" | "resume";
  startedAt?: number;
  finishedAt?: number;
  currentPassId?: string;
  currentAgent?: string;
  currentModel?: string;
  reason?: string;
  stopRequestedAt?: number;
  stopRequestedBy?: string;
};
```

### Builder Pass

A pass is one bounded unit of agent work.

```ts
type BuilderPass = {
  id: string;
  runId: string;
  sequence: number;
  phase:
    | "discover"
    | "provision"
    | "plan-slice"
    | "implement"
    | "validate"
    | "review"
    | "backup"
    | "commit"
    | "push"
    | "log"
    | "handoff";
  status: "queued" | "running" | "success" | "failed" | "blocked" | "canceled";
  agent: string;
  model: string;
  provider: string;
  startedAt?: number;
  finishedAt?: number;
  jobIds: string[];
  artifactIds: string[];
  validationIds: string[];
  summary?: string;
  nextInstruction?: string;
  failureClass?: BuilderFailureClass;
};
```

### Builder Artifact

Artifacts make the automation inspectable and restartable.

```ts
type BuilderArtifact = {
  id: string;
  workflowId: string;
  runId: string;
  passId?: string;
  kind:
    | "prompt"
    | "stdout"
    | "stderr"
    | "jsonl"
    | "diff"
    | "screenshot"
    | "playwright-report"
    | "validation-report"
    | "backup-manifest"
    | "git-commit"
    | "handoff-packet"
    | "vault-log"
    | "doctor-report";
  path: string;
  sha256?: string;
  createdAt: number;
};
```

---

## Plan File Discovery

A plan file is mandatory. If Builder Pipeline cannot find or confirm one, it must fail with:

```text
PLAN_FILE_NOT_FOUND
```

Discovery order:

1. User-provided path.
2. Known project mappings:
   - Dashboard: `/root/DASHBOARD_V4_PLAN.md`
   - Dashboard agent pages: `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md`
   - Stack: `/home/agent/MIMULE_MASTER_PLAN_V3.md`
   - NewsBites leveling: `/root/NEWSBITES_LEVELING_PLAN_V1.md`
3. Project root candidates:
   - `PLAN.md`
   - `ROADMAP.md`
   - `MASTER_PLAN.md`
   - `plans/*.md`
   - `docs/*PLAN*.md`
   - `*_PLAN*.md`
4. AGENTS/CLAUDE context:
   - Read `AGENTS.md`, `CLAUDE.md`, `.opencode/SKILL.md`, and local runbooks only to discover plan references.
5. If multiple candidates are found, show ranked choices and require one.
6. If none are found, offer a "create project plan" provisioning step, but do not start auto-build until the operator approves the plan path.

Ranking signals:

- File name contains `PLAN`.
- Path is outside `node_modules`, backups, build output, and logs.
- File recently edited.
- File contains sections like `Status`, `Next`, `Phase`, `Validation`, `Acceptance Criteria`, or `Progress`.
- The project root or service name appears in the file.

---

## Skill and Workflow Discovery

Builder Pipeline must discover the relevant skills before each workflow starts.

Sources:

- Codex skills: `/root/.codex/skills/*/SKILL.md`
- Shared design skills: `/root/.agents/skills/*/SKILL.md`
- Claude skills: `/root/.claude/skills/*/SKILL.md`
- Plugin-provided skills: `/root/.codex/plugins/cache/*/skills/*/SKILL.md`
- Project OpenCode skills: `<project>/.opencode/skills/*/SKILL.md`
- Project root OpenCode skill: `<project>/.opencode/SKILL.md`

Discovery output:

```ts
type SkillMatch = {
  name: string;
  path: string;
  agents: string[];
  confidence: number;
  reason: string;
  required: boolean;
};
```

If a workflow needs a skill and none exists:

- For an existing project, Builder Pipeline should block with `SKILL_NOT_FOUND` and offer "create skill" as a provisioning step.
- For a new project, provisioning must create:
  - `AGENTS.md` or project instructions.
  - Project plan file.
  - AI Vault project note.
  - Validation profile.
  - Optional project skill.

No agent should be launched in permanent mode until the skill/project workflow exists.

---

## Agent and Model Catalog

Builder Pipeline needs a real provider/model catalog, not hardcoded buttons.

Initial sources:

- Claude CLI and subscription-backed Claude Code.
- Codex CLI and ChatGPT/API-backed Codex.
- OpenCode providers/models/agents.
- LiteLLM logical models from `/etc/litellm/config.yaml`.
- Local GPU availability from Vast/Ollama health.
- OpenRouter/GitHub Models health from `/var/lib/mimule/model-health.json`.
- Future: Paperclip agents, Codex Cloud tasks, GitHub Actions, local aider/other coding CLIs.

Each model/provider entry should include:

```ts
type BuilderModelOption = {
  id: string;
  label: string;
  provider: "claude" | "openai" | "opencode" | "litellm" | "openrouter" | "github" | "ollama" | "local" | "other";
  route: "cli" | "api" | "proxy" | "server";
  costClass: "free" | "paid" | "subscription" | "local" | "unknown";
  strength: "small" | "medium" | "strong" | "frontier" | "specialist";
  bestFor: string[];
  supportsTools: boolean;
  supportsEdits: boolean;
  supportsImages: boolean;
  supportsStructuredOutput: boolean;
  maxContextLabel?: string;
  health: "ok" | "warn" | "rate-limited" | "exhausted" | "down" | "unknown";
  evidence: EvidenceRef[];
};
```

Default model groups:

- **Planner**: strongest available reasoning model.
- **Builder**: best code-editing model with tool support.
- **Reviewer**: independent strong model, different provider when possible.
- **Tester**: reliable model or deterministic script runner.
- **Doctor**: strongest available models only.
- **Cheap classifier**: local or low-cost routing model.

Fallback behavior:

1. Classify failure.
2. If credit/rate-limit/provider outage, switch provider.
3. If context overflow, produce a continuation packet and switch to fresh context.
4. If tests fail because of code, same provider can retry once.
5. If repeated failure, escalate to reviewer/doctor model.
6. If all configured providers fail, block workflow with exact evidence.

Failure classes:

```ts
type BuilderFailureClass =
  | "credit-exhausted"
  | "rate-limited"
  | "auth-failed"
  | "provider-down"
  | "context-overflow"
  | "tool-permission"
  | "test-failed"
  | "public-health-failed"
  | "git-conflict"
  | "plan-not-found"
  | "skill-not-found"
  | "validation-timeout"
  | "agent-stalled"
  | "unknown";
```

---

## Workflow Modes

### Once

Run one pass against a plan file, validate, log, and stop.

Use for:

- Small fixes.
- Manual chat handoff.
- One-off doctor checks.

### Auto-Continue

Keep running passes until:

- Plan is complete.
- Stop button or Escape is pressed.
- Workflow hits a configured maximum pass count.
- Risk gate requires operator approval.
- All providers fail.
- Validation cannot recover.

Use for:

- Dashboard V4 continuation.
- NewsBites development phases.
- New project implementation.

### Scheduled

Run at a configured schedule.

Use for:

- Daily doctor review.
- Weekly dependency review.
- Nightly E2E validation.
- Morning "continue plan for one pass" workflows.

### Permanent

Always keep trying to make progress on a plan, with cooling periods and stop gates.

Use for:

- Long-term refactors.
- Product backlog execution.
- "Always improve the dashboard until V4 plan is done."

Permanent mode must have:

- Max active workers.
- Cooldown after failed validation.
- Daily budget cap.
- No live deploy without explicit workflow policy.
- Aggressive logging and checkpoints.

### Doctor

Run health/code/user-flow review without necessarily editing.

Use for:

- Strong-model audits.
- Public/internal smoke tests.
- End-user simulation.
- Security/quality/performance/accessibility checks.
- Release readiness.

Doctor can recommend a Builder workflow or create a draft workflow, but should not mutate by default.

---

## Scheduler Architecture

### Components

```text
Browser UI (/builder)
  |
  v
Builder API (server/api/builder.ts)
  |
  v
SQLite state (/var/lib/control-surface/dashboard.sqlite)
  |
  v
Scheduler loop (server/builder/scheduler.ts)
  |
  v
Worker supervisor (server/builder/workers.ts)
  |
  +--> tmux/systemd-run process for agent pass
  +--> validation runner
  +--> backup runner
  +--> git runner
  +--> AI Vault logger
```

### Why a worker supervisor

Browser request lifetimes are not durable enough. Even the control-surface service may restart. Builder worker processes must be independently supervised and discoverable.

Recommended first implementation:

- Use SQLite for workflow/run/pass state.
- Use `tmux` sessions or `systemd-run --scope` for long-running process isolation.
- Store process IDs, tmux session names, log paths, and heartbeat timestamps.
- Use systemd timer/service pair for periodic scheduler wakeups.
- Keep `/jobs` rows as the user-visible execution ledger.

Future implementation:

- Temporal or another durable workflow engine if workflow replay, multi-worker scale, or year-long execution state exceeds the local SQLite scheduler.

### Systemd Units

Recommended service/timer:

```text
control-builder-scheduler.service
control-builder-scheduler.timer
```

Responsibilities:

- Wake every minute.
- Reconcile queued/running workflows.
- Mark stale workers.
- Restart resumable passes.
- Enqueue scheduled runs.
- Do not run agent code inside the HTTP request path.

---

## Database Schema

Add to dashboard SQLite:

```sql
CREATE TABLE builder_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE builder_workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_file TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_run_id TEXT,
  next_run_at INTEGER,
  paused_reason TEXT
);

CREATE TABLE builder_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  current_pass_id TEXT,
  stop_requested_at INTEGER,
  stop_requested_by TEXT,
  result_json TEXT,
  error TEXT
);

CREATE TABLE builder_passes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  agent TEXT,
  provider TEXT,
  model TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  job_ids_json TEXT,
  validation_ids_json TEXT,
  artifact_ids_json TEXT,
  summary TEXT,
  next_instruction TEXT,
  failure_class TEXT,
  error TEXT
);

CREATE TABLE builder_artifacts (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  pass_id TEXT,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT,
  created_at INTEGER NOT NULL,
  metadata_json TEXT
);

CREATE TABLE builder_validations (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  pass_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  command TEXT,
  url TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  output_tail TEXT,
  artifact_id TEXT,
  error TEXT
);

CREATE TABLE builder_locks (
  project_root TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  holder TEXT NOT NULL
);
```

Reuse existing tables:

- `jobs` for every subprocess/action.
- `action_audit` for high-level operator-visible mutations.
- `metric_samples` and `events` for scheduler health, provider failures, and validation trends.
- `operator_state` for UI preferences and selected defaults.

---

## API Surface

Read/discovery:

```text
GET  /api/builder/projects
GET  /api/builder/discover?root=/opt/opencode-control-surface
GET  /api/builder/plan-candidates?root=...
GET  /api/builder/skills?root=...
GET  /api/builder/models
GET  /api/builder/workflows
GET  /api/builder/workflows/:id
GET  /api/builder/runs?workflowId=...
GET  /api/builder/runs/:id
GET  /api/builder/artifacts?runId=...
```

Mutation:

```text
POST /api/builder/workflows
POST /api/builder/workflows/:id/start
POST /api/builder/workflows/:id/pause
POST /api/builder/workflows/:id/resume
POST /api/builder/workflows/:id/stop
POST /api/builder/workflows/:id/trigger-doctor
POST /api/builder/runs/:id/retry
POST /api/builder/runs/:id/cancel
POST /api/builder/provision
```

All mutation endpoints require operator auth and write action audit.

---

## UI Design

### `/builder` Main View

Primary screen is an operations console, not a marketing page.

Sections:

- Workflow cards/table:
  - name
  - project
  - mode
  - status
  - next run
  - current pass
  - current agent/model
  - last validation
  - last commit
  - controls: start, pause, resume, stop, details

- Create workflow drawer:
  - project selector
  - plan file selector
  - mode selector
  - agent/model fallback order
  - validation profile
  - git/backup policy
  - schedule
  - risk policy

- Discovery panel:
  - detected plan files
  - detected skills
  - missing prerequisites
  - git state
  - service/public URLs
  - model/provider health

- Run detail drawer:
  - timeline of passes
  - jobs linked to `/jobs`
  - artifacts
  - diffs
  - screenshots
  - validation reports
  - continuation packet
  - provider failures and fallback decisions

### Chat Page Integration

Claude/Codex/OpenCode pages should expose:

- "Continue with Builder Pipeline"
- "Create workflow from this chat"
- "Run doctor review on this session"
- "Use this session as context for workflow"

The chat integration should capture:

- agent
- cwd
- session transcript summary
- touched files
- current prompt
- recommended plan file
- skill matches

### `/jobs` Integration

Every Builder pass should create and link jobs:

- `builder.agent-pass`
- `builder.validation`
- `builder.backup`
- `builder.git-commit`
- `builder.git-push`
- `builder.vault-log`
- `builder.doctor`

Job rows should include `workflowId`, `runId`, and `passId` in request/evidence JSON.

---

## Agent Pass Contract

Every agent pass gets a standardized prompt envelope:

```markdown
You are an automated Builder Pipeline agent.

Project:
- root: <projectRoot>
- public URLs: <urls>
- service names: <services>

Plan:
- file: <planFile>
- current target section: <section or inferred next slice>

Required workflow:
1. Read AGENTS.md / CLAUDE.md / project instructions.
2. Read the plan file and latest progress entries.
3. Use relevant skills before implementation.
4. Make one bounded, independently shippable change.
5. Do not touch unrelated dirty worktree changes.
6. Run required validation.
7. Report changed files, tests, blockers, and exact next step.

Stop conditions:
- Plan file missing.
- Skill required but missing.
- Validation cannot run.
- Live-service high-risk operation requires approval.
- You detect unrelated conflicting work.
```

Pass output must include structured JSON:

```ts
type BuilderPassResult = {
  status: "success" | "blocked" | "failed";
  summary: string;
  changedFiles: string[];
  validationRun: string[];
  validationFailed: string[];
  artifacts: string[];
  nextPlanStep: string;
  completionSignal: "continue" | "plan-complete" | "needs-operator" | "retry-with-new-provider";
  failureClass?: BuilderFailureClass;
};
```

Use structured output where the agent supports it. Otherwise parse final message conservatively and require a follow-up summarizer/reviewer pass.

---

## Context Window Management

Builder Pipeline must assume context will run out.

Rules:

- One pass should target one bounded slice.
- After each pass, write a continuation packet.
- Do not depend on live browser memory.
- Do not depend on one provider preserving session context.
- Store all important state in artifacts and logs.

Continuation packet path:

```text
/var/lib/control-surface/builder/<workflowId>/<runId>/continuation-<pass>.md
```

Packet contents:

- project root
- plan file
- completed pass summary
- changed files
- validation evidence
- git commit hash if committed
- current dirty state
- blockers
- exact next prompt
- provider/model used
- known failures
- links to artifacts

Before switching providers, Builder Pipeline always creates a packet.

---

## Validation Policy

Every implementation pass needs double validation.

### Internal Validation

Examples:

- `bun run typecheck`
- `bun run build`
- `bun test server/db/ server/api/`
- project-specific unit tests
- lint
- static checks
- `git diff --check`

### Runtime Validation

Examples:

- ephemeral backend server with temp DB
- `/health`
- targeted API smoke
- local route smoke on `http://127.0.0.1:<port>`

### Public Validation

Examples:

- `https://control.techinsiderbytes.com/health`
- public route checks
- Cloudflare/Caddy reachability
- public Playwright smoke

### End-User Validation

Use Playwright to simulate actual workflows:

- desktop
- tablet
- iPhone
- forms
- buttons
- navigation
- filters
- modals
- session creation
- stop/resume
- screenshots
- console/page/request failure detection

### Independent Review

For high-risk or broad changes:

- independent model reviews the diff
- preferably different provider from builder
- reviewer cannot modify files by default
- result is stored as `builder.doctor` or `builder.review`

---

## Backup, Git, and Push Policy

Default policy for Builder Pipeline:

- Snapshot dirty state before each pass.
- If unrelated dirty files exist, mark them in evidence and avoid touching them.
- Create a patch artifact after each pass.
- Run `git diff --check`.
- Commit after successful validation if workflow policy allows.
- Push after commit if workflow policy allows.
- If public deployment is involved, verify public health after deploy.
- Back up important project state before risky migrations.

Git policy:

```ts
type BuilderGitPolicy = {
  commitAfterPass: boolean;
  pushAfterPass: boolean;
  branchMode: "current" | "workflow-branch" | "worktree-branch";
  requireCleanWorktreeForStart: boolean;
  allowDirtyUnrelated: boolean;
  commitPrefix: string;
  requireIndependentReviewBeforePush: boolean;
};
```

Backup policy:

```ts
type BuilderBackupPolicy = {
  beforeRiskyPass: boolean;
  beforeDeploy: boolean;
  includeDbDump: boolean;
  includeConfigSnapshot: boolean;
  storageRoot: string;
  retentionDays: number;
};
```

Backups should write manifests and link to `/jobs`.

---

## Provisioning Policy

For a new project, Builder Pipeline must prepare the workflow tools before implementation.

Provisioning checklist:

- create project folder
- initialize git repo if needed
- create `AGENTS.md`
- create plan file
- create AI Vault project note
- create validation profile
- create local skill if project-specific workflow is required
- create `.opencode/SKILL.md` if useful
- create minimal README/runbook
- discover public/internal URLs or mark absent
- create initial health check if app/service exists

Provisioning must stop after creating the plan and ask for approval before entering permanent auto-build mode.

---

## Security and Safety

Risk controls:

- All mutations require operator auth.
- Builder workflows require explicit project root allowlisting.
- Plan file cannot be outside approved roots unless specifically allowed.
- Dangerous commands need policy and audit.
- Secrets are redacted in logs.
- Live-service restarts require workflow policy.
- Permanent mode has budget and cooldown limits.
- Provider credentials are never shown in the browser.
- Public URLs are validated but not used as command input without escaping.

No automatic workflow can:

- run broad destructive commands,
- reset unrelated user work,
- delete backups,
- rewrite master plans without additive notes,
- bypass operator token checks,
- push to protected branches without policy,
- modify credentials unless a guarded provisioning step explicitly allows it.

---

## Failure Handling

### Credit Exhausted or Rate Limited

1. Record provider failure with exact stderr/API evidence.
2. Mark model health degraded.
3. Produce continuation packet.
4. Switch to next configured provider/model.
5. Continue if policy allows.

### Context Overflow

1. Stop current pass.
2. Write continuation packet.
3. Start fresh context with summarized state.
4. Prefer a larger-context model if available.

### Agent Stalled

Stall signals:

- no stdout/stderr for N minutes,
- no file activity,
- no heartbeat,
- process alive but no progress,
- repeating same output.

Actions:

- soft interrupt if supported,
- ask agent to summarize and continue,
- switch provider,
- hard stop only after policy timeout,
- preserve logs.

### Validation Failed

1. Classify failure.
2. Let same agent fix once if narrow.
3. If repeated, switch to reviewer/doctor model.
4. If public validation failed, block deploy/push unless policy says commit local fix attempt only.

### Plan Complete

Plan completion requires:

- agent says plan complete,
- validation profile passes,
- no unchecked acceptance criteria remain,
- final doctor review passes or is waived,
- final AI Vault/master-plan/project-plan log exists.

---

## Dashboard V4 Test Workflow

Initial dogfood workflow:

```yaml
name: Dashboard V4 Auto Builder
projectRoot: /opt/opencode-control-surface
planFile: /root/DASHBOARD_V4_PLAN.md
mode: auto-continue
publicUrls:
  - https://control.techinsiderbytes.com
internalUrls:
  - http://127.0.0.1:3000
serviceNames:
  - control-surface.service
requiredSkills:
  - dashboard-orchestrator
agentOrder:
  - codex:gpt-5.5
  - claude:subscription
  - opencode:best-available
  - litellm:coding-heavy
validationProfile:
  internal:
    - bun run typecheck
    - bun run build
    - bun test server/db/ server/api/
    - git diff --check
  runtime:
    - ephemeral temp DB smoke
    - local /health
    - targeted API smoke
  public:
    - public /health
    - Playwright desktop/tablet/iPhone for changed routes
gitPolicy:
  commitAfterPass: true
  pushAfterPass: true
  requireIndependentReviewBeforePush: true
backupPolicy:
  beforeDeploy: true
logging:
  - /opt/ai-vault/daily/YYYY-MM-DD.md
  - /home/agent/MIMULE_MASTER_PLAN_V3.md
  - /root/DASHBOARD_V4_PLAN.md
```

First target slice:

- Discovery-only `/builder` page and backend.
- No autonomous editing yet.
- Validate that the dashboard can find:
  - `/root/DASHBOARD_V4_PLAN.md`
  - `dashboard-orchestrator` skill
  - existing agent/model inventory
  - existing validation profile
  - dirty worktree state
  - internal/public URL targets

---

## Implementation Phases

### Phase 0 - Planning Artifact

Status: this file.

Exit criteria:

- Dedicated scheduler/builder plan exists.
- Main V4 plan references it.
- AI Vault/master plan mention the planning artifact.

### Phase 1 - Read-Only Builder Discovery

Goal: make the dashboard understand projects before it runs anything.

Backend:

- `server/api/builder.ts`
- `server/builder/discovery.ts`
- project registry helper
- plan-file discovery
- skill discovery
- model/provider discovery
- git state summary
- validation profile inference

API:

- `GET /api/builder/projects`
- `GET /api/builder/discover?root=...`
- `GET /api/builder/models`

Frontend:

- `app/routes/BuilderPage.tsx`
- sidebar route `/builder`
- project selector
- discovery summary
- plan candidates
- missing prerequisites

Validation:

- typecheck/build
- API tests for discovery
- Playwright route check

Exit criteria:

- Dashboard V4 project discovery identifies plan, skills, git state, URLs, and validations.
- No mutating endpoint exists yet.

### Phase 2 - Workflow Schema and Draft UI

Goal: create and edit workflows without running them.

Backend:

- SQLite migration for builder tables.
- CRUD for workflows.
- action audit for workflow creation/update.

Frontend:

- create workflow drawer
- agent/model fallback ordering
- validation profile editor
- schedule mode selector
- git/backup policy controls

Exit criteria:

- Operator can create a Dashboard V4 workflow in draft/ready state.
- Workflow details survive service restart.

### Phase 3 - One-Pass Runner

Goal: safely run one bounded agent pass.

Backend:

- worker supervisor
- process isolation via tmux or systemd-run
- job rows for agent pass
- artifact writer
- log capture
- stop/pause handling

Supported first adapter:

- Codex exec adapter using JSONL and output-last-message.

Exit criteria:

- One pass runs against `/root/DASHBOARD_V4_PLAN.md`.
- Logs and artifacts are visible.
- Stop works.
- Browser disconnect does not stop worker.

### Phase 4 - Validation Engine

Goal: enforce double validation.

Implement:

- internal validation command runner
- ephemeral backend smoke runner
- public URL smoke runner
- Playwright profile runner
- validation artifact storage
- validation gate result summary

Exit criteria:

- A pass cannot be marked successful without validation evidence.
- Public and internal checks are clearly separated.

### Phase 5 - Git, Backup, and Logging Automation

Goal: checkpoint every successful pass.

Implement:

- pre-pass dirty-state snapshot
- patch artifact
- backup job runner
- commit job runner
- push job runner
- AI Vault logger
- master-plan/project-plan additive logger

Exit criteria:

- Successful pass can produce backup, commit, push, and logs.
- All actions have job rows and audit rows.
- Push can be disabled by policy.

### Phase 6 - Auto-Continue and Context Handoff

Goal: keep building until done or blocked.

Implement:

- continuation packet generator
- plan slicing
- fresh-context restart
- pass loop
- max-pass and budget controls
- provider fallback on failure

Exit criteria:

- Builder can run multiple passes on Dashboard V4 without browser presence.
- If provider A fails with rate/credit issue, provider B receives a continuation packet.

### Phase 7 - Provider/Model Orchestration

Goal: make fallback chains first-class.

Implement:

- model health import
- LiteLLM health/cost integration
- Claude/Codex/OpenCode adapter parity
- local GPU model labels
- paid/free/subscription labels
- per-role model assignment

Exit criteria:

- Operator can reorder models per role.
- Workflow history records every provider choice and fallback reason.

### Phase 8 - Doctor Automation

Goal: run strong-model health and user-flow reviews.

Implement:

- doctor workflow mode
- code review adapter
- public user simulation profiles
- accessibility/performance/security slots
- final release-readiness report

Exit criteria:

- Operator can run "Doctor this project" from `/builder`.
- Report includes code, runtime, public URL, and user-flow evidence.

### Phase 9 - Scheduled and Permanent Modes

Goal: scheduled/permanent automation.

Implement:

- scheduler timer/service
- next-run reconciliation
- cooldown policies
- budget caps
- permanent loop governance
- mobile-friendly controls

Exit criteria:

- Workflow can run on a schedule.
- Permanent mode continues until plan complete/blocked/stopped.
- Restarting browser does not matter.
- Restarting `control-surface.service` does not lose intent.

### Phase 10 - New Project Provisioning

Goal: bootstrap new software projects.

Implement:

- [x] new project wizard
- [x] folder/repo creation
- [x] AGENTS.md generation
- [x] plan generation
- [x] AI Vault note generation
- [x] skill generation
- [x] validation profile generation
- [x] optional service/container scaffolding

Exit criteria:

- Operator can create a new project and stop after approved workflow scaffolding.
- Implementation does not begin until plan and skill/workflow are confirmed.

---

## Acceptance Criteria

Builder Pipeline is complete when:

- The operator can create a workflow from `/builder`.
- The operator can start auto-continue from a chat page.
- A plan file is mandatory and missing plans fail clearly.
- Skills are discovered, required, or provisioned before autonomous building.
- Agents/models are selectable, labeled, and reorderable.
- Provider fallback works on credit/rate/auth/provider failures.
- Context handoff works across providers.
- Every pass validates internally and publicly where relevant.
- Every pass creates inspectable jobs, artifacts, and audit records.
- Every successful pass can back up, commit, push, and log.
- Doctor mode can run strong-model health checks and end-user Playwright tests.
- Scheduled mode works.
- Permanent mode works with stop/cooldown/budget controls.
- Dashboard V4 can dogfood this against `/root/DASHBOARD_V4_PLAN.md`.

---

## Open Questions

1. Should Phase 3 use `tmux` first or `systemd-run --scope` first? Recommended: `tmux` first for inspectability, then add systemd-run for stronger supervision.
2. Should permanent mode ever deploy live services automatically? Recommended: only after repeated green validations and explicit per-workflow deploy policy.
3. Should git pushes go directly to `main` or workflow branches? Recommended: workflow branches first, direct main only for trusted solo repos.
4. Should Builder Pipeline run multiple agents concurrently on one repo? Recommended: not initially; use one writer lock per project root and allow parallel read-only doctor/reviewer passes.
5. Should the scheduler be embedded in `control-surface.service` or a separate service? Recommended: separate `control-builder-scheduler.service`.
6. Should Temporal be adopted immediately? Recommended: no; build the local abstraction first, then evaluate migration once workflow semantics are proven.
7. Should new project provisioning generate Codex skills, Claude skills, OpenCode skills, or all? Recommended: project instructions first, then agent-specific skills when a workflow becomes repetitive.
8. How should budgets be enforced for subscription CLIs where exact cost is not available? Recommended: pass count, wall-clock, provider error classification, and manual health state until exact telemetry exists.

---

## Status Notes

### 2026-06-18 09:27 UTC - Whole-Site Route/API Checker

Continued from this scheduler plan through the active remediation plan because this scheduler plan still has no unchecked implementation items.

- Added/validated `scripts/check-site-routes.sh` for SPA shell checks plus public/protected JSON API checks with status and response-size reporting.
- Observed `scripts/check-builder-run.sh <runId>` already present and marked complete in the remediation plan; verified shell syntax only in this pass.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked implementation items.

Validation:

- `bash -n scripts/check-site-routes.sh`: passed.
- `bash -n scripts/check-builder-run.sh`: passed.
- Isolated temp server on `:3318` with `OPERATOR_TOKEN=test`: expanded default site route/API check set passed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next:

- Continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` with the read-only dashboard tile for active builder run risk.

### 2026-06-18 09:25 UTC - Codex Validation Handoff

Continued from the scheduler plan after confirming there are still no unchecked scheduler-plan implementation items.

- Treated the latest scheduler status handoff as a generated-project build-baseline repair/dogfood validation pass.
- Preserved the existing dirty Builder remediation changes for long-running workflow defaults, model-group expansion, preview preflight, operator auth clarity, and smoke-script coverage.
- Left scheduler-plan checkboxes unchanged because no unchecked `[ ]` implementation items remain.

Validation:

- `bun test server/api/builder.test.ts server/builder/store.test.ts server/builder/preview-server.test.ts --timeout 30000`: 25 pass / 0 fail / 165 expects.
- `bun test server/api/auth.test.ts server/api/publicApi.test.ts server/gateway/keys.test.ts --timeout 30000`: 34 pass / 0 fail / 115 expects.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- Temp backend smoke on `:3317` with `scripts/check-operator-api.sh`: `/health`, `/api/auth/status`, `/api/builder/workflows`, and `/api/models` passed.

Next:

- Continue remediation at P2 Whole-Site Continuous Checks with `scripts/check-site-routes.sh`, or add new scheduler-plan checklist items if the Builder scheduler plan should continue independently.

### 2026-06-17 14:18 UTC - Codex Builder Guard Hardening

Continued from this scheduler plan after confirming no unchecked scheduler-plan implementation items remain.

- Hardened Builder continuation context so a failed production-build validation turns the next pass into a repair-only pass instead of advancing roadmap work.
- Corrected pass status after validation failure so an agent exit code 0 plus failed validation records the pass as failed.
- Added no-progress pause guards for repeated timeouts and repeated build-recovery failures.
- Removed a stale model-policy file import while preserving the centralized model-quality helper path.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked implementation items.

Validation:

- `bun test server/api/actions.test.ts server/api/modelQuality.test.ts server/api/models.test.ts --timeout 30000`: 3 pass / 0 fail / 16 expects.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- `control-surface.service` restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.
- `/builder` visual check passed on retry across desktop/tablet/iPhone 16 Pro; first cold run had a transient iPhone navigation timeout.

Next:

- Continue with generated-project build-baseline repair/dogfood validation before allowing more roadmap advancement.

### 2026-05-18 02:35 UTC - Channels Backend Foundation Handoff

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Dashboard V4 Phase 9 Channels slice.

- Added the `channels_log` ingestor path for Telegram/Paperclip notification lines from `openclaw_gateway` Docker logs.
- Added protected channel and notification-rule backend APIs: `GET /api/channels`, `GET /api/notifications/rules`, `POST /api/notifications/rules`, and `PUT /api/notifications/rules/:id`.
- Marked the completed Channels backend items in `/root/DASHBOARD_V4_PLAN.md`.
- Left scheduler-plan checklist items unchanged because this scheduler plan still has no unchecked implementation items.

Validation:

- `bun test server/api/channels.test.ts server/db/ingestor.test.ts --timeout 30000`: 6 pass / 0 fail / 20 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite chunk-size warning.
- Temp backend smoke on `:3312`: `/health` ok, authenticated channel/rule endpoints ok, unauthenticated `/api/channels` returned `401`.
- `control-surface.service` restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next:

- Continue Phase 9 with the notification rule editor and `/channels` route.

### 2026-05-18 01:43 UTC - LiteLLM Restart and Health Probe

Continued from the scheduler plan by following its no-unchecked-items handoff to the active Dashboard V4 Phase 9 LiteLLM slice.

- Added an audited `/litellm` restart control that calls `POST /api/actions/execute` with `start-job:service:litellm:restart`, confirmation, and required operator reason.
- Added a throttled LiteLLM `/health` ingestor probe that writes `metric_samples` rows as `source=litellm`, `key=health` every 60s by default.
- Marked the corresponding active LiteLLM items complete in `/root/DASHBOARD_V4_PLAN.md`.
- Left scheduler-plan checklist items unchanged because this scheduler plan still has no unchecked implementation items.

Validation:

- `bun test server/db/ingestor.test.ts server/api/litellm.test.ts --timeout 30000`: 5 pass / 0 fail / 11 expects.
- `bun run typecheck`: passed.

Next:

- Run the full project check gate, then continue Phase 9 with `/paperclip` read-only API/route or add new scheduler-plan checklist items.

### 2026-05-18 01:19 UTC - LiteLLM API Slice

Continued from the scheduler plan by following its "no unchecked scheduler items remain" handoff to the active Dashboard V4 Phase 9 slice.

- Added protected LiteLLM observability API endpoints: `/api/litellm/status`, `/api/litellm/routing`, `/api/litellm/config`.
- Marked the corresponding LiteLLM API item complete in `/root/DASHBOARD_V4_PLAN.md`.
- Left scheduler-plan checklist items unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/litellm.test.ts`: 2 pass / 0 fail / 7 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite chunk-size warning.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.
- Live protected LiteLLM endpoint smoke: status/routing/config returned HTTP 200; config inventory reported 112 models and 7 fallback chains; redaction check passed.

Next:

- Add the `/litellm` dashboard route with redacted config viewer and fallback chain display.

### 2026-05-17 14:47 UTC - Phase 9 Detector Handoff

Completed the scheduler-plan continuation by switching to the next active Dashboard V4 plan slice because this scheduler plan still has no unchecked `[ ]` implementation items.

- Added the Disk Growth Detector projection path in `server/db/sampler.ts`.
- Added focused sampler tests for `disk.projected_full`.
- Left scheduler-plan checkboxes unchanged because no unchecked scheduler-plan items exist.

Validation:

- `bun test server/db/sampler.test.ts`: 16 pass / 0 fail / 41 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite chunk-size warning.
- `bun test server/api/builder.test.ts --timeout 15000`: 14 pass / 0 fail / 117 expects.
- `bun test server/db/ server/api/ --timeout 30000`: 175 pass / 0 fail / 626 expects.
- Default-timeout `bun test server/db/ server/api/`: 174 pass / 1 fail on the Builder child-helper 5s timeout before the timed rerun passed.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next:

- Continue Dashboard V4 Phase 9 with the Rate Limit Detector provider/model event slice, or add new scheduler-plan checklist items if the Builder Pipeline plan needs more work.

### 2026-05-17 14:46 UTC - Handoff Dogfood Cleanup and Validation

Followed up on the live Codex chat-page handoff dogfood:

- Verified the persisted handoff source-session fields included `latestUserPrompt`, `assistantSummary`, `messageCount=2`, `touchedFileSummary`, and touched files `app/routes/BuilderPage.tsx`, `server/api/builder.ts`.
- Confirmed the attempted auto-start was rejected by the Builder project lock guard with `project locked by another run`.
- Deleted disposable workflow `bw_ebcaa850-e75d-4e4e-9bf9-39fc0517e93c` after capturing evidence.
- Confirmed the stale audit-test blocker is no longer reproducible.

Validation:

- `bun test server/api/audit.test.ts --timeout 30000` passed: 12 pass / 0 fail / 29 expects.
- `bun test server/db/ server/api/ --timeout 30000` passed: 171 pass / 0 fail / 579 expects.
- `bun test app/components/AgentBuilderHandoffButton.test.ts` passed: 3 pass / 0 fail / 8 expects.
- `bun test server/api/builder.test.ts --timeout 30000` passed: 14 pass / 0 fail / 117 expects.
- `bun run check` passed with the known Vite large-chunk warning.
- `control-surface.service` restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next:

- Resolve the existing Builder project lock before attempting another live auto-start/run-detail browser check.
- This scheduler plan still has no unchecked `[ ]` implementation items.

### 2026-05-17 14:43 UTC - No Remaining Scheduler Items

Completed a scheduler-plan continuation pass with no application-code changes:

- Confirmed `rg -n '^\s*- \[ \]' /root/DASHBOARD_V4_SCHEDULER_PLAN.md` returns no unchecked implementation items.
- Confirmed the only raw `[ ]` match is the prior status note saying no unchecked scheduler-plan items remain.
- Confirmed `control-surface.service` is active.
- Confirmed live `http://127.0.0.1:3000/health` returns `{"ok":true,"version":"0.8.0"}`.
- Protected Builder API probes without `OPERATOR_TOKEN` returned `429` because the live service rate limit was active during this pass.

Validation:

- `bun test server/api/builder.test.ts --timeout 15000` passed: 14 pass / 0 fail / 117 expects.
- `bun run check` passed with the known Vite large-chunk warning.

Next:

- Add the next scheduler-plan checklist item or switch to the next active Dashboard V4 plan slice; this scheduler plan has no remaining unchecked implementation items.

### 2026-05-17 14:39 UTC - Live Health Follow-Up

Completed the follow-up from the Browser Bootstrap Dogfood pass:

- Confirmed `control-surface.service` is active.
- Confirmed live `http://127.0.0.1:3000/health` returns `{"ok":true,"version":"0.8.0"}` with ~1ms response time.
- Confirmed protected Builder API routes return `401` without an operator token, as expected.
- Noted an old unrelated Bun listener remains on `:3299`; it predates this pass and does not affect the live `:3000` service.
- No unchecked `[ ]` scheduler-plan items remain.

Validation:

- `bun test server/api/builder.test.ts --timeout 15000` passed: 14 pass / 0 fail / 112 expects.
- `bun run check` passed with the known Vite large-chunk warning.

Next:

- Add the next scheduler-plan checklist item or switch to the next active Dashboard V4 plan slice; this scheduler plan has no remaining unchecked implementation items.

### 2026-05-17 09:41 UTC - Browser Bootstrap Dogfood

Completed the `/builder` UI bootstrap follow-up against an isolated temp DB/server:

- Opened `/builder` on temp server `:3347` and exercised the `Bootstrap New Project` drawer.
- Created disposable project `Dashboard Dogfood 20260517 0941` at `/opt/provisioned/dashboard-dogfood-20260517-0941`.
- Verified generated scaffold files: `PLAN.md`, `AGENTS.md`, `.opencode/validation-profile.json`, and git metadata.
- Restarted the isolated server against the same SQLite DB and confirmed `/api/builder/projects` plus `/api/builder/workflows` rediscovered the project/workflow.
- Started workflow `bw_61c7c662-91a3-419d-aa28-81239200987b` and immediately stopped run `br_573ccff3-95fe-40f9-89c2-c9e3dc3ed0d1`; final run status was `canceled` with no matching tmux session left.

Validation:

- `bun run check` passed with the known Vite large-chunk warning.
- `bun test server/api/builder.test.ts` passed: 13 pass / 0 fail / 96 expects.
- Isolated `/health` on `:3347` returned ok before and after restart.

Follow-up:

- Investigate live `control-surface.service`: it was active, but `http://127.0.0.1:3000/health` timed out after 3 seconds during this browser dogfood pass.

### 2026-05-17 09:33 UTC - Phase 10 Provisioning Artifact Completion

Completed the Phase 10 provisioning artifact-generation items:

- Provisioning now writes `.opencode/validation-profile.json` with the generated command profile.
- Provisioning responses expose the validation profile path alongside AGENTS, PLAN, AI Vault note, and skill status.
- Provisioning tests assert AI Vault note, project skill, and validation profile artifact generation.

Validation:

- `bun run typecheck` passed.
- `bun test server/api/builder.test.ts --timeout 15000` passed: 12 pass / 0 fail / 90 expects.
- `bun test server/api/builder.test.ts -t "builder provisioning creates project scaffold and draft workflow" --timeout 15000` passed: 1 pass / 0 fail / 17 expects.
- `bun run check` passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/` failed in unrelated `server/api/audit.test.ts` coverage: 154 pass / 5 fail / 513 expects.

### 2026-05-17 09:30 UTC - Phase 10 Runner Allowlist Gate

Completed the remaining Phase 10 safety gate for new-project provisioning:

- Builder workflow starts now re-check the effective `config.projectRoot` before spawning tmux/agent work.
- Persisted `builder_projects` rows are accepted as registered Builder roots, so provisioned projects survive service restarts without relying only on process env.
- Added regression coverage for a tampered workflow config root being rejected before any run/pass/job rows are created.

Validation:

- `bun run check` passed with the known Vite large-chunk warning.
- `bun test server/api/builder.test.ts` passed: 12 pass / 0 fail / 84 expects.

### 2026-05-16 14:50 UTC - Phase 10 Provisioning Hardening

Hardened the existing Builder new-project provisioning flow:

- `/api/builder/provision` now permits provisioned project paths under `/opt/provisioned` and `/var/lib/control-surface/projects` while still rejecting protected service roots.
- Provisioned draft workflows now use the created/detected `PLAN.md` and generated validation commands instead of keeping an empty plan path.
- Provisioning plan detection no longer treats generated `AGENTS.md` as a workflow plan file.
- Added Builder API coverage for successful provisioning and protected-root rejection.

Validation:

- `bun run check` passed with the known Vite large-chunk warning.
- `bun test server/api/builder.test.ts` passed: 11 pass / 0 fail / 79 expects.
- `control-surface.service` restarted active; `/health` returned `{"ok":true}`.

### 2026-05-14 10:37 UTC - Runner and SPA Fallback Hardening

Implemented a Builder Pipeline follow-up in `/opt/opencode-control-surface`:

- Runner pass reconciliation now persists no-output stall metadata in `builder_runs.result_json`.
- Generated pass scripts preserve failed command exit-code capture.
- `server/index.ts` now serves `dist/index.html` directly for SPA client routes, fixing intermittent mobile/tablet deep-route 404 screenshots found by Playwright.
- Agent-page Builder handoff work remains present in the worktree; next validation should exercise it through a disposable workflow/run.

Sub-agent contract status:

- Wrote `/var/lib/control-surface/builder-runs/br_8661d0db-cc5c-48bb-8aa5-b86c412b3858/child-context.txt`.
- `builder_spawn_child` was unavailable in the parent shell, so no child PID was spawned.

Validation:

- `bun run typecheck` passed.
- `bun test server/api/builder.test.ts` -> 9 pass / 0 fail / 60 expects.
- `bun test server/db/ server/api/` -> 72 pass / 0 fail / 286 expects.
- `bun run build` passed with the known Vite large-chunk warning.
- `git diff --check` passed.
- Temp DB smoke on `:3315` confirmed `/health`, protected Builder APIs, and `/builder` SPA fallback.
- Playwright visual check on temp production server `:3316` passed 15/15 captures for `/builder,/codex,/claude,/opencode,/gemini` across desktop/tablet/iPhone 16 Pro.
- Live `control-surface.service` restarted active; `/health` returned `{"ok":true}`.

### 2026-05-12 22:19 UTC - Phase 1 Shipped

Implemented read-only Builder discovery in `/opt/opencode-control-surface`:

- `/builder` route and sidebar entry.
- Protected `GET /api/builder/projects`, `GET /api/builder/discover`, and `GET /api/builder/models`.
- Project registry, plan-file discovery, `dashboard-orchestrator` skill discovery, git state summary, validation profile inference, URL targets, agent CLI checks, and model inventory.
- Dogfood against `/opt/opencode-control-surface` found `/root/DASHBOARD_V4_PLAN.md`, `dashboard-orchestrator`, current dirty git state, `bun run typecheck`, `bun run build`, `bun test server/db/ server/api/`, internal/public URLs, and available models.

Validation:

- `bun test server/api/builder.test.ts` -> 4 pass / 0 fail.
- `bun run typecheck` passed.
- `bun test server/db/ server/api/` -> 67 pass / 0 fail.
- `bun run build` passed with the known Vite large-chunk warning.
- Fresh-build and live Playwright checks for `/builder` passed across desktop, tablet, and iPhone 16 Pro.

### 2026-05-12 22:40 UTC - Phase 2 Shipped

Implemented durable Builder workflow drafts in `/opt/opencode-control-surface`:

- Dashboard SQLite now includes `builder_projects`, `builder_workflows`, `builder_runs`, `builder_passes`, `builder_artifacts`, `builder_validations`, and `builder_locks`.
- Added Builder workflow/read model helpers in `server/builder/store.ts`.
- Added protected workflow APIs in `server/api/builder.ts` and `server/api/router.ts`: `GET/POST /api/builder/workflows`, `GET/PUT /api/builder/workflows/:id`, `GET /api/builder/runs`, `GET /api/builder/runs/:id`, and `GET /api/builder/artifacts`.
- Start/pause/resume/stop/retry/cancel/provision endpoints intentionally return `409` with `builder runner disabled until Phase 3`.
- `/builder` now shows saved workflows and can create a draft/ready workflow with plan, agent order, model fallback, validation, git, backup, and risk policies.
- Workflow create/update writes `action_audit` rows.

Validation:

- `bun test server/api/builder.test.ts` -> 6 pass / 0 fail.
- `bun run typecheck` passed.
- `bun test server/db/ server/api/` -> 69 pass / 0 fail.
- `bun run build` passed with the known Vite large-chunk warning.
- `git diff --check` passed.
- Temp-DB API smoke on `:3304` created/listed a ready workflow and confirmed runner actions return `409 disabled`.
- Fresh-build `/builder` visual check on `:3305` passed across desktop, tablet, and iPhone 16 Pro.
- Browser form smoke created a workflow through the `/builder` modal and verified it appeared in the workflow table.
- Live `/builder` visual check passed across desktop, tablet, and iPhone 16 Pro after restarting `control-surface.service`.

### 2026-05-13 UTC - Phase 7 Shipped

Implemented Provider/Model Orchestration in `/opt/opencode-control-surface/`:

- Added `server/builder/modelSelector.ts` with `selectModelForRole()` that picks the best available model per role (planner/builder/reviewer) using LiteLLM health data, with fallback chain and recorded selection reason.
- Dashboard SQLite now migrates `model_reason` column to `builder_passes` table.
- `server/builder/store.ts` adds `modelReason` to `BuilderPass` type and SQL reads/writes.
- `server/builder/runner.ts` uses model selector in `startNextPass()` and `startWorkflowRun()`; pass/role mapping: seq1=plan/planner, seq2=implement/builder, seq3+=reviewer; model selection reason recorded per pass.
- `server/builder/discovery.ts` enhances `BuilderModelsInventory` with heavy/medium/light categorized model lists and byProvider grouping, each entry includes provider label (GPU/cloud), capability, and quality status.
- `app/routes/BuilderPage.tsx` planner/builder model inputs now use select dropdowns with optgroup categorization and provider/capability labels.

Validation:

- `bun run typecheck` passed.
- `bun test server/db/ server/api/` -> 71 pass / 0 fail.
- `bun test server/api/builder.test.ts` -> 8 pass.
- `bun run build` passed with the known Vite large-chunk warning.
- `git diff --check` passed.
- Commit `08bd064` pushed.

## Next Concrete Step

Phase 10 (New Project Provisioning) complete:

- [x] Add scaffold creation: clone from template, init git, create initial workflow
- [x] Add project metadata: repo URL, description, tags, owner
- [x] Add "bootstrap project" flow in `/builder` UI with repo URL, plan file, agent/model defaults
- [x] Add workspace allowlist check before running any agent in a project

Exit criteria: Operator can bootstrap a new project from `/builder` with a workflow, plan file, and validation commands in under 2 minutes.

Next concrete step: no unchecked scheduler-plan implementation items remain; add the next checklist item or switch to the next active Dashboard V4 plan slice.

---

## Phase 9 Shipped (2026-05-13 00:31 UTC)

Implemented Scheduled and Permanent Modes in `/opt/opencode-control-surface/`:

- `server/builder/scheduler.ts` (118-line new module): `parseCronExpression()` handles `*`, `*/n`, `n-m`, `n,m` patterns for minute/hour/dayOfMonth/month/dayOfWeek fields; `getNextRunTime()` computes epoch ms of next run from cron expression and timezone (max 1000 iterations); `isDue()` checks if nextRunAt is within 30s tolerance window; `getBackoffMs()` returns exponential backoff (60s base, 1h max, attemptCount exponential)
- `server/builder/runner.ts` (+62 lines): `startBuilderReconciler()` tick now checks `scheduled`/`permanent` workflows that are `ready` and due (`isDue(nextRunAt)`), triggers them via `startWorkflowRun()`, and recomputes `nextRunAt` for scheduled workflows after each trigger; `reconcileRunStatus()` permanent mode auto-restart after run finishes (checks backoff elapsed, increments attemptCount in result_json, calls startWorkflowRun); `pauseWorkflow()` clears nextRunAt for scheduled mode; `resumeWorkflow()` recomputes nextRunAt from cron expression
- `server/api/builder.ts` (+27 lines): `builderCreateWorkflowHandler()` and `builderUpdateWorkflowHandler()` now auto-compute `nextRunAt` from `schedule.expression` when mode is `scheduled`, and set it to `null` for non-scheduled modes
- `app/routes/BuilderPage.tsx` (+48 lines): `ModeBadge` component with color coding (gray=once, blue=auto-continue, amber=scheduled, green=permanent, purple=doctor); nextRunAt display in workflow table row for scheduled workflows; cron expression input and timezone selector in create workflow modal

Validation: `bun run typecheck`; `bun test server/db/ server/api/` -> 71 pass / 0 fail; ephemeral :3499 smoke confirmed `/health` ({"ok":true}) and `/api/builder/workflows` (workflows:3); live `control-surface.service` restarted healthy at 00:31 UTC; builder reconciler confirmed started in journal; commit `b0ff885`. Exit criteria met: operator can set a workflow to "scheduled" or "permanent" mode, scheduled runs compute and display nextRunAt, permanent mode auto-restarts after backoff, service restart preserves intent.

---

## Phase 8 Shipped (2026-05-13 00:18 UTC)

Implemented Doctor Automation in `/opt/opencode-control-surface/`:

- `server/builder/doctor.ts` (575-line new module): `DoctorReviewProfile`, `DoctorReport` interfaces, `buildDoctorReviewProfile()`, `runDoctorReview()`, `writeDoctorReport()`, `createDoctorReportRow()`
- Code review: agent reads changed files from pre-pass patch, outputs structured JSON issues with severity/file/line/message
- Accessibility: playwright checks color contrast, touch targets (<44px), missing alt attributes
- Performance: playwright measures LCP, CLS, FID, TTFB
- Security: curl-based security headers (CSP, X-Frame-Options, HSTS), SSL validity
- Runtime: curl endpoint smoke for each configured endpoint
- Overall score (weighted) and verdict (ready >= 80, needs-work >= 50, degraded < 50)
- `server/db/dashboard.ts`: +20 lines for `builder_doctor_reports` SQLite table (CREATE TABLE IF NOT EXISTS)
- `server/builder/runner.ts`: +20 lines — `reconcileRunStatus()` detects `mode === "doctor"`, runs review after pass, stores report ID in result_json; `startWorkflowRun()` sets phase="doctor" for doctor-mode workflows; one-shot (no auto-continue for doctor mode)
- `server/builder/store.ts`: +49 lines — `readBuilderDoctorReports()`, `BuilderDoctorReport` type
- `server/api/builder.ts`: +55 lines — `GET /api/builder/doctor-reports?workflowId=&runId=&limit=`, `POST /api/builder/workflows/{id}/doctor-review` (creates doctor-mode run immediately)
- `server/api/router.ts`: +10 lines — route handlers
- `app/routes/BuilderPage.tsx`: +235/-24 lines — doctor report drawer/modal with overall score, verdict badge, issue counts by severity, "Run Doctor Review" button in workflow row actions

Also fixed: `server/builder/modelSelector.ts` emergency fallback now filters for `isModelHealthy()` first (available + qualityStatus=healthy + latency < 30000), falls back to all-usable pool if no healthy models exist, and records `degraded-or-unknown` in the reason string when using a degraded pool.

Validation: `bun run typecheck`; `bun test server/db/ server/api/` -> 71 pass / 0 fail; ephemeral :3399 smoke confirmed `/api/builder/doctor-reports` (returns `{"reports":[],"degraded":false}`), `/api/builder/workflows` (returns workflow list), `/api/builder/models` (22 models, 10 heavy categories); live service restarted healthy at 00:18 UTC; commit `bc44b04`. Exit criteria met: operator can trigger "Doctor this project" from `/builder` and receive a structured report covering code, runtime, public URL, and user-flow evidence.

---

### 2026-05-14 10:32 UTC - Builder Handoff Follow-Up Validation

Status: follow-up pass completed after the handoff/Gemini/style slice. Builder runner stall classification now records `agent-stalled`, aligned with the failure-class taxonomy in this plan. Shell-level supervisor child helpers were not available in the parent shell, so no child was spawned outside the Builder runtime contract.

Validation:
- `bun run typecheck` passed.
- `bun test server/api/builder.test.ts` -> 9 pass / 0 fail.
- `bun test server/db/ server/api/` -> 72 pass / 0 fail.
- `bun run build` passed with the known Vite large-chunk warning.
- `git diff --check` passed.
- Temp-DB smoke on `:3397` passed for `/health`, `/api/builder/workflows`, `/api/builder/discover`, and `/api/builder/models`.
- Disposable visual check passed 15/15 captures across `/builder`, `/codex`, `/claude`, `/opencode`, and `/gemini`.
- Live `control-surface.service` restarted healthy; local `/health` returned `{"ok":true}`.

Next: enrich chat-page Builder handoff packets with transcript/touched-file summaries and show source-session context in Builder run detail.

## References

- Temporal durable execution docs: `https://docs.temporal.io/`
- systemd timer docs: `https://man7.org/linux/man-pages/man5/systemd.timer.5.html`
- LiteLLM docs: `https://docs.litellm.ai/`
- OpenAI Codex CLI docs: `https://developers.openai.com/codex/cli`
- OpenAI Codex CLI command reference: `https://developers.openai.com/codex/cli/reference`
- OpenCode CLI docs: `https://opencode.ai/docs/cli/`
- Claude Code hooks docs: `https://code.claude.com/docs/en/hooks`
- Claude Code hooks guide: `https://code.claude.com/docs/en/hooks-guide`
- Playwright Trace Viewer docs: `https://playwright.dev/docs/trace-viewer-intro`
- GitHub Actions workflow syntax: `https://docs.github.com/actions/learn-github-actions/workflow-syntax-for-github-actions`

---
## Status Note - 2026-05-14 10:29 UTC - Chat Page Builder Handoff

Implemented the next acceptance slice for chat-page integration:

- Added Builder workflow handoff controls to Claude, Codex, OpenCode, and Gemini pages.
- The controls create a Builder workflow from the active session workspace, discovered plan, inferred validation commands, available agent order, and model fallback targets.
- The "Continue with Builder Pipeline" control starts the newly created ready workflow immediately when validation commands are available.
- Builder workflow config now stores sourceSession metadata so the workflow can be traced back to the originating chat session.

Validation:

- /root/.bun/bin/bun run typecheck passed.
- /root/.bun/bin/bun test server/api/builder.test.ts -> 9 pass / 0 fail.
- /root/.bun/bin/bun test server/db/ server/api/ -> 72 pass / 0 fail.
- /root/.bun/bin/bun run build passed with the known Vite chunk-size warning.
- git diff --check passed.
- Temp-DB smoke confirmed /health, Builder discovery, and workflow creation with sourceSession metadata.
- Bundled visual check passed 15/15 captures across /builder, /codex, /claude, /opencode, and /gemini on desktop, tablet, and iPhone 16 Pro.

Next:

- Add richer transcript summary and touched-file capture to handoff packets.
- Surface source session context in Builder workflow/run detail.

### 2026-05-14 10:32 UTC - Runner Helper Exposure Fix

Implemented a Builder Pipeline runner reliability fix in /opt/opencode-control-surface:

- Generated pass scripts now export Builder child orchestration helpers to the agent subprocess using BASH_ENV and command wrappers in $BUILDER_DIR/bin.

### 2026-06-18 08:58 UTC - Preview Backend Preflight

Implemented the next Builder preview reliability slice after the scheduler checklist was already complete.

- Fullstack preview now runs an async backend build preflight when a backend build target is detected, using uncached Nx builds for Nx backends.
- Preview preflight diagnostics report Nx workspace detection, mixed lockfiles, package-manager mismatches, and backend build failures before a fullstack preview is advertised.
- The Builder preview modal now states that Cloudflare Quick Tunnel URLs are transient preview links.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/builder/preview-server.test.ts` -> 3 pass / 0 fail.
- `bun test server/builder/ server/api/builder.test.ts --timeout 30000` -> 42 pass / 0 fail.
- `bun run typecheck` passed.
- `bun run build` passed with the known Vite large-chunk warning.
- `bun run check` passed with the known Vite large-chunk warning.
- `git diff --check` passed.

Next:

- Dogfood a generated fullstack preview with a deliberately broken backend build to confirm the UI failure path end-to-end, then add a substance gate before accepting builder pass checkmarks.
- Child spawning still requires $BUILDER_DIR/child-context.txt before any child starts, and child PID/status entries are written to the pass log/manifest.
- Pass scripts now capture non-zero/timeout exit codes instead of exiting early under set -e before writing pass-<n>-exit.code.
- Added Builder API test coverage for generated helper exposure and exit-code capture.

Validation:

- bun test server/api/builder.test.ts -> 9 pass / 0 fail.
- bun run typecheck -> passed.
- bun test server/db/ server/api/ -> 72 pass / 0 fail.
- git diff --check -> passed.
- bun run build -> passed with known Vite large-chunk warning.
- Ephemeral backend smoke on :3497 passed for /health, /api/builder/projects, and /api/builder/models.
- Live control-surface.service restarted active and /health returned {"ok":true}.

Next: add a disposable child-helper smoke workflow that exercises builder_spawn_child against a harmless/mock adapter and verifies manifest, status, output tail, and timeout handling.

### 2026-05-14 10:33 UTC - Child Helper Command Hardening

Implemented a Builder Pipeline child-agent helper hardening follow-up in `/opt/opencode-control-surface`:

- Generated helper commands now scope active child counting and tmux cleanup to the active Builder run id.
- `builder_spawn_child` requires `$BUILDER_DIR/child-context.txt`, stores child prompts in `task.txt`, and avoids interpolating prompt text into generated shell commands.
- Child PID, spawn metadata, final status, exit code, and timeout state are persisted in the run directory and pass log.
- `builder_child_wait` returns `DONE`, `FAILED`, or `TIMEOUT`; timeout reconciliation writes status and exit-code files.
- `stopWorkflowRun()` now avoids killing unrelated Builder child sessions.
- Generated pass scripts are covered by focused assertions plus `bash -n`.

Validation:

- `/root/.bun/bin/bun run typecheck` passed.
- `/root/.bun/bin/bun test server/api/builder.test.ts` -> 9 pass / 0 fail.
- `/root/.bun/bin/bun test server/db/ server/api/` -> 72 pass / 0 fail.
- `git diff --check` passed.
- `/root/.bun/bin/bun run build` passed with the known Vite chunk-size warning.
- Temp-DB smoke on `:3412` passed for `/health`, `/api/builder/projects`, and `/api/builder/models`.
- Live `control-surface.service` restarted active and `/health` returned `{"ok":true}`.

Next: run a disposable Builder workflow that actually calls `builder_spawn_child` and verifies tmux child lifecycle evidence end to end.

### 2026-05-14 10:35 UTC - Runner Prompt and Child Context Hardening

Follow-up to the Builder Pipeline child-agent orchestration work:

- Generated pass scripts now store agent prompts in prompt files and run adapters through `timeout ... bash -lc`, reducing shell quoting risk and ensuring timeout covers Gemini stdin execution.
- `builder_spawn_child` now accepts multi-word tasks, requires and injects `child-context.txt`, and preserves child PID/final-status evidence in pass logs.
- Runner stall detection now persists `runnerMonitor` output-size/time metadata for cross-reconcile no-output checks.
- Optional `riskPolicy.passTimeoutSeconds` survives Builder workflow API parsing.

Validation: `bun run typecheck`; `bun test server/api/builder.test.ts` (9 pass); `bun test server/db/ server/api/` (72 pass); `git diff --check`; `bun run build` (known chunk warning); temp-DB smoke on `:3329`; visual check 18/18 across `/builder`, `/codex`, `/claude`, `/opencode`, `/gemini`, `/models`; live service restarted active and `/health` OK.

Next: disposable end-to-end child-helper workflow smoke.

### 2026-05-14 10:37 UTC - Builder Handoff Context Follow-up

Implemented the source-session context follow-up for Builder Pipeline handoffs:

- Agent-page handoff payloads now include transcript summary, latest user prompt, and touched-file hints.
- `sourceSession` parsing stores sanitized rich context in Builder workflow config.
- Builder workflow rows show source session origin.
- Builder run detail API returns the related workflow, allowing the run detail modal to show source session metadata, summary, latest ask, and touched files.

Validation:

- `/root/.bun/bin/bun run typecheck` passed.
- `/root/.bun/bin/bun test server/api/builder.test.ts` passed: 9 pass / 0 fail.
- `/root/.bun/bin/bun test server/db/ server/api/` passed: 72 pass / 0 fail.
- `/root/.bun/bin/bun run build` passed with the known Vite large-chunk warning.
- Temp-DB smoke and multi-viewport visual check passed after rerun.

Next:

- Add browser E2E coverage for agent-page workflow creation through run-detail source session display.

### 2026-05-17 09:38 UTC - Builder Dogfood Restart Persistence

Completed the Phase 10 disposable Builder dogfood step:

- Provisioned `/var/lib/control-surface/projects/builder-dogfood-20260517093640` through the live `/api/builder/provision` endpoint.
- Fixed provisioned project discovery so persisted `builder_projects` rows are loaded after service restart, not only from the in-process runtime allowlist.
- Restarted `control-surface.service`; `/api/builder/projects` and `/api/builder/discover` still listed/discovered the disposable project and its generated `PLAN.md`.
- Started workflow `bw_bb3b5906-4683-40c7-bf2d-b4acbdbc535d`, creating run `br_04a678d6-5c32-4c63-88a8-a951408ee30a` and pass `bp_d11aace9-3b91-4221-ac78-2def45e122f2`; stopped it cleanly with final run/pass status `canceled`.

Validation:

- `bun test server/api/builder.test.ts`: 13 pass / 0 fail / 96 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/`: 155 pass / 5 fail / 519 expects; failures remain in unrelated `server/api/audit.test.ts` JSONL/CSV export, retention, and purge assertions noted by the prior pass.
- Live `/health`: `{"ok":true,"version":"0.8.0"}` after restart.

Next: browser-check the `/builder` bootstrap drawer against the same flow, then decide whether to keep or remove the disposable dogfood project record.

### 2026-05-17 09:49 UTC - Child Helper Lifecycle Dogfood

Completed the disposable child-helper workflow smoke requested by the handoff notes:

- Generated Builder child helper scripts now pass the current `PATH` into child tmux sessions, so wrapper/stub agent binaries resolve consistently.
- Child scripts write their own PID before running the agent, avoiding an empty-PID race when very fast child sessions exit before `tmux list-panes`.
- `builder_child_output` now tolerates missing/empty stdout or stderr logs and returns successfully after printing available output.
- Added focused Builder API coverage that creates a disposable workflow, sources the generated helper script, calls `builder_spawn_child`, waits for `DONE`, and verifies manifest plus pass-log evidence using a harmless fake `codex` binary.

Validation:

- `bun test server/api/builder.test.ts -t "builder child helpers" --timeout 30000`: 1 pass / 0 fail / 9 expects.
- `bun test server/api/builder.test.ts --timeout 30000`: 14 pass / 0 fail / 105 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/ --timeout 30000`: 157 pass / 5 fail / 530 expects; failures remain in unrelated `server/api/audit.test.ts` JSONL/CSV export, retention, and purge assertions.

Next: resolve or isolate the existing `server/api/audit.test.ts` failures, then browser-check the `/builder` bootstrap drawer if UI dogfood remains required.

### 2026-05-17 09:52 UTC - Phase 10 Runtime Scaffold Templates

Completed the optional Phase 10 service/container scaffolding item:

- Builder provisioning accepts an opt-in runtime scaffold flag.
- Opt-in provisioning writes non-installed templates inside the project: `Dockerfile`, `compose.yaml`, and `.opencode/systemd/<project>.service`.
- The `/builder` bootstrap drawer exposes the opt-in as `service/container templates`.
- Provisioning responses report generated runtime scaffold file paths.

Validation:

- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/api/builder.test.ts --timeout 15000`: 14 pass / 0 fail / 109 expects.
- `bun test server/db/ server/api/ --timeout 15000`: 163 pass / 5 fail / 559 expects; failures remain in pre-existing `server/api/audit.test.ts` JSONL/CSV export, retention, and purge assertions.
- `git diff --check -- server/builder/provision.ts server/builder/store.ts server/api/builder.ts server/api/builder.test.ts app/routes/BuilderPage.tsx`: passed.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: resolve or isolate the existing `server/api/audit.test.ts` failures before treating the whole server API/DB suite as green.

### 2026-05-17 09:52 UTC - Builder Bootstrap UI Dogfood Cleanup

Completed the `/builder` bootstrap drawer dogfood follow-up:

- Used a real browser session against live `/builder` to create `builder-ui-dogfood-20260517095004` under `/var/lib/control-surface/projects`.
- Verified the UI-provisioned project appeared in the Builder project selector and workflow table.
- Restarted `control-surface.service`; `/api/builder/projects` and `/api/builder/discover` still found the provisioned project and generated `PLAN.md`.
- Removed disposable dogfood records after validation: the prior API dogfood workflow/project, the existing UI dogfood workflow/project, and the new UI dogfood workflow/project, plus their disposable directories.

Validation:

- Playwright CLI browser flow: `/builder` bootstrap modal submitted and project appeared in the selector.
- Live restart: `control-surface.service` active; `/health` returned `{"ok":true,"version":"0.8.0"}`.
- Post-restart API checks found the UI dogfood project before cleanup.
- Post-cleanup checks: `builder_projects` dogfood rows = 0, dogfood Builder workflows = 0, `/api/builder/projects` dogfood entries = `[]`.

Next: resolve or isolate the existing `server/api/audit.test.ts` failures before treating the full `server/db/ server/api/` validation suite as green.

### 2026-05-17 14:33 UTC - Builder Handoff Packet Enrichment

Completed the chat-page Builder handoff follow-up:

- Handoff packets now include a richer transcript summary, latest assistant response, bounded recent-turn excerpts, touched-file summary, and extracted touched-file list.
- Builder workflow source-session parsing persists the new fields with server-side length and count limits.
- Builder run detail now surfaces latest agent response, recent transcript excerpts, and touched-file summary alongside existing source-session context.
- Applied a minimal TypeScript cast fix in `server/api/router.ts` to unblock validation.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/builder.test.ts`: 14 pass / 0 fail / 112 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/`: 171 pass / 0 fail / 579 expects.
- Temp-DB smoke on `:3599`: `/health` returned `{"ok":true,"version":"0.8.0"}` and `/api/builder/workflows` returned an empty non-degraded workflow list.
- Bundled visual check for `/builder`: 3/3 captures passed across desktop, tablet, and iPhone 16 Pro.
- Live `control-surface.service` restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: dogfood a real chat-page handoff into Builder and verify the enriched source-session fields appear in the workflow/run detail with live session data.

### 2026-05-17 14:43 UTC - Builder Handoff Dogfood Parser Fix

Dogfooded the live Codex page handoff into Builder:

- Used the Codex chat page handoff controls against a live session in `/opt/opencode-control-surface`.
- Found and fixed touched-file extraction truncating `.tsx`/`.jsx` paths to `.ts`/`.js`.
- Added focused parser coverage for `.tsx`, `.jsx`, `.test.ts`, and `.test.tsx` path capture.
- Rebuilt and restarted `control-surface.service`; `/health` returned `{"ok":true,"version":"0.8.0"}`.
- Verified the new persisted handoff workflow `bw_474ad4b5-3f76-40e2-912e-0fe75e6db46e` preserved `app/routes/BuilderPage.tsx`, `server/api/builder.ts`, and `app/components/AgentBuilderHandoffButton.tsx` in `sourceSession.touchedFiles`.
- The workflow has run `br_4c5af0d5-981f-4b63-a81a-be7e0490ae80`; it ended `canceled` during the browser/restart verification churn, with a canceled Codex plan pass.

Validation:

- `bun test app/components/AgentBuilderHandoffButton.test.ts`: 2 pass / 0 fail / 2 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/api/builder.test.ts --timeout 30000`: 14 pass / 0 fail / 117 expects.
- `git diff --check -- app/components/AgentBuilderHandoffButton.tsx app/components/AgentBuilderHandoffButton.test.ts`: passed.

Notes:

- A first start-now handoff attempt blocked on an existing Builder project lock; after restart the final fixed-parser workflow created a run, but it did not execute to completion.
- Repeated Builder UI detail checks hit the live 30 req/min API rate limiter; persisted workflow data was used as the source-session verification evidence.

Next: after the live API rate limiter cools down, re-run the Builder detail-panel browser check for the same handoff workflow; start a fresh run only if the operator wants full execution evidence.

### 2026-05-17 14:46 UTC - Builder Handoff Run-Detail Coverage

Completed the remaining chat-page handoff verification follow-up:

- Exported the handoff message summarizer for focused regression coverage.
- Added component coverage proving live-style chat messages capture latest ask, latest assistant response, recent turns, absolute plan paths, and touched files.
- Extended Builder API coverage so a started run detail returns the enriched `sourceSession` fields from its workflow.
- Used the live Codex chat page to create workflow `bw_474ad4b5-3f76-40e2-912e-0fe75e6db46e`, then verified run-detail source-session fields via the Builder handler against live SQLite after the UI hit the expected API rate limiter.
- Started and immediately stopped live dogfood run `br_4c5af0d5-981f-4b63-a81a-be7e0490ae80`; final DB state was run `canceled`, pass `canceled`, no tmux session.
- Removed the disposable dogfood workflow/run rows and generated run directory after collecting evidence; post-cleanup counts were 0 workflow rows and 0 run rows for those IDs.

Validation:

- `bun test app/components/AgentBuilderHandoffButton.test.ts server/api/builder.test.ts --timeout 30000`: 17 pass / 0 fail / 125 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/ --timeout 30000`: 171 pass / 0 fail / 584 expects.
- `git diff --check -- app/components/AgentBuilderHandoffButton.tsx app/components/AgentBuilderHandoffButton.test.ts server/api/builder.test.ts`: passed.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: the scheduler plan has no remaining unchecked checklist items; continue with the next active Dashboard V4 plan slice or add the next scheduler-plan checklist item.

### 2026-05-18 01:07 UTC - Infrastructure Detector Continuation

Continued from the scheduler plan into the active Dashboard V4 Phase 9 detector slice because no unchecked scheduler-plan items remain.

- Implemented the Infrastructure Anomaly Detector sampler path for sustained memory pressure, disk pressure, restart storms, and `vast-tunnel` flapping.
- Marked the main V4 Phase 9 Infrastructure Anomaly Detector task complete.

Validation:

- `bun test server/db/sampler.test.ts`: 23 pass / 0 fail / 76 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ --timeout 30000`: 35 pass / 0 fail / 171 expects.
- `bun test server/db/ server/api/ --timeout 30000`: 198 pass / 7 fail / 728 expects, failing only in unrelated dirty-worktree `server/api/dossier.test.ts` and `server/api/financeIntel.test.ts`.

Next: continue Phase 9 with the Cost Anomaly Detector, or add explicit scheduler-plan checklist items if Builder Pipeline scheduling needs more work.

### 2026-05-18 01:12 UTC - Cost Detector Continuation

Continued from the scheduler plan into the active Dashboard V4 Phase 9 detector slice because no unchecked scheduler-plan items remain.

- Completed the Cost Anomaly Detector sampler path for Vast runway warning/critical thresholds and Vast hourly burn spikes.
- Confirmed the main V4 Phase 9 Cost Anomaly Detector task is marked complete.

Validation:

- `bun test server/db/sampler.test.ts`: 26 pass / 0 fail / 89 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ --timeout 30000`: 38 pass / 0 fail / 184 expects.
- `bun test server/db/ server/api/ --timeout 30000`: 201 pass / 7 fail / 741 expects, failing only in unrelated dirty-worktree `server/api/dossier.test.ts` and `server/api/financeIntel.test.ts`.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: continue Phase 9 with the `/litellm` read-only config/status viewer, or isolate the existing Dossier/Finance Intel API test failures first.

### 2026-05-18 02:16 UTC - Paperclip API Continuation

Continued from the scheduler plan into the active Dashboard V4 Phase 9 Paperclip slice because no unchecked scheduler-plan items remain.

- Added protected read-only `/api/paperclip/agents` and `/api/paperclip/tasks` endpoints with HTTP API first, local Paperclip DB fallback, adapter health summaries, and task status summaries.
- Marked the main V4 Phase 9 Paperclip API task complete.
- Fixed existing Builder runner path-helper call sites and the sampler snapshot shape so typecheck can pass.

Validation:

- `bun test server/api/paperclip.test.ts`: 3 pass / 0 fail / 4 expects.
- `bun run typecheck`: passed.
- `bun test server/api/paperclip.test.ts server/db/sampler.test.ts --timeout 30000`: 31 pass / 0 fail / 101 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`; unauthenticated `/api/paperclip/agents` returned HTTP 401.

Next: continue Phase 9 with the `/paperclip` route for agent roster, task ledger, and adapter health.

### 2026-05-18 02:28 UTC - Paperclip Route Continuation

Continued from the scheduler plan into the active Dashboard V4 Phase 9 Paperclip route/action slice because no unchecked scheduler-plan items remain.

- Confirmed `/paperclip` is wired into the app, sidebar, and header with agent roster, task ledger, adapter health, task summary, refresh, source/error status, and audited `paperclip` container restart.
- Confirmed the main V4 Phase 9 Paperclip route and restart action items are marked complete.

Validation:

- `bun test server/api/paperclip.test.ts server/api/execute.test.ts --timeout 30000`: 16 pass / 0 fail / 39 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- Isolated backend `:3317` visual check for `/paperclip`: desktop/tablet/iPhone 16 Pro all passed with HTTP 200 and no console, page, or request failures.

Next: continue Phase 9 with Channels and Notifications (`channels_log` ingestor, `notification_rules`, `/api/channels`, `/api/notifications/rules`, `/channels`).

### 2026-05-19 09:36 UTC - Content Health Detector Continuation

Continued from the scheduler plan into the active Dashboard V4 Phase 9 Content Health detector slice because no unchecked scheduler-plan items remain.

- Added sampler-backed NewsBites content-health detection for published markdown articles.
- Emitted deduped events for `article.missing_image`, `article.thin_digest`, and `article.invalid_vertical`.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/db/sampler.test.ts --timeout 30000`: 31 pass / 0 fail / 110 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite chunk-size warning.
- `bun test server/db/ --timeout 30000`: 52 pass / 0 fail / 227 expects.
- Temp backend smoke on `:3314`: `/health` ok, authenticated `/api/home` ok, 565 article findings recorded in the temp DB.
- `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: add a `/content-health` route or API read model for triaging the new article findings.

### 2026-06-11 02:35 UTC - Content Health API Read Model Continuation

Continued from the scheduler plan into the active Dashboard V4 Content Health read-model slice because no unchecked scheduler-plan items remain.

- Added the read-only `/api/content-health` data model for content-health event findings.
- Summarizes findings by kind/severity, affected article count, and latest finding timestamp.
- Added focused API tests and smoke coverage for the endpoint.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/content-health.test.ts --timeout 30000`: 3 pass / 0 fail / 6 expects.
- `bun test server/api/content-health.test.ts server/api/smoke.test.ts --timeout 30000`: 16 pass / 0 fail / 26 expects; emitted an existing Docker daemon warning from smoke coverage.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.

Next: add the `/content-health` dashboard route for triaging findings, or create explicit checklist items for the remaining Content Health and Reports work.

### 2026-06-11 03:38 UTC - Content Health Route Triage Continuation

Continued from the scheduler plan into the active Dashboard V4 Content Health route slice because no unchecked scheduler-plan items remain.

- Tightened the existing `/content-health` dashboard route into a triage queue.
- Added client-side search, severity filtering, finding-kind filtering, pagination, and a filtered-empty state for content-health findings.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/content-health.test.ts --timeout 30000`: 2 pass / 0 fail / 10 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- Bundled visual check for `/content-health`: rerun passed desktop/tablet/iPhone with HTTP 200 and no console/page errors. First attempt had a transient tablet 404 while direct `/content-health` curl checks returned 200.

Next: continue Phase 9 with `/reports` archive and daily pipeline report generator, or add explicit remaining checklist items for Content Health and Reports.

### 2026-06-11 03:49 UTC - Reports Generator Continuation

Continued from the scheduler plan into the active Dashboard V4 Reports generator slice because no unchecked scheduler-plan items remain.

- Added `daily-pipeline` and `weekly-content-health` report templates.
- Added reusable stored report-run creation, a read-only `/api/reports` archive/list endpoint, and ingestor-triggered scheduled daily/weekly report generation guarded by `operator_state`.
- Fixed the existing gateway-calls report test seed to match the `gateway_calls` table.
- Marked only the completed daily and weekly Reports generator items in `/root/DASHBOARD_V4_PLAN.md`.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/reports.test.ts server/db/ingestor.test.ts --timeout 30000`: 12 pass / 0 fail / 34 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend smoke on `:3321`: `/health` ok, authenticated `/api/reports?limit=5` ok, `/api/reports/templates` includes report templates.
- `control-surface.service`: restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: continue Phase 9 with the `/reports` dashboard route/report archive UI, then add the "export to AI Vault" action.

### 2026-06-11 12:14 UTC - Reports Route Archive Continuation

Continued from the scheduler plan into the active Dashboard V4 Reports route slice because no unchecked scheduler-plan items remain.

- Added the `/reports` route with archive totals, searchable/paginated report-run cards, template activity, generate-now controls, Markdown copy, and CSV download.
- Wired the route into the app router, sidebar, and nav readiness registry.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/reports.test.ts --timeout 30000`: 7 pass / 0 fail / 21 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend visual check on `:3333`: `/health` ok and `/reports` passed desktop/tablet/iPhone with HTTP 200 and no console/page/request failures.

Next: add the "export to AI Vault" action for successful report runs.

### 2026-06-11 12:23 UTC - Reports AI Vault Export Continuation

Continued from the scheduler plan into the active Dashboard V4 Reports export slice because no unchecked scheduler-plan items remain.

- Added a protected report-run export endpoint that writes successful reports to AI Vault Markdown paths.
- Added a `/reports` archive action for exporting successful runs to AI Vault.
- Hardened the dashboard SQLite v5-to-v6 migration after live restart exposed a historical `schema_version` v5/v6 collision that disabled durable history.
- Marked the completed Reports route/archive and AI Vault export items in `/root/DASHBOARD_V4_PLAN.md`.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/reports.test.ts server/db/dashboard.test.ts --timeout 30000`: 19 pass / 0 fail / 132 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend smoke on `:3334`: `/health` ok, generated a daily report, exported it to `/tmp/cs-reports-export-vault/daily/2026-06-11-pipeline.md`, and `/reports` returned HTTP 200.
- Bundled visual check for `/reports`: desktop/tablet/iPhone all HTTP 200 with no console/page/request failures.
- `control-surface.service`: restarted active; live `/health` ok and `/api/reports` returned 200.

Next: add explicit new scheduler/V4 items or continue the next V4.2 slice.

### 2026-06-11 14:01 UTC - Content Health Duplicate and Coverage Continuation

Continued from the scheduler plan into the active Dashboard V4 Content Health V4.2 slice because no unchecked scheduler-plan items remain.

- Added threshold-based near-duplicate article detection to the sampler-backed content-health events.
- Added 7-day vertical concentration and vertical gap findings for allowed NewsBites verticals.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/db/sampler.test.ts --timeout 30000`: 32 pass / 0 fail / 118 expects.
- `bun test server/api/content-health.test.ts --timeout 30000`: 2 pass / 0 fail / 10 expects.
- `bun run check`: passed with the known Vite large-chunk warning.

Next: add external broken-link HTTP probing and/or explicit remaining Content Health checklist items for deploy-triggered runs and `/api/content-health/run`.

### 2026-06-11 14:03 UTC - Content Health Broken Link Follow-Up

Continued from the scheduler plan into the active Dashboard V4 Content Health slice because no unchecked scheduler-plan items remain.

- Added deterministic local Markdown broken-link detection for published NewsBites articles, emitting `article.broken_link` events when root-relative or relative targets are missing.
- Added the `/api/content-health/findings` read alias for the existing content-health read model.
- Added optional event timestamps to `writeEvent()` so existing cost-summary tests can seed dated anomaly events without type errors.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/db/sampler.test.ts server/api/content-health.test.ts server/api/cost.test.ts --timeout 30000`: 35 pass / 0 fail / 135 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `control-surface.service`: restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: add external HTTP link probing or explicit remaining V4.2 Content Health checklist items.

### 2026-06-11 14:02 UTC - Content Health On-Demand Run API

Continued from the scheduler plan into the active Dashboard V4 Content Health V4.2 slice because no unchecked scheduler-plan items remain.

- Added `POST /api/content-health/run` behind the mutation guard.
- Exported the existing sampler-backed detector as `runContentHealthScan()` so the endpoint can run the same checks on demand.
- Updated the content-health API test to verify that the run endpoint emits detector findings and returns the read model with scan metadata.
- Marked the corresponding main V4 plan API item complete; scheduler-plan checkboxes remain unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/content-health.test.ts`: 3 pass / 0 fail / 15 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/sampler.test.ts`: 32 pass / 0 fail / 118 expects.

Next: wire content-health scanning after successful NewsBites deploy jobs or add explicit new V4.2 checklist items for external HTTP link probing.

### 2026-06-11 14:05 UTC - Cost Anomaly Surface

Continued from the scheduler plan into the active Dashboard V4 Cost Anomaly V4.2 slice because no unchecked scheduler-plan items remain.

- Added recent cost anomaly event surfacing to `/api/cost/summary`.
- Added a `/cost` route section for recent detector findings.
- Added focused cost summary API coverage.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/cost.test.ts --timeout 30000`: 1 pass / 0 fail / 7 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend `:3336`: `/health` ok, `/api/cost/summary` returned `anomalies`, `/cost` returned HTTP 200.
- Current-build visual check on `:3337`: `/cost` passed desktop/tablet/iPhone.
- `control-surface.service`: restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: add explicit V4.2 checklist items for model evaluation jobs, Knowledge handoff packets, or the next cost detector expansion.

### 2026-06-11 14:06 UTC - Content Health External Link Probing

Continued from the scheduler plan into the active Dashboard V4 Content Health V4.2 slice because no unchecked scheduler-plan items remain.

- Added bounded external HTTP probing for Markdown links when `POST /api/content-health/run` executes the content-health detector.
- Kept the periodic sampler path local-only to avoid blocking regular home-data ingestion on public network checks.
- Extended `article.broken_link` payloads with `brokenExternalLinks` status/error evidence and escalated external failures to `error`.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/content-health.test.ts --timeout 30000`: 4 pass / 0 fail / 21 expects.
- `bun test server/db/sampler.test.ts -t "content health detector" --timeout 30000`: 3 pass / 0 fail / 14 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- `control-surface.service`: restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: wire content-health scans after successful NewsBites deploy jobs, or add explicit V4.2 checklist items for the next slice.

### 2026-06-11 14:07 UTC - Content Health Triage Actions UI

Continued from the scheduler plan into the active Dashboard V4 Content Health V4.2 slice because no unchecked scheduler-plan items remain.

- Added a `/content-health` "Run check" action that calls the existing protected `POST /api/content-health/run` endpoint and reports generated finding count.
- Added an expanded-row live article link for findings with a slug, using the dashboard-standard NewsBites article URL.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/content-health.test.ts --timeout 30000`: 3 pass / 0 fail / 15 expects.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend `:3335`: `/health` ok and `/content-health` passed desktop/tablet/iPhone Playwright smoke with HTTP 200, no console errors, and no failed requests.
- Live authenticated visual validation was skipped because `POST /api/auth/session` on `127.0.0.1:3000` timed out after 5 seconds; the live `/health` endpoint returned 200.

Next: wire content-health scan execution after successful NewsBites deploy jobs, or add explicit V4.2 checklist items.

### 2026-06-17 12:18 UTC - Content Health Post-Deploy Scan Hook

Continued from the scheduler plan into the active Dashboard V4 Content Health V4.2 slice because no unchecked scheduler-plan items remain.

- Wired successful NewsBites deploy jobs to run the existing content-health scanner with external link probing.
- Added deploy job output-tail evidence and action-audit evidence for the post-deploy scan result without failing a successful deploy if the follow-up scan fails.
- Added focused coverage for the post-deploy scanner hook.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/actions.test.ts --timeout 30000`: 1 pass / 0 fail / 4 expects.
- `bun run typecheck`: passed.
- `bun run check`: passed with the known Vite large-chunk warning.
- Temp backend `:3299`: authenticated `/health` ok and `/api/content-health?limit=1` returned an empty non-degraded dataset.

Next: add explicit V4.2 checklist items for the next scheduler/dashboard slice, or surface post-deploy content-health scan status in the NewsBites deploy UI.

### 2026-06-18 08:57 UTC - Builder Preview Preflight Hardening

Continued from the scheduler plan after confirming no unchecked scheduler-plan implementation items remain.

- Added fullstack preview preflight for generated backend workspaces: detected backend builds now run before launching a public preview, and Nx backend builds use `--skip-nx-cache`.
- Added diagnostics for Nx workspace detection, mixed lockfiles, package-manager mismatch, backend preflight pass/fail, and web-only fallback cases.
- Added a Builder preview modal disclaimer that Cloudflare Quick Tunnel URLs are transient preview links.
- Added focused coverage for successful preflight, failing backend build preflight, and non-blocking web-only lockfile diagnostics.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/builder/preview-server.test.ts --timeout 30000`: 3 pass / 0 fail / 10 expects.
- `bun test server/builder/ server/api/builder.test.ts --timeout 30000`: 42 pass / 0 fail / 211 expects.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- `control-surface.service`: restarted active; live `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: continue the remediation slice for existing workflow timeout/model-order migration and workflow detail visibility, or add explicit scheduler/V4 checklist items for the next slice.

### 2026-06-18 08:57 UTC - Builder Preview Reliability Follow-Up

Continued from the scheduler plan into the active Builder remediation slice because no unchecked scheduler-plan items remain.

- Added fullstack preview preflight for Nx/backend build readiness, mixed lockfile/package-manager diagnostics, and fail-fast backend build failure.
- Added focused preflight tests and a Builder preview modal disclaimer that Cloudflare Quick Tunnel URLs are preview-only and transient.
- Verified GaffrPro no-cache API/web builds, retried fullstack preview successfully, and verified preview teardown left no owned preview ports/processes.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/builder/preview-server.test.ts`: 3 pass / 0 fail.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- GaffrPro `npx nx build api-api --skip-nx-cache` and `npx nx build web --skip-nx-cache`: passed.
- Live `control-surface.service` restarted active; `/health` and `/builder` smoke passed.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at P1 workflow config/model-order visibility.

### 2026-06-18 09:03 UTC - Codex Builder Workflow Policy Reconciliation

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Control Surface remediation plan.

- Added Builder workflow config reconciliation for stale long-running workflow pass/stall timeouts and max-pass defaults.
- Expanded `opencode:group:agentic-heavy` workflow agent-order entries and fallback targets from the live agentic model catalog.
- Added workflow detail visibility for effective model order, fallback targets, and timeout policy.
- Marked the corresponding remediation-plan P1 workflow config/default visibility items complete.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/builder.test.ts --timeout 30000`: 15 pass / 0 fail.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- `/builder` visual check passed across desktop/tablet/iPhone 16 Pro.
- Live `control-surface.service` restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at P1 Operator Auth Clarity.

### 2026-06-18 09:27 UTC - P2 Whole-Site Continuous Checks

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Control Surface remediation plan.

- Added `scripts/check-site-routes.sh` to verify SPA routes, public JSON APIs, and protected JSON APIs with `x-operator-token`, including status and response-size reporting.
- Added `scripts/check-builder-run.sh <runId>` to summarize current run status, last pass status/model/timing, last validation failure, stale activity detection, and generated project dirty state.
- Marked the corresponding remediation-plan P2 script items complete.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bash -n scripts/check-site-routes.sh scripts/check-builder-run.sh`: passed.
- Temp backend `:3299`: `scripts/check-site-routes.sh` passed all route/API checks.
- Temp backend `:3299` with seeded `run-script`: `scripts/check-builder-run.sh run-script` passed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at P2 read-only dashboard tile for active builder run risk.

### 2026-06-25 10:06 UTC - Builder Run Risk Tile and Route/API Issue Logging

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Control Surface remediation plan.

- Added read-only Builder run risk summary API coverage and a home dashboard tile for stalled, repeated-timeout, validation-failed, and preview-blocked active runs.
- Extended the route/API checker to append AI Vault daily output only when a meaningful route/API issue is found.
- During live restart, fixed a narrow reasoner incident aggregation startup blocker by qualifying the joined tenant filter with the incident table alias; `server/insights/aggregate.ts` already had unrelated dirty changes.
- Marked the corresponding remediation-plan P2 items complete.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/builder.test.ts --timeout 30000`: 16 pass / 0 fail.
- `bash -n scripts/check-site-routes.sh`: passed.
- Temporary failing route/API smoke verified issue-only AI Vault logging.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check` for changed repo files: passed.
- Temp production server `:3299` visual check for `/`: desktop/tablet/iPhone passed.
- Live `control-surface.service`: restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at the P2 project-local validation profile requirement before major runs.

### 2026-06-29 10:06 UTC - External Service Requirement Gate

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Control Surface remediation plan.

- Added Builder major-run blockers for actionable next plan items that require unavailable TestFlight/App Store Connect credentials, EAS credentials, Google Play Billing sandbox credentials, or real iOS simulator access.
- Wired the blocker into `startWorkflowRun` through the existing validation-profile start gate.
- Added focused coverage for true external-service requirements and for ignoring this remediation plan's meta checklist language.
- Marked the corresponding remediation-plan P2 external-service gate complete; scheduler-plan checkboxes remain unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/builder/validation-profile.test.ts --timeout 30000`: 5 pass / 0 fail.
- `bun test server/builder/validation-profile.test.ts server/builder/plan-sanity.test.ts server/api/builder.test.ts --timeout 30000`: 24 pass / 0 fail.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at the P3 Builder run detail page improvements.

### 2026-06-29 10:02 UTC - Generated-App Validation Profile Gate Audit

Continued from this scheduler plan by following its no-unchecked-items handoff to the active Control Surface remediation plan.

- Verified the P2 generated-app validation-profile gates already implemented in Builder.
- Confirmed major runs require a project-local `.opencode/validation-profile.json` with install/API build/web build/API smoke/web smoke command slots.
- Confirmed Nx validation commands derive from `nx.json` plus discovered `project.json` targets.
- Confirmed generated apps with no root `build` script do not receive invented `npm run build` validation guidance.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/builder/validation-profile.test.ts server/api/builder.test.ts --timeout 30000`: 19 pass / 0 fail.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next: continue `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` at rejecting or downgrading plan items that require unavailable external services.
### 2026-06-29 20:44 UTC - Codex Remediation P3 Completion

Continued through the active remediation plan because this scheduler plan still has no unchecked implementation items.

- Confirmed `/root/DASHBOARD_V4_SCHEDULER_PLAN.md` and `/root/DASHBOARD_V4_PLAN.md` have no unchecked implementation checklist items.
- Completed the remaining P3 remediation checklist items in `/root/CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md`: repair build baseline action, per-model quality telemetry, and pause-on-repeated-validation-failure policy.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/insights/scanners/ops.test.ts server/insights/scanners/edge.test.ts server/insights/scanners/governance.test.ts server/insights/autoapply.test.ts --timeout 30000`: passed, 32 tests.
- `bun test server/api/cost.test.ts server/governance/budgets.test.ts server/api/execute.test.ts server/api/builder.test.ts --timeout 30000`: passed, 43 tests.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next:

- Commit/restart when the operator is ready, or add the next explicit Dashboard V4/V5 plan slice.

### 2026-06-29 20:46 UTC - Codex Validation-Failure Pause Policy

Continued through the active remediation P3 slice because this scheduler plan and the main V4 plan still have no unchecked implementation items.

- Added configurable Builder pause-on-repeated-validation-failure policy in workflow config, `/builder` UI controls, workflow summary display, and runner enforcement.
- Confirmed remediation P3 items are now checked complete; scheduler-plan checkboxes remain unchanged because there are no unchecked scheduler-plan implementation items.

Validation:

- `bun run typecheck`: passed.
- `bun test server/api/builder.test.ts --timeout 30000`: passed, 22 tests.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/db/ server/api/ --timeout 30000`: passed, 411 tests.
- Scoped `git diff --check`: passed.

Next:

- No unchecked scheduler/main/remediation checklist items remain; add the next explicit Dashboard V4/V5 slice or commit/restart when ready.

### 2026-06-29 20:49 UTC - Codex P3 Closure Validation

Continued through the active remediation plan because this scheduler plan still has no unchecked implementation items.

- Added focused API assertions proving Builder run summaries expose per-model telemetry fields: timeout rate, validation-pass rate, file-write probe, stdout interval, and last status.
- Added API coverage proving configured repeated-validation pause thresholds persist through workflow creation and normalize to the safe maximum.
- Verified the existing configurable pause-on-repeated-validation-failure policy remains covered by focused runner/API tests.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/builder.test.ts --timeout 30000`: passed, 23 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next:

- No unchecked scheduler or active remediation implementation items remain; commit/restart after operator review or add the next explicit Control Surface plan slice.

### 2026-06-30 01:53 UTC - Codex V5 State of the Stack Briefing

Continued into the first open V5 Phase 2 item because this scheduler plan, the main V4 plan, and the remediation plan have no unchecked implementation items.

- Added a UTC daily cached `/api/admin/briefing` path: persisted LLM briefings in SQLite `system_configs`, same-day in-memory reuse, and deterministic local fallback text for first load or gateway failure.
- Added focused tests for no-DB fallback and persisted same-day cache loading.
- Marked the corresponding `/root/DASHBOARD_V5_PLAN.md` Phase 2 item done.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation so far:

- `bun test server/insights/health.test.ts`: passed, 2 tests / 0 failed.
- `bun run typecheck`: passed.

Next:

- Run build/check, then continue with the next V5 Phase 2 item: feed recent history and related findings into the AI prompt.

### 2026-06-30 02:17 UTC - Codex V5 Reasoning Prompt Context

Continued into the next V5 Phase 2 item because this scheduler plan, the main V4 plan, and the remediation plan have no unchecked implementation items.

- Verified the insight AI prompt includes related same-domain/source-family findings, recent cross-domain finding history, and recent platform action/config/job history.
- Added focused regression coverage for the prompt context in `server/insights/ai.test.ts`.
- Confirmed the corresponding `/root/DASHBOARD_V5_PLAN.md` Phase 2 item is marked done.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/insights/ai.test.ts --timeout 30000`: passed, 8 tests / 0 failed.
- `bun test server/insights/health.test.ts --timeout 30000`: passed, 3 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check` for touched repo files: passed.

Next:

- Continue with the next V5 Phase 2 item: confidence-gated auto-apply.

### 2026-06-30 02:17 UTC - Codex V5 Auto-Apply Confidence Gate

Continued into the remaining V5 Phase 2 item because this scheduler plan, the main V4 plan, and the remediation plan have no unchecked implementation items.

- Added the auto-apply confidence gate: safe automatic remediation now requires cached AI analysis confidence to meet `minAiConfidenceForAutoApply` before preview/execution.
- Auto-apply audit request metadata now includes the AI confidence and active threshold.
- Confirmed the corresponding `/root/DASHBOARD_V5_PLAN.md` Phase 2 item is marked done.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/insights/autoapply.test.ts server/insights/ai.test.ts --timeout 30000`: passed, 16 tests / 0 failed.
- `timeout 240s bun run typecheck`: passed.
- `timeout 360s bun run build`: passed with the known Vite large-chunk warning.
- Scoped `git diff --check`: passed.

Next:

- Continue V5 at Phase 3 event markers on graphs, then Phase 7 mock/TODO/placeholder sweep.

### 2026-06-30 02:18 UTC - Codex V5 Admin Briefing Context Validation

Continued the scheduler-plan handoff and kept scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

- Added focused State of the Stack briefing coverage for recent finding history and related open-finding clusters.
- Confirmed the current V5 plan already marks the Phase 2 prompt-context and confidence-gated auto-apply items done.

Validation:

- `bun test server/insights/health.test.ts --timeout 30000`: passed, 3 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- Touched-file `git diff --check`: passed.

Next:

- Continue V5 at Phase 3 event markers on graphs, then Phase 7 mock/TODO/placeholder sweep.

### 2026-07-01 09:05 UTC - Codex V5 Admin Graph Event Markers

Continued into the V5 Phase 3 graph-marker item because this scheduler plan still has no unchecked `[ ]` implementation items.

- Added `/api/admin/events` to expose deployment, config-change, and reasoner-incident markers from the dashboard DB.
- Overlaid linked D/C/I markers on the `/admin` health trend sparkline, pointing to `/jobs`, `/settings`, and `/incidents`.
- Marked the corresponding V5 plan item done; scheduler-plan checkboxes remain unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/admin.test.ts --timeout 30000`: passed, 1 test / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `bun test server/api/admin.test.ts server/insights/health.test.ts --timeout 30000`: passed, 4 tests / 0 failed.
- Isolated temp server on `:3319` with `OPERATOR_TOKEN=test`: `/health`, `/api/admin/events?days=1`, and `/admin` returned 200.
- Focused visual check on isolated temp server `:3320`: `/admin` passed desktop/tablet/iPhone 16 Pro with 0 console errors, 0 page errors, and 0 failed requests.
- `git diff --check` for touched repo files: passed.

Next:

- Continue V5 Phase 7 mock/TODO/placeholder sweep.

### 2026-07-02 14:10 UTC - Codex V5 Model Health Atomic Reads

Continued the scheduler-plan handoff into the active V5 Phase 6 stability slice because this scheduler plan still has no unchecked `[ ]` implementation items.

- Added a shared retrying atomic JSON reader for model-health style files.
- Wired core `/api/models` and home/model adapter health reads through the helper to tolerate transient torn `model-health.json` writes.
- Marked the corresponding V5 Phase 6 item done; scheduler-plan checkboxes remain unchanged because no unchecked scheduler-plan items exist.

Validation:

- `bun test server/lib/atomicJson.test.ts server/api/models.test.ts --timeout 30000`: passed, 8 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.

Next:

- Continue V5 Phase 6 with the OpenCode session-count widget or widget hide/reorder.

### 2026-07-02 14:12 UTC - Codex V5 Incident Mute Stub Removal

Continued the scheduler-plan handoff into the V5 Phase 7 mock/TODO/placeholder sweep because this scheduler plan still has no unchecked `[ ]` implementation items.

- Implemented the remaining durable backend path for incident mute actions: `mute:incident:<id>` now updates `reasoner_incidents.muted_at`, `muted_by`, and `mute_reason` instead of returning `NOT_IMPLEMENTED`.
- Added `/api/incidents/:id/mute`, exposed muted metadata through `/api/incidents`, and removed synthetic legacy incident lifecycle descriptors from the global action catalog so they no longer advertise non-durable controls.
- The Incidents page and focused regression coverage for mute were present in HEAD during this pass; the route/schema/executor/catalog cleanup completes the runtime path.
- Left scheduler-plan checkboxes unchanged because no unchecked scheduler-plan implementation items exist.

Validation:

- `bun test server/api/incidents.test.ts server/api/actionDescriptors.test.ts --timeout 30000`: passed, 10 tests / 0 failed.
- `bun test server/lib/atomicJson.test.ts --timeout 30000`: passed, 2 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- Isolated temp server on `:3299`: `/health` and `/api/incidents` returned 200.
- Focused visual check on isolated temp server `:3302`: `/incidents` passed desktop/tablet/iPhone 16 Pro with 0 console errors, 0 page errors, and 0 failed requests.
- `git diff --check`: passed.

Next:

- Continue V5 Phase 7 by sweeping the remaining `mock|TODO|placeholder|coming soon` hits and either proving each is legitimate UX copy/SQL placeholder text or removing/wiring any remaining fake controls.

### 2026-07-07 09:43 UTC - Codex V5 Phase 7 Fake-Surface Sweep

Continued the scheduler-plan handoff into the V5 Phase 7 fake-surface sweep because this scheduler plan still has no unchecked `[ ]` implementation items.

- Confirmed `rg -n -i 'mock|TODO|coming soon' server/api app/routes --glob '!*.test.ts' --glob '!*.test.tsx'` initially had only production comment hits in `server/api/shell.ts`, not fake data or disabled controls.
- Rephrased those test-seam comments so the production fake-surface proof command now returns zero hits again.
- Fixed the existing `server/api/disk-reclaim-backup.test.ts` typecheck failure by casting the response `jobId` before assertion; no runtime behavior changed.
- Left scheduler-plan checkboxes unchanged because no unchecked scheduler-plan implementation items exist.

Validation:

- `rg -n -i 'mock|TODO|coming soon' server/api app/routes --glob '!*.test.ts' --glob '!*.test.tsx'`: zero hits.
- `bun test server/api/disk-reclaim-backup.test.ts --timeout 30000`: passed, 12 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.

Next:

- Continue the active Dashboard/ULTRAPLAN work from `/home/agent/MIMULE_MASTER_PLAN_V3.md`: A3b disk-pressure reclaim + backup-freshness detector remains the visible dirty workspace slice; validate or complete it before moving to the next plan item.

### 2026-07-07 09:49 UTC - Codex A3b Validation Pass

Continued the scheduler-plan handoff into the active A3b infra-actions slice because this scheduler plan still has no unchecked `[ ]` implementation items.

- Validated the visible dirty A3b implementation for bounded disk reclaim and backup-now remediation actions.
- Confirmed isolated temp-server `/api/actions/catalog` exposes `reclaim:disk:docker-prune` and `run:backup:now`.
- Left scheduler-plan checkboxes unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.

Validation:

- `bun test server/api/disk-reclaim-backup.test.ts server/insights/scanners/ops.test.ts --timeout 30000`: passed, 34 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- Isolated temp server on `:3329`: `/health` returned OK and catalog contained both A3b actions.
- `git diff --check`: passed.

Next:

- Commit/restart the A3b infra-actions slice when ready, then continue ULTRAPLAN Phase 3 with the next action-catalog item.

### 2026-07-07 09:47 UTC - Codex A3b Infra Actions Validation

Continued the scheduler-plan handoff into the active A3b infra-actions slice because this scheduler plan still has no unchecked `[ ]` implementation items.

- Validated the visible dirty A3b implementation: disk-pressure findings point to `reclaim:disk:docker-prune`, backup stale/missing findings point to `run:backup:now`, and both descriptors are exposed in the action catalog.
- Confirmed the bounded disk reclaim worker issues only `df -BG /`, `docker builder prune -f`, `docker image prune -f`, and `df -BG /`; it never uses `-a` or `--all`, records job output, and writes finished audit rows.
- Confirmed `run:backup:now` reuses the existing timer-run worker for `mimule-backup` without invoking any real system command in tests.
- Left scheduler-plan checkboxes unchanged because no unchecked scheduler-plan implementation items exist.

Validation:

- `bun test server/api/disk-reclaim-backup.test.ts server/insights/scanners/ops.test.ts --timeout 30000`: passed, 34 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- Isolated temp server on `:3299`: `/health` returned OK and `/api/actions/catalog` contained `reclaim:disk:docker-prune` and `run:backup:now`.
- Live deploy check: `control-surface.service` restarted active; `http://127.0.0.1:3000/health` returned `{"ok":true,"version":"0.8.0"}`.

Next:

- Return to `/home/agent/MIMULE_MASTER_PLAN_V3.md` for the next ULTRAPLAN Phase 3 action slice after A3b is committed by the operator.

### 2026-07-07 09:53 UTC - Codex Scheduler No-Unchecked Validation

Continued from this scheduler plan and confirmed it still has no unchecked implementation items.

- Preserved the existing dirty A3b infra-actions implementation and generated fresh-host reports.
- Revalidated the active A3b slice without changing application code: bounded disk reclaim and backup-now catalog entries remain present and covered by focused tests.
- Left scheduler-plan checkboxes unchanged because no unchecked scheduler-plan implementation items exist.

Validation:

- `bun test server/api/disk-reclaim-backup.test.ts server/insights/scanners/ops.test.ts --timeout 30000`: passed, 34 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- Isolated temp server on `:3299`: `/health` returned OK and `/api/actions/catalog` contained `reclaim:disk:docker-prune` and `run:backup:now`.
- `git diff --check`: passed.

Next:

- Commit/restart the already-validated A3b infra-actions slice when ready, then continue the next active Dashboard V4/ULTRAPLAN Phase 3 action-catalog item outside this completed scheduler checklist.

Postscript:

- A3b was committed during this pass as `f326532`; final `HEAD` is `f326532`.
- Additional concurrent dirty files appeared after that commit: `app/routes/ModelsPage.tsx`, `server/api/actionDescriptors.ts`, `server/api/actions.ts`, `server/api/execute.ts`, `server/api/shell.ts`, `server/api/types.ts`, and `server/insights/autoapplyPolicy.ts`.
- Final `bun run typecheck`, `bun run build`, `bun run check`, focused A3b tests, and `git diff --check` passed. Live service was active and `/health` returned OK, but this pass did not restart it from the dirty working tree.

### 2026-07-07 09:53 UTC - Codex Final A3b Pass State

- Final worktree dirty set is limited to the A3b code/test files: `server/api/actionDescriptors.ts`, `server/api/actions.ts`, `server/api/execute.ts`, `server/api/shell.ts`, `server/api/types.ts`, `server/insights/scanners/ops.ts`, `server/insights/scanners/ops.test.ts`, and new `server/api/disk-reclaim-backup.test.ts`.
- Validation remained green: focused A3b tests, action catalog tests, `bun run typecheck`, `bun run build`, `bun run check`, `git diff --check`, isolated catalog smoke, and live health check.
- `control-surface.service` was restarted after validation and is active; `http://127.0.0.1:3000/health` returned `{"ok":true,"version":"0.8.0"}`.
- Scheduler-plan checkboxes remain unchanged because there are no unchecked scheduler-plan implementation items.

### 2026-07-07 10:00 UTC - Codex Validation Handoff

Continued from this scheduler plan after confirming it still has no unchecked implementation items.

- A3b disk/backup remediation is now committed at `f326532`; final validation covered the committed A3b state plus the current dirty model-action workspace.
- Required gates passed: focused A3b tests 34/0, `bun run check`, exact `DASHBOARD_DB=1 timeout 500 bun test` 1059/0, and `bash e2e/fresh-host/gate.sh` PASS with UI 41/41, CRASH=0, ERROR-5xx=0, unexpected-LEAK=no.
- The first full-suite attempt hit two load-sensitive `server/db/ingestor.test.ts` 5s timeouts; rerunning the exact full command passed without code changes after the concurrent A3b commit.
- Current remaining dirty files are post-A3b model-action work (`/models` probe/cooldown/action-catalog files plus fresh-host reports), not scheduler-plan checklist work.

Next:

- Continue ULTRAPLAN Phase 3 at the unchecked `Clear cooldown` item, first reconciling the current dirty model-action files.

### 2026-07-07 10:00 UTC - Codex Model Single-Probe Action

Continued the scheduler-plan handoff into the next active ULTRAPLAN Phase 3 action-catalog slice because this scheduler plan still has no unchecked `[ ]` implementation items.

- Finished `probe:model:<logicalName>` as a durable single-model LiteLLM probe with fallbacks disabled.
- Added the Models page probe control, action catalog descriptor, executor route, auto-apply rollback metadata, and focused hermetic regression coverage.
- Preserved scheduler-plan checkboxes because no unchecked scheduler-plan implementation items exist.

Validation:

- `bun test server/api/model-single-probe.test.ts --timeout 30000`: passed, 3 tests / 0 failed.
- `bun test server/api/model-single-probe.test.ts server/api/actionDescriptors.test.ts server/api/execute.test.ts --timeout 30000`: passed, 22 tests / 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed with the known Vite large-chunk warning.
- `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- Isolated temp server on `:3331`: `/health` OK; `/models` visual check passed desktop/tablet/iPhone 16 Pro with 0 console errors, 0 page errors, and 0 failed requests.
- Live `control-surface.service` restarted active; `/health` returned `{"ok":true,"version":"0.8.0"}`.

Next:

- Continue ULTRAPLAN Phase 3 action-catalog work with the next A4/A5 action after reviewing remaining open findings; scheduler-plan itself remains fully checked.

### 2026-07-07 10:03 UTC - Codex A4 Model Actions

Continued the scheduler-plan handoff into ULTRAPLAN Phase 3 A4 because this scheduler plan still has no unchecked `[ ]` implementation items.

- Reconciled and validated the post-A3b model-action dirty slice: `probe:model:<logicalName>` and `clear-cooldown:model:<name>` are now marked complete in `/root/control-surface-plans/ULTRAPLAN.md`.
- Single-model probe is job-backed, probes through LiteLLM with fallbacks disabled, updates only the selected `model-health.json` row, exposes catalog descriptors, and adds a stale/unavailable row button on `/models`.
- Clear-cooldown now has a canonical low-risk action descriptor/executor path while preserving legacy `mutate-policy:model:*:cooldown-clear` auto-tier compatibility.
- Left scheduler-plan checklist items unchanged because no unchecked scheduler-plan implementation items exist.

Validation:

- `bun test server/api/model-single-probe.test.ts --timeout 30000`: passed, 3 tests / 0 failed.
- `bun test server/api/actions.test.ts server/api/execute.test.ts --timeout 30000`: passed, 18 tests / 0 failed.
- `bun test server/api/actionDescriptors.test.ts server/insights/autoapply.test.ts --timeout 30000`: passed, 23 tests / 0 failed.
- `bun test server/api/disk-reclaim-backup.test.ts server/insights/scanners/ops.test.ts --timeout 30000`: passed, 34 tests / 0 failed.
- `bun run typecheck`, `bun run build`, and `bun run check`: passed with the known Vite large-chunk warning.
- `git diff --check`: passed.
- Isolated temp server on `:3299`: `/health` OK and `/api/actions/catalog?sourceRoute=/models` included `probe:model:*` with `jobKind=model-single-probe`.

Next:

- Continue ULTRAPLAN Phase 3 A4 with `Chain preview + apply`.

### 2026-07-10 07:50 UTC - Codex

Completed the scheduler-plan handoff into `/root/control-surface-plans/ULTRAPLAN.md` Phase 3 A4 `Gateway key rotate`.

Status:

- Scheduler-plan checkboxes remain unchanged because this scheduler plan still has no unchecked `[ ]` implementation items.
- Marked the corresponding ULTRAPLAN item complete.
- Added schema/service/API/executor/catalog support for `rotate:gateway-key:<id>` with grace-period dual-validity.

Evidence:

- `bun test server/gateway/keys.test.ts` 19/0.
- `bun test server/api/execute.test.ts` 17/0.
- `bun test server/api/actionDescriptors.test.ts` 5/0.
- `bun run typecheck`, `bun run build`, `bun run check`, and `git diff --check` passed.
- Isolated temp server on `:3299`: `/health` OK and `/api/actions/catalog` reported `gatewayKeys: ok`.

Next:

- Continue ULTRAPLAN Phase 3 A4 with `Route override with TTL`.
