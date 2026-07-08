# /today — Product Plan
> One-line: what this page is and who it's for.

A "morning paper" summary page for the operator, showing the most critical items needing attention across the entire system right now.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/TodayPage.tsx` (✅ solid)
  - Fetches data from `/api/today` (`TodayPage.tsx:14`).
  - Displays a series of "cards" for different domains:
    - **Insights**: Shows a count of open critical/high severity insights, with a link to the `/insights` page (`TodayPage.tsx:28`).
    - **Approvals**: Shows a count of items waiting for manual approval, linking to the relevant page (e.g., `/autopipeline`) (`TodayPage.tsx:37`).
    - **Finance**: Displays the month-to-date cost and projected cost, linking to `/finance-intel` (`TodayPage.tsx:45`).
    - **NewsBites**: Shows published-today stats, linking to `/newsbites` (`TodayPage.tsx:54`).
    - **Autopipeline**: Shows queue depth, linking to `/autopipeline` (`TodayPage.tsx:63`).
    - **Infrastructure**: Shows the number of services that are down, linking to `/infra` (`TodayPage.tsx:72`).
- **Backend**:
  - `server/api/today.ts`:
    - The main handler is an aggregator that calls multiple other adapters and API handlers to build its response (`today.ts:9`).
    - It calls `countOpenInsights`, `getFinanceSummary`, `getPipelineState`, `getDeployInfo`, and `getServiceStatuses` (`today.ts:10-14`).
    - It synthesizes this information into a compact `TodaySummary` object.
- **Data Sources**:
  - It pulls data from many of the same sources as the other pages: `insights` DB table, finance adapters, pipeline state, etc. It acts as a meta-aggregator.
- **Readiness**: ✅ solid. It's a well-structured and effective summary page.

## 2. Gaps, mock & broken parts
- **Not the Default Page**: `DASHBOARD_V5_PLAN.md` specifies this should be the default page (`/`) an operator lands on. However, `app/App.tsx:28` routes `/` to `DashHome`, and `/today` is its own route. The current `DashHome` is a more generic welcome page.
- **No Personalization/Customization**: The cards are hardcoded. A more advanced dashboard would allow the operator to add, remove, or reorder cards based on what's most important to them.
- **"Detections" Card is Vague**: The "Insights" card just gives a count. It could be more impactful by listing the *titles* of the top 1-2 most critical insights directly on the card.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: ✅ The page is very usable and stable.
- **G2 Controllable via GUI**: ✅ While not directly controlling things, every piece of information is a deep-link to the page that *does* have the controls, which is excellent.
- **G3 Complete**: ✅ For its purpose as a summary dashboard, it's remarkably complete and well-integrated.
- **G4 Detects everything**: ✅ It effectively surfaces detections from all other parts of the system (via insights, approval counts, etc.).
- **G5 Findable, readable, actionable**: ✅ This page is the heart of findability. It puts the most important, actionable information front-and-center.
- **G8 An actual admin center**: ✅ This page, more than any other, makes the application feel like a cohesive admin center by tying all the disparate parts together.

## 4. Best-practice research
- **Customizable Dashboards**: Most modern monitoring and admin tools (e.g., Grafana, Datadog, even Jira dashboards) allow users to build their own dashboards. They provide a library of "widgets" (our "cards"), and users can arrange them on a grid.
- **"At a Glance" Summaries**: The best dashboards don't just show counts. They provide context. For example, instead of "5 Critical Insights", they might show "5 Critical Insights, including 'Provider API Outage'". This immediate context helps operators triage without clicking.
- **Smart Prioritization**: Some advanced systems try to learn what's important to a user. If an operator always clicks on the "Finance" card first, the system might learn to place that card at the top.

## 5. Target design
- **Make it the Homepage**: Change the routing in `app/App.tsx` so that the `/` route renders `TodayPage` instead of `DashHome`. This makes it the true landing page for operators.
- **Enhance the Insights Card**: Modify the `/api/today` endpoint to fetch not just the count, but the titles of the top 2-3 most severe open insights. The `TodayPage`'s "Insights" card should be updated to list these titles, making it more immediately informative.
- **Long-Term: Customizable Layout**: For a future version, consider implementing a drag-and-drop dashboard system.
  - The backend would provide a list of available "widgets".
  - The user's chosen layout would be saved to `operator_state`.
  - The frontend would render the widgets in the user's preferred order.

## 6. Features to add (prioritized)
- **MUST**:
  - Make the `/today` page the default homepage by changing the root route in `app/App.tsx`.
  - Enhance the `/api/today` handler and the frontend "Insights" card to display the titles of the top 2 most critical open insights.
- **SHOULD**:
  - Add a "Scout" card to the page, showing the time of the last scout run and the number of candidates it found, linking to `/scout`. This requires adding a call to a scout adapter in the `/api/today` handler.
- **EXTRA**:
  - Implement a basic customizable dashboard where users can reorder the cards. The order could be saved in local storage for simplicity, or in `operator_state` for persistence across devices.

## 7. Sellable-in-parts
This is the "Mission Control" or "Command Center" dashboard. It's the central hub that ties an entire product suite together. It's not sold separately, but it's the key feature that makes a collection of tools feel like a single, integrated platform. The pitch is "Your entire operation on a single screen. See what needs your attention, right now."

## 8. Backend work
- **Enhance `/api/today`**:
  - Modify the handler to call `listInsights('open')` from `server/insights/store.ts`. It should then extract the titles of the top 2-3 insights with `critical` or `high` severity.
  - Add a call to a new `getScoutSummary()` adapter function to get the data for the new Scout card.
- **New Scout Adapter function**: Create `getScoutSummary()` in `server/adapters/scout.ts` (or similar) that fetches the most recent run from the `scout_runs` table and returns a compact summary.
- **No Schema Changes**: No database changes are required.

## 9. Build slices
1.  **Homepage Route Change**: A simple one-line change in `app/App.tsx` to make this the default page.
2.  **Enhanced Insights Card (Backend)**: Update the `/api/today` handler to include the top insight titles in its response.
3.  **Enhanced Insights Card (Frontend)**: Update the `TodayPage.tsx` component to display the new insight titles on the card.
4.  **Scout Card**: Implement the `getScoutSummary` adapter, add the data to the `/api/today` response, and add the new "Scout" card to the `TodayPage` UI.
5.  **Customization**: Implement the drag-and-drop reordering for the dashboard cards.

## 10. Verification
- After the routing change, verify that navigating to the root `/` of the application now shows the `TodayPage`.
- Create a critical insight manually in the database. Verify its title appears on the "Insights" card on the Today page.
- Verify all existing cards on the Today page still show the correct data and link to the correct pages.
- Verify the new "Scout" card appears and displays accurate data from the latest scout run.
- After implementing customization, verify that reordering the cards works and the layout is persisted across page reloads.
