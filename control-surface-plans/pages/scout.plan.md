# /scout — Product Plan
> One-line: the story-discovery transparency and control page for editors tuning scout runs and understanding why topics were selected.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `/scout` is registered in the router and nav marks it `advanced` plus `experimental`, so it is not yet promoted as core (`app/App.tsx:36`, `app/App.tsx:131`, `app/App.tsx:132`, `app/lib/navRegistry.ts:49`). Readiness: 🟡 partial / experimental.
- The page maintains run/config/loading/saving/running/error state and polls every 30s (`app/routes/ScoutPage.tsx:47`, `app/routes/ScoutPage.tsx:49`, `app/routes/ScoutPage.tsx:50`, `app/routes/ScoutPage.tsx:52`, `app/routes/ScoutPage.tsx:53`, `app/routes/ScoutPage.tsx:54`, `app/routes/ScoutPage.tsx:55`, `app/routes/ScoutPage.tsx:124`, `app/routes/ScoutPage.tsx:130`).
- It loads runs from `/api/scout/runs` and config from `/api/scout/config`, then picks the first run when none is selected (`app/routes/ScoutPage.tsx:81`, `app/routes/ScoutPage.tsx:89`, `app/routes/ScoutPage.tsx:92`, `app/routes/ScoutPage.tsx:95`, `app/routes/ScoutPage.tsx:102`, `app/routes/ScoutPage.tsx:106`).
- It can trigger a manual scout run by POSTing `/api/scout/trigger` with reason “Manual trigger from dashboard” (`app/routes/ScoutPage.tsx:147`, `app/routes/ScoutPage.tsx:153`, `app/routes/ScoutPage.tsx:156`, `app/routes/ScoutPage.tsx:161`, `app/routes/ScoutPage.tsx:164`).
- It can save scout config by PUTing `/api/scout/config`; the UI logs success to console but does not show a durable success toast (`app/routes/ScoutPage.tsx:175`, `app/routes/ScoutPage.tsx:180`, `app/routes/ScoutPage.tsx:183`, `app/routes/ScoutPage.tsx:186`, `app/routes/ScoutPage.tsx:187`).
- The page displays statistics, run history, selected run details, queued stories, config snapshot JSON, ranked topics, and editable config controls (`app/routes/ScoutPage.tsx:251`, `app/routes/ScoutPage.tsx:254`, `app/routes/ScoutPage.tsx:276`, `app/routes/ScoutPage.tsx:321`, `app/routes/ScoutPage.tsx:356`, `app/routes/ScoutPage.tsx:379`, `app/routes/ScoutPage.tsx:392`, `app/routes/ScoutPage.tsx:402`, `app/routes/ScoutPage.tsx:451`).
- Topic table sorting/search exists through `useTableControls`, and rows show headline, vertical, source, recency, novelty, final score, and selected/skipped status (`app/routes/ScoutPage.tsx:64`, `app/routes/ScoutPage.tsx:406`, `app/routes/ScoutPage.tsx:410`, `app/routes/ScoutPage.tsx:411`, `app/routes/ScoutPage.tsx:412`, `app/routes/ScoutPage.tsx:413`, `app/routes/ScoutPage.tsx:414`, `app/routes/ScoutPage.tsx:415`, `app/routes/ScoutPage.tsx:437`).
- Backend reads scout artifacts from a hardcoded runs root under the MIMULE editorial workspace and maps `deduped.json` to UI run shape (`server/api/scout.ts:7`, `server/api/scout.ts:8`, `server/api/scout.ts:15`, `server/api/scout.ts:16`, `server/api/scout.ts:41`, `server/api/scout.ts:51`, `server/api/scout.ts:55`, `server/api/scout.ts:65`, `server/api/scout.ts:67`).
- The mapping marks all `deduped.items` as selected, maps `deduped.dropped` as skipped, and returns empty `queued` and empty `config` for each run (`server/api/scout.ts:19`, `server/api/scout.ts:26`, `server/api/scout.ts:30`, `server/api/scout.ts:37`, `server/api/scout.ts:41`, `server/api/scout.ts:45`, `server/api/scout.ts:46`, `server/api/scout.ts:47`).
- Config is stored in `operator_state` under `scout.config`; defaults are hardcoded to enabled, every 4 hours, verticals `ai/finance/global-politics/trends/science`, max 10, thresholds 0.7/24h/0.8 (`server/api/scout.ts:9`, `server/api/scout.ts:102`, `server/api/scout.ts:104`, `server/api/scout.ts:106`, `server/api/scout.ts:107`, `server/api/scout.ts:108`, `server/api/scout.ts:109`, `server/api/scout.ts:110`, `server/api/scout.ts:111`, `server/api/scout.ts:112`, `server/api/scout.ts:113`, `server/api/scout.ts:148`).
- Triggering scout proxies to the external autopipeline command API at `http://127.0.0.1:3200/command` with `{ cmd: "run_scout", reason }` and writes action audit (`server/api/scout.ts:187`, `server/api/scout.ts:193`, `server/api/scout.ts:194`, `server/api/scout.ts:196`, `server/api/scout.ts:199`, `server/api/scout.ts:206`, `server/api/scout.ts:207`, `server/api/scout.ts:210`).
- Router mounts GET runs/run/config plus mutation-gated PUT config and POST trigger (`server/api/router.ts:800`, `server/api/router.ts:801`, `server/api/router.ts:802`, `server/api/router.ts:807`, `server/api/router.ts:808`, `server/api/router.ts:809`, `server/api/router.ts:813`, `server/api/router.ts:814`).
- Tests cover the route shapes for GET runs/config, PUT config, and POST trigger with mocked fetch (`server/api/scout.test.ts:21`, `server/api/scout.test.ts:26`, `server/api/scout.test.ts:47`, `server/api/scout.test.ts:52`, `server/api/scout.test.ts:65`, `server/api/scout.test.ts:71`, `server/api/scout.test.ts:97`, `server/api/scout.test.ts:101`, `server/api/scout.test.ts:112`).

## 2. Gaps, mock & broken parts
- Zero-config gap: the page assumes the MIMULE run artifact root and `:3200` command API; it does not discover scout-capable pipelines, run roots, scheduled timers, source connectors, or model backends (`server/api/scout.ts:8`, `server/api/scout.ts:194`, `server/api/router.ts:813`, `server/api/router.ts:816`).
- Fresh environments with no run root return an empty run list, but the page says “no scout runs found” instead of “Scout pipeline not discovered/registered” (`server/api/scout.ts:52`, `server/api/scout.ts:53`, `app/routes/ScoutPage.tsx:321`, `app/routes/ScoutPage.tsx:324`, `app/routes/ScoutPage.tsx:325`).
- Run transparency is lossy: `queued` and `config` are always empty in mapped runs, so the UI’s queued stories and configuration snapshot can imply real data that the handler never supplies (`server/api/scout.ts:46`, `server/api/scout.ts:47`, `app/routes/ScoutPage.tsx:379`, `app/routes/ScoutPage.tsx:387`, `app/routes/ScoutPage.tsx:392`, `app/routes/ScoutPage.tsx:395`).
- Scores are normalized from `item.score` for both recency and novelty rather than preserving real dimensions, so the page labels can overstate ranking explainability (`server/api/scout.ts:17`, `server/api/scout.ts:23`, `server/api/scout.ts:24`, `server/api/scout.ts:25`, `app/routes/ScoutPage.tsx:413`, `app/routes/ScoutPage.tsx:414`).
- Config defaults and validation encode specific verticals in the handler rather than discovering allowed verticals from the registered publishing app/editorial policy (`server/api/scout.ts:106`, `server/api/scout.ts:109`, `server/api/scout.ts:137`, `server/api/scout.ts:140`, `app/routes/ScoutPage.tsx:521`, `app/routes/ScoutPage.tsx:524`).
- Save config has no visible success/error state besides console logging, so the operator cannot trust the mutation outcome from the page (`app/routes/ScoutPage.tsx:186`, `app/routes/ScoutPage.tsx:187`, `app/routes/ScoutPage.tsx:189`, `app/routes/ScoutPage.tsx:190`, `app/routes/ScoutPage.tsx:530`).
- The trigger endpoint audits high risk, but it is not represented as a typed executor action with Apply/revert semantics or linked insights (`server/api/scout.ts:206`, `server/api/scout.ts:210`, `server/api/scout.ts:219`, `server/api/scout.ts:227`, `server/insights/store.ts:58`, `server/insights/autoapply.ts:23`).
- The page has no AI reasoning explaining why topics were selected/skipped before the raw topic table; it shows `reason` only as a row field filter source and selected/skipped pill (`app/routes/ScoutPage.tsx:67`, `app/routes/ScoutPage.tsx:436`, `app/routes/ScoutPage.tsx:437`, `app/routes/ScoutPage.tsx:440`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).

## 3. Goal alignment (G1–G8)
- G1/G3: make missing pipeline/source connectors explicit, not a silent empty run list.
- G2/G6: trigger and config edits should be executor-backed, audited, and clearly confirmed.
- G4/G9: discover scout jobs, timers, source feeds, run artifacts, AI CLIs/agents, and model backends.
- G5/G7: explain selection/skipping with AI reasoning and root cause before raw score tables.
- G8: promote from experimental into a sellable “Story Discovery Governance” module.

## 4. Best-practice research
- Research basis: NIST AI RMF supports mapping source/model dependencies before managing risk; Google SRE monitoring guidance supports freshness/error/saturation metrics for scout pipelines; Microsoft HAX supports exposing AI ranking uncertainty; OWASP LLM Top 10 supports detecting shadow agents, exposed endpoints, and risky autonomous selection paths (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use ranking-explainability patterns: show source, novelty, recency, duplication, and policy-fit as separate dimensions.
- Use data-pipeline observability: last run, next scheduled run, source freshness, error rate, and queue conversion.
- Use configuration safety: dry-run config changes and show before/after expected volume.
- Use feedback loop: operator labels “good pick/bad pick” become training/evaluation data.

## 5. Target design
- Header: registered scout pipeline, source coverage, last run, next run, run health, and open findings.
- Main: AI brief “Why these topics won/lost”, then candidate deck, then run history and config.
- Empty/fresh state: no discovered scout runner/source feeds → connect state with Register pipeline and add sources.
- Discovery: detect scheduled scout timers, run artifact roots, pipeline command APIs, source feed configs, AI CLIs/agents, and model dependencies.
- G7: every run gets an AI explanation with top drivers, missing coverage, and recommended operator action.
- G6: safe “refresh/import latest run” can auto; “trigger scout” and config changes remain single Apply.

## 6. Features to add (prioritized)
- MUST: Discovery/registration for scout-capable pipeline. Acceptance: page differentiates not installed, discovered-unregistered, registered, and degraded.
- MUST: Real run schema. Acceptance: queued stories, config snapshot, source freshness, and score dimensions reflect artifacts or show unavailable.
- MUST: Visible mutation outcomes. Acceptance: save config and trigger show persisted audit/job status.
- MUST: AI run explanation. Acceptance: selected/skipped reasons summarize before topic table.
- SHOULD: Vertical/source coverage matrix with gaps linking to `/content-health`.
- SHOULD: Dry-run config. Acceptance: changing thresholds estimates volume before Apply.
- EXTRA: Feedback buttons on each topic to improve future ranking.

## 7. Sellable-in-parts
- Standalone pitch: “Transparent AI scouting: know why stories were found, selected, skipped, queued, or missed.”
- Suite fit: feeds Autopipeline, NewsBites, Content Health, Today, Insights, and model/cost attribution.

## 8. Backend work
- Add scout discovery to Capability X: process/timer/artifact/API/source scans.
- Add registered scout config source instead of hardcoded `RUNS_ROOT` and vertical defaults.
- Extend run parser to preserve source freshness, real scoring dimensions, queued outputs, and config snapshot.
- Add executor action descriptors for `scout.trigger`, `scout.config.update`, and `scout.refresh-artifacts`.
- Emit insights for no recent scout run, source feed stale, vertical coverage gap, and unregistered scout runner.

## 9. Build slices
- Slice 1: discovery-aware empty/connect state in `server/api/scout.ts` and `ScoutPage.tsx`.
- Slice 2: config mutation UX and executor audit alignment.
- Slice 3: richer run parser and AI explanation panel.
- Slice 4: source/vertical coverage and insights links.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, this plan, `README.md` scout operator docs, and `/root/CLAUDE.md` if scout artifact/API contracts change.

## 10. Verification
- Fresh host: no fake runs, clear connect state.
- Registered scout: run history loads from configured artifact root.
- Trigger and config save write visible audit rows.
- AI explanation appears before raw ranked topics.
- Tests cover absent root, malformed `deduped.json`, and successful trigger.
