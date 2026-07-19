# SPEC 22 — ULTRAPLAN Phase 3 A5 (lines 85+87): governed digest/image regen + dossier stage retry

## Context (read first)
ULTRAPLAN A5: *"Digest/image regen — `regen:article:<slug>:digest|image` (medium) via
autopipeline inject at publish-prep stage. (Read-only toward /opt/newsbites — mutations go
through the pipeline, never direct file writes.)"* and *"Pipeline stage retry — per-dossier
`inject at stage` from the dossier detail page (medium)."* Work in
`/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — EXTEND, do not replace):
- Autopipeline HTTP API `http://127.0.0.1:3200/command` accepts
  `{cmd:"inject", dossierDir, stage, slug?}` — validates stage against its STAGES list
  (`scout, rank, init, research, validate-research, write, validate-write, verify,
  publish-prep, fetch-image, auto-gate, publish, deploy, notify`), checks `dossierDir`
  exists, enqueues at priority 0, returns `{ok, message}` or `{ok:false, error}`.
  **Digest regen = inject at `publish-prep`. Image regen = inject at `fetch-image`.**
- Dossiers live under `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/
  <YYYY-MM-DD>/<slug>/` (see `DOSSIERS_ROOT` in `server/api/dossier.ts`; dir name = slug).
- `server/api/dossier.ts` already has ungoverned `POST /api/dossier/:date/:slug/inject`
  (notes + optional requeue) — leave it working unchanged.
- `server/api/execute.ts`: `PIPELINE_API` const already defined (line ~16); enforcement map
  `getEnforcement()` ~line 61, risk map `getRisk()` ~line 87 (see `pin`/`rotate` entries as
  templates); dispatch blocks below (A4d rotate / A4e pin show the shape).
- `server/api/actionDescriptors.ts`: `addArticleActions()` (~line 334) emits per-article
  descriptors from `NewsBitesDetail["articles"]` (bounded slice 150) — follow its idiom.
- `server/api/types.ts`: action-kind union (where `"pin"`/`"rotate"` were added).
- `app/routes/NewsBitesPage.tsx` renders articles; `app/routes/DossierInspectorPage.tsx`
  has the inject tab (`DossierInjectPanel`, `handleInject` via authFetch).
- Test idiom for network isolation: `server/api/gateway.test.ts` stubs
  `globalThis.fetch = () => Promise.reject(...)` (restored in finally) — REUSE this idiom;
  execute tests must NEVER hit the real :3200.

## Build this

### 1. `regen` governed action (types.ts + execute.ts + actionDescriptors.ts)
- types.ts: add `"regen"` to the action-kind union.
- execute.ts enforcement: `kind === "regen"` → confirm **true**, reasonRequired **true**.
  Risk: `"regen"` → **"medium"**.
- execute.ts dispatch for `regen:article:<slug>:digest` and `regen:article:<slug>:image`
  (parse: targetType `"article"`, targetId slug, suffix `"digest"|"image"`):
  - Validate suffix ∈ {digest, image} else BAD_REQUEST.
  - Resolve the dossier dir: scan `DOSSIERS_ROOT/<date>/` date dirs (lexically newest
    first) for a directory named exactly `<slug>`; export the resolver from dossier.ts or a
    small shared helper — do NOT duplicate the root constant. No dossier → honest
    `NOT_FOUND` ("no dossier found for article <slug> — regen needs the editorial dossier").
  - POST `${PIPELINE_API}/command` `{cmd:"inject", dossierDir, stage: suffix === "digest" ?
    "publish-prep" : "fetch-image", slug}` with a ~3s AbortSignal timeout. Non-ok /
    `{ok:false}` / network error → `EXEC_ERROR` with the pipeline's error message (honest —
    e.g. autopipeline down).
  - Success → `{ok: true, action: "regen", message: <pipeline message>}`.
- actionDescriptors.ts `addArticleActions()`: for each article, additionally emit
  `regen:article:<slug>:digest` ("Regenerate digest", impactPreview: re-queues the dossier
  at publish-prep; digest/publish.md is rebuilt by the pipeline) and
  `regen:article:<slug>:image` ("Regenerate image", impactPreview mentions fetch-image
  stage) — kind `"regen"`, targetType `"article"`, risk `"medium"`, confirm true,
  reasonRequired true, rollbackHint noting the pipeline writes a fresh artifact and the
  previous one stays in the dossier history, sourceRoute `/newsbites`, requiresOnline true.
  Keep the existing two descriptors unchanged.

### 2. Dossier stage retry governed dispatch (execute.ts only — no catalog descriptors)
- Dispatch for actionId `start-job:dossier:<date>/<slug>:inject:<stage>`
  (targetType `"dossier"`, targetId `"<date>/<slug>"`, suffix `"inject"`,
  stage = segments[4]). `start-job` enforcement/risk already give confirm+reason+medium —
  do not change the maps.
  - Validate: date matches `^\d{4}-\d{2}-\d{2}$`, slug matches `^[a-z0-9-]+$`, stage ∈ the
    exact STAGES allowlist above (hardcode the list as a const with a comment pointing at
    the autopipeline script) else BAD_REQUEST; dossier dir must exist else NOT_FOUND.
  - POST the same inject command; same error honesty; success message includes the stage.
- Do NOT emit catalog descriptors per dossier (unbounded target space); this is a
  page-scoped governed dispatch like the /models cooldown flow — note this in a comment.

### 3. UI
- `NewsBitesPage.tsx`: per-article row actions gain "Regen digest" and "Regen image"
  (reason prompt + window.confirm, POST `/api/actions/execute` with `confirmed: true`,
  surface the returned message, follow the page's existing action/feedback idioms; if the
  page has no per-row action idiom yet, add a compact actions cell matching the table
  styles used on CostPage).
- `DossierInspectorPage.tsx` inject tab: add a "Retry stage (governed)" control — stage
  `<select>` from the STAGES allowlist, reason prompt + confirm, POST
  `/api/actions/execute` with `start-job:dossier:<date>/<slug>:inject:<stage>`; keep the
  existing notes-inject panel unchanged next to it.

### 4. Tests (hermetic — stub `globalThis.fetch`, temp dirs)
- execute.test.ts: regen enforcement (unconfirmed → confirm path, no reason → reason path),
  unknown suffix → BAD_REQUEST, no dossier → NOT_FOUND (point the resolver at a temp
  DOSSIERS root via a small env/parameter seam — add one if needed, defaulting to the real
  path), happy path digest → asserts the stubbed fetch was called with
  `{cmd:"inject", stage:"publish-prep"}` and the right dossierDir + audit row; image →
  `fetch-image`. Dossier retry: bad date/slug/stage → BAD_REQUEST, missing dossier →
  NOT_FOUND, happy path → stubbed fetch asserted with the requested stage + audit row.
- actionDescriptors.test.ts: regen digest+image descriptors emitted per article with
  medium/confirm/reason; existing article descriptors still present.

## Hard rails
- READ-ONLY toward `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups` —
  the ONLY mutation path is the HTTP POST to 127.0.0.1:3200 (and in tests that is stubbed).
  Never write into DOSSIERS_ROOT (tests use a temp root via the seam).
- NEVER touch `/etc/litellm/*`. No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts` (regen/retry never auto-appliable).
  Never widen `e2e/fresh-host/gate.sh` matchers.
- Do NOT change the existing dossier notes-inject route behavior, the enforcement/risk of
  existing kinds, or any builder/runner/terminal/gateway file.
- Tests must never contact 127.0.0.1:3200 or any network.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/execute.test.ts server/api/actionDescriptors.test.ts server/api/dossier.test.ts --timeout 30000` — all pass (skip dossier.test.ts if it does not exist).
3. `git status --short` — ONLY: types.ts, execute.ts (+test), actionDescriptors.ts (+test),
   dossier.ts (resolver export, if placed there), NewsBitesPage.tsx,
   DossierInspectorPage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed (one line each), the regen dispatch snippet, the dossier-retry dispatch
snippet, the descriptor snippet, test summary lines, and explicit confirmation that
autoapplyPolicy.ts is untouched, tests stub fetch (zero real :3200 calls), and nothing
writes under /opt/newsbites or DOSSIERS_ROOT.
