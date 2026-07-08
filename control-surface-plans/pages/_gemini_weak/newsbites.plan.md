# /newsbites — Product Plan
> One-line: what this page is and who it's for.

An operational dashboard for the NewsBites site, providing article statistics, deployment controls, and content management actions for the editorial operations team.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/NewsBitesPage.tsx` (✅ solid)
  - A comprehensive React component using `useApi` to fetch data from `/api/newsbites` (`NewsBitesPage.tsx:210`).
  - Displays key statistics (total articles, published today, etc.) (`NewsBitesPage.tsx:327-333`).
  - Shows deployment status, commit hash, and includes a "Deploy" button (`NewsBitesPage.tsx:340-351`) that calls `POST /api/newsbites/deploy` (`NewsBitesPage.tsx:311`).
  - Monitors deploy job progress by polling `GET /api/newsbites/deploy/:jobId` (`NewsBitesPage.tsx:231`).
  - Renders charts for vertical mix and 30-day publish rate using `recharts` (`NewsBitesPage.tsx:376`, `NewsBitesPage.tsx:392`).
  - Provides a filterable and sortable table of all articles (`NewsBitesPage.tsx:422-520`).
  - Per-article actions:
    - "inspect" opens the article's dossier page (`NewsBitesPage.tsx:300`).
    - "pic" opens a modal to change the cover image via Pexels search or upload (`NewsBitesPage.tsx:55`).
    - "kill" deletes the article from disk (`NewsBitesPage.tsx:288`).
- **Backend**:
  - `server/api/newsbites.ts`: Handles `GET /api/newsbites`. It aggregates article and deployment data (`newsbites.ts:4`).
  - `server/api/newsbites-actions.ts`: Handles article-specific actions like deleting, finding dossier paths, and managing images.
  - `server/api/actions.ts`: Contains the `newsBitesDeployHandler` for the deploy action (`actions.ts:74`).
  - `server/adapters/newsbites.ts`: The data source adapter.
    - `getAllArticles()`: Reads all article markdown files from `/opt/newsbites/content/articles/`, parses frontmatter. (✅ solid) (`newsbites.ts:18`)
    - `getDeployInfo()`: Checks if the site is reachable via `fetch`, reads `git log -1` for last commit, and gets last deploy timestamp. (✅ solid) (`newsbites.ts:51`)
- **Data Sources**:
  - Article content: Markdown files in `/opt/newsbites/content/articles/` (`newsbites.ts:24`).
  - Deploy status: `git` command output and network checks (`newsbites.ts:55, 60`).
- **Readiness**: ✅ solid. The page is functional and feature-rich.

## 2. Gaps, mock & broken parts
- **No deep-linking to Insights**: The page displays deployment status but does not link to or create any `insights` for failures. For example, if `siteReachable` is false, it's just a red pill (`NewsBitesPage.tsx:334`); there is no corresponding entry in the `/insights` inbox.
- **Stale Deploy Detector Missing**: The `DASHBOARD_V5_PLAN.md` calls for a `Site unreachable / stale deploy` detector, but it's not implemented in `server/insights/scanners/ops.ts`. The frontend calculates if a deploy is stale implicitly but this isn't a system-wide insight.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: ✅ The page is stable and provides a good user experience.
- **G2 Controllable via GUI**: ✅ Provides GUI controls for deploying, deleting articles, and changing images.
- **G3 Complete**: 🟡 Mostly complete, but lacks integration with the insights/governance system.
- **G4 Detects everything**: 🔴 Fails to create insights for critical NewsBites-related failures like the site being down or a stale deployment. The information is local to the page only.
- **G5 Findable, readable, actionable**: 🟡 Actionable within the page, but failures are not centrally located in the `/insights` inbox, making them less findable.
- **G6 Prefer automatic; fall back to a single Apply button**: 🟡 The deploy action is a manual "Apply" button, which is appropriate. No automatic remediations are in place or needed for this surface.
- **G7 AI reasoning BEFORE insights**: 🔴 N/A, as no insights are generated.
- **G8 An actual admin center**: 🟡 It's a strong, self-contained operational page but feels like a separate app rather than an integrated part of the admin center due to the lack of insight integration.

## 4. Best-practice research
- **Integrated Health Signals**: Products like Datadog or Vercel don't just show a status pill. They treat deployments and site reachability as first-class health signals. A failing health check (like site down) creates a monitor alert (an "insight" in our terms), which is tracked, notified on, and has a history.
- **Deployment as a Core Event**: In modern admin panels (e.g., Netlify, Vercel), deployments are central events. They are linked to commits, trigger notifications, and are overlaid on performance graphs to correlate changes with regressions. Our system has `deploy.lastCommitHash` but doesn't treat the deploy itself as a system-wide event in the audit log or as a marker on metric charts.
- **Actionable Alerts**: An alert/insight shouldn't just state the problem. It should offer a one-click action to remediate, if possible. For a "site down" insight, the recommended action should be "Redeploy".

## 5. Target design
- **Insight-driven Status**: The "site: up/down" pill (`NewsBitesPage.tsx:334`) should be driven by the `/insights` system.
  - When the page loads, it should check for an open insight with `sourceKey: 'ops:site-unreachable:newsbites'`.
  - The pill's color and state will be based on the insight's presence.
  - Clicking the pill will navigate to `/insights?focus=ops:site-unreachable:newsbites`, taking the operator directly to the problem.
- **Stale Deploy Insight**: A similar pattern for stale deployments. If a deploy is considered stale, an info/low-severity insight should be present.
- **UI Consistency**: The deploy button area should be consistent with other action-oriented pages. The button is already primary and clear, which is good. The job status feedback is also clear and well-placed.
- **Empty/Loading/Error states**: The page has good loading/error states (`NewsBitesPage.tsx:265-266`). These should be preserved.
- **Mobile Parity**: The layout is responsive, but tables are notoriously difficult on mobile. The current table will likely cause horizontal scrolling. A better mobile design would collapse the table rows into a list of cards.

## 6. Features to add (prioritized)
- **MUST**:
  - Implement a `newsbites` scanner that creates insights for:
    - **Site Unreachable**: A critical insight with `sourceKey: 'ops:site-unreachable:newsbites'` if `getDeployInfo()` returns `siteReachable: false`. The recommended action should be `start-job:deployment:newsbites`.
    - **Stale Deployment**: A low-severity insight with `sourceKey: 'ops:stale-deployment:newsbites'` if the last deployment is older than a configured threshold (e.g., 24 hours) and there are newer approved articles.
- **SHOULD**:
  - Modify the `/newsbites` page to query for these specific insights and link to them. The status pills should reflect the insight state.
  - Ensure the "Deploy" action is registered in the action catalog (`server/api/actionDescriptors.ts`) so it can be used by the insights system. The action `newsBitesDeployHandler` already exists in `server/api/actions.ts:74`, but it needs to be wired up for insights.
  - Convert the `<table>` to a more responsive component that collapses to cards on mobile viewports to improve mobile parity (G2).
- **EXTRA**:
  - Log every deployment as an event in the `audit` table so it can be used as a marker on metric graphs across the system.
  - Add a sparkline to the header showing deployment frequency over the last 30 days.

## 7. Sellable-in-parts
This page could be part of a "Content Operations Suite". For any company running a content site (blog, news, etc.) on a static site generator or similar framework, this provides a dedicated control surface for monitoring content velocity, managing articles, and controlling deployments, separate from the main CMS. The pitch is "A Vercel/Netlify-like operational dashboard tailored for your content team."

## 8. Backend work
- **New Detector**: Create `server/insights/scanners/newsbites.ts`.
  - Add a `runNewsbitesScan()` function.
  - Inside, call `getDeployInfo()` from `server/adapters/newsbites.ts`.
  - Implement `mapNewsbitesFindings()` that checks for `siteReachable: false` and stale deploys, returning `InsightInput` objects with appropriate `sourceKey`s.
- **Integrate Scanner**: Call `runNewsbitesScan()` from the main insight scheduler (`server/insights/scheduler.ts`).
- **Action Descriptor**: Ensure a descriptor for the redeploy action exists in `server/api/actionDescriptors.ts` with ID `start-job:deployment:newsbites` and is linked to the `newsBitesDeployHandler`.
- **Schema**: No schema changes needed. Uses existing `insights` table.

## 9. Build slices
1.  **Backend Detector**: Implement the `newsbites.ts` scanner with the "site unreachable" detector and wire it into the scheduler. Manually verify that stopping the newsbites service creates a `critical` insight.
2.  **Wire Action**: Ensure the "redeploy" action is correctly described and can be triggered from an insight's "Apply" button. Verify this works.
3.  **Frontend Integration**: Update `NewsBitesPage.tsx` to check for the `ops:site-unreachable:newsbites` insight and link the status pill to it.
4.  **Stale Deploy**: Add the "stale deployment" detector logic to the scanner and integrate it with the frontend.
5.  **Mobile View**: Refactor the articles table into a responsive component.

## 10. Verification
- Stop the `newsbites.service`. Verify a `critical` insight with `sourceKey: 'ops:site-unreachable:newsbites'` appears in the `/insights` inbox within one scan cycle.
- Verify the insight has an "Apply" button that, when clicked, redeploys the NewsBites site.
- Verify the site-status pill on `/newsbites` turns red and links to the insight.
- After restarting the service, verify the insight is auto-resolved.
- Manually create a condition for a stale deploy (e.g., by touching an approved article file to have a newer timestamp than the last deploy) and verify a `low` severity insight is created.
- Check the page on a mobile viewport in browser devtools to confirm the table collapses to cards and all actions are usable (≥44px targets).
