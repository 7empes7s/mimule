# SPEC 24 — ULTRAPLAN Phase 3 A6 (lines 90–92): bulk register/ignore + inline criticality/owner + re-scan one source

## Context (read first)
ULTRAPLAN A6: *"Bulk register/ignore — multi-select in discovery inbox (low); rate-limiter-aware
batching."* / *"Edit asset criticality/owner inline (low)."* / *"Re-scan one source —
`scan:discovery:<source>` (auto) instead of waiting 15 min."* Work in
`/opt/opencode-control-surface`. Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — EXTEND, do not replace):
- `server/api/discovery.ts`: `discoveryListAssetsHandler` (GET /api/discovery/assets?status=),
  `discoveryRegisterAssetHandler` (POST .../:id/register — body name/owner/criticality/
  attachedService; `setRegistered`; `resolveDiscoveryInsightsForAsset`; audited
  `discovery.asset.register` medium), `discoveryIgnoreAssetHandler` (POST .../:id/ignore —
  reason; `setIgnored`; audited low), `discoveryRescanHandler` (POST /api/discovery/rescan —
  `discoverAiAssets()` + `reconcileDiscoveredAssets`, audited targetId "all"). All
  mutation-gated in server/api/router.ts (~line 1651).
- `server/discovery/reconcile.ts`: `discoverAiAssets()` composes 7 probe functions —
  `discoverProcesses` (sourceProbe "proc-cmdline"), `discoverListeningPorts` ("ss-listen"),
  `discoverSystemdUnits` ("systemctl-list-units"), `discoverContainers` ("docker-ps"),
  `discoverBackendsFromEnv` ("env-backend-url"), `discoverCliTools` ("path-scan"),
  `discoverCredentials` ("env-key-presence"). `reconcileDiscoveredAssets(inputs, now)` is
  UPSERT-only + a 30-day retention sweep of stale unregistered rows — a partial
  (single-source) input set is safe and cannot age out other sources' assets.
  These probe names are GENERIC (no MIMULE inventory) — safe for fresh-host catalogs.
- `app/routes/InsightsPage.tsx`: renders the discovery inbox (calls /api/discovery/assets,
  register/ignore/rescan) — the multi-select target.
- `server/api/types.ts`: action-kind union has `"probe"` but NOT `"scan"` (add it like
  `"regen"` was added). `server/api/execute.ts`: enforcement ~line 70 / risk ~line 100 maps;
  `server/api/actionDescriptors.ts`: singleton + per-entity idioms.

## Build this

### 1. Bulk register / bulk ignore (server/api/discovery.ts + router.ts + InsightsPage)
- Refactor the per-asset core of register/ignore into internal helpers so the existing
  single-asset handlers and the new bulk handlers share one code path (existing responses
  and audit rows byte-identical).
- `POST /api/discovery/assets/bulk-register` — body `{assetIds: string[], owner?,
  criticality?, attachedService?}` (no per-asset name in bulk; validation identical to the
  single handler). `POST /api/discovery/assets/bulk-ignore` — body `{assetIds: string[],
  reason?}`. Both mutation-gated, registered in router.ts next to the single routes.
  Validate: assetIds is a non-empty string array, length ≤ 100 (400 otherwise — this IS the
  rate-limiter-aware batching: one request, bounded work). Iterate the shared helper per
  asset: found → process + per-asset audit (same actionKind as today, `request` gains
  `bulk: true`); missing → collect. Respond `{processed, notFoundIds, insightsResolved}`.
- InsightsPage discovery inbox: row checkboxes + select-all-visible, a toolbar appearing
  when ≥1 selected with "Register selected" (prompts owner? criticality picker? keep it
  minimal: criticality select + optional owner prompt, confirm) and "Ignore selected"
  (optional reason prompt, confirm), calling the bulk endpoints, then refresh. Follow the
  page's existing button/confirm idioms.

### 2. Inline criticality/owner edit (server/api/discovery.ts + router.ts + InsightsPage)
- `PATCH /api/discovery/assets/:id` — mutation-gated; body `{owner?, criticality?}` (at
  least one required; same validation sets as register). Only `status = 'registered'`
  assets are editable (409 with an honest message otherwise; 404 unknown). Update columns +
  `updated_at`; audit `discovery.asset.update` risk low with before/after in `request`.
- InsightsPage: on registered assets, owner and criticality become inline-editable
  (click-to-edit → prompt/select → PATCH → refresh), matching existing inline idioms.

### 3. Re-scan one source (reconcile.ts + discovery.ts + types/execute/actionDescriptors)
- reconcile.ts: export `DISCOVERY_SOURCES` — a const map of the 7 sourceProbe names → their
  probe functions (derived from the existing `discoverAiAssets` composition; keep
  `discoverAiAssets()` behavior identical by building it on the same map).
- `discoveryRescanHandler`: accept optional JSON body `{source?: string}`. When present it
  must be a `DISCOVERY_SOURCES` key (400 otherwise); run ONLY that probe (same try/catch
  logging) + `reconcileDiscoveredAssets` on its results; audit targetId = the source name.
  No body/`source` → exactly today's full scan (targetId "all").
- types.ts: add `"scan"` to the kind union. execute.ts: enforcement `kind === "scan"` →
  no confirm, no reason (like probe); risk low. Dispatch `scan:discovery:<source>`:
  source must be a `DISCOVERY_SOURCES` key else NOT_FOUND; run the single-source scan
  in-process (share the handler's core — extract a `runDiscoveryScan(source?)` helper in
  discovery.ts used by both); return `{ok, action: "scan", message: "Discovery re-scan
  (<source>) — N asset(s) seen"}`.
- actionDescriptors.ts: new `addDiscoveryScanActions()` emitting `scan:discovery:<source>`
  for each `DISCOVERY_SOURCES` key — kind "scan", targetType "discovery", risk "low",
  confirm false, reasonRequired false, label "Re-scan discovery source: <source>",
  impactPreview noting it refreshes only that probe immediately instead of waiting for the
  15-min scheduler, sourceRoute "/insights", requiresOnline true. Generic names only —
  fresh-host safe (the gate will verify).

### 4. Tests (hermetic — temp DASHBOARD_DB_PATH; never scan the real host in tests)
- discovery API tests (extend the existing discovery/insights test file if one covers these
  handlers, else create `server/api/discovery.test.ts` following the temp-DB idiom):
  bulk-register happy path (2 assets seeded via `reconcileDiscoveredAssets` with synthetic
  inputs → both registered, insights resolved, per-asset audits with bulk:true, response
  shape), bulk with unknown ids → notFoundIds, >100 ids → 400, empty → 400; PATCH: 404
  unknown, 409 unregistered, happy path owner+criticality with audit; rescan with
  `{source:"bogus"}` → 400. For single-source scan logic, call `runDiscoveryScan` with a
  stubbed probe via the DISCOVERY_SOURCES seam if directly invocable, otherwise cover
  through the handler with `{source}` on a temp DB (the probes read the real host — that is
  acceptable ONLY through reconcile into the temp DB, never the live DB).
- execute.test.ts: `scan:discovery:proc-cmdline` no-confirm happy path (temp DB) + unknown
  source NOT_FOUND. actionDescriptors.test.ts: 7 scan descriptors, low/no-confirm.

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts.
- Do NOT edit `server/insights/autoapplyPolicy.ts`; never widen `e2e/fresh-host/gate.sh`.
- Existing single register/ignore/rescan behavior, audits, and response shapes unchanged.
- Tests never write to the live `/var/lib/control-surface/dashboard.sqlite`.
- Do NOT touch builder/runner/terminal/gateway/budget files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/discovery.test.ts server/api/execute.test.ts server/api/actionDescriptors.test.ts server/insights/scanners/discovery.test.ts --timeout 30000` — all pass (adjust to the actual discovery test file location).
3. `git status --short` — ONLY: discovery.ts, reconcile.ts, router.ts, types.ts, execute.ts
   (+test), actionDescriptors.ts (+test), InsightsPage.tsx, plus the discovery test file. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed, the bulk-handler snippet, the PATCH snippet, the DISCOVERY_SOURCES +
single-source scan snippet, the descriptor snippet, test summaries, and explicit
confirmation that single-asset behavior is unchanged and autoapplyPolicy.ts is untouched.
