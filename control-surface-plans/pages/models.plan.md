# /models — Product Plan
> One-line: the model lifecycle and quality-control center for operators who decide which logical AI models are safe, cheap, compliant, and production-ready.

## 1. Today (verified, with file:line)
- Frontend: `/models` is registered in `app/App.tsx:121` and renders `ModelsPage` imported at `app/App.tsx:7`; navigation marks it `core` in `app/lib/navRegistry.ts:24`. Current readiness: 🟡 partial, because it is useful for live model health but not yet a full lifecycle/GRC surface.
- `ModelsPage` fetches `GET /api/models` every 30s and posts policy actions to `/api/models/action` in `app/routes/ModelsPage.tsx:37`, `app/routes/ModelsPage.tsx:38`, and `app/routes/ModelsPage.tsx:40`.
- The page shows best heavy/fast/local models, recent health-check age, capability counts, blocked/degraded/probation pills, a run-health-check button, a filterable model table, fallback chains, active cooldowns, discovery log, and ratings in `app/routes/ModelsPage.tsx:67`, `app/routes/ModelsPage.tsx:71`, `app/routes/ModelsPage.tsx:134`, `app/routes/ModelsPage.tsx:145`, `app/routes/ModelsPage.tsx:153`, `app/routes/ModelsPage.tsx:228`, `app/routes/ModelsPage.tsx:247`, `app/routes/ModelsPage.tsx:274`, and `app/routes/ModelsPage.tsx:300`.
- The table exposes block, unblock, and clear-probation actions per model in `app/routes/ModelsPage.tsx:192`; the confirm modal maps those actions to the request body in `app/routes/ModelsPage.tsx:122`.
- Backend: `GET /api/models` is mounted in `server/api/router.ts:563`; `POST /api/models/action` is mounted behind `requireMutation` in `server/api/router.ts:978`.
- `server/api/models.ts` reads `/var/lib/mimule/model-health.json` through `modelHealthPath()` in `server/api/models.ts:31`, computes provider, pricing, capability, quality, failures, context, and summary fields in `server/api/models.ts:41`, `server/api/models.ts:47`, `server/api/models.ts:61`, and `server/api/models.ts:99`.
- The current `/api/models` response deliberately returns `cooldowns: []` and `discoveryLog: []` in `server/api/models.ts:120` and `server/api/models.ts:123`, even though `server/adapters/models.ts` can read cooldowns and a discovery log from `/var/lib/mimule/model-cooldowns.json` and `/var/lib/mimule/model-discovery-log.jsonl` in `server/adapters/models.ts:4` and `server/adapters/models.ts:7`.
- `modelsActionHandler` runs `model-health-check.service` with `systemctl start` and writes audit rows in `server/api/actions.ts:123`, `server/api/actions.ts:133`, `server/api/actions.ts:135`, and `server/api/actions.ts:136`; model policy edits write `/var/lib/mimule/model-quality.json` and audit high-risk policy actions in `server/api/actions.ts:163`, `server/api/actions.ts:167`, and `server/api/actions.ts:168`.
- Related but unsurfaced: route override endpoints exist at `server/api/router.ts:829`, `server/api/router.ts:832`, and `server/api/router.ts:837`; `forceRouteModel` persists `force_route_<logicalName>` in `system_configs` and logs config changes in `server/api/models.ts:209`, `server/api/models.ts:234`, and `server/api/models.ts:243`.

## 2. Gaps, mock & broken parts
- Active cooldowns and discovery history look like real UI sections, but the specific API used by the page returns empty arrays in `server/api/models.ts:120` and `server/api/models.ts:123`; this makes `app/routes/ModelsPage.tsx:247` and `app/routes/ModelsPage.tsx:274` underpowered.
- The page is quality-control oriented, not lifecycle oriented: no model detail drawer, no version timeline, no evaluation artifacts, no GRC scan status, no promotion gates, and no owner/service mapping. That conflicts with the V5 Phase 16 expectation that `/models` show experiment, evaluation, GRC, deployment, and production monitoring.
- Force-route endpoints exist in `server/api/router.ts:832` and `server/api/models.ts:209`, but `ModelsPage` does not expose force-route or clear-force-route controls; the table actions only block/unblock/clear probation in `app/routes/ModelsPage.tsx:192`.
- The health-check action uses `systemctl start model-health-check.service` synchronously in `server/api/actions.ts:135`; the audited executor has a safer descriptor path for `start-job:model-health:all` in `server/api/execute.ts:157`. The page should converge on the executor path for one action model.
- Quality status is stored in a JSON file via `writeFileSync` in `server/api/modelQuality.ts:33`, not in the database/audit model used by other governance changes; this is acceptable today but weak for a sellable lifecycle product.
- Cross-module warning: cost data must not be trusted until the known mock pieces are removed in `server/api/cost.ts:332`, `server/api/cost.ts:478`, and `app/routes/CostPage.tsx:187`; model decisions should use real gateway ledger/cost events once `/cost` is fixed.

## 3. Goal alignment (G1–G8)
- G1: keep the current fast health table, but make empty cooldown/discovery sections truthful and remove dead-looking panels.
- G2: every routine model operation must be GUI-able: run health check, block/unblock, clear stale cooldown, set temporary route override, compare candidates, approve promotion, and rollback route.
- G3: replace empty cooldown/discovery data with real adapter data; connect model spend, traces, and quality from the gateway ledger.
- G4: model failures, stale discovery, cooldown pileups, blocked models, budget stops, and GRC failures should all emit insights.
- G5: sort by operator urgency: unsafe/unavailable/expensive models first, then best candidates; deep-link to `/gateway`, `/traces`, `/cost`, and `/audit`.
- G6: safe model-health rechecks can auto-run; routing overrides, blocks, unblocks, and promotions require one Apply with reason and rollback hint.
- G7: put AI reasoning before raw model tables: "why this model is recommended/blocked", expected cost, risk, and next action.
- G8: make `/models` the sellable "AI model control plane" inside the standalone gateway suite.

## 4. Best-practice research
- Model registry pattern: treat every logical model as an asset with owner, intended workloads, version/backend, SLOs, cost tier, risk score, and lifecycle state. Great looks like a model detail page with lineage, evals, incidents, and promotion history.
- Gateway-aware model catalog: LiteLLM documents centralized gateway access, auth, multi-tenant spend, and virtual keys as core proxy capabilities; `/models` should present logical models as products that are routed, budgeted, and governed through the gateway.
- FinOps pattern: use allocation, showback, anomaly management, and optimization loops from the FinOps Framework. For this page, show cost per successful model outcome, not just raw model price.
- Observability pattern: use OpenTelemetry-style semantic fields for model/gateway spans so latency, errors, and token usage are comparable across backends.
- GRC pattern: production model promotion should require passing evals and AI policy checks, then create an immutable audit trail; "block model" should explain blast radius and affected routes.

## 5. Target design
- IA: top health strip, "Recommended routes" AI panel, "Production logical models" table, "Candidates & discovery" table, "Quality incidents", and model detail drawer.
- Layout: table stays dense on desktop; mobile collapses each model into a 44px+ action row with status, owner, cost, risk, and a single overflow menu.
- Key components: model score card, route chain visual, lifecycle timeline, eval/GRC status chips, spend sparkline, latency/error sparkline, action drawer, audit history tab.
- AI first: each selected model shows a 2-line reasoning block before details: root cause/risk, recommended action, confidence, and "based on health/cost/trace evidence".
- Actions: auto-run stale model-health checks through `start-job:model-health:all`; review-tier Apply for block/unblock/probation-clear/route override; every action links to `/audit`.
- Empty/loading/error: distinguish "health file missing", "health check stale", "no discovery log yet", "no cooldowns", and "database disabled"; none should look like a broken table.

## 6. Features to add (prioritized)
- MUST: Wire real cooldowns/discovery log into `GET /api/models`; acceptance: active cooldowns from `/var/lib/mimule/model-cooldowns.json` appear and stale/empty states are explicit.
- MUST: Add model detail drawer; acceptance: every row opens owner, logical name, resolved backend, route chain, health history, cost, traces, incidents, and audit links.
- MUST: Move health-check and model policy actions to executor/action descriptors; acceptance: audit rows use one action model and show rollback hints.
- MUST: Add route override controls using existing endpoints; acceptance: set/clear temporary override from GUI, TTL required, reason required, reflected on `/gateway`.
- SHOULD: Add lifecycle/GRC fields; acceptance: each production model shows lifecycle state, eval status, policy status, and promotion approval.
- SHOULD: Add "clear stale cooldown" action; acceptance: safe cooldown clears are audited and feed `/insights`.
- SHOULD: Add compare mode; acceptance: compare two or more models by cost, success rate, latency, JSON compliance, traces, and GRC score.
- EXTRA: Add "model autopilot" recommendations; acceptance: AI proposes cheaper/healthier route changes with projected savings and one Apply.
- EXTRA: Add delight detail: a mini route animation showing current fallback path, circuit state, and last successful call.

## 7. Sellable-in-parts
- Standalone pitch: "An AI model control plane that lets teams discover, evaluate, route, budget, and govern every logical model from one operator UI."
- Buyer value: platform teams get lower model spend, fewer outages, auditable model changes, and safer promotion gates without hand-editing JSON or LiteLLM config.
- Suite fit: `/models` owns model inventory and lifecycle; `/gateway` owns runtime traffic; `/litellm` owns proxy config evidence; `/cost` owns FinOps; `/traces` owns request evidence; `/insights` owns detections; `/audit` owns proof.

## 8. Backend work
- Change `GET /api/models` in `server/api/models.ts` to reuse `getModelsDetail()` from `server/adapters/models.ts` or move the richer adapter logic into one shared source.
- Add `GET /api/models/:logicalName` for drawer data: health, quality policy, gateway stats, cost events, traces, insights, audit rows, and GRC reports.
- Add `POST /api/models/:logicalName/route-override` and `DELETE /api/models/:logicalName/route-override` wrappers or surface existing `/api/models/force-route` endpoints with executor/audit parity.
- Add executor actions: `mutate-policy:model:<id>:block`, `mutate-policy:model:<id>:unblock`, `mutate-policy:model:<id>:probation-clear`, `start-job:model-health:all`, `route:model:<id>:override`, `clear-cooldown:model:<id>`.
- Schema: prefer existing `system_configs`, `config_changes`, `gateway_calls`, `cost_events`, `insights`, `ai_analysis`, and `action_audit`; add model lifecycle/GRC tables only when Phase 16 implementation starts.
- Detector/AI hooks: extend model stale-discovery, blocked-model, cooldown, model drift, and GRC-failure scanners; manual page href should deep-link to `/models?model=<logicalName>`.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, `README` or operator docs for model lifecycle, action descriptor docs, and any LiteLLM logical-name mapping docs.

## 9. Build slices
- Slice 1: Truthful data wiring in `server/api/models.ts`, `server/adapters/models.ts`, and focused tests in `server/api/models.test.ts`; validate with `bun test server/api/models.test.ts` and `bun run typecheck`.
- Slice 2: Executor parity for model actions in `app/routes/ModelsPage.tsx`, `server/api/actions.ts`, `server/api/execute.ts`, and `server/api/actionDescriptors.ts`; validate audit row shape and mutation auth.
- Slice 3: Model drawer with read-only gateway/cost/trace/audit links in `app/routes/ModelsPage.tsx` plus API aggregation; validate desktop/tablet/mobile.
- Slice 4: Route override GUI using existing `server/api/models.ts` force-route handlers; validate set, clear, TTL, reason, audit, and `/gateway` reflection.
- Slice 5: Lifecycle/GRC shell once `/governance/risk` exists; validate that model promotion cannot be marked production without passing GRC evidence.

## 10. Verification
- `GET /api/models` returns non-empty cooldowns/discovery when source files contain entries; no fake empty UI for known data.
- Health check, block, unblock, probation-clear, and route override all require auth, reason where risky, and create `/audit` rows.
- Model detail drawer links to matching `/gateway`, `/cost`, `/traces`, `/insights`, and `/audit` evidence.
- AI reasoning appears before raw rows for blocked/degraded/recommended models.
- Mobile view has no horizontal overflow for the primary model cards and all actions are at least 44px touch targets.
- `bun run typecheck`, focused model/action tests, ephemeral smoke for `/api/models`, and multi-viewport Playwright checks pass.
- Documentation updates are present for model lifecycle, logical model naming, and action/audit semantics.

