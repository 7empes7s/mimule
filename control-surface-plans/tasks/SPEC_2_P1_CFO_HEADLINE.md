# SPEC 2 — CFO Cost Headline on /cost (ULTRAPLAN P1.2 / R2)

**Repo:** /opt/opencode-control-surface. Files in scope: `server/api/cost.ts`, `server/api/cost.test.ts`, `app/routes/CostPage.tsx` (+ router.ts ONLY if a new route is needed).

## Goal
/cost opens with a CFO-grade headline band answering in 3 seconds: what are we spending, where is it heading, what did free-first routing save us.

## Deliverables
1. Extend the cost API (inside the existing envelope pattern `ok(data, sources)` from server/api/types.ts) with a `headline` object:
   - `monthToDateCents` — sum of gateway ledger cost for the current calendar month (UTC).
   - `projectedMonthEndCents` — MTD ÷ elapsed-days × days-in-month (null if <2 days elapsed).
   - `savedVsPaidBaselineCents` — for calls served by $0-cost (free-tier) models this month, estimate what they would have cost at a paid baseline. Use the `provider_price_catalog` table: baseline = the cheapest `cloud-paid` tier entry's input/output cents-per-1k applied to those calls' token counts. If token counts or catalog rows are missing, return null — NEVER invent a number.
   - `freeShare` — fraction of this month's calls that cost 0 (null when no calls).
2. CostPage: a stat-tile band at the top (reuse the existing StatCard/tile components and page style — match surrounding idiom): "Spend (MTD)", "Projected month-end", "Saved by free-first", "Free-routed share". Null fields render an honest em-dash with a "needs price catalog / token data" tooltip-style sub-line, not 0.
3. Tests in cost.test.ts: seeded ledger rows → correct MTD/projection/savings math; empty DB → nulls; missing catalog → savings null.

## Hard rails
- NO git commit/push, NO systemctl/restart, NO pkill, no files outside the scope list.
- `bun run check` clean + `bun test ./server/api/cost.test.ts` green before reporting.
- Be surgical: do not refactor unrelated code, do not reformat, match existing code style exactly.

## Report back
Changed files, test output tail, one-line description of the savings formula you implemented.
