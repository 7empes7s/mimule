# /opencode — Product Plan
> A professional, interactive CLI session for the OpenCode agent, integrated into a unified AI Console that is powerful, consistent, and sellable.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/OpenCodeRoute.tsx`. This component is an outlier compared to the other three.
  - It is a very thin wrapper (`app/routes/OpenCodeRoute.tsx:5`).
  - It uses a custom `useStore` hook for state management (`app/routes/OpenCodeRoute.tsx:6`) and renders an `<OpenCodeView />` component.
  - There is no evidence of the session management, composer, or other UI elements present in the other consoles.
- **Backend**: There is no dedicated `server/api/opencode.ts` file. The interaction is likely handled via a WebSocket or a different, more generic API endpoint that the `useStore` hook communicates with. The `server/api/router.ts` file does not show any obvious REST endpoints for "opencode".
- **Readiness**: 🧪 **Labs**. This page feels like a different product. It's not integrated with the session management paradigm of the other consoles and lacks all of their features. Its connection to the "opencode-cli" mentioned in `CodexPage.tsx` is unclear. It feels more like a direct view into a running service than an interactive console.

## 2. Gaps, mock & broken parts
- **Total Architectural Inconsistency**: This page does not follow the architecture (frontend or backend) of the other three agent consoles. It's a completely separate implementation.
- **Missing Core Features**: It lacks all the basic features of the other consoles:
  - No session management (create, list, select, delete).
  - No visible chat input or composer.
  - No model selection.
  - No transcript or history view.
- **Unclear Purpose**: It's not clear what the user is supposed to *do* on this page. It seems to be a read-only view. The name "OpenCode" suggests a coding agent, but there is no way to interact with it.

## 3. Goal alignment (G1–G8)
- **G1 (Usable)**: The page must be given a clear purpose and interaction model to be usable.
- **G3 (Complete)**: To be complete, it must be refactored to provide the same level of functionality as the other agent consoles.
- **G5 (Findable, Readable, Actionable)**: It must be absorbed into the unified AI Console to be findable. Its output (whatever it is) must be made readable and actionable.
- **G8 (Admin Center)**: The primary goal is to completely replace this bespoke, confusing implementation with the standard, professional AI Console interface.

## 4. Best-practice research
(This section is identical to `gemini.plan.md` as the research applies to the unified console as a whole).
Leading AI platforms (OpenAI Playground, Azure AI Studio, Amazon Bedrock) provide a unified "playground" or "console" experience. Key patterns to adopt:
- **Unified Interface**: A single, consistent UI for interacting with *any* available model or agent.
- **Model Catalog**: Present models with clear metadata.
- **System Prompt Engineering**: Provide a dedicated area to craft and save system prompts.
- **Parameterization UI**: Expose key model parameters.
- **Session History & Sharing**: All sessions are saved, searchable, and can be shared.
- **Cost & Token Tracking**: Display token counts and estimated costs in real-time.
- **Structured Output Rendering**: Render complex events in a user-friendly format.

## 5. Target design
The `/opencode` route will be completely overhauled to render the same reusable `<AIConsole />` component as the other agent pages. The existing implementation (`OpenCodeRoute.tsx`, `OpenCodeView.tsx`, `useStore`) will be deprecated and removed.
- **Information Architecture**: It will become another agent type within the unified AI Console. Users will find "OpenCode" sessions alongside Gemini, Claude, and Codex sessions in the history sidebar.
- **Layout**: It will use the standard three-panel layout (Session History, Transcript, Configuration).
- **Functionality**:
  - We will assume there is an "opencode" CLI tool that can be spawned, similar to the other agents. The unified backend will be updated to support an `opencode` agent type.
  - The user will be able to start new sessions, type prompts in the composer, and see streaming output in the transcript.
  - Model selection and other configuration options will be supported if the underlying CLI allows for it. If not, those controls will be disabled in the UI for this agent type.
- **Goal**: To the end-user, the `/opencode` console will be indistinguishable from the `/gemini`, `/claude`, and `/codex` consoles in form and function.

## 6. Features to add (prioritized)
This is a full replacement, not an incremental addition.
- **MUST**:
  - **Backend Support for `opencode`**: Add `opencode` as a supported agent type in the unified `server/api/console.ts`. This involves adding the logic to spawn the `opencode` CLI tool with the correct arguments. This requires investigating how to actually run the OpenCode agent from the command line.
  - **Replace Frontend with `<AIConsole />`**: Delete `app/routes/OpenCodeRoute.tsx` and replace it with a new file that is a thin wrapper around the `<AIConsole agent="opencode" />` component. The `OpenCodeView` component and `useStore` hook will be removed.
- **SHOULD**:
  - **Investigate CLI Capabilities**: Determine what features the `opencode` CLI supports. Does it have model selection? Does it emit structured events? These capabilities will determine which features of the unified console are enabled for it.

## 7. Sellable-in-parts
- **Standalone Pitch**: By including OpenCode, the "AI Console" module demonstrates its flexibility. "Bring your own agents. Our AI Console is designed to be a universal interface for all your AI tools, whether they're from major providers or custom-built in-house. Standardize your team's workflow on a single, powerful platform."
- **Suite Integration**: This brings the previously-isolated OpenCode agent into the fold. Its usage can now be tracked by the Cost module, its actions logged by the Audit module, and its access governed by the Governance module, just like every other agent.

## 8. Backend work
- **Remove**: The custom store and any WebSocket/API logic associated with the current `OpenCodeRoute.tsx`.
- **Modify**: `server/api/console.ts`.
  - Add logic to the stream handler to `spawn` the `opencode` CLI when `session.agent === 'opencode'`. This is the main discovery task for this plan. We need to find the CLI and its arguments.
- **Schema**:
  - No new schema. OpenCode sessions will be stored as rows in the `ai_console_sessions` and `ai_console_messages` tables with `agent = 'opencode'`.

## 9. Build slices
1. **Unification First**: Build the unified backend and `<AIConsole />` component for Gemini, Claude, and Codex.
2. **Investigate OpenCode CLI**: Find the `opencode` CLI executable and determine its command-line interface for starting sessions, passing prompts, and selecting models.
3. **Integrate OpenCode**: Add the `opencode` agent case to `server/api/console.ts`. Replace `app/routes/OpenCodeRoute.tsx` with the standard `<AIConsole />` wrapper.
4. **Enable Features**: Based on the CLI investigation, enable the relevant features (model selection, structured transcript) in the UI for the OpenCode agent.

## 10. Verification
- The `/opencode` route loads using the unified `<AIConsole />` component.
- The old `OpenCodeRoute.tsx`, `OpenCodeView.tsx`, and associated store are gone.
- The user can start a session, send a prompt, and receive a response from the OpenCode agent.
- Session history is stored correctly in the central `ai_console_sessions` table.
- The page looks and feels identical to the other three agent consoles, demonstrating successful unification and the elimination of the inconsistent "labs" implementation.
