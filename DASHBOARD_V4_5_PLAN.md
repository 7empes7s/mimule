# Dashboard V4.5 — New Surfaces, Agent Excellence & Subscription Intelligence Plan

Last updated: 2026-05-15 UTC
Owner: Marouane Defili
Parent plans:
- `/root/DASHBOARD_V4_PLAN.md` — actionable entity model, admin action matrix, V4.0 build phases
- `/root/DASHBOARD_V4_OBSERVABILITY_PLAN.md` — trace infrastructure, finance intel, dossier inspector, scout, LiteLLM routing log
- `/root/DASHBOARD_V4_AGENT_PAGES_PLAN.md` — dynamic skill discovery, Claude/Codex/OpenCode composer model
- `/root/DASHBOARD_V4_SCHEDULER_PLAN.md` — Builder Pipeline, durable workflow scheduler
Canonical app path: `/opt/opencode-control-surface/`
Public URL: `control.techinsiderbytes.com`

---

## Purpose

This plan collects four categories of work identified during a full gap analysis of V3 and V4 plans (2026-05-15):

1. **New surfaces** that the earlier plans either omitted entirely or left as a single line.
2. **Agent page excellence**: a significantly deeper UX for Claude, Codex, and OpenCode — context visibility, session change tracking, git snapshots, embedded on-demand shell, and session replay.
3. **Subscription intelligence**: a unified tracker for 5-hour reset windows, daily quotas, weekly limits, and runway across Claude, Codex, Gemini, GitHub Models, OpenRouter, Zen, and Go.
4. **Ratings system specification**: `RatingsPage.tsx` is already built in the codebase but has no plan document.

This plan extends the V4 family; it does not replace it. Reference parent plans for: actionable entity model, action audit contract, detection systems, SQLite ingestor, BFF envelope format, security model, and phasing rules already established.

---

## Evidence Reviewed

All five existing plan files read on 2026-05-15. Live codebase inspected:

- Existing routes: `/` `/today` `/autopipeline` `/doctor` `/models` `/newsbites` `/infra` `/incidents` `/jobs` `/audit` `/builder` `/settings` `/opencode` `/codex` `/claude` `/gemini`
- Built pages with no plan spec: `RatingsPage.tsx`, `GeminiPage.tsx`, `AuditPage.tsx`, `BuilderPage.tsx`, `TodayPage.tsx`
- Hooks already in codebase: `useVoice.ts` (inactive), `useAuthenticatedApi.ts`, `useTablePage.ts`, `useTableSort.ts`
- Components already built: `AgentComposer.tsx`, `AgentRuntimeBar.tsx`, `AgentDiscoveryStrip.tsx`, `AgentModelPicker.tsx`, `AgentVaultLogButton.tsx`, `AgentVaultLogModal.tsx`, `ConfirmModal.tsx`, `AnimatedCharts.tsx`

Confirmed not yet built or specified in any plan:
- `/assistant`, `/calendar`, `/logs`, `/subscriptions`
- Embedded shell (xterm.js + PTY within agent pages)
- Session diff/changes view (per-session file change tracker)
- Claude 5-hour reset tracker
- AI Vault browser (read-only daily + project log viewer)
- Content calendar (publishing cadence grid)
- Backup health monitoring
- Source domain reliability
- Security status surface
- Config file viewer
- Vast instance lifecycle controls
- Caddy access log parser
- Ratings system spec

---

## Route Additions

These routes are new (not in V4 IA). All follow the V4 actionable-entity model and SSE patterns.

```text
/assistant              TIB Stack Assistant — conversational AI with live stack context
/calendar               Content Calendar — publishing cadence, pipeline forecast, vertical targets
/logs                   Log Browser — unified log tail and search across services
/subscriptions          Subscription Intelligence — usage limits, reset windows, quota tracking
/vault                  AI Vault Browser — daily logs, project notes, session knowledge
/backup                 Backup & Restore Health — last run, verification, restore drill
/security               Security & Access — SSH logins, open ports, cert expiry, CF Zero Trust
```

`/vault` and `/security` fold into `/knowledge` and `/infra` respectively if a standalone page feels too heavy — the spec below is written standalone for clarity; the implementer can merge.

---

---

# Part I — New Surfaces

---

## 1. TIB Stack Assistant (`/assistant`)

### Product purpose

The command palette (V4) handles discrete known actions. The assistant handles the fuzzy, open-ended operator question: "what's wrong?", "what should I do?", "why is this failing?", "summarize what changed this week". It is not a general coding assistant — it is specifically seeded with the MIMULE stack.

### Context assembly

Every conversation turn is prefaced with a server-assembled context packet:

```typescript
interface AssistantContextPacket {
  now: string;                    // ISO timestamp
  stackSummary: {                 // from /api/home snapshot
    services: ServiceStatus[];
    gpu: GpuStatus;
    pipeline: PipelineStatus;
    vastBalance: VastBalance;
    topIncidents: IncidentSummary[];
    modelBestNow: { heavy: string; fast: string; local: string };
  };
  recentVaultEntry: string | null;    // last 500 chars of today's vault file
  systemPrompt: string;               // contents of /root/CLAUDE.md truncated to 8K
}
```

Context is cached server-side for 60s (keyed by a snapshot hash) so repeated messages in the same window don't re-read all sources.

### Routing

- Default model: `routing-cheap` — for factual stack queries this is fast and cheap.
- Auto-escalate to `editorial-cloud-heavy` if the question contains "explain why", "summarize", "write a report", "generate", or "plan".
- The model selector is exposed in the assistant UI so the operator can override.

### Action intents

Responses may include action intent blocks:

```json
{"__action": "pause-pipeline", "reason": "queue depth 75, all approvals waiting"}
```

When the BFF detects an action intent in a response, it renders it as a confirm button instead of plain text. The confirm button triggers the same `POST /api/actions/execute` path with the action id and reason pre-filled.

### Storage

New SQLite table `assistant_conversations`:

```sql
CREATE TABLE assistant_conversations (
  id TEXT PRIMARY KEY,
  title TEXT,                          -- first user message (truncated to 80 chars)
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  model_used TEXT,
  context_snapshot_id TEXT            -- FK to a snapshot row for replay
);

CREATE TABLE assistant_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id),
  role TEXT NOT NULL,                 -- user | assistant | system
  content TEXT NOT NULL,
  ts TEXT NOT NULL,
  action_intents TEXT,                -- JSON: array of detected action objects
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER
);
```

### BFF endpoints

```
GET  /api/assistant/conversations
GET  /api/assistant/conversations/:id
POST /api/assistant/conversations         start new conversation
POST /api/assistant/conversations/:id     send message, stream response via SSE
DELETE /api/assistant/conversations/:id   delete conversation
```

### UI layout

Mobile-first chat layout:
- Sticky message composer at bottom.
- Above composer: quick-action chip strip — "Stack status", "Summarize queue", "What changed today", "Best model now", "Why is doctor failing" — each sends a pre-written prompt.
- Message stream: user messages right-aligned, assistant messages left-aligned, action-intent buttons rendered inline.
- Top right: model selector pill, conversation history button.

Desktop extension: right panel shows the context packet that was used for the last response (collapsible, for debugging context quality).

### Home integration

A minimal "quick-ask" text box appears at the top of the Mission Control home page, below the Now card. Submitting it opens `/assistant` with the message pre-loaded. Two to three one-sentence responses appear inline on home without navigating away (for simple factual queries). "See full conversation" expands to the full page.

---

## 2. Content Calendar (`/calendar`)

### Product purpose

The media company needs to know: are we publishing consistently, which verticals are lagging, when will pipeline stories be ready, and what days have zero coverage?

### Data sources

All already exist. No new collection needed:
- Published articles: frontmatter `date` + `vertical` from `content/articles/*.md`.
- Pipeline queue: stage + p50 stage durations from `/api/autopipeline` → estimated completion timestamp per story.
- Dossier creation times: `fs.stat(dossierDir)` for pipeline start time.
- Coverage targets: operator-configured, stored in `system_configs` (`calendar.target.articles_per_day`, `calendar.target.per_vertical_per_week`).

### Views

**Monthly grid** (default):
- 30/31 day grid.
- Each cell: article count that day, vertical color dots (up to 6 vertical colors), "on time" badge if count ≥ daily target.
- Hover/tap cell → drawer: list of articles published that day, each linkable to live article.
- Pipeline forecast overlay (toggle): cells in the next 14 days show projected story arrivals as faded dots, based on `queuedAt + Σ remaining-stage-p50` estimate.
- Zero-coverage days: red-bordered cells (if target > 0 and no articles published).

**Weekly strip** (secondary, mobile primary):
- 7-day horizontal strip at top showing this week's actual vs target counts.
- Vertical coverage breakdown per day: horizontal mini bar per vertical.

**Vertical heatmap** (third tab):
- Grid: verticals (rows) × weeks (columns), last 12 weeks.
- Cell: article count for that vertical × week.
- Identifies systematically neglected verticals at a glance.

### Controls

| Control | Storage | Default |
|---|---|---|
| Daily target | `system_configs.calendar.target.articles_per_day` | 2 |
| Per-vertical target (per week) | `system_configs.calendar.target.<vertical>_per_week` | 1 for each |
| Show forecast | local pref | off |
| Show verticals with zero target | local pref | off (hides sports etc. if not being produced) |

### Actions

- **Create story for gap**: click a future empty day → opens a topic-inject sheet with the calendar date pre-filled as the target publish date (writes to pipeline as a `rush` with estimated schedule).
- **Mark editorial blackout**: mark a date range as intentionally empty (e.g. holidays). Removes red border for those days. Stored in `system_configs.calendar.blackout_ranges`.
- **Export calendar**: export last 30 days as a CSV (date, article count, verticals, titles).

### BFF endpoints

```
GET  /api/calendar?month=YYYY-MM          published articles + pipeline forecast for month
GET  /api/calendar/vertical-heatmap       12-week vertical × week matrix
PUT  /api/calendar/config                 update targets and blackout ranges
```

---

## 3. Log Browser (`/logs`)

### Product purpose

When something breaks, you SSH in and read logs. This brings that workflow into the dashboard — securely, with filtering, and with one-click incident linking.

### Source allowlist (server-enforced)

```typescript
const LOG_SOURCES: Record<string, LogSourceDef> = {
  "litellm":         { kind: "systemd", unit: "litellm.service" },
  "newsbites":       { kind: "systemd", unit: "newsbites.service" },
  "autopipeline":    { kind: "systemd", unit: "newsbites-autopipeline.service" },
  "control-surface": { kind: "systemd", unit: "control-surface.service" },
  "cloudflared":     { kind: "systemd", unit: "cloudflared.service" },
  "vast-tunnel":     { kind: "systemd", unit: "vast-tunnel.service" },
  "model-health":    { kind: "systemd", unit: "model-health-check.service" },
  "openclaw":        { kind: "docker",  container: "openclaw_gateway" },
  "paperclip":       { kind: "docker",  container: "paperclip" },
  "paperclip-db":    { kind: "docker",  container: "paperclip_db" },
  "doctor-log":      { kind: "file",    path: "/var/lib/mimule/doctor-log.jsonl", parse: "jsonl" },
  "pipeline-alerts": { kind: "file",    path: "/var/lib/mimule/pipeline-alerts.json", parse: "json" },
};
```

No arbitrary source access. All reads are server-side via `journalctl`, `docker logs`, or `tail`.

### UI layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Source: [litellm ▾]   Mode: [tail ● | search ○]   Lines: [200]      │
├──────────────────────────────────────────────────────────────────────┤
│ Filter: ____________________  ☐ errors only  ☐ warnings  [Apply]    │
├──────────────────────────────────────────────────────────────────────┤
│ 14:32:01 INFO  LiteLLM:RouterModule - routing editorial-heavy        │
│ 14:32:01 INFO  LiteLLM:RouterModule → nemotron: latency 312ms        │
│ 14:32:05 ERROR LiteLLM:Provider - OpenRouter 429 rate limit          │  ← amber
│ 14:32:05 INFO  LiteLLM:RouterModule → github-gpt41: fallback         │
│ 14:32:08 INFO  LiteLLM:RouterModule - success github-gpt41 488ms     │
└──────────────────────────────────────────────────────────────────────┘
│ [Create incident from selection]  [Copy command]  [Export snippet]   │
```

### Features

- **Tail mode**: SSE stream of new lines (30s auto-pause to avoid infinite scroll trap on mobile).
- **Search mode**: `GET /api/logs/:source/search?q=&since=&until=&lines=` — runs `journalctl -u <unit> -g <q> --since <since>` server-side.
- **Error/warning highlighting**: lines matching `/\b(ERROR|FATAL|CRITICAL|fail|exception|traceback)\b/i` highlighted red; `/\b(WARN|WARNING|DEPRECAT)\b/i` amber.
- **Selection and linking**: select one or more log lines → "Create incident" button appears, pre-populating an incident with the selected lines as evidence.
- **Copy command**: renders the equivalent CLI command (`journalctl -u litellm.service -n 200 --since '...'`) for pasting into a terminal.
- **JSONL smart rendering**: for `doctor-log.jsonl` and similar structured files, render as a table rather than raw text.

### BFF endpoints

```
GET  /api/logs/sources                   list allowlisted sources
GET  /api/logs/:source/tail?lines=       tail mode (SSE stream)
GET  /api/logs/:source/search?q=&since=  grep/filter mode (paginated JSON)
```

Security: server-side only. Never expose paths or commands to the client. Redact any line containing known secret patterns (`sk-`, `API_KEY=`, `token=` etc.) before returning.

---

## 4. Backup & Restore Health (Section in `/infra` or standalone `/backup`)

### Product purpose

Backups run daily at 04:00 UTC. No one looks at them until they need them. This surface makes backup health observable and restore confidence measurable.

### Data sources

- `ls -lh /opt/backups/` — list backup directories with dates and total sizes.
- `du -sh /opt/backups/*` — per-backup size.
- `system_configs.backup.last_restore_drill` — date of last successful restore drill (operator sets this manually).
- `system_configs.backup.last_backup_verified_at` — date the last backup integrity spot-check was run.
- `journalctl -u mimule-backup.service -n 1` — last run status.

### Views

**Header strip:**
- Last backup: timestamp, duration (from journal), exit status (green/red badge).
- Backup age warning: amber if last backup was > 26h ago, red if > 48h.
- Total backup storage: used / available on the backup partition.
- Backup rotation: N directories retained (should be 7), oldest date.

**Backup manifest table:**
- Each backup directory as a row: date, total size, file count, status (OK/missing/corrupt-suspected).
- Expand row → list of top-level paths included (e.g. `/opt/newsbites`, `/opt/mimoun`, `/etc/litellm`).

**Restore confidence panel:**
- Last restore drill: date (or "Never" with red badge if `system_configs` key is missing).
- Drill age warning: amber if > 90 days, red if > 180 days.
- Last verification: when the backup contents were last spot-checked.
- Disaster recovery runbook: read-only link to `/opt/ai-vault/runbooks/restore.md` (or a static embedded guide if no file exists).

**Storage growth chart:**
- Recharts AreaChart: backup storage used over last 30 days (from SQLite ingestor snapshots).
- At current rate, disk full: estimated date.

### Actions

| Action | Risk | Confirm | Notes |
|---|---|---|---|
| Run backup now | medium | yes + reason | Triggers `systemctl start mimule-backup.service` |
| Verify backup | low | no | Lists files in latest backup dir, checks expected keys exist |
| Mark restore drill done | low | yes + date | Writes `system_configs.backup.last_restore_drill` |
| Download manifest | low | no | JSON export of the backup dir listing |

### BFF endpoints

```
GET  /api/backup/status          last run, rotation state, storage used
GET  /api/backup/manifest        list all backup dirs with sizes
POST /api/backup/run             trigger backup service
POST /api/backup/verify          spot-check latest backup artifacts
POST /api/backup/mark-drill-done body: { date: string }
```

---

## 5. AI Vault Browser (`/vault`)

### Product purpose

The AI Vault at `/opt/ai-vault/` is where all agent sessions are supposed to log. It's dark — nothing reads it back. This surface makes it a first-class knowledge base.

### Data sources

- `/opt/ai-vault/daily/YYYY-MM-DD.md` — daily session logs (one file per day).
- `/opt/ai-vault/projects/*.md` — project-level knowledge files.
- `MIMULE_MASTER_PLAN_V3.md` progress log section — extracted and indexed.
- Session records from the workspace SQLite (`session_knowledge` generated from handoff packets).

### Views

**Daily Log Browser:**
- Calendar strip: last 30 days, each cell colored by whether a daily log entry exists and its approximate length (empty/short/medium/full).
- Today's entry: large status indicator — "Logged (last updated 2h ago)" or "Not yet logged (open session running)" with amber alert.
- Streak counter: "N consecutive days with vault entries".
- Click a day → rendered markdown of that day's log.
- Quick search across all daily logs: full-text, returns matching file + line + context.

**Project Notes Browser:**
- Table: project name, last modified, word count estimate, linked incidents/stories.
- Click → rendered markdown.
- Full-text search across project notes.

**Vault Completion Tracker:**
The vault completeness heatmap — 14-day view:

```
Mon   Tue   Wed   Thu   Fri   Sat   Sun
 ●     ●     ●     ○     ●     ○     ●   ← last week  (● = logged)
 ●     ●     ○     ●     ●     ●     ·   ← this week  (· = today)
```

- Missing-today alert: shown when no daily log exists for today AND an agent session ran in the last 4 hours (inferred from workspace session records).

**Session Knowledge Search:**
- Full-text search across: daily logs, project notes, handoff packets, incident postmortems.
- Results sorted by recency.
- Each result: file, date, excerpt, "continue in assistant" link.

### Actions

| Action | Notes |
|---|---|
| Create today's entry | Opens a pre-filled text editor with the date heading and a template |
| Append quick note | Single-field form appended to today's log without opening full editor |
| Create project note | New `/opt/ai-vault/projects/<name>.md` |
| Generate "what changed this week" | Calls `/api/assistant` with a pre-written weekly-summary prompt referencing vault + git logs |
| Generate continuation packet | Compiles: current stack state + last 3 vault entries + open incidents → ready-to-paste session init prompt |
| Export full vault index | JSON index of all files with metadata |

### Missing-vault alert on home

If today's vault is not yet written AND it's past 18:00 UTC, show an amber card in the decision queue on the home page: "No vault entry today — log this session before it's lost."

### BFF endpoints

```
GET  /api/vault/daily?days=30             list daily log entries (dates + metadata)
GET  /api/vault/daily/:date               full content of that day's log
POST /api/vault/daily/:date/append        append text to a day's log
GET  /api/vault/projects                  list project notes
GET  /api/vault/projects/:name            full content
POST /api/vault/projects/:name            create or overwrite project note
GET  /api/vault/search?q=&scope=          full-text search
POST /api/vault/generate/weekly-summary   calls assistant endpoint with weekly-summary prompt
POST /api/vault/generate/continuation     compiles continuation packet, returns markdown
```

---

---

# Part II — Ratings System Full Specification

---

## `RatingsPage.tsx` — Specification

`RatingsPage.tsx` exists in the codebase at `app/routes/RatingsPage.tsx` with no corresponding plan document. This section is its spec.

### Purpose

Ratings create the feedback loop missing in the current system. Right now, model selection is based on availability and latency. With ratings, it becomes quality-driven: "editorial-fast produced 4.1/5 average write quality this week, editorial-heavy 4.4/5 — the 0.3 delta is worth the latency for finance articles."

### Article Ratings

**Data model:**

```sql
CREATE TABLE article_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',          -- JSON: string[] from ARTICLE_RATING_TAGS
  notes TEXT,
  rated_at TEXT NOT NULL,
  rated_by TEXT NOT NULL DEFAULT 'operator'
);
-- unique: one rating per slug (upsert on re-rate)
```

**Rating tags (article level):**
`well-sourced`, `accurate-tone`, `excellent-depth`, `weak-sources`, `bland-writing`, `needs-editing`, `factual-error`, `great-headline`, `poor-digest`, `strong-visual-hook`

**Where ratings appear:**
- `/newsbites` article table: star icons on each row (1–5 stars), click to rate.
- `/autopipeline` queue: rating badge on published articles linked to the approval item.
- Dossier inspector: "Article rated N/5" badge on the publish preview tab.
- `/ratings` dedicated page: full browsable table of all rated articles.

### Stage Ratings

After a story is published, the operator can optionally rate each stage's model output:

```sql
CREATE TABLE stage_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  stage TEXT NOT NULL,                      -- research | write | verify | publish-prep
  model TEXT NOT NULL,                      -- logical model name
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',          -- JSON: string[] from STAGE_RATING_TAGS
  notes TEXT,
  rated_at TEXT NOT NULL
);
```

**Rating tags (per stage):**
- research: `good-source-diversity`, `missed-key-source`, `correct-angle`, `wrong-angle`, `too-shallow`, `comprehensive`
- write: `accurate-voice`, `correct-framing`, `too-long`, `too-short`, `bland`, `engaging`
- verify: `thorough`, `over-strict`, `missed-issues`, `correct-verdicts`, `flagged-non-issues`
- publish-prep: `strong-headline`, `weak-headline`, `good-digest`, `bad-digest`, `good-tags`, `off-tags`

### `/ratings` Page Layout

**Tab 1: Articles**
- Sortable table: title, vertical, published date, rating (stars), tags.
- Filter by: rating range, vertical, tags, date range.
- Unrated published articles first (sorted by newest) to surface rating backlog.
- Bulk rating: select multiple unrated articles → rate all as N stars (useful for bulk quality acknowledgement).
- "Unrated count" badge on the page nav item.

**Tab 2: Stage Quality**
- For each model+stage combination, show:
  - Average rating (last 30d, all time).
  - Rating count.
  - Tag frequency (which tags appear most for this model at this stage).
  - Trend sparkline: average rating over last 8 weeks.
- Sort by: model, stage, average rating (ascending to find weakest).
- "Model risk" badge: if a model's average for a stage is < 3.0 and has ≥ 5 ratings, show a "low quality" warning that links to `/models` for action.

**Tab 3: Correlation Analysis**
- Scatter plot (Recharts ScatterChart): x-axis = publish-to-rating latency (days), y-axis = rating. Identifies whether quick approvals correlate with lower quality.
- Bar chart: average article rating by vertical (which verticals produce consistently better content?).
- Bar chart: average stage rating by model, per stage (the key quality-routing signal).

### Integration with model selection

The BFF endpoint `/api/models` should include a new field in each model entry:

```typescript
interface ModelRatings {
  avgArticleRating: number | null;    // avg of article_ratings for articles where this model did write
  avgStageRatings: Record<string, number | null>;  // per stage
  ratingCount: number;
  ratingCountByStage: Record<string, number>;
  qualityTrend: "improving" | "stable" | "degrading" | "insufficient-data";
}
```

This feeds the `/models` scorecard and the fallback chain optimizer.

### BFF endpoints

```
GET  /api/ratings/articles?unrated=&vertical=&since=
POST /api/ratings/articles/:slug           rate or re-rate an article
GET  /api/ratings/stages?model=&stage=
POST /api/ratings/stages                   rate a stage output
GET  /api/ratings/summary                  aggregate per model+stage
GET  /api/ratings/correlation              scatter data + vertical averages
```

---

---

# Part III — Agent Page Excellence

---

## Shared Enhanced Agent Session Model

The V4 and agent-pages plans define a workspace session model. This section augments it with the fields needed for deep session intelligence.

```typescript
interface AgentSession {
  id: string;
  agent: "claude" | "codex" | "opencode" | "shell";
  label: string;
  cwd: string;
  workspaceRootId: string;
  model?: string;
  profile?: string;
  skills?: string[];

  // process state
  pid?: number;
  startedAt: string;
  lastActivityAt: string;
  exitCode?: number;
  status: "running" | "idle" | "waiting-input" | "completed" | "failed" | "killed";

  // context window (live, updated per tool call)
  contextWindow?: {
    usedTokens: number;
    maxTokens: number;
    pct: number;
    filesInContext: string[];     // paths that have been read
    memoryFilesLoaded?: string[]; // for Claude: memory files in context
    claudeMdChain?: string[];     // for Claude: CLAUDE.md hierarchy loaded
  };

  // cost tracking (cumulative for session)
  cost?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    estimatedUsd: number;
    modelRateInputPer1M: number;
    modelRateOutputPer1M: number;
  };

  // git snapshots
  gitSnapshotBefore?: {
    branch: string;
    headHash: string;
    dirty: boolean;
    untrackedCount: number;
  };
  gitSnapshotAfter?: {
    branch: string;
    headHash: string;
    dirty: boolean;
    newCommits: string[];         // commit hashes made during session
    changedFiles: FileChange[];
  };

  // session impact (computed at close)
  impactScore?: number;           // 0–100: files changed × complexity + test delta
  typecheckBefore?: TypecheckResult;
  typecheckAfter?: TypecheckResult;
  testResultBefore?: TestResult;
  testResultAfter?: TestResult;

  // vault
  vaultLogPath?: string;          // path in /opt/ai-vault where this session was logged
  handoffPacketPath?: string;     // path to generated handoff .md
}

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
}
```

---

## Claude Code Page — Deep Specification

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [← Dashboard]   Claude Code — /opt/opencode-control-surface   [+ New] │
├──────────────┬──────────────────────────────────────┬───────────────────┤
│ Session Rail │ Transcript / Task                    │ Context & Changes │
│              │                                      │                   │
│ ● Active     │  messages / tool calls / approvals   │  [Context] [Diff] │
│   session    │                                      │  [Git] [Files]    │
│              │                                      │                   │
│ ○ Session 2  │                                      │                   │
│ ○ Session 3  │                                      │                   │
│              │                                      │                   │
├──────────────┴──────────────────────────────────────┴───────────────────┤
│ [Shell]  $ bun run typecheck                                             │
│ [AI Vault Log]  [Subscription]  [Settings]                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context Panel (right drawer, Context tab)

Shows exactly what Claude "knows" in the active session:

- **Context window gauge**: circular progress ring showing `usedTokens / maxTokens`. Color: green < 60%, amber 60-85%, red > 85%.
- **Files in context**: list of every file Claude has read this session (extracted from tool call events). Expandable to show which parts were read (offset + lines).
- **CLAUDE.md chain**: which CLAUDE.md files are active (project → user). Expand to see the first 200 chars of each.
- **Memory files**: which files from `/root/.claude/projects/-root/memory/` are loaded. Links to `/vault`.
- **Active MCP servers**: each server listed with connection status (green/red dot), tool count, last used.
- **Active hooks**: pre-tool, post-tool, stop hooks configured. Source: `~/.claude/settings.json` and `.claude/settings.json`.
- **Permission mode**: `default` / `dontAsk` / `bypassPermissions` — with a badge if running as root.
- **"Context nearly full" alert**: when pct > 80%, show an amber bar with action: "Save handoff packet now" (generates a continuation packet and logs to vault before the session degrades).

### Changes Panel (right drawer, Diff tab)

Shows what has changed in the workspace since session started:

```
Files Modified: 4      Lines: +234 / -89
Files Created: 1       Net: +145 lines
─────────────────────────────────────────
▸ app/routes/NewsBitesPage.tsx    +45/-12  [view diff] [revert]
▸ server/api/router.ts            +89/-31  [view diff] [revert]
▸ server/adapters/newsbites.ts    +67/-23  [view diff] [revert]
▸ app/globals.css                 +33/-23  [view diff] [revert]
★ server/db/schema.ts             NEW      [view file] [delete]
```

- Each file expandable to a unified diff view with syntax highlighting.
- Revert: single-file `git checkout -- <path>` (confirm-gated, medium risk).
- "Commit all" button: stages all changes and commits with a pre-filled message from the session label. Opens a confirm sheet showing the full diff summary.
- "Create PR" button: if the current branch is not `master`/`main`, offers to push and open a PR (links to `/workspace` for the actual operation).

### Git Panel (right drawer, Git tab)

- **Pre-session snapshot**: branch, HEAD hash, dirty state.
- **Current state**: HEAD hash (if commits were made), new dirty files.
- **Commits this session**: list of commits made, each with hash + message + changed files.
- **Branch controls**: create branch, push to origin (confirm-gated for master).
- **Stash**: show unstashed changes if any; offer stash/unstash.

### Slash Command & Skill Launcher

A discoverable interface for all Claude commands and skills:

- Type `/` in the composer → filtered list of available slash commands (from dynamic discovery endpoint: `/api/agents/commands?agent=claude`).
- Each command shows: name, description, source (built-in/skill/plugin), example usage.
- Stack skills prominently grouped: `pipeline`, `stack-status`, `gpu-health`, `newsbites-devcheck`, `tib-deploy`, etc.
- Recent skills used: last 5 at the top for quick re-use.
- Skill preview: hover/tap a skill → description and sample usage shown in a tooltip.

### Subscription Status Bar

Persistent strip below the composer:

```
[ Claude Pro  ████████░░░░ 63% used  ~2h 40m until reset  |  Sonnet 4.6  |  ⊙ cost: $0.04 ]
```

- Tapping this strip opens the full `/subscriptions` page.
- If usage is > 85%, the bar turns amber with a "Save handoff packet" CTA.
- If a 429 has been received in this session, show "LIMIT HIT — resetting at HH:MM UTC" in red.

### Settings Intelligence Panel

Accessible via the gear icon in the session header:

- Rendered view of `~/.claude/settings.json` (sanitized — no token values shown).
- Current permission allowlist: which tools have been approved.
- Hooks configured: list with type (pre-tool/post-tool/stop/user-prompt-submit) and the command they run.
- Environment: which env vars are visible to Claude (keys only, values redacted).
- "Create agent task to update settings" quick-launch.

---

## Codex Page — Deep Specification

### Cloud Task Panel

Codex can create and manage cloud tasks. This panel surfaces them:

```typescript
interface CodexCloudTask {
  id: string;
  description: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  model: string;
  createdAt: string;
  completedAt?: string;
  outputSummary?: string;
  diffUrl?: string;
  prUrl?: string;
  cost?: { tokens: number; estimatedUsd: number };
}
```

- List view: ID, description, status badge, created time, cost.
- Click a task → drawer: full output, diff view if available, PR link if created.
- **Apply cloud task**: if a cloud task produced file changes, offer "apply to local" — copies the diff into the workspace and shows it in the Changes panel.
- **Re-run failed task**: with model and prompt override.
- **Reject task**: discards the cloud output with reason.

### Local vs Cloud Indicator

Every session has an explicit execution surface badge:
- `local shell on VPS` — running as PTY on the Hetzner host.
- `local agent on VPS` — Codex CLI spawned locally.
- `codex cloud task` — delegated to OpenAI cloud infrastructure.
- `github cloud task` — delegated via GitHub Copilot workspace.

This is non-negotiable per V4's principle: "never blur execution surfaces."

### Sandbox/Approval Mode Switcher

Persistent header chip showing current mode: `full-auto` / `auto-edit` / `ask` / `suggest`.
- One-click mode toggle for the current session (visible in the session launcher and session header).
- Mode description tooltip: what file operations, commands, and network calls are allowed at each level.
- Mode change is logged to the action audit.

### JSONL Event Stream Viewer

- Toggle: "Show raw event stream" → opens a panel with the Codex JSONL event stream for the active session.
- Events rendered as a timeline: tool_call, tool_result, message, command, edit, test_run.
- Each event is collapsible. File edit events show a mini inline diff.
- Useful for understanding what Codex did during autonomous runs.

### Skills & Plugin Browser

- Source: dynamic discovery from `~/.codex/skills/` and `~/.codex/plugins/cache/`.
- Each plugin shows: name, version, skill count, last updated.
- Each skill shows: name, description, source plugin, usage count (from `session_events` in SQLite).
- "Add to next session" toggle: pins a skill for use in the next launch.

### Output File Panel

- When `--output-last-message` is in use, show the output file content in a dedicated panel.
- Structured JSON output rendered as a formatted object.
- "Use as agent input" button: inserts the structured output as context for the next session.

---

## OpenCode Page — Deep Specification

### Why OpenCode deserves equal depth

OpenCode is the primary IDE-style agent in the control surface. The SDK is already wired in. V4.5 should close the gap between OpenCode and Claude/Codex pages so all three are equally capable.

### Session List Rail

Mirrors the Claude session rail but uses OpenCode SDK:

- All sessions from `opencode session list` — id, title, model, created, last active, status.
- Resume: click any non-terminated session → loads transcript and reconnects.
- Search: filter by title, model, cwd.
- Delete: with confirm sheet and vault-log prompt.
- Export: download session as Markdown to local vault.
- Import: paste a previous session ID or upload a session export to resume.

### Context Visibility Panel

Same as Claude, adapted for OpenCode:

- **Context window gauge**: sourced from OpenCode SDK session stats.
- **Files in context**: read from SDK session file refs or by parsing transcript tool calls.
- **Provider & model**: live display of current provider (`anthropic`, `openai`, `google`, etc.) and model.
- **Cost stats**: from OpenCode provider cost tracking (`opencode stats` output).
- **MCP servers**: list of connected MCP servers with tool/resource counts, OAuth state, and per-server enable/disable toggle.
- **Permission rules**: current rules from OpenCode config — what tool use is permitted.

### Changes Panel

Identical spec to the Claude Changes panel — built on the same `GET /api/workspace/diff?sessionId=` endpoint. Both agents write files through the same VPS filesystem; the diff engine is provider-agnostic.

### Git Panel

Same as Claude Git panel.

### Embedded On-Demand Shell

This is the defining V4.5 feature for agent pages. Every agent page (Claude, Codex, OpenCode) gets a shell panel at the bottom.

Full spec in the dedicated Embedded Shell section below.

### Provider & Model Selector (mid-session switching)

OpenCode supports switching providers and models during a session. Surface this:

- Header chip: `[anthropic: claude-sonnet-4-6 ▾]`
- Dropdown: shows all providers from OpenCode's installed provider list (`opencode providers list`).
- Per provider: available models with cost and context window.
- Switch: changing mid-session sends the new model selection to the active session.
- Cost implication: show estimated remaining session cost with the selected model vs cheapest available.

### Stats Dashboard (per-session and all-time)

```
┌─────────────────────────────────────────────────────────┐
│ OpenCode Stats                              [last 30d ▾] │
├──────────────────┬──────────────────────────────────────┤
│ Sessions         │  47        │  This week: 12           │
│ Avg duration     │  18m       │  Longest: 2h 14m         │
│ Total tokens     │  4.2M      │  Cached: 31%             │
│ Estimated cost   │  $8.42     │  Cost/session: $0.18     │
│ Most used model  │  sonnet-4.6│  Opus: 8 sessions        │
│ Most used cwd    │  control-surface (22x)                │
└─────────────────────────────────────────────────────────┘
```

- Sourced from session SQLite records + OpenCode SDK stats if available.
- Drilldown: click any metric → filtered session list.

### MCP Server Manager

- List of configured MCP servers from `~/.opencode/config.json`.
- Per server: status badge, tool list (expandable), resource list, OAuth state.
- **Test tool**: select a tool → enter parameters → run → see raw response in a modal.
- **Enable/disable**: toggle a server without editing config (writes a `disabled: true` flag to the config, hot-reloads if OpenCode supports it).
- **Add new server**: form to add an MCP server by URL + auth type. Writes to config and triggers a server reload.
- **Debug view**: show the last N MCP calls for a server with request/response.

### Subagent Tracking

When OpenCode spawns subagents during a session:
- Timeline entry for each subagent: which agent was spawned, with what prompt, at what time.
- Subagent results: their output, files touched, and cost contribution.
- "Open subagent as separate session" action: promote a subagent run to a first-class session for inspection.

---

## Embedded Shell — Full Specification

The embedded shell is the operator's power tool for in-context verification. Rather than opening a separate terminal, the shell lives inside the agent page so the operator can test immediately after the agent makes changes.

### Architecture

**Server side:**
- PTY broker under `server/workspace/pty.ts`.
- Each shell is a `node-pty` (or Bun-compatible) instance with a bounded output buffer.
- Shell transport: WebSocket (not SSE) for low-latency bidirectional communication.
- Session persistence: PTY process survives browser disconnects; the client reconnects within 30 minutes by session ID.
- Output storage: last 10,000 lines stored in SQLite `shell_output` table (ring-buffer); older lines purged.
- Bounded per-shell: max 3 concurrent shells per workspace root.

**Client side:**
- `xterm.js` with `@xterm/addon-fit` and `@xterm/addon-web-links`.
- Terminal theme matches the dashboard dark palette.
- Font: `JetBrains Mono` or `Fira Code` if installed; fallback to `monospace`.

### UI placement

- Bottom panel in every agent page (Claude, Codex, OpenCode).
- Collapsed by default (shows a single-line "$ __ " strip).
- Expand button or drag-handle to reveal full terminal height.
- "Pop out" button: opens in a full-screen overlay (useful for long operations).
- Tab strip: `Shell 1`, `Shell 2`, `+ Add` — up to 3 shells per session.

### Quick Command Shortcuts

A row of chip buttons above the shell input:

| Chip | Command |
|---|---|
| `tsc` | `bun run typecheck` |
| `test` | `bun run test` |
| `build` | `bun run build` |
| `gs` | `git status --short` |
| `gd` | `git diff --stat` |
| `gl` | `git log --oneline -10` |
| `deploy` | `cd /opt/newsbites && ./deploy.sh` (only in /opt/newsbites root) |
| `health` | `curl -s http://127.0.0.1:3200/health` (only in pipeline-relevant roots) |

Quick commands are context-sensitive: the set shown depends on the current `cwd` (e.g. the deploy chip only appears if the workspace root is `/opt/newsbites`).

Custom aliases stored per workspace root in `system_configs.shell.aliases.<root_id>`.

### Shell ↔ Agent Integration

The shell and agent session communicate through coordinated affordances:

1. **Forward to agent**: select shell output (click-drag) → "Share with agent" button appears → selected text is appended as a user message in the active agent session. Useful for: "here's the typecheck error — fix it."

2. **Agent suggests, you run**: when an agent response contains a code block starting with `$ ` or a bash block, a "▶ Run" button appears next to it in the transcript. Click → sends the command to the active shell without needing to copy-paste.

3. **Auto-validate**: when the agent session completes (exit or idle), the shell optionally runs a configurable validation script and shows the result as a session summary badge — "✓ typecheck passed", "✗ 2 test failures". This is driven by a per-workspace `validate.sh` or the `check` npm script if present.

4. **Output capture for context**: the shell has an optional "recording mode" where its stdout is forwarded as context injection into the agent session automatically (like piping the terminal into Claude). This is an explicit toggle (not default) due to potential noise.

### Mobile Shell

On phones and tablets:
- Shell accessible as a bottom sheet: swipe up from the bottom edge.
- Keyboard shortcut strip pinned above the software keyboard: `Tab`, `Ctrl+C`, `↑`, `↓`, `Esc`, `Ctrl+D`.
- Virtual function keys: `F1`–`F10` in a horizontal scroll strip.
- Shell font size 14px minimum.
- "Keep screen awake" auto-activated when shell is open.

### Security

- All shell sessions require `X-Operator-Token`.
- Shell cwd is restricted to allowlisted workspace roots.
- High-risk roots (`/opt/newsbites`, `/opt/mimoun`) show a persistent amber banner.
- Shell cannot `cd` outside its registered workspace root (server-side enforcement via resolving the cwd after each `cd` and disconnecting if it escapes the root).
- Known secret patterns are redacted from stored output (regex list configured in settings).
- Shell sessions are logged to action audit with start/end times and cwd.

---

## Session Intelligence & Handoff System

### Session Impact Score

Computed when a session ends:

```typescript
function computeImpactScore(session: AgentSession): number {
  const fileScore = Math.min(session.gitSnapshotAfter.changedFiles.length * 8, 40);
  const lineScore = Math.min(totalInsertions * 0.05, 20);
  const commitScore = Math.min(session.gitSnapshotAfter.newCommits.length * 5, 15);
  const testDelta = session.testResultAfter?.passPct - session.testResultBefore?.passPct;
  const testScore = testDelta > 0 ? Math.min(testDelta * 2, 15) : 0;
  const typecheckScore = session.typecheckAfter?.errorCount < session.typecheckBefore?.errorCount ? 10 : 0;
  return Math.round(fileScore + lineScore + commitScore + testScore + typecheckScore);
}
```

Score bands: `0–20` Low impact · `21–50` Moderate · `51–80` Significant · `81–100` High

Displayed as a badge next to each session in the history list. Useful for: "which session this week did the most meaningful work?"

### Code Quality Delta

Shown in a session summary card after the session ends:

```
Session Quality Delta
────────────────────────────────────────────
TypeScript errors   before: 12    after: 0    ▼ 12
Test pass rate      before: 89%   after: 94%  ▲ 5pp
Bundle size         before: 512KB after: 521KB ▲ 9KB
Net lines changed   +234 / -89   = +145 net
────────────────────────────────────────────
Impact Score: 74 / 100  ●●●●○
```

Data captured by the BFF: runs `bun run typecheck 2>&1 | grep -c error` and `bun run test --reporter=json` before and after the session (with the operator's opt-in — these checks take seconds).

### Session Replay

Stored enough metadata to replay "what happened" visually:

- `session_events` SQLite table: every tool call, file change, shell command, and agent message stored with timestamps.
- Replay mode: a scrubber UI in the session history view allows stepping through events in order.
- Each step shows: what was the agent doing, what file was being edited, what command was running.
- Useful for: reviewing what an autonomous overnight session did.

### Handoff Packet Generator

For every session, the operator can generate a continuation packet:

```markdown
## Handoff: <session label>

**Date**: 2026-05-15 14:32 UTC
**Agent**: Claude Code  |  **Model**: claude-sonnet-4-6
**Workspace**: /opt/opencode-control-surface  |  **Branch**: master

### State
- HEAD: abc1234 — "feat: add ratings page"
- Dirty files: 0
- TypeScript: 0 errors
- Tests: 47/47 passing

### What was done
- Implemented RatingsPage.tsx with article and stage rating tables
- Added /api/ratings/* BFF endpoints in router.ts
- Wired stage_ratings SQLite table in server/db/schema.ts

### What is left
- Connect rating averages to /models scorecard (server/adapters/models.ts)
- Add "unrated" badge count to nav item
- Mobile layout for the ratings table (currently breaks at <400px)

### Open blockers
- None

### Recommended next session
"Continue the ratings integration: wire avgStageRatings into /api/models and add the unrated badge count to DashSidebar nav. Then test mobile layout at 375px."
```

- Generated by calling the assistant endpoint with a structured prompt fed from session metadata.
- Saved to `/opt/ai-vault/daily/YYYY-MM-DD.md` automatically (with operator opt-in) or to a standalone file.
- "Copy as new session prompt" button: pastes the "Recommended next session" line as the opening message for a new session.

---

---

# Part IV — Subscription Intelligence System

---

## Overview

### Why this matters

Claude Code hit a 429 usage-limit during a dashboard planning session (documented in `DASHBOARD_V4_AGENT_PAGES_PLAN.md`). The system continued because it fell back to the subscription-backed CLI path. But the operator had no visibility into: how close was it to the limit, when would it reset, which model was burning usage fastest, and whether switching to Sonnet would have extended the window.

This surface answers all of that.

### Route

`/subscriptions` — accessible from the nav and from the subscription status bar on every agent page.

### The 5-Hour Reset Tracker (Claude Code)

Claude Code subscriptions use rolling 5-hour windows. This is the central feature:

**Detection method:**
- Parse `journalctl -u control-surface.service --since "7 days ago"` for lines matching `resets.*UTC` or `usage.*limit` or HTTP 429 responses from the Claude CLI process.
- Extract the reset timestamp from the error message: `"resets 11:10am (UTC)"`.
- Store each observed 429 event in `subscription_events`:

```sql
CREATE TABLE subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,           -- claude | codex | gemini | github-models | openrouter | zen | go
  event_type TEXT NOT NULL,        -- limit_hit | reset | rate_limit | quota_warning | usage_sample
  observed_at TEXT NOT NULL,       -- ISO timestamp when we detected the event
  reset_at TEXT,                   -- when the service said the limit resets
  detail TEXT                      -- JSON: model, window_hours, additional context
);
```

**Reset window computation:**
- Last observed reset for Claude = `MAX(observed_at) WHERE event_type = 'limit_hit'` → `reset_at`.
- Next expected reset = `reset_at + 5h` (with ±15 min uncertainty indicator).
- If no recent 429: infer "window probably still open" without a hard expiry.

**Usage estimation:**
- Count agent sessions started since `reset_at`.
- Each session has a `cost.estimatedUsd` and `cost.inputTokens` from the session model.
- Model-specific burn rate: Opus burns ~5x faster than Sonnet. Use this to estimate "% of window used".
- Show as a visual gauge: `████████░░  78% estimated used`.

**Weekly pattern chart:**
- Recharts LineChart: x-axis = day of week + hour, y-axis = limit-hit probability (based on last 4 weeks of event history).
- Reveals: "you almost always hit limits on Tuesday 10-11am UTC". 
- Practical use: schedule heavy agent sessions outside the peak window.

### Provider Cards

Each subscription shows a compact card on `/subscriptions`:

---

#### Claude Code

```
Claude Code Pro                                           [▼ Expand]
──────────────────────────────────────────────────────────────────
Usage gauge    ████████░░░░░  63% estimated used
Next reset     ~2h 40m  (est. 17:15 UTC)   [last 429: 14:35 UTC]
This session   Sonnet 4.6 ×12 calls, $0.04  |  Opus: 0 calls
Today          3 sessions, ~$0.31 estimated
This week      14 sessions, limit hit 2×  |  Worst day: Wednesday
Plan           Pro (upgrade to Max5x would give 5× headroom)
```

Upgrade recommendation: computed from event history — "you've hit the limit 8+ times in the last 4 weeks. Max5x is ~$80/mo more and would prevent all of these."

---

#### GitHub Models (GPT-4.1 and others)

```
GitHub Models                                             [▼ Expand]
──────────────────────────────────────────────────────────────────
GPT-4.1        89 / 150 req/day  ████████░░  59% used
               Resets: midnight UTC  |  Remaining: 61 requests
Other models   (Mistral, Phi) — usage not tracked (free tier)
Today          Used for: pipeline verify × 31, writing × 27
Recommendation  At current rate: limit by ~21:00 UTC today
```

Detection: parse model-health.json for rate-limit signals on `github-gpt41` model. If the model shows `available: false` with `lastError` matching 429, log an event.

---

#### OpenRouter

```
OpenRouter                                                [▼ Expand]
──────────────────────────────────────────────────────────────────
Balance        $31.42 remaining
Today spend    $0.87  (47 req, 2.1M tokens)
Projected/mo   $26 at current rate
Free models    nemotron: 312 req today (free tier)  |  rate-limit: 0×
Paid models    github-gpt41-via-OR: 0 req today
API health     last check: 2m ago, all models responding
```

Source: `GET https://openrouter.ai/api/v1/auth/key` (returns `credit_remaining`, `usage`) — called by a new `server/adapters/subscriptions/openrouter.ts` adapter that caches the result 15min.

---

#### Gemini API

```
Gemini API (Free Tier)                                    [▼ Expand]
──────────────────────────────────────────────────────────────────
Flash 2.5      RPM: 14/15  ████████████░  93% RPM   ← WARN
               RPD: 743/1500  ██████░░░░  50% RPD
               TPM: 820K/1M  ████████░░░░  82% TPM
Pro 1.5        RPD: 2/50   ░░░░░░░░░░░  4% RPD
Notes          RPM pressure on Flash — consider routing to Pro for brief runs
```

Detection: read model-health.json for `openrouter-gemma4-31b-free` and direct Gemini models. Rate-limit signals from doctor-log and pipeline-alerts.

---

#### Zen & Go Slots

Pre-configured extensible slots for providers discovered in the live LiteLLM config or model-health.json. Any provider not in the above list that appears in `model-health.json.models[].provider` gets an auto-generated card with:
- Model list.
- Available/unavailable status.
- Last rate-limit error (if any in doctor-log).
- "Manual quota" override: operator can manually configure a daily limit if the provider doesn't expose one programmatically.

---

### Subscription Intelligence Widget on Home

A new home page widget (group: Cross-cutting, position after Vast balance + runway):

```
Subscription Windows
─────────────────────────────────────────────────
Claude Pro    ████████░░  63%  ~2h 40m reset
GitHub Models ████████░░  59%  61 req left today
OpenRouter    $31.42 left  |  $0.87 today
Gemini Flash  ████████████░  93% RPM  ← WARN
```

Tap → `/subscriptions`.

---

### SQLite Schema Additions for Subscriptions

```sql
CREATE TABLE subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('limit_hit','reset','rate_limit','quota_warning','usage_sample')),
  observed_at TEXT NOT NULL,
  reset_at TEXT,
  detail TEXT
);
CREATE INDEX idx_sub_events_service_time ON subscription_events(service, observed_at DESC);

CREATE TABLE subscription_state (
  service TEXT PRIMARY KEY,
  last_reset_at TEXT,
  next_reset_est TEXT,
  current_usage_pct REAL,
  balance REAL,
  daily_spend REAL,
  last_sampled_at TEXT NOT NULL,
  extra TEXT                       -- JSON: provider-specific fields
);
```

Ingestor writes to `subscription_state` every 15 minutes. The BFF reads it directly for /subscriptions and home widget.

### BFF endpoints

```
GET  /api/subscriptions                  all provider cards
GET  /api/subscriptions/:service         single provider detail
GET  /api/subscriptions/events?service=&since=   event history
POST /api/subscriptions/:service/manual-config   set manual quota/reset overrides
GET  /api/subscriptions/weekly-pattern   hourly heatmap for limit events
```

---

---

# Part V — Additions to Existing Routes

---

## Home Page Additions

### Stack Health Score

A single composite metric (0–100) that answers "how healthy is the stack right now?" in one number.

**Computation:**

```typescript
function computeStackHealthScore(homeSnapshot: HomeApiResponse): number {
  let score = 100;
  // Service health: -10 per failed critical service
  const criticalServices = ["newsbites","autopipeline","litellm","openclaw","cloudflared"];
  criticalServices.forEach(s => {
    if (homeSnapshot.services.find(x => x.name === s)?.status === "failed") score -= 10;
  });
  // GPU: -15 if GPU is down (everything degrades to cloud)
  if (homeSnapshot.gpu.status === "down") score -= 15;
  // Vast runway: -10 if < 12h, -5 if < 24h
  if (homeSnapshot.vastBalance.runwayHours < 12) score -= 10;
  else if (homeSnapshot.vastBalance.runwayHours < 24) score -= 5;
  // Doctor: -2 per abandoned story in last 24h, cap -20
  score -= Math.min(homeSnapshot.doctor.abandonedLast24h * 2, 20);
  // Pipeline: -10 if paused > 4h
  if (homeSnapshot.pipeline.paused && homeSnapshot.pipeline.pausedAgeH > 4) score -= 10;
  // Model health: -5 per blocked model, cap -15
  score -= Math.min(homeSnapshot.models.blocked * 5, 15);
  // Subscription: -5 if any key subscription is > 85% used
  if (homeSnapshot.subscriptions?.claudeUsagePct > 0.85) score -= 5;
  return Math.max(0, Math.round(score));
}
```

**Display:** Large number at the top of the Now card with a color band (green 80+, amber 60-79, red <60). A one-line health narrative below: "2 blocked models and GPU tunnel down are dragging the score."

**History:** 7-day sparkline of the health score (from SQLite ingestor snapshots). Shows "worst day was Monday at 42 — GPU was down for 6 hours."

---

### "I'm Back" Mode

When the operator opens the dashboard after > 4 hours away (detected from `operator_state.last_visit_ts`), the home page shows a full-viewport "since you were gone" summary for the first 60 seconds:

```
┌────────────────────────────────────────────────────────┐
│  Since your last visit (6h ago)                        │
├────────────────────────────────────────────────────────┤
│  Published      +14 articles  |  Queue cleared by 31   │
│  Incidents      2 opened, 1 resolved  ← needs action   │
│  Models         nemotron added to rotation (new)       │
│  Vast balance   -$0.83  →  $10.41 remaining            │
│  Claude limit   hit once at 16:30 UTC, reset at 21:30  │
│  Doctor         3 repairs (2 requeued, 1 abandoned)    │
├────────────────────────────────────────────────────────┤
│  [Dismiss]                           [See decisions ▶] │
└────────────────────────────────────────────────────────┘
```

Dismisses on scroll, on "Dismiss" click, or automatically after 60s. Data is a diff of snapshots between `last_visit_ts` and now (requires the SQLite ingestor to be running).

---

### Opportunity Cards

A new section on the home page: proactively surfaced editorial and operational opportunities.

Examples of auto-generated opportunity cards:

```
📊 Finance vertical gap
BTC is up 18% this week. Finance vertical hasn't published in 5 days.
Scout run would find 3-5 good candidates.
[Run scout now]  [Dismiss for 24h]
```

```
⚡ New free model available
openrouter-gemma4-31b-free discovered in last health check.
Bench tested: 89ms p50, json_ok. Ready to add to write-stage chain.
[Add to fallback chain]  [Evaluate first]  [Dismiss]
```

```
💰 Cost anomaly
Yesterday's pipeline spent $1.42 (avg $0.38). 3 long-running research stages
ran on editorial-heavy (47K tokens each). Consider research-stage token cap.
[View cost breakdown]  [Create agent task to add cap]  [Dismiss]
```

These are generated by the existing detection systems (V4 plan) plus new heuristics:
- **Editorial gap detector**: no article in a vertical for N days while scout feeds show topic activity.
- **New model opportunity**: model-health-check found new model with good latency and json_ok.
- **Cost anomaly detector** (already in V4 detection systems list).
- **Content quality opportunity**: vertical has a cluster of low-rated articles → suggest regeneration.

Stored in the `events` table with `source = 'opportunity'` and a dismiss mechanism (sets `dismissed_until` field).

---

## `/models` Additions

### Provider Pricing Table

New sub-tab "Pricing" in `/models`:

| Model | Provider | Input $/1M | Output $/1M | Context | Capabilities |
|---|---|---|---|---|---|
| nemotron-3-super:free | OpenRouter | free | free | 128K | code, json, function-calling |
| github-gpt41 | GitHub/Azure | $2.00 | $8.00 | 1M | code, vision, function-calling |
| editorial-heavy → gemma4:26b | Local GPU | $0.00 | $0.00 | 32K | — |
| editorial-cloud-heavy | nemotron → gpt41 | free/$2.00 | free/$8.00 | — | chain |

Pricing source: `system_configs.model_pricing.<model>` — operator-managed (no live provider API yet; manual entry is acceptable). Show "unset" for models with no pricing configured. "Enter price" inline editable field.

**Cost per article estimate:** Shown at the bottom of the pricing tab. Based on average stage token usage from the last 50 completed dossiers × configured price per model.

### Model Evaluation Jobs

New action button on `/models`: "Run evaluation job for selected models".

A model evaluation job:
1. Selects 10 recent dossier write-stage inputs from the last 14 days (research output → write prompt).
2. Runs each input through model A and model B in parallel (via LiteLLM direct call).
3. Evaluates output quality via a third model (judge prompt: "rate these two article drafts 1–5 for: accuracy, depth, voice consistency, SEO quality").
4. Stores results in `model_eval_runs` SQLite table.
5. Shows winner: "Model A won 7/10 on depth, Model B won 8/10 on voice. Overall: Model A recommended for write stage."

```sql
CREATE TABLE model_eval_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  stage TEXT NOT NULL,           -- write | verify | research
  sample_count INTEGER,
  results TEXT NOT NULL,         -- JSON: [{input_slug, a_score, b_score, judge_reasoning}]
  winner TEXT,
  status TEXT NOT NULL
);
```

---

## `/infra` Additions

### Security Status Section

New section at the bottom of `/infra`:

**SSH & Access:**
- Last 10 SSH login events: timestamp, user, from IP, success/fail.
- Source: `journalctl -u ssh -n 50 | grep -E "Accepted|Failed"`.
- Failed login attempts in last 24h: count with amber/red threshold (>10 amber, >50 red).
- "Unusual login" alert: IP not seen before, or login outside operating hours (configurable: `security.expected_ip_prefix` in `system_configs`).

**TLS Certificate Expiry:**
- For each subdomain in the Caddyfile (`news`, `paperclip`, `mimoun`, `goblin`, `dashboard`, `terminal`, `opencode`, `control`):
  - Certificate expiry date.
  - Days remaining — amber < 30, red < 7.
- Source: `echo | openssl s_client -connect <subdomain>:443 2>/dev/null | openssl x509 -noout -dates`.

**Open Ports:**
- Table from `ss -tlpn`: port, service name, bind address (public / localhost-only).
- Alert: if any service is bound to `0.0.0.0` that is not Caddy (ports 80/443) or Docker networking — flag as "unexpected public exposure".

**Cloudflare Zero Trust:**
- If `CF-Access-Authenticated-User-Email` header is forwarded by Caddy, display the currently-authenticated user email.
- Access session age (CF header usually contains `CF-Access-JWT-Assertion` with an expiry).
- Tunnel health: `cloudflared.service` status is already tracked; add "last connection event" from journal.

### Config File Viewer

New section "Configurations" in `/infra`:

- Read-only rendered view of allowlisted config files:
  - `/etc/litellm/config.yaml` — YAML highlighted, API key values redacted (`****`).
  - `/etc/caddy/Caddyfile` — text highlighted.
  - Key systemd unit files: `newsbites.service`, `vast-tunnel.service`, `litellm.service`, `newsbites-autopipeline.service`.
  - `docker-compose.yml` for Paperclip and OpenClaw (env var values redacted).
- **Git diff badge**: shows `M` (modified) if the file has uncommitted changes since last git commit, with an expand to see the diff.
- **Validate button**: runs `caddy validate --config /etc/caddy/Caddyfile` or `yamllint /etc/litellm/config.yaml` and shows pass/fail.
- **Create agent task**: "Open in workspace and modify" — launches a Claude/OpenCode session scoped to the relevant config directory.

### Vast Instance Lifecycle Controls

New "Instance Lifecycle" section in the Vast panel on `/infra`:

| Action | Risk | Notes |
|---|---|---|
| Run GPU health probe | low | Already exists |
| Reconcile tunnel endpoint | medium | Reads current Vast instance IP from `vast show instances 35735457`, compares to `vast-tunnel.service` unit, updates unit if different, restarts service |
| View VRAM map | low | SSH-exec `nvidia-smi` on instance, shows per-model VRAM usage |
| Stop instance | high | Pauses the Vast instance to stop billing. Requires explicit reason. Disables GPU routing automatically (updates `model-health.json` to mark all local models unavailable) |
| Start stopped instance | high | Re-activates stopped instance. Re-enables GPU routing after tunnel reconnects |
| Find cheaper equivalent | low | Reads Vast marketplace via API, finds instances matching ≥ RTX 3090 at lower $/hr |

**VRAM Map:**
```
GPU Memory: 19.2 / 24.0 GB used
───────────────────────────────────────────
gemma4:26b-q4_K_M      17.1 GB  ████████░░
(free)                  2.1 GB  unallocated
───────────────────────────────────────────
Loading: ~45s for gemma4  |  swap cost: high
```

---

## `/newsbites` Additions

### Article Revision History

Per article, new "History" tab in the article detail drawer:

- `git log --follow -- content/articles/<slug>.md` — list of commits touching this file.
- Each commit: hash, date, message, author.
- Click a commit → diff of that version vs the previous (`git diff <hash>^ <hash> -- <path>`).
- **Draft vs published diff**: if the dossier's `draft.md` still exists, show a side-by-side comparison between the original draft and the final article. Highlights what was changed during manual editing (if any).
- "Modified after publish" badge: if any commits exist after the article's `date` frontmatter (post-publication edits).
- Revert action: "Create agent task to revert to this version."

### Vertical ROI Dashboard

New section "Vertical Performance" on `/newsbites`:

| Vertical | Articles | Avg Rating | Pipeline Time (avg) | Cost/Article | ROI Score |
|---|---|---|---|---|---|
| finance | 47 | 4.2★ | 18min | $0.22 | 92 |
| ai | 89 | 3.7★ | 14min | $0.18 | 85 |
| wellness | 12 | 4.1★ | 22min | $0.28 | 78 |
| sports | 3 | 2.9★ | 19min | $0.21 | 45 |

ROI Score = (avg_rating / 5) × (1 - pipeline_time / max_pipeline_time) × (1 - cost_per_article / max_cost) × 100.

This makes the editorial resource allocation decision quantitative: sports has low rating, moderate cost, and low volume — a clear candidate for de-prioritization.

---

## `/incidents` Additions

### SLA Timers

Every incident gets automatic SLA tracking:

```typescript
interface IncidentSla {
  acknowledgeBy: string;    // created_at + threshold (from system_configs)
  resolveBy: string;        // created_at + resolve threshold
  ackStatus: "pending" | "ontime" | "overdue";
  resolveStatus: "pending" | "ontime" | "overdue";
  overduePct?: number;      // how far past the deadline
}
```

Defaults (configurable in `/settings`):
- Critical incidents: ack within 30 min, resolve within 4h.
- Warning incidents: ack within 4h, resolve within 24h.
- Info incidents: ack within 24h (optional).

SLA breach auto-escalation: if critical incident is not acknowledged in `acknowledge_by`, fire a Telegram alert with the incident summary and direct link.

### Incident Playbook Drawer

Each incident type gets a pre-defined playbook (stored in `system_configs.playbooks.<incident_type>`):

Example for `gpu_tunnel_down`:
```markdown
## GPU Tunnel Down Playbook
1. Check `systemctl status vast-tunnel.service`
2. Verify Vast instance is still running: `vast show instances 35735457`
3. If IP changed: run "Reconcile tunnel endpoint" action in /infra Vast panel
4. If service failed: `systemctl restart vast-tunnel.service`
5. Verify: `curl http://localhost:11434/api/tags`
6. If Vast instance is stopped: manually start from vast.ai portal or use /infra Stop/Start action
```

Playbooks shown in the incident detail view under a "Playbook" tab.

---

## `/doctor` Additions

### Error Taxonomy Editor

New sub-tab "Taxonomy" in `/doctor`:

- Editable map: regex pattern → stable class name.
- Live preview: test a sample log line against current rules.
- Import/export as JSON.
- Changes stored in `system_configs.doctor.taxonomy_rules`.

Current default rules:
```json
[
  { "pattern": "quality_garbage|garbage response|truncated response", "class": "quality_garbage" },
  { "pattern": "ECONNRESET|timeout|ETIMEDOUT", "class": "transport_timeout" },
  { "pattern": "429|rate.?limit|quota", "class": "rate_limit" },
  { "pattern": "502|503|Bad Gateway", "class": "transport_provider_error" },
  { "pattern": "JSON.?parse|SyntaxError|invalid.*json", "class": "json_parse_failure" }
]
```

### Blame Attribution View

New section "Who's at fault?" on the Doctor page:

For each error cluster in the last 7 days:
- **Same model, different stages**: likely a model quality issue.
- **Same stage, different models**: likely a prompt or input issue.
- **Same vertical, different models/stages**: likely a data quality issue (topic is hard to research).
- **Same source domain in sources.json**: likely a source reliability issue.

Displayed as a 2x2 matrix with the dominant axis highlighted. Links to suggested actions: "block model", "adjust prompt", "add source domain to blocklist", "add to watchlist".

---

---

# Part VI — Data Layer Additions

---

## LiteLLM Routing Callback Consumer

The observability plan specifies the `litellm_routing_log` table. This section specifies how to populate it without modifying LiteLLM's Python source.

**Option A — LiteLLM callbacks (preferred):**

Add to `/etc/litellm/config.yaml`:
```yaml
general_settings:
  success_callback: ["custom_callback_api"]
  failure_callback: ["custom_callback_api"]
  custom_callback_api_url: "http://127.0.0.1:3000/api/internal/litellm-log"
  custom_callback_api_timeout: 2
```

LiteLLM's `custom_callback_api` sends a POST with the full request/response object. The BFF endpoint parses this and inserts into `litellm_routing_log`. The timeout (2s) ensures LiteLLM doesn't block on a slow control surface.

**Option B — LiteLLM Proxy DB mode (fallback):**

LiteLLM supports `DATABASE_URL` for request logging. If configured, the control surface BFF can read its Postgres/SQLite directly. Check if LiteLLM is already configured for DB mode: `grep -i database /etc/litellm/config.yaml`.

**Option C — Log parsing (last resort):**

If neither A nor B is feasible, parse `journalctl -u litellm.service` for routing decision lines. Fragile but requires no LiteLLM config changes.

---

## Caddy Access Log Parser (for `/growth` Analytics)

Add to `/etc/caddy/Caddyfile` for the NewsBites vhost:
```caddy
news.techinsiderbytes.com {
    log {
        output file /var/log/caddy/news-access.log {
            roll_size 50mb
            roll_keep 7
        }
        format json
    }
    reverse_proxy localhost:3001
}
```

New server adapter `server/adapters/caddy.ts`:
- Reads `/var/log/caddy/news-access.log` (tail-only, last 2MB like doctor-log).
- Parses JSON lines: `{ts, request.uri, request.headers.referer, request.remote_ip, status, response.headers.content-length}`.
- Aggregates: top 20 articles by hit count, daily totals, referrer breakdown.
- Writes summary to `system_configs.caddy.access_summary` every 10 min (via ingestor).

BFF endpoint `GET /api/growth/traffic` returns the aggregated summary. No raw IPs exposed in the API.

---

## Dossier Archive Index

New adapter `server/adapters/dossiers.ts`:

```typescript
async function buildDossierIndex(): Promise<DossierSummary[]> {
  // Scan /opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/
  // For each YYYY-MM-DD/<slug>/: read frontmatter from publish.md or draft.md
  // Return: slug, date, vertical, status, stage, word_count, source_count, agent_runs_count
}
```

Cache result in `system_configs.dossier_index` with a 5-minute TTL.

BFF endpoint `GET /api/dossiers?since=&vertical=&status=&limit=` returns the index.

Also used by:
- `/calendar` for past-stories overlay.
- `/knowledge` for dossier search.
- `/autopipeline` for story genealogy (group by topic similarity or slug proximity).

---

---

# Part VII — Infrastructure Intelligence Additions

---

## Predictive Capacity

New section in `/infra` (also drives home page risk strip):

**Disk usage trend:**
- Read disk usage every hour from the ingestor (already runs `du -sh /opt/backups/* /opt/newsbites /opt/mimoun /var/lib/mimule/*`).
- Compute growth rate: GB/day over last 7 days.
- Projected disk full: `(total_disk - current_used) / growth_rate_per_day` = N days.
- Alert thresholds: amber if < 30 days, red if < 14 days.

**Doctor-log growth:**
- Already noted at 17MB and growing.
- Track growth rate: projected to exceed 100MB in N days.
- Alert: "doctor-log.jsonl will need rotation in N days. Run tail-reader migration."

**Article corpus size:**
- At 383 published articles, the corpus is growing. Predict when word-count-based operations (finance insights, context assembly) will degrade.
- Rough estimate: 1000 articles × avg 800 words × 1.5 tokens/word ≈ 1.2M tokens for full corpus. At 32K context, will need chunking. Alert when > 500 articles.

## Cost Forecasting

New section on `/costs`:

**Monthly projection:**
```
Current month (May 2026) — Day 15 of 31
────────────────────────────────────────────
Vast.ai GPU      $0.138/hr × 24 × 15 = $49.68 actual
                 Projection: ~$99/month at 24×7
OpenRouter paid  $0.31 actual (3 days of data)
                 Projection: ~$6/month
Total actual     $50.00  |  Projected: ~$105/month
────────────────────────────────────────────
If GPU stopped at 22:00 UTC daily:
  GPU cost: ~$66/month (-$33)
  Cloud fallback extra: ~$8/month
  Net saving: ~$25/month
```

**Model ROI calculator:**
- Input: select two models for any stage.
- Output: `savings per 1000 stories` and `quality delta per ratings data`.
- Example: "editorial-fast vs editorial-heavy for write stage: saves $0.04/story at -0.3 rating points. At 60 stories/day: saves $2.40/day = $72/month. Quality trade-off: marginal."

---

---

# Part VIII — SQLite Schema Summary (New Tables)

All tables go in the existing `server/db/` schema or the observability.db depending on domain.

```sql
-- Subscriptions
CREATE TABLE subscription_events ( ... );      -- see Part IV
CREATE TABLE subscription_state ( ... );        -- see Part IV

-- TIB Assistant
CREATE TABLE assistant_conversations ( ... );   -- see Part I §1
CREATE TABLE assistant_messages ( ... );        -- see Part I §1

-- Ratings
CREATE TABLE article_ratings ( ... );           -- see Part II
CREATE TABLE stage_ratings ( ... );             -- see Part II

-- Model Evaluation
CREATE TABLE model_eval_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  stage TEXT NOT NULL,
  sample_count INTEGER,
  results TEXT NOT NULL,
  winner TEXT,
  status TEXT NOT NULL
);

-- Session Intelligence
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,     -- tool_call | file_edit | shell_cmd | message | commit | subagent
  ts TEXT NOT NULL,
  payload TEXT NOT NULL         -- JSON event detail
);

CREATE TABLE session_knowledge (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_label TEXT,
  agent TEXT NOT NULL,
  cwd TEXT NOT NULL,
  impact_score INTEGER,
  handoff_markdown TEXT,
  vault_path TEXT,
  created_at TEXT NOT NULL
);

-- Shell
CREATE TABLE shell_sessions (
  id TEXT PRIMARY KEY,
  workspace_root_id TEXT NOT NULL,
  cwd TEXT NOT NULL,
  pid INTEGER,
  started_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  status TEXT NOT NULL          -- running | exited | killed
);

CREATE TABLE shell_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shell_session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  line TEXT NOT NULL
);
-- ring-buffer enforced by: DELETE FROM shell_output WHERE id <= (SELECT MAX(id) - 10000 FROM shell_output)

CREATE TABLE shell_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_root_id TEXT NOT NULL,
  command TEXT NOT NULL,
  ts TEXT NOT NULL
);
```

---

---

# Part IX — BFF Endpoint Additions

New endpoints not listed in any parent plan:

```
-- TIB Assistant
GET  /api/assistant/conversations
GET  /api/assistant/conversations/:id
POST /api/assistant/conversations
POST /api/assistant/conversations/:id        stream via SSE
DELETE /api/assistant/conversations/:id

-- Content Calendar
GET  /api/calendar?month=YYYY-MM
GET  /api/calendar/vertical-heatmap
PUT  /api/calendar/config

-- Log Browser
GET  /api/logs/sources
GET  /api/logs/:source/tail?lines=           SSE stream
GET  /api/logs/:source/search?q=&since=

-- Backup Health
GET  /api/backup/status
GET  /api/backup/manifest
POST /api/backup/run
POST /api/backup/verify
POST /api/backup/mark-drill-done

-- AI Vault
GET  /api/vault/daily?days=30
GET  /api/vault/daily/:date
POST /api/vault/daily/:date/append
GET  /api/vault/projects
GET  /api/vault/projects/:name
POST /api/vault/projects/:name
GET  /api/vault/search?q=&scope=
POST /api/vault/generate/weekly-summary
POST /api/vault/generate/continuation

-- Subscriptions
GET  /api/subscriptions
GET  /api/subscriptions/:service
GET  /api/subscriptions/events?service=&since=
POST /api/subscriptions/:service/manual-config
GET  /api/subscriptions/weekly-pattern

-- Ratings
GET  /api/ratings/articles?unrated=&vertical=&since=
POST /api/ratings/articles/:slug
GET  /api/ratings/stages?model=&stage=
POST /api/ratings/stages
GET  /api/ratings/summary
GET  /api/ratings/correlation

-- Security (new section in /infra)
GET  /api/infra/security/ssh-log?lines=
GET  /api/infra/security/cert-expiry
GET  /api/infra/security/open-ports

-- Dossier Archive
GET  /api/dossiers?since=&vertical=&status=&limit=

-- Model Evaluation
POST /api/models/evaluate               start an evaluation job
GET  /api/models/evaluations            list past evaluation runs
GET  /api/models/evaluations/:id        single run detail

-- Growth (Caddy analytics)
GET  /api/growth/traffic                top articles, daily totals, referrers
GET  /api/growth/vertical-roi           vertical ROI table

-- Workspace (shell additions)
POST /api/workspace/shell               open a new shell PTY session
GET  /api/workspace/shell/:id           shell session info
POST /api/workspace/shell/:id/input     send input bytes to PTY (WebSocket preferred)
DELETE /api/workspace/shell/:id         kill shell
GET  /api/workspace/shell/:id/output    tail last N lines of stored output

-- Session Intelligence
GET  /api/workspace/session/:id/diff    git diff since session start
GET  /api/workspace/session/:id/impact  computed impact score
POST /api/workspace/session/:id/handoff generate handoff packet
GET  /api/workspace/session/:id/replay  event timeline for replay
```

---

---

# Part X — Build Phases

Work in this plan is additive to V4. Insert into the V4 phasing as V4.5.x phases.

## Phase V4.5.0 — Foundations

- SQLite schema additions (all new tables from Part VIII).
- `subscription_state` ingestor: poll journal for 429 events every 5 min.
- Shell PTY broker (`server/workspace/pty.ts`) — basic open/input/output/kill.
- Session diff capture: take git snapshot before session starts, compute delta on close.

## Phase V4.5.1 — Subscription Intelligence

- All `/api/subscriptions` endpoints.
- `/subscriptions` page with all provider cards.
- Subscription status bar on Claude, Codex, OpenCode pages.
- Subscription widget on home.
- 5-hour reset tracker with countdown and usage gauge.
- Weekly pattern heatmap.

## Phase V4.5.2 — Embedded Shell

- xterm.js integration on all three agent pages.
- Quick command chip strip.
- "Forward to agent" integration.
- Shell history per workspace root.
- Mobile shell bottom sheet.

## Phase V4.5.3 — Session Intelligence

- Session diff view (Changes tab on all agent pages).
- Git panel on all agent pages.
- Impact score computation on session close.
- Handoff packet generator.
- Vault log prompt on session close (opt-in).

## Phase V4.5.4 — Ratings System

- `article_ratings` and `stage_ratings` tables.
- `/api/ratings/*` endpoints.
- `/ratings` page (3 tabs: Articles, Stage Quality, Correlation).
- Star rating control on `/newsbites` article rows.
- Ratings integration on `/models` scorecard.

## Phase V4.5.5 — New Surfaces: Vault, Calendar, Logs

- `/vault` page with daily log browser, search, and vault completion tracker.
- `/calendar` page with monthly grid, vertical heatmap, and pipeline forecast overlay.
- `/logs` page with source selector, tail mode, search mode, and incident linking.

## Phase V4.5.6 — Backup, Security, Config

- Backup & Restore Health section in `/infra`.
- Security Status section in `/infra` (SSH log, cert expiry, open ports).
- Config File Viewer in `/infra`.
- Vast Instance Lifecycle Controls (reconcile, VRAM map, find cheaper).

## Phase V4.5.7 — TIB Stack Assistant

- `assistant_conversations` + `assistant_messages` tables.
- `/api/assistant` SSE streaming endpoint.
- `/assistant` page with chat UI, quick-ask chips, action-intent confirm buttons.
- Home page quick-ask strip below Now card.
- Context packet assembly (CLAUDE.md + live /api/home snapshot).

## Phase V4.5.8 — Growth & Editorial Intelligence

- Caddy access log parser and `/api/growth/traffic` endpoint.
- `/growth` page: traffic analytics, vertical ROI table, content gap map.
- Opportunity card generation (editorial gap, new model, cost anomaly detectors).
- "I'm Back" mode on home (requires SQLite ingestor snapshots for diff).
- Article revision history in `/newsbites` detail drawer.

## Phase V4.5.9 — Model Evaluation & Advanced Controls

- Model evaluation jobs (`model_eval_runs` table, `/api/models/evaluate`).
- Provider pricing table on `/models`.
- Doctor blame attribution view.
- Doctor error taxonomy editor.
- Incident SLA timers and auto-escalation.
- Incident playbook drawer.

---

## Exit Criteria for V4.5

- The operator can open a Claude session and see: context window usage, files in context, cost so far, subscription window countdown — without leaving the page.
- The operator can verify agent-made changes via the embedded shell without opening a new terminal tab.
- The operator can track their Claude 5-hour reset window and know when to save a handoff packet.
- The operator can rate an article and see that rating reflected in model scorecards.
- The operator can see AI Vault completion status and log a session without leaving the dashboard.
- The content calendar shows at a glance whether vertical targets are being met.
- Every published article's revision history is readable from `/newsbites`.

---

## Open Questions

1. **Shell security model**: should the shell allow `sudo`? Current answer: no — the process runs as the user that started `control-surface.service` (likely root, but shell should be artificially constrained to avoid accidental destructive ops).
2. **Subscription tracking for Codex cloud tasks**: OpenAI doesn't expose cloud task compute spend via API yet. Track only GitHub Models rate limits for now; full Codex spend tracking deferred.
3. **Caddy log rotation**: adding logging to Caddyfile will grow `/var/log/caddy/`. Set `roll_size 50mb` and `roll_keep 7` (50MB × 7 = 350MB max). Confirm this is acceptable given the 80GB disk.
4. **Ratings retroactive population**: 383 articles exist with no ratings. A bulk "quick rate" flow (approve all unrated as 3 stars = neutral) should be available to bootstrap the model to have non-null values before the system is useful.
5. **Assistant model cost**: if the operator uses the assistant heavily, it could burn significant LiteLLM credits. Add a per-conversation token cap (default: 8K tokens) configurable in `/settings`.

---

---

# Part XI — V4.6 Research-Driven Expansion (2026-05-15)

This part extends V4.5 with depth surfaced from a 2026-05-15 research pass across:

- **LLM observability** — Langfuse, LangSmith, Helicone, Braintrust, Phoenix/Arize, Laminar, Latitude. The 2026 consensus is: structured spans (OTLP), agent-graph visualization, pre-deployment multi-turn replay, and CI-blocking evals.
- **Editorial agentic systems** — Nieman Lab and INMA newsroom case studies; orchestrator-plus-specialists, span-level claim verification, deterministic copyedit gates, audit trail per claim.
- **Eval frameworks** — Promptfoo (acquired by OpenAI 2026-03), DeepEval, Giskard, OpenAI Evals. Pattern: layered eval pipeline (CI property checks → pre-release quality → automated red-team before deploy).
- **Workflow orchestration** — LangGraph + Temporal/Inngest/Trigger.dev. Pattern: macro durable workflow wraps micro agent reasoning; replay-from-step is a first-class debug primitive.
- **Premium SaaS UX** — Linear, Vercel, Stripe, Resend, Cal.com. Pattern: density lives in *behavior* (hover, focus, keyboard, context menus) not pixels; command palette is the primary navigation surface; URL-state is shareable; mobile floating bottom bar is the new default (Vercel rolled out 2026-02-26).
- **Hallucination mitigation** — REFIND SemEval 2025, span-level claim verification, factuality scoring as a separate axis from human rating; the Dev|Journal finding that "42% of LLM-as-judge hallucinations are actually pipeline failures" (HTTP/gateway noise mistaken for model failures).

V4.6 is the **intelligence and polish layer** on top of V4.5's surfaces. It does not add new pages; it adds depth, signal, and craft to what V4.5 will already build. Where V4.5 added the surface, V4.6 makes it *trustworthy* and *fast*.

---

## 11.1 Observability Stack Alignment

### 11.1.1 OpenTelemetry-first trace model

V4 observability defines a `litellm_routing_log` table. V4.6 generalizes this to an OTLP-compatible span model that the entire stack emits.

**Why**: every modern LLM observability tool (Langfuse, Helicone, Braintrust, Phoenix) consumes OTLP. Standardizing on OTLP lets the operator point any off-the-shelf tracing tool at the control surface in the future without re-instrumenting.

**Implementation**:

```typescript
interface SpanRecord {
  trace_id: string;             // shared across an entire request (pipeline run, agent session, dashboard click)
  span_id: string;
  parent_span_id: string | null;
  name: string;                 // e.g. "pipeline.write.gemma4-26b"
  kind: "internal" | "client" | "server";
  service: string;              // "autopipeline" | "litellm" | "newsbites" | "control-surface" | "agent"
  start_time: string;           // ISO with µs precision
  end_time: string;
  status: "ok" | "error";
  status_message?: string;
  attributes: Record<string, string | number | boolean>;
                                // model, vertical, stage, slug, token counts, cost_usd
  events?: SpanEvent[];         // logs attached to the span
  parent_trace_url?: string;    // upstream provider request id if available
}
```

**Trace ID propagation**:
- Dashboard click → `X-Trace-Id` header attached → BFF generates root span → propagates to LiteLLM via `litellm-trace-id` header → LiteLLM custom callback emits child span → if upstream provider returns request id, store it as `attributes["upstream.request_id"]`.
- Same flow for autopipeline: scout → research → write → verify → publish-prep all share a single trace_id rooted at the topic-add event.

**SQLite table** (`observability.db` from V4 observability plan):

```sql
CREATE TABLE spans (
  trace_id TEXT NOT NULL,
  span_id TEXT PRIMARY KEY,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  service TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT,
  status_message TEXT,
  attributes_json TEXT NOT NULL,
  events_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_spans_trace ON spans(trace_id, start_time);
CREATE INDEX idx_spans_name ON spans(name, start_time DESC);
CREATE INDEX idx_spans_service_time ON spans(service, start_time DESC);
```

Retention: 30 days hot, then aggregated to per-trace summaries and rolled to `spans_archive`.

### 11.1.2 Agent Graph view (pipeline DAG)

The existing `/autopipeline` page lists queue items but does not visualize the *shape* of a run. V4.6 adds an Agent Graph for any pipeline run.

**Layout**:

```
              ┌────────┐
              │ scout  │  routing-cheap · 12s · 0 errors
              └───┬────┘
                  │
              ┌───▼────┐
              │  rank  │  routing-cheap · 4s
              └───┬────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
  ┌─────────┐┌────────┐┌──────────┐
  │research ││research││ research │   editorial-cloud-heavy
  │  topic A││topic B ││ topic C  │   nemotron → 8.4s avg
  └────┬────┘└───┬────┘└────┬─────┘
       └────────┬┴─────────┘
                ▼
            ┌───────┐
            │ write │   editorial-cloud-heavy · 22s · 4.1K tokens
            └───┬───┘
                ▼
            ┌────────┐
            │ verify │   editorial-heavy (GPU) · 31s · 2 issues flagged
            └───┬────┘
                ▼
            ┌────────────┐
            │ publish-prep│  editorial-cloud-fast · 6s
            └─────┬──────┘
                  ▼
              ✓ published 14:32 UTC
```

**Implementation**:
- Render with `dagre-d3` or `reactflow` (already in many dashboards).
- Each node: span name, model, duration, error count, cost.
- Edge thickness = token volume passed forward.
- Color-coded by status: green ok, amber retried, red error.
- Click node → opens span detail drawer (right side): full attributes, events, raw input/output (redacted), child spans if any.
- "Replay this run with override" CTA on the root node (see 11.4.2).

Reusable across surfaces: same component renders agent-session DAGs on `/claude`, `/codex`, `/opencode` for any session with subagent fan-out.

### 11.1.3 Unified Span Explorer (`/traces`)

A new top-level route — the operator's "what just happened?" surface.

**Layout**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Service: [all ▾]  Status: [all ▾]  Min latency: [_____ms]  Last: 1h │
├──────────────────────────────────────────────────────────────────────┤
│ Time           Service        Name                  Latency  Status  │
│ 14:32:08.412   autopipeline   pipeline.publish     34.2s    ok      │
│ 14:31:34.221   autopipeline   pipeline.verify      31.0s    ok      │
│ 14:30:58.014   litellm        editorial-cloud-heavy 8.1s    ok      │
│ 14:30:12.118   control-surface api.home            142ms    ok      │
│ 14:29:55.992   litellm        editorial-cloud-heavy 14.0s   error   │  ← red
│ ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Features**:
- Filter by service, name pattern, status, attributes (`model=gemma4-26b`, `vertical=finance`).
- Click row → trace detail: full DAG + flame chart of timing.
- Saved filters: pin common queries (`status=error since 24h`, `service=litellm latency>10s`).
- "Live" toggle: SSE stream of new spans as they close.
- Export trace as JSON for offline analysis or sharing in vault.

### 11.1.4 Two-run diff mode

For comparing a known-good pipeline run against a failing one:

- Select two trace IDs from `/traces` → "Compare" button.
- Side-by-side DAG render. Identical nodes faded; divergent nodes (different status, model, or >2x duration) highlighted.
- Detail panel: per-node attribute diff (`tokens_in: 3200 vs 6100`, `model: nemotron-3-super vs github-gpt41`).
- Useful for: "the verify stage regressed yesterday — what changed?"

---

## 11.2 Evaluation as a First-Class Surface

V4.5 specifies a ratings system (operator scores articles and stages after the fact). V4.6 adds the proactive eval layer: automatic quality measurement *before* the operator sees the output, with the ability to block low-quality work from being published or to gate prompt/model changes in CI.

### 11.2.1 Prompt eval packs

Eval packs are Promptfoo-style YAML files defining test cases for a prompt or stage.

**Location**: `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/evals/`

```yaml
# evals/write-stage.yaml
name: write-stage-quality
version: 2026-05-15
description: Quality bar for the write stage; runs against the last 10 dossiers.

prompt_path: prompts/small-model/write.md
stage: write

dataset:
  source: dossier_archive
  filter:
    status: published
    rated_min_stars: 4
  sample_size: 10
  seed: 42

models:
  - editorial-cloud-heavy
  - editorial-heavy
  - github-gpt41

assertions:
  - type: word-count
    min: 600
    max: 1400
  - type: contains-frontmatter
    keys: [title, slug, date, vertical, tags, lead, digest]
  - type: regex-not
    pattern: '\b(I think|in my opinion|I would say)\b'
    why: removes first-person voice that violates the TIB style guide
  - type: llm-judge
    judge_model: editorial-cloud-heavy
    rubric_path: evals/rubrics/write-quality.md
    pass_score: 3.5
  - type: claim-coverage
    min_coverage_pct: 85
    why: every factual claim must appear in sources.json
```

**Execution**:
- `GET /api/evals/packs` lists all packs.
- `POST /api/evals/packs/:name/run` triggers a run.
- Results stored in `eval_runs` table (see 11.10).
- "Run all packs" nightly via systemd timer.

### 11.2.2 LLM-as-judge with calibration

The Dev|Journal 2026-05-03 finding is the wake-up call: when a judge model rates outputs in production, **42% of its "hallucination" verdicts are actually pipeline noise** — the model output was empty because of a 429 or gateway error, and the judge interpreted that as a factual failure.

**Mitigation built into V4.6 judge runs**:

1. **HTTP-layer awareness**: before the judge sees the output, the eval runner attaches the span record. If `status != "ok"` or the response was empty due to a transport error, the judge run is **skipped** and the eval result is marked `skipped-transport-error`. The output is not included in quality metrics.

2. **Judge calibration**: every quarter, run a calibration set — 50 outputs the operator has rated 1–5. The judge model scores the same set blind. Compute Cohen's kappa between operator and judge. If kappa < 0.6, the judge is recalibrated (new prompt iteration) before it gets used in CI.

3. **Multi-judge consensus** for high-stakes evals (publishing gate): three different judge models score the output. If at least 2 disagree, escalate to operator. Reduces single-judge bias.

4. **Show your work**: every judge verdict stores the *reasoning* alongside the score, viewable on the eval results page. Operator can audit and dispute.

### 11.2.3 CI-blocking evals (Braintrust pattern)

When the operator edits a prompt file in the workspace and commits, a pre-merge gate runs the relevant eval pack and blocks the merge if quality degrades.

**Implementation**:
- Git hook in `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/.git/hooks/pre-push` runs `POST /api/evals/packs/<related-pack>/run --baseline=master`.
- Eval runner compares: average judge score, claim coverage, assertion pass rate. If any metric drops > 5% vs the baseline, the hook fails the push.
- Operator can override with `--no-verify` (logged to action audit).

**Surfaces in dashboard**:
- New tab on `/ratings` page: "Eval History". Shows pass/fail timeline per pack, by branch and commit hash.
- "Quality trend" sparkline per stage.
- Recent regression alerts: "write-stage-quality dropped 8% on commit a4b91f2 — investigate".

### 11.2.4 Golden dataset & regression suite

A versioned set of 30–50 published articles becomes the regression suite. Each golden article has:

- Original prompt + research input.
- Expected output bounds (word count, claim count, vertical, tone).
- Operator's original rating (anchor).

```sql
CREATE TABLE golden_dataset (
  slug TEXT PRIMARY KEY,
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL,
  vertical TEXT NOT NULL,
  research_input_path TEXT NOT NULL,
  expected_word_count_min INTEGER,
  expected_word_count_max INTEGER,
  operator_rating INTEGER,
  notes TEXT
);
```

Promote-to-golden action: from `/newsbites` article detail, rated ≥4★ articles get a "Promote to golden" button.

When evals run, the suite re-runs the *exact* pipeline against the golden inputs and compares output to the original. Catches: model regressions, prompt drift, dataset poisoning.

### 11.2.5 Pre-deployment multi-turn replay

V4.5 specifies session replay. V4.6 adds **replay against a candidate config**:

- Select a past session → "Replay against new config".
- Choose a candidate prompt version, model, or pipeline route.
- The system replays every input the session received (user messages, tool calls, scout output) against the new config and produces a side-by-side comparison.
- Useful for: "would Sonnet have produced a better Q4 finance article than what Opus produced?"

This is the eval pattern most platforms *don't* support according to research (the Latitude piece called it out as a gap). Building it gives V4.6 a meaningful advantage as a personal-stack tool.

---

## 11.3 Prompt & Config Versioning

### 11.3.1 Prompt registry

All prompt files (`prompts/small-model/*.md`, agent definitions) are auto-snapshotted on every git commit and indexed in SQLite.

```sql
CREATE TABLE prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_path TEXT NOT NULL,
  content TEXT NOT NULL,
  commit_hash TEXT,
  committed_at TEXT NOT NULL,
  committed_by TEXT,
  bytes INTEGER,
  word_count INTEGER,
  notes TEXT
);
CREATE INDEX idx_prompt_versions_path ON prompt_versions(prompt_path, committed_at DESC);
```

New surface in `/settings` → "Prompt Registry":
- List all prompts grouped by stage.
- Per prompt: current version, last edited, diff-from-baseline button, "Used by N runs in last 7d" badge.
- Click → version history with diff viewer, attribution (which commit, which agent session if traceable), and eval pack association.
- "Run eval pack against this version" inline action.

### 11.3.2 A/B prompt experiments

```sql
CREATE TABLE prompt_experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt_path TEXT NOT NULL,
  version_a_id TEXT NOT NULL REFERENCES prompt_versions(id),
  version_b_id TEXT NOT NULL REFERENCES prompt_versions(id),
  traffic_split REAL NOT NULL DEFAULT 0.5,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  winner TEXT,
  status TEXT NOT NULL,
  judge_model TEXT
);
```

Surface: `/settings` → "Prompt Experiments". Start a new experiment from any prompt detail page. Pipeline routes the chosen prompt version per request. After N runs (configurable, default 20), the experiment auto-ends and the judge scores both pools. Winner is displayed; operator promotes or rejects.

**Guardrail**: a manual "kill switch" stops any experiment immediately, reverts to version A. Required for editorial use cases where bad output reaches readers.

### 11.3.3 Config snapshot diffing

V4.5 specifies a config viewer in `/infra`. V4.6 adds versioned snapshots.

- Every 5 minutes the ingestor hashes `/etc/litellm/config.yaml`, `/etc/caddy/Caddyfile`, key systemd units. If the hash changes, store a snapshot.
- New tab in config viewer: "History". Lists snapshots with diff to previous.
- Attribution: cross-reference with the action audit — if an agent action modified the file, link to the session that did it.
- "What changed in last 7 days" view per config file.

---

## 11.4 Durable Workflow Patterns

V4 has a Builder Pipeline (workflow scheduler). V4.6 adds the Temporal/Inngest-inspired primitives that make long-running editorial work debuggable and resumable.

### 11.4.1 Pipeline-as-checkpointed-workflow

Each pipeline stage becomes a workflow step with a deterministic checkpoint:

```typescript
interface PipelineCheckpoint {
  trace_id: string;
  step_id: string;
  step_name: string;
  started_at: string;
  completed_at?: string;
  input_hash: string;          // SHA-256 of canonical input — for replay determinism
  output_path?: string;        // where the stage's output is materialized
  output_hash?: string;
  attempts: number;
  last_error?: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}
```

Surfaces in `/autopipeline` queue: clicking a story shows its checkpoint trail with per-step retry count and durations.

### 11.4.2 Replay-from-step

Critical debug primitive. Any failed (or successful) pipeline run can be replayed starting from any step, optionally with overrides:

- "Replay from step `verify`" — re-runs verify and downstream with the original research/write output.
- "Replay from step `write` with model override = github-gpt41" — swaps the write model and re-runs from there.
- Replays write to a `dossiers-replay/` directory with a `replay-of: <trace_id>` marker, so original artifacts are never overwritten.

Endpoint: `POST /api/pipeline/replay { trace_id, from_step, overrides: { model?, prompt_version?, vertical? } }`.

### 11.4.3 Human-in-the-loop gates as first-class primitives

Today some stages require approval (sensitive verticals: first run). V4.6 makes this a workflow primitive, not pipeline-script-level logic.

- A HITL step has `requires_approval: true` in its checkpoint metadata.
- When the workflow reaches it, status becomes `awaiting_approval`. A Telegram alert fires. The `/autopipeline` page surfaces an approval card.
- Approval comes from one of: `/autopipeline` UI, Telegram inline keyboard button, or assistant action intent.
- Approval payload: `{ approved: bool, reason: string, operator: string }` — written to action audit and attached to the step.

Pattern alignment: matches Inngest's `step.waitForEvent` and Temporal's signals.

---

## 11.5 Per-Claim Factuality System

The 2026 hallucination literature is unified: **span-level claim verification with explicit source attribution** is the most effective mitigation. REFIND SemEval 2025 codified this; the Aman/Frontiers/Springer reviews all converge on it.

V4.6 builds this for the editorial pipeline.

### 11.5.1 Claim extraction

After the write stage, a dedicated `claims` stage extracts every factual claim from the draft:

```typescript
interface ExtractedClaim {
  id: string;                   // sha of claim + draft position
  draft_position: { line: number; char_start: number; char_end: number };
  claim_text: string;           // "BTC traded above $98K on March 12 2026."
  claim_type: "statistic" | "event" | "quote" | "attribution" | "prediction";
  confidence: number;           // 0–1 from the extractor model
}
```

Stored in `dossiers/YYYY-MM-DD/<slug>/claims.json` alongside the draft.

### 11.5.2 Source attribution per claim

For each extracted claim, the verify stage attempts to ground it in one of the sources already in `sources.json`:

```typescript
interface ClaimVerification {
  claim_id: string;
  supported: boolean;
  source_url?: string;
  source_excerpt?: string;
  match_confidence: number;     // 0–1
  judge_reasoning: string;
}
```

Unsupported claims (`supported: false` or `match_confidence < 0.6`) are flagged.

### 11.5.3 Marginalia in publish preview

In the dossier inspector publish preview tab (V4 observability), claims are rendered as inline annotations:

```
The cryptocurrency rallied 18% in the past week ⓘ¹                       │
on rising institutional flows ⓘ²,
with BTC briefly trading above $98K on March 12 ⚠³.                      │
                                                                          │
─── Source map ─────────────────────────────────                          │
¹ supported — coindesk.com/markets/btc-week-recap-2026-03-15              │
² supported — reuters.com/markets/crypto-flows-q1-2026                    │
³ unsupported — no source matches "above $98K on March 12"  [find source] │
```

- Click ⚠ → expand: judge reasoning, suggested search query, "find a source" action that calls a quick research subagent.
- "Reject publish" if unsupported claim count > threshold (configurable; default 0 for finance/global-politics, 1 for trends/culture).

### 11.5.4 Factuality score (auto)

A computed factuality score per article: `supported_claims / total_claims`. Shown alongside the operator rating but as a separate axis.

- Stored in `article_factuality` table:

```sql
CREATE TABLE article_factuality (
  slug TEXT PRIMARY KEY,
  total_claims INTEGER NOT NULL,
  supported_claims INTEGER NOT NULL,
  factuality_pct REAL NOT NULL,
  unsupported_claims_json TEXT NOT NULL,
  scored_at TEXT NOT NULL
);
```

- Surfaces on `/newsbites` table next to the operator rating column.
- Per-vertical, per-model averages on `/models` and `/ratings`.
- Signal for the routing layer: if a model's average factuality < 80% for a vertical, deprioritize it for that vertical.

---

## 11.6 UX Maturity (Linear / Vercel / Stripe Polish)

The premium SaaS dashboards all share a posture: **density lives in behavior, not pixels**. V4.6 codifies the patterns the research surfaced and applies them consistently.

### 11.6.1 Interaction density rules

Applied to every list, table, and card across the dashboard:

- Every row is clickable, keyboard-focusable, has a context menu (right-click or `⌘+.`), and exposes secondary actions on hover.
- Multi-select: `shift+click` extends, `⌘+click` toggles. Selection shows a sticky bulk-actions strip at the bottom.
- Hover preview: rows with longer content (article body, dossier markdown) get a left-edge preview pane on hover after 500ms — like Linear's issue hover.
- Empty state shows the *most likely next action* prominently, not a generic illustration.

### 11.6.2 Command palette deepening

V4 specifies a command palette. V4.6 adds:

- **Inline arguments**: `> publish article finance-btc-q1` — the article slug is an autocomplete parameter, not a navigate-then-act sequence.
- **Action results inline**: simple actions (kick pipeline, restart service) render their result inside the palette without closing it.
- **Recency weighting**: most-used commands surface first; per-action use counters stored in `command_palette_history`.
- **Filtering syntax**: `> /traces service:litellm status:error` jumps straight to a filtered view.
- **Help glyph**: typing `?` shows all keyboard shortcuts.

```sql
CREATE TABLE command_palette_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  arguments_json TEXT,
  used_at TEXT NOT NULL,
  outcome TEXT                    -- success | error | cancelled
);
```

### 11.6.3 URL-state for filters

Every filter, sort, tab, and selection on every page reflects in the URL:

- `/traces?service=litellm&status=error&since=24h&trace=abc123-expanded`
- `/newsbites?vertical=finance&rated=unrated&sort=date_desc`
- Operator can share any view as a link. Browser back/forward navigates between filter states.

Helper hook: extend `useTablePage.ts` (already in codebase) to push/pop state via `URLSearchParams`.

### 11.6.4 Keyboard chord navigation

A Linear-style chord system in addition to command palette:

| Chord | Action |
|---|---|
| `g h` | Goto Home |
| `g m` | Goto Models |
| `g t` | Goto Traces |
| `g a` | Goto Autopipeline |
| `g n` | Goto NewsBites |
| `g c` | Goto Calendar |
| `g v` | Goto Vault |
| `c` | Create (context-aware: in /newsbites = new topic, in /incidents = new incident) |
| `e` | Edit current row |
| `j` / `k` | Next / previous row |
| `o` | Open current row (detail drawer) |
| `?` | Show shortcuts overlay |

Implemented as a single global keydown handler with active-context awareness. Disabled inside text inputs.

### 11.6.5 Mobile floating bottom bar

Adopt the Vercel 2026-02 pattern: persistent floating action bar at the bottom of every page on mobile, optimized for one-handed use.

```
        ┌────────────────────────────────────────┐
        │ ●  Mission   Newsbites   Models   ☰   │   ← always visible, swipeable
        └────────────────────────────────────────┘
```

- Centerpiece is the contextual primary action (varies per page).
- Long-press the menu icon (`☰`) opens the full nav as a bottom sheet.
- Auto-hides on scroll down, reveals on scroll up.

### 11.6.6 Agent UX principles

Codified across `/claude`, `/codex`, `/opencode`, `/assistant`:

1. **Transparency**: every agent action shown in real time (already V4.5).
2. **Explainability**: every non-obvious decision has a "why?" affordance that opens reasoning trace.
3. **Override at any point**: `Esc` cancels current tool call; `⌘+Enter` inserts a steering message; persistent "stop and ask me" toggle.
4. **Graceful recovery**: on failure, the system suggests next action (retry with override, escalate to operator, save handoff packet) — never just throws.
5. **Status communication**: agent state always pinned visible (running / waiting input / awaiting approval / failed) — no inferring from log scroll.

Applied as a UX rubric reviewed before any agent surface ships.

---

## 11.7 MCP & Skill Marketplace

### 11.7.1 MCP server browser

Inside `/opencode` (and as a general settings surface):

- **Installed** tab: current MCP servers from config.
- **Browse** tab: curated list of public MCP servers (a JSON catalog committed to the workspace at `mcp-catalog.json`, manually curated by the operator).
- Per server: name, description, tool count, auth type, install command.
- One-click install: writes the server entry to `~/.opencode/config.json`, prompts for required env vars (with secret-paste flow), tests connection, shows tool list.

Catalog seed list (operator-curated):
- `filesystem` (anthropic-mcp)
- `puppeteer` (anthropic-mcp)
- `slack` (community)
- `github` (anthropic-mcp)
- `playwright` (microsoft-mcp)
- `everart` (replicate)

### 11.7.2 Skill usage analytics

For every skill installed in agent CLIs (Claude, Codex, OpenCode):

```sql
CREATE TABLE skill_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  session_id TEXT,
  invoked_at TEXT NOT NULL,
  duration_ms INTEGER,
  outcome TEXT                    -- completed | error | cancelled
);
```

Surface: `/settings` → "Skills".
- Per skill: invocation count (24h / 7d / 30d), avg duration, error rate, last used.
- "Unused for 60 days" badge: candidate to deprecate or document better.
- "Heavily used but high error rate" alert: candidate to improve.

### 11.7.3 Suggested skills (contextual)

When opening an agent session in `/opt/newsbites`, surface the most-frequently-used skills in that workspace (`/newsbites-devcheck`, `/init`, `/review`) at the top of the skill picker. When opening in `/opt/opencode-control-surface`, surface `/dashboard-v4`, `/stack-status`, etc.

Source: `skill_usage` table joined with `agent_sessions.cwd`.

---

## 11.8 Cost Intelligence (Deepening V4 Costs)

V4.5 specifies a model ROI calculator and cost forecasting. V4.6 adds the granularity that makes it actionable.

### 11.8.1 Per-article cost attribution

Every published article has a total cost figure assembled by summing the cost attribute on every span in its trace. Stored in `article_costs`:

```sql
CREATE TABLE article_costs (
  slug TEXT PRIMARY KEY,
  total_usd REAL NOT NULL,
  cost_by_stage_json TEXT NOT NULL,    -- {"research":0.04,"write":0.12,"verify":0.06,"publish-prep":0.01}
  cost_by_model_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  trace_id TEXT NOT NULL
);
```

Surfaces:
- `/newsbites` table: optional "Cost" column.
- `/ratings` correlation tab: scatter `cost vs rating`, identifying expensive bad articles.
- `/costs` page: top-10 most expensive articles ever, top-10 cheapest ≥4★ articles (efficient producers).

### 11.8.2 Cost anomaly detection

A periodic job (every hour) computes the rolling median cost per stage. If a recent stage span ran at > 2.5x the median, log an event in `events` with `source = 'cost_anomaly'`. Surfaces as an opportunity card on home and on the article's detail panel.

### 11.8.3 Pareto frontier visualization

On `/models`, a new chart: x-axis = average cost per article (last 30d), y-axis = average rating (last 30d), points = models. The Pareto frontier (models that nobody dominates) is highlighted. Models inside the frontier are "dominated" — strictly worse than at least one frontier model on both axes — and are candidates for removal from rotation.

### 11.8.4 Routing-health map

Operator-facing summary on `/models`:

```
Logical name              → Physical model               Status      Last 24h cost
────────────────────────────────────────────────────────────────────────────────
editorial-cloud-heavy     → nemotron (or github-gpt41)   healthy     $0.42
editorial-heavy           → gemma4:26b (local)           healthy     $0.00
routing-cheap             → gemma4:26b (local)           healthy     $0.00
mimule-chat               → qwen3:8b (local)             healthy     $0.00
coding-heavy              → gemma4:26b (local)           DEGRADED    GPU down
```

Override controls per logical name: temporarily pin to a specific physical model with confirm-gate and audit. Useful for: "force everything off nemotron for 1 hour while OpenRouter is misbehaving".

---

## 11.9 Explainability ("Why did this happen?")

For any anomaly, failure, or non-obvious state, an "Explain" affordance produces a generated narrative grounded in the underlying data.

### 11.9.1 Auto-generated incident narratives

When an incident opens, automatically draft a narrative:

> *Incident opened at 14:32 UTC. The autopipeline marked story `finance-btc-q1` as failed at the verify stage. The verify model `editorial-heavy` returned a JSON parse error (event log line 4 in span `2f3b…`). This appears related to the GPU tunnel restarting at 14:29 (`vast-tunnel.service` log line 89). The pipeline retried twice with no success. Suggested action: wait for tunnel stability, then run `replay-from-step verify` on the trace.*

Generated by calling `editorial-cloud-fast` with a templated prompt fed the incident's spans, related logs, and the recent service status. Saved as the incident's `auto_narrative` field. Manually editable. Always shown with a "Generated — verify before action" disclaimer.

### 11.9.2 Causal chain rendering

For a failed pipeline run, a vertical timeline:

```
 ✕  14:32:08  pipeline.verify failed (JSON parse error)
 │
 ↑  14:29:54  vast-tunnel.service restart
 │
 ↑  14:29:48  vast-tunnel.service health probe failed
 │
 ↑  14:29:15  Vast instance reported low VRAM (23.8/24.0 GB)
 │
 ↑  14:27:02  gemma4:26b loaded into VRAM (17.1 GB)
```

Each event links to its source (journal line, span, system_configs change). Renders the chain that led to the failure visually.

---

## 11.10 SQLite Schema Summary (V4.6 additions)

```sql
-- Tracing
CREATE TABLE spans ( ... );                            -- see 11.1.1

-- Evals
CREATE TABLE eval_runs (
  id TEXT PRIMARY KEY,
  pack_name TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  baseline_run_id TEXT,
  results_json TEXT NOT NULL,
  judge_calibration_kappa REAL
);
CREATE TABLE golden_dataset ( ... );                   -- see 11.2.4

-- Prompts
CREATE TABLE prompt_versions ( ... );                  -- see 11.3.1
CREATE TABLE prompt_experiments ( ... );               -- see 11.3.2
CREATE TABLE config_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  snapshotted_at TEXT NOT NULL,
  related_action_id TEXT
);

-- Workflow
CREATE TABLE pipeline_checkpoints (
  trace_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  input_hash TEXT NOT NULL,
  output_path TEXT,
  output_hash TEXT,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by TEXT,
  approved_at TEXT,
  approval_reason TEXT,
  PRIMARY KEY (trace_id, step_id)
);

-- Factuality
CREATE TABLE article_factuality ( ... );               -- see 11.5.4

-- Skills
CREATE TABLE skill_usage ( ... );                      -- see 11.7.2

-- Cost
CREATE TABLE article_costs ( ... );                    -- see 11.8.1

-- Palette
CREATE TABLE command_palette_history ( ... );          -- see 11.6.2
```

---

## 11.11 BFF Endpoint Additions (V4.6)

```
-- Tracing
GET  /api/traces                      list with filters
GET  /api/traces/:trace_id            full DAG for a run
GET  /api/traces/:trace_id/spans      flat span list
POST /api/traces/diff                 body: {trace_a, trace_b}; returns diff payload
POST /api/internal/spans              ingestion endpoint for instrumented services

-- Evals
GET  /api/evals/packs
GET  /api/evals/packs/:name
POST /api/evals/packs/:name/run       body: {baseline?: "master"|trace_id}
GET  /api/evals/runs
GET  /api/evals/runs/:id

-- Prompts
GET  /api/prompts                     all tracked prompt paths
GET  /api/prompts/:path/versions
GET  /api/prompts/:path/versions/:id
POST /api/prompts/:path/promote       body: {version_id, reason}

-- Experiments
GET  /api/experiments
POST /api/experiments                 start
POST /api/experiments/:id/end         body: {winner, promote: bool}
POST /api/experiments/:id/kill        emergency stop

-- Config snapshots
GET  /api/configs/:name/snapshots
GET  /api/configs/:name/snapshots/:id/diff?to=

-- Workflow
GET  /api/pipeline/runs/:trace_id/checkpoints
POST /api/pipeline/replay             body: {trace_id, from_step, overrides}
POST /api/pipeline/runs/:trace_id/steps/:step_id/approve

-- Factuality
GET  /api/factuality/:slug
POST /api/factuality/:slug/rescore

-- Skills
GET  /api/skills
GET  /api/skills/:name/usage
GET  /api/skills/suggestions?cwd=

-- MCP
GET  /api/mcp/installed
GET  /api/mcp/catalog
POST /api/mcp/install                 body: {catalog_id, env}
POST /api/mcp/test                    body: {server, tool, params}

-- Costs
GET  /api/costs/articles?since=
GET  /api/costs/pareto
GET  /api/routing/health-map
POST /api/routing/override            body: {logical, physical, ttl_minutes, reason}

-- Explainability
GET  /api/incidents/:id/narrative
POST /api/incidents/:id/narrative/regenerate
GET  /api/traces/:trace_id/causal-chain
```

---

## 11.12 Build Phases (V4.6)

V4.6 phases follow V4.5.9 and are additive. They presume V4.5 surfaces exist and have settled in production.

### Phase V4.6.0 — OTLP Backbone

- `spans` table + ingestion endpoint.
- LiteLLM callback enhanced to emit OTLP spans (extends V4 observability `litellm_routing_log`).
- Autopipeline instrumented: every stage emits start/end spans with attributes.
- Control-surface BFF instrumented: every API call is a root span.
- `/traces` route with filtered list view.

### Phase V4.6.1 — Agent Graph & Two-run Diff

- DAG visualization component (reactflow).
- `/traces/:id` detail view.
- Two-run diff mode.
- Pipeline-as-checkpointed-workflow (`pipeline_checkpoints` table populated).
- Replay-from-step endpoint and UI action.

### Phase V4.6.2 — Eval Foundation

- `eval_runs`, `golden_dataset` tables.
- Eval pack runner (`server/evals/runner.ts`).
- `/api/evals/*` endpoints.
- `/ratings` page "Eval History" tab.
- Judge calibration job (quarterly cron).

### Phase V4.6.3 — Prompt & Config Versioning

- `prompt_versions`, `prompt_experiments`, `config_snapshots` tables.
- `/settings` → "Prompt Registry" subpage.
- `/settings` → "Prompt Experiments" subpage.
- `/infra` config viewer enhanced with history tab.
- Pre-push git hook for CI-blocking evals on prompt changes.

### Phase V4.6.4 — Factuality Pipeline

- Claim extraction stage in autopipeline (after write).
- Source attribution via verify stage enhancement.
- `article_factuality` table populated.
- Marginalia view in dossier inspector publish preview.
- Factuality column on `/newsbites` and `/ratings`.
- Per-vertical, per-model factuality averages on `/models`.

### Phase V4.6.5 — UX Polish

- Global keyboard chord handler.
- Command palette deepening (inline args, recency weighting, result inline).
- URL-state for all filter/sort/tab state.
- Hover preview pane component (Linear-style).
- Mobile floating bottom bar.
- Bulk-actions strip pattern applied to all tables.

### Phase V4.6.6 — Skills & MCP Marketplace

- `skill_usage`, `mcp_catalog` tables.
- `/settings` → "Skills" subpage with usage analytics.
- `/opencode` MCP browser tab (installed + browse).
- One-click MCP install flow with secret-paste UX.

### Phase V4.6.7 — Cost & Routing Intelligence

- `article_costs` table populated from span data.
- Cost-per-article column on `/newsbites`.
- Pareto frontier chart on `/models`.
- Routing-health map on `/models`.
- Cost anomaly detector → opportunity cards on home.
- Override controls (logical→physical pin with TTL).

### Phase V4.6.8 — Explainability

- Auto-generated incident narratives.
- Causal chain renderer.
- "Why did this happen?" affordance on home health card, models scorecard, and incident detail.

---

## 11.13 Exit Criteria for V4.6

- Every pipeline run is rendered as a clickable DAG with per-node duration, cost, and status.
- Every prompt change is gated by an eval pack; merges blocked on > 5% quality regression vs baseline.
- Every published article has an automated factuality score independent of human ratings, and unsupported claims are flagged inline before publish.
- The operator can answer "what changed?" for any incident in one click via the causal chain view.
- Operator can replay any pipeline step with an override and compare against the original in a side-by-side trace diff.
- Command palette handles 80% of navigation; keyboard chords handle 90% of intra-page actions; mouse is for exploration, not for operation.
- Every cost figure on the dashboard ties back to a specific span, model, and prompt version — no opaque numbers.

---

## 11.14 Open Questions (V4.6)

1. **OTLP ingestion volume**: every pipeline stage emitting spans could generate 50–100 spans/day. At 30-day retention, that is ~3K rows. Cheap on SQLite. The risk surface is span attribute size — cap attribute JSON at 16KB per span and truncate with a tail-marker.
2. **Judge model cost**: if every published article triggers a 3-judge factuality scoring pass, that is meaningful LiteLLM credit burn. Use `editorial-cloud-fast` (free tier) for two of the three judges; reserve `editorial-cloud-heavy` for the consensus judge. Estimate cost in Phase V4.6.4 before shipping.
3. **CI-blocking eval bypass**: power users will `--no-verify` when they know what they're doing. Don't fight this. Log every bypass loudly and surface a weekly "bypass report" on `/ratings`.
4. **Replay determinism**: pipeline replays must be byte-identical to the original input. If a research scraper has nondeterministic ordering, replay diverges. Solution: snapshot the *materialized* research output in `dossiers/...`; replay reads from snapshot, not re-runs scrape. Documented as a pipeline invariant.
5. **Per-claim factuality false negatives**: a true claim might be marked unsupported if the source matching is weak. Mitigation: require operator to confirm a "block publish" decision on factuality grounds; the alert is informational, not gating, in early phases. After 60 days of data, tune the threshold.
6. **Mobile bottom bar vs in-page CTAs**: on agent pages the embedded shell already lives at the bottom on mobile. Resolve the conflict: shell uses bottom *sheet* (swipe up); navigation uses bottom *bar* (always visible). Bar hides when sheet is expanded.
7. **Prompt experiment leak to readers**: an A/B experiment on the write prompt could put a worse article in front of readers. Guardrail: experiments default to "shadow mode" — both prompts run, but only version A's output is published. Judge scores both privately. Promote to live A/B only with explicit operator opt-in for non-sensitive verticals.

---

## 11.15 What V4.6 *Doesn't* Do

To prevent scope drift:

- **No multi-tenant or org features.** Single operator, single VPS.
- **No external eval-as-a-service integration.** All evals run locally against LiteLLM. If the operator wants Braintrust/Langfuse later, the OTLP backbone makes that a one-week migration.
- **No fancy AI-generated dashboard widgets.** V4.6 is about making existing surfaces trustworthy and fast; not adding more places to look.
- **No new top-level routes** beyond `/traces`. Everything else is depth on V4.5 surfaces.
- **No agent autonomy escalation.** The operator remains the approval surface for every editorial decision. V4.6 makes that approval faster and better-informed, not optional.

---

## Research Sources (2026-05-15 pass)

Observability & agent monitoring:
- AppScale Blog — Langfuse vs LangSmith vs Braintrust vs Helicone (2026)
- Latitude — Best LLM Observability Tools for AI Agents (2026)
- Braintrust — Agent observability: The complete guide for 2026
- Sentry — AI agent observability developer guide
- Arize — Best AI Observability Tools for Autonomous Agents in 2026

Editorial agentic systems:
- Nieman Lab — Big newsrooms pave the way for AI agents in journalism
- INMA — 4 agentic AI case studies show how it's transforming media
- Medium / NJ Raman — The Architecture of Agency: Deep Technical Guide to Agentic AI Systems 2026
- InfoWorld — Best practices for building agentic systems

Evaluation & hallucination:
- arXiv 2508.03860 — Hallucination to Truth: Fact-Checking and Factuality Evaluation in LLMs
- Lakera — LLM Hallucinations in 2026
- Dev|Journal — Debugging LLM-as-a-Judge: Why 42% of Hallucinations are Actually Pipeline Failures
- Confident AI — DeepEval framework documentation
- Promptfoo official docs and LLM-as-a-Judge guide

Orchestration:
- Docs.langchain.com — LangGraph overview
- AgentMarketCap — LangGraph vs Temporal for Long-Running Agent Workflows (2026)
- Kinde — Orchestrating Multi-Step Agents: Temporal/Dagster/LangGraph Patterns
- Digital Applied — AI Workflow Orchestration Tools 2026 Comparison

UX:
- Mantlr — How Stripe, Linear, and Vercel Ship Premium UI
- Vercel changelog — Dashboard redesign rollout (2026-02-26)
- GlitchLabs — Admin Dashboard UX Patterns for Operational Teams (2026)
- Pencil & Paper — Dashboard Design UX Patterns Best Practices
- Maggie Appleton — Command K Bars
