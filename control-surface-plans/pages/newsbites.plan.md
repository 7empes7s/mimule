# /newsbites — Product Plan
> One-line: the NewsBites publishing control room for editors and operators managing live articles, deploys, and article-level fixes.

## 1. Today (verified, with file:line)
- Frontend component/readiness: `NewsBitesPage` is imported and registered at `/newsbites` in the app router, and the nav registry marks `/newsbites` as `core`, so the route is intended as operator-ready rather than labs (`app/App.tsx:8`, `app/App.tsx:143`, `app/App.tsx:144`, `app/lib/navRegistry.ts:26`). Readiness: 🟡 partial.
- The page polls `/api/newsbites` every 30s and has loading/error/null guards before rendering (`app/routes/NewsBitesPage.tsx:176`, `app/routes/NewsBitesPage.tsx:177`, `app/routes/NewsBitesPage.tsx:227`, `app/routes/NewsBitesPage.tsx:228`, `app/routes/NewsBitesPage.tsx:229`).
- The page renders published/approved/draft/today/last-30d/site status metrics from API data, and shows deploy metadata plus a deploy button (`app/routes/NewsBitesPage.tsx:311`, `app/routes/NewsBitesPage.tsx:314`, `app/routes/NewsBitesPage.tsx:317`, `app/routes/NewsBitesPage.tsx:321`, `app/routes/NewsBitesPage.tsx:329`, `app/routes/NewsBitesPage.tsx:335`).
- Article operations exist: filter/sort/search through `useTableControls`, inspect dossier, replace picture, and delete article (`app/routes/NewsBitesPage.tsx:213`, `app/routes/NewsBitesPage.tsx:404`, `app/routes/NewsBitesPage.tsx:426`, `app/routes/NewsBitesPage.tsx:458`, `app/routes/NewsBitesPage.tsx:463`, `app/routes/NewsBitesPage.tsx:468`).
- Cover image replacement has two modes, Pexels search and upload, both POST through `authFetch` to article action endpoints (`app/routes/NewsBitesPage.tsx:26`, `app/routes/NewsBitesPage.tsx:33`, `app/routes/NewsBitesPage.tsx:56`, `app/routes/NewsBitesPage.tsx:77`, `app/routes/NewsBitesPage.tsx:102`, `app/routes/NewsBitesPage.tsx:103`).
- Delete and deploy are confirmation-gated in the UI; deploy starts `/api/newsbites/deploy`, then polls `/api/newsbites/deploy/:jobId` for durable job status/output (`app/routes/NewsBitesPage.tsx:264`, `app/routes/NewsBitesPage.tsx:267`, `app/routes/NewsBitesPage.tsx:288`, `app/routes/NewsBitesPage.tsx:291`, `app/routes/NewsBitesPage.tsx:299`, `app/routes/NewsBitesPage.tsx:197`).
- The read API is real filesystem-backed article/deploy data: `newsBitesHandler` calls `getAllArticles()` and `getDeployInfo()`, computes status counts, published-today, 30-day counts, and vertical mix (`server/api/newsbites.ts:4`, `server/api/newsbites.ts:5`, `server/api/newsbites.ts:6`, `server/api/newsbites.ts:10`, `server/api/newsbites.ts:13`, `server/api/newsbites.ts:16`, `server/api/newsbites.ts:28`, `server/api/newsbites.ts:36`).
- The adapter reads `/opt/newsbites/content/articles`, probes git in `/opt/newsbites`, and probes `http://127.0.0.1:3001`, so the current data source is hardwired to this VPS layout (`server/adapters/newsbites.ts:5`, `server/adapters/newsbites.ts:6`, `server/adapters/newsbites.ts:7`, `server/adapters/newsbites.ts:39`, `server/adapters/newsbites.ts:79`, `server/adapters/newsbites.ts:93`).
- Mutating routes are registered and mutation-gated in the router for deploy, delete, dossier-path, refresh-image, and upload-image (`server/api/router.ts:1003`, `server/api/router.ts:1028`, `server/api/router.ts:1037`, `server/api/router.ts:1047`, `server/api/router.ts:1048`, `server/api/router.ts:1053`).
- Deploy is a durable job with audit: it writes a `newsbites-deploy` job, records audit rows, spawns `cd /opt/newsbites && ./deploy.sh`, and runs a post-deploy content-health scan on success (`server/api/actions.ts:393`, `server/api/actions.ts:399`, `server/api/actions.ts:404`, `server/api/actions.ts:414`, `server/api/actions.ts:427`, `server/api/actions.ts:447`, `server/api/actions.ts:459`).
- Article delete and image mutations are real disk mutations: delete unlinks markdown/images and restarts `newsbites.service`; refresh-image needs `PEXELS_API_KEY`; upload validates file and writes frontmatter updates (`server/api/newsbites-actions.ts:22`, `server/api/newsbites-actions.ts:23`, `server/api/newsbites-actions.ts:72`, `server/api/newsbites-actions.ts:92`, `server/api/newsbites-actions.ts:98`, `server/api/newsbites-actions.ts:128`, `server/api/newsbites-actions.ts:176`, `server/api/newsbites-actions.ts:190`, `server/api/newsbites-actions.ts:231`, `server/api/newsbites-actions.ts:247`).

## 2. Gaps, mock & broken parts
- Zero-config gap: the page cannot discover a NewsBites install; the adapter hardcodes article path, repo path, and local URL, and article actions hardcode article/image/dossier roots (`server/adapters/newsbites.ts:5`, `server/adapters/newsbites.ts:6`, `server/adapters/newsbites.ts:7`, `server/api/newsbites-actions.ts:22`, `server/api/newsbites-actions.ts:23`, `server/api/newsbites-actions.ts:24`).
- Fresh-environment behavior is only accidentally empty: missing article directory returns `[]`, but the UI still looks like a configured NewsBites module rather than an honest “NewsBites not discovered/connect it” state (`server/adapters/newsbites.ts:39`, `server/adapters/newsbites.ts:42`, `server/adapters/newsbites.ts:44`, `app/routes/NewsBitesPage.tsx:311`, `app/routes/NewsBitesPage.tsx:426`).
- Deploy is appropriately durable, but the page has no preflight showing whether `/opt/newsbites/deploy.sh`, `newsbites.service`, `PEXELS_API_KEY`, and content paths exist before enabling risky controls (`server/api/actions.ts:404`, `server/api/actions.ts:406`, `server/api/newsbites-actions.ts:128`, `server/api/newsbites-actions.ts:129`, `app/routes/NewsBitesPage.tsx:335`).
- Delete restarts the live NewsBites service directly in the handler after unlinking files, not via a reusable executor action with an obvious rollback path in the page (`server/api/newsbites-actions.ts:72`, `server/api/newsbites-actions.ts:92`, `server/api/newsbites-actions.ts:98`, `server/api/newsbites-actions.ts:99`, `server/api/newsbites-actions.ts:103`).
- Article “inspect” falls back to `alert("No dossier found")`, not a nonblocking empty state with discovery/reconnect guidance (`app/routes/NewsBitesPage.tsx:251`, `app/routes/NewsBitesPage.tsx:252`, `app/routes/NewsBitesPage.tsx:255`, `app/routes/NewsBitesPage.tsx:257`, `server/api/newsbites-actions.ts:116`, `server/api/newsbites-actions.ts:117`).
- Content-health integration is one-way: deploy triggers a post-deploy scan, and content health findings can become insights, but `/newsbites` does not surface per-article content-health findings or AI reasoning before article actions (`server/api/actions.ts:352`, `server/api/actions.ts:358`, `server/api/actions.ts:362`, `server/insights/aggregate.ts:291`, `server/insights/aggregate.ts:311`, `server/insights/aggregate.ts:317`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).
- The article table uses hover-only color changes on article links, which is weak for touch/mobile parity and accessibility (`app/routes/NewsBitesPage.tsx:443`, `app/routes/NewsBitesPage.tsx:444`, `app/routes/NewsBitesPage.tsx:447`, `app/routes/NewsBitesPage.tsx:448`).
- There is no explicit stale-deploy/site-unreachable insight deep-link on the page even though site status is displayed and the V5 detector catalog expects stale deploy/site unreachable to route through the shared inbox (`app/routes/NewsBitesPage.tsx:321`, `server/adapters/newsbites.ts:89`, `server/adapters/newsbites.ts:93`, `server/insights/store.ts:58`, `server/insights/store.ts:77`).

## 3. Goal alignment (G1–G8)
- G1/G3: make all controls preflight-aware; disable or connect-state controls when NewsBites is absent.
- G2/G6: keep deploy/delete/image operations GUI-able, but route all risky mutations through the shared action executor/job/audit path.
- G4/G9: auto-discover NewsBites content roots, public image roots, deploy scripts, service unit, site URL, secrets, and pipeline dossier roots instead of hardcoding `/opt/newsbites`.
- G5/G7: show AI-reasoned content/deploy findings before raw article tables; deep-link every finding to `/insights?focus=...` and affected article.
- G8: treat this as the sellable “Publishing Ops” module, not a local script dashboard.

## 4. Best-practice research
- Research basis: NIST AI RMF’s Govern/Map/Measure/Manage lifecycle supports inventory-to-action flow; Google SRE golden signals support service/site health probes; Microsoft HAX supports visible AI confidence and recovery; OWASP LLM Top 10 supports tracking AI dependencies and risky agent actions (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Adopt a publishing-control pattern: environment card, production health, deployment history, content quality queue, then article inventory.
- Use a preflight contract: every dangerous button shows inputs, expected side effects, audit destination, and rollback hint.
- Use asset inventory enrollment: discovered NewsBites install → Register → manage content roots/deploy command/site probe.
- Use editorial QA queue design: group by severity, explain why it matters, show “Apply fix” or “Open article workflow” before raw metadata.

## 5. Target design
- Top band: registered publishing product, site health, last deploy, open content/deploy findings, and Admin Health contribution.
- Main layout: “Needs attention” queue first, then Deploy panel, then Article inventory with health badges and dossier links.
- Empty/fresh state: if no NewsBites install is discovered, show “No publishing app discovered” with Register/connect actions; never show zero published as if it is a real configured site.
- Discovery: scan candidate repos for article frontmatter patterns, Next.js app roots, deploy scripts, `newsbites.service`, Caddy routes, public image paths, Pexels/stock-photo keys, and dossier directories.
- G7: each stale deploy, missing image, thin digest, invalid vertical, link failure, or deployment failure shows AI summary/root cause/recommended action above the table row.
- G6: safe actions such as re-run content scan can auto-run; deploy/delete remain review-tier single Apply with rollback/audit.

## 6. Features to add (prioritized)
- MUST: Publishing app discovery + Register flow. Acceptance: fresh install with no NewsBites shows connect state; discovered app can be registered without editing code.
- MUST: Per-article health badges from content-health findings. Acceptance: article row shows open finding count and links to `/content-health` and `/insights?focus=...`.
- MUST: Deploy preflight. Acceptance: deploy button requires green checks for script, service, repo, site probe, token, and working content path.
- MUST: Move delete/restart into executor. Acceptance: delete writes action audit, job/evidence, rollback hint, and optional “restore from git” guidance.
- SHOULD: Stale deploy/site unreachable insight card. Acceptance: one top-card links to finding and has Apply deploy.
- SHOULD: Secrets/connect panel for Pexels. Acceptance: missing key appears as connect issue, not modal-time failure.
- EXTRA: Article “rescue kit” that suggests image keywords, digest rewrite prompt, and vertical correction from AI analysis.

## 7. Sellable-in-parts
- Standalone pitch: “Publishing Ops Center for AI-assisted newsrooms: deploy, QA, article inventory, and action audit in one place.”
- Suite fit: feeds shared health score, shared insights inbox, shared jobs/audit stream, cost attribution, and editorial pipeline pages.

## 8. Backend work
- Add `GET /api/newsbites/discovery` and `POST /api/newsbites/register` backed by `discovered_assets` once Capability X lands.
- Replace hardcoded paths with registered publishing-app config; keep current MIMULE paths as seed hints only.
- Add executor descriptors for `newsbites.deploy`, `newsbites.article.delete`, `newsbites.article.restore`, `newsbites.content-scan`.
- Emit insights for `stale-deploy`, `site-unreachable`, `missing-publishing-secret`, and post-deploy content-health regressions.
- Reuse `jobs`, `action_audit`, `events`, `content_health_findings`, `insights`, and `ai_analysis`.

## 9. Build slices
- Slice 1: discovery-aware read model in `server/adapters/newsbites.ts`, `server/api/newsbites.ts`, and `NewsBitesPage.tsx`; validate with focused API tests and fresh-path smoke.
- Slice 2: content-health badges on article rows using existing `/api/content-health`; validate table filtering and mobile card layout.
- Slice 3: deploy preflight + executor metadata; validate job/audit rows and no deploy enabled when prerequisites are absent.
- Slice 4: delete-to-executor migration with rollback hint; validate audit and error cases.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md` Capability X status, this page plan, `README.md` operator docs, and `/root/CLAUDE.md` only if NewsBites service/path contracts change.

## 10. Verification
- Typecheck/build pass.
- `/newsbites` loads on a host with no NewsBites and shows connect state.
- A discovered NewsBites app can be registered and then populates articles.
- Deploy requires preflight and writes job + audit.
- Delete/restore path is audited and review-tier.
- Content-health findings appear before raw article rows with AI reasoning and deep-links.
- Mobile: no hover-only controls, tap targets >=44px, article actions collapse cleanly.
