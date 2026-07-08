# Month 11 — Productization: Pricing, Telemetry, Onboarding, Cloud Tier

**Theme**: Turn the install into a product with a price and a learning path.
**Source**: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` §Month 11
**Baseline**: 232 pass / 0 fail · 0 TS errors (2026-05-17)

---

## Phase 1 — Licensing System

- [x] Create `server/licensing/` module directory with `types.ts`, `index.ts`
- [x] Define tier enum: `solo | team | enterprise | cloud` in `server/licensing/types.ts`
- [x] Implement `LicenseKey` interface: `{ tier, tenantId, issuedAt, expiresAt, features[], signature }`
- [x] Implement `verifyLicense(keyPath)` — reads signed JSON file, verifies HMAC-SHA256 signature, returns tier
- [x] Implement `getActiveLicense()` — reads `BUILDER_LICENSE_PATH` env or default `~/.builder/license.key`; returns `solo` tier when no file present (unlicensed default)
- [x] Implement `isFeatureEnabled(feature)` — gates features by tier: `sso`, `audit-export`, `data-residency`, `4-eyes`, `telemetry`, `cloud-tier`
- [x] Implement `generateLicenseKey(tier, tenantId, secret)` — CLI helper to mint a signed key (Team/Enterprise only)
- [x] Add `GET /api/licensing/status` — returns current tier, features, expiry; wire in `server/api/router.ts`
- [x] Add `server/licensing/licensing.test.ts` — verify/generate round-trip, feature gates per tier, offline operation, missing-file → solo

## Phase 2 — Telemetry (opt-in)

- [x] Create `server/telemetry/` module with `types.ts`, `index.ts`
- [x] Define `TelemetryEvent` type: `{ event, version, tier, featureFlags[], anonymousId }` — no traces, no code, no plan text
- [x] Implement `collectTelemetryPayload()` — gathers: builder run count, pass success/fail rates, model usage histogram; strips all PII
- [x] Implement `shipTelemetry(endpoint)` — POST JSON to configured endpoint; no-op when opt-out
- [x] Implement `getTelemetryConsent()` / `setTelemetryConsent(bool)` — stored in `operator_settings`
- [x] Add `GET /api/telemetry/preview` — returns the exact payload that would be shipped; wire in router
- [x] Add `POST /api/telemetry/consent` — sets opt-in/out; wire in router
- [x] Add `server/telemetry/telemetry.test.ts` — payload shape (no sensitive fields), consent toggle, preview endpoint

## Phase 3 — Onboarding Wizard Backend

- [x] Add `GET /api/onboarding/status` — returns `{ completed, currentStep, hostInfo: { os, agents[], modelCount } }`; wire in router
- [x] Add `POST /api/onboarding/step` — advances step, validates inputs, stores progress in `operator_settings`; wire in router
- [x] Add `server/api/onboarding.test.ts` — status endpoint, step advance, completion flag
- [x] `app/routes/InstallWizardPage.tsx` exists as the onboarding UI (created by prior pass)
- [x] `app/routes/SettingsPage.tsx` exists (created by prior pass)

## Phase 4 — Settings Page: License + Telemetry Panels

- [x] `app/routes/SettingsPage.tsx` exists with tabs
- [x] Ensure SettingsPage has a **License** tab: shows tier badge, expiry, feature list, file path input
- [x] Ensure SettingsPage has a **Telemetry** tab: opt-in toggle, "Preview payload" inline JSON viewer
- [x] Wire `/settings` route in `app/App.tsx` if not already present in `app/App.tsx` if not already present
- [x] Add Settings nav entry in `app/components/DashSidebar.tsx` if not already present

## Phase 5 — Golden-Path Tutorials

- [x] Create `docs/tutorials` directory/` directory
- [x] `docs/tutorials/01-first-builder-run.md` — create workflow, run, read results
- [x] `docs/tutorials/02-scheduled-doctor.md` — set up nightly doctor review on a project
- [x] `docs/tutorials/03-policy-and-approval.md` — configure 4-eyes approval gate + SSO requirement
- [x] `docs/tutorials/04-custom-validator.md` — write a custom validation command
- [x] `docs/tutorials/05-publishing-a-skill.md` — package and publish a skill bundle
- [x] Add `GET /api/docs/tutorials` — returns list of tutorial metadata (title, slug, estimatedMinutes); wire in router

## Phase 6 — Cloud Tier Infra

- [x] `installer/` directory exists with install.sh, docker/, systemd/ (created by prior pass)
- [x] Create `infra/cloud-tier/README.md` — architecture overview: Hetzner CX22, Caddy, cloudflared, control-surface binary
- [x] Create `infra/cloud-tier/provision.sh` — hcloud create, install deps, configure env, start services
- [x] Create `infra/cloud-tier/customer.env.template` — OPERATOR_TOKEN, DASHBOARD_DB_PATH, LITELLM_URL, LICENSE_PATH
- [x] Add `GET /api/cloud-tier/status` — returns `{ supported, provisionedAt, instanceUrl }`; wire in router
- [x] Add `server/api/cloud-tier.test.ts` — status endpoint shape

## Phase 7 — Exit Criteria Validation

- [x] Confirm `GET /api/licensing/status` returns `{ tier: "solo" }` when no license file present
- [x] Confirm `GET /api/telemetry/preview` response contains no sensitive fields (no file paths, no plan content, no actor names)
- [x] Confirm `GET /api/onboarding/status` returns expected shape
- [x] Run full test suite: `bun run typecheck && DASHBOARD_DB=1 bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/` — 0 TS errors, ≥232 pass / 0 fail
- [x] Run `bun run build` — production build passes

---

**Total items**: 46


<!-- Builder run br_2a4af: success at 2026-05-17T13:17:18.261Z — details: /opt/ai-vault/builder/2026-05-17-bw_e952e-br_2a4af.md -->