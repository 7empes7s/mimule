ROUTES FOR THIS SESSION (RX2 — Editorial pipeline cluster):
- /newsbites                        → pages/newsbites.plan.md
- /autopipeline                     → pages/autopipeline.plan.md
- /scout                            → pages/scout.plan.md
- /content-health                   → pages/content-health.plan.md
- /finance-intel                    → pages/finance-intel.plan.md
- /autopipeline/dossier/:date/:slug → pages/dossier.plan.md   (the Dossier Inspector)
- /today                            → pages/today.plan.md

VERIFIED backing code to READ (open these — do not guess):
- Frontend: app/routes/NewsBitesPage.tsx (484 lines), app/routes/AutopipelinePage.tsx (303), app/routes/ScoutPage.tsx (541),
  app/routes/ContentHealthPage.tsx (251), app/routes/FinanceIntelPage.tsx (439), app/routes/DossierInspectorPage.tsx,
  app/routes/TodayPage.tsx (269) (+ App.tsx route regs, navRegistry.ts readiness).
- API handlers: server/api/newsbites.ts, server/api/newsbites-actions.ts, server/api/autopipeline.ts,
  server/api/scout.ts (+ scout.test.ts), server/api/content-health.ts (+ test), server/api/financeIntel.ts (+ test),
  server/api/dossier.ts (+ test), server/api/today.ts (+ test); endpoint registration in server/api/router.ts.
- These pages observe/control the external editorial pipeline (autopipeline HTTP API :3200, dossiers on disk per CLAUDE.md).
  Distinguish clearly what is IN the control surface vs proxied from the pipeline, and cite the handler that proxies it.
