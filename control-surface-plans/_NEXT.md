# SLICE 1 — Condition-based incident AUTO-CLOSE (self-learning remediation loop, wedge 1)

Backend-only. Server + one test file. NO app/frontend changes. NO schema/migration changes (reuse existing
`reasoner_incidents` columns). Small, validated, self-contained.

## Why / the gap (already diagnosed by Opus — build to this, don't re-investigate)
`server/insights/scanners/sentinelIncidents.ts` → `runSentinelIncidentScan()` reads the Product Health Sentinel
card at `/var/lib/mimule/product-health.json` (env `SENTINEL_HEALTH_PATH`). For each finding with `status:"fail"`
it creates/bumps an **open** row in `reasoner_incidents` (`failure_class='sentinel_health'`,
`representative_pass_id = "sentinel:" + safeId(findingId)`, `status='open'`), keyed by
`cluster_key = sha256("sentinel|"+findingId+"|"+utcDayStart)`.

**Nothing closes a sentinel incident when its finding stops failing.** The only existing closer is
`autoResolveStaleIncidents()` in `server/reasoner/lifecycle.ts`, which is *time-based* — it waits 7 idle days and
even labels the reason "condition **appears** cleared" (a guess). We want the precise, immediate signal: when the
latest health scan shows the finding is no longer failing, close its incident **now**, with an audit trail.

**Critical bug to fix:** `runSentinelIncidentScan()` early-returns at `if (fails.length === 0) return …` (~line 84).
That is exactly the moment the most incidents should auto-close. That early return must move so the auto-close pass
still runs when there are zero current fails (as long as the card itself was readable).

## What to build
Add a condition-based auto-close pass to `runSentinelIncidentScan()` that reuses the SAME card read (one consistent
snapshot). Do NOT touch `autoResolveStaleIncidents()` — it stays as the safety net for non-sentinel incidents and
for when the card is unavailable. This new pass is additive.

### Behavior
1. Keep the existing `if (!card) return …` guard (card unreadable/missing → do nothing; never auto-close on a
   missing card — we must not fabricate an all-clear).
2. **REMOVE** the `if (fails.length === 0) return …` early return. Let the fails loop run (it no-ops on empty),
   then run the auto-close pass unconditionally (card present).
3. **Freshness guard:** compute `seenAtMs` as the code already does (`card.checkedAt*1000` else `scannedAt`). If
   `seenAtMs` is older than a max-age threshold, SKIP auto-close (don't trust a stale all-clear). Threshold =
   env `SENTINEL_AUTOCLOSE_MAX_AGE_MS` (default `6 * 60 * 60 * 1000` = 6h). Missing `checkedAt` ⇒ `seenAtMs=scannedAt`
   ⇒ treated as fresh (consistent with the create path). Still create/bump incidents as today regardless.
4. Build `failingFindingIds: Set<string>` = `safeId(String(f.id))` for every finding with `status === "fail"` and
   non-empty id. (Reuse the same `safeId` and the same fail filter the create loop uses.)
5. Query open sentinel incidents in the current tenant scope (use the SAME `whereTenant()` clause/params the file
   already uses):
   ```sql
   SELECT id, representative_pass_id, title FROM reasoner_incidents
   WHERE status = 'open' AND failure_class = 'sentinel_health' {tenant.clause}
   ```
6. For each row: if `representative_pass_id` does NOT start with `"sentinel:"`, skip it (can't map → leave to the
   stale sweep). Else derive `findingSafeId = representative_pass_id.slice("sentinel:".length)`. If `findingSafeId`
   is **NOT** in `failingFindingIds` → the condition cleared → auto-close:
   ```sql
   UPDATE reasoner_incidents
   SET status='resolved', resolved_at=COALESCE(resolved_at, ?), mitigated_at=COALESCE(mitigated_at, ?)
   WHERE id = ? AND status = 'open' {tenant.clause}
   ```
   using `seenAtMs` for both timestamps (the moment the health card observed it clear).
7. For each auto-closed incident write an audit record (import `writeActionAudit` from `../../db/writer.ts`), using
   an actionKind **distinct** from the stale sweep's:
   ```ts
   writeActionAudit({
     actor: "system", actorSource: "sentinel-scan",
     actionKind: "incidents.auto-close",
     targetType: "incident", targetId: row.id,
     reason: `auto-closed: finding '${findingSafeId}' no longer failing in product-health scan`,
     result: "auto-closed", resultStatus: "success",
     resultJson: { findingId: findingSafeId, clearedAt: seenAtMs },
   });
   ```
   (Match the exact `ActionAuditInput` shape in `server/db/writer.ts`; drop/adjust any field that isn't in the type.)
8. **Best-effort** webhook (never throw out of the scan): `dispatchEventFireAndForget("incident.resolved",
   { incidentId: row.id, findingId: findingSafeId, reason: "condition-cleared", resolvedAt: seenAtMs })`, wrapped in
   try/catch like the existing `incident.created` dispatch. The dispatcher takes a free `event: string`, so this is safe.
9. Extend `ScanResult` with `autoClosed: number` and set it to the count auto-closed. Add `autoClosed: 0` to EVERY
   existing early-return of this function so the type is satisfied everywhere.

### Scheduler wiring (minimal, low-risk)
`server/insights/scheduler.ts` currently does `sentinelIncidents = runSentinelIncidentScan().createdOrUpdated;`.
Capture the full result instead, and after it log the auto-close count when > 0:
```ts
const sentinelResult = runSentinelIncidentScan();
sentinelIncidents = sentinelResult.createdOrUpdated;
if (sentinelResult.autoClosed > 0) console.log(`[incidents] auto-closed ${sentinelResult.autoClosed} cleared sentinel incidents`);
```
Do NOT change the return-type/shape of `runInsightsScanOnce` (tests/callers depend on it). Logging only.

## Tests (extend `server/insights/scanners/sentinelIncidents.test.ts` — this is the verification backbone)
Add cases (use the existing `writeHealth`, `readIncidentRows`, tenant helpers; add a fresh `checkedAt` unless testing staleness):
- **A. clears when finding passes on rescan:** scan with `X` failing → 1 open incident. Re-`writeHealth` with `X`
  now `status:"ok"` (fresh checkedAt) → rescan → that incident is `resolved`; `result.autoClosed === 1`.
- **B. clears when finding disappears + zero fails (proves the removed early-return):** create an open sentinel
  incident (first scan with `X` failing), then `writeHealth({ fails:0, findings:[] , checkedAt: now })` → rescan →
  incident `resolved`, `autoClosed === 1`. (Before this slice the function would have early-returned and left it open.)
- **C. does NOT close a still-failing finding:** `X` failing on both scans → stays `open`, occurrence bumped, `autoClosed === 0`.
- **D. missing card does NOT auto-close:** create an open incident, then point `SENTINEL_HEALTH_PATH` at a
  non-existent file → rescan → incident stays `open`, `autoClosed === 0`.
- **E. stale card does NOT auto-close:** create an open incident, then `writeHealth` with the finding cleared but
  `checkedAt` set ~7h in the past (older than the 6h default) → incident stays `open`, `autoClosed === 0`.
- **F. never touches non-sentinel incidents:** insert a row with `failure_class` other than `sentinel_health`
  (status open) → after a scan with zero fails it remains `open` (guard by `failure_class='sentinel_health'`).

## Validate (evidence to stdout — required)
- `bun run typecheck` clean.
- `bun run build` ok.
- `bun test server/insights/scanners/sentinelIncidents.test.ts` — all pass (paste output).
- Do NOT run the full `bun test` suite (OOMs the box). If a PRE-EXISTING unrelated test in that file already fails,
  say so explicitly; do not silently "fix" anything outside this slice.

## Rules
Do NOT `git commit`/push/restart/`systemctl` (Opus does that after verifying). Do NOT touch `/opt/newsbites`. Do NOT
modify `package.json`/`tsconfig.json`/`bun.lock` or any DB migration. Server + the one test file ONLY. No new deps.
Document per `_BUILD_RULES.md` (BUILD_LOG.md + DASHBOARD_V5_PLAN.md + vault + MIMULE plan). Finish clean, tree green.
