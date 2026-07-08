# SPEC 14 — A3a: durable job-backed restart/timer + command seam + cloudflared health probe (ULTRAPLAN P3/A3)

**Builder**: Sonnet subagent. **Verifier/committer**: Fable (orchestrator). You NEVER commit, NEVER run systemctl/pkill/restart/docker, NEVER touch live services except read-only.

## Mission

Two of A3's four bullets — the "no more fire-and-forget" foundation:
1. **Durable-job-backed restart/timer-run** — the two existing infra mutation handlers become job-backed (visible on /jobs, retryable) with before/after state capture, instead of synchronous fire-and-forget.
2. **Cloudflared/tunnel restart with post-restart health-probe evidence** — folds into (1): cloudflared is a service, so the before/after `is-active` capture IS its health probe. Make that evidence explicit.

The enabling refactor is a **testable command-runner seam** so none of this can be exercised against the real host in tests. (Disk reclaim + backup freshness = the A3b half, a later spec — do NOT build them here.)

## Ground truth (verified by orchestrator 2026-07-06 — re-confirm before building)

- `server/api/actions.ts` `infraServiceRestartHandler` (~line 777) and `infraRunTimerHandler` (~863): both `requireMutation`, allowlist-checked, write an `action_audit` row — but call `execSync` **synchronously** (blocking the HTTP response up to 30–60s) and **never `createJob`**, so they don't appear on /jobs and aren't retryable. This is the fire-and-forget A3 targets.
- **Latent bug in `infraRunTimerHandler`**: it runs `systemctl start ${timer}.service` **without `--no-block`** at a 5 s timeout. A timer whose oneshot runs >5 s throws ETIMEDOUT → false "failed". The execute.ts timer path (line 256) and model-health path (279) already use `--no-block` for exactly this reason. Fix it here too.
- Allowlists (`server/api/actions.ts` ~16-27): `ALLOWED_SERVICES = [newsbites, newsbites-autopipeline, litellm, opencode-server, control-surface, vast-tunnel, cloudflared]`; `ALLOWED_CONTAINERS = [openclaw_gateway, paperclip, goblin_game]`; `ALLOWED_TIMERS = [model-health-check, mimule-backup, paperclip-action-notify, newsbites-agent-watch, newsbites-brief, morning-brief, vast-watchdog]`. **Do not widen these.** `cloudflared` is already present — its restart already routes through the service handler; this spec adds the health-probe evidence, not a new allowlist entry.
- Job pattern to mirror: `doctorScanHandler` / `doctorRequeuHandler` (`server/api/actions.ts`) — `createJob` + immediate `{ok, jobId}` + async worker (exported for direct-await testing) that `updateJobOutput` + `finishJob(jobId, "success"|"failed", …)` + a `.finished` audit row. `createJob/finishJob/updateJobOutput` in `server/db/writer.ts`; generic cancel/retry in `server/api/jobs.ts`; jobs surface on /jobs.
- **No command seam exists** — `execSync` is imported and called directly in `server/api/execute.ts` (8 sites) and `actions.ts`. `server/adapters/system.ts:149` already `execSync("df -BG / …")`. Tests currently cannot exercise any execSync path without hitting the real host.
- InfraPage (`app/routes/InfraPage.tsx`) already calls `/api/infra/service-restart` and `/api/infra/run-timer` via `useAction`, with confirm modals + a cloudflared restart button + a LiteLLM restart button + a disk usage bar. Keep those working; surface the returned `jobId`.

## Hard rails (non-negotiable)

- **NO real system mutation in build or test.** You must NOT run `systemctl restart`/`start`, `docker restart`, or any service/timer mutation against this host. ALL behavioral proof is hermetic: route every command through the new seam and **stub the seam** in tests, asserting the exact command string, the job rows, the audit rows, before/after capture, allowlist refusal, and the `--no-block` fix. You may run read-only `systemctl is-active <svc>` / `systemctl status` to understand output shapes, nothing mutating.
- Live :3000 GET-only for you. NEVER commit/git-mutate; NEVER systemctl/pkill/restart; NEVER touch /opt/newsbites, /opt/mimoun, /opt/paperclip, /opt/backups except read-only; never echo secrets; never set DEMO_SEED; never widen a gate.sh matcher or an allowlist.
- Keep the two routes and their request bodies backward-compatible — the live UI depends on them. Adding `jobId` to the response is fine; changing/removing existing fields is not.
- Keep repo idioms (writeActionAudit, createJob/finishJob, risk tiers — service restart stays **high**, timer stays **medium**; UX/table standard).

## Deliverable 1 — Command-runner seam

- New small module (e.g. `server/api/shell.ts` or `server/lib/shell.ts`) exporting a `runShell(command: string, opts?: {timeout?: number}) => { ok: boolean; stdout: string; stderr?: string; error?: string }` wrapper around `execSync` (capturing output, never throwing to the caller — return `ok:false` on non-zero/throw), plus a test seam: either an injectable runner or an env/module-level override the tests can set (follow the repo's existing override idiom — e.g. how `DASHBOARD_DOCTOR_LOG_PATH` / a settable module function is used). Document the seam.
- Migrate ONLY what this spec needs (the two infra handlers + their new workers) onto the seam. Do NOT churn all 8 execute.ts call sites in this spec — leaving them is fine; note them as follow-up. Keep the diff bounded.

## Deliverable 2 — Job-backed service restart (+ cloudflared health probe)

- Convert `infraServiceRestartHandler`: still `requireMutation` + allowlist (unchanged); on an allowlisted target, `createJob({kind:"infra-service-restart", targetType:"service", targetId:service, …})`, return `{ok, jobId, message}` immediately, and run an exported async worker that:
  1. Captures BEFORE state via the seam — `systemctl is-active <svc>` for services, `docker inspect --format '{{.State.Status}}' <svc>` for containers.
  2. Issues the restart via the seam (`systemctl restart` / `docker restart`).
  3. After a short settle (≈1.5 s; a named constant), captures AFTER state; if not yet `active`/`running`, one retry after another short delay.
  4. `finishJob` success iff the restart command succeeded AND after-state is healthy; store `{before, after, command}` in job output + the `.finished` audit `evidence`/`resultJson`. A restart that runs but doesn't come back healthy is a legitimate `failed` with the captured after-state surfaced (never a silent success — remember the SPEC 13 res.ok lesson: judge on captured state, not just the command's exit).
- The allowlist-refusal path stays audited + returns 400 as today (no job created for a refused target, or a job immediately finished `failed` — pick one, be consistent, and don't leave it silent).
- Because cloudflared is a service, its restart now automatically carries before/after `is-active` evidence — that satisfies the "cloudflared restart with post-restart health probe" bullet. Add a short comment marking this.

## Deliverable 3 — Job-backed timer run (+ --no-block fix)

- Convert `infraRunTimerHandler`: `requireMutation` + allowlist (unchanged); `createJob({kind:"infra-run-timer", …})`, immediate `{ok, jobId}`, async worker that issues `systemctl start --no-block <timer>.service` via the seam (THE fix — add `--no-block`), then captures the unit's post-enqueue state (`systemctl is-active <timer>.service` or `show -p ActiveState,Result`) as evidence. `finishJob` success on successful enqueue (enqueue success ≠ oneshot completion — document that a `--no-block` start returning 0 means "queued", and the evidence records the observed state, honestly).

## Deliverable 4 — Minimal UI surfacing

- InfraPage: after a restart/timer action, surface the returned `jobId` (a small "job <id> — view" affordance / link toward /jobs, matching how other job-returning actions on the surface present). Do not restructure the page or break the existing confirm modals / disk bar. Never-silent: the operator sees the job was created.

## Verification you must run (report verbatim)

1. `bun run check` clean.
2. `DASHBOARD_DB=1 timeout 500 bun test` — baseline **1031 pass / 0 fail**; new tests add to it, nothing may fail; reconcile the count. (Note: an unrelated env flake — LiteLLM 401 / missing paperclip_db — occasionally fails one non-hermetic test; if you see exactly that, re-run once and report both runs. Your new tests must be fully hermetic and pass every run.)
3. `bash e2e/fresh-host/gate.sh` — stays **PASS 41/41**, CRASH=0, ERROR-5xx=0, LEAK=no, zero exceptions; confirm `/infra` still passes.
4. New hermetic tests (seam stubbed, NO real commands) covering: service restart creates job + captures before/after + issues correct command + healthy-after→success; unhealthy-after→failed with state surfaced; container path uses `docker`; allowlist refusal audited (no silent path); timer run uses `--no-block` (assert the flag present) + creates job; timer allowlist refusal. Assert the OLD synchronous behavior is gone (no direct blocking execSync in these handlers).

## Report format

1. Files changed (paths + rough +/-), grouped by deliverable.
2. Test/gate output tails + count reconciliation vs 1031.
3. Design decisions where the spec left room (seam shape/override mechanism; settle delay + retry count; refused-target = 400-no-job vs failed-job; how jobId surfaces in UI) — one line each.
4. Explicit confirmation you ran NO real service/timer/docker mutation, and how you proved behavior hermetically instead.
5. Anything not done/verified, stated plainly (incl. the execute.ts execSync sites left un-migrated as noted follow-up).
