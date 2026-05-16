# Dashboard V3 Plan

Last updated: 2026-05-05 UTC
Owner: Marouane Defili
Scope: Planning only. No implementation in this phase.
Predecessor: `/root/DASHBOARD_V2_PLAN.md` (IA, principles, source inventory — still load-bearing)
Canonical app path: `/opt/opencode-control-surface/` (extend, do not fork)
Public URL: `control.techinsiderbytes.com`

---

## What V3 changes vs V2

V2 was a complete information architecture for a desktop "garage wall" ops console. It is correct and stays the foundation. V3 layers three things on top of V2 that V2 did not commit to:

1. **Widget-first home** — the landing page is a single, scannable wall of widgets (statistics, sparklines, top-N, status pills). No tables, no logs, no walls of text on home. Tables and raw data live on detail pages.
2. **Detail pages by domain, not by data type** — every widget on home links to exactly one canonical detail page where the full table / log / drilldown lives. One way in, one way out.
3. **Explicit domain coverage for the five surfaces the operator actually thinks in**: **NewsBites**, **Autopipeline**, **Doctor**, **Auto Model Discovery**, **OpenCode**. Plus shared **Infra/GPU** because everything else depends on it. V2's "Pipeline / Models / Providers / Sessions / Channels / Logs" split cuts the same data differently — V3 prefers domain-shaped pages because that matches how the operator reasons.

V3 also commits the design pipeline that was open in V2: **Claude Design → component spec → "impeccable" skill for animation/polish**. The dashboard team is one operator with two AI tools; the plan must respect that.

V2 sections that carry over unchanged: **Product Principles**, **Data Domains And Source Inventory**, **Required New Telemetry** (Vast sampler, model limit ledger, historical SQLite store), **Security And Access**, **Risks**, **Non-Goals**. Read V2 for those — they are not duplicated here.

---

## Mobile posture

Stated preference: mobile is the operator's primary read surface; desktop is the secondary detail surface. But this is a soft preference — V3 does **not** invest in a separate mobile design pass. Instead:

- Home widgets use a 1-column stack on phones, 2–3 column grid on tablet, 4+ on desktop (CSS Grid `auto-fit minmax`, no breakpoints juggled by hand).
- Touch targets ≥ 44px on every actionable element.
- No hover-only affordances; everything important is visible without hover.
- Detail pages are allowed to be desktop-dense — the operator is fine reading a long table on a phone if they explicitly drilled in.
- "Mobile-first" does not mean "mobile-only" or "feature-parity on mobile". Pause/resume, queue inject, model block — all available on mobile. Bulk operations, log diving, raw JSON inspection — desktop is fine.

---

## Information architecture

```
/                        Home — widget wall (read-only summary)
/newsbites               Articles & site health detail
/autopipeline            Pipeline operations detail
/doctor                  Doctor history & decisions detail
/models                  Model inventory + discovery detail
/opencode                OpenCode session control (existing app — preserved)
/infra                   Hetzner + Vast + tunnels + services detail
/incidents               Cross-cutting incident timeline
```

Home shows widgets only. Every widget has:
- a **headline number or status pill**
- an optional **sparkline / micro-chart**
- a **caption** ("last 24h", "since 09:49 UTC", source label)
- a **deep-link** to the matching detail page anchor

No widget contains a scrollable table. If the data needs a table, the widget shows a top-3 / top-5 with a "see all →" link.

---

## Home widget catalog

Widgets are grouped by domain (visual order top-to-bottom on mobile, left-to-right reading on desktop). Each entry lists: **what it shows · data source · interaction**.

### Stack health strip (always pinned at top)

1. **Service health pill row** — 1 dot per critical service: newsbites, autopipeline, litellm, opencode-server, openclaw, paperclip, control-surface, vast-tunnel, cloudflared. Green/amber/red. · `systemctl is-active` via existing `server/adapters/system.ts` · tap → `/infra#services`
2. **GPU heartbeat** — status (up/down), GPU util %, current loaded models, last probe age. · `/var/lib/mimule/gpu-health.json` · tap → `/infra#gpu`
3. **Vast balance + runway** — $ remaining, hourly burn, est. days left, instance state. · `vast` CLI via existing `server/adapters/vast.ts` · tap → `/infra#vast`
4. **Hetzner pressure** — RAM %, disk %, load avg sparkline (5 min). · `system.ts` · tap → `/infra#hetzner`

### NewsBites

5. **Total articles published** — big number, +N today. · count `/opt/newsbites/content/articles/*.md` filtered by `status: published` · tap → `/newsbites`
6. **Publish rate (7d)** — bar chart, articles/day. · same source, grouped by `date` frontmatter · tap → `/newsbites#publish-rate`
7. **Vertical mix** — donut, top 6 verticals by count last 30d. · same · tap → `/newsbites#by-vertical`
8. **Latest published** — top 3 with thumbnail + vertical badge + relative time. · same · tap → article on news.techinsiderbytes.com (external)
9. **Site uptime + last deploy** — `news.techinsiderbytes.com` reachability + last `deploy.sh` timestamp. · HTTP probe + `git log -1` in `/opt/newsbites` · tap → `/newsbites#deploys`

### Autopipeline

10. **Queue depth** — big number, broken down by stage as a tiny stacked bar (scout / research / write / verify / publish-prep / publish). · `GET http://127.0.0.1:3200/queue` · tap → `/autopipeline#queue`
11. **Currently running story** — slug, stage, elapsed, model in use, progress bar of stage timeout. · same `/queue` payload + autopipeline `/stats` · tap → `/autopipeline#current`
12. **Approvals waiting** — count of items with `waitingApproval: true`, with the oldest age. · `/queue` · tap → `/autopipeline#approvals`
13. **24h throughput** — sparkline of stories completing per hour, p50/p95 stage duration. · derived from autopipeline `/stats` + dossier mtimes · tap → `/autopipeline#throughput`
14. **Auto-publish guard** — % of stories autopublishing vs requiring approval, by vertical. · derived from `pipeline-state.json` + frontmatter · tap → `/autopipeline#auto-publish`
15. **Pause state pill** — running / paused (with reason). One-tap action: pause/resume (with confirm). · `/queue.paused` + `POST /command` cmd=pause/resume · tap & confirm

### Doctor (auto-repair)

16. **Doctor activity (24h)** — count of repairs attempted, success rate. · `/var/lib/mimule/doctor-log.jsonl` filtered by ts · tap → `/doctor`
17. **Top error classes (24h)** — bar chart, top 5: `quality_garbage`, `transport_timeout`, `transport_provider_error`, etc. · same · tap → `/doctor#errors`
18. **Most-failing models (24h)** — top 3 models by doctor mentions. · same, group by `failedModel` · tap → `/doctor#models`
19. **Most-stuck stages (24h)** — top 3 stages by repair count. · same, group by `stage` · tap → `/doctor#stages`
20. **Doctor verdict mix** — donut: requeued / cooldown / abandoned / promoted. · same, group by `action` · tap → `/doctor#verdicts`

### Auto Model Discovery + Models

21. **Best models right now** — three pills: best-cloud-heavy, best-cloud-fast, best-local. · `model-health.json.bestCloudHeavy / bestCloudFast / bestLocal` · tap → `/models#current`
22. **Model availability by capability** — three counts: heavy / medium / light, with delta vs last full check. · `model-health.json.availableByCapability` · tap → `/models#by-capability`
23. **Quality summary** — pills: blocked N · degraded N · probation N. · `model-health.json.qualitySummary` · tap → `/models#quality`
24. **New free models discovered** — count from last full check, with names of the new ones. · `model-health.json.newModelsAdded` · tap → `/models#new`
25. **Last discovery age** — time since last full check; warn if > 6h. · `model-health.json.lastFullCheckAt` · tap → run-now action (with confirm)
26. **Cooldowns active** — count + soonest expiry. · `/var/lib/mimule/model-cooldowns.json` · tap → `/models#cooldowns`
27. **Provider reachability strip** — dots for OpenRouter, Groq, GitHub Models, Zen, Anthropic (claude_local — labelled exhausted), OpenAI (codex_local). · derived from `model-health.json.models[].provider` rollup · tap → `/models#providers`

### OpenCode

28. **Active session count** — number of currently-active OpenCode sessions, with token activity sparkline. · OpenCode SDK already wired in current app · tap → `/opencode`
29. **Last session** — title, model used, last activity. · same · tap → opens session in `/opencode`
30. **Open the chat** — single primary action card linking to the existing OpenCode session UI (the current control-surface app). · existing app · tap → `/opencode`

### Cross-cutting

31. **Active incidents** — count of unresolved incidents (anything red on the strip + recent doctor failures + provider outages). · derived · tap → `/incidents`
32. **Last 5 alerts** — compact list, one line each. · `/var/lib/mimule/pipeline-alerts.json` rollup · tap → `/incidents`

That's 32 widgets. Home renders them all but the operator can hide/reorder via local-storage preferences (V3.1 — not blocking for V3.0).

---

## Detail pages

Each detail page is allowed to be table-heavy and dense.

### `/newsbites`
- **Header**: total articles, last deploy, site reachability.
- **Charts**: publish rate 30d line, vertical mix donut, status mix (draft/approved/published), word-count distribution.
- **Tables**: all articles paginated, sortable by date/vertical/word-count/status; row → article preview drawer.
- **Actions**: trigger redeploy (with confirm).

### `/autopipeline`
- **Header**: queue depth, current story, paused state, fan-out config.
- **Charts**: stage funnel (count entering each stage today), p50/p95 duration per stage, stage-failure heatmap (stage × hour).
- **Tables**: full queue (sortable), recent completed stories with timings, stuck stories (`waitingApproval=true` or no progress > N min), approval queue.
- **Actions**: pause / resume / scout / inject by topic / inject by dossier path / rush / kill / publish (per-row, all confirm-gated). All map to existing `POST /command` payloads.

### `/doctor`
- **Header**: 24h repair count, success %, last decision.
- **Charts**: error class distribution, doctor verdict mix, repair attempts per story (cap distribution), model-failure heatmap (model × error_type).
- **Tables**: full doctor decision log (jsonl tail), with `slug`, `stage`, `errorType`, `failedModel`, `action`, `nextStage`, `cooldownMs`, `reason`. Filter by stage / errorType / failedModel.
- **Actions**: trigger doctor scan now (`POST /doctor/scan`), open referenced dossier.

### `/models`
- **Header**: best-of-three pills, last quick check age, last full check age.
- **Charts**: latency distribution by model, availability over time (per model line), quality state Sankey (probation→blocked, etc.).
- **Tables**:
  - **All models** — logical name, backend, provider, capability, available, latency, jsonOk, last error, quality state.
  - **Discovery log** — newModelsAdded history (needs a small ring-buffer addition to model-health-check, or read git history of model-health.json). Each entry: when discovered, name, provider, current state.
  - **Cooldowns** — model, started, expires, reason.
  - **Fallback chains** — current chain order from `model-health.json.fallbacks`, plus the static chain in CLAUDE.md for context.
- **Actions**: run quick check, run full discovery, block / unblock model, mark probation cleared. (Mutations write to `model-quality.json` and a new `model-policy.json` — V2 already lists this need.)

### `/opencode`
- The **existing control-surface app** unchanged: connection screen → sidebar → chat area. Routed under `/opencode/*`. The current root (`/`) becomes the dashboard home; the OpenCode UI lives under its own subtree.
- Add a thin breadcrumb back to home.

### `/infra`
- **Sections**: Hetzner host (CPU/RAM/disk/load + 24h sparklines), Vast host (account, instance, GPU util, GPU mem, ollama models), tunnels (cloudflared, vast-tunnel), services (systemd unit table), timers (every timer in CLAUDE.md with last-run, next-run, last-status).
- **Actions**: restart service (confirm-gated), restart tunnel, run model-health-check now, run mimule-backup now.

### `/incidents`
- Unified timeline merging: pipeline-alerts.json, doctor-log.jsonl (action=abandoned), service-down transitions, GPU-down transitions, provider-outage transitions.
- Filter by source / severity / time. Each row links to the specific detail page anchor where it originated.

---

## Data layer

**Already on disk, no new collection needed:**
- `/var/lib/mimule/model-health.json` — model inventory, discovery, ranking, quality summary, fallback chains
- `/var/lib/mimule/pipeline-state.json` — full queue + current story
- `/var/lib/mimule/gpu-health.json` — GPU tunnel + util
- `/var/lib/mimule/doctor-log.jsonl` — every doctor decision (already 17 MB — needs rotation or tail-only reader)
- `/var/lib/mimule/model-cooldowns.json` — model cooldowns
- `/var/lib/mimule/model-quality.json` — quality state per model
- `/var/lib/mimule/pipeline-alerts.json` — alert ledger
- `/var/lib/mimule/quality-rollup.json` — rolled-up quality snapshots
- `/opt/newsbites/content/articles/*.md` — frontmatter is the source of truth for site content
- autopipeline HTTP API at `:3200`: `/health`, `/stats`, `/queue`, `/doctor/log`, `/doctor/scan` (POST), `/command` (POST with cmd ∈ {queue, stats, pause, resume, scout, story, rush, kill, publish, doctor-scan, doctor-dispatch, doctor-log, gpu, latest, inject, add})
- OpenCode SDK already wired in current app
- `systemctl` + `journalctl` + `vast` CLI — existing `server/adapters/system.ts` and `server/adapters/vast.ts`

**Needs to be added (carry-forward from V2):**
- **Vast remote sampler** — bounded SSH-exec sampler for remote CPU/RAM/disk/GPU-mem; write to `/var/lib/mimule/vast-host.json`. Cron every 60s.
- **Model discovery history** — extend `model-health-check.mjs` to append each full-check `newModelsAdded` to a ring-buffer file `/var/lib/mimule/model-discovery-log.jsonl` so the discovery-history widget has a real source.
- **Historical store (SQLite)** — `/var/lib/mimule/dashboard.sqlite` for time-series snapshots (queue depth per minute, doctor counts per hour, model availability per check). Single ingestor service writes; backend reads. Required for the trend sparklines on home.
- **Doctor-log tail-reader** — server-side helper that reads only the last N MB of `doctor-log.jsonl` to keep page loads fast.
- **Backend-for-frontend** — new express/hono routes inside the existing control-surface server: `/api/home`, `/api/newsbites`, `/api/autopipeline`, `/api/doctor`, `/api/models`, `/api/infra`, `/api/incidents`. Each returns `{ generatedAt, sourceStatus, confidence, data }` per V2's API plan.

**Live updates:** SSE channel `/api/stream` pushes deltas (queue change, service flip, model state change). Home subscribes once on mount. Detail pages subscribe to the relevant slice only.

---

## Tech stack (what to add to the existing app)

The existing app is **Vite + React 19 + TypeScript + Tailwind 4 + Zustand + lucide-react + date-fns**, with a plain Node server side and SDK adapters under `server/adapters/`. Bun is the runtime.

What V3 adds:
- **Routing** — currently no router. Add `react-router` (or wouter for less weight). Routes listed above.
- **Charting** — `recharts` for bar/line/area/donut. Optional `@visx/sparkline` for the strip widgets — both work, recharts alone is enough. Pin one.
- **Server BFF** — small HTTP layer in `server/` that fronts adapters and returns the dashboard-shaped payloads. SSE for live updates.
- **SQLite** — `better-sqlite3` for the historical store. Read-only from the BFF; an ingestor cron (or a tick inside the BFF process) writes snapshots.
- **No state-management framework change** — Zustand stays for OpenCode session UI. Server state per page uses fetch + SWR-style cache (or `@tanstack/react-query` if we end up wanting mutations + cache invalidation across actions; lean toward react-query for the mutation flows).

What V3 does **not** add:
- No Next.js migration.
- No Prometheus / Grafana.
- No Storybook unless component count crosses ~30 (it will eventually, but not on the V3.0 cut line).
- No design-system library (Radix, MUI, shadcn). Tailwind 4 + small primitives is enough; the design pipeline below produces the visual layer.

---

## Design pipeline

This is the project-specific bit V2 left open.

1. **Claude Design** produces the visual treatment for each widget and page. Output: a static page (HTML or a React component file) showing the widget at desktop and mobile breakpoints with real-looking dummy data and the expected visual hierarchy. One artifact per widget on home, one per detail page.
2. **Component spec** — extract design tokens (colors, spacing, type scale, radii, shadows) into `app/globals.css` as CSS variables. Existing `globals.css` already has `--mono`, `--text-dim`, `--background-base`-style tokens; extend.
3. **`/impeccable` skill** does the animation pass: enter/exit transitions, sparkline tween, status-pill state changes, page transitions, list reordering, "running" ticker on the current-story widget. Animations should never be load-bearing — readable without motion.
4. **No emoji in UI**, no decorative icons that don't carry meaning. lucide-react is enough for functional iconography.
5. **Dark by default**, single theme. Light mode is deferred.

Visual tone target: **operations console**, not consumer dashboard. Dense, calm, monospaced for numbers, generous whitespace per widget, clear hierarchy. Color reserved for state (red/amber/green) and brand accent (the existing navy/amber from NewsBites if useful for cross-stack continuity).

---

## Build phases

**Phase 0 — Plan freeze.** Approve V3, decide router + charting library, scope the V3.0 cut line.

**Phase 1 — BFF skeleton.** New `server/api/` namespace. Implement `/api/home` reading model-health, gpu-health, pipeline-state, doctor-log tail. Manual smoke test: `curl /api/home | jq`.

**Phase 2 — Home page.** All 32 widgets rendered with real data. No charts yet — numbers and pills only. This is the first usable cut.

**Phase 3 — Charts + sparklines.** Add recharts. Wire bar/line/donut on home and detail pages. SQLite historical store comes online.

**Phase 4 — Detail pages.** `/autopipeline`, `/doctor`, `/models`, `/newsbites`, `/infra` in that order (operational pain ranking).

**Phase 5 — Actions.** All `POST` mutations: pause/resume, scout, inject, rush, kill, publish, run discovery, block model, restart service. Confirm modals + audit log.

**Phase 6 — OpenCode integration.** Move existing app under `/opencode/*` route. Add session-count widget on home reading from the OpenCode SDK.

**Phase 7 — Live updates.** SSE channel. Replace polling on the home page with push.

**Phase 8 — Polish.** `/impeccable` animation pass. Accessibility audit. Mobile QA on actual phone.

V3.0 cut line = end of Phase 4 (everything visible, no actions yet, polling-based). V3.1 = Phase 5–6. V3.2 = Phase 7–8.

---

## Open questions — RESOLVED 2026-05-05

1. **Router choice** — **wouter**. Install `wouter@^3`. Enough for this app; no nested loader patterns needed.
2. **Auth posture** — **Zero Trust only** for V3.0. Mutating endpoints add a signed `X-Operator-Token` header check in the BFF (token from env `OPERATOR_TOKEN`), so a rogue script can't POST without the token even inside the Cloudflare tunnel. No session management needed.
3. **Doctor-log retention** — **jsonl stays, tail-reader only**. Read the last 2 MB via the existing `tailJsonl` helper. Migrate to SQLite in V3.1 when the historical store is in place.
4. **Discovery history** — **extend `model-health-check.mjs`** to append to `/var/lib/mimule/model-discovery-log.jsonl` on each full check. Each entry: `{ ts, newModelsAdded: string[], totalModelCount }`. Ring-buffer: keep last 100 entries.
5. **OpenCode session telemetry** — **defer count widget to V3.1**. For V3.0 show a static "Open chat" action card only; active session count requires a persistence shim not worth building now.
6. **Vast remote sampler** — **SSH-exec cron** (matches `vast-watchdog` pattern). New systemd timer `vast-host-sampler.timer` runs `scripts/vast-host-sampler.sh` every 60s via `ssh -i /root/.ssh/vast_gpu root@209.146.116.50 -p 30583 "..."` and writes `/var/lib/mimule/vast-host.json`. Required for `/infra` Vast section. **Deferred to V3.1** — `/infra` Vast section shows "sampler not running" gracefully if file missing.
7. **Hide/reorder widgets** — **defer to V3.1**.

---

## Phase 0 decisions

Decided 2026-05-05:

- **Router**: wouter ^3
- **Charting**: recharts (already chosen; no Visx)
- **Mutations**: react-query (`@tanstack/react-query`) for mutating endpoints; plain fetch for read-only
- **V3.0 cut line**: Phases 1–4 (visible data, no mutations). Mutations (pause/resume/inject/block/restart) are V3.1.
- **`/incidents` page**: V3.1 only. Too much new data infrastructure (service transition history). Home widget still shows alert count + last 5, but the detail page is deferred.

---

## Implementation progress (as of 2026-05-06)

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Plan freeze | **DONE** | This document |
| Phase 1 — BFF skeleton | **DONE** | All 6 endpoints live: `/api/home`, `/api/autopipeline`, `/api/doctor`, `/api/models`, `/api/newsbites`, `/api/infra` |
| Phase 2 — Home page | **DONE** | All 32 widgets built in `DashHome.tsx`; wouter routing in place |
| Phase 3 — Charts + sparklines | **DONE** | recharts BarChart on home 7d sparkbar, NewsBites 30d, Autopipeline stage breakdown, Doctor error classes (horizontal) + verdict mix (donut). SQLite historical store deferred. |
| Phase 4 — Detail pages | **DONE** | All pages: `AutopipelinePage`, `DoctorPage`, `ModelsPage`, `NewsBitesPage`, `InfraPage`, `OpenCodeRoute` |
| Phase 5 — Actions | **DONE** | All mutation endpoints live with OPERATOR_TOKEN auth. UI: confirm modal + action buttons on all 4 pages |
| Phase 7 — SSE | **DONE** | `/api/stream` SSE endpoint live; DashHome uses EventSource (5s push), fallback poll at 60s. SSE dot indicator on home. |
| `/incidents` page | **DONE** | New `/api/incidents` endpoint + `IncidentsPage.tsx`. Timeline merges pipeline-alerts.json + doctor abandoned entries. Filter by error type / stage. |
| Phase 6 — OpenCode count | **DEFERRED** | V3.2 |
| Phase 8 — Polish, SQLite | **DEFERRED** | V3.2 |

**Missing packages** (not yet in `package.json`):
- `wouter` — routing
- `recharts` — charts
- `@tanstack/react-query` — mutation handling (V3.1)

Additive correction note (2026-05-07): this subsection is now historical/stale. `/opt/opencode-control-surface/package.json` contains `wouter` and `recharts`; `@tanstack/react-query` remains absent by design because the implementation uses the local `useAction` hook.

**Missing server API routes** (router.ts only has `/api/home`):
- `/api/autopipeline` — GET
- `/api/doctor` — GET (full log, all time)
- `/api/models` — GET (full model inventory)
- `/api/newsbites` — GET (all articles, word counts, deploy history)
- `/api/infra` — GET (services, timers, Hetzner stats, Vast instance)
- `/api/incidents` — **V3.1**

Additive correction note (2026-05-07): this subsection is also historical/stale. The current router exposes the listed GET endpoints plus `/api/stream`; the still-missing route relevant to V4 Phase 0 is `POST /api/doctor/scan`.

**Missing adapter capabilities**:
- `models.ts` — needs to expose full `models[]` array from `model-health.json`, cooldowns detail, fallback chains, and per-model quality from `model-quality.json`
- `newsbites.ts` — needs all articles (not just published/approved), word count per article, `git log -1` deploy timestamp
- `system.ts` — needs `systemctl list-timers` parsing to return timer last-run / next-run / status
- `doctor.ts` — needs a `getFullLog(opts)` export for arbitrary time windows and per-field filtering; needs `nextStage` and `cooldownMs` fields in `DoctorEntry`

Additive correction note (2026-05-07): several adapter capabilities have since been implemented enough for V3, but V4 should verify field-by-field before reusing this list as work scope. The durable gaps are historical SQLite, action descriptors/evidence refs, doctor scan/requeue actions, and deploy metadata reliability.

**Missing data files** (needed before V3.1 actions work):
- `/var/lib/mimule/model-discovery-log.jsonl` — created by extending `model-health-check.mjs`
- `/var/lib/mimule/model-policy.json` — created when first block/unblock action fires
- `/var/lib/mimule/vast-host.json` — created by `vast-host-sampler` timer (V3.1)

---

## Detail page API specs

These define exactly what each BFF endpoint returns so the frontend can be built against a stable contract.

### `GET /api/autopipeline`

```typescript
interface AutopipelineDetail {
  queue: {
    id: string;
    slug?: string;
    stage: string;
    priority: number;
    waitingApproval: boolean;
    running: boolean;
    createdAt?: number;
    lastApprovalPing?: number;
    elapsedMs?: number;       // derived: Date.now() - createdAt
  }[];
  current: { id: string; slug?: string; stage: string; startedAt?: number } | null;
  paused: boolean;
  pauseReason: string | null;
  stats: {
    queueDepth: number;
    approvalsWaiting: number;
    oldestApprovalAgeMs: number | null;
    stageBreakdown: Record<string, number>;
  };
  // p50/p95 per stage: derived from dossier file mtimes (TASK.md mtime - dossier creation mtime).
  // If no dossiers exist yet, these arrays are empty.
  stageDurations: { stage: string; p50Ms: number; p95Ms: number; sampleCount: number }[];
}
```

Source: `getPipelineState()` adapter + dossier mtime scan for `stageDurations`.

### `GET /api/doctor`

Query params: `?stage=&errorType=&failedModel=&since=<epoch_ms>` (all optional)

```typescript
interface DoctorDetail {
  entries: {
    ts: string;
    slug: string;
    stage: string;
    action: string;
    reason: string;
    errorType: string;
    failedModel: string;
    nextStage?: string;
    cooldownMs?: number;
  }[];
  stats: {
    windowMs: number;       // how much of the log was read
    total: number;
    successRate: number;    // (requeued + promoted) / total
    errorClasses: { type: string; count: number }[];
    topFailingModels: { model: string; count: number }[];
    topFailingStages: { stage: string; count: number }[];
    verdictMix: { action: string; count: number }[];
  };
  lastDecision: { ts: string; slug: string; action: string; reason: string } | null;
}
```

Source: `tailJsonl()` with a larger budget (2 MB) + optional client-side filter.
Note: `DoctorEntry` in `doctor.ts` needs `nextStage?: string` and `cooldownMs?: number` added.

### `GET /api/models`

```typescript
interface ModelsDetail {
  models: {
    logicalName: string;
    provider: string;
    capability: "heavy" | "medium" | "light";
    available: boolean;
    latency: number | null;    // ms from last check
    jsonOk: boolean;
    checkedAt: number;
    qualityStatus: "healthy" | "probation" | "degraded" | "blocked";
    recentFailures: number;    // count from model-quality.json
    consecutiveGarbage: number;
  }[];
  cooldowns: {
    model: string;
    startedAt: number;
    expiresAt: number;
    reason?: string;
  }[];
  fallbacks: Record<string, string[]>;  // from model-health.json.fallbacks
  summary: {
    bestCloudHeavy: string | null;
    bestCloudFast: string | null;
    bestLocal: string | null;
    availableByCapability: { heavy: number; medium: number; light: number };
    qualitySummary: { blocked: number; degraded: number; probation: number };
    lastFullCheckAgo: number;  // seconds
    lastQuickCheckAgo: number;
    newModelsAdded: string[];
  };
  discoveryLog: {
    ts: string;
    newModelsAdded: string[];
    totalModelCount: number;
  }[];  // from /var/lib/mimule/model-discovery-log.jsonl; empty array if file missing
}
```

Source: `model-health.json` (models array + fallbacks + summary), `model-cooldowns.json`, `model-quality.json` (merged per-model quality state), `model-discovery-log.jsonl`.

### `GET /api/newsbites`

```typescript
interface NewsBitesDetail {
  articles: {
    slug: string;
    title: string;
    status: "draft" | "approved" | "published" | string;
    date: string;
    vertical: string;
    wordCount: number;   // character count / 5 approximation from file body
  }[];
  stats: {
    totalPublished: number;
    totalApproved: number;
    totalDraft: number;
    publishedToday: number;
    publishedLast30d: { date: string; count: number }[];
    verticalMix: { vertical: string; count: number }[];
    wordCountBuckets: { bucket: string; count: number }[];  // <300/300-600/600-1000/1000+
  };
  deploy: {
    lastDeployAt: string | null;   // from: git log -1 --format=%ci in /opt/newsbites
    lastCommitHash: string | null;
    siteReachable: boolean;
  };
}
```

Source: read all `.md` files in `content/articles/` (not filtered by status), `git log -1`, HTTP probe.

### `GET /api/infra`

```typescript
interface InfraDetail {
  hetzner: {
    load1: number;
    load5: number;
    load15: number;
    memTotalKb: number;
    memUsedKb: number;
    memUsedPct: number;
    diskTotalGb: number;
    diskUsedGb: number;
    diskUsedPct: number;
  };
  vastInstance: {
    id: string;
    status: string;
    gpu: string;
    vcpus: number;
    ramGb: number;
    diskGb: number;
    hourlyRate: number;
    ip: string;
    sshPort: number;
  } | null;
  vastBalance: {
    balance: number;
    credit: number;
    runwayHours: number | null;
  } | null;
  vastHost: {
    cpuPct: number;
    ramPct: number;
    diskPct: number;
    gpuUtilPct: number;
    gpuMemUsedGb: number;
    sampledAt: number;
  } | null;  // null if vast-host.json missing (V3.1 sampler not yet running)
  gpu: {
    status: "up" | "down" | "unknown";
    gpuUtil: number | null;
    loadedModels: string[];
    checkedAgo: number;
  };
  services: {
    name: string;
    status: "active" | "inactive" | "failed" | "unknown";
  }[];
  timers: {
    name: string;
    active: boolean;
    lastTrigger: string | null;   // from: systemctl show <timer> --property=LastTriggerUSec
    nextElapse: string | null;    // from: systemctl show <timer> --property=NextElapseUSecRealtime
    lastResult: string | null;    // from: systemctl show <service> --property=Result
  }[];
}
```

Source: `getHetznerStats()`, `getVastInstance()`, `getVastAccount()`, `/var/lib/mimule/vast-host.json` (optional), `/var/lib/mimule/gpu-health.json`, `getServiceStatuses()`, new `getTimers()` function in `system.ts`.

**`getTimers()` implementation**: run `systemctl list-timers --no-pager --plain` and parse output; for each timer also run `systemctl show <timer>.timer --property=LastTriggerUSec,NextElapseUSecRealtime` to get precise timestamps.

---

## V3.1 action endpoints (NOT in V3.0)

All mutating endpoints require header `X-Operator-Token: <env.OPERATOR_TOKEN>`.

### `POST /api/autopipeline/command`
Body mirrors autopipeline `/command` API: `{ cmd, topic?, dossierDir?, storyId? }`
Valid cmds: `pause`, `resume`, `inject`, `add`, `rush`, `kill`, `publish`, `doctor-scan`
Proxies to `http://127.0.0.1:3200/command`.

### `POST /api/doctor/scan`
No body. Proxies to `POST http://127.0.0.1:3200/doctor/scan`.

### `POST /api/models/action`
Body: `{ action: "block" | "unblock" | "probation-clear" | "run-quick-check" | "run-full-check", model?: string }`
- `block/unblock/probation-clear`: update `/var/lib/mimule/model-quality.json`
- `run-quick-check`: `systemctl start model-health-check.service`
- `run-full-check`: `systemctl start model-health-check.service` with env override (full mode)

### `POST /api/newsbites/deploy`
No body. Executes `cd /opt/newsbites && ./deploy.sh` as a background child process; returns `{ jobId }`. Frontend polls `/api/newsbites/deploy/:jobId` for status.

### `POST /api/infra/service-restart`
Body: `{ service: string }` — must be in an explicit allowlist (all services in CLAUDE.md table).
Executes `systemctl restart <service>` or `docker compose restart <container>`.

### `POST /api/infra/run-timer`
Body: `{ timer: "model-health-check" | "mimule-backup" }`
Executes `systemctl start <timer-service>`.

---

## Exit criteria for V3.0

- The operator can open `control.techinsiderbytes.com` on a phone and answer all of the following without leaving the home page:
  - Is the stack healthy?
  - Is the autopipeline running, and how deep is the queue?
  - Were any stories repaired by the doctor today, and what's failing most?
  - Which cloud model is currently best, and were any new free models discovered?
  - How many articles published today?
  - Is the GPU up, and how much Vast credit is left?
- Every home widget tappable to a detail page that fully expands its data.
- Existing OpenCode session UI is preserved and reachable.
- No regressions on `control-surface.service` (still active, builds clean, deploys via existing `docker-compose`).
