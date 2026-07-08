# Dashboard V2 Plan

Last updated: 2026-04-18 UTC
Owner: Marouane Defili
Scope: Planning only. No implementation in this phase.

---

## Purpose

Dashboard V2 should become the single operations surface for the MIMULE / TechInsiderBytes stack: one place to see what is running, what is failing, what is expensive, what is blocked, what is limited, and what can be acted on immediately.

The target experience is not "yet another admin panel". It is a live control room:

- the current state of both machines
- the editorial pipeline in motion
- the real model inventory and routing state
- Paperclip and channel activity
- cost, credits, quotas, and cooldown windows
- logs, failures, and recent incidents
- controls next to observability, not hidden in shell scripts

The standard is: if a critical stack question can be answered from the VPS, it should be answerable from Dashboard V2 in under 10 seconds.

---

## Verified Inputs

These facts were verified live on 2026-04-18 and should anchor the plan:

- `control-surface.service` is active and serves the current app from `/opt/opencode-control-surface`
- `opencode-server.service`, `litellm.service`, `newsbites.service`, `newsbites-autopipeline.service`, `cloudflared.service`, and `vast-tunnel.service` are active
- `model-health-check.timer` runs every 6 hours and `model-health-refresh.timer` runs every 15 minutes
- live dashboard-relevant state files already exist:
  - `/var/lib/mimule/model-health.json`
  - `/var/lib/mimule/pipeline-state.json`
  - `/var/lib/mimule/gpu-health.json`
- the older ops dashboard codebase still exists at `/opt/mimoun/projects/baba-mimoun-ops-dashboard`
- the current control surface app is intentionally narrow: OpenCode session management, not full-stack ops
- the old dashboard already had server-side readers for local system data and Vast account data

Inference:
- the best path is to converge on one canonical dashboard surface rather than keep parallel apps alive

---

## Product Goal

Dashboard V2 should answer five classes of questions well:

1. What is happening right now?
2. What is broken or degrading?
3. What changed recently and why?
4. What will fail next if nothing is done?
5. What action can I take right now without dropping to shell?

If the dashboard cannot help with one of those, it is incomplete.

---

## North Star

Dashboard V2 is the canonical "garage wall" for the stack:

- live status first
- actions beside the affected object
- strong historical context
- source-of-truth labeling on every metric
- explicit distinction between direct telemetry and inferred telemetry
- graceful degradation when one source is down

The dashboard should feel fast, dense, and operational, not like a marketing analytics product.

---

## Product Principles

- **One surface**: One canonical app for operations. No split-brain between old dashboard and current control surface.
- **Read-first, action-second**: Safe visibility everywhere; writes gated by explicit confirmation.
- **Direct over inferred**: If a metric comes from a provider API, label it direct. If derived from logs, label it inferred. If guessed, say guessed.
- **Current state plus history**: Every important widget needs both "now" and a recent trend window.
- **Useful failure handling**: A red state without evidence, likely cause, and next action is not enough.
- **Mobile-capable, desktop-optimized**: It must work on mobile, but the primary design target is a dense desktop control room.
- **No fake completeness**: If Claude/Codex hard-limit telemetry is not directly available, expose derived estimates and confidence, not invented precision.

---

## Recommendation: One Canonical App

Recommendation:

- keep `control.techinsiderbytes.com` as the canonical dashboard URL
- evolve `/opt/opencode-control-surface` into Dashboard V2
- salvage useful readers and page concepts from `/opt/mimoun/projects/baba-mimoun-ops-dashboard`
- retire the older dashboard as a code donor once parity is reached

Reasoning:

- the control surface is already live and operational
- the old dashboard has useful ops readers but is stale and split off from the current live surface
- one app avoids duplication in auth, navigation, and data collection
- the current control surface can become the "Operations + OpenCode" shell rather than remaining a narrow session tool

Alternative:

- rebuild on the old Next.js dashboard codebase

This is viable, but weaker unless there is a strong preference for Next.js over the currently deployed control-surface stack.

---

## Dashboard V2 Information Architecture

### 1. Command Center

The landing page. It should show the whole stack in one glance.

Primary blocks:

- global health strip
- critical alerts and incidents
- current pipeline run
- current model routing state
- Hetzner VM health
- Vast VM health
- pending Paperclip approvals/tasks
- recent Telegram / channel activity
- current provider limits / cooldown timers
- latest published stories

This page should answer: "Do I need to intervene right now?"

### 2. Pipeline

Full editorial operations view.

Must include:

- queue, current run, paused state
- stage-by-stage flow visualization
- per-story status and timings
- recent successes and recent failures
- story injection controls
- rush / retry / pause / resume / kill controls
- dossier links
- run logs and artifact links
- assignment origin: scout, manual inject, or retry

This page should answer: "What is the editorial factory doing?"

### 3. Models

Model inventory, routing, and quality.

Must include:

- currently available models by provider and capability
- free models detected in the last full discovery
- current fallback chains
- best cloud heavy / fast picks
- quality states: healthy, probation, degraded, blocked
- garbage-output incidents per model
- rate-limit / quota incidents per model
- cooldown timer where recoverable
- manual policy state: blocked, whitelisted, notes

This page should answer: "Which models can we trust right now, and why?"

### 4. Providers

Provider-level health and limits view.

Must include:

- OpenRouter, Groq, GitHub Models, Zen/OpenCode, Claude, Codex/OpenAI, Google if relevant
- current reachability
- last successful request
- last failure
- classified failure reasons
- inferred or direct quota/rate-limit state
- reset / cooldown estimates
- free-vs-paid inventory where known

This page should answer: "Is the provider failing, or is the model failing?"

### 5. Infrastructure

Full machine and service view across both VMs.

Must include for Hetzner and Vast separately:

- uptime
- CPU usage
- memory usage
- disk usage
- network status
- process/service health
- important ports and tunnels
- restart history if available

For Vast specifically:

- account balance and credits
- instance ID, rate, uptime
- GPU utilization
- GPU memory
- SSH/tunnel health
- Ollama model state

This page should answer: "Are the machines healthy enough to carry the workload?"

### 6. Paperclip

Operational visibility into agent work.

Must include:

- agent roster
- per-agent status, last run, last heartbeat
- current assignments
- pending approvals and tasks
- agent error history
- agent usage over time
- queue pressure by agent

This page should answer: "What are the Paperclip agents doing and where are they stuck?"

### 7. Sessions And Usage

Usage analytics across Codex, Claude, OpenCode, Mimule, and pipeline-related model traffic.

Must include:

- recent session history
- model usage by channel and by tool
- token or request usage where locally available
- estimated spend where meaningful
- hard-limit or soft-limit incidents detected from logs
- confidence label on every quota number

This page should answer: "How much are the tools being used, and are we approaching limits?"

### 8. Channels

Messaging and notification view.

Must include:

- Telegram inbound/outbound activity
- pending approval messages
- alert routing outcomes
- delivery failures
- morning brief status
- Paperclip notification status

This page should answer: "What did the system tell me, what did I tell it, and what failed to deliver?"

### 9. Logs And Incidents

Unified troubleshooting surface.

Must include:

- filtered logs by service, story, model, provider, or incident type
- error clustering
- incident timeline
- correlation links from a failed metric to its underlying logs
- "first seen / last seen / still happening" semantics

This page should answer: "What exactly broke, and where do I drill down?"

### 10. History And Analytics

Longer-view performance and trend layer.

Must include:

- stories per day
- success rate per stage
- mean and percentile durations per stage
- model win rates
- model failure rates
- provider availability over time
- publish volume by vertical
- deploy frequency

This page should answer: "What is improving or degrading over days and weeks?"

---

## Data Domains And Source Inventory

Dashboard V2 should be explicit about where each domain comes from.

### Editorial Pipeline

Primary sources:

- `/var/lib/mimule/pipeline-state.json`
- dossier directories under `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/`
- run artifacts under `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/runs/`
- autopipeline logs via `journalctl -u newsbites-autopipeline.service`
- NewsBites article content under `/opt/newsbites/content/articles/`

Key metrics:

- queue depth
- current stage
- stage durations
- run success / failure
- story volume by day and by vertical
- stuck dossiers
- manual injection / rush counts

### Models And Routing

Primary sources:

- `/var/lib/mimule/model-health.json`
- `/var/lib/mimule/model-quality.json`
- `/etc/mimule/model-policy.json`
- `/etc/litellm/config.yaml`
- LiteLLM logs
- model-health service logs

Key metrics:

- full discovery inventory
- quick-refresh availability
- fallback chains
- quality incidents
- blocklist / whitelist state
- rate-limit and quota incidents
- cooldown windows

### GPU And Vast

Primary sources:

- `/var/lib/mimule/gpu-health.json`
- Vast CLI and/or API
- Ollama `/api/tags` and `/api/ps` via the tunnel
- remote SSH sampler on Vast for full CPU / RAM / disk / GPU telemetry
- `vast-watchdog` and `vast-tunnel` logs

Key metrics:

- account balance
- hourly burn
- estimated runway
- instance health
- tunnel health
- GPU utilization
- GPU memory
- model load state
- remote CPU / RAM / disk

### Hetzner Host And Services

Primary sources:

- systemd state
- Docker socket
- `/proc` and standard host metrics
- current `status-report.js` logic

Key metrics:

- CPU, RAM, disk
- service status
- timer status
- container health
- restart count and last failure

### Paperclip

Primary sources:

- Paperclip API
- Paperclip DB if needed for deeper history
- notification scripts and action state files

Key metrics:

- agent status
- pending tasks
- approvals
- issue backlog
- per-agent throughput
- error rates

### Sessions, Costs, And Tool Usage

Primary sources:

- OpenClaw cost and provider state files under `/root/.openclaw/costs/`
- OpenClaw cron run logs
- OpenCode server session APIs
- local session logs where available
- gateway logs for rate-limit / quota signals

Key metrics:

- recent session usage
- provider cost estimates
- rate-limit incidents
- session durations
- activity by tool and channel

Constraint:

- direct Codex/Claude "remaining quota" telemetry may not be available
- the plan should therefore support three confidence levels:
  - `direct`
  - `derived`
  - `unknown`

### Channels

Primary sources:

- Telegram state files
- OpenClaw session/activity logs
- paperclip-action state files
- notification scripts

Key metrics:

- inbound / outbound message counts
- failed deliveries
- approval response time
- alert fatigue indicators

---

## Required New Telemetry

Some of the desired dashboard view is not fully collectible yet. Dashboard V2 should include a telemetry gap-closing phase.

### Vast VM Full Telemetry

Current state:

- we have balance, instance info, tunnel health, and some GPU health
- we do not yet have a complete, structured feed for remote CPU, RAM, disk, and GPU memory/utilization history

Plan:

- add a lightweight sampler on the Vast VM, or SSH-execute a bounded sampler from Hetzner
- normalize output into a local JSON snapshot and rolling history
- avoid Prometheus in phase 1 unless the simple sampler becomes too limiting

### Model Limit And Cooldown Ledger

Current state:

- we classify quality failures and availability failures
- we do not yet persist a first-class provider/model cooldown ledger

Plan:

- add a dashboard-facing `limits.json` or equivalent normalized store
- track:
  - provider
  - model
  - failure class
  - first seen
  - last seen
  - last success
  - estimated reset time
  - confidence
  - notes

This enables "OpenRouter likely resets tomorrow" style visibility without pretending to have an official timer when we do not.

### Historical Metrics Store

Current state:

- several sources expose current snapshots and some recent local history
- there is no unified historical store for cross-domain analytics

Plan:

- add a local time-series/event store for snapshots and incidents
- recommendation: SQLite first, not Prometheus/Grafana first
- keep raw snapshots small and derived rollups queryable

Reasoning:

- simpler operations
- easier backup
- fits the size of the stack
- enough for trend charts and incident timelines

---

## Proposed Architecture

Dashboard V2 should have three layers.

### 1. Collectors

Small readers that gather data from each source:

- host collector
- systemd collector
- docker collector
- pipeline collector
- model-routing collector
- provider-limit collector
- Paperclip collector
- OpenCode/session collector
- Vast collector
- channel collector

Collectors should be bounded and failure-tolerant. One bad source must not freeze the dashboard.

### 2. Normalized Ops Store

A local store for:

- latest snapshots
- rolling historical metrics
- incidents and state transitions
- derived views for the UI

Recommendation:

- SQLite under `/var/lib/mimule/dashboard/`
- snapshot tables plus incident/event tables
- one ingestion service updates it on short intervals

### 3. Dashboard Application

The UI plus backend-for-frontend.

Responsibilities:

- serve normalized APIs
- push live updates via SSE or WebSocket
- enforce access control
- expose safe controls with confirmation flows

---

## UI Strategy

The UI should feel like an operations console, not a conventional CRUD admin.

Design direction:

- strong desktop layout with a dense main canvas
- always-visible global status strip
- keyboard-friendly navigation
- fast filters and drilldowns
- timeline-driven incident views
- compact cards only where they carry meaningful signal
- explicit source/confidence badges

The ideal visual mood is "garage wall" rather than "dashboard template".

Examples of persistent chrome:

- environment badge
- current incident count
- active alerts
- queue size
- blocked model count
- Vast balance
- last successful deploy
- global search / command palette

---

## Controls To Include

The dashboard should not stay read-only forever. V2 should plan for safe actions.

### Pipeline Controls

- pause / resume autopipeline
- rush story
- kill story
- retry failed stage
- inject story
- trigger scout
- open dossier
- publish / deploy controls where appropriate

### Model Controls

- run quick refresh now
- run full discovery now
- block model
- whitelist model
- move model into probation or clear status
- inspect model incident history

### Infrastructure Controls

- restart service
- restart tunnel
- restart control surface
- reconcile Vast

### Paperclip Controls

- open issue
- open approval
- approve / request revision
- wake agent

Rule:

- destructive or state-changing actions must have explicit confirmation and audit logging

---

## API Plan

Dashboard V2 should expose normalized internal APIs rather than forcing the UI to read raw files directly.

Suggested endpoints:

- `/api/command-center`
- `/api/pipeline`
- `/api/pipeline/story/:slug`
- `/api/models`
- `/api/models/:modelId`
- `/api/providers`
- `/api/providers/:providerId`
- `/api/infra`
- `/api/infra/host/hetzner`
- `/api/infra/host/vast`
- `/api/paperclip`
- `/api/sessions`
- `/api/channels`
- `/api/incidents`
- `/api/history`
- `/api/actions/*`

Each response should include:

- `generatedAt`
- `sourceStatus`
- `confidence`
- partial-failure notes if any upstream source failed

---

## Metrics That Matter Most

If prioritization becomes necessary, these are the top-tier metrics.

### Tier 1

- autopipeline current run
- queue depth
- failed stories in last 24h
- model availability by capability
- blocked / degraded models
- provider cooldown states
- Vast balance and GPU state
- Hetzner RAM and service health
- pending Paperclip approvals/tasks
- failed notifications

### Tier 2

- per-stage p50 / p95 durations
- stories published per day
- best-performing models by success rate
- best-performing models by speed
- deploy frequency
- agent throughput and backlog

### Tier 3

- long-range trend analytics
- detailed cost attribution
- usage slices by tool/channel/user/session
- advanced anomaly detection

---

## History Layer

Dashboard V2 should not stop at snapshots. It needs memory.

Minimum retained histories:

- service up/down transitions
- model availability transitions
- model quality transitions
- provider limit incidents
- story lifecycle events
- deploy events
- approval turnaround times
- Vast credit and uptime history
- VM resource history

Target windows:

- 24h detailed
- 7d operational
- 30d trend

---

## Security And Access

Dashboard V2 will expose sensitive operational data and potentially dangerous controls.

Requirements:

- restrict access behind Cloudflare Zero Trust
- default to a single trusted operator
- keep read vs write permissions distinct if multi-user access is ever added
- audit every state-changing action
- do not expose secrets in UI payloads
- redact tokens and sensitive request bodies from logs

---

## Rollout Plan

### Phase 0: Plan Freeze And Scope Lock

- approve this plan
- choose the canonical codebase
- define success criteria and v1 cut line

### Phase 1: Unified Data Backbone

- create normalized collectors
- create ops store
- expose basic internal APIs
- wire live sources already available today

Success:

- one API can answer current command-center state without reading five unrelated files in the browser path

### Phase 2: Command Center And Infrastructure

- build landing page
- build Hetzner and Vast health panels
- build service/timer status panels
- build global alert strip

Success:

- one glance shows whether the stack is healthy

### Phase 3: Pipeline And Story Operations

- pipeline page
- story drilldown
- dossier and run links
- safe controls for queue operations and manual injection

Success:

- editorial operations can be supervised without shell-first workflows

### Phase 4: Models, Providers, And Limits

- model inventory page
- quality and blocklist page
- provider health page
- cooldown timer ledger

Success:

- free-model routing and provider failures become legible and actionable

### Phase 5: Paperclip, Channels, And Sessions

- Paperclip agent/approval views
- Telegram/channel activity views
- Codex/Claude/OpenCode usage panels with confidence labels

Success:

- operator can explain both AI work and human-facing messaging from one surface

### Phase 6: History, Incidents, And Polish

- incident timeline
- trend charts
- command palette
- saved filters
- mobile refinement
- UI polish toward the "garage wall" feel

Success:

- dashboard becomes the default way to supervise the stack

---

## Risks

- scope explosion: this can become three products if not kept centered on operations
- source inconsistency: some telemetry is direct, some inferred, some stale
- over-collection: polling too much can add load or create fragile integrations
- control risk: restarts and publish actions need explicit guardrails
- false precision: quota and reset timers are often inferred, not official
- dual-codebase drag: if the old dashboard and control surface both continue, velocity will drop

---

## Non-Goals For The First Implementation

- full general-purpose BI tooling
- multi-tenant permissions
- external SaaS observability stack unless clearly needed
- Prometheus/Grafana-first rollout
- replacing Telegram as the alert channel
- automating every shell action from day one

---

## Open Questions

- should Dashboard V2 also subsume OpenCode chat/session control in the same nav, or keep that area as a linked submode?
- should write actions be enabled immediately, or should the first release be read-mostly?
- do we want the historical store under SQLite only, or mirror important incident events into the AI vault as well?
- how much of the Vast telemetry should come from SSH sampling versus an always-on remote exporter?
- do we want per-story log retention beyond the existing run artifacts?

---

## Recommended First Build Slice

If the work starts immediately, the highest-value first slice is:

1. Command Center
2. Infrastructure
3. Pipeline
4. Models / Providers

That slice alone would already cover the highest operational pain:

- "is the stack healthy?"
- "what is the pipeline doing?"
- "which model/provider is failing?"
- "do I need to intervene right now?"

---

## Exit Criteria For Dashboard V2

Dashboard V2 is successful when all of the following are true:

- the dashboard becomes the default first stop before shell
- a failed story can be diagnosed from the UI
- a degraded model/provider can be identified from the UI
- Hetzner and Vast health are visible in the same surface
- Paperclip approvals and agent backlog are visible without separate tools
- the operator can see current limits, current risks, and immediate next actions

At that point, the dashboard is not decorative. It is operational infrastructure.
