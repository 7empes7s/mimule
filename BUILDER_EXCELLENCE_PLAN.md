# Builder Pipeline Excellence Plan

Last updated: 2026-05-15 UTC
Owner: Marouane Defili
Canonical builder: `/opt/opencode-control-surface/server/builder/`
BuilderPage: `/opt/opencode-control-surface/app/routes/BuilderPage.tsx`
Parent plans:
- `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` — 12-month productization roadmap. This excellence plan is **Month 1** of that plan.
- `/root/DASHBOARD_V4_SCHEDULER_PLAN.md` — Builder Pipeline origin spec
- `/root/DASHBOARD_V4_5_PLAN.md` — V4.5 surface additions
- `/root/DASHBOARD_V4_PLAN.md` — actionable entity model, validation contracts

---

## Purpose

This plan takes the existing Builder Pipeline from a working-but-opaque automation layer to a world-class AI coding orchestrator. The goal is threefold:

1. **Reliability**: passes that fail for fixable reasons are retried intelligently; passes that run out of time resume where they stopped; passes that declare a plan complete actually stop.
2. **Observability**: every pass produces structured, machine-readable output — file counts, tool counts, plan progress, errors, models used. These feed the dashboard UI directly.
3. **Usability**: the BuilderPage becomes an interactive operations center for the operator, not just a read-only log viewer.

---

## Evidence: What Failed and Why

Data from the last 20 builder runs (2026-05-13 to 2026-05-15), analyzed from SQLite + stdout logs:

### Failure taxonomy

| Class | Count | Root cause |
|---|---|---|
| `agent-stalled` | 1 | Agent output stopped for 600s. Occurred mid-exploration ("let me look at tib-markets") — model inference stalled or context filled |
| `pass-timeout` (exit 124) | 3 | 900s hard limit hit while plan was partially complete. Agent was making real progress (FinanceOverlay work) but ran out of time |
| `agent-killed` (exit 143) | 2 | SIGTERM received — likely OOM or external kill. No memory data captured |
| `validation-unknown-command` | 1 | Playwright validation invoked before service was confirmed running. `ERR_ABORTED` on `page.goto` |
| `error-field-noise` | 2 | `error` column contains git diff or typecheck stdout — the runner wrote the wrong content to `error` |
| **Total failures** | **9 of 20 runs** | **45% failure rate** |

### Structural gaps

| Gap | Impact |
|---|---|
| No `PASS_RESULT.json` protocol | Runner can't distinguish "plan complete" from "agent exited cleanly with work remaining" |
| `summary` / `next_instruction` rarely populated | Continuation context falls back to raw stdout tail (2KB) — misses intent |
| Stall detection is binary (kill at 600s) | Legitimate exploration tasks are killed before they produce output |
| No per-pass analytics | Can't answer "what files changed", "how many tools used", "was typecheck clean" |
| No plan progress tracking | Can't display % complete or estimate passes remaining |
| `error` field extraction is regex-blind | Embeds stdout noise (git diff, typecheck output) instead of the actual error |
| Validation runs before confirming service is live | Playwright fails with `ERR_ABORTED` when service isn't up yet |
| No session summary | Operator must reconstruct what happened from raw pass logs |

---

## Design Principles

These are grounded in 2026 research on agentic systems:

### 1. Structured Briefings over Context Dumps
Raw stdout tails are noise. The receiver needs decisions + state, not history. Every pass hands off a `PASS_RESULT.json` — a compact machine-readable object. The continuation context assembles from this, not from raw logs.

### 2. Plan-Driven Termination
A pass should only stop auto-continue when `PASS_RESULT.status == "complete"` (all unchecked items done) or `status == "blocked"` (needs operator). Timed-out passes and stalled passes are retried with targeted continuation context.

### 3. Progressive Context Loading
Agents should read only what's needed for the current 2-3 plan items. The system prompt must enforce this with a "context budget" rule section. Exploration tasks must use grep/head, never full file reads of unknown files.

### 4. Incremental Verification
Typecheck and targeted tests run after each logical chunk (1-2 files changed), not just at the end of the pass. This prevents error accumulation and makes the session output structured.

### 5. Fail Fast and Classifiable
Agents must write an error classification before exiting on failure. If blocked (service down, plan ambiguous, dependency missing) — write a blocker, don't retry blindly.

### 6. Analytics as a First-Class Artifact
Every pass produces a `pass-analytics.json` alongside stdout. The runner reads it. The UI displays it. The vault log includes it.

---

## Part I — PASS_RESULT.json Protocol

This is the single highest-leverage improvement. It creates a machine-readable contract between the agent and the runner.

### Schema

```json
{
  "status": "incomplete" | "complete" | "failed" | "blocked",
  "completionPercent": 0-100,
  "itemsDone": ["- [x] Phase 4a: FinanceOverlay in article page"],
  "itemsRemaining": ["- [ ] Phase 4c: ticker pills in reader app"],
  "filesEdited": ["app/components/TickerIntel.tsx"],
  "filesCreated": ["app/api/portfolio/route.ts"],
  "filesDeleted": [],
  "filesRead": ["app/components/ArticlePage.tsx", "app/globals.css"],
  "toolsUsed": {"read": 12, "edit": 5, "bash": 8, "spawn_child": 1},
  "modelsUsed": ["opencode-go/minimax-m2.7"],
  "subagentsSpawned": 1,
  "errors": [
    {"type": "typecheck", "message": "Property 'x' does not exist", "resolved": true},
    {"type": "test", "message": "2 tests failed", "resolved": false}
  ],
  "validationResults": {
    "typecheck": "pass" | "fail" | "skipped",
    "tests": "pass" | "fail" | "partial" | "skipped",
    "playwright": "pass" | "fail" | "partial" | "skipped",
    "build": "pass" | "fail" | "skipped"
  },
  "nextInstruction": "Continue with Phase 4c — ticker pills in /app reader. Files: app/components/NewsFeedItem.tsx, app/reader/page.tsx. Run: bun run check then playwright mobile.",
  "blockers": [],
  "contextBudgetEstimate": "high" | "medium" | "low",
  "passNote": "Service was running on :3000. TypeCheck clean. Playwright 28/30 (2 flaky on tablet)."
}
```

### Protocol rules

- The agent **must** write this file to `$BUILDER_DIR/PASS_RESULT.json` before exiting
- The system prompt appends a PASS_RESULT.json instruction block (see Part III)
- The runner reads it after pass exits; if missing, treats as `{ status: "failed", reason: "no-result-file" }`
- If `status == "incomplete"` and `maxPasses` not reached → auto-start next pass immediately
- If `status == "blocked"` → pause workflow, notify operator, write blockers to BuilderPage
- If `status == "complete"` → run final validation, close run as `success`

### Runner changes (runner.ts)

```typescript
// After pass exits, read PASS_RESULT.json
function readPassResult(runId: string, passNumber: number): PassResult | null {
  const path = join(runDir(runId), "PASS_RESULT.json");
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

// Decision logic in finishPass()
const result = readPassResult(run.id, pass.sequence);
if (result) {
  // Persist analytics
  updateBuilderPass(passId, {
    summary: buildSummaryFromResult(result),
    nextInstruction: result.nextInstruction ?? null,
    analyticsJson: JSON.stringify(extractAnalytics(result)),
    planItemsDone: result.itemsDone.length,
    planItemsRemaining: result.itemsRemaining.length,
    completionPercent: result.completionPercent,
  });
  
  // Auto-continue decision
  if (result.status === "incomplete" && canContinue(workflow, run)) {
    await startNextPass(workflow, run, pass.sequence + 1);
    return; // don't close run yet
  }
  if (result.status === "blocked") {
    pauseWorkflowWithBlockers(workflow, result.blockers);
    return;
  }
  if (result.status === "complete") {
    // Run final validation then close
    await runFinalValidation(workflow, run, passId);
    closeRunSuccess(run);
    return;
  }
}
```

---

## Part II — Improved Failure Classification

### New `failureClass` values

| Class | Trigger | Recommended action |
|---|---|---|
| `agent-stalled` | No stdout change for stall timeout | Retry with narrower starting instruction |
| `agent-oom` | Exit 143 + `pass-analytics.json` shows high memory before death | Retry with lower context budget |
| `agent-killed` | Exit 143 without memory indicator | Retry once; if repeats, pause workflow |
| `pass-timeout` | Exit 124 (timeout command) | Retry with continuation context pointing to `itemsRemaining` |
| `validation-failed` | Typecheck/playwright failed, agent couldn't fix | Surface to operator with full validation report |
| `plan-incomplete` | Agent exited 0 but `PASS_RESULT.status == "incomplete"` | Auto-continue (this is the normal state) |
| `plan-complete` | Agent exited 0 and `PASS_RESULT.status == "complete"` | Not a failure — this is the success path |
| `blocked` | Agent wrote `status == "blocked"` | Pause and notify |
| `spawn-failed` | tmux couldn't create session | Check tmux sessions, retry |
| `no-result-file` | PASS_RESULT.json not written (crash or missing) | Treat as `failed`, check stderr |

### Two-tier stall detection

Current: 600s no-output → kill immediately.

New:
```typescript
const STALL_WARN_SECONDS = 300;  // warn in log but don't kill
const STALL_KILL_SECONDS = workflow.config.riskPolicy.stallTimeoutSeconds ?? 900;

// In the stall polling loop:
if (sinceLastOutput > STALL_WARN_SECONDS && !warnedStall) {
  appendToPassLog(runId, passNumber, `[builder-warn] No output for ${STALL_WARN_SECONDS}s — agent may be exploring. Will kill at ${STALL_KILL_SECONDS}s.`);
  warnedStall = true;
}
if (sinceLastOutput > STALL_KILL_SECONDS) {
  killPass(passId, "agent-stalled");
}
```

### Service-up check before Playwright validation

```typescript
// In runValidation(), before playwright steps:
if (step.kind === "playwright") {
  const internalUrl = workflow.config.validationProfile.internalUrl;
  if (internalUrl) {
    const isUp = await checkHttpReachable(internalUrl, 3, 2000);
    if (!isUp) {
      return { kind: "playwright", status: "skipped", reason: "service-not-reachable" };
    }
  }
}
```

---

## Part III — Improved Agent Prompt Contracts

### System prompt additions (appended to every pass prompt)

```
=== BUILDER PASS CONTRACT ===

CONTEXT BUDGET RULES:
- Never cat/read entire unknown files. Use: grep -n 'keyword' file | head -20
- Read only files you will edit or that directly document the task
- Plan file: use grep for unchecked items, never full read unless < 200 lines
- If you find yourself reading > 8 files for exploration, you have too broad a scope

PROGRESS TRACKING:
- After completing each plan item, mark it [x] in the plan file immediately
- Run typecheck after every group of edits (not just at the end)
- Write a one-line progress note after each completed item: # DONE: item name

PASS RESULT (MANDATORY — write this before exiting):
Write $BUILDER_DIR/PASS_RESULT.json with this exact shape:

{
  "status": "incomplete",     // incomplete | complete | failed | blocked
  "completionPercent": 35,    // your estimate of overall plan progress
  "itemsDone": [],            // plan items you completed this pass (copy text)
  "itemsRemaining": [],       // unchecked items still in the plan
  "filesEdited": [],          // relative paths you modified
  "filesCreated": [],         // relative paths you created
  "filesRead": [],            // files you read (not edited)
  "toolsUsed": {},            // {"read": N, "edit": N, "bash": N}
  "modelsUsed": [],           // model IDs you used
  "errors": [],               // [{type, message, resolved}]
  "validationResults": {
    "typecheck": "pass",      // pass | fail | skipped
    "tests": "skipped",
    "playwright": "skipped",
    "build": "skipped"
  },
  "nextInstruction": "",      // CRITICAL: exact instruction for the next pass
  "blockers": [],             // if blocked: [{reason, suggestedFix}]
  "passNote": ""              // one-paragraph human summary
}

STATUS GUIDE:
- "incomplete": you ran out of time or context — next pass will continue
- "complete": all unchecked plan items are now checked [x]
- "failed": something broke and you couldn't fix it
- "blocked": the task can't proceed without operator input

PLAN IS INCOMPLETE RULE:
If you reach context limit or timeout is imminent, set status="incomplete",
fill itemsRemaining with what's left, and write a precise nextInstruction.
Do NOT set status="complete" unless all checklist items are marked [x].
===========================================
```

### Continuation context improvements

Current `buildContinuationContext()` sends raw stdout tail. New version:

```typescript
function buildContinuationContext(workflow, run, nextSequence, agent, model): string {
  const lines = [
    `=== Builder Pipeline: Pass ${nextSequence} Continuation Context ===`,
    `Workflow: ${workflow.name}`,
    `Plan: ${workflow.planFile}`,
    `Project: ${workflow.projectRoot}`,
    "",
  ];

  const prevPasses = readBuilderPasses(run.id)
    .filter(p => p.sequence < nextSequence)
    .sort((a, b) => a.sequence - b.sequence);

  for (const pass of prevPasses) {
    // NEW: prefer PASS_RESULT.json over raw stdout
    const passResult = readPassResult(run.id, pass.sequence);
    if (passResult) {
      lines.push(`--- Pass ${pass.sequence} (${pass.agent}, ${pass.status}) ---`);
      if (passResult.passNote) lines.push(`Note: ${passResult.passNote}`);
      if (passResult.itemsDone.length > 0) {
        lines.push(`Completed: ${passResult.itemsDone.join(" | ")}`);
      }
      if (passResult.filesEdited.length > 0) {
        lines.push(`Files changed: ${passResult.filesEdited.join(", ")}`);
      }
      if (passResult.nextInstruction) {
        lines.push(`Handoff instruction: ${passResult.nextInstruction}`);
      }
      if (passResult.errors.filter(e => !e.resolved).length > 0) {
        lines.push(`UNRESOLVED ERRORS: ${passResult.errors.filter(e => !e.resolved).map(e => e.message).join("; ")}`);
      }
    } else {
      // Fallback: raw stdout tail (existing behavior)
      const stdoutArtifact = getArtifactByKind(run.id, pass.id, "stdout");
      if (stdoutArtifact) {
        const tail = readFileSync(stdoutArtifact.path).toString().slice(-1500);
        lines.push(`--- Pass ${pass.sequence} stdout tail ---`);
        lines.push(tail);
      }
    }
    lines.push("");
  }

  // Plan items remaining (full list, not just 5)
  if (existsSync(workflow.planFile)) {
    const unchecked = readFileSync(workflow.planFile, "utf8")
      .split("\n")
      .filter(l => /^\s*-\s+\[ \]/.test(l))
      .map(l => l.trim());
    if (unchecked.length > 0) {
      lines.push(`--- Remaining plan items (${unchecked.length} total) ---`);
      lines.push(unchecked.slice(0, 15).join("\n"));
      if (unchecked.length > 15) lines.push(`... and ${unchecked.length - 15} more`);
    } else {
      lines.push(`--- Plan appears COMPLETE (no unchecked items found) ---`);
    }
  }

  // Model briefing (unchanged — already good)
  const briefing = readModelBriefing(model, agent);
  if (briefing) { lines.push(""); lines.push(briefing); }

  return lines.join("\n");
}
```

---

## Part IV — Analytics Extraction Layer

### New: `pass-analytics.json` artifact

After each pass exits, the runner runs light extraction against stdout:

```typescript
function extractPassAnalytics(runId: string, passNumber: number, exitCode: number): PassAnalytics {
  const stdout = readLogFile(runId, `pass-${passNumber}-stdout.log`);
  const stderr = readLogFile(runId, `pass-${passNumber}-stderr.log`);
  
  // Git stat for this pass (what actually changed)
  const gitStat = spawnSync("git", ["diff", "--stat", "HEAD"], {
    encoding: "utf8", cwd: projectRoot, timeout: 10_000
  }).stdout ?? "";
  
  // Count children spawned from manifest
  const childrenManifest = readLogFile(runId, "children-manifest.jsonl");
  const childrenSpawned = childrenManifest.split("\n").filter(Boolean).length;
  
  // Detect typecheck outcome
  const typecheckPass = /bun run check.*✓|0 errors/.test(stdout);
  const typecheckFail = /error TS[0-9]+/.test(stdout);
  
  // Detect playwright outcome
  const playwrightPass = stdout.includes("passed") && !stdout.includes("failed");
  const playwrightFail = stdout.includes("net::ERR_ABORTED") || /[0-9]+ failed/.test(stdout);
  
  // Read PASS_RESULT.json if available
  const passResult = readPassResult(runId, passNumber);

  return {
    exitCode,
    durationMs: pass.finishedAt - pass.startedAt,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    childrenSpawned,
    gitStatSummary: gitStat.slice(0, 500),
    typecheckOutcome: typecheckFail ? "fail" : typecheckPass ? "pass" : "unknown",
    playwrightOutcome: playwrightFail ? "fail" : playwrightPass ? "pass" : "unknown",
    planItemsDone: passResult?.itemsDone.length ?? 0,
    planItemsRemaining: passResult?.itemsRemaining.length ?? null,
    completionPercent: passResult?.completionPercent ?? null,
    filesEdited: passResult?.filesEdited ?? [],
    filesCreated: passResult?.filesCreated ?? [],
    modelsUsed: passResult?.modelsUsed ?? [],
    unresolvederrors: passResult?.errors.filter(e => !e.resolved) ?? [],
  };
}
```

Write this to `pass-${passNumber}-analytics.json` and create a `builder_artifact` pointing to it. Persist a compact version in the `builder_passes.analytics_json` column.

### New database columns

```sql
-- Migration: add to builder_passes
ALTER TABLE builder_passes ADD COLUMN analytics_json TEXT;       -- PassAnalytics JSON
ALTER TABLE builder_passes ADD COLUMN plan_items_done INTEGER;   -- items completed this pass
ALTER TABLE builder_passes ADD COLUMN plan_items_remaining INTEGER; -- items still unchecked
ALTER TABLE builder_passes ADD COLUMN completion_percent INTEGER; -- 0-100
```

---

## Part V — BuilderPage UI Overhaul

### 1. Session Analytics Card (per-run)

New component `RunAnalyticsCard` shown at the top of a selected run:

```
┌─ Run br_9961aa3a ─────────────────────────────────────────────────┐
│ Status: SUCCESS  │  Duration: 4m 37s  │  Trigger: retry            │
│ Agent: opencode  │  Model: minimax-m2.7  │  Passes: 1               │
├────────────────────────────────────────────────────────────────────┤
│ Plan:  v3-tib-markets-assistant.md                                 │
│ Progress: [████████░░] 8/10 items (80%)                            │
├─────────────────┬──────────────────┬──────────────────────────────┤
│ Files edited: 5 │ Files created: 2 │ Errors: 0 unresolved         │
│ Children: 0     │ Typecheck: ✓     │ Playwright: partial (28/30)  │
└─────────────────┴──────────────────┴──────────────────────────────┘
```

Pulls from: `analytics_json`, `plan_items_done`, `completion_percent`.

### 2. Pass Detail Expansion (replace minimal table row)

Clicking a pass opens an inline expansion panel:

```
Pass 1 — plan phase | opencode/minimax-m2.7 | 277s | SUCCESS

┌─ Plan Progress ──────────────────────────┐
│ ✅ Phase 4a: FinanceOverlay in articles  │
│ ✅ Phase 4b: portfolio API route         │
│ ⬜ Phase 4c: ticker pills (next)         │
│ ⬜ Phase 4d: watchlist component         │
│                           3/5 done       │
└──────────────────────────────────────────┘

┌─ Files Changed ──────────────────────────┐
│ app/api/portfolio/route.ts     +120 −0   │
│ app/components/TickerIntel.tsx +460 −12  │
└──────────────────────────────────────────┘

┌─ Validation ─────────────────────────────┐
│ Typecheck: ✓ (0 errors)                  │
│ Tests:     skipped                        │
│ Playwright: 28/30 (2 flaky tablet)       │
└──────────────────────────────────────────┘

Next instruction for pass 2:
"Continue with Phase 4c — ticker pills in reader app.
Files: app/components/NewsFeedItem.tsx, app/reader/page.tsx.
Run: bun run check then playwright mobile 393×852."

[ View stdout ] [ View prompt ] [ View PASS_RESULT.json ]
```

### 3. Failure Investigation Panel

When `status == "failed"`, the pass expansion shows a `FailureInvestigationPanel`:

```
❌ FAILURE: agent-stalled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What happened:
  The agent produced output for 6s then went silent for 600s.
  Stall timeout triggered kill (SIGKILL).

Last activity seen:
  "Now let me look at what's actually implemented in tib-markets
   to understand the current state..."

Diagnosis:
  Agent began broad exploration of /opt/tib-markets service —
  a large codebase not directly in the plan. Model inference
  likely stalled during file reads or context filled up.

Suggested actions:
┌──────────────────────────────────────────┐
│ ↻ Retry with narrowed start instruction  │  (pre-fills nextInstruction)
│ ⚡ Retry with higher stall timeout (30m) │
│ ✎ Edit plan to scope tib-markets ref     │
│ 🔍 View last 200 lines of stdout         │
└──────────────────────────────────────────┘
```

Failure diagnosis strings are generated server-side in a `classifyFailureDiagnosis(pass, analytics)` function:

```typescript
function classifyFailureDiagnosis(pass: BuilderPass, analytics: PassAnalytics): FailureDiagnosis {
  if (pass.failureClass === "agent-stalled") {
    const lastActivity = extractLastMeaningfulOutput(analytics.stdoutTail);
    return {
      title: "Agent Stalled",
      whatHappened: `No output for ${workflow.config.riskPolicy.stallTimeoutSeconds}s`,
      lastActivity,
      likelyCause: lastActivity.includes("let me look") || lastActivity.includes("understand")
        ? "Agent began broad file exploration — model inference stalled or context filled"
        : "Model inference timeout or network issue",
      suggestedActions: ["retry-narrow", "retry-higher-timeout", "edit-plan"],
    };
  }
  if (pass.failureClass === "pass-timeout") {
    return {
      title: "Pass Timeout",
      whatHappened: `Pass hit ${workflow.config.riskPolicy.passTimeoutSeconds}s hard limit`,
      lastActivity: extractLastMeaningfulOutput(analytics.stdoutTail),
      likelyCause: "Plan has more work than fits in one pass — this is normal for large plans",
      suggestedActions: ["retry-continue", "increase-timeout"],
    };
  }
  // ... etc
}
```

### 4. Plan Progress Widget (per-workflow)

New component `PlanProgressWidget` shown in the workflow detail sidebar:

```
Plan: v3-tib-markets-assistant.md
──────────────────────────────────────
Phase 1 — Foundation    ████████░░  4/5  ✓
Phase 2 — UI            ████░░░░░░  2/5
Phase 3 — Integration   ░░░░░░░░░░  0/4
Phase 4 — Polish        ░░░░░░░░░░  0/3
──────────────────────────────────────
Total: 6/17 items (35%)
Estimated passes: ~4 more (avg 3 items/pass)
Last updated: 2026-05-15 22:56 UTC
```

Data source: Parse the plan file server-side on each API request to `/api/builder/workflows/:id/plan-progress`. Cache for 30s. Parse sections (level-2 headings) and checklist items.

BFF endpoint:
```
GET /api/builder/workflows/:id/plan-progress
→ { sections: [{title, done, total}], totalDone, totalItems, lastParsedAt }
```

### 5. Session Summary Card (at run end)

When a run reaches `status == "success"` or `status == "failed"`, prepend a `SessionSummaryCard`:

```
Session: NewsBites Finance+ builder pass
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Started: 2026-05-15 20:11 UTC  │  Ended: 20:34 UTC  │  Total: 23m
Trigger: manual                │  Passes: 1 success

Plan progress this session:
  5 items completed  │  5 items remaining  │  Portfolio API, Ticker chart, Watchlist...

Files changed across all passes:
  5 edited  │  2 created  │  0 deleted  │  0 errors unresolved

Validation: typecheck ✓  │  tests skipped  │  playwright 28/30

Models used: minimax-m2.7 (1 pass)
Vault log: /opt/ai-vault/builder/2026-05-15-*.md

Recommended next:
  [ Continue: Phase 4c — ticker pills ] [ Schedule in 2h ] [ View plan ]
```

### 6. Workflow-level "Next Steps from Plan" panel

Shown below the workflow config card:

```
Next Steps
──────────────────────────────────────
⬜ Phase 4c: ticker pills in reader app
⬜ Phase 4d: watchlist component
⬜ Phase 3d: alerts page
⬜ Phase 3e: article-finance linking

[ ▶ Run next pass now ]  [ ⏰ Schedule: 2h ]  [ ✎ Edit plan ]
```

### 7. Mode-specific enhancements

**`auto-continue` mode:**
- Show "passes remaining estimate" = `itemsRemaining ÷ avgItemsPerPass`
- Show "Stop after this pass" button (sets a `stopAfterCurrentPass` flag; doesn't kill the running pass)
- Show live pass progress during run (SSE: current stdout tail, refreshed every 10s)

**`plan` mode:**
- After run completes, show the generated plan file content inline (read from planFile path)
- "Convert to build workflow" button → opens CreateWorkflow modal pre-filled with this planFile, mode `auto-continue`

**`scheduled` mode:**
- Show next run time as a human-readable string ("in 2h 14m")
- Show last 3 runs as a compact timeline strip

**`doctor` mode:**
- Show the DoctorReport inline in the run detail
- Show remediation action buttons (existing DoctorReportPanel — already built)

### 8. Live Pass Progress (SSE integration)

New SSE endpoint for live stdout streaming during a running pass:

```
GET /api/builder/runs/:runId/pass-live
→ SSE: event: line | data: { text: "...", ts: 1234 }
```

Server-side: tail the stdout log file and emit new lines as they appear. Client subscribes when a pass is `running`. Unsubscribes when pass finishes.

UI shows last 20 lines of live output with auto-scroll in the pass expansion panel:
```
[builder] Pass 1 starting at 2026-05-15T22:51:50+00:00
Now let me check what's left to implement in Phase 4...
Building TickerIntelPage component...
TypeCheck: ✓ 0 errors in 4.3s
Writing PASS_RESULT.json...
[builder] Pass 1 finished with exit code 0
```

---

## Part VI — Enhanced Vault Logging

The current vault log is minimal (one-liner in daily vault, full table in builder vault).

New vault log format includes analytics:

```markdown
# Builder run: NewsBites Finance+ builder pass

| Field | Value |
|---|---|
| Status | success |
| Workflow | wf_abc123 |
| Run | br_9961aa3a |
| Duration | 4m 37s |
| Plan | /opt/newsbites/plans/v3-tib-markets-assistant.md |
| Project | /opt/newsbites |

## Plan Progress
- Items completed this run: 5 (Phase 4a, 4b, portfolio API, watchlist, price chart)
- Items remaining: 5
- Estimated completion: 50%

## Files Changed
- app/api/portfolio/route.ts (+120)
- app/components/TickerIntel.tsx (+460)

## Validation
- TypeCheck: ✓
- Playwright: 28/30

## Analytics
- Passes: 1 | Duration: 4m 37s
- Children spawned: 0
- Models: minimax-m2.7
- Errors: 0 unresolved

## Next
Continue with Phase 4c — ticker pills in reader app.
```

---

## Part VII — AI Coder Best Practices (Embedded in System Prompt)

These are proven patterns from 2026 agentic coding research. Embed in every pass prompt.

### Context Budget Management
```
CONTEXT BUDGET RULES:
- Exploration budget: max 8 file reads before starting implementation
- Use grep -n / head -50 / wc -l instead of cat for unknown files
- Never read node_modules, .git, dist, or build artifacts
- Check file size with wc -l before reading (skip if > 500 lines unless directly editing)
```

### Specification-Driven Execution (from SDD research)
```
PLAN ADHERENCE:
- Read the plan file sections for your 2-3 target items ONLY (not the full plan)
- Mark [x] immediately after completing each item
- Do not implement items beyond your allocated scope
- Do not refactor code outside your plan items
```

### Incremental Verification
```
VERIFICATION CADENCE:
- After every 2-3 file edits: run bun run check (or equivalent)
- If typecheck fails after an edit: fix it before moving to the next item
- Do not accumulate more than 3 typecheck errors before fixing
- Run targeted tests (bun test path/to/relevant.test.ts) not the full suite
```

### Fail Fast Protocol
```
BLOCKER PROTOCOL:
- If a service is down and your task requires it: write PASS_RESULT.json with status="blocked"
- If a dependency is missing (import error for nonexistent package): write blocked + suggest fix
- If plan instructions are ambiguous for your item: write blocked + quote the ambiguous part
- Do NOT guess at blocked states — always declare and exit
```

### Minimal Diff Principle
```
SCOPE DISCIPLINE:
- Only edit files required by your plan items
- Do not "clean up" or refactor passing code you didn't need to touch
- If you find a bug in adjacent code: log it in passNote but don't fix it
- Keep diffs minimal — reviewability matters
```

### Child Agent Policy
```
CHILD AGENT RULES:
- Max 3 concurrent children (enforced by builder_spawn_child)
- Each child gets ONE specific task (not "fix everything in file X")
- Wait for all children before writing PASS_RESULT.json
- If a child fails: note in errors[] but don't re-run; flag in nextInstruction
```

---

## Part VIII — Implementation Phases

### Phase 1 — PASS_RESULT.json Protocol (Priority: CRITICAL)
**Estimate: 1-2 builder passes on control-surface**

- [x] Add `PASS_RESULT.json` write instruction to `buildCodexPrompt()` in runner.ts
- [x] Add `readPassResult()` function to runner.ts
- [x] Add `extractPassAnalytics()` function to runner.ts
- [x] Update `reconcileRunStatus()` to read PASS_RESULT.json and branch on status
- [x] Add `analytics_json`, `plan_items_done`, `plan_items_remaining`, `completion_percent` to builder_passes schema (migration)
- [x] Write `pass-analytics.json` artifact after each pass
- [x] Update `buildContinuationContext()` to prefer PASS_RESULT.json over raw stdout
- [x] Add full unchecked item list (not just 5) to continuation context
- [x] Update `logToVault()` to include analytics in vault log format
- [x] Add service-up check before Playwright validation steps
- [x] Fix `error` column extraction (don't write git diff / typecheck stdout there)

### Phase 2 — Better Failure Classification (Priority: HIGH)
**Estimate: 1 builder pass**

- [x] Add new `failureClass` values: `agent-oom`, `agent-killed`, `pass-timeout`, `no-result-file`, `plan-incomplete`, `plan-complete`, `blocked`
- [x] Add two-tier stall detection (warn at 300s, kill at `stallTimeoutSeconds`)
- [x] Add `classifyFailureDiagnosis()` server function
- [x] Add `/api/builder/passes/:id/diagnosis` BFF endpoint
- [x] Expose `FailureDiagnosis` type in builder API types

### Phase 3 — BuilderPage UI: Analytics + Failure Investigation (Priority: HIGH)
**Estimate: 2-3 builder passes on control-surface**

- [x] Add `RunAnalyticsCard` component (per-run session summary)
- [x] Expand `PassRow` click → `PassDetailPanel` with plan progress, files, validation, next instruction
- [x] Add `FailureInvestigationPanel` component (shown when pass status=failed)
- [x] Add "Suggested actions" buttons in failure panel (retry with narrowed instruction, retry with higher timeout, view stdout)
- [x] Add `SessionSummaryCard` component (shown when run is done)
- [x] Wire all UI to new analytics_json, plan_items_done, completion_percent fields

### Phase 4 — Plan Progress Widget + Next Steps (Priority: MEDIUM)
**Estimate: 1-2 builder passes on control-surface**

- [x] Add `GET /api/builder/workflows/:id/plan-progress` endpoint (parse plan file, return section breakdown)
- [x] Add `PlanProgressWidget` component in workflow detail
- [x] Add "Next Steps from Plan" panel (top 4 unchecked items + action buttons)
- [x] Add "Convert to build workflow" button in plan-mode run results

### Phase 5 — Live Pass Progress + Mode-specific UX (Priority: MEDIUM)
**Estimate: 2 builder passes on control-surface**

- [x] Add `GET /api/builder/runs/:runId/pass-live` SSE endpoint (tail stdout log)
- [x] Add live pass output panel in running pass expansion
- [x] Add "Stop after this pass" flag + UI button for auto-continue mode
- [x] Add passes-remaining estimate for auto-continue workflows
- [x] Add next-run-time countdown for scheduled mode
- [x] Add "plan file content" inline view for plan-mode run results

### Phase 6 — Context Budget Enforcement (Priority: MEDIUM)
**Estimate: 1 pass to update system prompts**

- [x] Add full "Context Budget Rules" section to `buildCodexPrompt()`
- [x] Add "Verification Cadence" rules to pass prompt
- [x] Add "Blocker Protocol" rules to pass prompt
- [x] Add "Minimal Diff Principle" rules to pass prompt
- [x] Add "Child Agent Rules" to pass prompt (already partial — strengthen)
- [x] Make stall timeout configurable per-workflow in the UI (currently only in config JSON)
- [x] Make pass timeout editable in the workflow modal

---

## Part IX — Validation Contract

After each implementation phase, the following must pass:

```bash
# TypeCheck
cd /opt/opencode-control-surface && bun run check

# Unit tests
bun test server/builder/ server/api/builder.test.ts

# Integration: create a test workflow and run one pass
curl -X POST http://127.0.0.1:3000/api/builder/workflows \
  -H "Content-Type: application/json" \
  -d '{"name":"test","planFile":"/tmp/test-plan.md","projectRoot":"/tmp/test-proj","mode":"once",...}'

# Verify PASS_RESULT.json is written
ls /var/lib/control-surface/builder-runs/<latest>/PASS_RESULT.json

# Verify analytics extracted
sqlite3 /var/lib/control-surface/dashboard.sqlite \
  "SELECT analytics_json FROM builder_passes ORDER BY started_at DESC LIMIT 1"

# UI smoke test
playwright test --grep "BuilderPage" --viewport 1920x1080
playwright test --grep "BuilderPage" --viewport 393x852
```

---

## Appendix A — Key Files

| File | Purpose |
|---|---|
| `server/builder/runner.ts` | Core: pass execution, stall detection, continuation context |
| `server/builder/store.ts` | DB types, read/write functions |
| `server/builder/discovery.ts` | Project/skill/model discovery |
| `server/builder/doctor.ts` | Doctor review integration |
| `server/builder/scheduler.ts` | Cron/scheduled mode |
| `server/builder/modelSelector.ts` | Model selection for pass roles |
| `server/api/builder.ts` | BFF endpoints for all builder operations |
| `app/routes/BuilderPage.tsx` | UI: ~2000 lines, all builder surfaces |

## Appendix B — Session Data Location

| Artifact | Path |
|---|---|
| Run directories | `/var/lib/control-surface/builder-runs/br_<id>/` |
| Pass stdout | `pass-<N>-stdout.log` |
| Pass stderr | `pass-<N>-stderr.log` |
| Pass script | `pass-<N>.sh` |
| Pass prompt | `pass-<N>-prompt.txt` |
| PASS_RESULT (new) | `PASS_RESULT.json` |
| Pass analytics (new) | `pass-<N>-analytics.json` |
| Continuation context | `continuation-<N>.txt` |
| Pre-pass git patch | `pre-pass.patch` |
| Children manifest | `children-manifest.jsonl` |
| Builder vault logs | `/opt/ai-vault/builder/YYYY-MM-DD-<wf>-<run>.md` |
| Daily vault | `/opt/ai-vault/daily/YYYY-MM-DD.md` |

## Appendix C — Research Sources

- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Packmind: Context Engineering Best Practices for AI-Powered Dev Teams](https://packmind.com/context-engineering-ai-coding/context-engineering-best-practices/)
- [Addy Osmani: How to write a good spec for AI agents](https://addyosmani.com/blog/good-spec/)
- [XTrace: AI Agent Handoff — Why Context Breaks & How to Fix It](https://xtrace.ai/blog/ai-agent-context-handoff)
- [Augment Code: Why Multi-Agent LLM Systems Fail](https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them)
- [MindStudio: What Is Context Management in AI Agents](https://www.mindstudio.ai/blog/context-management-ai-agents)
- [Faros AI: Best AI Coding Agents for 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026)

---

## Session Log

- 2026-05-15: Plan created from analysis of 20 builder runs (174 total run dirs), failure taxonomy, gap analysis of runner.ts (2295 lines) and BuilderPage.tsx (~2000 lines), V4 and V4.5 plan review, and 2026 agentic systems research.
- 2026-05-18: Phase 2 — Better Failure Classification. Added new failureClass values (agent-oom, agent-killed, no-result-file, plan-incomplete, plan-complete). Enhanced classifyFailureDiagnosis() with all new classes. Verified two-tier stall detection and diagnosis endpoint already exist. TypeCheck ✓, runner tests ✓ (3/3), builder API tests ✓ (14/14).
- 2026-05-18: Phase 3a — BuilderPage UI enhancements. Added actionable suggested-action buttons to FailureInvestigationPanel (retry, view-stdout, pause-workflow). Enhanced expanded pass panel with plan progress, files edited/created, validation counts from analyticsJson. TypeCheck ✓, tests ✓ (17/17).

<!-- Builder run br_2098b: failed at 2026-05-18T00:58:20.140Z — details: /opt/ai-vault/builder/2026-05-18-bw_ca0d0-br_2098b.md -->

<!-- Builder run br_dda62: failed at 2026-05-18T01:20:43.635Z — details: /opt/ai-vault/builder/2026-05-18-bw_26d99-br_dda62.md -->

<!-- Builder run br_b6f9f: success at 2026-05-18T01:36:11.112Z — details: /opt/ai-vault/builder/2026-05-18-bw_304ff-br_b6f9f.md -->