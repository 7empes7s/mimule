# SPEC 13 — A2 Doctor actions: fix the dead per-entry requeue + add fix-all-of-class (ULTRAPLAN P3/A2)

**Builder**: Sonnet subagent. **Verifier/committer**: Fable (orchestrator). You NEVER commit, NEVER run systemctl/pkill/restart, NEVER touch the live services except read-only.

## Mission

Ship ULTRAPLAN Catalog A2 (Doctor, DoctorPage) in `/opt/opencode-control-surface/`:

1. **Per-entry requeue/repair** — a per-row Apply on the doctor decision log that actually works. (An endpoint exists but is DEAD — see Ground truth. Fix it, then wire the UI.)
2. **Fix-all-of-class** — `requeue:doctor:class:<errorType>` (medium, **capped batch of 10, job-backed**): re-dispatch every currently-stuck story of a chosen error class in one audited, capped operation.

## Ground truth (verified by orchestrator 2026-07-06 — trust and re-confirm before building)

- **The per-entry endpoint already exists but is BROKEN.** `server/api/actions.ts` `doctorRequeuHandler` (note the misspelled name, ~line 325) is routed at `POST /api/doctor/requeue` (`server/api/router.ts` ~1190) and is job-backed (`kind:"doctor-requeue"`) + audited already. **But** it POSTs `{command:"requeue", slug, ...}` to the autopipeline `/command`, and the autopipeline has **no `requeue` case** — its `handleCommand` switch (read-only at `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/scripts/newsbites-autopipeline.mjs` ~2502-2690) falls through to `default: return {ok:false, error:"Unknown command: requeue"}`. So the job always finishes **failed**. And **no UI wires it** — `DoctorPage.tsx` only calls `/api/doctor/scan`. This is a phantom action; your job is to make it real.
- **The correct, safe pipeline path is `doctor-dispatch`.** The pipeline exposes `POST /doctor/dispatch {slug}` (~line 2777) → `handleCommand({cmd:"doctor-dispatch", slug})` (~2592) → finds the item in `state.completed` where `slug === msg.slug && status === "stuck"`, else returns `{ok:false, error:'"<slug>" not found in stuck stories'}`; on a match runs `dispatchDoctorForItem(item, {source:"manual"})` — the pipeline's OWN sanctioned manual-doctor dispatch (the LLM doctor then decides requeue/cooldown/skip/kill). It only ever acts on a **currently-stuck** story and refuses otherwise. This is a pipeline HTTP call, NOT a file write into /opt/newsbites — consistent with the A5 rail "mutations go through the pipeline, never direct file writes."
- **Why not the `inject` API** (the ULTRAPLAN text says "inject API"): `inject` requires `{dossierDir, stage}`, and the doctor log carries only `slug`/`stage`, no `dossierDir`; inject is a force-requeue "after partial manual work" power path. `doctor-dispatch` is the honest match for a doctor-log page — you re-run the doctor and let the pipeline decide. Use `doctor-dispatch`. Record this decision in the code comment and your report.
- **Doctor log shape**: `DoctorDetail.entries[]` from `GET /api/doctor` (`server/api/doctor.ts`) exposes `{ts, slug, stage, action, reason, errorType, failedModel, nextStage, cooldownMs}`. Error class = `errorType`. Entries have no stable id; the natural per-row target is `slug`. Multiple rows can share a slug (retries) — dispatching by slug re-runs the doctor for that story regardless of which row was clicked; that is correct.
- **Job-backed pattern to mirror**: `doctorScanHandler` (`server/api/actions.ts` ~256) — `createJob` + immediate `{ok, jobId}` response + async `finishJob(jobId, "success"|"failed", …)` + `updateJobOutput`. `createJob`/`finishJob`/`updateJobOutput` in `server/db/writer.ts`. Jobs surface on /jobs, are cancellable/retryable.
- **DoctorPage** (`app/routes/DoctorPage.tsx`) already uses the repo's shared table controls (`useTableControls`, `TableControls`, sort/expand/filter) and has stage/error/model filter dropdowns + an "error classes (24h)" stats card. `useAction` hook is already imported.
- **Live state now**: pipeline up (`/health` ok), doctor log currently EMPTY / no stuck stories. So live-verify will exercise the honest "no candidates / not currently stuck" path, not a real requeue — build accordingly and make that path clean and never-silent.

## Hard rails (non-negotiable)

- **READ-ONLY toward /opt/mimoun and /opt/newsbites.** You may read the pipeline source to confirm the contract and you may do read-only GETs to `127.0.0.1:3200` (`/health`, `/doctor/log`, `/queue`) to understand shapes. **You must NOT POST `doctor-dispatch`/`doctor/scan`/`command` to the live pipeline** during build or test — that would requeue real stories. ALL behavioral proof is hermetic: stub/mock the pipeline `fetch` in tests and assert the outbound command + slug, the job rows, the audit rows, per-target isolation, and the cap.
- Live :3000 is GET-only for you. NEVER commit / git-mutate; NEVER systemctl/pkill/restart. Fable does all of that.
- Keep repo idioms: envelope `{generatedAt, sourceStatus, data}` where applicable, `writeActionAudit`, `createJob/finishJob`, risk tiers (both these actions are **medium**), the UX/table standard (pagination/sort/search/expand keep working with any new column). Never widen a gate.sh matcher.
- Never echo secrets; never set DEMO_SEED.

## Deliverable 1 — Make per-entry requeue real

**Server** (`server/api/actions.ts` `doctorRequeuHandler`):
- Replace the dead `{command:"requeue", ...}` pipeline call with the real dispatch: POST `{cmd:"doctor-dispatch", slug}` to `${PIPELINE_API}/command` (or POST `{slug}` to `${PIPELINE_API}/doctor/dispatch` — either reaches the same handler; pick one and comment why). Keep it job-backed and audited (kind `doctor-requeue`, medium). `nextStage` no longer applies (the pipeline's doctor picks the next stage) — drop it from the outbound payload; you may keep accepting `reason` for the job/audit record only. Update `command`/evidence text to reflect the real call. The job must finish `success` only when the pipeline returns `ok:true`; a "not currently stuck" response is a legitimate `failed` outcome with the pipeline's message surfaced verbatim (honest, not a crash).
- Add a short comment block explaining the fix (was targeting a nonexistent `requeue` command → now the sanctioned `doctor-dispatch`; why not `inject`).

**UI** (`DoctorPage.tsx`): a per-row "Requeue" / "Re-run doctor" Apply control (a new actions cell in the decision-log table, or in the expanded row detail — pick the one that respects the table standard and doesn't break sort/expand). Medium-risk → confirm dialog. Never-silent outcome: show the started job / the pipeline's refusal message ("not currently stuck") — do not swallow it. Tooltip/help text must set the honest expectation that requeue only re-runs the doctor if the story is still stuck.

## Deliverable 2 — Fix-all-of-class (capped, job-backed)

**Server**: new handler + route, e.g. `POST /api/doctor/requeue-class` taking `{errorType, reason?}` (medium; `requireMutation`).
- Derive candidate slugs from the **current** doctor log (`getFullLog`/`getDoctorStats` adapter, same source `/api/doctor` uses) — distinct slugs whose latest/relevant entry has `errorType === <class>`. **Dedup by slug, cap at 10** (`DOCTOR_REQUEUE_CLASS_MAX = 10`, exported). If more than 10 candidates exist, act on the first 10 (most recent) and report the count acted-on vs. total — never silently drop.
- Create ONE parent job (kind `doctor-requeue-class`, targetId the class) and dispatch each candidate slug via the **same** doctor-dispatch path (reuse a shared internal fn — do NOT duplicate the fetch logic between D1 and D2). Per-slug failure isolation: one refusal/timeout never aborts the batch. Write one audit row per slug (child, correlated to the parent job/batch), plus finish the parent job with a summary `{total, acted, dispatched, refused, failed, perSlug:[...]}`.
- Response is immediate `{ok, jobId, summary}` (or job-then-poll like doctorScan — match the scan pattern for consistency); the per-slug outcomes must be inspectable (in job output and/or the response).

**UI**: a "Fix all of class" affordance — e.g. a button per row in the "error classes (24h)" stats card, or on the decision-log filter bar when an error filter is active. Confirm dialog naming the class + candidate count. Never-silent summary after run ("dispatched 4, 2 not currently stuck").

## Verification you must run (report verbatim)

1. `bun run check` clean.
2. `DASHBOARD_DB=1 timeout 500 bun test` — baseline **1020 pass / 0 fail**; your new tests add to it, nothing may fail; reconcile the final count.
3. `bash e2e/fresh-host/gate.sh` — stays **PASS 41/41**, CRASH=0, ERROR-5xx=0, LEAK=no, zero exceptions added. (Confirm `/doctor` still passes.)
4. New tests (hermetic — stub the pipeline fetch, never hit :3200) must cover: per-entry requeue sends `doctor-dispatch`+slug (NOT the old `requeue`) and writes job+audit; pipeline `ok:false` "not stuck" → job `failed` with message surfaced (not a throw); fix-all-of-class derives+dedups+caps at 10, one audit row per slug + parent job summary, per-slug isolation (one failure doesn't abort), empty-candidate set returns an honest empty summary.

## Report format

1. Files changed (paths + rough +/-), grouped by deliverable.
2. Test/gate output tails + final count reconciliation vs 1020.
3. Design decisions where the spec left room (dispatch via `/command` vs `/doctor/dispatch`; where the per-row + class buttons live; job-immediate vs job-then-poll) — one line each.
4. Confirm you did NOT POST any mutating command to the live pipeline, and how you proved behavior instead.
5. Anything you could not do/verify, stated plainly.
