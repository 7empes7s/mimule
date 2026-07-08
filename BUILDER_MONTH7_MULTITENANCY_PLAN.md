# Builder Platform Month 7 — Multi-Project, Multi-Tenant, Project Aware

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 7)
Related: `/root/BUILDER_MONTH6_ORCHESTRATOR_PLAN.md`

---

## Theme

**From "Marouane's one VPS" to N tenants × M projects, isolated.** Prerequisite for closed beta — no ship until cross-tenant reads are impossible.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules (do not break these):
- `server/tenancy/context.ts` — `TenantContext`, `getTenantContext()`, `DEFAULT_TENANT_ID="mimule"`, `testTenantContext()` — **already exists, 16 tests pass**
- `server/db/dashboard.ts` — `tenants` table exists; `tenant_id` column already added to: `metric_samples`, `events`, `action_audit`, `jobs`, `operator_state`, `builder_*`, `governance_*`
- `server/builder/runner.ts` — pass loop; needs per-tenant tmux server isolation
- `server/api/router.ts` — add tenant + project routes here
- `server/orchestrator/` — full orchestrator module (Month 6, complete)
- `app/App.tsx` — add `/projects` and `/tenants` routes
- `app/components/DashSidebar.tsx` — add nav entries
- `app/routes/DashHome.tsx` — topbar has space for tenant/project switchers

**No new npm/bun packages.** Use only what's already in `package.json`.

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 0
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ 2>&1 | grep -E "pass|fail" | tail -3` → 93+ pass
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## What is already done (do NOT redo)

- `tenants` table with columns: `id, name, status, created_at, updated_at`
- `tenant_id TEXT` column on all builder/governance/events/jobs tables (via `ensureColumn`)
- `server/tenancy/context.ts`: `TenantContext`, `getTenantContext(req)`, `assertTenantId()`, `testTenantContext()`, `DEFAULT_TENANT_ID = "mimule"`, `DEFAULT_PROJECT_ID()` returning `"opencode-control-surface"`
- `server/tenancy/context.test.ts`: 16 tests

---

## Phase 1 — Tenant Store + Projects Module

- [x] Add `server/tenancy/store.ts`:
  - `upsertTenant(id, name, status)` — insert or update `tenants` row
  - `getTenant(id)` — returns `Tenant | null`
  - `listTenants()` — returns all tenants ordered by `created_at`
  - `seedDefaultTenant()` — upserts `{ id: "mimule", name: "MIMULE / TechInsiderBytes", status: "active" }`
- [x] Add `server/projects/` directory:
  - `types.ts`: `Project { id, tenantId, name, repoPath, language, framework, validatorCommands: string[], defaultModelRoster: string[], defaultPolicies: object, createdAt, updatedAt }`
  - `store.ts`: `upsertProject()`, `getProject(id)`, `listProjects(tenantId)`, `deleteProject(id)`
  - `detector.ts`: `detectProject(repoPath): Partial<Project>` — heuristics: check `package.json/bun.lock` → `typescript/bun`, `go.mod` → `go`, `requirements.txt` → `python`; infer validator commands from presence of `bun test`, `go test`, `pytest`; return partial config for operator to confirm
  - `index.ts` barrel
- [x] Add `projects` table via inline SQL in `server/db/dashboard.ts`:
  ```
  id TEXT PK, tenant_id TEXT NOT NULL, name TEXT, repo_path TEXT, language TEXT,
  framework TEXT, validator_commands_json TEXT, default_model_roster_json TEXT,
  default_policies_json TEXT, status TEXT, created_at INTEGER, updated_at INTEGER
  ```
- [x] Call `seedDefaultTenant()` in `server/index.ts` startup (after DB init)
- [x] Seed default project `{ id: "opencode-control-surface", tenantId: "mimule", name: "Control Surface", repoPath: "/opt/opencode-control-surface", language: "typescript", framework: "bun+react", validatorCommands: ["bun run check", "bun test server/db/ server/api/", "bun run build"] }` in startup
- [x] Add tests in `server/projects/detector.test.ts`: detects bun project from `/opt/opencode-control-surface`; returns partial config; unknown repo returns empty partial
- [x] Run typecheck + tests + build

## Phase 2 — Tenant + Project API Endpoints

- [x] Create `server/api/tenants.ts`:
  - `GET /api/tenants` — list all tenants (operator-only, gated by `X-Operator-Token`)
  - `POST /api/tenants` — create tenant `{ id, name }`
  - `GET /api/tenants/:id` — single tenant with project count
  - `PATCH /api/tenants/:id` — update name/status
- [x] Create `server/api/projects.ts`:
  - `GET /api/projects?tenantId=` — list projects for a tenant
  - `POST /api/projects` — create project (body: `{ tenantId, name, repoPath, ... }`)
  - `GET /api/projects/:id` — single project
  - `PATCH /api/projects/:id` — update project config
  - `DELETE /api/projects/:id` — soft-delete (set status=deleted)
  - `POST /api/projects/detect` — body `{ repoPath }`, returns `detectProject()` result
- [x] Register both in `server/api/router.ts`
- [x] Add tests in `server/api/tenants.test.ts` and `server/api/projects.test.ts`: CRUD round-trips, missing-tenant 404, detect endpoint returns language
- [x] Run typecheck + tests + build

## Phase 3 — Tenant Context Middleware on All API Routes

- [x] Add `server/tenancy/middleware.ts`:
  - `withTenantContext(handler)` — wraps a route handler; calls `getTenantContext(req)`, attaches to a request-scoped store; rejects cross-tenant reads if `tenantId` in path param doesn't match context
  - For now, single-tenant operation: always resolves to `"mimule"` unless `X-Tenant-Id` header is set (operator override for testing)
- [x] Apply `withTenantContext` to all builder and governance route handlers in `server/api/router.ts` (wrap the existing handlers — don't rewrite them)
- [x] Add `getTenantContext` calls in `server/builder/store.ts` `readBuilderRuns()` / `readBuilderWorkflows()` — filter by `tenant_id = ctx.tenantId` when `tenant_id` column is non-null (fall back to unfiltered for legacy rows where `tenant_id IS NULL`)
- [x] Backfill: on startup in `server/index.ts`, run `UPDATE builder_workflows SET tenant_id = 'mimule' WHERE tenant_id IS NULL` (and same for `builder_runs`, `builder_passes`, `builder_artifacts`, `builder_validations`, `action_audit`, `jobs`)
- [x] Add tests: `server/tenancy/middleware.test.ts` — request with no tenant header resolves to `mimule`; request with `X-Tenant-Id: acme` resolves to `acme`; query filtered correctly per tenant
- [x] Run typecheck + tests + build

## Phase 4 — Per-Tenant tmux Server Isolation

- [x] In `server/builder/runner.ts`, replace the hardcoded `tmux` calls with a `tmuxSocket(tenantId): string` helper:
  - Returns `tib-${tenantId}` (e.g. `tib-mimule`)
  - All `tmux` invocations use `tmux -L ${socket}` — new-session, send-keys, kill-session, list-sessions
- [x] On runner startup (when first pass is launched for a tenant), ensure the tmux server is running: `tmux -L tib-mimule new-session -d -s init 2>/dev/null || true`
- [x] Add `GET /api/tenants/:id/tmux-status` endpoint: returns `{ socket, sessions: string[], active: number }` — calls `tmux -L tib-<id> list-sessions`
- [x] Update the builder-auto watcher in `server/index.ts` to use `tmux -L tib-mimule` for its own session management
- [x] Add tests: `tmuxSocket("mimule")` returns `"tib-mimule"`; `tmuxSocket("acme")` returns `"tib-acme"`
- [x] Run typecheck + tests + build

## Phase 5 — Cross-Tenant Isolation Test Fixture

- [x] Add `server/tenancy/isolation.test.ts`:
  - Creates 3 test tenants: `t-alpha`, `t-beta`, `t-gamma`
  - Creates 2 projects per tenant (6 total)
  - Inserts a `builder_workflow` row for each tenant with the appropriate `tenant_id`
  - Asserts: querying workflows with `tenantId = "t-alpha"` returns only `t-alpha` rows, never `t-beta` or `t-gamma`
  - Asserts: querying `action_audit` rows with `t-beta` context returns only `t-beta` rows
  - Asserts: a tenant that doesn't exist returns empty arrays, not 500
- [x] Verify `bun test server/tenancy/isolation.test.ts` passes
- [x] Run full suite: `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/` → 93+ pass
- [x] Run typecheck + build

## Phase 6 — Project Detector UI + `/projects` Route

- [x] Create `app/routes/ProjectsPage.tsx`:
  - Header: "Projects" + "New Project" button
  - Project list (grouped by tenant): name, repo path, language badge, framework badge, validator commands, last run link
  - "Detect" button per project → calls `POST /api/projects/detect` → shows detected config in a confirmation modal → "Save" calls `POST /api/projects`
  - "Edit" per project → modal with all fields editable
  - Empty state: "No projects yet — click New Project to register a repo"
- [x] Add Tenant + Project context strip to `app/components/DashTopbar.tsx` (or wherever the topbar lives):
  - Shows current tenant name + project name as small pills
  - Clicking tenant pill → opens tenant switcher dropdown (list of tenants from `GET /api/tenants`)
  - Clicking project pill → opens project switcher dropdown (list of projects for current tenant)
  - Selected tenant/project stored in `localStorage` as `activeTenantId` / `activeProjectId`; sent as `X-Tenant-Id` / `X-Project-Id` headers on all API calls from the store
- [x] Add `/projects` to `app/App.tsx` route table
- [x] Add `Projects` nav entry to `app/components/DashSidebar.tsx` with `FolderOpen` or `Layers` icon
- [x] Run typecheck + build + restart + verify `/projects` loads

## Phase 7 — Exit Criteria Validation

- [x] `bun test server/tenancy/isolation.test.ts` — all 3×2 isolation assertions pass
- [x] `GET /api/tenants` → 200, returns `[{ id: "mimule", name: "MIMULE / TechInsiderBytes", status: "active" }]`
- [x] `GET /api/projects?tenantId=mimule` → 200, returns at least 1 project
- [x] `POST /api/projects/detect` with `{ "repoPath": "/opt/opencode-control-surface" }` → 200, detects `typescript` language
- [x] `/projects` loads in browser, shows the seeded control-surface project
- [x] Tenant/project pill visible in topbar on all dashboard pages
- [x] All existing builder runs still visible (backfill verified: `builder_workflows.tenant_id = 'mimule'`)
- [x] Full test suite: `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/` → 93+ pass
- [x] Typecheck: 0 errors
- [x] Build: clean

---

## Exit Criteria

- `bun run check` → 0 errors
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/` → 93+ pass
- `bun run build` → clean
- `GET /api/tenants` → 200
- `GET /api/projects?tenantId=mimule` → 200
- `POST /api/projects/detect` → 200 with language detection
- `GET /api/tenants/mimule/tmux-status` → 200
- `/projects` route loads in browser
- Tenant + project pills in topbar
- Cross-tenant isolation: `t-alpha` rows invisible to `t-beta` context (verified by test)
- MIMULE's existing data backfilled to `tenant_id = "mimule"` — all builder runs still visible

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — use Node crypto, existing Bun APIs.
- **No API keys in code** — gateway client handles auth.
- Pre-existing TS errors: 0 (clean baseline from Month 6) — do NOT introduce any.
- Use inline SQL `CREATE TABLE IF NOT EXISTS` + `ensureColumn` for all schema changes.
- The `tenants` table and `tenant_id` columns already exist — do NOT re-create them, only add what's missing.
- The tenancy isolation must be soft (filter, not hard foreign-key rejection) because legacy rows have `tenant_id IS NULL` — always fall back gracefully.
- Keep the default tenant `"mimule"` — this is the live production tenant. Do not rename or remove it.
- The tmux socket rename (`-L tib-mimule`) must be backwards compatible: if an existing session is found on the default socket, leave it; only new sessions use the per-tenant socket.
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`.
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.


<!-- Builder run br_635d7: success at 2026-05-16T16:10:02.954Z — details: /opt/ai-vault/builder/2026-05-16-bw_b0781-br_635d7.md -->

<!-- Builder run br_e9625: failed at 2026-05-16T16:36:45.375Z — details: /opt/ai-vault/builder/2026-05-16-bw_b0781-br_e9625.md -->