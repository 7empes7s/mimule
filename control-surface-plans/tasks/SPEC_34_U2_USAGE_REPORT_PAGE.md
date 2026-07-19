# SPEC 34 — ULTRAPLAN Catalog U, U2: Usage report page (which modules earn their keep)

## Context (read first)
ULTRAPLAN U2: *"Usage report page (/reports section): which modules earn their keep —
visits, actions, findings-acted-on per page. This data DECIDES the SKU split in P6 (don't
guess what's sellable-in-parts; measure which parts get used)."* Work in
`/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD `a0fd1a8` (verified — EXTEND, keep byte-identical):
- `server/usage/analytics.ts` (SPEC 33): `getUsageSummary(from, to)` →
  `{from, to, paths: [{path, pageviews, actions}], totals: {pageviews, actions}}` from
  `usage_daily` (pageviews) + folded action_audit ('action' rows). `GET /api/usage/summary`
  (checkToken) already returns this. usage_daily is populated by `rollupUsageDaily` on the
  retention scheduler tick.
- Insights carry an owning-page pointer: `insights.manualPageHref` (e.g. "/insights",
  "/incidents") and a status ('open'|'applied'|'resolved'|...). "Findings acted on" =
  insights with status in ('applied','resolved') and resolved_at/updated_at in period,
  attributed to their manualPageHref.
- `app/routes/ReportsPage.tsx` is the reports hub (archive list + generate buttons). Follow
  its idioms + the shared table standard (paginate, sort, search/filter, honest empty
  states) used across the app.

## Build this

### 1. Backend — module usage summary (extend `server/usage/analytics.ts`, additive)
- Add `getModuleUsage(periodStart, periodEnd)` returning
  `{from, to, modules: [{path, pageviews, actions, findingsActedOn}], totals:{pageviews,
  actions, findingsActedOn}}`:
  - pageviews + actions from the existing usage_daily query (reuse getUsageSummary's query
    or factor a shared helper — do NOT change getUsageSummary's existing return shape;
    /api/usage/summary must stay byte-identical).
  - findingsActedOn: per manualPageHref, COUNT of insights where status IN
    ('applied','resolved') AND COALESCE(resolved_at, updated_at) in [from,to) (tenant-
    scoped). Normalize manualPageHref to a path key (strip query/hash, leading '/'), so it
    joins the usage `path` space; findings whose page has no usage row still appear as their
    own module row (LEFT-join semantics — union the key sets).
  - Sort modules by a sensible "earns its keep" order: actions desc, then findingsActedOn
    desc, then pageviews desc, then path.
  - Honest zeros; `{configured:false}`-style not needed here (empty modules array + zero
    totals is the honest empty state).
- `GET /api/usage/modules?from&to` (checkToken; default trailing 30 days; 400 on bad params
  like the summary route) → getModuleUsage.

### 2. Frontend — Module usage section on ReportsPage (`app/routes/ReportsPage.tsx`)
- A "Module usage" section (heading + short blurb: "Which modules earn their keep —
  measured, not guessed") with a period selector (reuse the 7d/30d/90d preset idiom if the
  page has one; else a simple select defaulting 30d). Fetch `/api/usage/modules` via the
  page's authenticated fetch/useApi idiom.
- A table following the shared standard: columns Module (path), Visits (pageviews), Actions,
  Findings acted on — sortable, searchable/filterable by module, paginated. A totals row.
  Honest empty state: "No usage recorded yet — usage accrues as the dashboard is used
  (page visits need the beacon; actions and findings come from the audit history)."
- Keep it a TABLE (no new charting dependency); match the app's existing table components.

### 3. Tests
- `server/usage/analytics.test.ts` (extend): getModuleUsage — seed usage_daily (pageviews +
  action rows) and insights (applied/resolved in/out of period, various manualPageHref) →
  assert per-module pageviews/actions/findingsActedOn, the key-union (a findings-only module
  with no usage still appears; a usage-only module with no findings shows 0), totals,
  ordering; empty DB → empty modules + zero totals. getUsageSummary unchanged (existing
  tests stay green).
- API: GET /api/usage/modules happy path + 400 bad params + 401 unauthenticated (checkToken).

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts. No new deps / no external calls.
- Do NOT edit autoapplyPolicy.ts, server/telemetry/*, the execute hot path, the beacon, or
  any report file; never widen gate.sh.
- getUsageSummary + /api/usage/summary + beacon behavior byte-identical.
- Tests never write the live DB; no real network.
- Do NOT touch builder/runner/terminal/gateway/runbooks/compliance files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean.
2. `DASHBOARD_DB=1 bun test server/usage/analytics.test.ts server/api/router.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: analytics.ts(+test), router.ts, ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — clean.

## Report back
Files changed; the getModuleUsage query incl. the findings-acted-on attribution + key-union;
confirmation getUsageSummary/summary route are byte-identical; the empty-state copy; test
summaries; confirmation no external calls and reports/telemetry/execute-path untouched.
