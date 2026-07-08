# /traces — Product Plan
> One-line: the request timeline and root-cause evidence explorer for operators debugging AI gateway calls, builder runs, latency, failures, and spend.

## 1. Today (verified, with file:line)
- Frontend: `/traces` is registered in `app/App.tsx:160` and imports `TracePage` at `app/App.tsx:21`; navigation marks it `advanced` in `app/lib/navRegistry.ts:39`. Current readiness: ✅ useful/solid, with room to become a cross-module evidence product.
- `TracePage` includes a gateway traces section that fetches authenticated `/api/traces/gateway` every 15s in `app/routes/TracePage.tsx:170`, `app/routes/TracePage.tsx:173`, and `app/routes/TracePage.tsx:174`.
- Gateway trace rows group calls by trace ID/caller, show models, token count, total latency, age, and failure status, and expand to per-call details in `app/routes/TracePage.tsx:59`, `app/routes/TracePage.tsx:93`, `app/routes/TracePage.tsx:108`, `app/routes/TracePage.tsx:120`, and `app/routes/TracePage.tsx:123`.
- Gateway traces have degraded and empty states in `app/routes/TracePage.tsx:188` and `app/routes/TracePage.tsx:193`.
- Builder/file traces are fetched by date from `/api/traces` and `/api/traces/:date`, then filtered by status and kind in `app/routes/TracePage.tsx:302`, `app/routes/TracePage.tsx:308`, `app/routes/TracePage.tsx:312`, `app/routes/TracePage.tsx:317`, and `app/routes/TracePage.tsx:374`.
- Span details show trace ID, span ID, kind, status, timing, parent, error, and JSON attributes in `app/routes/TracePage.tsx:276`, `app/routes/TracePage.tsx:280`, and `app/routes/TracePage.tsx:290`.
- Backend routes are mounted in `server/api/router.ts:751`, `server/api/router.ts:752`, `server/api/router.ts:753`, and `server/api/router.ts:755`.
- Gateway traces read `gateway_calls`, tenant-scope rows, group by `trace_id` or row ID, compute totals, and expose degraded states in `server/api/traces.ts:58`, `server/api/traces.ts:61`, `server/api/traces.ts:73`, `server/api/traces.ts:77`, `server/api/traces.ts:89`, `server/api/traces.ts:118`, and `server/api/traces.ts:142`.
- `gatewayTracesHandler` requires token auth and caps `days` to 30 in `server/api/traces.ts:145`, `server/api/traces.ts:146`, `server/api/traces.ts:153`, `server/api/traces.ts:160`, and `server/api/traces.ts:164`.
- Gateway ledger writes trace IDs from runtime completions in `server/gateway/router.ts:234`, `server/gateway/router.ts:245`, `server/gateway/router.ts:256`, and `server/gateway/router.ts:267`.

## 2. Gaps, mock & broken parts
- Trace groups are evidence-rich but not AI-reasoned; the page shows raw timelines before root-cause summary, which misses G7.
- Gateway traces do not include cost estimates in the frontend type or expanded table, even though gateway ledger rows contain `cost_estimate_usd` in `server/gateway/ledger.ts:17` and `server/db/dashboard.ts:725`.
- There is no trace search by trace ID/caller/model/error/cost, only local status/kind filters for builder spans in `app/routes/TracePage.tsx:374`.
- There is no direct "create insight / attach to incident / run recommendation" action from a failing trace.
- The page has two trace models: gateway DB traces and builder span files. They are useful, but not unified into one timeline schema or OpenTelemetry-style export.
- Cross-module warning: cost context inside traces should wait on removal of known cost mocks in `server/api/cost.ts:332`, `server/api/cost.ts:478`, and `app/routes/CostPage.tsx:187`; gateway call costs themselves are real ledger estimates.

## 3. Goal alignment (G1–G8)
- G1: preserve current stable trace browsing and improve empty/degraded clarity.
- G2: routine debug actions should be GUI-able: re-run probe, route healthiest, open model, open cost attribution, create/attach insight, export trace.
- G3: every trace field must come from `gateway_calls`, builder span files, or persisted orchestrator/reasoner tables.
- G4: high-latency traces, failed traces, budget-stop traces, and repeated error classes should emit findings.
- G5: make trace lookup findable from `/gateway`, `/models`, `/cost`, `/insights`, `/incidents`, and `/audit`.
- G6: safe actions like re-probe can be one-click/auto; route changes and retries require Apply.
- G7: trace detail opens with AI "what happened / why / what to do" before spans.
- G8: sell as observability for AI workflows, not just a debug table.

## 4. Best-practice research
- OpenTelemetry pattern: spans should use consistent names, kinds, statuses, attributes, and resource fields so traces remain queryable across services.
- Distributed tracing pattern: start with the critical path and error span, then allow drill-down to raw attributes; show waterfall, dependency, and duration breakdown.
- LLM observability pattern: include logical model, resolved model, tokens, cost, latency, caller/key, prompt metadata hashes, safety/guardrail outcomes, and fallback path.
- Incident workflow pattern: failing traces should attach directly to an incident/insight with a stable permalink and exported evidence bundle.
- FinOps observability pattern: trace cost must roll up to caller/project/workflow, so operators can explain expensive requests.

## 5. Target design
- IA: Search & Filters, AI Trace Summary, Gateway Timeline, Builder Timeline, Cost & Tokens, Actions, Raw Attributes.
- Landing: query bar for trace ID/caller/model/error; saved filters for failed, slow, expensive, budget-stopped, fallback-used.
- Trace detail: top AI summary, then waterfall/timeline, then call table, cost/tokens panel, related insights/incidents/audit rows.
- Gateway trace row: include cost, fallback chain, key/caller, error class, p95 contribution, and links to `/gateway?trace=`, `/cost?trace=`, `/models?model=`.
- Builder traces: show run/pass/workflow context and reasoner diagnosis where available.
- Actions: re-probe model, route healthiest, open model drawer, create insight, attach to incident, export JSON/OTLP-like bundle.
- Mobile: traces become expandable cards; no horizontal-only timeline dependency.

## 6. Features to add (prioritized)
- MUST: Add trace detail route or URL param; acceptance: `/traces?trace=<id>` deep-links to one trace from gateway, cost, insights, and audit.
- MUST: Add AI root-cause summary for failed/slow traces; acceptance: summary appears before raw spans and cites evidence.
- MUST: Add cost/tokens/caller/key to gateway trace rows; acceptance: expensive traces are discoverable without switching pages.
- MUST: Add search/filter by trace ID, caller, logical model, error class, cost threshold, and latency threshold.
- SHOULD: Add trace-to-insight action; acceptance: a failed trace can create a prefilled insight with evidence refs.
- SHOULD: Add OpenTelemetry-compatible export shape; acceptance: trace bundle can be downloaded/imported by standard tools.
- SHOULD: Add trace correlation event markers for config changes, deployments, budget caps, and feature flag changes.
- EXTRA: Add critical-path visualization and fallback path animation for LLM calls.

## 7. Sellable-in-parts
- Standalone pitch: "AI-native tracing for gateways and agent workflows: understand every model call, fallback, token, cost, failure, and remediation from one timeline."
- Buyer value: reduces mean time to resolution for LLM outages and expensive workflows by tying runtime evidence to model, cost, and action history.
- Suite fit: `/traces` is the evidence layer; `/gateway` acts on runtime issues, `/cost` explains spend, `/models` explains model health, `/insights` prioritizes findings, and `/audit` proves remediation.

## 8. Backend work
- Extend `GatewayTraceCall` and SQL in `server/api/traces.ts` to include `cost_estimate_usd`, `tier`, `backend`, and optionally gateway key ID/caller metadata.
- Add `GET /api/traces/gateway/:traceId` and query filters for model, caller, error, latency, cost, and days.
- Add AI trace analysis cache table or reuse `ai_analysis` with trace signatures; never block the trace list on LLM calls.
- Add `POST /api/traces/:traceId/create-insight` with evidence refs and audit.
- Add OTLP-like export endpoint `GET /api/traces/:traceId/export`.
- Add detectors for slow traces, failed trace clusters, high-cost traces, and repeated fallback/error-class clusters.
- Documentation to update during implementation: tracing schema docs, gateway trace propagation docs, operator debugging runbook, `/root/DASHBOARD_V5_PLAN.md`.

## 9. Build slices
- Slice 1: Add gateway trace cost/tier/backend fields and frontend display; validate `server/api/traces.test.ts`.
- Slice 2: Add deep-link trace detail route/param and search filters; validate URL-state and Playwright.
- Slice 3: Add AI trace summary cache and UI; validate non-blocking fallback when LLM unavailable.
- Slice 4: Add trace-to-insight action and audit; validate created insight deep-links back to trace.
- Slice 5: Add export and OTel-compatible shape; validate fixture output and docs.

## 10. Verification
- `/traces?trace=<id>` opens the same trace linked from `/gateway`, `/cost`, `/insights`, or `/audit`.
- Failed/slow/expensive traces show AI root cause before raw call/span tables.
- Trace rows include logical model, resolved model, caller/key, latency, tokens, cost, tier, status, and error class.
- Trace-to-insight creates a finding with evidence refs and audit row.
- Gateway DB degraded states remain clear when DB disabled or unreadable.
- `bun run typecheck`, `server/api/traces.test.ts`, gateway ledger trace tests, ephemeral smoke for `/api/traces/gateway`, and mobile/desktop Playwright checks pass.
- Documentation defines trace fields, propagation, export, and troubleshooting flow.

