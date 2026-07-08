# Styling Fixes — M11/M12 Dashboard Pages

**Theme**: Fix AI-generated styling tells, DaisyUI contamination, native dialogs, and broken page wrappers across 10 new pages added in M11–M12.
**Source**: `/root/STYLING_IMPROVEMENT_PLAN.md` (full critique)
**Codebase**: `/opt/opencode-control-surface/`
**Baseline**: 248 pass / 0 fail · 0 TS errors (2026-05-17)

---

## Phase 1 — Quick Wins (wrapper + token fixes, < 60 min total)

- [x] **QW1** `app/routes/AboutPage.tsx:54` — Replaced `border-l-4 border-amber-500` with `color-mix` background-tint banner
- [x] **QW2** `app/routes/CompliancePage.tsx:191` — Replaced `alert()` with `chainResult` inline state + colored result text
- [x] **QW3** `app/routes/GovernancePage.tsx` — Changed root `<div className="page">` to `<div className="dash-page">`
- [x] **QW4a** `app/routes/GatewayPage.tsx:85` — Replaced style root with `dash-page`
- [x] **QW4b** `app/routes/TracePage.tsx:115` — Replaced style root with `dash-page`
- [x] **QW5** `app/routes/ProjectsPage.tsx` — Changed root to `dash-page`
- [x] **QW6** `app/routes/GatewayPage.tsx:44-48` — Replaced hardcoded color strings (`"green"`, `"red"`, `"orange"`) with CSS token references
- [x] **QW7a** Across all new pages — Replaced `var(--text-primary)` → `var(--text-bright)` (AboutPage, InstallWizardPage)
- [x] **QW7b** Across all new pages — Replaced `var(--bg-tertiary)` → `var(--bg-hover)` (AboutPage, InstallWizardPage)
- [x] **QW7c** Across all new pages — Replaced `var(--bg-2)` → `var(--bg-panel)` (MarketplacePage)
- [x] **QW8** `app/routes/InstallWizardPage.tsx` — Replaced hardcoded Tailwind utilities with CSS token styles (accent, green, amber)

## Phase 2 — Native Dialog Removal

- [x] **P0a** `app/routes/GovernancePage.tsx:95` — Replaced `confirm()` with `deleteConfirmId` inline state showing "Delete? [Yes] [Cancel]"
- [x] **P0b** `app/routes/GovernancePage.tsx:102` — Replaced `prompt()` with modal dialog using existing `modal-overlay` + `modal-box` pattern
- [x] **P0c** `app/routes/MarketplacePage.tsx:129` — Replaced `confirm()` with `uninstallConfirmId` inline state showing "Remove? [Confirm] [Cancel]"

## Phase 3 — CompliancePage DaisyUI Rewrite

- [x] **P0d** `app/routes/CompliancePage.tsx` — Full rewrite removing all DaisyUI classes. Used project design system: `.dash-page`, `.dash-tabs` + `.tab-btn`, `.section-card` + `.section-card-header`, `.filter-input`, `.data-table`, `color-mix` inline banners. Also rewrote AuditExportPanel with fixed `verifyChain` (removed duplicate function), added `dateRange` state, and inline chain result display.

## Phase 4 — TracePage Hex Color Migration

- [x] **P1a** `app/routes/TracePage.tsx:21-26` — Added `--trace-run`, `--trace-pass`, `--trace-tool`, `--trace-gateway`, `--trace-validation` CSS tokens to globals.css. Updated `kindColor()` to return CSS token references.
- [x] **P1b** `app/routes/TracePage.tsx:142` — Replaced hardcoded `"#fff"` selected date text color with `"var(--text-bright)"`

## Phase 5 — GovernancePage Inline Style Block Extraction

- [x] **P1c** `app/routes/GovernancePage.tsx:350-372` — Moved inline `<style>` block to `globals.css` (`.gov-tabs`, `.gov-tab-btn`, `.approval-item`, `.budget-summary-cards`, `.budget-card`, `.budget-bar`, `.btn-sm`, `.btn-danger`). Removed `<style>` block from JSX. Renamed `.tab-btn` → `.gov-tab-btn` in JSX to avoid conflict with globals.css `.tab-btn`. Also restructured JSX from `{tab === "x" && (...)}` to `{tab === "x" ? (...) : null}` to fix TypeScript parse error with nested fragments. Removed unused `RetentionPolicy` interface and `retentionData` hook.

## Phase 6 — ProjectsPage Missing CSS Definitions

- [x] **P2a** `app/globals.css` — Added all missing CSS classes: `.project-list`, `.project-card`, `.project-card-header`, `.project-name`, `.project-badges`, `.project-card-body`, `.project-repo-path`, `.project-validators`, `.validator-cmd`, `.detect-bar`, `.detect-bar-input`, `.detect-bar-icon`, `.form-field`, `.form-label`, `.form-input`, `.detect-success-note`, `.loading-note`, `.error-note`, `.badge-blue`, `.badge-yellow`, `.badge-cyan`, `.badge-orange`, `.badge-gray`. Also added GovernancePage classes: `.gov-tabs`, `.gov-tab-btn`, `.approval-item`, `.approval-actions`, `.budget-summary-cards`, `.budget-card`, `.budget-card-label`, `.budget-card-value`, `.budget-bar`, `.budget-bar-fill`, `.btn-sm`, `.btn-danger`.

## Phase 7 — Validation + Deploy

- [x] Run `cd /opt/opencode-control-surface && bun run typecheck` — 0 TS errors
- [x] Run tests — 260 pass / 0 fail
- [x] Run `bun run build` — production build passes (CSS: 112.43 kB gzip: 20.82 kB, JS: 1608.48 kB gzip: 353.98 kB)
- [x] Restart `control-surface.service` and confirm health — `{"ok":true,"version":"0.8.0"}`

---

**Completed**: 29 / 29 items
**All phases complete.**

<!-- Builder run br_9e5cc: success at 2026-05-17T18:27:57.265Z — details: /opt/ai-vault/builder/2026-05-17-bw_ff450-br_9e5cc.md -->

<!-- Builder run br_ab50d: success at 2026-05-18T14:20:14.908Z — details: /opt/ai-vault/builder/2026-05-18-bw_cb524-br_ab50d.md -->