# Builder Platform — 12-Month Productization Plan

Last updated: 2026-05-15 UTC
Owner: Marouane Defili
Working product name (internal): **MIMULE Builder Platform** — three-pillar working title **BG3** = Builder + Gateway + Governance.
Public/external candidate names (to validate): *Forge*, *Anvil*, *MimuleOps*, *Loom*.

Parent / sibling plans (read first):
- `/root/BUILDER_EXCELLENCE_PLAN.md` — tactical fix-up of today's Builder Pipeline (PASS_RESULT.json, analytics, failure classification, UI overhaul). This 12-month plan **subsumes that work as Month 1**.
- `/root/DASHBOARD_V4_SCHEDULER_PLAN.md` — Builder Pipeline origin spec.
- `/root/DASHBOARD_V4_OBSERVABILITY_PLAN.md` — trace infrastructure, finance observatory, dossier inspector.
- `/root/DASHBOARD_V4_PLAN.md` — actionable entity model, validation contracts, audit.
- `/root/DASHBOARD_V4_5_PLAN.md` — V4.5 surfaces (assistant, calendar, subscriptions).
- `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md` — agent composer pattern.
- `/root/MIMULE_MASTER_PLAN_V3.md` — canonical continuation file; append after every meaningful session.

Canonical code paths today:
- Server: `/opt/opencode-control-surface/server/builder/` (`runner.ts`, `store.ts`, `discovery.ts`, `doctor.ts`, `modelSelector.ts`, `provision.ts`, `scheduler.ts`).
- UI: `/opt/opencode-control-surface/app/routes/BuilderPage.tsx`.
- DB: `/var/lib/control-surface/dashboard.sqlite`.
- Run dirs: `/var/lib/control-surface/builder-runs/br_*`.
- LiteLLM: `/etc/litellm/config.yaml`.

---

## 1. Product Thesis

The MIMULE stack already runs an end-to-end agentic builder loop on a single CX32 VPS: a SQLite-backed scheduler, tmux-isolated passes, plan-driven continuation, doctor reviews, LiteLLM routing, AI Vault logging. What's missing is the **product layer** — the polish, the abstractions, the packaging, and the trust surface that would let a stranger run this on their own infrastructure and pay for it.

Today there are dozens of AI coding tools (Cursor, Continue, Aider, Claude Code, Codex, OpenCode, Cline) and a handful of LLM gateways (LiteLLM, OpenRouter, Portkey, Helicone). **Nobody bundles them with first-class governance and a deterministic durable orchestrator that you can compile and drop onto a customer's own VPS or bare-metal server.** That is the gap.

The product we are building does three things, in one cohesive surface:

| Pillar | What it does | Today's MIMULE equivalent |
|---|---|---|
| **Builder** | Plan-driven, durable, multi-agent coding loop. Spawns Claude/Codex/OpenCode/Aider/Gemini in tmux. Continuation contract via `PASS_RESULT.json`. Doctor reviews. Validation steps (typecheck, tests, Playwright). | `/opt/opencode-control-surface/server/builder/` + BuilderPage |
| **Gateway** | OpenAI-compatible router across local GPU (Ollama/vLLM/llama.cpp), free clouds (OpenRouter, GitHub Models), and paid clouds (Anthropic, OpenAI, Google). Health probes, cost/quota ledger, circuit breakers, fallback chains, per-tenant key vault. | LiteLLM at :4000 + `/etc/litellm/config.yaml` + `model-health-check.timer` |
| **Governance** | Policy-as-code, RBAC, immutable audit log, secrets vault, approval gates, telemetry, budget caps, retention policies, SSO, compliance reports. | Partial: `/audit` page, `writeActionAudit()`, AI Vault — but no policies, no RBAC, no signed audit chain. |

The pillars feed one another: every Builder pass is a Gateway client and a Governance subject. Every Gateway call carries a Builder context-id and a Governance policy tag. The audit chain ties them together.

**Audience**:
- *Now (Q1–Q2)*: us. The MIMULE stack consumes everything we build, immediately, on the same VPS.
- *Closed beta (Q3)*: 3–5 design partners — small dev shops and indie operators running their own VPS that want an AI coding agent system they control end-to-end.
- *GA (Q4)*: paid self-hosted product. Enterprise tier with SSO, advanced policy, and offline air-gapped operation. Optional managed cloud tier for those who don't want to self-host.

**Compileability is non-negotiable**: by end of Q3 we ship a single binary (or single Docker bundle) that drops onto any Ubuntu/Debian VPS or bare-metal server. SQLite-first, optional Postgres later. No mandatory cloud dependency. Local Ollama + a customer-provided OpenRouter key is enough to run the whole platform.

---

## 2. Adaptability Requirements (the hard constraints we never break)

The plan must satisfy these constraints at every phase. If a deliverable violates one, it does not ship.

| # | Constraint | What it means |
|---|---|---|
| C1 | **Tech-stack agnostic** | The Builder must drive Node, Go, Rust, Python, Java, Elixir, plain shell, and "no-language" infra projects. Validation hooks are pluggable (`bun run check`, `go test`, `cargo check`, `pytest`, custom). Project detection is heuristic and overrideable. |
| C2 | **Model agnostic** | Any model behind any provider that speaks OpenAI-compatible HTTP, plus the native Anthropic Messages API and Google's Gemini API. Local-only operation must work (Ollama / vLLM / llama.cpp). |
| C3 | **Context-size agnostic** | The Builder must handle 8K-context local models and 1M-context cloud models with the same plan file. This means hierarchical summarization, semantic context budget, and a per-model adapter that reports `effectiveContextWindow` and `recommendedInputBudget`. |
| C4 | **Stateful but portable** | All state lives in SQLite (single file) + a run-dir tree. No mandatory external services. Optional adapters for Postgres, Redis, S3-compatible storage. |
| C5 | **Compileable** | Hot path (runner, gateway, scheduler) must compile to a static binary or Docker image runnable as a single systemd unit. UI ships as bundled static assets. |
| C6 | **Stack-aware on MIMULE today** | Until we extract: every change works against the live MIMULE stack (Caddy, Cloudflare tunnel, NewsBites at news.techinsiderbytes.com, Paperclip, OpenClaw, Vast.ai GPU tunnel, autopipeline). Never break news.techinsiderbytes.com. |
| C7 | **Funnels back to the dashboard** | Even after extraction, every standalone install can opt-in to register its instance with the central dashboard at `control.techinsiderbytes.com` (or a customer's own central dashboard) — so a fleet of installs is still a single pane of glass. |
| C8 | **Audit-perfect** | Every state change is recorded with: who, when, why, what before, what after, content-hash, signing key id. The chain is append-only and hash-linked so tampering is detectable. |
| C9 | **Offline-capable** | Air-gapped install must work. The Gateway falls back to local-only model rotation. The Builder still runs. Only telemetry, marketplace fetches, and remote audit shipping degrade gracefully. |
| C10 | **Operator-first ergonomics** | Mobile-friendly dashboard. SSE for live state. Every long-running thing exposes a "what's it doing right now" panel. Failures show suggested actions, not stack traces. |

---

## 3. Reference Architecture (target shape at Month 12)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OPERATOR SURFACE                                    │
│  Web UI (React) — Mobile-responsive — SSE everywhere — Command palette       │
│  Embedded in MIMULE dashboard today; standalone /admin UI by M9              │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ HTTPS (OIDC / API token / mTLS)
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                          CONTROL PLANE (single binary `tib-builder`)         │
│ ┌─────────────┐ ┌───────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│ │ Gateway     │ │ Builder       │ │ Governance       │ │ AI Reasoner      │ │
│ │ (router,    │ │ (orchestrator)│ │ (policy, RBAC,   │ │ (LLM-driven      │ │
│ │ adapters,   │ │ - workflows   │ │ audit, secrets,  │ │ diagnosis,       │ │
│ │ ledger,     │ │ - passes      │ │ approvals,       │ │ remediation,     │ │
│ │ circuit-    │ │ - validation  │ │ budgets,         │ │ clustering)      │ │
│ │ breaker)    │ │ - scheduler   │ │ retention)       │ │                  │ │
│ └─────────────┘ └───────────────┘ └──────────────────┘ └──────────────────┘ │
│                          │                                                   │
│              Shared Event Bus (in-process pub/sub + persisted JSONL)         │
│                          │                                                   │
│   ┌──────────────────────┼─────────────────────────┐                         │
│   │ Trace + Audit log    │ SQLite store            │ Run-dir tree            │
│   │ (hash-chained JSONL) │ (workflows/passes/etc)  │ (artifacts, stdout)     │
│   └──────────────────────┴─────────────────────────┘                         │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                          AGENT WORKERS                                       │
│   tmux-isolated pass processes — one per concurrent pass                     │
│   Adapters: claude-code, codex, opencode, aider, gemini-cli, generic         │
│   Each pass reads PASS_PROMPT, writes PASS_RESULT.json + analytics           │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ OpenAI-compatible HTTP (or native API)
┌──────────────────────────▼──────────────────────────────────────────────────┐
│                          MODEL PROVIDERS                                     │
│   Local: Ollama / vLLM / llama.cpp / TGI                                     │
│   Free cloud: OpenRouter (nemotron, gemma4, qwen, minimax, liquid, arcee)    │
│   Paid: Anthropic Claude, OpenAI, Google Gemini, GitHub Models, Together     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Process model**:
- One long-running `tib-builder` daemon (systemd `Type=notify`, watchdog enabled).
- Each pass is a child tmux session — survives daemon restarts; daemon reattaches on boot.
- Optional `tib-agent` worker binary for remote agent execution (Month 7+: lets you have a 4-VPS fleet with one running control plane and three running agent workers).

**Data model summary** (every layer keyed by `tenant_id` from Month 7):

| Table | Purpose | Notes |
|---|---|---|
| `tenants` | Tenant isolation | Single-tenant by default; multi-tenant from M7 |
| `users`, `roles`, `role_bindings` | RBAC | OIDC subject → tenant + role |
| `projects` | Project (repo) registration | Path, language, validators, default model roster |
| `workflows` | Plan + mode + schedule + risk policy | Versioned; immutable history |
| `runs` | One execution of a workflow | Mode, trigger, status |
| `passes` | One agent invocation in a run | Agent, model, exit, analytics |
| `validations` | Validation step result | Typecheck/test/Playwright/build |
| `artifacts` | Files emitted by a pass | Stdout, stderr, prompt, PASS_RESULT, screenshots, traces |
| `audit_log` | Append-only hash-chained log | Every mutation + every action |
| `gateway_calls` | Per LLM call ledger | Model, latency, tokens, cost, success |
| `gateway_routes` | Active routing decisions | Snapshot used for replay |
| `policies` | Policy-as-code documents | YAML, versioned |
| `policy_decisions` | Per-action policy evaluations | Allow/deny + reason |
| `secrets` | Encrypted per-tenant secrets | Sealed by KEK |
| `budgets` | Spend caps per tenant/project/model | Hard cap and soft warn |
| `incidents` | Reasoner-clustered failure groups | Embedding-clustered patterns |
| `playbooks` | Suggested remediation flows | Generated + curated |
| `marketplace_skills` | Installed skills | Manifest, version, hash |
| `marketplace_adapters` | Installed provider/agent adapters | Manifest, version, hash |

**Trace model (OpenTelemetry-shaped, locally stored)**:
- Every operator action, every workflow run, every pass, every gateway call gets a `trace_id`.
- Spans nest: `run → pass → tool-call → gateway-call → adapter-http-call`.
- Persisted as JSONL in `/var/lib/control-surface/traces/YYYY-MM-DD/trace_id.jsonl`.
- Optional OTLP export to Tempo/Jaeger/Honeycomb (configured per-tenant).

---

## 4. The 12-Month Roadmap

Each month has the same structure:
- **Theme** — one sentence
- **Why now** — what blocks if we skip
- **Deliverables** — concrete, demoable artifacts
- **Code touchpoints** — file paths or new modules
- **Exit criteria** — pass/fail tests
- **Dashboard reveal** — what the operator sees afterward
- **Risk / open question** — what we're nervous about

Quarter boundaries:
- **Q1 (M1–M3)**: *Foundations*. Make the builder loop trustworthy. Own the gateway. No customer touchpoint yet.
- **Q2 (M4–M6)**: *Governance + Orchestration Excellence*. Policy, audit, RBAC, durable workflow engine. First external safety net.
- **Q3 (M7–M9)**: *Productization*. Multi-tenant, compileable binary, marketplace, adapter SDK. First closed beta.
- **Q4 (M10–M12)**: *Enterprise + GA*. Compliance, SSO, distribution, pricing, docs, launch.

---

### Month 1 — Pass Contract & Analytics (the BUILDER_EXCELLENCE foundation)

**Theme**: Make every builder pass machine-readable.
**Why now**: Without `PASS_RESULT.json` the continuation context is guesswork; without analytics the UI cannot show progress; without proper failure classification the operator cannot trust the system. Nothing else in this plan compounds until this is done.

**Deliverables** (these are exactly Parts I, II, IV from `BUILDER_EXCELLENCE_PLAN.md`):
- `PASS_RESULT.json` protocol enforced in the system prompt of every agent adapter (Claude, Codex, OpenCode, Gemini, Aider).
- `readPassResult()`, `extractPassAnalytics()`, `classifyFailureDiagnosis()` in `server/builder/runner.ts`.
- Schema migration: `builder_passes` gains `analytics_json`, `plan_items_done`, `plan_items_remaining`, `completion_percent`, `failure_class`, `trace_id`.
- Two-tier stall detection (warn at 300s, kill at configured timeout).
- Service-up check before Playwright validation.
- `error` column hygiene: never write git diff / typecheck stdout there.
- AI Vault log format upgraded to include analytics block.

**Code touchpoints**:
- `server/builder/runner.ts` — biggest change; estimate +600 lines.
- `server/builder/store.ts` — new types, new read/write helpers.
- `server/db/migrations/` — new migration file.
- `app/routes/BuilderPage.tsx` — minimal: a column for `completion_percent`. Full UI overhaul lands M2.

**Exit criteria**:
- 20 consecutive builder runs across at least 3 different plans produce a valid `PASS_RESULT.json`.
- Failure-class field is populated on 100% of non-success runs.
- `bun run check` clean. `bun test server/builder/` green.
- `/audit` shows the migration as a recorded action.

**Dashboard reveal**: Pass rows display `completion %` and `failure class`. Run rows display plan progress bar.

**Risk / open**: Adapters that don't reliably honor "write this JSON file before exit" — particularly Claude Code via subscription, which has its own session retention. Mitigation: a `post-exit` hook in the pass wrapper script that synthesizes a PASS_RESULT from stdout if one wasn't written.

---

### Month 2 — Tracing, Audit Hash-Chain, UI Reveal

**Theme**: Every action is traceable to a span; every mutation is anchored to an immutable chain.
**Why now**: The pillars (Builder/Gateway/Governance) only cohere if they share a trace id and an audit substrate. We also owe the operator the UI overhaul from `BUILDER_EXCELLENCE_PLAN.md` Parts III, V.

**Deliverables**:
- **Trace bus**: a tiny in-process tracer (no OTel dependency yet) emitting JSONL spans. Span keys: `trace_id`, `span_id`, `parent_span_id`, `kind` (`run`/`pass`/`tool`/`gateway`/`validation`), `start_ms`, `end_ms`, `attrs`, `status`. Persisted to `/var/lib/control-surface/traces/YYYY-MM-DD/`.
- **Trace explorer UI**: a `/traces` route — span timeline, drill into a single trace, copy-as-curl for replays.
- **Audit hash chain**: each `audit_log` row stores `prev_hash` and `row_hash = sha256(prev_hash || row_payload)`. Daily anchor: log the head hash to `/opt/ai-vault/audit/YYYY-MM-DD-anchor.json`.
- **BuilderPage UI overhaul** (Parts III + V of EXCELLENCE plan): `RunAnalyticsCard`, expandable `PassDetailPanel`, `FailureInvestigationPanel`, `SessionSummaryCard`, `PlanProgressWidget`, `Next Steps from Plan` panel, live SSE pass output panel.
- **AuditPage UI**: existing page upgraded to show hash chain status + verifier button.

**Code touchpoints**:
- New: `server/tracing/tracer.ts`, `server/tracing/exporter.ts`, `app/routes/TracePage.tsx`.
- New: `server/db/audit/chain.ts` with `appendAudit()`, `verifyChain()`.
- Updated: every `writeActionAudit()` caller routes through the chain helper.
- Updated: `app/routes/BuilderPage.tsx`, `app/routes/AuditPage.tsx`.

**Exit criteria**:
- A failed pass on a workflow run produces a trace that, when opened in the explorer, shows: workflow trigger → pass spawn → tool calls → gateway calls → exit reason — end to end.
- `verifyChain()` over the past 30 days returns OK; an intentional row tamper (in a test DB) is detected.
- Operator can identify, click, and re-trigger a single failed pass from the UI without leaving the browser.

**Dashboard reveal**: `/traces` route is live. Run detail page has analytics card, plan progress bar, expandable pass rows, failure diagnosis panel. Audit page shows hash chain head + verifier badge.

**Risk / open**: Trace storage growth. Mitigation: TTL policy in M4 (governance); for now we cap per-day file size and rotate.

---

### Month 3 — Gateway Foundation: the SuperRouter

**Theme**: Own the routing layer that LiteLLM gives us today, so we can attach policy, ledger, and circuit breakers directly to it.
**Why now**: Every other pillar (governance budgets, audit per-call cost, builder model selection, AI reasoner) needs a single chokepoint we control. LiteLLM is a great forcing function; we will keep it usable as a sidecar while migrating consumers to the new gateway.

**Deliverables**:
- **Provider adapters** with a uniform interface: `OpenAICompatibleAdapter`, `AnthropicAdapter`, `GoogleGeminiAdapter`. Each implements `complete()`, `stream()`, `embed()`, `models()`, `health()`.
- **Concrete providers** (built on those adapters): Ollama, vLLM, llama.cpp, OpenRouter, GitHub Models, Anthropic API, OpenAI API, Google Gemini, Together, Fireworks.
- **Router** that resolves a logical model name (`editorial-heavy`, `coding-fast`, etc.) to a provider + backend through a versioned config file. Fallback chains, sticky routing per-trace, and exponential backoff on circuit-broken providers.
- **Gateway ledger**: every call writes a `gateway_calls` row with model, tokens (prompt/completion), latency, cost estimate, success, error class, trace_id.
- **Health probe**: replaces / wraps `model-health-check.timer`. Runs every 15 min by default. Probes are configurable per-provider (latency target, prompt template, cost gate).
- **Public surface**: `POST /v1/chat/completions`, `POST /v1/embeddings`, `GET /v1/models` — OpenAI-compatible. (Drop-in replacement for LiteLLM for our own callers.)
- **Internal SDK**: `gatewayClient.complete({...})` used by builder runner, AI reasoner, autopipeline, NewsBites editorial.

**Code touchpoints**:
- New module: `server/gateway/` with `router.ts`, `adapters/`, `ledger.ts`, `health.ts`, `config.ts`, `httpServer.ts`.
- Updated: `server/builder/modelSelector.ts` calls the new gateway client.
- Migration plan for `/etc/litellm/config.yaml` → `/etc/tib-builder/gateway.yaml` (kept compatible-by-name).

**Exit criteria**:
- The builder runner makes 100% of its model calls through the new gateway (verified via `gateway_calls` table).
- A forced-down provider (firewall block in test) trips the circuit breaker within 60s and traffic moves to the next chain entry.
- LiteLLM at :4000 still works (for backwards compatibility with the editorial autopipeline); we have a 30-day timeline to migrate that too.
- A full day's call ledger reconciles within 5% of OpenRouter / Anthropic / OpenAI billed usage.

**Dashboard reveal**: New `/gateway` page (or `/models` rebuild): real-time routing strip, provider health board, per-call ledger with filter, cost-per-model card, "force this model for next call" override button.

**Risk / open**: Cost estimation accuracy. Mitigation: store both `cost_estimate_local` (computed from token counts + posted price) and `cost_reported_provider` (filled in nightly via provider usage API where available).

---

### Month 4 — Governance Plane v1: Policy, RBAC, Secrets

**Theme**: Lock down what runs, who can run it, and what credentials it uses.
**Why now**: Without this we cannot let anyone but us touch the system. It also unblocks the multi-tenancy work in M7.

**Deliverables**:
- **Policies-as-code**: YAML/JSON policy documents attached to workflows. Policy language is intentionally narrow (think Kubernetes admission, not OPA): `allow`/`deny` rules over a typed event (`action.execute`, `workflow.run`, `gateway.call`, `secret.read`).

  ```yaml
  # /etc/tib-builder/policies/default.yaml
  rules:
    - name: deny-paid-models-on-staging
      match: { event: gateway.call, project.env: staging }
      condition: model.tier == "paid"
      effect: deny
      reason: "Paid models disallowed on staging projects"
    - name: require-approval-prod-deploy
      match: { event: action.execute, action.id: "newsbites.deploy" }
      effect: require_approval
      approvers: ["marouane"]
  ```
- **RBAC**: roles `owner`, `operator`, `auditor`, `viewer`. Role bindings per tenant and per project. Operator can run workflows on assigned projects. Auditor is read-only but sees everything including secrets metadata (not values).
- **Secrets vault**: an encrypted-at-rest store using a KEK derived from a host key file (`/etc/tib-builder/master.key`, mode 0600). DEK-per-secret pattern. Secrets exposed to passes via env vars at spawn time; never persisted in run dirs; never printed in stdout (lightweight redaction filter on the pass log writer).
- **Approval gates**: workflows tagged `requires_approval: true` pause at start. A push notification + dashboard banner asks the assigned approver. Inline approve/reject in the dashboard.
- **Budget caps**: per-tenant and per-project hard caps on gateway spend per day/month. Soft warn at 80%, hard stop at 100%.
- **Retention policies**: configurable TTL on traces, run-dirs, artifacts. Default: traces 30 days, run-dirs 90 days, audit log forever.

**Code touchpoints**:
- New module: `server/governance/` with `policy.ts`, `rbac.ts`, `secrets.ts`, `approvals.ts`, `budgets.ts`, `retention.ts`.
- Every mutating BFF endpoint passes through `policy.evaluate(eventCtx)` before executing.
- New routes: `/policies`, `/secrets`, `/approvals`, `/budgets`.

**Exit criteria**:
- A workflow created against a project tagged "prod" cannot kick off without operator approval (in test).
- A second operator account, bound to `viewer`, sees the dashboard but cannot click any action button.
- A secret stored via UI shows up in pass env at runtime but is redacted in stdout artifacts.
- A budget overshoot in test halts gateway calls within 30s of crossing the cap.

**Dashboard reveal**: `/policies`, `/secrets`, `/approvals`, `/budgets` are live. Every action button now shows a `[policy: allow]` chip; denied actions show the rule that blocked them.

**Risk / open**: Policy expressiveness. Mitigation: start narrow; the policy engine is a small CEL-like evaluator over a flat event object. We commit to *not* shipping OPA/Rego level expressiveness in v1 — the docs explicitly say "if you need more, write a custom adapter."

---

### Month 5 — AI-Assisted Diagnosis: the Reasoner

**Theme**: Use an LLM to read traces and produce incidents, root-cause narratives, and suggested fixes.
**Why now**: We will have produced 60–90 days of structured traces and analytics by M5. That's enough signal for an LLM to be useful instead of hallucinatory.

**Deliverables**:
- **Reasoner agent**: a background service that subscribes to the event bus and, on every failed pass or anomalous gateway call, queues a diagnosis job.
- **Diagnosis prompt template**: structured input = `{traceSpans, passAnalytics, planExcerpt, lastStdoutTail, validationResults}`; structured output = `{rootCauseHypothesis, evidence, suggestedActions[]}`. Output validated against a JSON schema; bad outputs trigger one retry with a stricter prompt.
- **Failure clustering**: each diagnosis produces an embedding of `{failure_class, root_cause_hypothesis, last_error_message}`. We use `sqlite-vss` to cluster diagnoses across runs. Identical recurring failures collapse to a single `incident` with a count and a "this has happened N times" badge.
- **Playbooks**: for known incident patterns we curate (or LLM-generate, then human-approve) a playbook. Each playbook is a sequence of suggested actions tied to existing action IDs (`retry-narrow`, `bump-context-budget`, `force-model`, `pause-workflow`, etc.).
- **Auto-remediation (opt-in)**: workflows can opt in to `auto_apply_safe_playbooks: true`. The reasoner can then trigger `retry-narrow` automatically if the playbook is marked `safe`. Every auto-application is audited and gated by policy.
- **Incident UI**: `/incidents` page upgrade — cluster view, drill into representative trace, see playbook, accept/reject.

**Code touchpoints**:
- New module: `server/reasoner/` — `agent.ts`, `prompts/`, `embeddings.ts`, `clustering.ts`, `playbooks.ts`.
- Schema additions: `incidents`, `incident_members`, `playbooks`, `playbook_runs`, `embeddings_vss`.
- New route: `/incidents` is rebuilt; existing one becomes the legacy view.

**Exit criteria**:
- Over a one-week test, the reasoner correctly classifies ≥80% of failed builder passes into one of: `agent-stalled-exploration`, `pass-timeout-large-plan`, `gateway-circuit-open`, `validation-flaky`, `dependency-missing`.
- The top-3 most-common incident clusters each have a playbook attached.
- Safe auto-remediation, when enabled in a non-prod workflow, resolves at least half of recurring `agent-stalled-exploration` cases without human action.

**Dashboard reveal**: New incidents view: clustered cards, "happens X times", "suggested action: Y", "auto-applied: Z times". A reasoner status strip on the home page.

**Risk / open**: Hallucinated diagnoses. Mitigation: never trust the reasoner above a human; UI labels every diagnosis "AI hypothesis"; require explicit operator click to apply non-safe playbook actions.

---

### Month 6 — Orchestration Excellence: Durable Workflow Engine

**Theme**: Replace the ad-hoc pass loop with a real workflow engine — workflow definitions, deterministic resume, signals, timers, child workflows.
**Why now**: Today's `runner.ts` is a procedural loop with implicit state. To grow into multi-tenant, long-running, replayable workloads we need explicit workflow semantics. This is also the foundation for selling "scheduled, durable AI pipelines" as a feature rather than a happy accident.

**Deliverables**:
- **Workflow definitions as code**: TypeScript files in `/etc/tib-builder/workflows/*.ts` (or marketplace-installed). A workflow is a generator function that emits step requests (`spawnPass`, `runValidation`, `waitFor`, `signal`, `child`) — each step is durable, idempotent, and replayable from history.
  ```ts
  export const buildUntilDone: WorkflowDef = function* (ctx) {
    yield ctx.runDoctor();
    let pass = 1;
    while (pass <= ctx.config.maxPasses) {
      const result = yield ctx.spawnPass({ sequence: pass });
      if (result.status === "complete") break;
      if (result.status === "blocked") yield ctx.pauseForApproval(result.blockers);
      pass++;
    }
    yield ctx.runFinalValidation();
    yield ctx.logToVault();
  };
  ```
- **History store**: every step request + outcome appended to `workflow_history` (one row per step). Resume = replay history through the generator until we hit an unfinished step.
- **Concurrency lanes**: per-tenant lane budgets. e.g. tenant `mimule` has 3 concurrent passes max; the engine queues over that.
- **Signals & timers**: workflows can wait on external signals (`webhook`, `userApproval`, `scheduledTime`). Timers survive daemon restarts.
- **Child workflows**: a pass can spawn a child workflow (e.g. doctor review = a child workflow with its own history).
- **Cancellation tokens**: cancellation is cooperative — engine sets a flag, the running pass adapter reads it on its next loop iteration and exits gracefully, writing a `PASS_RESULT.status: cancelled`.

**Code touchpoints**:
- New module: `server/orchestrator/` — `engine.ts`, `history.ts`, `signals.ts`, `lanes.ts`, `definitions.ts`.
- `server/builder/runner.ts` shrinks dramatically — most logic moves into a single `buildUntilDoneWorkflow` definition. Runner becomes the *adapter* between the engine and tmux.

**Exit criteria**:
- Kill the `tib-builder` daemon mid-pass. Restart. Workflow resumes at the next step without reprocessing completed work.
- A scheduled workflow with `every 2h` fires reliably over a 24h test, regardless of two intentional daemon restarts in that window.
- A signal-driven workflow (waits for a webhook) sits idle for 10 hours then resumes within 5s of the webhook arriving.
- The historical builder runs from M1–M5 are still readable / replayable through the new engine (back-compat shim).

**Dashboard reveal**: `/workflows` view shows workflow definitions, instances, and history. Replay button on a completed run. Manual signal injector in the UI for blocked workflows.

**Risk / open**: Determinism in TypeScript generators is fragile (any non-deterministic API call inside the generator breaks replay). Mitigation: lint rule + runtime guard — any IO inside the generator body without going through `ctx.*` throws and is treated as a developer bug, not a runtime failure.

---

### Month 7 — Multi-Project, Multi-Tenant, Project Aware

**Theme**: From "Marouane's one VPS" to "N tenants × M projects, isolated."
**Why now**: This is the prerequisite for closed beta. We can't ship before we can isolate.

**Deliverables**:
- **Tenant model**: `tenant_id` flows through every table, every BFF endpoint, every event, every span. Cross-tenant reads are impossible at the data layer (per-tenant connection scoping).
- **Projects**: a project is a (repo, language, validators, default model roster, default policies) bundle. Project switcher in the UI. Each project gets its own run-dir tree, its own secrets, its own budget.
- **Project detector**: heuristics that look at the repo and propose a project config (lock file → language, framework, validator commands). Operator confirms.
- **Cross-project workflows**: a workflow can target one or more projects (e.g. `update-deps-everywhere`).
- **Resource isolation**: each tenant gets a separate tmux server (`tmux -L tib-<tenant>`) so a runaway pass cannot bleed into another tenant's namespace.
- **Per-tenant Gateway view**: keys, budgets, ledger, all scoped.

**Code touchpoints**:
- DB migration: every relevant table gains `tenant_id`. Composite indexes updated. Migration is online-safe (writes go to new schema; reads fall back).
- BFF middleware adds `tenant_context` to every request, derived from the OIDC subject or API key.
- UI adds tenant + project selectors to the global topbar.

**Exit criteria**:
- Test fixture with 3 tenants × 2 projects each = 6 isolated namespaces. A workflow in tenant A cannot read traces, secrets, or audit rows of tenant B (attempted via direct API calls and confirmed by tests).
- A single operator account belonging to two tenants can switch context without re-logging.
- MIMULE's existing data is migrated to `tenant_id = "mimule"` and operates identically.

**Dashboard reveal**: Tenant switcher + project switcher in the UI topbar. `/projects` page. All data scoped accordingly.

**Risk / open**: Migration regressions on the live MIMULE data. Mitigation: dry-run migration on a snapshot DB first; keep MIMULE on the old schema until we're sure the new path works for at least 72h.

---

### Month 8 — Distribution v1: Single-Binary Portable Edition

**Theme**: Compile the platform. Ship it as a binary. Install in 60 seconds on any Ubuntu/Debian box.
**Why now**: The whole "sellable" thesis depends on this. Without a clean install story we have nothing to put in front of design partners.

**Deliverables**:
- **Compile path**: the server is split into:
  - Hot path (gateway, orchestrator, runner glue, governance evaluator) — written in TypeScript today; we evaluate at the start of the quarter whether to:
    - (a) ship via `bun build --compile --target=bun-linux-x64` for a self-contained JS binary, or
    - (b) port the hot path to Go (smaller binary, no Bun runtime dependency, faster cold start).
  - **Recommendation pending benchmark**: start with (a); plan port in M11 if needed.
  - UI: pre-bundled static assets embedded in the binary via `embed` (Go) or a tar resource (Bun).
- **Installer**: `curl https://get.tib-builder.dev | sh` (or similar) — downloads the binary, generates a host key, writes a systemd unit, creates `/var/lib/tib-builder`, opens the install wizard at `:3000`.
- **Docker bundle**: alternative for customers who prefer containers. Single `Dockerfile`, single image, `docker compose up`.
- **Air-gapped install**: a tarball with binary + bundled assets + offline marketplace mirror. Documented procedure for installing on a host without internet.
- **Update channel**: signed releases via cosign/sigstore; daemon checks for updates daily; operator clicks "install" in the UI.
- **Funnel-back**: optional `funnel_to: control.techinsiderbytes.com` config that registers the install with a central dashboard. **The local install is always fully functional standalone**; funnel is purely additive.

**Code touchpoints**:
- New repo (or top-level dir) `cmd/tib-builder/` if we go the Go route.
- `Makefile` / `build.ts` orchestrates: `bun run build:ui && bun build --compile server/main.ts`.
- New `installer/` directory with `install.sh`, `systemd/tib-builder.service`, `docker/Dockerfile`, `docker/compose.yaml`.

**Exit criteria**:
- A fresh Hetzner CX21 VPS, blank Ubuntu 24.04, no Bun installed: `curl | sh` and the dashboard is reachable on `:3000` within 90 seconds.
- The same install starts a builder run against a sample repo and completes one pass end-to-end, using only the operator's OpenRouter key.
- The same install starts a builder run with only Ollama configured (no internet), and completes a small pass.
- Binary size < 80MB (target 50MB).

**Dashboard reveal**: Installation wizard. "About / Version" panel with update channel.

**Risk / open**: Bun's `--compile` maturity for our dependency tree (sqlite native bindings, sharp, etc.). Mitigation: spike in M7 sprint slack; fall back to a slim Node + bundled assets if blocking.

---

### Month 9 — Marketplace + Extensibility (Skills, Adapters, Validators)

**Theme**: Let users and us extend the platform without forking it.
**Why now**: This unlocks community + customer customization, and it's the right time to do it: by M9 the core abstractions are stable.

**Deliverables**:
- **Skill manifest**: `skill.yaml` with `name`, `version`, `description`, `inputs` (schema), `outputs` (schema), `entrypoint` (script or workflow definition), `permissions` (which actions/policy events it needs).
- **Adapter SDK**: a small TypeScript (and Go-host) SDK to write:
  - Provider adapters (a new model backend).
  - Agent adapters (a new CLI like Cline or Aider).
  - Validator adapters (`elixir` typecheck, `terraform plan` validator, etc.).
  - Notification sinks (Slack, Discord, custom webhook).
- **Bundle format**: skills/adapters ship as signed tarballs with `manifest.yaml` + binary/JS source. Hash-pinned in `marketplace_skills` table.
- **Marketplace UI**: `/marketplace` route — browse, install, update, uninstall.
- **Internal marketplace**: a tenant can publish private skills visible only to their org.
- **Versioning + upgrade**: pinned versions per workflow; UI shows "upgrade available, changelog: …".
- **Sandboxing (light v1)**: skills run with explicit permissions; without `policy.execute_action`, a skill cannot call into core actions.

**Code touchpoints**:
- New module: `server/marketplace/` — `registry.ts`, `loader.ts`, `manifest.ts`, `signer.ts`.
- New `sdk/` directory with `@tib-builder/sdk` published to npm.
- `app/routes/MarketplacePage.tsx`.

**Exit criteria**:
- A third-party-style adapter (we author it, but treat it as third-party) installs cleanly, declares its permissions, and runs a workflow without modifying core code.
- A signed bundle whose signature fails verification is refused install with a clear error.
- A skill that exceeds its declared permissions is denied by policy at runtime.

**Dashboard reveal**: Marketplace browsing. Installed extensions list. Upgrade prompts.

**Risk / open**: Sandbox depth. We are *not* shipping a hard sandbox in v1 (no firejail/nsjail). Permissions are policy-checked but a malicious skill can still misuse what it's allowed to do. We document this clearly: install only signed bundles from trusted publishers.

---

### Month 10 — Compliance + Enterprise Readiness

**Theme**: Make the platform safe to install inside companies that have a compliance team.
**Why now**: Enterprise sales conversations start in Q4 and they ask these questions first.

**Deliverables**:
- **SSO via OIDC**: out-of-the-box integration with Keycloak, Azure AD, Okta, Google Workspace. Group → role mapping configurable.
- **mTLS option** between control plane and remote agent workers (M7 enabled the agent worker concept; M10 secures the channel).
- **4-eyes approvals**: workflows tagged `requires_two_approvers: true` can't proceed until two distinct operators approve.
- **Audit retention + export**: configurable retention; nightly export to S3-compatible storage (optional); on-demand export to JSONL with hash chain attestation.
- **Compliance reports**: pre-built report templates — "all gateway calls in date range", "all denied actions", "all secret accesses", "audit chain verifier", "user activity per tenant". Exportable to CSV/PDF.
- **Data residency**: configurable storage roots per-tenant (so an EU customer can keep all data on EU volumes).
- **DPA / SOC2 prep**: legal templates (Data Processing Agreement, Subprocessor list), control mapping doc (which feature maps to which SOC2 control). Not the audit itself — that's a year-2 task — but the artifacts a customer's compliance team will ask for.

**Code touchpoints**:
- New module: `server/sso/` — `oidc.ts`, `mappers.ts`, `mtls.ts`.
- `server/governance/audit/export.ts`, `server/reporting/` with template files.
- Documentation site (M12) lands first compliance pages.

**Exit criteria**:
- A test Keycloak realm with two groups (`tib-operators`, `tib-viewers`) successfully drives RBAC on a fresh install.
- A 4-eyes-required workflow refuses to start with only one approval.
- Audit export of a 30-day window produces a JSONL that verifies clean.

**Dashboard reveal**: SSO login flow. `/compliance` page with reports. Tenant settings: `data_residency_region`.

**Risk / open**: Real SOC2 audit takes 6+ months and external auditors. We're producing artifacts, not certifications. Roadmap year-2: pursue an actual SOC2 Type I.

---

### Month 11 — Productization: Pricing, Telemetry, Onboarding, Cloud Tier

**Theme**: Turn the install into a product with a price and a learning path.
**Why now**: We need to convert design partners into paying customers in M12, and that requires the commercial machinery.

**Deliverables**:
- **Pricing tiers** (proposal — to validate with design partners):
  - **Solo (free, self-host)**: 1 tenant, 1 operator, full features, opt-in telemetry, community support.
  - **Team ($X/seat/month, self-host)**: unlimited tenants/projects, SSO, support SLA.
  - **Enterprise (custom, self-host)**: 4-eyes, data residency, audit export, named support, on-prem upgrade pipeline.
  - **Cloud (managed, $Y/seat/month)**: same product, hosted by us, isolated per-customer namespaces, no install required.
- **License key system**: tier features are gated by a signed license file. Solo is unlicensed by default. Team/Enterprise install a key. Offline-friendly (no phone-home requirement).
- **Telemetry (opt-in)**: anonymized failure types, version, feature usage. Never traces, never code, never plan text. Operator sees exactly what would be sent before opting in.
- **Onboarding wizard**: detects the host, asks one question at a time (provider keys, projects, default model roster, first plan), seeds a sample workflow.
- **Golden-path tutorials**: 5 tutorials covering: "first builder run", "scheduled doctor", "policy + approval", "custom validator", "publishing a skill".
- **Cloud tier (lite v1)**: a hosted instance of the same binary per customer, terraformed on Hetzner/Fly/Railway. Same UX, just we operate it.

**Code touchpoints**:
- `server/licensing/` — key verification, feature gates.
- `server/telemetry/` — opt-in event shipping.
- `app/routes/OnboardingPage.tsx`, `app/routes/SettingsPage.tsx` (license panel).
- `infra/cloud-tier/` Terraform + ansible for the managed offering.

**Exit criteria**:
- A new tenant onboarded via the wizard runs their first successful workflow in < 10 minutes.
- The cloud tier provisions a fresh customer instance in < 5 minutes.
- License verification works offline (the binary doesn't need internet to honor a Team license).
- Telemetry payload reviewed line-by-line — confirmed no sensitive content shipped.

**Dashboard reveal**: Onboarding wizard. Settings page shows license tier, telemetry toggle, included features.

**Risk / open**: Pricing model. We will validate during M9–M10 closed beta. Above numbers are placeholders.

---

### Month 12 — GA: Docs, Case Studies, Launch

**Theme**: Ship v1.0. Stable APIs. Public docs. First paying customers.
**Why now**: This is the launch month. Everything before serves this.

**Deliverables**:
- **API stability commitment**: `/v1/*` HTTP surfaces frozen until v2. SDK semver. Workflow definition format frozen with a documented migration path for breaking changes.
- **Docs site**: `docs.tib-builder.dev` (or chosen domain) with:
  - Quickstart (5 min)
  - Concept guides (Builder, Gateway, Governance, Reasoner)
  - Reference (API, CLI, workflow def format, skill manifest)
  - Operational guides (backup/restore, upgrade, troubleshooting)
  - Compliance docs (DPA, security overview, control mapping)
- **Case studies** from internal MIMULE use: NewsBites V4 build, TIB Markets buildout, control-surface itself bootstrapping itself.
- **5 design partners → 2–3 first paying customers** (Team tier).
- **Public launch announcement**: blog post, HN, video walkthrough.
- **Embedded vs standalone parity check**: every feature works the same when the platform is embedded inside the MIMULE dashboard *and* when installed standalone. No "MIMULE-only" leaks remain.
- **Continuity plan**: clear policy for backwards compatibility, deprecation, and support windows.

**Code touchpoints**:
- `docs/` directory backing the static site (Astro or Docusaurus).
- `examples/` directory with the sample workflows for tutorials.
- A final hardening sprint: review every error path; tighten rate limits; add one more layer of input validation at HTTP boundaries.

**Exit criteria**:
- Docs site live and searchable. Quickstart proved on a fresh box by an outsider (a design partner not us).
- At least 2 paying customers, billing infrastructure verified.
- v1.0.0 binary tagged, signed, published.
- MIMULE's own production continues to run on the new platform without a single user-visible regression for 30 consecutive days leading to launch.

**Dashboard reveal**: "v1.0" badge in topbar. New marketing landing inside the dashboard linking to docs.

**Risk / open**: Distraction from MIMULE editorial operations. Mitigation: maintain a parallel "editorial operator" track throughout the year — at least one half-day per week strictly on news production, separate from platform work.

---

## 5. Cross-Cutting Workstreams

Some work doesn't fit neatly in one month but threads through all of them. Each has an owner (always Marouane for now), a cadence, and a measurable proxy.

### 5.1 Continuous tactical fixes against today's stack
- Weekly: review the last 7 days of builder runs, file & fix top-3 failure patterns into the next month's deliverables.
- Weekly: review LiteLLM (then Gateway) call ledger, prune broken providers, add newly-discovered free ones.
- Weekly: append to `MIMULE_MASTER_PLAN_V3.md` and `/opt/ai-vault/daily/`.

### 5.2 Documentation pulled forward, not pushed back
- Every deliverable in M1–M11 includes "doc stub" as part of done. M12 reorganizes; it does not write from scratch.
- Every workflow / skill / adapter / policy concept gets a one-page concept doc in the same PR that introduces it.

### 5.3 Testing pyramid
- Unit tests for: gateway adapters, policy evaluator, orchestrator history replay, secrets vault.
- Integration tests for: full builder pass against a tiny fixture repo, gateway fallback chain, audit chain verifier.
- E2E tests (Playwright): builder UI, audit page, policy page, marketplace install flow.
- Daily fixture-based smoke run in CI (M8+): boots a fresh binary, runs a canonical workflow, asserts outcome.

### 5.4 Security review cadence
- Every month: skim `server/governance/` and `server/secrets/` for issues.
- M4, M7, M10: structured threat-model session with external review (engage a friend in security).
- Every release: signed binary; SBOM published.

### 5.5 Observability of ourselves
- The platform must dogfood its own observability: the `tib-builder` daemon itself emits traces, audit rows, and gateway calls about its own operation.
- Monthly review: are we using our own diagnosis surface? If not, why not — that's a UX failure.

### 5.6 Funnel-back stays intact
- Every standalone install can register with `control.techinsiderbytes.com` (operator-owned central dashboard) or a customer's own central dashboard.
- The funnel exchange is over signed events on a polling channel (no inbound NAT required from the install).
- All funnel data flows through the Gateway's own client SDK — same path, same audit, same policy enforcement.

---

## 6. Context-Size Strategy (Constraint C3 in depth)

This deserves its own section because it's the hardest engineering constraint and the most common reason agentic systems fail on real-world repos.

**Layered approach**:

1. **Model self-report** (M3): every provider adapter reports `effectiveContextWindow` and `recommendedInputBudget` (typically 60–70% of window to leave room for output).
2. **Plan slicing** (M2): the planner subagent in plan-mode produces a plan with explicit "section size" hints (small / medium / large). Sections are sized to fit the *smallest* model in the configured roster.
3. **Hierarchical summarization** (M5): every artifact (`PASS_RESULT.json`, vault log, doctor report) is summarized into a token-budgeted hand-off blob. The Reasoner is what produces these summaries.
4. **Semantic context budget** (M6): when assembling the next-pass prompt the orchestrator allocates a fixed token budget; sources (plan items, recent files, error traces, model briefing) are ranked by relevance and packed greedily.
5. **RAG over the run history** (M9 via marketplace skill): for very long plans, a vector index over past PASS_RESULTs supplies the "what did we already do" memory at retrieval time rather than dumping the full history.
6. **Adapter-level chunking** (M3, refined M8): files larger than half the budget are read as outlines first; full content is fetched only on demand.

**Tested model classes** (M12 must demonstrate working passes on at least one model from each class):
- Tiny local: 7B Q4 on consumer GPU, 8K context.
- Mid local: 32B Q4 on RTX 3090, 32K context.
- Cloud frontier: 1M-context Claude / Gemini / GPT.
- Cheap fast cloud: 200K-context OpenRouter free tiers.

---

## 7. Migration Strategy (current → target without breaking MIMULE)

**Principle**: nothing in `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, or `/etc/litellm` is removed until the replacement is proved.

| Today | Q1 path | Q2 path | Q3 path | Q4 path |
|---|---|---|---|---|
| `runner.ts` with implicit state | Add `PASS_RESULT` protocol + analytics | Convert to a workflow definition; keep `runner.ts` as adapter | Workflow engine drives all runs | Frozen for v1 |
| LiteLLM at :4000 | Keep; Gateway listens on :4100 | Migrate dashboard callers to Gateway | Migrate autopipeline callers | Decommission LiteLLM (or keep as compat) |
| `model-health-check.timer` | Keep | Replace internal probe with Gateway health module | Probes consume Gateway health | Decommission timer |
| `writeActionAudit()` direct writes | Add hash chain wrapper | All callers go through chain helper | Multi-tenant audit | Audit export, retention |
| `/opt/ai-vault/` markdown logs | Keep; add analytics block | Same | Same | Optional — vault keeps for human readability; structured truth is in DB |
| `/etc/litellm/config.yaml` | Keep | Mirror to `gateway.yaml` | Authoritative is Gateway | LiteLLM config removed (deprecation notice in M11) |
| Builder runs in tmux | Keep | Same | Same — but managed by orchestrator history | Same |

**Roll-forward only**: every migration step is reversible by reverting the migration commit and restoring DB from snapshot. Snapshots are taken automatically before any migration runs.

---

## 8. KPIs and How We Measure

Each quarter has measurable success criteria. We track them in a small `kpis` dashboard surface (M2 stub, M6 real).

### Q1 — Foundation
- ≥95% of builder passes produce a valid `PASS_RESULT.json`.
- Mean time to identify cause of a failed pass: < 60 seconds from dashboard (today: 10+ minutes, often unrecoverable).
- 100% of operator actions captured in audit chain; chain verifier green daily.
- Gateway: 100% of internal LLM calls flow through it; cost ledger reconciles within 5% of provider invoice.

### Q2 — Governance + Orchestration
- Policy: zero unaudited mutations. Zero denied-then-bypassed actions.
- Workflow engine: 99% of workflows resume cleanly across an intentional daemon restart.
- Reasoner: ≥80% accurate failure classification on labeled test set. ≥50% of recurring same-cause failures auto-remediated where safe.

### Q3 — Productization
- Fresh-install time-to-first-success: < 10 minutes on a blank Ubuntu host.
- Binary size: < 80MB.
- Marketplace: ≥10 first-party skills, ≥3 adapters published.
- 3 closed-beta tenants running real workloads daily.

### Q4 — GA
- Docs coverage: 100% of public API documented; quickstart proven by an outsider.
- 2 paying customers at GA.
- 30 days production uptime on MIMULE without rollback.
- Compliance artifacts (DPA, control map, SBOM) published.

---

## 9. Risks and Open Questions

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Single operator (Marouane) capacity | High | High | Plan written for sustainable pace; explicit "editorial track" carve-out each week; each month sized for ~3 effective weeks |
| R2 | Bun `--compile` immaturity | Medium | Medium | Spike in M7; fallback to slim Node + bundled assets |
| R3 | Provider API churn (Anthropic / Google / OpenAI breaking changes) | High | Low–Medium | Adapters isolate API surface; CI runs nightly probes; alerts on breakage |
| R4 | Policy engine becomes too complex | Medium | Medium | Documented narrowness; tests cover only declared expressiveness; "use a custom adapter" is the escape hatch |
| R5 | Reasoner hallucinations applied automatically | Medium | High | Auto-remediation default off; explicit `safe` tag required; audit every auto-apply |
| R6 | MIMULE production regression during migration | Medium | High | Reversible migrations; snapshot before each; parallel-run new vs old until 30 days clean |
| R7 | Distribution: nobody installs it | Medium | High | Closed-beta from M9; product-market-fit validation runs in parallel with build, not after |
| R8 | Cost overrun on cloud models during testing | Medium | Medium | Budgets enforced from M4; test workloads use free providers only by default |
| R9 | Sandboxing weakness exploited by malicious skill | Low (small audience) | High | Signed bundles only; explicit "trust this publisher" gate; document clearly |
| R10 | Multi-tenant data leakage | Low | Critical | Per-tenant DB connection scoping; integration tests dedicated to isolation; M10 third-party review |

**Open questions to resolve before M3**:
- Final commercial name (we use *MIMULE Builder Platform* internally; need a marketable name).
- Gateway HTTP port — :4100 (provisional). Confirm no conflict.
- License model — proprietary vs open-core. Strong lean toward open-core: core open under a permissive license, Enterprise features under a commercial license. Decision required by end of M2.

**Open questions to resolve before M7**:
- Hot path language. Stay on TypeScript+Bun, or port to Go? Benchmark mid-Q2.
- Cloud tier infrastructure (Hetzner Cloud, Fly, Railway, or self-hosted Kubernetes).

---

## 10. What "Done" Looks Like at Month 12

A fictional Tuesday in May 2027:

> Marouane wakes up. NewsBites overnight runs went green; the Reasoner already filed and auto-resolved two recurring `agent-stalled-exploration` cases in the editorial pipeline. He opens `control.techinsiderbytes.com` on his phone, sees three of his five design partners had production builder runs overnight, and one (an agency in Berlin) needs his attention because a policy denied a deploy until they ack a budget overrun. He clicks "approve & raise daily cap", which is gated by 4-eyes; his partner Carmen on the other timezone clicks the second approval; the workflow resumes from where it paused. None of this required SSH, none required logging into a customer's machine. The whole thing was visible, audited, and reversible.
>
> Meanwhile, a hobbyist in São Paulo runs the same binary on his home server with only Ollama configured, has never touched a cloud API, and is happily auto-building his side-project Rust game engine plan file by plan file.
>
> Both flows are the same product. One is paying $99/seat/month for the Team tier. The other is on the free Solo tier and might churn into Team next year. The audit logs of both run side-by-side in the central dashboard view we use to triage our own product, and neither customer can see the other.

That is the target. Everything in this plan should be in service of that scene.

---

## 11. Tracking and Append Protocol

This document is a living plan. Every meaningful work session adds an entry below. Also append (per the memory rule [[ai-vault-logging]]) to `/opt/ai-vault/daily/YYYY-MM-DD.md` and `/opt/ai-vault/builder-platform/YYYY-MM-DD.md`.

### Session Log

- 2026-05-15 — Plan created. Extends `BUILDER_EXCELLENCE_PLAN.md` (which becomes Month 1 in detail). Cross-linked from that file. Pillars defined: Builder + Gateway + Governance. 12-month roadmap drafted with monthly deliverables, exit criteria, dashboard reveals, risks. Hard constraints C1–C10 set. Reference architecture for Month-12 target sketched. Migration map for live MIMULE stack written. Open questions flagged: commercial name, Gateway port, license model, hot-path language, cloud tier infra.
