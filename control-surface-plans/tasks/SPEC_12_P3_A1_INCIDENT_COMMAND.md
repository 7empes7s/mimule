# SPEC 12 — Complete A1 Incident Command: bulk ops + audited snooze lifecycle + bounded MTTR (ULTRAPLAN P3/A1)

**Builder**: Sonnet subagent. **Verifier/committer**: Fable (orchestrator). You NEVER commit, NEVER run systemctl/pkill/restart, NEVER touch the live service beyond read-only GETs.

## Mission

Finish ULTRAPLAN Catalog A1 (Incident command, IncidentsPage) in `/opt/opencode-control-surface/`. Two of A1's four items already shipped (assign/owner in 72898a4, escalate in a1549bd). This spec ships the remaining two plus one rider:

1. **Bulk ops** — multi-select acknowledge / resolve / snooze(mute) on the incidents table, **one audit row per target**.
2. **Snooze gap-closure** — snoozed (mute-active) incidents leave the default view (never-silent: visible count + toggle), and expiry becomes an **audited** auto-return instead of silent lazy behavior.
3. **Rider (task #23)** — bound the MTTA/MTTR sample window so 2023-era rows mass-closed on Jun 30 stop skewing MTTR to ~535 days.

## Hard rails (non-negotiable)

- NEVER commit; NEVER run git mutations. Fable reviews the working tree and commits.
- NEVER systemctl/pkill/restart anything. Live :3000 is READ-ONLY for you (GET only) — NO live bulk actions, NO live mutes, NO live applies. All behavioral proof comes from hermetic tests (tempdir `DASHBOARD_DB_PATH`) and, if needed, an ephemeral server on a scratch port with a scratch DB.
- NEVER touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups` except read-only. NEVER echo secrets. NEVER set DEMO_SEED.
- Never widen any gate.sh matcher/allowlist. Follow the repo's existing idioms (envelope `{generatedAt, sourceStatus, data}`, `writeActionAudit`, risk-tier executor, UX/table standard).
- Do not rename the existing "mute" naming in code/API to "snooze" — the feature IS the snooze item; keep API/DB naming stable. UI copy may say "Snooze" where it already does.

## Ground truth (verified by orchestrator 2026-07-06 — trust these anchors, re-verify before building on them)

- Mute machinery EXISTS: `mute:incident:<id>` / `unmute:incident:<id>` kinds in `server/api/execute.ts` (~lines 552-593) writing `muted_at/muted_by/mute_reason/muted_until`; routes `/api/incidents/:id/mute|unmute` in `server/api/router.ts` (~792); UI duration picker in `app/routes/IncidentsPage.tsx` (~79-145, MUTE_DURATIONS incl. "until unmuted" = ms 0); lazy expiry via `isMuteActive()` in `server/api/incidents.ts:330` and `server/insights/scanners/sla.ts:42`. No schema change needed.
- Muted rows currently STAY in the table with a gray "muted" pill (IncidentsPage.tsx ~721) and a searchable "muted snoozed" tag (~508). There is no default-view exclusion and no audited expiry.
- MTTA/MTTR: `server/api/incidents.ts` ~297-321 — `ackDurations`/`resolveDurations` filter only on non-null timestamps, no time bound; `meanTimeToResolveMs` in `/api/reasoner/loop-stats` (`server/api/reasoner.ts` ~344, from the `counts` SQL above it) is also unbounded — live value 46237501499ms ≈ 535d proves it.
- Audit `action_kind` convention: operator actions like `incidents.escalate`, `insights.apply`; system sweeps like `incidents.auto-close`, `incidents.auto-resolve`. The existing auto-resolve sweep (`autoResolveStaleIncidents()`) shows where periodic sweeps run — put the snooze-expiry sweep next to it on the same cadence.

## Deliverable 1 — Bulk ops

**Server**: one endpoint (e.g. `POST /api/incidents/bulk`) accepting `{action: "acknowledge"|"resolve"|"mute", ids: string[], reason?, durationMs?}`.
- Cap batch size (50). Reject unknown actions. Tenant-scoped like the single routes.
- **Reuse the existing single-action core paths** — do NOT duplicate the mutation logic; fan out so each target goes through the same code that writes its own `action_audit` row (one row per target — this is the A1 requirement). Add a shared `batchId` (e.g. in resultJson/metadata) linking the rows.
- Per-target failure isolation: one bad id (missing, wrong tenant, already-resolved where invalid) must not abort the batch; response reports per-target outcomes `{id, ok, error?}` plus summary counts.
- Preserve each action's existing risk/confirm semantics server-side (whatever the single-action executor enforces — do not loosen; reason handling matches single-action behavior).

**UI (IncidentsPage)**: checkbox column + select-all-on-page; a bulk action bar appearing when ≥1 selected (count, Acknowledge / Resolve / Snooze-with-duration-picker, one confirm dialog per batch); per-target outcome surfaced after run (e.g. "12 acknowledged, 1 failed: <id> — <error>", never silent). Must not break the repo's table standard (pagination, sort, search, row-expand all keep working; selection survives sort/filter or is clearly cleared — pick one and make it visible).

## Deliverable 2 — Snooze lifecycle

- **Default view**: mute-active incidents are hidden from the default table view, with a never-silent affordance: a visible "N snoozed hidden" indicator + filter/toggle to show them (fit the page's existing filter idiom, e.g. how auto-closed filtering works). Deep-links/searches that explicitly target snoozed rows must still find them when the toggle is on.
- **Audited expiry**: a sweep (same scheduler cadence/location as `autoResolveStaleIncidents`) finds rows where `muted_until` is non-null and `< now`, clears the four mute columns, and writes ONE audit row per incident with a **system-distinct** action_kind (e.g. `incidents.unmute-auto` — distinct from the operator `unmute` kind, mirroring the auto-close/auto-resolve convention) with a reason like `snooze expired (was until <iso>)`. Idempotent: already-swept rows never re-audited. Lazy `isMuteActive()` checks stay as-is (belt-and-braces; sweep and lazy logic must agree).
- **Guard the masking lesson**: snooze/mute must NOT affect recurrence detection — add a pin test proving a mute-active incident still counts toward `detectRecurringIncidents()` occurrence counting. (We just wrote a case study about auto-remediation masking defects; snooze must never recreate that.)

## Deliverable 3 — Bounded MTTA/MTTR (task #23)

- `/api/incidents` stats: bound MTTA samples to `acknowledged_at` and MTTR samples to `resolved_at` within a trailing **90-day** window (constant, named). Expose the window + sample counts in the payload; UI tiles get an honest label (e.g. "trailing 90d"). oldestOpenAgeMs stays unbounded (it's about open rows).
- `/api/reasoner/loop-stats`: bound `mean_ttr_ms` to resolved_at within the SAME 7-day window the payload's other numbers already use (resolved7d etc.) — it's a 7d loop metric; make the SQL say so.
- Tests pin both: ancient resolved rows excluded from means; window/sample counts reported.

## Verification you must run (report results verbatim)

1. `bun run check` clean.
2. `DASHBOARD_DB=1 timeout 500 bun test` — full suite; baseline is **998 pass / 0 fail**; your new tests add to it, nothing may fail. Reconcile the final count.
3. `bash e2e/fresh-host/gate.sh` — must stay **PASS 41/41**, CRASH=0, ERROR-5xx=0, LEAK=no, zero exceptions added.
4. New tests must cover: bulk happy path (N rows → N audit rows + shared batchId), failure isolation, cap, expiry sweep (expired cleared + system audit kind; unexpired and indefinite untouched; idempotent), recurrence-unaffected-by-mute pin, MTTA/MTTR bounding for both endpoints.

## Report format

1. Files changed (paths + rough +/-), grouped by deliverable.
2. Test/gate output (exact tail lines) + final test count reconciliation vs 998.
3. Design decisions where the spec left room (endpoint shape, audit kind name, selection-vs-filter interaction) — state what you chose and why in one line each.
4. Anything you could not do or verify, stated plainly.
