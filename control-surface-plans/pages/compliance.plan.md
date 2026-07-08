# /compliance — Product Plan
> One-line: Compliance evidence and audit-readiness center for operators and buyers who need DPA, SOC2 mapping, tenant controls, reports, and verifiable audit exports.

## 1. Today (verified, with file:line)
- 🧪 labs/partial: `/compliance` is route-registered and has a real page, but nav readiness marks it labs/experimental (`app/App.tsx:212`, `app/routes/CompliancePage.tsx:26`, `app/lib/navRegistry.ts:43`).
- The frontend has four tabs: Reports, Audit Export, Tenant Settings, and DPA/SOC2 (`app/routes/CompliancePage.tsx:27`, `app/routes/CompliancePage.tsx:38`, `app/routes/CompliancePage.tsx:65`, `app/routes/CompliancePage.tsx:66`, `app/routes/CompliancePage.tsx:67`, `app/routes/CompliancePage.tsx:68`).
- Reports tab loads `/api/reports/templates`, checks auth, runs `/api/reports/run`, stores rows locally, and can download a client-side CSV after a run (`app/routes/CompliancePage.tsx:73`, `app/routes/CompliancePage.tsx:74`, `app/routes/CompliancePage.tsx:79`, `app/routes/CompliancePage.tsx:86`, `app/routes/CompliancePage.tsx:95`, `app/routes/CompliancePage.tsx:127`, `app/routes/CompliancePage.tsx:148`).
- Report APIs are real and DB-backed: `createReportRun` inserts into `report_runs`, runs a registered template, updates status/output/row count, and list/templates/run routes are registered (`server/api/reports.ts:117`, `server/api/reports.ts:143`, `server/api/reports.ts:149`, `server/api/reports.ts:155`, `server/api/router.ts:1350`, `server/api/router.ts:1351`, `server/api/router.ts:1352`).
- Audit Export tab posts `/api/audit/export`, opens `/api/compliance/evidence-bundle`, and verifies chain status through `/api/audit/chain-status` (`app/routes/CompliancePage.tsx:177`, `app/routes/CompliancePage.tsx:182`, `app/routes/CompliancePage.tsx:195`, `app/routes/CompliancePage.tsx:209`, `app/routes/CompliancePage.tsx:261`).
- Audit export reads `action_audit` rows and supports JSONL/CSV plus includeKinds; hash-chain helpers exist (`server/governance/audit/export.ts:47`, `server/governance/audit/export.ts:56`, `server/governance/audit/export.ts:73`, `server/governance/audit/export.ts:139`, `server/governance/audit/export.ts:154`).
- Separate audit-chain DB helper can append prev/row hashes, verify chain, and anchor the head to `/opt/ai-vault/audit` (`server/db/audit/chain.ts:8`, `server/db/audit/chain.ts:37`, `server/db/audit/chain.ts:56`, `server/db/audit/chain.ts:76`, `server/db/audit/chain.ts:99`).
- Tenant Settings tab loads `/api/tenant/settings`, edits data residency, storage root, audit retention days, and "Require Two Approvers", then saves via `PUT /api/tenant/settings` (`app/routes/CompliancePage.tsx:286`, `app/routes/CompliancePage.tsx:287`, `app/routes/CompliancePage.tsx:327`, `app/routes/CompliancePage.tsx:342`, `app/routes/CompliancePage.tsx:352`, `app/routes/CompliancePage.tsx:361`, `app/routes/CompliancePage.tsx:299`).
- Tenant settings schema exists with data residency, storage root, audit retention, two-approver flag, SSO flag, and updated timestamp (`server/db/dashboard.ts:688`, `server/db/dashboard.ts:690`, `server/db/dashboard.ts:691`, `server/db/dashboard.ts:692`, `server/db/dashboard.ts:693`, `server/db/dashboard.ts:694`, `server/db/dashboard.ts:695`).
- DPA/SOC2 panel loads compliance summary, subprocessors, and SOC2 mapping; it can generate a markdown DPA document for a customer name (`app/routes/CompliancePage.tsx:406`, `app/routes/CompliancePage.tsx:407`, `app/routes/CompliancePage.tsx:408`, `app/routes/CompliancePage.tsx:409`, `app/routes/CompliancePage.tsx:430`, `app/routes/CompliancePage.tsx:434`, `app/routes/CompliancePage.tsx:437`).
- Compliance API generator reads static Markdown templates for DPA, subprocessors, and SOC2 mapping, replaces placeholders, parses `- ` subprocessors, and parses rows starting with `| CC` (`server/compliance/generator.ts:8`, `server/compliance/generator.ts:9`, `server/compliance/generator.ts:10`, `server/compliance/generator.ts:17`, `server/compliance/generator.ts:20`, `server/compliance/generator.ts:28`, `server/compliance/generator.ts:36`, `server/compliance/generator.ts:40`).
- Compliance summary combines tenant settings, subprocessors, and SOC2 mapping counts; evidence bundle combines tenant settings, subprocessors, SOC2 mapping, DPA, and last 30 days audit logs (`server/api/compliance.ts:38`, `server/api/compliance.ts:40`, `server/api/compliance.ts:41`, `server/api/compliance.ts:42`, `server/api/compliance.ts:63`, `server/api/compliance.ts:76`, `server/api/compliance.ts:82`, `server/api/compliance.ts:97`).
- Compliance routes are registered for DPA, subprocessors, SOC2 mapping, summary, evidence bundle, and evidence pack generation/fetch (`server/api/router.ts:1452`, `server/api/router.ts:1453`, `server/api/router.ts:1454`, `server/api/router.ts:1455`, `server/api/router.ts:1456`, `server/api/router.ts:1457`, `server/api/router.ts:1462`).
- Evidence-pack generation is audited as `compliance.evidence-pack` against target type `compliance` (`server/api/router.ts:1499`, `server/api/router.ts:1505`, `server/api/router.ts:1513`).
- Compliance tests verify DPA placeholder replacement, non-empty subprocessors, SOC2 CC6/CC7/CC8/CC9 mapping, and DPA handler response (`server/api/compliance.test.ts:16`, `server/api/compliance.test.ts:28`, `server/api/compliance.test.ts:34`, `server/api/compliance.test.ts:66`).
- The insights scheduler has no compliance scanner today: it runs aggregate, security, registry, budget, anomaly, sentinel incident, ops, notifications, AI enrichment, auto-apply, and health sampling (`server/insights/scheduler.ts:38`, `server/insights/scheduler.ts:39`, `server/insights/scheduler.ts:40`, `server/insights/scheduler.ts:41`, `server/insights/scheduler.ts:42`, `server/insights/scheduler.ts:45`, `server/insights/scheduler.ts:51`, `server/insights/scheduler.ts:69`, `server/insights/scheduler.ts:75`, `server/insights/scheduler.ts:81`).
- The shared `InsightDomain` does not include `compliance`, so compliance control gaps cannot currently be stored as first-class compliance-domain insights without schema/type changes (`server/insights/types.ts:3`, `server/db/dashboard.ts:956`).

## 2. Gaps, mock & broken parts
- Compliance is real but thin: DPA, subprocessors, and SOC2 mapping come from static Markdown files rather than a control/evidence object model (`server/compliance/generator.ts:8`, `server/compliance/generator.ts:9`, `server/compliance/generator.ts:10`, `server/compliance/generator.ts:17`, `server/compliance/generator.ts:36`).
- The page has no control status dashboard: SOC2 rows are displayed as a static table with criteria/feature/notes, not as pass/fail/owner/evidence/freshness/remediation controls (`app/routes/CompliancePage.tsx:498`, `app/routes/CompliancePage.tsx:507`, `app/routes/CompliancePage.tsx:520`, `server/compliance/generator.ts:36`).
- Evidence bundle is generated by a GET download without an in-page job/status/history, while a separate audited evidence-pack POST exists but is not used by the UI (`app/routes/CompliancePage.tsx:257`, `app/routes/CompliancePage.tsx:261`, `server/api/router.ts:1457`, `server/api/router.ts:1505`).
- The Audit Export tab posts `/api/audit/export`, but the router's audit export handler is outside the compliance section and the Compliance page does not list prior `audit_export_jobs` (`app/routes/CompliancePage.tsx:182`, `server/api/router.ts:545`, `server/db/dashboard.ts:668`, `server/db/dashboard.ts:669`).
- Chain verification UI only shows pass/fail text; it does not display checked row count, first bad row, chain head, or anchor file, even though chain helpers expose this data (`app/routes/CompliancePage.tsx:203`, `app/routes/CompliancePage.tsx:274`, `server/db/audit/chain.ts:37`, `server/db/audit/chain.ts:76`, `server/db/audit/chain.ts:99`).
- Tenant Settings includes `ssoRequired` in the interface but the form does not render an SSO-required control, despite schema support (`app/routes/CompliancePage.tsx:15`, `app/routes/CompliancePage.tsx:386`, `server/db/dashboard.ts:694`).
- Tenant settings changes are saved directly, but the page does not show resulting config/audit history in the same view (`app/routes/CompliancePage.tsx:299`, `server/db/dashboard.ts:688`, `server/db/dashboard.ts:1198`, `server/db/writer.ts:260`).
- Reports run with hardcoded `tenantId: "mimule"` in the frontend body instead of defaulting from authenticated tenant context (`app/routes/CompliancePage.tsx:90`, `app/routes/CompliancePage.tsx:91`, `server/api/reports.ts:233`, `server/api/reports.ts:250`).
- There is no compliance gap detector feeding `/insights`, even though V5 calls for compliance control gaps and the scheduler is the place to wire scanners (`/root/DASHBOARD_V5_PLAN.md:147`, `server/insights/scheduler.ts:1`, `server/insights/scheduler.ts:28`).
- Compliance cannot currently prove AI-system coverage in a fresh environment: reports hardcode tenant `"mimule"`, the scheduler has no compliance/discovery scanner, the insights schema has no compliance domain, and host inventory is still the MIMULE-specific service/container/timer constants, so evidence packs could omit unregistered AI endpoints, shadow keys, or unmanaged AI containers without flagging a control gap (`app/routes/CompliancePage.tsx:90`, `app/routes/CompliancePage.tsx:91`, `server/insights/scheduler.ts:1`, `server/insights/scheduler.ts:8`, `server/db/dashboard.ts:956`, `server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- AI reasoning is absent: compliance controls/reports show raw rows/documents, not AI root cause/recommended remediation before evidence (`app/routes/CompliancePage.tsx:520`, `app/routes/CompliancePage.tsx:538`, `server/insights/ai.ts:95`, `server/insights/ai.ts:141`).
- No PDF/board-ready one-click report exists for auditors; current DPA download is Markdown and report CSV is client-generated from already returned rows (`app/routes/CompliancePage.tsx:437`, `app/routes/CompliancePage.tsx:140`, `app/routes/CompliancePage.tsx:148`).

## 3. Goal alignment (G1–G9)
- G1: Promote out of labs once every tab has real empty/error states, audited actions, history, and mobile layout.
- G2: All routine evidence/report/tenant-control operations must be GUI-driven: generate evidence pack, export audit, verify chain, schedule report, set retention/SSO controls.
- G3: No fake compliance status. Static templates are acceptable if labelled, but control status must be backed by real evidence/audit/config rows.
- G4: Add compliance gap detection: stale audit chain, no evidence pack, weak retention, missing SSO requirement, stale access review, missing DPA/subprocessor review.
- G4: Treat unknown AI systems as audit coverage gaps until registered, ignored with rationale, or proven out of scope.
- G5: One obvious compliance readiness score, severity-sorted gaps, direct evidence links, single Apply for fixes.
- G6: Safe evidence generation can be one-click/automatic; policy/tenant changes require Apply + reason + audit.
- G7: AI should summarize "what would fail an audit and why" before showing raw logs or SOC2 rows.
- G8: Make this a sellable GRC evidence module tied to Access, Security, and Audit.
- G9: Compliance reports and evidence packs must work in any tenant/environment, with honest empty/connect states and no hardcoded `mimule` tenant or MIMULE host inventory assumptions.

## 4. Best-practice research
- Use NIST CSF 2.0's Govern function to connect policy, roles, risk strategy, supply chain, and oversight instead of treating compliance as document downloads: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf.
- Use NIST AI RMF Govern/Map/Measure/Manage for AI compliance: model inventory, risk mapping, measured controls, managed remediation and reporting: https://www.nist.gov/itl/ai-risk-management-framework.
- Use access-review proof patterns from Microsoft Entra: recurring review, reviewer evidence, decisions, and audit-friendly proof: https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview.
- Great compliance products show a control matrix with owner, evidence freshness, automated tests, exceptions, last change, remediation action, exportable evidence bundle, and auditor view.
- For this stack, "great" means the operator can answer: "Are we audit-ready today?", "What is failing?", "What evidence proves it?", "What Apply will fix it?", and "What changed since last week?"

## 5. Target design
- IA: header with Compliance Readiness Score, Admin Health impact, last evidence pack, audit chain status, stale controls; tabs become `Overview`, `Controls`, `Evidence`, `Audit Chain`, `Reports`, `DPA`, `Tenant Controls`.
- Overview: AI-generated "Audit Readiness Brief" using open security/access/compliance findings, last evidence pack, chain status, report status, and tenant controls.
- Controls: SOC2/NIST/AI-RMF matrix with status, evidence source, owner, freshness, linked insight, Apply action.
- AI Inventory coverage: controls include `AI system inventory completeness`, `Unregistered AI assets reviewed`, `Exposed model endpoints remediated`, and `Shadow API keys reviewed`, each backed by `discovered_assets`, security findings, Register/Ignore rationale, and audit evidence.
- Evidence: audited evidence-pack generation job history, artifacts, download links, last generated, included rows, redaction status.
- Audit Chain: chain head, checked rows, first bad row, anchor file, export history, verification status.
- Reports: templates, scheduled daily/weekly reports, run history, CSV/Markdown/PDF export, vault export.
- DPA/Subprocessors: document generation, subprocessor inventory, last review date, changes since last review.
- Tenant Controls: residency, storage root, retention, two-approver, SSO-required, with change history and audit.
- Mobile: controls as cards with score/status/evidence/action; download buttons full width; date range inputs stacked.
- G7/G6: every failing/stale control starts with AI reason and recommended action; "Generate Evidence Pack" is one click; policy changes use Apply.

## 6. Features to add (prioritized)
- MUST: Compliance readiness score; acceptance: computed from real controls, audit chain, evidence freshness, tenant settings, and open security/access findings.
- MUST: Control matrix; acceptance: each SOC2 row has status, owner, evidence source, freshness, link, and remediation.
- MUST: Evidence-pack job UI; acceptance: page uses audited POST `/api/compliance/evidence-pack`, shows job/history/artifact, and still supports download.
- MUST: Audit chain detail; acceptance: shows checked count/head/first bad row/anchor and export history.
- MUST: Tenant control history; acceptance: settings edits show previous/current values and audit link.
- MUST: Compliance gap scanner; acceptance: emits insights for stale evidence, chain failure, weak retention, missing SSO/two-approver where required, stale subprocessor review.
- MUST: AI inventory compliance controls; acceptance: `unregistered-ai-system`, `exposed-model-endpoint`, and `shadow-api-key` findings create failing controls until Register or Ignore-with-reason is audited, Re-scan updates evidence freshness, and evidence packs include the discovered-assets snapshot.
- MUST: Zero-config compliance evidence; acceptance: on a host with no MIMULE services, reports/evidence show real tenant/discovery empty states and never inject `mimule` or MIMULE service names unless those are actually the authenticated tenant/assets.
- SHOULD: One-click auditor packet; acceptance: exports DPA, subprocessor list, SOC2 matrix, audit chain proof, evidence pack, and remediation log.
- SHOULD: AI audit brief; acceptance: cached briefing uses `editorial-heavy` logical model and never blocks page load.
- EXTRA: "Auditor mode"; acceptance: read-only share/export view hides operational controls and shows evidence lineage.

## 7. Sellable-in-parts
- Standalone pitch: "Compliance Evidence Center for AI-operated teams: control matrix, evidence automation, audit-chain verification, DPA/SOC2 exports, tenant controls, and AI readiness briefing."
- Suite fit: consumes Access and Security controls, emits compliance gaps into `/insights`, uses `/audit` as evidence backbone, and contributes to Admin Health.
- Packaging boundary: can stand alone if it includes DB-backed audit export, control/evidence model, tenant settings, and static DPA/SOC2 document generators.

## 8. Backend work
- Add `GET /api/compliance/readiness`: control score, failing/stale controls, audit chain status, evidence pack status, linked insights.
- Add `GET /api/compliance/controls`: materialized control matrix from SOC2 mapping plus real evidence refs.
- Make the frontend use `POST /api/compliance/evidence-pack` and `GET /api/compliance/evidence-pack/:id` for audited bundles.
- Add `GET /api/compliance/audit-chain`: wrap chain verification/head/anchor details for the page.
- Add a compliance scanner in `server/insights/scanners/compliance.ts` or extend scheduler with a new scanner; if `InsightDomain` stays unchanged, use `domain:"security"` or `domain:"data"` with `sourceKey:"compliance:*"` until schema is deliberately migrated.
- Consume Phase 4a discovery data: `server/discovery/*` probes populate `discovered_assets`; compliance readiness/evidence-pack APIs include registered/unregistered/ignored counts, last scan time, Register/Ignore audit rows, and linked `unregistered-ai-system`/`exposed-model-endpoint`/`shadow-api-key` findings.
- De-hardcode host inventory into discovery seed hints so compliance evidence reflects real services in the installed environment instead of `CRITICAL_SERVICES`, `DOCKER_CONTAINERS`, and `KNOWN_TIMERS` constants (`server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- Add report schedule/history endpoints if existing reports list is insufficient.
- Schema: prefer existing `report_runs`, `audit_export_jobs`, `action_audit`, `tenant_settings`, `governance_policy_decisions`, `insights`, `ai_analysis`; add a `compliance_control_evidence` table only if control status cannot be computed cheaply.
- Documentation the builder updates: `/root/DASHBOARD_V5_PLAN.md` Phase 10/12 status, `/home/agent/MIMULE_MASTER_PLAN_V3.md`, and this plan with evidence-pack/control-matrix implementation notes.

## 9. Build slices
- Slice 1: Readiness overview. Files: `server/api/compliance.ts`, `server/api/router.ts`, `app/routes/CompliancePage.tsx`, tests in `server/api/compliance.test.ts`.
- Slice 2: Evidence-pack UI uses audited POST/history. Files: `app/routes/CompliancePage.tsx`, `server/api/router.ts`, compliance evidence-pack module.
- Slice 3: Control matrix. Files: `server/compliance/generator.ts`, `server/api/compliance.ts`, `app/routes/CompliancePage.tsx`.
- Slice 4: Audit chain detail. Files: `server/db/audit/chain.ts`, `server/api/compliance.ts` or audit API, `app/routes/CompliancePage.tsx`.
- Slice 5: Compliance scanner. Files: `server/insights/scanners/compliance.ts`, `server/insights/scheduler.ts`, `server/insights/insights.test.ts`.
- Slice 6: AI audit brief + PDF/auditor packet. Files: `server/api/compliance.ts`, report/export modules, `app/routes/CompliancePage.tsx`.

## 10. Verification
- `/compliance` loads with no labs badge after promotion and no mock controls.
- DPA, subprocessors, SOC2 mapping, reports, evidence pack, and audit export use real files/tables.
- Evidence pack generation writes an audit row and is visible in history.
- Chain verification shows detailed result and fails visibly when a synthetic bad chain is tested.
- Compliance gap scanner creates insight rows with AI analysis and auto-resolves when evidence/settings are fixed.
- G4/G9: an unknown AI process/port/container fails the AI inventory completeness control, appears in the evidence pack with `unregistered-ai-system` status, and Register/Ignore/Re-scan changes are reflected in audit evidence.
- G4/G9: a clean host with none of MIMULE's services produces an honest "no AI systems discovered yet" control state and evidence pack, with no crash, mock control rows, hardcoded MIMULE assets, or hardcoded `mimule` tenant.
- Tenant setting changes persist and show audit/history.
- Mobile view has no horizontal table overflow and download/action controls are reachable.
