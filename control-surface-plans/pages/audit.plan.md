# /audit — Product Plan
> One-line: the tamper-evident proof layer for operator actions, system events, exports, and compliance evidence across the suite.

## 1. Today (verified, with file:line)
- Frontend component: `/audit` is registered to `AuditPage` at `/opt/opencode-control-surface/app/App.tsx:142` and `/opt/opencode-control-surface/app/App.tsx:143`; readiness: ✅ solid core with usability/export gaps.
- Navigation/readiness: `/audit` is marked `core` in `/opt/opencode-control-surface/app/lib/navRegistry.ts:29` and appears as `Audit` in sidebar nav at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:72`.
- Data loading: `AuditPage` uses authenticated polling for `/api/actions/audit?...` and `/api/events?limit=100` at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:130` and `/opt/opencode-control-surface/app/routes/AuditPage.tsx:131`.
- Chain status badge calls `/api/audit/chain-status`, shows ok/broken, verified row count, first bad row, head hash, and a Verify button at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:57` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:77`.
- UI has two tabs: "Operator Actions (stale)" and "System Events" at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:258` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:270`.
- Operator action table supports search/sort/filter and row details drawer with reason, error, rollback, request, result, and evidence at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:143` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:156` and `/opt/opencode-control-surface/app/routes/AuditPage.tsx:198` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:241`.
- System events table supports search/sort and an event details drawer with payload at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:158` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:171` and `/opt/opencode-control-surface/app/routes/AuditPage.tsx:360` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:385`.
- API routes: `/api/actions/audit`, `/api/events`, `/api/audit/export`, export download/verify, and `/api/audit/chain-status` are mounted at `/opt/opencode-control-surface/server/api/router.ts:533`, `/opt/opencode-control-surface/server/api/router.ts:559`, `/opt/opencode-control-surface/server/api/router.ts:538`, `/opt/opencode-control-surface/server/api/router.ts:542`, and `/opt/opencode-control-surface/server/api/router.ts:758`.
- `actionAuditHandler` reads action audit rows with limit, targetType, resultStatus, and actionKind filters; it degrades when `DASHBOARD_DB` is disabled at `/opt/opencode-control-surface/server/api/audit.ts:25` through `/opt/opencode-control-surface/server/api/audit.ts:37`.
- `eventsHandler` reads events from the `events` table with limit/since/kind/severity filters at `/opt/opencode-control-surface/server/api/events.ts:71` through `/opt/opencode-control-surface/server/api/events.ts:115`.
- Schema exists: `events` and `action_audit` tables are created at `/opt/opencode-control-surface/server/db/dashboard.ts:134` through `/opt/opencode-control-surface/server/db/dashboard.ts:174`; `audit_export_jobs` exists at `/opt/opencode-control-surface/server/db/dashboard.ts:669` through `/opt/opencode-control-surface/server/db/dashboard.ts:684`.
- Writes are redacted and attributed: `writeActionAudit` chooses user/actor/source, writes action kind, action id, reason, target, risk, request/result/evidence, rollback hint, error, and tenant at `/opt/opencode-control-surface/server/db/writer.ts:260` through `/opt/opencode-control-surface/server/db/writer.ts:315`.
- The executor writes audit rows for invalid action IDs, missing confirmation, missing reason, and final execution results at `/opt/opencode-control-surface/server/api/execute.ts:251` through `/opt/opencode-control-surface/server/api/execute.ts:322`.

## 2. Gaps, mock & broken parts
- The tab label says "Operator Actions (stale)", which makes the core proof layer look unreliable even though the page intentionally separates manual actions from system events; the label is hardcoded at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:263`.
- Export exists in the API but not in `AuditPage`; the frontend imports no export action and renders only refresh/filter/table/detail controls at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:251` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:306`, while export endpoints are mounted at `/opt/opencode-control-surface/server/api/router.ts:538` through `/opt/opencode-control-surface/server/api/router.ts:545`.
- Audit filters do not include date range, actor, risk, tenant, event id, or job id; current query params are only limit/resultStatus/targetType/actionKind at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:125` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:130` and backend action filters match that subset at `/opt/opencode-control-surface/server/api/audit.ts:30` through `/opt/opencode-control-surface/server/api/audit.ts:35`.
- Events and action audit are separate tabs with no correlated timeline, even though `action_audit` has `event_id` and `job_id` fields in schema at `/opt/opencode-control-surface/server/db/dashboard.ts:168` and `/opt/opencode-control-surface/server/db/dashboard.ts:169`.
- The chain badge verifies globally, but the UI does not expose export verification/download workflow even though `auditExportHandler` writes export files and returns `downloadUrl` at `/opt/opencode-control-surface/server/api/audit.ts:88` through `/opt/opencode-control-surface/server/api/audit.ts:139`.
- No saved evidence package concept appears on `/audit`; compliance evidence pack generation writes audit rows elsewhere at `/opt/opencode-control-surface/server/api/router.ts:1459` through `/opt/opencode-control-surface/server/api/router.ts:1477`.
- No AI-readable narrative exists for investigations; the details drawer exposes raw request/result/evidence JSON at `/opt/opencode-control-surface/app/routes/AuditPage.tsx:225` through `/opt/opencode-control-surface/app/routes/AuditPage.tsx:240`.

## 3. Goal alignment (G1-G8)
- G1: Audit must never crash on malformed payloads or disabled DB; current degraded states should become clearer and actionable.
- G2: Operators must export, verify, filter, and correlate evidence from the GUI.
- G3: Every mutation from insights/admin/home/settings/gateway must land in this audit surface with enough context to reconstruct the story.
- G4: Audit is also detector input for suspicious activity, missing audit records, secret leakage in logs, and stale control gaps.
- G5: One proof page with search, filters, timeline, and deep links from every action.
- G6: Every auto/manual action should show rollback hint or "not reversible" reason.
- G7: AI should summarize complex audit sequences before raw payloads during investigations.
- G8: This is the compliance-grade trust surface for the sellable suite.

## 4. Best-practice research
- Audit trails should preserve enough information to reconstruct system, application, and user events; NIST's audit-trail guidance maps directly to actor, action, target, timestamp, and outcome (https://csrc.nist.rip/publications/nistpubs/800-12/800-12-html/chapter18.html).
- OWASP logging guidance emphasizes source verification, integrity, non-repudiation, and logging neither too much nor too little; the product should keep redaction and add integrity UX, correlation, and export proof (https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- OWASP Top 10 A09 recommends integrity controls for high-value transactions, which supports the hash-chain badge plus export verification (https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/).
- Incident/postmortem practice recommends templates, owners, and quick follow-up; audit should generate evidence bundles for postmortems and compliance reviews (https://www.atlassian.com/incident-management/postmortem).
- Great for this page: immutable timeline, strong filters, export/verify/download, actor/target drilldowns, correlated events/jobs/findings, redaction proof, and AI investigation summaries.

## 5. Target design
- IA: `/audit` becomes Admin Center > Audit. It should have three views: Timeline, Operator Actions, System Events, plus Exports.
- Header: chain status, verified row count, last bad row if any, export button, verify export button, and date range.
- Timeline: interleave action_audit and events with shared time axis, grouped by incident/finding/job/action id.
- Detail drawer: show plain-language summary, actor/source/target/risk/outcome, related finding/event/job, rollback/revert availability, then raw JSON.
- Export flow: modal for date range, kinds, tenant, format; returns job row, download link, chain hash, and verify result.
- Empty state: explain whether there are no rows, DB disabled, filters too narrow, or tenant scope empty.
- Mobile parity: filters collapse into drawer; table rows become cards; details drawer becomes full-screen sheet; buttons are 44px.
- G7: "Summarize sequence" button uses existing audit/events/insight context and logical model routing; result appears above raw payloads and is cached.
- G6: every reversible action row links to a Revert/Manual rollback path; irreversible rows explain why.

## 6. Features to add (prioritized)
- MUST: Rename "Operator Actions (stale)" to "Operator Actions"; acceptance: no UI copy suggests the audit log is stale.
- MUST: Add export/verify/download UI; acceptance: operator can create JSONL/CSV export, download it, and verify chain from `/audit`.
- MUST: Add date range, actor, risk, tenant, event id, job id filters; acceptance: frontend and backend filters match and are test-covered.
- MUST: Add correlated timeline; acceptance: action rows link to related event/job/finding when ids exist.
- SHOULD: Add action detail permalinks `/audit?row=<id>` and `/audit?event=<id>`; acceptance: every insight Apply audit link opens exact row.
- SHOULD: Add audit health detector cards for missing/fallback audit rows, chain broken, secret-like text, and suspicious actors; acceptance: findings deep-link to `/audit`.
- SHOULD: Add export jobs tab; acceptance: previous exports show status, row count, chain hash, download, verify.
- EXTRA: Add AI investigation summary; acceptance: selected time window produces root-cause narrative with cited row ids and no raw secrets.
- EXTRA: Add "evidence pack" builder; acceptance: selected rows/events export as an incident/compliance bundle and write its own audit row.

## 7. Sellable-in-parts
- Standalone pitch: "Tamper-evident AI Operations Audit" proves who/what changed the system, why, what happened, and how to verify it.
- Suite fit: `/insights`, `/admin`, `/gateway`, `/settings`, `/security`, `/governance`, and `/compliance` all link here for action proof.
- Buyer value: satisfies operational trust, incident review, vendor/security questionnaires, and internal compliance without stitching logs from CLI output.

## 8. Backend work
- Extend `GET /api/actions/audit` filters: `fromTs`, `toTs`, `actor`, `risk`, `tenantId`, `eventId`, `jobId`, `actionId`, `targetId`.
- Add `GET /api/audit/timeline`: returns normalized rows from `action_audit` and `events`, sorted and correlated by job/event/finding/action ids.
- Add `GET /api/audit/export/jobs`: list `audit_export_jobs`; current handler supports individual job lookup but no list endpoint.
- Add `GET /api/audit/:id/related`: return linked event/job/insight rows.
- Add `POST /api/audit/summarize`: summarizes a bounded time window/selection using logical model `editorial-heavy`, with strict redaction.
- Add detector hooks in `server/insights/scanners/security.ts` or audit scanner: chain broken, unaudited mutation fallback, suspicious user activity, secret-like audit payload.
- Preserve `writeActionAudit` as the only write path for action proof; do not create parallel audit stores.
- Documentation to update when implemented: `/root/DASHBOARD_V5_PLAN.md` Phase 1/3/8/10/11/12 status, audit/export API docs, compliance evidence-pack docs.

## 9. Build slices
- Slice 1: Copy and filter cleanup in `/opt/opencode-control-surface/app/routes/AuditPage.tsx` and backend filter expansion in `server/api/audit.ts`; validate API tests and UI smoke.
- Slice 2: Export jobs UI using existing `/api/audit/export` endpoints; validate create/download/verify happy and failure paths.
- Slice 3: Timeline endpoint + timeline tab; validate correlated row ordering and mobile card layout.
- Slice 4: Deep-link row/event details; validate links from `/insights` Apply results and `/admin` activity feed.
- Slice 5: Audit health detectors; validate scanner tests and insights deep links.
- Slice 6: AI investigation summary; validate redaction, bounded prompts, timeout fallback, and cached result behavior.

## 10. Verification
- `/audit` loads action rows and system events with DB enabled; degraded message appears with DB disabled.
- Chain badge reports ok/broken and Verify refreshes it.
- Export modal creates a job, downloads a file, and verifies the chain hash.
- Date/actor/risk/tenant/job/event filters return matching backend rows.
- Timeline interleaves actions/events and links related job/finding/event ids.
- Every Apply/Dismiss/Re-analyze/auto-apply from `/insights` is findable by target id and action kind.
- Detail drawer redacts secrets and shows rollback hint or "not reversible".
- Mobile table-to-card layout has no horizontal scroll and keeps details reachable.
- Docs updated: V5 plan, audit API docs, compliance/evidence-pack docs.
