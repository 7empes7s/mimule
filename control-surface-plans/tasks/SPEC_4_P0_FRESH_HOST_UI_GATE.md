# SPEC 4 — Fresh-Host UI Audit + Durable Gate (ULTRAPLAN P0.2 + P0.4)

**Repo:** /opt/opencode-control-surface. Scope: `e2e/fresh-host/` (run.sh mode flag, new UI spec, gate script), `playwright.config.ts` (new project), `e2e/multi-viewport.pw.ts` (ONLY if extracting the shared ROUTES list into an importable module — no behavior change), repo docs touched by the gate description. Nothing else.

## Goal
The fresh-host proof covers the rendered UI, not just the API — and the whole fresh-host suite becomes one durable command that can gate any "sellable" claim.

## Facts you must use (verified by the orchestrator)
- `e2e/fresh-host/run.sh` boots container `cs-freshhost` (oven/bun:1, --memory 2g --cpus 2) on host port 4600; it runs `bun run build` inside, so the built frontend IS served at http://localhost:4600. It currently removes the container on EXIT (trap).
- Cookie auth idiom (copy from e2e/multi-viewport.pw.ts): `operator_session` cookie = HMAC-sha256(base64url) of OPERATOR_TOKEN over "opencode-control-surface.operator-session.v1"; `operatorToken()` already honors the OPERATOR_TOKEN env var — the container token is `fresh-smoke-token`.
- The canonical static ROUTES list (41 routes) lives in e2e/multi-viewport.pw.ts.

## Deliverables
1. **run.sh keep mode**: `FRESH_HOST_KEEP=1 ./run.sh` leaves the container running after the API probe (skip the EXIT-trap removal in that mode, print how to remove it). Default behavior unchanged.
2. **`e2e/fresh-host/ui-audit.pw.ts`** + a `fresh-host-ui` Playwright project in playwright.config.ts (desktop chromium only, `testMatch` scoped so the normal `bunx playwright test` run does NOT pick it up unless the project is requested; baseURL from `FRESH_HOST_URL` env, default http://localhost:4600). Share the ROUTES list with multi-viewport.pw.ts via an extracted module (e.g. `e2e/routes.ts`) — do not fork the list. For each route assert:
   - Page renders: no blank body, no React error boundary, zero uncaught `pageerror` events (collect them, assert empty).
   - HONESTY: page text contains NO MIMULE-specific strings (`newsbites`, `mimoun`, `openclaw`, `paperclip`, `vast`, `techinsiderbytes`) EXCEPT inside an element that also reads as honest degradation (contains "not configured", "not connected", "unavailable", "no data", "—", or similar) — reuse the contextual-honesty idea from probe.mjs. Report violations with route + snippet.
   - No fake liveness: the page must not render a green/"active" status pill for a MIMULE-named service (there are none on a fresh host).
3. **`e2e/fresh-host/gate.sh`** — the ONE durable command (P0.4): runs run.sh (API probe), then the UI project against the kept container, then tears down; exits non-zero if REPORT.md has any CRASH or ERROR-5xx, any NEW leak beyond the one documented open LEAK (`/api/actions/catalog` vastInstance/vastBalance source keys), or any UI audit failure. Append a `## UI audit` section to REPORT.md (route → verdict table + failures).
4. Run the full gate end-to-end until green. Then `bun run check` clean and full `bun test` 0 fail (931 baseline) — paste tails.

## Hard rails
NO git commit/push, NO systemctl, NO pkill, never touch the live :3000 service, don't touch /opt/newsbites //opt/mimoun //opt/paperclip //opt/backups. Container stays capped + named cs-freshhost + removed at the end. Surgical diffs; match existing idiom. The orchestrator verifies and commits — not you. Verify synchronously; never pause waiting for background notifications.

## Report back
Changed files, gate.sh exit status + the UI audit verdict counts, any UI honesty violations found & fixed (file:line), full-suite tail.
