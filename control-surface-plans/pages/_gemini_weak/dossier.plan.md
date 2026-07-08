# /dossier — Product Plan
> One-line: what this page is and who it's for.

An inspector for viewing the "dossier" of a single autopipeline story, showing all generated artifacts, logs, and metadata from each pipeline stage.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/DossierInspectorPage.tsx` (✅ solid)
  - The route is `/autopipeline/dossier/:date/:slug`, which inspects a specific story.
  - Fetches data from `/api/dossier/:date/:slug` (`DossierInspectorPage.tsx:28`).
  - Displays the story's title, status, vertical, and other metadata (`DossierInspectorPage.tsx:50`).
  - Provides a tabbed interface to view different artifacts from the pipeline run (`DossierInspectorPage.tsx:64`):
    - **Dossier**: The main `DOSSIER.md` file that tracks the story's evolution.
    - **Logs**: The full `log.txt` for the pipeline run.
    - **Artifacts**: A list of all files generated during the run (e.g., `research.json`, `write.md`, `verify.json`). Clicking a file shows its content.
    - **Article**: The final rendered markdown of the `article.md` file.
  - Renders markdown content using `react-markdown` (`DossierInspectorPage.tsx:109`).
  - Provides a "Re-queue" button to send the story back into the autopipeline at a specific stage (`DossierInspectorPage.tsx:129`).
- **Backend**:
  - `server/api/dossier.ts`:
    - Handles `GET /api/dossier/:date/:slug` (`dossier.ts:25`).
    - It reads the dossier directory for the specified story from `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/:date/:slug`.
    - It reads all the files within that directory and packages them into the JSON response for the frontend (`dossier.ts:36-47`).
- **Data Sources**:
  - Files on disk in the dossier directory for each story.
- **Readiness**: ✅ solid. It's a very effective tool for deep-diving into a single pipeline run, crucial for debugging and quality control.

## 2. Gaps, mock & broken parts
- **No Insight Integration**: The page is purely for inspection. It does not create or link to any insights. If a pipeline run failed, the dossier inspector is where you'd go to find out *why*, but the initial alert ("this pipeline run failed") doesn't originate from here and doesn't deep-link here. The link is typically from the `/autopipeline` or `/insights` page *to* the dossier.
- **No Indication of "Stuck" State**: When viewing the dossier for a story that is currently running and is stuck, there is no visual indicator on this page to show that it's stuck. The information lives on the `/autopipeline` page or in an insight, but not here.
- **"Re-queue" lacks guardrails**: The re-queue functionality is powerful, but it's easy to accidentally re-queue a story that's already in the queue, potentially causing race conditions or duplicate processing.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: ✅ Extremely usable and stable. It's a well-designed inspection tool.
- **G2 Controllable via GUI**: ✅ The "Re-queue" functionality provides a key control for pipeline recovery.
- **G3 Complete**: ✅ For its purpose as an inspector, it is very complete.
- **G4 Detects everything**: 🟡 N/A. This page is not for detection, but for inspection *after* detection. However, it could be enhanced to highlight errors within logs automatically.
- **G5 Findable, readable, actionable**: ✅ The content is highly readable and laid out logically. It's the primary destination for making a finding "actionable" by providing deep context.
- **G8 An actual admin center**: ✅ This page is a perfect example of a component that makes the system feel like a proper admin center. It provides a transparent, low-level view into the automated systems.

## 4. Best-practice research
- **IDE-like Debug Views**: Tools like VS Code's debugger or browser dev tools provide similar inspection capabilities. They show a call stack (similar to our pipeline stages), variables (our artifacts), and console output (our logs).
- **Trace Viewers**: Distributed tracing systems (like Jaeger or Zipkin) provide a waterfall view of a request's lifecycle across multiple services. The dossier inspector is a similar concept but for a single service's internal stages. Advanced trace viewers allow you to see timing information for each step, which is something the dossier view could benefit from.
- **Error Highlighting**: Modern log viewers automatically detect keywords like "error" or "failed" and highlight those lines in red to draw the operator's attention. The dossier's log view is plain text.

## 5. Target design
- **Link from Insights**: The primary improvement is not on this page, but in how other pages link *to* it. Any insight related to a specific story (e.g., `ops:stuck-story:<id>`) should have a primary action/link that goes directly to this dossier inspector page for that story.
- **Error Highlighting in Logs**: Enhance the log viewer. When displaying the `log.txt` file, parse the text and automatically highlight any lines containing `ERROR`, `FAILED`, `WARN`, `CRITICAL`, etc., with appropriate colors. This would dramatically speed up debugging.
- **Timeline Visualization**: Add a new tab called "Timeline". This would parse the log file for timestamps and visualize the duration of each stage (e.g., `research`, `write`, `verify`) in a simple waterfall or Gantt chart. This would help operators quickly identify which stage is taking the longest.
- **Safer Re-queue**: Before showing the "Re-queue" button, the page should make a call to `/api/autopipeline` to check if the story is already in the queue. If it is, the button should be disabled, with a tooltip explaining why.

## 6. Features to add (prioritized)
- **MUST**:
  - In the "Logs" tab, implement automatic highlighting for lines containing error-related keywords.
  - Add a guardrail to the "Re-queue" button to prevent re-queueing a story that is already in the active pipeline queue.
- **SHOULD**:
  - Add a "Timeline" tab that visualizes the time spent in each pipeline stage. This would require parsing timestamps from the `log.txt` file.
  - On the "Artifacts" tab, for JSON files, provide a formatted/collapsible view instead of raw text.
- **EXTRA**:
  - Add a "Cost" tab. This would require the autopipeline to log token usage for each stage. The tab would then display the LLM cost associated with generating this specific story, broken down by stage.

## 7. Sellable-in-parts
This is a "Pipeline Debugger" or "Trace Inspector". It's a feature that would be sold as part of a larger CI/CD, ETL, or job queueing product. The value proposition is radical transparency. Instead of a black box, your automated pipeline becomes a glass box. Operators and developers can see exactly what happened at every step, which is invaluable for debugging, quality assurance, and building trust in the automation.

## 8. Backend work
- **Enhance Dossier Handler**: The backend handler for `/api/dossier/:date/:slug` needs to be enhanced.
  - To implement the "Timeline", it needs to read `log.txt` and parse out stage-timing information.
  - To implement the "Cost" tab, it would need to read cost information, likely from another artifact file logged by the pipeline.
- **API for Queue Check**: A new lightweight endpoint might be needed, e.g., `GET /api/autopipeline/status/:story_id`, to quickly check if a story is in the queue, to avoid loading the entire pipeline state.
- **No Schema Changes**: All data is read from files on disk, so no database changes are needed.

## 9. Build slices
1.  **Log Highlighting**: Implement the error-keyword highlighting in the frontend `DossierInspectorPage.tsx`'s log viewer. This is a frontend-only change.
2.  **Re-queue Guardrail**: Implement the check to see if a story is already in the queue before enabling the "Re-queue" button.
3.  **Timeline View**: Implement the backend logic to parse stage timings from the log file and the new "Timeline" tab on the frontend to visualize it.
4.  **JSON Artifact Formatting**: On the frontend, when an artifact is a `.json` file, use a component like `react-json-view` to render it instead of plain text.
5.  **Cost Tab**: Instrument the autopipeline to log costs, then build the backend and frontend for the "Cost" tab.

## 10. Verification
- Find a dossier for a failed run. Verify that when viewing the log, error lines are highlighted in red.
- Find a story that is currently in the autopipeline queue. Navigate to its dossier inspector page. Verify the "Re-queue" button is disabled. For a story not in the queue, verify it's enabled.
- Verify all tabs (Dossier, Logs, Artifacts, Article) continue to load and display content correctly.
- After implementation, verify the "Timeline" tab shows a plausible visualization of the pipeline stages and their durations.
