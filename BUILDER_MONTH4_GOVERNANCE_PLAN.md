# Builder Platform Month 4 — Governance Plane v1

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 4)
Related: `/root/BUILDER_EXCELLENCE_PLAN.md`, `/root/DASHBOARD_V4_SCHEDULER_PLAN.md`

---

## Theme

**Lock down what runs, who can run it, and what credentials it uses.**

Months 1–3 gave us a reliable builder loop (pass contract + analytics), full traceability (trace bus + audit chain), and a gateway router we own. Month 4 is the first governance layer: a narrow policy engine, a secrets vault, RBAC roles, approval gates, budget caps, and retention policies. Without this nothing can be handed to a second human or a second project without risk.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Existing server structure:
- `server/builder/` — runner, store, discovery, doctor, modelSelector, scheduler
- `server/gateway/` — router, adapters, ledger, config (Month 3, deployed but untracked in git)
- `server/tracing/` — tracer, exporter (Month 2, deployed but untracked)
- `server/db/audit/` — chain.ts (Month 2, deployed but untracked)
- `server/api/` — router.ts, builder.ts, gateway.ts, agents.ts, etc.
- `server/db/dashboard.ts` — SQLite schema + migrations via ensureColumn/ensureTable

Always run `bun run typecheck` after edits. Run `bun test server/db/ server/api/` to check tests. Build with `bun run build`. Service restarts with `systemctl restart control-surface`.

Pre-existing baseline: 63 pass / 9 fail (pre-existing today.test.ts failures). 6 pre-existing TS errors in RatingsPage, doctor.ts, actionDescriptors.ts — do NOT fix those unless the task explicitly says to.

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — Policy Engine Foundation

- [x] Create `server/governance/` directory with an `index.ts` barrel
- [x] Define `PolicyRule`, `PolicyDocument`, `PolicyEffect` (`allow | deny | require_approval`), `PolicyEventContext`, `PolicyDecision` TypeScript interfaces in `server/governance/policy.ts`
- [x] Implement `loadPolicyDocument(path: string): PolicyDocument` — reads YAML or JSON, validates schema, logs parse errors without crashing
- [x] Implement `evaluatePolicy(doc: PolicyDocument, ctx: PolicyEventContext): PolicyDecision` — iterates rules, first match wins, default `allow` if no match; records `ruleName` and `reason` in the decision
- [x] Create default policy file at `/etc/tib-builder/policies/default.yaml` with two example rules: deny-paid-models-on-staging and require-approval-prod-deploy (comment-only for now — effects are `log-only` until Phase 4)
- [x] Add SQLite tables: `governance_policies` (id, name, path, content_hash, loaded_at) and `governance_policy_decisions` (id, policy_id, event_type, effect, rule_name, reason, context_json, decided_at) via `ensureTable` in `server/db/dashboard.ts`
- [x] Add `GET /api/governance/policies` BFF endpoint returning loaded policies and decision count
- [x] Add `server/api/governance.ts` and register it in `server/api/router.ts`
- [x] Add tests for `evaluatePolicy` in `server/governance/policy.test.ts`: at least allow-default, first-match-deny, require_approval cases
- [x] Run `bun run typecheck && bun test server/governance/ && bun run build` — all clean

## Phase 2 — RBAC Roles

- [x] Define `RbacRole` (`owner | operator | auditor | viewer`) and `RoleBinding` (userId, role, tenantId?, projectId?) interfaces in `server/governance/rbac.ts`
- [x] Implement `resolveRole(token: string): RbacRole` — for now maps the operator token to `owner`; missing/wrong token maps to `viewer`
- [x] Implement `checkPermission(role: RbacRole, action: string): boolean` — action strings like `workflow.start`, `workflow.stop`, `builder.view`, `audit.view`, `secrets.read`. Viewer can only call `*.view` and `audit.view`. Operator can run workflows. Owner can do everything.
- [x] Add SQLite table `governance_role_bindings` (id, user_id, role, project_id nullable, created_at) via ensureTable
- [x] Wire `checkPermission` into `server/api/router.ts` as a lightweight middleware: extract role from `x-operator-token` header, check action against a route→action map, return `403` JSON if denied (format: `{ error: "Forbidden", role, required }`)
- [x] Add `GET /api/governance/rbac/me` endpoint returning current role and allowed actions
- [x] Add tests for `checkPermission` in `server/governance/rbac.test.ts`: owner/operator/auditor/viewer against key actions
- [x] Run typecheck + tests + build

## Phase 3 — Secrets Vault

- [x] Create `server/governance/secrets.ts` with interfaces: `SecretEntry` (id, name, description, encryptedValue, keyId, createdAt, updatedAt), `SecretsStore`
- [x] Implement KEK (Key Encryption Key) loading from `/etc/tib-builder/master.key` (hex-encoded 32 bytes). If file doesn't exist, generate one and write it at startup, log a warning that this key must be backed up.
- [x] Implement AES-256-GCM encrypt/decrypt helpers using Node `crypto` module. DEK-per-secret pattern: each secret has its own random 32-byte DEK, encrypted under the KEK and stored alongside the ciphertext.
- [x] Add SQLite table `governance_secrets` (id TEXT PK, name TEXT UNIQUE, description TEXT, encrypted_value TEXT, encrypted_dek TEXT, iv TEXT, key_id TEXT, created_at INTEGER, updated_at INTEGER) via ensureTable
- [x] Implement CRUD: `writeSecret(name, plaintext)`, `readSecretPlaintext(name)` (decrypts), `listSecrets()` (returns metadata only, never plaintext), `deleteSecret(name)`
- [x] Add `GET /api/governance/secrets` (list, metadata only), `POST /api/governance/secrets` (create/update), `DELETE /api/governance/secrets/:name` — all owner-only via RBAC
- [x] Add redaction filter in `server/builder/runner.ts`: after loading secrets for a pass, collect all plaintext values; wrap the pass stdout log writer so any occurrence of those strings is replaced with `[REDACTED]`
- [x] Expose secrets to passes via env vars at spawn time: `loadSecretsForPass(workflow)` reads secrets listed in `workflow.config.secretNames[]` (new optional field), injects them as env vars named `SECRET_<NAME_UPPER>` into the tmux pass environment
- [x] Add `workflow.config.secretNames` optional field to `BuilderWorkflowConfig` type
- [x] Add tests in `server/governance/secrets.test.ts`: round-trip encrypt/decrypt, listSecrets hides plaintext, redaction filter replaces known value in log line
- [x] Run typecheck + tests + build

## Phase 4 — Approval Gates

- [x] Add `requiresApproval` boolean field to `BuilderWorkflowConfig` (optional, default false)
- [x] In `server/builder/runner.ts` `startWorkflowRun()`: if `workflow.config.requiresApproval && trigger !== "approved"`, set run status to `pending-approval` and return early (do not spawn a pass)
- [x] Add SQLite table `governance_approvals` (id TEXT PK, workflow_id TEXT, run_id TEXT, requested_at INTEGER, requested_by TEXT, decided_at INTEGER nullable, decided_by TEXT nullable, decision TEXT nullable `approve|reject`, reason TEXT nullable) via ensureTable
- [x] Add `POST /api/governance/approvals/:runId/approve` and `POST /api/governance/approvals/:runId/reject` — owner-only; approve triggers the actual run start with `trigger = "approved"`
- [x] Add `GET /api/governance/approvals` listing pending approvals
- [x] Add an approval-pending banner component to `app/routes/BuilderPage.tsx`: if any workflow has status `pending-approval`, show an amber banner with workflow name + approve/reject buttons that call the new endpoints
- [x] Add tests: workflow with requiresApproval=true does not spawn a pass until approved
- [x] Run typecheck + tests + build

## Phase 5 — Budget Caps + Retention Policies

 - [x] Add SQLite table `governance_budgets` (id TEXT PK, scope TEXT `global|project`, project_id TEXT nullable, daily_cap_usd REAL, monthly_cap_usd REAL, warn_pct REAL default 0.8, created_at INTEGER, updated_at INTEGER)
 - [x] Implement `checkBudget(scope, projectId?): { allowed: boolean, reason?: string }` in `server/governance/budgets.ts` — sums `gateway_calls.cost_estimate` for today/this-month, compares against cap; returns denied if over hard cap
 - [x] Wire `checkBudget` into the gateway router so calls that would exceed the cap return a `429` with `{ error: "BudgetExceeded", cap, spent, period }` instead of forwarding to the provider
 - [x] Add `GET /api/governance/budgets` and `POST /api/governance/budgets` endpoints
 - [x] Implement `server/governance/retention.ts` with `RetentionPolicy` interface: `{ tracesTtlDays: number, runDirsTtlDays: number, auditLogRetainForever: boolean }`
 - [x] Implement `runRetentionCleanup()`: deletes trace JSONL files older than `tracesTtlDays` from `/var/lib/control-surface/traces/`, prunes `builder_runs` run-dirs older than `runDirsTtlDays`, never touches `action_audit` rows
 - [x] Schedule `runRetentionCleanup()` to run once daily at startup + every 24h via `setInterval`
 - [x] Add `GET /api/governance/retention` returning current policy, `POST /api/governance/retention` to update it
 - [x] Add tests for budget cap logic (mock gateway_calls rows, assert denied when over cap)
 - [x] Run typecheck + tests + build

## Phase 6 — Dashboard Routes

 - [x] Create `app/routes/GovernancePage.tsx` — a tabbed page at `/governance` with four tabs: Policies, Secrets, Approvals, Budgets
 - [x] **Policies tab**: table of loaded policy documents (name, path, rule count, loaded_at), expandable row showing raw YAML/JSON content, "Reload" button calling a new `POST /api/governance/policies/reload` endpoint
 - [x] **Secrets tab**: table of secret metadata (name, description, created, updated) — no plaintext ever shown; "Add Secret" modal with name + description + value fields (value is masked input); delete button
 - [x] **Approvals tab**: list of pending approvals with workflow name, requested-at, requester; Approve / Reject buttons with optional reason field; completed approvals shown grayed out below
 - [x] **Budgets tab**: global budget card (daily/monthly cap, current spend, % used, progress bar); per-project budget list; "Set Budget" modal
 - [x] Register `/governance` route in `app/App.tsx` and `app/components/DashSidebar.tsx` (Shield icon from lucide-react)
 - [x] Add basic CSS for the tabbed layout in `app/globals.css` — reuse existing `.tab-bar` pattern if one exists, otherwise add `.gov-tabs` with active underline
 - [x] Add governance API routes to `server/api/router.ts`: policies reload, secrets CRUD, approvals list/decide, budgets CRUD, retention get/set
 - [x] Run typecheck + build + `systemctl restart control-surface` + verify `/governance` loads with all four tabs

---

## Exit Criteria

- `bun run typecheck` clean (no new errors beyond the 6 pre-existing ones)
- `bun test server/db/ server/api/ server/governance/` — all new tests pass; existing 63 pass
- `bun run build` passes with only the known Vite large-chunk warning
- `/governance` route is live and all four tabs load data from the API
- Policy evaluation wired into at least one mutating endpoint (workflow start)
- RBAC enforced: unauthenticated request to `POST /api/builder/workflows/:id/start` returns `403`
- Secret round-trip: create a secret via API, start a pass for a workflow that uses it, verify env var is injected and value is `[REDACTED]` in stdout artifact
- Budget cap: a gateway call that would exceed a configured daily cap returns `429`
- Approval gate: a `requiresApproval` workflow does not spawn a pass until the operator approves via API
- Retention: `runRetentionCleanup()` deletes one seeded stale trace file in a test

---

## Notes for the Agent

- **Never touch `/opt/newsbites`** — it is live at news.techinsiderbytes.com.
- **Never assign `claude_local` adapter** — credits exhausted.
- **Never force-push, never commit `.env` files.**
- After edits to the server, restart the service: `systemctl restart control-surface && sleep 2 && curl -s http://127.0.0.1:3000/health`
- Use `ensureTable` / `ensureColumn` for all schema migrations (no separate migration files needed — the dashboard.ts pattern handles it).
- Pre-existing TS errors: `RatingsPage.tsx`, `doctor.ts`, `actionDescriptors.ts` — do NOT fix these.
- The operator token is `Brighton13` (used in `x-operator-token` header). The gateway config is at `/etc/tib-builder/gateway.yaml`. LiteLLM runs at `:4000`.
- Validate with `curl -s -H "x-operator-token: Brighton13" http://127.0.0.1:3000/api/governance/policies` after shipping Phase 1.


<!-- Builder run br_f9da7: failed at 2026-05-16T07:58:49.113Z — details: /opt/ai-vault/builder/2026-05-16-bw_5a936-br_f9da7.md -->

<!-- Builder run br_fb147: failed at 2026-05-16T08:31:42.389Z — details: /opt/ai-vault/builder/2026-05-16-bw_5a936-br_fb147.md -->

<!-- Builder run br_ab230: failed at 2026-05-16T09:02:22.749Z — details: /opt/ai-vault/builder/2026-05-16-bw_5a936-br_ab230.md -->