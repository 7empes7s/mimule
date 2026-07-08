# /cost — Product Plan
> One-line: the FinOps command center for AI spend, budget enforcement, showback, anomaly triage, and savings actions across gateway traffic and GPU infrastructure.

## 1. Today (verified, with file:line)
- Frontend: `/cost` is registered in `app/App.tsx:181` and imports `CostPage` at `app/App.tsx:38`; it is not listed in `NAV_REGISTRY`, so `getRouteStatus()` defaults it to labs via `app/lib/navRegistry.ts:55`. Current readiness: 🔴 mock-broken.
- `CostPage` fetches `GET /api/cost/summary` every 30s in `app/routes/CostPage.tsx:62` and `app/routes/CostPage.tsx:63`.
- The page displays Vast GPU runway, cost anomalies, active budgets, spend by category, and fallback usage in `app/routes/CostPage.tsx:92`, `app/routes/CostPage.tsx:115`, `app/routes/CostPage.tsx:159`, `app/routes/CostPage.tsx:223`, and `app/routes/CostPage.tsx:269`.
- Known mock UI: budget used amount is hardcoded to 30% of cap in `app/routes/CostPage.tsx:187`, `app/routes/CostPage.tsx:188`, and `app/routes/CostPage.tsx:189`.
- Backend cost routes are mounted in `server/api/router.ts:882`, `server/api/router.ts:1397`, `server/api/router.ts:1398`, `server/api/router.ts:1399`, `server/api/router.ts:1404`, `server/api/router.ts:1405`, `server/api/router.ts:1406`, `server/api/router.ts:1407`, `server/api/router.ts:1408`, and `server/api/router.ts:1409`.
- `server/api/cost.ts` has real `cost_events` aggregation by model/workflow/article/tier/provider in `server/api/cost.ts:122`, `server/api/cost.ts:129`, `server/api/cost.ts:135`, and `server/api/cost.ts:155`.
- Budgets read/write `governance_budgets` in `server/api/cost.ts:181`, `server/api/cost.ts:258`, and `server/api/cost.ts:261`, while the shared governance budget helper enforces caps against `gateway_calls` in `server/governance/budgets.ts:43`, `server/governance/budgets.ts:62`, `server/governance/budgets.ts:73`, and `server/governance/budgets.ts:88`.
- Known mock backend: `getVastRunway` returns hardcoded/mock balance and burn in `server/api/cost.ts:330`, `server/api/cost.ts:332`, `server/api/cost.ts:334`, and `server/api/cost.ts:335`.
- Known mock backend: `getRecommendations` returns hardcoded recommendations in `server/api/cost.ts:473`, `server/api/cost.ts:478`, and `server/api/cost.ts:479`.
- `getCostSummary` falls back to static runway values in disabled/unavailable/error paths and in the normal response in `server/api/cost.ts:512`, `server/api/cost.ts:516`, `server/api/cost.ts:523`, `server/api/cost.ts:529`, `server/api/cost.ts:576`, `server/api/cost.ts:582`, `server/api/cost.ts:588`, and `server/api/cost.ts:591`.
- Gateway ledger writes both `gateway_calls` and `cost_events`, making it the correct source for spend/showback in `server/gateway/ledger.ts:47`, `server/gateway/ledger.ts:70`, and `server/gateway/ledger.ts:84`.
- DB schema already has `governance_budgets`, `gateway_calls`, `cost_events`, `provider_price_catalog`, and `spend_anomalies` in `server/db/dashboard.ts:656`, `server/db/dashboard.ts:715`, `server/db/dashboard.ts:891`, `server/db/dashboard.ts:921`, and `server/db/dashboard.ts:938`.
- Budget scanner already creates cost insights for exceeded and warning thresholds in `server/insights/scanners/budget.ts:35`, `server/insights/scanners/budget.ts:68`, and `server/insights/scanners/budget.ts:89`.

## 2. Gaps, mock & broken parts
- This page has verified mock data: `server/api/cost.ts:332`, `server/api/cost.ts:478`, and `app/routes/CostPage.tsx:187`. It should not be sold or promoted until those are removed.
- The route exists but is not in `NAV_REGISTRY`; it silently defaults to labs in `app/lib/navRegistry.ts:55`, making it hard to find.
- Budget status shown in the UI is fake because `usedCents` is computed from a constant 30% demo value in `app/routes/CostPage.tsx:188`, even though real budget spending helpers exist in `server/governance/budgets.ts:143`.
- Cost summary mixes `gateway_calls.cost_cents` in `server/api/cost.ts:547` even the schema shown in `server/db/dashboard.ts:715` uses `cost_estimate_usd`; real cost cents live in `cost_events` at `server/db/dashboard.ts:891`.
- Recommendations are not data-derived and do not produce Apply actions or audit evidence in `server/api/cost.ts:478`.
- Vast runway ignores actual Vast adapter/state and hardcodes `$50` balance in `server/api/cost.ts:335`.
- Cost anomalies shown on the page come from `events` kinds in `server/api/cost.ts:78`, but budget scanner emits `insights`; the page should reconcile events, spend anomalies, and insights into one FinOps inbox.

## 3. Goal alignment (G1–G8)
- G1: remove all mock spend/runway/recommendation data before promotion.
- G2: budgets, caps, alert thresholds, showback filters, anomaly triage, and recommendations must be GUI-driven.
- G3: every number must trace to `cost_events`, `gateway_calls`, real Vast state, `spend_anomalies`, `governance_budgets`, or `insights`.
- G4: detect budget warnings/stops, spend anomalies, unexpected paid fallback, unpriced calls, missing price catalog, low Vast runway, and stale cost ingestion.
- G5: make one obvious FinOps page with severity-sorted anomalies and clear Apply actions.
- G6: budget stops enforce automatically; cap changes and routing optimizations use one Apply; low-risk recommendations can be scheduled/dry-run.
- G7: each anomaly/recommendation begins with AI root cause, projected savings, risk, and recommended action.
- G8: this is the standalone AI FinOps module inside the AI Gateway suite.

## 4. Best-practice research
- FinOps Framework pattern: organize around Inform, Optimize, Operate; show allocation/showback, budget management, forecasting, anomaly management, and optimization recommendations.
- Anomaly management pattern: detect unexpected spend quickly, clarify why it happened, alert the right owner, and provide remediation that minimizes business impact.
- LiteLLM spend pattern: track spend by keys, users, teams/projects, and models; expose budgets and rate limits as first-class proxy controls.
- Unit economics pattern: show cost per workflow, article, builder run, successful response, and token, not only total spend.
- Governance pattern: caps should block automatically and be auditable; cap increases require reason/approval when risk exceeds threshold.

## 5. Target design
- IA: Executive Summary, Budget Status, Spend Explorer, Anomalies & Insights, Recommendations, GPU Runway, Attribution, Audit.
- Header: 30d spend, monthly cap progress, daily cap progress, projected month-end spend, budget status, free-routing savings, Vast runway.
- Budget section: real cap vs real spend with warning/critical thresholds, owner, scope, period, last updated, Apply to change cap.
- Spend Explorer: group by model, caller/key, tenant, project, workflow, article, tier, provider, cost basis; time range actually affects API queries.
- Recommendations: AI-rooted cards with evidence, estimated savings, risk, Apply/dry-run, and rollback; no hardcoded text.
- Anomalies: unified list of spend anomalies, budget insights, key cap stops, unexpected paid fallback, and low runway.
- GPU Runway: real balance/burn from Vast adapter or health state; stale data is labeled.
- Mobile: summary cards stack, tables collapse to filterable cards, all actions 44px+.

## 6. Features to add (prioritized)
- MUST: Remove mock budget usage in `CostPage`; acceptance: budget used/progress comes from real daily/monthly spend helper.
- MUST: Replace `getVastRunway` mock with real Vast balance/burn source; acceptance: stale/unavailable state is explicit, not fake.
- MUST: Replace mock recommendations with usage-derived recommendations; acceptance: recommendations cite actual rows and can be tested with fixture data.
- MUST: Fix `getCostSummary` to aggregate from `cost_events` as source of truth; acceptance: no `gateway_calls.cost_cents` dependency.
- MUST: Add `/cost` to nav as core/advanced only after mocks are gone; acceptance: route is findable in Gateway/FinOps group.
- SHOULD: Add budget create/edit/delete UI; acceptance: scope, cap, warn threshold, project/tenant fields persist and audit.
- SHOULD: Add forecast and anomaly windows; acceptance: projected month-end spend is derived from observed daily run rate.
- SHOULD: Add recommendation Apply actions: route free-first, set/raise cap, add key cap, investigate unpriced calls.
- EXTRA: Add "savings story" counter showing free-first routing avoided paid spend, backed by counterfactual calculations.
- EXTRA: Add PDF/CSV FinOps report export for standalone buyers.

## 7. Sellable-in-parts
- Standalone pitch: "AI FinOps for self-hosted AI gateways: real-time LLM spend, budget enforcement, anomaly triage, showback, forecasting, and one-click savings actions."
- Buyer value: finance/platform teams can explain who spent what, prevent runaway AI bills, and optimize routing without blocking engineering.
- Suite fit: `/cost` consumes gateway ledger and models; it creates insights; actions flow through executor; all budget changes and stops are visible in `/audit`.

## 8. Backend work
- Refactor `getCostSummary`, `getSpend`, and budget spending to use `cost_events` for cost cents and `gateway_calls` for runtime evidence only.
- Replace `getVastRunway` with real data from `server/adapters/vast.ts`, `/var/lib/mimule/gpu-health.json`, or a Vast balance sampler; include freshness timestamp.
- Replace `getRecommendations` with deterministic recommendation engine over `cost_events`, `gateway_calls`, model health, price catalog, and budget state; optionally enrich with `server/insights/ai.ts`.
- Add `PUT /api/cost/budgets/:id`, `DELETE /api/cost/budgets/:id`, `GET /api/cost/forecast`, `GET /api/cost/anomalies`, `POST /api/cost/recommendations/:id/apply`.
- Executor actions: `mutate-policy:budget:<scope>:set-cap`, `gateway.route-free-first`, `gateway.key-cap:set`, `cost.recommendation:dismiss`, `cost.report:export`.
- Detectors: low Vast runway, budget warning/exceeded, spend anomaly, unexpected paid fallback, unpriced call rate, stale price catalog.
- Documentation to update during implementation: FinOps operator docs, budget/cap runbook, gateway key budget docs, `/root/DASHBOARD_V5_PLAN.md`, and API docs for cost attribution.

## 9. Build slices
- Slice 1: Remove UI and summary mocks; real budget progress from `getBudgetSpending`/`cost_events`; validate `server/api/cost.test.ts`.
- Slice 2: Real Vast runway source and stale state; validate with adapter fixtures and no hardcoded balance.
- Slice 3: Cost summary and spend explorer over `cost_events`; validate group-by model/provider/tier/workflow/article and time filters.
- Slice 4: Budget CRUD UI and audit integration; validate create/edit/delete, detector warning/exceeded, gateway 429 stop.
- Slice 5: Data-derived recommendations with Apply/dry-run; validate savings calculations and audit rows.
- Slice 6: Nav promotion and report export; validate mobile and standalone buyer flow.

## 10. Verification
- `rg -n "mock|30% usage|For now, we'll return mock data|Mock recommendations" server/api/cost.ts app/routes/CostPage.tsx` returns no load-bearing cost mocks.
- Budget progress equals real spend from `cost_events`/gateway ledger for daily and monthly windows.
- Vast runway shows real source/freshness or an explicit unavailable state, never hardcoded `$50`.
- Recommendations change when fixture usage changes and cite evidence rows.
- Budget exceeded blocks gateway calls, creates insight, and has an audited cap-change Apply path.
- `/cost` links to `/gateway`, `/models`, `/traces`, `/insights`, and `/audit` with shared model/caller/trace IDs.
- `bun run typecheck`, `bun test server/api/cost.test.ts server/gateway/cost-loop.test.ts`, ephemeral smoke for `/api/cost/summary`, and multi-viewport Playwright checks pass.
- Documentation proves the page meets FinOps Inform/Optimize/Operate flows.

