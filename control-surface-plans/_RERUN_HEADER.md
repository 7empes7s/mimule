RERUN — these pages were planned by a session that did NOT read the real code (zero/near-zero file:line
citations, and at least one fabricated claim: a prior plan said the governance stack uses "OPA / Open Policy
Agent" — it does NOT). You are codex (high reasoning effort) redoing them PROPERLY and grounded.

FIRST read in full, in order:
1. /root/control-surface-plans/_CONTEXT.md   (task, vision, goals G1–G8, authoritative context, HARD RULES,
   and the EXACT 10-section per-page output format — follow it precisely)
2. /root/DASHBOARD_V5_PLAN.md                (master extended plan — align with and deepen it)
3. /root/CLAUDE.md                           (system + model-routing overview; logical model names only)

Then for EACH route below: open and READ the real backing code under /opt/opencode-control-surface (frontend
app/routes/*.tsx + app/App.tsx + app/lib/navRegistry.ts; backend server/api/router.ts + the named handlers +
server/governance/* + server/insights/* + server/db/*). Write ONE plan to
/root/control-surface-plans/pages/<slug>.plan.md using the EXACT 10-section structure in _CONTEXT.md.

GROUNDING BAR (non-negotiable — the prior session failed exactly here):
- EVERY claim in "## 1. Today" and "## 2. Gaps" MUST carry a real file:line you actually opened (e.g.
  `server/api/governance.ts:128`). Aim for ≥20 precise file:line citations per plan; a route backed by a
  600-line page + a real handler file has no excuse for fewer.
- NEVER invent a technology, file, table, or handler. If you did not open it, do not cite it. Do NOT assume
  generic stacks (no "OPA", no made-up tables) — verify against THIS repo only.
- Research the BEST design toward the vision (all-in-one AI tool + gateway + admin center; sellable whole or in
  parts; AI reasoning before insights G7; prefer-automatic single-Apply actions G6). Make pages fit together
  (shared components, one IA, one health score, one inbox, one audit/executor path); call out merges/links.
- Each plan must specify WHAT DOCUMENTATION the builder updates when implementing it.

DISCOVERY & ZERO-CONFIG LENS (NEW — operator directive 2026-06-28; apply to EVERY page you plan):
- The product must work in ANY environment as soon as installed, and must DETECT ALL AI SYSTEMS running on the
  machine/services even if unregistered, then let the operator REGISTER them in one click. Today detection is
  hardcoded to MIMULE (`server/adapters/system.ts:9–18`) → blind elsewhere. See Capability X + Phase 4a +
  goals G4/G9 in /root/DASHBOARD_V5_PLAN.md (read them).
- In EACH plan add, where relevant: (a) what this page AUTO-DISCOVERS instead of hardcoding (services, model
  backends, spend sources, secrets, AI CLIs/agents, containers, ports); (b) how the page behaves in a FRESH/any
  environment (honest empty/"connect" state, NEVER mock or hardcoded data); (c) for governance/security/insights:
  the AI-inventory, the `unregistered-ai-system`/`exposed-model-endpoint`/`shadow-api-key` findings, and the
  discovered→flag→Register→manage flow. Make these consistent with Capability X — do not invent a parallel scheme.

HARD RULES: research/planning ONLY — write ONLY markdown under /root/control-surface-plans/pages/. Do NOT modify
anything under /opt (LIVE). Do NOT restart services or run destructive commands. Use highest reasoning effort.
Work autonomously to completion for ALL routes listed for your session.
