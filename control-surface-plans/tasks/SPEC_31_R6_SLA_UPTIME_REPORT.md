# SPEC 31 — ULTRAPLAN Catalog R, R6: SLA / uptime report

## Context (read first)
ULTRAPLAN R6: *"SLA / uptime report — per-service uptime from sentinel samples, breach
counts, near-misses; needs the SLA detector (P2)."* Work in `/opt/opencode-control-surface`.
Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — FOLLOW the report idiom exactly):
- `server/reporting/executive.ts` / `remediation.ts` / `systemLabor.ts` are the templates:
  `Configured<T>` sections, honest zero/"not configured", restart-safe schedule gate from
  `report_archive`, vault-root artifact seam, report_archive + report_runs (kind on
  /reports), Telegram non-fatal, `writeActionAudit`, tick in the SAME 15-min interval in
  server/index.ts, `POST /api/reports/<kind>` (checkToken + requireMutation), ReportsPage
  label + generate button via generateDigest(kind).
- Uptime source: `metric_samples` rows with `source = 'services'` and `key = '<service>.state'`,
  value_json `{"state":"active"|"inactive"|"unknown", ...}`. Distinct states live:
  active, inactive, unknown. Per-service, the sample stream is dense (the sentinel writes
  every few seconds). Some services are entirely `unknown` (they don't exist on this host)
  — those must render "no data", NOT 0% uptime.
- SLA breaches: the SPEC 9 detector emits insights with `source_key LIKE 'ops:sla-breach:%'`
  (4h open-incident threshold). Breach counts = those insights raised/resolved in period.

## Build this

### 1. Collector + renderer (`server/reporting/slaUptime.ts`, new)
- `collectSlaUptimeStats(periodStart, periodEnd)` → `Configured<T>`:
  - services: array, one per distinct `services|*.state` key that has ≥1 non-unknown sample
    in period, each `{service, upSamples, downSamples, uptimePercent, unmeasuredSamples}`
    where up = state 'active', down = state 'inactive', unmeasured = 'unknown';
    uptimePercent = up / (up + down) × 100 (unknown EXCLUDED from the denominator — it is
    "no measurement", surfaced separately as unmeasuredSamples). A service whose in-period
    samples are ALL unknown is omitted from `services` and counted in `noDataServices`.
    Sort by uptimePercent ascending (worst first — the ones that need attention).
  - noDataServices: names with only unknown samples in period (honest "monitored but no
    determinate state this period").
  - overall: fleet uptime = Σup / (Σup + Σdown) × 100 across measured services.
  - breaches: {raised, resolved, openNow} from insights `source_key LIKE 'ops:sla-breach:%'`
    (raised = created_at in period; resolved = resolved_at in period; openNow = status open).
  - nearMisses: services with 90% ≤ uptimePercent < 100% in period (the "watch" list) —
    count + names. (Threshold stated in the render.)
- `renderSlaUptimeReport(stats, period)` — one page Markdown "SLA / Uptime Report —
  <ISO week>": overall fleet uptime line; a per-service table (service | uptime% | up |
  down | unmeasured) worst-first; the breach line (raised/resolved/open); the near-miss
  watch list; and a "no determinate data" line listing noDataServices. Honest "not
  configured" only if metric_samples is absent; honest "no measured services this period"
  if every service is no-data.
- `generateWeeklySlaUptimeReport({force, now?})` + gate
  `maybeGenerateWeeklySlaUptimeReport` — weekly, Monday 07:00 UTC current ISO week,
  report_archive dedupe for kind `weekly-sla-uptime` in the Monday-to-Monday window
  (restart-safe). Artifact `weekly/<YYYY-MM-DD>-sla-uptime.md`, report_archive +
  report_runs, Telegram summary (fleet uptime + worst service + open breaches) non-fatal,
  audit `reports.sla-uptime`.

### 2. Wiring
- server/index.ts: add `maybeGenerateWeeklySlaUptimeReport` to the SAME 15-min interval
  callback (no new timer).
- router.ts: `POST /api/reports/sla-uptime` — checkToken + requireMutation, matching the
  system-labor trigger.
- ReportsPage.tsx: kind label ("Weekly SLA / Uptime Report") + generate button via
  generateDigest(kind).

### 3. Tests (`server/reporting/slaUptime.test.ts`, hermetic temp DB + temp vault; Telegram stubbed)
- Seed metric_samples: a service with mixed active/inactive → correct uptime% (unknown
  excluded from denominator); a service with all-unknown → noDataServices, omitted from
  services; a 95%-up service → near-miss list. Seed ops:sla-breach insights raised+resolved
  → breach counts. Assert overall fleet uptime, worst-first ordering, near-miss threshold,
  honest no-data rendering.
- Empty DB → honest "not configured"/"no measured services". Gate: before/after Monday
  07:00 + same-week dedupe with injected now; archive + run rows asserted; force bypasses.

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit autoapplyPolicy.ts; never widen gate.sh.
- Do NOT modify executive/remediation/systemLabor/digest or existing endpoints (index.ts
  tick callback + router addition + ReportsPage extension only).
- Tests never write the live DB or /opt/ai-vault; never send real Telegram.
- Do NOT touch builder/runner/terminal/gateway/runbooks/compliance files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean.
2. `DASHBOARD_DB=1 bun test server/reporting/slaUptime.test.ts server/reporting/systemLabor.test.ts server/reporting/executive.test.ts server/api/reports.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: slaUptime.ts+test (new), index.ts, router.ts, ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — clean.

## Report back
Files changed; the uptime SQL (unknown-excluded denominator); the no-data handling; an
empty-DB render sample; a seeded render sample; test summaries; explicit confirmation the
other reports are untouched and no live paths written.
