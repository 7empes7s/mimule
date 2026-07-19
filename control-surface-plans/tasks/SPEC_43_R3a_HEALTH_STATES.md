# SPEC 43 — R3a: Health states become first-class (CS read-path)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` §3 (R3). **Author:** Opus (planner). **Builder:** Codex.
**Operator ask (2026-07-17):** *"make sure that the active/available/healthy models are separated from the unavailable/unhealthy and so on."*

## Scope boundary — READ THIS FIRST

R3 is two fused things. This spec builds **only the CS read-path half (R3a)**:

- **IN scope:** a Control-Surface-side classifier that derives a first-class health state per model from data **already on the box**, exposes it on the `/models` API, and renders a **healthy vs unhealthy** separation on the `/models` page.
- **OUT of scope (this is R3b, a later dry-run session):** changing how `model-fallback-reprobe.py` builds chains (deprioritize `limited` to tail, exclude `slow` from interactive, quarantine `degraded`). **Do NOT touch `/opt/mimoun/*`, `/etc/litellm/config.yaml`, or any routing behavior.** This spec is pure CS read-path.

**Rails:** CS reads only. No writes to litellm config or the reprobe. `bun run check` clean, full suite green, fresh-host gate 41/41 `LEAK=no`. Do not modify `server/api/router.ts` or the fresh-host `REPORT.*` (uncommitted SPEC 35 work lives there — leave it alone).

---

## The problem (one line)

Today `/models` classifies every model with `computeQualityStatus(available, hasError)` — a near-binary derived **only** from `model-health.json`'s `available` flag. It never reads the reprobe's per-model `history:{code,streak,ms}` (which R1 just built) nor the `gateway_calls` ledger's real outcomes. So *slow* is indistinguishable from *hang*, and *throttled-to-death* from *live* — the exact collapse that produced Bugs 1 and 2. **The truth is already on the box, unread.**

## The taxonomy (the shared vocabulary — REPAIR_PLAN §3)

Seven states. `healthy` = routable; `unhealthy` = not routable / needs a human.

| State | Bucket | Signal (how to derive it) |
|---|---|---|
| **live** | healthy | probe `200` and fast (`ms < 5000`); OR recent ledger success present and no contrary signal |
| **limited** | healthy | probe `429` **and** the ledger shows ≥1 success in the window (throttled-but-working) |
| **slow** | healthy | probe `200` with `ms` in `[5000, 30000)`, OR ledger avg latency ≥ 5000ms |
| **degraded** | unhealthy | **earned history** (ledger all-time ≥ 50 calls at ≥ 60% success) **AND** now failing: recent-window success = 0% over ≥ 5 recent calls with `auth`/`rate_limit`-class errors, OR probe now returns a hard `401/403/402`. *"Was good, now failing — fix, don't prune."* |
| **dead** | unhealthy | probe hard `4xx` (`400/404`) with no earned history; OR ledger 0% over ≥ 20 recent calls **and** no earned history |
| **hang** | unhealthy | probe `code` is `0`/`null` **and** `streak ≥ 3` (matches reprobe `HANG_STREAK`) |
| **unknown** | (its own bucket) | insufficient signal: no probe entry **and** no ledger rows. Honest — **never** default a real model to a fake state. |

**Precedence (evaluate in this order, first match wins):** `degraded` → `hang` → `dead` → `limited` → `slow` → `live` → `unknown`.
Rationale: the most-actionable / most-dangerous states win. `degraded` first because it is the one that must not be silently bucketed as `dead` (it's the crown jewel — a proven-good route with an expired credential). `hang` before `dead` because a 3× hang is worse (stalls chains).

### The infra-artifact guard (carry the BUG-1→BUG-2 lesson in)

When computing recent-window ledger success for `degraded`/`dead`, you **MUST exclude**:
- `backend = 'cli-direct'` (accounting rows, not outcomes — SPEC 37 §4), and
- `error_class = 'gateway_unreachable'` (LiteLLM-restart artifacts — SPEC 40 / infra-retry).

Same exclusions R8 established in `readRoutingReliability`. A model whose only recent "failures" are `gateway_unreachable` is **not** degraded/dead — those are restart casualties, not model deadness. A unit test must prove this guard.

---

## 1. New file — `server/api/modelHealthState.ts`

Pure, dependency-free classifier + its input type. No DB, no fs in this file (callers pass assembled signals in — keeps it unit-testable with plain fixtures).

```ts
export type HealthState = "live" | "limited" | "slow" | "degraded" | "dead" | "hang" | "unknown";
export type HealthBucket = "healthy" | "unhealthy" | "unknown";

export interface HealthSignals {
  // from model-fallback-reprobe.json history[logicalName] (may be absent)
  probeCode?: number | null;      // 200, 429, 402, 401, 000→0, etc.
  probeMs?: number | null;        // probe latency
  probeStreak?: number | null;    // consecutive same-code streak
  // from gateway_calls ledger, recent window (7d), already excluding cli-direct + gateway_unreachable
  recentCalls?: number;
  recentSuccesses?: number;
  recentAuthErrors?: number;
  recentRateLimitErrors?: number;
  recentAvgLatencyMs?: number | null;
  // from gateway_calls ledger, all-time (for "earned history"), same exclusions
  allTimeCalls?: number;
  allTimeSuccesses?: number;
  // from model-health.json (fallback signal when probe/ledger silent)
  available?: boolean | null;
}

export interface HealthVerdict {
  state: HealthState;
  bucket: HealthBucket;   // healthy: live/limited/slow · unhealthy: degraded/dead/hang · unknown: unknown
  reason: string;         // one plain sentence — the "why", never empty for a non-unknown state
}

export function deriveHealthState(s: HealthSignals): HealthVerdict;
export function healthBucket(state: HealthState): HealthBucket;
```

**Reason strings must be specific and human**, e.g.:
- degraded: `"earned 80.8% over 526 calls, now 0/32 in 7d on auth errors — likely an expired credential"`
- limited: `"rate-limited (429) but 25/80 succeeded this week — throttled, not dead"`
- hang: `"no answer in 30s, 3× consecutive"`
- dead: `"0/55 in 7d, 46 rate-limits, never earned a working record"`
- live: `"200 in 1.1s; 1477/1557 this week"`
- unknown: `"no probe entry and no ledger calls — not yet observed"`

**Thresholds as named consts** at the top of the file (so R3b/tuning is one edit): `EARNED_MIN_CALLS=50`, `EARNED_MIN_RATE=0.60`, `DEGRADED_RECENT_FLOOR=5`, `DEAD_RECENT_FLOOR=20`, `SLOW_MS_LO=5000`, `SLOW_MS_HI=30000`, `HANG_STREAK=3`.

Guard against malformed input the way R1 did: any missing/NaN field is treated as "no signal", never throws. If nothing is known → `unknown`.

## 2. New file — `server/api/modelHealthState.test.ts`

Unit tests, one per state from a representative fixture, plus the guards:
- live / limited / slow / dead / hang / unknown — each from its signal shape.
- **degraded** from the `coding-go-minimax-m3` shape (earned 80.8%/526, recent 0/N with auth).
- **degraded infra-guard:** earned history + recent failures that are **all** `gateway_unreachable`/`cli-direct` (i.e. `recentCalls=0` after exclusion) → **NOT** degraded (falls through to whatever probe says, or `unknown`). This is the BUG-1→BUG-2 lesson as an assertion.
- **hang hysteresis parity:** `probeCode=0, streak=2` → NOT hang; `streak=3` → hang.
- precedence: earned-history + auth + `probeCode=0/streak=3` → `degraded` wins over `hang`.
- `healthBucket()` maps all seven correctly.

## 3. `server/api/models.ts` — join the three sources, add the field

In `modelsHandler()`:
1. Read the reprobe state file. Add a `reprobeStatePath()` helper: `process.env.DASHBOARD_REPROBE_STATE_PATH || '/var/lib/mimule/model-fallback-reprobe.json'`. Load with `readJsonFileAtomic(..., { fallback: {} })` (honest-degrade — absent file is a valid fresh-host state, never a 500). Shape: `{ history?: Record<string, { code?, streak?, since?, ms? }> }`.
2. Read recent + all-time ledger aggregates in **two batch queries** (not N per model) via `getDashboardDb()`, mirroring R8's exclusions. Build a `Map<resolved_model, {...}>`. Recent window = `ts >= (now - 7d)*... ` (ms epoch — `ts` is ms). Queries:
   - recent: `SELECT resolved_model, COUNT(*) n, SUM(success) ok, SUM(CASE WHEN error_class='auth' THEN 1 ELSE 0 END) auth, SUM(CASE WHEN error_class='rate_limit' THEN 1 ELSE 0 END) rl, AVG(latency_ms) avg_ms FROM gateway_calls WHERE ts >= ? AND backend != 'cli-direct' AND (error_class IS NULL OR error_class != 'gateway_unreachable') GROUP BY resolved_model`
   - all-time: same WHERE minus the `ts` bound, selecting `COUNT(*), SUM(success)`.
   - If `getDashboardDb()` returns null / throws → skip ledger signals (degrade to probe + model-health only). Never 500.
3. For each model, assemble `HealthSignals` (join key: the ledger uses `resolved_model`; match on `m.resolvedModel ?? m.modelId ?? m.logicalName`, and also try `m.logicalName` — a model may be keyed either way; prefer whichever has ledger rows). Call `deriveHealthState`.
4. Add to each returned model object: `healthState: verdict.state`, `healthBucket: verdict.bucket`, `healthReason: verdict.reason`. **Keep `qualityStatus` exactly as-is** (existing tests/consumers depend on it — do not remove or repurpose it).
5. Add to `summary`: `healthStateSummary: { live, limited, slow, degraded, dead, hang, unknown }` (counts), and `healthBucketSummary: { healthy, unhealthy, unknown }`.
6. The `catch` honest-degrade branch: add `healthStateSummary`/`healthBucketSummary` as all-zero so the shape is stable.

## 4. `app/routes/ModelsPage.tsx` — separate healthy from unhealthy

The literal operator ask. Minimum viable, consistent with the existing table (see `project_control_surface_ux_table_standard`):
1. Extend the row type with `healthState`, `healthBucket`, `healthReason`.
2. Add a **Health** column with a state badge. Colors: live=green, limited=amber, slow=blue, degraded=orange (a "needs attention" look — distinct from dead), dead=red, hang=dark-red/maroon, unknown=gray. Reuse the existing `Pill` + a `healthStateColor(state)` helper next to `qualityColor`.
3. **Separate the list into two labelled sections** (or a segmented filter defaulting to show both, grouped): **Healthy** (live/limited/slow) and **Needs attention** (degraded/dead/hang), plus a small **Unobserved** (unknown) group. The operator must see the split at a glance. Keep sort/search/pagination working within the existing table behaviour.
4. **Reason on row-expand, never silent** (UX standard): expanding a row shows `healthReason`. Degraded rows get a visible inline callout (e.g. an amber "⚠ likely credential — recover, don't drop" line) since that's the state that matters most.
5. Add health counts to the summary bar (e.g. `Pill`s: `healthy N`, `needs attention M`, `unobserved K`). Keep the existing `availableByCapability`/`qualitySummary` pills.

## 5. `server/api/models.test.ts` — API assertions

Add cases: `modelsHandler()` output includes `healthState`/`healthBucket`/`healthReason` on each model and `healthStateSummary`/`healthBucketSummary` on `summary`; and honest-degrade (missing reprobe file + null dashboard db → all models `unknown` or probe-only, `summary` zeroed, HTTP 200 not 500). Use the existing test's fixture/env-override style; do not weaken existing assertions.

## 6. Acceptance

- `bun run check` clean; `bun test` full suite green (new unit + API tests pass; nothing regressed).
- `curl -s localhost:3000/api/models` → 200, each model carries `healthState`+`healthReason`, `summary.healthBucketSummary` present.
- On live data: `editorial-heavy` → live; `zen-deepseek-v4-flash-free` → dead (0/55, rate-limits); a 429-with-successes model → limited; `zen-nemotron-3-ultra-free` → slow or live (never hang from a single probe).
- fresh-host gate 41/41 `LEAK=no` (absent reprobe/ledger → `unknown`, no crash, no fake zero).
- **No file outside this list touched:** `server/api/modelHealthState.ts` (new), `server/api/modelHealthState.test.ts` (new), `server/api/models.ts`, `server/api/models.test.ts`, `app/routes/ModelsPage.tsx`. **Not** `server/api/router.ts`, not `/opt/mimoun`, not `/etc/litellm`.
