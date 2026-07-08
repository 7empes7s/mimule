# /security — Product Plan
> One-line: what this page is and who it's for.

A unified security center for security engineers and administrators to manage security posture, vulnerabilities, and secrets, providing a single pane of glass for the application's security.

## 1. Today (verified, with file:line)
- **Frontend Component**: `app/routes/SecurityPage.tsx` (🟡 partial) - A surprisingly detailed page with a "Trust Score" and findings list.
- **API Handlers**: 
    - `server/api/security.ts`: `trustScoreHandler`, `securityPostureHandler` (✅ solid)
    - `server/api/router.ts`: Routes are present at lines 737-738.
- **Data Sources**:
    - `server/insights/scanners/security.ts`: `runSecurityScan()` function.
    - `server/security/score.ts`: `computeTrustScore()` function.
- **Current Readiness**: 🧪 labs - While functional, the current page is a subset of the vision for a "Unified Security Center" outlined in `DASHBOARD_V5_PLAN.md` (Phase 17). The `server/security-center` directory, intended to house the expanded engine, does not exist.

## 2. Gaps, mock & broken parts
- The current page is a good start but lacks the comprehensive features of a full security center.
- `DASHBOARD_V5_PLAN.md` calls for a "Unified Security Center" with dedicated sections for Posture Management (CSPM & ASPM), Vulnerability Management, and Secrets Management, which are currently absent.
- The `server/security-center` module, which should contain the expanded security engine, scanners, and remediation workflows, does not exist.
- The existing security scanner in `server/insights/scanners/security.ts` is a good starting point but needs to be expanded with more advanced detection capabilities (CSPM, SAST, DAST, SCA).

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: Evolve the existing page into a stable and polished Security Center.
- **G2 Controllable via GUI**: Provide a complete GUI for managing all aspects of security, from posture configuration to vulnerability triage and secret rotation.
- **G4 Detects everything**: Implement a comprehensive suite of security scanners (CSPM, ASPM, CVE, Secrets) to detect a wide range of security threats.
- **G5 Findable, readable, actionable**: Consolidate all security information into a single, easy-to-navigate Security Center with clear, actionable insights.
- **G6 Prefer automatic; fall back to a single Apply button**: Implement AI-powered automated remediation for common security findings, with one-click approvals for riskier actions.
- **G7 AI reasoning BEFORE insights**: For each security finding, provide an AI-generated analysis of the risk, root cause, and recommended remediation steps.
- **G8 An actual admin center**: Position the Security Center as a core pillar of the admin experience, providing professional-grade security management capabilities.

## 4. Best-practice research
- **Unified Security Posture Management**: Tools like Wiz or Palo Alto Prisma Cloud provide a single dashboard to visualize and manage security posture across cloud and applications. We should adopt a similar "single pane of glass" approach.
- **AI-Powered Prioritization**: Modern vulnerability management tools use AI to prioritize vulnerabilities based on exploitability, business context, and asset criticality, helping teams focus on what matters most.
- **Automated Remediation as Code**: Leading security platforms can automatically generate remediation as code (e.g., Terraform, Ansible) for misconfigurations, which can be reviewed and applied by operators.
- **Secrets Management Lifecycle**: Tools like HashiCorp Vault provide a complete lifecycle for secrets: detection, rotation, revocation, and auditing. Our secrets management feature should aim for a similar level of control.

## 5. Target design
- **Information Architecture**: The `/security` route will become the "Unified Security Center" with the following sub-tabs:
    - **/security/posture**: A dashboard for CSPM and ASPM, showing a real-time security score and a list of misconfigurations.
    - **/security/vulnerabilities**: A CVE management dashboard with AI-powered prioritization.
    - **/security/secrets**: A dashboard for managing the lifecycle of detected secrets.
- **Layout**: Each tab will have a dashboard layout with key metrics at the top, followed by a filterable list of findings.
- **Key Components**:
    - An interactive asset inventory for the posture management page.
    - A vulnerability triage workflow with ticketing integration.
    - A secrets dashboard with one-click rotation/revocation workflows.
- **AI Integration (G7)**:
    - For a detected misconfiguration, an AI assistant will propose a fix as code.
    - For a new CVE, AI will provide a summary of the vulnerability and assess its relevance to the application.
    - For an exposed secret, AI will analyze its potential impact and recommend a remediation plan.

## 6. Features to add (prioritized)
- **MUST**:
    - Create the `server/security-center` module with subdirectories for the engine, scanners, and remediation workflows.
    - Implement the `/security/posture` page with a basic CSPM scanner.
    - Implement the `/security/vulnerabilities` page with a basic CVE scanner.
- **SHOULD**:
    - Implement the `/security/secrets` page with a secret scanner and basic remediation workflows.
    - Integrate a SAST/DAST scanner for application security findings.
    - Add AI-powered prioritization to the vulnerability management dashboard.
- **EXTRA**:
    - Implement AI-driven remediation-as-code suggestions.
    - Add one-click secret rotation and revocation.

## 7. Sellable-in-parts
- **Standalone Pitch**: "A comprehensive, AI-powered security center for modern applications. Gain complete visibility into your security posture, proactively manage vulnerabilities, and automate the remediation of exposed secrets. All from a single, intuitive dashboard."
- **Suite Integration**: The Security Center is the eyes and ears of the admin suite, feeding critical security findings into the unified `/insights` inbox. Its automated remediation capabilities leverage the central `execute` action handler, and all its activities are recorded in the global `/audit` trail.

## 8. Backend work
- **New Modules**: Create the `server/security-center` directory with the following structure:
    - `engine.ts`: The core logic for the security center.
    - `scanners/{cspm.ts, aspm.ts, cve.ts, secrets.ts}`: The new security scanners.
    - `remediation_engine.ts`: The engine for automated remediation.
- **Endpoints to Add/Change**:
    - `GET /api/security/posture`: Enhance to include data from the new CSPM/ASPM scanners.
    - `GET /api/security/vulnerabilities`: A new endpoint to list CVEs.
    - `GET /api/security/secrets`: A new endpoint to list exposed secrets.
    - `POST /api/security/remediate`: A new endpoint to trigger automated remediation.
- **Schema**:
    - New tables for `security_findings`, `cve_database`, `exposed_secrets`.
- **Executor Actions**:
    - `secret:revoke`, `config:apply_fix`, `vulnerability:create_ticket`.

## 9. Build slices
1.  **Slice 1: Module Scaffolding**: Create the `server/security-center` directory and the basic file structure.
2.  **Slice 2: Posture Management (CSPM)**: Implement the `/security/posture` page and a basic CSPM scanner that checks for common cloud misconfigurations.
3.  **Slice 3: Vulnerability Management (CVE)**: Implement the `/security/vulnerabilities` page and a scanner that ingests a CVE feed.
4.  **Slice 4: Secrets Management**: Implement the `/security/secrets` page and a basic secret scanner.
5.  **Slice 5: AI-Powered Remediation**: Add AI-driven remediation suggestions for a few common findings.

## 10. Verification
- Evidence checklist proving the page meets G1–G8:
    - The new `server/security-center` directory exists with the planned structure.
    - The `/security` page has the new sub-tabs for posture, vulnerabilities, and secrets.
    - A simulated cloud misconfiguration is detected and displayed on the `/security/posture` page.
    - A known CVE is ingested and displayed on the `/security/vulnerabilities` page.
    - An exposed secret in a test file is detected and displayed on the `/security/secrets` page.
    - All actions are logged in the unified audit trail.
    - The new pages are responsive and usable on mobile.
