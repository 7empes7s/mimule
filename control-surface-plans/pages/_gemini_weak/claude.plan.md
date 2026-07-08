# /claude — Product Plan
> A professional, interactive CLI session for the Claude agent, integrated into a unified AI Console that is powerful, consistent, and sellable.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/ClaudePage.tsx`. A full-featured, standalone console UI that is a near-verbatim copy of `GeminiPage.tsx`.
  - Session management (create, list, select, delete) is implemented.
  - A chat interface for sending prompts and streaming back responses.
  - The model selector is explicitly disabled (`app/routes/ClaudePage.tsx:550`), indicating no model switching capability.
  - A hardcoded warning is displayed noting that Anthropic credits are exhausted (`app/routes/ClaudePage.tsx:505`), which aligns with the context from `/root/CLAUDE.md`.
- **Backend**: `server/api/claude.ts`.
  - Manages state in a dedicated JSON file: `/var/lib/control-surface/claude-sessions.json` (`server/api/claude.ts:8`).
  - Provides CRUD endpoints for sessions (`/api/claude/sessions`).
  - The stream handler at `server/api/claude.ts:218` spawns the `/root/.local/bin/claude` CLI process. It does not contain any logic for selecting a model.
- **Readiness**: 🔴 **Mock/Broken**. While the UI for session management works, the core functionality (interacting with the agent) is likely to fail due to the exhausted credits. The architecture is a direct clone of `GeminiPage.tsx`, suffering from the same siloed, redundant design.

## 2. Gaps, mock & broken parts
- **Exhausted API Credits**: The most significant gap is that the service is non-functional, as stated in `app/routes/ClaudePage.tsx:505` and `CLAUDE.md`. Any attempt to send a message will likely result in an auth error from the backend.
- **Redundant Architecture**: The file `app/routes/ClaudePage.tsx` and its backend counterpart `server/api/claude.ts` are almost entirely duplicated from the Gemini and Codex implementations. This creates significant maintenance overhead.
- **Siloed State**: Session state is stored in `claude-sessions.json` (`server/api/claude.ts:8`), completely separate from other agent sessions.
- **No Model Selection**: The UI correctly identifies that model selection is not available, but in a unified console, this should be a configurable property of the agent rather than a hardcoded disabled element.

## 3. Goal alignment (G1–G8)
- **G1 (Usable & Stable)**: The UI must gracefully handle and clearly display the backend errors related to credit exhaustion instead of crashing or showing cryptic messages. It should be stable *even if the agent is not*.
- **G3 (Complete)**: To be complete, the credit issue must be resolved. Beyond that, it should be integrated into the unified AI Console, benefiting from shared features like cost tracking and history.
- **G8 (Admin Center)**: The primary goal is to absorb this page into the unified AI Console, eliminating it as a standalone, broken surface and making it a consistent part of a larger, professional tool.

## 4. Best-practice research
(This section is identical to `gemini.plan.md` as the research applies to the unified console as a whole).
Leading AI platforms (OpenAI Playground, Azure AI Studio, Amazon Bedrock) provide a unified "playground" or "console" experience. Key patterns to adopt:
- **Unified Interface**: A single, consistent UI for interacting with *any* available model or agent, regardless of the provider.
- **Model Catalog**: Present models with clear metadata: capabilities, strengths, context window size, and relative cost/speed metrics.
- **System Prompt Engineering**: Provide a dedicated area to craft and save system prompts that define the agent's behavior for a session.
- **Parameterization UI**: Expose key model parameters (temperature, top-p, etc.) through sliders and input fields.
- **Session History & Sharing**: All sessions are saved, searchable, and can be shared with team members via a URL.
- **Cost & Token Tracking**: Display token counts and estimated costs for each turn and for the entire session in real-time.
- **Structured Output Rendering**: Render markdown, JSON, and other structured data in a user-friendly format.

## 5. Target design
The `/claude` route will render the same reusable `<AIConsole />` component as the other agent pages.
- **Information Architecture**: The experience will be identical to the target design for `/gemini`. Users will see Claude sessions intermingled with Gemini and Codex sessions in the left sidebar, filterable by the "Claude" agent type.
- **Layout**: It will use the standard three-panel layout (Session History, Transcript, Configuration).
- **Configuration Panel**:
  - **Model Selection**: The model selector will be **disabled** by default for Claude. The `<AIConsole>` component will be configured (via props) to hide or disable the selector when `agent="claude"`. If, in the future, the `claude` CLI supports model switching, we would simply update the config and the UI would adapt without code changes.
  - **Credit Warning**: The hardcoded warning about exhausted credits will be replaced with a dynamic status check. The unified backend will query agent health (including credential status) and pass this to the UI. A banner will be displayed at the top of the transcript if the agent is known to be non-functional.
- **Unified Experience**: All other aspects—session management, the composer, error display, and handoff to Builder—will be identical to the Gemini experience, provided by the unified component and backend.

## 6. Features to add (prioritized)
The feature list is about integrating Claude into the unified console, not adding features to a broken page.
- **MUST**:
  - **Integrate into Unified Backend**: The logic from `server/api/claude.ts` will be moved into `server/api/console.ts` as a new case for the `claude` agent type. Existing `claude-sessions.json` data will be migrated to the new `ai_console_sessions` SQLite table.
  - **Integrate into Unified Frontend**: `app/routes/ClaudePage.tsx` will be replaced with a thin wrapper that renders the `<AIConsole />` component with `agent="claude"`. This will delete ~700 lines of redundant code.
  - **Dynamic Status Display**: Implement a health check in the backend (`/api/console/health/claude`) that reports the credit status. The UI will display a prominent, non-dismissible warning banner if credits are exhausted.
- **SHOULD**:
  - **Configuration Path**: Provide a clear link or instruction in the UI for admins on where to update the Anthropic API key to resolve the credit issue (likely in `/settings`). This makes the error actionable (G5).

## 7. Sellable-in-parts
- **Standalone Pitch**: As part of the "AI Console" module, Claude support demonstrates provider breadth. "Interact with leading models from Anthropic, Google, and more, all from a single, secure, and unified console. Manage sessions, track costs, and maintain a consistent workflow, no matter the underlying agent."
- **Suite Integration**: Adds another data point to the Gateway, Cost, Governance, and Audit modules. All Claude interactions are now subject to the same oversight, budgeting, and logging as every other agent.

## 8. Backend work
- **Remove**: `server/api/claude.ts`.
- **Modify**: `server/api/console.ts`.
  - Add logic to the stream handler to `spawn` the `/root/.local/bin/claude` CLI when `session.agent === 'claude'`.
  - Add a new endpoint `GET /api/console/health/:agent` that can probe the underlying CLI's auth status. For Claude, it would check for credential-related errors.
- **Schema**:
  - No new schema beyond the `ai_console_sessions` and `ai_console_messages` tables proposed in the Gemini plan. Claude sessions will simply be rows in those tables with `agent = 'claude'`.
- **Migration**: A one-time script needs to be written to read `claude-sessions.json` and insert its contents into the new SQLite tables.

## 9. Build slices
1. **Unification First**: This work should happen as part of the unified console build-out described in `gemini.plan.md`. The first slice is to build the unified backend and frontend for Gemini.
2. **Integrate Claude**: In the next slice, add the `claude` agent case to `server/api/console.ts`. Replace `app/routes/ClaudePage.tsx` with the `<AIConsole />` wrapper. Migrate the JSON data.
3. **Add Health Check**: Implement the agent health check endpoint and wire the UI to display the "credits exhausted" warning dynamically.

## 10. Verification
- The `/claude` route loads using the unified `<AIConsole />` component.
- The UI correctly displays a prominent warning that the agent is non-functional due to exhausted credits.
- Attempting to send a message results in a clear, user-friendly error message within the chat transcript, not a page crash.
- Session history (listing, creating, deleting) for Claude sessions works correctly and is stored in the central `ai_console_sessions` table.
- The old `server/api/claude.ts` and `claude-sessions.json` files are gone.
- The `ClaudePage.tsx` file is now a thin wrapper, with the vast majority of its previous code deleted.
- The page looks and feels identical to `/gemini`, apart from the disabled model selector and the warning banner, proving unification was successful.
