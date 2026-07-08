# Builder Platform Month 9 — Marketplace + Extensibility

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 9)
Related: `/root/BUILDER_MONTH8_DISTRIBUTION_PLAN.md`

---

## Theme

**Let users and us extend the platform without forking it.** Skills, adapters, and validators ship as signed bundles. A third-party can add a model backend, a new agent CLI, or a custom validator without touching core code.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules (do not break these):
- `server/db/dashboard.ts` — add new marketplace tables here via inline SQL
- `server/api/router.ts` — register new routes here
- `server/tenancy/context.ts` — `getTenantContext()` for all new endpoints
- `server/governance/` — existing policy/RBAC layer; skills must declare permissions checked here
- `app/App.tsx` — add `/marketplace` route
- `app/components/DashSidebar.tsx` — add Marketplace nav entry

**No new npm/bun packages.** Use only what's already in `package.json`.

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 0
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ 2>&1 | grep -E "pass|fail" | tail -3` → 135+ pass
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — Manifest Types + SQLite Tables

- [x] Define types in `server/marketplace/types.ts`:
  - `SkillKind`: `"provider-adapter" | "agent-adapter" | "validator-adapter" | "notification-sink" | "workflow-skill"`
  - `SkillPermission`: `"policy.execute_action" | "gateway.call" | "vault.read" | "vault.write" | "builder.spawn_pass" | "builder.read"`
  - `SkillManifest`: `{ name, version, description, kind: SkillKind, entrypoint: string, inputs: Record<string, unknown>, outputs: Record<string, unknown>, permissions: SkillPermission[], author?: string, homepage?: string, signature?: string }`
  - `InstalledSkill`: `{ id, tenantId, name, version, kind, manifestJson, bundlePath, bundleHash, installedAt, updatedAt, status: "active"|"disabled"|"error", errorMessage?: string }`
  - `SkillRunContext`: `{ skillId, tenantId, instanceId, permissions: SkillPermission[] }`
- [x] Add SQLite tables in `server/db/dashboard.ts`:
  - `marketplace_skills` (id TEXT PK, tenant_id TEXT, name TEXT, version TEXT, kind TEXT, manifest_json TEXT, bundle_path TEXT, bundle_hash TEXT, installed_at INTEGER, updated_at INTEGER, status TEXT, error_message TEXT)
  - `marketplace_skill_runs` (id TEXT PK, skill_id TEXT, tenant_id TEXT, instance_id TEXT, started_at INTEGER, finished_at INTEGER, status TEXT, output_json TEXT, error TEXT)
- [x] Create `server/marketplace/index.ts` barrel
- [x] Run typecheck + build

## Phase 2 — Registry + Manifest Parser

- [x] Implement `server/marketplace/manifest.ts`:
  - `parseManifest(yaml: string): SkillManifest` — parses YAML-like manifest (use JSON for v1 — manifest files are `.json`; skip YAML parser to avoid new deps); validates required fields; throws `ManifestError` on invalid
  - `validateManifest(m: SkillManifest): string[]` — returns array of validation errors (empty = valid); checks: name is slug, version is semver, entrypoint path does not escape bundle root (`../`), permissions are known values
- [x] Implement `server/marketplace/registry.ts`:
  - `installSkill(tenantId, bundlePath, manifest): InstalledSkill` — writes row to `marketplace_skills`; sets `bundle_hash` to SHA-256 of bundle dir contents
  - `uninstallSkill(id): void` — sets `status = "disabled"`
  - `getSkill(id): InstalledSkill | null`
  - `listSkills(tenantId): InstalledSkill[]`
  - `enableSkill(id)` / `disableSkill(id)`
- [x] Implement `server/marketplace/signer.ts`:
  - `hashBundle(bundlePath: string): string` — SHA-256 of sorted file contents under path using `Bun.file` + `crypto.createHash`
  - `verifySignature(manifest: SkillManifest, bundleHash: string): boolean` — for v1: if `manifest.signature` is absent, returns `true` (unsigned bundles allowed with warning); if present, checks `manifest.signature === bundleHash` (self-signed); logs warning if unsigned
- [x] Add tests in `server/marketplace/manifest.test.ts`: valid manifest parses; missing name throws; `../` in entrypoint fails validation; unknown permission fails validation
- [x] Run typecheck + tests + build

## Phase 3 — Loader + Permission Enforcement

- [x] Implement `server/marketplace/loader.ts`:
  - `loadSkill(skill: InstalledSkill, ctx: SkillRunContext): SkillRunner` — reads `skill.entrypoint` from the bundle path; for v1, entrypoint must be a `.ts` or `.js` file; returns a `SkillRunner` object with `run(input: unknown): Promise<unknown>`
  - `SkillRunner.run()` — spawns the entrypoint via `Bun.spawn(["bun", entrypointPath], { env: buildSkillEnv(ctx) })`; captures stdout/stderr; enforces 60s timeout; returns parsed JSON from stdout
  - `buildSkillEnv(ctx)` — builds env vars injected into skill process: `TIB_SKILL_ID`, `TIB_TENANT_ID`, `TIB_PERMISSIONS` (comma-separated), `TIB_INSTANCE_ID`; does NOT pass `OPERATOR_TOKEN` or any secret unless `vault.read` is in permissions
  - `checkPermission(ctx, required: SkillPermission): void` — throws `PermissionDeniedError` if `required` not in `ctx.permissions`
- [x] Wire permission check: before `gateway.call` in `server/gateway/router.ts`, check if caller is a skill run context and has `gateway.call` permission
- [x] Add tests in `server/marketplace/loader.test.ts`:
  - A skill with `gateway.call` permission can call the gateway mock
  - A skill without `policy.execute_action` gets `PermissionDeniedError` when it tries to execute an action
  - Skill timeout (61s mock) returns error status, not crash
- [x] Run typecheck + tests + build

## Phase 4 — Marketplace API Endpoints

- [x] Create `server/api/marketplace.ts`:
  - `GET /api/marketplace/skills` — list installed skills for tenant (from `registry.listSkills`)
  - `POST /api/marketplace/skills/install` — body: `{ bundlePath, manifestJson }`; parses manifest, verifies signature, calls `installSkill`; returns installed skill or error
  - `DELETE /api/marketplace/skills/:id` — calls `uninstallSkill`
  - `POST /api/marketplace/skills/:id/enable` / `.../disable`
  - `POST /api/marketplace/skills/:id/run` — body: `{ input }`; calls `loadSkill` + `run`; records result in `marketplace_skill_runs`
  - `GET /api/marketplace/skills/:id/runs` — last 20 run records
- [x] Add built-in "example" skill at `server/marketplace/builtin/echo-skill/`:
  - `manifest.json`: `{ "name": "echo", "version": "1.0.0", "kind": "workflow-skill", "description": "Returns its input as output", "entrypoint": "index.ts", "permissions": [] }`
  - `index.ts`: reads `process.env.TIB_INPUT ?? "{}"`, prints it back as JSON to stdout
  - Auto-install the echo skill for `mimule` tenant on startup in `server/index.ts`
- [x] Register all routes in `server/api/router.ts`
- [x] Add tests in `server/api/marketplace.test.ts`: list returns echo skill; install + run round-trip; disable makes skill inactive
- [x] Run typecheck + tests + build

## Phase 5 — SDK Scaffold

- [x] Create `sdk/` directory at `/opt/opencode-control-surface/sdk/`:
  - `package.json`: `{ "name": "@tib-builder/sdk", "version": "0.1.0", "main": "index.ts" }` — local package only, not published
  - `index.ts`: exports `defineSkill(manifest, handler)` — thin wrapper that reads env vars injected by `loader.ts`, calls `handler(input)`, writes output JSON to stdout, handles errors
  - `types.ts`: re-exports `SkillManifest`, `SkillPermission`, `SkillRunContext` from `server/marketplace/types.ts` (relative import)
  - `README.md`: 20-line example showing how to write a skill using the SDK
- [x] Add `sdk/index.test.ts`: `defineSkill` with mock env → handler receives parsed input → stdout gets JSON output
- [x] Run typecheck (from project root) + tests + build

## Phase 6 — Marketplace UI

- [x] Create `app/routes/MarketplacePage.tsx`:
  - Header: "Marketplace" + "Install from Bundle" button
  - Installed skills list: name, version, kind badge, status badge (active/disabled/error), installed date, "Run" / "Disable" / "Uninstall" buttons
  - "Run" button → modal: JSON input textarea → calls `POST /api/marketplace/skills/:id/run` → shows output
  - "Install from Bundle" → modal: bundle path input + manifest JSON textarea → calls install endpoint
  - Run history panel per skill: last 5 runs with status + duration
  - Empty state: "No skills installed — the built-in echo skill is always available"
- [x] Add `/marketplace` to `app/App.tsx`
- [x] Add `Marketplace` nav entry to `app/components/DashSidebar.tsx` (`Package` or `Puzzle` icon)
- [x] Run typecheck + build + restart + verify `/marketplace` loads and shows echo skill

## Phase 7 — Exit Criteria Validation

- [x] `GET /api/marketplace/skills` → 200, returns echo skill with `status: "active"`
- [x] `POST /api/marketplace/skills/:echo-id/run` with `{"input": {"msg": "hello"}}` → 200, output contains `{"msg": "hello"}`
- [x] Install a second skill (copy echo, rename to `echo-2`) → verify it appears in list
- [x] `POST /api/marketplace/skills/bad-id/run` on a skill missing `policy.execute_action` trying to execute action → verify 403 / permission denied in response
- [x] Unsigned bundle installs with warning (not blocked) — verified by checking `error_message` is null but a console warning was emitted
- [x] `/marketplace` loads in browser, shows echo skill, run button works
- [x] Full test suite: `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/ 2>&1 | grep -E "pass|fail"` → 135+ pass
- [x] Typecheck: 0 errors
- [x] Build: clean

---

## Exit Criteria

- `bun run check` → 0 errors
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/` → 135+ pass
- `bun run build` → clean
- `GET /api/marketplace/skills` → 200 (echo skill present)
- `POST /api/marketplace/skills/:id/run` → 200 with output
- `/marketplace` route loads in browser
- Marketplace nav entry in sidebar

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — use Node `crypto` for hashing, Bun built-ins for everything else.
- **No API keys in code**.
- Pre-existing TS errors: 0 — do NOT introduce any.
- Manifest format is JSON (not YAML) for v1 — avoids needing a YAML parser package.
- Sandboxing is policy-checked only (no firejail/nsjail) — document this clearly in `sdk/README.md`.
- The echo built-in skill must auto-install on every startup (idempotent upsert) so tests always have a real skill to work with.
- `server/marketplace/builtin/echo-skill/index.ts` is executed as a subprocess — it must be a standalone script that reads from env and writes to stdout.
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`.
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.


<!-- Builder run br_e6527: failed at 2026-05-16T17:45:40.997Z — details: /opt/ai-vault/builder/2026-05-16-bw_8111a-br_e6527.md -->

<!-- Builder run br_06875: success at 2026-05-16T17:54:30.361Z — details: /opt/ai-vault/builder/2026-05-16-bw_8111a-br_06875.md -->