# /compliance — Product Plan
> One-line: what this page is and who it's for.

A compliance center for compliance officers and administrators to manage and automate the collection of compliance evidence, track controls, and generate reports for audits (e.g., SOC2, GDPR).

## 1. Today (verified, with file:line)
- **Frontend Component**: `app/routes/CompliancePage.tsx` (🟡 partial) - A functional multi-tabbed UI for reports, audit exports, tenant settings, and DPA/SOC2 documentation.
- **API Handlers**: 
    - `server/api/compliance.ts`: `complianceDpaHandler`, `complianceSubprocessorsHandler`, `complianceSoc2MappingHandler`, `complianceSummaryHandler`, `complianceEvidenceBundleHandler` (✅ solid).
    - `server/api/router.ts`: Routes are present, see lines 1221-1234.
- **Data Sources**:
    - `server/compliance/generator.ts`: Generates documents from markdown files in `server/compliance/documents/`.
    - `server/compliance/evidencePack.ts`: Generates evidence packs from various data sources, including the database.
- **Current Readiness**: 🧪 labs - The page is functional but siloed. It lacks automated control monitoring and integration with the `/insights` engine. `DASHBOARD_V5_PLAN.md` marks it for promotion and deeper integration.

## 2. Gaps, mock & broken parts
- **Lack of Automation**: The current process is manual. An admin has to visit the page to generate reports or bundles. There are no automated compliance checks that run in the background.
- **No Integration with Insights**: Compliance gaps are not surfaced as findings in the `/insights` inbox.
- **Static Control Mapping**: The SOC2 control mapping is read from a static markdown file (`server/compliance/documents/soc2-control-mapping.md`) and is not tied to live evidence from the system.
- **Siloed UI**: The page is a standalone tool and not fully integrated into the "Admin Center" information architecture proposed in `DASHBOARD_V5_PLAN.md`.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: Promote the page from "labs" to a core, stable feature of the admin center.
- **G2 Controllable via GUI**: Enhance the UI to allow mapping of controls to live evidence from the system.
- **G4 Detects everything**: Implement a new compliance scanner that automatically detects gaps in controls and creates findings in the `/insights` inbox.
- **G5 Findable, readable, actionable**: Integrate the page into the "Admin Center" nav group. Surface compliance findings in the central inbox with clear, actionable recommendations.
- **G6 Prefer automatic; fall back to a single Apply button**: Where possible, automate the collection of evidence for compliance controls.
- **G7 AI reasoning BEFORE insights**: For a detected compliance gap, AI should explain the nature of the control failure and suggest a remediation plan.

## 4. Best-practice research
- **Continuous Compliance**: Modern compliance tools (e.g., Vanta, Drata) automate the collection of evidence on a continuous basis, rather than at a single point in time. They connect directly to cloud providers, source control, and other systems to gather evidence automatically.
- **Control-to-Evidence Mapping**: A core feature of these tools is the ability to map compliance controls (e.g., from SOC2, ISO 27001) to specific pieces of evidence from the live system. This mapping should be dynamic and verifiable.
- **Automated Issue Tracking**: When a compliance check fails, these tools automatically create an issue and assign it to the relevant owner, often with integration into ticketing systems like Jira.

## 5. Target design
- **Information Architecture**: The `/compliance` page will be a tab within the "Admin Center". It will contain:
    - **Controls**: A new view to manage compliance frameworks (e.g., SOC2) and map controls to automated checks and evidence.
    - **Evidence**: A library of automatically collected evidence.
    - **Reports**: The existing reporting and export functionality.
- **Layout**: The "Controls" view will be a tree-like structure, allowing users to drill down from a framework to specific controls and their corresponding evidence.
- **Key Components**:
    - A control mapping editor that allows users to link a control to a specific insight detector or a data source.
    - An evidence viewer that displays the collected evidence and its history.
- **AI Integration (G7)**:
    - When a compliance check fails, AI will analyze the failure and provide a detailed explanation and a step-by-step remediation guide. For example, if a check for "Access reviews are conducted quarterly" fails, the AI will identify which users were not reviewed and generate a reminder to the appropriate manager.

## 6. Features to add (prioritized)
- **MUST**:
    - Integrate the `/compliance` page into the "Admin Center" navigation group.
    - Create a new compliance scanner in `server/insights/scanners/compliance.ts` that runs automated checks for a few key controls.
    - Surface compliance failures as findings in the `/insights` inbox.
- **SHOULD**:
    - Implement the "Controls" view with a UI for mapping controls to automated checks.
    - Automatically link evidence from the system (e.g., audit logs, security findings) to the relevant controls.
- **EXTRA**:
    - Add support for multiple compliance frameworks (e.g., ISO 27001, HIPAA).
    - Provide an AI assistant to help map controls to evidence.

## 7. Sellable-in-parts
- **Standalone Pitch**: "An automated compliance monitoring and evidence collection platform. Continuously monitor your controls, automate evidence gathering, and be audit-ready at all times. Drastically reduce the time and effort required for compliance audits like SOC2 and ISO 27001."
- **Suite Integration**: The Compliance module leverages the `/insights` engine for automated detection, the `/audit` trail for evidence, and the `/governance` module for access control checks. It provides a compliance-focused view of the data that is already being collected and managed by the rest of the admin suite.

## 8. Backend work
- **New Modules**:
    - `server/insights/scanners/compliance.ts`: A new scanner for automated compliance checks.
- **Endpoints to Add/Change**:
    - `POST /api/compliance/controls`: A new endpoint for creating and updating control mappings.
- **Schema**:
    - New tables for `compliance_frameworks`, `compliance_controls`, and `control_evidence_mapping`.
- **Executor Actions**:
    - `compliance:run_check`, `compliance:generate_report`.
- **Detector/AI Hooks**:
    - The new `compliance.ts` scanner will create findings with `domain:compliance`.
    - Hook into `server/insights/ai.ts` to provide AI analysis for compliance findings.

## 9. Build slices
1.  **Slice 1: IA & Basic Integration**: Move the `/compliance` page into the "Admin Center" nav. Create a simple compliance scanner that checks one or two basic controls (e.g., "Are audit logs retained for 90 days?") and creates an insight if the check fails.
2.  **Slice 2: Control Mapping UI**: Build the read-only UI to display the existing SOC2 control mapping.
3.  **Slice 3: Dynamic Evidence Linking**: Enhance the compliance scanner to automatically link a passing check to the relevant control as evidence.
4.  **Slice 4: Control Editor**: Build the UI and backend to allow users to create and edit control mappings.
5.  **Slice 5: Evidence Library**: Create a UI to browse and view all collected compliance evidence.

## 10. Verification
- Evidence checklist proving the page meets G1–G8:
    - A failed compliance check automatically creates a finding in the `/insights` inbox.
    - The `/compliance` page shows a list of controls, and for each control, it shows the latest status and a link to the evidence.
    - The generated evidence bundle includes data from the automated compliance checks.
    - All actions are logged in the unified audit trail.
    - The new views are responsive and usable on mobile.
