# /content-health — Product Plan
> One-line: the editorial QA findings queue for detecting article quality, link, duplicate, and coverage issues before and after publishing.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `/content-health` is registered in the app router, but nav marks it `advanced` and `experimental` (`app/App.tsx:34`, `app/App.tsx:206`, `app/App.tsx:207`, `app/lib/navRegistry.ts:51`). Readiness: 🟡 partial.
- The page uses authenticated polling of `/api/content-health?limit=100`, tracks severity/kind filters, scan running state, scan errors, and last scan count (`app/routes/ContentHealthPage.tsx:72`, `app/routes/ContentHealthPage.tsx:73`, `app/routes/ContentHealthPage.tsx:74`, `app/routes/ContentHealthPage.tsx:75`, `app/routes/ContentHealthPage.tsx:76`, `app/routes/ContentHealthPage.tsx:77`, `app/routes/ContentHealthPage.tsx:78`).
- The frontend knows seven finding kinds: missing image, thin digest, invalid vertical, broken link, near duplicate, vertical concentration, and vertical gap (`app/routes/ContentHealthPage.tsx:8`, `app/routes/ContentHealthPage.tsx:9`, `app/routes/ContentHealthPage.tsx:10`, `app/routes/ContentHealthPage.tsx:11`, `app/routes/ContentHealthPage.tsx:12`, `app/routes/ContentHealthPage.tsx:13`, `app/routes/ContentHealthPage.tsx:14`, `app/routes/ContentHealthPage.tsx:15`).
- Findings render as expandable rows with icon, title/slug, summary, severity, kind, age, slug, vertical, file path, dedupe key, and live article link (`app/routes/ContentHealthPage.tsx:39`, `app/routes/ContentHealthPage.tsx:44`, `app/routes/ContentHealthPage.tsx:47`, `app/routes/ContentHealthPage.tsx:50`, `app/routes/ContentHealthPage.tsx:51`, `app/routes/ContentHealthPage.tsx:52`, `app/routes/ContentHealthPage.tsx:55`, `app/routes/ContentHealthPage.tsx:56`, `app/routes/ContentHealthPage.tsx:58`, `app/routes/ContentHealthPage.tsx:61`).
- The page can run an on-demand scan by POSTing `/api/content-health/run?limit=100`, then refreshes the read model (`app/routes/ContentHealthPage.tsx:116`, `app/routes/ContentHealthPage.tsx:120`, `app/routes/ContentHealthPage.tsx:125`, `app/routes/ContentHealthPage.tsx:126`, `app/routes/ContentHealthPage.tsx:127`).
- It displays summary tiles, degraded/error/success/loading/healthy empty states, top finding classes, searchable/filterable violation list, and latest detector evidence timestamp (`app/routes/ContentHealthPage.tsx:155`, `app/routes/ContentHealthPage.tsx:157`, `app/routes/ContentHealthPage.tsx:162`, `app/routes/ContentHealthPage.tsx:166`, `app/routes/ContentHealthPage.tsx:170`, `app/routes/ContentHealthPage.tsx:174`, `app/routes/ContentHealthPage.tsx:181`, `app/routes/ContentHealthPage.tsx:189`, `app/routes/ContentHealthPage.tsx:203`, `app/routes/ContentHealthPage.tsx:210`, `app/routes/ContentHealthPage.tsx:243`).
- The API handler requires dashboard SQLite; when DB is disabled it returns degraded true with empty findings and reason `DASHBOARD_DB disabled` (`server/api/content-health.ts:183`, `server/api/content-health.ts:185`, `server/api/content-health.ts:186`, `server/api/content-health.ts:187`).
- The read API queries both `events` and `content_health_findings`, supports limit/since/severity/kind, maps rows to a common finding shape, sorts by timestamp, and summarizes (`server/api/content-health.ts:190`, `server/api/content-health.ts:192`, `server/api/content-health.ts:193`, `server/api/content-health.ts:196`, `server/api/content-health.ts:197`, `server/api/content-health.ts:217`, `server/api/content-health.ts:219`, `server/api/content-health.ts:221`, `server/api/content-health.ts:236`, `server/api/content-health.ts:237`, `server/api/content-health.ts:241`).
- The scan endpoint calls `runContentHealthScan({ probeExternalLinks: true })`, then reads back the same handler response (`server/api/content-health.ts:248`, `server/api/content-health.ts:250`, `server/api/content-health.ts:261`, `server/api/content-health.ts:262`, `server/api/content-health.ts:264`).
- The detector defaults to `/opt/newsbites/content/articles`, `/opt/newsbites/public`, a 40-word digest minimum, external link limits/timeouts, and a hardcoded allowed-vertical list unless overridden by environment (`server/db/sampler.ts:157`, `server/db/sampler.ts:158`, `server/db/sampler.ts:159`, `server/db/sampler.ts:165`, `server/db/sampler.ts:166`, `server/db/sampler.ts:167`, `server/db/sampler.ts:168`, `server/db/sampler.ts:175`, `server/db/sampler.ts:183`).
- The scanner emits findings for invalid vertical, near duplicate, vertical concentration, vertical gap, and writes detector findings into `events` with dedupe keys (`server/db/sampler.ts:966`, `server/db/sampler.ts:968`, `server/db/sampler.ts:976`, `server/db/sampler.ts:1003`, `server/db/sampler.ts:1004`, `server/db/sampler.ts:1045`, `server/db/sampler.ts:1046`, `server/db/sampler.ts:1070`, `server/db/sampler.ts:1071`, `server/db/sampler.ts:1094`, `server/db/sampler.ts:1107`, `server/db/sampler.ts:1114`).
- Content-health findings can be aggregated into shared insights from `content_health_findings`, with domain `data`, manual page `/newsbites`, and action descriptor `open-source:article:<slug>` (`server/insights/aggregate.ts:291`, `server/insights/aggregate.ts:296`, `server/insights/aggregate.ts:311`, `server/insights/aggregate.ts:314`, `server/insights/aggregate.ts:316`, `server/insights/aggregate.ts:317`, `server/insights/aggregate.ts:320`, `server/insights/aggregate.ts:323`, `server/insights/aggregate.ts:324`).
- Tests cover summarizing persisted findings plus detector events, DB-disabled degraded response, scan generating findings, and external link probing (`server/api/content-health.test.ts:70`, `server/api/content-health.test.ts:103`, `server/api/content-health.test.ts:114`, `server/api/content-health.test.ts:118`, `server/api/content-health.test.ts:125`, `server/api/content-health.test.ts:145`, `server/api/content-health.test.ts:154`, `server/api/content-health.test.ts:188`).

## 2. Gaps, mock & broken parts
- Zero-config gap: defaults still assume `/opt/newsbites` content/public roots and a fixed allowed vertical list unless env vars override them; there is no discovery/register flow for arbitrary publishing apps (`server/db/sampler.ts:157`, `server/db/sampler.ts:158`, `server/db/sampler.ts:167`, `server/db/sampler.ts:168`, `server/db/sampler.ts:183`).
- Fresh environments with DB off show a degraded panel, but not a full “connect SQLite / register publishing app” setup path (`server/api/content-health.ts:185`, `server/api/content-health.ts:187`, `app/routes/ContentHealthPage.tsx:174`, `app/routes/ContentHealthPage.tsx:179`, `app/routes/ContentHealthPage.tsx:180`).
- The page shows findings and live article links, but no one-click Apply actions for common fixes such as refresh image, open dossier, rewrite digest, correct vertical, or re-run after fix (`app/routes/ContentHealthPage.tsx:55`, `app/routes/ContentHealthPage.tsx:61`, `app/routes/ContentHealthPage.tsx:143`, `app/routes/ContentHealthPage.tsx:144`, `server/api/newsbites-actions.ts:124`, `server/api/newsbites-actions.ts:217`).
- AI reasoning is not shown on this page before raw findings, even though the shared insights AI layer supports summary/root cause/recommended action (`app/routes/ContentHealthPage.tsx:47`, `app/routes/ContentHealthPage.tsx:48`, `server/insights/ai.ts:6`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`, `server/insights/ai.ts:141`).
- Shared insight aggregation only reads `content_health_findings`, while the content-health API also reads detector `events`; event-only findings may be visible on `/content-health` but not necessarily promoted through the shared insights aggregation path (`server/api/content-health.ts:196`, `server/api/content-health.ts:217`, `server/api/content-health.ts:219`, `server/api/content-health.ts:236`, `server/insights/aggregate.ts:295`, `server/insights/aggregate.ts:297`).
- The page’s healthy empty state says the latest detector output has no open issues, but it does not distinguish no scan yet, missing content root, DB disabled, or scan stale (`app/routes/ContentHealthPage.tsx:114`, `app/routes/ContentHealthPage.tsx:181`, `app/routes/ContentHealthPage.tsx:184`, `app/routes/ContentHealthPage.tsx:185`, `app/routes/ContentHealthPage.tsx:243`).
- External link probing is on-demand with private-link probing controlled by env in tests, but the page does not show whether external probing was skipped, rate-limited, or blocked for safety (`server/api/content-health.ts:261`, `server/api/content-health.test.ts:174`, `server/api/content-health.test.ts:175`, `server/api/content-health.test.ts:176`, `app/routes/ContentHealthPage.tsx:176`).

## 3. Goal alignment (G1–G8)
- G1/G3: separate no findings, no scan, no DB, no publishing app, and stale scan.
- G2/G6: every common fix needs a GUI action, safe re-scans can auto-run.
- G4/G9: discover content roots, public asset roots, vertical schema, article frontmatter, link policies, and source connectors.
- G5/G7: AI summary/root cause/recommended fix before each raw finding.
- G8: this becomes sellable editorial QA/compliance.

## 4. Best-practice research
- Research basis: NIST AI RMF supports accountable findings and managed remediation; Google SRE golden signals support scan/link-probe health; Microsoft HAX supports showing AI-generated explanations with confidence and recourse; OWASP LLM Top 10 supports guarding rewrite/fix agents and model endpoint exposure (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use QA triage queues: severity-first, grouped by fix type, with bulk fix/dismiss/snooze.
- Use evidence-first but explanation-led detail: article, affected fields, exact rule, suggested edit, source evidence.
- Use stale-scan states: “last complete scan”, “last partial scan”, “what was skipped”.
- Use policy-managed checks: thresholds/verticals are data from registered publishing app, not constants.

## 5. Target design
- Header: registered content source, scan freshness, total open findings, critical errors, latest successful full scan.
- Main: AI-reasoned grouped queue, then filters/table.
- Empty/fresh state: if no content source is discovered, show connect/register; if no DB, show persistence setup; if no scan, show Run first scan.
- Discovery: find article roots by frontmatter schema, public image roots, allowed verticals from app config/editorial policy, source manifests, and link probe policy.
- G6: re-scan and verify-fix can auto-run; content mutations use single Apply through NewsBites/Dossier actions.

## 6. Features to add (prioritized)
- MUST: Discovered content-source registry. Acceptance: no hardcoded `/opt/newsbites` needed after registration.
- MUST: AI finding cards. Acceptance: each finding has root cause and recommended action before evidence.
- MUST: Fix actions. Acceptance: missing image links to refresh/upload, thin digest opens guided edit, invalid vertical offers allowed choices, broken links open source evidence.
- MUST: Promote all visible findings to insights. Acceptance: any row visible here has a matching `/insights?focus=...`.
- SHOULD: Scan freshness and skipped-check metadata.
- SHOULD: Bulk verify/dismiss/snooze.
- EXTRA: Editorial coverage heatmap with “suggest scout topics” handoff.

## 7. Sellable-in-parts
- Standalone pitch: “Automated content QA for AI newsrooms: images, digests, links, duplicates, and coverage gaps with one-click fixes.”
- Suite fit: feeds NewsBites, Scout, Autopipeline, Dossier, Admin Health, Reports, and Audit.

## 8. Backend work
- Add registered content source config via Capability X.
- Extend scanner output with scan run id, skipped checks, source root id, and actionable fix descriptors.
- Aggregate both `events` and `content_health_findings` into insights or normalize into one persisted source.
- Add executor actions for image refresh/upload handoff, digest rewrite request, vertical correction, link recheck, and finding snooze/dismiss.
- Reuse `events`, `content_health_findings`, `insights`, `ai_analysis`, `action_audit`, and `jobs`.

## 9. Build slices
- Slice 1: scan-state/read-model cleanup and connect states.
- Slice 2: insights/AI overlay on findings.
- Slice 3: common fix actions and NewsBites/Dossier links.
- Slice 4: discovery-backed content source config.
- Documentation to update during implementation: this plan, `/root/DASHBOARD_V5_PLAN.md` Phase 12/Capability X, `README.md` content-health operator guide, and `/root/CLAUDE.md` only if article/frontmatter contracts change.

## 10. Verification
- DB disabled, missing content root, no scan, healthy scan, and findings all render distinct states.
- Run check writes findings and promotes them to insights.
- Each common finding has a clear recommended action and audited Apply path.
- Fresh host never shows mock NewsBites findings.
- Mobile finding cards and filters are usable without horizontal scroll.
