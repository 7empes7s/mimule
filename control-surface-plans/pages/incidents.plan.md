# /incidents — Product Plan
> One-line: the incident command center for operators who need high-severity failures grouped, reasoned, SLA-tracked, remediated, and post-mortemed from one place.

## 1. Today (verified, with file:line)
- Frontend route: `/incidents` is registered to `IncidentsPage` inside the authenticated dashboard layout at `app/App.tsx:133` and `app/App.tsx:134`; nav marks it core at `app/lib/navRegistry.ts:27`.
- Sidebar/header copy: the sidebar labels it "Incidents" at `app/components/DashSidebar.tsx:69`, while the header describes it as a "Cross-cutting failure timeline" at `app/components/DashHeader.tsx:17`.
- Current page data source: `IncidentsPage` polls `/api/reasoner/incidents?status=...` every 30s, not `/api/incidents` or `/api/insights`, at `app/routes/IncidentsPage.tsx:240` and `app/routes/IncidentsPage.tsx:241`.
- Current UI: it filters open/resolved/all and failure class at `app/routes/IncidentsPage.tsx:281` through `app/routes/IncidentsPage.tsx:306`, then renders a sortable table with last seen, severity, status, title, and count at `app/routes/IncidentsPage.tsx:316` through `app/routes/IncidentsPage.tsx:330`.
- Detail expansion: the expanded row fetches `/api/reasoner/incidents/:id`, representative diagnosis, and playbooks at `app/routes/IncidentsPage.tsx:96` through `app/routes/IncidentsPage.tsx:102`, then shows AI hypothesis/root cause/evidence/actions at `app/routes/IncidentsPage.tsx:137` through `app/routes/IncidentsPage.tsx:160`.
- Current actions: the detail card can POST a playbook apply request at `app/routes/IncidentsPage.tsx:108` through `app/routes/IncidentsPage.tsx:116` and can POST resolve at `app/routes/IncidentsPage.tsx:122` through `app/routes/IncidentsPage.tsx:127`.
- Backend route: reasoner incident list/detail/resolve/post-mortem/playbooks are mounted at `server/api/router.ts:1161` through `server/api/router.ts:1186`.
- Reasoner incident storage: list reads `reasoner_incidents` ordered by occurrence count and last seen at `server/api/reasoner.ts:302` through `server/api/reasoner.ts:338`; detail joins `reasoner_incident_members` to diagnoses at `server/api/reasoner.ts:363` through `server/api/reasoner.ts:400`.
- Post-mortems exist but are not surfaced in the page: resolving marks an incident resolved and calls `generateAndStorePostMortem` at `server/api/reasoner.ts:403` through `server/api/reasoner.ts:426`; the GET endpoint reads the latest archived post-mortem at `server/api/reasoner.ts:429` through `server/api/reasoner.ts:456`.
- Separate legacy incidents API still exists: `/api/incidents` reads `/var/lib/mimule/pipeline-alerts.json` plus doctor abandoned decisions at `server/api/incidents.ts:26` through `server/api/incidents.ts:69` and is mounted at `server/api/router.ts:643`, but the current page does not use it.
- Insights already aggregate reasoner incidents into the unified inbox: `aggregateReasoner` reads open `reasoner_incidents` and emits `build:incident` insights with `/incidents` as manual page at `server/insights/aggregate.ts:232` through `server/insights/aggregate.ts:278`.
- Readiness: 🟡 partial. The page is real and useful, but lifecycle actions are split from the insights executor, SLA fields are missing, and the direct playbook button is currently broken because UI sends only `incidentId` while the handler requires `workflowId` at `app/routes/IncidentsPage.tsx:112` through `app/routes/IncidentsPage.tsx:116` and `server/api/reasoner.ts:469` through `server/api/reasoner.ts:476`.

## 2. Gaps, mock & broken parts
- Broken Apply path: `applyPlaybook` posts `{ incidentId }` only at `app/routes/IncidentsPage.tsx:112` through `app/routes/IncidentsPage.tsx:116`, but `reasonerApplyPlaybookHandler` returns 400 without `workflowId` at `server/api/reasoner.ts:469` through `server/api/reasoner.ts:476`.
- Two incident models confuse operators: the visible page uses reasoner incidents at `app/routes/IncidentsPage.tsx:240`, while `/api/incidents` builds a different pipeline/doctor incident list at `server/api/incidents.ts:65` through `server/api/incidents.ts:106`.
- Incident lifecycle is not implemented in the unified executor: `executeActionHandler` returns "incident lifecycle not yet implemented" for acknowledge/resolve/mute action IDs at `server/api/execute.ts:227` through `server/api/execute.ts:233`.
- Disabled catalog actions confirm lifecycle storage is incomplete: incident acknowledge/resolve/mute descriptors are emitted disabled with "durable actions slice" copy at `server/api/actionDescriptors.ts:293` through `server/api/actionDescriptors.ts:317`.
- No SLA fields: `reasoner_incidents` has first/last seen/count/status but no owner, priority, SLA deadline, ack time, mitigation time, or post-mortem due date at `server/db/dashboard.ts:766` through `server/db/dashboard.ts:779`.
- Post-mortem generation is backend-only: the page never calls `/api/reasoner/incidents/:id/post-mortem` even though the route exists at `server/api/router.ts:1177` through `server/api/router.ts:1180`.
- Not one inbox yet: insights have AI analysis and risk-tier Apply flow at `server/api/insights.ts:78` through `server/api/insights.ts:96` and `server/api/insights.ts:146` through `server/api/insights.ts:297`, but `/incidents` still applies playbooks directly.
- Severity is heuristic by failure class only on the page at `app/routes/IncidentsPage.tsx:60` through `app/routes/IncidentsPage.tsx:65`; it does not use insight severity, affected service, customer impact, SLA proximity, or recurrence trend.

## 3. Goal alignment (G1–G8)
- G1: make incident Apply/Resolve reliable, remove the broken playbook call, add empty/error/loading states that explain DB-disabled and no-incident cases.
- G2: acknowledge, assign, mitigate, resolve, link run, generate/view post-mortem, snooze, and escalate must all be GUI actions.
- G3: one canonical incident source; no real-looking action can be disabled or silently fail.
- G4: incidents must include reasoner build failures, sentinel failures, ops findings, doctor spikes, and SLA-breach warnings from the insights scanner catalog.
- G5: severity/SLA sorted by default, with one obvious filter set and deep links from notifications/digests.
- G6: safe lifecycle updates are single-click or auto; remediation stays Apply-gated through `/api/actions/execute`/insights.
- G7: root cause, impact, confidence, and recommended action appear before raw evidence.
- G8: present as a professional incident-management module that stands alone while linking back to Detections, Jobs, Audit, Builder, Doctor, and Infra.

## 4. Best-practice research
- Adopt an incident inbox pattern: severity, current status, affected system, owner, SLA countdown, last update, and next action are visible in the first row.
- Use a lifecycle timeline pattern: detected -> acknowledged -> investigating -> mitigated -> resolved -> post-mortem complete, with each transition audited.
- Use alert grouping and dedupe: keep `cluster_key` grouping, but show member count, first/last seen, recurrence trend, and source coverage.
- Use service ownership context: affected route/service/model/team and runbook link travel with each incident.
- Use AI incident summary before evidence: "what happened / likely cause / safest next step / confidence / what Apply does" before logs or JSON.
- Use post-incident review workflow: post-mortem is generated from incident, diagnosis, jobs, and audit rows, then editable/exportable and linked to reports.
- Use one remediation path: incident remediation should call the same insight/executor path as Detections so approval, audit, rollback, and notifications are consistent.

## 5. Target design
- Layout: top health band with open criticals, SLA-at-risk, MTTA, MTTR, auto-fixes/24h, and "State of Incidents" AI summary; then filter tabs for Open, At risk, Mitigating, Resolved, Post-mortems due.
- Primary list: compact rows/cards with severity, SLA countdown, title, affected system, AI root cause, owner, status, recurrence, and one next action.
- Detail drawer: AI reasoning first; then timeline, evidence, linked insights, linked jobs, audit rows, affected builder pass, doctor entries, and generated post-mortem.
- Actions: Acknowledge, Assign, Mitigate, Resolve, Generate post-mortem, Apply recommended fix. Lifecycle actions use low/medium-risk executor actions; remediation uses insight Apply or reasoner-remediate descriptors.
- Empty state: "No open incidents" plus recent resolved incidents and detector freshness, not a blank table.
- Loading/error states: show DB unavailable, reasoner unavailable, and partial-source banners with retry.
- Mobile parity: cards replace table rows below tablet width, every action target is at least 44px, filters collapse into segmented controls/menus, no hover-only details.
- AI before raw data: the first paragraph in every row/detail is the stored AI/root-cause analysis; evidence and JSON remain behind expanders.

## 6. Features to add (prioritized)
- MUST: Fix playbook Apply by routing incident remediations through insight `reasoner-remediate:*` descriptors or by resolving `workflowId` server-side; acceptance: clicking Apply on an incident runs the playbook or opens the required approval, then writes audit.
- MUST: Unify incident sources; acceptance: `/incidents` is a saved view over insights plus reasoner incident metadata, and legacy `/api/incidents` entries are either migrated into insights or clearly tagged internal.
- MUST: Implement incident lifecycle actions in `/api/actions/execute`; acceptance: acknowledge/mitigate/resolve/snooze/mute work, persist, audit, and are visible after refresh.
- MUST: Add SLA tracking; acceptance: each open incident has SLA due time, breach risk, MTTA/MTTR metrics, and `incident approaching SLA breach` detector creates an insight.
- MUST: Surface post-mortems; acceptance: resolve can generate a post-mortem, the drawer can view/regenerate it, and Reports/Audit link back.
- SHOULD: Correlate related jobs/audit/events/insights; acceptance: detail drawer shows last 20 relevant actions and running jobs.
- SHOULD: Notification deep links; acceptance: critical incident notifications route to `/incidents?focus=<id>` and highlight the incident.
- EXTRA: Delight: timeline replay that shows the incident shrinking from detection to resolution with auto-applied actions marked as system steps.

## 7. Sellable-in-parts
- Standalone module pitch: "AI Incident Command Center for build, ops, and AI workflow failures: grouped incidents, AI RCA, SLA tracking, one-click remediation, and post-mortems."
- Suite fit: incidents are the high-severity view of the unified Detections inbox, pulling evidence from Doctor, Infra, Jobs, Builder, Audit, and Security.
- Packaging boundary: can be sold independently if it ingests incidents via API/webhooks and exports audit/post-mortem reports; in-suite it uses existing SQLite, insights, executor, and gateway reasoning.

## 8. Backend work
- Change `GET /api/reasoner/incidents` or add `GET /api/incidents/unified`: include insight id, severity, AI analysis, SLA fields, owner, lifecycle state, related job ids, and post-mortem status.
- Add lifecycle mutation endpoints through `/api/actions/execute` action IDs: `acknowledge:incident:<id>`, `resolve:incident:<id>`, `mute:incident:<id>`, `start-job:incident:<id>:postmortem`.
- Prefer existing schema plus additive columns/table: extend `reasoner_incidents` or add `incident_lifecycle` for `acknowledged_at`, `acknowledged_by`, `mitigated_at`, `resolved_at`, `owner`, `priority`, `sla_due_at`, `post_mortem_required`, `post_mortem_id`.
- Wire legacy `server/api/incidents.ts` outputs into insights or reasoner incidents, then mark `/api/incidents` internal/compatibility.
- Reuse `server/insights/ai.ts` for root cause and `server/api/reasoner.ts` post-mortem generation; keep logical model names such as `editorial-cloud-heavy`.
- Extend `server/insights/scanners/ops.ts` or a new scanner for SLA-breach warnings, stale incident owner, and repeated failed remediation.
- Ensure every lifecycle mutation writes `action_audit` via `server/db/writer.ts:260` through `server/db/writer.ts:315`.

## 9. Build slices
- Slice 1: Fix broken Apply and unify action path in `app/routes/IncidentsPage.tsx`, `server/api/reasoner.ts`, `server/api/insights.ts`; validate with unit tests for reasoner remediation body and a smoke click.
- Slice 2: Add incident lifecycle persistence in `server/db/dashboard.ts`, `server/db/writer.ts`, `server/api/execute.ts`, and `server/api/actionDescriptors.ts`; validate DB migration, audit rows, and refresh durability.
- Slice 3: Add SLA fields and detector in `server/insights/scanners/ops.ts` or `server/insights/scanners/incidents.ts`; validate synthetic breach/clear tests.
- Slice 4: Redesign `app/routes/IncidentsPage.tsx` around AI-first rows, detail drawer, timeline, and post-mortem viewer; validate desktop/tablet/mobile Playwright.
- Slice 5: Wire notifications and reports links in `server/notifications/*`, `server/reporting/*`, and route deep links.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, route README/runbook if added under control-surface docs, action catalog docs, and operator incident runbook copy.

## 10. Verification
- Current behavior citations are rechecked against `app/routes/IncidentsPage.tsx`, `server/api/reasoner.ts`, `server/api/incidents.ts`, and `server/insights/aggregate.ts`.
- G1: no failed direct playbook call; page survives DB-disabled, empty, and backend error states.
- G2/G6: acknowledge, resolve, mute, post-mortem, and remediation are GUI-only and audited through executor/insights.
- G3: no disabled real-looking lifecycle controls remain.
- G4/G5: incidents from reasoner, sentinel, doctor, ops, and SLA detectors appear in one severity/SLA-sorted view.
- G7: every open incident displays AI RCA and recommended action before evidence.
- G8: mobile and desktop screenshots show incident command center quality; audit and report links prove suite integration.
