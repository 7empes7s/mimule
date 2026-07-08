# /governance/risk — Product Plan
> One-line: what this page is and who it's for.

A new AI Governance, Risk, and Compliance (GRC) center for AI developers, ML engineers, and compliance officers to manage the risk, fairness, and compliance of AI models throughout their lifecycle.

## 1. Today (verified, with file:line)
- **Frontend Component**: 🔴 none - The route `/governance/risk` does not exist. A new component `app/routes/AIGovernancePage.tsx` needs to be created.
- **API Handlers**: 🔴 none - The `server/api/router.ts` has no handlers for `/api/governance/risk`.
- **Data Sources**: 🔴 none - The `server/ai-grc` directory and any related database tables do not exist.
- **Current Readiness**: 🔴 mock-broken - This is a new surface proposed in `DASHBOARD_V5_PLAN.md` (Phase 16). It needs to be built from scratch.

## 2. Gaps, mock & broken parts
- The entire feature is a gap. Nothing exists yet.
- The `DASHBOARD_V5_PLAN.md` outlines a comprehensive vision for this page, including a Policy-as-Code engine, a risk and fairness dashboard, and model lifecycle management. All of these components need to be designed and built.
- There are no AI GRC scanners in `server/insights/scanners/` yet.

## 3. Goal alignment (G1–G8)
- **G2 Controllable via GUI**: Provide a complete GUI for managing AI policies, viewing risk dashboards, and governing the model lifecycle.
- **G4 Detects everything**: Implement scanners to detect AI-specific risks, such as model bias, performance drift, and policy violations.
- **G5 Findable, readable, actionable**: Create a dedicated, clear, and clinical dashboard for AI risk that is integrated into the "Admin Center" nav group.
- **G7 AI reasoning BEFORE insights**: Use AI to analyze model scan results, explain potential risks in plain language, and recommend mitigation strategies.
- **G8 An actual admin center**: This page is a critical component of the "M365-admin-center-but-smarter" vision, addressing the unique governance challenges of AI.

## 4. Best-practice research
- **AI Safety & Governance Frameworks**: Tools like those from Credo AI, and research from organizations like the AI Risk and Vulnerability Alliance (ARVA), provide frameworks for managing AI risk. We should incorporate concepts like model risk scoring, fairness testing (e.g., for disparate impact), and explainability (XAI) via methods like SHAP or LIME.
- **Policy-as-Code for ML**: Open-source projects like OPA (Open Policy Agent) can be used to define and enforce policies for AI models (e.g., "no model can be deployed without a passing fairness scan"). The UI should provide a high-level way to manage these policies.
- **Model Cards and Datasheet V2**: Google's Model Cards and the Datasheet V2 concepts provide a standardized way to document and report on model provenance, usage, and evaluation. We should provide a way to automatically generate and manage these for each model.

## 5. Target design
- **Information Architecture**: This will be a new page at `/governance/risk` labeled "AI GRC", nested under the "Access & Policy" section in the `Admin Center` nav group. It will have several tabs:
    - **Dashboard**: An overview of the risk posture of all production models.
    - **Model Registry**: A list of all models with their risk scores and compliance status.
    - **Policies**: The UI for the Policy-as-Code engine for AI.
    - **Scans**: A history of all GRC scans.
- **Layout**: The model registry will be a filterable list of models. Clicking on a model will lead to a detailed view with its risk dashboard, model card, and scan history.
- **Key Components**:
    - Interactive risk dashboards with visualizations for fairness, bias, and performance.
    - A rich policy editor for AI policies.
    - Automatically generated model cards.
- **AI Integration (G7)**:
    - The GRC page is meta-governance for AI. The AI reasoning will be used to summarize scan results. For example: "This model shows a 20% performance drop on the 'EU users' data slice and has a high bias score for the 'age' attribute. Recommend retraining with a more balanced dataset."

## 6. Features to add (prioritized)
- **MUST**:
    - Create the `server/ai-grc` module and `app/routes/AIGovernancePage.tsx`.
    - Implement a basic model registry that lists models from the system.
    - Create a new `ai_grc.ts` scanner in `server/insights/scanners/` that performs a simple check (e.g., "model has a documented owner").
- **SHOULD**:
    - Implement the AI Risk & Fairness Dashboard with visualizations for at least one fairness metric.
    - Implement the Policy-as-Code engine with a basic UI for managing policies.
    - Integrate the GRC scans into the CI/CD pipeline to gate deployments.
- **EXTRA**:
    - Automatically generate interactive model cards.
    - Add support for explainability (XAI) visualizations.
    - Provide one-click report generation for auditors.

## 7. Sellable-in-parts
- **Standalone Pitch**: "An end-to-end AI Governance, Risk, and Compliance (GRC) platform. Automate risk and fairness testing for your AI models, enforce policies with a powerful Policy-as-Code engine, and maintain a complete audit trail for the entire model lifecycle. Ship AI with confidence and meet your regulatory requirements."
- **Suite Integration**: The AI GRC module is a specialized extension of the core governance capabilities. It uses the `/insights` engine to surface findings, the `/governance` module for policy enforcement, and the `/models` page for its registry. It provides the crucial, AI-specific layer of governance that is essential for any modern tech stack.

## 8. Backend work
- **New Modules**: Create the `server/ai-grc` directory with the following structure:
    - `engine.ts`: Core logic for the GRC center.
    - `scanners/`: Directory for GRC-specific scanners (bias, fairness, drift).
    - `opa_service.ts`: A service to run the OPA engine for policy checks.
    - `reporter.ts`: A service to generate GRC reports and model cards.
- **Endpoints to Add/Change**:
    - `GET /api/governance/risk/models`: List all models with their GRC status.
    - `GET /api/governance/risk/models/:id`: Get the detailed GRC profile for a model.
    - `POST /api/governance/risk/scan`: Trigger a new GRC scan for a model.
    - `GET /api/governance/risk/policies`: List all AI policies.
    - `POST /api/governance/risk/policies`: Create or update an AI policy.
- **Schema**:
    - New tables for `ai_policies`, `ai_grc_scans`, and `ai_grc_reports`.
- **Executor Actions**:
    - `ai_model:scan`, `ai_model:block_deployment`.
- **Detector/AI Hooks**:
    - A new `ai_grc.ts` scanner in `server/insights/scanners/` will create findings with `domain:ai_grc`.
    - Hook into `server/insights/ai.ts` to provide specialized analysis for AI GRC findings.

## 9. Build slices
1.  **Slice 1: Scaffolding**: Create the `server/ai-grc` module, the `app/routes/AIGovernancePage.tsx` component, and add the new route to `app/App.tsx`.
2.  **Slice 2: Model Registry**: Implement a basic model registry that lists the models available in the system.
3.  **Slice 3: Basic GRC Scanner**: Create a simple scanner in `server/insights/scanners/ai_grc.ts` that checks if a model has an owner and creates an insight if it doesn't.
4.  **Slice 4: Risk Dashboard**: Implement a basic risk dashboard for a model, showing the results from the simple scanner.
5.  **Slice 5: Policy Engine**: Implement a basic Policy-as-Code engine with a UI to view (read-only) policies.

## 10. Verification
- Evidence checklist proving the page meets G1–G8:
    - The new `/governance/risk` page is accessible and appears in the "Admin Center" nav group.
    - The page lists the AI models in the system.
    - A model without an owner creates a finding in the `/insights` inbox.
    - All new components are responsive and usable on mobile.
    - `bun run typecheck` and `bun run build` pass.
