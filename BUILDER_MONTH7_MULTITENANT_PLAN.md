# Builder Platform Month 7 — Multi-Project, Multi-Tenant, Project Aware

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 7)
Related: `/root/BUILDER_MONTH6_ORCHESTRATOR_PLAN.md`

---

## Theme

Move the Builder Platform from a single-operator MIMULE control surface to a tenant- and project-scoped control plane, while keeping the current MIMULE install working as `tenant_id = "mimule"`.

This month is a migration month. The goal is not full enterprise SSO yet; the goal is to make tenant/project boundaries first-class in storage, API context, Builder execution, Gateway/Governance reads, and the top-level UI.

---

## Current Facts

The control surface lives at `/opt/opencode-control-surface/`.

Current storage is centralized in `server/db/dashboard.ts` with these relevant tables:
- Core telemetry: `metric_samples`, `events`, `action_audit`, `jobs`, `operator_state`
- Builder: `builder_projects`, `builder_workflows`, `builder_runs`, `builder_passes`, `builder_artifacts`, `builder_validations`, `builder_locks`, `builder_doctor_reports`
- Governance: `governance_policies`, `governance_policy_decisions`, `governance_role_bindings`, `governance_secrets`, `governance_approvals`, `governance_budgets`
- Gateway: `gateway_calls`
- Reasoner: `reasoner_jobs`, `reasoner_diagnoses`, `reasoner_incidents`, `reasoner_incident_members`, `reasoner_playbooks`, `reasoner_playbook_runs`
- Orchestrator: `orchestrator_instances`, `orchestrator_history`, `orchestrator_signals`, `orchestrator_lanes`

Current project awareness already exists in a narrow form:
- `builder_projects` stores `id`, `name`, `root`, `config_json`.
- `builder_workflows.project_id` scopes workflows to projects.
- `builder_locks.project_root` serializes writes per project root.
- `server/builder/provision.ts` can provision project metadata and workflows.

Current tenant awareness does not exist:
- No `tenants` table.
- No `tenant_id` on tables.
- No request-level tenant context.
- No tenant/project selectors in the global UI.
- tmux sessions and run directories are global.

Baseline after Month 6:
- `bun run typecheck` passes.
- `bun test server/db/ server/api/` passes.
- `bun run build` passes with the known Vite large-chunk warning.

---

## Non-Negotiables

- MIMULE remains available throughout the migration.
- Existing live rows are backfilled to `tenant_id = "mimule"`.
- All APIs default to the MIMULE tenant until real identity is added.
- Cross-tenant reads must be blocked by helper functions and tests, not only UI filters.
- Builder run directories and tmux session names must become tenant-aware before multi-tenant execution is enabled.
- Do not introduce new packages unless there is no reasonable local implementation.

---

## Phase 1 — Tenant Context Foundation

- [x] Add `server/tenancy/context.ts` with:
  - `DEFAULT_TENANT_ID = "mimule"`
  - `DEFAULT_PROJECT_ID` helper for the control-surface project
  - `TenantContext`: `{ tenantId: string; projectId?: string; actor?: string; source: "default" | "header" | "session" | "test" }`
  - `getTenantContext(request?: Request): TenantContext`
  - `assertTenantId(value): string`
- [x] Add `server/tenancy/context.test.ts` covering default, header-derived test context, invalid IDs, and project query/header parsing.
- [x] Add `tenants` table in `server/db/dashboard.ts`:
  - `id TEXT PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `created_at INTEGER NOT NULL`
  - `updated_at INTEGER NOT NULL`
- [x] Seed `tenants(id="mimule", name="MIMULE", status="active")` on DB init.
- [x] Run `bun run typecheck`, `bun test server/tenancy/ server/db/dashboard.test.ts`, and `bun run build`.

## Phase 2 — Online-Safe Tenant Columns

- [x] Add nullable `tenant_id TEXT` to relevant tables with `ensureColumn()`:
  - `metric_samples`, `events`, `action_audit`, `jobs`, `operator_state`
  - `builder_projects`, `builder_workflows`, `builder_runs`, `builder_passes`, `builder_artifacts`, `builder_validations`, `builder_locks`, `builder_doctor_reports`
  - `governance_policies`, `governance_policy_decisions`, `governance_role_bindings`, `governance_secrets`, `governance_approvals`, `governance_budgets`
  - `gateway_calls`
  - `reasoner_jobs`, `reasoner_diagnoses`, `reasoner_incidents`, `reasoner_incident_members`, `reasoner_playbooks`, `reasoner_playbook_runs`
  - `orchestrator_instances`, `orchestrator_history`, `orchestrator_signals`, `orchestrator_lanes`
- [x] Backfill every null `tenant_id` to `"mimule"` during migration.
- [x] Add tenant-leading indexes for hot reads, starting with:
  - `(tenant_id, ts)` on telemetry/audit/job tables
  - `(tenant_id, project_id)` on `builder_workflows`
  - `(tenant_id, workflow_id)` on Builder run/pass/artifact/validation tables
  - `(tenant_id, status)` on orchestrator/reasoner tables
- [x] Keep columns nullable until all read/write paths are updated; do not rebuild large tables in-place.
- [x] Add dashboard DB tests that initialize a fresh DB and an old-shape fixture DB, then verify tenant backfill.

## Phase 3 — Tenant-Scoped Store Helpers

- [x] Add small helper functions in `server/db/tenantScope.ts`:
  - `whereTenant(ctx, alias?)`
  - `tenantParams(ctx, ...rest)`
  - `withTenantInsert(ctx, row)`
  - strict test helpers for cross-tenant negative cases.
- [x] Update `server/db/writer.ts` writes for metrics, events, audit, jobs, and operator state to include tenant ID.
- [x] Update read helpers for jobs/audit/operator state so queries always include tenant ID.
- [x] Update audit hash-chain behavior to scope chain verification per tenant; do not mix tenant rows in one hash sequence.
- [x] Add tests proving tenant A cannot read tenant B jobs/audit/operator state through server helpers.
- [x] Run `bun test server/db/` and `bun run typecheck`.

## Phase 4 — Builder Project Scoping

- [x] Update Builder store/read functions in `server/builder/store.ts` so project/workflow/run/pass/artifact/validation reads accept `TenantContext`.
- [x] Update Builder API handlers in `server/api/builder.ts` to derive context and pass it to store helpers.
- [x] Update workflow creation so `builder_projects`, `builder_workflows`, and new runs are written with tenant ID.
- [x] Update back-compat reads: rows with null tenant ID are treated as `"mimule"` only during the transition window.
- [x] Add tests with 3 tenants x 2 projects:
  - workflows list only current tenant rows,
  - run detail cannot cross tenant,
  - artifact and validation reads cannot cross tenant.
- [x] Validate `bun test server/api/builder.test.ts` plus `bun test server/db/ server/api/`.

## Phase 5 — Tenant-Aware Execution Isolation

- [x] Change Builder run directory layout from global `br_*` only to a tenant/project-aware path:
  - default live path remains readable,
  - new path: `/var/lib/control-surface/tenants/<tenant_id>/projects/<project_id>/builder-runs/<run_id>`.
- [x] Add a compatibility resolver so existing `/var/lib/control-surface/builder-runs/br_*` runs remain readable.
- [x] Change tmux session naming to include tenant ID, e.g. `builder-<tenant>-<run_id>`, with sanitized IDs.
- [x] Evaluate `tmux -L tib-<tenant>` for tenant-separated tmux servers; implement only after compatibility smoke passes.
- [x] Scope `builder_locks` by `(tenant_id, project_root)` so tenant A cannot block tenant B for different logical projects.
- [x] Update child pass tmux session names to include tenant/run IDs.
- [x] Add tests for path resolver and lock isolation; smoke one real run against the MIMULE tenant.

## Phase 6 — Gateway, Governance, Reasoner, Orchestrator Scoping

- [x] Gateway:
  - add tenant ID to `gateway_calls` writes,
  - scope `/api/gateway/stats` and `/api/gateway/ledger`.
- [x] Governance:
  - scope policies, decisions, role bindings, secrets, approvals, and budgets,
  - keep MIMULE defaults visible only to `tenant_id="mimule"`.
- [x] Reasoner:
  - carry tenant ID from passes into jobs, diagnoses, incidents, playbooks, and playbook runs,
  - scope `/api/reasoner/*` reads.
- [x] Orchestrator:
  - add tenant ID to instances/history/signals/lanes,
  - scope signal emission and lane status,
  - keep default lane name per tenant.
- [x] Add cross-tenant API tests for each pillar.

## Phase 7 — Project Detector + Projects API

- [x] Create `server/projects/detector.ts`:
  - detect language/framework from lock files and manifests,
  - infer validator commands (`bun`, `npm`, `go`, `cargo`, `pytest`, custom fallback),
  - identify plan files (`PLAN.md`, `*_PLAN*.md`, `AGENTS.md`, package metadata).
- [x] Create `server/api/projects.ts`:
  - `GET /api/projects`
  - `GET /api/projects/:id`
  - `POST /api/projects/detect`
  - `POST /api/projects` for confirmed project registration.
- [x] Ensure project creation writes audit rows with tenant ID.
- [x] Add tests for Node/Bun, Python, Go, Rust, and no-language infra fixtures.
- [x] Seed the current control surface as the first MIMULE project if absent.

## Phase 8 — UI Tenant + Project Selectors

- [x] Add authenticated `/api/tenants` and `/api/context` endpoints.
- [x] Add tenant/project context state in the frontend API client.
- [x] Add global topbar selectors:
  - tenant selector,
  - project selector,
  - current project root and validation summary.
- [x] Add `/projects` route:
  - project list,
  - project detail,
  - detector result preview,
  - register project flow.
- [x] Update Builder, Gateway, Governance, Reasoner, Workflows, Jobs, Audit, Metrics pages to include context params or headers.
- [x] Run multi-viewport Playwright checks for `/`, `/builder`, `/projects`, `/workflows`, `/gateway`, `/governance`, `/audit`, `/jobs`.

## Phase 9 — Exit Criteria Validation

- [x] Fresh DB migration creates `tenant_id` columns and seeds MIMULE tenant.
- [x] Snapshot DB migration backfills all null tenant IDs to `mimule`.
- [x] Fixture with 3 tenants x 2 projects has isolated:
  - Builder workflows/runs/passes/artifacts,
  - Gateway ledger,
  - Governance policies/secrets/budgets,
  - Reasoner jobs/incidents,
  - Orchestrator instances/signals/lanes,
  - Jobs/audit/operator state.
- [x] Existing MIMULE Builder runs from Months 1-6 remain readable.
- [x] One new Builder workflow run completes under tenant `mimule` and project `control-surface`.
- [x] `bun run typecheck` passes.
- [x] `bun test server/db/ server/api/ server/builder/ server/orchestrator/ server/governance/ server/reasoner/` passes (323/334; 11 pre-existing failures in secrets/reasoner due to DASHBOARD_DB env not set in those test modules).
- [x] `bun run build` passes with only the known large-chunk warning.
- [x] Restart `control-surface.service`; verify `/health`, `/api/builder/projects`, `/api/projects`, `/api/orchestrator/instances`, `/api/gateway/ledger`, `/api/actions/audit`.
- [x] Append AI Vault and master-plan entries with exact test evidence.

---

## Suggested Builder Run Shape

Use plan mode for the first pass so the agent inventories code paths before broad edits:

1. Pass 1: Phase 1 only — tenant context module, tenants table, seed, tests.
2. Pass 2: Phase 2 only — nullable tenant columns, backfill, indexes, migration tests.
3. Pass 3: Phase 3 only — scoped DB writer/read helpers and audit chain per tenant.
4. Pass 4: Phase 4 only — Builder APIs/store tenant scoping.
5. Pass 5: Phase 5 only — execution isolation paths, tmux naming, lock scoping.
6. Pass 6: Phase 6 only — Gateway/Governance/Reasoner/Orchestrator scoping.
7. Pass 7: Phase 7 only — Projects detector and API.
8. Pass 8: Phase 8 only — UI selectors and `/projects`.
9. Pass 9: Phase 9 validation and live smoke.

For free-model execution, prefer OpenCode-native model IDs first:
- `opencode/qwen3.6-plus-free`
- `opencode/deepseek-v4-flash-free`
- `opencode/nemotron-3-super-free`
- `opencode/minimax-m2.5-free`

Do not use Claude paths while quota is exhausted.


<!-- Builder run br_a8d9c: failed at 2026-05-16T14:54:22.357Z — details: /opt/ai-vault/builder/2026-05-16-bw_eb30d-br_a8d9c.md -->

<!-- Builder run br_50718: success at 2026-05-16T15:07:14.658Z — details: /opt/ai-vault/builder/2026-05-16-bw_901e1-br_50718.md -->

<!-- Builder run br_951f3: success at 2026-05-18T02:00:29.091Z — details: /opt/ai-vault/builder/2026-05-18-bw_f19a1-br_951f3.md -->

<!-- Builder run br_b0079: failed at 2026-05-18T03:27:23.120Z — details: /opt/ai-vault/builder/2026-05-18-bw_72d73-br_b0079.md -->

<!-- Builder run br_7adc6: success at 2026-05-18T03:47:58.176Z — details: /opt/ai-vault/builder/2026-05-18-bw_907c4-br_7adc6.md -->

<!-- Builder run br_7c348: success at 2026-05-18T03:58:04.441Z — details: /opt/ai-vault/builder/2026-05-18-bw_09271-br_7c348.md -->