# SPEC 6 — Cold-Install Clip + Golden-Flow Rehearsal (ULTRAPLAN P1.4 + P1.3)

**Repo:** /opt/opencode-control-surface. Scope: new `e2e/demo/` (recording scripts + reports), `SHOWCASE_DEMO_SCRIPT.md` (repo root, next to SHOWCASE_SPINE_PLAN.md), `.gitignore` (+ `e2e/demo/clips/`), and ONLY the surgical UI/server fixes justified by rehearsal stumbles (each documented file:line).

## Goal
Two sell assets, built from what P0.5 proved: (1) recorded clips of the cold install + first-run wizard, (2) a written, twice-rehearsed golden demo flow that runs without improvisation.

## Facts you must use (verified by the orchestrator)
- `install.sh` (committed f9e56f0) cold-installs in ~13s inside `oven/bun:1`; prints the operator token once; starts the server foreground.
- `asciinema` 2.4.0 is installed ON THE HOST — record with `asciinema rec` wrapping docker commands from the host. Chromium for Playwright is already installed.
- `server/db/demo-seed.ts` seeds tenant "Northstar Showcase Demo" (id `showcase-demo`) with alive data (cost_events, hash-linked audit chain, reasoner incidents, agent-team jobs, spend anomalies) when the server boots with `DEMO_SEED=1`. It is invoked from server/index.ts. `server/db/demoTenant.ts` separately defines `acme-demo` insight seeds. Inspect both to learn exactly what data the demo tenant offers — the demo script may only promise what's actually seeded.
- First-run wizard: GET /api/setup/state, POST /api/setup/complete, banner on home (SPEC 5, committed).
- Fresh-host container idiom: see `e2e/fresh-host/run.sh` (working-tree archive via `git ls-files --cached --others --exclude-standard`, capped `--memory 2g --cpus 2`, env PORT/DASHBOARD_DB/DASHBOARD_DB_PATH/OPERATOR_TOKEN). Cookie auth idiom: e2e/multi-viewport.pw.ts (`operator_session` HMAC cookie) — but for the CLIPS use the real login screen like a human would.

## Deliverables
1. **`e2e/demo/record-cold-install.sh`** — one command that produces the cold-install terminal clip:
   - Boots a fresh `oven/bun:1` container (name `cs-demorec`, host port 4620, capped 2g/2cpu) from a working-tree archive, with `DEMO_SEED=1` in its env.
   - Records the money shots with host-side `asciinema rec --command "..."` → `e2e/demo/clips/cold-install.cast`: install.sh prereq checks → bun install/build → token printed → server start → curl `/` 200, with visible wall-clock. Keep the terminal narrow-clean (cols ~100) and the cast under ~3 min.
   - Leaves the container running for step 2 (print how to remove it); a `--teardown` flag or companion command removes it.
2. **`e2e/demo/record-wizard.mjs`** — standalone Playwright script (NOT a test; chromium, `recordVideo` 1280×720) against http://localhost:4620 → `e2e/demo/clips/first-run-wizard.webm`:
   - Real human path: login screen → enter the operator token from the container env file → home shows the first-run banner → type an install name → Finish setup → banner gone.
   - Continue into a short honest tour: insights inbox, /today, /cost — using the DEMO-labeled showcase tenant where the alive data lives (find the tenant switcher; the demo script must record the exact clicks).
   - Deliberate pacing (brief waits so the clip is watchable), no dev tools visible, viewport-only recording.
3. **`SHOWCASE_DEMO_SCRIPT.md`** (repo root) — ULTRAPLAN 1.3's demo script: exact clicks and expected screens for the golden flow **install → login → first-run wizard → switch to demo tenant → insights inbox opener → an insight with evidence drawer → apply (or approval path) → audit row shown → cost page savings story**. Every step: what you click, what you must see, what proves it's real (audit ids, hashes). Be explicit about what is staged DEMO data (clearly-labeled tenant, G3) vs live mechanism. If the seeded data cannot support a step (e.g. no unregistered-asset finding in the seed), the script must say so honestly and offer the nearest real alternative — never script a step that doesn't work.
4. **Rehearse the golden flow TWICE end-to-end** against the kept container, following your own script exactly (Playwright automation or scripted curl+screenshot walkthrough — but the flow order must match the script). Fix every stumble that is surgically fixable (broken link, dead-end empty state, error toast, mislabeled button) — each fix documented file:line in the report. Anything structural: report, don't build. Write **`e2e/demo/REHEARSAL_REPORT.md`**: run 1 findings → fixes → run 2 clean confirmation, plus a clip inventory (file, size, duration).
5. `.gitignore`: add `e2e/demo/clips/` (binary clips never committed). Scripts and reports ARE committed (by the orchestrator).
6. Verification: `bun run check` clean; full `bun test` 0 fail (942 baseline — you add no server code unless a stumble fix requires it, in which case tests accordingly); if any `app/` or `server/` file changed, run `bash e2e/fresh-host/gate.sh` and paste the tail (must exit 0, zero exceptions).

## Hard rails
NO git commit/push, NO systemctl, NO pkill, never touch the live :3000 service or its env (DEMO_SEED must NEVER be set on the live service), never touch /opt/newsbites //opt/mimoun //opt/paperclip //opt/backups. Containers capped, named cs-demorec, removed when done (after clips are safely written to e2e/demo/clips/). Clips stay out of git. Surgical diffs. Orchestrator verifies and commits. Verify synchronously; never pause waiting for background notifications — no monitor will ever notify you.

## Report back
Clip inventory (paths, sizes, durations), demo-script step list, rehearsal run 1 stumbles + fixes (file:line) + run 2 result, test/gate tails, changed-file list.
