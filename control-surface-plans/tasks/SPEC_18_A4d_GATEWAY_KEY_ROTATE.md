# SPEC 18 — ULTRAPLAN Phase 3 A4d: Gateway key rotate (grace-period dual-validity)

## Context (read first)
ULTRAPLAN A4d: *"Gateway key rotate — `rotate:gateway-key:<id>` (medium) with grace-period
dual-validity."* A prior autonomous builder attempt claimed this done but the code NEVER reached
master — you are building it fresh on top of `ac20a5a`. Work in `/opt/opencode-control-surface`
(Bun + TS `server/`, Vite/React `app/`). Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — mirror these, do not reinvent):
- `server/gateway/keys.ts` (217 lines): `gateway_keys` DB helpers — `createGatewayKey`,
  `verifyGatewayKey(plaintext)`, `listGatewayKeys`, `revokeGatewayKey`, `checkKeyDailySpend`.
  `GatewayKeyRecord = { id, agentId, name, modelAllowlist, dailyCapUsd, status: "active"|"revoked",
  createdAt, lastUsedAt, tenantId }`. Keys are `gwk_...` plaintext, sha-hashed into `key_hash`.
- `server/db/dashboard.ts` line ~1086: `gateway_keys` table (id, agent_id, name, key_hash,
  model_allowlist, daily_cap_usd, status CHECK active|revoked, created_at, last_used_at, tenant_id).
  Find and reuse the file's existing add-column migration idiom for new columns.
- `server/api/gatewayKeys.ts`: `listGatewayKeysHandler`, `createGatewayKeyHandler`,
  `revokeGatewayKeyHandler` (see how revoke does confirm/reason + audit).
- `server/api/router.ts`: `GET/POST /api/gateway/keys`, `POST /api/gateway/keys/:id/revoke`
  (regex match idiom at ~line 1074).
- `server/api/actionDescriptors.ts` + `server/api/execute.ts`: the governed action framework —
  see `clear-cooldown` (A4b) for the descriptor idiom and execute.ts's kind→confirm/risk maps.

## Build this

### 1. Schema (server/db/dashboard.ts)
Add two nullable columns to `gateway_keys` using the file's existing column-migration idiom:
- `rotated_from_key_id TEXT` — set on the REPLACEMENT key, links back to the old key.
- `rotation_revoke_at INTEGER` — set on the OLD key: epoch-ms when its grace expires.

### 2. Rotation core (server/gateway/keys.ts)
- Extend `GatewayKeyRecord` (+ row mapping) with `rotatedFromKeyId: string | null` and
  `rotationRevokeAt: number | null`.
- `export function rotateGatewayKey(id: string, opts?: { graceSeconds?: number }): CreatedGatewayKey`
  (or `| null` when the key is missing/revoked/already-pending-rotation):
  - Old key must be `active` and not already have `rotation_revoke_at` set (no double-rotate).
  - Create a replacement key with the SAME agent_id, name, model_allowlist, daily_cap_usd,
    tenant_id; set its `rotated_from_key_id` to the old id. Return the one-time plaintext +
    record (same shape as `createGatewayKey`).
  - Set the old key's `rotation_revoke_at = Date.now() + graceSeconds*1000`
    (default grace **86400s / 24h**). Old key stays `status='active'` during grace →
    **dual-validity**: both keys verify during the grace window.
- `verifyGatewayKey`: if a matched key has `rotation_revoke_at` in the past → return `null`
  and best-effort flip its status to `revoked` (single UPDATE; never throw from verify).
- `listGatewayKeys`: include the two new fields.

### 3. Route (server/api/gatewayKeys.ts + router.ts)
- `export async function rotateGatewayKeyHandler(req, keyId): Promise<Response>` — mirror the
  revoke handler's auth/confirm/reason/audit shape exactly; body may carry `graceSeconds`
  (clamp to [60, 30*86400]); respond with the one-time plaintext + new record + old key's
  `rotationRevokeAt`. 404/409 for missing / non-active / already-pending keys.
- Register `POST /api/gateway/keys/:id/rotate` in router.ts next to the revoke route,
  same `requireMutation` gating.

### 4. Governed action (actionDescriptors.ts + execute.ts)
- New kind `"rotate"`: in execute.ts's maps — confirm **true**, reasonRequired **true**,
  risk **"medium"** for `targetType === "gateway-key"`.
- Descriptors: for each `listGatewayKeys()` key that is `active` AND `rotated_from` no pending
  grace (i.e. `rotationRevokeAt == null`), emit `actionId("rotate", "gateway-key", key.id)`,
  kind `"rotate"`, target `gateway-key`, label mentioning the key name. Follow the
  `clear-cooldown` descriptor block as the template.
- execute.ts: dispatch `kind === "rotate" && targetType === "gateway-key"` →
  call `rotateGatewayKey`, audit, return the one-time plaintext in the action result payload
  (mirroring how the POST route responds).
- Do NOT touch `server/insights/autoapplyPolicy.ts` — rotate must NEVER be auto-appliable.

### 5. UI (app/routes/GatewayPage.tsx)
On the existing keys table rows: a **Rotate** button for active keys without pending rotation —
confirm + reason prompt (reuse the page's existing action/confirm idiom, e.g. how revoke is done),
then show the one-time replacement plaintext exactly the way key-creation already does (copy once).
Show a "grace until <time>" pill on keys with `rotationRevokeAt` set. Match existing styling.

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts; no dev server on :3000.
- Do NOT edit `server/insights/autoapplyPolicy.ts`.
- Hermetic tests only — never a real network call; use the existing test DB idioms
  (`DASHBOARD_DB_PATH` temp file, like `server/db/dashboard.test.ts` / `demoTenant.test.ts`).
- Never widen `e2e/fresh-host/gate.sh` matchers.

## Tests (write + they must pass)
`server/gateway/keys.rotate.test.ts` (temp DASHBOARD_DB_PATH, DASHBOARD_DB=1):
1. rotate happy path: replacement inherits agent/name/allowlist/cap/tenant, has
   `rotatedFromKeyId`; old key gets `rotationRevokeAt` ≈ now+grace; BOTH plaintexts verify
   during grace (dual-validity).
2. after grace (inject a past `rotation_revoke_at` via direct UPDATE): old plaintext verifies
   null AND old key flips to revoked; new key still verifies.
3. guard rails: rotate on revoked key → null/409; double-rotate (pending grace) → null/409.
4. clamp: graceSeconds below/above bounds clamps.
Plus focused additions to the existing actionDescriptors/execute test files: descriptor emitted
only for active non-pending keys; `rotate` kind is confirm+reason, medium risk; execute path
returns one-time plaintext and audits.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/gateway/keys.rotate.test.ts server/api/actionDescriptors.test.ts server/api/execute.test.ts --timeout 30000` — all pass.
3. `git status --short` — ONLY: dashboard.ts, keys.ts, gatewayKeys.ts, router.ts,
   actionDescriptors.ts (+test), execute.ts (+test), GatewayPage.tsx, the new rotate test,
   possibly types.ts/globals.css. NOT autoapplyPolicy.ts. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed (one line each), the rotate function + verify change, the new route + action
dispatch snippets, test summary lines, and explicit confirmation autoapplyPolicy.ts is untouched.
Do NOT run the full suite or the fresh-host gate — the orchestrator does that.
