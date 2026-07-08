# /gateway — Product Plan
> One-line: the sellable AI gateway operations cockpit for routing, credentialing, budget guardrails, reliability actions, and real-time LLM traffic evidence.

## 1. Today (verified, with file:line)
- Frontend: `/gateway` is registered in `app/App.tsx:163` and imports `GatewayPage` at `app/App.tsx:22`; navigation marks it `advanced` and `experimental` in `app/lib/navRegistry.ts:40`. Current readiness: 🟡 partial/experimental.
- `GatewayPage` polls `/api/gateway/status`, `/api/gateway/stats`, `/api/gateway/ledger`, and authenticated `/api/gateway/showback` in `app/routes/GatewayPage.tsx:132`, `app/routes/GatewayPage.tsx:133`, `app/routes/GatewayPage.tsx:134`, and `app/routes/GatewayPage.tsx:135`.
- The page has a cost-performance headline, showback by model/caller/basis, counterfactual paid-cost explanation, health/degraded pills, recommendation banner, probe/route-healthiest actions, circuit-breaker controls, model usage stats, CSV export, and recent call ledger in `app/routes/GatewayPage.tsx:208`, `app/routes/GatewayPage.tsx:232`, `app/routes/GatewayPage.tsx:289`, `app/routes/GatewayPage.tsx:310`, `app/routes/GatewayPage.tsx:321`, `app/routes/GatewayPage.tsx:360`, `app/routes/GatewayPage.tsx:392`, `app/routes/GatewayPage.tsx:416`, `app/routes/GatewayPage.tsx:443`, `app/routes/GatewayPage.tsx:399`, and `app/routes/GatewayPage.tsx:481`.
- Actions post directly to gateway endpoints with a generic reason in `app/routes/GatewayPage.tsx:153` and `app/routes/GatewayPage.tsx:160`; recommendation actions call half-open and route-healthiest in `app/routes/GatewayPage.tsx:367` and `app/routes/GatewayPage.tsx:376`.
- Backend: gateway endpoints are mounted in `server/api/router.ts:844` through `server/api/router.ts:880`; `/v1/chat/completions` and `/v1/models` are mounted in `server/api/router.ts:885` and `server/api/router.ts:886`.
- `gatewayStatusHandler` returns config version, LiteLLM URL, model count, circuit state, route override, cost headline, and health recommendations in `server/api/gateway.ts:350`, `server/api/gateway.ts:351`, `server/api/gateway.ts:354`, and `server/api/gateway.ts:356`.
- `gatewayHealthSummary` derives open-circuit, high-error-rate, and high-latency recommendations from circuit state and the ledger in `server/api/gateway.ts:71`, `server/api/gateway.ts:74`, `server/api/gateway.ts:75`, `server/api/gateway.ts:99`, `server/api/gateway.ts:112`, and `server/api/gateway.ts:122`.
- Circuit reset/half-open actions mutate state and write audit rows in `server/api/gateway.ts:394`, `server/api/gateway.ts:401`, and `server/api/gateway.ts:402`; route-healthiest selects a candidate and audits a route override in `server/api/gateway.ts:527`, `server/api/gateway.ts:544`, `server/api/gateway.ts:546`, and `server/api/gateway.ts:555`.
- Gateway runtime has in-process circuit breakers and route override TTLs in `server/gateway/router.ts:8`, `server/gateway/router.ts:18`, `server/gateway/router.ts:30`, `server/gateway/router.ts:129`, and `server/gateway/router.ts:138`.
- The OpenAI-compatible path requires a gateway key or operator token, enforces model allowlists and daily key caps, and audits denials in `server/api/gateway.ts:665`, `server/api/gateway.ts:671`, `server/api/gateway.ts:674`, `server/api/gateway.ts:678`, `server/api/gateway.ts:697`, `server/api/gateway.ts:700`, `server/api/gateway.ts:721`, and `server/api/gateway.ts:724`.
- Gateway keys are implemented server-side: list/create/revoke endpoints in `server/api/gatewayKeys.ts:52`, `server/api/gatewayKeys.ts:60`, and `server/api/gatewayKeys.ts:101`; plaintext keys use prefix `gwk_`, are hashed, allowlisted, daily-capped, tenant-scoped, and revocable in `server/gateway/keys.ts:7`, `server/gateway/keys.ts:42`, `server/gateway/keys.ts:84`, `server/gateway/keys.ts:113`, `server/gateway/keys.ts:116`, `server/gateway/keys.ts:168`, and `server/gateway/keys.ts:180`.
- Ledger writes persist every gateway call to `gateway_calls` and also create `cost_events` rows when usage/cost exists in `server/gateway/ledger.ts:39`, `server/gateway/ledger.ts:47`, `server/gateway/ledger.ts:70`, and `server/gateway/ledger.ts:84`.

## 2. Gaps, mock & broken parts
- The page is marked experimental in `app/lib/navRegistry.ts:40`, so it is not yet positioned as a sellable core gateway.
- Gateway key management exists in backend routes `server/api/router.ts:867`, `server/api/router.ts:870`, and `server/api/router.ts:875`, but the current `GatewayPage` ends with recent calls in `app/routes/GatewayPage.tsx:481` and has no credential lifecycle UI.
- Actions are direct endpoint posts from `app/routes/GatewayPage.tsx:153` rather than fully mediated by the generic executor/action descriptor pattern used elsewhere; they are audited server-side, but the UX lacks confirm modals, required operator reason, and visible rollback.
- Circuit state and route override are in process memory in `server/gateway/router.ts:18` and `server/gateway/router.ts:30`; restart loses them, which is acceptable for transient routing but should be labeled and optionally persisted for enterprise tenants.
- The gateway recommendations are rule-based only in `server/api/gateway.ts:99`; they do not yet carry AI root-cause analysis from `server/insights/ai.ts`.
- Gateway and cost depend on real spend data, but the cluster still contains known mocks in `server/api/cost.ts:332`, `server/api/cost.ts:478`, and `app/routes/CostPage.tsx:187`; gateway showback is real, but the standalone FinOps story is undermined until `/cost` is fixed.

## 3. Goal alignment (G1–G8)
- G1: promote from experimental only after key UI, confirm flows, empty states, and mobile layout are operator-ready.
- G2: create/revoke keys, set model allowlists, set daily caps, run probes, reset/half-open circuits, route healthiest, and export evidence from GUI.
- G3: every visible metric must come from `gateway_calls`, `cost_events`, real key rows, or live proxy status; no mixed mock cost.
- G4: gateway should detect open circuits, high error rate, high latency, budget stops, key cap stops, stale keys, and unexpected paid fallback.
- G5: one obvious cockpit: health, traffic, keys, budgets, routes, incidents, traces, and audit all linked.
- G6: safe probe can be automatic; circuit reset/route override/key revoke require Apply and reason; budget stops should block automatically.
- G7: recommendation banner must show AI root cause and recommended action before circuit/ledger details.
- G8: this is the standalone AI Gateway product module, not an internal debug page.

## 4. Best-practice research
- AI gateway pattern: expose one OpenAI-compatible endpoint, virtual keys, model allowlists, per-key budgets, audit logs, routing, fallback, guardrails, and cost tracking as first-class controls.
- LiteLLM pattern: virtual keys and spend controls are a core proxy-management primitive; the product should match that expectation while keeping logical model names only.
- Reliability pattern: SRE consoles put golden signals first: traffic, errors, latency, saturation, plus current mitigations and rollback.
- FinOps pattern: showback by model, caller, key, tenant, project, and cost basis; anomaly management must detect, clarify, alert, and drive remediation.
- Observability pattern: every row should link to traces and audit evidence, not just raw ledger rows.
- Security pattern: credentials are never re-shown after creation; key rotation/revocation is audited and can be required by stale-key detectors.

## 5. Target design
- IA: Gateway Overview, Routes & Models, Credentials, Budgets & Showback, Reliability, Call Ledger, Audit.
- Top band: health score, calls, success rate, p95 latency, estimated spend, budget status, open circuits, active override.
- Credentials tab: key list, create key modal, one-time secret display, model allowlist picker, daily cap, last used, revoke, rotate.
- Reliability tab: circuit table, AI recommendation panel, probe history, route override timeline, "why action is safe/risky", rollback hint.
- Ledger tab: filter by model, caller, key, trace ID, status, cost basis; CSV export stays but adds date/window filters.
- AI first: recommendation card above all action controls: root cause, confidence, evidence refs, blast radius, action. Raw ledger rows sit below.
- Actions: safe probes can auto-run when a circuit opens; reset/half-open/route-healthiest/key revoke use confirm modal with reason; key creation has scoped defaults and copy-once UX.
- Mobile: tabbed sections become stacked panels; every action button is 44px+; ledger becomes expandable cards.

## 6. Features to add (prioritized)
- MUST: Add gateway key management UI; acceptance: list/create/copy-once/revoke keys with allowlist and daily cap, all audited.
- MUST: Add confirm/reason/rollback UX for route-healthiest and circuit actions; acceptance: no risky mutation fires from a one-click inline button without context.
- MUST: Promote gateway out of experimental only when key management and action UX are ready; acceptance: `navRegistry` marks it stable and docs describe it as the gateway cockpit.
- MUST: Link every recommendation and ledger row to `/traces`, `/cost`, `/insights`, and `/audit`; acceptance: trace_id and action rows are navigable.
- SHOULD: Add persisted route override history in `system_configs`/`config_changes` or a small override table; acceptance: restarts do not erase operator evidence.
- SHOULD: Add stale-key detector and key budget detector; acceptance: stale keys create `/insights` findings with revoke/rotate actions.
- SHOULD: Add per-key and per-tenant rate limits; acceptance: exceeded limits return structured 429 and audit rows.
- EXTRA: Add "route simulator"; acceptance: operator can preview which model would receive a request and expected cost/latency before applying.
- EXTRA: Add live traffic pulse with small sparkline per logical model and a cost-saved counter.

## 7. Sellable-in-parts
- Standalone pitch: "A self-hosted AI gateway with virtual keys, model routing, reliability controls, FinOps showback, and auditable one-click remediation."
- Buyer value: platform teams can centralize LLM access, control spend, isolate outages, and prove governance without exposing raw provider credentials.
- Suite fit: `/gateway` is the runtime control plane; `/models` governs model inventory; `/litellm` shows proxy config; `/cost` handles budgets and recommendations; `/traces` provides request evidence; `/feature-flags` can safely roll out routing behavior.

## 8. Backend work
- Surface existing `GET/POST /api/gateway/keys` and `POST /api/gateway/keys/:id/revoke` in UI; keep one-time plaintext handling from `createGatewayKey`.
- Add `POST /api/gateway/keys/:id/rotate` as create-new-and-revoke-old workflow; write `action_audit`.
- Add gateway action descriptors for `gateway.circuit.reset`, `gateway.circuit.half-open`, `gateway.probe`, `gateway.route-healthiest`, `gateway.key-created`, `gateway.key-revoked`, and future rotate.
- Add optional persisted route override history using existing `system_configs`/`config_changes` or a narrow `gateway_route_overrides` table.
- Add gateway detectors: stale key, key daily cap reached, global budget stop, unexpected paid fallback, high p95 latency, high error rate, open circuit.
- Add AI analysis hook so `gatewayHealthSummary` recommendations can be enriched or mirrored as insights without blocking the page.
- Documentation to update during implementation: gateway operator docs, API key onboarding docs, `/root/DASHBOARD_V5_PLAN.md`, logical model naming docs, and audit/action catalog.

## 9. Build slices
- Slice 1: Credentials read UI in `app/routes/GatewayPage.tsx` using existing `gatewayKeys` endpoints; validate list with tenant scoping tests.
- Slice 2: Key create/revoke UI with copy-once secret, allowlist, daily cap, confirm, and audit; validate `server/gateway/keys.test.ts` plus Playwright.
- Slice 3: Action UX hardening for probe/circuit/route-healthiest; validate reasons, disabled states, audit rows, rollback hints, and mobile.
- Slice 4: Deep links from ledger/recommendations to traces, cost, insights, and audit; validate URL filters and empty states.
- Slice 5: Gateway detectors and AI reasoning bridge; validate scanner unit tests, insight creation, and auto-resolution.

## 10. Verification
- Gateway page no longer marked experimental after key UI and action hardening ship.
- An operator can create a scoped `gwk_` key, use it against `/v1/chat/completions`, see ledger/cost rows, and revoke it from GUI.
- Model allowlist denial, key daily cap stop, global budget stop, open circuit, route-healthiest, and probe all create audit evidence.
- AI recommendation appears before raw circuit/ledger data for degraded gateway states.
- `/gateway`, `/models`, `/cost`, `/traces`, `/insights`, and `/audit` share consistent trace IDs, model names, caller/key identity, and cost basis.
- `bun run typecheck`, gateway/key tests, ephemeral smoke for `/api/gateway/status`, `/api/gateway/keys`, `/v1/models`, and mobile/desktop Playwright checks pass.
- Documentation explains key issuance, rotation, budgets, routing, audit, and logical model names.

