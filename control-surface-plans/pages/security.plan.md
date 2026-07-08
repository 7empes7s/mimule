# /security — Product Plan
> One-line: Unified Security Center for operators who need prioritized security posture, trust score, findings, and one-click remediation.

## 1. Today (verified, with file:line)
- 🟡 partial/core-labelled: `/security` is route-registered and nav-marked core, but V5 still calls for a larger Unified Security Center expansion (`app/App.tsx:122`, `app/routes/SecurityPage.tsx:200`, `app/lib/navRegistry.ts:19`, `/root/DASHBOARD_V5_PLAN.md:53`, `/root/DASHBOARD_V5_PLAN.md:358`).
- The page loads `GET /api/security/posture` every 5s and `GET /api/security/trust-score` every 10s (`app/routes/SecurityPage.tsx:201`, `app/routes/SecurityPage.tsx:202`).
- The posture handler requires insight view permission, runs `runSecurityScan()`, reads all insights, filters `domain === "security"`, separates open/resolved/applied/dismissed, and sorts by status/severity/created time (`server/api/security.ts:26`, `server/api/security.ts:27`, `server/api/security.ts:30`, `server/api/security.ts:31`, `server/api/security.ts:32`, `server/api/security.ts:34`, `server/api/security.ts:51`, `server/api/security.ts:63`).
- Trust score is a separate security score path: handler calls `computeTrustScore`, persists a daily sample, and returns 30-day history (`server/api/security.ts:11`, `server/api/security.ts:15`, `server/api/security.ts:16`, `server/api/security.ts:21`).
- The UI shows posture counts, last scan, checks run, trust dial, trust history, improvement actions, earned checks, open findings, and resolved findings (`app/routes/SecurityPage.tsx:280`, `app/routes/SecurityPage.tsx:288`, `app/routes/SecurityPage.tsx:297`, `app/routes/SecurityPage.tsx:307`, `app/routes/SecurityPage.tsx:326`, `app/routes/SecurityPage.tsx:330`, `app/routes/SecurityPage.tsx:336`, `app/routes/SecurityPage.tsx:340`, `app/routes/SecurityPage.tsx:381`, `app/routes/SecurityPage.tsx:461`).
- Improvement actions call the shared executor through `POST /api/actions/execute` using `actionDescriptorId`, reason, confirmation, and params (`app/routes/SecurityPage.tsx:251`, `app/routes/SecurityPage.tsx:256`, `app/routes/SecurityPage.tsx:257`, `app/routes/SecurityPage.tsx:258`, `app/routes/SecurityPage.tsx:259`).
- Security findings apply/dismiss through the shared insight action endpoints (`app/routes/SecurityPage.tsx:218`, `app/routes/SecurityPage.tsx:223`, `app/routes/SecurityPage.tsx:236`, `app/routes/SecurityPage.tsx:241`).
- Finding cards show severity/status, title, plain summary, evidence, reason field, Apply/Dismiss or manual page link (`app/routes/SecurityPage.tsx:385`, `app/routes/SecurityPage.tsx:389`, `app/routes/SecurityPage.tsx:396`, `app/routes/SecurityPage.tsx:400`, `app/routes/SecurityPage.tsx:407`, `app/routes/SecurityPage.tsx:411`, `app/routes/SecurityPage.tsx:420`, `app/routes/SecurityPage.tsx:437`).
- The current security scanner has exactly five checks worth surfacing: weak secret storage, possible credentials in audit text, owner sprawl, log-only policies, and active agents without budget caps (`server/api/security.ts:9`, `server/insights/scanners/security.ts:42`, `server/insights/scanners/security.ts:73`, `server/insights/scanners/security.ts:105`, `server/insights/scanners/security.ts:134`, `server/insights/scanners/security.ts:159`, `server/insights/scanners/security.ts:170`).
- Weak-secret findings are critical, point to `/governance`, and cite `governance_secrets` evidence (`server/insights/scanners/security.ts:55`, `server/insights/scanners/security.ts:59`, `server/insights/scanners/security.ts:63`, `server/insights/scanners/security.ts:68`).
- Audit-leak findings are high, point to `/audit`, and search `action_audit` text patterns for credential-like strings (`server/insights/scanners/security.ts:73`, `server/insights/scanners/security.ts:77`, `server/insights/scanners/security.ts:86`, `server/insights/scanners/security.ts:91`, `server/insights/scanners/security.ts:100`).
- Owner-sprawl findings query `governance_role_bindings` and point the operator to `/settings`, not `/governance` (`server/insights/scanners/security.ts:105`, `server/insights/scanners/security.ts:109`, `server/insights/scanners/security.ts:115`, `server/insights/scanners/security.ts:121`, `server/insights/scanners/security.ts:129`).
- Active-agents-without-budget findings are high, actionable with `mutate-policy:budget:global:set-cap`, and link to `/governance` (`server/insights/scanners/security.ts:159`, `server/insights/scanners/security.ts:166`, `server/insights/scanners/security.ts:170`, `server/insights/scanners/security.ts:175`, `server/insights/scanners/security.ts:183`, `server/insights/scanners/security.ts:184`).
- Security scan auto-resolves stale `security:` findings and writes an `insights.auto-resolve` audit row (`server/insights/scanners/security.ts:189`, `server/insights/scanners/security.ts:195`, `server/insights/scanners/security.ts:197`, `server/insights/scanners/security.ts:203`).
- Security API tests prove unauthorized posture requests return 401, empty DB returns `good`, and an active workflow without budget makes posture `at-risk` with the budget-cap action (`server/api/security.test.ts:47`, `server/api/security.test.ts:53`, `server/api/security.test.ts:60`, `server/api/security.test.ts:66`, `server/api/security.test.ts:82`, `server/api/security.test.ts:86`).
- Security data shares the unified insights store, whose domain check currently allows only `cost`, `security`, `build`, `data`, and `ops` (`server/db/dashboard.ts:954`, `server/db/dashboard.ts:956`, `server/insights/types.ts:3`).
- Admin Health already incorporates trust score as a penalty driver and links security trust drops to `/security` (`server/insights/health.ts:63`, `server/insights/health.ts:67`, `server/insights/health.ts:75`, `server/insights/health.ts:102`).

## 2. Gaps, mock & broken parts
- The page calls itself a security posture monitor for credential leaks, owner sprawl, and agent budget caps, but it does not cover CSPM, ASPM, CVE, SAST/DAST/SCA, container image, dependency, or secret scanning beyond DB metadata/audit text patterns (`app/routes/SecurityPage.tsx:292`, `server/insights/scanners/security.ts:42`, `server/insights/scanners/security.ts:73`, `/root/DASHBOARD_V5_PLAN.md:360`, `/root/DASHBOARD_V5_PLAN.md:364`, `/root/DASHBOARD_V5_PLAN.md:370`).
- There are no `/security/posture`, `/security/vulnerabilities`, or `/security/secrets` frontend routes today; `App.tsx` registers only `/security`, then later unrelated routes (`app/App.tsx:122`, `app/App.tsx:125`, `app/App.tsx:212`).
- The router exposes only `GET /api/security/posture` and `GET /api/security/trust-score`; there are no vulnerability/secrets/posture-detail API routes in the security block (`server/api/router.ts:499`, `server/api/router.ts:503`).
- Security findings do not display stored AI reasoning even though `/api/insights` returns `aiAnalysis`; the Security page renders `plainSummary` and evidence only (`server/api/insights.ts:90`, `server/api/insights.ts:92`, `app/routes/SecurityPage.tsx:400`, `app/routes/SecurityPage.tsx:407`).
- Trust score is separate from Admin Health and insight severity in the UI; Admin Health consumes trust score but `/security` does not show which security findings are dragging the global score down (`server/insights/health.ts:67`, `server/insights/health.ts:102`, `app/routes/SecurityPage.tsx:330`, `app/routes/SecurityPage.tsx:334`).
- Improvement actions are shown as trust-score rows, not as the same readability contract used by insights; this creates two action patterns on one page (`app/routes/SecurityPage.tsx:114`, `app/routes/SecurityPage.tsx:139`, `app/routes/SecurityPage.tsx:160`, `app/routes/SecurityPage.tsx:385`).
- High-risk approval handling is not visible on the Security page: applying a high-risk insight can create an approval request, but the UI message path only displays returned text and does not link to the approval (`server/api/insights.ts:170`, `server/api/insights.ts:186`, `app/routes/SecurityPage.tsx:227`, `app/routes/SecurityPage.tsx:322`).
- Owner-sprawl remediation points to `/settings`, while the actual role-binding governance module is under `/governance`; this reinforces the governance naming collision (`server/insights/scanners/security.ts:126`, `server/insights/scanners/security.ts:129`, `app/App.tsx:173`).
- No scanner produces OWASP LLM-specific risks such as prompt injection, sensitive information disclosure, excessive agency, system prompt leakage, vector weaknesses, or model DoS; current checks are limited to access/secret/budget state (`server/insights/scanners/security.ts:33`, `server/insights/scanners/security.ts:42`, `server/insights/scanners/security.ts:73`, `server/insights/scanners/security.ts:105`, `server/insights/scanners/security.ts:170`).
- The page lacks asset inventory, owner, SLA, age, affected surface, remediation status, and verification-rescan fields; finding cards render only title/summary/evidence/action (`app/routes/SecurityPage.tsx:385`, `app/routes/SecurityPage.tsx:396`, `app/routes/SecurityPage.tsx:400`, `app/routes/SecurityPage.tsx:407`, `app/routes/SecurityPage.tsx:419`).
- The security model is not zero-config for unknown AI systems: the scheduler imports aggregate/security/registry/budget/anomaly/sentinel/ops scanners but no discovery scanner, `runSecurityScan` only checks DB/governance/audit tables, and the only host inventory in the live code is the hardcoded MIMULE service/container/timer list in `system.ts`, so exposed model endpoints or shadow API keys outside those sources are blind spots (`server/insights/scheduler.ts:1`, `server/insights/scheduler.ts:8`, `server/insights/scanners/security.ts:42`, `server/insights/scanners/security.ts:73`, `server/insights/scanners/security.ts:159`, `server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- There is no "scan now" button scoped to security; `securityPostureHandler` runs a scan on GET, and the page refreshes polling, but the operator cannot trigger a labelled audited security scan from the page (`server/api/security.ts:30`, `app/routes/SecurityPage.tsx:201`, `app/routes/SecurityPage.tsx:276`).

## 3. Goal alignment (G1–G9)
- G1: Keep current good/error states, but split the growing page into stable security views without labs copy.
- G2: Add GUI actions for security scan, rotate/revoke secret, reduce owner access, open access review, set budget, and export evidence.
- G3: Do not show fake CVEs or scanner results. New vulnerability/secrets pages must be empty-state honest until a real scanner/source exists.
- G4: Expand detection catalog to secrets exposure, stale privileged roles, suspicious audit activity, CVE/source dependency findings, model/LLM security risks, and compliance control gaps.
- G4: Detect unknown AI systems, exposed model endpoints, and shadow AI-provider keys even when no operator registered them first.
- G5: Severity-sorted inbox first; filters by `Secrets`, `Identity`, `Agent`, `Budget`, `Audit`, `LLM`, `Dependency`.
- G6: Low-risk re-scan/ack/auto-resolve can be automatic; role/secret/budget changes require one Apply with reason and audit.
- G7: AI root-cause/recommended-action appears before evidence for every security finding.
- G8: Security Center should be sellable as a stand-alone security operations module while plugging into Admin Health and Compliance.
- G9: On first install in any environment, security posture must be built from discovery and real scans, with no dependency on MIMULE service names and no mock vulnerabilities.

## 4. Best-practice research
- Use NIST CSF 2.0: map security to Govern, Identify, Protect, Detect, Respond, Recover so posture is not just "findings" but risk ownership and recovery workflow: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf.
- Use OWASP Top 10 for LLM Applications 2025 as the AI-specific security taxonomy: prompt injection, sensitive disclosure, supply chain, model DoS, excessive agency, etc.: https://owasp.org/www-project-top-10-for-large-language-model-applications/.
- Use identity security patterns from Entra PIM/access reviews: recurring review, least-privilege recommendations, privileged role auditing, and evidence of review: https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview.
- Use modern security-center layout: one score, active criticals, asset inventory, finding age/SLA, exploitability/business-context prioritization, remediation owner, one-click or auto-remediate path, evidence export.
- "Great" for this page: an operator sees "2 critical risks, one secret leak, one owner sprawl", reads AI cause/action first, clicks Apply, gets an approval when needed, then sees audit/evidence update.

## 5. Target design
- IA: `/security` becomes landing with Security Score, Admin Health impact, critical findings, scanner coverage, recent auto-resolves; sub-tabs link to `Posture`, `Vulnerabilities`, `Secrets`, `Identity`, `LLM Security`, `Audit Signals`.
- Findings: use the same insight card contract as `/insights`: severity, asset, AI summary/root cause/recommended action, evidence, risk tier, Apply/Approval/Auto-resolved, Snooze/Ack/Re-analyze.
- Trust score: fold into Security Score module and show drivers mapped to findings; do not keep separate improvement actions that bypass insight cards.
- Secrets: inventory from governance secrets plus scanner-derived exposure signals; add rotate/revoke/test actions and verification scan.
- AI Inventory: security owns the exposure lens for discovered assets; unregistered AI systems appear with exposure, auth, listening interface, credential-source, owner status, and `Register`, `Ignore`, `Re-scan` controls.
- Identity: privileged owner list, stale access, unregistered actors from registry scanner, access review campaign.
- Vulnerabilities: honest empty state until a real dependency/CVE scanner exists; when added, use CVE, package/image, severity, exploitability, owner, fix version.
- LLM Security: prompt-injection tests, excessive agency checks, sensitive output leakage checks, tool-call boundary checks, linked to model/gateway traces.
- Mobile: summary cards stack, filters become segmented controls, finding cards have full-width action bars.

## 6. Features to add (prioritized)
- MUST: Display `aiAnalysis` on Security findings; acceptance: summary/root cause/recommended action is above evidence for every card with analysis, and Re-analyze is available.
- MUST: Unify trust improvements with insight cards; acceptance: every actionable trust delta has a backing insight or manual page link.
- MUST: Security scan action; acceptance: button calls audited `POST /api/insights/scan` or new `POST /api/security/scan`, shows last scan status.
- MUST: Security Center tabs/routes; acceptance: `/security` links to posture/vulnerabilities/secrets without dead routes.
- MUST: Secrets view; acceptance: weak secret and audit-leak findings deep-link to the relevant secret/audit row, no plaintext.
- MUST: Identity risk view; acceptance: owner count, unregistered actors, ownerless agents, stale access reviews.
- MUST: Universal AI security discovery findings; acceptance: discovery emits standard security insights for `unregistered-ai-system`, `exposed-model-endpoint`, and `shadow-api-key`, each with AI analysis, evidence refs, asset fingerprint, Register/Ignore/Re-scan actions, and severity based on exposure/auth.
- MUST: Zero-config security state; acceptance: with none of the MIMULE services present, `/security` shows scanner coverage and an empty discovered-asset state rather than fixed `newsbites`/`litellm` assumptions or fabricated CVEs.
- SHOULD: LLM security scanner; acceptance: emits `domain=security` insights for prompt-injection regression, system-prompt leakage, excessive agency/tool boundary risk, model DoS/cost abuse.
- SHOULD: Security evidence export; acceptance: bundle includes findings, AI analysis, audit rows, scanner times, remediation outcomes.
- EXTRA: "Attack path" mini graph; acceptance: secret/role/agent/gateway links render as a compact chain from issue to blast radius.

## 7. Sellable-in-parts
- Standalone pitch: "Unified Security Center for AI-operated systems: identity, secrets, LLM risks, findings, remediation, evidence, and audit in one self-hosted dashboard."
- Suite fit: security findings lower Admin Health, flow into `/insights`, pull access controls from `/governance`, and feed evidence into `/compliance`.
- Packaging boundary: can be sold without editorial pages if it keeps scanner framework, insight store, executor, audit, and secrets/identity modules.

## 8. Backend work
- Extend `server/insights/scanners/security.ts` into focused sub-scanners or add `server/insights/scanners/security/{identity,secrets,llm,vulnerability}.ts`.
- Add `POST /api/security/scan` as an audited explicit scan wrapper around security/registry/LLM scanners.
- Add `GET /api/security/score`: combine trust score, open security insight severity, scanner coverage/staleness, and unresolved critical age.
- Add `GET /api/security/assets`: inventory agents, gateway keys, services, secrets metadata, privileged users.
- Add Phase 4a discovery backend: `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts`, `server/insights/scanners/discovery.ts`, `discovered_assets`, and security endpoints/filters for exposed/unregistered assets.
- Add `POST /api/discovery/rescan`, `POST /api/discovery/assets/:id/register`, and `POST /api/discovery/assets/:id/ignore` behind auth/mutation checks; security uses them for one-click Register/Ignore/Re-scan on `unregistered-ai-system`, `exposed-model-endpoint`, and `shadow-api-key` cards.
- De-hardcode `server/adapters/system.ts` inventory constants into seed hints so security coverage is not limited to `CRITICAL_SERVICES`, `DOCKER_CONTAINERS`, or `KNOWN_TIMERS` (`server/adapters/system.ts:8`, `server/adapters/system.ts:18`, `server/adapters/system.ts:118`).
- Add LLM security scanner sources from gateway traces/prompts/model evals only after verifying existing tables/modules; emit standard `Insight` rows.
- Add optional vulnerability ingestion table only when a real scanner integration exists; otherwise keep empty state and do not create fake CVEs.
- Executor actions: `mutate-policy:role:<userId>:downgrade`, `mutate-policy:secret:<name>:rotate`, `start-job:security:scan`, `start-job:llm-security:eval`.
- Documentation the builder updates: `/root/DASHBOARD_V5_PLAN.md` Phase 17 status, `/home/agent/MIMULE_MASTER_PLAN_V3.md`, and this plan with implemented scanner inventory.

## 9. Build slices
- Slice 1: AI-first finding cards. Files: `app/routes/SecurityPage.tsx`, `server/api/security.ts` if response needs AI fields. Validate with `bun run typecheck`.
- Slice 2: Explicit scan + score. Files: `server/api/security.ts`, `server/api/router.ts`, `app/routes/SecurityPage.tsx`, `server/api/security.test.ts`.
- Slice 3: Security IA tabs with honest empty states. Files: `app/routes/SecurityPage.tsx`, new route components if needed, `app/App.tsx`, `app/lib/navRegistry.ts`.
- Slice 4: Identity/secrets detail drawers. Files: `server/insights/scanners/security.ts`, `server/insights/scanners/registry.ts`, `app/routes/SecurityPage.tsx`, `app/routes/GovernancePage.tsx` link targets.
- Slice 5: LLM security scanner. Files: `server/insights/scanners/security.ts` or new scanner, tests, `server/insights/scheduler.ts`, Security page.
- Slice 6: Evidence export. Files: `server/api/security.ts`, `server/compliance` integration, `app/routes/SecurityPage.tsx`.

## 10. Verification
- `/security` renders with no mock rows and no dead links.
- Every security finding shows AI analysis or a clear "analysis pending" state before raw evidence.
- `GET /api/security/posture`, `GET /api/security/trust-score`, and security scan action require auth.
- Seeded weak secret, owner sprawl, log-only policy, and missing budget cap create expected findings and auto-resolve when fixed.
- G4/G9: an unknown AI process/port/container appears as `unregistered-ai-system`; an unauthenticated model API appears as `exposed-model-endpoint`; an AI-provider key found outside the managed vault appears as `shadow-api-key`; Register moves the asset into managed inventory and clears or updates the finding.
- G4/G9: on a host with no MIMULE services/containers/timers, `/security` shows real empty scanner coverage, no hardcoded inventory rows, no crash, and no mock vulnerabilities.
- High-risk remediation opens approval; medium remediation applies through one Apply with reason; all write `action_audit`.
- Admin Health security driver links to the exact filtered security finding.
- Mobile screenshots show usable cards/actions at iPhone/tablet/desktop widths.
