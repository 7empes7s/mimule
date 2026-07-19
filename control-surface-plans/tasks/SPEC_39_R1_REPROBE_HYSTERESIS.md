# SPEC 39 — R1: stop the chain flapping (slow ≠ hanging)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §1 (BUG 1 / R1) · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Target:** `/opt/mimoun/scripts/model-fallback-reprobe.py` (git-tracked in `/opt/mimoun`) — **NOT the Control Surface repo.**
**Type:** repair. **Higher risk than SPEC 36–38**: this script rewrites `/etc/litellm/config.yaml` and restarts `litellm.service` on a 3h timer. Read §6 before touching anything.

---

## 1. Evidence

```
03:18  live=11 limited=47 dead=68 hang=4   PRUNED   nvidia-deepseek-v4-flash
06:20  live=8  limited=48 dead=68 hang=5   PROMOTED nvidia-deepseek-v4-flash   ← re-added what it just removed
06:20                                       PRUNED   zen-nemotron-3-ultra-free
09:20  live=9  limited=49 dead=66 hang=6   PROMOTED zen-nemotron-3-ultra-free  ← re-added
12:17  live=32 limited=25 dead=68 hang=5   PRUNED   zen-nemotron-3-ultra-free  ← removed again
```
`zen-nemotron-3-ultra-free`: **pruned → promoted → pruned in 6 hours.** `journalctl -u litellm.service --since today | grep -c Started` = **5 restarts today**, one per membership change, each interrupting in-flight editorial and builder requests. Live state file confirms it sits in the **`hang`** bucket right now (code 0).

## 2. Root cause — proven

`PROBE_TIMEOUT = 12` (line 47). `KEEP_CODES = {200, 429, 500, 503}` (line 50). `probe()` returns code **`0`** from a bare `except Exception` — one value conflating:
- a genuinely hanging/unreachable endpoint (**prune — correct**), and
- **a slow model that needed more than 12 seconds** (**prune — wrong**).

`zen-nemotron-3-ultra-free` averages **1909 seconds** on real builder passes (39.3% over 56). It is a *legitimately slow reasoning model*; a 12-second ping measures nothing about it but jitter. `hang` sits at 4–6 every cycle — that is the population parked on the timeout boundary, and they are the flappers. The `live` count swinging **8 → 32** is the same effect at fleet scale: **we rebuild production routing off a signal with 4× run-to-run variance.**

**Cross-bug rider (do not miss this):** `zen-nemotron-3-ultra-free` is *also* the sole cause of the R7 front-page scratchpad leak (5 of 5 leaked briefings were nemotron). It is slow **because** it is a reasoning model and it leaked its scratchpad **because** it is a reasoning model. **One property, two bugs.** R1 is that insight applied to routing.

**Precedent:** `git log` on this file shows `8619d7a "fix(models): kill the dead-model promotion loop"` — a *previous* promotion-loop fix (the `fallbacks: []` probe-masking bug, per the 2026-07-02 cerebras comment). **This is a recurrence of a related class**, which is why R1 fixes the signal rather than patching another symptom.

## 3. The change

### 3a. Hysteresis on `hang` only — the fix
Add per-model probe history to `STATE_FILE` (`/var/lib/mimule/model-fallback-reprobe.json`), which today holds only `{ts, pool, live, limited, dead, hang, changed}`:
```json
"history": { "<model>": { "code": 0, "streak": 2, "since": 1784290668 } }
```
- After probing, for each model: `streak = prev.streak + 1 if prev.code == code else 1`.
- **Hold rule:** if `code == 0` **AND** `streak < HANG_STREAK` (new const, **default 3**) **AND** the model was in the previous pool ⇒ treat it as a keep for pooling purposes (synthesise a keep code). Otherwise use the real code.
- A model **not** already in the pool that hangs is **not** added. Only *incumbents* get the benefit of the doubt.
- Missing/corrupt `history` ⇒ behave exactly as today (no hold). Never crash on a malformed state file — it is best-effort.

Why this alone kills the flap: nemotron's pattern is `0 → 200 → 0`. With a 3-streak requirement it never reaches 3 consecutive `0`s, so it never leaves the pool, so the config never changes, so **LiteLLM never restarts.**

**Scope: `code == 0` ONLY. 4xx stays immediate.** 401/404/400/402/403 is an unambiguous "you do not exist"; there is no evidence of 4xx flapping, and adding lag there would make BUG 2 (dead models kept) worse. Do not generalise this.

### 3b. Separate *slow* from *hanging*
- `PROBE_TIMEOUT` **12 → 30**. A 12s ping cannot judge a reasoning model. Worst case run time grows (139 models / 10 workers), but the timer is 3-hourly and observed runs are 22–95s — acceptable.
- Record per-model latency in `history` (`ms`) so "slow" becomes visible rather than inferred.
- Log the hold explicitly: `hang(000)=5 (3 held by hysteresis)`. **A model held by hysteresis must never be silently held** — that is the R7 lesson (silence is how bugs survive weeks).

### 3c. Restart debounce — **DROPPED, deliberately**
The repair plan proposed a restart cap. **On reading the code it is unnecessary and would be harmful.** `ll_changed` is already a full-text compare of the rendered config, `build_pool` sorts deterministically, and restart is already gated on `if ll_changed` — so restarts only fire on *membership* change. **Fix the flap and the restart storm fixes itself.** A cap would add complexity and could delay a legitimate urgent chain update. This is a scope *reduction* from the plan; the plan will be corrected.

## 4. Verification — `--dry-run` first, no exceptions

There is no test framework for this script. `--dry-run` (line 26: writes nothing, restarts nothing) **is** the harness.

1. **Baseline:** record current `hang` list + pool from the live state file.
2. **`--dry-run` × 3 consecutive real cycles** (≥3h apart, or by invoking manually — the probe is read-only against LiteLLM). Assert:
   - `zen-nemotron-3-ultra-free` **stays in the pool** across all three despite appearing in `hang`;
   - the `(N held by hysteresis)` log line appears and names it;
   - `pool` membership is **identical across all three runs** — that is the flap being gone.
3. **Only then** run live once, and confirm `litellm_changed=False` ⇒ **no restart**.
4. **48h watch:** `journalctl -u litellm.service --since '24 hours ago' | grep -c Started` ⇒ **≤1/day** (from 5). This is the acceptance number.
5. Confirm `MIN_LIVE` abort guards still fire (do not weaken them).

## 5. Out of scope — do not touch
- `KEEP_CODES` (429 handling is **BUG 2 / R2**, a separate slice with its own evidence).
- `build_pool` ordering, `prov_rank`/`prem_rank`, `splice_litellm`, `splice_gateway`, `validate_litellm`.
- The `MIN_LIVE` abort guards — they are the outage protection.
- The Control Surface repo. **Nothing in `/opt/opencode-control-surface` changes in this slice.**
- Do not add a restart cap (§3c).

## 6. Rails — this one edits live production routing
- **`--dry-run` proves it before any live run.** Non-negotiable.
- The script already backs up `/etc/litellm/config.yaml` per run (`config.yaml.bak-reprobe-*`) — keep that behaviour intact; it is the rollback.
- Never weaken `MIN_LIVE`. A bad pool on a live host takes the editorial pipeline down.
- The Control Surface **still never writes** `/etc/litellm/config.yaml`; this script is its sanctioned owner (standing operator decision, A4c).
- Commit in `/opt/mimoun`, not the CS repo. Do not restart `litellm.service` by hand — let the timer do it, or confirm no restart is needed.
- Kill by PID; no broad pkill; ps-check before git ops.
