# Month 12 — GA: Docs, Case Studies, Launch

**Theme**: Ship v1.0. Stable APIs. Public docs. First paying customers.
**Source**: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` §Month 12
**Baseline**: 248 pass / 0 fail · 0 TS errors (2026-05-17)

---

## Phase 1 — API Stability + v1 Versioning

- [x] Create `server/version.ts` (if not existing) with `VERSION = "1.0.0"` and `BUILD_HASH` from env
- [x] Add `GET /api/version` — returns `{ version, buildHash, apiVersion: "v1" }`; wire in router
- [x] Add `/v1/` prefix aliases for core API routes: builder, gateway, governance, licensing, telemetry, onboarding (forward to existing handlers)
- [x] Create `docs/api-stability.md` — documents the v1 freeze policy, semver rules, and migration path for breaking changes
- [x] Create `docs/workflow-definition.md` — frozen schema reference for workflow definition format (agentOrder, validationProfile, modelPolicy, riskPolicy, gitPolicy, backupPolicy)
- [x] Add `server/api/version.test.ts` — version endpoint shape, v1 prefix alias smoke test

## Phase 2 — Docs Site Content

- [x] Create `docs/quickstart.md` — 5-minute guide: install, first workflow, first run, read results
- [x] Create `docs/concepts/builder.md` — Builder pillar: passes, plan files, agentOrder, continuation, doctor mode
- [x] Create `docs/concepts/gateway.md` — Gateway pillar: model routing, health probes, fallback chains, cost ledger
- [x] Create `docs/concepts/governance.md` — Governance pillar: audit chain, approvals, SSO, data residency, retention
- [x] Create `docs/concepts/reasoner.md` — Reasoner pillar: anomaly detection, playbooks, auto-remediation
- [x] Create `docs/reference/api.md` — HTTP API reference (all `/api/*` routes, request/response shapes)
- [x] Create `docs/reference/cli.md` — CLI reference (install.sh flags, env vars)
- [x] Create `docs/reference/skill-manifest.md` — skill bundle format, manifest schema, signing
- [x] Create `docs/operations/backup-restore.md` — backup policy, restore procedure, DB migration
- [x] Create `docs/operations/upgrade.md` — upgrade procedure, config migration, rollback
- [x] Create `docs/operations/troubleshooting.md` — common failure modes, log locations, diagnostic commands
- [x] Create `docs/compliance/dpa.md` — Data Processing Agreement overview
- [x] Create `docs/compliance/security-overview.md` — threat model, key controls, audit chain
- [x] Create `docs/compliance/control-mapping.md` — SOC2-style control mapping

## Phase 3 — Case Studies

- [x] Create `docs/case-studies/newsbites-v4.md` — how the control surface built NewsBites V4: 12-month plan, builder runs, outcomes
- [x] Create `docs/case-studies/tib-markets.md` — TIB Markets buildout: gateway routing, editorial pipeline integration
- [x] Create `docs/case-studies/self-bootstrapping.md` — control-surface building itself: dogfood loop, M1–M12 journey

## Phase 4 — Examples Directory

- [x] Create `examples/` directory
- [x] Create `examples/hello-builder/` — minimal workflow: one opencode pass, echo validation, README
- [x] Create `examples/scheduled-doctor/` — nightly doctor review workflow with cron schedule
- [x] Create `examples/multi-agent-pipeline/` — 3-pass workflow: plan → build → review with fallback models
- [x] Create `examples/README.md` — index of examples with descriptions

## Phase 5 — Launch Artifacts

- [x] Create `docs/changelog.md` — v1.0.0 release notes: feature list, breaking changes from pre-v1, migration notes
- [x] Create `docs/launch/announcement.md` — HN/blog post draft: what we built, why, how to get started
- [x] Create `docs/launch/video-walkthrough.md` — script/outline for video walkthrough
- [x] Add v1.0 badge to `app/components/DashHeader.tsx` — show version string from `GET /api/version`
- [x] Create `docs/launch/design-partner-outreach.md` — template for reaching out to 5 design partners

## Phase 6 — Hardening Sprint

- [x] Review `server/api/router.ts` — add input validation (method check, content-type check, body size limit) at HTTP boundary
- [x] Add rate limiting to sensitive endpoints: `/api/licensing/status`, `/api/telemetry/consent`, `/api/onboarding/step` — max 30 req/min per IP
- [x] Review `server/governance/` — verify every error path returns a structured error (no stack traces in responses)
- [x] Create `docs/continuity-plan.md` — backwards compatibility policy, deprecation windows, support tiers

## Phase 7 — Parity Check + Exit Criteria

- [x] Run embedded vs standalone parity check: verify all routes return identical shapes when accessed via internal vs public URL
- [x] Confirm `GET /api/version` returns `{ version: "1.0.0", apiVersion: "v1" }`
- [x] Confirm `/v1/builder/workflows` aliases work (forward to existing handlers)
- [x] Run full test suite: `bun run typecheck && DASHBOARD_DB=1 bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/ server/licensing/ server/telemetry/` — 0 TS errors, ≥248 pass / 0 fail
- [x] Run `bun run build` — production build passes with v1.0 badge visible

---

**Total items**: 48


<!-- Builder run br_28e5e: failed at 2026-05-17T14:28:01.011Z — details: /opt/ai-vault/builder/2026-05-17-bw_d8919-br_28e5e.md -->

<!-- Builder run br_46842: success at 2026-05-17T15:33:16.502Z — details: /opt/ai-vault/builder/2026-05-17-bw_d8919-br_46842.md -->