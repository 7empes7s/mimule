# /scout — Product Plan
> One-line: what this page is and who it's for.

A monitoring and configuration page for the Scout agent, which automatically discovers new story topics for the editorial pipeline.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/ScoutPage.tsx` (🟡 partial)
  - Fetches scout runs from `/api/scout/runs` and config from `/api/scout/config` (`ScoutPage.tsx:16, 17`).
  - Displays a table of recent Scout runs, including the number of candidates found and the duration (`ScoutPage.tsx:136`).
  - Allows expanding a run to see the list of candidate topics, with scores and status (`ScoutPage.tsx:156`).
  - Provides a "Trigger new run" button (`ScoutPage.tsx:125`).
  - Shows the current configuration in a `JSONEditor` component, allowing for edits (`ScoutPage.tsx:71`).
  - A "Save config" button sends the updated configuration to `PUT /api/scout/config` (`ScoutPage.tsx:94`).
- **Backend**:
  - `server/api/scout.ts`:
    - `getScoutRuns`, `getScoutRun`: Fetches run history from the `scout_runs` table in `dashboard.db` (`scout.ts:18, 38`).
    - `getScoutConfig`: Reads the agent configuration from a JSON file on disk (`/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/scout_config.jsonc`) (`scout.ts:54`).
    - `updateScoutConfig`: Writes changes back to the same JSON file (`scout.ts:68`).
    - `triggerScoutRun`: Executes an external script (`/opt/mimoun/scripts/run-scout-now.sh`) to start a new run (`scout.ts:88`).
- **Data Sources**:
  - Run history: `scout_runs` table in `dashboard.db`.
  - Configuration: A JSONC file on disk (`scout_config.jsonc`).
- **Readiness**: 🟡 partial. The page is functional for monitoring and basic configuration, but editing config via raw JSON is not ideal.

## 2. Gaps, mock & broken parts
- **Raw JSON Configuration**: Configuration is done by editing a raw JSON blob (`ScoutPage.tsx:71`). This is brittle, error-prone, and doesn't align with goal G2 (Controllable via GUI). There are no descriptions or validation for the fields.
- **No Insight Integration**: The page doesn't generate or link to any insights. For example, if a scout run fails, or if it consistently finds zero candidates, this isn't flagged as an operational issue in the central `/insights` inbox.
- **"Run log" is a TODO**: The UI for an expanded run shows a "Run log" button, but it's disabled and has a `// TODO: get log from backend` comment, indicating it's not implemented (`ScoutPage.tsx:185`).

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: ✅ The page is stable for its current feature set.
- **G2 Controllable via GUI**: 🔴 Fails this goal due to the raw JSON editor for configuration. Routine configuration changes shouldn't require knowledge of the underlying JSON structure.
- **G3 Complete**: 🟡 The core loop is there, but missing log viewing and a user-friendly config editor makes it feel incomplete.
- **G4 Detects everything**: 🔴 Fails to detect and surface problems. A failing or ineffective Scout run is a silent failure.
- **G5 Findable, readable, actionable**: 🟡 Problems are not findable in `/insights`. Actions are available on the page, but only if you know to look there.
- **G6 Prefer automatic; fall back to a single Apply button**: ✅ "Trigger new run" and "Save config" are good "Apply" style buttons.
- **G7 AI reasoning BEFORE insights**: 🔴 N/A as no insights are generated.
- **G8 An actual admin center**: 🟡 It's a functional but isolated tool. The raw JSON editor makes it feel more like a developer utility than a polished admin component.

## 4. Best-practice research
- **Form-Based Configuration**: Professional admin tools (e.g., cloud provider dashboards, network gear GUIs) use structured forms for configuration. Each field has a clear label, help text, and input validation (e.g., number ranges, dropdowns for enum values, regex for strings). This prevents invalid configurations.
- **Integrated Logging**: Similar to the `/autopipeline` page, being able to see the logs for a specific run directly in the UI is a standard feature for any job monitoring page.
- **Performance Monitoring**: Tools that manage automated jobs, like a scout agent, often provide analytics. This could include a chart showing the number of candidates found per run over time, or the success/failure rate of runs. This helps an operator understand if the agent's performance is degrading.

## 5. Target design
- **Structured Configuration Editor**: Replace the `JSONEditor` with a proper form.
  - Create dedicated input components for each field in `scout_config.jsonc` (e.g., a text area for `basePrompt`, a multi-select for `verticals`, number inputs for `maxAgeHours` and `minScore`).
  - Add help text/tooltips explaining what each configuration parameter does.
- **Implement Log Viewer**: Enable the "Run log" button. On click, it should open a modal that displays the logs for that specific run, fetched from a new backend endpoint.
- **Insight Integration**:
  - If a scout run fails (e.g., the script exits non-zero), an insight with `severity: 'medium'` and `sourceKey: 'scout:run-failed:<run_id>'` should be created.
  - If multiple consecutive runs find zero candidates, a `low` severity insight `sourceKey: 'scout:no-candidates'` should be created, suggesting the prompts or sources may need review.
- **Add Analytics**: Include a simple bar chart showing the number of candidates found in the last 10-20 runs to visualize the agent's effectiveness over time.

## 6. Features to add (prioritized)
- **MUST**:
  - Replace the raw JSON editor with a structured form for editing the Scout configuration.
  - Implement the "Run log" viewer feature. Requires a backend endpoint to retrieve logs for a given run ID.
  - Create a new scanner for Scout that generates insights for failed runs.
- **SHOULD**:
  - Add the detector for multiple consecutive runs with zero candidates.
  - Add a simple chart to visualize the number of candidates per run over time.
- **EXTRA**:
  - Add a "Re-run" button for a past run, which would trigger a new run using the *exact same configuration* as the historical run. This is useful for debugging.
  - Make the list of candidate topics in the expanded view sortable and filterable.

## 7. Sellable-in-parts
This can be sold as a "Data Sourcing & Prospecting Agent Monitor". Any company using automated agents to scrape websites, trawl APIs, or search for leads/data would benefit from this. It provides a UI to configure the agent's parameters, monitor its execution, and review its findings, all in one place. The pitch is "A control panel for your data-prospecting bots."

## 8. Backend work
- **New Endpoints**:
  - `GET /api/scout/runs/:id/log`: A new endpoint to retrieve the log file for a specific scout run. The `run-scout-now.sh` script will need to be modified to pipe its output to a unique log file associated with the run ID.
- **New Scanner**: Create `server/insights/scanners/scout.ts`.
  - Add a `runScoutScan()` function that queries the `scout_runs` table.
  - Implement logic to detect failed runs (e.g., a `status` column in the table) and consecutive runs with `candidates_found: 0`.
  - This function will return `InsightInput` objects to be consumed by the insights scheduler.
- **Update `triggerScoutRun`**: Modify the `triggerScoutRun` handler in `server/api/scout.ts` to log output to a file that can be retrieved by the new log endpoint and to record run failure status in the `scout_runs` table.
- **Schema**: Add a `status` (e.g., 'running', 'success', 'failed') and `log_path` column to the `scout_runs` table in `dashboard.db`.

## 9. Build slices
1.  **Backend Logging & Status**: Update the `scout_runs` schema and the `run-scout-now.sh` script to capture run status and logs. Implement the `GET /api/scout/runs/:id/log` endpoint.
2.  **Log Viewer UI**: Enable the "Run log" button on the frontend to call the new endpoint and display logs in a modal.
3.  **Insight for Failures**: Implement the backend scanner in `server/insights/scanners/scout.ts` to detect failed runs and create insights. Link to these insights from the run table on the Scout page.
4.  **Structured Config Form**: Replace the JSON editor on the frontend with a proper form-based editor for the scout configuration.
5.  **Analytics Chart**: Add the chart showing candidates per run.

## 10. Verification
- Trigger a Scout run that is designed to fail. Verify that the run is marked as "failed" in the UI and that a `medium` severity insight is created in `/insights`.
- Verify the "Run log" button on the failed run shows the actual error output.
- Modify the configuration using the new form-based editor, save it, and verify the `scout_config.jsonc` file is updated correctly.
- Trigger a successful run and verify its status and logs are displayed correctly.
- Manually create DB entries for several runs with 0 candidates and verify the "no candidates" insight is created.
