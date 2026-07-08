# /reports — Product Plan
> One-line: the evidence and digest center for generating, archiving, exporting, and scheduling operator reports.

## 1. Today (verified, with file:line)
- Frontend route: `/reports` renders `ReportsPage` (`app/App.tsx:193`-`app/App.tsx:195`); nav marks it advanced and experimental (`app/lib/navRegistry.ts:51`).
- Frontend data source: the page polls `/api/reports?limit=100` every 30 seconds (`app/routes/ReportsPage.tsx:96`-`app/routes/ReportsPage.tsx:98`).
- Generate flow: the page posts `templateId` and a lookback range to `/api/reports/run` (`app/routes/ReportsPage.tsx:139`-`app/routes/ReportsPage.tsx:155`).
- Export flow: users can copy Markdown, download CSV, or export a successful run to the vault (`app/routes/ReportsPage.tsx:163`-`app/routes/ReportsPage.tsx:207`, `app/routes/ReportsPage.tsx:331`-`app/routes/ReportsPage.tsx:343`).
- Backend routes exist for list, templates, run, get, CSV, digest, and vault export (`server/api/router.ts:1309`-`server/api/router.ts:1348`).
- Backend persistence is real: `createReportRun` inserts `report_runs`, updates success/failure, and stores output JSON/row count (`server/api/reports.ts:117`-`server/api/reports.ts:168`).
- Report templates exist for gateway calls, denied actions, secret accesses, user activity, chain verifier, daily pipeline, and weekly content health (`server/reporting/index.ts:9`-`server/reporting/index.ts:80`).
- Vault export writes Markdown under `/opt/ai-vault` or `DASHBOARD_REPORTS_VAULT_DIR` (`server/api/reports.ts:105`-`server/api/reports.ts:115`, `server/api/reports.ts:344`-`server/api/reports.ts:346`).
- Current readiness: 🟡 partial; the archive and manual generation are functional, but scheduled digest, AI summary, distribution, and evidence packaging are thin.

## 2. Gaps, mock & broken parts
- The digest endpoint exists (`server/api/router.ts:1325`-`server/api/router.ts:1340`) but the Reports UI does not expose it; UI only runs templates and exports existing runs (`app/routes/ReportsPage.tsx:242`-`app/routes/ReportsPage.tsx:270`).
- The UI hardcodes tenantId `"mimule"` when generating reports (`app/routes/ReportsPage.tsx:147`-`app/routes/ReportsPage.tsx:151`), while backend supports tenant context (`server/api/reports.ts:233`-`server/api/reports.ts:260`).
- Report runs are synchronous from the HTTP request (`server/api/reports.ts:229`-`server/api/reports.ts:270`), so long reports are not job-backed or cancellable.
- Templates are compliance/ops oriented but do not include the V5 Admin Health Score, open insights, auto-fix activity, cost-vs-budget, channel delivery, or settings changes.
- CSV/Markdown exports are generated from raw rows (`server/api/reports.ts:289`-`server/api/reports.ts:327`), with no AI executive summary before data.
- Cross-page blocker to call out: `/settings` persistence is not fixed yet (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`), so reports that claim durable configuration state must wait for real config history.

## 3. Goal alignment (G1–G8)
- G1: report runs must not hang the UI; failures need clear retry and error states.
- G2: every digest/export routine should be GUI-driven, scheduled, and audited.
- G3: no report should show mock data; each template must state its source tables and freshness.
- G4: reports should include detector coverage, stale scanner gaps, and unresolved critical findings.
- G5: one obvious report inbox: latest digest, scheduled reports, failed exports, and audit evidence.
- G6: safe scheduled reports send automatically; manual generation uses one Apply/Run button; failed sends have retry.
- G7: AI summary comes before row data with root causes and recommended actions.
- G8: sell as an "AI Evidence & Operator Reporting" module.

## 4. Best-practice research
- Microsoft-style service-health history suggests keeping current health plus recent incident history visible for operators and stakeholders: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- Google SRE golden signals should anchor reliability report sections: latency, traffic, errors, saturation: https://sre.google/sre-book/monitoring-distributed-systems/
- FinOps anomaly management emphasizes detect, identify, alert, investigate, resolve, and report unexpected cost events: https://www.finops.org/framework/capabilities/anomaly-management/
- Grafana dashboard practices support reusable templates, consistent variables, panel descriptions, and drilldowns: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
- OWASP logging guidance supports evidence reports that preserve who/what/when/where/outcome for audit: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## 5. Target design
- Layout: top "Latest operator digest" with health score, critical deltas, AI summary, and send/export actions; below it scheduled reports, manual generator, archive, and evidence packs.
- Components: `DigestPreview`, `ReportTemplatePicker`, `ScheduledReportRules`, `EvidencePackCard`, `ReportRunDrawer`, `DistributionStatus`, and `ReportSourceFreshness`.
- Empty states: explain which source table is empty and link to the producing page (`/insights`, `/channels`, `/audit`, `/cost`, `/settings`).
- Loading/error: queued/running/success/failed cards backed by `jobs`; no long spinner for report generation.
- Mobile parity: report cards replace dense tables; CSV/vault/send buttons stay 44px and visible.
- AI reasoning appears first as an executive brief: root-cause trends, top risks, recommended operator action, and links to source findings.
- Actions: scheduled sends are automatic; manual report generation, retry, send now, and export are single-button audited actions.

## 6. Features to add (prioritized)
- MUST: add Admin Health Digest template; acceptance: includes health score, open insights by severity, auto-applies, incidents, cost, and settings changes.
- MUST: expose `/api/reports/digest` in UI; acceptance: preview, send now, vault export, and audit evidence appear in one flow.
- MUST: make report generation job-backed for long templates; acceptance: closing/reloading page preserves run status.
- MUST: replace hardcoded tenant with current tenant context; acceptance: generated params match authenticated tenant unless owner explicitly chooses another.
- SHOULD: add scheduled report rules and delivery channels; acceptance: daily/weekly digest writes to `channels_log` and `action_audit`.
- SHOULD: add source freshness per template; acceptance: stale or empty sources are visible before running.
- EXTRA: "Ask this report" follow-up questions over the report output using `editorial-heavy`, with citations back to rows.

## 7. Sellable-in-parts
- Standalone pitch: "AI-generated operational evidence packs and compliance-ready reporting for AI platforms."
- Suite fit: it turns `/insights`, `/audit`, `/channels`, `/cost`, `/models`, and `/settings` into deliverable evidence.
- It should link back to every source row and forward to `/channels` for delivery rules and `/audit` for export chain verification.

## 8. Backend work
- Add `POST /api/reports/run-async` or route existing `/api/reports/run` through `jobs` for templates expected to exceed request time.
- Add templates: `admin-health-digest`, `auto-fix-activity`, `cost-budget`, `settings-change-log`, `channel-delivery`, `detector-coverage`.
- Add `report_schedules` only if `notification_rules` cannot model schedule/destination cleanly; prefer reusing `notification_rules` plus `report_runs`.
- Expand `generateOperatorDigest` integration so digest preview/send/export share one data builder.
- Add executor action IDs for `reports:run:<templateId>`, `reports:send:digest`, and `reports:export-vault:<runId>`.
- Add AI analysis cache for report summaries, keyed by run output hash, using logical model names only.

## 9. Build slices
- Slice 1: add digest UI and connect existing `/api/reports/digest` in `app/routes/ReportsPage.tsx`.
- Slice 2: add new report templates in `server/reporting/index.ts` and template files; tests for row shape and empty sources.
- Slice 3: job-backed report execution in `server/api/reports.ts` and `server/db/writer.ts` if needed.
- Slice 4: scheduled delivery rules tied to `/channels`; show next run and last send.
- Validation: `bun run typecheck`, report API tests, CSV/vault export smoke, mobile Playwright for archive actions.
- Documentation to update: report template catalog, operator digest runbook, `/root/DASHBOARD_V5_PLAN.md` Phase 13 status.

## 10. Verification
- Running each template creates a `report_runs` row with correct tenant, status, row count, and output.
- Digest preview and send are available from `/reports`, with delivery logged in `channels_log`.
- Vault export writes a Markdown file and records an audited action.
- Failed reports show source error, retry, and no fake success row.
- Reports include AI summary before tables and deep-link to source insights/audit/channel/cost rows.
- Scheduled report sends happen without CLI and can be disabled from GUI.
- iPhone viewport shows usable report cards with no horizontal scroll.
