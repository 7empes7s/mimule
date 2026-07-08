# SPEC 5 — Cold-Install Script + First-Run Wizard Stub (ULTRAPLAN P0.5)

**Repo:** /opt/opencode-control-surface. Scope: new `install.sh` (repo root), `docs/INSTALL.md`, server first-run pieces (`server/api/` + `server/db/` as needed), `app/` first-run wizard stub, tests alongside.

## Goal
Bare host → login screen in <10 minutes with one documented command, and a first-run experience that doesn't assume MIMULE: create the operator token, name the tenant.

## Deliverables
1. **`install.sh`** (POSIX bash, idempotent, safe to re-run):
   - Checks prerequisites (bun; git; curl) and prints honest install hints per missing tool — never auto-installs system packages.
   - Clones/uses the current directory, `bun install`, `bun run build`.
   - Generates a strong random OPERATOR_TOKEN if none exists; writes an env file (default `./control-surface.env`, overridable) with PORT, DASHBOARD_DB=1, DASHBOARD_DB_PATH, OPERATOR_TOKEN — chmod 600; prints the token ONCE with a "store this now" warning.
   - Starts the server (foreground by default; `--systemd` flag emits a unit file to stdout/file for the operator to install themselves — the script itself NEVER runs systemctl).
   - `--check` mode: dry-run that validates prerequisites and prints the plan.
   - Must work inside the fresh-host container (that is the test: see below).
2. **First-run wizard stub** (server + app):
   - Server: `GET /api/setup/state` → `{ needsSetup: boolean }` — true when no tenant has been renamed from the seed default AND no first-run marker row exists (add a simple `app_settings` key/value row via the existing migration idiom; do NOT invent new frameworks).
   - `POST /api/setup/complete` (auth required) with `{ tenantName }`: renames the default tenant, writes the marker, audited (`setup.complete`, risk low).
   - App: when `needsSetup` is true, show a dismissible first-run banner/modal on the home route: input for tenant name + a "Finish setup" button hitting the endpoint; skippable ("Later" writes nothing, banner returns next session until completed). Match existing UI idiom; no new dependencies.
3. **Prove it**: run install.sh inside a fresh `oven/bun:1` container (capped, name `cs-coldinstall`, port 4610, remove when done) from a working-tree archive; measure wall-clock from container start to `/` returning the login/app shell; assert <10 min; verify /api/setup/state true → complete → false. Save transcript to `e2e/fresh-host/COLD_INSTALL_REPORT.md`.
4. Tests: setup-state/complete endpoints (hermetic tempdir DB, cost.test.ts idiom). `bun run check` clean, full `bun test` 0 fail — paste tails.

5. **Rider — fix the one KNOWN UI-audit finding** (from SPEC 4): `app/components/WorkloadGraphTable.tsx` (~lines 171/179/187/195) renders `pill green` for "{count} success" even when the count is 0 — fake liveness on a fresh host. Fix: neutral/gray pill when success+failed+running are all 0 (match existing pill class idiom). Then REMOVE the corresponding KNOWN/ACCEPTED exception block from `e2e/fresh-host/gate.sh` (title "fresh-host ui /today") and prove the gate passes clean with zero exceptions.

## Hard rails
NO git commit/push, NO systemctl invocations anywhere (emitting a unit FILE is fine), NO pkill, never touch the live :3000 service or /opt/newsbites //opt/mimoun //opt/paperclip //opt/backups. Containers capped and removed. Surgical diffs. Orchestrator verifies and commits. Verify synchronously; never pause waiting for background notifications.

## Report back
Changed files, cold-install wall-clock time, setup flow evidence (state JSON before/after), test tails.
