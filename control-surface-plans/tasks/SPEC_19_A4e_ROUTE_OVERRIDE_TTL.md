# SPEC 19 — ULTRAPLAN Phase 3 A4e: Route override with TTL (pin a model for N hours)

## Context (read first)
ULTRAPLAN A4e: *"Route override with TTL — pin a model for N hours (low), auto-reverts, audited;
solves 'GPU back online, prefer local for tonight'."* Work in `/opt/opencode-control-surface`
(Bun + TS `server/`, Vite/React `app/`). Do NOT commit/push/restart; leave changes uncommitted.
This is a FRESH build on `dc2fb62` — do not recover any route-override code from git history or
stashes; an earlier autonomous attempt was reverted as contamination.

Existing surface at HEAD (verified — EXTEND this, do not replace):
- `server/gateway/router.ts`: a global in-process `routeOverride` already exists —
  `GatewayRouteOverride` type, `activeRouteOverride()` (lazy TTL expiry),
  `setGatewayRouteOverrideForGatewayAdmin` (ttlMs clamp **[60s, 60min]**, default 15min),
  `getGatewayRouteOverrideForGatewayAdmin`, `clearGatewayRouteOverrideForGatewayAdmin`,
  `getGatewayRoutePlanForGatewayAdmin`; `buildChain()` unshifts `override.targetModel` onto
  EVERY logical model's chain. Also `writeActionAudit` is already imported there (budget-stop).
- `server/api/gateway.ts`: `gatewayStatusHandler` exposes `routeOverride`;
  `gatewayRouteHealthiestHandler` (POST `/api/gateway/route-healthiest`) auto-picks the
  healthiest model and sets an override (audited via the file's `auditGateway` helper).
- `server/api/execute.ts`: dispatches `start-job:gateway:route-healthiest` and
  `start-job:gateway:clear-route-override` already exist (~line 308–340); enforcement map
  `getEnforcement()` at line 60, risk map near line 90 (see A4d's `rotate` and A4b's
  `clear-cooldown` entries as templates).
- `server/api/actionDescriptors.ts`: `addGatewayActions()` (~line 506) emits the single
  route-healthiest descriptor — follow its `descriptor({...})` idiom.
- `app/routes/GatewayPage.tsx`: status type at line ~17 includes `routeOverride`; an override
  banner renders at ~line 470; `runAction` idiom + route-healthiest buttons at ~530/566.
- DB idiom: `getDashboardDb`, `isDashboardDbEnabled` from `server/db/dashboard.ts`
  (see `server/gateway/keys.ts` imports). Tests set temp `DASHBOARD_DB_PATH` per file.

Gaps A4e closes: (1) operator cannot pin a CHOSEN model — only "healthiest"; (2) TTL is capped
at 60 minutes — "for tonight" needs hours; (3) override is lost on service restart; (4) expiry
(auto-revert) is silent — not audited; (5) no governed catalog descriptors for pin/clear;
(6) UI has no pin control and no clear button.

## Build this

### 1. TTL clamp for hours (server/gateway/router.ts)
In `setGatewayRouteOverrideForGatewayAdmin`, raise the clamp max from `60 * 60_000` to
**`7 * 86_400_000` (7 days)**. Keep the 60s min AND the existing 15-min default `ttlMs`
unchanged (route-healthiest behavior must not change). Update any existing test that asserts
the old 60-min max.

### 2. Restart persistence + audited auto-revert (server/db/dashboard.ts + server/gateway/router.ts)
- New single-row table in dashboard.ts's schema block (exact SQL):
  ```sql
  CREATE TABLE IF NOT EXISTS gateway_route_override (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target_model TEXT NOT NULL,
    resolved_model TEXT NOT NULL,
    tier TEXT NOT NULL,
    reason TEXT,
    set_at TEXT NOT NULL,
    set_by TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  ```
- In router.ts: lazy load-once — module flag + `ensureRouteOverrideLoaded()` called from
  `activeRouteOverride()` (and therefore `buildChain`): when the flag is unset and
  `isDashboardDbEnabled()` && `getDashboardDb()`, read row id=1 into the in-memory
  `routeOverride` (ISO strings map 1:1 to the existing type). Set flag regardless of outcome.
- Write-through: `set…` upserts the row (`INSERT ... ON CONFLICT(id) DO UPDATE`); `clear…`
  deletes it; lazy expiry in `activeRouteOverride()` deletes it AND writes a best-effort audit
  via the already-imported `writeActionAudit` — actionKind `"gateway.route-override-expired"`,
  actor `"gateway"`, targetType `"gateway-route"`, targetId = targetModel, risk `"low"`,
  resultStatus `"success"`. A row loaded already-expired takes the same expiry path.
- EVERY DB op here is best-effort try/catch (console.warn) — when the DB is disabled or errors,
  in-memory behavior must be EXACTLY as today. Never throw from load/save/expiry.
- Test seam: `export function resetGatewayRouteOverrideStateForTests(): void` — nulls the
  in-memory override AND the loaded flag WITHOUT touching the DB (simulates a restart).

### 3. Pin/clear routes (server/api/gateway.ts + server/api/router.ts)
- `POST /api/gateway/route-override` — `gatewaySetRouteOverrideHandler(req)`: body
  `{model, ttlMs?, reason, confirmed}`. `confirmed !== true` → 400; missing/empty `reason` →
  400; `model` must be a key of `loadGatewayConfig().models` else 404 (honest message);
  `ttlMs` defaults to **4h (14_400_000)** in THIS handler (setter default stays 15min), setter
  clamps. Call the setter with resolvedModel/tier from `resolveModel(model)`; audit via
  `auditGateway` actionKind `"gateway.route-override-set"` (rollbackHint: expires at X, or
  DELETE /api/gateway/route-override); respond `{ok, routeOverride, message}` like
  route-healthiest does.
- `DELETE /api/gateway/route-override` — `gatewayClearRouteOverrideHandler(req)`: 404 when no
  active override; body `reason` optional; clear + audit actionKind
  `"gateway.route-override-cleared"`; respond `{ok, message}`.
- Register both in server/api/router.ts next to `/api/gateway/route-healthiest` with the SAME
  mutation gating that wraps the adjacent POST gateway routes.

### 4. Governed action (types.ts + execute.ts + actionDescriptors.ts)
- `server/api/types.ts`: add `"pin"` to the action-kind union (exactly where `"rotate"` was added).
- execute.ts: enforcement `kind === "pin" && targetType === "gateway-route"` → confirm **true**,
  reasonRequired **true**; risk `"pin"` → **"low"** (auto-reverts, reversible). Dispatch:
  `kind === "pin" && targetType === "gateway-route"` → targetId must be a
  `loadGatewayConfig().models` key else NOT_FOUND; `ttlMs` from `body.params?.ttlMs`
  (default 4h); call the setter (setBy from tenant context like the route-healthiest dispatch);
  return `{ok, action: "pin", message: "Pinned gateway routing to <model> until <expiresAt>"}`.
- actionDescriptors.ts `addGatewayActions()`: for EACH key of `loadGatewayConfig().models`,
  emit `pin:gateway-route:<logicalName>` — kind `"pin"`, targetType `"gateway-route"`,
  risk `"low"`, confirm true, reasonRequired true, impactPreview mentioning the 4h default TTL
  and auto-revert, rollbackHint "Clear the route override from the Gateway page or wait for
  expiry", sourceRoute `/gateway`, requiresOnline true. Additionally, ONLY when
  `getGatewayRouteOverrideForGatewayAdmin()` is non-null, emit a descriptor for the EXISTING
  dispatch `start-job:gateway:clear-route-override` (kind `"start-job"`, targetType
  `"gateway"`, targetId `"clear-route-override"`, risk `"low"`; confirm/reason flags must match
  what `getEnforcement("start-job","gateway")` returns).
- Do NOT touch `server/insights/autoapplyPolicy.ts` — pin must NEVER be auto-appliable.

### 5. UI (app/routes/GatewayPage.tsx)
- Extend the existing override banner: show `setBy` and add a **Clear override** button
  (confirm; optional reason; DELETE `/api/gateway/route-override`; refresh status like other
  actions on the page).
- Add a **Pin model** control near the route-healthiest button: model picker populated from
  data the page already has (`status.circuits` keys / models list — reuse, don't invent a new
  fetch if one exists), TTL-hours numeric input (default 4, min 1/60≈0.0167 accepts fractional,
  max 168) converted to `ttlMs`, reason prompt, then POST `/api/gateway/route-override` with
  `confirmed: true`. Match the page's existing prompt/confirm + styling idioms exactly.
- Update the local status type if needed.

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts; no dev server on :3000.
- Do NOT edit `server/insights/autoapplyPolicy.ts`. Never widen `e2e/fresh-host/gate.sh` matchers.
- Hermetic tests only — temp `DASHBOARD_DB_PATH` per file (see keys.rotate.test.ts /
  gateway.test.ts beforeAll idiom); never a real network call; never the live
  `/var/lib/control-surface/dashboard.sqlite`.
- Keep `gatewayRouteHealthiestHandler` and both existing `start-job:gateway:*` dispatch
  behaviors working unchanged (except the wider clamp max).

## Tests (write + they must pass)
`server/gateway/routeOverride.test.ts` (temp DASHBOARD_DB_PATH, DASHBOARD_DB=1):
1. pin persists: set override → `getGatewayRoutePlanForGatewayAdmin("editorial-heavy")[0]` is
   the pinned model; then `resetGatewayRouteOverrideStateForTests()` (simulated restart) →
   override still active (loaded from DB) and chain still pinned.
2. clamp: ttlMs 1_000 → expires ≈ now+60s; ttlMs 30 days → expires ≈ now+7d.
3. audited auto-revert: force `expires_at` into the past via direct DB UPDATE +
   `resetGatewayRouteOverrideStateForTests()` → `getGatewayRouteOverrideForGatewayAdmin()`
   null, DB row deleted, and an `action_audit` row with actionKind
   `gateway.route-override-expired` exists.
4. clear: removes memory + DB row; second clear is a no-op.
Plus focused additions:
- actionDescriptors.test.ts: `pin:gateway-route:<name>` emitted for config models; the
  clear-route-override descriptor appears ONLY while an override is active.
- execute.test.ts: pin enforcement (unconfirmed → CONFIRM_REQUIRED path, no reason → reason
  path — mirror rotate's test shape), risk low, unknown model → NOT_FOUND, happy path returns
  the until-message and the route plan is pinned.
- Route handlers (in the existing gateway API test file's idiom): 400 unconfirmed, 400 no
  reason, 404 unknown model, happy path 200 + audit; DELETE 404-when-none / 200-when-active.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/gateway/routeOverride.test.ts server/api/gateway.test.ts server/api/actionDescriptors.test.ts server/api/execute.test.ts server/api/reasoner.postmortem.test.ts server/insights/insights.test.ts --timeout 30000` — all pass.
3. `git status --short` — ONLY: dashboard.ts, gateway/router.ts, api/gateway.ts, api/router.ts,
   actionDescriptors.ts (+test), execute.ts (+test), types.ts, GatewayPage.tsx, the new
   routeOverride test, possibly gateway.test.ts. NOT autoapplyPolicy.ts. NOT gate.sh. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed (one line each), the persistence load/save + expiry-audit snippet, the new route
registrations, the pin dispatch snippet, test summary lines, and explicit confirmation that
autoapplyPolicy.ts is untouched and route-healthiest behavior is unchanged.
Do NOT run the full suite or the fresh-host gate — the orchestrator does that.
