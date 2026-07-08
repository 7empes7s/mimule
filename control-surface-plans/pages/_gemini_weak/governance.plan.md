# /governance — Product Plan
> One-line: what this page is and who it's for.

An admin center for managing access control, security policies, and resource governance, intended for system administrators and compliance officers.

## 1. Today (verified, with file:line)
- **Frontend Component**: `app/routes/GovernancePage.tsx` (✅ solid)
- **API Handlers**: 
    - `server/api/governance.ts`: `governancePoliciesHandler`, `governancePoliciesReloadHandler`, `governanceRbacMeHandler`, `governanceApprovalsListHandler`, `governanceApprovalDecideHandler`, `governanceSecretsListHandler`, `governanceSecretsWriteHandler`, `governanceSecretsDeleteHandler`, `governanceBudgetsListHandler`, `governanceBudgetsWriteHandler`, `governanceRetentionHandler`, `governanceRetentionWriteHandler`, `governanceAuditHandler` (✅ solid)
    - `server/api/router.ts`: Routes starting at line 891.
- **Data Sources**:
    - Policy files (e.g., OPA policies)
    - RBAC configurations
    - Secrets store
    - Budgets configuration
    - Data retention policies
- **Current Readiness**: 🧪 labs - The page exists and has several backend handlers, but `DASHBOARD_V5_PLAN.md` marks it as experimental and needing expansion for user management and AI GRC.

## 2. Gaps, mock & broken parts
- The UI is marked as `🧪 labs` and needs to be promoted to a core feature.
- The `DASHBOARD_V5_PLAN.md` (Phase 14) calls for expanding this surface for full user and tenant management, which is currently not implemented.
- The `DASHBOARD_V5_PLAN.md` (Phase 16) calls for expanding this surface to include AI GRC, which is not present.
- The term "governance" is ambiguous and collides with the operational governance in `/insights`. The UI needs renaming and clarification as per `DASHBOARD_V5_PLAN.md` section C.1.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: Promote the page from "labs" to a stable, reliable core feature.
- **G2 Controllable via GUI**: Provide a full GUI for user management, RBAC, policy editing, and budget configuration, removing any need for CLI or file editing.
- **G4 Detects everything**: Integrate with the insights engine to detect policy drifts, RBAC misconfigurations, or budget overruns.
- **G5 Findable, readable, actionable**: Rename the page to "Access & Policy" and group it under the "Admin Center" navigation as per the IA plan. Make policies and roles easy to understand and manage.
- **G8 An actual admin center**: Transform this page into a comprehensive access and policy management center, a key pillar of the overall admin center vision.

## 4. Best-practice research
- **Policy-as-Code (PaC) Management**: Leading GRC tools (e.g., HashiCorp Sentinel, OPA GUIs) provide a version-controlled, testable, and auditable way to manage policies. We should adopt a UI that allows editing policies in a dedicated editor with syntax highlighting, version history, and a dry-run/simulation mode.
- **RBAC Visualization**: Instead of just lists of roles and permissions, provide a visual matrix or graph that shows who has access to what, making it easier to spot unintended permissions.
- **User Lifecycle Management**: Modern admin centers (like M365 or Google Workspace) provide a central user directory with invitation workflows, "View As" functionality for troubleshooting, and a clear audit trail for all user-related actions.
- **Just-in-Time (JIT) Access**: For high-risk permissions, implement an approval workflow (which `server/governance/approvals.ts` seems to support) where users can request temporary access, which admins can grant with a time limit.

## 5. Target design
- **Information Architecture**: The page, relabeled "Access & Policy", will have sub-tabs for:
    - **Users & Tenants**: A user directory for inviting, editing, and removing users.
    - **Roles & Permissions**: An RBAC editor to manage roles.
    - **Policies**: A UI for the Policy-as-Code engine.
    - **Secrets**: A dashboard for managing secrets.
    - **Budgets**: A UI for setting and tracking resource budgets.
    - **Approvals**: A queue for pending access requests.
- **Layout**: Use a standard master-detail layout. A list of users, roles, or policies on the left, and the detailed view/editor on the right.
- **Key Components**:
    - A rich policy editor (e.g., using Monaco Editor) with version history.
    - A visual RBAC matrix.
    - An invitation modal for new users.
    - A "View As" banner that is prominent and clearly indicates when an admin is impersonating a user.
- **AI Integration (G7)**:
    - An AI assistant to help write and debug policies from natural language.
    - For a detected RBAC anomaly, AI reasoning will explain *why* it's a risk (e.g., "This user has conflicting permissions: 'Create User' and 'Delete Billing Info', which violates separation of duties.").

## 6. Features to add (prioritized)
- **MUST**:
    - Rename page to "Access & Policy" and move under "Admin Center" nav group.
    - Implement the User Directory UI for full user lifecycle management (Invite, Edit, Remove).
    - Implement a GUI for the RBAC editor.
- **SHOULD**:
    - Implement the Policy-as-Code UI with a rich editor and version control.
    - Add a "View As" feature for admins with a clear audit trail.
    - Integrate budget management UI.
- **EXTRA**:
    - Add an AI assistant for writing policies.
    - Implement JIT access request workflows.
    - Add a visualization for RBAC permissions.

## 7. Sellable-in-parts
- **Standalone Pitch**: "A complete Access & Policy management solution for modern applications. Centrally manage users, roles, and policies with an intuitive UI, backed by a powerful Policy-as-Code engine. Ensure security and compliance without the headache of manual configuration."
- **Suite Integration**: Within the full suite, this module is the backbone of security and control, ensuring that only authorized users can perform actions within the cost, operations, and AI development modules. It provides the "who" and "what" for the unified audit trail.

## 8. Backend work
- **Endpoints to Add/Change**:
    - `POST /api/governance/users/invite` to send user invitations.
    - `PUT /api/governance/users/:id` to update user details.
    - `DELETE /api/governance/users/:id` to remove users.
    - New endpoints for managing roles and permissions in the RBAC system.
    - New endpoints for the Policy-as-Code engine (e.g., `POST /api/governance/policies/simulate`).
- **Schema**:
    - Extend existing user/tenant tables to support the new features.
    - New tables might be needed for storing policy versions.
- **Executor Actions**:
    - `user:invite`, `user:delete`, `role:update`.
- **Detector/AI Hooks**:
    - A new scanner in `server/insights/scanners/` to detect policy drifts and RBAC anomalies.
    - Hook into `server/insights/ai.ts` to provide AI-driven analysis for these findings.

## 9. Build slices
1.  **Slice 1: IA & Renaming**: Rename the page to "Access & Policy" and update the navigation in `app/lib/navRegistry.ts`.
2.  **Slice 2: User Directory (Read-only)**: Build the UI to list existing users, leveraging the existing backend handlers.
3.  **Slice 3: User Management (Write)**: Add the backend endpoints and UI for inviting, editing, and deleting users.
4.  **Slice 4: RBAC Editor**: Build the UI and backend for managing roles and permissions.
5.  **Slice 5: Policy-as-Code**: Implement the policy editor UI and backend.

## 10. Verification
- Evidence checklist proving the page meets G1–G8:
    - `bun run typecheck` and `bun run build` pass.
    - The page is accessible at `/governance` and is labeled "Access & Policy" in the nav.
    - A new user can be invited, their role changed, and then they can be deleted, all from the GUI.
    - A new role can be created and its permissions modified from the GUI.
    - A policy can be edited and saved from the GUI.
    - All actions are logged in the unified audit trail.
    - A `grep` for "governance" in the UI code shows the new naming convention is applied consistently.
    - The page is fully responsive and usable on mobile.
