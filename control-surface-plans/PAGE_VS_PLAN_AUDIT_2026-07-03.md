# Page-vs-Plan Audit — 2026-07-03

Scope: all 44 plans in `control-surface-plans/pages/*.plan.md` audited against the live
codebase at commit `0f9e53d`+ (master). Method: every plan's §2 "Gaps, mock & broken
parts" claims were extracted by keyword sweep (broken / dead / silently / mock /
hardcoded / crash / does-not-exist) and each hit was verified against today's code
with file-level evidence. Page rendering itself is covered by the multi-viewport
Playwright suite (123/123 green, commit `6e5f7fb` — 41 routes × 3 viewports, console
errors + overflow + tab-bar clearance asserted).

## 1. Fixed TODAY during this audit (were live defects)

| Defect (plan claim) | Fix | Evidence |
|---|---|---|
| `stop-after-pass` was a dead control — UI posted `/api/builder/runs/:id/stop-after-pass`, router only matched `(retry\|cancel)` (builder.plan §2) | Route added + dispatch to existing `builderStopAfterPassHandler` | `server/api/router.ts` run-action match now `(retry\|cancel\|stop-after-pass)` |
| Failed-pass "pause workflow" posted a **runId** to `/api/builder/workflows/:id/pause` — wrong target or silent failure (builder.plan §2) | `FailureInvestigationPanel` takes `workflowId` (from `pass.workflowId`), guards when absent | `app/routes/BuilderPage.tsx` |
| Builder run/workflow controls (retry, cancel, stop-after-pass, pause, resume) wrote **no audit rows** while create/update/start/stop did (builder.plan §2) | All five now write `action_audit` via `auditRunControl()` helper, success and failure paths | `server/api/builder.ts` |
| Audit tab labelled "Operator Actions (stale)" — made the proof layer look unreliable; data is live-polled every 20s (audit.plan §2) | Label corrected to "Operator Actions" | `app/routes/AuditPage.tsx:263` |

Validation: `bun run check` clean; builder suite 62/62 green.

## 2. Plan claims now STALE — product shipped past the plan (no action)

| Plan | Stale claim | Reality today |
|---|---|---|
| incidents | Playbook Apply broken (`{incidentId}` body vs `workflowId` 400) | Direct playbook button **removed**; lifecycle (acknowledge/mitigate/resolve/mute) flows through unified executor (`server/api/execute.ts:333-394`) |
| incidents | No SLA fields, no post-mortem surfacing | SLA tiles + MTTA/MTTR shipped; post-mortems surfaced in page (12 refs); remediation loop-stats tiles added 2026-07-03 (`0f9e53d`) |
| incidents | Lifecycle "not yet implemented" in executor | Implemented + audited |
| admin | `/admin` route does not exist | `AdminPage` live at `app/App.tsx:115` |
| cost | `/cost` missing from NAV_REGISTRY (labs fallback) | Registered core at `app/lib/navRegistry.ts:37` |
| compliance | Frontend hardcodes `tenantId: "mimule"` | Gone from `CompliancePage.tsx` |
| gemini | Model selector wiring broken | Populates from `/api/models`, filters gemini entries (`GeminiPage.tsx:182-186`) |
| finance-intel | 🔴 mock-broken mutations (fake Save/Run) | Fake action UX removed; page is honest read-only run-provenance + portfolio-config tables |
| jobs | No cancel/retry UI | Both shipped with state-guards (`JobsPage.tsx:50-68`) |
| builder | Insights deep-link `/builder?run=` unhandled | Insights no longer emit that link format — claim moot |

## 3. OPEN feature-level MUSTs (recorded honestly, not built today)

- **doctor**: requeue/repair GUI + per-entry Apply path (backend endpoints would need
  to exist first; scan-now + history are real).
- **builder**: first-party QR rendering (3 uses of `api.qrserver.com` — privacy/CSP
  concern for a sellable module); merge the two visible diagnosis panels (classifier
  + reasoner) into one AI-reasoning flow; run tables capped at 10 with no
  search/saved-view/focus-param.
- **infra**: timer/service coverage is allowlist-limited; mutating actions bypass
  durable jobs.
- **codex / claude / opencode / governance / compliance (G9)**: fresh-host smoke
  ("no MIMULE services → honest connect state, no crash") has not been executed on a
  clean host. Universal discovery + register/ignore flow shipped (task #5), but the
  clean-host acceptance run remains open.
- **content-health / autopipeline / dossier**: MIMULE paths are env-overridable
  defaults; discovery-backed source registry still open.
- **governance-risk, ratings**: routes do not exist — these two plans are proposals
  for future pages (their own §1 says so). Not defects.
- **audit**: detector hooks for chain-broken / unaudited-mutation-fallback insights.
- **incidents**: owner/assign + SLA-breach detector insight remain open (ack/mitigate/
  resolve/mute + post-mortems are done).

## 4. Method note

MUST-item totals across plans: ~215. This audit verified every §2 *breakage* claim
(the operational hazards) and the readiness deltas above; it did not attempt to
tick all 215 MUSTs. The four defects found were all in the builder/audit surface —
every other §2 claim was either already fixed by shipped work or is a scoped
feature request, not a break.
