# /install — Product Plan
> One-line: the first-run onboarding and readiness wizard for making the admin center safe, connected, and operable.

## 1. Today (verified, with file:line)
- Frontend route: `/install` renders `InstallWizardPage` (`app/App.tsx:178`-`app/App.tsx:180`); nav marks it labs and experimental (`app/lib/navRegistry.ts:45`).
- The wizard stores step/done state in browser localStorage (`app/routes/InstallWizardPage.tsx:7`-`app/routes/InstallWizardPage.tsx:15`) and redirects to `/` when done (`app/routes/InstallWizardPage.tsx:24`-`app/routes/InstallWizardPage.tsx:28`).
- Steps cover operator token, model provider, first project, and done (`app/routes/InstallWizardPage.tsx:84`-`app/routes/InstallWizardPage.tsx:213`).
- Token step posts `PATCH /api/settings/state` with `operator_token_set: "true"` (`app/routes/InstallWizardPage.tsx:35`-`app/routes/InstallWizardPage.tsx:48`).
- Provider step only advances local state; it does not persist provider/key/base URL (`app/routes/InstallWizardPage.tsx:50`-`app/routes/InstallWizardPage.tsx:52`, `app/routes/InstallWizardPage.tsx:127`-`app/routes/InstallWizardPage.tsx:168`).
- Project detect posts `/api/projects/detect` without a body (`app/routes/InstallWizardPage.tsx:54`-`app/routes/InstallWizardPage.tsx:65`); backend requires `repoPath` (`server/api/projects.ts:111`-`server/api/projects.ts:122`).
- Project create posts `{ path: projectPath }` to `/api/projects` (`app/routes/InstallWizardPage.tsx:67`-`app/routes/InstallWizardPage.tsx:80`); backend requires `id` and `tenantId` (`server/api/projects.ts:32`-`server/api/projects.ts:65`).
- Backend onboarding APIs exist separately: `/api/onboarding/status` and `/api/onboarding/step` (`server/api/router.ts:1383`-`server/api/router.ts:1388`), using `operator_state` (`server/api/onboarding.ts:14`-`server/api/onboarding.ts:50`, `server/api/onboarding.ts:53`-`server/api/onboarding.ts:105`).
- Current readiness: 🔴 mock-broken/labs; visible controls do not wire to the real backend contract.

## 2. Gaps, mock & broken parts
- Token save endpoint is wrong: router supports `GET /api/settings/state` and `PUT /api/settings/state/:key`, not `PATCH /api/settings/state` (`server/api/router.ts:905`-`server/api/router.ts:914`).
- Operator token cannot be set safely from a browser by writing `operator_token_set`; actual auth status reads `process.env.OPERATOR_TOKEN` (`server/api/settings.ts:85`-`server/api/settings.ts:107`).
- Provider/API key/base URL fields are collected but never persisted (`app/routes/InstallWizardPage.tsx:50`-`app/routes/InstallWizardPage.tsx:52`).
- Project detect and create payloads do not match backend requirements (`app/routes/InstallWizardPage.tsx:54`-`app/routes/InstallWizardPage.tsx:80`, `server/api/projects.ts:41`-`server/api/projects.ts:52`, `server/api/projects.ts:111`-`server/api/projects.ts:122`).
- Wizard completion is browser-local only (`app/routes/InstallWizardPage.tsx:7`-`app/routes/InstallWizardPage.tsx:15`), while backend onboarding state already exists in `operator_state` (`server/api/onboarding.ts:14`-`server/api/onboarding.ts:17`).
- Cross-page blocker to call out: install should not write system configuration through `/api/system-config` until the settings persistence gap is fixed (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: no dead first-run controls; every step verifies real system state.
- G2: setup token status, DB, LiteLLM, tunnel, channels, backup, and detectors from GUI.
- G3: remove local-only completion and fake token/provider persistence.
- G4: first-run checks double as the auth/config self-check detector.
- G5: one onboarding checklist with clear pass/fail/retry and deep-links to fixing pages.
- G6: safe checks run automatically; risky writes require one Apply and audit.
- G7: AI explains failed readiness checks and recommended fix before raw command output.
- G8: polished install wizard that can sell the product.

## 4. Best-practice research
- Microsoft admin readiness/service health patterns favor a central place to see health, history, and next action: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- Google SRE golden signals should inform readiness checks for traffic, latency, errors, and saturation: https://sre.google/sre-book/monitoring-distributed-systems/
- OWASP logging guidance means onboarding changes and access/security failures must be logged and auditable: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST AI RMF supports setup gates for AI systems around governance, mapping, measurement, and management: https://www.nist.gov/itl/ai-risk-management-framework

## 5. Target design
- Layout: readiness checklist first, then guided setup sections: Auth, Database, Model Gateway, Channels, Projects, Backup/Timers, Public Status, Finish.
- Components: `ReadinessCheckList`, `SetupStepCard`, `SecretPresenceCheck`, `ModelGatewayCheck`, `ChannelTest`, `ProjectOnboarder`, `FinishGate`.
- States: each check has pending/pass/fail/warn/skipped, source, retry, and link to settings/governance/infra.
- Mobile parity: one column cards, sticky Continue, no tiny stepper-only navigation.
- AI reasoning appears for failures: likely cause, safest fix, GUI action, and CLI fallback only as last resort.
- Actions: checks auto-run; saves are single Apply; secrets/token setup should show instructions and verification, not fake browser persistence.

## 6. Features to add (prioritized)
- MUST: replace localStorage completion with backend `/api/onboarding/status` and `/api/onboarding/step`; acceptance: completion survives browser/device changes.
- MUST: fix token step to verify `OPERATOR_TOKEN` status and show secure setup instructions; acceptance: no fake token write.
- MUST: fix project detect/create payloads or remove project step until backend contract is satisfied.
- MUST: add readiness checks for dashboard DB, LiteLLM, model health, channels, backups, cloudflared, public status, and insights scheduler.
- SHOULD: first-run channel test and digest preview.
- SHOULD: onboarding insight detector for incomplete/unsafe setup.
- EXTRA: "one-click readiness report" exporting setup proof to `/reports`.

## 7. Sellable-in-parts
- Standalone pitch: "Guided installation and readiness validation for self-hosted AI admin centers."
- Suite fit: it seeds `/settings`, `/models`, `/channels`, `/projects`, `/status`, and `/insights`.
- It should become hidden or "re-run setup" after completion, with failed readiness checks feeding `/insights`.

## 8. Backend work
- Expand `server/api/onboarding.ts` to return explicit checks with ids, status, severity, source, fix link, and last checked time.
- Add `POST /api/onboarding/check/:id` or `POST /api/onboarding/checks/run` for safe rechecks.
- Wire completion to `operator_state`; keep localStorage only as a cosmetic cache if needed.
- Add project onboarding endpoint that accepts the wizard shape or update wizard to send `id`, `tenantId`, `name`, and `repoPath`.
- Add executor/audit actions for any mutating setup step.
- Add auth/config self-check scanner in insights.

## 9. Build slices
- Slice 1: backend readiness model and frontend load from `/api/onboarding/status`.
- Slice 2: fix/remove broken token/provider/project steps.
- Slice 3: add readiness checks and retry actions.
- Slice 4: completion gates, insights detector, and reports export.
- Validation: `bun run typecheck`, onboarding API tests, browser smoke for fresh/localStorage-cleared session.
- Documentation to update: install guide, secure token setup, first-run checklist, `/root/DASHBOARD_V5_PLAN.md` Phase 13 status.

## 10. Verification
- Fresh browser shows backend onboarding state, not only localStorage.
- Every wizard button hits a registered API route with a matching payload.
- Token/provider secrets are not falsely persisted from the browser.
- Project detect/create succeeds or displays a precise backend validation error.
- Completion persists in `operator_state` and can be reset from GUI.
- Failed readiness checks create actionable insights with AI explanation.
- Mobile setup is fully usable with no dead controls.
