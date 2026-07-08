# /ratings — Product Plan
> One-line: the model quality, workload-fit, and routing confidence view for choosing safe logical models.

## 1. Today (verified, with file:line)
- `/ratings` is not registered as a route in `App.tsx`; the route list includes `/models`, `/about`, `/install`, `/channels`, `/reports`, and `/compliance`, but no `/ratings` (`app/App.tsx:121`-`app/App.tsx:198`).
- `/ratings` is not present in the nav registry (`app/lib/navRegistry.ts:15`-`app/lib/navRegistry.ts:53`).
- `app/routes/RatingsPage.tsx` exports `RatingsSection`, not a standalone page component (`app/routes/RatingsPage.tsx:120`-`app/routes/RatingsPage.tsx:287`).
- `ModelsPage` imports `RatingsSection` (`app/routes/ModelsPage.tsx:8`) and renders it inside `/models` after the model table, fallback chains, cooldowns, and discovery log (`app/routes/ModelsPage.tsx:274`-`app/routes/ModelsPage.tsx:300`).
- Data source is `/api/models` through `ModelsPage` (`app/routes/ModelsPage.tsx:37`-`app/routes/ModelsPage.tsx:40`), and model types include `rating100`, `ratingBreakdown`, and `workloadScores` (`server/api/types.ts:282`-`server/api/types.ts:319`).
- Ratings UI supports search, capability filter, sorting, comparison up to six models, ratings table, workload breakdown, confidence, pricing tier, latency, and quality status (`app/routes/RatingsPage.tsx:120`-`app/routes/RatingsPage.tsx:287`).
- Current readiness: 🧪 hidden/unregistered; the useful section exists under `/models`, but `/ratings` as a route is dead.

## 2. Gaps, mock & broken parts
- A direct visit to `/ratings` falls through to the default route because no route is registered (`app/App.tsx:200`-`app/App.tsx:202`).
- There is no nav entry, so users cannot discover ratings except through `/models` (`app/lib/navRegistry.ts:15`-`app/lib/navRegistry.ts:53`).
- Empty-state guidance tells the operator to run `systemctl start model-health-check.service` (`app/routes/RatingsPage.tsx:164`-`app/routes/RatingsPage.tsx:168`), violating the GUI-first goal because `/models` already has a health-check button (`app/routes/ModelsPage.tsx:145`-`app/routes/ModelsPage.tsx:148`).
- The ratings section is read-only; it does not explain whether a low rating blocks routing, needs probation, or should open a GRC review.
- No dedicated backend endpoint exists for rating history, benchmark provenance, or confidence explanations beyond `/api/models`.
- Cross-page blocker to call out: if model routing overrides move through settings, the known system config persistence gap must be fixed first (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: either register `/ratings` or intentionally remove the route promise; no dead page.
- G2: all model-rating refresh and remediation from GUI, no systemctl instructions.
- G3: ratings show provenance, freshness, and what data is missing.
- G4: low confidence, stale probes, drift, blocked models, and missing GRC scan create insights.
- G5: clear model ranking by workload and recommended routing action.
- G6: safe refresh runs automatically; manual health check/re-probe uses one button.
- G7: AI explains score, root cause of poor fit, and recommended routing action before raw components.
- G8: sell as "AI Model Quality & Routing Intelligence" module.

## 4. Best-practice research
- NIST AI RMF Govern/Map/Measure/Manage maps well to model ratings: govern policies, map use cases, measure performance/fairness, manage risks: https://www.nist.gov/itl/ai-risk-management-framework
- FinOps cost allocation/showback patterns support including price tier and workload cost in model-choice decisions: https://www.finops.org/wg/cloud-cost-allocation/
- Google SRE golden signals apply to model serving quality: latency, traffic, errors, saturation: https://sre.google/sre-book/monitoring-distributed-systems/
- Admin-center design should keep health and advisory history discoverable, not hidden in a subpanel: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health

## 5. Target design
- Product choice: either make `/ratings` a real route focused on model evaluation, or fold it intentionally into `/models` and redirect `/ratings` to `/models#ratings`.
- If real route: top recommended models by workload, score explanations, freshness, drift, benchmark provenance, routing impact, and comparison.
- Components: `ModelRatingSummary`, `WorkloadFitMatrix`, `ScoreExplanation`, `BenchmarkFreshness`, `RoutingImpactPanel`, `ProbeNowButton`.
- States: no ratings = GUI "Run health check" button, not CLI; stale ratings = warning; missing components = clear provenance list.
- Mobile parity: comparison cards instead of wide matrix; selected models drawer.
- AI reasoning appears before numbers: "best choice for coding/writing/reasoning", root cause for low score, recommended action.
- Actions: run health check, mark probation, block/unblock, and route-healthiest link to existing executor/model actions.

## 6. Features to add (prioritized)
- MUST: resolve dead route by registering `/ratings` or redirecting it to `/models#ratings`; acceptance: direct `/ratings` visit is intentional.
- MUST: replace systemctl empty-state text with a GUI health-check action.
- MUST: show score provenance/freshness and missing inputs.
- SHOULD: add rating history and drift trends from model-health snapshots or `metric_samples`.
- SHOULD: create insights for stale ratings, low confidence, and production model drift.
- SHOULD: link ratings to AI GRC (`/governance/risk`) when fairness/security scans exist.
- EXTRA: workload scenario simulator that recommends a logical model chain and expected cost/latency.

## 7. Sellable-in-parts
- Standalone pitch: "Model selection intelligence for AI gateways: quality, cost, latency, workload fit, and confidence."
- Suite fit: feeds `/models`, `/gateway`, `/cost`, `/governance/risk`, `/insights`, and `/settings` routing policy.
- It should preserve logical model names and never expose backend model names as the operator-facing contract.

## 8. Backend work
- Add `GET /api/models/ratings` only if `/api/models` becomes too heavy; otherwise keep ratings in `/api/models` and add history endpoints.
- Store rating snapshots in `metric_samples` or a new narrow `model_rating_samples` table only when history cannot fit metric samples.
- Add executor action for `models:probe-ratings:all` or reuse `/api/models/action` run-check.
- Add insight scanner for stale rating probes, low-confidence production models, drift, and blocked best model.
- Add AI explanation cache keyed by model/rating snapshot.

## 9. Build slices
- Slice 1: route decision: register `RatingsPage` wrapper or redirect `/ratings` to `/models#ratings`.
- Slice 2: GUI health-check action and better empty/stale states.
- Slice 3: provenance/freshness and rating history.
- Slice 4: insights/GRC links and workload simulator.
- Validation: `bun run typecheck`, models API tests, Playwright direct `/ratings` and `/models#ratings`.
- Documentation to update: model-rating methodology, logical model selection guide, `/root/DASHBOARD_V5_PLAN.md` Phase 16 model lifecycle notes.

## 10. Verification
- Direct `/ratings` is either a real page or a deliberate redirect; it never silently falls to home.
- Empty ratings can be fixed with a GUI button.
- Every score shows freshness, source, confidence, and missing components.
- Low/stale ratings create actionable insights with AI reasoning.
- Blocking/probation/routing actions remain audited through existing model action paths.
- Mobile comparison is usable without hidden hover interactions or horizontal scroll.
