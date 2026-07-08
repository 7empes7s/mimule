You are codex (high reasoning effort). The plan files listed below are ALREADY written and are well-grounded
(deep file:line citations). DO NOT rewrite them from scratch and DO NOT remove existing grounded content or
citations. Your job is to INTEGRATE one new cross-cutting lens into each existing file, in place.

READ FIRST (in full): /root/DASHBOARD_V5_PLAN.md — specifically goals **G4 (detect the unknown) + G9 (zero-config,
any environment)**, the **Cross-cutting mandate**, **Capability X — Universal AI Discovery & Zero-Config Inventory**,
and **Phase 4a**. Also re-read the real code you cite under /opt/opencode-control-surface so new claims carry real
file:line (e.g. the hardcoded inventory at `server/adapters/system.ts:9-18`).

THE LENS (operator directive 2026-06-28): the product must work in ANY environment the moment it is installed, and
must DETECT ALL AI SYSTEMS running on the machine/services even if unregistered, then let the operator REGISTER
them in one click. Detection today is hardcoded to MIMULE (`server/adapters/system.ts:9-18`) → blind elsewhere.

For EACH file below, weave the lens into the EXISTING 10 sections (do not append a stray block; integrate where it
belongs), adding/keeping real file:line:
- **§2 Gaps:** name the hardcoded-inventory / environment-specific assumptions THIS page relies on that break in a
  fresh environment (cite file:line).
- **§3 Goal alignment:** add G4 (detect unknown AI systems) + G9 (zero-config / any environment) lines.
- **§5 Target design:** how the page behaves in a FRESH/any environment — honest discovered/empty/"connect" state,
  never mock or hardcoded; for governance/security/insights, where the **AI Inventory** + discovered→Register flow live.
- **§6 Features:** add the discovery/zero-config features (MUST/SHOULD) with acceptance criteria — for the GRC pages
  this includes the `unregistered-ai-system` / `exposed-model-endpoint` / `shadow-api-key` findings and one-click
  **Register / Ignore / Re-scan**; consistent with Capability X (do NOT invent a parallel scheme).
- **§8 Backend:** the `server/discovery/*` probes + `discovered_assets` table + endpoints this page needs; de-hardcode
  `system.ts` into seed-hints.
- **§10 Verification:** add the G4/G9 acceptance (an unknown AI process/port/container shows up + Register works;
  on a host with none of MIMULE's services the page shows an honest empty state, no crash, no mock).

HARD RULES: edit ONLY the listed markdown files under /root/control-surface-plans/pages/. Do NOT modify anything
under /opt (LIVE). Cite real file:line; never invent (no "OPA" as current state). Keep all prior content. Work
autonomously through ALL listed files.

FILES FOR THIS SESSION: <<INJECTED>>
