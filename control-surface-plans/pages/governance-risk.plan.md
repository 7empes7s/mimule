# /governance/risk — Product Plan
> One-line: AI Governance, Risk & Compliance dashboard for operators who need model risk, policy gates, evidence, drift, and AI-risk remediation.

## 1. Today (verified, with file:line)
- 🔴 new/missing page: there is no `/governance/risk` route registered today; `App.tsx` imports `GovernancePage`, `SecurityPage`, and `CompliancePage`, registers `/governance`, `/security`, and `/compliance`, but no risk page (`app/App.tsx:24`, `app/App.tsx:30`, `app/App.tsx:40`, `app/App.tsx:122`, `app/App.tsx:173`, `app/App.tsx:212`).
- Nav readiness has `/governance` and `/compliance` as labs, `/security` as core, and no `/governance/risk` entry (`app/lib/navRegistry.ts:19`, `app/lib/navRegistry.ts:42`, `app/lib/navRegistry.ts:43`, `app/lib/navRegistry.ts:53`).
- V5 says `/governance/risk` is intended as the AI Governance, Risk & Compliance route and must resolve the three-way governance naming collision (`/root/DASHBOARD_V5_PLAN.md:58`, `/root/DASHBOARD_V5_PLAN.md:164`, `/root/DASHBOARD_V5_PLAN.md:174`, `/root/DASHBOARD_V5_PLAN.md:335`, `/root/DASHBOARD_V5_PLAN.md:342`).
- There is no AI-GRC-specific DB table in the current schema; reusable existing tables include `gateway_calls`, `provider_price_catalog`, `spend_anomalies`, `insights`, `ai_analysis`, `agents`, builder/eval/reasoner tables, and governance/audit tables (`server/db/dashboard.ts:715`, `server/db/dashboard.ts:921`, `server/db/dashboard.ts:938`, `server/db/dashboard.ts:954`, `server/db/dashboard.ts:979`, `server/db/dashboard.ts:999`, `server/db/dashboard.ts:750`, `server/db/dashboard.ts:766`, `server/db/dashboard.ts:148`).
- The existing `InsightDomain` type and DB check allow only `cost`, `security`, `build`, `data`, and `ops`; there is no `grc` or `ai-risk` domain today (`server/insights/types.ts:3`, `server/db/dashboard.ts:956`).
- The ops/detection engine is `server/insights`, not `server/governance`: scheduler runs aggregate, security, registry, budget, anomaly, sentinel incident, and ops scanners, then AI enrichment and auto-apply (`server/insights/scheduler.ts:1`, `server/insights/scheduler.ts:3`, `server/insights/scheduler.ts:4`, `server/insights/scheduler.ts:5`, `server/insights/scheduler.ts:6`, `server/insights/scheduler.ts:7`, `server/insights/scheduler.ts:8`, `server/insights/scheduler.ts:69`, `server/insights/scheduler.ts:75`).
- AI reasoning is already available for insights: `ai.ts` stores summary, root cause, recommended action, confidence, model, and generated timestamp, using logical model `editorial-heavy` (`server/insights/ai.ts:6`, `server/insights/ai.ts:9`, `server/insights/ai.ts:10`, `server/insights/ai.ts:11`, `server/insights/ai.ts:12`, `server/insights/ai.ts:13`, `server/insights/ai.ts:19`, `server/insights/ai.ts:20`).
- AI analysis is cached by signature/sourceKey+severity and re-analysis can be forced through insights (`server/insights/ai.ts:46`, `server/insights/ai.ts:47`, `server/insights/ai.ts:71`, `server/api/insights.ts:98`, `server/api/insights.ts:105`).
- Auto-apply is deliberately tiny: only `start-job:model-health:all` is in `SAFE_AUTO_ACTIONS`; all other model/gateway/service/policy changes remain review-tier (`server/insights/autoapply.ts:7`, `server/insights/autoapply.ts:12`, `server/insights/autoapply.ts:14`, `server/insights/autoapply.ts:23`, `server/insights/autoapply.test.ts:5`, `server/insights/autoapply.test.ts:12`).
- Existing cost/model risk signals include spend anomalies and model swap recommendations from `spend_anomalies` and `provider_price_catalog`, both converted into cost insights (`server/insights/aggregate.ts:66`, `server/insights/aggregate.ts:70`, `server/insights/aggregate.ts:92`, `server/insights/aggregate.ts:111`, `server/insights/aggregate.ts:115`, `server/insights/aggregate.ts:146`).
- Existing operational model risk signals include provider outage, stale model discovery, cooldown pileups, blocked models, and doctor error spikes from model health/doctor sources (`server/insights/scanners/ops.ts:162`, `server/insights/scanners/ops.ts:165`, `server/insights/scanners/ops.ts:182`, `server/insights/scanners/ops.ts:200`, `server/insights/scanners/ops.ts:216`, `server/insights/scanners/ops.ts:234`).
- Gateway/model telemetry exists in `gateway_calls` with logical model, resolved model, backend, tier, tokens, latency, cost estimate, success, error class, trace, and caller (`server/db/dashboard.ts:715`, `server/db/dashboard.ts:718`, `server/db/dashboard.ts:719`, `server/db/dashboard.ts:720`, `server/db/dashboard.ts:721`, `server/db/dashboard.ts:722`, `server/db/dashboard.ts:724`, `server/db/dashboard.ts:725`, `server/db/dashboard.ts:726`, `server/db/dashboard.ts:727`, `server/db/dashboard.ts:728`, `server/db/dashboard.ts:729`).
- Agent inventory has risk tier, model access, aliases, owner, purpose, status, and tenant ID, which can seed model/agent risk views (`server/db/dashboard.ts:999`, `server/db/dashboard.ts:1002`, `server/db/dashboard.ts:1003`, `server/db/dashboard.ts:1004`, `server/db/dashboard.ts:1005`, `server/db/dashboard.ts:1006`, `server/db/dashboard.ts:1007`, `server/db/dashboard.ts:1008`).
- Builder doctor reports include `security_json`, `performance_json`, `accessibility_json`, `runtime_json`, overall score, verdict, and evidence JSON, which can support model/build quality gates (`server/db/dashboard.ts:414`, `server/db/dashboard.ts:422`, `server/db/dashboard.ts:424`, `server/db/dashboard.ts:425`, `server/db/dashboard.ts:426`, `server/db/dashboard.ts:427`, `server/db/dashboard.ts:428`, `server/db/dashboard.ts:429`).
- Reasoner diagnoses/incidents already store failure class, root cause, suggested actions, confidence, and incident occurrence counts; aggregate converts them into `domain:"build"` insights (`server/db/dashboard.ts:750`, `server/db/dashboard.ts:755`, `server/db/dashboard.ts:756`, `server/db/dashboard.ts:758`, `server/db/dashboard.ts:759`, `server/db/dashboard.ts:766`, `server/db/dashboard.ts:773`, `server/insights/aggregate.ts:182`, `server/insights/aggregate.ts:211`, `server/insights/aggregate.ts:262`).
- Access-control governance is separate from risk detection: `/governance` uses policy/rbac/secrets/budgets/approvals/retention modules, and its policy evaluator is YAML/JSON first-match logic, not an AI risk engine (`server/api/governance.ts:1`, `server/api/governance.ts:5`, `server/api/governance.ts:6`, `server/api/governance.ts:7`, `server/governance/policy.ts:32`, `server/governance/policy.ts:63`).
- The master plan's Phase 16 currently mentions OPA/Rego as an example, but the real code does not implement OPA; any `/governance/risk` plan must build on the current YAML/JSON evaluator and insights engine until a real policy engine is added (`/root/DASHBOARD_V5_PLAN.md:337`, `/root/DASHBOARD_V5_PLAN.md:338`, `server/governance/policy.ts:63`, `server/governance/policy.ts:87`).

## 2. Gaps, mock & broken parts
- The page and API do not exist, so any current UI claim about AI model risk/fairness/compliance would be fabricated (`app/App.tsx:173`, `app/App.tsx:212`, `app/lib/navRegistry.ts:15`, `server/api/router.ts:952`, `server/api/router.ts:1452`).
- There is no current model-risk scanner in `server/insights/scanners`; scheduler imports security, registry, budget, anomaly, sentinel, and ops scanners only (`server/insights/scheduler.ts:3`, `server/insights/scheduler.ts:4`, `server/insights/scheduler.ts:5`, `server/insights/scheduler.ts:6`, `server/insights/scheduler.ts:7`, `server/insights/scheduler.ts:8`).
- There is no first-class `grc` insight domain; adding it requires coordinated TypeScript and SQLite migration, otherwise initial risk findings must use existing domains with `sourceKey:"ai-grc:*"` (`server/insights/types.ts:3`, `server/db/dashboard.ts:956`, `server/insights/store.ts:97`).
- No existing schema stores fairness metrics, bias slices, SHAP/LIME artifacts, adversarial scan results, model cards, or AI-GRC reports; the closest existing sources are gateway calls, provider price catalog, agents, builder doctor reports, reasoner diagnoses, and insights (`server/db/dashboard.ts:715`, `server/db/dashboard.ts:921`, `server/db/dashboard.ts:999`, `server/db/dashboard.ts:414`, `server/db/dashboard.ts:750`, `server/db/dashboard.ts:954`).
- The existing policy mechanism cannot enforce declarative Rego/OPA policies; it loads YAML/JSON and compares event names/conditions, so "OPA" must not appear as current state (`server/governance/policy.ts:37`, `server/governance/policy.ts:43`, `server/governance/policy.ts:53`, `server/governance/policy.ts:63`, `server/governance/policy.ts:69`, `server/governance/policy.ts:72`).
- Admin Health does not include high-risk models yet; current score deductions include open critical/high/medium insights, product-health fails, security trust, and stale detector penalty (`server/insights/health.ts:63`, `server/insights/health.ts:71`, `server/insights/health.ts:72`, `server/insights/health.ts:73`, `server/insights/health.ts:74`, `server/insights/health.ts:75`, `server/insights/health.ts:77`).
- Security page does not cover AI model risk; it covers security-domain insights and a trust score, and its scanner checks secrets/audit/owners/policies/budgets only (`app/routes/SecurityPage.tsx:200`, `server/api/security.ts:32`, `server/insights/scanners/security.ts:42`, `server/insights/scanners/security.ts:73`, `server/insights/scanners/security.ts:105`, `server/insights/scanners/security.ts:134`, `server/insights/scanners/security.ts:170`).
- Compliance page does not cover AI model risk; it handles DPA, subprocessors, SOC2 mapping, tenant settings, reports, and audit/evidence bundle (`app/routes/CompliancePage.tsx:65`, `app/routes/CompliancePage.tsx:66`, `app/routes/CompliancePage.tsx:67`, `app/routes/CompliancePage.tsx:68`, `server/api/compliance.ts:8`, `server/api/compliance.ts:21`, `server/api/compliance.ts:29`, `server/api/compliance.ts:63`).
- The model inventory plan would be incomplete in a fresh environment unless it consumes discovery: current host inventory is fixed to MIMULE services/containers/timers, the scheduler lacks a discovery scanner, and current model-risk sources are only gateway/agent/build tables, so an unregistered `ollama`/`vllm`/OpenAI-compatible endpoint could run without appearing in AI GRC (`server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`, `server/insights/scheduler.ts:1`, `server/insights/scheduler.ts:8`, `server/db/dashboard.ts:715`, `server/db/dashboard.ts:999`).
- The route is missing from Admin Center nav grouping despite V5 requiring `GRC -> /governance/risk` (`app/lib/navRegistry.ts:15`, `/root/DASHBOARD_V5_PLAN.md:169`, `/root/DASHBOARD_V5_PLAN.md:174`).
- There is no evaluator job/executor action for GRC scans; executor supports services, timers, doctor scan, model-health, gateway route-healthiest, model quality mutation, and budget mutation, but no `grc` target (`server/api/execute.ts:102`, `server/api/execute.ts:130`, `server/api/execute.ts:145`, `server/api/execute.ts:157`, `server/api/execute.ts:168`, `server/api/execute.ts:192`, `server/api/execute.ts:204`, `server/api/execute.ts:235`).

## 3. Goal alignment (G1–G9)
- G1: Build a real route only after real sources are identified; empty states must be honest for fairness/XAI until actual artifacts exist.
- G2: Operators need GUI actions to scan a model, mark a model approved/blocked, generate a model risk report, open approval, and route traffic away from risky models.
- G3: No fake fairness metrics or SHAP plots. Start with real gateway/model/agent/build/security data, then add new schema only when an evaluator produces real results.
- G4: Detect model outage, stale discovery, blocked/degraded models, excessive agency/tool risk, model deployed without scan, performance drift, spend abuse, prompt/security failures, and missing approvals.
- G4: Discover unknown AI systems first, then treat unregistered processes, model ports, containers, CLIs, and shadow keys as AI-GRC risk inputs.
- G5: One model risk inventory, severity-sorted AI-GRC findings, model deep links, plain-language reason, and one Apply path.
- G6: Safe scans/report generation can auto-run; production routing/model-blocking needs Apply/approval.
- G7: AI risk reasoning comes before charts: "why this model is risky, likely cause, recommended action, confidence."
- G8: Make this the sellable AI GRC module while linking Access (`/governance`), Security (`/security`), Compliance (`/compliance`), Models (`/models`), Gateway (`/gateway`), and Insights (`/insights`).
- G9: The AI GRC module must be useful immediately in any environment, showing discovered/empty/connect states instead of assuming local LiteLLM, NewsBites, Vast, or MIMULE services exist.

## 4. Best-practice research
- Use NIST AI RMF's Govern/Map/Measure/Manage: Govern policies and accountability, Map context and impacts, Measure risks/quality, Manage remediation and monitoring: https://www.nist.gov/itl/ai-risk-management-framework.
- Use NIST AI RMF Playbook as control checklist inspiration, but map each control to real evidence in this repo: https://airc.nist.gov/airmf-resources/playbook/.
- Use OWASP Top 10 for LLM Applications 2025 for AI security risk categories: prompt injection, sensitive information disclosure, supply chain, model DoS, excessive agency, prompt leakage, vector/embedding weaknesses, misinformation, unbounded consumption: https://owasp.org/www-project-top-10-for-large-language-model-applications/.
- Use model risk management patterns: model inventory, owner, use case, data sensitivity, allowed tools, eval history, production status, drift/performance, incident history, approval gate, evidence report.
- "Great" for this page: model table sorted by risk, each model has risk score and top drivers, scans create findings, AI explains drivers, Apply can block/reroute/start eval, evidence report is one click.

## 5. Target design
- IA: `/governance/risk` titled "AI GRC"; tabs `Overview`, `Models`, `Risks`, `Policies`, `Evaluations`, `Reports`, `Audit`.
- Overview: AI Risk Score, high-risk models, unscanned production routes, drift/spend/security drivers, recent auto-resolves, Admin Health impact.
- Models: inventory built from `discovered_assets`, `gateway_calls.logical_model`, provider catalog, model health, agents `model_access`, and `/models` metadata; each row has source (`discovered|registered|gateway|agent`), owner, usage, cost, success/error, risk tier, last scan, approval state.
- AI Inventory: first-run view lists discovered AI processes, ports, containers, CLIs, model backends, and credential locations; unregistered assets show Register/Ignore/Re-scan actions before they can be approved as governed models.
- Risks: filtered insights with `sourceKey` prefix `ai-grc:*` or future `domain=grc`; cards use AI analysis first, then evidence.
- Policies: show current YAML/JSON access policy evaluator separately from AI GRC policies. Label current mechanism truthfully; future policy authoring uses dry-run/diff/approval.
- Evaluations: start scan, show status, link to builder doctor reports/evals if available, record result as insights/evidence.
- Reports: model risk report per logical model, using evidence from gateway calls, insights, AI analysis, audit rows, and compliance controls.
- Audit: show `action_audit` rows where target type is model/gateway/grc/policy and linked approval rows.
- Empty states: fairness/XAI panels explicitly say "No evaluator has produced fairness artifacts yet" and offer "Add evaluator" or "Run scan" only if real.
- Mobile: model rows collapse to cards with risk score and top two drivers; Apply buttons pinned to card footer.

## 6. Features to add (prioritized)
- MUST: Register route and nav. Acceptance: `/governance/risk` renders, Admin Center has GRC tab, no dead route.
- MUST: Read-only model risk inventory from real sources. Acceptance: model list uses `gateway_calls`, provider catalog, agents/model access, existing model health where available.
- MUST: Discovery-backed AI inventory. Acceptance: model inventory includes `discovered_assets` and standard findings for `unregistered-ai-system`, `exposed-model-endpoint`, and `shadow-api-key`; Register converts a discovered asset into a governed model/service with owner/criticality/tenant, Ignore requires reason, Re-scan refreshes fingerprint/evidence.
- MUST: AI-GRC insight view. Acceptance: risk findings are standard insights with AI analysis and evidence, not a new inbox.
- MUST: `server/insights/scanners/aiGrc.ts` initial scanner. Acceptance: detects unscanned active model, high error/cost drift, stale discovery, blocked production model, excessive agency proxy where evidence exists.
- MUST: GRC scan/report action. Acceptance: `start-job:ai-grc:<model>:scan` or equivalent creates audited job/report; safe scan can be Apply or auto-scheduled.
- MUST: Model approval gate. Acceptance: production promotion requires passing scan or explicit approval row; all decisions audited.
- SHOULD: AI RMF control mapping. Acceptance: Govern/Map/Measure/Manage controls each map to evidence and status.
- SHOULD: OWASP LLM risk mapping. Acceptance: security scanner findings map to OWASP categories and appear on model risk cards.
- EXTRA: "risk delta since last deploy" timeline; acceptance: shows model route/config/audit changes next to risk score changes.

## 7. Sellable-in-parts
- Standalone pitch: "AI GRC Center for self-hosted AI gateways: model inventory, risk scoring, OWASP/NIST mapping, scan gates, reports, and audited remediation."
- Suite fit: consumes gateway/model/security/compliance/access data, emits standard insights, contributes to Admin Health, and uses the existing executor/audit/approval path.
- Packaging boundary: sellable with only gateway telemetry + model inventory + scans + reports; optional integrations add fairness/XAI artifacts later.

## 8. Backend work
- Add frontend `app/routes/AIGovernancePage.tsx`, route registration in `app/App.tsx`, nav entry in `app/lib/navRegistry.ts`.
- Add `GET /api/governance/risk/overview`, `GET /api/governance/risk/models`, `POST /api/governance/risk/models/:model/scan`, `GET /api/governance/risk/reports/:id`.
- Add scanner `server/insights/scanners/aiGrc.ts` and wire it into `server/insights/scheduler.ts`.
- Add Phase 4a discovery infrastructure dependency: `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts`, `server/insights/scanners/discovery.ts`, `discovered_assets`, and `GET /api/discovery/assets` filters for AI-GRC model inventory.
- Initial storage: prefer `insights`, `ai_analysis`, `jobs`, `action_audit`, `gateway_calls`, `provider_price_catalog`, `agents`, `builder_doctor_reports`, `reasoner_diagnoses`. Add `ai_grc_reports` only when reports need durable structured fields beyond artifact JSON.
- De-hardcode `server/adapters/system.ts` so MIMULE-specific services, containers, and timers are seed hints merged with discovery, not the AI GRC inventory (`server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- Register/Ignore/Re-scan endpoints: reuse `POST /api/discovery/assets/:id/register`, `POST /api/discovery/assets/:id/ignore`, and `POST /api/discovery/rescan`; AI GRC registers discovered assets as governed model/service records and links them to reports/approvals.
- Decide insight taxonomy: either migrate `InsightDomain` to add `grc`, or use `domain:"security"`/`domain:"data"` plus `sourceKey:"ai-grc:*"` initially. If migrating, update `server/insights/types.ts`, `server/db/dashboard.ts` check constraints/migrations, tests, UI filters.
- Executor actions: `start-job:ai-grc:<model>:scan`, `mutate-policy:model:<model>:block`, `start-job:gateway:route-healthiest`, `generate-report:ai-grc:<model>`.
- AI hooks: use existing `enrichInsight` for findings; use `editorial-heavy` logical model for risk briefs and report summaries.
- Documentation the builder updates: `/root/DASHBOARD_V5_PLAN.md` Phase 16 correction (remove OPA-as-current wording), `/home/agent/MIMULE_MASTER_PLAN_V3.md`, and this plan with implemented route/API/scanner evidence.

## 9. Build slices
- Slice 1: Route shell + nav + honest empty overview. Files: `app/routes/AIGovernancePage.tsx`, `app/App.tsx`, `app/lib/navRegistry.ts`. Validate route renders.
- Slice 2: Read-only model inventory API. Files: `server/api/governanceRisk.ts` or `server/api/governance.ts`, `server/api/router.ts`, tests. Validate from seeded `gateway_calls`/`agents`.
- Slice 3: Initial AI-GRC scanner. Files: `server/insights/scanners/aiGrc.ts`, `server/insights/scheduler.ts`, `server/insights/insights.test.ts`. Validate insight rows and auto-resolve.
- Slice 4: AI-first risk cards. Files: `app/routes/AIGovernancePage.tsx`, `server/api/insights.ts` only if filtering support needed. Validate AI analysis display.
- Slice 5: Scan/report job action. Files: `server/api/execute.ts`, `server/api/actions.ts` catalog, risk API, page. Validate action audit.
- Slice 6: Model approval gate. Files: `server/governance/approvals.ts`, model/gateway promotion path, page. Validate high-risk approval path.

## 10. Verification
- `/governance/risk` exists, is linked from Admin Center, and has no fabricated data.
- Risk inventory rows can be traced to real `gateway_calls`, `agents`, provider/model data, or explicit empty states.
- AI-GRC scanner creates standard insights with `sourceKey:"ai-grc:*"` and AI analysis before evidence.
- G4/G9: an unknown AI process/port/container/CLI appears in AI GRC as a discovered unregistered asset and standard `unregistered-ai-system` insight; an exposed unauthenticated endpoint and unmanaged AI-provider key create `exposed-model-endpoint` and `shadow-api-key` risks; Register makes the asset part of the governed model inventory.
- G4/G9: on a host with none of MIMULE's services, `/governance/risk` renders an honest "no AI systems discovered yet / connect a backend" state without mock model rows, hardcoded MIMULE services, or crashes.
- Safe scans are audited; production-impacting actions require Apply/reason and approval when high risk.
- Admin Health includes model risk drivers after scanner work.
- Reports include evidence refs, audit rows, AI summary, model route history, and no backend model names beyond logical routing names.
- Mobile route passes no-overflow and ≥44px target checks.
