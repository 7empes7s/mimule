# SPEC 42 — R7b: reject "Here's a…" preambles in the briefing validator

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §2b R7 known-gap · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair (finish R7). Backend-only (`server/insights/health.ts`, `getBriefingRejectionReason` only). **No schema. No frontend.**

---

## 1. The gap (found after R7 shipped, proven by the persisted-row audit)

R7 (`9f81952`) rejects scratchpad leaks, but the audit of 10 persisted briefings showed two failure styles it does **not** catch:
- `2026-07-05` (`groq-llama-3.1-8b`): *"Here's a 2-3 sentence State of the Stack briefing for…"*
- `2026-07-10` (`nemotron-super-49b`): *"Here is a 2-3 sentence "State of the Stack" briefing…"*

These are **preambles** — the model narrating that it's about to answer, then (sometimes) answering. Less harmful than a raw scratchpad (an answer may follow), but still a contract violation: the briefing must be the 2–3 plain sentences themselves, not "here is a briefing:". Today they **pass** validation.

## 2. The change (`getBriefingRejectionReason`, add ONE check)

Add a preamble/formatting rejection **after** the existing meta-language opener check, before the prompt-echo check:
```ts
if (/^\s*(here('?s| is| are)|sure[,.:]|certainly[,.:]|of course|absolutely[,.:])\b/i.test(trimmed)
    || /^#{1,6}\s/.test(trimmed)      // leading markdown heading
    || /^\*\*/.test(trimmed)) {        // leading bold (e.g. "**State of the Stack**")
  return "opens with a preamble or heading";
}
```

## 3. The hard constraint — no false positives on legitimate briefings

The validator must STILL ACCEPT the real ones. These must remain **valid** (assert in tests):
- The deterministic fallback: `"State of the stack is stable: Admin Health is 80/100 with 0 critical, 1 high, and 11 medium open findings. Top signal: …"`
- The good 06-30/07-01 LLM briefings: `"The stack is in critical condition: five unregistered…"`, `"The stack is stable on the product side—no critical…"`

None start with `here`/`sure`/`certainly`/`of course`/`absolutely`, a markdown heading, or bold — so the new check is safe. **Verify this explicitly; a false positive here silently downgrades every good briefing to the fallback forever.** If any candidate check risks matching "The stack is…" or "State of the stack…", drop that sub-pattern.

## 4. Tests (extend `server/insights/health.test.ts`)
1. **07-05 style rejected** — `"Here's a 2-3 sentence State of the Stack briefing for the operator."` ⇒ rejected, reason "opens with a preamble or heading".
2. **07-10 style rejected** — `"Here is a 2-3 sentence \"State of the Stack\" briefing."` ⇒ rejected.
3. **Markdown heading rejected** — `"**State of the Stack**\n\nOverall health is fine."` ⇒ rejected.
4. **Legit fallback still accepted** — the exact deterministic fallback string ⇒ **valid** (`isValidBriefing` true).
5. **Legit "The stack is…" still accepted** — `"The stack is stable on the product side; no critical findings are open."` ⇒ **valid**. *This is the false-positive guard — the whole point of the slice.*
6. **Plain good briefing still accepted** — a 2-sentence plain briefing starting with a normal word ⇒ valid.

## 5. Evidence gates
- `bun run check` clean.
- Focused `health.test.ts` green; **full suite green, no regression** (baseline **1197/0**), hermetic (0 codex procs).
- Fresh-host gate **PASS 41/41**, `LEAK=no`.
- No restart needed for correctness (validator runs on next briefing refresh), but Claude may restart to confirm.

## 6. Rails
- Touch only `server/insights/health.ts` (`getBriefingRejectionReason`) + its test file.
- Do not touch the reasoning strip, the persist/read paths, `BRIEFING_MODEL`, or anything else in R7.
- No commit, no restart by the builder — Claude verifies and commits.
