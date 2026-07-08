# SPEC 3 — Escalate-to-Workflow (ULTRAPLAN P2.1, queued after SPEC 1)

**Repo:** /opt/opencode-control-surface. Scope: `server/api/execute.ts`, `server/api/actionDescriptors.ts`, `server/reasoner/lifecycle.ts` (read), `server/builder/store.ts` (read), `app/routes/IncidentsPage.tsx`, tests alongside.

## Goal
A recurring/open incident can be escalated into an owned fix: one action creates a builder workflow pre-seeded with the incident's context.

## Deliverables
1. New executor action `escalate:incident:<id>` (risk: medium — single Apply, approval NOT required, audited):
   - Loads the incident + representative diagnosis + recurrence history (same joins used by `detectRecurringIncidents`).
   - Creates a builder workflow via the existing store creation path: mode `one-pass`, status `draft`, plan file content = generated markdown (incident title, failure class, root-cause hypothesis, evidence refs, suggested actions, links to /incidents). Project = the incident's workflow's project when resolvable, else the control-surface repo itself.
   - Writes `action_audit` (`incidents.escalate`) with the new workflow id; stamps the incident row (add nullable column `escalated_workflow_id` via the existing migration pattern in server/db/dashboard.ts).
2. Action descriptor so it appears on recurrence insights (`remediation:recurrence:*`) and in the incident drawer: button "Escalate to workflow" → after success, link to /builder.
3. IncidentsPage drawer: show escalation state (badge + workflow link) when `escalated_workflow_id` set.
4. Tests: escalate creates draft workflow with seeded plan content + audit row; double-escalate is idempotent (returns existing workflow, no dup); missing incident → NOT_FOUND.

## Hard rails
Same as SPEC 2: no commit/push/systemctl/pkill, surgical diffs, `bun run check` clean, targeted tests green, full `bun test` tail pasted in the report. Report changed files + evidence.
