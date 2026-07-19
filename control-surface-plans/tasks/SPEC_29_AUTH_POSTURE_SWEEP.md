# SPEC 29 — Auth-posture sweep: gate every sensitive API GET at the app layer

## Context (read first — this is a LIVE security fix)
While landing SPEC 28 I confirmed at the PUBLIC edge (https://control.techinsiderbytes.com)
that **unauthenticated callers receive 200** from sensitive routes — Cloudflare Access does
NOT gate `/api` on this host, and many `server/api/router.ts` route registrations call their
handler with no auth check. Confirmed leaking today (anonymous curl → 200):
`/api/governance/users` (user emails+roles), `/api/settings/access` (access control),
`/api/data-explorer/tables` (arbitrary DB read), `/api/litellm/config`, `/api/gateway/ledger`,
`/api/cost`, `/api/traces`, `/api/reasoner/incidents`, `/api/events`, and more.

The auth model is cookie-session based: `getAuthenticatedUser` (server/auth/session.ts)
accepts the signed `operator_session` cookie OR the `x-operator-token` header/bearer.
**The logged-in dashboard sends the session cookie, so gating a GET with `checkToken` does
NOT break the live UI — it only blocks anonymous callers.** `checkToken` and `unauthorized`
are already imported in router.ts and are the established idiom (SPEC 28 used them on the
compliance GETs).

Work in `/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes
uncommitted.

## Build this — one change only, in `server/api/router.ts`

Gate EVERY `/api/*` and `/v1/*` route registration with
`if (!checkToken(req)) return unauthorized();` as the FIRST line of its handler block,
EXCEPT the explicit keep-public allowlist below. Mutating routes that already call
`requireMutation`/`require*Permission` keep those (do not double-gate — leave them exactly
as they are; requireMutation already implies auth). Routes that already have `checkToken`
stay as-is. Match the SPEC 28 idiom precisely; for `Promise`-returning handlers keep the
existing `Promise.resolve(...)` wrapping pattern already used nearby.

### KEEP PUBLIC — do NOT gate these (bootstrap, login, and intentional showcase surface):
- `/api/auth/status`, `/api/auth/login`, `/api/auth/session`
- `/api/public-status`
- `/api/version`
- `/api/settings/auth-status`
- `/api/licensing/status`
- `/api/telemetry/preview`, `/api/telemetry/consent`
- `/api/docs/tutorials`
- `/api/cloud-tier/status`
- `/api/sso/config`, `/api/sso/login`, `/api/sso/callback`, `/api/sso/logout`, `/api/sso/session`
- `/api/stream` (SSE — leave its existing handling untouched)
- `/api/install*` / first-run wizard routes (cold-install must work pre-auth — leave any
  install/onboarding routes exactly as they are)
- SHOWCASE (leave public — the fresh-host sell story renders these unauthenticated):
  `/api/home`, `/api/product-health`, `/api/metrics/showcase`

Everything else that is currently ungated — including but not limited to `/api/events`,
`/api/metrics`, `/api/autopipeline`, `/api/doctor`, `/api/models`, `/api/models/chain-sync`,
model-lifecycle GETs, `/api/newsbites`, `/api/v1/insights`, `/api/v1/agents`, `/api/v1/audit`,
`/api/data-explorer/*`, `/api/agents/skills`, `/api/builder/*` (projects/runs/log/artifacts/
doctor-reports and the run/workflow/pass GET matches), `/api/traces*`, `/api/audit/chain-status`,
`/api/litellm/*`, `/api/scout/*`, `/api/finance-intel/*`, `/api/system-config/history`,
`/api/paperclip/*`, `/api/fs/browse`, `/api/gateway*`, `/api/cost*`, `/api/mission-control`,
`/api/today`, `/api/workload`, `/api/settings/access` (+invite), `/api/governance/*`
(rbac/me, users, user-role, secrets, budgets, retention, audit), `/api/approvals`,
`/api/reasoner/*`, marketplace runs, report run/csv GET matches, `/api/telemetry`-nothing-else,
`/api/discovery/*` GETs, and the feature-flag history GET — **must be gated**.

If a route is genuinely required by the pre-login UI shell and would break when gated,
DO NOT invent an exception — leave it gated and note it in the report so I can decide;
the cookie-session model means the shell after login is fine, and the login screen only
needs the keep-public set above.

## Tests
- Extend `server/api/router.test.ts` (or the closest existing router/auth test; create
  `server/api/authGating.test.ts` if none fits): a table-driven test asserting that a
  representative sample of the newly-gated routes (governance/users, data-explorer/tables,
  litellm/config, gateway/ledger, cost, traces, reasoner/incidents, v1/insights,
  builder/projects, events) returns 401 WITHOUT credentials and 200 (or their normal
  non-401 status) WITH a valid `x-operator-token`. Assert the keep-public set
  (auth/status, public-status, version, home, product-health, metrics/showcase) still
  returns non-401 without credentials.
- Whatever test harness sets up requests, use the real `OPERATOR_TOKEN` env the other
  auth tests use (see server/api/auth.test.ts / fail-closed-auth.test.ts idioms).

## Hard rails
- NEVER touch `/etc/*` (this does NOT fix the Cloudflare layer — that's the operator's),
  `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts`; never widen `e2e/fresh-host/gate.sh`.
- Handler bodies unchanged — only prepend the auth guard in router.ts. No behavior change
  for authenticated callers.
- Do NOT touch builder/runner/terminal/gateway internal files — only router.ts + the test.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/ --timeout 60000` — all pass (auth-gating test included;
   existing tests must stay green — if any test authenticated implicitly and now 401s, that
   test was relying on the hole; fix the TEST to send credentials, note which).
3. `bash e2e/fresh-host/gate.sh` — expect PASS 41/41 (gated routes returning clean 401 JSON
   are HONEST to the probe; the keep-public set stays reachable).
4. `git status --short` — ONLY: router.ts + the auth-gating test (+ any existing test files
   updated to send credentials). NOT REPORT.*.

## Report back
The full list of routes you gated vs kept public; any existing tests you had to update to
send credentials (and why); the auth-gating test results; gate result; explicit confirmation
that handler behavior for authenticated callers is unchanged and no keep-public route was
gated.
