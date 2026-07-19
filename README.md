# MIMULE / TechInsiderBytes operations and planning

This repository is the shared operating notebook for the MIMULE / TechInsiderBytes stack. It explains what the system is meant to do, records what has actually been verified, and gives human operators and coding agents a safe place to plan the next change.

It is not a monorepo for every running service. Most application code lives in separate service repositories under `/opt/`. This repository holds the long-lived plans, handover notes, implementation specifications, decision records, and progress logs that connect those services.

## Project goals

The stack is being built around a few simple goals:

- give one operator a clear view of AI agents, models, workflows, content, infrastructure, cost, and risk;
- use local and free model capacity first, with measured cloud fallbacks when needed;
- make multi-agent work durable, resumable, testable, and easy to inspect;
- turn raw model and provider failures into useful health evidence instead of silent breakage;
- automate repetitive editorial and software work without bypassing approvals or validation;
- keep every important change traceable through plans, receipts, logs, commits, and the shared AI vault;
- improve the system in bounded slices so that a new feature cannot quietly destabilize production.

## The system in plain language

MIMULE is the operator-facing assistant and coordination layer. The Control Surface is the web application for inspecting and operating the stack. Builder runs planned work through coding agents. The model-routing layer chooses an available local or cloud model. Health checks, cost records, traces, and audits explain what happened. Editorial services use the same foundations to research, verify, prepare, and publish content.

```text
Operator
   |
   +-- MIMULE assistant
   +-- Control Surface
           |
           +-- Builder and agent sessions
           +-- Editorial workflows
           +-- Infrastructure actions
           |
           +-- Model gateway and routing policy
                   |
                   +-- Local inference
                   +-- Free or paid cloud providers
                   +-- Fallback chains
           |
           +-- Health, cost, traces, audit, reports, and vault logs
```

The model name requested by a client is normally a logical route, not a promise to call one fixed provider. The routing layer resolves that name against current configuration, health, credentials, policy, and fallback order. The surrounding control plane records the route taken and exposes evidence when a model, key, provider, or host is unhealthy.

## Major components

| Component | Purpose | Where its code or plans live |
|---|---|---|
| Control Surface | Web UI and API for operations, agents, Builder, routing, governance, cost, and observability | Runtime repository: `/opt/opencode-control-surface/`; plans: `control-surface-plans/` and `DASHBOARD_*.md` |
| Builder | Durable multi-pass workflows that can plan, implement, validate, pause, resume, and report | Control Surface runtime plus `BUILDER_*.md` roadmaps |
| Model routing | Logical model names, provider selection, fallback chains, usage accounting, and route overrides | LiteLLM configuration and MIMULE operational scripts; repair work in `control-surface-plans/REPAIR_PLAN_MODEL_ROUTING.md` |
| Model health | Catalog discovery, model probes, credential checks, quality evidence, cooldowns, and controlled redemption | MIMULE scripts and task specifications under `control-surface-plans/tasks/` |
| Agent surfaces | Codex, OpenCode, Claude, Gemini, and terminal sessions | Control Surface runtime; unified workspace proposal in `control-surface-plans/ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md` |
| MIMULE / OpenClaw | Conversational operator interface and automation entry point | Runtime repository: `/opt/mimoun/`; operational context in `MIMULE*.md` |
| Editorial pipeline | Story scouting, research, writing, verification, preparation, and publishing | Runtime workspaces under `/opt/`; platform context in the MIMULE plans |
| NewsBites | Reader-facing publication produced by the editorial pipeline | Separate runtime repository; roadmap in `NEWSBITES_LEVELING_PLAN_V1.md` |
| Governance and evidence | Policies, approvals, audit chain, secrets references, reports, validation receipts, and vault logging | Control Surface runtime, plans, task specifications, and the external AI vault |
| Infrastructure | Services, containers, scheduled jobs, remote inference, backups, and deployment boundaries | Separate host configuration and runtime repositories; this repository records verified intent and status |

## How work moves through the stack

### 1. A request becomes a bounded task

The operator describes an outcome. The relevant plan is inspected first, live state is checked, and facts are separated from assumptions. Large changes are divided into small implementation specifications with explicit file scope and acceptance checks.

### 2. An agent or workflow does the work

The task may run directly in Codex, OpenCode, Claude, or Gemini, or through a Builder workflow. Builder preserves the plan, pass history, artifacts, validation results, and lifecycle state so another agent can continue without guessing.

### 3. Model routing selects capacity

The requested logical model is resolved to an eligible backend. The system considers provider availability, credential health, model health, policy, cost, and ordered fallbacks. A temporary failure should lead to a cooldown and controlled reprobe, not permanent deletion without evidence.

### 4. Validation decides whether work advances

Code changes must pass checks appropriate to their risk. Production-affecting actions require stronger evidence than documentation edits. A passing command is not enough when the evidence could come from the wrong tree or a stale process; high-trust acceptance uses candidate-bound receipts and explicit runtime checks.

### 5. Evidence is preserved

Meaningful work is recorded in the appropriate plan, the canonical continuation log, and the AI vault. Code changes are committed in the repository that owns them. Operational claims should include the command, artifact, health response, or other evidence that supports them.

## Repository map

### Canonical context

- `AGENTS.md` — repository rules for agents and contributors.
- `CLAUDE.md` — service and workspace context. Treat operational details as sensitive.
- `MIMULE_MASTER_PLAN_V3.md` — canonical continuation plan and append-only progress history.
- `MIMULE.md` and older master plans — historical context; they do not override the latest verified state.

### Control Surface planning

- `DASHBOARD_V4_PLAN.md` and `DASHBOARD_V5_PLAN.md` — product and operator-surface roadmaps.
- `CONTROL_SURFACE_END_TO_END_REMEDIATION_PLAN.md` — repair and acceptance work for the full surface.
- `control-surface-plans/ULTRAPLAN.md` — detailed control-surface program plan.
- `control-surface-plans/pages/` — page-level design and behavior plans.
- `control-surface-plans/tasks/` — bounded implementation contracts and verification gates.
- `control-surface-plans/REPAIR_PLAN_MODEL_ROUTING.md` — current model-routing repair arc.
- `control-surface-plans/ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md` — proposed unified agent and terminal workspace. It is a roadmap, not a shipped feature.

### Builder planning

- `BUILDER_PLATFORM_12_MONTH_PLAN.md` — product thesis and long-term architecture.
- `BUILDER_EXCELLENCE_PLAN.md` — quality and reliability work.
- `BUILDER_MONTH*.md` — staged governance, reasoning, orchestration, distribution, marketplace, compliance, and productization plans.

### Other product planning

- `NEWSBITES_LEVELING_PLAN_V1.md` — NewsBites product roadmap.
- `STYLING_*.md` — visual-quality work that spans the operator experience.

## Source-of-truth rules

Use this order when documents disagree:

1. verified live evidence;
2. the latest append in the relevant repair or product plan;
3. the latest canonical MIMULE master plan;
4. older plans and historical notes.

A roadmap item marked complete is not proof that the current runtime is healthy. Recheck service state, configuration, tests, and the deployed commit before making an operational claim.

## Safe operating workflow

1. Read `AGENTS.md`, `CLAUDE.md`, and `MIMULE_MASTER_PLAN_V3.md`.
2. Read the most specific current plan for the task.
3. Inspect the owning runtime repository and its local instructions.
4. Record assumptions and define a narrow file and service scope.
5. Implement and validate in the owning repository.
6. Review the diff for unrelated changes and secrets.
7. Commit only the intended paths with an imperative message.
8. Append evidence and next steps to the appropriate plan and AI vault log.
9. Push only after confirming the target remote, branch, and secret-scan result.

Do not treat a dirty working tree as disposable. Unrelated edits may belong to another agent or an operator. Do not rewrite append-only history merely to make a plan look tidy.

## Documentation checks

This repository has no application build. Before committing documentation changes, run:

```bash
git status --short
git diff --check
git log --oneline --decorate -5
```

If `markdownlint` is available, it can provide an additional Markdown pass:

```bash
markdownlint '*.md' 'control-surface-plans/**/*.md'
```

## Security and privacy

This repository describes real operational systems. Documentation must not contain API keys, passwords, private keys, session cookies, personal identifiers, or private network details. Use environment-variable names and secret-store references instead of values.

Before any GitHub push, review both tracked and untracked files for accidental credentials and personal information. Historical operational notes require the same review; being old does not make a secret safe to publish.

Runtime secrets belong in root-readable environment files or an approved vault, never in plans, examples, commits, screenshots, or chat transcripts. The Control Surface should receive secret references, not expose secret values to the browser.

## Current roadmap themes

The active work is centered on:

- trustworthy model discovery across complete provider catalogs;
- separate credential and model health so an expired key does not condemn a good model;
- bounded redemption probes for temporarily blocked routes;
- isolated integration of additional free-model aggregators;
- a unified Agent Workspace with persistent multi-session terminals and complete model and inference controls;
- permanent server-side hiding of internal test sessions from normal operator views;
- candidate-bound validation receipts and a strict, evidence-driven repair-arc verifier.

These themes describe intent. Their specifications and latest status entries state what is actually shipped and what remains gated.

The catalog-discovery foundation is now shipped in the MIMULE runtime at commit `4007b3f`. On a full scheduled health run it inventories supported providers, separates catalog presence from credential and model health, detects eligibility drift, and gives temporarily blocked exact model identities a small controlled chance to recover. It only writes evidence and activation proposals; it does not silently edit LiteLLM, add a paid route, or restart the gateway. A separate authorized apply path must recheck the exact provider/model/backend identity before any proposal can become routable.

## Contributing

Keep changes focused and factual. Use short ATX headings, flat lists, fenced command examples, and UTC timestamps. Prefer append-only status updates for long-lived plans. Label inference as inference, name files and services precisely, and include evidence for completion claims.

Use short imperative commit subjects, optionally scoped, such as:

```text
docs: explain model discovery lifecycle
plans: add agent workspace acceptance gates
```

Each runtime repository may have stricter instructions. Its local `AGENTS.md`, `CLAUDE.md`, test commands, and deployment process take precedence for changes inside that repository.
