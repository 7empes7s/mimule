# / — Product Plan
> One-line: the operator's executive cockpit for live stack health, current risk, and the fastest path into the unified Admin Center.

## 1. Today (verified, with file:line)
- Frontend component: `/` falls through the wouter catch-all to `DashHome`, not an explicit path route, after all named routes are registered in `/opt/opencode-control-surface/app/App.tsx:200` and `/opt/opencode-control-surface/app/App.tsx:201`; readiness: 🟡 partial.
- Navigation/readiness: `/` is marked `core` in the route registry at `/opt/opencode-control-surface/app/lib/navRegistry.ts:16`, and the sidebar labels it `Home` at `/opt/opencode-control-surface/app/components/DashSidebar.tsx:57`.
- Data loading: `DashHome` uses SSE `/api/stream`, polling fallback `/api/home`, and open-insight polling `/api/insights?status=open` at `/opt/opencode-control-surface/app/routes/DashHome.tsx:338`, `/opt/opencode-control-surface/app/routes/DashHome.tsx:341`, and `/opt/opencode-control-surface/app/routes/DashHome.tsx:342`.
- Loading/error behavior exists: `HomeLoadingState` renders skeleton sections and API error text at `/opt/opencode-control-surface/app/routes/DashHome.tsx:249` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:280`.
- Current top-of-page admin signal is a demo opener linking to `/insights`, showing open insight count and "AI recommendations are grouped by cost, security, build, and data" at `/opt/opencode-control-surface/app/routes/DashHome.tsx:368` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:382`.
- Product-health tile reads `/api/product-health`, shows health score/fail/warn counts, and links into `/insights` at `/opt/opencode-control-surface/app/routes/DashHome.tsx:283` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:307`.
- Stack-health widgets show services, GPU, Vast, and Hetzner metrics from `HomeData` at `/opt/opencode-control-surface/app/routes/DashHome.tsx:394` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:455`.
- NewsBites, autopipeline, doctor, models, and incidents widgets are present at `/opt/opencode-control-surface/app/routes/DashHome.tsx:457`, `/opt/opencode-control-surface/app/routes/DashHome.tsx:500`, `/opt/opencode-control-surface/app/routes/DashHome.tsx:556`, `/opt/opencode-control-surface/app/routes/DashHome.tsx:603`, and `/opt/opencode-control-surface/app/routes/DashHome.tsx:690`.
- API source: `/api/home` is mounted at `/opt/opencode-control-surface/server/api/router.ts:556`; `homeHandler` caches home data for 15 seconds and writes samples via `runHomeSampler` at `/opt/opencode-control-surface/server/api/home.ts:23` through `/opt/opencode-control-surface/server/api/home.ts:35`.
- Backend sources: `buildHomeDataUncached` fetches services, Hetzner, pipeline, models, doctor, articles, site reachability, Vast instance, and Vast account in parallel at `/opt/opencode-control-surface/server/api/home.ts:63` through `/opt/opencode-control-surface/server/api/home.ts:78`.
- Product health is a separate sentinel file read from `/var/lib/mimule/product-health.json`, with fallback "sentinel has not run yet" at `/opt/opencode-control-surface/server/api/product-health.ts:3` through `/opt/opencode-control-surface/server/api/product-health.ts:18`.

## 2. Gaps, mock & broken parts
- Home has product-health score plus open insight count, but not the V5 Admin Health Score that combines open severity, product-health failures, security trust, stale detector penalties, and model risk; the current UI separately reads `/api/product-health` at `/opt/opencode-control-surface/app/routes/DashHome.tsx:285` and `/api/insights?status=open` at `/opt/opencode-control-surface/app/routes/DashHome.tsx:342`.
- The "demo opener" wording makes the front door feel like a showcase instead of an operator-ready admin cockpit; that copy is hardcoded at `/opt/opencode-control-surface/app/routes/DashHome.tsx:368` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:375`.
- Reasoner status, incidents, and insights are still separate summaries on home, even though V5 says insights should be the single inbox/consumer; current home fetches reasoner jobs/diagnoses/incidents separately at `/opt/opencode-control-surface/app/routes/DashHome.tsx:170` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:173` and separately shows active incidents from home data at `/opt/opencode-control-surface/app/routes/DashHome.tsx:702` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:713`.
- Golden Signals are not visible on home; the home backend currently builds host/service/editorial/model widgets but no latency/traffic/errors/saturation object in `HomeData` at `/opt/opencode-control-surface/server/api/home.ts:132` through `/opt/opencode-control-surface/server/api/home.ts:217`.
- The page has links into actions surfaces but does not provide a single Apply path from the cockpit; `DashHome` cards are mostly `WCard` links at `/opt/opencode-control-surface/app/routes/DashHome.tsx:150` through `/opt/opencode-control-surface/app/routes/DashHome.tsx:155`.
- Header metadata still calls `/` "Operations" rather than "Home" or "Control Center" at `/opt/opencode-control-surface/app/components/DashHeader.tsx:9` and `/opt/opencode-control-surface/app/components/DashHeader.tsx:10`.

## 3. Goal alignment (G1-G8)
- G1: Home must degrade gracefully when individual backend sources fail, keeping the existing skeleton/error behavior and adding per-widget source freshness.
- G2: Home should expose GUI entry points for routine fixes by linking every red/yellow condition to `/admin` or `/insights?focus=<sourceKey>`, never to a CLI instruction.
- G3: Replace "demo opener" language with real health, real trend, and real action state; no showcase-only panels above operational priority.
- G4: Home should summarize detector coverage and stale-detector gaps, not just service status.
- G5: One obvious first screen: Admin Health Score, top blockers, auto-fix activity, recent operator actions, and a compact "what changed" rail.
- G6: Safe remediations should appear as "Auto-applied" or "Apply" calls routed through the existing executor/audit path, not one-off page controls.
- G7: Put the AI "State of the Stack" and top root causes before raw widget grids.
- G8: Make home feel like the landing of a cohesive admin center: fewer disconnected modules, clearer groups, consistent labels, and a direct path to `/admin`.

## 4. Best-practice research
- Adopt the admin-center health snapshot pattern: Microsoft 365's health dashboard presents service health, app updates, and security recommendations in one environment snapshot, which maps well to Home as "what needs attention now" rather than a tile wall (https://learn.microsoft.com/en-us/microsoft-365/admin/manage/health-dashboard-overview).
- Use SRE Golden Signals as the minimum reliability strip: latency, traffic, errors, and saturation should sit beside service status because liveness alone misses user impact (https://sre.google/sre-book/monitoring-distributed-systems/).
- Use the incident lifecycle pattern: Detect, Triage, Diagnose, Remediate, Learn. Home should show where each top item sits in that lifecycle and whether the next step is automatic, review, or informational (https://response.pagerduty.com/).
- Use FinOps showback and unit-cost patterns for the cost chip: even on home, cost should be shown by project/model/workflow owner, not just total spend, so operators can act on responsibility (https://www.finops.org/wg/cloud-cost-allocation/).
- Great for this page: a short AI briefing, one health number, a severity-sorted top-five inbox, event markers, and direct deep links. Raw module widgets remain below the fold for scanning and drill-down.

## 5. Target design
- IA: make Home the suite dashboard and `/admin` the action inbox. First viewport: Admin Health Score gauge, State of the Stack AI caption, top 3 causes lowering the score, and "auto-fixes last 24h".
- Layout: top health band; then "Needs attention", "Running normally", "Recent changes"; then existing module bands for Stack, Editorial, Models/Gateway, Cost, Build, and Audit.
- Components: reuse `WCard`, `Pill`, `Gauge`, `AreaSparkline`, and introduce shared `AdminHealthGauge`, `FindingSummaryCard`, `AutoFixActivityRow`, and `SourceFreshnessBadge`.
- Empty/loading/error states: keep `HomeLoadingState`; add per-source degraded cards when one source fails while the rest of the page renders.
- Mobile parity: top score, AI caption, and top action must fit in a single column with 44px minimum buttons; module grids collapse to compact cards with no hover-only details.
- G7: AI briefing appears before widget grids, with "likely cause" and "recommended action" language, sourced from cached `ai_analysis` or the proposed `/api/admin/briefing`.
- G6: safe items show "Auto-applied" with timestamp; review-tier items show one Apply button; informational items link to evidence only.

## 6. Features to add (prioritized)
- MUST: Replace demo opener with `AdminHealthGauge` backed by `GET /api/admin/health`; acceptance: `/` shows score, trend, score drivers, and link to `/admin?filter=score-drivers`.
- MUST: Add State of the Stack briefing; acceptance: cached AI text renders above raw cards and never blocks page load.
- MUST: Add severity-sorted "Needs attention" list using existing insights; acceptance: critical/high open insights appear above green widgets and deep-link to `/insights?focus=<sourceKey>`.
- MUST: Add source freshness/degraded markers; acceptance: failed home sources show a visible degraded chip without blanking the whole page.
- SHOULD: Add Golden Signals strip; acceptance: latency, traffic, errors, and saturation render with 24h sparklines from `metric_samples`.
- SHOULD: Add auto-fix activity card; acceptance: audit rows with `insights.auto-apply` show action, why, result, and revert/manual page link.
- EXTRA: Add "what changed since last visit" with deployment/config/incident markers; acceptance: uses `events` and `action_audit`, not local mock state.
- EXTRA: Add a polished "all clear" state; acceptance: when no open findings exist, home shows last scan time, coverage, and next scheduled scan.

## 7. Sellable-in-parts
- Standalone pitch: "AI Operations Home" is an executive control cockpit for AI-operated teams: one health score, prioritized findings, AI root cause, and audited actions.
- Suite fit: Home is the non-mutating overview; `/admin` is the admin-center landing and action hub; `/insights` is the detailed detections inbox; `/audit` proves every action.
- Buyer value: useful to founders/operators who need a single daily screen for reliability, cost, content pipeline, gateway, and governance without SSH.

## 8. Backend work
- Add `GET /api/admin/health`: compute Admin Health Score in `server/insights/health.ts` using existing `insights`, `product-health`, security trust score, stale scanner metadata, model risk, and Golden Signals.
- Add `GET /api/admin/briefing`: cached State of the Stack text using logical model `editorial-heavy`; store in `ai_analysis` or a small `metric_samples`/`system_configs`-backed cache rather than blocking home.
- Extend `HomeData` or add `GET /api/home/admin-cluster`: include health score, top score drivers, recent auto-fix audit rows, and source freshness.
- Extend `runHomeSampler`/`dashboard-ingestor` path: write Golden Signals into existing `metric_samples`.
- Reuse executor actions only; no home-specific mutation endpoint. Apply links should post to `/api/insights/:id/apply` or `/api/actions/execute`.
- Documentation to update when implemented: `/root/DASHBOARD_V5_PLAN.md` Phase 3/9 status notes, route README/admin IA docs if present, and any API docs generated from `server/api/docs.ts`.

## 9. Build slices
- Slice 1: Home copy/IA cleanup in `/opt/opencode-control-surface/app/routes/DashHome.tsx` and `/opt/opencode-control-surface/app/components/DashHeader.tsx`; validate with `bun run typecheck`, `bun run build`, and Playwright `/` desktop/mobile screenshots.
- Slice 2: Add `server/insights/health.ts` + `GET /api/admin/health` in `server/api/router.ts`; validate with focused unit tests over score math and ephemeral smoke `curl /api/admin/health`.
- Slice 3: Add Home Admin Health cluster and top score drivers; validate `/`, `/admin`, and `/insights` deep links.
- Slice 4: Add Golden Signals ingestion/display from `metric_samples`; validate sampler tests and visual sparklines.
- Slice 5: Add cached AI briefing; validate model failure fallback, non-blocking home load, and `ai_analysis` persistence.

## 10. Verification
- Home loads with SSE connected and with SSE unavailable; polling fallback works.
- No "demo opener" or real-looking mock language remains above the fold.
- Admin Health Score is identical on `/`, `/admin`, and any header gauge.
- Critical/high open insights appear on Home in the same order as `/insights`.
- Clicking a score driver lands on `/insights?focus=<sourceKey>`.
- Safe actions show auto-applied status from audit; review actions require one Apply and record `action_audit`.
- Golden Signals show non-empty data or an explicit "not enough data yet" state.
- Mobile 390px/430px, tablet, desktop: no horizontal scroll, no clipped cards, 44px action targets.
- Docs updated: V5 plan status, API docs, and admin-center IA notes.
