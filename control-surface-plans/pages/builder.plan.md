# /builder — Product Plan
> One-line: the agentic IDE and app-builder cockpit for operators who turn plans into audited, validated, previewable software changes.

## 1. Today (verified, with file:line)
- Frontend component: `/builder` is routed to `BuilderPage` in `app/App.tsx:151`, marked `core` in `app/lib/navRegistry.ts:30`, and implemented as the largest route at 3,296 lines in `app/routes/BuilderPage.tsx:3296`; readiness is 🟡 partial: substantial and real, but with broken controls and fragmented remediation.
- Data sources: the page loads builder projects, discovery, workflows, runs, doctor reports, governance approvals, and selected run detail through `/api/builder/*` and `/api/governance/approvals` in `app/routes/BuilderPage.tsx:2788`, `app/routes/BuilderPage.tsx:2793`, `app/routes/BuilderPage.tsx:2794`, `app/routes/BuilderPage.tsx:2795`, `app/routes/BuilderPage.tsx:2796`, and `app/routes/BuilderPage.tsx:2797`.
- Current UI: the page has refresh, bootstrap, and workflow creation controls in `app/routes/BuilderPage.tsx:2887`, `app/routes/BuilderPage.tsx:2890`, and `app/routes/BuilderPage.tsx:2893`; it shows pending workflow approvals with approve/reject buttons in `app/routes/BuilderPage.tsx:2898`, `app/routes/BuilderPage.tsx:2917`, and `app/routes/BuilderPage.tsx:2930`.
- Current UI: workflows are filtered by lifecycle and rendered with status, mode, source session, project, plan, validation count, doctor score, and action buttons in `app/routes/BuilderPage.tsx:3015`, `app/routes/BuilderPage.tsx:3035`, and `app/routes/BuilderPage.tsx:3038`.
- Current UI: workflow actions include edit/start/stop/pause/resume/live preview/iterate/doctor-review/delete in `app/routes/BuilderPage.tsx:949`, `app/routes/BuilderPage.tsx:996`, `app/routes/BuilderPage.tsx:1001`, `app/routes/BuilderPage.tsx:1006`, `app/routes/BuilderPage.tsx:1011`, `app/routes/BuilderPage.tsx:1016`, `app/routes/BuilderPage.tsx:1019`, `app/routes/BuilderPage.tsx:1022`, and `app/routes/BuilderPage.tsx:1025`.
- Current UI: run detail includes run summary, analytics, plan progress, next steps, plan file content, live output streaming, pass logs, artifacts, validations, failure investigation, and AI diagnosis in `app/routes/BuilderPage.tsx:1656`, `app/routes/BuilderPage.tsx:1657`, `app/routes/BuilderPage.tsx:1658`, `app/routes/BuilderPage.tsx:1659`, `app/routes/BuilderPage.tsx:1660`, `app/routes/BuilderPage.tsx:1664`, `app/routes/BuilderPage.tsx:1760`, `app/routes/BuilderPage.tsx:1866`, `app/routes/BuilderPage.tsx:1882`, `app/routes/BuilderPage.tsx:1851`, and `app/routes/BuilderPage.tsx:1854`.
- Current UI: live review can launch web, full-stack, mobile-web, or mobile-device previews, shows transient tunnel warnings, embeds the app in an iframe, and exposes QR links in `app/routes/BuilderPage.tsx:2233`, `app/routes/BuilderPage.tsx:2248`, `app/routes/BuilderPage.tsx:2264`, `app/routes/BuilderPage.tsx:2324`, and `app/routes/BuilderPage.tsx:2373`.
- Backend handlers: router gates all `/api/builder/*` paths with `checkToken` in `server/api/router.ts:649`, exposes project/discovery/models/workflows/runs/plan/iterate/preview/live-log/artifact endpoints in `server/api/router.ts:650`, `server/api/router.ts:651`, `server/api/router.ts:652`, `server/api/router.ts:653`, `server/api/router.ts:689`, `server/api/router.ts:701`, `server/api/router.ts:705`, `server/api/router.ts:711`, `server/api/router.ts:726`, and `server/api/router.ts:748`.
- Backend persistence: SQLite tables exist for builder projects, workflows, runs, passes, artifacts, validations, locks, and doctor reports in `server/db/dashboard.ts:289`, `server/db/dashboard.ts:298`, `server/db/dashboard.ts:317`, `server/db/dashboard.ts:340`, `server/db/dashboard.ts:365`, `server/db/dashboard.ts:379`, `server/db/dashboard.ts:397`, and `server/db/dashboard.ts:414`.
- Backend actions: create/update/delete/start/stop/lifecycle/doctor/provision actions write `action_audit` rows in `server/api/builder.ts:454`, `server/api/builder.ts:500`, `server/api/builder.ts:536`, `server/api/builder.ts:623`, `server/api/builder.ts:668`, `server/api/builder.ts:703`, `server/api/builder.ts:874`, and `server/api/builder.ts:956`.
- Reasoning integration: failed passes can show direct builder diagnosis from `/api/builder/passes/:id/diagnosis` in `app/routes/BuilderPage.tsx:1265`, reasoner diagnoses from `/api/reasoner/diagnoses/:passId` in `app/routes/BuilderPage.tsx:1220`, and aggregated build insights link back to `/builder?run=...` in `server/insights/aggregate.ts:211` and `server/insights/aggregate.ts:226`.

## 2. Gaps, mock & broken parts
- `stop-after-pass` is wired in the UI to `POST /api/builder/runs/:id/stop-after-pass` in `app/routes/BuilderPage.tsx:1673`, and the backend handler exists in `server/api/builder.ts:779`, but the router only matches run actions `(retry|cancel)` in `server/api/router.ts:738`; the control is currently dead.
- The failed-pass "pause workflow" suggested action calls `/api/builder/workflows/${runId}/pause` in `app/routes/BuilderPage.tsx:1283` even though `runId` is not a workflow id; this can pause the wrong target or fail silently.
- Pause, resume, retry, cancel, and stop-after-pass do not write central audit rows in `server/api/builder.ts:722`, `server/api/builder.ts:735`, `server/api/builder.ts:748`, `server/api/builder.ts:763`, and `server/api/builder.ts:779`, while create/update/start/stop are audited in `server/api/builder.ts:454`, `server/api/builder.ts:500`, and `server/api/builder.ts:623`.
- The live preview uses a third-party QR image URL for preview QR rendering in `app/routes/BuilderPage.tsx:2300` and `app/routes/BuilderPage.tsx:2382`; for a standalone sellable builder, QR rendering should be first-party and privacy-safe.
- The builder has two diagnosis systems visible at once: builder classifier output in `app/routes/BuilderPage.tsx:1265` and reasoner output in `app/routes/BuilderPage.tsx:1220`; V5 requires one AI reasoning flow before insight/action, not split panels.
- The route is explicitly described in the UI as "One-pass runner with tmux isolation" in `app/routes/BuilderPage.tsx:2885`, but the backend supports modes like `auto-continue`, `scheduled`, `permanent`, `doctor`, and `plan` in `app/routes/BuilderPage.tsx:40`; the product framing undersells and mislabels the surface.
- Run tables show at most 10 workflows/runs in `app/routes/BuilderPage.tsx:2808`; there is no search, saved view, owner, project health rollup, or deep-link focus handling despite build insights linking to `/builder?run=...` in `server/insights/aggregate.ts:226`.

## 3. Goal alignment (G1–G8)
- G1: every builder control must either work or be removed; fix `stop-after-pass`, wrong pause target, silent console-only failures, and preview error states.
- G2: every routine build operation must be GUI-controllable: create, bootstrap, approve, start, stop, pause, resume, retry, cancel, stop-after-pass, run doctor, view logs, preview, iterate, rollback, and promote.
- G3: builder is mostly real; complete it by auditing every mutation, making previews first-party, adding searchable durable history, and wiring docs/version exports.
- G4: builder failures must create build-domain insights with reasoner diagnosis, confidence, evidence, run links, and detector lifecycle.
- G5: one obvious build inbox: active work, blocked work, recent failures, approvals, and next actions should appear before raw tables.
- G6: safe remediations like retry with timeout, clear stale lock, stop after current pass, and rerun validation should be one-click or auto-apply with revert/undo where applicable.
- G7: show "AI root cause + recommended next action" at the top of each failed run before logs, pass rows, or raw stdout.
- G8: position this as a standalone AI Builder product: project intake, planning, execution, preview, QA, approvals, audit, cost, and governance in one cohesive cockpit.

## 4. Best-practice research
- Adopt a "work queue first" pattern: prioritize active, blocked, failed, and approval-needed work before historical tables.
- Adopt CI/CD run ergonomics: stages, logs, artifacts, checks, retry strategy, cancellation semantics, and provenance should mirror mature build systems.
- Adopt agent traceability: every agent pass should show prompt, model, files touched, tools used, cost, and policy gates in a single timeline.
- Adopt preview-environment management: previews should have TTL, owner, public/private status, target type, health, kill switch, and explicit security warnings.
- Adopt incident-driven remediation: failed runs should flow into one insight/inbox model with root cause, evidence, and a single recommended Apply action.
- Adopt governed autonomy: unsafe actions require approval; safe repeatable actions can self-heal under policy; every action has an audit row and revert story.

## 5. Target design
- IA: top health band with Build Health, active runs, blocked runs, failed validations, pending approvals, preview status, spend/run, and last successful build.
- Main layout: left rail of projects/workflows; center lane for current active/selected run timeline; right inspector for AI diagnosis, recommended action, approvals, artifacts, preview, and audit.
- First screen: "Needs attention" queue, "Active builds", "Recent successful releases", and "Create/iterate" controls; collapse raw workflow/run tables behind tabs.
- Run detail: put AI diagnosis, confidence, recommended action, and "why this is safe" before pass logs; then show stage timeline, validation cards, artifacts, files touched, and logs.
- Preview panel: first-party QR generation, target selector, TTL, open/stop/restart, API health, diagnostics, and mobile/desktop snapshots.
- Empty states: new product setup should guide to `bootstrap`, `brainstorm`, or `projects`; missing prerequisites should offer a single Apply where safe.
- Loading/error states: replace console-only errors with inline callouts, retry buttons, and audit links.
- Mobile parity: stack attention queue, run timeline, and action tray; all action targets at least 44px; no table-only controls.
- G7/G6: AI recommendation card precedes logs; actions appear as Auto-applied, Apply, Request approval, or Disabled with reason.

## 6. Features to add (prioritized)
- MUST: Fix dead controls; acceptance: `stop-after-pass` route exists, failed-pass pause uses workflow id, and Playwright verifies both controls.
- MUST: Centralize mutation audit; acceptance: pause/resume/retry/cancel/stop-after-pass/preview start/preview stop/iterate all write `action_audit`.
- MUST: Build attention queue; acceptance: active, failed, blocked, approval-needed, and stale-preview items appear above tables with one recommended action.
- MUST: Unify failure reasoning; acceptance: builder classifier and reasoner output render as one "Diagnosis" card and build insights reuse that card's fields.
- MUST: Deep-link selected run; acceptance: `/builder?run=<id>` opens the run detail and highlights the source insight.
- MUST: First-party QR and preview TTL; acceptance: no external QR image call and expired previews show cleanup state.
- SHOULD: Search/filter workflows and runs by project, owner, status, model, failure class, and source session.
- SHOULD: Rollback/promote workflow lifecycle; acceptance: successful run can be marked release candidate, promoted, or rolled back with audited actions.
- SHOULD: Build cost and token accounting per run; acceptance: run summary includes cost by pass/model and links to `/cost`.
- SHOULD: Doctor score trend; acceptance: doctor reports show current score, previous score, regression reason, and Apply/Retry.
- EXTRA: "Watch mode" for active build with compact terminal, preview, and AI observer notes.
- EXTRA: Shareable stakeholder report for a build with screenshots, validation evidence, and audit chain.

## 7. Sellable-in-parts
- Standalone pitch: "An AI Builder Control Plane that plans, runs, validates, previews, diagnoses, and audits autonomous software work."
- Buyer: engineering teams adopting coding agents who need oversight, repeatability, approvals, and proof that agents did not silently break production.
- Packaging: Builder Core (projects/workflows/runs), Builder QA (validations/doctor), Builder Preview (ephemeral environments), Builder Governance (approvals/audit/insights), Builder FinOps (cost per run).
- Suite fit: builder failures feed the unified `/insights` inbox; agents are governed in `/agents`; team automation appears in `/agent-team`; projects come from `/projects`; skills come from `/marketplace`.

## 8. Backend work
- Change `POST /api/builder/runs/:id/stop-after-pass`: mount `builderStopAfterPassHandler` in `server/api/router.ts`, require mutation, and write audit.
- Change `POST /api/builder/workflows/:id/pause|resume`: add audit rows and return standardized action envelopes.
- Change `POST /api/builder/runs/:id/retry|cancel`: add audit rows, reason payload, and links to original run.
- Change `GET /api/builder/runs/:id`: include unified diagnosis payload from reasoner/builder classifier.
- Add `GET /api/builder/attention`: active/blocked/failed/approval/stale-preview queue with source keys for `/insights`.
- Add `GET /api/builder/runs/:id/timeline`: normalized pass/log/artifact/validation/action events.
- Add `POST /api/builder/previews/:id/ttl|restart`: governed preview lifecycle.
- Reuse schema: `builder_*`, `reasoner_*`, `action_audit`, `governance_approvals`, `gateway_calls`; do not create parallel run tables.
- Detector/AI hooks: every failed validation/pass creates or updates a build insight; resolved runs auto-resolve stale build insights.

## 9. Build slices
- Slice 1: Fix dead controls in `server/api/router.ts`, `app/routes/BuilderPage.tsx`, `server/api/builder.ts`; validate with unit tests plus a route smoke test.
- Slice 2: Add audit for all builder mutations in `server/api/builder.ts`; validate with `server/api/builder.test.ts` and audit-chain checks.
- Slice 3: Add `/api/builder/attention` and a top attention queue in `app/routes/BuilderPage.tsx`; validate empty, active, failed, and approval states.
- Slice 4: Merge diagnosis panels into one component; update `server/insights/aggregate.ts` to reuse the same diagnosis fields.
- Slice 5: Deep-link run focus and search/filter; validate `/builder?run=<id>` from an insight.
- Slice 6: First-party preview QR/TTL and preview restart/cleanup actions.
- Docs to update when implemented: builder operator runbook, API endpoint docs, action descriptor catalog, detector catalog, and user-facing release notes.

## 10. Verification
- No dead builder buttons: start/stop/pause/resume/retry/cancel/stop-after-pass/doctor/preview/iterate each returns success or visible error.
- Every mutation has an `action_audit` row with actor, action, target, risk, result, evidence, and rollback hint where possible.
- A failed pass shows AI root cause and one recommended action before logs.
- A build failure appears in `/insights` with `domain=build` and deep-links back to `/builder?run=<id>`.
- Preview launches, renders, stops, expires, and uses first-party QR generation.
- Mobile run detail and action tray meet 44px target and no horizontal scroll.
- Typecheck/build/tests pass; ephemeral smoke verifies route load, workflow table, run detail, and preview modal.
