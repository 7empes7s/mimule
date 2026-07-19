# SPEC 36 — R0: trace correlation at the gateway

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` R0 · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair. Backend-only. **No frontend changes. No schema/migration changes.** The column already exists.

---

## 1. The finding

```
9466 of 9471 gateway_calls rows have NO trace_id
```
The only 5 that do belong to `acme-agent-planner` (demo-tenant seed). **Production traffic carries no correlation id.**

Consequence: calls cannot be grouped into requests, so **request-level success is uncomputable**. `insights-ai` is 91% of traffic at 49.2% *call-level* success — equally consistent with "half the AI enrichment fails" and "the fallback chain works fine but burns two hops." We cannot tell which. `/traces` is a page over a column nobody populates, and ULTRAPLAN **M21 lineage** ("a JOIN + UX slice — all the data exists") is blocked on this.

## 2. Root cause — the plumbing already exists; nobody starts it

Verified by reading the code (2026-07-17):

- `server/gateway/ledger.ts:20,35,51,66` — `LedgerEntry.traceId` exists; the INSERT writes `entry.traceId ?? null`. **Correct already.**
- `server/gateway/router.ts:281` — `GatewayCompleteOptions = { timeoutMs?, traceId?, caller? }`. **Correct already.**
- `server/gateway/router.ts:342` (success) and `:364` (failure) — the **only two** `writeLedgerEntry` call sites in the codebase (non-test), both already passing `traceId: opts.traceId`. **Correct already.**
- `server/gateway/client.ts:13,24` — `complete()` forwards `opts.traceId` into `gatewayComplete`. **Correct already.**
- **The callers pass `caller:` but never `traceId:`** — e.g. `server/api/incidents.ts:745` `{ caller: "incident-postmortem-suggest" }`, `server/api/reasoner.ts:141` `{ timeoutMs, caller: POST_MORTEM_CALLER }`, `server/api/gateway.ts:688` `{ caller: "gateway-admin-probe", timeoutMs }`. So `opts.traceId` is `undefined` → ledger writes `null`. Every row. Forever.

**The fallback loop lives inside `gatewayComplete`** — the `catch` at ~:356 records the failure and continues to the next chain member. Therefore **one `gatewayComplete` invocation == one logical request == N ledger rows (one per hop).** That is exactly the grouping we want, and it is already structurally present. Nothing needs threading through callers.

## 3. The change

**In `server/gateway/gatewayComplete` (`server/gateway/router.ts`) only:**

1. At the top of `gatewayComplete`, before the chain loop:
   ```ts
   const traceId = opts.traceId ?? crypto.randomUUID();
   ```
2. In **both** `writeLedgerEntry` calls (`:342`, `:364`), replace `traceId: opts.traceId` with `traceId,`.

That is the whole change. ~3 lines, one function.

**Why this is right:**
- Every hop of one request shares one id → request-level grouping works **for every existing caller with zero caller changes**.
- `??` preserves explicit correlation: a caller that wants to span *multiple* `gatewayComplete` calls under one trace still passes its own `traceId` and wins. **Do not use `||`** — an explicit empty string must not be silently replaced (and `??` is what the ledger's own `?? null` idiom implies).
- No schema change, no migration, no frontend change, no new dependency (`crypto.randomUUID` is in Bun's global scope).

**Explicitly OUT of scope — do not do these:**
- Do **not** add `traceId` arguments to callers (`insights-ai`, `reasoner`, etc.). A later slice may thread request-spanning ids; this one must not.
- Do **not** touch `ledger.ts`, `client.ts`, the schema, `/traces` UI, or any scanner.
- Do **not** backfill. The historical data is gone; **inventing ids for 9,466 orphan rows would fabricate correlations that never existed** and is a direct honesty-rail violation.
- Do **not** change `caller` semantics.

## 4. Tests (hermetic — SPEC 20 rails)

Add to `server/gateway/router.test.ts` (or the nearest existing gateway router test file; reuse its stub/seam idiom — **no real network, no real codex spawn**):

1. **Mints when absent** — call `gatewayComplete` with no `traceId`; assert the ledger row's `trace_id` is a non-empty string.
2. **One request, one id across hops** — force the first chain member to fail and the second to succeed; assert **two** ledger rows, and that **both carry the same non-null `trace_id`**. *This is the test that proves the fix — it is the whole point of the slice.*
3. **Explicit id wins** — pass `traceId: "caller-supplied"`; assert the row carries exactly that.
4. **Distinct invocations get distinct ids** — two separate `gatewayComplete` calls produce two different `trace_id`s (guards against a module-level constant).
5. **Failure-only path** — every chain member fails; assert all rows share one id and `success=0`.

## 5. Evidence gates (all required before commit)

- `bun run check` clean.
- Focused gateway/router tests green; **full suite green with no regression** (baseline 1166/0) and **hermetic**: 0 `codex` processes spawned, builder run-dir listings unchanged.
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live verification after restart** (the acceptance test):
  ```bash
  # BEFORE (record it):
  sqlite3 /var/lib/control-surface/dashboard.sqlite \
    "SELECT SUM(trace_id IS NULL OR trace_id='') || ' of ' || COUNT(*) FROM gateway_calls;"   # 9466 of 9471

  # restart control-surface.service, let real traffic flow (insights-ai runs continuously)

  # AFTER — new rows must carry ids:
  sqlite3 /var/lib/control-surface/dashboard.sqlite \
    "SELECT COUNT(*) FROM gateway_calls WHERE ts > <restart_ts> AND (trace_id IS NULL OR trace_id='');"   # expect 0

  # AND multi-hop requests must group:
  sqlite3 /var/lib/control-surface/dashboard.sqlite "
    SELECT trace_id, COUNT(*) hops, MAX(success) ok FROM gateway_calls
    WHERE ts > <restart_ts> AND trace_id IS NOT NULL
    GROUP BY trace_id HAVING hops > 1 LIMIT 5;"    # expect ≥1 multi-hop group once a fallback fires
  ```
- Edge `control.techinsiderbytes.com` 200.

## 6. Rails

- Never touch `/opt/newsbites` or `/opt/know`. Never write `/etc/litellm/config.yaml`.
- No secrets committed. No force-push. Kill by PID.
- Restart `control-surface.service` only at a clean green checkpoint.
- **Honesty:** old rows stay `NULL` and every surface must keep saying "call-level" for pre-R0 data. R0 **starts the clock** — it does not repair history. Any report mixing pre- and post-R0 rows must say so.

## 7. Why this is R0 and not R1

It is the only repair that is **pure loss while it waits** — every hour without ids is unrecoverable evidence. It also gates the verification standard for R1–R5 (R6 asks "did real work succeed?", which is unanswerable today) and unblocks Catalog S §2.3's waste metric plus M21. Cost: ~3 lines.
