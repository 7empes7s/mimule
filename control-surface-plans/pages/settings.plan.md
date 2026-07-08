# /settings — Product Plan
> One-line: the operator control panel for auth, access, licensing, telemetry, and persistent stack configuration.

## 1. Today (verified, with file:line)
- Frontend route: `/settings` renders `SettingsPage` inside the standard dashboard layout (`app/App.tsx:148`-`app/App.tsx:150`); nav marks it core (`app/lib/navRegistry.ts:32`).
- Frontend data sources: the page loads auth status, license, telemetry preview/consent, system config, config history, and access users in one `Promise.all` (`app/routes/SettingsPage.tsx:171`-`app/routes/SettingsPage.tsx:196`).
- UI surface: tabs cover Auth & Stack, Access, License, Telemetry, Finance Agent, Pipeline Stages, Alert Thresholds, Auto-publish/Approval, and Config History (`app/routes/SettingsPage.tsx:140`-`app/routes/SettingsPage.tsx:152`).
- Access management is real: the page invites users and changes roles through `/api/settings/access/invite` and `/api/settings/access/users/:id/role` (`app/routes/SettingsPage.tsx:304`-`app/routes/SettingsPage.tsx:339`), and backend writes users, local credentials, role bindings, and audit rows (`server/api/settings.ts:175`-`server/api/settings.ts:236`, `server/api/settings.ts:239`-`server/api/settings.ts:278`).
- System config is mock-broken: GET always returns the hard-coded default config (`server/api/systemConfig.ts:6`-`server/api/systemConfig.ts:70`), PUT validates/logs but has `TODO: Actually persist the config` (`server/api/systemConfig.ts:89`-`server/api/systemConfig.ts:99`), and history returns mock rows (`server/api/systemConfig.ts:112`-`server/api/systemConfig.ts:140`).
- Backend routes exist for `/api/system-config`, PUT `/api/system-config`, and `/api/system-config/history` (`server/api/router.ts:803`-`server/api/router.ts:810`).
- Schema support already exists: `system_configs` and `config_changes` tables are created in the dashboard DB (`server/db/dashboard.ts:1371`-`server/db/dashboard.ts:1390`).
- Current readiness: 🔴 mock-broken for config persistence; 🟡 partial overall because access/licensing/telemetry/auth status exist but the most dangerous controls do not survive restart.

## 2. Gaps, mock & broken parts
- Settings do not survive restart: `updateSystemConfig` only logs and returns success (`server/api/systemConfig.ts:89`-`server/api/systemConfig.ts:99`).
- Config history looks real but is fake: `getSystemConfigHistory` returns hard-coded mock entries (`server/api/systemConfig.ts:115`-`server/api/systemConfig.ts:138`).
- The UI shows success via `alert()` after any OK response but does not reload server state, show a diff, or verify persistence (`app/routes/SettingsPage.tsx:218`-`app/routes/SettingsPage.tsx:237`).
- Widget preferences explicitly say server-side persistence is "coming" (`app/routes/SettingsPage.tsx:393`-`app/routes/SettingsPage.tsx:400`).
- Action allowlists are described as server-code-only and deploy-gated (`app/routes/SettingsPage.tsx:426`-`app/routes/SettingsPage.tsx:434`), which conflicts with the V5 goal for GUI control of routine policy.
- The page tries to fetch `/var/lib/mimule/workspace-registry.json` directly from the browser (`app/routes/SettingsPage.tsx:203`-`app/routes/SettingsPage.tsx:215`), which will not work as a normal API-backed production pattern.

## 3. Goal alignment (G1–G8)
- G1: make every tab resilient with typed loading/error/empty states and no browser-only file fetches.
- G2: move routine operator controls, auto-apply policy, notification thresholds, and model routing overrides into GUI-backed persisted settings.
- G3: remove all mock config/history paths before calling the page core.
- G4: add config self-check detectors for unset token, unsafe auth mode, stale settings write failures, and invalid logical model names.
- G5: split "Stack", "Access", "Automation Policy", "Pipeline", and "Change History" into obvious subareas with severity banners when config is not durable.
- G6: settings changes use a single Apply button, safe defaults auto-validate, high-risk changes require confirm/approval.
- G7: every risky change shows AI-generated impact analysis before Apply: root cause, blast radius, rollback path.
- G8: make this a sellable admin-center Settings module, not a mixed maintenance page.

## 4. Best-practice research
- Adopt an admin-center change review pattern: staged edits, diff, validation, apply, audit, revert. Microsoft 365 service/admin guidance emphasizes health, incident communication, and visible service state as first-class admin-center concepts: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- Treat settings changes as auditable security events. OWASP logging guidance centers useful event attributes and security-relevant events for investigation: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Use SRE golden signals for thresholds and config validation: latency, traffic, errors, saturation from Google SRE: https://sre.google/sre-book/monitoring-distributed-systems/
- For AI policy and model choices, align settings categories to NIST AI RMF Govern/Map/Measure/Manage so the page is explainable to customers: https://www.nist.gov/itl/ai-risk-management-framework

## 5. Target design
- Layout: top health strip for "Settings durability", "auth mode", "last config change", and "pending risky changes"; left tabs or responsive segmented nav; right-side sticky change summary on desktop, inline summary on mobile.
- Key components: `SettingsDiffPanel`, `RiskChangeBanner`, `ConfigHistoryTimeline`, `RevertConfigModal`, `LogicalModelSelect`, `AccessRoleMatrix`, and `AutomationPolicyEditor`.
- States: no raw `alert()`; use inline success/error banners, optimistic disabled Apply while saving, and a persistence verification row after save.
- Mobile parity: all inputs at least 44px high, no table-only role editor, collapsed history cards, sticky Apply at bottom.
- AI reasoning appears before raw config: "What changes and why it matters" generated from the diff, with root cause, affected services, and rollback.
- Actions: validation can run automatically; Apply is one button; revert is one button from history; owner-level/high-risk changes can route through approvals.

## 6. Features to add (prioritized)
- MUST: wire `/api/system-config` to `system_configs` and `/api/system-config/history` to `config_changes`; acceptance: save, restart service in a controlled test, reload, and the value/history remain.
- MUST: add schema-aware validation for logical model names, timeouts, threshold ranges, and auto-publish verticals; acceptance: invalid edits cannot be applied and show field-level reasons.
- MUST: add diff-before-apply and audit rows for every settings mutation; acceptance: `action_audit` links to the `config_changes` row.
- MUST: remove direct browser fetch of `/var/lib/mimule/workspace-registry.json`; acceptance: a proper API returns workspace registry or a documented empty state.
- SHOULD: move action allowlist/auto-apply policy into a persisted GUI policy editor; acceptance: toggles persist, audit, and drive `server/insights/autoapply.ts`.
- SHOULD: add config self-check insights for token/dev mode, missing secrets, invalid model names, and non-persistent settings.
- EXTRA: "simulate this change" preview showing affected detectors, channels, model routes, and cost budget before Apply.

## 7. Sellable-in-parts
- Standalone pitch: "AI Admin Settings & Policy Center" for teams that need persistent, auditable configuration, RBAC, model routing policy, automation controls, and rollback.
- Suite fit: it becomes the control plane behind `/insights`, `/channels`, `/reports`, `/models`, `/gateway`, and `/install`.
- It should link to `/audit` for every mutation, `/governance` for role policy, `/channels` for notification routing, and `/reports` for config change exports.

## 8. Backend work
- Change `GET /api/system-config` to read a canonical key such as `system_config:current` from `system_configs`; keep default config only as seed/fallback.
- Change `PUT /api/system-config` to validate, diff old/new, transactionally write `system_configs` and `config_changes`, then write `action_audit`.
- Change `GET /api/system-config/history` to page real `config_changes`, including actor, diff summary, note, and optional revert metadata.
- Add `POST /api/system-config/revert` using an audited executor action, reusing `config_changes.old_value_json`.
- Prefer existing tables `system_configs`, `config_changes`, `action_audit`, `operator_state`, `governance_role_bindings`, and `users`; no new schema for basic persistence.
- Add insight detector `config_self_check` that deep-links to `/settings?tab=auth` or `/settings?tab=history`.

## 9. Build slices
- Slice 1: backend persistence in `server/api/systemConfig.ts` using `server/db/dashboard.ts`; tests in `server/api/systemConfig.test.ts`.
- Slice 2: frontend diff/apply/history/revert in `app/routes/SettingsPage.tsx`; remove `alert()` and direct `/var/lib` browser fetch.
- Slice 3: settings detector and deep-links in `server/insights/scanners/ops.ts` or a new config scanner; surface in `/insights`.
- Slice 4: auto-apply policy editor that persists policy and audits changes.
- Validation: `bun run typecheck`, targeted API tests, and ephemeral browser smoke for save/reload/history.
- Documentation to update: `/root/DASHBOARD_V5_PLAN.md` Phase 7 status, operator runbook for settings rollback, API docs for `/api/system-config`.

## 10. Verification
- Saving finance, pipeline, alert, and approval settings changes DB rows in `system_configs` and `config_changes`.
- A controlled restart keeps the saved setting visible on `/settings`.
- Config history is empty only when the DB has no changes; otherwise it mirrors `config_changes`.
- Every mutation writes `action_audit` with actor, risk, target, request, result, and rollback hint.
- Invalid logical model names are rejected; valid names use logical routes such as `editorial-heavy`.
- A config self-check insight appears when auth/config is unsafe and links to the exact settings tab.
- Mobile viewport has no horizontal scroll and every settings action is touch-usable.
