# /insights — Product Plan
> One-line: the detailed detections and auto-fix inbox for operators who need AI-reasoned findings, evidence, and audited remediation.

## 1. Today (verified, with file:line)
- Frontend component: `/insights` is registered to `InsightsPage` in `/opt/opencode-control-surface/app/App.tsx:103` and `/opt/opencode-control-surface/app/App.tsx:104`; readiness: ✅ solid core, with Phase 9/11 polish remaining.
- Navigation/readiness: `/insights` is marked `core` in `/opt/opencode-control-surface/app/lib/navRegistry.ts:17` and appears as `Insights` in the sidebar at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:59`.
- Data loading: the page polls `/api/insights?status=<filter>` every 30 seconds at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:92` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:95`.
- Status filters include open, resolved, applied, dismissed, and all at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:25` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:33`.
- Findings are grouped by domain and sorted by severity, with operations first, at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:43` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:52` and `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:100` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:108`.
- Actions exist for Apply, Dismiss, Re-analyze, Scan now, and group apply at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:122`, `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:140`, `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:155`, `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:169`, and `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:183`.
- G7 is partly met: cards show AI analysis with summary, likely cause, recommended action, confidence, and model before detector signal/evidence at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:303` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:325`.
- Evidence exists behind an expandable drawer at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:67` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:89`.
- API routes are mounted for list, scan, bulk apply, and per-insight apply/dismiss/reanalyze at `/opt/opencode-control-surface/server/api/router.ts:488` through `/opt/opencode-control-surface/server/api/router.ts:531`.
- `insightsListHandler` throttles aggregation to once per 60 seconds, returns AI analysis and risk tier, and reads from `listInsights` at `/opt/opencode-control-surface/server/api/insights.ts:20` through `/opt/opencode-control-surface/server/api/insights.ts:95`.
- `runInsightsScanOnce` aggregates insights, runs security/registry/budget/anomaly/sentinel/ops scanners, notifies critical findings, enriches AI, and auto-applies safe insights at `/opt/opencode-control-surface/server/insights/scheduler.ts:27` through `/opt/opencode-control-surface/server/insights/scheduler.ts:80`.
- AI enrichment uses logical model `editorial-heavy`, a 6-hour freshness cache, and `ai_analysis` storage at `/opt/opencode-control-surface/server/insights/ai.ts:17` through `/opt/opencode-control-surface/server/insights/ai.ts:20` and `/opt/opencode-control-surface/server/insights/ai.ts:71` through `/opt/opencode-control-surface/server/insights/ai.ts:93`.
- Auto-apply is deliberately tiny: only `start-job:model-health:all` is allowlisted at `/opt/opencode-control-surface/server/insights/autoapply.ts:7` through `/opt/opencode-control-surface/server/insights/autoapply.ts:15`.
- The insights table supports domains, severity, evidence, action descriptor, manual page, status, tenant, source key, and resolution fields at `/opt/opencode-control-surface/server/db/dashboard.ts:954` through `/opt/opencode-control-surface/server/db/dashboard.ts:977`.

## 2. Gaps, mock & broken parts
- The UI says "Apply all safe" but `actionableCount` includes every open insight with `actionDescriptorId`, not only safe auto-tier insights, at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:255` and `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:276`; the server bulk path likewise filters by action descriptor, not risk tier, at `/opt/opencode-control-surface/server/api/insights.ts:361` through `/opt/opencode-control-surface/server/api/insights.ts:367`.
- Deep-link focus is not implemented: the page reads only local `statusFilter` state and does not inspect URL search params at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:92` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:95`, despite V5 requiring `/insights?focus=<sourceKey>` at `/root/DASHBOARD_V5_PLAN.md:195` through `/root/DASHBOARD_V5_PLAN.md:197`.
- There is no snooze/ack state in the current `InsightStatus` handling; the UI filters only open/applied/dismissed/resolved/all at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:25` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:33`, and the DB check allows only open/applied/dismissed/resolved at `/opt/opencode-control-surface/server/db/dashboard.ts:964`.
- AI analysis prompt uses only the single finding and evidence, not recent history or related findings, at `/opt/opencode-control-surface/server/insights/ai.ts:95` through `/opt/opencode-control-surface/server/insights/ai.ts:111`.
- Auto-apply does not yet require AI confidence threshold; it filters only open insights with a safe action descriptor at `/opt/opencode-control-surface/server/insights/autoapply.ts:40` through `/opt/opencode-control-surface/server/insights/autoapply.ts:44`.
- Review-tier high-risk apply opens an approval request, but the current UI only shows the message returned by Apply and has no approval workflow panel at `/opt/opencode-control-surface/server/api/insights.ts:170` through `/opt/opencode-control-surface/server/api/insights.ts:187` and `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:127` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:132`.
- There is no health gauge, saved filters, detector coverage map, or auto-apply activity feed in `InsightsPage`; the hero currently shows only open count, status select, and Scan now at `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:203` through `/opt/opencode-control-surface/app/routes/InsightsPage.tsx:235`.

## 3. Goal alignment (G1-G8)
- G1: Keep the inbox stable under scanner/model failures; AI pending must be acceptable, but findings and evidence must still render.
- G2: Every meaningful remediation must be one GUI action or an explicit manual page link.
- G3: Remove ambiguous "safe" wording and ensure every visible action is real, audited, and correctly risk-labeled.
- G4: Complete detector catalog and show coverage/staleness so "no findings" does not mean "nothing scanned."
- G5: Severity-sorted, filterable, deep-linkable inbox is the primary admin-center work queue.
- G6: Auto-fix where allowlisted and confidence-gated; otherwise one Apply with reason/confirmation and approval when high risk.
- G7: Preserve AI summary/root cause/recommended action above evidence, then improve it with correlation context.
- G8: Rename and position this page as "Detections & Auto-fix" under Admin Center rather than a generic insights page.

## 4. Best-practice research
- Use the readability contract from V5: severity, subject, AI summary, evidence, recommended action, and Apply/Auto-applied state before raw JSON. This mirrors modern admin centers that prioritize a small number of actionable service-health issues over raw telemetry.
- Use SRE Golden Signals as detector input and grouping context so an ops finding explains user impact, not just service liveness (https://sre.google/sre-book/monitoring-distributed-systems/).
- Use incident-response lifecycle language for status chips: detected, triaged, diagnosed, remediated, learned; this makes findings understandable across ops/security/cost/build (https://response.pagerduty.com/).
- Use OWASP/NIST audit logging principles for remediation actions: attributable actor, target, outcome, context, and integrity/non-repudiation (https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- Great for this page: a single prioritized inbox with explainable automation, confidence-gated auto-fix, detector coverage, saved views, direct deep links, and audit proof visible beside every mutation.

## 5. Target design
- IA: `/insights` becomes Admin Center > Detections & Auto-fix. `/admin` shows the compact inbox; `/insights` is the full workbench.
- Layout: sticky filter/action bar, Admin Health Score mini-gauge, saved filter chips, domain/severity/risk/status filters, detector coverage pill, then grouped finding cards.
- Finding card: severity, domain, title, status, risk tier, AI summary, likely cause, recommended action, confidence, evidence, detector signal, action row, audit trail links, and related findings.
- Empty state: "All clear" must include last scan time, scanner coverage, stale scanner warnings, and next scan time.
- Error state: if `/api/insights` fails, show a page-level error with retry; if AI analysis is missing, card still renders detector summary and evidence.
- Mobile parity: cards stack; filter bar becomes a bottom sheet; Apply/Dismiss/Re-analyze are 44px controls; evidence opens inline, not hover-only.
- G7: AI summary/root cause/action remain above detector signal; related-history prompt output adds "correlated signals".
- G6: auto-tier card shows why it was eligible; review-tier card shows one Apply; high-risk Apply opens/links approval; no ambiguous "Apply all safe" unless every selected item is auto-tier.

## 6. Features to add (prioritized)
- MUST: Rename UI/nav label to "Detections & Auto-fix"; acceptance: Admin Center nav uses V5 labels while route remains `/insights`.
- MUST: Implement `/insights?focus=<sourceKey|id>`; acceptance: notification/home/admin links scroll to and highlight the exact card.
- MUST: Fix bulk apply semantics; acceptance: "Apply all safe" includes only riskTier `auto`, and "Apply selected" shows risk summary/confirm for review items.
- MUST: Add Admin Health Score mini-gauge and score drivers; acceptance: gauge matches `/admin` and filters inbox to contributing findings.
- MUST: Add detector coverage/staleness panel; acceptance: scanner name, last run, last result, and coverage gaps are visible.
- SHOULD: Add snooze and acknowledge statuses; acceptance: snoozed items hide until expiry, ack records an audit row, scanner can reopen resolved conditions.
- SHOULD: Add auto-apply activity feed with "why" and revert/manual link; acceptance: audit rows with `trigger=auto` render with finding + confidence + allowlist rule.
- SHOULD: Feed related findings/recent audit/events into AI prompt; acceptance: AI analysis cites correlated signals and still caches by signature.
- EXTRA: Add saved views like "Critical ops", "Awaiting approval", "Auto-fixed today"; acceptance: stored per user/tenant.
- EXTRA: Add keyboard command support from global command palette; acceptance: `Ctrl-K` can jump to focused findings and run allowlisted action.

## 7. Sellable-in-parts
- Standalone pitch: "AI Detection & Auto-fix Inbox" turns operational, security, cost, and build signals into pre-reasoned findings with governed remediation.
- Suite fit: It is the detail workbench behind `/admin` and the source of health drivers for `/`; `/audit` is the proof layer for every Apply, Dismiss, Re-analyze, and auto-fix.
- Buyer value: replaces fragmented alerts with a single AI-reasoned, severity-ranked, audited work queue.

## 8. Backend work
- Change `POST /api/insights/bulk-apply` to accept explicit ids plus a mode (`autoOnly`, `reviewSelected`) and reject ambiguous group applies.
- Add `GET /api/insights/coverage`: scanner last run, duration, failure, emitted count, resolved count, stale flag. Store in existing `metric_samples` or a small scanner status table if needed.
- Add `snoozed`/`acknowledged` semantics: either extend `insights.status` carefully or add `insight_snoozes`/`insight_acknowledgements`; maintain scanner reopen behavior.
- Extend `server/insights/ai.ts`: include related open findings, recent matching audit rows, and recent events in prompt; keep logical model `editorial-heavy`.
- Extend `server/insights/autoapply.ts`: require AI confidence threshold and store allowlist rule/confidence in audit request/result metadata.
- Add `GET /api/insights/:id/audit`: return audit rows linked to `targetType='insight'` or matching action descriptor.
- Continue to use `server/api/execute.ts`; do not create page-specific mutations.
- Documentation to update when implemented: `/root/DASHBOARD_V5_PLAN.md` Phase 3/8/9/11/12 status, detector catalog docs/runbook entries, API docs for new endpoints.

## 9. Build slices
- Slice 1: UI label/nav grouping and deep-link focus in `/opt/opencode-control-surface/app/routes/InsightsPage.tsx`, `/opt/opencode-control-surface/app/components/DashSidebar.tsx`, and `/opt/opencode-control-surface/app/lib/navRegistry.ts`; validate with Playwright focused URL.
- Slice 2: Bulk semantics fix in `InsightsPage.tsx` and `server/api/insights.ts`; add tests for auto-only vs review-tier candidates.
- Slice 3: Detector coverage endpoint and UI panel; validate scheduler tests and `/api/insights/coverage` smoke.
- Slice 4: Health gauge/shared score drivers; validate shared score with Home/Admin.
- Slice 5: Snooze/ack and audit links; validate DB migration, API tests, and UI status filters.
- Slice 6: AI prompt correlation and confidence-gated auto-apply; validate `server/insights/ai.test.ts`, `autoapply.test.ts`, and non-blocking scan behavior.

## 10. Verification
- `/insights` loads with existing open, applied, dismissed, resolved, and all filters.
- Findings sort by severity then recency across every domain.
- Every card has AI summary/root cause/recommended action or explicit pending state before raw evidence.
- Focus URL highlights exactly one card and works from Home/Admin/notifications.
- Auto-only bulk cannot apply review-tier actions; review selected requires confirmation/reason.
- High-risk Apply opens approval and does not silently execute.
- Auto-apply audit rows include trigger, confidence, sourceKey, and allowlist rule.
- Detector coverage shows stale/failed scanners and all-clear with last scan time.
- Mobile and desktop visual checks pass with 44px action targets and no horizontal scroll.
- Docs updated: V5 phase status, detector runbooks, and API docs.
