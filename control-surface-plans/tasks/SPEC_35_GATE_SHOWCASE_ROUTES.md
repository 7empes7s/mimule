# SPEC 35 — Gate the showcase routes (operator decision: not intentionally public)

## Context (read first)
SPEC 29 gated every sensitive `/api` GET but deliberately LEFT PUBLIC three "showcase"
routes on the assumption they were intentionally world-readable for a demo. The operator has
now confirmed that was NOT intentional — gate them like the rest. Work in
`/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Facts (verified):
- The three routes — `GET /api/home`, `GET /api/product-health`, `GET /api/metrics/showcase`
  — are consumed ONLY by authenticated pages via `useApi`/`authFetch` (DashHome, AboutPage),
  which carry the session credential. Gating them does NOT break the logged-in dashboard;
  only anonymous callers are turned away.
- The fresh-host container sets `OPERATOR_TOKEN` and both the UI audit and the API probe
  authenticate with it, so the gate stays green after gating.
- `checkToken` and `unauthorized` are already imported in `server/api/router.ts` (this is
  the exact SPEC 29 idiom).

## Build this — `server/api/router.ts` only
Add `if (!checkToken(req)) return unauthorized();` as the first line of the handler dispatch
for each of these three GET routes, matching the sibling gated routes precisely:
- `GET /api/home`
- `GET /api/product-health`
- `GET /api/metrics/showcase`

Leave every other route exactly as-is (do not touch the remaining keep-public allowlist:
auth/*, sso/*, public-status, version, settings/auth-status, licensing/status, telemetry/*,
docs/tutorials, cloud-tier/status, stream, install/onboarding).

## Tests — the SPEC 29 auth-gating test
In the auth-gating test (server/api/router.test.ts or wherever SPEC 29 put it): MOVE
`/api/home`, `/api/product-health`, `/api/metrics/showcase` from the keep-public assertions
into the gated assertions — assert each returns 401 WITHOUT credentials and a non-401 status
WITH a valid `x-operator-token`. If any existing test fetched these three without
credentials and relied on a 200, update it to send the test operator token (note which).

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit autoapplyPolicy.ts; never widen gate.sh. Handler bodies unchanged — only the
  auth guard is prepended. Only router.ts + the auth test change.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean.
2. `DASHBOARD_DB=1 bun test server/api/router.test.ts server/api/ --timeout 60000` — all pass.
3. `git status --short` — ONLY: router.ts + the auth test. NOT REPORT.*.
4. `git diff --check` — clean.

## Report back
The three gated routes; the test moves; any existing test updated to send credentials;
test results; confirmation no other route changed.
