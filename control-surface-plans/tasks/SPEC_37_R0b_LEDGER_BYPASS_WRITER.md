# SPEC 37 — R0b: the second ledger writer

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` R0 (completion) · **Follows:** SPEC 36 (`9ba95af`) · **Date:** 2026-07-17
**Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair. Backend-only. **No schema/migration changes. No frontend changes.**

---

## 1. Why this exists

Operator directive after SPEC 36 landed: *"amend any scripts and automations that may break these new fixes."*

**Audit result: nothing breaks.** SPEC 36 only fills a column that was previously always `NULL`, and the sole reader already null-guards it (`server/api/traces.ts:92` — `const key = row.trace_id ?? \`__row_${row.id}\``, i.e. an un-traced row becomes its own single-call group). `dataExplorer.ts` just lists the column. No external script touches `gateway_calls` (`grep` over `/opt/mimoun/scripts/`, `ops/`, `scripts/` — clean). `model-fallback-reprobe.py` probes LiteLLM `:4000` directly and never touches the CS ledger. **R0 is non-breaking. Confirmed, not assumed.**

**But the audit found one real gap: `gateway_calls` has a *second* writer that bypasses the ledger.**

`server/builder/runnerAccounting.ts:105` INSERTs into `gateway_calls` directly rather than through `writeLedgerEntry`, with columns:
```
(ts, logical_model, resolved_model, backend, tier, cost_estimate_usd, success, caller)
```
**`trace_id` and `tenant_id` are both absent from the column list** — so SPEC 36's fix does not reach these rows. `success` is hardcoded to `1`.

### Honest scope — this is small
Live data (2026-07-17): **`backend='cli-direct'` = 2 rows.** Not the 477 `opencode-runner` rows initially assumed — those come through `gatewayComplete` and are already fixed by SPEC 36. `tenant_id IS NULL` across the whole table = **0 rows**, so the omitted `tenant_id` is currently masked (almost certainly by the ADD-COLUMN backfill) and is a **latent** inconsistency, not a live leak.

This slice is worth doing anyway for two reasons, neither of them the row count:
1. It is the **builder** path, and the builder is where lineage has to start (§3).
2. The function already holds `tenantId` in scope and uses it for the `cost_events` INSERT **immediately above** — omitting it from the `gateway_calls` INSERT ten lines later is an inconsistency that will bite the first time the backfill isn't there (i.e. **on a fresh host**).

## 2. The change

**`server/builder/runnerAccounting.ts` only:**
1. `recordRunnerUsage(opts)` gains an optional `traceId?: string | null` on its options type.
2. The `gateway_calls` INSERT adds **two** columns: `trace_id` (from `opts.traceId ?? null`) and `tenant_id` (from the `tenantId` const **already computed** at the top of the function for `cost_events` — do not re-derive it).

**`server/builder/runner.ts` at the single call site (`:2324`):**
3. Pass the builder's existing trace id. `runner.ts:2070–2078` **already** stamps `run.traceId` (and each `pass.traceId`) via `randomUUID()` on first reconcile — reuse it, do not mint a new one. Prefer the pass-level id when available, else the run-level id, else omit (`undefined` → `null`, current behaviour).

That is the whole change. No new table, no migration, no UI.

## 3. Why this is the M21 seam, not busywork

ULTRAPLAN **M21 (end-to-end lineage)** wants one drawer walking *incident → agent identity → builder pass → gateway call(s) → model → cost → outcome*. Passing the builder's existing `traceId` into the accounting row is **exactly the builder-pass → gateway-call join** that walk depends on. The id already exists; today it simply isn't carried across. Two rows today, but the seam is what matters — and this is the cheapest moment to put it in, while the writer is being touched anyway.

## 4. Do NOT change `success = 1` — and here is why

`recordRunnerUsage` is dedup-guarded per session (`hasRunnerUsageForSession`) and fires for **non-gateway CLI lanes** (`isNonGatewayCliLane`) — codex/claude/gemini CLIs that never traverse the gateway. Its rows are **usage accounting** (`backend='cli-direct'`, `cost_basis='cli-unmetered'`), not per-call outcomes. There is no per-call success to record: the lane ran or it didn't. Hardcoding `1` is *semantically correct for what this row means*.

**The real problem is that accounting rows live in the same table as call outcomes**, so they silently inflate any success-rate computed over `gateway_calls`. Do not paper over that here by inventing a fake success value.

**Instead — mandatory downstream note, carry it into Catalog S §2.2 (S5):** every success-rate, waste, and ratings computation **MUST exclude `backend='cli-direct'`**. Those rows are accounting, not outcomes. A leaderboard that counts them is measuring "did we invoke the CLI", not "did the model finish the job". Add this to the S5 spec when it is written.

## 5. Tests (hermetic — SPEC 20 rails)

Extend the existing `runnerAccounting` test file (or create one beside it, matching the module's stub idiom — **no real CLI spawn, no network**):
1. **Stamps a supplied trace id** — `recordRunnerUsage({..., traceId: "t-1"})` ⇒ the `gateway_calls` row has `trace_id='t-1'`.
2. **Omitted trace id stays null** — no `traceId` ⇒ `trace_id IS NULL` (current behaviour preserved; **must not mint one here** — an accounting row with an invented id would fabricate a correlation to nothing).
3. **Tenant is stamped** — the row's `tenant_id` equals the active tenant context, and **matches the `cost_events` row written by the same call**. This is the regression that would only surface on a fresh host.
4. **Dedup unchanged** — a second call for the same `sessionOrRunId` still writes nothing (guard the existing `hasRunnerUsageForSession` behaviour).
5. **Builder passes its id** — from `runner.ts`, assert the accounting row's `trace_id` equals the run/pass `trace_id` already stamped at `runner.ts:2070–2078`. *This is the test that proves the M21 seam.*

## 6. Evidence gates

- `bun run check` clean.
- Focused tests green; **full suite green, no regression** (baseline **1171/0** post-SPEC-36) and hermetic (**0 codex procs**, builder run-dir listings unchanged).
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- Live: after restart, a real builder pass produces a `cli-direct` row whose `trace_id` matches its pass — **or**, if no builder pass runs naturally, state that honestly and leave the live proof pending rather than forcing a synthetic pass.

## 7. Rails

- Touch **only** `server/builder/runnerAccounting.ts`, `server/builder/runner.ts` (the one call site), and the test file.
- **Do not** touch `server/api/router.ts` — unrelated uncommitted SPEC 35 work lives there; leave it completely alone.
- **Do not** route `runnerAccounting` through `writeLedgerEntry`. It is deliberately a different shape (accounting, not a call) and unifying them is a design decision, not a repair. Out of scope.
- **No backfill** of the 2 existing rows. Same rule as SPEC 36: inventing ids fabricates correlations that never happened.
- No commit, no service restart — leave changes in the working tree for review.
