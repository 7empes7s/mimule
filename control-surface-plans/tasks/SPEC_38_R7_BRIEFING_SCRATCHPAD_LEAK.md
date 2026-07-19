# SPEC 38 — R7: the front page renders the model's scratchpad

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §2b (BUG 3 / R7) · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair. Backend-only (`server/insights/health.ts`). **No schema/migration. No frontend changes.**
**Priority:** jumps the queue — live on the product's front page and **persisted to disk**, so it survives restarts.

---

## 1. Evidence (operator-screenshotted, live on `/` + `/admin`, 2026-07-17)

The "State of the Stack" card renders, verbatim:
> *"The user wants a 2-3 sentence "State of the Stack" briefing. I need to be specific, connect findings to root causes, avoid filler. Key data points: - Admin Health: 80/100 (decent) — Product Health: 0 fails (good) … Pipeline paused is"*

That is the model's **internal chain-of-thought**, published as product copy, **truncated mid-sentence**. Not a briefing — its scratchpad *about* writing one. Corroborating: `admin-briefing` = **36.7% call-level success over 49 calls**, failing ~2 in 3 silently.

Precedent: CLAUDE.md already records this exact class on another surface — *"mimule-chat → qwen3:8b (not Gemma4 — leaked raw tokens in /new path)"*. **Second occurrence. It is a pattern, not an incident.**

## 2. Root cause — `server/insights/health.ts:327-338`, three compounding defects

```ts
const res = await complete(BRIEFING_MODEL, [{ role: "user", content: prompt }], {
  maxTokens: 200, timeoutMs: 15_000, caller: "admin-briefing",
});
const text = (res.choices?.[0]?.message?.content ?? "").trim();
if (text) { briefingCache = { text, ... }; persistAdminBriefing(briefingCache); }
```

1. **`maxTokens: 200` is below the reasoning floor.** `BRIEFING_MODEL = "editorial-heavy"` resolves through the chain to whatever is healthy — often a reasoning model. A reasoning model spends its budget thinking; at 200 tokens the response is severed *inside the reasoning*, before an answer is ever emitted. The cut at "Pipeline paused is" **is** the 200th token. **The answer never existed** — this is not a rendering bug, it is a budget bug.
2. **No reasoning strip.** `message.content` is used raw.
3. **`if (text)` is the entire validation, and it persists.** Any non-empty string becomes the briefing and is written to `system_configs` via `persistAdminBriefing`, so it outlives restarts. The bare `catch {}` guarantees silence.

### The constraint that decides the design
**The leaked text carries no markers.** No `<think>` tags, no harmony channel envelope — the model simply began reasoning in the `content` field. `CompletionResponse.message.content` is a plain `string | null` (`server/gateway/adapters/base.ts:32`); there is **no separated `reasoning_content`** to read.

⇒ **Stripping cannot be the primary defence.** You cannot reliably strip what isn't delimited. **Validation is the fix; stripping is a bonus for the delimited cases.**

## 3. The change (`server/insights/health.ts` only)

**3a. Raise the budget above the reasoning floor.** `maxTokens: 200` → **800**. Keep `timeoutMs: 15_000`.

**3b. Strip delimited reasoning when present** (helper, e.g. `stripReasoning(raw)`): remove `<think>…</think>` / `<thinking>…</thinking>` blocks and any harmony `analysis` channel envelope; if a `final` channel is identifiable, take it. Unmatched/unclosed opener ⇒ treat as reasoning-only ⇒ empty ⇒ rejected by 3c. **Best-effort only — never assume markers exist.**

**3c. Validate the shape — this is the actual fix** (helper, e.g. `isValidBriefing(text): boolean`). Reject when text:
- opens with meta-language: `/^(the user (wants|is asking)|i need to|i should|let me|okay[,.]|first,? i|we need to)/i`
- echoes the prompt's own scaffolding: contains `Key data points`, `Admin Health Score:`, `Top drivers dragging`, `Recent finding history:`
- **does not end in terminal punctuation** (`.`/`!`/`?`) ⇒ truncated mid-sentence
- violates the stated contract: **> 4 sentences** or **< 1**, or length > ~600 chars
- is empty after 3b

**3d. On rejection: keep the deterministic fallback and DO NOT persist.** `buildFallbackAdminBriefing()` already exists (line 215) and already produces an honest, useful briefing:
> *"State of the stack is stable: Admin Health is 80/100 with 0 critical, 1 high, and 11 medium open findings. Top signal: …"*

The `source: "llm" | "fallback"` union already exists. **A rejected generation must leave `source:"fallback"` in place and write nothing to `system_configs`.** Never cache or persist an unvalidated briefing.

**3e. Make rejection visible — never silent.** Today's `catch {}` is why this ran for weeks unnoticed. On rejection, `writeMetricSample({ source: "health", key: "admin_briefing_rejected", value: 1 })` (the helper is already imported, see line 132) and `console.warn` the reason + first 80 chars. **A briefing silently degrading to fallback forever is the same bug one level up.**

**3f. Purge the persisted garbage.** Today's scratchpad is live in `system_configs` under `getBriefingConfigKey(dateKey)`. On startup, validate any loaded persisted briefing through 3c and **discard it if it fails** (`readPersistedAdminBriefing` path, ~line 175). This self-heals the existing bad row without a migration — and protects against every previously-persisted day.

### Deliberately NOT in scope
- **Do not change `BRIEFING_MODEL`** away from `editorial-heavy`. Pinning a specific model contradicts the logical-name rail (CLAUDE.md) and hides the real defect. A correct consumer must survive a reasoning model.
- Do not touch the gateway, the chain, the prompt's content, or any frontend file.
- Do not add a migration.

## 4. Tests (hermetic — SPEC 20 rails; stub `complete`, no network)

1. **Scratchpad is rejected** — feed the **verbatim operator-reported leak** ("The user wants a 2-3 sentence…Pipeline paused is") ⇒ result `source==="fallback"`, and **nothing written to `system_configs`**. *This is the regression test; use the real string.*
2. **Truncated-mid-sentence is rejected** — valid-looking prose with no terminal punctuation ⇒ fallback.
3. **Prompt-echo is rejected** — text containing `Key data points` ⇒ fallback.
4. **A good briefing is accepted** — 2-3 plain sentences ending in `.` ⇒ `source==="llm"`, text preserved **byte-identical**, persisted.
5. **Delimited reasoning is stripped** — `<think>noise</think>Real briefing.` ⇒ accepted as `Real briefing.`
6. **Reasoning-only is rejected** — `<think>noise</think>` alone ⇒ empty after strip ⇒ fallback.
7. **Persisted garbage self-heals** — seed `system_configs` with a scratchpad briefing ⇒ read path discards it and returns fallback.
8. **Rejection is observable** — a rejected generation emits the `admin_briefing_rejected` metric sample.

## 5. Evidence gates

- `bun run check` clean.
- Focused tests green; **full suite green, no regression** (baseline **1176/0**), hermetic (0 codex procs).
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live after restart:** `/` and `/admin` render either a real 2-3 sentence briefing **or** the honest deterministic fallback — **never a scratchpad**. Confirm the persisted `system_configs` row for today no longer holds reasoning text.

## 6. Design note — the asymmetry that justifies aggressive rejection

A false rejection costs a good LLM briefing and yields the deterministic one, which is **honest and genuinely useful**. A false acceptance puts the model's scratchpad on the product's front page and **persists it**. The costs are wildly asymmetric ⇒ **bias hard toward rejection.** When unsure, fall back. This is the trust moat: a plain honest sentence always beats a clever broken one.

## 7. Rails

- Touch only `server/insights/health.ts` + its test file. **Do not touch `server/api/router.ts`** (unrelated uncommitted SPEC 35 work).
- No commit, no restart — leave in the working tree for review.
- Never break the admin page: every new path keeps the existing "briefing must never throw" guarantee.
