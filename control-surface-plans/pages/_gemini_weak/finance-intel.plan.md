# /finance-intel — Product Plan
> One-line: what this page is and who it's for.

A dashboard for monitoring and analyzing the financial costs associated with running the AI-operated media company, aimed at operators and business stakeholders.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/FinanceIntelPage.tsx` (✅ solid)
  - Fetches financial data from `/api/finance` (`FinanceIntelPage.tsx:14`).
  - Displays high-level KPIs: Month-to-date cost, Last month cost, and projected current month cost (`FinanceIntelPage.tsx:75-87`).
  - Shows a daily cost breakdown chart for the current month using `recharts` (`FinanceIntelPage.tsx:117`).
  - Provides a cost breakdown by provider (e.g., OpenAI, Anthropic, Hetzner) (`FinanceIntelPage.tsx:93`).
  - Includes a detailed table of recent transactions or cost entries (`FinanceIntelPage.tsx:147`).
- **Backend**:
  - `server/api/financeIntel.ts`:
    - The main handler fetches cost data from multiple underlying sources.
    - It calls provider-specific adapters like `getHetznerCosts`, `getVastCosts`, and `getLiteLLMCosts` (`financeIntel.ts:31-33`).
    - It aggregates this data, calculates summary statistics (MTD, projections), and formats it for the frontend.
- **Data Sources**:
  - `server/adapters/hetzner.ts`: Fetches billing data from the Hetzner API.
  - `server/adapters/vast.ts`: Fetches instance costs from the Vast.ai API.
  - `server/adapters/litellm.ts`: Reads the `litellm.db` SQLite database to calculate costs based on token usage for different models (`litellm.ts:25`).
- **Readiness**: ✅ solid. The page provides a good overview of costs from various providers.

## 2. Gaps, mock & broken parts
- **No Insight Integration**: The dashboard is purely informational. It does not generate insights for financial anomalies. For example:
    - A sudden spike in daily costs.
    - A cost projection that significantly exceeds the budget.
    - A specific model or provider becoming disproportionately expensive.
- **Budgeting Feature is Missing**: While it projects costs, there's no feature to set a monthly budget. Without a budget, projections lack context, and there's no way to trigger alerts for overspending.
- **No Cost Allocation by Project**: All costs are aggregated. There is no way to attribute costs to specific activities, such as "NewsBites article generation" vs. "Scout agent runs". This makes it hard to determine the ROI of different parts of the system. This is a known gap mentioned in `DASHBOARD_V5_PLAN.md`'s governance catalog.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: ✅ The page is stable and provides a clear, usable view of the current financial data.
- **G2 Controllable via GUI**: 🟡 N/A. There isn't much to "control" on this page, but a future "set budget" feature would add this.
- **G3 Complete**: 🟡 The view is good, but the lack of alerting and budgeting makes it an incomplete financial monitoring solution.
- **G4 Detects everything**: 🔴 Fails to detect financial anomalies. A cost spike is a critical operational issue that currently goes unnoticed by the insight system.
- **G5 Findable, readable, actionable**: 🟡 The data is readable on this page, but financial problems are not *findable* in the central `/insights` inbox, and therefore less actionable.
- **G7 AI reasoning BEFORE insights**: 🔴 N/A, as no insights are created.
- **G8 An actual admin center**: 🟡 It's a good dashboard, but its isolation from the insights and alerting system prevents it from being a truly integrated part of the admin center.

## 4. Best-practice research
- **Cloud Financial Management Tools**: Products like AWS Cost Explorer, GCP Billing, or third-party tools (e.g., Cloudability, Datadog Cost Management) are the gold standard. They provide:
    - **Budgeting and Alerting**: Set monthly or quarterly budgets, with alerts triggered at configurable thresholds (e.g., 50%, 90%, 100% of budget).
    - **Cost Anomaly Detection**: Machine learning models that automatically detect unusual spending patterns and flag them for review.
    - **Cost Allocation**: The ability to tag resources and attribute costs to specific projects, teams, or cost centers.
    - **Forecasting**: More sophisticated forecasting models that account for seasonality and growth trends.

## 5. Target design
- **Insight-driven Finance**: The page should be integrated with the insights system.
  - A new backend scanner (`server/insights/scanners/finance.ts`) will run periodically (e.g., every 6 hours).
  - This scanner will analyze cost data and create insights for anomalies.
- **Budgeting UI**:
  - Add a simple "Set Budget" modal on the `/finance-intel` page where an operator can input a single dollar amount for the monthly budget.
  - This value will be stored in the operator state database (`writeOperatorState`).
  - The header KPIs should show `% of budget used`.
- **Insight Types**: The new scanner should create insights like:
  - **Cost Spike**: A `high` severity insight with `sourceKey: 'finance:cost-spike:daily'` if daily costs are >3 standard deviations above the 30-day moving average.
  - **Budget Over-projection**: A `medium` severity insight `sourceKey: 'finance:budget-risk'` if the projected monthly cost exceeds the set budget.
- **Frontend Links**: The main KPI cards, when showing an anomalous state, should link directly to the corresponding insight (e.g., `/insights?focus=finance:budget-risk`).

## 6. Features to add (prioritized)
- **MUST**:
  - Implement a `finance` scanner that creates insights for significant daily cost spikes.
  - Add a simple UI for setting a monthly budget.
  - The scanner must also create an insight when the projected cost is on track to exceed the budget.
- **SHOULD**:
  - Refactor the frontend to check for these insights and link the relevant UI elements (e.g., the projection KPI) to them.
  - Add a "Cost by Model" chart, since LLM costs are a primary driver. This requires a bit more detail from the `litellm` adapter.
- **EXTRA**:
  - Implement a basic form of cost allocation by adding a `X-Mimule-Origin` header to all LLM calls (e.g., `origin: 'scout'`, `origin: 'autopipeline'`). The `litellm` adapter can then use this to break down costs by origin.
  - Add AI-powered analysis. An LLM could be prompted with the daily cost data and asked to "summarize any unusual spending patterns in the last 7 days". This summary could be attached to a weekly summary insight.

## 7. Sellable-in-parts
This is a "Cloud Cost Intelligence" module. It's highly sellable to any company using multiple cloud or SaaS providers, especially those with usage-based pricing (like LLM APIs). The pitch is "A unified dashboard to monitor all your variable infrastructure and API costs in one place, with intelligent alerting to prevent budget overruns."

## 8. Backend work
- **New Scanner**: Create `server/insights/scanners/finance.ts`.
  - Add a `runFinanceScan()` function that fetches all cost data similar to the main handler.
  - Implement `mapFinanceFindings()` to perform anomaly detection (e.g., standard deviation on daily costs) and budget projection checks. It will call `readOperatorState` to get the budget.
  - This function will generate `InsightInput` objects.
- **Integrate Scanner**: Add `runFinanceScan()` to the main insight scheduler (`server/insights/scheduler.ts`).
- **Operator State**: Use `readOperatorState` and `writeOperatorState` to manage the monthly budget value.
- **Schema**: No schema changes needed. The budget can be stored in the existing `operator_state` table.

## 9. Build slices
1.  **Budget UI & Storage**: Add the "Set Budget" UI and wire it up to `operator_state` on the backend.
2.  **Backend Scanner (Budget)**: Implement the part of the `finance` scanner that checks if projected costs will exceed the budget and creates an insight.
3.  **Frontend Insight Linking**: Update the `/finance-intel` page to link to the budget-risk insight.
4.  **Backend Scanner (Spike)**: Implement the cost spike detection logic (e.g., using standard deviation) in the scanner.
5.  **Cost by Model Chart**: Enhance the `litellm` adapter to provide a model-level cost breakdown and add the new chart to the UI.

## 10. Verification
- Set a monthly budget of $1. Verify that a budget risk insight is created almost immediately.
- Verify the projection KPI on the `/finance-intel` page links to the new insight.
- Manually insert a large cost entry into `litellm.db` for the current day. Trigger the scanner and verify that a "cost spike" insight is created.
- Change the budget. Verify the change is persisted and the scanner uses the new value for its next check.
- Verify all existing charts and KPIs on the finance page continue to function correctly.
