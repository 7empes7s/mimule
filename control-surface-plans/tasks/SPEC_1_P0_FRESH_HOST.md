# SPEC 1 — P0 Fresh-Host Harness (ULTRAPLAN P0.1–0.3)

**Repo:** /opt/opencode-control-surface (Bun + TypeScript server/, Vite React app/)
**Goal:** Prove the control surface boots honestly on a machine that is NOT this VPS (G9). Build a repeatable harness, run it, report what breaks, fix the honest-degrade gaps.

## Hard rails (violating any = failed task)
- NO `git commit`, NO `git push`, NO `systemctl` calls, NO killing processes you didn't start, NO edits outside /opt/opencode-control-surface + /root/control-surface-plans/tasks/.
- Do NOT touch /opt/newsbites, /opt/mimoun, /opt/paperclip, /opt/backups.
- Docker container MUST be resource-capped: `--memory 2g --cpus 2`. Name it `cs-freshhost`. Remove it when done (`docker rm -f cs-freshhost`).
- The live service on :3000 keeps running untouched. Use port 4600+ range for the container.

## Deliverables
1. `e2e/fresh-host/run.sh` — one command that:
   a. Builds a git archive of the current working tree (`git archive HEAD` or `git ls-files | tar`) so no VPS state leaks in.
   b. Runs `oven/bun:1` container (memory/cpu-capped, port 4600→3000) with the archive at /app, `bun install --frozen-lockfile` (or plain install), and boots `bun run server/index.ts` with ONLY: `PORT=3000 DASHBOARD_DB=1 DASHBOARD_DB_PATH=/tmp/fresh.sqlite OPERATOR_TOKEN=fresh-smoke-token`. NOTHING else — no LiteLLM key, no MIMULE paths.
   c. Waits for boot, then probes from the host: `/` (200), every `/api/*` GET endpoint listed in server/api/router.ts that takes no params (use Bearer fresh-smoke-token), asserting: HTTP < 500, valid JSON envelope, and response contains NO MIMULE-specific strings (`newsbites`, `mimoun`, `openclaw`, `paperclip`, `vast`, `techinsiderbytes`) unless the field is clearly a "not configured" message.
   d. Writes `e2e/fresh-host/REPORT.md`: table of endpoint → status → verdict (HONEST / LEAK / CRASH / ERROR-5xx), plus the container boot log tail.
2. Fixes for every CRASH and 5xx found: the correct behavior on a fresh host is an honest degraded envelope (`sourceStatus: "error"` or explicit "not configured" data), never a crash. For LEAK verdicts (hardcoded MIMULE inventory rendered as if real), fix the source to return empty/honest data when the underlying path/service is absent — look at `server/adapters/system.ts` and any file with hardcoded `/opt/` paths (grep first).
3. After fixes: re-run harness until REPORT.md shows zero CRASH and zero 5xx. LEAKs remaining must be listed with file:line in the report's "open" section if genuinely ambiguous.
4. Validation before finishing: `bun run check` clean AND `bun test` full suite 0 fail (919+ tests — run it, paste the tail into the report).

## Report back (append to REPORT.md)
Changed files list, before/after endpoint verdict counts, full-suite result line, anything you could not fix and why.
