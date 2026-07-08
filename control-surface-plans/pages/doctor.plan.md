# /doctor — Product Plan
> One-line: the AI pipeline repair console for operators who need to understand failures, run doctor scans, and requeue or repair stories without SSH.

## 1. Today (verified, with file:line)
- Frontend route: `/doctor` renders `DoctorPage` in dashboard layout at `app/App.tsx:118` and `app/App.tsx:119`; nav marks it core at `app/lib/navRegistry.ts:23`.
- Sidebar/header copy: sidebar labels it "Doctor" at `app/components/DashSidebar.tsx:64`; header says "Auto-repair history & error analysis" at `app/components/DashHeader.tsx:12`.
- Data polling: `DoctorPage` fetches `/api/doctor` every 15s and owns a `POST /api/doctor/scan` action at `app/routes/DoctorPage.tsx:54` through `app/routes/DoctorPage.tsx:57`.
- Current summary: page shows repairs in 24h, success rate, and last decision at `app/routes/DoctorPage.tsx:83` through `app/routes/DoctorPage.tsx:103`.
- Scan-now GUI exists: "Run doctor scan" calls `scan.run()` and refreshes on success at `app/routes/DoctorPage.tsx:104` through `app/routes/DoctorPage.tsx:117`.
- Current analytics: error classes chart, top failing models, verdict mix, and decision log filters are rendered at `app/routes/DoctorPage.tsx:120` through `app/routes/DoctorPage.tsx:248`.
- Backend handler: `doctorHandler` maps entries from `getFullLog()` and stats from `getDoctorStats()` into `DoctorDetail` at `server/api/doctor.ts:11` through `server/api/doctor.ts:46`.
- Doctor adapter source: data comes from `/var/lib/mimule/doctor-log.jsonl` at `server/adapters/doctor.ts:3`; detail reads a 2MB tail at `server/adapters/doctor.ts:242` through `server/adapters/doctor.ts:258`.
- Stats logic: adapter deduplicates decisions, builds error/model/stage/action counts, detects rate-limit providers/fallback cascades, and records last decision at `server/adapters/doctor.ts:135` through `server/adapters/doctor.ts:232`.
- Scan backend: `POST /api/doctor/scan` is mounted with mutation guard at `server/api/router.ts:983` through `server/api/router.ts:987` and calls the autopipeline doctor endpoint with audit at `server/api/actions.ts:209` through `server/api/actions.ts:257`.
- Insights integration exists: elevated doctor error rate emits `ops:doctor-error-spike` with action `start-job:doctor:scan` and manual page `/doctor` at `server/insights/scanners/ops.ts:234` through `server/insights/scanners/ops.ts:251`.
- Readiness: ✅ for scan/history visibility, 🟡 for action completeness. There is scan-now and real data, but no requeue/repair GUI, no per-entry Apply path, and no surfaced AI reasoning from the unified insights system.

## 2. Gaps, mock & broken parts
- No requeue action: the page lists entries but row actions stop at display; there is no requeue/promote/skip/cooldown-clear control in the decision log at `app/routes/DoctorPage.tsx:225` through `app/routes/DoctorPage.tsx:248`.
- `DoctorDetail` carries `nextStage` and `cooldownMs` at `server/api/types.ts:243` through `server/api/types.ts:264`, and the API maps them at `server/api/doctor.ts:31` through `server/api/doctor.ts:32`, but the UI does not display or use them.
- Doctor scan bypasses durable jobs: `doctorScanHandler` directly fetches `http://127.0.0.1:3200/doctor/scan` and audits the result at `server/api/actions.ts:214` through `server/api/actions.ts:243`; it does not create a `jobs` row, despite the jobs table support.
- Action catalog only has "Run doctor scan" plus disabled "Create repair task" for entries at `server/api/actionDescriptors.ts:322` through `server/api/actionDescriptors.ts:361`.
- Error page is minimal: initial error state only prints the API error string at `app/routes/DoctorPage.tsx:22` through `app/routes/DoctorPage.tsx:30`, with no source freshness or fallback context.
- The insights scanner flags spikes but not doctor log size, stuck cooldowns, or repeated failed remediation; current scan only maps aggregate error rate at `server/insights/scanners/ops.ts:234` through `server/insights/scanners/ops.ts:251`.

## 3. Goal alignment (G1–G8)
- G1: keep the page stable when the log is missing, malformed, huge, or stale.
- G2: run scan, requeue story, set next stage, clear cooldown, and create repair task from GUI.
- G3: every visible control must work and write audit; no "create task" placeholder.
- G4: doctor-specific detectors should catch error spikes, unbounded log growth, fallback cascades, rate-limit storms, stale cooldowns, and repeated no-action outcomes.
- G5: group failures by urgency and recommended action, not just raw log order.
- G6: safe diagnostics can auto-run; requeue/skip/promote require one Apply with a reason.
- G7: show AI root cause and recommended action before charts/logs.
- G8: position as a sellable "AI Pipeline Doctor" module linked to Incidents, Jobs, Models, Autopipeline, and Detections.

## 4. Best-practice research
- Adopt an incident triage pattern: group repetitive log rows into failure clusters with impact, likely cause, affected stories, and next action.
- Use runbook-backed repair actions: each action explains what it will change, expected duration, risk, and rollback.
- Use progressive disclosure: summary clusters first, then charts, then raw log tail.
- Use freshness and source health: show log age, log size, scan endpoint health, and last successful scan.
- Use action observability: every scan/requeue is a durable job with output tail, status, actor, and linked audit row.
- Use AI-first diagnosis: pre-compute cluster summaries through the insights AI layer and show confidence and evidence.

## 5. Target design
- Layout: top "Doctor status" band with error rate, success rate, log freshness, last scan, active doctor jobs, and AI state summary.
- Main panel: severity-sorted failure clusters: rate-limit storm, bad model output, transport timeout, stuck story, abandoned content, fallback cascade.
- Cluster card: affected stories/models/stages, root cause, recommended action, confidence, and Apply/Run scan/Requeue buttons.
- Detail drawer: raw doctor entries, full evidence, linked insights, linked jobs, model cooldown state, and audit history.
- Actions: Run scan, requeue story to next stage, promote/skip stage, clear stale cooldown, open model, open dossier, create agent repair task.
- Empty state: "No recent doctor decisions" with last log read time and a Run scan button.
- Loading/error state: show doctor log missing/stale, autopipeline scan endpoint unavailable, and safe retry.
- Mobile parity: charts collapse below clusters; log table becomes cards; buttons are at least 44px and not hover-only.
- AI before raw data: cluster summary and root cause precede error-class charts and decision log.

## 6. Features to add (prioritized)
- MUST: Make scan durable; acceptance: Run scan creates/updates a `jobs` row, links to `/jobs/:id` or drawer, writes audit, and survives refresh/restart.
- MUST: Add requeue story action; acceptance: eligible doctor entries show one Apply button with next stage/cooldown preview, POSTs through executor, audits, and refreshes Autopipeline.
- MUST: Add cluster view; acceptance: repeated error rows are grouped by slug/stage/error/model with severity, count, first/last seen, and recommended action.
- MUST: Add AI analysis per cluster via insights; acceptance: root cause and recommended action show before raw rows, with Re-analyze link to `/insights`.
- SHOULD: Add doctor log hygiene detector/action; acceptance: oversized `/var/lib/mimule/doctor-log.jsonl` creates an insight and safe auto-rotate action when allowlisted.
- SHOULD: Add fallback cascade and provider outage cards; acceptance: provider/model clusters deep-link to `/models` and `/gateway`.
- EXTRA: Delight: a "repair replay" mini timeline for a story showing failed stage -> diagnosis -> doctor action -> result.

## 7. Sellable-in-parts
- Standalone module pitch: "AI Pipeline Doctor: repair log intelligence, failure clustering, scan-now, and one-click story recovery for autonomous content/agent pipelines."
- Suite fit: Doctor supplies evidence to Detections, escalates severe clusters to Incidents, creates Jobs, and links model failures to Models/Gateway.
- Packaging boundary: can ingest any JSONL repair log and expose scan/requeue webhooks; in-suite it uses `/api/doctor`, insights AI, executor, audit, and jobs.

## 8. Backend work
- Extend `server/api/actions.ts` or route through `server/api/execute.ts` for `start-job:doctor:scan`, `start-job:doctor-requeue:<story>`, `mutate-policy:cooldown:<model>:clear`, and `create-agent-task:doctor-entry:<id>`.
- Add durable job wrapping for scan and requeue using `createJob`, `updateJobOutput`, and `finishJob` in `server/db/writer.ts:345` through `server/db/writer.ts:457`.
- Extend `DoctorEntry`/`DoctorDetail` with stable entry id, dossier path, eligibility, recommended action, source log offset, and cluster id.
- Add pure scanner functions for doctor-log-size, fallback-cascade spike, rate-limit-provider storm, repeated abandoned content, and scan endpoint unavailable.
- Reuse `server/insights/ai.ts` for cluster reasoning and `server/insights/store.ts` for status lifecycle.
- Add executor/audit evidence refs to `/var/lib/mimule/doctor-log.jsonl`, `/api/doctor`, `/api/autopipeline`, and affected model quality/cooldown files.

## 9. Build slices
- Slice 1: Add stable doctor entry ids and cluster grouping in `server/adapters/doctor.ts`, `server/api/doctor.ts`, and focused tests.
- Slice 2: Wrap doctor scan in durable jobs in `server/api/actions.ts`, `server/db/writer.ts`, and `/jobs` integration tests.
- Slice 3: Add requeue/cooldown actions to `server/api/execute.ts`, `server/api/actionDescriptors.ts`, and `app/routes/DoctorPage.tsx`.
- Slice 4: Redesign `DoctorPage` to clusters-first with detail drawer and mobile card mode; smoke with real `/api/doctor` fixture.
- Slice 5: Add doctor detectors to `server/insights/scanners/ops.ts` or a new `doctor.ts`, plus AI enrichment and auto-apply policy where safe.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, doctor operator runbook, action catalog docs, and detector catalog.

## 10. Verification
- Current behavior citations are rechecked against `app/routes/DoctorPage.tsx`, `server/api/doctor.ts`, `server/adapters/doctor.ts`, and `server/api/actions.ts`.
- G1: page handles empty/missing/malformed log and unavailable scan endpoint.
- G2/G6: scan, requeue, cooldown clear, and repair task creation work from GUI with Apply/confirm where needed.
- G3: no disabled create-task placeholder remains.
- G4/G7: doctor clusters create insights with AI RCA before raw log rows.
- G5: default order is severity and actionability, not raw newest-first only.
- G8: desktop/mobile screenshots show a professional repair console; `/jobs`, `/audit`, `/incidents`, and `/insights` links work.
