CANONICAL RESEARCH PROMPT (given to each codex / gemini session; ROUTES line is swapped per session)

----------------------------------------------------------------------
You are a senior product engineer + designer. FIRST read these in full, in order:
1. /root/control-surface-plans/_CONTEXT.md   (your task, the product vision, goals G1–G8, the authoritative
   context to read, the HARD RULES, and the EXACT 10-section per-page output format — follow it precisely)
2. /root/DASHBOARD_V5_PLAN.md                (master extended plan — your per-page plans must align with and deepen it)
3. /root/CLAUDE.md                           (system/model-routing overview)

Then, for EACH route listed below, study the REAL code under /opt/opencode-control-surface (frontend
app/routes/*.tsx + app/App.tsx + app/lib/navRegistry.ts; backend server/api/router.ts + server/api/*.ts +
server/insights/* + server/governance/* + server/gateway/* + server/adapters/* + server/db/*). Verify current
behavior and cite file:line for every claim. Then write ONE plan file per route to
/root/control-surface-plans/pages/<slug>.plan.md using the EXACT 10-section structure in _CONTEXT.md.

Research the BEST ways to make each page better toward the vision: an all-in-one AI tool + AI gateway + admin
center that is sellable as a whole OR in parts, useful across all areas, easy to read and use, with AI reasoning
before insights and one-click (prefer automatic) actions. Make pages fit together (shared components, one IA, one
health score, one inbox, one audit/executor path); call out merges/links explicitly. Each plan must also specify
WHAT DOCUMENTATION the builder must update when implementing it.

HARD RULES: research/planning only — write ONLY markdown under /root/control-surface-plans/pages/. Do NOT modify
anything under /opt (LIVE). Do NOT restart services or run destructive commands. Cite real file:line; never guess.
Use your highest reasoning effort. Work autonomously to completion for ALL routes below.

ROUTES FOR THIS SESSION: <<INJECTED PER SESSION>>
----------------------------------------------------------------------
</content>
