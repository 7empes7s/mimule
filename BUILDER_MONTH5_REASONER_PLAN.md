# Builder Platform Month 5 — AI-Assisted Diagnosis (The Reasoner)

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 5)
Related: `/root/BUILDER_EXCELLENCE_PLAN.md`, `/root/BUILDER_MONTH4_GOVERNANCE_PLAN.md`

---

## Theme

**Use an LLM to read failed passes and produce incidents, root-cause narratives, and suggested fixes.**

Month 4 gave us a governance layer. Month 5 adds an AI reasoning layer on top of the trace + analytics data we've been collecting since Month 1. The output is structured diagnoses, deduplicated incident clusters, curated playbooks, and optional safe auto-remediation.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules:
- `server/builder/runner.ts` — `classifyFailureDiagnosis()`, `reconcileRunStatus()`, pass lifecycle
- `server/builder/store.ts` — `readBuilderRuns()`, `readBuilderPasses()`, `BuilderPass`, `BuilderRun`
- `server/tracing/tracer.ts` / `server/tracing/exporter.ts` — trace spans
- `server/gateway/router.ts` — `gatewayComplete()` (use logical model `editorial-heavy` for LLM calls)
- `server/gateway/client.ts` — `complete(logicalModel, messages, opts)` internal SDK
- `server/db/dashboard.ts` — `getDashboardDb()`, `ensureTable()`, `ensureColumn()`
- `server/api/router.ts` — add new routes here
- `app/routes/IncidentsPage.tsx` — EXISTS, needs rebuilding
- `app/routes/DashHome.tsx` — add reasoner status strip here

**No new npm/bun packages.** Use only what's already in `package.json`. For LLM calls use the gateway client (`server/gateway/client.ts`) with logical model `editorial-heavy` (routes to LiteLLM at :4000 → local GPU or cloud fallback).

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 6
- `bun test server/db/ server/api/ 2>&1 | grep -E "pass|fail" | tail -3` → 63 pass / 9 fail
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — Reasoner Engine

- [x] Create `server/reasoner/` directory with `index.ts` barrel
- [x] Define types in `server/reasoner/types.ts`: `DiagnosisResult` (`{ passId, runId, workflowId, failureClass, rootCauseHypothesis, evidence: string[], suggestedActions: string[], confidence: "high"|"medium"|"low", diagnosedAt: number }`), `ReasonerJob` (`{ id, passId, status: "pending"|"running"|"done"|"failed", attempts: number, createdAt, finishedAt? }`)
- [x] Add SQLite tables via `ensureTable` in `server/db/dashboard.ts`:
  - `reasoner_jobs` (id TEXT PK, pass_id TEXT, run_id TEXT, workflow_id TEXT, status TEXT, attempts INTEGER default 0, created_at INTEGER, finished_at INTEGER, error TEXT)
  - `reasoner_diagnoses` (id TEXT PK, pass_id TEXT, run_id TEXT, workflow_id TEXT, failure_class TEXT, root_cause TEXT, evidence_json TEXT, suggested_actions_json TEXT, confidence TEXT, raw_llm_response TEXT, diagnosed_at INTEGER)
- [x] Write diagnosis prompt template in `server/reasoner/prompts.ts`: builds a structured prompt from `{ failureClass, passAnalytics, stdoutTail (last 2000 chars), validationResults, planExcerpt (unchecked items), traceSummary }`. Output instruction asks for JSON matching `DiagnosisResult` schema.
- [x] Implement `server/reasoner/agent.ts`:
  - `queueDiagnosis(passId, runId, workflowId)` — inserts a `reasoner_jobs` row with status `pending`
  - `runDiagnosisJob(job)` — loads pass data, calls `gatewayClient.complete("editorial-heavy", messages)`, parses JSON response, validates schema (must have rootCauseHypothesis + at least one suggestedAction); retries once with stricter prompt if parse fails; inserts `reasoner_diagnoses` row; marks job `done`
  - `startReasonerWatcher()` — polls for `pending` jobs every 60s via `setInterval`; processes up to 2 concurrent jobs; skips if gateway is unavailable
- [x] Call `startReasonerWatcher()` from `server/index.ts` on startup
- [x] Auto-queue a diagnosis job when a pass finishes with non-success status: in `reconcileRunStatus` in `runner.ts`, after marking a pass `failed`/`stalled`/`timed-out`, call `queueDiagnosis(passId, runId, workflowId)`
- [x] Add `GET /api/reasoner/jobs` (list recent jobs, last 50) and `GET /api/reasoner/diagnoses` (list recent diagnoses, last 50) endpoints in `server/api/reasoner.ts`; register in `server/api/router.ts`
- [x] Add `GET /api/reasoner/diagnoses/:passId` to fetch the diagnosis for a specific pass
- [x] Add tests in `server/reasoner/agent.test.ts`: mock gateway client, assert job transitions from pending → done, assert diagnosis row is inserted, assert retry on bad JSON
- [x] Run typecheck + `bun test server/reasoner/` + build

## Phase 2 — Incident Clustering

- [x] Add SQLite tables via `ensureTable`:
  - `reasoner_incidents` (id TEXT PK, cluster_key TEXT UNIQUE, failure_class TEXT, title TEXT, first_seen INTEGER, last_seen INTEGER, occurrence_count INTEGER default 1, representative_pass_id TEXT, representative_diagnosis_id TEXT, status TEXT default `open`)
  - `reasoner_incident_members` (id TEXT PK, incident_id TEXT, pass_id TEXT, diagnosis_id TEXT, added_at INTEGER)
- [x] Implement `server/reasoner/clustering.ts`:
  - `computeClusterKey(failureClass, rootCauseHypothesis): string` — normalize both strings (lowercase, strip punctuation, take first 120 chars), return `sha256(normalized)`; use Node `crypto.createHash("sha256")` — no new packages
  - `clusterDiagnosis(db, diagnosis: DiagnosisResult): string` — looks up existing incident by `cluster_key`; if found: increments count, updates `last_seen`, inserts incident member; if not found: creates new incident with title = first 80 chars of rootCauseHypothesis, inserts member; returns incidentId
  - Wire `clusterDiagnosis` call into `runDiagnosisJob()` after a successful diagnosis
- [x] Add `GET /api/reasoner/incidents` (list open incidents, ordered by occurrence_count desc) endpoint
- [x] Add `GET /api/reasoner/incidents/:id` (incident detail with members list)
- [x] Add `POST /api/reasoner/incidents/:id/resolve` (marks incident `resolved`)
- [x] Add tests in `server/reasoner/clustering.test.ts`: two diagnoses with same failure class → same incident, different failure classes → different incidents, resolve endpoint updates status
- [x] Run typecheck + tests + build

## Phase 3 — Playbooks

- [x] Add SQLite table via `ensureTable`:
  - `reasoner_playbooks` (id TEXT PK, name TEXT, description TEXT, failure_class_pattern TEXT, actions_json TEXT, is_safe INTEGER default 0, created_at INTEGER)
  - `reasoner_playbook_runs` (id TEXT PK, playbook_id TEXT, incident_id TEXT, pass_id TEXT, triggered_by TEXT `auto|operator`, actions_applied_json TEXT, result TEXT, applied_at INTEGER)
- [x] Implement `server/reasoner/playbooks.ts`:
  - `seedPlaybooks(db)` — inserts 5 built-in playbooks if table is empty:
    1. `agent-stalled`: name="Retry with narrower scope", actions=`["retry-narrow"]`, is_safe=true
    2. `pass-timeout`: name="Retry with continuation context", actions=`["retry-continuation"]`, is_safe=true
    3. `codex-exhausted`: name="Switch to OpenCode", actions=`["switch-agent-opencode"]`, is_safe=true
    4. `validation-failed`: name="Surface to operator", actions=`["notify-operator"]`, is_safe=false
    5. `no-result-file`: name="Retry with stricter prompt", actions=`["retry-strict-prompt"]`, is_safe=true
  - `matchPlaybook(db, failureClass): Playbook | null` — returns first playbook where `failure_class_pattern` matches `failureClass` (exact match or glob `*`)
  - `applyPlaybookAction(action, workflowId, runId, passId)` — dispatcher for `retry-narrow` (re-queues the workflow with a narrowed prompt prefix), `retry-continuation` (re-queues with continuation context), `switch-agent-opencode` (updates workflow agentOrder to put opencode first), `notify-operator` (writes to action_audit), `retry-strict-prompt` (re-queues with a stricter PASS_RESULT instruction)
  - `recordPlaybookRun(db, playbookId, incidentId, passId, triggeredBy, actionsApplied, result)`
- [x] Call `seedPlaybooks` from `server/index.ts` startup after DB init
- [x] Add `GET /api/reasoner/playbooks` and `POST /api/reasoner/playbooks/:id/apply` (operator-triggered; records run, calls `applyPlaybookAction`) endpoints
- [x] Add tests: `matchPlaybook` returns correct entry; `seedPlaybooks` is idempotent
- [x] Run typecheck + tests + build

## Phase 4 — Auto-Remediation (opt-in)

- [x] Add `autoApplySafePlaybooks` optional boolean to `BuilderWorkflowConfig` in `server/builder/store.ts` (default false)
- [x] In `reconcileRunStatus` in `runner.ts`, after a pass is marked failed and a diagnosis job is queued: if `workflow.config.autoApplySafePlaybooks === true`, call `matchPlaybook(db, failureClass)` immediately (using the runner's `classifyFailureDiagnosis` result, not waiting for LLM); if match is `is_safe=true`, call `applyPlaybookAction` and `recordPlaybookRun` with `triggeredBy="auto"`; log to pass stdout artifact
- [x] Add `autoApplySafePlaybooks` field to the workflow create/edit form in `app/routes/BuilderPage.tsx` (simple checkbox in the workflow modal)
- [x] Add tests: workflow with `autoApplySafePlaybooks=true` and a `codex-exhausted` pass triggers `switch-agent-opencode` action automatically
- [x] Run typecheck + tests + build

## Phase 5 — IncidentsPage + DashHome Strip

- [x] Rebuild `app/routes/IncidentsPage.tsx` (existing file, full rewrite):
  - Header: "Incidents" + count badge + "N open" chip
  - Incident cards (sorted by occurrence_count desc): cluster title, failure class badge (color-coded), "happened N times", first/last seen dates, representative pass link, status chip (open/resolved)
  - Expandable card shows: root cause hypothesis (labeled "AI hypothesis — not verified"), evidence bullets, suggested actions list, matching playbook name + "Apply" button (calls `POST /api/reasoner/playbooks/:id/apply`), "Resolve" button
  - Filters: failure class dropdown, status toggle (open / resolved / all)
  - Empty state: "No incidents yet — diagnoses queue as passes fail"
- [x] Add `ReasonerStatusStrip` component to `app/routes/DashHome.tsx`:
  - Shows: "Reasoner: N jobs pending · N diagnoses · N open incidents · last ran X min ago"
  - Calls `GET /api/reasoner/jobs?limit=1` for last-ran timestamp
  - Positioned below the existing pipeline strip
- [x] Add diagnosis panel to `app/routes/BuilderPage.tsx` `RunDetailPanel`: if a diagnosis exists for the selected pass (`GET /api/reasoner/diagnoses/:passId`), show a collapsible "AI Diagnosis" card with root cause, evidence, suggested actions, confidence badge. Label "AI hypothesis" prominently.
- [x] Add `/incidents` to `app/App.tsx` route table (already imported via existing page; just ensure the rewrite compiles)
- [x] Ensure `app/components/DashSidebar.tsx` already has Incidents nav (check; add if missing with `AlertTriangle` icon)
- [x] Run typecheck + build + `systemctl restart control-surface` + verify `/incidents` loads and `GET /api/reasoner/incidents` returns 200
- [x] Run playwright smoke: `/incidents` renders on desktop + mobile, DashHome shows reasoner strip

---

## Exit Criteria

- `bun run check` → same 6 pre-existing errors, no new ones
- `bun test server/db/ server/api/ server/reasoner/` → 63+ pass, 9 pre-existing fail
- `bun run build` → clean (known large-chunk warning only)
- `GET /api/reasoner/jobs` → 200
- `GET /api/reasoner/diagnoses` → 200
- `GET /api/reasoner/incidents` → 200
- `GET /api/reasoner/playbooks` → 200 with 5 seeded entries
- `/incidents` route loads in browser
- DashHome has reasoner status strip
- BuilderPage RunDetailPanel shows "AI Diagnosis" card for failed passes that have been diagnosed
- Auto-queue: a manually-triggered failed pass causes a `reasoner_jobs` row with status `pending` to appear

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — LLM calls go through `server/gateway/client.ts` with model `editorial-heavy`.
- **No API keys in code** — the gateway client handles auth internally.
- Pre-existing TS errors in `RatingsPage.tsx`, `doctor.ts`, `actionDescriptors.ts` — do NOT fix.
- Use `ensureTable` / `ensureColumn` for all schema changes (see `server/db/dashboard.ts` for the pattern).
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`. 
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.
- The gateway client may return an error if the LLM is unavailable — handle gracefully (log, mark job `failed`, do not crash the watcher loop).
- Label all LLM-produced content as "AI hypothesis" in the UI — never present diagnoses as verified facts.


<!-- Builder run br_23f2a: success at 2026-05-16T10:02:04.552Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_23f2a.md -->


<!-- Builder run br_d1f0d: failed at 2026-05-16T11:12:57.548Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_d1f0d.md -->

<!-- Builder run br_12c34: failed at 2026-05-16T11:14:32.341Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_12c34.md -->

<!-- Builder run br_6f87d: success at 2026-05-16T11:15:37.691Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_6f87d.md -->


<!-- Builder run br_f3db7: failed at 2026-05-16T12:28:47.208Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_f3db7.md -->

<!-- Builder run br_6d964: success at 2026-05-16T12:38:36.017Z — details: /opt/ai-vault/builder/2026-05-16-bw_2c232-br_6d964.md -->