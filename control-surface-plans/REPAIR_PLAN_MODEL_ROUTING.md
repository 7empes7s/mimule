# REPAIR PLAN — model routing back on track

**Date:** 2026-07-17 · **Author:** Claude Opus (planner) · **Precedes:** `CATALOG_S_SHADOW_AI_AND_MODEL_TRUTH.md`
**Operator directive (2026-07-17):** *"get everything back on track and make sure all works before creating the spec to add features"* + *"make sure that the active/available/healthy models are separated from the unavailable/unhealthy."*
**Status:** IN PROGRESS — shipped: **R0** (`9ba95af`,`0c3a29e`) · **R7** (`9f81952`) · **R1** (`f2e729f`, `/opt/mimoun`) · **infra-retry** (`bb4ce72`, the R2-rider root-cause fix). Shipped today: R0/R0b/R7/R1/infra-retry/R8/**R7b** (`b9a20d0`). Open (need operator steer — live-infra / cost / larger): R2 (ledger-reconcile) · R3 (health states, the explicit ask) · R4 (creds+github-gpt41 cost decision) · R5 (kimi route = live litellm config edit) · classifyError "5" bug (tiny). Diagnosis evidence-backed throughout.

---

## 0. Headline

The chains are not unattended. **`model-fallback-reprobe.timer` rebuilds them every 3 hours** — probing 139 models, pruning dead ones, promoting recovered ones, splicing both LiteLLM and the gateway. The script is *good*: it already keeps 429 (`"rate-limited resets"`), already aborts on `MIN_LIVE` to survive an outage, is idempotent, and its author already discovered and fixed fallback-masked probes (the 2026-07-02 cerebras comment).

**Two bugs sit on top of it, and they are exact opposites:**

1. **Working models get pruned** (flapping) — because a 12s probe timeout can't tell *slow* from *hanging*.
2. **Dead models get kept** (rot) — because the probe measures **reachability**, not **usefulness**.

Both come from one root cause: **the reprobe probes, the Control Surface measures, and the two never speak.** The reprobe knows what answers a 12-second ping. The CS ledger holds **9,471 real call outcomes**. Neither reads the other. Fixing that connection is the repair *and* the foundation Catalog S was going to build anyway.

**Scope widened 2026-07-17 (operator-reported, §2b/§2c):** two more bugs, on the *consumption* side rather than the routing side — the front-page briefing renders the model's raw chain-of-thought (**R7**), and `/ratings` reports **false zeros** for models with 68 ledger calls (**R8**). They belong here because they are the same disease as BUG 0–2, one layer up:

> **The Control Surface reports what it was told to look at, not what is true.**
> The reprobe trusts a 12-second ping over 9,471 outcomes. `/ratings` trusts an empty `model_eval_runs` over a populated `gateway_calls`. The briefing trusts any non-empty string over the 2-3 sentence contract it asked for. **Every bug in this plan is the product believing its designated source instead of checking reality** — which is precisely the failure the product exists to catch in *other* systems.

That framing is also the fix pattern: in each case the truth is already on the box, unread.

---

## 0b. BUG 0 — we cannot answer "does it work?" (found while resolving R2c — fix this FIRST)

### Evidence
```
9466 of 9471 calls have NO trace_id
```
The only 5 that do belong to `acme-agent-planner` — the demo-tenant seed. **Production traffic carries no correlation id at all.**

Caller breakdown (all real production components — **no probe traffic pollutes the ledger, R2c is resolved clean**, the reprobe hits LiteLLM :4000 directly and never touches the CS gateway):

| caller | calls | call-level success |
|---|---|---|
| `insights-ai` | 8,606 (91%) | **49.2%** |
| `opencode-runner` | 477 | 89.3% |
| `reasoner` | 289 | **19.0%** |
| `admin-briefing` | 49 | 36.7% |
| `brainstorm-planner` | 38 | 76.3% |

### Why this is Bug 0 and not a metric gap
Those percentages are **call-level, and call-level is ambiguous by construction.** A 49.2% call success rate is consistent with *both* of these, and **we cannot currently tell which**:
- "half of the AI enrichment silently fails" — the G7 differentiator is broken, or
- "the fallback chain works perfectly, it just burns two hops per request" — the system is healthy and merely wasteful.

Without `trace_id` we cannot group calls into requests, so **request-level success, `wasted_attempts`, and `time_to_first_success` are all uncomputable.** The operator's instruction was *"make sure all works."* The honest answer today is: **we cannot know.** That is the finding.

Two consequences worth stating plainly:
- **`reasoner` at 19.0% call success** is the diagnosis engine — the thing that produces the AI diagnoses that *are* the product's headline. The ULTRAPLAN already recorded a symptom of this (P1.1: *"the diagnosis LLM call itself failed 'JSON parse failed' on the free model — reasoner robustness flagged"*). It is now quantified, but **whether diagnoses ultimately land is still unknown** — that needs traces.
- **ULTRAPLAN M21 (end-to-end lineage) is built on sand.** It is scoped as *"All the data exists; this is a JOIN + UX slice."* **It does not exist.** The join column is 99.95% empty. M21 cannot be built until R0 lands, and `/traces` is today a page over a column nobody populates.

### Fix — R0
- Populate `trace_id` at the gateway entry point: one id per logical request, stamped on **every** hop including fallbacks. Propagate the caller's id when present; mint one when absent.
- Backfill is impossible — this data is gone. **R0 starts the clock.**

> **SHIPPED 2026-07-17 — `9ba95af` (SPEC 36) + `0c3a29e` (SPEC 37).** The plumbing already existed end-to-end (`ledger.ts` wrote `trace_id`; `router.ts`/`client.ts` carried it; both `writeLedgerEntry` sites already passed `opts.traceId`) — **no caller ever supplied one**. Fix = mint in `gatewayComplete` (`opts.traceId ?? crypto.randomUUID()`); since the fallback loop lives *inside* that function, one invocation = one request = N hops, with zero caller changes. ~3 lines. SPEC 37 then closed the second writer: `runnerAccounting.ts` INSERTed into `gateway_calls` directly, omitting both `trace_id` and `tenant_id` (a **latent fresh-host bug** — masked here only by the ADD-COLUMN backfill), and now carries the builder's *existing* `pass.traceId ?? run.traceId` = **the M21 builder-pass → gateway-call join**. Evidence: suite 1166→1171→1176/0, gate PASS 41/41 LEAK=no, live 7/7 rows carrying ids, 0 missing.
>
> **CORRECTION to the estimate below:** ~~48h~~ — measured traffic is **far lighter and burstier** than assumed: `insights-ai` fires in scanner bursts (6 calls in 35s, then silence), ~7 calls in the first 35 min. At ~93.5% success on `editorial-heavy`, **one failure needs ~15 calls**, so a natural multi-hop group takes hours and a *trustworthy* request-level success rate takes closer to **a week**, not 48h. Do not quote request-level numbers before then.
>
> **Still pending (honest):** live multi-hop proof — no natural fallback had fired 20 min post-restart (all 7 calls succeeded). Covered by hermetic test #2; a synthetic failure was deliberately **not** manufactured to close it.
- Only then compute request-level success, `wasted_attempts`, `time_to_first_success` (Catalog S §2.3's waste metric — it is **blocked on R0**, which is why R0 leads).
- **Correct the record:** until R0 has data, every percentage in this plan and in Catalog S §0 is **call-level**. Say "call-level" in every UI and report that renders them. Do not let a call-level number be read as a feature-health number.

---

## 1. BUG 1 — chain flapping (5 LiteLLM restarts today)

> **SHIPPED 2026-07-17 — `f2e729f` (SPEC 39, committed in `/opt/mimoun` — this script, NOT the CS repo).** Two changes: `PROBE_TIMEOUT` 12→30 (live dry-run after the bump: `hang(000)` 4-6 → **0** — the flap population answers within 30s) and `HANG_STREAK=3` hysteresis on **code-0 incumbents only** (a per-model `history` block in the state file; kept in pool until 3 consecutive hangs; 4xx stays immediate; malformed history → no hold, never crash). Restart cap from this plan **dropped** — restart already fires only on `ll_changed`, so fixing the flap fixes the storm. Verified: live `--dry-run` clean; deterministic stubbed-probe test proves flap(200→0)=HELD, 2nd-hang=HELD, **3rd-consecutive-hang=PRUNED** (dead models still drop — no R2 regression). Deploys via the 3h timer (next 18:19 UTC); first run seeds history (0 holds), hysteresis live from the 2nd. **Acceptance (pending, 48h): litellm restarts/day 5 → ≤1.**


### Evidence
```
03:18  live=11 limited=47 dead=68 hang=4   PRUNED   nvidia-deepseek-v4-flash
06:20  live=8  limited=48 dead=68 hang=5   PROMOTED nvidia-deepseek-v4-flash   ← re-added what it just removed
06:20                                       PRUNED   zen-nemotron-3-ultra-free
09:20  live=9  limited=49 dead=66 hang=6   PROMOTED zen-nemotron-3-ultra-free  ← re-added
12:17  live=32 limited=25 dead=68 hang=5   PRUNED   zen-nemotron-3-ultra-free  ← removed again
```
`zen-nemotron-3-ultra-free`: **pruned → promoted → pruned in 6 hours.** `journalctl -u litellm.service --since today` = **10 start/stop events (5 restarts) today**, one per membership change. Every restart interrupts in-flight editorial and builder requests.

### Root cause — proven, not guessed
`PROBE_TIMEOUT = 12` (line 47). `KEEP_CODES = {200, 429, 500, 503}` (line 50). The **only** prune codes are 4xx and **`000`** — and `000` is returned by a bare `except Exception` that cannot distinguish:
- a genuinely hanging/unreachable endpoint (**prune — correct**), from
- **a slow model that just needed more than 12 seconds** (**prune — wrong**).

`zen-nemotron-3-ultra-free` averages **1909 seconds** on real builder passes (39.3% success over 56 passes). It is a *legitimately slow reasoning model*. A 12-second ping measures nothing about it except jitter. `hang` sits at 4–6 every cycle — that's the population of models parked on the timeout boundary, and they are exactly the flappers.

The `live` count swinging **8 → 32** across cycles is the same story at fleet scale: that variance is provider mood and probe timing, not model health. **We rebuild production routing off a signal with 4× run-to-run variance.**

### Fix
- **R1a — hysteresis.** Require **N consecutive** `000` observations before pruning (propose N=3 ⇒ ~9h of agreement), and N consecutive keeps before promoting. The state file `/var/lib/mimule/model-fallback-reprobe.json` currently stores only `{ts, pool}` — add `history: {model: {code, streak, since}}`. Cheap, and it kills the flap directly.
- **R1b — separate *slow* from *hanging*.** Raise `PROBE_TIMEOUT` (propose 30s) and record the observed latency. A model answering in 20s is **slow**, not dead — a distinct state (§3), fine for `verify`/`research` stages, wrong for interactive ones. `000` should mean *"no answer in 30s, three times running."*
- **R1c — debounce restarts.** Restart LiteLLM only when the chain set **materially** changes, and cap restarts (propose ≥6h apart unless a chain would otherwise be empty). A pure reorder must never restart. Target: **≤1 restart/day, not 5.**

---

## 2. BUG 2 — dead models kept alive (the deeper one)

### Evidence
The live pool **right now** contains `zen-deepseek-v4-flash-free`. Its real record: **191 calls, 0 successes, 135 rate-limits, still being called this week.** Also in-pool or in-chain: `groq-groq-compound` and `groq-groq-compound-mini` (0% each), `zen-hy3-free` (0%, 39 calls in 7d).

### Root cause
`KEEP_CODES` includes **429** — with the comment *"rate-limited (resets)"*. That policy is **right in principle and wrong on this evidence**: a model that has returned 429 to *every real request for two weeks* has not "reset." The probe asks *"can I reach you?"*; production asks *"can you finish the job?"* Those are different questions, and we route on the wrong one.

**829 of 9,471 calls (8.8%) were rate-limited.** We learn every provider's limit by crashing into it — the reprobe has no notion of a declared quota, so a permanently-throttled model is indistinguishable from a briefly-busy one.

### Fix
- **R2a — reconcile probe against ledger (the core repair).** Before splicing, read the CS ledger: any route with **n ≥ 20 real calls and 0% success over 7 days** is pruned **regardless of probe status**. Observed outcomes outrank a 12-second ping. This alone evicts `zen-deepseek-v4-flash-free`, both `groq-compound*`, and `zen-hy3-free` today.
- **R2b — 429 needs a decay clock, not a permanent pass.** Keep 429 as healthy-but-throttled for a bounded window (propose 48h). A route that is 429-only for >48h is throttled-to-death: demote to chain tail, then prune. `"resets"` must be *observed*, not assumed.
- **R2c — separate probe traffic from production traffic in the ledger.** The `caller` column exists. If probe calls are being counted as production calls, some of the 829 rate-limits are self-inflicted and the success rates are polluted. **Verify this before trusting any number in §2** — it is the one open question in this plan.

---

## 2b. BUG 3 — the flagship page renders the model's scratchpad as the briefing (operator-reported 2026-07-17)

### Evidence (live, `/` home + `/admin`, screenshotted by the operator)
The "State of the Stack" card renders, verbatim:
> *"The user wants a 2-3 sentence "State of the Stack" briefing. I need to be specific, connect findings to root causes, avoid filler. Key data points: - Admin Health: 80/100 (decent) … Pipeline paused is"*

That is the model's **internal chain-of-thought**, published on the product's front page, **truncated mid-sentence**. Not a briefing — its scratchpad *about* writing a briefing.

### Root cause — `server/insights/health.ts:327-338`, three compounding defects
```ts
const res = await complete(BRIEFING_MODEL, [{ role: "user", content: prompt }], {
  maxTokens: 200, timeoutMs: 15_000, caller: "admin-briefing",
});
const text = (res.choices?.[0]?.message?.content ?? "").trim();
if (text) { briefingCache = { text, ... }; persistAdminBriefing(briefingCache); }
```
1. **`maxTokens: 200` is below the reasoning floor.** A reasoning model spends its budget thinking; at 200 tokens the response is cut off *inside the reasoning*, before the answer is ever emitted. The truncation at "Pipeline paused is" is the 200th token — the answer never existed.
2. **No reasoning strip.** `message.content` is taken raw. Reasoning-model output (harmony `analysis` channel, `<think>` blocks, `reasoning_content`) is rendered as product copy. **This is the exact failure CLAUDE.md already records for another surface** — *"mimule-chat → qwen3:8b (not Gemma4 — leaked raw tokens in /new path)"*. Same bug, same stack, now on the flagship page.
3. **`if (text)` is the entire validation — and it *persists*.** Any non-empty string is accepted as a briefing and written via `persistAdminBriefing`, so the garbage survives restarts and keeps serving. The bare `catch {}` ("never block") means nothing ever complains.

Corroborating: `admin-briefing` is **36.7% call-level success over 49 calls** — this path was already failing ~2 in 3, silently, by design.

### Fix — R7
- **Raise the budget above the reasoning floor** (propose 800–1000) so an answer can exist at all. `maxTokens: 200` cannot work with a reasoning model, full stop.
- **Strip reasoning before use**: prefer the provider's separated field (`reasoning_content`) when present; else strip `<think>…</think>` / harmony analysis channel; else take the final channel only.
- **Validate the shape, don't just check truthiness.** Reject text that is self-evidently reasoning (opens with "The user wants…", contains "I need to…", exceeds the 2–3 sentence contract, ends mid-sentence). **Never persist an unvalidated briefing** — a rejected generation must fall back to the deterministic non-LLM summary and say so, not cache the scratchpad.
- **Prefer a non-reasoning model** for a 2-3 sentence deterministic summarization task, or accept the reasoning budget honestly. Do not ask a reasoning model for 200 tokens.
- **Purge the persisted garbage** on deploy (it is cached to disk right now).

## 2c. BUG 4 — `/ratings` reports **false zeros**, not honest empties (operator-reported 2026-07-17)

### Evidence
The model detail page for `groq-openai-gpt-oss-120b` states:
> *"0 routed calls, 0 ok, 0 failed, avg latency —"* · *"No eval history yet for this model"* · *"First seen —"*

The ledger says otherwise:
| resolved_model | calls | ok | avg_ms | last |
|---|---|---|---|---|
| `groq-openai-gpt-oss-120b` | **68** | 1 | 28ms | 2026-07-12 |
| `cf-cf-openai-gpt-oss-120b` | **67** | 1 | 159ms | 2026-07-12 |
| `openrouter-openai-gpt-oss-120b` | **66** | 0 | 99ms | 2026-07-12 |

### Why this is worse than an empty state
The page's "not available in this deployment" lines (fairness, XAI, adversarial scans, PDF reports) are **honest** — the rail working as designed. **"0 routed calls" is not one of those.** It is a *positive claim of zero* about a model called 68 times. An operator reads it as "unused"; the truth is "used 68 times and failed 67 of them." **A false zero is a lie with a number on it** — the one thing the trust moat cannot survive.

Root cause is Catalog S §2.1, now visible on screen: the page sources from **`model_eval_runs` (0 rows)** instead of **`gateway_calls` (9,471 rows)**. Same for "GRC readiness: blocked — insufficient eval history": the eval history is empty because nothing writes it, not because the model is unproven.

### Rider finding — gpt-oss-120b is two different models depending on the path
- via **opencode/builder**: `openrouter/openai/gpt-oss-120b:free` = **90.5% over 126 real passes** — the best free performer measured.
- via the **LiteLLM gateway**: `openrouter-openai-gpt-oss-120b` = **0/66**; `groq-` and `cf-` variants ≈ 1/67.

**The same model is excellent on one path and dead on another**, and nothing surfaces the contradiction. This is S7's `orphaned-capability` detector inverted, and it means the gateway chains are routing to a broken door on a model that demonstrably works.

### Fix — R8
- Source the ratings/model-detail surfaces from `gateway_calls` (+ `builder_passes`), per Catalog S §2.2.
- **Exclude `backend='cli-direct'`** from success math (SPEC 37 §4 — accounting rows, not outcomes).
- Where data genuinely does not exist, say **"not configured"** — never `0`. Zero is a measurement; absence is not.
- Surface path-divergence (same model, different route, different outcome) rather than averaging it away.

---

### Rider (2026-07-17, from the persisted-row audit) — **one model causes BUG 1 *and* BUG 3**

Every persisted briefing since 2026-06-30, by serving model:

| day | model | result |
|---|---|---|
| 06-30 / 07-01 | `qwen3-next-80b-instruct` | ✅ real briefing |
| **07-03 / 07-06 / 07-12 / 07-14 / 07-16** | **`nemotron-3-ultra-free`** | **SCRATCHPAD ×5** |
| 07-05 | `groq-llama-3.1-8b` | "Here's a 2-3 sentence…" (preamble) |
| 07-07 | `llama-3.1-8b` | markdown header, truncated mid-word |
| 07-10 | `nemotron-super-49b` | "Here is a 2-3 sentence…" (preamble) |

**5 of 5 scratchpads are `nemotron-3-ultra-free`. Perfect correlation.** The front page has been broken since **07-03 — two weeks** — and worked on 06-30/07-01 when `qwen3-next-80b` served the chain. The regression *is* the chain drifting onto nemotron.

**`zen-nemotron-3-ultra-free` is the single common cause of BUG 1 and BUG 3.** It averages **1909s** on real builder passes (39.3%/56) — it is slow *because* it is a reasoning model, and it leaks its scratchpad *because* it is a reasoning model. The reprobe's 12s timeout cannot see that it is slow-not-hanging (→ flap, 5 LiteLLM restarts/day); the briefing consumer cannot see that it is thinking (→ front-page leak). **One property, two bugs, two layers.** R1's `slow` state and R7's reasoning-awareness are the same insight applied to routing and to consumption.

### KNOWN GAP in the shipped R7 validator (honest — found after landing `9f81952`)
The rejection regex covers `the user wants|is asking|i need to|i should|let me|okay[,.]|first,? i|we need to`. It does **not** cover the **`"Here's a…"` / `"Here is a…"` preamble style** seen on 07-05 and 07-10, which would therefore **pass validation** today. Those are less harmful than a scratchpad (the briefing follows the preamble) but still violate the 2-3-sentence plain-English contract. **Follow-up R7b:** extend the opener regex (`/^here('s| is| are)\b/i`, `/^(sure|certainly)[,.]/i`) and reject a leading markdown heading (`/^\*\*/`, `/^#/`). Low priority — the fallback is honest — but the historical corpus above is a ready-made test fixture, so use it.

---

### Rider (2026-07-17, operator question "are the dead models caused by something else?") — **BUG 1 manufactures part of BUG 2**

**Yes — confirmed by DB forensics + a read-only Codex code audit, cross-checked against journald.** A large share of the apparent "deadness" is the LiteLLM **restart storm** (BUG 1), not dead models:

- Every 0%-model's `unknown`-class failures occur at **identical timestamps across different providers** (`2026-07-12 03:19:01`, `12:18:42`, `07-10 21:38:43`). Different providers cannot fail at the same second independently.
- journald proves LiteLLM was **down** at those exact seconds (`Stopping 03:18:39 → Started 03:19:30`; the 12:18:42 batch is 4s after the reprobe logged `restarting litellm.service`).
- Caller of every one = `insights-ai` (the continuous scanner). Each dead model carries **exactly 14** such rows — the same 3 restart windows catching the same burst.

**Mechanism, code-confirmed (Codex audit):** connection-refused has no matching substring in `classifyError` (`router.ts:399`) → falls through to `unknown`; `gatewayComplete` has **no same-hop retry / backoff / health-gate** (`router.ts:116,320`) → a ~50s transient restart becomes a permanent per-model failure row; the ledger stores no infra marker (`ledger.ts:24`) → model stats absorb infra outages. The only gate is a per-model circuit breaker that treats "server down" and "model bad" identically.

**The split (7d, 0% models):** the 14 `unknown` rows are restart artifacts; the `rate_limit` rows are genuine.
| model | restart-artifact | genuine rate_limit | verdict |
|---|---|---|---|
| `zen-deepseek-v4-flash-free` | 14 | 51 | genuinely rate-limited |
| `zen-hy3-free` | 14 | 23 | genuinely rate-limited |
| `groq-compound`/`mini` | 14 | 6 | mostly restart noise |
| `coding-go-minimax-m3` | 14 | 6 | **NOT dead — 80.8% over 526 all-time** |

**This rewrites R2.** A naive ledger-reconciliation that prunes "0% models" would delete `coding-go-minimax-m3` (a proven-good model) on manufactured evidence. R2 MUST:
1. **Not count connection-level/infra failures as model deadness.** Exclude `unknown`-class rows with no successful sibling, or rows coincident with a LiteLLM restart window.
2. **Prefer fixing the source:** add a **same-hop retry-once on connection-refused** in `gatewayComplete` — a restart is transient; one retry after a short backoff absorbs the casualty AND stops it polluting the ledger. This is the real fix (treat "server down" ≠ "model bad").
3. **Add an infra marker to the ledger** so future attribution never depends on cross-referencing journald (Codex #3).
4. R1 (shipped) already reduces the *source* — fewer restarts → fewer artifacts.

**Separate latent bug found in the audit:** `classifyError` (`router.ts:401`) has `if (msg.includes("5")) return "server_error"` — matches the digit **5 anywhere** (a model named `gpt-5`, "5 tokens", …). Misclassifies broadly. Low priority, tracked here.

---

## 3. R3 — Health states become first-class (operator's explicit ask)

> *"make sure that the active/available/healthy models are separated from the unavailable/unhealthy and so on"*

Today reality is 5 states collapsed into a **binary** (in-pool / pruned). That collapse **is** Bugs 1 and 2: *slow* gets bucketed with *hang* (flap), *throttled-forever* gets bucketed with *live* (rot).

| State | Signal | Chain treatment | Today |
|---|---|---|---|
| **live** | 200, fast (<5s) | chain head | ✅ in pool |
| **limited** | 429, but observed successes within window | keep, **deprioritize to tail** | ⚠️ treated as live |
| **slow** | 200 at 5–30s, or high real-call latency | keep for `verify`/`research`; **exclude from interactive** | ❌ flaps in/out as `hang` |
| **degraded** | was healthy, now failing (auth/quota) | **quarantine + alert — fix, don't prune** | ❌ silently pruned |
| **dead** | 4xx, or ledger 0% over n≥20 | prune | ⚠️ only if 4xx |
| **hang** | `000` × 3 consecutive | prune (worst — stalls chains) | ⚠️ prunes on 1 |

**"degraded" is the state that matters most and doesn't exist.** `coding-go-minimax-m3` earned **80.8% over 526 calls**, then went 0% in 7 days (64 unknown / 26 rate_limit / **11 auth**). Today's binary pruner just drops it, silently, and we lose a proven-good route to what is probably an expired credential. **A route that earned 526 calls deserves an incident, not a delete.**

This taxonomy is the contract for both the reprobe **and** the CS `/models` page — one vocabulary, two surfaces. Fixing the UI without fixing the pruner just paints over it.

---

## 4. R4 — Credentials (the "degraded" bucket, fix don't prune)

| Route | Symptom | Action |
|---|---|---|
| `coding-go-minimax-m3` | 11 `auth` + 26 `rate_limit`; 80.8% → 0%; last call 07-12 | check opencode-go credential — **likely expired**. Proven-good route worth recovering. |
| `github-gpt41` | **159 `auth`**, 3% success, only route that costs money, fans out to a ~40-model chain | token expired/revoked. Per `feedback_free_models_first` paid is last resort — **but a broken last resort is a chain ending in nothing.** Fix or remove deliberately. |
| CLAUDE.md | calls `github-gpt41` *"the most reliable paid fallback"* | **now false** — correct the doc. |

## 5. R5 — Missing capability (breadth, not rot)

`opencode-go/kimi-k2.6` scores **82.1% over 28 real builder passes** — one of the best performers measured. **There is no `coding-go-kimi-*` route in the LiteLLM config at all**; the only kimi routes are the two dead `zen-kimi-*` entries (5 probe calls each, 2026-07-02, 0%). **A proven-good model has no working gateway route.** Add `coding-go-kimi-k2-6 → hosted_vllm/kimi-k2.6`, mirroring the `coding-go-minimax-m3` entry, and let the reprobe pick it up.

Related rot: **`zen` holds 44 entries — the largest share of the config** — while Zen now serves ~2 free models (`project_gpu_off_free_cloud`). Do **not** bulk-delete: R2a will evict what's genuinely dead on evidence, and R1a stops the flapping first. Prune *after* the pruner is trustworthy, or we'll be re-adding these by hand next week.

## 6. R6 — Verify (the "make sure all works" half)

Repairs are worthless unverified. Gate each slice:

1. **Before/after probe distribution** — `live/limited/dead/hang` across 3 consecutive cycles. **Success = the same models in the same states 3× running** (flap gone).
2. **Restart count** — `journalctl -u litellm.service --since today | grep -c Started` ⇒ **≤1/day** (from 5).
3. **Real work, not pings** — run one real editorial stage and one real builder pass end-to-end; confirm success and that no chain hop landed on a 0% route.
4. **Ledger delta** — 7d rate-limit share must fall from **8.8%**; `wasted_attempts` on 0% routes → **0**.
5. **No regression** — `bun run check`, full suite, fresh-host gate 41/41 `LEAK=no` before any CS-side change lands.
6. **Baseline recorded** — write the before/after numbers into the vault so Catalog S lands on a known-good, measured stack.

---

## 7. Sequencing

```
R0 trace_id ✅ SHIPPED (9ba95af + 0c3a29e)
                    ↓
R7 briefing scratchpad leak   ←── DO FIRST: it is live on the front page, right now
   (raise token budget, strip reasoning, validate shape, stop persisting garbage)
                    ↓
R1 hysteresis + slow≠hang  →  R2 ledger reconciliation  →  R8 ratings false zeros
   (stops the flapping,        (evicts 429-forever rot,     (source from the ledger,
    5 restarts/day → ≤1)        probe ⟂ ledger joined)       never render a fake 0)
                    ↓
        R3 states first-class (reprobe + /models share one vocabulary)
                    ↓
        R4 creds (recover minimax, decide github-gpt41)  ·  R5 add kimi route
                    ↓
        R6 verify + baseline  →  THEN Catalog S features
```

**R7 jumps the queue.** Not on severity — on exposure. The flapping is internal and has run for weeks; **the scratchpad leak is on the product's front page and is persisted to disk**, so it survives restarts and greets every visitor until fixed. It is also the single cheapest repair here (a token budget, a strip, a shape check). Anyone shown this product today sees it first.

**R8 follows R2** because both are the same move — stop reading the empty table, start reading the ledger — and doing them together avoids touching the ratings surface twice.

**R0 first, and it is not close.** It is the only item that is *pure loss while it waits*: every hour without `trace_id` is an hour of unrecoverable evidence, and it gates the verification standard for every other repair (R6 asks "did real work succeed?" — unanswerable today). It is also small: stamp an id at gateway entry, propagate through fallbacks.

**R1 second** — a streak counter and a timeout constant; stops production restarts today, and every measurement stays polluted while the signal flaps 8→32.

**Do not touch the 44 zen entries until R1+R2 make the pruner trustworthy** — prune by hand now and we re-add them by hand next week.

**Honest note on effort:** R0+R1 are small and high-certainty. R2's ledger reconciliation is the one with design risk (it couples two systems that were deliberately independent) — do it *after* R0 gives it request-level truth to reconcile against, not before.

## 8. Rails

- **The Control Surface still never writes `/etc/litellm/config.yaml`** (standing operator decision, A4c). These repairs are to **`model-fallback-reprobe.py`** — the sanctioned owner of that file — and to CS *read* paths. A4c stays copy-button.
- Every reprobe run already backs up the config (`config.yaml.bak-reprobe-*`) — reversible by design. Keep it that way.
- `--dry-run` exists (line 26). **Every change proves itself in dry-run across ≥3 cycles before going live.**
- Kill by PID; no broad pkill; ps-check before git ops.
- **R2c (probe-vs-production traffic in the ledger) is an open question, not a finding.** Resolve it before quoting §2's numbers as final.

## 9. Appendix — reproduce

```bash
# Bug 1: the flap + the restarts
journalctl -u model-fallback-reprobe.service --since '24 hours ago' | grep -E 'PRUNED|PROMOTED|live\('
journalctl -u litellm.service --since today | grep -c Started          # 5 restarts today
grep -nE 'PROBE_TIMEOUT|KEEP_CODES' /opt/mimoun/scripts/model-fallback-reprobe.py

# Bug 2: dead-but-kept — zen-deepseek-v4-flash-free is in the live pool
python3 -c "import json;print([m for m in json.load(open('/var/lib/mimule/model-fallback-reprobe.json'))['pool'] if 'deepseek' in m or 'compound' in m])"
sqlite3 /var/lib/control-surface/dashboard.sqlite "
SELECT resolved_model, COUNT(*) c, ROUND(100.0*SUM(success)/COUNT(*),1) ok, date(MAX(ts)/1000,'unixepoch') last
FROM gateway_calls GROUP BY resolved_model HAVING c>=20 AND ok=0.0 ORDER BY c DESC;"

# R2c open question: is probe traffic polluting the ledger?
sqlite3 /var/lib/control-surface/dashboard.sqlite "SELECT caller, COUNT(*) FROM gateway_calls GROUP BY caller ORDER BY 2 DESC LIMIT 10;"
```

## 10. Additive status correction — 2026-07-18 14:43 UTC

This append-only note supersedes the header status where inconsistent. Prior diagnosis and history remain preserved.

### R1 — corrective follow-up shipped, acceptance pending

The original `f2e729f` did not meet operational acceptance: the health refresher also rewrote fallback chains, reprobe could undo that ordering, 408 was not treated as a timeout, 410 was not terminal, and one routable observation could re-promote a route. `/opt/mimoun@d117b84` makes reprobe the sole fallback writer, treats 408 as timeout and 410 as dead, and requires three routable recovery observations before promotion.

A controlled reconciliation at 14:03 UTC caused one expected LiteLLM restart. The scheduled 14:18 health refresh caused no further restart, and both timers remain active. This is early evidence only: R1 is not accepted until three stable scheduled reprobe cycles and the 48-hour at-most-one-restart-per-day target are observed.

### R3 and classifier rider — shipped and deployed

Control Surface commits `69e3535`, `8ddcc9f`, and `1bbc176` make `live`, `limited`, `slow`, `degraded`, `dead`, `hang`, and `unknown` first-class API states with healthy/unhealthy/unknown buckets, reasons, summaries, and matching `/models` grouping. Live `/api/models` returned 193 rows with 0 missing health fields: 14 healthy, 39 unhealthy, and 140 unknown.

Commit `2fe5267` replaces the broad `msg.includes("5")` classifier with anchored LiteLLM 500-599 recognition and pins precedence/regressions in 12 focused cases. The 24-test router suite and `bun run check` passed; live build `2fe5267` is healthy.

### R2a — shadow observation shipped, no routing enforcement

`/opt/mimoun@ae0959c` reads the Control Surface ledger in SQLite read-only mode and records conservative shadow decisions. Destructive evidence counts successes plus failures only in `rate_limit`, `auth`, `timeout`, and `unavailable`; it excludes `cli-direct`, `gateway_unreachable`, legacy `unknown`, pre-fix `server_error`, and non-MIMULE demo tenants. Earned history uses the same trusted sample. The policy separates five-call earned degradation from 20-call unproven deadness, and a rate-limit-only proposal must span at least 48 hours.

The live no-network report proposes exactly one route: `zen-deepseek-v4-flash-free`, 0/45 trusted calls in seven days, all 45 rate-limited across 124.9 hours, with no earned success history. State names it `would_prune`, `mode=shadow`, `enforced=false`. A full network dry run kept the 39-model pool and produced identical before/after hashes for `/etc/litellm/config.yaml`, `/etc/tib-builder/gateway.yaml`, and `/var/lib/mimule/model-fallback-reprobe.json`.

Do not enable enforcement after observation by changing the mode alone. First specify and test a durable tombstone, fail-stable behavior during transient ledger failure/evidence aging, and an explicit recovery/canary exit. R2b exact-code 429 decay and mixed-throttling policy remain separate.

### R6 — partial evidence only

Control Surface build/check, 546 API tests, 24 classifier/router tests, the 145-case API-only fresh-host gate, live auth/SSE smokes, `/api/models` classification, and R2 shadow/dry-run evidence passed. Still pending: R1's natural observation window, three stable reprobe cycles, an R2 durable apply/recovery policy, real editorial and builder work, comparable post-apply rate-limit/wasted-attempt deltas, and multi-viewport visual verification. `SPEC_45_CLASSIFY_ERROR_AND_R6_ACCEPTANCE.md` is the corrected strict contract; the colliding SPEC 44 is historical only. Do not mark the repair program complete.

## 11. Additive status correction — 2026-07-18 18:50 UTC

This append-only note supersedes the 14:43 deployment/evidence counts where inconsistent. It does not change the no-enforcement boundary.

### Strict verifier shipped; live program remains regressed

Control Surface commit `8dbe183` adds the strict repair-arc evaluator, immutable timestamped evidence writer, live/API collectors, and adversarial tests. It also deploys the previously committed pure model-health presentation contract from `3b0534c`. Sonnet 5 performed a final read-only adversarial review and reported no remaining P1 in the reviewed verifier scope.

Verification at the deployed commit:

- 131 tests across the six bounded files passed with 512 expectations; focused verifier tests were 59/59 with 238 expectations.
- TypeScript typecheck and the production Vite build passed. The existing large-chunk warning is unchanged.
- A detached clean-worktree, API-only fresh-host run probed 145 endpoints: 145 `HONEST`, zero `LEAK`, zero `CRASH`, and zero `ERROR-5xx`.
- Live build `8dbe183` passed health, version, HTML shell, anonymous 401, authenticated models, service-active, and post-deploy error-journal checks.
- Live `/api/models` returned 193 models: 15 healthy, 40 unhealthy, and 138 unknown, with exact state/bucket histogram agreement.

The immutable observation is `/var/lib/control-surface/repair-arc-evidence/20260718T185007Z.json`, SHA-256 `2b8b90ec4dbaaf371968be7bce2c530a6560f352e00eb496e2b849245fecb1f5`. It is root-owned, read-only, and was not promoted to `latest-accepted`.

The verifier correctly reports `regressed`, not complete: seven distinct LiteLLM starts occurred in the rolling 24 hours at 21:21, 00:19, 03:20, 06:17, 09:21, 12:22, and 14:03 UTC. R0 trace coverage, evidence provenance, R3, and live surface pass; natural multi-hop evidence is only 1/5; R2 remains shadow with one `would_prune`; exact-429, comparable outcome delta, R4/R5 dispositions, authorized R6 workloads, validation v3, and the acceptance log remain pending.

### R1 and R2 observation clocks

The 18:18:57–18:19:19 scheduled reprobe completed successfully with `changed=false`, pool size 39, no routing-layer change, no LiteLLM restart, and the same shadow proposal for `zen-deepseek-v4-flash-free` at 0/45 recent trusted calls. This is the second agreeing operational shadow observation after 15:17. The next timer opportunity is approximately 21:19:51 UTC.

The strict verifier still counts zero causally proven timer receipts because the separately reviewed timer trigger/completion wrapper does not exist. Wall-clock proximity, current systemd properties, and journal messages are intentionally insufficient. Therefore operational 2/3 is not an activatable 2/3, and even a third agreeing legacy observation cannot authorize enforcement.

Assuming no further LiteLLM start, simple window arithmetic implies the rolling count can first fall to one after 2026-07-19 12:22 UTC. That is an inference, not acceptance: the 48-hour stability target and causal scheduled receipts still have to be observed.

### Next implementation order

1. Let the scheduled 21:19 opportunity run without a manual probe, config write, or restart; capture it as operational evidence only.
2. Implement validation receipt schema v3 in a separate slice: every command bound to one detached commit/tree/cwd with clean-before/after proof, machine-readable Bun results, a rehashed process guard, and a canonical route inventory. Schema v2 is deliberately non-authoritative and cannot pass.
3. Design and review the timer-bound trigger/completion receipt wrapper before any systemd/unit change; then collect a fresh strict three-opportunity sequence.
4. Re-run the immutable verifier only after the restart window has aged and the new receipt producers exist.
5. Obtain explicit R4/R5 dispositions and separately authorize the bounded editorial and builder R6 runs. Do not infer that authorization from this plan.
6. Resolve SPEC 46 recovery/canary and exact-429 tail/decay choices. Do not implement or activate ledger enforcement until every gate and a separate one-shot authorization are present.

## 12. Additive status correction — 2026-07-18 19:30 UTC

Append-only. Does not change the no-enforcement boundary or the aged-restart-window gate.

### Validation receipt schema v3 shipped (item 2 of §11) — `a4b0046`, SPEC 47

`SPEC_47_R6_VALIDATION_RECEIPT_V3.md` is implemented and deployed to the tree (verifier tooling only — no server runtime code, so no service restart). The strict verifier's four static-validation checks (`classifier.contract`, `validation.bounded`, `r3.ui_contract`, `fresh_host.api_only`) are now *honestly passable* on trustworthy, candidate-bound evidence. Before this, `collectValidationManifest` hard-threw "v2 non-authoritative; v3 not implemented" and no producer existed; the checks were permanently `PENDING`/`UNVERIFIABLE`.

Schema v3 is CLI-side only. The deterministic core `evaluateValidation` and the evidence-envelope `SCHEMA_VERSION` are untouched; schema v2 keeps its full parse and terminal rejection. New: `scripts/record-validation-v3.ts` (the producer — runs the four commands inside one detached candidate worktree with tracked-clean proof before and after each command, a before/after forbidden-process snapshot, and immutable root-owned `0444` exclusive-create receipts; removes the worktree in `finally`; writes no `/etc`, `/opt/mimoun`, service, timer, or config). The v3 reader binds every command to the detached tree, derives test counts from the immutable JUnit artifact (never log text), recomputes `forbiddenProcessesSpawned` from the after\before delta, and cross-checks a canonical route inventory against both the fresh-host report and its own hash.

`e2e/fresh-host/routeInventory.mjs` is now the single balanced-paren GET-route extractor consumed by both `probe.mjs` and the verifier, replacing the two duplicate fragile regexes. It **recovered four real routes the old regex silently dropped** — `/api/content-health`, `/api/content-health/findings`, `/api/finance-intel/portfolio-config`, `/api/finance-intel/portfolio-configs` (148 vs 144). The fresh-host gate had never probed them; when the producer next runs a real fresh-host, those four must come back `HONEST` or a genuine defect surfaces.

Verified independently: `bun run check` exit 0; the bounded seven-file focused suite 135 pass / 0 fail / 522 expectations; `server/api/repairArcVerify.ts` untouched; only in-scope files committed; the fresh-host `REPORT.*` deliberately left unstaged; no rogue process or leftover worktree.

**Still gated, unchanged:** this slice makes the static-validation quarter passable; it does not accept the arc. The live acceptance run (producer → `verify-repair-arc.ts --operator-input`) is a separate operator-authorized action, held until the rolling-24h LiteLLM restart window ages to ≤1 (earliest 2026-07-19 12:22 UTC), and R2 three-cycle shadow, R2b exact-429, R4/R5 dispositions, and authorized R6 real work all remain pending. The 21:19 UTC reprobe stays a passive observation.

## 13. Additive status correction — 2026-07-18 21:21 UTC

Append-only. This ships R4 observation tooling but does not close R4, alter fallback membership, enable R2 enforcement, or change any restart/acceptance gate.

### Credential-health observation shipped — `/opt/mimoun@84770ba`, Control Surface `56934b0`, SPEC 48

The full six-hour model check now performs at most one pinned, bounded, direct credential-access probe per explicitly allowlisted provider key and writes `/var/lib/mimule/credential-health.json` as an atomic root-owned `0600` status-only artifact. Values, provider bodies, and reversible hashes are neither persisted nor logged. Missing, transport, 5xx, bare 403, invalid success envelopes, and stale/malformed evidence fail open; unvalidated HTTP 200 is `unknown`. An interprocess lock, five-hour minimum interval, PID/start-time identity, and newborn-lock grace prevent overlapping refreshes. This slice does not write routing config.

The Control Surface strictly reads one root-owned `0600` regular file through one `O_NOFOLLOW` descriptor, bounds and validates every field/status/code relationship, and rejects the whole artifact on structural contradiction, duplication, staleness, or ownership/mode failure. `/api/models` exposes safe credential annotations only. Existing health state and bucket precedence are unchanged; fresh credential evidence can only replace the reason on a route already classified `degraded` by matching auth/quota evidence. `/models` now has a responsive Credentials / API Keys table with status, freshness, affected logical-model names, and operator guidance.

Verification: probe syntax plus 15 focused Node tests and the existing 23-test reprobe suite passed; Control Surface focused suite 50/50 with 220 expectations and `bun run check` passed (known large-chunk warning only). Two independent final reviews found no remaining P0/P1. No VPS browser/Playwright run was performed. The fresh-host `REPORT.*` files remained unstaged at their prior hashes.

The first live artifact at 21:09 UTC was accepted by the strict reader and contained ten credentials. It directly disproves the guessed expired-key cause for the OpenCode Go routes: `OPENCODE_GO_API_KEY=valid`; live `/api/models` reports `coding-go-minimax-m3=live` and `coding-go-mimo-pro=slow`. `GITHUB_TOKEN` and `OPENCODE_ZEN_KEY` are `rate_limited`, not proven expired. Cerebras free/paid, Gemini, and OpenRouter are valid; NVIDIA remains transport-unknown. The first artifact conservatively recorded Cloudflare/Groq as unknown because their successful lists exceeded the bounded full-document validator; the committed small official access-envelope fix was separately confirmed valid/200 with current credentials and invalid/401 with fake credentials. The artifact is not hand-edited and will converge on the next eligible scheduled refresh.

Control Surface build `56934b0` is live on `:3000`; authenticated `/api/models` returned ten safe credential rows, and the service journal is clean. Only `control-surface.service` was restarted. LiteLLM remained on PID `2137446`, active since 14:03:13 UTC.

### Third agreeing scheduled reprobe observed; still not activatable

The untouched scheduled opportunity ran 21:20:00–21:20:23 UTC: live=9, limited=46, dead=79, timeout=5 (one held by hysteresis), pool=39, and the same ledger shadow prune proposal for `zen-deepseek-v4-flash-free` (now 0/46 trusted seven-day calls). It reported `litellm_changed=False`, `gateway_changed=False`, `enforced=false`, and no restart. Before/after routing-config hashes were identical; LiteLLM PID/start time were unchanged.

This is the third agreeing **operational** shadow observation only. The timer-bound trigger/completion receipt wrapper still does not exist, so strict causal acceptance remains zero and this observation cannot authorize enforcement. R1's 48-hour/restart-aging gates, R2b exact-429/recovery policy, R4/R5 dispositions, and authorized R6 workloads remain pending.

### OmniRoute direction remains plan-only

`OMNIROUTE_INTEGRATION_PLAN.md` now treats OmniRoute as a semi-trusted leaf behind LiteLLM, defaults to a pinned `runner-base` container on loopback, Pollinations-only synthetic/public traffic, no personal keys/PII, DB-backed least-privilege inference keys, encrypted-at-rest proof, and no sharing until a separate gate. Primary-source audit corrected unsafe upstream assumptions: auth is not on by default; the documented registered-key path is not wired into inference auth; environment keys have excessive scope/logging; Kiro/Qwen are excluded; and the audited MrFadiAi gateway is rejected for unauthenticated key mutation/raw-master-key disclosure. No OmniRoute code, container, secret, route, or service was installed.

## 14. Additive status correction — 2026-07-19 07:42 UTC

Append-only. This ships complete-catalog observation and bounded redemption tooling; it does not activate a newly discovered route, enable R2 enforcement, deploy OmniRoute, or authorize a LiteLLM restart.

### SPEC 49 implementation shipped — `/opt/mimoun@4007b3f`

The model-health full run now collects bounded complete catalogs for supported providers, preserves canonical provider/model identity, detects additions/removals/schema and price/type drift, refreshes credential status before fan-out, and schedules fair capped redemption only for exact catalog-present identities. A bare `200`, empty/malformed output, canned quota/balance response, `429`, or `5xx` cannot redeem, rank, notify, or promote a model. AIHubMix and `api.inferera.com` remain one provider identity; the observed account produced zero durably usable free models, so none was activated.

Discovery produces identity-, price-, credential-, and timestamp-bound proposals only. It cannot write routing configuration, hot-add a route, or restart LiteLLM. Exact configured and runtime provider/model/backend binding is required before a proposal can clear `activationPending`. The sole fallback writer now validates the LiteLLM/gateway pair, atomically preserves ownership/mode, detects operator races, rolls back a partial two-file apply, and persists bounded apply/failure receipts.

Final bounded gates passed: Node 50/50, Python 50/50, JavaScript and Python syntax, tracked/untracked whitespace, exact frozen diff `acaeaabae5c1e6d8f793bf0ebdaf027234e49952fc3c73cfa2c44049a946624b`, secret scan, and artifact hygiene. The 13-commit local `main` range was scanned and pushed to `origin/main`; local and remote both resolve to `4007b3f12046d086fd2568b891a8634633a38341`. LiteLLM remained PID `2137446`, active since 2026-07-18 14:03:13 UTC, with no restart or config mutation during merge. First scheduled full-run evidence remains pending at this timestamp.
