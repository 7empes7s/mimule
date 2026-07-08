# /finance-intel — Product Plan
> One-line: the finance editorial intelligence module for portfolio-aware market analysis, article enrichment, and model/cost traceability.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `/finance-intel` is registered and nav marks it `advanced` plus `experimental` (`app/App.tsx:31`, `app/App.tsx:200`, `app/App.tsx:201`, `app/lib/navRegistry.ts:47`). Readiness: 🔴 mock-broken for mutations, 🟡 partial for read tables.
- The page tracks active tab, stats, runs, enrichments, configs, loading, and error state (`app/routes/FinanceIntelPage.tsx:66`, `app/routes/FinanceIntelPage.tsx:67`, `app/routes/FinanceIntelPage.tsx:68`, `app/routes/FinanceIntelPage.tsx:69`, `app/routes/FinanceIntelPage.tsx:70`, `app/routes/FinanceIntelPage.tsx:71`, `app/routes/FinanceIntelPage.tsx:72`, `app/routes/FinanceIntelPage.tsx:73`).
- On mount it GETs stats, runs, enrichments, and portfolio configs from the API (`app/routes/FinanceIntelPage.tsx:126`, `app/routes/FinanceIntelPage.tsx:128`, `app/routes/FinanceIntelPage.tsx:134`, `app/routes/FinanceIntelPage.tsx:146`, `app/routes/FinanceIntelPage.tsx:152`).
- It renders stats tiles for runs, enrichments, portfolios, and average milliseconds, and tabbed tables for runs/enrichments/configs (`app/routes/FinanceIntelPage.tsx:186`, `app/routes/FinanceIntelPage.tsx:190`, `app/routes/FinanceIntelPage.tsx:194`, `app/routes/FinanceIntelPage.tsx:198`, `app/routes/FinanceIntelPage.tsx:202`, `app/routes/FinanceIntelPage.tsx:222`, `app/routes/FinanceIntelPage.tsx:243`, `app/routes/FinanceIntelPage.tsx:279`, `app/routes/FinanceIntelPage.tsx:317`).
- Runs table displays date, id, duration, model, status, and insights count (`app/routes/FinanceIntelPage.tsx:250`, `app/routes/FinanceIntelPage.tsx:251`, `app/routes/FinanceIntelPage.tsx:252`, `app/routes/FinanceIntelPage.tsx:253`, `app/routes/FinanceIntelPage.tsx:254`, `app/routes/FinanceIntelPage.tsx:255`, `app/routes/FinanceIntelPage.tsx:261`, `app/routes/FinanceIntelPage.tsx:264`, `app/routes/FinanceIntelPage.tsx:266`, `app/routes/FinanceIntelPage.tsx:270`).
- Enrichments table displays article slug, date, model, ticker count, confidence, and status (`app/routes/FinanceIntelPage.tsx:286`, `app/routes/FinanceIntelPage.tsx:287`, `app/routes/FinanceIntelPage.tsx:288`, `app/routes/FinanceIntelPage.tsx:289`, `app/routes/FinanceIntelPage.tsx:290`, `app/routes/FinanceIntelPage.tsx:291`, `app/routes/FinanceIntelPage.tsx:297`, `app/routes/FinanceIntelPage.tsx:301`, `app/routes/FinanceIntelPage.tsx:302`, `app/routes/FinanceIntelPage.tsx:303`, `app/routes/FinanceIntelPage.tsx:305`).
- Config table displays name, risk tolerance, confidence threshold, watchlist count, and created date (`app/routes/FinanceIntelPage.tsx:324`, `app/routes/FinanceIntelPage.tsx:325`, `app/routes/FinanceIntelPage.tsx:326`, `app/routes/FinanceIntelPage.tsx:327`, `app/routes/FinanceIntelPage.tsx:328`, `app/routes/FinanceIntelPage.tsx:334`, `app/routes/FinanceIntelPage.tsx:335`, `app/routes/FinanceIntelPage.tsx:336`, `app/routes/FinanceIntelPage.tsx:337`, `app/routes/FinanceIntelPage.tsx:338`).
- The right panel shows editable-looking portfolio controls and manual trigger controls, including model-selection labels that name backend/vendor models in visible text (`app/routes/FinanceIntelPage.tsx:352`, `app/routes/FinanceIntelPage.tsx:363`, `app/routes/FinanceIntelPage.tsx:374`, `app/routes/FinanceIntelPage.tsx:384`, `app/routes/FinanceIntelPage.tsx:389`, `app/routes/FinanceIntelPage.tsx:397`, `app/routes/FinanceIntelPage.tsx:402`, `app/routes/FinanceIntelPage.tsx:414`, `app/routes/FinanceIntelPage.tsx:423`, `app/routes/FinanceIntelPage.tsx:424`, `app/routes/FinanceIntelPage.tsx:426`, `app/routes/FinanceIntelPage.tsx:430`).
- Backend uses a separate observability SQLite DB and initializes it if possible (`server/api/financeIntel.ts:1`, `server/api/financeIntel.ts:2`, `server/api/financeIntel.ts:6`, `server/api/financeIntel.ts:9`, `server/db/observability.ts:5`, `server/db/observability.ts:18`, `server/db/observability.ts:33`, `server/db/observability.ts:35`).
- Observability schema has real `finance_runs`, `portfolio_configs`, `scout_runs`, `litellm_routing_log`, and `finance_enrichments` tables, and seeds a default portfolio (`server/db/observability.ts:73`, `server/db/observability.ts:95`, `server/db/observability.ts:109`, `server/db/observability.ts:138`, `server/db/observability.ts:154`, `server/db/observability.ts:168`, `server/db/observability.ts:172`).
- API GETs query real tables for runs, enrichments, portfolio configs, routing logs, and stats (`server/api/financeIntel.ts:35`, `server/api/financeIntel.ts:49`, `server/api/financeIntel.ts:66`, `server/api/financeIntel.ts:80`, `server/api/financeIntel.ts:97`, `server/api/financeIntel.ts:111`, `server/api/financeIntel.ts:128`, `server/api/financeIntel.ts:139`, `server/api/financeIntel.ts:215`, `server/api/financeIntel.ts:227`, `server/api/financeIntel.ts:230`, `server/api/financeIntel.ts:233`).
- Portfolio config upsert exists as a POST handler and writes `portfolio_configs` (`server/api/financeIntel.ts:156`, `server/api/financeIntel.ts:157`, `server/api/financeIntel.ts:167`, `server/api/financeIntel.ts:184`, `server/api/financeIntel.ts:185`, `server/api/financeIntel.ts:189`, `server/api/financeIntel.ts:202`).
- Router mounts GET stats/runs/enrichments/configs and mutation-gates POST trigger/configs (`server/api/router.ts:819`, `server/api/router.ts:820`, `server/api/router.ts:821`, `server/api/router.ts:822`, `server/api/router.ts:823`, `server/api/router.ts:826`, `server/api/router.ts:827`, `server/api/router.ts:828`, `server/api/router.ts:831`, `server/api/router.ts:833`).
- Tests cover GET runs/enrichments/config/stats and POST config/trigger-analysis response shapes (`server/api/financeIntel.test.ts:44`, `server/api/financeIntel.test.ts:49`, `server/api/financeIntel.test.ts:70`, `server/api/financeIntel.test.ts:75`, `server/api/financeIntel.test.ts:94`, `server/api/financeIntel.test.ts:99`, `server/api/financeIntel.test.ts:111`, `server/api/financeIntel.test.ts:117`, `server/api/financeIntel.test.ts:132`, `server/api/financeIntel.test.ts:138`, `server/api/financeIntel.test.ts:153`, `server/api/financeIntel.test.ts:158`).

## 2. Gaps, mock & broken parts
- The manual analysis trigger endpoint is a placeholder: it explicitly says a real implementation would trigger actual analysis, but currently returns success and a random job id (`server/api/financeIntel.ts:263`, `server/api/financeIntel.ts:264`, `server/api/financeIntel.ts:266`, `server/api/financeIntel.ts:267`, `server/api/financeIntel.ts:268`, `server/api/financeIntel.ts:272`).
- The UI’s Save Configuration and Run Analysis buttons are not wired to `authFetch` or state handlers; they are plain buttons after uncontrolled/default inputs (`app/routes/FinanceIntelPage.tsx:363`, `app/routes/FinanceIntelPage.tsx:374`, `app/routes/FinanceIntelPage.tsx:384`, `app/routes/FinanceIntelPage.tsx:389`, `app/routes/FinanceIntelPage.tsx:397`, `app/routes/FinanceIntelPage.tsx:414`, `app/routes/FinanceIntelPage.tsx:423`, `app/routes/FinanceIntelPage.tsx:430`).
- Visible model labels name backend/vendor models rather than only logical model names, conflicting with the logical-name routing rule (`app/routes/FinanceIntelPage.tsx:423`, `app/routes/FinanceIntelPage.tsx:424`, `app/routes/FinanceIntelPage.tsx:425`, `app/routes/FinanceIntelPage.tsx:426`).
- Zero-config gap: the module has a DB and tables, but no discovery of finance data sources, market APIs, FRED keys, article corpus, portfolio/watchlist source, spend sources, or model backends (`server/api/financeIntel.ts:6`, `server/db/observability.ts:73`, `server/db/observability.ts:79`, `server/db/observability.ts:80`, `server/db/observability.ts:81`, `server/db/observability.ts:95`).
- Fresh environments seed a default portfolio, which can make the module look configured even if no finance data source or registered publishing corpus exists (`server/db/observability.ts:168`, `server/db/observability.ts:169`, `server/db/observability.ts:172`, `server/db/observability.ts:174`, `app/routes/FinanceIntelPage.tsx:198`, `app/routes/FinanceIntelPage.tsx:365`).
- No action audit is written by `upsertPortfolioConfig` or `triggerAnalysis`, even though router mutation-gates the endpoints (`server/api/router.ts:827`, `server/api/router.ts:828`, `server/api/financeIntel.ts:156`, `server/api/financeIntel.ts:202`, `server/api/financeIntel.ts:263`, `server/api/financeIntel.ts:268`).
- Stats report `avgDurationMs: 0` instead of calculating from runs (`server/api/financeIntel.ts:236`, `server/api/financeIntel.ts:241`, `server/api/financeIntel.ts:244`, `app/routes/FinanceIntelPage.tsx:202`).
- There is no AI reasoning panel before run/enrichment records, despite the page being an insights-producing intelligence surface (`app/routes/FinanceIntelPage.tsx:212`, `app/routes/FinanceIntelPage.tsx:245`, `app/routes/FinanceIntelPage.tsx:281`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).

## 3. Goal alignment (G1–G8)
- G1/G3: remove placeholder success paths or clearly disable until real analysis is wired.
- G2/G6: portfolio save and run analysis must be real GUI actions with audit/jobs.
- G4/G9: discover finance sources, article corpus, API keys, portfolios, spend sources, and model dependencies.
- G5/G7: show AI investment/editorial rationale and caveats before tables.
- G8: make this a sellable “Finance Intelligence” module, not a demo dashboard.

## 4. Best-practice research
- Research basis: NIST AI RMF supports mapping finance data/model dependencies and managing risk; Google SRE monitoring supports data-source latency/error/freshness views; Microsoft HAX supports AI confidence, error recovery, and human override; OWASP LLM Top 10 supports controls for financial model endpoints, tool calls, sensitive data, and excessive agency (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use FinOps/data-product patterns: source health, data freshness, run lineage, model used, cost, and confidence.
- Use portfolio-workbench UX: watchlist, risk, horizon, excluded sectors, analyst persona, and run scope are explicit inputs.
- Use analysis provenance: every insight links to articles, market data snapshot, model prompt/response, and audit/job id.
- Use clear compliance: label editorial intelligence, not investment advice; preserve source evidence and confidence.

## 5. Target design
- Header: connected data sources, article corpus status, last successful run, open findings, cost for finance runs.
- Main: AI “market/editorial brief” first, then run history, enrichments, portfolio configs, routing/cost provenance.
- Empty/fresh state: no sources discovered → connect market/news corpus; default portfolio should be labeled sample until configured.
- Discovery: detect market-data APIs/keys, FRED config, finance article corpus, portfolios/watchlists, scheduled finance jobs, model routes, and spend sources.
- G6: refresh/source-health checks can auto-run; analysis run and portfolio changes are single Apply jobs.

## 6. Features to add (prioritized)
- MUST: Replace placeholder trigger with real job. Acceptance: creates durable job, runs actual finance analysis, persists run/enrichment rows, audits outcome.
- MUST: Wire portfolio form. Acceptance: Save calls POST, shows success/error, refreshes configs, writes audit.
- MUST: Source discovery/connect state. Acceptance: absent data sources show connect state, not a default configured-looking module.
- MUST: Logical model names only in UI. Acceptance: no backend/vendor names in selector labels.
- SHOULD: Finance AI brief with root-cause/provenance before tables.
- SHOULD: Routing/cost tab using `litellm_routing_log` and `gateway_calls`.
- EXTRA: “Why this matters for NewsBites” story recommendation bridge to Scout/Autopipeline.

## 7. Sellable-in-parts
- Standalone pitch: “Finance editorial intelligence that turns article corpus + market data into explainable, auditable insights.”
- Suite fit: connects NewsBites, Scout, Cost, Gateway, Models, Reports, and Audit.

## 8. Backend work
- Implement analysis runner endpoint as durable job, not placeholder.
- Add source registry/discovery for finance feeds and corpus under Capability X.
- Add audit rows for config changes and analysis triggers.
- Add model/cost attribution joins to `gateway_calls` and `cost_events`.
- Reuse `finance_runs`, `finance_enrichments`, `portfolio_configs`, `litellm_routing_log`, `jobs`, `action_audit`, `insights`.

## 9. Build slices
- Slice 1: remove fake action UX; wire portfolio save and disable Run until real job exists.
- Slice 2: durable analysis job and audit.
- Slice 3: source discovery/connect state.
- Slice 4: AI brief/provenance/cost view.
- Documentation to update during implementation: this plan, `/root/DASHBOARD_V5_PLAN.md` Phase 7 sweep status, `README.md` finance-intel setup, and `/root/CLAUDE.md` if finance model/source contracts change.

## 10. Verification
- `rg "In a real implementation|For now" server/api/financeIntel.ts app/routes/FinanceIntelPage.tsx` has no load-bearing hits.
- Run Analysis creates a real job and persisted run.
- Portfolio save persists and audits.
- Fresh host shows source connect state.
- UI uses logical model names only.
