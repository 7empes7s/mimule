# SPEC 41 — R8: /ratings false zeros (read the ledger, not the empty table)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §2c (BUG 4 / R8) · **Date:** 2026-07-17 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair. Backend-only (`server/api/models.ts`). **No schema/migration. No frontend.**

---

## 1. The finding (operator-screenshotted)

The model-detail page for `groq-openai-gpt-oss-120b` renders **"0 routed calls, 0 ok, 0 failed, avg latency —"**. The ledger says **68 calls**. That is a **false zero** — a positive claim of "unused" about a model called 68 times, 67 of them failures. An honest empty state teaches; a false zero lies with a number on it, and it is the one thing the trust moat cannot survive.

## 2. Root cause

`readRoutingReliability(logicalName)` (`server/api/models.ts:167`) queries **`litellm_routing_log`** in the observability DB — a table that has **0 rows, ever** (nothing writes it). So every model returns the zero-row branch. The truth lives in **`gateway_calls`** (dashboard DB), keyed by `resolved_model`. This is the plan's headline disease exactly: *the product reads its designated source (empty) instead of reality (populated).*

## 3. The change (`server/api/models.ts`, `readRoutingReliability` only)

Repoint the query from `getObservabilityDb()` / `litellm_routing_log` to `getDashboardDb()` / `gateway_calls`. **`getDashboardDb` is already imported** (line 1; used at line 125). Verified keying (live):
- `resolved_model = <logicalName>` is the correct match. The ledger records the **route name** in `resolved_model` (e.g. `groq-openai-gpt-oss-120b`, `editorial-heavy`), not the backend id.
- Works for **fallback targets** (`resolved_model='groq-openai-gpt-oss-120b'` → 68) **and primaries** (`resolved_model='editorial-heavy'` → 4707/4175 ok, cleanly separated from its own fallback hops which appear as their own `resolved_model` rows). This is the correct "how did model X do when it was the one actually attempted" semantic.

New query:
```sql
SELECT
  COUNT(*)                                   AS totalRequests,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failedCount,
  AVG(latency_ms)                            AS avgLatencyMs
FROM gateway_calls
WHERE resolved_model = ?
  AND backend != 'cli-direct'                         -- SPEC 37 §4: accounting rows, not outcomes
  AND (error_class IS NULL OR error_class != 'gateway_unreachable')  -- SPEC 40 §4: infra, not model
```
Both exclusions are **mandatory** and are the whole reason those specs recorded the downstream rule — a model is not "failing" because a CLI lane logged usage or because LiteLLM was bouncing.

- `fallbackCount`: **keep the field, set it to `0`** with a comment — per-hop fallback attribution requires `trace_id` grouping (post-R0 only) and is **not rendered on this surface** (the model-detail block shows only totalRequests/successCount/failedCount/avgLatencyMs; `fallbackCount` is consumed by other surfaces fed elsewhere). Do not fabricate it.
- **Preserve the two existing return shapes:** `null` when the DB is unavailable (the honest "not available" path — now a dashboard-DB check), and `{totalRequests:0, …}` when there genuinely are zero matching rows. The difference now: a zero is a **true** zero (this model was never the resolved target), never the old false zero.
- Keep the `try/catch → return null` guard.

## 4. Strictly out of scope
- **Do NOT touch GRC readiness / eval history.** "insufficient eval history" reads `model_eval_runs`, which is **genuinely empty** — that is an *honest* not-configured state, not a false zero. Whether gateway outcomes should count as GRC evidence is a Catalog S ratings-feature question, not a repair.
- Do not touch `classifyError`, the reprobe, `server/api/router.ts` (uncommitted SPEC 35), the schema, or any frontend file.
- The frontend null-state message still says "observability database" — leave it (it only renders when the DB is unavailable, a near-unreachable edge on a live/SQLite-always host; cosmetic, tracked as a nit, not worth a frontend change + visual-gate churn in this slice).

## 5. Tests (hermetic — extend `server/api/models.test.ts`; reuse the `INSERT INTO gateway_calls` seed idiom from `cost.test.ts`/`reports.test.ts`)

1. **The false-zero is gone** — seed 68 `gateway_calls` rows with `resolved_model='groq-openai-gpt-oss-120b'` (1 success, 67 fail) ⇒ `totalRequests=68, successCount=1, failedCount=67`. *This is the regression test — reproduce the screenshot.*
2. **Primary keying** — rows with `resolved_model='editorial-heavy'` ⇒ counted; rows with `logical_model='editorial-heavy'` but a different `resolved_model` are **not** attributed to editorial-heavy.
3. **Excludes `cli-direct`** — a `backend='cli-direct'` row for the model is not counted.
4. **Excludes `gateway_unreachable`** — a `success=0, error_class='gateway_unreachable'` row is not counted (not a failure, not a total).
5. **True zero** — a model with no matching rows ⇒ `{totalRequests:0,…}` (honest), and this is asserted to come from the *ledger* path (seed an unrelated model's rows; assert the queried model still reads 0).
6. **avgLatencyMs** — averages `latency_ms` over the matched rows.

## 6. Evidence gates
- `bun run check` clean.
- Focused `models.test.ts` green; **full suite green, no regression** (baseline **1191/0**), hermetic (0 codex procs).
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live after restart:** `GET` the model detail for `groq-openai-gpt-oss-120b` (or query the handler) ⇒ routing shows **68 routed calls, 1 ok, 67 failed**, not 0. Confirm a genuinely-unrouted model still shows an honest 0.

## 7. Rails
- Touch only `server/api/models.ts` + `server/api/models.test.ts`.
- No commit, no restart by the builder — leave in the working tree for review (Claude verifies, commits, restarts).
- The `gateway_unreachable` exclusion depends on SPEC 40 (`bb4ce72`, already shipped) — the class exists in the ledger going forward.
