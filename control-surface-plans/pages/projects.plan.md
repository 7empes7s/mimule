# /projects — Product Plan
> One-line: the repository registry for operators who need one governed source of truth for buildable projects, validation profiles, policies, and ownership.

## 1. Today (verified, with file:line)
- Frontend component: `/projects` is routed to `ProjectsPage` in `app/App.tsx:169`, marked `advanced` and `experimental` in `app/lib/navRegistry.ts:43`, and implemented in `app/routes/ProjectsPage.tsx:55`; readiness is 🔴 create-broken / 🟡 otherwise partial.
- Data source: the page loads `/api/projects` via `useAuthApi` in `app/routes/ProjectsPage.tsx:57`.
- Current UI: there is a detect bar that posts a repo path to `/api/projects/detect` and opens the project modal with detected values in `app/routes/ProjectsPage.tsx:72`, `app/routes/ProjectsPage.tsx:78`, `app/routes/ProjectsPage.tsx:87`, and `app/routes/ProjectsPage.tsx:96`.
- Current UI: project create/edit modal captures name, repo path, language, framework, and validator commands in `app/routes/ProjectsPage.tsx:296` and `app/routes/ProjectsPage.tsx:312`.
- Current UI: project list supports table controls, sort chips, filtering, and project cards in `app/routes/ProjectsPage.tsx:232`, `app/routes/ProjectsPage.tsx:234`, `app/routes/ProjectsPage.tsx:235`, `app/routes/ProjectsPage.tsx:261`, and `app/routes/ProjectsPage.tsx:266`.
- Backend routes: router exposes `GET/POST /api/projects`, `POST /api/projects/detect`, and `GET/PATCH/DELETE /api/projects/:id` in `server/api/router.ts:1234`, `server/api/router.ts:1235`, `server/api/router.ts:1240`, and `server/api/router.ts:1245`.
- Backend handlers: list uses current or query tenant in `server/api/projects.ts:24`, create requires `id` and `tenantId` in `server/api/projects.ts:41`, patch updates existing projects in `server/api/projects.ts:76`, delete soft-deletes in `server/api/projects.ts:102`, and detect delegates to `detectProject` in `server/api/projects.ts:111`.
- Backend persistence: the `projects` table stores tenant, repo path, language, framework, validator commands, default model roster, default policies, status, and timestamps in `server/db/dashboard.ts:107`.
- Project detection: language/framework/validators are inferred from `package.json`, Bun, Go, Rust, Python, and plan files in `server/projects/detector.ts:37`, `server/projects/detector.ts:59`, `server/projects/detector.ts:83`, `server/projects/detector.ts:94`, `server/projects/detector.ts:105`, and `server/projects/detector.ts:123`.

## 2. Gaps, mock & broken parts
- Create is broken: the frontend create body includes name, tenantId, repoPath, language, framework, and validatorCommands in `app/routes/ProjectsPage.tsx:127`, but it never includes `id`; the backend rejects create when `id` or `tenantId` is missing in `server/api/projects.ts:41`.
- Patch and delete do not write `action_audit`; only create writes audit in `server/api/projects.ts:54`, while patch returns updated project in `server/api/projects.ts:87` and delete returns ok in `server/api/projects.ts:107`.
- The frontend exposes edit but no delete/archive control, even though backend delete exists in `server/api/router.ts:1253`.
- The page does not expose default model roster or default policies even though the table stores them in `server/db/dashboard.ts:115` and `server/db/dashboard.ts:116`, and the store maps them in `server/projects/store.ts:28` and `server/projects/store.ts:29`.
- Detection returns plan files in `server/projects/detector.ts:5`, but the frontend ignores `planFiles` because `DetectedConfig` only includes language/framework/validatorCommands in `app/routes/ProjectsPage.tsx:20`.
- Projects are not visibly linked to `/builder`, `/brainstorm`, `/agent-team`, `/workflows`, `/agents`, or `/cost`.

## 3. Goal alignment (G1–G8)
- G1: fix create, show robust validation errors, and prevent duplicate/invalid project entries.
- G2: registering, detecting, editing, archiving, setting validators, policies, model roster, and ownership must be GUI-first.
- G3: make this the complete canonical source of project metadata for Builder/Brainstorm/Agent Team.
- G4: detect missing validators, stale repos, failing default checks, missing owners, and policy gaps.
- G5: show project health and next action before metadata.
- G6: safe actions like detect config, add validators, open builder workflow, archive project, and run validation should be one-click.
- G7: AI should explain project readiness and risks before listing raw config.
- G8: sell it as a Project Registry/AI Readiness module.

## 4. Best-practice research
- Adopt service catalog patterns: owner, tier, repo, runtime, dependencies, validation commands, policies, and lifecycle.
- Adopt Backstage-like project cards: tech docs, ownership, health, deployments, incidents, costs, and links.
- Adopt platform readiness scoring: every repo has build/test/check coverage, policy compliance, active workflows, and recent failures.
- Adopt golden-path onboarding: detect repo, propose config, confirm, create Builder workflow, add validators, set owner.
- Adopt governance-by-default: project metadata drives agent permissions, budget caps, and validation profiles.

## 5. Target design
- Header: total projects, ready projects, missing validators, stale repos, open findings, and active builder workflows.
- Cards: project name, owner, repo path, stack, readiness score, validators, policies, cost, active workflows, last run, and actions.
- Detail drawer: metadata, detected config, plan files, model roster, policies, validator commands, linked builder runs, team jobs, cost, insights, audit.
- Create flow: detect-first wizard that generates id slug, validates path, shows plan files, suggests validators and policies, then saves.
- Actions: detect/re-detect, run validators, create builder workflow, start brainstorm, enqueue team improvement, archive, edit policy/model roster.
- Empty state: one "Detect repo" path and one "New project" path, both with clear validation.
- Mobile: project cards with action menu; no table-only features.

## 6. Features to add (prioritized)
- MUST: Fix create id generation; acceptance: new project can be created from UI without manual id and reloads from DB.
- MUST: Audit patch/delete; acceptance: edit and archive create `action_audit` rows.
- MUST: Project detail drawer; acceptance: shows validators, policies, model roster, plan files, linked builder workflows, insights.
- MUST: Canonical cross-links; acceptance: each project can open Builder, Brainstorm existing-project intake, Agent Team improve, and Audit.
- MUST: Readiness score; acceptance: missing validators/owner/policy/status create visible warnings.
- SHOULD: Run validators action; acceptance: validation job appears in `/jobs` or builder validation history.
- SHOULD: Project owner and tier fields; acceptance: governance and cost can group by owner/tier.
- EXTRA: AI-generated onboarding checklist per project.
- EXTRA: Repository dependency map and risk hotspots.

## 7. Sellable-in-parts
- Standalone pitch: "A repo registry that makes every codebase AI-build-ready with validators, policies, owners, and health."
- Buyer: platform teams standardizing agentic development across many repositories.
- Packaging: Project Catalog, AI Readiness Scoring, Validation Profiles, Governance Policies, Builder/Team Handoff.
- Suite fit: `/brainstorm` uses project context, `/builder` runs workflows, `/agent-team` improves projects, `/agents` governs actors, `/cost` allocates spend.

## 8. Backend work
- Change `POST /api/projects` to generate slug id server-side when omitted, or change frontend to send deterministic id; server-side is safer.
- Add audit to `PATCH /api/projects/:id` and `DELETE /api/projects/:id`.
- Add `GET /api/projects/:id/links`: builder workflows, runs, team jobs, insights, costs.
- Add `POST /api/projects/:id/detect`: re-detect and merge config.
- Add `POST /api/projects/:id/validate`: run validators through jobs/executor.
- Extend schema if needed for owner/tier/readiness; otherwise reuse `default_policies_json` for project policies.
- Add scanner: missing validators, stale repo, missing owner, no recent successful builder run, policy/model roster missing.

## 9. Build slices
- Slice 1: Fix create path and tests in `app/routes/ProjectsPage.tsx` and `server/api/projects.ts`.
- Slice 2: Add audit for patch/delete and archive UI.
- Slice 3: Add detail drawer and plan-file display from detector output.
- Slice 4: Add project links and cross-route handoffs.
- Slice 5: Add readiness score and scanner.
- Docs to update when implemented: project registry docs, Builder onboarding docs, API docs, detector catalog, action catalog.

## 10. Verification
- Creating a project from UI succeeds without manual id and persists after reload.
- Detect/import populates repo path, stack, validators, and plan files.
- Patch and archive write audit rows and preserve tenant scope.
- Project detail links to related builder workflows/runs and insights.
- Missing validators or owner creates a readiness warning and insight.
- Mobile card flow supports create, edit, detect, and handoff actions.
