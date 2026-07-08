# Dashboard V4 Gemini CLI Page Plan

Last updated: 2026-05-13 UTC

## Goal

Add a first-class `/gemini` agent page matching the Claude, Codex, and OpenCode page structure so the operator can manually test Builder Pipeline fallback through Gemini CLI end to end.

## Current Facts

- Gemini CLI is installed at `/usr/bin/gemini`.
- `gemini --version` returns `0.42.0`.
- Gemini CLI supports headless mode with `--prompt`, model selection with `--model`, workspace trust with `--skip-trust`, and approval modes including `default`, `auto_edit`, `yolo`, and `plan`.
- Local Gemini config exists under `/root/.gemini/`.

## Phase 1 - Discovery And Status

- Add Gemini to shared agent discovery and summary endpoints.
- Surface Gemini CLI version, auth/config status, session roots, and supported run modes.
- Show Gemini in Builder agent order pickers and fallback-capable workflow configuration.

## Phase 2 - Interactive Page

- Add `/gemini` route, sidebar item, header metadata, and shared `AgentComposer` wiring.
- Match Claude/Codex route layout: sessions list, transcript surface, run/stop controls, vault logging, quick prompts, and discovery strip.
- Persist Gemini sessions and message transcripts using the same server-owned background run pattern as Claude/Codex.

## Phase 3 - Runtime Options

- Expose model selector from refreshed model inventory.
- Expose approval mode selector with safe defaults: `auto_edit` for manual page runs, `plan` for plan-only research, and `yolo` only behind high-risk confirmation.
- Expose output format selector for text/json/stream-json if the parser supports it.

## Phase 4 - Builder Integration

- Ensure Builder can run Gemini passes with selected model and approval mode.
- Add a plan-mode Builder smoke workflow that uses Gemini to create or update a plan file without implementing product code.
- Record artifacts, stdout/stderr, validation rows, and action audit entries the same way as Codex/Claude/OpenCode runs.

## Phase 5 - Validation

- Run `bun run typecheck`, `bun run build`, and `bun test server/db/ server/api/`.
- Run authenticated Playwright checks for `/gemini`, `/builder`, `/codex`, `/claude`, and `/opencode` across desktop, tablet, and phone.
- Manually test a Builder workflow using agent order `gemini -> codex` with a tiny plan-mode task and confirm the plan artifact appears in the selected plan file.

## Open Questions

- Should Gemini session history be read from `/root/.gemini/history` or stored only in Dashboard SQLite?
- Should Gemini `--approval-mode yolo` be disabled globally unless a workflow has high-risk approval?
- Does Gemini stream-json provide enough stable event detail for typed tool rendering, or should the first page use text output only?


---
## Builder Run br_8d2a5
- **Status**: failed
- **Trigger**: manual
- **Finished**: 2026-05-13T08:08:40.857Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_8d2a5d2d-2e4b-47fa-88bb-600039fdb415/


---
## Builder Run br_02701
- **Status**: failed
- **Trigger**: manual
- **Finished**: 2026-05-13T09:55:20.898Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_02701422-3e84-4080-807f-aa613230f952/


---
## Builder Run br_55374
- **Status**: failed
- **Trigger**: doctor-review
- **Finished**: 2026-05-13T14:17:49.728Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_5537473c-ab7a-47ec-bdf8-7f8a852fd2dd/


---
## Builder Run br_40355
- **Status**: failed
- **Trigger**: manual
- **Finished**: 2026-05-13T14:38:01.297Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_403559ca-ab29-4eec-8b38-c2fedacbcc3d/


---
## Builder Run br_7c390
- **Status**: failed
- **Trigger**: retry
- **Finished**: 2026-05-13T17:15:01.277Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_7c390816-8642-4993-bc52-3a72b527d48d/


---
## Builder Run br_6bedb
- **Status**: failed
- **Trigger**: retry
- **Finished**: 2026-05-13T19:13:27.009Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_6bedb666-148d-4d64-8997-14594e7ff20b/


---
## Builder Run br_aecd9
- **Status**: failed
- **Trigger**: retry
- **Finished**: 2026-05-13T19:23:09.332Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_aecd9f6a-e1e0-4c9a-b9fe-6ad16158cedc/


---
## Builder Run br_185ae
- **Status**: failed
- **Trigger**: retry
- **Finished**: 2026-05-13T19:46:52.079Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_185ae482-bcbb-402f-861b-58eca27e1a05/


---
## Builder Run br_96f44
- **Status**: failed
- **Trigger**: doctor-review
- **Finished**: 2026-05-13T20:12:55.489Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_96f44d04-c454-42d2-b052-c66540529df2/


---
## Builder Run br_05a80
- **Status**: failed
- **Trigger**: retry
- **Finished**: 2026-05-13T20:29:12.338Z
- **Artifact**: /var/lib/control-surface/builder-runs/br_05a8077d-0607-464e-a5cf-ec77020f3564/
