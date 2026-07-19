# SPEC 27 — ULTRAPLAN Catalog R, R3: Monthly remediation-loop report

## Context (read first)
ULTRAPLAN R3: *"Remediation-loop report (monthly): loop-stats over time — auto-close %,
MTTR trend, recurrence flags raised/cleared, top flappers. Proves the autonomy claim with
data."* Work in `/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes
uncommitted.

Existing surface at HEAD `5960b39` (verified — this spec is mostly composition; FOLLOW the
executive-report idiom exactly):
- `server/reporting/executive.ts` (SPEC 26) — THE template: `Configured<T>` per-section
  stats, honest "not configured"/zero rendering, restart-safe schedule gate queried from
  `report_archive`, artifact under the vault-root seam (`DASHBOARD_AI_VAULT_DIR` ??
  `DASHBOARD_REPORTS_VAULT_DIR` ?? `/opt/ai-vault`), report_archive INSERT + report_runs
  INSERT (kind visible on /reports), Telegram summary non-fatal, `writeActionAudit`, tick
  wired in server/index.ts (15-min interval, unref, shutdown clear), POST manual trigger in
  router.ts, generate button + kind label on ReportsPage.tsx.
- `server/api/reasoner.ts` `reasonerLoopStatsHandler` (~line 309) — the point-in-time 7d
  loop stats: bounded mean-TTR (birth AND resolution inside window — REUSE this exact
  bounding rationale), auto-close/auto-resolve audit kinds, recurrence insights
  `source_key LIKE 'remediation:recurrence:%'`.
- SPEC 26 follow-up `5960b39` — auto-remediated share MUST use intersection semantics
  (incidents resolved in the window that carry a success auto-close/auto-resolve audit),
  never raw audit counts vs closed counts (first live executive report rendered 125%).
- `reasoner_incidents` columns: id, cluster_key, failure_class, title, first_seen,
  last_seen, occurrence_count, status, resolved_at, tenant_id.

## Build this

### 1. Collector + renderer (`server/reporting/remediation.ts`, new)
- `collectRemediationStats(periodStart, periodEnd)` — the period is the trailing ~30 days;
  split it into 4 consecutive 7-day buckets (oldest→newest, last bucket may be short).
  Returns `Configured<T>` sections:
  - loopTrend: per bucket {resolved, autoRemediated (intersection semantics), autoShare
    (null when resolved=0), mttrMs (bounded: born AND resolved inside the bucket, null when
    no sample)} — plus overall period totals.
  - recurrence: flags raised (insights created in period, source_key prefix
    'remediation:recurrence:'), cleared (resolved in period, same prefix), openNow.
  - topFlappers: top 5 incidents by occurrence_count among incidents with last_seen in the
    period — {title, failureClass, occurrenceCount, status}. Empty array is honest ("no
    flappers this period" — that is the success story).
- `renderRemediationReport(stats, period)` — one page Markdown: a compact per-week table
  (resolved / auto / share% / MTTR), trend sparkline over the buckets' autoShare, the
  recurrence raised/cleared/open line, the flapper list (or the honest empty line). Title
  with month (e.g. "Remediation Loop Report — 2026-07"). Honest zero/"insufficient data"
  everywhere; never invent.
- `generateMonthlyRemediationReport({force, now?})` + gate
  `maybeGenerateMonthlyRemediationReport`: due when now ≥ 1st-of-current-month 07:00 UTC
  AND no `monthly-remediation` report_archive row with ts inside the current calendar
  month (UTC). Kind `monthly-remediation`; artifact `monthly/<YYYY-MM>-remediation.md`;
  report_runs row like executive; Telegram summary (2-3 lines: period autoShare, MTTR
  trend direction, flapper count) non-fatal; audit `reports.remediation`.

### 2. Wiring
- server/index.ts: tick `maybeGenerateMonthlyRemediationReport` inside the SAME 15-min
  interval callback as the executive tick (do not add a second timer).
- router.ts: `POST /api/reports/remediation` mutation-gated manual trigger next to
  /api/reports/executive.
- ReportsPage.tsx: kind label ("Monthly Remediation Report") + a generate button following
  the existing generateDigest(kind) pattern (extend it rather than duplicating).

### 3. Tests (`server/reporting/remediation.test.ts`, hermetic — temp DASHBOARD_DB_PATH + temp vault dir; Telegram fetch stubbed)
- Seeded: incidents across 2 buckets (some auto-closed via matching audit rows, some
  manually resolved, one born before the bucket to prove MTTR bounding), recurrence
  insights raised+cleared, flappers with high occurrence_count → assert bucket numbers,
  intersection autoRemediated, share ≤ 1, flapper ordering.
- Empty DB → all sections honest (render contains the honest lines, no invented numbers).
- Gate: before 1st-07:00 → skip; after → generate once; second call same month → skip
  (injected now); archive + run rows asserted; force bypasses.

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts`; never widen `e2e/fresh-host/gate.sh`.
- Do NOT modify executive.ts, digest.ts, reasoner.ts, or existing report endpoints'
  behavior (index.ts tick callback + router additions + ReportsPage extension only).
- Tests never write the live DB or /opt/ai-vault; never send real Telegram.
- Do NOT touch builder/runner/terminal/gateway/runbooks files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/reporting/remediation.test.ts server/reporting/executive.test.ts server/reporting/digest.test.ts server/api/reports.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: remediation.ts+test (new), index.ts, router.ts,
   ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed; the bucket/intersection SQL; the gate logic; an empty-DB render sample; a
seeded render sample; test summaries; explicit confirmation that executive/digest behavior
is untouched and no live paths are written.
