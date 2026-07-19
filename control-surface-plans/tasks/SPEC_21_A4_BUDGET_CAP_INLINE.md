# SPEC 21 — ULTRAPLAN Phase 3 A4 (line 82): Budget cap set inline from /cost and /gateway

## Context (read first)
ULTRAPLAN A4: *"Budget cap set inline — edit caps from /cost and /gateway without settings dive
(medium)."* Work in `/opt/opencode-control-surface` (Bun + TS `server/`, Vite/React `app/`).
Do NOT commit/push/restart; leave changes uncommitted.

Existing surface at HEAD (verified — the BACKEND is essentially done; EXTEND, do not replace):
- `server/governance/budgets.ts`: `checkBudget`, `upsertBudget(scope, {projectId, dailyCapUsd,
  monthlyCapUsd, warnPct})`, `getBudgetSpending`; `governance_budgets` table (scope
  global/project, daily_cap_usd, monthly_cap_usd, warn_pct). The gateway enforces the GLOBAL
  budget on every call (`gateway.budget-stop` audit in `server/gateway/router.ts` ~line 295).
- `server/api/execute.ts`: dispatch for `mutate-policy:budget:global:set-cap` and
  `mutate-policy:budget:project:<projectId>:set-cap` ALREADY EXISTS (~line 502–539) with full
  param validation (dailyCapUsd/monthlyCapUsd 1–10000, warnPct 0.1–1, defaults 5/50/0.8).
  Enforcement: `mutate-policy` → confirm+reason (line ~76); risk: budget → "medium" (~line 99).
  Execute test 15 covers the project-scope happy path.
- `server/api/actionDescriptors.ts`: NO budget descriptor exists — that is gap #1. Section
  functions `addXxxActions(actions, ...)` + the `descriptor({...})` idiom; assembled ~line 612.
- `app/routes/CostPage.tsx`: budgets table is READ-ONLY (BudgetRow, budgetCapCents etc. ~line
  86–120); data includes `budgets` from the cost API. Gap #2: no inline edit.
- `app/routes/GatewayPage.tsx`: NO budget surface at all. Gap #3. The page's action idiom is
  `gatewayActions.request(...)` / window.confirm + prompt for reason (see the A4e pin flow).
- `app/routes/GovernancePage.tsx` budgets tab (`handleSetBudget` → POST /api/governance/budgets)
  is the current "settings dive" — leave it working unchanged.
- `GET /api/governance/budgets` returns `{budgets, spending}` (used by GovernancePage,
  30s poll via useAuthApi).

## Build this

### 1. Catalog descriptors (server/api/actionDescriptors.ts)
New `addBudgetActions(actions: ActionDescriptor[]): void`, called from the assembly block:
- ALWAYS emit `mutate-policy:budget:global:set-cap` — kind `"mutate-policy"`, targetType
  `"budget"`, risk `"medium"`, confirm true, reasonRequired true (must match
  `getEnforcement("mutate-policy","budget")`), title like "Set global budget caps",
  impactPreview mentioning that gateway calls are stopped when the cap is hit and the
  defaults ($5/day, $50/month, warn 80%), rollbackHint "Set new caps or raise them from
  /cost, /gateway, or the Governance page", sourceRoute `/cost`, requiresOnline true.
- For EACH existing `governance_budgets` row with scope "project" (read via the budgets
  module — add a small exported reader like `listBudgets()` to `server/governance/budgets.ts`
  if none exists; best-effort try/catch, DB-disabled → skip), emit
  `mutate-policy:budget:project:<projectId>:set-cap` (same kind/risk/flags, title naming the
  project). Do NOT invent projects that have no budget row.

### 2. CostPage inline edit (app/routes/CostPage.tsx)
- Each budgets-table row gets an "Edit caps" control (match the page's existing button/row
  idioms exactly): prompts for daily cap USD, monthly cap USD, warn % (prefill current values;
  validate client-side to the same 1–10000 / 0.1–1 ranges; allow keeping either cap), then
  reason prompt + window.confirm, then POST `/api/actions/execute` with
  `{actionId: "mutate-policy:budget:<scope...>:set-cap", params: {dailyCapUsd, monthlyCapUsd,
  warnPct}, reason, confirmed: true}` using the page's existing authenticated fetch idiom.
  Refresh the page data on success.
- If NO global budget row exists, show a "Set global caps" button above the table that runs
  the same flow with the global actionId.

### 3. GatewayPage budget card (app/routes/GatewayPage.tsx)
- New compact "Budget" card near the status/circuits area: fetch `GET /api/governance/budgets`
  (useAuthApi, 30s like the page's other data), show global daily/monthly caps, current spend,
  pct used (and the warn threshold), an honest "No global budget configured — gateway spend is
  uncapped" empty state, and an "Edit caps" / "Set caps" button running the SAME governed
  execute flow as CostPage (global scope only on this page).
- Match the page's existing card/styling idioms exactly.

### 4. Tests
- `actionDescriptors.test.ts`: global set-cap descriptor always present with medium risk +
  confirm + reason; project descriptor appears ONLY when a project budget row exists in the
  temp DB (insert via upsertBudget within tenant context — follow the file's temp-DB idiom).
- `execute.test.ts`: only if the GLOBAL set-cap happy path is not already covered, add it
  (mirror test 15); do not duplicate.
- Keep everything hermetic: temp `DASHBOARD_DB_PATH` per file; no network.

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts; no dev server on :3000.
- Do NOT edit `server/insights/autoapplyPolicy.ts` (budget set-cap must NOT become
  auto-appliable). Never widen `e2e/fresh-host/gate.sh` matchers.
- Do NOT change the existing execute.ts dispatch/validation, the enforcement/risk maps, the
  governance API, or GovernancePage behavior.
- Do NOT touch builder/runner/terminal files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/api/actionDescriptors.test.ts server/api/execute.test.ts server/api/governance.test.ts --timeout 30000` — all pass.
3. `git status --short` — ONLY: actionDescriptors.ts (+test), possibly execute.test.ts,
   governance/budgets.ts (if listBudgets added), CostPage.tsx, GatewayPage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed (one line each), the addBudgetActions snippet, the CostPage/GatewayPage edit-flow
snippets, test summary lines, and explicit confirmation that autoapplyPolicy.ts and the existing
execute dispatch are untouched.
