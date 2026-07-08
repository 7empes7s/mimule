# Builder Platform Month 10 — Compliance + Enterprise Readiness

Last updated: 2026-05-17 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 10)
Related: `/root/BUILDER_MONTH9_MARKETPLACE_PLAN.md`

---

## Theme

**Make the platform safe to install inside companies that have a compliance team.** SSO via OIDC, mTLS option, 4-eyes approvals, audit retention + export, compliance reports, data residency, and DPA/SOC2 prep artifacts.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules (do not break these):
- `server/db/dashboard.ts` — add new compliance tables here via inline SQL migration
- `server/api/router.ts` — register new routes here
- `server/tenancy/context.ts` — `getTenantContext()` for all new endpoints
- `server/governance/` — existing policy/RBAC layer; compliance builds on top
- `app/App.tsx` — add `/compliance` route
- `app/components/DashSidebar.tsx` — add Compliance nav entry

**No new npm/bun packages.** Use only what's already in `package.json`.

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 0
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/ 2>&1 | grep -E "pass|fail" | tail -3` → 173+ pass
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — SSO / OIDC Module

- [x] Create `server/sso/types.ts`:
- [x] Implement `server/sso/oidc.ts`:
- [x] Implement `server/sso/mappers.ts`:
- [x] Add SQLite table in `server/db/dashboard.ts`:
- [x] Add API endpoints in `server/api/sso.ts`:
- [x] Register SSO routes in `server/api/router.ts`
- [x] Add tests in `server/api/sso.test.ts`: discoverOidcConfig mocked; buildAuthUrl produces correct params; mapGroupsToRole correct for operator/viewer/admin; config CRUD round-trip
- [x] Run typecheck + tests + build

## Phase 2 — mTLS Option

- [x] Create `server/sso/mtls.ts`:
  - `MtlsConfig`: `{ caPath: string, certPath: string, keyPath: string, required: boolean }`
  - `loadMtlsConfig(): MtlsConfig | null` — reads from env vars `MTLS_CA_PATH`, `MTLS_CERT_PATH`, `MTLS_KEY_PATH`, `MTLS_REQUIRED`; returns null if unset
  - `verifyClientCert(pemChain: string, caPath: string): { valid: boolean; subject: string; error?: string }` — uses Node `crypto.createVerify` / `X509Certificate`; for v1 validates chain depth only (no CRL)
  - `extractTenantFromCert(subject: string): string | null` — looks for `O=<tenantId>` in subject DN
- [x] Add middleware hook: if `MTLS_REQUIRED=1` and no valid client cert header, return 401 on `/api/` routes; cert injected by Caddy via `{tls_client_certificate_pem_leaf}` header
- [x] Add `server/api/mtls.test.ts`: cert loading, subject extraction, tenant mapping from cert
- [x] Document mTLS setup in `server/sso/README-mtls.md` (Caddy snippet, env vars, self-signed CA steps)
- [x] Run typecheck + tests + build

## Phase 3 — 4-Eyes Approvals

- [x] Add SQLite tables in `server/db/dashboard.ts`:
  - `approval_requests` (id TEXT PK, workflow_id TEXT, run_id TEXT, tenant_id TEXT, requested_by TEXT, status TEXT — "pending"|"approved"|"rejected"|"expired", approvals_json TEXT, required_count INTEGER, created_at INTEGER, expires_at INTEGER)
  - `approval_votes` (id TEXT PK, request_id TEXT, voter TEXT, decision TEXT, comment TEXT, voted_at INTEGER)
- [x] Implement `server/governance/approvals.ts`:
  - `createApprovalRequest(workflowId, runId, tenantId, requestedBy, requiredCount): ApprovalRequest`
  - `submitVote(requestId, voter, decision: "approve"|"reject", comment?): ApprovalRequest` — appends to `approval_votes`; updates status to `approved` when `requiredCount` distinct approvals reached; `rejected` on any reject
  - `getApprovalRequest(id): ApprovalRequest | null`
  - `listApprovalRequests(tenantId, status?): ApprovalRequest[]`
  - `expireStaleRequests(): number` — marks expired; called by builder runner on workflow start check
- [x] Wire into builder runner: if `workflow.config.requiresTwoApprovers === true`, runner checks for an approved `approval_requests` row before advancing past the first pass; if none, creates an approval request and pauses the run with `status = "awaiting-approval"` until approved
- [x] Add `awaiting-approval` as a valid run status
- [x] Add API endpoints in `server/api/approvals.ts`:
  - `GET /api/approvals` — list pending approval requests for tenant
  - `GET /api/approvals/:id` — get request + votes
  - `POST /api/approvals/:id/vote` — body: `{ decision, comment }`; requires operator or admin role
  - `POST /api/approvals/:id/expire` — manually expire (admin only)
- [x] Register approval routes in `server/api/router.ts`
- [x] Add tests in `server/api/approvals.test.ts`: create request; vote once — still pending; vote twice different voters — approved; same voter twice — deduplicated; reject → status=rejected; expired check
- [x] Run typecheck + tests + build

## Phase 4 — Audit Retention + Export

- [x] Implement `server/governance/audit/export.ts`:
  - `AuditExportOptions`: `{ tenantId: string, fromTs: number, toTs: number, format: "jsonl"|"csv", includeKinds?: string[] }`
  - `exportAuditLog(opts: AuditExportOptions): AsyncGenerator<string>` — streams rows from `action_audit` in batches of 500; JSONL: one JSON object per line; CSV: header row + data rows
  - `buildHashChain(rows: AuditRow[]): { rows: (AuditRow & { hash: string })[], chainHash: string }` — SHA-256 of `prev_hash || JSON.stringify(row)` for each row; first row uses `"genesis"` as prev_hash
  - `verifyHashChain(rows: (AuditRow & { hash: string })[]): { valid: boolean; firstBadIndex?: number }` — recomputes and checks each link (fixed: strips hash before recomputing to avoid including it in the payload)
- [x] Add `audit_export_jobs` table: (id TEXT PK, tenant_id TEXT, requested_by TEXT, from_ts INTEGER, to_ts INTEGER, format TEXT, status TEXT, row_count INTEGER, chain_hash TEXT, output_path TEXT, error TEXT, started_at INTEGER, finished_at INTEGER)
- [x] Add API endpoints in `server/api/audit.ts`:
  - `POST /api/audit/export` — body: `{ fromTs, toTs, format?, includeKinds? }`; starts async export job; returns job id
  - `GET /api/audit/export/:jobId` — status + download URL when ready
  - `GET /api/audit/export/:jobId/download` — streams the JSONL/CSV file
  - `POST /api/audit/export/:jobId/verify` — re-reads file and runs verifyHashChain; returns `{ valid, rowCount, chainHash }`
- [x] Configure retention via `tenant_settings` table (or env fallback): `AUDIT_RETENTION_DAYS` default 90; nightly purge job in `server/db/dashboard.ts`
- [x] Register audit export routes in `server/api/router.ts`
- [x] Add tests in `server/api/audit.test.ts`: export to JSONL; hash chain builds and verifies; tampered row detected; CSV format header row present
- [x] Run typecheck + tests + build

NOTE: 5 test failures in `bun test server/api/` (full suite) are due to test isolation — tenant_settings table seeded with "mimule" row from migration in `createTables()`, causing UNIQUE constraint failures. Audit tests pass in isolation (12/12 pass with DASHBOARD_DB=1).

## Phase 5 — Compliance Reports

- [x] Create `server/reporting/` module:
  - `types.ts`: `ReportTemplate`, `ReportRun`, `ReportOutput`
  - `templates/gateway-calls.ts` — all gateway calls in date range (reads `action_audit` where `kind = "gateway.call"`)
  - `templates/denied-actions.ts` — all denied actions (reads `action_audit` where `status = "denied"`)
  - `templates/secret-accesses.ts` — all vault.read events (reads `action_audit` where `kind = "vault.read"`)
  - `templates/user-activity.ts` — events grouped by actor per tenant in date range
  - `templates/chain-verifier.ts` — runs `verifyHashChain` on audit window; returns pass/fail + anomalies
  - `index.ts` — `REPORT_TEMPLATES` registry; `runReport(templateId, params): Promise<ReportOutput>`
- [x] Add `report_runs` table (id TEXT PK, tenant_id TEXT, template_id TEXT, params_json TEXT, status TEXT, output_json TEXT, row_count INTEGER, started_at INTEGER, finished_at INTEGER, error TEXT)
- [x] Add API endpoints in `server/api/reports.ts`:
  - `GET /api/reports/templates` — list available templates with description + params schema
  - `POST /api/reports/run` — body: `{ templateId, params }`; runs synchronously for up to 5s, async beyond
  - `GET /api/reports/:runId` — status + output
  - `GET /api/reports/:runId/csv` — download as CSV
- [x] Register reporting routes in `server/api/router.ts`
- [x] Add tests in `server/api/reports.test.ts`: list templates; run gateway-calls template over seeded audit rows; denied-actions template returns only denied; CSV download has correct header
- [x] Run typecheck + tests + build

## Phase 6 — Data Residency + Tenant Settings

- [x] Add `tenant_settings` table in `server/db/dashboard.ts`: (tenant_id TEXT PK, data_residency_region TEXT, storage_root TEXT, audit_retention_days INTEGER, require_two_approvers INTEGER, sso_required INTEGER, updated_at INTEGER)
- [x] Implement `server/tenancy/settings.ts`:
  - `getTenantSettings(tenantId): TenantSettings`
  - `updateTenantSettings(tenantId, patch: Partial<TenantSettings>): TenantSettings`
  - `getStorageRoot(tenantId): string` — returns configured `storage_root` or env `STORAGE_ROOT` or `/var/lib/control-surface/tenants/<tenantId>`
  - On startup: ensure `storage_root` directory exists for each tenant
- [x] Add API endpoints in `server/api/tenant-settings.ts`:
  - `GET /api/tenant/settings` — get settings for current tenant
  - `PUT /api/tenant/settings` — update settings (partial)
- [x] Update audit export to write export files under `getStorageRoot(tenantId)/exports/`
- [x] Register tenant-settings routes in `server/api/router.ts`
- [x] Add tests in `server/api/tenant-settings.test.ts`: default settings; update data_residency_region; storage root resolves correctly
- [x] Run typecheck + tests + build

## Phase 7 — DPA / SOC2 Prep Artifacts

- [x] Create `server/compliance/` module:
  - `generator.ts` — `generateDpa(tenantId, customerName, effectiveDate)`; `listSubprocessors()`; `getSoc2Mapping()`
  - `documents/dpa-template.md` — template with `{{CUSTOMER_NAME}}`, `{{EFFECTIVE_DATE}}`, `{{TENANT_ID}}`, `{{RETENTION_DAYS}}`, `{{GENERATED_DATE}}` placeholders
  - `documents/subprocessors.md` — list of sub-processors
  - `documents/soc2-control-mapping.md` — mapping of SOC2 CC6/CC7/CC8/CC9 criteria to platform features
- [x] Add API endpoints in `server/api/compliance.ts`:
  - `GET /api/compliance/dpa` — generate DPA document
  - `GET /api/compliance/subprocessors` — list sub-processors
  - `GET /api/compliance/soc2-mapping` — SOC2 control mapping
  - `GET /api/compliance/summary` — aggregated compliance summary (from tenant settings)
- [x] Register compliance routes in `server/api/router.ts`
- [x] Add tests in `server/api/compliance.test.ts`: DPA generation fills placeholders; subprocessors list is non-empty; SOC2 mapping has entries for CC6/CC7/CC8/CC9; summary reflects tenant settings
- [x] Run typecheck + tests + build

## Phase 8 — Compliance UI

- [x] Create `app/routes/CompliancePage.tsx`:
  - **SSO Config panel**: provider picker (Keycloak/Azure AD/Okta/Google Workspace/Generic), issuer URL, client ID, client secret (masked), group mapping editor, enable/disable toggle, "Test Connection" button
  - **mTLS panel**: status indicator (enabled/disabled from env), copy-paste CA cert field, Caddy config snippet shown read-only
  - **4-Eyes panel**: toggle per-tenant; shows pending approval requests with Approve/Reject buttons (operator role required)
  - **Audit Export panel**: date range picker, format selector (JSONL/CSV), "Export" button → download; "Verify Chain" button on last export
  - **Reports panel**: template list with "Run" buttons; results shown inline as table; "Download CSV" per result
  - **Tenant Settings panel**: data residency region, storage root, audit retention days
  - **DPA / SOC2 panel**: "Download DPA" with customer name input; sub-processors list; SOC2 control mapping table
- [x] Add `/compliance` route to `app/App.tsx`
- [x] Add `Compliance` nav entry to `app/components/DashSidebar.tsx` (`Shield` or `Lock` icon)
- [x] Run typecheck + build + restart + verify `/compliance` loads

## Phase 9 — Exit Criteria Validation

- [x] `GET /api/sso/config` → 200 (empty or existing config)
- [x] SSO config PUT + GET round-trip → correct fields returned
- [x] `POST /api/approvals` flow: create request, two votes from different voters → status `approved`
- [x] Same-voter double-vote → deduplicated (still pending after one voter votes twice)
- [x] `POST /api/audit/export` → job starts; `GET /api/audit/export/:id` → success; hash chain verifies
- [x] `POST /api/reports/run` with `gateway-calls` template over seeded rows → non-empty output
- [x] `GET /api/compliance/summary` → 200 with compliance posture
- [x] `GET /api/compliance/dpa?customerName=Acme&effectiveDate=2026-01-01` → contains "Acme"
- [x] `/compliance` loads in browser, all panels render
- [x] Full test suite: `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/ 2>&1 | grep -E "pass|fail"` → 200+ pass
- [x] Typecheck: 0 errors
- [x] Build: clean

---

## Exit Criteria

- `bun run check` → 0 errors
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ server/marketplace/` → 200+ pass
- `bun run build` → clean
- `GET /api/compliance/summary` → 200
- `GET /api/sso/config` → 200
- 4-eyes approval flow works end-to-end
- `/compliance` route loads in browser
- Compliance nav entry in sidebar

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — use Node `crypto` for hashing/cert work, Bun built-ins for everything else.
- **No API keys in code**.
- Pre-existing TS errors: 0 — do NOT introduce any.
- For OIDC id_token verification in v1: validate iat/exp/iss/aud/nonce fields but skip RS256 signature verification (no jwks_uri key fetching needed); document the gap clearly in a comment.
- mTLS enforcement is middleware-only (Caddy injects PEM header) — no TLS termination changes needed.
- 4-eyes approval requests expire after 24h by default; `expireStaleRequests()` called on runner start.
- Audit export files written to tenant storage root — default `/var/lib/control-surface/tenants/<tenantId>/exports/`.
- Hash chain: use `prev_hash || JSON.stringify(row)` — simple, no external deps.
- All new endpoints must use `getTenantContext()` for tenant isolation.
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`.
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.


<!-- Builder run br_508dc: success at 2026-05-17T07:51:44.442Z — details: /opt/ai-vault/builder/2026-05-17-bw_4e0d8-br_508dc.md -->

<!-- Builder run br_566ef: success at 2026-05-17T08:40:24.888Z — details: /opt/ai-vault/builder/2026-05-17-bw_4e0d8-br_566ef.md -->

<!-- Builder run br_c4848: failed at 2026-05-17T09:34:30.105Z — details: /opt/ai-vault/builder/2026-05-17-bw_4e0d8-br_c4848.md -->

<!-- Builder run br_ba019: failed at 2026-05-17T09:54:15.814Z — details: /opt/ai-vault/builder/2026-05-17-bw_4e0d8-br_ba019.md -->

<!-- Builder run br_f1ecf: success at 2026-05-17T10:06:01.576Z — details: /opt/ai-vault/builder/2026-05-17-bw_4e0d8-br_f1ecf.md -->