# /today — Product Plan
> One-line: the daily operator brief that turns overnight events, publishing state, models, infra, cost, and workload into a prioritized day plan.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `/today` is imported, registered, and marked `core` in nav (`app/App.tsx:17`, `app/App.tsx:161`, `app/App.tsx:162`, `app/lib/navRegistry.ts:21`). Readiness: 🟡 partial.
- The page polls `/api/today` every 60s and has loading/error/null guards (`app/routes/TodayPage.tsx:57`, `app/routes/TodayPage.tsx:58`, `app/routes/TodayPage.tsx:60`, `app/routes/TodayPage.tsx:61`, `app/routes/TodayPage.tsx:62`).
- UI sections cover date, overnight summary, publishing, models, infrastructure, cost, suggested schedule, PriorityDeck, WorkloadGraphTable, and actions (`app/routes/TodayPage.tsx:69`, `app/routes/TodayPage.tsx:75`, `app/routes/TodayPage.tsx:105`, `app/routes/TodayPage.tsx:135`, `app/routes/TodayPage.tsx:173`, `app/routes/TodayPage.tsx:202`, `app/routes/TodayPage.tsx:227`, `app/routes/TodayPage.tsx:250`, `app/routes/TodayPage.tsx:253`, `app/routes/TodayPage.tsx:256`).
- Overnight cards show events since midnight, new articles, service restarts, and top events with severity/source pills (`app/routes/TodayPage.tsx:77`, `app/routes/TodayPage.tsx:79`, `app/routes/TodayPage.tsx:82`, `app/routes/TodayPage.tsx:87`, `app/routes/TodayPage.tsx:90`, `app/routes/TodayPage.tsx:94`, `app/routes/TodayPage.tsx:97`).
- Publishing cards show published today, pending approval linking to `/autopipeline`, failed, and top candidates (`app/routes/TodayPage.tsx:108`, `app/routes/TodayPage.tsx:110`, `app/routes/TodayPage.tsx:112`, `app/routes/TodayPage.tsx:114`, `app/routes/TodayPage.tsx:116`, `app/routes/TodayPage.tsx:118`, `app/routes/TodayPage.tsx:121`, `app/routes/TodayPage.tsx:126`, `app/routes/TodayPage.tsx:127`).
- Model summary shows best available logical model strings, degraded/blocked generic pills, and newly discovered text (`app/routes/TodayPage.tsx:137`, `app/routes/TodayPage.tsx:139`, `app/routes/TodayPage.tsx:142`, `app/routes/TodayPage.tsx:144`, `app/routes/TodayPage.tsx:148`, `app/routes/TodayPage.tsx:154`, `app/routes/TodayPage.tsx:158`, `app/routes/TodayPage.tsx:164`, `app/routes/TodayPage.tsx:167`).
- Infra/cost sections link infra cards to `/infra` and show GPU status, Vast runway, service issues, Vast balance, daily burn, monthly projection, and cost note (`app/routes/TodayPage.tsx:176`, `app/routes/TodayPage.tsx:178`, `app/routes/TodayPage.tsx:182`, `app/routes/TodayPage.tsx:185`, `app/routes/TodayPage.tsx:189`, `app/routes/TodayPage.tsx:193`, `app/routes/TodayPage.tsx:205`, `app/routes/TodayPage.tsx:208`, `app/routes/TodayPage.tsx:212`, `app/routes/TodayPage.tsx:214`, `app/routes/TodayPage.tsx:218`, `app/routes/TodayPage.tsx:220`, `app/routes/TodayPage.tsx:224`).
- Suggested schedule renders tasks with optional route links; action buttons for AI Vault export and Telegram brief are disabled and titled “coming in V4.1” (`app/routes/TodayPage.tsx:230`, `app/routes/TodayPage.tsx:234`, `app/routes/TodayPage.tsx:235`, `app/routes/TodayPage.tsx:242`, `app/routes/TodayPage.tsx:260`, `app/routes/TodayPage.tsx:263`).
- Backend builds Today from the same `buildHomeData()` source as `/api/home`, not separate adapters (`server/api/today.ts:1`, `server/api/today.ts:46`, `server/api/today.ts:52`, `server/api/today.ts:55`, `server/api/today.ts:63`).
- Backend maps home data to GPU status, NewsBites published counts, Autopipeline pending approvals, latest NewsBites articles as top candidates, model best/degraded/blocked/newly discovered, Vast cost/runway, and service issues (`server/api/today.ts:65`, `server/api/today.ts:69`, `server/api/today.ts:73`, `server/api/today.ts:74`, `server/api/today.ts:80`, `server/api/today.ts:82`, `server/api/today.ts:85`, `server/api/today.ts:87`, `server/api/today.ts:89`, `server/api/today.ts:91`, `server/api/today.ts:92`, `server/api/today.ts:99`).
- If dashboard DB is enabled, backend counts events and service restarts since midnight from `events`, maps top events, and uses `operator_state` to snapshot article count at midnight (`server/api/today.ts:47`, `server/api/today.ts:50`, `server/api/today.ts:109`, `server/api/today.ts:113`, `server/api/today.ts:116`, `server/api/today.ts:119`, `server/api/today.ts:121`, `server/api/today.ts:126`, `server/api/today.ts:127`, `server/api/today.ts:132`).
- Backend suggested schedule adds tasks for approval backlog, paused autopipeline, degraded/blocked models, service issues, or Vast runway fallback (`server/api/today.ts:138`, `server/api/today.ts:142`, `server/api/today.ts:145`, `server/api/today.ts:147`, `server/api/today.ts:151`, `server/api/today.ts:154`, `server/api/today.ts:160`, `server/api/today.ts:163`, `server/api/today.ts:169`, `server/api/today.ts:172`, `server/api/today.ts:178`, `server/api/today.ts:181`).
- Backend returns `failed: 0`, `recentRestarts: []`, and a cost note stating only Vast GPU is tracked and cloud API costs are not yet tracked (`server/api/today.ts:187`, `server/api/today.ts:190`, `server/api/today.ts:192`, `server/api/today.ts:197`).
- Tests verify response shape/fields only, including non-empty cost note and date format (`server/api/today.test.ts:17`, `server/api/today.test.ts:19`, `server/api/today.test.ts:28`, `server/api/today.test.ts:38`, `server/api/today.test.ts:48`, `server/api/today.test.ts:61`, `server/api/today.test.ts:72`, `server/api/today.test.ts:81`, `server/api/today.test.ts:88`, `server/api/today.test.ts:95`).

## 2. Gaps, mock & broken parts
- Disabled visible actions make the page look unfinished: Export to AI Vault and Generate Telegram brief are rendered as disabled “coming in V4.1” controls (`app/routes/TodayPage.tsx:256`, `app/routes/TodayPage.tsx:260`, `app/routes/TodayPage.tsx:263`, `app/routes/TodayPage.tsx:264`).
- Publishing `failed` is hardcoded to 0, and recent restarts are hardcoded to an empty array, so the brief can under-report actual failures/restarts (`server/api/today.ts:187`, `server/api/today.ts:190`, `server/api/today.ts:192`).
- Cost summary is explicitly Vast-only and says cloud API costs are not tracked, which is incomplete for an AI gateway/admin center (`server/api/today.ts:91`, `server/api/today.ts:92`, `server/api/today.ts:193`, `server/api/today.ts:197`, `app/routes/TodayPage.tsx:202`, `app/routes/TodayPage.tsx:224`).
- Zero-config gap: Today inherits `buildHomeData()` and hardcoded service inventory from the current system adapters rather than an environment-agnostic discovered asset registry (`server/api/today.ts:52`, `server/api/today.ts:55`, `server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- Fresh environments with no MIMULE services risk showing generic zeros/statuses rather than “nothing registered yet”; Today has no page-level discovered inventory/connect state (`server/adapters/system.ts:37`, `server/adapters/system.ts:58`, `server/api/today.ts:99`, `app/routes/TodayPage.tsx:67`).
- AI reasoning is absent before the suggested schedule; tasks are deterministic rules from counts, not AI-root-caused findings or admin health drivers (`server/api/today.ts:138`, `server/api/today.ts:142`, `server/api/today.ts:160`, `server/api/today.ts:169`, `server/insights/health.ts:63`, `server/insights/health.ts:97`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).
- Today duplicates Home/Admin rollup territory without using the Admin Health Score/briefing as its primary source (`server/api/today.ts:52`, `server/insights/health.ts:15`, `server/insights/health.ts:63`, `server/insights/health.ts:148`, `app/routes/TodayPage.tsx:250`, `app/routes/TodayPage.tsx:253`).
- Tests do not assert correctness of failed counts, cost attribution, action behavior, or insight ordering; they mainly assert fields exist (`server/api/today.test.ts:17`, `server/api/today.test.ts:41`, `server/api/today.test.ts:72`, `server/api/today.test.ts:88`).

## 3. Goal alignment (G1–G8)
- G1/G3: remove disabled fake controls or wire them.
- G2/G6: brief export/send must be one-click GUI actions with audit.
- G4/G9: Today must summarize discovered assets, not MIMULE constants.
- G5/G7: AI reasoning and Admin Health drivers should determine priority order.
- G8: Today should be the sellable daily executive/operator brief, not another dashboard.

## 4. Best-practice research
- Research basis: NIST AI RMF supports a daily Govern/Map/Measure/Manage operating loop; Google SRE golden signals support health summaries; Microsoft HAX supports AI-generated briefs that reveal uncertainty and allow correction; OWASP LLM Top 10 supports surfacing unregistered AI systems, exposed endpoints, shadow API keys, and risky autonomy (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use executive daily brief pattern: state of stack, top risks, work queue, decisions needed, done automatically.
- Use one health score: Today should explain what changed since yesterday and what affects the score.
- Use action-in-brief: each task has Apply/Snooze/Ack and audit trail.
- Use honest freshness: every section shows last source update and degraded sources.

## 5. Target design
- Top: Admin Health Score, AI State of the Stack, overnight delta, and top 3 actions.
- Sections: editorial, infra/models, cost, security/governance, workload, and completed auto-fixes.
- Empty/fresh state: if no assets are registered, Today shows first-run discovery/register checklist.
- Discovery: Today consumes registered/discovered AI systems, services, model endpoints, spend sources, editorial pipelines, secrets, and content sources.
- G7: schedule is generated from open insights + AI analysis/root causes, not deterministic counts only.
- G6: safe digest generation/export can be one Apply or auto-scheduled; risky actions link to their owning page.

## 6. Features to add (prioritized)
- MUST: Replace disabled actions. Acceptance: export/send either work and audit or are removed.
- MUST: Use Admin Health + insights. Acceptance: top schedule items are driven by open severity-sorted findings and AI recommendations.
- MUST: Real failed/restart/cost data. Acceptance: no hardcoded `failed: 0`, no empty restart array unless proven empty, cloud/gateway costs included.
- MUST: Discovery-aware first-run state.
- SHOULD: Yesterday/today deltas and auto-fix activity.
- SHOULD: “Register these untracked AI systems” block sourced from Capability X.
- EXTRA: One-click morning brief preview with editable text and source links.

## 7. Sellable-in-parts
- Standalone pitch: “Daily AI-operations brief: what happened overnight, what matters now, what the system already handled, and the next safest actions.”
- Suite fit: front door to Admin, Insights, NewsBites, Autopipeline, Models, Infra, Cost, and Reports.

## 8. Backend work
- Rebuild `/api/today` around `computeAdminHealthScore`, open insights with AI analysis, action audit, jobs, cost events/gateway calls, and discovered assets.
- Add `POST /api/today/export-vault` and `POST /api/today/send-brief` as audited actions if those controls remain.
- Add real failed publishing and recent restart queries from events/jobs/action audit.
- Include discovery summary: unregistered AI systems, exposed model endpoints, shadow API keys, unregistered editorial assets.

## 9. Build slices
- Slice 1: remove/wire disabled actions and add tests.
- Slice 2: Admin Health + AI analysis-driven schedule.
- Slice 3: real failure/restart/cost sources.
- Slice 4: discovery/first-run summary.
- Documentation to update during implementation: this plan, `/root/DASHBOARD_V5_PLAN.md` Admin Center/Capability X status, `README.md` Today brief docs, and `/root/CLAUDE.md` only if daily brief operational contracts change.

## 10. Verification
- No disabled “coming soon” controls remain.
- Today on fresh host shows discovery/register checklist.
- Top actions match open insights sorted by severity and AI recommendation.
- Cost includes gateway/cloud spend where available and honestly states missing sources.
- Export/send brief writes audit rows and is covered by tests.
