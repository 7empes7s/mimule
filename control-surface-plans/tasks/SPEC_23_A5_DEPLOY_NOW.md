# SPEC 23 — ULTRAPLAN Phase 3 A5 (line 86): Deploy now — govern the existing NewsBites deploy

## Context (read first)
ULTRAPLAN A5: *"Deploy now / queue drain — `run:newsbites:deploy` (medium, job-backed) —
surfaces the deploy the team already owns."* Work in `/opt/opencode-control-surface`.
Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — the deploy is FULLY built; this spec only makes it
governable/discoverable; EXTEND, do not replace):
- `server/api/actions.ts` `newsBitesDeployHandler` (POST `/api/newsbites/deploy`,
  mutation-gated): creates a durable job (`createJob` kind "newsbites-deploy") with
  in-memory fallback, audits start (`newsbites.deploy`) and finish, spawns
  `bash -c "cd /opt/newsbites && ./deploy.sh 2>&1"` with streamed output into the job, and
  runs the post-deploy content-health scan. Job polling: `GET /api/newsbites/deploy/:jobId`.
  NewsBitesPage already has the deploy modal + poller.
- `server/api/execute.ts`: `run` kind exists — enforcement currently no-confirm (comment
  says "currently only run:backup:now"), risk low; dispatch `run:backup:now` ~line 505.
- `server/api/actionDescriptors.ts`: `addDiskReclaimAndBackupActions()` shows the fixed
  singleton-descriptor idiom.

## Build this

### 1. Shared starter + test seam (server/api/actions.ts)
- Extract the deploy-start logic from `newsBitesDeployHandler` into an exported
  `startNewsBitesDeployJob(): { jobId: string }` — byte-identical behavior (durable job,
  audits, spawn, streaming, close handling, content-health scan). The handler becomes a
  thin wrapper (requireMutation + call + same response shape as today).
- The spawned command comes from a call-time resolver:
  `process.env.DASHBOARD_NEWSBITES_DEPLOY_CMD?.trim() || "cd /opt/newsbites && ./deploy.sh 2>&1"`
  — production default byte-identical; tests point it at a harmless `echo`. Comment why.

### 2. Governed dispatch (server/api/execute.ts)
- Enforcement: `kind === "run" && targetType === "newsbites"` → confirm **true**,
  reasonRequired **true** (deploy restarts the live site; run:backup stays no-confirm).
- Risk: `kind === "run" && targetType === "newsbites"` → **"medium"** (per ULTRAPLAN; the
  handler's internal high-risk audit rows are unchanged).
- Dispatch `run:newsbites:deploy` (targetType "newsbites", targetId "deploy"): call
  `startNewsBitesDeployJob()`, return `{ok: true, action: "run", jobId, message:
  "NewsBites deploy started — poll /api/newsbites/deploy/<jobId>"}`. Unknown targetId →
  NOT_FOUND.

### 3. Catalog descriptor (server/api/actionDescriptors.ts)
- Fixed singleton `run:newsbites:deploy` next to the disk/backup singletons: kind "run",
  targetType "newsbites", targetId "deploy", risk "medium", confirm true, reasonRequired
  true, label "Deploy NewsBites now", impactPreview "Runs /opt/newsbites/deploy.sh —
  npm install + build + service restart (~15s); job-backed with streamed output",
  rollbackHint matching the handler's ("previous deployed build / NewsBites journal"),
  evidenceRefs pointing at the deploy script file + /api/newsbites, sourceRoute
  "/newsbites", requiresOnline true.

### 4. Tests (hermetic)
- execute.test.ts: enforcement (unconfirmed → confirm path; no reason → reason path),
  unknown target → NOT_FOUND, happy path with `DASHBOARD_NEWSBITES_DEPLOY_CMD` set to a
  harmless `echo hermetic-deploy` (save/restore env): expect ok + jobId + audit row; the
  job must run the echo, not the real script.
- actionDescriptors.test.ts: the deploy descriptor is present with medium/confirm/reason.
- Never execute the real /opt/newsbites/deploy.sh from any test.

## Hard rails
- Do NOT actually deploy NewsBites at any point (build or self-verify) — the real
  deploy.sh must never run; the seam + echo covers the happy path.
- READ-ONLY toward `/opt/newsbites` (referencing the path in strings is fine).
- NEVER touch `/etc/litellm/*`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts`; never widen `e2e/fresh-host/gate.sh`.
- Existing POST /api/newsbites/deploy behavior and response shape unchanged.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/execute.test.ts server/api/actionDescriptors.test.ts server/api/actions.test.ts --timeout 30000` — all pass (skip actions.test.ts if absent).
3. `git status --short` — ONLY: actions.ts, execute.ts (+test), actionDescriptors.ts (+test). NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed, the starter/seam snippet, the dispatch snippet, the descriptor snippet, test
summaries, and explicit confirmation that the real deploy.sh was never executed and
autoapplyPolicy.ts is untouched.
