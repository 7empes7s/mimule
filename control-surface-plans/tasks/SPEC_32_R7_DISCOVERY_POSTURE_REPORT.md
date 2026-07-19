# SPEC 32 — ULTRAPLAN Catalog R, R7: Discovery posture report

## Context (read first)
ULTRAPLAN R7: *"Discovery posture report (weekly section in R1 + standalone): new assets
found, unregistered count trend, criticality coverage — the governance-posture number."*
Build the STANDALONE weekly report (do NOT modify executive.ts — the "R1 section" can come
later; keep this change isolated). Work in `/opt/opencode-control-surface`. Do NOT
commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — FOLLOW the report idiom exactly):
- `server/reporting/executive.ts` / `remediation.ts` / `systemLabor.ts` / `slaUptime.ts`
  are the templates: `Configured<T>` sections, honest zero/"not configured", restart-safe
  gate from `report_archive`, vault-root artifact seam, report_archive + report_runs (kind
  on /reports), Telegram non-fatal, `writeActionAudit`, tick in the SAME 15-min interval in
  server/index.ts, `POST /api/reports/<kind>` (checkToken + requireMutation), ReportsPage
  label + generate button via generateDigest(kind).
- Source: `discovered_assets` (columns: id, tenant_id, kind, signature, source_probe,
  first_seen, last_seen, status ['registered'|'unregistered'|'ignored'], fingerprint_json,
  registered_name, owner, criticality ['low'|'medium'|'high'|'critical'|NULL],
  attached_service, ignored_reason, updated_at). Live now: registered 24, unregistered 286,
  ignored 11; registered criticality high 4 / medium 6 / low 14.
- There is NO historical posture snapshot table — do NOT invent one. Derive the "trend"
  honestly from timestamps within the period (see below), not from stored history.

## Build this

### 1. Collector + renderer (`server/reporting/discoveryPosture.ts`, new)
- `collectDiscoveryPostureStats(periodStart, periodEnd)` → `Configured<T>`:
  - totals: current-state counts by status {registered, unregistered, ignored, total}
    (current snapshot — the governance-posture number IS the live unregistered count).
  - newThisPeriod: assets with first_seen in [periodStart, periodEnd) — count + by kind
    (top few). "What appeared this week."
  - registeredThisPeriod: status='registered' AND updated_at in period (assets triaged in).
  - stillUnregisteredNew: first_seen in period AND status='unregistered' (new gaps opened
    this period). Together with registeredThisPeriod this is the honest, snapshot-free
    "trend direction" — state it as "+X new gaps, −Y triaged this period", NOT a stored
    delta.
  - criticalityCoverage: of CURRENT registered assets, coveredCount (criticality NOT NULL)
    vs uncoveredCount (NULL), coveragePercent = covered/registered×100 (null when 0
    registered), plus the breakdown {critical, high, medium, low} counts. This is "do our
    registered assets have a criticality assigned" — the coverage number.
  - bySourceProbe: count of current assets grouped by source_probe (posture breadth — which
    probes surface inventory). Generic probe names only (they already are).
- `renderDiscoveryPostureReport(stats, period)` — one page Markdown "Discovery Posture
  Report — <ISO week>": a headline posture line ("N assets discovered; U unregistered
  (governance gap); C% of registered assets have a criticality assigned."), the
  status-breakdown, new-this-period (count + kinds), the honest period movement line
  (+new gaps / −triaged), the criticality coverage block, and the by-source-probe list.
  Honest zeros; "not configured" only if discovered_assets is absent.
- `generateWeeklyDiscoveryPostureReport({force, now?})` + gate
  `maybeGenerateWeeklyDiscoveryPostureReport` — weekly, Monday 07:00 UTC current ISO week,
  report_archive dedupe for kind `weekly-discovery-posture` in the Monday-to-Monday window
  (restart-safe). Artifact `weekly/<YYYY-MM-DD>-discovery-posture.md`, report_archive +
  report_runs, Telegram summary (discovered / unregistered / coverage%) non-fatal, audit
  `reports.discovery-posture`.

### 2. Wiring
- server/index.ts: add `maybeGenerateWeeklyDiscoveryPostureReport` to the SAME 15-min
  interval callback (no new timer).
- router.ts: `POST /api/reports/discovery-posture` — checkToken + requireMutation, matching
  the sla-uptime/system-labor triggers.
- ReportsPage.tsx: kind label ("Weekly Discovery Posture Report") + generate button via
  generateDigest(kind).

### 3. Tests (`server/reporting/discoveryPosture.test.ts`, hermetic temp DB + temp vault; Telegram stubbed)
- Seed discovered_assets across statuses, criticalities (some NULL), first_seen/updated_at
  in and out of period, multiple source_probes → assert status totals, newThisPeriod,
  registeredThisPeriod, stillUnregisteredNew, coveragePercent + breakdown (NULL excluded
  from covered), bySourceProbe grouping.
- Empty DB → honest "not configured"/zeros render. Gate: before/after Monday 07:00 +
  same-week dedupe with injected now; archive + run rows asserted; force bypasses.

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit autoapplyPolicy.ts; never widen gate.sh.
- Do NOT modify executive/remediation/systemLabor/slaUptime/digest or existing endpoints
  (index.ts tick callback + router addition + ReportsPage extension only).
- Tests never write the live DB or /opt/ai-vault; never send real Telegram.
- Do NOT touch builder/runner/terminal/gateway/runbooks/compliance/discovery-scanner files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean.
2. `DASHBOARD_DB=1 bun test server/reporting/discoveryPosture.test.ts server/reporting/slaUptime.test.ts server/reporting/executive.test.ts server/api/reports.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: discoveryPosture.ts+test (new), index.ts, router.ts, ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — clean.

## Report back
Files changed; the posture SQL; the snapshot-free trend derivation; the coverage
computation; an empty-DB render sample; a seeded render sample; test summaries; explicit
confirmation the other reports are untouched and no live paths written.
