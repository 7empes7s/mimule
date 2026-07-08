ROUTES FOR THIS SESSION (RX1 — Access / Security / Compliance / Risk; the GRC sellable module):
- /governance        → pages/governance.plan.md
- /security          → pages/security.plan.md
- /compliance        → pages/compliance.plan.md
- /governance/risk   → pages/governance-risk.plan.md   (NEW page — plan it grounded in the EXISTING governance code below)

VERIFIED backing code to READ (open these — do not guess):
- Frontend: app/routes/GovernancePage.tsx, app/routes/SecurityPage.tsx, app/routes/CompliancePage.tsx (+ App.tsx route regs, navRegistry.ts readiness).
- API handlers: server/api/governance.ts, server/api/security.ts (+ security.test.ts), server/api/compliance.ts (+ compliance.test.ts); endpoint registration in server/api/router.ts (governance routes ~line 891).
- The SEPARATE access-control governance module server/governance/: approvals.ts, budgets.ts, policy.ts, rbac.ts, retention.ts, secrets.ts, store.ts, index.ts, audit/. READ policy.ts to state the ACTUAL policy mechanism (it is NOT OPA — verify and describe what it really is).
- For /governance/risk: tie into server/insights/ (the ops detection engine) + the real findings/audit tables in server/db/.
Resolve the 3-way "governance" naming collision per DASHBOARD_V5_PLAN Section C.1.
