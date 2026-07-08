# /gemini — Product Plan
> A professional, interactive CLI session for the Gemini agent, integrated into a unified AI Console that is powerful, consistent, and sellable.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/GeminiPage.tsx`. A full-featured, standalone console UI.
  - Session management (create, list, select, delete) is implemented.
  - A chat interface for sending prompts and streaming back responses.
  - A model selector dropdown exists (`app/routes/GeminiPage.tsx:613`), populated by fetching models from `/api/models` and filtering for "gemini" (`app/routes/GeminiPage.tsx:210-216`).
  - Runtime options for "Approval Mode" and "Output Format" are present, specific to the Gemini CLI.
- **Backend**: `server/api/gemini.ts`.
  - Manages state in a dedicated JSON file: `/var/lib/control-surface/gemini-sessions.json` (`server/api/gemini.ts:8`).
  - Provides CRUD endpoints for sessions (`/api/gemini/sessions`).
  - The stream handler at `server/api/gemini.ts:205` spawns the `/usr/bin/gemini` CLI process.
  - **The model selector is partially wired**: The backend accepts a `model` in the request body and correctly adds it to the CLI arguments (`server/api/gemini.ts:217-219`).
- **Readiness**: 🟡 **Partial**. It's functional but exists as a silo. The UI and backend logic are almost entirely duplicated in `ClaudePage.tsx` and `CodexPage.tsx`, indicating a lack of abstraction. It's not yet part of a cohesive "AI Console" and lacks sellable features like cost tracking or advanced history.

## 2. Gaps, mock & broken parts
- **Redundant Architecture**: The entire file `app/routes/GeminiPage.tsx` is a near-identical copy of `ClaudePage.tsx` and `CodexPage.tsx`. The backend logic in `server/api/gemini.ts` is also duplicated. This violates DRY principles and makes maintenance inefficient.
- **Siloed State**: Session state is stored in `gemini-sessions.json` (`server/api/gemini.ts:8`), separate from other agent sessions. A unified console needs a unified storage solution.
- **"Unwired" Model Selector**: While the code to pass the `--model` flag exists (`server/api/gemini.ts:217`), the `DASHBOARD_V5_PLAN.md` flags this as a gap. This implies it's not considered a "complete" feature. It lacks user-friendly context (e.g., model capabilities, cost tiers) and isn't part of a standardized, cross-agent model management system.
- **No Shared Components**: The `glob` search for `**/*console*` in `app/components` was empty, proving there is no reusable console component.

## 3. Goal alignment (G1–G8)
- **G1 (Usable)**: Must be stable and provide clear error feedback from the CLI.
- **G2 (GUI Controllable)**: All interactions, including model selection and session management, must be handled through the UI.
- **G3 (Complete)**: Move beyond a simple CLI wrapper. Integrate cost data, session history, and model metadata to feel like a complete product.
- **G5 (Findable, Actionable)**: As part of a unified AI Console, it should be the single, obvious place for Gemini interaction. Outputs should be clean and actions clear.
- **G7 (AI Reasoning)**: While the console is for direct interaction, it should link to the broader `insights` system. For example, a session could be handed off to the Builder, which uses the reasoner (`app/routes/GeminiPage.tsx:556`).
- **G8 (Admin Center)**: Transform it from a standalone page into a feature of a professional, sellable AI Console module, consistent with the rest of the admin center's design and IA.

## 4. Best-practice research
Leading AI platforms (OpenAI Playground, Azure AI Studio, Amazon Bedrock) provide a unified "playground" or "console" experience. Key patterns to adopt:
- **Unified Interface**: A single, consistent UI for interacting with *any* available model or agent, regardless of the provider.
- **Model Catalog**: Present models with clear metadata: capabilities, strengths, context window size, and relative cost/speed metrics. The current dropdown is a start; a real catalog is better.
- **System Prompt Engineering**: Provide a dedicated area to craft and save system prompts that define the agent's behavior for a session.
- **Parameterization UI**: Expose key model parameters (temperature, top-p, etc.) through sliders and input fields, not just CLI-specific approval modes.
- **Session History & Sharing**: All sessions are saved, searchable, and can be shared with team members via a URL.
- **Cost & Token Tracking**: Display token counts and estimated costs for each turn and for the entire session in real-time.
- **Structured Output Rendering**: Render markdown, JSON, and other structured data in a user-friendly format, not just as raw text.

## 5. Target design
The `/gemini` route will render a new, reusable `<AIConsole />` component.
- **Information Architecture**: The page will be part of a new "AI Consoles" or "Playground" navigation group. The UI will consist of three main panels: a left sidebar for session history across *all* agents, a main content area for the chat transcript, and a right sidebar for session configuration.
- **Layout**:
  - **Left Sidebar**: A list of all console sessions (Gemini, Claude, etc.), filterable by agent type. A "New Session" button at the top opens a modal.
  - **Main Area**: The familiar chat interface, displaying the conversation. User prompts on the right, agent responses on the left.
  - **Right Sidebar (Config Panel)**:
    - **Model Selection**: A dropdown listing all compatible models for the *current* agent (e.g., Gemini models), fetched from a unified `/api/console/models?agent=gemini` endpoint. Each model shows its logical name and a "info" icon to view details (cost, context, etc.).
    - **Parameters**: Sliders for Temperature, Top-P, etc.
    - **System Prompt**: A textarea to define a system prompt for the session.
    - **Session Info**: Displays current token count, estimated cost, and other metadata.
- **AI Reasoning (G7)**: Tool use from the agent will be rendered as structured blocks, similar to the existing Codex UI (`app/routes/CodexPage.tsx:613`). Errors from the CLI will be displayed as a system error message in the chat.
- **Actions (G6)**: The composer bar will feature the "Send" button. A "Stop" button will appear while a command is running. A "Handoff to Builder" button will persist, allowing the session to be used as a starting point for a new agent.

## 6. Features to add (prioritized)
- **MUST**:
  - **Refactor to a Unified Backend**: Create `/api/console.ts` to handle session management for all agents, storing data in a single SQLite table (`ai_console_sessions`). The agent type (`gemini`, `claude`) becomes a property of the session.
  - **Create Reusable `<AIConsole />` Component**: Extract the shared UI and logic from the existing `*Page.tsx` files into a single, configurable component. `GeminiPage.tsx` becomes a thin wrapper that passes `agent="gemini"` to it.
  - **Wire Up Unified Model Selection**: The `<AIConsole />` will fetch and display models for the active agent type. The selected model's logical name will be passed to the unified backend.
- **SHOULD**:
  - **Real-time Cost Tracking**: Integrate with the (to-be-fixed) cost service. Display cost-per-turn and session total. This is a key "sellable" feature.
  - **System Prompt Configuration**: Add the system prompt editor to the configuration panel.
  - **Render Markdown Output**: Detect and render markdown in assistant responses for better readability.
- **EXTRA**:
  - **Session Sharing**: Add a "Share" button to generate a unique URL to the session for other team members.
  - **Session Tagging/Search**: Allow users to add tags to sessions and search through their history.

## 7. Sellable-in-parts
This page is a core part of the "AI Console" module.
- **Standalone Pitch**: "An enterprise-grade playground for your AI agents. Securely interact with models like Gemini in your own environment, with full control, session history, and cost management. Perfect for developers, researchers, and prompt engineers."
- **Suite Integration**: Within the suite, the AI Console is the primary interface for ad-hoc interaction with the models managed by the Gateway. It links directly to Cost (for budgeting), Governance (for access control), and Builder (to turn successful prompts into production agents).

## 8. Backend work
- **Remove**: `server/api/gemini.ts`.
- **Add**: `server/api/console.ts`.
  - `POST /api/console/sessions`: Create a new session. Body: `{ agent: string, directory: string, title?: string }`.
  - `GET /api/console/sessions?agent=gemini`: List sessions, with optional filtering.
  - `GET /api/console/sessions/:id`: Get a single session's details and messages.
  - `DELETE /api/console/sessions/:id`: Delete a session.
  - `POST /api/console/sessions/:id/stream`: Send a message. Body: `{ text: string, model: string, ...other_params }`. The handler will have a switch/case on `session.agent` to call the correct CLI tool (`gemini`, `claude`, etc.) with the appropriate arguments.
  - `GET /api/console/models?agent=gemini`: Returns models from `/api/models` filtered for the specified agent provider.
- **Schema**:
  - **Add Table**: `ai_console_sessions` (`id`, `agent`, `title`, `directory`, `created_at`, `updated_at`).
  - **Add Table**: `ai_console_messages` (`id`, `session_id`, `role`, `content`, `ts`, `cost`, `tokens`).

## 9. Build slices
1. **Backend Unification**: Create `server/api/console.ts` and the new DB schema. Implement the session CRUD and streaming logic for the `gemini` agent type first. Migrate existing `gemini-sessions.json` data to the new table. Update `server/api/router.ts` to use the new endpoints.
2. **Frontend Componentization**: Create the `<AIConsole />` component. Refactor `app/routes/GeminiPage.tsx` to use it. At this point, the Gemini page should look and feel the same, but be powered by the new unified backend and reusable component.
3. **Integrate Other Agents**: Modify `ClaudePage.tsx` and `CodexPage.tsx` to also use the `<AIConsole />` component, passing their respective `agent` types. This will delete a large amount of redundant code.
4. **Add Sellable Features**: Incrementally add cost tracking, system prompt editor, and markdown rendering to the `<AIConsole />` component, making them available to all agents at once.

## 10. Verification
- The `/gemini` route loads and is functional.
- Creating a new Gemini session, sending a prompt with a non-default model selected, and receiving a response works correctly. The correct model is passed to the `gemini` CLI.
- All session data is persisted in the new `ai_console_sessions` SQLite table.
- The old `server/api/gemini.ts` and `gemini-sessions.json` are gone.
- The `GeminiPage.tsx` file is now significantly smaller and primarily consists of the `<AIConsole />` component.
- The page aligns with the Admin Center's visual style (G8).
- Cost per session turn is displayed (G3).
- The "Handoff to Builder" feature remains functional.
