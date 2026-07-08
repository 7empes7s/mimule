ROUTES FOR THIS SESSION (RX3 — CLI session consoles):
- /opencode → pages/opencode.plan.md
- /codex    → pages/codex.plan.md
- /claude   → pages/claude.plan.md
- /gemini   → pages/gemini.plan.md

VERIFIED backing code to READ (open these — do not guess):
- Frontend: app/routes/OpenCodeRoute.tsx (thin, 20 lines — describe what it actually renders, e.g. <OpenCodeView/>,
  and find that component), app/routes/CodexPage.tsx (660 lines), app/routes/ClaudePage.tsx (578),
  app/routes/GeminiPage.tsx (657) (+ App.tsx route regs, navRegistry.ts readiness).
- API handlers: server/api/codex.ts, server/api/claude.ts, server/api/gemini.ts (note server/api/gemini.ts:217
  has an unwired model-selector — verify and plan the fix). There is NO server/api/opencode.ts — trace how
  OpenCodeRoute actually talks to the backend (find the real store/endpoint/websocket; do not speculate).
- These three rich consoles (codex/claude/gemini) share a lot — design ONE shared session-console component and
  say so explicitly. /claude maps to an EXHAUSTED adapter (CLAUDE.md) — reflect that in the page's state design.
