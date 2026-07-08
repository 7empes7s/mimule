# SPEC 9 — SLA fields + detector on incidents (ULTRAPLAN P2.3)

**Repo:** /opt/opencode-control-surface. Scope: `server/db/dashboard.ts` (migration), the two incident-creation sites (`server/insights/scanners/sentinelIncidents.ts:134`, `server/reasoner/clustering.ts:52`), a new `server/insights/scanners/sla.ts` (+ test), `server/api/incidents.ts` + `server/api/execute.ts`/action descriptors (assign action + real SLA tile metrics), `app/routes/IncidentsPage.tsx` (owner + real-deadline tiles), tests throughout.

## Goal
ULTRAPLAN 2.3 verbatim: "`sla_due_at`/owner on incidents; `incident-approaching-SLA-breach` scanner → ops/high insight; SLA tiles fed by real deadlines". Today the incidents page has MTTA/MTTR tiles and a HARDCODED 24h no-ack threshold (`server/api/incidents.ts:107`); no owner, no per-incident deadline. The page-vs-plan audit lists "owner/assign + SLA-breach detector insight" as the open incidents MUSTs.

## Design decisions (orchestrator-made — follow them)
1. **Schema**: `ALTER TABLE reasoner_incidents ADD COLUMN sla_due_at INTEGER` (nullable) and `ADD COLUMN owner TEXT` (nullable). Follow the existing guarded-migration idiom in `server/db/dashboard.ts` (pragma check before ALTER, no version table drama).
2. **SLA windows** (constants in one place, e.g. `server/reasoner/sla.ts` or near the incident model — with a comment pointing at ULTRAPLAN T2's future rules-engine, do NOT build a config UI now): severity parsed from the existing title prefix `[<severity>/<confidence>]` → critical: 4h, high: 24h, medium: 72h, everything else/unparsable: 7d.
3. **`sla_due_at` = resolve-by deadline** = `first_seen + window(severity)`. Set at BOTH creation sites. Acknowledging does NOT stop the clock (resolve-by semantics, stated in code comment); muted incidents are excluded from detection while the mute is active.
4. **Backfill on migration**: only OPEN incidents get a backfilled `sla_due_at` (from their existing first_seen + window). Resolved historical rows stay NULL — never invent deadlines for the past. Backfill runs once, inside the same guarded migration block.
5. **Owner/assign**: new action descriptor `assign:incident:<id>` (risk low, reason NOT required, takes `owner` — a free-text name/email, 1-120 chars validated) wired exactly like acknowledge/mitigate (`server/api/incidents.ts:404-412` client side, execute path server side), writes the column + a `writeActionAudit` row (`actionKind: "incidents.assign"`). Unassign = assign with empty owner → NULL (audited).
6. **Detector** `server/insights/scanners/sla.ts`, registered wherever the other scanners register (see `ops.ts` + the scan orchestration): for open, un-muted incidents with a non-NULL `sla_due_at`:
   - **breached** (`now > sla_due_at`) → ops insight, severity **high**, sourceKey `sla:breach:<incident_id>`, title "An incident has breached its SLA", plainSummary with the incident title, how overdue, owner (or "unassigned"), and ack state; actionDescriptorId `acknowledge:incident:<id>` when unacknowledged else null; manualPageHref `/incidents`.
   - **approaching** (due within 25% of its window, capped at 6h, and not yet breached) → ops insight, severity **high** (per ULTRAPLAN wording), sourceKey `sla:approaching:<incident_id>`, title "An incident is approaching its SLA deadline".
   - Stale-resolve via the same activeKeys/resolveStaleInsights pattern the other scanners use, prefix `sla:` — so resolving/muting the incident (or the deadline passing from approaching→breached) auto-resolves the stale insight with an honest resolution message.
7. **Real SLA tiles** (`server/api/incidents.ts` buildSlaMetrics + `app/routes/IncidentsPage.tsx` tiles): keep MTTA/MTTR and oldest-open. REPLACE the hardcoded "breaching 24h without ack" metric with: `slaBreachedOpenCount` and `slaDueSoonCount` (same definitions as the detector, computed from `sla_due_at`) + expose `slaBreachThresholdMs` removal cleanly (delete the constant if nothing else uses it). Tile captions must say what they count ("past their resolve-by deadline", "due within the warning window") — no vague "breaching".
8. **Owner in the UI**: owner column/badge in the incidents table ("unassigned" dim state, never blank), an Assign control in the expanded row's workflow section (input + button, same style as the ack/mitigate controls), wired to the assign action. Follow the table UX standard (the page already complies — don't regress it).

## Deliverables
1. Migration + both creation sites + backfill (decision 1-4).
2. Assign action end-to-end (decision 5) — audited, validated.
3. `server/insights/scanners/sla.ts` + `sla.test.ts` (decision 6) — hermetic tests covering: breached, approaching, muted excluded, resolved excluded, ack state reflected, stale-resolve on incident resolution, window parsing per severity incl. unparsable title.
4. API + UI tiles/owner (decision 7-8) + tests for the new metrics (extend the incidents API test file if one exists, else create).
5. Tests for: migration/backfill behavior (open gets due_at, resolved stays NULL), window constants, both creation sites setting `sla_due_at`.
6. Verification: `bun run check` clean; full `DASHBOARD_DB=1 bun test` 0 fail (baseline 956 — you're adding tests, state the new total and reconcile it); `bash e2e/fresh-host/gate.sh` exit 0 zero exceptions (server+app change → REQUIRED, paste the tail). Then a live read-only smoke: GET the incidents API on :3000 and confirm the new fields appear in the envelope (the live service runs OLD code until the orchestrator restarts — expect sla fields NULL/absent there; state that honestly rather than claiming live proof).

## Hard rails
NO git commit/push, NO systemctl, NO pkill. Never touch /opt/newsbites //opt/mimoun //opt/paperclip //opt/backups; nothing written outside the repo. Never widen a gate/allowlist. Never echo secrets (token: `TOKEN=$(grep -E '^OPERATOR_TOKEN=' /etc/control-surface/secrets.env | cut -d= -f2-)`). Envelope discipline: `{generatedAt, sourceStatus, data}` like every other endpoint. Live :3000 mutations limited to (at most) one assign-action smoke against a REAL incident only if one is open — otherwise skip and say so; prefer hermetic tests. Verify synchronously; no monitor will notify you.

## Report back
Changed-file list; migration proof (pragma before/after on a scratch DB + backfill counts); scanner test matrix results; the new tile metrics from a local hermetic run; assign-action audit row (or the honest skip); test total reconciliation vs 956; gate tail; anything reported-not-fixed.
