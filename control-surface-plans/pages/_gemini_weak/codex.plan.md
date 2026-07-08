# /codex — Product Plan
> A professional, interactive CLI session for the Codex agent, integrated into a unified AI Console that is powerful, consistent, and sellable.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/CodexPage.tsx`. This is the most distinct of the three duplicated console pages.
  - While the basic layout for session management is the same, the transcript rendering is more complex. It's designed to handle a richer stream of events from the Codex CLI, including thoughts (`reasoning`) and structured tool calls (`command_execution`).
  - It features advanced `TranscriptControls` (`app/routes/CodexPage.tsx:327`) to filter the transcript by event type (messages, actions, thoughts) and action category (reads, edits, commands, etc.). This is a powerful feature not present in the other consoles.
- **Backend**: `server/api/codex.ts`.
  - Manages state in a dedicated JSON file: `/var/lib/control-surface/codex-sessions.json` (`server/api/codex.ts:11`).
  - Provides CRUD endpoints and a stream handler (`codexStreamHandler` at `server/api/codex.ts:311`) that spawns the `codex` CLI process.
  - The stream handler is more complex than the others, designed to parse and forward the JSONL event stream from the Codex CLI.
- **Readiness**: 🟡 **Partial**. It's a functional and relatively advanced interface but suffers from the same architectural flaws as the others: it's a siloed, standalone implementation built on a mountain of duplicated code.

## 2. Gaps, mock & broken parts
- **Architectural Redundancy**: Despite its unique features, the core architecture of `CodexPage.tsx` and `server/api/codex.ts` is still a copy-paste of the others. Session management, the composer, and the general page structure are all duplicated.
- **Siloed State**: Session state is stored in `codex-sessions.json` (`server/api/codex.ts:11`), isolated from Gemini and Claude sessions.
- **Feature Inconsistency**: The advanced transcript filtering is a fantastic feature, but it's *only* available for Codex. A user interacting with Gemini, which also has tool calls, doesn't get this benefit. This creates a disjointed user experience.
- **No Model Selection**: Like Claude, there is no mechanism for model selection.

## 3. Goal alignment (G1–G8)
- **G3 (Complete)**: To be "complete," the powerful features of the Codex console (like structured event filtering) should be generalized and made available to all agents that support them.
- **G5 (Findable, Readable, Actionable)**: Unifying the console makes it findable. Generalizing the transcript controls makes the output from *all* agents more readable and actionable.
- **G8 (Admin Center)**: The goal is to lift the unique, valuable concepts from the Codex UI and make them a standard feature of the unified, professional AI Console, rather than a one-off implementation.

## 4. Best-practice research
(This section is identical to `gemini.plan.md` as the research applies to the unified console as a whole).
Leading AI platforms (OpenAI Playground, Azure AI Studio, Amazon Bedrock) provide a unified "playground" or "console" experience. Key patterns to adopt:
- **Unified Interface**: A single, consistent UI for interacting with *any* available model or agent.
- **Model Catalog**: Present models with clear metadata: capabilities, and relative cost/speed metrics.
- **System Prompt Engineering**: Provide a dedicated area to craft and save system prompts.
- **Parameterization UI**: Expose key model parameters (temperature, top-p, etc.).
- **Session History & Sharing**: All sessions are saved, searchable, and can be shared.
- **Cost & Token Tracking**: Display token counts and estimated costs in real-time.
- **Structured Output Rendering**: Render complex events (tool calls, thoughts) in a user-friendly format, just as `CodexPage.tsx` does, but for all agents.

## 5. Target design
The `/codex` route will render the same reusable `<AIConsole />` component. The key is to abstract the advanced features of the Codex UI and build them into the unified component.
- **Information Architecture**: The experience will be identical to the other consoles, using the three-panel layout (History, Transcript, Config).
- **Transcript Rendering**:
  - The `<AIConsole />` component will be enhanced to handle a rich stream of events (not just text). The backend `console.ts` stream handler will forward events like `tool_use` or `thought` from any agent that produces them.
  - The UI will render these events as structured blocks, with icons and expandable details, using the same visual language currently in `CodexPage.tsx:613`.
- **Transcript Controls**:
  - The `TranscriptControls` component (`app/routes/CodexPage.tsx:327`) will be moved into the generic `app/components` directory and become a standard part of the `<AIConsole />` component.
  - It will be displayed for any agent session that contains non-message events (like tool calls or thoughts). If a session (e.g., a simple Claude session) only has text messages, the controls could be hidden to reduce clutter.
- **Configuration Panel**: The model selector will be disabled for Codex, just as for Claude, as the CLI does not support it.

## 6. Features to add (prioritized)
- **MUST**:
  - **Generalize Transcript Rendering**: The logic for rendering different event types (`CodexLiveItem` in `app/routes/CodexPage.tsx`) must be moved into the unified `<AIConsole />` component and made agent-agnostic.
  - **Generalize Transcript Filtering**: The `TranscriptControls` component must be made a standard part of the `<AIConsole />`, available for any agent that emits structured events.
  - **Integrate into Unified Backend**: The logic from `server/api/codex.ts` will be moved into `server/api/console.ts` as a case for the `codex` agent type. Existing `codex-sessions.json` data will be migrated.
  - **Integrate into Unified Frontend**: `app/routes/CodexPage.tsx` will be replaced with a thin wrapper that renders `<AIConsole />` with `agent="codex"`.
- **SHOULD**:
  - **Apply Filtering to Gemini**: Since the Gemini CLI also emits `tool_use` events (`server/api/gemini.ts:316`), the newly generalized transcript controls should be enabled and functional for Gemini sessions, providing immediate value and a more consistent experience.

## 7. Sellable-in-parts
- **Standalone Pitch**: The AI Console's support for Codex showcases its power for advanced, tool-using agents. "Go beyond simple chat. Our AI Console provides a rich, detailed view into your agent's reasoning and actions, with powerful filtering tools for debugging and analysis. Perfect for complex, multi-step tasks."
- **Suite Integration**: By standardizing the rich event stream, all agent actions, regardless of origin, can be fed into the `Audit` log with the same structure. This provides a unified, cross-agent view of all automated actions happening in the system.

## 8. Backend work
- **Remove**: `server/api/codex.ts`.
- **Modify**: `server/api/console.ts`.
  - Add logic to the stream handler to `spawn` the `codex` CLI when `session.agent === 'codex'`.
  - The stream handler must be designed to handle the different event formats from each CLI (`gemini`, `claude`, `codex`) and normalize them into a single, consistent SSE format for the frontend. For example, `event: tool_use` should be sent for tool calls from *any* agent.
- **Schema**:
  - No new schema. Codex sessions and messages will be stored in the `ai_console_sessions` and `ai_console_messages` tables. The rich event data can be stored in a JSON column on the `ai_console_messages` table.
- **Migration**: A script to migrate `codex-sessions.json` data to the new SQLite tables.

## 9. Build slices
1. **Unification First**: Build the unified backend and the `<AIConsole />` component, initially for Gemini.
2. **Abstract Codex Features**: Refactor the transcript rendering and filtering logic out of `CodexPage.tsx` and into the generic `<AIConsole />` component and its children.
3. **Integrate Codex**: Switch `CodexPage.tsx` to use the unified component and backend. Migrate the data.
4. **Retrofit Gemini**: Enable the newly generalized transcript controls on the Gemini page, as it also supports tool calls.

## 10. Verification
- The `/codex` route loads using the unified `<AIConsole />` component.
- The advanced transcript filtering controls are present and functional.
- The transcript correctly renders structured events (thoughts, tool calls) from the Codex agent.
- Session history works and is stored in the central `ai_console_sessions` table.
- The old `server/api/codex.ts` and `codex-sessions.json` files are gone.
- The `/gemini` route now *also* shows the transcript filtering controls, and they work for Gemini's tool calls.
- The page looks and feels identical to `/gemini` and `/claude` in its basic structure (sidebars, composer), demonstrating successful unification.
