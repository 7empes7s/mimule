# /data-explorer — Product Plan
> One-line: a new authorized, read-only data browser for debugging the control surface without SSH or direct SQLite access.

## 1. Today (verified, with file:line)
- There is no `/data-explorer` frontend route in `App.tsx`; requested neighboring admin routes jump from `/about`, `/install`, `/cost`, `/channels`, `/reports`, and `/compliance` with no data explorer entry (`app/App.tsx:172`-`app/App.tsx:198`).
- There is no `/data-explorer` entry in the nav registry (`app/lib/navRegistry.ts:15`-`app/lib/navRegistry.ts:53`).
- No `DataExplorerPage` file exists under `app/routes`; the route file list includes many pages but not `DataExplorerPage.tsx` (`app/routes/SettingsPage.tsx:154` proves route pages are file-based components; absence verified by `rg --files app/routes` during research).
- Existing API/router already exposes many resource-specific reads, but no generic data explorer endpoint; router includes `/api/fs/browse` for filesystem browsing (`server/api/router.ts:816`-`server/api/router.ts:817`), `/api/actions/audit` (`server/api/router.ts:533`-`server/api/router.ts:535`), `/api/events` and `/api/metrics` (`server/api/router.ts:559`-`server/api/router.ts:560`), and many domain APIs.
- The dashboard DB schema contains the relevant tables to browse: `metric_samples`, `events`, `action_audit`, `users`, `jobs`, `notification_rules`, `channels_log`, `report_runs`, `gateway_calls`, `cost_events`, `spend_anomalies`, `insights`, and `ai_analysis` (`server/db/dashboard.ts:124`-`server/db/dashboard.ts:172`, `server/db/dashboard.ts:176`-`server/db/dashboard.ts:222`, `server/db/dashboard.ts:235`-`server/db/dashboard.ts:253`, `server/db/dashboard.ts:699`-`server/db/dashboard.ts:733`, `server/db/dashboard.ts:891`-`server/db/dashboard.ts:991`).
- Current readiness: 🆕 new page; no current UI.

## 2. Gaps, mock & broken parts
- Operators still need domain-specific pages or SSH/SQLite knowledge to inspect cross-cutting data models; this violates G2 for routine debugging.
- There is no single place to answer "what changed?", "which rows support this insight?", or "why did this report/channel/audit item appear?" across tables.
- Existing raw data is fragmented across pages and APIs; `action_audit`, `events`, `insights`, `jobs`, `channels_log`, and `report_runs` are not browsable together.
- A generic explorer could become dangerous if it allows arbitrary SQL, writes, secrets, or full unredacted payloads; OWASP-style logging/privacy constraints must shape the design.
- Cross-page blocker to call out: config rows should be included only after `/settings` persistence uses real `system_configs` and `config_changes` (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: read-only, bounded, safe queries that cannot break production.
- G2: replace common SQLite/CLI inspection with GUI search, filters, and exports.
- G3: show only real persisted tables and clearly label missing/disabled DB state.
- G4: help detect orphan data, stale tables, failed jobs, missing tenant IDs, and detector gaps.
- G5: one obvious debugging place with table catalog, saved views, and deep links from source pages.
- G6: default to safe automatic saved diagnostics; manual export uses one audited Apply/Export button.
- G7: AI explains query results before raw rows: anomalies, likely root cause, suggested next page/action.
- G8: sell as "Support Data Explorer" for AI admin centers.

## 4. Best-practice research
- OWASP logging guidance emphasizes useful event attributes and careful data stewardship; Data Explorer must preserve privacy and audit data access: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Database audit best-practice guidance commonly focuses on privileged activity, security events, and sensitive data access; explorer access should be audited and selective: https://www.oracle.com/a/tech/docs/dbsec/unified-audit-best-practice-guidelines.pdf
- CIS asset inventory patterns support a catalog approach: know what exists before you can monitor or defend it: https://www.cisecurity.org/controls/inventory-and-control-of-enterprise-assets
- Grafana drilldown practices support high-level-to-row-level workflows rather than isolated raw tables: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/annotate-visualizations/

## 5. Target design
- Layout: catalog sidebar of approved datasets, main saved-view grid, details drawer, row JSON inspector, and related-links panel.
- Approved datasets first: insights, AI analysis, audit, jobs, events, metrics, reports, channels, gateway calls, cost events, users/roles metadata, settings/config changes after persistence is fixed.
- Query model: no arbitrary SQL v1; use whitelisted tables/views, allowed columns, server-side filters, sort, limit, date range, tenant scope, redaction.
- States: DB disabled, no rows, no permission, query timeout, and redacted fields each have distinct messages.
- Mobile parity: dataset picker becomes searchable sheet; row cards replace wide tables; JSON drawer wraps and redacts.
- AI reasoning appears before rows: "notable patterns in this result", source freshness, likely root cause, and recommended next page/action.
- Actions: export CSV/JSON is one audited button; saved views are safe and read-only; deep-link to `/audit`, `/insights`, `/reports`, `/channels`, `/jobs`, `/gateway`, `/cost`.

## 6. Features to add (prioritized)
- MUST: register `/data-explorer` route and nav entry as advanced/admin-only; acceptance: only authenticated users with view permission can open it.
- MUST: add dataset catalog endpoint; acceptance: returns allowed datasets, columns, descriptions, redaction flags, and row counts.
- MUST: add read-only query endpoint with tenant scope, max limit, timeout, and no writes; acceptance: injection attempts fail and all results are redacted.
- MUST: audit every export and sensitive dataset open; acceptance: `action_audit` records actor, dataset, filters, row count.
- SHOULD: add saved views: recent critical insights, failed jobs, channel failures, settings changes, gateway errors, cost anomalies.
- SHOULD: add row relationship graph; acceptance: an insight row links to AI analysis, audit/action, source event, channel send, or report.
- EXTRA: AI "explain this result set" using cached summaries and row citations.

## 7. Sellable-in-parts
- Standalone pitch: "Read-only support data explorer for AI operations platforms, with RBAC, redaction, audit, and AI explanations."
- Suite fit: it is the support/debug backbone for all modules, especially `/insights`, `/audit`, `/reports`, `/channels`, `/jobs`, `/cost`, and `/settings`.
- It should not replace product pages; it should deep-link back to them and make raw evidence inspectable when needed.

## 8. Backend work
- Add `server/api/dataExplorer.ts` with `GET /api/data-explorer/catalog`, `GET /api/data-explorer/query`, `POST /api/data-explorer/export`, and optionally `POST /api/data-explorer/explain`.
- Use `getDashboardDb()` and strict dataset definitions rather than interpolated user SQL.
- Reuse `redactForDashboard` from `server/db/writer.ts` for payload values (`server/db/writer.ts:149`-`server/db/writer.ts:195`).
- Reuse tenant scoping patterns from `server/db/tenantScope.ts` and current APIs.
- Persist saved views in `operator_state` first; add a table only when sharing/scheduling views is required.
- Add detector for data integrity issues: null tenant IDs after migration, stale metrics, failed jobs older than threshold, insights without AI analysis.

## 9. Build slices
- Slice 1: catalog endpoint and static dataset definitions over existing tables; tests for permissions/redaction.
- Slice 2: `DataExplorerPage.tsx`, route registration, nav registry, and basic table/card UI.
- Slice 3: export + audit + saved views.
- Slice 4: AI explanation and relationship links into source pages.
- Validation: `bun run typecheck`, API tests for query bounds/injection/redaction, browser smoke across desktop/mobile.
- Documentation to update: data catalog docs, support/debug runbook, `/root/DASHBOARD_V5_PLAN.md` Phase 10 Data Explorer status.

## 10. Verification
- `/data-explorer` appears only for authorized operators and never for public users.
- Queries are limited, read-only, tenant-scoped, timed, and redacted.
- Opening sensitive datasets and exporting rows writes `action_audit`.
- Saved views return expected rows for insights, jobs, audit, reports, channels, gateway, and cost.
- AI explanations cite row IDs and link to source pages before raw JSON.
- No arbitrary SQL endpoint exists in production.
- Mobile view can search datasets and inspect a row without horizontal scroll.
