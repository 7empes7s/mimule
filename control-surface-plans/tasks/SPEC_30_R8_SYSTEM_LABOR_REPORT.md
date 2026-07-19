# SPEC 30 — ULTRAPLAN Catalog R, R8: "System labor" report (the inverse monitor)

## Context (read first)
ULTRAPLAN R8: *"'System labor' report — the inverse monitor: what the admin center DID for
you this week (auto-fixes applied, incidents auto-closed, probes run, chains rebuilt,
deploys verified) with time-saved estimate. Directly serves 'never make Marouane the
monitor' — the system reports its own work."* Work in `/opt/opencode-control-surface`.
Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD `bcf376a` (verified — FOLLOW the established report idiom exactly):
- `server/reporting/executive.ts` (SPEC 26) and `server/reporting/remediation.ts` (SPEC 27)
  are the templates: `Configured<T>` sections, honest "not configured"/zero, restart-safe
  schedule gate queried from `report_archive`, artifact under the vault-root seam
  (`DASHBOARD_AI_VAULT_DIR` ?? `DASHBOARD_REPORTS_VAULT_DIR` ?? `/opt/ai-vault`),
  report_archive + report_runs (kind visible on /reports), Telegram non-fatal,
  `writeActionAudit`, tick wired into the SAME 15-min interval in server/index.ts, POST
  manual trigger in router.ts (now checkToken-gated like its siblings), generate button +
  kind label in ReportsPage.tsx.
- Data source: `action_audit` (columns include ts, actor, actor_source, action_kind,
  result_status, target_type, target_id). System-performed work is distinguishable by
  `actor_source IN ('scheduler','system','sentinel-scan')` and/or action_kind families.
  Live examples last 7d (success rows): `insights.auto-resolve` (~2263), `reports.digest`,
  `incidents.auto-resolve`, `incidents.auto-close`, `reports.executive`,
  `reports.remediation`, `autopipeline.command`. Probes appear as `scan:discovery:*`,
  `probe:model:*`, and `sentinel-scan` actor rows.
- The categorization must be DATA-DRIVEN and honest: count only rows that actually exist,
  and a category with zero rows renders "0" (a real number — the system did none this
  period), NOT "not configured". `{configured:false}` is only for a genuinely-absent data
  source (no action_audit table).

## Build this

### 1. Collector + renderer (`server/reporting/systemLabor.ts`, new)
- `collectSystemLaborStats(periodStart, periodEnd)` → `Configured<T>` with:
  - categories: a fixed ordered list, each `{label, count}` counted from SUCCESS-status
    action_audit rows in period (tenant-scoped like the other collectors), by an explicit
    action_kind → category map:
      - "Auto-fixes applied" = insights.auto-resolve + insights.auto-apply* (any
        `insights.auto-%`) + incidents.auto-close + incidents.auto-resolve
      - "Probes & scans run" = action_kind LIKE 'scan:%' OR 'probe:%' OR actor_source =
        'sentinel-scan'
      - "Reports generated" = action_kind LIKE 'reports.%'
      - "Deploys run" = run.newsbites (run:newsbites:deploy)
      - "Routing/chain actions" = start-job:gateway:% OR start-job:model-health:% OR
        mutate-policy:model:%
      - "Pipeline actions" = autopipeline.% OR regen.% OR start-job:dossier:%
    (Use LIKE patterns; keep the map in one place so it's auditable. Do NOT double-count —
    a row lands in the FIRST matching category; document the precedence.)
  - totalActions: sum of the above (the categorized total, not all audit rows).
  - timeSaved: `{configured:true, minutes, assumptions}` — a CONSERVATIVE estimate =
    Σ(category.count × perActionMinutes[category]); perActionMinutes is an explicit small
    constant table (e.g. auto-fix 5, probe 2, report 15, deploy 10, routing 5, pipeline 3
    — pick defensible low values) INCLUDED in the render as the stated assumption so the
    number is never mistaken for measured. Honest framing: "estimated N hours saved
    (assumptions below)".
  - busiest: the top 3 individual action_kinds by count in period (name + count) — the
    concrete "here's specifically what I did".
- `renderSystemLaborReport(stats, period)` — one page Markdown titled "System Labor Report
  — <ISO week>": a lead line ("This week the admin center performed N actions on your
  behalf — an estimated ~H hours you did not have to spend."), the category table, the
  busiest-3 list, and an explicit "Time-saved assumptions" footer listing perActionMinutes.
  Honest zero rendering throughout.
- `generateWeeklySystemLaborReport({force, now?})` + gate
  `maybeGenerateWeeklySystemLaborReport` — weekly, due at Monday 07:00 UTC of the current
  ISO week, deduped by a `report_archive` query for kind `weekly-system-labor` in the
  Monday-to-Monday window (restart-safe). Artifact `weekly/<YYYY-MM-DD>-system-labor.md`,
  report_archive + report_runs, Telegram summary (lead line + hours) non-fatal, audit
  `reports.system-labor`.

### 2. Wiring
- server/index.ts: add `maybeGenerateWeeklySystemLaborReport` to the SAME 15-min interval
  callback as executive + remediation (no new timer).
- router.ts: `POST /api/reports/system-labor` — checkToken + mutation-gated (match the
  executive/remediation trigger idiom exactly, including the checkToken now on those).
- ReportsPage.tsx: kind label ("Weekly System Labor Report") + generate button via the
  existing generateDigest(kind) path.

### 3. Tests (`server/reporting/systemLabor.test.ts`, hermetic temp DB + temp vault; Telegram stubbed)
- Seed action_audit with rows across the categories (incl. some failed/running rows that
  must be EXCLUDED, and rows outside the period), assert per-category counts, no
  double-counting (a row matching two patterns lands once, in precedence order), timeSaved
  = Σ(count×minutes), busiest-3 ordering, totalActions.
- Empty DB / no matching rows → all categories 0, timeSaved 0, honest render (contains the
  assumptions footer, no invented "not configured").
- Gate: before Monday 07:00 → skip; after → generate once; second call same week → skip
  (injected now); archive + run rows asserted; force bypasses.

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit autoapplyPolicy.ts; never widen gate.sh.
- Do NOT modify executive.ts / remediation.ts / digest.ts / existing report endpoints
  (index.ts tick callback + router addition + ReportsPage extension only).
- Tests never write the live DB or /opt/ai-vault; never send real Telegram.
- Do NOT touch builder/runner/terminal/gateway/runbooks/compliance files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/reporting/systemLabor.test.ts server/reporting/executive.test.ts server/reporting/remediation.test.ts server/api/reports.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: systemLabor.ts+test (new), index.ts, router.ts,
   ReportsPage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed; the action_kind→category map with precedence; the timeSaved assumption table;
an empty-DB render sample; a seeded render sample; test summaries; explicit confirmation
that executive/remediation/digest behavior is untouched and no live paths are written.
