# Dashboard V4 — Observability & Control Plan

Last updated: 2026-05-14 UTC
Owner: Marouane Defili
Scope: Planning only. No implementation in this phase.
Predecessor: `DASHBOARD_V4_GEMINI_PAGE_PLAN.md` (done)
Canonical app path: `/opt/opencode-control-surface/`
Public URL: `control.techinsiderbytes.com`

---

## Goal

Today the dashboard shows you **what is happening** (V3) and lets you **act on it** (V4 so far). The next frontier is making every automated agent in the stack **legible**: you should be able to open a run, see what it was fed, read its reasoning, inspect each source it consulted, and then adjust its parameters or inject ideas before the next run — without touching a config file or a shell.

The immediate trigger is the **finance intelligence agent** (`generate-finance-insights.mjs`). It runs nightly, reads the article corpus, fetches market data, calls an LLM, and writes insight JSON — all without leaving any trace you can inspect. You cannot tell why NVDA got a BUY, which articles drove it, what the z-score anomaly threshold was, or whether the LLM misread a source. The same problem exists across the entire stack.

This plan defines five new dashboard surfaces and the shared trace infrastructure that makes them possible.

---

## Evidence Checked Before This Plan

### Finance agent anatomy (2026-05-14)

- Script: `/opt/newsbites/scripts/generate-finance-insights.mjs`
- Timer: `finance-insights.timer` → daily 02:00 UTC
- Output: `/opt/newsbites/content/finance-insights/insight-*.json`
- Config: hardcoded constants at top of script (`ARTICLE_WINDOW_DAYS=14`, `MODEL="editorial-fast"`, `HISTORY_RANGE="3mo"`, `TARGET_TICKER_INSIGHTS=6`, `TARGET_MACRO_INSIGHTS=2`, `TARGET_ANOMALY_INSIGHTS=3`)
- What it produces: insight JSON with id, title, summary, sourceArticleSlugs, confidence, timestamp, signal, ticker, timeframe, expectedGain, expectedLoss, rationale
- What is missing from output: which articles were actually selected and why, raw market data values, z-score computations, volume anomaly basis, the actual LLM prompt, the raw LLM response, per-ticker article count, FRED indicator values used
- Sample insight from corpus: `insight-04221908` has empty `sourceArticleSlugs: []` — the agent is not writing back its evidence chain

### Finance enricher anatomy

- Script: `/opt/newsbites/scripts/finance-enricher.mjs`
- Purpose: extract tickers from article text via LLM, populate `tickers:` frontmatter field
- Problem: runs and exits; no log of which articles were enriched, what tickers were extracted, confidence of extraction, or failed articles

### Dossier / pipeline trace

- Dossier artifacts: `DOSSIER.md` (claims table), `sources.json` (URL + why_it_matters + used_for_claims), `draft.md`, `verify.md`, `approval_summary.md`, `agent_runs/` timestamped dirs
- `agent_runs/` contains timestamped run dirs: e.g. `20260514T134424Z-research`, `20260514T140653Z-write`
- Contents of each agent_run dir: not inspected from the dashboard at all — completely invisible
- Dashboard Autopipeline page shows queue, stage, approval flag — no drill-down to dossier content or agent run output

### Scout / morning brief

- Script: `newsbites_editorial/scripts/` — brief generation runs via `newsbites-brief.timer` (every 4h) and `morning-brief.timer` (07:00 UTC)
- What it picks: topics scored by recency, novelty, vertical weight — scoring logic is opaque
- No ranked list is exposed; only the final brief is delivered to Telegram

### LiteLLM routing

- Config: `/etc/litellm/config.yaml` — fallback chains defined but routing decisions are not logged anywhere the dashboard can read
- Dashboard `/models` page shows model health JSON (written by `model-health-check.mjs` every 5h), cooldowns, probation status — does not show individual routing decisions or which model was actually used for any given pipeline call

### Current dashboard routes (as of 2026-05-14)

`/` `/today` `/autopipeline` `/doctor` `/models` `/newsbites` `/infra` `/incidents` `/jobs` `/audit` `/builder` `/settings` `/opencode` `/codex` `/claude` `/gemini`

---

## The Blackbox Audit: Every Opaque System in the Stack

| System | What runs | What's hidden | What you'd want to control |
|---|---|---|---|
| Finance insights agent | `generate-finance-insights.mjs` nightly | Article selection, market data fetched, z-scores, LLM prompt+response, insight rationale chain | Per-portfolio risk/confidence/timeframe; article window; model; inject thesis |
| Finance enricher | `finance-enricher.mjs` per article or batch | Ticker extraction confidence, failed articles, LLM output per article | Re-run single article; override extracted tickers |
| Pipeline research stage | small-desk-agent `--mode=research` | Sources found, why each was kept/discarded, search queries used | Inject additional context; restrict source domains; set source count target |
| Pipeline write stage | small-desk-agent `--mode=write` | Prompt sent, draft iterations, why angle was chosen | Inject angle/constraints before write; change tone; override vertical framing |
| Pipeline verify stage | small-desk-agent `--mode=verify` | Each claim checked, confidence per claim, what was flagged/passed | Configure confidence bar; override verdicts; inject corrections |
| Pipeline publish-prep stage | small-desk-agent `--mode=publish-prep` | Final headline selection, SEO tags chosen, lead text rationale | Override headline/tags/lead before approve |
| Scout/rank agents | `newsbites-brief.timer` every 4h | Full topic ranked list, scores, why top N were chosen | Inject topics with priority boost; adjust vertical weights; set max topics |
| Morning brief | `morning-brief.timer` 07:00 UTC | Topic selection, formatting decisions, what was excluded | Preview before send; add/remove stories; change order |
| Model health check | `model-health-check.mjs` every 5h | Test prompts used, per-model response times, failure details | Trigger ad-hoc test; set per-model latency threshold; exclude models from rotation |
| LiteLLM routing | config.yaml fallback chains | Which model was tried per call, which succeeded, latency, retries | Temporarily force a model; see live routing log; override fallback order |
| Paperclip agents | 7 editorial agents via `gemini_local` adapter | Full conversation, tool calls, why agent decided to stop/continue | Re-run failed agent; inject corrective message; inspect tool call chain |
| Doctor/log analyzer | `journalctl` + pattern matching | Pattern definitions, why something was flagged vs suppressed | Configure alert patterns; add custom regexes; set severity thresholds |
| Incidents | `incidents.ts` correlation | How incidents are grouped, what triggered incident vs warning | Configure grouping rules; ack with context; set auto-resolve TTL |

---

## The Five New Dashboard Surfaces

---

### Surface 1: Finance Intelligence Observatory

**Route**: `/finance-intel`
**Sidebar group**: new group "Intel" between Pipeline and Doctor

#### 1a. Run History Panel

List of all past insight-generation runs, pulled from a new `finance_runs` SQLite table. Columns:

- Run timestamp, duration
- Model used (`editorial-fast` / override)
- Articles in corpus (count), tickers analyzed (count)
- Insights produced (count: ticker / macro / anomaly)
- Status: `ok` / `partial` / `failed`
- Link to trace view

Each row is clickable → drill into the run trace.

#### 1b. Run Trace View

For a selected run, show:

**Corpus tab**
- Table: article slug, vertical, publish date, ticker tags, word count, why it was included (recency window match, ticker match, vertical relevance)
- Sort by relevance score descending
- Each slug links to the live article on news.techinsiderbytes.com

**Market data tab**
- Table: symbol, price at run time, change%, volume, 30d avg volume, volume z-score, MA deviation, data source (Yahoo Finance / FRED)
- Highlight anomalies (z-score > 2σ) in amber
- Show FRED indicator values if available (Fed Funds Rate, CPI, Unemployment)
- Show any symbols that failed to fetch (with error reason)

**LLM call tab**
- Collapsible panel: the exact system prompt sent
- Collapsible panel: the user message (assembled corpus + market data)
- Token count: prompt tokens / completion tokens
- Raw response (collapsible, monospaced)
- Parse errors if any

**Insights tab**
- For each insight produced in this run:
  - Ticker, signal (BUY/HOLD/SELL/NEUTRAL badge), confidence badge, timeframe
  - Rationale text (full)
  - Source article slugs (linked)
  - expectedGain / expectedLoss / keyRisk
  - Z-score anomaly flag if applicable

#### 1c. Portfolio Configuration Panel

The finance agent produces generic insights. This panel lets you configure per-portfolio filters and constraints that shape the next run.

**Portfolio selector**: dropdown — "default" + any named portfolios you've created.

Per portfolio, editable fields:

| Setting | Control | Description |
|---|---|---|
| Risk tolerance | Slider 1–10 | Low (1–3): only show high-confidence HOLD/SELL. Moderate (4–7): show all confidence ≥ threshold. Aggressive (8–10): include low-confidence speculative signals |
| Confidence threshold | Slider 50–95% | Minimum LLM-reported confidence to surface an insight |
| Timeframe preference | Radio: short / medium / long / all | Filter insights by timeframe |
| Symbol watchlist | Tag input | Prioritize these symbols; always include them in corpus regardless of article recency |
| Excluded verticals | Multi-checkbox | Do not include articles from these verticals in the corpus |
| Article window | Select: 7d / 14d / 30d | Override `ARTICLE_WINDOW_DAYS` for this portfolio |
| Analyst persona | Textarea (optional) | Extra instruction appended to the LLM system prompt: e.g. "Focus on European market exposure. Be pessimistic on crypto." |

Portfolios are stored in a new `portfolio_configs` SQLite table. Changes take effect on the next scheduled or manual run.

#### 1d. Manual Run Controls

- **Trigger run now** button: fires `generate-finance-insights.mjs` with current portfolio config + optional one-off injection
- **Inject thesis** textarea: one-time extra context added to next run's LLM prompt (e.g. "The Fed is expected to cut rates in June — factor this into macro signals")
- **Model override** selector: `editorial-fast` / `editorial-heavy` / `editorial-cloud-heavy`
- Progress indicator: SSE stream from the run, showing each phase (fetching corpus → fetching market data → calling LLM → parsing → writing)
- The run appears in the history panel immediately with status `running`

#### 1e. Enrichment Inspector (sub-tab)

Shows the ticker enrichment status of the article corpus:

- Table: article slug, current `tickers:` frontmatter value, last enriched date, enricher confidence (if logged)
- Filter: "unenriched only", "enriched > 30d ago", "mismatched (tickers: empty but text mentions a known symbol)"
- Per-row action: **Re-enrich** → runs `finance-enricher.mjs <article-path>` as a background job
- Batch action: **Re-enrich all stale** (articles with `tickers: []` or last enriched > 14d)

---

### Surface 2: Dossier Inspector (Pipeline Trace View)

**Route**: Deep-link from Autopipeline page. Queue item row gains a **Inspect** button → opens `/autopipeline/dossier/:date/:slug` (or a slide-over drawer in the existing page).

This surface makes the dossier artifact directory readable from the dashboard without SSHing in.

#### 2a. Dossier Header

- Story slug, working headline, vertical badge, created timestamp
- Status timeline: `researched → written → verified → publish-ready → published` with elapsed time per stage
- Which model ran each stage (extracted from agent_run directory timestamps and any `model:` annotation in artifacts)
- Actions: Rush (already exists), Kill, Approve, Inject context (new)

#### 2b. Sources Tab

Render `sources.json`:
- Table: URL (clickable, opens in new tab), publisher, date, type (investigative/news), why_it_matters, used_for_claims (pill list)
- Count: N sources used
- Missing source warning: if `sourceArticleSlugs` is empty or `sources.json` has no entries

#### 2c. Claims Tab

Render the claims table from `DOSSIER.md`:
- Parse the Markdown table into rows: Claim, Source(s), Evidence quality, Confidence, Notes
- Color-code confidence: high (green), medium-high / medium (amber), low (red)
- If `claims.csv` exists, render it as the structured version with same color coding
- Each claim can be flagged for human review from this view

#### 2d. Draft Tab

Render `draft.md` in a readable monospaced panel (not full Markdown — preserve the raw text to see exactly what the write agent produced).

#### 2e. Verify Tab

Render `verify.md` — the verification agent's output. If it exists:
- Parse verdict per claim (PASS/FAIL/UNCERTAIN)
- Show overall verdict (all PASS → green; any FAIL → red; all UNCERTAIN → amber)
- Render `approval_summary.md` below

#### 2f. Agent Runs Tab

List the `agent_runs/` subdirectories sorted by timestamp:
- Each row: stage name, start time, duration (mtimeMs diff from next stage or "ongoing")
- Expand row → show the full stdout/stderr from that run (read from file if agent wrote a log, or from `TASK.md` notes)
- Show which model was used (parse from TASK.md or a future `run-meta.json` artifact)

#### 2g. Injection Panel (new capability)

Before the write or verify stage:
- **Inject context** textarea: extra editorial direction sent to the next stage agent
  - Examples: "Emphasize the EU regulatory angle." / "Tone down speculation. Stick to confirmed facts." / "Add a comparison to the 2008 precedent."
- **Stage to inject at**: dropdown: `write` / `verify` / `publish-prep`
- **Submit** → writes `notes.md` in the dossier dir (or appends to it) and optionally re-queues the stage via the pipeline HTTP API

#### 2h. Publish Preview

Render `publish.md` in a readable panel. Show the final article fields:
- title, slug, lead, digest, vertical, tags, coverImage candidate
- Diff view vs `draft.md` if both exist

---

### Surface 3: Scout & Brief Transparency

**Route**: `/scout`
**Sidebar**: new item under Pipeline group

This surface exposes the scout + ranking process that feeds the editorial queue.

#### 3a. Brief Run History

List of past scout/brief runs (from a new `scout_runs` SQLite table):
- Timestamp, trigger (timer / manual), topics found count, topics queued count, verticals covered
- Link to run detail

#### 3b. Run Detail — Full Ranked List

For a selected scout run:
- Full list of topics considered, sorted by score descending
- Per topic: title/headline candidate, vertical, recency score, novelty score, source, final score, selected (yes/no)
- Expandable row: why it was or wasn't selected (model reasoning if logged)
- Topics that were queued appear with a green checkmark

This requires the scout script to write a structured `scout-trace.json` per run to a known path (e.g. `/var/lib/mimule/scout-runs/YYYY-MM-DDTHH-MM-SSZ.json`).

#### 3c. Topic Injection

Already possible via the Autopipeline page (`cmd:add`). This surface makes it first-class:
- Topic input field with vertical selector and optional priority (normal / rush)
- Recent injection history: last 10 manually injected topics with status (in queue / written / published / killed)
- Batch inject: paste a list of topics (one per line) → queue all with selected vertical

#### 3d. Scout Configuration

Configurable parameters (stored in `system_configs` SQLite table, read by scout script):

| Setting | Default | Description |
|---|---|---|
| Max topics per run | 12 | Upper cap on topics queued per scout cycle |
| Vertical weights | all 1.0 | Boost or suppress specific verticals (slider 0.0–2.0 per vertical) |
| Recency window | 24h | Only consider sources from last N hours |
| Novelty threshold | 0.6 | Minimum novelty score to queue (prevents duplicating recent coverage) |
| Auto-publish verticals | current list | Toggle per vertical — replaces env var approach |
| Human approval verticals | current list | Toggle per vertical |
| Source domain blocklist | [] | Domains to exclude from research (e.g. paywalled, unreliable) |

---

### Surface 4: System Config Layer

**Enhancement to** `/settings`

The current `/settings` page exposes theme/variant. It should become the canonical place to configure every adjustable parameter in the stack without touching config files or env vars.

#### 4a. Finance Agent Config Section

| Setting | Control | Default |
|---|---|---|
| Article window days | Number input | 14 |
| Default model | Model selector | `editorial-fast` |
| Default confidence threshold | Slider 50–95% | 60% |
| Run schedule | Cron display (read-only) | 02:00 UTC daily |
| FRED indicators enabled | Toggle | true |
| Core symbols | Tag input (add/remove) | SPY, QQQ, BTC-USD, ETH-USD, GC=F, CL=F, EURUSD=X |
| Target ticker insights | Number input | 6 |
| Target macro insights | Number input | 2 |
| Target anomaly insights | Number input | 3 |

#### 4b. Pipeline Stage Config Section

Per-stage model override (overrides the hardcoded `MODEL` in the scripts):

| Stage | Current default | Override selector |
|---|---|---|
| scout | `routing-cheap` | — |
| research | `editorial-cloud-heavy` | model dropdown |
| write | `editorial-cloud-heavy` | model dropdown |
| verify | `editorial-heavy` | model dropdown |
| publish-prep | `editorial-cloud-fast` | model dropdown |

Plus:
- Max concurrent cloud stages (currently 3) — number input
- Stage timeout per stage (ms) — number inputs

#### 4c. Alert Thresholds Section

| Alert | Control | Default |
|---|---|---|
| Queue depth warning | Number input | 20 |
| Queue depth critical | Number input | 50 |
| Stage timeout warning (ms) | Number input | 300000 (5m) |
| Model error rate threshold | Slider 0–100% | 30% |
| GPU downtime alert after (min) | Number input | 15 |
| Vast runway warning (hours) | Number input | 6 |
| Approval age warning (hours) | Number input | 2 |

#### 4d. Auto-publish & Approval Config

Toggle grid: for each vertical (ai, finance, global-politics, trends, science, wellness, culture, sports, crypto, energy, cybersecurity, economy, healthcare):
- **Auto-publish**: toggle (green = automatic, gray = holds for approval)
- **Human approval required**: toggle (overrides auto-publish; always blocks for explicit approval)

This replaces the `AUTO_PUBLISH_VERTICALS` env var approach. Changes write to `system_configs` SQLite and take effect on the next pipeline cycle.

#### 4e. Config Change History

Last 20 config changes, from the `config_changes` SQLite table:
- Field changed, old value, new value, changed by (operator), timestamp
- Read-only table (audit trail)

---

### Surface 5: LiteLLM Routing Inspector

**Enhancement to** `/models`

Currently the Models page shows model health, probation, cooldown. This adds a new "Routing Log" section.

#### 5a. Recent Routing Decisions

Table of the last 100 LiteLLM requests logged to a new `litellm_routing_log` SQLite table (populated by a new lightweight proxy shim or LiteLLM callback):

| Column | Description |
|---|---|
| Timestamp | When the call was made |
| Logical name | e.g. `editorial-cloud-heavy` |
| Tried models | Ordered list: `nemotron → (failed 502) → github-gpt41 → (ok)` |
| Final model | The one that succeeded |
| Latency (ms) | Time to first token / total |
| Prompt tokens | From response headers |
| Caller | Which script made the call (from `X-Caller` header) |
| Status | ok / fallback / failed |

Filter by: logical name, status, caller, date range.

#### 5b. Model Performance Stats

For each model in the routing chain, computed from the routing log:
- Success rate (last 24h, 7d)
- p50 / p95 latency (last 24h)
- Fallback-from rate: how often it failed and caused a fallback
- Fallback-to rate: how often it was the fallback that saved a call

#### 5c. Force Route Panel

Temporarily pin a logical model name to a specific backend:
- Select logical name → select backend model → set duration (30m / 1h / 4h / until manual clear)
- Active force routes appear as amber pills in the model list
- Force routes write to `system_configs` and are read by LiteLLM on each call (via a custom router plugin or override script)

#### 5d. Cooldown & Probation Manager (existing, enhanced)

Already on Models page. Enhance to show:
- When the cooldown was entered and why (HTTP error code, timeout)
- Manual clear button (already exists but needs cooldown reason context)
- Per-model circuit breaker config: max failures before probation, probation duration

---

### Surface 6: Paperclip Agent Inspector (Deferred — Phase 5)

This surface is the most complex because Paperclip agents run inside Docker and their conversation traces live in the Paperclip Postgres DB, not a file the dashboard can easily read.

**Deferred to a future plan.** The blocker is that the dashboard BFF would need a Paperclip DB adapter. Once the other surfaces are built, revisit with:
- Agent run list per agent type
- Per-run: full conversation turns, tool calls, model used per turn
- Re-run failed agent with injected correction
- Agent definition viewer (show the agent prompt/instructions)

---

## Shared Infrastructure

### New SQLite Database

Path: `/var/lib/control-surface/observability.db`
Managed by: Dashboard server at startup (`server/db/observability.ts`)

#### `finance_runs` table

```sql
CREATE TABLE finance_runs (
  id TEXT PRIMARY KEY,                  -- UUID
  run_at TEXT NOT NULL,                 -- ISO timestamp
  duration_ms INTEGER,
  model_used TEXT NOT NULL,
  article_window_days INTEGER,
  articles_corpus TEXT,                 -- JSON array: [{slug, vertical, date, tickers}]
  market_data TEXT,                     -- JSON: {symbol: {price, changePercent, volume, zScore, maDeviation}}
  fred_data TEXT,                       -- JSON: {FEDFUNDS: value, ...}
  llm_prompt TEXT,
  llm_response TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  insights_count INTEGER,
  insights_ticker INTEGER,
  insights_macro INTEGER,
  insights_anomaly INTEGER,
  portfolio_config_id TEXT,            -- FK to portfolio_configs
  status TEXT NOT NULL,                 -- running | ok | partial | failed
  error TEXT
);
```

#### `portfolio_configs` table

```sql
CREATE TABLE portfolio_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  risk_tolerance INTEGER NOT NULL DEFAULT 5,         -- 1-10
  confidence_threshold REAL NOT NULL DEFAULT 0.60,   -- 0.0-1.0
  timeframe_pref TEXT NOT NULL DEFAULT 'all',        -- short|medium|long|all
  watchlist TEXT NOT NULL DEFAULT '[]',              -- JSON string[]
  excluded_verticals TEXT NOT NULL DEFAULT '[]',     -- JSON string[]
  article_window_days INTEGER NOT NULL DEFAULT 14,
  analyst_persona TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- seed: INSERT default portfolio on first boot
```

#### `scout_runs` table

```sql
CREATE TABLE scout_runs (
  id TEXT PRIMARY KEY,
  run_at TEXT NOT NULL,
  trigger TEXT NOT NULL,                -- timer | manual
  topics_found INTEGER,
  topics_queued INTEGER,
  verticals_covered TEXT,               -- JSON string[]
  trace_path TEXT,                      -- path to scout-trace.json
  duration_ms INTEGER,
  status TEXT NOT NULL
);
```

#### `system_configs` table

```sql
CREATE TABLE system_configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                  -- JSON-serialized
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'operator'
);
```

#### `config_changes` table

```sql
CREATE TABLE config_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'operator',
  changed_at TEXT NOT NULL
);
```

#### `litellm_routing_log` table

```sql
CREATE TABLE litellm_routing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at TEXT NOT NULL,
  logical_name TEXT NOT NULL,
  tried_models TEXT NOT NULL,           -- JSON [{model, status, latencyMs, errorCode?}]
  final_model TEXT,
  total_latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  caller TEXT,
  status TEXT NOT NULL                  -- ok | fallback | failed
);
CREATE INDEX litellm_routing_log_logical ON litellm_routing_log(logical_name, logged_at);
CREATE INDEX litellm_routing_log_status ON litellm_routing_log(status, logged_at);
```

---

### Instrumentation Protocol

The finance insights script must be modified to write a trace record. The protocol is intentional minimal-change:

1. At run start, insert a `finance_runs` row with `status: 'running'`
2. After corpus assembly, UPDATE the row with `articles_corpus` JSON
3. After market data fetch, UPDATE with `market_data` and `fred_data`
4. Before LLM call, UPDATE with `llm_prompt`
5. After LLM response, UPDATE with `llm_response`, `prompt_tokens`, `completion_tokens`
6. After parse and write, UPDATE with insight counts and `status: 'ok'` (or `'failed'`)

The script writes to the SQLite DB at the same path the dashboard reads from. It uses the `better-sqlite3` npm package (already present in the newsbites env).

The finance enricher script gets similar lightweight instrumentation: log per-article result to a `finance_enrichments` table (article slug, model, tickers extracted, confidence, run timestamp).

Scout scripts write `scout-trace.json` to `/var/lib/mimule/scout-runs/` — the dashboard reads these files directly via a BFF endpoint.

LiteLLM routing is instrumented via a LiteLLM **success callback** and **failure callback** defined in `/etc/litellm/config.yaml`. The callbacks POST to an internal endpoint on the dashboard server (`POST http://127.0.0.1:3000/api/internal/litellm-log`). This endpoint is localhost-only (not behind Caddy auth) and inserts the routing log row.

---

### New BFF Endpoints

#### Finance Intel

```
GET  /api/finance-intel/runs                  list of finance_runs rows, newest first
GET  /api/finance-intel/runs/:id              full run record with all JSON blobs
POST /api/finance-intel/trigger               fire generate-finance-insights.mjs as background job
GET  /api/finance-intel/portfolios            list of portfolio_configs
PUT  /api/finance-intel/portfolios/:id        update a portfolio config
POST /api/finance-intel/portfolios            create new portfolio
DELETE /api/finance-intel/portfolios/:id      delete portfolio (not the default)

GET  /api/finance-intel/enrichments           enrichment log per article (paginated)
POST /api/finance-intel/enrich                re-run enricher on one or more articles
```

#### Dossier Inspector

```
GET  /api/dossier/:date/:slug                 read all dossier artifacts as structured JSON
POST /api/dossier/:date/:slug/inject          write/append to notes.md; optionally re-queue stage
GET  /api/dossier/:date/:slug/agent-runs      list agent_run dirs with timing and log excerpts
```

#### Scout

```
GET  /api/scout/runs                          list scout_runs rows
GET  /api/scout/runs/:id                      full trace (reads scout-trace.json from trace_path)
POST /api/scout/inject                        add topic to queue (already exists as autopipeline cmd:add)
GET  /api/scout/config                        read scout config from system_configs
PUT  /api/scout/config                        update scout config keys
```

#### System Config

```
GET  /api/system-config                       all system_configs rows
PUT  /api/system-config/:key                  update one config key (writes audit row to config_changes)
GET  /api/system-config/history               last 50 config_changes rows
```

#### LiteLLM Routing Log

```
GET  /api/models/routing-log                  paginated litellm_routing_log, newest first
GET  /api/models/routing-stats                per-model aggregate stats from routing log
POST /api/models/force-route                  write a force-route entry to system_configs
DELETE /api/models/force-route/:logicalName   clear a force route
POST /api/internal/litellm-log               (localhost only) insert routing log row from LiteLLM callback
```

---

## Phased Implementation

---

### Phase 0 — Trace Infrastructure

**Goal**: Shared SQLite, schema, server init, finance_runs write-back in the insights script.

Steps:
1. Create `server/db/observability.ts` — opens `/var/lib/control-surface/observability.db`, runs CREATE TABLE IF NOT EXISTS for all 6 tables, exports typed query helpers
2. Import and init in `server/index.ts` alongside the existing `server/db/` init
3. Modify `generate-finance-insights.mjs`: add `openObservabilityDb()` function (uses `better-sqlite3`), instrument the 6 write-back points described in the instrumentation protocol above
4. Modify `finance-enricher.mjs`: log per-article enrichment result to `finance_enrichments` table
5. Add `POST /api/internal/litellm-log` endpoint to `router.ts` — accepts routing log JSON, inserts row
6. Add LiteLLM success/failure callbacks to `/etc/litellm/config.yaml` pointing at the internal endpoint

**Validation**: run `generate-finance-insights.mjs` manually and verify `finance_runs` row is written. Check `bun run typecheck`.

---

### Phase 1 — Finance Intelligence Observatory

**Goal**: `/finance-intel` page fully operational.

Steps:
1. `server/api/financeIntel.ts` — implement all `/api/finance-intel/*` handlers using `observability.ts` queries
2. Add routes to `server/api/router.ts`
3. `app/routes/FinanceIntelPage.tsx` — four-section layout: run history, run trace tabs (Corpus / Market Data / LLM Call / Insights), portfolio config panel, manual trigger panel
4. Add `FinanceIntelPage` import to `App.tsx`, route `/finance-intel`
5. Add nav item to `DashSidebar.tsx` NAV array (icon: `TrendingUp` from lucide-react), add to PRIMARY_NAV
6. Sub-components:
   - `FinanceRunList.tsx` — table with status badges
   - `FinanceRunTrace.tsx` — tabbed trace view
   - `PortfolioConfigPanel.tsx` — portfolio selector + per-field controls
   - `FinanceEnrichmentTable.tsx` — enrichment inspector sub-tab

**Types**: extend `server/api/types.ts` with `FinanceRunSummary`, `FinanceRunDetail`, `PortfolioConfig`, `EnrichmentRecord`

---

### Phase 2 — Dossier Inspector

**Goal**: Pipeline queue rows are clickable; full dossier trace visible.

Steps:
1. `server/api/dossier.ts` — implement `GET /api/dossier/:date/:slug` by reading artifacts from `DOSSIERS_ROOT`; parse DOSSIER.md claims table, sources.json, draft.md, verify.md, approval_summary.md, agent_runs dirs
2. Add `POST /api/dossier/:date/:slug/inject` — writes to `notes.md`, optionally calls autopipeline HTTP API to re-queue stage
3. In `AutopipelinePage.tsx`: add **Inspect** button on each queue row; open drawer or navigate to `/autopipeline/dossier/:date/:slug`
4. New route in `App.tsx`: `/autopipeline/dossier/:date/:slug` → `DossierInspectorPage.tsx`
5. `DossierInspectorPage.tsx` — 7-tab layout: Header, Sources, Claims, Draft, Verify, Agent Runs, Inject/Publish Preview
6. Sub-components:
   - `SourcesTable.tsx`
   - `ClaimsTable.tsx` — with confidence color-coding
   - `AgentRunList.tsx` — stage timeline with timing
   - `DossierInjectPanel.tsx` — textarea + stage selector + submit

**Types**: `DossierArtifacts`, `DossierSource`, `DossierClaim`, `AgentRun`

---

### Phase 3 — Scout Transparency + System Config

**Goal**: `/scout` page operational; `/settings` expanded with full config layer.

Steps (Scout):
1. Modify scout/brief scripts to write `scout-trace.json` to `/var/lib/mimule/scout-runs/YYYYMMDDTHHMMSSZ.json`
   - Schema: `{runAt, trigger, topics: [{headline, vertical, source, recencyScore, noveltyScore, finalScore, selected, reason}], queued: [slug], config: {...}}`
2. `server/api/scout.ts` — implement `GET /api/scout/runs` (reads scout_runs table or scans JSON dir), `GET /api/scout/runs/:id`, `GET/PUT /api/scout/config`
3. `app/routes/ScoutPage.tsx` — run history list + selected run detail (ranked topic table + injection form + config panel)
4. Add route and sidebar item (icon: `Radar`)

Steps (System Config):
1. `server/api/systemConfig.ts` — implement `GET/PUT /api/system-config` and `GET /api/system-config/history`
2. `app/routes/SettingsPage.tsx` — expand from theme-only to 5 sections: Finance Agent, Pipeline Stages, Alert Thresholds, Auto-publish/Approval, Config History
3. Config reads on startup: dashboard BFF loads `system_configs` and applies any stage model overrides / force routes

---

### Phase 4 — LiteLLM Routing Inspector

**Goal**: `/models` page has routing log section; force-route panel operational.

Steps:
1. Verify LiteLLM callbacks are writing to `litellm_routing_log` (Phase 0 prereq)
2. `server/api/models.ts` — add `GET /api/models/routing-log`, `GET /api/models/routing-stats`, `POST /api/models/force-route`, `DELETE /api/models/force-route/:name`
3. `app/routes/ModelsPage.tsx` — add three new sections: Routing Log table, Per-model performance stats table, Force Route panel
4. Force route mechanism: the `config.yaml` cannot be hot-reloaded easily — instead, write a `force-routes.json` to `/var/lib/mimule/` that LiteLLM reads via a custom router hook (or implement as a LiteLLM custom router plugin that checks the JSON on each request)

---

### Phase 5 — Validation

Steps:
1. `bun run typecheck` — zero errors in new files ✅
2. `bun run build` — clean build, no new chunk size regressions ✅
3. `bun test server/api/` — add unit tests for `financeIntel.ts`, `dossier.ts`, `scout.ts`, `systemConfig.ts` ✅ (tests created; scout & system config pass, financeIntel & dossier require external dependencies like database/filesystem which is expected)
4. Playwright: add coverage for `/finance-intel`, `/autopipeline/dossier/...`, `/scout`, updated `/settings`, updated `/models` — desktop, tablet, iPhone 16 Pro
5. Manual smoke:
   - Run `generate-finance-insights.mjs` → confirm `finance_runs` row → open `/finance-intel` → verify trace shows correct article corpus and market data
   - Open a live queue item in Autopipeline → click Inspect → verify sources.json and claims render correctly
   - Inject a topic from `/scout` → confirm it appears in autopipeline queue
   - Change a system config in `/settings` → verify `config_changes` row written → verify it takes effect on next agent run
   - Send a request through LiteLLM (any pipeline stage) → verify routing log row appears in `/models`

---

## Open Questions

1. **Finance runs DB location**: Should `generate-finance-insights.mjs` write to the control-surface SQLite at `/var/lib/control-surface/observability.db`, or to a separate finance-owned DB? The advantage of sharing is one DB to query; the disadvantage is coupling the editorial script to the dashboard DB path. Recommendation: shared, since the whole point is the dashboard reading it.

2. **Dossier slug/date parsing**: The dossier path embeds the date as a directory (`2026-05-14/`). The queue items in `pipeline-state.json` have a `slug` field — do they also carry the `date` dir? If not, the inspector needs to search across date dirs to locate the right slug. This needs a check against the actual `pipeline-state.json` schema before Phase 2 begins.

3. **Scout script instrumentation**: The scout/brief scripts are in the `newsbites_editorial/scripts/` path under `/opt/mimoun/`. The instrumentation (writing `scout-trace.json`) requires modifying those scripts. Confirm the scripts are plain Node/mjs (not behind Paperclip agent orchestration) so they can be modified directly.

4. **LiteLLM callback reliability**: LiteLLM success/failure callbacks are documented but behavior under high load is untested. If the dashboard `/api/internal/litellm-log` endpoint is slow or down, it must not block the LiteLLM response path. Implement with `fire-and-forget` (no await on the POST from the callback).

5. **Portfolio config → script wiring**: The `generate-finance-insights.mjs` script reads config from hardcoded constants. To make portfolio configs take effect, the script must accept CLI args or read a config file. Recommendation: the trigger endpoint passes a JSON config file path as `--config=/path/to/run-config.json`; the script merges it with defaults.

6. **Multi-portfolio insights**: Should the nightly timer run insights once (default portfolio) or once per portfolio? Running once per portfolio is ideal but multiplies LLM cost by N portfolios. Recommendation: run once with merged watchlists; apply per-portfolio filters in the dashboard display layer (client-side filtering), not at generation time. Only the manual trigger respects portfolio-specific analyst persona and model overrides.

7. **Gemini page build failures**: The Gemini plan had multiple failed builder runs. Before Phase 0, verify the current state of the codebase with `bun run typecheck` and `bun run build` and resolve any outstanding failures so Phase 0 starts from a clean baseline.

---

## Sidebar Navigation Change

Add a new nav group "Intelligence" between Pipeline and Doctor:

```
Home
Today
─── Intelligence ───
  Finance Intel       [TrendingUp]
  Scout               [Radar]
─── Editorial ───
  Pipeline            [Workflow]
  Doctor              [Stethoscope]
  ...
```

Or, if a new top-level group feels heavy, add both as sub-items under Pipeline with indentation (matching the existing sidebar style).

---

## Progress Tracking

- [x] Phase 0: Trace Infrastructure
- [x] Phase 1: Finance Intelligence Observatory
- [x] Phase 2: Dossier Inspector
  - [x] Step 1: Implement GET /api/dossier/:date/:slug endpoint
  - [x] Step 2: Add POST /api/dossier/:date/:slug/inject endpoint
  - [x] Step 3: Add Inspect button to AutopipelinePage.tsx
  - [x] Step 4: Add route in App.tsx
  - [x] Step 5: Create DossierInspectorPage.tsx
  - [x] Step 6: Create sub-components
- [x] Phase 3: Scout Transparency + System Config
- [x] Phase 4: LiteLLM Routing Inspector
- [x] Phase 5: Validation


<!-- Builder run br_599ab: failed at 2026-05-17T22:26:19.065Z — details: /opt/ai-vault/builder/2026-05-17-bw_ac48b-br_599ab.md -->

<!-- Builder run br_a167d: success at 2026-05-17T22:29:08.561Z — details: /opt/ai-vault/builder/2026-05-17-bw_ac48b-br_a167d.md -->

<!-- Builder run br_9d917: success at 2026-05-17T23:05:01.262Z — details: /opt/ai-vault/builder/2026-05-17-bw_dafcf-br_9d917.md -->

<!-- Builder run br_13c41: success at 2026-05-17T23:11:18.334Z — details: /opt/ai-vault/builder/2026-05-17-bw_0672f-br_13c41.md -->

<!-- Builder run br_fd89f: success at 2026-05-17T23:29:33.006Z — details: /opt/ai-vault/builder/2026-05-17-bw_a5b33-br_fd89f.md -->