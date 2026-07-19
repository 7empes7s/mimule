# SPEC 40 — gateway infra-aware failure handling (retry + don't charge the model)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §2 rider (BUG 1 manufactures BUG 2) · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair (root cause). Backend-only (`server/gateway/router.ts`). **No schema/migration. No frontend.**

---

## 1. The finding this fixes

When `model-fallback-reprobe` restarts `litellm.service` (~5×/day, the BUG 1 flap), LiteLLM is **down for ~50s**. Every in-flight `insights-ai` request hits connection-refused and, because there is no infra-awareness, the failure:
1. is classified `unknown` (connection-refused matches no substring in `classifyError`),
2. **charged to the model** (`recordFailure` trips the per-model circuit breaker, a failure ledger row is written against `resolved_model`),
3. **cascades** — the loop tries the next fallback model, which routes to the *same* down LiteLLM, so **every model in the chain gets a false failure row from one request.**

Proven: every 0%-model's failures cluster at identical timestamps across different providers, coincident with journald `Stopping litellm.service`; each carries exactly 14 such rows; `coding-go-minimax-m3` (80.8% over 526 all-time) reads "0%" recently almost entirely from these artifacts. Codex code-audit confirmed the mechanism (`router.ts:399` classify, `:320` no retry, `ledger.ts:24` no infra marker).

**One request should not be able to fabricate a failure for every model in the chain because the shared backend blinked.**

## 2. The distinction the code is missing

Three failure origins, currently collapsed. The adapter (`server/gateway/adapters/litellm.ts`) makes them **distinguishable by construction**:
| origin | how it surfaces | correct handling |
|---|---|---|
| **model/HTTP error** | adapter formats `throw new Error("LiteLLM <status>: …")` (reached LiteLLM, got a response) | **model's fault** — `recordFailure`, classify, continue to next hop (unchanged) |
| **timeout** | `AbortController.abort()` → `AbortError` / message `abort` | a slow model (e.g. nemotron 1909s) — **unchanged** (do NOT retry — it would just re-timeout) |
| **gateway unreachable** | raw `fetch` throw before any response — Bun: `"Unable to connect. Is the computer able to access the url?"` (verified live), also ECONNREFUSED / `fetch failed` / socket hang-up | **infra, not the model** — retry once, do not charge the model, stop the cascade |

**Classifier (new helper):**
```ts
function isGatewayUnreachable(e: Error): boolean {
  if (e.name === "AbortError") return false;          // timeout, not infra
  const m = e.message.toLowerCase();
  if (m.includes("abort") || m.includes("timeout")) return false;
  return !/^litellm \d+/.test(m);                      // no "LiteLLM <status>:" ⇒ never reached LiteLLM
}
```
This is robust: any error that *reached* LiteLLM carries the adapter's `LiteLLM <status>:` prefix. Anything else (minus timeouts) means the request never got there. It does **not** rely on enumerating platform-specific connection strings.

## 3. The change (`server/gateway/router.ts`, `gatewayComplete` loop only)

For each hop, on a caught error:

- **If `isGatewayUnreachable(lastError)`:**
  1. **Retry the SAME hop exactly once**, after `GATEWAY_INFRA_RETRY_MS` (new const, **1500**) backoff (`await new Promise(r => setTimeout(r, …))`). A brief blip / fast restart is absorbed; a full ~50s restart is not (that is what steps 2–4 handle honestly).
     - Retry succeeds ⇒ normal success path (`recordSuccess`, success ledger row, return).
     - Retry is a **model/timeout** error ⇒ fall through to the model-error path below.
  2. Still unreachable after the retry:
     - **Do NOT `recordFailure(modelName)`** — the model didn't fail; the gateway couldn't reach the backend. Leaving the breaker closed also stops a restart from tripping every model's breaker (a real second-order bug today).
     - Write the ledger row with **`errorClass: "gateway_unreachable"`** (new, honest, excludable) — `success:false`, `traceId`, `caller` as today.
     - **`break` the chain loop.** All hops route through the same LiteLLM; cascading only manufactures more false rows. Fail fast.
  3. After the loop, throw `lastError` as today (caller sees a real infra error and retries next cycle — `insights-ai` is scheduler-driven).

- **Else (model/HTTP error or timeout): UNCHANGED** — `recordFailure`, `classifyError`, failure ledger row, continue to the next hop. Nemotron's slow-timeout stays charged to nemotron.

**Retry exactly once.** More retries add latency without covering a 50s restart (steps 2–4 cover that); the ledger hygiene is what fixes long restarts, the single retry is cheap insurance for short blips.

## 4. Downstream requirement (record it, don't build it here)
`gateway_unreachable` rows are **infra, not model outcomes.** Every success-rate / ratings / dead-route computation (R2, R8, Catalog S §2.2) **MUST exclude `error_class='gateway_unreachable'`** — same rule as SPEC 37 §4's `backend='cli-direct'`. A model is not "dead" because LiteLLM was bouncing. Add this to R2/R8/S5 specs when written.

## 5. Tests (hermetic — extend `server/gateway/router.test.ts`, stub `fetch` via `installAdapterMock`)

Add a mock outcome that **throws a connection error from `fetch`** (e.g. `throw new Error("Unable to connect. Is the computer able to access the url?")`) — distinct from the existing `"failure"` (503, which the adapter turns into `LiteLLM 503:` = a model error).

1. **Unreachable is retried once then marked infra** — model unreachable on both attempts ⇒ exactly **one** `gateway_unreachable` ledger row for that model, `success=0`; fetch called **twice** for that hop.
2. **Breaker not tripped by infra** — after an unreachable failure, the model is still `isAvailable` (assert via a subsequent successful call, or expose breaker state) — i.e. `recordFailure` was not called.
3. **Cascade stops** — 2-model chain, model 1 unreachable ⇒ model 2 is **never attempted** (no ledger row, no fetch for model 2); the call throws.
4. **Retry recovers** — model unreachable on attempt 1, success on attempt 2 ⇒ success ledger row, result returned, **no** `gateway_unreachable` row.
5. **Real model error is unchanged** — `"failure"` (503 ⇒ `LiteLLM 503:`) ⇒ `recordFailure` path, classified `server_error`/`unavailable` (per existing `classifyError`), **cascades** to the next model as today.
6. **Timeout is not treated as infra** — an `AbortError` ⇒ classified `timeout`, `recordFailure` called, cascades (unchanged) — proves nemotron-style slow models stay charged to the model.
7. **Trace correlation intact** — the `gateway_unreachable` row still carries the request `traceId` (SPEC 36 not regressed).

## 6. Evidence gates
- `bun run check` clean.
- Focused gateway/router tests green; **full suite green, no regression** (baseline **1184/0**), hermetic (0 codex procs).
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live after restart:** trigger nothing artificial. Over the next real reprobe-restart window, confirm new failures during the outage are `error_class='gateway_unreachable'` (not `unknown`) and that model breakers did not trip. If no restart occurs in the observation window, state that honestly and leave live-confirmation pending — do **not** manufacture a LiteLLM outage on a live host.

## 7. Rails
- Touch only `server/gateway/router.ts` + its test file. **Do not** touch `server/api/router.ts` (uncommitted SPEC 35 work), the adapter, the schema, or the reprobe.
- Do not change `classifyError`'s existing branches (the `msg.includes("5")` bug is tracked separately — not this slice).
- No commit, no restart — leave in the working tree for review.
- `gateway_unreachable` is a new free-text `error_class` value; the column is TEXT, no migration needed.
