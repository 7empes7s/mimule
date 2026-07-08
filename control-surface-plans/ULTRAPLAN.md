# CONTROL SURFACE ULTRAPLAN — the road from "works for me" to "sellable AI admin center"

**Date:** 2026-07-03 · **Author:** Claude Fable (single planner+builder+verifier)
**Supersedes nothing — sits ABOVE:** `pages/*.plan.md` (44), `SHOWCASE_SPINE_PLAN.md`, `MARKET_PARITY_PLAN.md`, `DASHBOARD_V5_PLAN.md`, `PAGE_VS_PLAN_AUDIT_2026-07-03.md`. Those remain the per-surface specs; this file is the strategic sequencing layer that turns them into a business outcome.
**Execution protocol:** full-auto slices (green → commit → restart → live-verify → advance), evidence for every claim, free-models-first economics, honest UI over fake data, never touch `/opt/newsbites` without instruction, kill by PID, log to vault + master plan.

---

## 0. The objective, stated once

Marouane is building an **AI-operated software/media company** (NewsBites flagship, tib-markets, autopipeline, studio, affordable-AI stack) where the **AI team owns product health** and he is CEO, not monitor. Out of that operating reality he extracts **sellable products** — and the Control Surface is the crown jewel: *"M365 admin center but smarter"* for anyone running AI systems. It must be **sellable as a whole OR in parts** (gateway, FinOps, governance/compliance, incident command, builder, discovery/inventory), pass the **insider eye-roll test** in every module, and carry the **affordability story** (free-first routing, provider cycling) as both internal economics and differentiator.

The bar for every feature is G1–G9 (`_CONTEXT.md`): usable/stable, GUI-controllable, complete (no mock), detects everything **including the unknown**, findable/readable/actionable, auto-first with single-Apply fallback, AI reasoning before raw data, an actual admin center, **zero-config in ANY environment**.

## 1. Where the product actually is (evidence, 2026-07-03)

**Strong and proven on THIS host:**
- 919/919 unit tests, 123/123 multi-viewport visual gate (41 routes × 3 devices), live 24/7 at control.techinsiderbytes.com, NODE_ENV=production, hardened auth (6 paths verified), tamper-evident audit chain.
- Insights engine: 10+ scanners, AI enrichment, risk-tiered auto-apply, notifications, daily digest, health-score trend.
- Remediation loop CLOSED at detection level: sentinel auto-close, idle sweep, **recovery auto-close via builder_passes**, **recurrence detection** (flagged a real flapper on first boot), loop-stats API + tiles (42 resolved/7d, MTTR tracked).
- Universal discovery (G4+): process/port/container scan, presence-based flagging, register/ignore flow, 24-asset governed inventory, 30-day retention.
- Builder: durable multi-pass engine, reasoner diagnoses, playbooks, doctor, preview tunnels, plan-progress. All controls now live + audited (today's fixes).
- Gateway: own model routing + keys + ledger; multitenancy schema (tenant_id everywhere); licensing tiers; marketplace; compliance page; RBAC/flags/security/model-lifecycle grounded subsets.

**The honest gaps (each one is a business risk, not just a TODO):**
| # | Gap | Why it matters to the objective |
|---|---|---|
| 1 | **G9 never proven** — product has never booted on a host that isn't this VPS; every fresh-host acceptance box across 44 plans is open | Sellability is an **untested hypothesis**. #1 risk in the whole plan. |
| 2 | **No rehearsed sell story** — SHOWCASE spine 21/36; no staged demo, no cold-install clip, no golden-flow rehearsal, no CFO cost headline | Nobody buys an admin center from a README; they buy a 10-minute story. |
| 3 | **Loop detects + tells, but doesn't yet own root causes** — auto-apply is deliberately conservative (3 of 1052 findings); the recurrence detector's first catch (frontend-changes-not-deployed flapper) is exactly a condition the system should FIX, not report | "Never make Marouane the monitor" is only half-true until detect→fix→prove is closed for recurring conditions. |
| 4 | Operational completeness holes (audit report §3): doctor requeue GUI, dual diagnosis panels on /builder, third-party QR, infra actions bypass durable jobs, no SLA detector, no incident owner | G2/G3 completeness = the insider eye-roll bar. |
| 5 | Two designed-but-unbuilt sellable modules: `/governance/risk` (AI GRC) and `/ratings` (model quality) | AI-GRC is the strongest regulatory tailwind in the market; both plans already written. |
| 6 | Reports thin: daily digest exists; no weekly executive report, no evidence-pack export flow proven, no usage analytics | Reports ARE the product for the buyer's boss. Usage data decides SKU packaging. |
| 7 | Single-project reality: governs only MIMULE; "point it at any PATH" (continuous-improvement engine) unproven even internally | Second project (GaffrPro at /opt/provisioned/gaffrpro) is sitting right there as proof. |
| 8 | Telegram-only notifications; no webhook/email adapters | Customers won't all use Telegram. |

## 2. Strategic sequencing — why this order

```
P0 Prove it generalizes  →  P1 Rehearse the sell story  →  P2 Close the autonomy loop
        (G9 gate)               (demo + clip + headline)        (detect→fix→prove case study)
                    ↓ then parallelizable in slices ↓
P3 Actions everywhere (G2/G6 sweep) · P4 Reports & usage suite · P5 New sellable modules
                    ↓
P6 Second project + packaging (multi-project proof, installer, SKU sheet)
```

- **P0 first** because a demo that only works on MIMULE is a trap: every later artifact (clip, docs, installer) would be built on an unverified assumption. P0 is also the cheapest source of information — one clean container run will surface every hidden hardcode at once.
- **P1 before P2** because the golden flow already works with today's conservative auto-apply; the demo unblocks showing the product to anyone, immediately.
- **P2 right after** because the closed-loop case study (a real flapper detected → escalated → fixed by the builder → incident auto-closed → full audit trail) becomes the single best marketing artifact AND directly completes the "AI team owns product health" goal.
- **P3/P4/P5 are catalogs**, executed as slices in any order once 0–2 hold; they widen the moat (actions), deepen retention (reports/usage), and add SKUs (modules).
- **P6 last** because packaging ossifies decisions; ossify only what P0–P5 proved.

---

## 3. CATALOG A — More ACTIONS (G2 "no SSH for routine ops" + G6 "auto-first")

Every action goes through the existing risk-tier executor (`/api/actions/execute` + actionDescriptors), writes `action_audit`, and appears in the page UI AND the insights Apply flow. Risk tiers: **auto** (self-heals, logged), **low** (single Apply), **medium** (Apply + confirm), **high** (approval gate).

### A1. Incident command (IncidentsPage)
- [x] **Assign/owner** — `assign:incident:<id>` (low); owner column + filter; unassigned-critical detector feeds insights. — DONE 72898a4 (SPEC 9, with SLA fields)
- [x] **Snooze-until** — `snooze:incident:<id>:<ts>` (low); snoozed incidents leave the default view, auto-return at expiry, audited both ways. — DONE bd74888 (SPEC 12; ships as the pre-existing mute-with-duration + the two missing behaviors: mute-active rows leave the default view w/ never-silent "N snoozed hidden" toggle, expiry audited via idempotent `incidents.unmute-auto` scheduler sweep; pin test proves mute never affects recurrence detection)
- [x] **Escalate-to-workflow** — `escalate:incident:<id>` (medium): one click creates a builder workflow pre-seeded with the incident's diagnosis, evidence refs, and recurrence history as the plan file. THE bridge action (see P2). — DONE a1549bd (P2.1)
- [x] **Bulk ops** — multi-select acknowledge/resolve/snooze with one audit row per target. — DONE bd74888 (SPEC 12; POST /api/incidents/bulk fans out through the literal single-action executor per target — one audit row each + shared batchId, per-target failure isolation, cap 50 rejected-not-truncated, checkbox column + bulk bar w/ one confirm per batch + never-silent outcomes. Rider: task #23 MTTA/MTTR birth+completion-bounded [90d incidents / 7d loop-stats mean; resolved7d+autoShare deliberately unbounded] — live MTTR tile 535d→4.65d over 13 samples, MTTA honest null, loop-stats mean ~7.4h; builder caught that the spec's completion-only bound wouldn't have moved the live number. 1020/0 [+22], gate 41/41) **A1 COMPLETE**

### A2. Doctor (DoctorPage)
- [x] **Requeue/repair per entry** — `requeue:doctor:<entryId>` (medium); per-entry Apply button in the history table. — DONE cbd8d3f (SPEC 13; the pre-existing /api/doctor/requeue was a PHANTOM — POSTed a nonexistent `requeue` command [pipeline → Unknown command] AND judged success by res.ok while the pipeline returns {ok:false} at HTTP 200, so broken requeues finished "success"; no UI wired it. Fixed to the sanctioned `doctor-dispatch` path [stuck-stories-only, pipeline's own manual doctor, not a direct /opt/newsbites write] + body-ok parsing; chose doctor-dispatch over inject [inject needs a dossierDir the log lacks]. Per-row "Requeue / re-run doctor" in DoctorPage expanded detail: confirm + honest "only if still stuck" tooltip + never-silent job-then-poll surfacing the pipeline's verbatim refusal. Live: 400 on missing slug, external 200)
- [x] **Fix-all-of-class** — `requeue:doctor:class:<failureClass>` (medium, capped batch of 10, job-backed). — DONE cbd8d3f (SPEC 13; POST /api/doctor/requeue-class {errorType} — distinct candidate slugs of the class from the current doctor log, deduped, capped 10 [DOCTOR_REQUEUE_CLASS_MAX], ONE parent job dispatching each through the SAME shared dispatchDoctorRequeue fn [no dup fetch], per-slug failure isolation, one audit row per slug + parent summary {total,acted,dispatched,refused,failed,perSlug}. UI button on the decision-log filter bar when an error filter is active; honest capped/refused summary. 11 hermetic tests [stubbed pipeline fetch, never touch :3200]; 1020→1031, gate 41/41. Live: honest "No candidates found" empty-summary path proven — dispatched nothing to the live pipeline, 400 on missing errorType) **A2 COMPLETE**

### A3. Infra (InfraPage)
- [x] **Durable-job-backed restart/timer-run** — all mutations route through the jobs table (visible on /jobs, cancellable, retried); no more fire-and-forget. — DONE 7d04f2c (SPEC 14 / A3a; both infra handlers were synchronous fire-and-forget [execSync-blocked HTTP up to 60s, no job record]. New command-runner seam server/api/shell.ts [runShell never-throws, surfaces stdout for is-active, setRunShellForTests injectable → zero real commands in build/test]. infraServiceRestartHandler → createJob(infra-service-restart) + async worker: before-state → restart → ~1.5s settle +1 retry → after-state, success IFF command ok AND after healthy [judged on captured state not exit — the SPEC 13 res.ok lesson], {before,after,command} in job output + audit evidence. infraRunTimerHandler → createJob(infra-run-timer) + LATENT-BUG FIX: old code omitted --no-block at 5s timeout → any oneshot >5s false-failed ETIMEDOUT; now --no-block. UI surfaces jobId → /jobs; useAction gains additive optional jobId. 14 hermetic tests, 1031→1045, gate 41/41. LIVE-VERIFIED: real opencode-server bounce active→active recorded {before:active,after:active}; vast-watchdog timer job created; mimule-overseer refusal 400/no-job; external 200)
- [x] **Disk-pressure one-click reclaim** — `reclaim:disk:docker-prune` (medium): bounded `docker builder prune` + image prune with before/after df evidence in the audit row. (Root cause of two past outages — make it a button, then make it a detector+auto at >90%.) — DONE f326532 (SPEC 15 / A3b; the disk-pressure detector already existed [ops:disk-pressure ≥85/95%] but offered no fix [actionDescriptorId:null] — this adds the action it points at, closing the loop with no new UI [InsightsPage Apply renders off actionDescriptorId]. New `reclaim` kind → routeAndExecute createJob(reclaim-disk) + async runDiskReclaim worker: before `df -BG /` → `docker builder prune -f` → `docker image prune -f` → after df, via the SPEC 14 runShell seam; NEVER -a/--all [tested-absent invariant]. Success IFF both prune cmds ok — 0 bytes reclaimed is still success [SPEC 13 judge-on-state]. Review tier [not in SAFE_AUTO_ACTIONS → defaultTierForAction=review]; >90% auto is a gated follow-up [needs AUTO_ROLLBACK_AFFORDANCES + promotion-review + operator OK]. 14 hermetic tests, 1045→1059, gate 41/41. LIVE-VERIFIED: confirm-gate refusal 400/no-job; real prune job success recording {before:75%,after:75%,reclaimedGb:0,cmds:[df,builder-prune,image-prune,df]} — the 529MB still-reclaimable is tagged-but-unused images our bounded prune correctly LEAVES [only -a removes them], so this run live-proves both the never-`-a` bound AND the 0-bytes-still-success path. NOTE: a concurrent V4-scheduler codex loop pre-marked this "Codex A3b"; the shipped+live artifact on clean master is f326532)
- [x] **Backup freshness action** — `run:backup:now` (low) + detector when `/opt/backups/<today>` missing by 06:00 UTC. — DONE f326532 (SPEC 15 / A3b; the backup stale/missing detector already existed [ops:backup-stale via getBackupFreshness] but offered no fix — this adds `run:backup:now` [new `run` kind, low, no-confirm] and wires the insight to it. REUSES the SPEC 14 runInfraTimerRun worker for the already-allowlisted mimule-backup timer [systemctl start --no-block mimule-backup.service] — no new systemctl code; timer name hardcoded so a non-allowlisted timer is impossible on this path. Review tier. Hermetic tests assert dispatch→runInfraTimerRun with --no-block + low-risk no-confirm. LIVE: descriptor confirmed live in catalog [kind run, low, confirm=false]; execution path is the SPEC 14 worker already live-proven [vast-watchdog timer job, 7d04f2c] — deliberately did NOT trigger a redundant real backup [today's ran 04:06; respects read-only-/opt/backups rail + load]. NOTE: concurrent V4 loop pre-marked "Codex A3b"; shipped artifact is f326532)
- [x] **Cloudflared/tunnel restart** — `restart:service:cloudflared` (medium) with post-restart health probe evidence. — DONE 7d04f2c (SPEC 14 / A3a; cloudflared is already allowlisted and its restart routes through the now-job-backed infraServiceRestartHandler, so it automatically carries the before/after systemctl is-active capture = its post-restart health probe [same worker path proven live on opencode-server]. No new allowlist entry, no separate handler — folded into the durable-restart worker by design)

### A4. Models & gateway (ModelsPage, GatewayPage, LiteLLMPage)
- [x] **Force-reprobe one model** — `probe:model:<logicalName>` (review-tier diagnostic; descriptor risk low): runs the health-check probe for a single model, updates model-health.json entry; button next to every stale/unavailable row. — DONE ee0cc0d (ULTRAPLAN P3 A4a; adopted and verified the preserved A4 draft: catalog descriptor, `/models` stale/unavailable row action, global executor job path, fallbacks-disabled LiteLLM single probe, selected-row-only model-health update, job/audit evidence. Important correction vs draft: autoapply policy ships `probe:model:*` at review tier despite read-only rollback affordance; auto promotion remains gated by promotion-review + operator OK. Evidence: focused A4 tests 27/0, `bun run typecheck`, `bun run build`, `bun run check`, seeded temp catalog smoke, `/models` desktop/tablet/iPhone visual check.)
- [x] **Clear cooldown** — `clear-cooldown:model:<name>` (low). — DONE ee0cc0d (ULTRAPLAN P3 A4b; canonical low-risk descriptor/executor action for active model cooldowns, `/models` flow routes through audited `/api/actions/execute`, `model-cooldowns.json` mutation uses existing cooldown-clear helper, legacy `mutate-policy:model:*:cooldown-clear` policy compatibility retained. Evidence covered with A4a validation: focused execute/actions/catalog/autoapply tests, seeded catalog smoke exposed `clear-cooldown:model:editorial-heavy`, and `/models` visual route check passed.)
- [x] **Chain preview + apply** — show the resolved fallback chain that WOULD be written from live health, diff vs current, one Apply (medium). Kills the manual chain-rebuild session forever. — DONE 2026-07-07 Codex (ULTRAPLAN P3 A4c; `/models` now shows live-vs-proposed LiteLLM fallback-chain diffs from `model-health.json` against `router_settings.fallbacks`, preserves non-editorial chains in the corrected block, and exposes one medium-risk `apply:chain-sync:litellm` action. Apply is confirm+reason gated, job-backed, writes only `router_settings.fallbacks` after a timestamped config backup, reloads LiteLLM, verifies `/v1/models`, and records job/audit evidence. Evidence: focused tests 37/0 across chain sync, catalog, and execute; `bun run typecheck`; `bun run build`; `bun run check`; `git diff --check`; isolated `:3299` smoke for `/api/models/chain-sync` and action catalog; temp `/models` visual check desktop/tablet/iPhone passed; live `control-surface.service` restarted active with `/health` OK.)
- [ ] **Gateway key rotate** — `rotate:gateway-key:<id>` (medium) with grace-period dual-validity.
- [ ] **Route override with TTL** — pin a model for N hours (low), auto-reverts, audited; solves "GPU back online, prefer local for tonight".
- [ ] **Budget cap set inline** — edit caps from /cost and /gateway without settings dive (medium).

### A5. Content & pipeline (ContentHealthPage, AutopipelinePage, NewsBitesPage)
- [ ] **Digest/image regen** — `regen:article:<slug>:digest|image` (medium) via autopipeline inject at publish-prep stage. (Read-only toward /opt/newsbites — mutations go through the pipeline, never direct file writes.)
- [ ] **Deploy now / queue drain** — `run:newsbites:deploy` (medium, job-backed) — surfaces the deploy the team already owns.
- [ ] **Pipeline stage retry** — per-dossier `inject at stage` from the dossier detail page (medium).

### A6. Discovery & governance (SecurityPage, GovernancePage, InsightsPage)
- [ ] **Bulk register/ignore** — multi-select in discovery inbox (low); rate-limiter-aware batching.
- [ ] **Edit asset criticality/owner inline** (low).
- [ ] **Re-scan one source** — `scan:discovery:<source>` (auto) instead of waiting 15 min.
- [ ] **Runbooks v1** — generalize builder playbooks into parameterized, audited action bundles usable outside builder context (e.g. "restart service + verify health + notify"): `runbooks` table, run history, GUI composer with the existing action catalog as building blocks. This is the feature that makes "more actions" scale without more code per action.

**Exit test for Catalog A (G2 audit):** grep the last 30 days of shell history for operational commands against the stack; every recurring one is either GUI-actionable or explicitly documented out-of-scope. Zero routine SSH.

---

## 4. CATALOG R — More REPORTS (G5/G7/G8 — the product for the buyer's boss)

All reports: generated server-side into `reports` table + file artifact, listed on /reports, delivered per the notifications matrix, honest about missing sources ("not configured" sections, never padded).

- [ ] **R1. Weekly Executive Report** (Mondays 07:00 UTC, auto): health-score trend sparkline, incidents opened/closed/auto-remediated share, MTTR, cost MTD + projection + **saved-by-free-first estimate**, model availability %, deploys shipped, content published, top-3 open risks with recommended actions. One page. Telegram + /reports.
- [x] **R2. CFO cost headline on /cost** (f198192) (SHOWCASE leftover): month-to-date spend, projected month-end, delta vs paid-baseline ("what this month would cost at list-price GPT-4-class routing") — the affordability story as a number.
- [ ] **R3. Remediation-loop report** (monthly): loop-stats over time — auto-close %, MTTR trend, recurrence flags raised/cleared, top flappers. Proves the autonomy claim with data.
- [ ] **R4. Compliance evidence pack export** — one click on /compliance: audit-chain segment (with verification result), control statuses, model lifecycle records, incident post-mortems for period, discovery inventory snapshot → signed zip. THE artifact a customer's auditor asks for.
- [ ] **R5. Model quality report** — from modelEval history: per-logical-model eval trend, fit-for-workload matrix, routing recommendations ("swap X→Y: equal evals, −$Z/mo"). Feeds /ratings (P5).
- [ ] **R6. SLA / uptime report** — per-service uptime from sentinel samples, breach counts, near-misses; needs the SLA detector (P2).
- [ ] **R7. Discovery posture report** (weekly section in R1 + standalone): new assets found, unregistered count trend, criticality coverage — the governance-posture number.
- [ ] **R8. "System labor" report** — the inverse monitor: what the admin center DID for you this week (auto-fixes applied, incidents auto-closed, probes run, chains rebuilt, deploys verified) with time-saved estimate. Directly serves "never make Marouane the monitor" — the system reports its own work.

---

## 5. CATALOG U — More USAGE (instrumentation, stickiness, packaging data)

- [ ] **U1. First-party usage analytics** — page visits + action clicks into SQLite (`usage_events`, no external calls — CSP-clean, privacy story intact). Retention: 90 days, aggregated forever.
- [ ] **U2. Usage report page** (/reports section): which modules earn their keep — visits, actions, findings-acted-on per page. This data DECIDES the SKU split in P6 (don't guess what's sellable-in-parts; measure which parts get used).
- [ ] **U3. Onboarding checklist widget** (fresh installs, G9): discover → register assets → configure notifications → first report generated; time-to-value measured (target: <30 min from install to first insight acted on).
- [ ] **U4. "What's new" changelog page** — fed from git log + BUILD_LOG; shows velocity to the operator and (later) to customers.
- [ ] **U5. Public status page** (opt-in, tokenless, read-only) — generated from sentinel scorecard for TIB products; a trust artifact AND a demo of the sentinel module.

---

## 6. THE PHASES (execution slices with evidence gates)

### PHASE 0 — Prove it generalizes (the G9 gate) 🎯 highest information per hour
> Everything sellable depends on this. One clean container will surface every hidden MIMULE assumption at once.

- [x] **0.1 Fresh-host harness** (9dcc674 — oven/bun:1 capped container, working-tree archive, 139-endpoint probe): `docker run` a clean Ubuntu 24.04 container on this VPS (bounded resources), install Bun, copy a git-archive of master, boot with SQLite-only zero-config. Script it: `e2e/fresh-host/run.sh` — repeatable forever.
- [x] **0.2 Route-by-route honesty audit inside the container** (API 9dcc674, UI aff8e65 — 41 routes 40 PASS/1 KNOWN; f9e56f0 fixed the /today pill and removed the exception → 41/41, gate carries zero allowlist): adapt the multi-viewport suite to run against the container (`FRESH_HOST=1` project) asserting: no crash, no MIMULE service names rendered, honest empty/connect states on every route, discovery finds only the container's own processes.
- [x] **0.3 Fix what breaks** (9dcc674 — models 500, system.ts tool guards, autopipeline seed, vast/gpu action gating, edge own-host env config): expected suspects (from plans §2): `server/adapters/system.ts` residual hardcodes, autopipeline/dossier/content-health default paths (must degrade to "not configured" with a connect CTA, not error), codex/claude/gemini fixed binary paths (degrade to honest not-present), sentinel path absent (already handled — verify).
- [x] **0.4 Durable gate** (aff8e65 — e2e/fresh-host/gate.sh, documented in _STANDING_RULES.md): fresh-host suite added to the standing verification set (run before any "sellable" claim; document in `_STANDING_RULES.md`).
- [x] **0.5 Cold-install script hardening** (f9e56f0 — install.sh idempotent installer + docs/INSTALL.md, 12.7s bare-container to serving /, setup wizard state true→complete→false, gate zero-exceptions after /today pill fix): `install.sh` (or documented docker path) from bare host → login screen in <10 min; first-run wizard stub (create operator token, name tenant).
- **EXIT EVIDENCE**: fresh-host suite green; screen recording material captured; a written FRESH_HOST_SMOKE report listing every fix made.

### PHASE 1 — Rehearse the sell story (SHOWCASE completion)
- [x] **1.1 Staged builder demo project** (SHOWCASE Phase 3): small real repo, scripted failing pass → diagnosis → playbook fix → green; resettable via one command. — DONE 8e41554 (e2e/demo/builder-demo-template checkout calculator + stage-builder-demo.sh stage/--fix/--reset, all idempotent, Fable-verified by hand; real runs: failure br_4ee2df14 with genuine bun-test assertion output, green br_ab0dc7eb via real multi-model fallback; fix beat = deterministic --fix commit this session, agentic-fix outcome honestly not captured; BONUS production fix: validation-only pass failures now queueDiagnosis (runner.ts) — post-restart live proof rq_019de22c queued for validation-failed pass bp_e7b116f9, a row the pre-fix binary provably never wrote; diagnosis LLM call itself failed "JSON parse failed" on the free model — reasoner robustness flagged separately in BUILDER_DEMO.md)
- [x] **1.2 CFO cost headline** (Catalog R2) on /cost. — DONE f198192 (Sonnet build, Fable verify; savings null-honest, live-verified 2026-07-03)
- [x] **1.3 Golden-flow rehearsal**: install → discover → flag unknown asset → register → incident appears → AI diagnosis read → one-click fix → audit row + evidence pack. Run it twice end-to-end; fix every stumble; write the demo script (`SHOWCASE_DEMO_SCRIPT.md`) with exact clicks and expected screens. — DONE 831634f (SHOWCASE_DEMO_SCRIPT.md 9-step flow install→login→wizard→demo tenant→insight→evidence→apply→audit→cost; rehearsed 2× clean on independent fresh containers + spot-check, e2e/demo/REHEARSAL_REPORT.md; the seed has no unregistered-asset finding, so the flow substitutes the spend-anomaly insight path honestly — divergence documented in the script's Known limitations; 3 stumbles fixed, 2 of them production bugs: dropdown stacking-context, getAttribution workflow/project 400)
- [x] **1.4 Cold-install clip** recorded from P0.5 (screen capture, no audio needed). — DONE 831634f (e2e/demo/clips/cold-install.cast, 10.5s asciinema 100×32 via record-cold-install.sh: prereqs→install→build→token-once→serving; + first-run-wizard.webm 1280×720 ~20s via record-wizard.mjs real-login path; clips gitignored, scripts committed)
- [x] **1.5 Demo tenant seeding** — G3-compliant: a clearly-labeled DEMO tenant with staged (marked) data for screenshots, never mixed with real tenant data. — DONE (server/db/demo-seed.ts "Northstar Showcase Demo" tenant, DEMO_SEED=1 gate never set on live; formally proven by the 831634f rehearsals: tenant-scoped isolation via x-tenant-id, script mandates announcing [DEMO DATA] vs [LIVE MECHANISM]; caveat: seed clock fixed at 2026-06-10, re-seed before demos far past that date)
- **EXIT EVIDENCE**: demo executed twice without improvisation; clip files exist; SHOWCASE_SPINE_PLAN boxes closed with evidence. — **PHASE 1 COMPLETE 2026-07-05** (rehearsals 2×+spot-check clean per REHEARSAL_REPORT.md; clips in e2e/demo/clips/; spine Phase 3/4/5 boxes ticked with commit evidence f198192/831634f/7439307/8e41554)

### PHASE 2 — Close the autonomy loop (detect→fix→prove)
- [x] **2.1 Escalate-to-workflow** (Catalog A1): recurring-condition insight gains an Apply that creates a builder workflow seeded with diagnosis + evidence + recurrence history. Auto-escalate tier for allowlisted safe classes; Apply-gated otherwise. — DONE a1549bd (escalate:incident action, recurrence-insight Apply, drawer badge/link; positive-proofed live on flapper ri_6987c2ad → draft wf bw_e3c6d8ba, idempotent re-run verified)
- [x] **2.2 Fix the live flapper as the proving case**: `frontend-changes-not-deployed` recurrence — root-cause it (likely deploy-verify timing), fix via the escalated workflow itself, watch recurrence insight auto-resolve. Document every step from the audit trail. — DONE 1758926 (docs/PROVING_CASE_FLAPPER.md: insight applied w/ typed reason audit 714771 → incident escalated 714769 → workflows closed via lifecycle API 714780-714783 → root cause = sentinel mtime signal vs this host's WIP workflow → fix = committed-vs-deployed signal in repo-managed ops/sentinel/mimule-product-sentinel.py, --self-test 5/5, deployed w/ backup; live proof: WIP probe → score=100/0 fails/no new incident, orchestrator-reproduced. CORRECTION found in verification: applied insights never auto-resolve (resolveStaleInsights is open-only) — insight terminal state is `applied`; durable watch = trailing-7d incident count <3 from ~Jul 9, 0 by ~Jul 11; applied-but-still-recurring blind spot recorded as product-gap candidate)
- [x] **2.3 SLA fields + detector**: `sla_due_at`/owner on incidents; `incident-approaching-SLA-breach` scanner → ops/high insight; SLA tiles fed by real deadlines (incidents.plan MUST). — DONE 72898a4 (server/reasoner/sla.ts windows critical-4h/high-24h/medium-72h/default-7d parsed from title prefix; sla_due_at+owner columns, backfill open-only [live prod: all 46 incidents resolved → correctly zero backfilled]; both creation sites stamp at birth; scanners/sla.ts breached+approaching ops/high insights w/ stale-resolve; assign:incident audited action + owner UI never-blank; tiles = real breached-open/due-soon counts, hardcoded 24h constant deleted; 987/0 [+31 reconciled], gate 41/41 zero exceptions, live envelope verified post-restart. Rider finding: MTTR tile skewed to ~535d by 2023-era rows mass-closed Jun 30 — tracked as follow-up task, bound the sample window)
- [x] **2.4 Deliberate auto-apply expansion**: review the 1052-finding corpus; promote 3–5 more finding classes to auto tier WITH rollback evidence requirements; measure auto-share delta in loop-stats. — DONE 3624e6c (docs/AUTOAPPLY_PROMOTION_REVIEW.md = the deliberate-review artifact. 1 promotion: reasoner-remediate:pass-timeout:* family [13 findings, largest actionable class after acknowledge] — verified non-destructive, run ids recorded, cancel affordance; required a real dispatch fix: runAutoApply sent everything to /api/actions/execute which has no reasoner branch → would have failed 100% + tripped breaker; now mirrors applyInsightCore's split. 3 of 4 planned promotions REFUSED on implementation verification, orchestrator-confirmed line-by-line: doctor:scan = remediation dispatcher (requeues stories, sets cooldowns, saveState) not a read-only scan; mimule-{overseer,orchestrator} absent from ALLOWED_SERVICES + blind execSync restart w/ no job record/state capture. Structural rollback-evidence gate: AUTO_ROLLBACK_AFFORDANCES declarative map beside SAFE_AUTO_ACTIONS, no affordance → audited skip `autoapply.skipped-no-rollback` deduped 6h, preview parity — even operator force-promotions can't run without a code-reviewed affordance. Guardrails untouched 10/3/1h/0.75 + pin test. BEFORE baseline live 22:45Z: autoShare 0.196, zero auto-tier candidates open; delta accrues as findings recur — honest no-number stance, query documented. 998/0 [+11 reconciled], gate 41/41, live post-restart: refused families show review/wouldApply:false on prod)
- [x] **2.5 Case study written from live evidence** (`CASE_STUDY_CLOSED_LOOP.md`): timeline, audit rows, before/after loop-stats. This is a marketing asset built from real operations. — DONE 497d8ee (docs/case-studies/CASE_STUDY_CLOSED_LOOP.md, 166 lines + changelog index bullet. Every number query-backed: audit chain 714769/714771/714780-714783 quoted from prod DB; 11-incident history w/ REAL first occurrence 2026-06-16 [corrects PROVING_CASE_FLAPPER's "since 06-25"]; 0 new incidents since fix epoch; trailing-7d 6→5; insight terminal `applied` confirmed live; before/after autoShare 9.5% [Jul 3 vault] → 19.6% [live fetch] w/ mandatory whole-system attribution note; durability watch stated in-progress not claimed [Jul 9-11, task #20]; §8 did-NOT-claim = applied-is-terminal + 3-of-4 refused promotions; §9 reproduce-it-yourself appendix — verifier re-ran every §9 query, all numbers reproduce exactly; second discrepancy flagged honestly in-doc: backup file mtime 06-12 vs claimed backup time, sha256 authenticates content. Bonus corroboration at verify time: next routine sentinel run 06:52:53Z also score 100/0)
- **EXIT EVIDENCE**: one real condition went detect→escalate→builder-fix→auto-close with full audit chain; loop-stats auto-share increased; case study file exists. — **PHASE 2 COMPLETE 2026-07-06**: flapper went detect (Jul 3 recurrence insight) → operator Apply/escalate (audit 714769/714771) → builder-workflow fix (sentinel committed-vs-deployed signal) → incidents quiet (0 new since fix; historical closes were the auto-resolve sweep; insight is terminal `applied` BY DESIGN per 2.2 correction — the honest "auto-close" is the incident table going quiet); autoShare 9.5%→19.6% (whole-system, honestly attributed); CASE_STUDY_CLOSED_LOOP.md exists with reproduce-it-yourself queries. Durability watch open until ~Jul 11 (task #20) — Phase 2 closed on evidence-to-date, watch noted.

### PHASE 3 — Actions everywhere (Catalog A, sliced)
Order within phase: A1 incidents → A2 doctor → A3 infra → A4 models/gateway → A5 content/pipeline → A6 runbooks.
Also closes audit-report §3 stragglers: [ ] single diagnosis flow on /builder (merge classifier+reasoner panels), [ ] first-party QR (inline QR lib, kill api.qrserver.com), [ ] run-table search/depth/focus-param on /builder.
- **EXIT EVIDENCE**: G2 shell-history audit (see Catalog A exit test); every new action visible in audit page; multi-viewport suite still green.

### PHASE 4 — Reports & usage suite (Catalogs R + U, sliced)
Order: R1 weekly exec (biggest visible win) → R4 evidence pack → R8 system-labor → U1/U2 usage → R3/R5/R6/R7 → U3/U4/U5.
- **EXIT EVIDENCE**: Monday report auto-delivered to Telegram; evidence pack downloaded and opened; usage_events populating; /reports is a real hub.

### PHASE 5 — New sellable modules
- [ ] **5.1 /governance/risk (AI GRC)** — build per governance-risk.plan.md: risk register auto-populated from discovery + incidents + security + model lifecycle; control mapping (EU-AI-Act-shaped, honestly labeled as framework-aligned not certified); no fake fairness metrics (plan's G3 note).
- [ ] **5.2 /ratings (model quality)** — build per ratings.plan.md from modelEval + gateway ledger; routing recommendations wired to A4 chain-preview action.
- [ ] **5.3 Notifications matrix** — per-severity/domain routing; webhook + email adapters beside Telegram; per-tenant config.
- [ ] **5.4 Onboarding wizard** (U3) — completes the fresh-install story.
- **EXIT EVIDENCE**: both pages pass the page-plan G-bar, added to nav + multi-viewport suite (suite grows to ~129×3); notifications delivered via a non-Telegram channel in test.

### PHASE 6 — Second project + packaging
- [ ] **6.1 Govern GaffrPro** — register /opt/provisioned/gaffrpro as project #2: discovery, product-health probes, builder workflows pointed at its repo, per-project views. Internal proof of "point it at any PATH" (continuous-improvement engine memory).
- [ ] **6.2 Installer + docs** — install.sh + first-run docs validated BY the fresh-host harness; upgrade path documented (git pull + migrate + restart).
- [ ] **6.3 SKU sheet** — from the 44 plans' §7 sellable-in-parts sections + U2 usage data: which modules bundle into which tier (Solo/Team/Enterprise already exist in licensing); price hypotheses; one-pager per module.
- [ ] **6.4 Licensing enforcement smoke** — tier gates actually gate in fresh-host mode.
- [ ] **6.5 Public status page** (U5) for TIB products.
- **EXIT EVIDENCE**: two projects governed by one control surface with per-project health; a stranger could install from docs alone (fresh-host harness proves it); SKU sheet written.

---

## 7. Goals-mapping matrix (why each phase exists)

| Phase | G-goals served | Business objective served |
|---|---|---|
| P0 fresh-host | **G9**, G3 | Sellability de-risked; installer groundwork |
| P1 sell story | G8, G5 | First revenue motion possible; demo assets |
| P2 closed loop | G6, G7, G4 | "AI team owns health" made literal; flagship differentiator + case study |
| P3 actions | **G2**, G6, G3 | Insider eye-roll bar; ops without SSH; runbooks = scalable actions |
| P4 reports/usage | G5, G7, G8 | Buyer's-boss value; packaging decided by data; system reports its own labor |
| P5 new modules | G4, G8 | Two new SKUs (AI GRC rides the strongest regulatory tailwind) |
| P6 packaging | G9, G8 | Multi-project proof; distribution; pricing |

## 8. Standing rails (apply to every slice)
1. **Quality gates**: `bun run check` + targeted tests + full suite before commit; multi-viewport suite grows with every new page/tile; fresh-host suite before any sellability claim.
2. **Economics**: free/cheap models for enrichment and evals; Fable/genius only for planning and verification. The product must stay cheap to RUN, not just cheap to build — it IS the affordable-AI story.
3. **Honesty**: "not configured" over fake data, demo data labeled DEMO, degraded sources visible per card. No exceptions — this is the trust moat.
4. **Audit everything**: any new mutation writes `action_audit` (today's builder fix pattern is the template).
5. **Safety**: live NewsBites read-only (mutations via pipeline APIs); kill by PID; no broad pkill; ps-check before git ops; no force-push.
6. **Logging**: vault daily + master-plan append after every session; this file's boxes get ticked with commit hashes as evidence.

## 9. Risks & honest positioning
- **Bun+SQLite single-node** — right-sized for the target segment (solo operators/small teams running AI stacks on 1–3 hosts); position honestly, don't chase enterprise-scale claims. Multi-host = roadmap, not promise.
- **Notifications = Telegram-only today** — P5.3 fixes; until then, demo with Telegram confidently (it's genuinely good).
- **AI-GRC claims** — framework-*aligned*, never "certified/compliant" language; evidence packs are inputs to an auditor, not audit replacements (compliance plan's own G3 note).
- **Demo vs reality drift** — the fresh-host harness + golden-flow script are the anti-drift mechanisms; re-run both after any structural change.
- **Scope gravity** — 44 plans contain ~215 MUSTs; this ultraplan deliberately does NOT commit to all of them. The audit report's open-MUST list is the backlog; the phases above are the spine. New ideas enter as catalog items first, phases second.

## 10. Suggested first queue (next sessions)
1. P0.1–0.3 fresh-host harness + fixes (2–3 sessions — the big unknown)
2. P0.4–0.5 + P1.2 CFO headline (1 session)
3. P1.1 + 1.3 demo staging + rehearsal (1–2 sessions)
4. P2.1–2.2 escalate-to-workflow + flapper proving case (2 sessions)
5. Then Catalog slices (A/R/U/M) per operator priority — timely EU-AI-Act items (M11, M12) before December 2026.

---

# PART II — MARKET LAYER (added 2026-07-03, researched live)

## 11. Market landscape — the eight categories we straddle

The control surface spans eight product categories that the market currently sells **separately**. That fragmentation is the opportunity.

### 11.1 AI/LLM gateways
- **LiteLLM** — free, self-hosted, 100+ providers, OpenAI-compatible; the open-source default below ~$10K/mo model spend; struggles above ~500 RPS. *We already run it AND wrap it — our gateway layer adds keys, ledger, circuit breakers on top.*
- **Portkey** — managed, 250+ models, adds observability + **guardrails** + **prompt versioning** + **semantic caching**; priced by log volume, grows with usage.
- **Kong AI Gateway** — enterprise; **token rate limiting per consumer**, MCP/agent traffic governance; 228–859% faster than rivals in its own benchmark; realistic at $200K+/mo spend.
- **Market segmentation insight**: below $10K/mo model spend, nobody wants a vendor relationship — self-hosted free wins. **That's exactly our segment.** Features worth borrowing: guardrails, semantic caching, per-consumer token limits, prompt versioning (→ Catalog M).

### 11.2 LLM observability
- **Helicone** — proxy logging, <5ms overhead, instant cost tracking; free 100K req/mo, Pro $79/mo, Team $799/mo.
- **Langfuse** — open-source span tracing, hierarchical agent traces with tokens/cost/latency per step; cloud from $29/mo.
- **LangSmith** — LangChain-native; $39/user/mo.
- *Our gateway_calls ledger + /traces is proxy-logging-shaped already.* Gaps worth closing: request/response capture with redaction, cost-per-request in trace view, evals attached to traces (→ M3).

### 11.3 AI governance / EU AI Act compliance
- Market splits into: GRC automation (Vanta/Drata), enterprise AI governance systems-of-record (OneTrust, Credo AI), LLM observability, and **runtime control planes that enforce and prove human oversight**. We are the rare combination of system-of-record (discovery inventory + audit chain) AND runtime control plane (approval gates, risk tiers) — at self-hosted price.
- **Hard dates driving demand RIGHT NOW**: high-risk AI obligations broadly applicable **August 2026** (next month); AI-generated-content provider marking **December 2, 2026**. (→ M11, M12.)

### 11.4 AI FinOps
- **Amnic / Vantage / CloudZero / Finout** lead; enterprise-priced. Signature features: **cost per feature/customer/deployment** (unit economics), **plain-English cost queries via AI agents**, "20–50% documented savings" claims. LiteLLM is cited as the open-source budget-cap answer.
- *Our free-first routing IS a documented-savings machine — we just don't compute the number yet* (→ R2, M6, M7).

### 11.5 Incident management
- **incident.io** $15–25/user/mo; **PagerDuty** $21–41/user/mo **plus $699/mo for AIOps** (noise reduction) **plus $415/mo for AI-in-Slack**; **Rootly** $15K–60K/yr.
- **The killer fact: incumbents sell AI triage/remediation as four-figure add-ons. We ship detect→diagnose→fix→prove natively.** A 50-engineer team pays PagerDuty ~$38K/yr with AI; a solo operator pays us ~nothing. (→ pricing §12.)

### 11.6 Self-hosted ops panels (the business-model proof)
- **Coolify** — free self-hosted (Apache 2.0), Cloud $5/mo for 2 servers (+$3/server); **Dokploy** — free source-available, $4.50/server managed. Both thrive on the exact audience we target: solo devs/small teams fleeing Heroku/Render pricing.
- **This is the proven playbook for our segment**: genuinely-free self-hosted core → cheap flat per-server managed tier → no per-user pricing. Their install bar (one command → running panel) is the bar P0.5 must meet.

### 11.7 Agent gateways & agentic IAM (Gravitee — the architecture teacher)
- **Gravitee AI Agent Management** governs three traffic types through three proxies: **LLM Proxy** (model traffic: cost tracking, PII filtering, semantic caching, guardrails, token limits, per-agent/per-model access control), **MCP Proxy** (tool-execution traffic, MCP-semantics-aware, can front existing MCP servers), and **A2A Proxy** (agent-to-agent delegation — discovers each agent's declared skills and authorizes every handoff per skill). Plus **Agentic IAM** (every agent has an identity) and **end-to-end lineage**. Gravitee 4.11 added MCP analytics dashboards and AI-powered PII auto-redaction on MCP tool flows.
- **The lesson**: the market now distinguishes *AI gateway* (model traffic) from *agent gateway* (tool + delegation traffic), and sells governing all three as "one control point." Our suite already spans both sides conceptually (gateway = model traffic; builder/agents/discovery = agent side) — the unified story is validated at enterprise scale; we deliver it at solo-operator scale. Concrete borrowings → M19–M23.

### 11.8 LLM firewalls / runtime guards (Lakera, Prompt Security, Lasso, WitnessAI)
- Category splits: **runtime guards** blocking live traffic (Lakera Guard — most-deployed LLM firewall, sub-50ms, generous free tier, open-source **PINT** benchmark for injection detection), **GenAI lifecycle security** (Lasso — posture + runtime guardrails), **network-layer visibility** (WitnessAI — sees employee/agent LLM traffic including shadow use across SaaS).
- **Our position**: we own the gateway chokepoint, so adding a runtime guard is cheap for us and expensive for pure-observability rivals. Free-first strategy: local pattern engine first, optional Lakera free-tier connector second (→ M22). WitnessAI's network-layer shadow-LLM detection is the enterprise cousin of our host-level discovery — for self-hosted stacks, host-level wins (we see the process, not just the traffic).

### 11.9 Shadow AI / agent-sprawl security (our G4+ discovery, validated)
- **Nudge Security** and peers now sell "AI agent discovery" (finding agents built in Copilot Studio/Salesforce/n8n) as a headline enterprise feature. Traditional network/DLP tools miss shadow AI because it rides HTTPS to legitimate services — **discovery-at-the-source is the only reliable method, which is architecturally what our host-level scanner does.**
- Market stats: **71% of workers use unapproved AI tools**; breaches at high-shadow-AI orgs cost **+$670K** more; **48% of production AI agents run unmonitored**; only **7.2% of orgs have a named individual accountable for agent behavior**; 88% of agent deployers report incidents. Every one of these is a slide in our pitch and a detector we can ship (→ M9, M10).

## 12. The wedge & pricing intelligence

**Positioning statement:** *"Coolify for AI operations."* One self-hosted admin center — gateway, observability, FinOps, governance/compliance, incident command with closed-loop remediation, agent builder, universal discovery — for solo operators and small teams running AI stacks on 1–3 hosts. Zero-config, honest, near-zero model spend by design.

**The assembled-stack cost table (marketing asset — build it into /about and the pitch):**
| Capability | Market tool | Small-team price | Ours |
|---|---|---|---|
| Gateway + routing + budgets | Portkey | usage-priced, grows | included |
| LLM observability | Langfuse/Helicone | $29–79/mo | included |
| Incident mgmt | incident.io | $15/user/mo | included |
| AI triage/remediation | PagerDuty AIOps | **+$699/mo** | included, closed-loop |
| AI governance/inventory | OneTrust/Credo class | enterprise quote | included |
| Shadow-AI discovery | Nudge class | enterprise quote | included |
| FinOps unit economics | CloudZero class | enterprise quote | included |
| **Assembled** | 5–7 vendors | **$200–1,000+/mo + quotes** | **one install** |

**SKU price hypotheses (inputs to P6.3, validate with U2 usage data):**
- **Free** self-hosted core (the Coolify move — adoption engine, honest and complete, no crippleware).
- **Pro license ~$19–29/mo flat per install** (NOT per-user — per-user pricing is the incumbent tax our segment resents): unlocks multi-project, evidence packs, weekly exec reports, notification matrix, priority updates.
- **Managed cloud later ~$9–15/mo/server** (anchored just above Coolify's $5 because we do vastly more per server).
- **Module SKUs** (sell-in-parts, from the 44 plans' §7s): Incident Command / AI Gateway+FinOps / Governance+Evidence / Builder — priced individually near the single-competitor price so the bundle is obviously better.

## 13. Market timing — why now
1. **EU AI Act**: high-risk obligations land **August 2026**; content-marking **December 2026**. Small orgs need affordable readiness NOW; enterprise GRC quotes start five figures.
2. **Agent-ops deployment wave**: 2026 is named as the first big wave of **agent-based AIOps** — "specialized detection, triage, remediation, and governance agents coordinating under shared policy models." **That sentence describes our shipped architecture** (scanners → reasoner → playbooks/auto-apply → governance gates). We're not chasing this wave; we're evidence it works.
3. **Observability is the lowest-rated part of the AI stack** while 57% of orgs run agents in production — the pain is acknowledged, budgets exist, incumbents are enterprise-priced.

## 14. CATALOG M — market-borrowed features (each: source → goal → phase)

### Gateway & observability parity (from Portkey/Kong/Helicone/Langfuse)
- [ ] **M1. Guardrails v1** — prompt-injection + secret/PII pattern detection on gateway requests; detection-mode first (findings → insights), blocking-mode per-key opt-in later. *Portkey's headline feature.* → G4, security SKU. **Phase 5.**
- [ ] **M2. Semantic/response caching** on the gateway — hash-based first, embedding-similarity later; cache-hit savings surfaced on /cost. *Portkey/Kong.* → G6 + affordability story. **Phase 5.**
- [ ] **M3. Request/response capture with redaction** — per-key opt-in payload logging with PII redaction + retention policy; cost-per-request column in /traces. *Helicone's core.* → G3/G7. **Phase 4.**
- [ ] **M4. Per-consumer token rate limits** — quotas per gateway key (we already have `gateway_keys`); 429 with honest budget message; usage bars on /gateway. *Kong's headline.* → G2/G6. **Phase 3 (extends A4).**
- [ ] **M5. Prompt library lite** — version the editorial prompts (already on disk at prompts/small-model/) in the DB, link prompt-version → gateway calls → outcomes; diff view. *Portkey/LangSmith.* → G3, editorial quality. **Phase 5.**

### FinOps parity (from CloudZero/Amnic/Vantage)
- [ ] **M6. Unit economics** — cost per article published, per builder run, per agent, per product; trend lines. The affordability story as unit numbers: *"this article cost $0.0X to produce."* → R2 extension. **Phase 4.**
- [ ] **M7. Plain-English cost query** — "ask the ledger" box on /cost answering from gateway_calls + spend data via a free-tier model. *Amnic's AI-agent UX.* → G5/G7. **Phase 4.**
- [ ] **M8. Spend forecasting** — extend spend_anomalies with month-end projection + budget-breach-date prediction. → G4. **Phase 4.**

### Shadow-AI & accountability (from Nudge/market stats)
- [ ] **M9. Deeper discovery sources** — env-file API-key pattern scan (shadow keys), timers/cron making AI calls, MCP server detection, **AI SDK dependency scan in governed projects' package.json/requirements.txt** (discovery "at the source of creation," server-side). → G4+. **Phase 5.**
- [ ] **M10. Named accountability** — owner REQUIRED on asset registration; `unowned-critical-asset` detector; owner column everywhere. *Directly monetizes the "only 7.2% have named accountability" stat.* → G4. **Phase 3 (extends A6).**

### EU AI Act timeliness (hard external deadlines)
- [ ] **M11. AI Act readiness module** in /governance/risk — checklist mapped to the real August/December 2026 obligations, each item linked to live evidence (inventory, audit, oversight gates) or honest "not applicable/not configured." Framework-*aligned* language only. **Phase 5 (build INTO 5.1, elevated priority).**
- [ ] **M12. AI-content marking check for NewsBites** — content-health detector: AI-assisted articles carry the disclosure/marking the Act requires from Dec 2, 2026. *We are a media company; this is compliance for OUR OWN product first, feature second.* **Phase 4, before December.**

### Incident-tooling parity (from incident.io/PagerDuty)
- [ ] **M13. Status page subscribers** — extend U5 with notify-on-change (PagerDuty charges per 250 subscribers). **Phase 6.**
- [ ] **M14. On-call-lite** — quiet hours, severity-gated overrides, escalation delay for notifications; the solo-operator answer to on-call scheduling. → G6. **Phase 5 (extends 5.3).**
- [ ] **M15. Post-mortem timeline UX** — auto-build incident timeline from audit rows + jobs + passes (we have all the data); export into R4 evidence packs. *incident.io's beloved feature.* **Phase 4.**

### Agent-gateway & runtime-guard borrowings (from Gravitee/Lakera — added on operator request)
- [ ] **M19. Agentic IAM lite — per-agent identity + scoped keys**: every internal agent (autopipeline stages, builder passes, Mimule bot, sentinels, enrichment) gets its OWN gateway key with a model allowlist + budget; the ledger then attributes every call and cost to a named agent. *Gravitee's Agentic IAM at our scale.* Unlocks per-agent cost (feeds M6), per-agent kill-switch, and "which agent did this" forensics. → G4/G2. **Phase 3 (extends A4/M4) — high leverage, we already have `gateway_keys`.**
- [ ] **M20. MCP inventory & tool governance**: discovery learns to find configured MCP servers (in .claude.json, opencode/codex configs, running MCP processes) and lists each server + its declared tools as governed assets; unknown MCP server → `unregistered-ai-system` flag. MCP call visibility later if a proxy point exists. *Gravitee's MCP Proxy, discovery-first version.* → G4+. **Phase 5 (extends M9).**
- [ ] **M21. End-to-end lineage view**: one drawer that walks incident → agent identity → builder pass → gateway call(s) → model + prompt version → cost → outcome. All the data exists (audit, passes, ledger, traces); this is a JOIN + UX slice. *Gravitee's "end-to-end lineage" as a feature name buyers now search for.* → G7/G5. **Phase 4 (pairs with M15 timeline).**
- [ ] **M22. Guardrails strategy (refines M1)**: ship a **local pattern engine** first (prompt-injection heuristics, secret/PII regexes — free, offline, honest about coverage); validate rules against Lakera's open-source **PINT benchmark**; offer optional **Lakera Guard free-tier connector** (sub-50ms) as a premium connector for buyers who want a maintained attack corpus. Never pretend local rules equal a maintained firewall — honest tiering. → G3/G4. **Phase 5.**
- [ ] **M23. PII auto-redaction on stored payloads (refines M3)**: redact detected PII BEFORE persisting request/response captures; per-key policy (off / redact / block). *Gravitee 4.11's headline, our storage-side version.* → G3, compliance SKU. **Phase 4 (ships with M3).**

### Self-hosted panel table stakes (from Coolify/Dokploy)
- [ ] **M16. One-command install** — `curl | bash` to running panel; Coolify's bar is the benchmark. **Phase 0.5 (explicit acceptance).**
- [ ] **M17. Backup/restore from UI** — surface mimule-backup; one-click restore-preview + restore (high risk tier, approval-gated). **Phase 3 (extends A3).**
- [ ] **M18. Update-from-UI** — git pull + migrate + restart with automatic rollback on failed health check; version + changelog surfaced (U4). **Phase 6.**

## 15. Market-validation stats (pitch/demo ammunition, sourced §23)
- 57% of orgs run AI agents in production; observability is the **lowest-rated part of their stack**.
- 48% of production AI agents are effectively unmonitored; 88% of agent deployers report incidents; 1 in 8 breaches is agent-linked.
- 71% of workers use unapproved AI tools; shadow-AI-heavy orgs pay **+$670K per breach**.
- Only **7.2%** of orgs have a named individual accountable for AI agent behavior.
- Gartner: a typical F500 will manage **150,000+ agents by 2028** (vs <15 in 2025) — the sprawl curve every small org rides too.
- PagerDuty prices AI noise-reduction at **$699/mo** — our closed loop is native.
- EU AI Act high-risk obligations: **August 2026**; content marking: **December 2, 2026**.

# PART III — COMPLETENESS LAYER (added 2026-07-03, operator directive: "the All-in-one AI tool")

> Directive: templates + preset actions/policies/rules; skippable animated tutorials; documentation section; community suggestion + voting platform; connect to anything, do anything — plan, develop, create, manage, healthcheck, secure, improve continuously, suggest, audit, capture, log everything; user-friendly, animated, stylized; important information at first glance, details captured/stored/accessible beautifully.

## 17. The all-in-one lifecycle wheel (positioning + gap check)

The product's story is a closed lifecycle. Most stages already have a live surface — the wheel makes the story explicit and exposes the two soft spots:

| Lifecycle stage | Surface today | Status |
|---|---|---|
| **Plan** | /brainstorm (idea → plan), builder plan files, plan-progress | ✅ live |
| **Develop** | /builder multi-pass engine, agents (Codex/Claude/Gemini/OpenCode) | ✅ live |
| **Create** | Builder provision/scaffold + preview tunnels (the "studio idea→app" product seed) | 🟡 exists, underexposed — elevate in P8 as **Studio flow**: brainstorm → provision → build → preview → deploy as ONE guided path |
| **Manage** | /workflows, /jobs, /projects, /settings, tenants | ✅ live |
| **Healthcheck** | Product Health Sentinel, /doctor, /infra, model health, vast watchdog | ✅ live — flagship |
| **Secure** | /security, discovery/G4+, audit chain, RBAC, secrets vault, guardrails (M1/M22 planned) | 🟡 guardrails pending |
| **Improve continuously** | Remediation loop, auto-apply, escalate-to-workflow (P2), recurrence detection | ✅ shipped this week |
| **Suggest** | Insights inbox, AI enrichment, advisor, model-swap recommendations | ✅ live |
| **Audit** | Tamper-evident audit chain, evidence packs (R4), approvals | ✅ live |
| **Capture & log everything** | gateway ledger, traces, action_audit, usage events (U1), lineage view (M21) | 🟡 lineage + payload capture (M3/M23) pending |

**The wheel becomes UI**: the /about page (and pitch) renders this as an animated ring — each segment deep-links to its surface and shows its live health dot. One glance = the whole product.

## 18. CATALOG T — Templates & presets (ship opinions, not blank pages)

Everything below is data (JSON/YAML in DB + seed files), import/exportable, and distributable through the existing **marketplace** (extend from skill bundles to template bundles — signed, versioned). → G5/G8, packaging fuel for P6 SKUs.

- [ ] **T1. Policy packs** — preset governance policy documents + gates: *Solo Operator* (auto-apply generous, single approver), *Small Team* (4-eyes on high risk), *EU-Regulated* (approval on everything model-facing, evidence retention long, M11 checklist pre-enabled), *Media Pipeline* (content-marking checks on, editorial budgets). Applied at tenant creation or from /governance with diff preview. **Phase 8.**
- [ ] **T2. Detector rule presets + thresholds UI** — every scanner's thresholds (idle days, budget multipliers, SLA windows, recurrence N) become a tunable rules engine with presets (*Strict/Balanced/Quiet*); per-tenant overrides; changes audited. Kills the "edit env var over SSH" tuning path. → G2. **Phase 8 (backend exists as env vars — surface them).**
- [ ] **T3. Runbook templates** — preset action bundles for A6: *Service down* (restart → verify → notify), *Disk pressure* (prune → verify → report), *Provider outage* (reprobe → chain rebuild preview → apply → notify), *Deploy+verify*, *Backup now + freshness check*. Ship 6–10, community-shareable via marketplace. **Phase 3 (with A6).**
- [ ] **T4. Builder workflow templates** — one-click workflow presets: *Improve this repo*, *Add tests to PATH*, *Security audit pass*, *Dependency upgrade + verify*, *Visual/UX audit*, *Docs pass*. Each = pre-filled mode/plan skeleton/validation gates. The continuous-improvement engine as a template gallery. **Phase 8 (Studio flow).**
- [ ] **T5. Report templates** — R-catalog reports become templates with per-tenant variants (sections on/off, branding, recipients); compliance pack variants (AI-Act / SOC2-aligned / internal). **Phase 4 (with R1/R4).**
- [ ] **T6. Dashboard persona presets** — home widget layouts: *Operator* (incidents/jobs/health), *CFO* (cost/savings/unit economics), *Security* (discovery/guardrails/audit), *Editorial* (pipeline/content health). Widget hide/reorder already exists — presets are one JSON each. **Phase 7.**
- [ ] **T7. Tenant bootstrap profiles** — new tenant/stack wizard picks a profile = policy pack + detector preset + persona dashboard + notification matrix + tour. Time-to-value: opinionated defaults over blank state. **Phase 8 (with U3 wizard).**
- [ ] **T8. Prompt templates** — M5 prompt library ships with preset editorial/ops prompts as starting points. **Phase 5 (with M5).**

## 19. CATALOG X — Experience layer (animated, stylized, glanceable)

**Design doctrine — "Glance → Drill → Archive"** (write into `.impeccable.md` as the standing standard):
1. **Glance**: every page opens with a scoreband — stat tiles, sparklines, trend arrows, severity chips. The one decision the page exists for is answerable in 3 seconds.
2. **Drill**: below the band, the standard table kit (sort/filter/paginate/expand — already shipped) and drawers where **AI summary always precedes raw data** (G7).
3. **Archive**: nothing is ever lost — every event/action/payload lands in queryable storage, reachable via global search, /data-explorer, and exports. Beautiful ≠ ephemeral.

- [ ] **X1. Chart kit** — one self-contained SVG chart library (no CDN — CSP): line/area/bar/stacked/donut/heatmap/gauge + the existing sparklines, consistent palette, dark/light aware, animated draw-in, reduced-motion respected. Replace ad-hoc chart code page by page. → G8. **Phase 7.**
- [ ] **X2. Motion standard** — skeleton loaders everywhere (no spinner-only states), 150–250ms micro-transitions, count-up stat numbers, live-data pulse dots, drawer slide-ins; `prefers-reduced-motion` honored globally. Completes the parked `/impeccable` pass. **Phase 7.**
- [ ] **X3. Animated skippable tours** — first-login product tour (per user per tenant): spotlight steps with progress, animated pointers, "Skip" + "Remind later"; per-page mini-tours on first visit; "What's new" tour after updates (feeds from U4 changelog). All bundled in-app (driver.js-style engine, self-contained). State per user; relaunchable from Help. → operator directive, G5. **Phase 7.**
- [ ] **X4. Command palette (Cmd+K)** — jump to any page/asset/incident, run any descriptor action with inline confirm, search docs. Admin-center table stakes; huge daily-driver win. **Phase 7.**
- [ ] **X5. Global search** — one index across incidents, insights, assets, audit, jobs, workflows, docs, articles; keyboard-first; results grouped by type with severity chips. **Phase 7.**
- [ ] **X6. In-app notification center** — bell + panel unifying critical findings, job completions, report arrivals; read/unread; deep links; mirrors (never replaces) external notifications. **Phase 7.**
- [ ] **X7. Zero-empty-page rule** — every empty state teaches: what this page shows, how to connect it, one primary CTA (G9-honest). Audit all 44 routes against it. **Phase 7 (checklist pass).**
- [ ] **X8. White-label theming** — tenant logo, accent color, product name override; login page branding. Sellability + agency resale angle. **Phase 8.**
- [ ] **X9. In-product documentation (/docs)** — markdown docs shipped in-repo, rendered in-app, full-text searchable (feeds X5), versioned with the app; auto-generated API reference from the router's route table; per-module guides + runbook handbook; every page header gets a "?" that deep-links to its doc section. → operator directive. **Phase 7 (structure) + continuous.**

## 20. CATALOG C — Connect to anything (integration fabric)

- [ ] **C1. Control Surface MCP server** — expose the product's own capabilities (read health/insights/incidents, run allowlisted descriptor actions with the same risk gates) as an MCP server so ANY agent — Claude Code, OpenCode, a customer's agent — can operate the admin center conversationally. *The meta-play: the tool that governs agents is itself agent-operable. Nobody in the researched market ships this self-hosted.* → G2, differentiator. **Phase 8, high priority.**
- [ ] **C2. Scoped API tokens** — first-party REST API keys (reuse gateway_keys pattern) with per-scope grants (read:health, write:actions…), rate limits, last-used tracking; the documented API (X9) becomes the integration contract. **Phase 8.**
- [ ] **C3. Inbound webhooks** — generic receiver: external systems (CI, cron, customer apps) POST events → become insights/incidents/jobs via mapping rules (template-able, T-catalog). "Connect anything" inward. **Phase 8.**
- [ ] **C4. Outbound webhook/Slack/Discord/email adapters** — extends 5.3 notification matrix to the full set; per-event-type routing; delivery log. **Phase 5.3 (already planned, scope widened).**
- [ ] **C5. Prometheus /metrics endpoint** — health score, incident counts, gateway latency/cost counters in Prometheus format; meets Grafana-shop buyers where they live. **Phase 8.**
- [ ] **C6. Universal export** — CSV/JSON on every table (one shared control), scheduled exports to a path/webhook; evidence packs (R4) are the signed flavor. **Phase 4.**
- [ ] **C7. Config importers** — LiteLLM config (already read), OpenAI-compatible provider lists, existing .env key detection (M9) → one-click adopt into governed inventory. First-run "bring your stack" moment. **Phase 8 (with T7 wizard).**

## 21. CATALOG Y — Community & feedback platform

- [ ] **Y1. Native suggestion board module** — in-product board: post idea → vote → status (*proposed / planned / building / shipped / declined*) → linked changelog entry on ship (U4). Per-install private board for a tenant's own users. Lightweight (one table + one page), reuses table kit + auth. → operator directive. **Phase 8.**
- [ ] **Y2. Central public board** — feedback.techinsiderbytes.com runs the SAME module as a public tenant (dogfoods multitenancy + white-label X8); per-install boards can opt-in-sync anonymized suggestions upstream. Roadmap page = board filtered to planned/building. **Phase 8.**
- [ ] **Y3. In-app feedback widget** — every page footer: "Suggest an improvement" → pre-fills page context → lands on the board; closes the loop with the operator's own team too (agents can file suggestions via C1/C2). **Phase 8.**
- [ ] **Y4. Template/runbook sharing** — marketplace accepts community template bundles (T-catalog artifacts) with signing + review flow; voting (Y1) doubles as template popularity signal. **Phase 8 (after T1–T4 exist).**

## 22. New phases + matrix extension

### PHASE 7 — Experience & design system (Catalog X)
Order: X1 chart kit → X2 motion → X7 empty-state audit → X3 tours → X4 palette → X5 search → X6 notification center → X9 docs skeleton → T6 persona presets.
- **EXIT EVIDENCE**: multi-viewport suite extended with tour-dismiss + palette + skeleton assertions; a new-user session recording shows glance-value in <10s per page; docs searchable in-app; reduced-motion verified.

### PHASE 8 — Platform completeness (Catalogs T/C/Y + Studio)
Order: T3 runbook templates (early, pairs with P3) → T2 rules UI → T1 policy packs → T7 bootstrap profiles + C7 importers → C1 MCP server → C2 API tokens → C3 webhooks → C5 metrics → Y1–Y3 community → X8 white-label → T4 Studio flow (brainstorm→provision→build→preview→deploy as one guided path) → Y4 template sharing.
- **EXIT EVIDENCE**: a new tenant reaches a governed, opinionated, connected stack from the wizard alone (no SSH, no docs detour); an external agent operates the surface via MCP with audit rows to prove it; a suggestion travels proposed→shipped→changelog visibly.

### Goals-matrix extension
| Phase | G-goals | Business objective |
|---|---|---|
| P7 experience | G5, G8, G1 | Time-to-value, demo quality, retention — the "beautiful + glanceable" directive |
| P8 platform | G2, G9, G8 | "Connect anything, do anything"; community moat; Studio = 4th product surfaced |

**Sequencing note**: P7 slots after P2 in practice — the demo (P1) benefits from X1/X2 basics, so pull chart-kit + skeletons forward into P1 polish if demo recording feels flat. P8 rides after P6 packaging except T3 (ships with P3 runbooks). The catalogs are the backlog of record; phases are the spine; nothing ships without its evidence gate.

## 23. Sources (researched 2026-07-03)
- Gateways: [Particula — LiteLLM vs Portkey vs Kong](https://particula.tech/blog/ai-gateway-decision-litellm-portkey-kong-ai-gateway) · [Kong benchmark](https://konghq.com/blog/engineering/ai-gateway-benchmark-kong-ai-gateway-portkey-litellm) · [TrueFoundry landscape](https://www.truefoundry.com/blog/a-definitive-guide-to-ai-gateways-in-2026-competitive-landscape-comparison) · [Dev.to top-5](https://dev.to/varshithvhegde/top-5-llm-gateways-in-2026-a-deep-dive-comparison-for-production-teams-34d2)
- Observability: [Particula — Helicone vs Langfuse vs LangSmith](https://particula.tech/blog/helicone-vs-langfuse-vs-langsmith-llm-observability) · [Firecrawl best-of](https://www.firecrawl.dev/blog/best-llm-observability-tools) · [BuildMVPFast stack](https://www.buildmvpfast.com/blog/llm-observability-stack-langfuse-helicone-portkey-2026)
- Governance/AI Act: [KLA — categories compared](https://kla.digital/blog/best-eu-ai-act-compliance-software-2026) · [EU digital strategy](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) · [Compyl 2026 guide](https://compyl.com/guides/eu-ai-act-compliance-guide-2026/) · [WitnessAI checklist](https://witness.ai/blog/eu-ai-act-compliance-checklist-2026/)
- FinOps: [Amnic FinOps tools](https://amnic.com/blogs/finops-tools-for-ai-cost-management) · [Finout best-of](https://www.finout.io/blog/best-finops-tools-for-managing-ai-costs-in-2026) · [Vantage](https://www.vantage.sh/blog/best-finops-tools-for-ai) · [FinOps Foundation](https://www.finops.org/wg/finops-for-ai-overview/)
- Incidents: [incident.io pricing comparison](https://incident.io/blog/incident-management-pricing-comparison-2026) · [Pagerly PagerDuty breakdown](https://www.pagerly.io/blog/pagerduty-pricing-license-cost-breakdown) · [Vendr Rootly](https://www.vendr.com/marketplace/rootly)
- Panels: [Contabo Coolify vs Dokploy](https://contabo.com/blog/blog-coolify-vs-dokploy-comparison/) · [temps.sh Coolify pricing](https://temps.sh/blog/coolify-pricing-explained-2026) · [ServerCompass PaaS 2026](https://servercompass.app/blog/best-self-hosted-paas-platforms-2026)
- Agent ops/shadow AI: [Gupta — 2026 market reality](https://guptadeepak.com/ai-agent-observability-evaluation-governance-the-2026-market-reality-check/) · [Microsoft Security blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/80-of-fortune-500-use-active-ai-agents-observability-governance-and-security-shape-the-new-frontier/) · [Gravitee state of agent security](https://www.gravitee.io/state-of-ai-agent-security) · [Nudge shadow-AI guide](https://www.nudgesecurity.com/saas-security-glossary/shadow-ai) · [Reco detection tools](https://www.reco.ai/compare/shadow-ai-detection-tools) · [APM Digest 2026 predictions](https://www.apmdigest.com/2026-observability-predictions-1) · [Neuronex agent sprawl](https://neuronex-automation.com/blog/why-ai-agent-sprawl-is-becoming-the-next-big-enterprise-problem)
- Agent gateways: [Gravitee AI Gateway](https://www.gravitee.io/platform/ai-gateway) · [Gravitee Agent Mesh](https://www.gravitee.io/platform/agent-mesh) · [Gravitee 4.10 — one control point](https://www.gravitee.io/blog/gravitee-4.10-one-control-point-to-secure-govern-ai-agents-mcp-and-llms) · [AI gateway vs agent gateway](https://www.gravitee.io/blog/ai-gateway-and-agent-gateway-introduction) · [Zuplo comparison incl. Gravitee/Tyk/Apigee](https://zuplo.com/learning-center/ai-gateway-comparison-mcp-a2a-agent-governance)
- LLM firewalls: [Gupta — top-5 AI threat detection (Lakera vs Prompt Security vs WitnessAI vs AIM vs Protect AI)](https://guptadeepak.com/tools/top-5-ai-threat-detection-tools-2026/) · [Lakera Guard](https://www.lakera.ai/lakera-guard) · [Lakera — LLM security tools overview](https://www.lakera.ai/blog/llm-security-tools) · [General Analysis platform guide](https://generalanalysis.com/guides/best-ai-security-platforms) · [AppSec Santa AI security tools](https://appsecsanta.com/ai-security-tools)
