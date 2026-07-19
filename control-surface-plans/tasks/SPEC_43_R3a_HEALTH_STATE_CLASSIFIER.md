# SPEC 43 — R3a-1: health-state classifier (backend, read-path)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §3 (R3, the operator's explicit "separate healthy from unhealthy" ask) · **Date:** 2026-07-18 · **Builder:** Codex (gpt-5.6-sol, high) · **Verifier:** Claude
**Type:** repair (read-path). Backend-only (`server/api/models.ts` + one new module + tests). **No schema/migration. No frontend (that is SPEC 44). No reprobe change (that is R3b, held).**

---

## 1. The finding

`/models` derives each model's status from **one binary signal** — `model-health.json`'s `available` flag — via `computeQualityStatus(available, hasError)` → healthy/degraded (`server/api/models.ts:67`, `:320`). That collapse **is** Bugs 1 and 2: *slow* is indistinguishable from *hang*, *throttled-forever* from *live*, and the one state that matters most — **a proven-good route that just lost its credential** — has no name, so it is silently dropped.

Two richer signals already sit on the box, **both unread by this surface**:
- **Reprobe state** `/var/lib/mimule/model-fallback-reprobe.json` — now carries per-model `history: {code, streak, since, ms}` (R1, SPEC 39). Codes are HTTP-ish: 200/429/401/404/410/402/400/403/0. **No CS code reads this file** (grep: 0 hits).
- **Ledger** `gateway_calls` — 9,471 real outcomes keyed by `resolved_model`, with `error_class` and `latency_ms`. R8 already repointed `/ratings` here.

R3a introduces the plan's §3 taxonomy as a **derived classification** from those two signals, and separates healthy from unhealthy. **This slice is the classifier + API field only.** The reprobe still prunes on its own binary logic (R3b, held for dry-run) — we are not changing routing, only telling the truth about it.

## 2. The vocabulary (plan §3) — `HealthState`

```ts
export type HealthState = "live" | "limited" | "slow" | "degraded" | "dead" | "hang" | "unknown";
```

| State | Group | Meaning | Real example (live data 2026-07-18) |
|---|---|---|---|
| **live** | healthy | reachable + succeeding | `editorial-heavy` 89.1%, 1477/1557 recent |
| **limited** | healthy | rate-limited (429) but still serving | probe-429 models with recent successes |
| **slow** | healthy | responds, but ≥5s | `nvidia-deepseek-v4-flash` probe 9862ms |
| **degraded** | attention | **was healthy, now failing (auth/quota)** — fix, don't prune | `coding-go-minimax-m3` 80.8%/526 → **0%/10 recent, 11 auth** |
| **dead** | attention | 4xx, or 0% over n≥20 recent | `zen-deepseek-v4-flash-free` 0%/192 |
| **hang** | attention | probe code 0 × ≥3 consecutive | (none right now — R1 fixed the flap; rule must still exist) |
| **unknown** | unknown | no probe entry AND no recent traffic — **honest absence** | fresh/idle models |

`degraded` is the headline — *"a route that earned 526 calls deserves an incident, not a delete."* It is precisely the state the current binary cannot express.

## 3. The classifier — new module `server/api/modelHealthState.ts`

Pure function, no I/O, fully unit-testable. **All thresholds are named constants at the top of the file** (easy tuning; the tests pin them).

```ts
const SLOW_MS = 5000;              // ≥ this = slow, not live
const HANG_STREAK = 3;             // probe code 0 this many cycles running = hang
const DEAD_RECENT_N = 20;          // n≥ this at 0% recent = dead
const DEGRADED_ALLTIME_N = 20;     // "was healthy" needs this much all-time history
const DEGRADED_ALLTIME_RATE = 0.5; // and at least this all-time success
const RECENT_MIN_N = 3;            // minimum recent calls to trust a recent rate
const RECENT_HEALTHY_RATE = 0.5;   // recent success ≥ this = live

export interface HealthSignals {
  probe: { code: number; streak: number; ms: number } | null;   // reprobe history[logicalName]
  ledger: {
    allTimeN: number; allTimeSuccess: number;
    recentN: number; recentSuccess: number;                       // last 7d
    recentAuth: number; recentRateLimit: number;                  // last-7d failure breakdown
    recentAvgLatencyMs: number | null;
  } | null;
}
export interface HealthVerdict { state: HealthState; signal: string; }  // signal = the human "why"
export function deriveHealthState(s: HealthSignals): HealthVerdict;
export function healthGroup(state: HealthState): "healthy" | "attention" | "unknown";
```

**Priority-ordered rules (first match wins).** `p = s.probe`, `l = s.ledger`; rates computed only when `n>0`.

1. **hang** — `p && p.code === 0 && p.streak >= HANG_STREAK`. signal: `"no probe response, ${streak} cycles running"`.
2. **degraded** — `l && l.allTimeN >= DEGRADED_ALLTIME_N && (l.allTimeSuccess/l.allTimeN) >= DEGRADED_ALLTIME_RATE && l.recentN >= RECENT_MIN_N && l.recentSuccess === 0 && (l.recentAuth > 0 || (p && [401,402,403].includes(p.code)))`. signal: `"was ${allTimeRate}% over ${allTimeN} calls, now 0% recent — ${recentAuth} auth failures, likely expired credential"`.
3. **dead** — `(l && l.recentN >= DEAD_RECENT_N && l.recentSuccess === 0) || (p && [400,401,403,404,410].includes(p.code))`. signal names the dominant recent cause (`"0% over ${recentN} recent calls — mostly ${auth|rate limits|errors}"`) or `"probe HTTP ${code}"`.
4. **limited** — `(p && p.code === 429) || (l && l.recentN >= RECENT_MIN_N && l.recentSuccess > 0 && l.recentRateLimit >= 1 && (l.recentSuccess/l.recentN) < RECENT_HEALTHY_RATE)`. signal: `"rate-limited (HTTP 429)"` / `"throttled — ${recentRateLimit} of ${recentN} recent were rate limits"`.
5. **slow** — `(p && p.code === 200 && p.ms >= SLOW_MS) || (l && l.recentAvgLatencyMs !== null && l.recentAvgLatencyMs >= SLOW_MS && l.recentN >= RECENT_MIN_N)`. signal: `"responds in ${sec}s — slow but working"`.
6. **live** — `(p && p.code === 200) || (l && l.recentN >= RECENT_MIN_N && (l.recentSuccess/l.recentN) >= RECENT_HEALTHY_RATE)`. signal: `"healthy"` / `"${recentRate}% over ${recentN} recent calls"`.
7. **unknown** — else. signal: `"no recent probe or traffic"`.

`healthGroup`: `{live,limited,slow}→"healthy"`, `{degraded,dead,hang}→"attention"`, `{unknown}→"unknown"`.

**Discipline (non-negotiable):** never fabricate a positive state. No probe AND no recent ledger ⇒ **unknown**, not `live`. This is the same rule as R8 (a false "healthy" is as toxic as a false zero).

## 4. Reading the two signals (helpers in `server/api/models.ts`)

**Reprobe reader** — mirror `modelHealthPath()`:
```ts
function modelReprobePath(): string {
  return process.env.DASHBOARD_MODEL_REPROBE_PATH || '/var/lib/mimule/model-fallback-reprobe.json';
}
```
Read with the existing `readJsonFileAtomic<{ history?: Record<string, {code:number;streak:number;since:number;ms:number}> }>(modelReprobePath(), { fallback: {} })`. Absent file / missing `history` ⇒ every model's `probe = null` (fresh-host safe — no crash, models fall to ledger/unknown).

**Ledger reader** — one aggregate query (extends R8's `gateway_calls` usage; `getDashboardDb` already imported). For each `resolved_model`, compute all-time and last-7d counts **with the two mandatory exclusions**:
```sql
SELECT resolved_model AS m,
  COUNT(*) AS allTimeN,
  SUM(success) AS allTimeSuccess,
  SUM(CASE WHEN ts >= :cut7d THEN 1 ELSE 0 END) AS recentN,
  SUM(CASE WHEN ts >= :cut7d THEN success ELSE 0 END) AS recentSuccess,
  SUM(CASE WHEN ts >= :cut7d AND success = 0 AND error_class = 'auth' THEN 1 ELSE 0 END) AS recentAuth,
  SUM(CASE WHEN ts >= :cut7d AND success = 0 AND error_class = 'rate_limit' THEN 1 ELSE 0 END) AS recentRateLimit,
  AVG(CASE WHEN ts >= :cut7d THEN latency_ms END) AS recentAvgLatencyMs
FROM gateway_calls
WHERE backend != 'cli-direct'                                       -- SPEC 37 §4
  AND (error_class IS NULL OR error_class != 'gateway_unreachable') -- SPEC 40 §4
GROUP BY resolved_model
```
Build a `Map<resolvedModel, ledgerStats>`. A model absent from the map ⇒ `ledger = null`. `cut7d = Date.now() - 7*86400*1000`. Wrap in try/catch → `null` map on DB error (fresh-host safe), exactly like R8.

**Both exclusions are mandatory and are the whole point** — a model is not "dead" because a CLI lane logged usage or because LiteLLM was bouncing (SPEC 37/40). Reuse, do not re-derive.

## 5. Wire into `modelsHandler` (additive — do not remove `qualityStatus`)

For each mapped model, look up `probe = history[m.logicalName] ?? null` and `ledger = ledgerMap.get(m.logicalName) ?? null`, call `deriveHealthState`, and **add three fields** to the returned object:
```ts
healthState: verdict.state,       // HealthState
healthSignal: verdict.signal,     // the "why" string
healthGroup: healthGroup(verdict.state),
```
Keep `qualityStatus`, `available`, `uptime`, everything else **unchanged** — the existing block/probation modal actions and the frontend both still read them; this is purely additive so nothing regresses.

Add a `healthSummary` to the response `summary` (counts per state), alongside the existing `qualitySummary` (leave `qualitySummary` intact):
```ts
healthSummary: { live, limited, slow, degraded, dead, hang, unknown }  // integer counts
```

## 6. Strictly out of scope
- **No frontend** — SPEC 44 consumes `healthState`/`healthSignal`/`healthGroup`/`healthSummary`. This slice ends at the API.
- **No reprobe change** — the reprobe keeps its current prune logic (R3b, held for a dry-run session; changing live routing is not this slice).
- Do not touch `computeQualityStatus`, `qualityStatus`, `qualitySummary`, the promotion-readiness code, `readRoutingReliability` (R8), `classifyError`, `server/api/router.ts` (uncommitted SPEC 35), the schema, or any GRC surface.
- Do not backfill or write anything — read-only.

## 7. Tests

**A. `server/api/modelHealthState.test.ts` (new, pure-unit — one assertion per rule branch, using the real-data examples):**
1. **live** — probe `{code:200, ms:800, streak:6}`, ledger 89% recent ⇒ `live`, group `healthy`.
2. **slow** — probe `{code:200, ms:9862}` ⇒ `slow` (the nvidia-deepseek case), group `healthy`.
3. **limited** — probe `{code:429}` with recent successes ⇒ `limited`, group `healthy`.
4. **degraded** — ledger `allTimeN:526, allTimeSuccess:425, recentN:10, recentSuccess:0, recentAuth:11`, probe null ⇒ `degraded`, group `attention`; signal contains "likely expired credential". *This is the minimax-m3 headline — the regression test for the state that didn't exist.*
5. **dead (ledger)** — ledger `recentN:55, recentSuccess:0, recentRateLimit:55` (zen-deepseek) ⇒ `dead`, group `attention`.
6. **dead (probe 4xx)** — probe `{code:404}` ⇒ `dead`.
7. **hang** — probe `{code:0, streak:3}` ⇒ `hang`, group `attention`.
8. **unknown** — probe null, ledger null ⇒ `unknown`, group `unknown`. **Never `live`.**
9. **priority** — degraded outranks dead (a was-healthy model with recentN≥20 at 0% and auth>0 ⇒ `degraded`, not `dead`) so the incident is not mislabeled a corpse.
10. **no-fabrication** — probe null + ledger `recentN:1` (below `RECENT_MIN_N`) ⇒ `unknown`, not `live`.

**B. Extend `server/api/models.test.ts` (hermetic — reuse the `DASHBOARD_MODEL_HEALTH_PATH` + `gateway_calls` seed idiom already present; add `DASHBOARD_MODEL_REPROBE_PATH` to the temp-file setup/teardown):**
11. **end-to-end degraded** — seed `model-health.json` with `coding-go-minimax-m3`, seed a reprobe json (or omit it), seed `gateway_calls` (526 rows 80.8% all-time incl. 10 recent 0% with 11 auth) ⇒ `modelsHandler` returns that model with `healthState:"degraded"`, `healthGroup:"attention"`, and `healthSummary.degraded >= 1`.
12. **cli-direct excluded** — a `backend='cli-direct'` row does not push a model toward any state.
13. **gateway_unreachable excluded** — a `success=0, error_class='gateway_unreachable'` row is not counted.
14. **fresh-host** — no reprobe file, no gateway_calls rows ⇒ all models `unknown`, handler returns 200 (no crash), `healthSummary` all-zero except `unknown`.
15. **qualityStatus untouched** — an existing assertion still passes (backward-compat guard).

## 8. Evidence gates
- `bun run check` clean.
- Focused `modelHealthState.test.ts` + `models.test.ts` green; **full suite green, no regression** (baseline **1203/0**), hermetic (0 codex procs).
- Fresh-host gate **PASS 41/41**, `CRASH=0 5xx=0 LEAK=no`.
- **Live after restart:** `GET /api/models` ⇒ `coding-go-minimax-m3` carries `healthState:"degraded"` with the credential signal; `editorial-heavy` is `live`; a genuinely idle model is `unknown` (not `live`). Confirm `healthSummary` counts are non-fabricated (sum == model count).

## 9. Rails
- Touch only `server/api/models.ts`, new `server/api/modelHealthState.ts`, `server/api/modelHealthState.test.ts`, `server/api/models.test.ts`.
- No commit, no restart by the builder — leave in the working tree for review (Claude verifies, commits path-scoped, restarts).
- **Do not** stage/commit `server/api/router.ts` or its tests (uncommitted SPEC 35).
- Additive only — every existing field and its consumers stay byte-for-byte behaviour-compatible.
