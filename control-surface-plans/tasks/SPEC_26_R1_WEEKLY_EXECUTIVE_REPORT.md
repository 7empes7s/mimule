# SPEC 26 — ULTRAPLAN Catalog R, R1: Weekly Executive Report

## Context (read first)
ULTRAPLAN R1: *"Weekly Executive Report (Mondays 07:00 UTC, auto): health-score trend
sparkline, incidents opened/closed/auto-remediated share, MTTR, cost MTD + projection +
saved-by-free-first estimate, model availability %, deploys shipped, content published,
top-3 open risks with recommended actions. One page. Telegram + /reports."* Catalog R
preamble: *"All reports: generated server-side into `reports` table + file artifact, listed
on /reports, delivered per the notifications matrix, honest about missing sources ('not
configured' sections, never padded)."*
Work in `/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD `f758780` (verified — EXTEND, do not replace; REUSE, do not duplicate):
- `server/reporting/digest.ts`: `collectDigestStats` (safeCount/safeSum idiom, tenant-scoped),
  `renderDigestText`, weekly/daily gates (`shouldSendWeeklyDigest`, `maybeGenerateDailyDigest`
  ticked from server/index.ts), archives via INSERT into `report_archive`
  (ts/kind/path/summary) + file artifact, Telegram delivery. THIS is the idiom to follow.
- `server/api/cost.ts` ~lines 726-800: R2 CFO headline math — month-to-date cents, projected
  month-end (null under 2 elapsed days — honest), saved-by-free-first baseline math with the
  "Never invent a number" guard. REUSE these computations (extract to exported helpers if
  they're inline in a handler; response shapes must stay byte-identical).
- Health score: `computeTrustScore()` + `getTrustScoreHistory(7)` (see digest.ts imports).
- Incidents: `reasoner_incidents` table; /incidents API has bounded MTTA/MTTR queries
  (recency-bounded — reuse that exact bounding, ancient rows skew averages).
- Model health: `server/api/models.ts` — `DASHBOARD_MODEL_HEALTH_PATH` env seam (default
  /var/lib/mimule/model-health.json), honest degrade when absent.
- Deploys: `jobs` table (kind = the newsbites-deploy jobKind; check exact string).
- /reports page lists `report_archive` rows via GET /api/reports; POST /api/reports/digest
  exists as the manual-trigger idiom (mutation-gated).
- Notifications: the digest's Telegram sender in server/notifications/ — only sends when
  configured, never fails the report.

## Build this

### 1. Collector + renderer (`server/reporting/executive.ts`, new)
- `collectExecutiveStats(periodStart, periodEnd)` returning a typed struct with one field
  per section; every section is `{configured: false}` OR real data — NEVER fabricated:
  - healthScore: current + 7-day history (delta + a text sparkline from history values).
  - incidents: opened, closed, auto-remediated count + share, MTTR (recency-bounded like
    /incidents) for the period.
  - cost: MTD cents, projected month-end cents (nullable), saved-by-free-first cents
    (nullable) — via the REUSED R2 helpers; each nullable value renders honestly
    ("insufficient data", "no paid baseline configured").
  - modelAvailability: % of models healthy from the model-health file (honest not-configured
    when the file is absent/stale, same staleness rule models.ts uses).
  - deploys: count of deploy jobs finished in period (0 is a real number; "not configured"
    only when the deploy feature is unavailable — reuse `newsBitesDeployAvailable()`).
  - contentPublished: count from the data the CS already ingests (content_health/articles
    source — check what exists; if nothing reliable exists, `{configured: false}` with an
    honest label. Do NOT scrape /opt/newsbites).
  - topRisks: top 3 OPEN insights by severity/recency with title + recommended action
    (the insight's action descriptor id/label when present).
- `renderExecutiveReport(stats, period)`: one-page Markdown — title with ISO week + period,
  the sections above, each honest section renders its data or its "not configured" line.
  No MIMULE-specific hardcoded names in section structure (data values may naturally
  contain them on this host).
- `generateWeeklyExecutiveReport({force})`: collect (7-day period ending now) → render →
  write file artifact next to the digest artifacts (same dir + naming idiom, kind
  `weekly-executive`) → INSERT report_archive → Telegram summary (few lines + "full report
  on /reports") via the existing sender, non-fatal on failure. Returns
  {generated, path?, skipped?}.
- Weekly gate `maybeGenerateWeeklyExecutiveReport({force})`: generate when now is past
  Monday 07:00 UTC of the current ISO week AND no `weekly-executive` report_archive row
  exists in that window yet (query, not in-memory state — restart-safe). Tick it from the
  same place server/index.ts ticks the digest gates, same cadence.

### 2. API + UI
- `POST /api/reports/executive` — mutation-gated manual trigger (`{force:true}`), returns
  the generation result; register next to POST /api/reports/digest in router.ts. Audit
  like the digest trigger does (follow its idiom exactly).
- /reports page: `weekly-executive` rows appear via the existing archive list. Add a
  "Generate executive report" button next to the existing digest trigger button (same
  component idiom). If the page renders kind labels, add a human label.

### 3. Tests (hermetic — temp DASHBOARD_DB_PATH; temp DASHBOARD_MODEL_HEALTH_PATH; temp artifact dir if the digest writer has a seam, else write under the temp DB's dir)
- `server/reporting/executive.test.ts`: seeded temp DB (cost_events, insights incl. open
  high-severity ones, reasoner_incidents, jobs deploy rows) → collect returns real numbers;
  empty temp DB + absent model-health file → every section honestly not-configured/zero,
  render contains the honest labels and NEVER invents numbers; weekly gate: before Monday
  07:00 UTC → skip, after → generate once, second call same week → skip (inject `now`);
  archive row written with kind `weekly-executive`; Telegram stubbed (globalThis.fetch) and
  non-fatal on failure.
- If cost helpers were extracted from api/cost.ts: existing cost tests must stay green
  (extraction behavior-neutral).

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts`; never widen `e2e/fresh-host/gate.sh`.
- Existing digest generation, /api/reports responses, and cost API responses byte-identical.
- Tests never write the live `/var/lib/control-surface/dashboard.sqlite` or
  /var/lib/mimule/*; never send real Telegram messages (stub fetch).
- Do NOT touch builder/runner/terminal/gateway/runbooks files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/reporting/executive.test.ts server/reporting/digest.test.ts server/api/cost.test.ts --timeout 60000` — all pass (adjust file list to what exists).
3. `git status --short` — ONLY: executive.ts+test (new), digest.ts or index.ts (tick wiring),
   cost.ts (only if helpers extracted), router.ts, ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed; the section-collection struct; the honest not-configured render sample (empty
DB); the weekly-gate logic; where the tick was wired; test summaries; explicit confirmation
that digest/cost/report-list behavior is byte-identical and no live paths are written.
