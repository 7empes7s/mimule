# /admin — Product Plan
> One-line: the new unified Admin Center landing for owners/operators who need one health score, one inbox, one action path, and one audit trail.

## 1. Today (verified, with file:line)
- `/admin` does not exist as a frontend route today: `App.tsx` imports many route components but no `AdminPage` at `/opt/opencode-control-surface/app/App.tsx:1` through `/opt/opencode-control-surface/app/App.tsx:43`, registers `/insights` and `/audit` at `/opt/opencode-control-surface/app/App.tsx:103` through `/opt/opencode-control-surface/app/App.tsx:143`, and then sends unmatched routes to `DashHome` at `/opt/opencode-control-surface/app/App.tsx:200` through `/opt/opencode-control-surface/app/App.tsx:202`; readiness: 🧪 new route required.
- `/admin` is not in nav: the route registry lists `/`, `/insights`, `/security`, `/governance`, `/compliance`, and `/audit` statuses but no `/admin` entry at `/opt/opencode-control-surface/app/lib/navRegistry.ts:15` through `/opt/opencode-control-surface/app/lib/navRegistry.ts:53`.
- Sidebar nav has separate flat entries for `Home`, `Insights`, `Security`, `Governance`, `Compliance`, and `Audit`, but no Admin Center group or `/admin` item at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:57` through `/opt/opencode-control-surface/app/components/DashSidebar.tsx:95`.
- Header metadata has no `/admin` title; `PAGE_META` covers `/`, `/autopipeline`, `/doctor`, `/models`, `/litellm`, `/newsbites`, `/infra`, `/incidents`, `/opencode`, `/codex`, and `/claude`, then falls back to `/` metadata at `/opt/opencode-control-surface/app/components/DashHeader.tsx:9` through `/opt/opencode-control-surface/app/components/DashHeader.tsx:29`.
- No `/api/admin/*` endpoint exists in router; the router has explicit routes for `/api/insights`, `/api/actions/audit`, `/api/home`, `/api/product-health`, `/api/events`, and falls through to JSON 404 at `/opt/opencode-control-surface/server/api/router.ts:488` through `/opt/opencode-control-surface/server/api/router.ts:559` and `/opt/opencode-control-surface/server/api/router.ts:1446` through `/opt/opencode-control-surface/server/api/router.ts:1449`.
- Existing pieces to reuse: `/api/insights` returns findings with AI analysis and risk tier at `/opt/opencode-control-surface/server/api/insights.ts:78` through `/opt/opencode-control-surface/server/api/insights.ts:95`; `/api/audit/chain-status` is mounted at `/opt/opencode-control-surface/server/api/router.ts:758`; `/api/product-health` is mounted at `/opt/opencode-control-surface/server/api/router.ts:557`.
- V5 explicitly proposes Admin Center as a new `/admin` landing with tabs Detections, Security, Access, GRC, Compliance, and Audit at `/root/DASHBOARD_V5_PLAN.md:169` through `/root/DASHBOARD_V5_PLAN.md:180`.
- V5 defines the Admin Health Score target and requires it on `/admin` and Home at `/root/DASHBOARD_V5_PLAN.md:182` through `/root/DASHBOARD_V5_PLAN.md:193`.

## 2. Gaps, mock & broken parts
- Operators currently have no single Admin Center landing; governance/admin surfaces are split across `/insights`, `/security`, `/governance`, `/compliance`, and `/audit`, matching the collision V5 calls out at `/root/DASHBOARD_V5_PLAN.md:160` through `/root/DASHBOARD_V5_PLAN.md:165`.
- The primary nav does not put Admin Center first; `PRIMARY_NAV` is hardcoded as `/`, `/insights`, `/security`, `/agents`, `/today`, `/autopipeline`, `/models`, `/opencode` at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:100` through `/opt/opencode-control-surface/app/components/DashSidebar.tsx:102`.
- There is no one health number; existing Home shows product health and open insights separately at `/opt/opencode-control-surface/app/routes/DashHome.tsx:283` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:307` and `/opt/opencode-control-surface/app/routes/DashHome.tsx:368` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:382`.
- There is no global command palette; `DashSidebar` supports nav, theme, variant, stack pill, and hamburger controls but no command palette state/action at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:178` through `/opt/opencode-control-surface/app/components/DashSidebar.tsx:255`.
- There is no unified admin landing backend; current data must be assembled from existing home, insights, product-health, audit, security, governance, and compliance endpoints.
- Because unmatched routes fall to `DashHome`, navigating to `/admin` today can look like Home rather than a missing route, which hides the absence of the intended landing at `/opt/opencode-control-surface/app/App.tsx:200` through `/opt/opencode-control-surface/app/App.tsx:202`.

## 3. Goal alignment (G1-G8)
- G1: `/admin` must be stable on first release, reusing working data paths and showing degraded source states instead of blank panels.
- G2: It must be the GUI route for routine admin-center triage: scan, apply, acknowledge, export, policy access, and security/compliance drill-downs.
- G3: No mock data; if a module is not ready, show "not wired yet" with next action, not fake scores.
- G4: The landing must expose detector coverage and high-severity gaps across ops, security, compliance, cost, and AI GRC.
- G5: One obvious place: first nav item, one health score, one inbox preview, one action activity feed, one audit link.
- G6: Safe work auto-applies; review-tier work appears as one Apply; high-risk work routes through approval; all are audited.
- G7: AI State of the Stack appears before raw findings and module cards.
- G8: This is the product-defining "M365 admin center for an AI-operated company" landing.

## 4. Best-practice research
- Admin-center pattern: Microsoft 365 uses one health dashboard to combine service health, app updates, and security recommendations, which supports `/admin` as a summarized operating state plus deep links (https://learn.microsoft.com/en-us/microsoft-365/admin/manage/health-dashboard-overview).
- Service-health pattern: keep current issues, history, maintenance/change messages, and recommendations in one place rather than scattering them by service (https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health).
- SRE pattern: health must include latency, traffic, errors, and saturation, not only service status; these should feed the Admin Health Score and score-driver cards (https://sre.google/sre-book/monitoring-distributed-systems/).
- AI governance pattern: NIST AI RMF structures AI risk work around Govern, Map, Measure, Manage; `/admin` should route AI GRC gaps to `/governance/risk` while keeping the summary visible (https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).
- Audit/logging pattern: admin actions need attributable, tamper-evident logs with enough context to reconstruct sequence and outcome (https://owasp.org/Top10/2021/A09_2021-Security_Logging_and_Monitoring_Failures/).
- Great for this page: an admin health score, AI briefing, top findings, auto-fix/review activity, module status tabs, command palette, and direct audit proof.

## 5. Target design
- IA: Add top-level `/admin` and make it first in primary nav. Keep existing routes but group them as tabs: Overview `/admin`, Detections `/insights`, Security `/security`, Access `/governance`, GRC `/governance/risk`, Compliance `/compliance`, Audit `/audit`.
- First viewport: Admin Health Score gauge, trend sparkline, AI State of the Stack, score drivers, and top action.
- Main body: Detections preview, auto-fix activity, pending approvals, security/compliance/GRC status, audit chain status, detector coverage, and recent system events.
- Right rail: "Needs owner review", "Auto-fixed today", "Docs/evidence due", "Cost risk", and "Next scheduled scans".
- Empty states: all-clear state includes last scan time, detector coverage, and next scan; missing modules show "not wired" with path to implementation issue/plan.
- Error states: per-card source failure and page-wide degraded banner; no single backend failure should blank the page.
- Mobile parity: score and top action first, tabs become horizontal scroll/segmented control, cards stack, 44px controls, no hover-only menus.
- G7: State of the Stack AI caption before raw cards, plus AI one-liners on score drivers.
- G6: actions route to existing `/api/insights/:id/apply`, `/api/actions/execute`, approvals, or `/audit/export`; no `/admin`-specific mutation engine.

## 6. Features to add (prioritized)
- MUST: Create `AdminPage` and route `/admin`; acceptance: direct navigation renders Admin Center, not Home fallback.
- MUST: Add nav grouping/labels per V5; acceptance: Admin Center is first nav item and tabs link to existing routes without breaking old URLs.
- MUST: Add Admin Health Score; acceptance: score, drivers, and trend appear on `/admin` and match Home.
- MUST: Add top-five detections preview with AI summary and Apply/manual links; acceptance: uses `/api/insights`, risk tier, and sourceKey deep links.
- MUST: Add audit chain/activity card; acceptance: chain ok/broken, recent manual/auto actions, and `/audit` links render.
- SHOULD: Add command palette; acceptance: `Ctrl-K` jumps routes, searches findings/audit/jobs, and runs allowlisted actions through executor.
- SHOULD: Add pending approvals/review queue; acceptance: high-risk insight apply requests are visible and actionable.
- SHOULD: Add module readiness cards for Security, Access, GRC, Compliance, Cost, Gateway; acceptance: each card shows real source status or explicit not-wired state.
- EXTRA: Add "morning admin digest" panel; acceptance: daily cached summary with top changes and actions taken.
- EXTRA: Add personalized saved admin views by role; acceptance: owner/operator/viewer sees relevant default filters.

## 7. Sellable-in-parts
- Standalone pitch: "AI Admin Center" gives a single control plane for AI gateway, ops, security, compliance, cost, and agent workflows.
- Suite fit: `/admin` is the landing; `/` remains the broader operations home; `/insights` is the full detection workbench; `/audit` is proof; `/security`, `/governance`, `/compliance`, and `/governance/risk` are specialist centers.
- Buyer value: a small AI/media/software operator can see risk, reasoning, action, and audit in one place instead of stitching dashboards, logs, and CLI runbooks.

## 8. Backend work
- Add `GET /api/admin/health`: score, trend, drivers, source freshness, and drill-down links. Implement in `server/insights/health.ts` and mount in `server/api/router.ts`.
- Add `GET /api/admin/overview`: combined payload for health, top insights, auto-fix audit rows, chain status, pending approvals, detector coverage, module readiness, and recent events.
- Add `GET /api/admin/search?q=` for command palette search across routes, insights, audit rows, jobs, and events; enforce auth and tenant scope.
- Add `GET /api/admin/actions`: allowlisted command palette actions with risk/confirm/reason metadata from existing descriptors/executor.
- Add `GET /api/admin/briefing`: cached State of the Stack using logical model `editorial-heavy`; never block page render.
- Reuse existing schema where possible: `insights`, `ai_analysis`, `action_audit`, `events`, `jobs`, `metric_samples`, `audit_export_jobs`, `tenant_settings`.
- Do not fork detection/governance engines; admin consumes `server/insights/*`, `server/governance/*`, `server/security-center/*` when available, and `server/compliance/*`.
- Documentation to update when implemented: `/root/DASHBOARD_V5_PLAN.md` Phase 3/9 status, nav/IA docs, API docs for `/api/admin/*`, and operator runbook for Admin Health Score.

## 9. Build slices
- Slice 1: Add `app/routes/AdminPage.tsx`, route registration in `app/App.tsx`, header meta in `DashHeader.tsx`, and `/admin` registry/nav item; validate direct URL and old routes.
- Slice 2: Add shared Admin Center tabs/navigation component used by `/admin`, `/insights`, `/audit`, `/security`, `/governance`, `/compliance`; validate active states and mobile.
- Slice 3: Implement `server/insights/health.ts` + `/api/admin/health`; validate score math tests and smoke endpoint.
- Slice 4: Build `/api/admin/overview` and Admin overview cards; validate degraded source behavior.
- Slice 5: Add command palette search/action metadata; validate auth, tenant filtering, and executor confirmations.
- Slice 6: Add cached briefing and daily digest panel; validate AI timeout fallback and no blocking first render.

## 10. Verification
- `/admin` renders its own route and no longer falls through to Home.
- Admin Center appears first in primary nav with labels Detections, Security, Access, GRC, Compliance, Audit.
- Admin Health Score appears and matches Home score.
- Top findings are AI-reasoned before evidence and link to focused `/insights` cards.
- Apply buttons use existing audited insight/executor paths and write `action_audit`.
- Audit chain and recent action rows link to `/audit`.
- Source degradation is visible per card; no mock score or fake module state appears.
- `Ctrl-K` works for navigation/search/actions when command palette ships.
- Mobile, tablet, desktop: no overlap, no horizontal scroll, 44px controls.
- Docs updated: V5 phase status, API docs, IA/nav runbook, health-score formula notes.
