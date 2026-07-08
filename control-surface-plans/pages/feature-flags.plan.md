# /feature-flags — Product Plan
> One-line: a new feature-flag control plane for safely rolling out, targeting, auditing, and cleaning up product and gateway behavior without deployments.

## 1. Today (verified, with file:line)
- Frontend: no `/feature-flags` route exists in the current route table; `app/App.tsx` imports route pages at `app/App.tsx:4` through `app/App.tsx:43`, and the registered routes from `app/App.tsx:76` through `app/App.tsx:205` do not include `/feature-flags`. Current readiness: 🆕 new page, not implemented.
- Navigation: `NAV_REGISTRY` lists known routes from `app/lib/navRegistry.ts:15` through `app/lib/navRegistry.ts:53`; `/feature-flags` is absent, so `getRouteStatus()` would default it to labs in `app/lib/navRegistry.ts:55`.
- Backend: no feature flag API routes are mounted near the gateway/cost/router sections; `server/api/router.ts:844` through `server/api/router.ts:883` covers gateway and cost alias, and `server/api/router.ts:1397` through `server/api/router.ts:1409` covers cost management, with no feature-flag endpoints.
- Schema: `server/db/dashboard.ts` includes many admin tables, including `action_audit` in `server/db/dashboard.ts:148`, `events` in `server/db/dashboard.ts:134`, `system_configs`/config history in the observability DB at `server/db/observability.ts:121` and `server/db/observability.ts:129`, and gateway/cost tables in `server/db/dashboard.ts:715` and `server/db/dashboard.ts:891`, but no `feature_flags` table is present in the inspected schema.
- Product context: V5 Phase 15 explicitly calls for a new `/feature-flags` page; it should include boolean toggles, percentage rollouts, user/tenant segmentation, audit history, stale flag detection, and correlation with insights.

## 2. Gaps, mock & broken parts
- The page, route, nav item, backend handlers, schema, detectors, and action descriptors do not exist.
- There is no safe GUI for rolling out new gateway behavior, experimental admin pages, model-routing changes, or UI modules by tenant/user/percentage.
- There is no stale-feature-flag detector, even though V5 Phase 12 and Phase 15 call for one.
- Existing config storage could be misused for flags, but that would hide ownership, rollout, targeting, expiry, and audit semantics; a real flag model is needed.
- Cross-module warning: feature flags should not mask the known cost mocks in `server/api/cost.ts:332`, `server/api/cost.ts:478`, and `app/routes/CostPage.tsx:187`; the flags page controls rollout, not fake data.

## 3. Goal alignment (G1–G8)
- G1: reduce release risk by enabling controlled rollout and instant rollback from GUI.
- G2: flag creation, targeting, percentage rollout, kill switch, archive, and cleanup must be GUI-able.
- G3: flags must be real, evaluated by backend/frontend code paths, persisted, tenant-scoped, and audited.
- G4: detect stale flags, unsafe permanent flags, flags without owner, flags past expiry, and incidents correlated with recent flag changes.
- G5: one obvious place to see active experiments, risky flags, owners, blast radius, and cleanup work.
- G6: low-risk flag cleanup suggestions can auto-create findings; toggles and rollout changes require Apply with reason.
- G7: each risky/stale flag finding gets AI reasoning before raw metadata.
- G8: this becomes a sellable release-governance module and supports the wider admin center.

## 4. Best-practice research
- OpenFeature pattern: use a vendor-neutral evaluation API and consistent flag semantics so in-house flags do not lock application code to one storage implementation.
- Release governance pattern: every flag has owner, description, type, default, environments, targeting, rollout percentage, expiry, and cleanup task.
- Progressive delivery pattern: staged rollout, kill switch, metrics guardrail, automatic rollback suggestion when errors/cost spike after a flag change.
- Audit pattern: flag changes are high-impact config changes; write who/what/why/before/after and link to incidents.
- Flag-debt pattern: stale flags should be automatically detected and converted into cleanup work.

## 5. Target design
- IA: Overview, Active Flags, Rollouts, Targeting, Flag History, Stale Flags, Integrations.
- Header: active flags, risky flags, stale flags, recent changes, incidents correlated in 24h, flags without owner.
- Flag table: key, state, type, owner, default, rollout, target segments, expiry, linked services/routes, last changed, risk.
- Detail drawer: flag metadata, targeting rules, evaluation preview, change history, related traces/cost/insights/audit, cleanup checklist.
- Create/edit flow: choose boolean/string/number/JSON, default, environments, tenant/user/project segments, percentage rollout, owner, expiry, reason.
- AI first: stale/risky flag cards explain why it matters, blast radius, recommended cleanup/rollback, confidence, and evidence.
- Actions: enable/disable, set rollout %, pause rollout, rollback, archive, create cleanup issue/insight; all through audited executor.
- Mobile: table collapses to flag cards with 44px toggles and an explicit confirm sheet.

## 6. Features to add (prioritized)
- MUST: Add `/feature-flags` route, nav registration, and read-only flag list; acceptance: page loads with empty/loading/error states.
- MUST: Add `feature_flags` and `feature_flag_changes` schema; acceptance: flags are tenant-scoped, owned, typed, versioned, and auditable.
- MUST: Add flag evaluation API/server helper; acceptance: backend and frontend can evaluate flags consistently by tenant/user/context.
- MUST: Add create/edit/toggle/archive UI with reason and audit; acceptance: every mutation writes `action_audit` and flag history.
- MUST: Add stale flag detector; acceptance: old fully-rolled-out or expired flags create `/insights` findings.
- SHOULD: Add percentage and segment targeting; acceptance: preview shows whether a sample tenant/user receives the flag.
- SHOULD: Add rollout guardrails tied to gateway/cost/traces; acceptance: recent flag changes show correlated errors/spend/latency.
- SHOULD: Add OpenFeature-compatible provider facade; acceptance: application code can consume flags through a stable interface.
- EXTRA: Add "safe rollout wizard" that starts at 1%, watches metrics, and recommends next step.
- EXTRA: Add visual blast-radius map for routes/services/tenants affected by a flag.

## 7. Sellable-in-parts
- Standalone pitch: "A self-hosted feature flag and release governance center with targeting, audit, stale-flag cleanup, and AI-assisted rollback decisions."
- Buyer value: teams can ship changes safely, control experiments, reduce flag debt, and prove who changed behavior when incidents happen.
- Suite fit: flags control gateway/admin features; changes become audit events; regressions become insights; traces/cost show correlated impact.

## 8. Backend work
- Add schema in `server/db/dashboard.ts`: `feature_flags`, `feature_flag_rules`, `feature_flag_changes`, optionally `feature_flag_evaluations` sampled for debugging.
- Add API module `server/api/featureFlags.ts`: `GET /api/feature-flags`, `POST /api/feature-flags`, `GET /api/feature-flags/:key`, `PUT /api/feature-flags/:key`, `POST /api/feature-flags/:key/toggle`, `POST /api/feature-flags/:key/archive`, `POST /api/feature-flags/:key/evaluate`.
- Add evaluation helper `server/feature-flags/evaluate.ts` and frontend hook for UI gating; prefer OpenFeature-like semantics.
- Add executor actions: `feature-flag:create`, `feature-flag:update`, `feature-flag:toggle`, `feature-flag:rollback`, `feature-flag:archive`.
- Add detectors: stale flag, owner missing, expired flag active, high-risk flag changed without approval, regression after flag change.
- Add event markers so flag changes appear in `/traces`, `/gateway`, `/cost`, `/insights`, and `/audit`.
- Documentation to update during implementation: feature flag operator docs, developer integration docs, OpenFeature semantics note, action catalog, `/root/DASHBOARD_V5_PLAN.md`.

## 9. Build slices
- Slice 1: Schema, API read/list, route/nav shell; validate empty state and tenant scoping.
- Slice 2: Create/edit/toggle/archive mutations with audit and history; validate focused API tests.
- Slice 3: Evaluation helper and frontend hook; validate deterministic percentage rollout and segment targeting.
- Slice 4: Flag detail drawer with history, preview, and linked audit/events; validate desktop/mobile.
- Slice 5: Stale flag detector and AI reasoning; validate scanner unit tests and insight deep-links.
- Slice 6: Correlation with traces/gateway/cost and rollout wizard; validate event markers and guardrail recommendations.

## 10. Verification
- `/feature-flags` is registered in `app/App.tsx`, listed in `NAV_REGISTRY`, and grouped with admin/release governance.
- A flag can be created, targeted to a tenant/user/percentage, evaluated, toggled, rolled back, archived, and audited from GUI.
- Flag evaluations are deterministic for percentage rollout and respect tenant/user context.
- Stale/expired/ownerless flags generate AI-reasoned insights with cleanup actions.
- Recent flag changes appear as event markers in traces/gateway/cost views and as rows in `/audit`.
- Mobile view has no hover-only controls and all toggles/actions are 44px+.
- `bun run typecheck`, focused feature flag API/evaluator tests, scanner tests, ephemeral smoke for `/api/feature-flags`, and Playwright checks pass.
- Documentation shows developer integration, operator workflow, stale-flag cleanup, and rollback policy.

