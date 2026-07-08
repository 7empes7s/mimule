# Control Surface V5 — Orchestration State (resumable)

**Mandate (user, 2026-06-28; reinforced 2026-06-29 20:xx UTC):** drive ALL V5 phases autonomously until done.
**FULL AUTO — do not pause between phases.** If a phase verifies GREEN → commit → restart → live-verify →
**immediately dispatch the next phase** (no waiting for approval). If a phase is NOT green → **fix it** (re-dispatch
the coder with the specific failures, or fix as last resort) — never commit red, never restart on a broken tree.
**Top priorities (user, verbatim): QUALITY and that the products KEEP RUNNING.** ⇒ independently verify every slice
(never trust a coder's "done"); restart only at a clean green idle checkpoint; if a restart fails health-check, roll
back to the last good commit and surface it. Only wake the user for a true blocker, an irreversible decision that's
theirs, or the proactive "phase shipped" pings.
**Rely on the free CLI coders (codex primary, then gemini, then opencode) for BUILDING; keep Claude (Sonnet builder)
as LAST RESORT.** Account for each CLI's ~5h rolling usage window — scope sessions per-phase (no 5h marathons),
rotate coders to spread load, checkpoint after every phase so the loop is resumable if a session dies mid-window.
**Per-phase protocol:** dispatch build to a CLI coder → coder edits in validated slices → Opus runs `bun run
typecheck` + `bun run build` + tests green → **commit** to `master` (operator-authorized) → **restart
`control-surface.service` + verify** (user pre-authorized per phase) → ensure docs updated (BUILD_LOG.md, V5 plan
ticks, vault, master plan) → write next `_NEXT.md` → dispatch next coder → re-arm watcher.

**Coders (build) — order of preference, Claude last:**
- `codex` — workhorse: `bash launch-build.sh codex` (memory-light ~64MB, gpt-5.5 high; edits /opt directly). Primary.
- `gemini` — `bash launch-build.sh gemini` (memory-heavy; `--include-directories` grants /opt write). Use to spread 5h load.
- `opencode` — `bash launch-build.sh opencode` (free models; minimax→nemotron chain). Lighter tasks / load-spread.
- `claude` (Sonnet) — **LAST RESORT only** if a phase fails on all three: tmux `csbuild` via `launch-phase.sh`
  (IS_SANDBOX=1). Build rules for all coders: `_BUILD_RULES.md`; task spec: `_NEXT.md`.
**5h-window accounting:** if a coder returns a quota/usage-limit/rate-limit error, note the time here, rotate to the
next coder immediately; the exhausted one is usable again after ~5h. Rotate the primary across phases anyway.
**Dispatch (background):** `nohup bash launch-build.sh <coder> > logs/BUILD-P<n>.log 2>&1 &`. Do NOT use tmux
send-keys. Each session is fresh context (reads _BUILD_RULES + _NEXT).
**Watcher:** `watch-build.sh` (wakes orchestrator when the coder proc exits or on heartbeat).
**Verify after restart:** service active + no journal errors; local `http://127.0.0.1:3000/` 200; public
`https://control.techinsiderbytes.com/api/public-status` 200; + phase-specific functional checks.
**Guardrails:** never touch `/opt/newsbites`; no secrets committed; no force-push; logical model names only;
restart only at a clean green idle checkpoint.

## Phase sequence (from DASHBOARD_V5_PLAN "Sequencing & priority")
| # | Phase(s) | Coder | Status |
|---|---|---|---|
| 1 | **Phase 7** — kill mock data (cost/settings/gemini) | sonnet | ✅ DONE · `f324b72` · live |
| 2 | **Phase 1** — fail-closed auth, durable jobs (+cancel/retry), doctor scan/requeue | sonnet | ✅ DONE · `352878b` · live |
| 3 | **Phase 9 + 3** — Admin Center IA, `/admin`, health score, home cluster, ⌘K | sonnet | ✅ DONE · `751f362` · live |
| 4 | **Phase 4** — every manual action via GUI (model-quality, infra buttons, timers, cost-cap, incident ack) | sonnet→codex | ✅ DONE · `674bdf9` · live |

> **2026-06-29 09:48 UTC — Phase 4 resume after Sonnet hit its limit:** user said "build it now using sonnet."
> Sonnet (tmux csbuild) built ALL 5 Phase 4 slices (501 insertions / 11 files: ModelsPage block/unblock/probation/
> cooldown, InfraPage timer-run-now + service/vast/backup/litellm buttons via useAction, IncidentsPage ack/mitigate,
> CostPage GlobalCapEditor → `mutate-policy:budget:global:set-cap`, executor handlers in execute.ts/actions.ts) but
> hit the **Claude usage limit mid-edit** (stuck on "stop and wait for limit to reset" while refining the execute.ts
> mitigate handler). Killed the wedged session (work preserved on disk). Operator pre-flight: **typecheck CLEAN,
> build OK**, but `bun test` exposed a **regression**: the 4 new `ensureColumn(db,"reasoner_incidents",…)` calls were
> placed at dashboard.ts ~L572, BEFORE the `CREATE TABLE reasoner_incidents` at ~L771 → `no such table` → DB init
> fails → 5 test fails (vs the 1 known pre-existing aggregation fail). **Codex window reset (was 02:44 UTC) → codex
> now finishing Phase 4** (`launch-build.sh codex`, PID-tracked, watch-build.sh): move the 4 ensureColumns next to the
> existing tenant_id one (~L1160, post-CREATE), re-validate (typecheck/build/test/smoke), write BUILD_LOG + plan ticks.
> Then operator: independent verify → commit → restart → live-verify → advance to Phase 4a.

> **5h-window log (codex AND claude both limited):**
> - `codex` EXHAUSTED 2026-06-28 22:20 UTC (resets **Jun 29 02:44 UTC**) — consumed by research+augment runs.
> - `claude` ALSO has a 5h window, and the **Opus orchestrator itself runs on it** → using the Sonnet builder would
>   risk taking down the orchestrator. **Policy: Sonnet builder is OFF (not just last-resort); minimize orchestrator
>   polling** (wake on completion, not heartbeat). Prefer free CLIs that don't touch the claude window.
> - `gemini -p` is **single-shot** (exits after one tool call) — NOT a viable autonomous builder. Skip for builds.
> - **Phase 4 → `opencode` (deepseek-v4-flash-free)**, running, nohup'd (survives orchestrator window roll).
> - If opencode fails: do NOT burn claude — wait until ~02:44 UTC and resume on **codex**. Build is
>   checkpointed (BUILD_LOG + commits) so a fresh claude session can resume from here.
> - **2026-06-28 22:56 UTC: opencode FAILED twice** (deepseek + nemotron, both stalled — 0.7% CPU, 3-line frozen
>   log, no tool calls, even with context staged inside the sandbox via `.csbuild-context/`; opencode also auto-
>   rejects reading /root). gemini -p single-shot. So **NO viable free autonomous builder right now.** Decision:
>   go DORMANT (background waiter until 02:50 UTC) → resume **Phase 4 on codex** when its window resets. Sonnet
>   builder stays OFF. **To resume:** tree is clean at `751f362`; `_NEXT.md` = Phase 4 spec; dispatch
>   `nohup bash launch-build.sh codex > logs/BUILD-P4.codex.log 2>&1 &`, then watch-build.sh codex.
| 5 | **Phase 4a** — Universal AI Discovery & Inventory (G9; `server/discovery/*`, `discovered_assets`, Register flow) | sonnet | ✅ DONE · `30bba09` · live |

> **2026-06-29 ~10:30 UTC — Phase 4a + finish-in-flight-builder (user: "finish everything together").**
> After committing Phase 4 (674bdf9) I found a LARGE uncommitted tree (10 mod + 5 untracked, written 10:08–10:22)
> from an interrupted Sonnet builder pass — it does NOT typecheck (`builder.ts:1273` fileWriteProbe union widening)
> and entangles TWO workstreams: (a) builder model-quality telemetry + `/api/builder/runs/:id/repair-baseline` +
> validation-profile + plan-sanity + BuilderPage (~1220 lines, coherent, 1-line type fix); (b) Phase 4a discovery
> (server/discovery/reconcile.ts probes, scanners/discovery.ts finding-mapper, discovered_assets table, scheduler
> wiring) — but MISSING the Register/Ignore/Rescan API, AI Inventory GUI, and system.ts de-hardcode.
> **Investigation (user said "not sure"):** NO concurrent/recurring builder. All autonomous drivers
> (mimule-jobd/orchestrator/overseer/project-improve) INACTIVE since Jun 10; only active CS timer is the read-only
> Product-Health Sentinel; only one `claude` proc (this orchestrator, pts/0); other login is an 18-day idle shell
> (pts/3); mystery files static ~10 min → the pass is dead, nothing will relaunch it. Safe to take over.
> **Recovery snapshot** saved (scratchpad/inflight-snapshot-1032: tracked.patch + untracked.tar.gz) so nothing is lost.
> **Dispatched codex** (`launch-build.sh codex`, PID-tracked, watch-build.sh) with `_NEXT.md` = 5 ordered slices:
> (1) fix builder compile + builder tests; (2) de-hardcode system.ts (seed-hints ∪ discovery); (3) Register-from-
> discovery API (list/register/ignore/rescan, audited+fail-closed); (4) AI Inventory GUI; (5) validate-all + docs.
> Then operator: independent verify → commit COMBINED → restart → live-verify → advance.
> **10:38 UTC update:** codex hit its usage limit IMMEDIATELY on dispatch (did 0 work; resets ~14:52 UTC). gemini
> single-shot, opencode stalls. All free coders exhausted/non-viable → **last resort reached.** Asked the user;
> user chose **spawn the Sonnet builder** (over wait-for-codex / Opus-direct). Launched `tmux csbuild` via
> launch-phase.sh (reads _STANDING_RULES + _NEXT = the Phase 4a+finish spec). Builder ALIVE and working (no limit
> this launch). Watcher: watch-idle.sh (b8xzt5bb8). Conserving the shared Claude window — waking on watcher, not polling.
| 6 | **Phase 12 + 5** — finish detector catalog; budgeting GUI + discovery ring-buffer | codex | ✅ DONE · `4348acb` (+ builder safety `cb346ea`) · live |

> **2026-06-29 12:35 UTC — Phase 12+5 prepped while codex window is down (resets ~14:52 UTC).** Tree clean at
> `30bba09`; service active, local+public 200; NO in-flight coder (only the persistent `opencode serve` :4096 and
> this orchestrator). gemini `-p` single-shot, opencode stalls → **codex is the only viable autonomous coder**; its
> window resets ~14:52 UTC. Used the wait for orchestrator GROUNDING (cheap, no Sonnet build) and wrote `_NEXT.md`
> = a sliced, committable Phase 12+5 spec. **Key delta finding:** Phase 5's ingestion is ALREADY done —
> `server/db/ingestor.ts` (wired `index.ts:185`) + `sampler.ts` already populate `metric_samples` with disk/mem/
> restart-storm/doctor-log/backup-freshness/cost-burn/queue/vast buckets; `gateway_calls`+`spend_anomalies` back
> `/cost` (Phase 7 removed mocks); `governance_budgets` already supports `project` scope. So the REAL work is
> (12) surfacing computed signals as proper FINDINGS + new edge/governance detectors, and (5) per-project budgeting
> GUI + model-discovery ring-buffer. Spec slices: S1 ops findings (backup/doctor-log/failed-timer/stuck-cooldown/
> approvals-aging), S2 edge.ts (site/cert/tunnel/dns/vast-balance), S3 governance/security/compliance/suspicious/
> SLA/stale-flag(no-op til P15), S4 per-project budget GUI + discovery ring-buffer, S5 validate+doc. Each slice
> independently committable. **To dispatch at reset:** `nohup bash launch-build.sh codex > logs/BUILD-P12.codex.log
> 2>&1 &`, then watch-build.sh codex. Orchestrator scheduled a wake-up for ~14:55 UTC; conserving the Claude window.
>
> **2026-06-29 20:16 UTC — DISPATCHED on codex (both windows long-since reset; codex window fresh, `CODEX_OK`).**
> After the 12:45 UTC Sonnet abort (shared Claude window was at 96%, resets 14:40 UTC) I held. Resumed now: tree
> still clean at `30bba09`, no in-flight coder. Launched `nohup bash launch-build.sh codex > logs/BUILD-P12.codex.log
> 2>&1 &` → codex v0.142.0, gpt-5.5 high, danger-full-access, pid 1316831, actively reading the codebase + plans.
> Watcher `watch-p12.sh` (bg bzjnbe7ys) blocks until the codex proc exits, then re-invokes the orchestrator to
> verify → commit → restart → live-verify → advance. Conserving the Claude window (wake-on-exit, no polling).
| 7 | **Phase 8 + 11** — unify reasoning (insights/reasoner/incidents); trustable autonomy (policy editor, guardrails) | codex | ✅ DONE · `86b8f8b` + crash-fix `dab4878` · live (NRestarts=0) |

> **2026-06-30 ~02:25 UTC — Phase 8+11 SHIPPED after TWO incidents; both handled, service kept running.**
> Codex built P8+11 (01:18→01:36, 250k tok) → `86b8f8b`. Operator verify passed, but **first restart CRASH-LOOPED**
> on `UNIQUE(insights.tenant_id, source_key)`: build scanner keyed by run/failure-class sourceKey yet derived ids
> per-diagnosis → multiple diagnoses/run collide. **Rolled back to `cb346ea` in ~1 min (no user outage)**, fixed
> forward (deterministic sourceKey-ids + in-scan dedup + self-healing `upsertInsight`), verified against a COPY of
> the REAL prod DB, re-shipped `dab4878` (restart clean, NRestarts=0, 200/200/200, live scan = 3 deduped
> `build:failure:*`, registry 401/200). **Incident 2:** a separate tmux V4-scheduler BUILDER loop was concurrently
> churning the repo (11 codex children, **load 71**, entangled with my work). Per operator ("Stop V4 loop, ship V5"):
> scoped-killed its codex children (NO broad pkill), confirmed no respawn (no cron/at/timer), **preserved all its work
> on branch `v4-builder-wip-20260630` (`0b6c764`)**, reset master clean, re-applied the fix, shipped. Load recovered.
> **CAVEAT:** some `/root/DASHBOARD_V5_PLAN.md` "[DONE 2026-06-30]" ticks (minAiConfidenceForAutoApply, subscriptions
> module) are the V4 builder's work on `0b6c764`, NOT on master — reconcile that branch before trusting them.

> **2026-06-29 ~21:00 UTC — Phase 12+5 SHIPPED & LIVE; advancing to Phase 8+11 (full-auto).** Codex built P12+5
> (20:16→20:52, 337k tok); operator independently verified (typecheck/build clean, touched 82/0, **zero regressions**
> via baseline A-B stash proof, executor 401 fail-closed live), committed `4348acb` (P12+5) + `cb346ea` (builder
> pause-on-repeated-validation-failure — coherent unplanned safety feature codex added; committed separately),
> restarted, live-verified (local+public 200, no journal errors). Docs done (BUILD_LOG +operator correction re: the
> "pre-existing builder files" claim being false, V5 plan ticks by codex, vault, master plan). Per the full-auto
> mandate: NOT pausing — staging `_NEXT.md` = Phase 8+11 spec and dispatching codex (rotate stays codex: gemini
> single-shot, opencode stalls; codex window healthy, resets independently of the shared Claude window).
>
> **2026-06-29 21:13 UTC — Phase 12+5 verified LIVE; Phase 8+11 spec staged; codex EXHAUSTED → waiting for reset.**
> Live scan confirmed the new detectors run in production: `POST /api/insights/scan` (token) → 200 with
> `opsFindings:4, discoveryFindings:75, edgeFindings:2, governanceFindings:24`, no errors (governance SLA-breach
> fires on aged seed incidents — harmless, cleaned up by Phase 8 inbox unification). `_NEXT.md` rewritten = Phase 8+11
> spec (6 committable slices: S1 reasoner→domain:build insights, S2 /incidents as inbox view, S3 merged playbook
> registry read-model, S4 auto-apply policy editor GUI persisted+audited, S5 blast-radius guardrails+dry-run+revert+
> approvals, S6 validate+doc). **codex hit its usage limit on the post-P12 probe — resets ~2026-06-30 01:17 UTC**
> (the 337k-tok P12 run consumed it). No other viable autonomous coder (gemini single-shot, opencode stalls); Sonnet
> builder stays OFF (shared Claude window — must not risk the orchestrator). **Decision: go dormant; background waiter
> `wait-codex-p8.sh` (targets 01:25 UTC) re-invokes the orchestrator at reset to dispatch Phase 8+11 on codex via
> `nohup bash launch-build.sh codex > logs/BUILD-P8.codex.log 2>&1 &` + re-arm watch-p12-style watcher.** Tree clean at
> `cb346ea`; loop fully resumable.
>
> **2026-06-29 23:46 UTC — switched to a self-re-arming CHUNKED waiter (long waiters get reaped).** The 3.5h
> `wait-codex-p8.sh` (bzorappuf) was killed, as was the prior session's long waiter — multi-hour background procs get
> culled here, but the 35-min P12 watcher (bzjnbe7ys) completed fine. So `wait-chunk.sh` sleeps ≤45min then EXITS to
> re-invoke the orchestrator, which re-arms another chunk until codex resets (~01:17 UTC) then dispatches Phase 8+11.
> (send_later/create_trigger unavailable — no session_id in this context.) **MANUAL RESUME if all waiters die:** when
> `timeout 60 codex exec --model gpt-5.5 "Reply with exactly: CODEX_OK"` returns CODEX_OK, run
> `cd /root/control-surface-plans && nohup bash launch-build.sh codex > logs/BUILD-P8.codex.log 2>&1 &`, then arm a
> watcher (block on `pgrep -f 'codex exec .* -C /opt/opencode-control-surface'`, run_in_background) and verify→commit→
> restart→advance on exit. Tree clean at `cb346ea`; `_NEXT.md` = Phase 8+11 spec.
| 8 | **Phase 10 + 2 + 13 + 6** — promote labs→core, mobile parity, bulk/undo; AI briefing; comms/onboarding; polish | codex | 🟡 NEXT · gated on codex reset (~06:43 UTC, waiter b17g0oes9) |

> **2026-06-30 ~03:00 UTC — branch `0b6c764` reconciled per operator ("cherry-pick the good parts").** Selectively
> brought 3 verified commits onto master: `c9505ab` confidence-gated auto-apply (`minAiConfidenceForAutoApply`),
> `d9c3964` test-id fix (my `dab4878` changed build ids; `server/api/insights.test.ts` still had old ids — 3 fails I'd
> missed by not running `server/api/`), `e58edc5` richer AI analysis context + persisted admin briefing. All
> schema-free, verified (full suite 803 pass / 10 known fails; restart NRestarts=0; `/api/admin/briefing` 200).
> **DEFERRED on branch (not discarded):** the V4.5 schema scaffolding (12 speculative tables) + the subscriptions
> usage-limit ingestor (`server/subscriptions/`, useful but needs the schema) — keep `v4-builder-wip-20260630` for a
> dedicated decision on subscriptions. Kept master's crash-fix files; skipped router.ts (cosmetic) + ingestor.ts (subs wiring).
>
> **2026-06-30 ~04:10 UTC — Phase 10a spec staged in `_NEXT.md` while codex is down (resets ~06:43 UTC).** Used the
> wait window for orchestrator grounding (no coder): found **Phase 2 is already DONE** (the cherry-picked briefing +
> confidence-gate ticked it), so the remaining bundle is Phase 10 (big) + 13 + 6. Scoped the next dispatch to
> **Phase 10a** = promote the experimental pages to operator-ready (`/governance`,`/compliance` labs→core;
> `/gateway`,`/channels`,`/reports` advanced-exp→promoted) with real-data+empty/error/loading+working-actions BEFORE
> flipping `navRegistry.ts` (hard rule: never promote a stub) + inbox bulk actions (on existing `bulk-apply`) + broader
> undo/revert (extend existing `rollbackHint` pattern). Deferred to 10b: Data Explorer, incident SLA/RCA, mobile-parity
> Playwright audit, orphan sweep, Phase 13 (comms), Phase 6 (polish). **Dispatch at reset:**
> `nohup bash launch-build.sh codex > logs/BUILD-P10.codex.log 2>&1 &` + self-re-arming watcher.
| 9 | **Phase 14 + 15** — advanced user/tenant mgmt; integrated feature flags | codex | ⬜ |
| 10 | **Phase 16** — AI GRC center (`/governance/risk`); govern the discovered AI inventory | codex | ⬜ |
| 11 | **Phase 17** — unified security center (CSPM/ASPM/CVE/secrets); consumes discovery | codex | ⬜ |

## Phase verification specifics
- **P1:** `curl -X POST /api/infra/service-restart` with NO token → 401/403; with token → ok + audit row.
  Durable jobs survive restart (SQLite). `POST /api/doctor/scan` → 200.
- **P9/3:** `/admin` first nav item; health gauge renders; ⌘K works; home governance cluster live via SSE.
- **P4:** each CLI action in CLAUDE.md has a working GUI control routed through the audited executor.
- **P12/5:** new detectors fire+resolve; `metric_samples` sparklines; real spend on `/cost`.
- **P8/11:** one inbox shows builder-fail + ops findings pre-reasoned; auto-apply policy editor toggles tiers.
- **P10:** nav promotions; Playwright desktop+tablet+iPhone parity; bulk select + undo.

## Page plans (research) → feed each phase
`/root/control-surface-plans/pages/*.plan.md` — builder reads the relevant ones before building each page.
**Quality-gate 2026-06-28:** the 15 gemini-cluster plans (GM1 governance/security/compliance/governance-risk,
GM2 editorial, GM3 cli-consoles) were under-grounded (0–21 file:line cites; one fabricated "OPA" claim) and were
archived to `pages/_gemini_weak/`. **RERUNNING with codex** (RX1/RX2/RX3, see `_RERUN_*.md`, hardened grounding
bar ≥20 cites/plan). The 29 codex-cluster plans (25–94 cites) are solid and kept. Watcher: `watch-rerun.sh`.

_Last updated by orchestrator: 2026-06-30 02:25 UTC — Phase 12+5 (`4348acb`+`cb346ea`) and Phase 8+11 (`86b8f8b`+crash-fix `dab4878`) SHIPPED & LIVE (NRestarts=0). Two incidents handled: P8 startup crash → rolled back to cb346ea then fixed forward; concurrent V4-scheduler builder loop → stopped per operator, work preserved on branch `0b6c764`. NEXT: reconcile `0b6c764`, then Phase 10+2+13+6. The V4 builder was a manual tmux one-off (no cron/timer) — watch it doesn't get restarted. Sonnet builder stays OFF (shared Claude window)._
</content>

---
## CHECKPOINT 2026-06-30 13:05Z — Phase 10a DONE, Phase 10b dispatching
- HEAD: `d79fca5` feat(v5): Phase 10a — promote labs→core, inbox bulk actions, undo/revert. Service restarted, public 200.
- Phase 10a ✅ DONE+SHIPPED (verified: typecheck/build/tests/prod-DB-smoke/promoted-pages-stub-free/live-401/scan-160).
- Phase 10b 🟡 DISPATCHING to codex — spec in _NEXT.md (Slice1 incident SLA/RCA, Slice2 read-only Data Explorer
  security-constrained allowlist, Slice3 validate+doc). Watcher to be armed.
- Resumable: on resume, check pgrep -x codex; if done, verify→commit→restart→advance per feedback_v5_full_auto_drive.

---
## CHECKPOINT 2026-06-30 13:26Z — Phase 10b DONE
- HEAD: `e197f84` Phase 10b (incident SLA/RCA + Data Explorer). Service restarted, public 200, security guards live.
- Phase 10 now substantially complete (10a promotions+bulk+undo @ d79fca5; 10b incidents+data-explorer @ e197f84).
  Remaining Phase 10 sub-items = orphan/module sweep + mobile-parity Playwright audit (operator tasks, deferred).
- NEXT: advance to next major phase (review plan Phases 13/6/14-17). Pick well-grounded build, spec _NEXT.md, dispatch codex.

---
## CHECKPOINT 2026-06-30 13:49Z — Phase 13 DONE; decision point on Phases 14-17
- HEAD: `7d59b1f` Phase 13. Service restarted, public 200, NO boot-time telegram/digest send (gate verified).
- Shipped this run (all green, all live): d79fca5 (10a), e197f84 (10b), 7d59b1f (13). Phases 11+12 were already done.
- UNAMBIGUOUS plan queue (Phases 10-13) is now EXHAUSTED. Remaining forks:
  (a) Phase 6 polish — small/cosmetic, some items likely stale/done; (b) Phase 10 leftovers = operator-run mobile-parity
  Playwright audit + orphan/module sweep; (c) Phases 14-17 = large aspirational feature-centers needing operator scope
  sign-off (committed to the user I'd get sign-off; risk of fake surfaces in a single-VPS stack).
- NEXT: surface the decision to the operator; meanwhile Phase 6 assessable as safe filler. Do NOT auto-build 14-17.

---
## CHECKPOINT 2026-06-30 13:55Z — codex budget EXHAUSTED; drive paused at clean boundary
- HEAD: `7d59b1f` (Phase 13). Service active, public 200, all green. Shipped this run: d79fca5 (10a), e197f84 (10b),
  7d59b1f (13). Phases 11+12 already done. Phases 10/11/12/13 COMPLETE.
- codex hit usage limit after 4 passes today (P8, 10a, 10b, 13); resets ~5:44 PM (per codex CLI). NOT rotating to
  gemini/opencode for the LOW-VALUE cosmetic Phase 6 work, NOT using Sonnet builder (shares Opus window / last resort).
- Phase 6 SAFE SUBSET staged in _NEXT.md (widget hide/reorder + animation polish ONLY; opencode live-probe + external
  timers explicitly OUT of scope). Auto-resume scheduled for codex reset (~18:00 UTC re-probe).
- DECISION PENDING (operator): direction after Phase 6 — Phases 14-17 (tenant mgmt / feature flags / GRC center /
  unified security center) need scope sign-off; several risk fake surfaces in a single-VPS stack. Also offered: operator
  runs the mobile-parity Playwright audit (Phase 10 leftover). Do NOT auto-build 14-17 without sign-off.
- RESUMABLE: on resume, check `pgrep -x codex`; probe codex; if available run Phase 6 (launch-build.sh codex) →
  verify→commit→restart→advance per feedback_v5_full_auto_drive; if still limited, re-arm a longer wait.

---
## CHECKPOINT 2026-06-30 15:50Z — operator approved "ship 14-17 parts that fit our stack"
- HEAD `7d59b1f`. codex still usage-limited (reset ~17:44 UTC). Phase 6 polish DEFERRED (superseded by 14-17 direction).
- GROUNDED 14-17 SUBSET (build only what maps to REAL stack capability; honest "not configured" for the rest, NEVER fake):
  * **P15 Feature Flags** (FIRST, staged in _NEXT.md): create feature_flags table + CRUD + UI; wire the ALREADY-STUBBED
    `readStaleFeatureFlagFindings()` (governance.ts:259). Self-contained, generic, low-risk.
  * **P17 Security Center**: consolidate EXISTING real signals — security/score.ts (trust-score/posture),
    governance_secrets inventory (metadata only, never values), security.ts cred-exposure detector. SKIP CVE/CSPM/
    HashiCorp Vault/Terraform-IaC/SAST-DAST (no such infra → would be fake; show honest "not configured").
  * **P14 User/Tenant/RBAC**: mgmt UI + RBAC editor on existing tenancy/ + sso/ + governance/rbac.ts + tenants/users
    tables, audited. SKIP email invitations (no SMTP) + "View As" impersonation (sensitive; defer).
  * **P16 Model Lifecycle/GRC**: enhance /models with lifecycle + eval history (real evals/modelEval.ts) + GRC gates via
    existing policy.ts/approvals/config_changes. SKIP OPA/Rego, fairness/SHAP/LIME XAI, adversarial scans, PDF reports.
- SEQUENCE (each its own dispatch, verified independently): P15 → P17 → P14 → P16. Spec each when its turn.
- RESUME: on codex reset, dispatch P15 (launch-build.sh codex) → verify→commit→restart→advance. Then spec+dispatch P17, etc.

---
## CHECKPOINT 2026-06-30 17:46Z — Phase 15 DONE (grounded 14-17 subset 1/4)
- HEAD `c2bdc6f` (Phase 15 Feature Flagging). Service restarted, public 200, list 200, create no-token 401.
- Built by Sonnet builder (escalated per operator when codex limited); Opus verified independently + shipped.
- Grounded subset progress: P15 ✅. NEXT: P17 Security Center → P14 User/Tenant/RBAC → P16 Model Lifecycle/GRC.
- codex reset ~17:44 UTC — re-probe; PREFER codex for P17 (frees shared Claude window vs Sonnet builder).

---
## CHECKPOINT 2026-06-30 18:04Z — Phase 17 DONE (grounded 14-17 subset 2/4)
- HEAD `ed48422` (Phase 17 Security Center). Restarted, public 200, /api/security/secrets 200 no-leak, posture 200.
- Grounded subset: P15 ✅ P17 ✅. NEXT: P14 User/Tenant/RBAC → P16 Model Lifecycle/GRC. codex available (preferred).

---
## CHECKPOINT 2026-06-30 18:26Z — Phase 14 DONE (grounded 14-17 subset 3/4)
- HEAD `f4b6586`. Restarted, public 200, /api/governance/users 200 no-leak, /api/rbac/matrix 200, role no-token 401.
- Grounded subset: P15 ✅ P17 ✅ P14 ✅. NEXT (LAST): P16 Model Lifecycle/GRC on real evals/modelEval.ts + policy.ts +
  approvals + config_changes; SKIP OPA/Rego, fairness/SHAP, adversarial scans, PDF. codex available.

---
## CHECKPOINT 2026-06-30 18:50Z — GROUNDED 14-17 SUBSET COMPLETE ✅
- HEAD `fedead5` (Phase 16). Restarted, public 200, lifecycle 200, promotion no-token 401.
- ALL 4 grounded-subset phases shipped: P15 (c2bdc6f) P17 (ed48422) P14 (f4b6586) P16 (fedead5). Each Opus-verified.
- Remaining V5 work: Phase 6 polish (safe/cosmetic, staged earlier), Phase 10 leftovers (mobile-parity Playwright audit
  = operator task; orphan sweep). No more big aspirational phases. Awaiting operator direction OR resume Phase 6.
