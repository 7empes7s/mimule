# SPEC 33 — ULTRAPLAN Catalog U, U1: First-party usage analytics

## Context (read first)
ULTRAPLAN U1: *"First-party usage analytics — page visits + action clicks into SQLite
(`usage_events`, no external calls — CSP-clean, privacy story intact). Retention: 90 days,
aggregated forever."* Work in `/opt/opencode-control-surface`. Do NOT commit/push/restart;
leave changes uncommitted.

Existing surface at HEAD `d5697fb` (verified):
- There is a CONSENT-GATED OUTBOUND `server/telemetry/` module (aggregate stats it would
  send externally). U1 is DIFFERENT and fully LOCAL — do NOT touch server/telemetry/*, and
  do NOT send anything off-box. `usage_events` is a NEW table.
- Action clicks are ALREADY fully captured: every governed action writes an `action_audit`
  row (actor, action_kind, ts, source_route, result_status). U1 must NOT add code to the
  execute hot path — action usage is SOURCED FROM action_audit (the U2 report joins both).
  U1's new instrumentation is ONLY page views.
- Retention: `server/governance/retention.ts` has `startRetentionScheduler` — reuse its
  cadence/idiom for the 90-day sweep; do NOT add a second timer.
- Frontend: Vite/React/wouter; `app/App.tsx` wraps routes; a strict CSP blocks external
  hosts (the beacon MUST be same-origin — that is the privacy story, keep it true).
- All new API routes must be checkToken-gated (post-SPEC-29 default).

## Build this

### 1. Schema (server/db/dashboard.ts — new tables only)
- `usage_events`: id TEXT PK, tenant_id TEXT NOT NULL, ts INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('pageview')), path TEXT NOT NULL,
  actor_source TEXT. Index on (tenant_id, ts). (Only 'pageview' for now — actions live in
  action_audit; the CHECK leaves room to grow.)
- `usage_daily`: day TEXT NOT NULL (YYYY-MM-DD UTC), tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL, path TEXT NOT NULL, count INTEGER NOT NULL,
  PRIMARY KEY(day, tenant_id, event_type, path). This is the aggregated-forever rollup so
  the 90-day raw sweep never loses long-term trend.

### 2. Ingest + rollup + retention (`server/usage/analytics.ts`, new)
- `recordUsageEvents(events: {path: string}[], req)`: tenant-scoped; validates events is a
  non-empty array ≤ 50; each path a string ≤ 512 chars, normalized (strip query/hash, must
  start with '/'); actor_source from the authenticated user; inserts 'pageview' rows in one
  transaction. Best-effort: never throws to the caller on a bad single row — skip it.
- `rollupUsageDaily(now)`: upsert yesterday's (and today's, idempotent) usage_events into
  usage_daily grouped by (day, tenant, event_type, path) via `INSERT ... ON CONFLICT ...
  DO UPDATE SET count = <recomputed>`. Deterministic/idempotent (re-running yields the same
  counts). Also roll up action_audit action_kind counts into usage_daily as event_type
  'action' (path = source_route or action_kind) so the aggregate has both — WITHOUT touching
  the execute path (this is a read-only rollup of existing audit rows).
- `sweepUsageRetention(now)`: delete usage_events older than 90 days (usage_daily is never
  swept). Call rollup THEN sweep from the retention scheduler tick (reuse it; guard so
  rollup runs before the sweep so no raw row is deleted before it is aggregated).
- `getUsageSummary(periodStart, periodEnd)`: from usage_daily (+ action_audit for the recent
  window not yet rolled up if you like — keep it simple, prefer usage_daily) → per-path
  {path, pageviews, actions} and totals. Used by the API below and (later) U2.

### 3. API (register in server/api/router.ts, checkToken-gated)
- `POST /api/usage/beacon` — body `{events: [{path}]}` → recordUsageEvents → `{recorded}`.
  checkToken-gated (the dashboard is authenticated; anonymous beacons are dropped 401).
  Cheap, no audit row (usage telemetry is not a governed action — do NOT writeActionAudit
  per beacon; that would flood the audit log).
- `GET /api/usage/summary?from&to` — checkToken; returns getUsageSummary (default 30d).

### 4. Frontend beacon (app/App.tsx or a small `app/hooks/useUsageBeacon.ts`, additive only)
- A hook that subscribes to wouter location changes and, on each change, sends a same-origin
  beacon to `/api/usage/beacon` with the new path via `fetch(url, {method:'POST',
  keepalive:true, headers, body})` (include the operator credential the app already uses for
  authFetch — reuse the existing authenticated-fetch helper so it carries the session).
  Debounce/coalesce rapid changes. MUST NOT alter any page's render, MUST NOT block
  navigation, MUST swallow all errors (usage tracking never breaks the app). Mount it once in
  the App shell. No external host, no third-party script — CSP stays clean.

### 5. Tests (`server/usage/analytics.test.ts`, hermetic temp DB)
- recordUsageEvents: happy path inserts rows; >50 → rejected/truncated per your contract
  (state which); bad path (no leading slash / >512) skipped; query/hash stripped.
- rollupUsageDaily: idempotent (run twice → same counts); aggregates pageviews and folds
  action_audit into 'action' rows.
- sweepUsageRetention: deletes >90d usage_events, leaves usage_daily intact, and only after
  rollup.
- getUsageSummary: per-path pageviews+actions + totals over a seeded set.
- API: POST /api/usage/beacon records; GET /api/usage/summary returns the shape;
  unauthenticated → 401 (checkToken).

## Hard rails
- NEVER touch `/etc/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts. NO external calls / no new deps.
- Do NOT edit autoapplyPolicy.ts, server/telemetry/*, the execute hot path, or any report
  file; never widen gate.sh.
- Beacon must be same-origin only (CSP), never block navigation, never throw into the app.
- Tests never write the live DB; no real network.
- Do NOT touch builder/runner/terminal/gateway/runbooks/compliance files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean.
2. `DASHBOARD_DB=1 bun test server/usage/analytics.test.ts server/api/router.test.ts --timeout 60000` — all pass.
3. `git status --short` — ONLY: dashboard.ts, analytics.ts+test (new), router.ts, App.tsx (+useUsageBeacon.ts if separate). NOT REPORT.*.
4. `git diff --check` — clean.

## Report back
Files changed; the two table DDLs; the rollup idempotency approach; how action usage is
folded in without touching the execute path; the beacon's same-origin/non-blocking/error-
swallowing guarantees; test summaries; explicit confirmation that server/telemetry, the
execute path, and reports are untouched and nothing leaves the box.
