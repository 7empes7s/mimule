# SPEC 11 — Closed-Loop Case Study from Live Evidence (ULTRAPLAN P2.5)

**Builder**: Sonnet subagent. **Verifier/committer**: Fable (orchestrator). You NEVER commit, NEVER run systemctl/pkill, NEVER restart anything.

## Mission

Write **`docs/case-studies/CASE_STUDY_CLOSED_LOOP.md`** in `/opt/opencode-control-surface/` — the ULTRAPLAN 2.5 deliverable: a marketing-grade case study of one real condition that went **detect → escalate → builder-fix → prove** on this live system, built entirely from real evidence (audit rows, incident rows, loop-stats). This closes ULTRAPLAN Phase 2.

This is a **docs-only** change. You write exactly one new file (plus, optionally, one index-link edit — see §5). No server/app source changes, no test changes, no restarts.

## Hard rails (non-negotiable)

- Live service on :3000 is **READ-ONLY for you**: GET requests only. No POSTs, no applies, no job starts.
- Prod DB `/var/lib/control-surface/dashboard.sqlite` is **READ-ONLY**: open it with a read-only URI only, e.g. `sqlite3 "file:/var/lib/control-surface/dashboard.sqlite?mode=ro"` or Python `sqlite3.connect("file:...?mode=ro", uri=True)`. Never write, never VACUUM, never open read-write.
- NEVER touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups` except read-only.
- NEVER commit; NEVER run git mutations (no add/commit/checkout/stash). Fable commits.
- NEVER echo secret values. Token: `TOKEN=$(grep -E '^OPERATOR_TOKEN=' /etc/control-surface/secrets.env | cut -d= -f2-)` then use `$TOKEN` in headers only.
- NEVER set DEMO_SEED anywhere.
- **Every number and timestamp in the case study must come from a real query or a cited source document.** If you cannot verify a claim, either omit it or mark it explicitly as unverified. Do NOT fabricate, round dramatically, or extrapolate. Honesty is the product here — an overclaimed case study is a failed deliverable.

## Source material (all already exist — read them first)

1. **`docs/PROVING_CASE_FLAPPER.md`** (355 lines) — the full flapper proving case: the `frontend-changes-not-deployed` recurrence, root cause (sentinel mtime signal vs WIP workflow), the fix (committed-vs-deployed signal in `ops/sentinel/mimule-product-sentinel.py`, `--self-test` 5/5), and the audit-row map.
2. **`docs/AUTOAPPLY_PROMOTION_REVIEW.md`** (232 lines) — SPEC 10's deliberate auto-apply expansion: 1 promotion (pass-timeout family) + rollback-evidence gate + 3 refused promotions with reasons.
3. **`/root/control-surface-plans/ULTRAPLAN.md`** Phase 2 section (lines ~143–150) — the per-item DONE annotations for 2.1–2.4 carry commit hashes and evidence summaries.

## Known evidence anchors (verify each against the DB/API before quoting)

- **Audit chain** (table `action_audit` in the prod DB):
  - id **714771** — `insights.apply` (operator Apply on the recurrence insight)
  - id **714769** — `incidents.escalate` (escalate action fired by the Apply)
  - ids **714780–714783** — workflow update + lifecycle calls closing the escalated workflows
  Query these rows read-only and quote their real fields (action_kind, action_id, created_at, result_status). If column names differ, adapt — quote what's actually there.
- **BEFORE loop-stats** (Jul 3, at the loop-stats feature's first boot, recorded in the vault): resolved7d **42**, autoClosed7d **4**, autoShare **≈9.5%**. Cite as "recorded 2026-07-03" — you cannot re-query the past; this is a documented historical snapshot.
- **AFTER loop-stats** (live now): `GET http://127.0.0.1:3000/api/reasoner/loop-stats` with the token. At 2026-07-06T06:41Z it returned openCount 0, resolved7d 46, autoClosed7d 6, autoResolved7d 3, autoShare 0.1957. Re-fetch it yourself and quote YOUR fetch with its `generatedAt`.
- **Detection date**: the flapping condition was first flagged 2026-07-03 (the loop-stats slice's first boot flagged `sentinel-health-…-frontend-changes-not-deployed` recurring despite auto-remediation). Cross-check against the incidents table (read-only) — find the real first/last incident timestamps for that condition and the total occurrence count, and use those.
- **Fix date**: 2026-07-05 (SPEC 8, commit 1758926 documents it; the fix itself was deployed to the sentinel with backup).

## Case study structure (guideline, adapt for flow)

Audience: a prospective operator/buyer evaluating whether the closed loop is real. Tone: confident, concrete, zero hype-words; every claim followed by its evidence. Target 150–250 lines.

1. **Executive summary** — the loop in one paragraph; headline: one real recurring failure detected, escalated, root-caused, fixed through the surface's own workflow, with a queryable audit chain end-to-end; auto-share roughly doubled over the same window (with the honest attribution note, see §7).
2. **The condition** — what a "flapper" is (auto-remediation masking a real defect), why masking-detection is the hard part, what this specific flapper was.
3. **Timeline table** — real timestamps: first occurrence → recurrence detection (Jul 3) → operator Apply/escalate (Jul 5) → root-cause → fix deployed → post-fix probe. Pull timestamps from the DB and PROVING_CASE_FLAPPER.md.
4. **The audit chain** — quote the real audit rows (id, kind, action_id, timestamp, result). The point: every step of the loop left a row a stranger can query.
5. **Root cause + fix** — the sentinel compared file mtimes and flagged WIP as "not deployed"; fix = committed-vs-deployed signal; self-test 5/5; deployed with backup. One paragraph, technical but readable.
6. **Proof it stayed fixed** — post-fix live probe (score 100, no new incident, orchestrator-reproduced per PROVING_CASE_FLAPPER.md); durability criteria: trailing-7d incident count <3 from ~Jul 9, 0 by ~Jul 11. Since today is before Jul 9, state plainly the durability watch is **in progress** with those dates — do not claim it early.
7. **Before/after loop-stats** — the 9.5% → ~19.6% auto-share table. MANDATORY honesty note: the delta reflects the whole system's week (incident auto-close + auto-resolves across all conditions), not solely this case; the case study's contribution is the *loop working*, the aggregate metric is corroborating context.
8. **What we deliberately did NOT claim** — (a) applied insights are terminal by design (`resolveStaleInsights` is open-only), so the insight shows `applied`, not "auto-resolved" — the incidents stopping is the real signal; (b) in the same phase, 3 of 4 planned auto-apply promotions were REFUSED on implementation verification (summarize from AUTOAPPLY_PROMOTION_REVIEW.md §3). Frame: the system refuses claims it can't evidence — that is the feature.
9. **Reproduce it yourself** — the exact read-only queries (sqlite3 ro-mode commands + curl GETs) a reader can run to verify every number in the document.

## Optional index link (§5)

Check whether `docs/case-studies/` siblings (`newsbites-v4.md`, `self-bootstrapping.md`, `tib-markets.md`) are listed in any index/nav file (grep for their filenames across the repo). If — and only if — an existing index lists them, add one matching entry for the new file. If nothing references them, add no link and say so in your report.

## Report format (return to orchestrator)

1. Files created/edited (paths + line counts).
2. Every quoted number/timestamp with its provenance (query or doc §).
3. Any discrepancy found between source docs and the DB (e.g., audit ids that don't match) — report it, don't paper over it.
4. The index-link decision (§5) and evidence.
5. Anything you could NOT verify and how the doc marks it.
