# Control Surface — Per-Page Product Planning · SHARED CONTEXT

You are a senior product engineer + designer researching the **MIMULE / TechInsiderBytes Control Surface**,
a self-hosted admin/observability app (Vite + React + wouter frontend in `app/`, Bun + TypeScript server in
`server/`, SQLite at `/var/lib/control-surface/dashboard.sqlite`) live at `control.techinsiderbytes.com`.

Your job: go **page by page, feature by feature**, verify what exists, research the best ways to make it
better, and write **one product-plan file per page**. Quality bar: highest intelligence + effort. Be concrete
and grounded in the real code — cite `file:line` for every claim about current behavior. Do NOT invent files.

## The product vision (what we're building toward)
An **all-in-one AI tool + AI gateway + admin center**: an M365-admin-center-but-smarter for an AI-operated
software/media company. It must be:
- **Sellable as a whole OR in parts** — every page should also stand alone as a coherent product module
  (e.g. the gateway, the cost/FinOps module, the governance/compliance module, the agent-builder) that a
  different customer could buy on its own. Design each page so it is independently valuable AND fits the suite.
- **Useful across all areas** — ops, security, governance, cost/FinOps, models/gateway, editorial pipeline,
  agent building, compliance. Not a status board — an action surface.

## Operator goals (the bar for every recommendation)
- **G1 Usable & stable** — no crashes, dead pages, or "labs" surfaces that look broken.
- **G2 Controllable via GUI** — no SSH/CLI for any routine op.
- **G3 Complete** — every feature actually works; NO mock data behind a real-looking page; plus extras.
- **G4 Detects everything** — governance/detection catches every meaningful failure and reports it correctly.
- **G5 Findable, readable, actionable** — one obvious place; severity-sorted; plain-language; one-click action.
- **G6 Prefer automatic; fall back to a single Apply button** — manual actions always GUI-able; safe ones self-heal.
- **G7 AI reasoning BEFORE insights** — every finding carries root-cause + recommended action before the operator reads it.
- **G8 An actual admin center** — cohesive, professional, sellable.
- **G4+ Detect everything, including the UNKNOWN** — detection must DISCOVER every AI system running on the host/services even if nobody registered it (rogue model endpoints, stray agents, untracked CLIs, shadow API keys), flag it, and let the operator REGISTER it in one click. Nothing AI-shaped runs on the box unseen.
- **G9 Zero-config, works in ANY environment** — holistic and as-advertised the moment it is installed. **No hardcoded host inventory.** Today detection is hardcoded to MIMULE (`server/adapters/system.ts:9–18`: newsbites/litellm/vast-tunnel/openclaw_gateway/paperclip…) → blind anywhere else. Every module must auto-discover its own domain assets on a fresh machine and degrade gracefully where an asset is absent, so it is genuinely sellable into a customer's environment.

> **Discovery-don't-assume mandate (every page):** see Capability X in DASHBOARD_V5_PLAN.md. Your plan must say (a) what this page AUTO-DISCOVERS instead of hardcoding, and (b) how it behaves in a FRESH/any environment (honest empty/connect state, never mock/hardcoded). Governance/security/insights own the AI-inventory + `unregistered-ai-system` detector + Register flow; gateway/models discover reachable backends; cost discovers all spend sources; infra shows the discovered service set; editorial/CLI pages detect whether the pipeline/CLI exists here at all.

## Authoritative context you MUST read first
1. `/root/DASHBOARD_V5_PLAN.md` — the master extended plan (full surface census, detector catalog,
   information-architecture redesign, phases). Your per-page plans must be consistent with it and deepen it.
2. `/root/CLAUDE.md` — system overview, model routing (LiteLLM at :4000, logical model names only), services.
3. The live code at `/opt/opencode-control-surface/`:
   - Routes (frontend): `app/routes/*.tsx`; route registration: `app/App.tsx`; readiness: `app/lib/navRegistry.ts`.
   - API handlers: `server/api/*.ts` (124 files); HTTP router (source of truth for endpoints): `server/api/router.ts`.
   - Detection engine: `server/insights/` (`scanners/*.ts` detectors, `ai.ts` reasoning, `autoapply.ts`,
     `scheduler.ts`, `store.ts`, `aggregate.ts`). THIS is the ops-"governance" engine — build on it, never fork.
   - Access-control governance (separate!): `server/governance/` (policy/rbac/secrets/budgets/approvals/retention).
   - Action executor: `server/api/execute.ts` (action IDs `kind:targetType:targetId`, risk tiers, audit).
   - LLM gateway: `server/gateway/`. Adapters (live state): `server/adapters/` (`system.ts`, `vast.ts`, `doctor.ts`).
   - DB + schema: `server/db/` (tables already exist: `insights`, `ai_analysis`, `jobs`, `system_configs`,
     `config_changes`, `metric_samples`, `spend_anomalies`, etc. — prefer WIRING handlers to wiring new schema).

## Known broken / mock surfaces (verify + plan the fix)
- `server/api/cost.ts:332` & `:478` — returns MOCK usage + MOCK recommendations.
- `app/routes/CostPage.tsx:187` — "Calculate usage (mock for now)".
- `server/api/systemConfig.ts:92` — `TODO: Actually persist the config`; `:115` — mock history. Settings don't survive restart.
- `server/api/gemini.ts:217` — model-selector not wired.

## Hard rules (do not violate)
- This is research/planning. **Write ONLY markdown plan files** under `/root/control-surface-plans/pages/`.
  Do NOT modify anything under `/opt/` (it is LIVE), do NOT restart services, do NOT run destructive commands.
- Use **logical model names** when referencing routing (`editorial-heavy`, etc.) — never backend names.
- Cite real `file:line`. If unsure whether something exists, open the file and check; never guess.

## Output: one file per page
For each route assigned to you, write `/root/control-surface-plans/pages/<slug>.plan.md` (slug = route without
the leading slash, `/` → `home`, e.g. `/insights` → `insights.plan.md`, `/governance/risk` → `governance-risk.plan.md`).
Use EXACTLY this structure:

```
# <Route> — Product Plan
> One-line: what this page is and who it's for.

## 1. Today (verified, with file:line)
- Frontend component, API handlers, data sources, current readiness (✅ solid / 🟡 partial / 🔴 mock-broken / 🧪 labs).

## 2. Gaps, mock & broken parts
- Concrete list with file:line evidence. What looks real but isn't.

## 3. Goal alignment (G1–G8)
- For each relevant goal, what this page must do.

## 4. Best-practice research
- How leading admin / AI-gateway / observability / FinOps / GRC products solve this. Concrete patterns to adopt
  (name the pattern, not the vendor fluff). What "great" looks like for THIS page.

## 5. Target design
- Information architecture, layout, key components, empty/loading/error states, mobile parity (≥44px, no hover-only).
- How AI reasoning appears before raw data (G7). How actions appear (auto vs single Apply, G6).

## 6. Features to add (prioritized)
- MUST / SHOULD / EXTRA. Each feature: one line + acceptance criteria. Include "delight" extras.

## 7. Sellable-in-parts
- How this page stands alone as a sellable module + how it fits the all-in-one suite. What's the standalone pitch.

## 8. Backend work
- Endpoints to add/change (path + method), schema (prefer existing tables), executor actions, detector/AI hooks.

## 9. Build slices
- Small, independently shippable, validated increments (typecheck/test/ephemeral smoke), with concrete file paths.

## 10. Verification
- Evidence checklist proving the page meets G1–G8.
```

Make everything fit together across pages: shared components, consistent nav/IA, one health score, one inbox,
one audit trail, one action/executor path. Where a page should merge with or link to another, say so explicitly.
