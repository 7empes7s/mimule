# /marketplace — Product Plan
> One-line: the extension marketplace for operators who install, govern, run, and audit skills that extend agents, workflows, providers, validators, and notifications.

## 1. Today (verified, with file:line)
- Frontend component: `/marketplace` is routed to `MarketplacePage` in `app/App.tsx:175`, marked `labs` and `experimental` in `app/lib/navRegistry.ts:38`, and implemented in `app/routes/MarketplacePage.tsx:55`; readiness is 🔴 labs-broken.
- Data source: the page loads `/api/marketplace/skills` every 30 seconds in `app/routes/MarketplacePage.tsx:56`.
- Current UI: it has an "Install from Bundle" modal with bundle path and manifest JSON inputs in `app/routes/MarketplacePage.tsx:176`, `app/routes/MarketplacePage.tsx:195`, and `app/routes/MarketplacePage.tsx:204`.
- Current UI: skill run opens a modal, derives default input from manifest inputs, fetches recent runs, posts input JSON to `/api/marketplace/skills/:id/run`, and shows output/error/history in `app/routes/MarketplacePage.tsx:72`, `app/routes/MarketplacePage.tsx:86`, `app/routes/MarketplacePage.tsx:94`, `app/routes/MarketplacePage.tsx:101`, `app/routes/MarketplacePage.tsx:251`, and `app/routes/MarketplacePage.tsx:273`.
- Current UI: installed skills render status/kind/version/error and Run/Disable/Enable/Uninstall controls in `app/routes/MarketplacePage.tsx:311`, `app/routes/MarketplacePage.tsx:323`, `app/routes/MarketplacePage.tsx:348`, `app/routes/MarketplacePage.tsx:357`, `app/routes/MarketplacePage.tsx:366`, and `app/routes/MarketplacePage.tsx:374`.
- Backend routes: router exposes `GET /api/marketplace/skills`, `POST /api/marketplace/skills/install`, `DELETE /api/marketplace/skills/:id`, enable/disable/run/runs endpoints in `server/api/router.ts:1276`, `server/api/router.ts:1277`, `server/api/router.ts:1282`, `server/api/router.ts:1288`, `server/api/router.ts:1294`, `server/api/router.ts:1300`, and `server/api/router.ts:1306`.
- Backend persistence: `marketplace_skills` and `marketplace_skill_runs` tables exist in `server/db/dashboard.ts:859` and `server/db/dashboard.ts:876`.
- Backend registry: install validates manifest, hashes bundle, verifies signature, inserts a skill, and defaults status to active in `server/marketplace/registry.ts:15`, `server/marketplace/registry.ts:21`, `server/marketplace/registry.ts:22`, and `server/marketplace/registry.ts:30`.
- Backend runner: skill execution spawns `bun <entrypoint>`, injects skill env/input, enforces a 60s timeout, parses JSON stdout, and records runs in `server/marketplace/loader.ts:16`, `server/marketplace/loader.ts:23`, `server/marketplace/loader.ts:42`, and `server/marketplace/loader.ts:79`.

## 2. Gaps, mock & broken parts
- Install is broken: the frontend posts install to `/api/marketplace/skills` in `app/routes/MarketplacePage.tsx:146`, but the router only accepts `POST /api/marketplace/skills/install` in `server/api/router.ts:1277`.
- Disable and uninstall are conflated: `handleDisable` calls `DELETE /api/marketplace/skills/:id` in `app/routes/MarketplacePage.tsx:120`, `handleUninstall` calls the same endpoint in `app/routes/MarketplacePage.tsx:130`, and backend `uninstallSkill` only sets status to `disabled` in `server/marketplace/registry.ts:39`.
- Marketplace mutations do not write central `action_audit`; handlers install/delete/enable/disable/run in `server/api/marketplace.ts:37`, `server/api/marketplace.ts:60`, `server/api/marketplace.ts:74`, `server/api/marketplace.ts:88`, and `server/api/marketplace.ts:102` return data but do not audit.
- The install UX requires raw manifest JSON in `app/routes/MarketplacePage.tsx:205`; the run UX requires raw input JSON in `app/routes/MarketplacePage.tsx:243`; this is not acceptable as the primary sellable path.
- `loadSkill` spawns Bun with inherited environment in `server/marketplace/loader.ts:16` and only conditionally injects `OPERATOR_TOKEN` for `vault.read` in `server/marketplace/loader.ts:63`; there is no sandbox profile, egress policy, or per-permission runtime enforcement beyond environment.
- Run errors are stored, but a failed install/run does not create an insight or marketplace health finding.

## 3. Goal alignment (G1–G8)
- G1: fix install endpoint mismatch and separate disable/uninstall semantics.
- G2: install, enable, disable, run, revoke, update, and configure skills must be GUI-controllable.
- G3: no labs feel: signed bundle validation, schema-driven forms, run history, audit, and rollback must work.
- G4: detect unsigned/failed/stale/overprivileged skills and failing runs.
- G5: show unsafe, disabled, failing, and update-available skills first.
- G6: safe enable/disable/update can be one-click; privileged installs/runs require approval.
- G7: every skill risk should show AI explanation before manifest JSON.
- G8: make it a standalone extension marketplace for the agent/build platform.

## 4. Best-practice research
- Adopt app marketplace patterns: verified publisher, signature, permissions, version, changelog, install/update/uninstall lifecycle.
- Adopt OAuth/app-permission patterns: explicit scopes, consent screen, least-privilege warning, and revocation.
- Adopt plugin sandboxing: process isolation, timeout, env allowlist, filesystem/network policy, and output schema validation.
- Adopt schema-driven forms: manifest inputs generate forms, validation, examples, and output viewers.
- Adopt supply-chain controls: bundle hash, signature, provenance, vulnerability scan, and audit evidence.

## 5. Target design
- Header: installed skills, active skills, failing skills, high-permission skills, unsigned/blocked count, and recent runs.
- Marketplace list: skill cards with name, version, kind, publisher, status, permissions, signature status, last run, error, and actions.
- Install flow: upload/path picker, manifest preview, signature/provenance check, permission consent, dry-run validation, approval if high risk.
- Run flow: generated form from `manifest.inputs`, advanced JSON fallback, dry-run option, live output, run history, and audit link.
- Skill detail: manifest, permissions, versions, runs, logs, errors, dependents, action descriptors exposed, and related insights.
- Mobile: cards with action menus; no raw JSON primary path.

## 6. Features to add (prioritized)
- MUST: Fix install endpoint mismatch; acceptance: install from UI reaches router and persists installed skill.
- MUST: Separate disable vs uninstall; acceptance: disable keeps skill, uninstall removes/archive with confirmation and audit.
- MUST: Audit all marketplace mutations and runs; acceptance: install/enable/disable/uninstall/run records `action_audit`.
- MUST: Schema-driven input form; acceptance: manifest inputs render typed controls before JSON fallback.
- MUST: Permission consent and risk labels; acceptance: install/run shows scopes and high-risk warning.
- MUST: Marketplace insights; acceptance: failed skill runs, unsigned bundle, overprivileged skill, stale disabled skill create findings.
- SHOULD: Update/version management with changelog and rollback.
- SHOULD: Runtime sandbox policy per permission.
- EXTRA: Skill catalog search and recommended skills for Builder/Brainstorm/Agent Team gaps.
- EXTRA: "Test skill" harness with sample input/output contract.

## 7. Sellable-in-parts
- Standalone pitch: "A governed extension marketplace for AI operations: install signed skills, grant scoped permissions, run them safely, and audit everything."
- Buyer: platform teams extending AI gateways/builders without giving plugins unrestricted host access.
- Packaging: Skill Registry, Permission Consent, Runtime Sandbox, Run History, Extension Insights.
- Suite fit: skills can add builder validators, workflow skills, provider adapters, notification sinks, and governance actions; `/agents`, `/builder`, and `/workflows` consume them.

## 8. Backend work
- Change frontend or router so install uses one canonical endpoint, preferably `POST /api/marketplace/skills/install`.
- Add `DELETE /api/marketplace/skills/:id` as true uninstall/archive and keep `POST /disable` for disable.
- Add `PATCH /api/marketplace/skills/:id/config` for skill settings.
- Add `POST /api/marketplace/skills/:id/dry-run`.
- Add action/audit records for install, enable, disable, uninstall, run, dry-run, update.
- Add scanner for unsigned/invalid signature, high permissions, repeated run failures, stale disabled skills, and missing output schema.
- Strengthen loader: env allowlist, cwd sandbox, max stdout/stderr, optional network/filesystem policy, typed output validation.
- Reuse `marketplace_skills`, `marketplace_skill_runs`, `action_audit`, `insights`, `ai_analysis`.

## 9. Build slices
- Slice 1: Fix install route mismatch and tests in `app/routes/MarketplacePage.tsx`, `server/api/router.ts`, and `server/api/marketplace.ts`.
- Slice 2: Separate disable/uninstall and audit all mutations.
- Slice 3: Render manifest input schema as a form and keep JSON advanced mode.
- Slice 4: Add permission consent/risk panel and run audit links.
- Slice 5: Add marketplace scanner and insights integration.
- Slice 6: Add runtime sandbox hardening.
- Docs to update when implemented: marketplace user guide, skill manifest spec, permission model, API docs, action catalog, security model.

## 10. Verification
- Installing a valid signed bundle from UI succeeds and appears in the list.
- Invalid manifest/signature shows actionable error and does not persist.
- Disable, enable, uninstall, and run are distinct and audited.
- Manifest inputs render as form fields and submit equivalent JSON.
- Skill run timeout/error/success all record history and audit rows.
- High-permission or failing skills create insights with recommended actions.
