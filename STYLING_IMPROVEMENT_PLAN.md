# Styling Improvement Plan — M11/M12 Dashboard Pages
**Date:** 2026-05-17  
**Scope:** 10 new pages added in milestones M11–M12 of the TIB control surface  
**Codebase:** `/opt/opencode-control-surface/`  
**Methodology:** Full source-code audit against the impeccable/critique skill design principles, Nielsen's 10 heuristics, and the AI-slop detection protocol.

---

## 1. Overall Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good use of pills, loading states, live dot — but some pages (TracePage) show nothing meaningful on empty state |
| 2 | Match System / Real World | 2 | Technical jargon pervasive (SOC2, DPA, circuit breaker states). No real-world metaphors helping novice operators. |
| 3 | User Control and Freedom | 2 | `confirm()` / `alert()` for destructive actions (delete secret, uninstall skill, verify chain). No undo. No in-page confirmation dialogs. |
| 4 | Consistency and Standards | 1 | **Critical.** Four different page wrapper classes in use: `dash-page`, `page`, `page-content`, and raw `div style={{padding:"20px 24px"}}`. DaisyUI classes on CompliancePage (card, tabs-boxed, toggle) versus hand-rolled design system on all other pages. |
| 5 | Error Prevention | 2 | No validation before destructive confirms. Governance "Add Secret" form has no field-level errors. GovernancePage uses `prompt()` for approval reason — eliminates input validation entirely. |
| 6 | Recognition Rather Than Recall | 2 | TracePage date list has no "today" highlight. GatewayPage call ledger's `prompt_tokens + completion_tokens` format (`4096+512`) is cryptic. InstallWizard step labels disappear on mobile. |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no bulk actions, no saved filter state. Compliance tabs reset on navigate-away. |
| 8 | Aesthetic and Minimalist Design | 1 | **Critical.** Hero metric layout in GatewayPage, identical card grids across Governance/Compliance, excessive cognitive density on TracePage, one confirmed absolute-ban violation. See anti-pattern verdict below. |
| 9 | Error Recovery | 1 | Most API errors are handled by silently catching exceptions (`.catch(() => {})`). SettingsPage at least shows an error string but it's styled with the same `.loading-dim` class as loading states — visually indistinguishable. |
| 10 | Help and Documentation | 2 | InstallWizard is the only page with inline guidance. Every other page dumps state without context. Empty states on some pages (WorkflowsPage) are the rare exception that actually teaches. |
| **Total** | | **18/40** | **Below average — significant work needed** |

---

## 2. Anti-Pattern Verdict

**Yes, these pages collectively read as AI-generated.** The tells are numerous and specific:

### Confirmed absolute-ban violations

**BAN 1 — Side-stripe border:** `AboutPage.tsx` line 54:
```tsx
<div className="w-card amber border-l-4 border-amber-500">
```
This is a textbook `border-left: 4px solid` accent stripe on an alert card. It is the single most overused pattern in AI-generated admin UIs per the impeccable guidelines, and it appears on the update-available notice — one of the most visible moments on the About page.

**BAN 2 — No gradient text found.** This is the one absolute ban not triggered.

### AI slop tells identified (not absolute bans, but strong signals)

1. **Hero metric layout** in GatewayPage: Four identical cards (Total calls / Success rate / Avg latency / Est. cost) with a large mono number, small dim label, in a `repeat(4, 1fr)` grid. This is the exact "hero metric" template the impeccable guidelines call out explicitly. The layout says nothing about relationships between metrics.

2. **Identical card-grid repetition** in GovernancePage budget panel: Two side-by-side `budget-card` elements (Daily Spend / Monthly Spend) with the same structure — label, value, progress bar. It is a copy-pasted widget grid with no visual differentiation.

3. **Every section is a card.** CompliancePage wraps every sub-panel in `card > card-body`. SettingsPage wraps every group in `WCard`. GovernancePage wraps tabs in `section-card`. Nothing is "just content" — every element gets a container, which flattens hierarchy.

4. **DaisyUI class leak in CompliancePage.** CompliancePage is the only page using DaisyUI classes (`tabs tabs-boxed`, `tab-active`, `card`, `card-body`, `card-title`, `btn btn-primary`, `form-control`, `toggle toggle-sm`, `loading loading-spinner`, `alert alert-info`). Every other page uses the hand-rolled design system in globals.css. This is not a stylistic choice — it is a page that was built separately and was never integrated into the project's actual design system. At runtime, DaisyUI's default styles will conflict with the OKLCH token system.

5. **Massive inline-style density.** GatewayPage: 51 inline style objects. WorkflowsPage: 50. TracePage: 43. This is evidence of generated code that never had design-system intent — inline styles are the fallback when no token or class pattern was considered.

6. **Four root wrappers.** `dash-page`, `page`, `page-content`, and raw `div style={{padding}}` are all used as the root element for different pages. There is no consistent page container. This produces different left/right padding and max-width behavior across pages.

7. **Native `confirm()` and `alert()` usage.** GovernancePage lines 95 and 102 (`confirm`, `prompt`), MarketplacePage line 129 (`confirm`). The `prompt()` call for approval reason (GovernancePage line 102) is particularly egregious — it bypasses the entire UI system for a potentially sensitive action (approving a workflow gate).

8. **Hardcoded hex colors in TracePage.** Lines 21–26 define span-kind colors as Tailwind-adjacent hex values (`#6366f1`, `#0ea5e9`, `#f59e0b`, `#10b981`, `#8b5cf6`) that are completely disconnected from the OKLCH token palette. These will not adapt to light mode.

9. **`alert` for audit chain verification.** CompliancePage line 191: `alert(json.data?.pass ? "Chain integrity verified" : "Chain integrity FAILED")`. A critical security verification result is communicated through a blocking native browser dialog box.

---

## 3. Priority Issues (P0–P3)

### P0 — DaisyUI class contamination in CompliancePage

**What:** CompliancePage uses `tabs tabs-boxed`, `card`, `card-body`, `toggle-sm`, `btn-outline`, `loading-spinner`, `alert-info` — none of which are defined in globals.css. The page depends on a design library that is not installed.

**Why it matters:** If DaisyUI is not loaded (it's not in `package.json`), these classes render as unstyled HTML. The page will look broken. Even if Tailwind's built-in plugin resolves some classes, the `text-base-content`, `bg-base-200`, and `tab-active` classes have no definition in the project.

**Exact fix:** Rewrite CompliancePage to use the project's own design system:
- Replace `tabs tabs-boxed` + `tab` + `tab-active` → use `.dash-tabs` + `.tab-btn` + `.active` (already defined in GovernancePage inline styles, or the `.topnav-link` pattern)
- Replace `card bg-base-200` + `card-body` + `card-title` → `.section-card` + `.section-card-header` + `.section-card-body` (already in globals.css)
- Replace `btn btn-primary`, `btn btn-xs btn-outline` → `.btn.btn-primary`, `.btn.btn-ghost` (already in globals.css)
- Replace `form-control` + `label` + `input-bordered` → standard `<label>` + `.filter-input` or custom form styles
- Replace `toggle toggle-sm` → custom checkbox or use a proper toggle from the design system
- Replace `alert alert-info` → inline banner using `color-mix` and `--blue` token
- Replace `loading loading-spinner` → the project's own spinner pattern

**File/line:** `/opt/opencode-control-surface/app/routes/CompliancePage.tsx` — entire file

---

### P0 — Native confirm/alert/prompt calls

**What:** Three locations use blocking native browser dialogs:
1. `GovernancePage.tsx:95` — `confirm()` to delete a secret
2. `GovernancePage.tsx:102` — `prompt()` to get approval reason (destructive governance action)
3. `MarketplacePage.tsx:129` — `confirm()` to uninstall a skill
4. `CompliancePage.tsx:191` — `alert()` to show audit chain integrity result

**Why it matters:** Native dialogs block the main thread, are unstyled (jarring visual break from the designed UI), cannot be cancelled by pressing Escape in the custom drawer overlay (the overlay's Escape handler fires instead), and `prompt()` has no input validation. On the governance page, using `prompt()` for a security-sensitive decision (workflow approval) is a serious UX failure.

**Exact fix:**
- For confirms: add a small inline confirmation UI inline (e.g., a "Are you sure? [Yes] [Cancel]" that replaces the action button temporarily) or use the project's existing `drawer-overlay` + `modal-box` pattern already defined in GovernancePage for other actions.
- For the approval reason: use the existing `modal-overlay` + `modal-box` pattern with a text input, already implemented for "Add Secret" in the same file — just copy the pattern.
- For audit chain result: replace `alert()` with an inline result state displayed in the card (already has the button, just add a result state variable and render the pass/fail message there).

**Files/lines:**
- `/opt/opencode-control-surface/app/routes/GovernancePage.tsx:95,102`
- `/opt/opencode-control-surface/app/routes/MarketplacePage.tsx:129`
- `/opt/opencode-control-surface/app/routes/CompliancePage.tsx:191`

---

### P1 — Inconsistent page wrapper class

**What:** Five different root-element patterns in use:
- `<div className="dash-page">` — SettingsPage, WorkflowsPage, MarketplacePage
- `<div className="page">` — GovernancePage (`.page` has no definition in globals.css — it falls back to zero padding)
- `<div className="page-content">` — ProjectsPage (`.page-content` also has no definition in globals.css)
- `<div style={{ padding: "20px 24px", maxWidth: 1100 }}>` — GatewayPage, TracePage (raw inline styles)
- `<div className="p-6 max-w-xl mx-auto">` — InstallWizardPage, AboutPage (Tailwind utility classes)

**Why it matters:** Pages have inconsistent left/right padding, different max-widths, and different spacing from the topnav. Pages using `.page` or `.page-content` have zero padding (no definition found in globals.css) and will be flush against the browser edges.

**Exact fix:**
- Standardise all new pages on `<div className="dash-page">` as the root element.
- For pages that need a narrower max-width (InstallWizardPage, AboutPage), add an inner `<div style={{ maxWidth: 640 }}>` or create a `.dash-page.narrow` variant in globals.css.
- Remove `style={{ padding: "20px 24px", maxWidth: 1100 }}` from GatewayPage and TracePage roots; replace with `className="dash-page"`.
- Add `.page { }` and `.page-content { }` as aliases for `.dash-page` in globals.css as a safety net, or do a find-replace.

**Files:** GatewayPage.tsx:85, TracePage.tsx:115, GovernancePage.tsx:134, ProjectsPage.tsx:165

---

### P1 — About page border-left absolute ban violation

**What:** `AboutPage.tsx:54` renders the update-available notice as:
```tsx
<div className="w-card amber border-l-4 border-amber-500">
```

**Why it matters:** This is the exact pattern defined as an absolute ban in the impeccable guidelines — a 4px left border used as an accent stripe on a card. It's also mixing Tailwind utility classes (`border-l-4`, `border-amber-500`) with custom design-system classes (`w-card`, `amber`), suggesting the class `amber` and the border are being layered redundantly.

**Exact fix:** Replace the border-stripe with a background tint approach. The project already has amber warn tokens. Use:
```tsx
<div style={{ 
  background: "color-mix(in oklch, var(--amber-warn) 7%, transparent)",
  border: "1px solid color-mix(in oklch, var(--amber-warn) 30%, transparent)",
  borderRadius: 6, padding: "12px 16px"
}}>
```
Or add a `.banner.warn` class to globals.css with these same values, matching the existing `.permission-bar` pattern.

**File/line:** `/opt/opencode-control-surface/app/routes/AboutPage.tsx:54`

---

### P1 — Hardcoded hex colors in TracePage that break light mode

**What:** `TracePage.tsx:21-26` defines `kindColor()` returning raw hex values (`#6366f1`, `#0ea5e9`, etc.) that are used as inline background colors on span-kind badges. `TracePage.tsx:142` hardcodes `"#fff"` for selected date text.

**Why it matters:** These colors are taken from Tailwind's preset palette (indigo-500, sky-500, amber-400, emerald-500, violet-500) but are completely disconnected from the project's OKLCH token system. They will be illegible in light mode (dark text on dark background) and will never adapt to theme changes. They also introduce a color set (cyan/purple/teal/emerald) that conflicts with the designed palette (amber primary, navy neutral).

**Exact fix:**
- Replace hex colors with CSS custom properties. Add trace-kind tokens to globals.css:
  ```css
  --trace-run:        oklch(60% 0.110 248);  /* blue, matching --blue */
  --trace-pass:       oklch(64% 0.130 145);  /* green, matching --green */
  --trace-tool:       oklch(70% 0.148  52);  /* amber-warn */
  --trace-gateway:    oklch(68% 0.130 240);  /* blue variant */
  --trace-validation: oklch(62% 0.110 300);  /* muted violet */
  ```
- Replace `kindColor()` to return `var(--trace-${kind})` and use `background: kindColor(span.kind)` as a CSS variable.
- Replace hardcoded `"#fff"` (line 142) with `"var(--text-bright)"`.

**File/line:** `/opt/opencode-control-surface/app/routes/TracePage.tsx:21-26, 51, 142`

---

### P2 — GatewayPage hero metric layout

**What:** The stats strip (`GatewayPage.tsx:97-111`) is a 4-column identical-card grid with a large monospace number and a dim label. This is the "hero metric layout template" explicitly called out in the impeccable anti-patterns.

**Why it matters:** The layout gives equal visual weight to four very different metrics (a count, a percentage, a duration, a cost). It conveys no relationship between them. The formatting (`"$0.001234"` in monospace) is technically accurate but cognitively noisy — the micro-cost of individual calls is irrelevant without cumulative context.

**Exact fix:** Replace with a single `stat-row` (already defined in globals.css at line 1019) that flows horizontally. This existing component has the right density for a status strip. Remove card borders from individual stats — they don't need containers, they need proximity and typographic hierarchy. The stat-row can show all four values inline without wrapping each in a separate bordered card.

**File/line:** `/opt/opencode-control-surface/app/routes/GatewayPage.tsx:97-111`

---

### P2 — Massive inline style count (GatewayPage: 51, WorkflowsPage: 50)

**What:** GatewayPage and WorkflowsPage contain 51 and 50 inline `style={{}}` objects respectively. These include layout values (`display: "flex"`, `alignItems: "center"`, `gap: 8`), typography (`fontSize: 11`, `fontFamily: "var(--mono)"`), and color tokens (`color: "var(--text-dim)"`).

**Why it matters:** Inline styles cannot be overridden by the design system (they have higher specificity). They make theming impossible — any future dark/light/compact variant work will need to touch individual style props in the TSX rather than CSS variables. They also make responsive design impossible at the component level.

**Exact fix:** The fix is iterative. Start with the most-repeated patterns:
1. Extract the InstanceRow column layout (the 8-column grid in WorkflowsPage) into a `.workflow-row` CSS class.
2. Extract the circuit-breaker item row in GatewayPage into a `.circuit-row` class.
3. Extract all `{ display: "flex", alignItems: "center", gap: N }` patterns into utility classes that already exist in the project (`.w-row`, `flex items-center gap-2` via Tailwind).

---

### P2 — GovernancePage: inline `<style>` block

**What:** `GovernancePage.tsx:350-372` contains a `<style>` block injected directly into the JSX — defining `.gov-tabs`, `.tab-btn`, `.data-table`, `.approval-item`, `.budget-summary-cards`, `.budget-card`, etc.

**Why it matters:** Scoped component styles are fine in isolation, but these classes shadow or duplicate CSS already in globals.css (`.data-table` is defined twice). The inline `<style>` cannot be extracted for reuse. The tab styling (`.gov-tabs`, `.tab-btn`) duplicates the tab pattern from CompliancePage's DaisyUI classes and from the topnav tabs — there are now three separate implementations of the same tab pattern in the codebase.

**Exact fix:** Move all GovernancePage-specific classes to globals.css, or rename and consolidate with the existing `.section-card-header` tab bar pattern. Specifically:
- Remove `.gov-tabs` / `.tab-btn` — use `.dash-tabs` and `.tab-btn` defined either in globals or as a shared component
- Remove `.data-table` from the inline `<style>` since it conflicts with the identically-named class in globals.css
- Move `.approval-item`, `.budget-card`, `.budget-bar` to globals.css where they belong

**File/line:** `/opt/opencode-control-surface/app/routes/GovernancePage.tsx:350-372`

---

### P3 — GatewayPage and TracePage use raw `padding: "20px 24px"` instead of `.dash-page`

Already covered under P1 but worth noting separately: the raw inline padding means these two pages have slightly different gutters from the rest (20px vs the 22px in `.dash-page`). The visual inconsistency is minor but cumulative.

---

### P3 — Empty state quality gap

**What:** Most pages have minimal or absent empty states. TracePage shows a plain `<p>` for no spans. GatewayPage circuit panel shows one dim sentence. CompliancePage Report Templates section has no empty state at all — it just shows nothing if the array is empty.

**Why it matters:** Empty states are the first impression for new users. A blank space teaches nothing. WorkflowsPage has a good empty state (centered Play icon with instructional text) — the others should match that quality level.

**Exact fix:** Follow the WorkflowsPage pattern: centered container with `var(--bg-sub)` background, muted icon (24–32px, opacity 0.4), primary message, secondary instruction line, and optionally a CTA button. Add to: TracePage (no spans), GatewayPage (no calls), CompliancePage (no templates).

---

## 4. Recommended Skill Commands (in order)

1. **`/colorize`** — Fix hardcoded hex colors in TracePage; validate that DaisyUI color classes in CompliancePage have no tokens in the current palette. Ensure light-mode adaptation for all new pages.

2. **`/layout`** — Standardise page root wrappers to `dash-page`; collapse the hero metric layout in GatewayPage to `stat-row`; extract WorkflowsPage/GatewayPage inline grids to CSS classes; move GovernancePage inline style block to globals.css.

3. **`/shape`** — Replace the `border-l-4` absolute-ban violation in AboutPage; improve empty state designs on TracePage, GatewayPage, CompliancePage.

4. **`/typeset`** — GatewayPage call ledger uses 10px font throughout with no hierarchy. WorkflowsPage InstanceRow has three font-size levels all at 10–12px within 8px of each other. Audit min font size (nothing should be below 11px in body copy).

5. **`/polish`** — Consolidate three separate tab implementations into one design-system pattern; remove native confirm/alert/prompt calls and replace with inline confirmation UI; add focus-visible states to all interactive elements in the new pages.

---

## 5. Per-Page Findings

### CompliancePage (`/compliance`)

- **Critical:** Uses DaisyUI exclusively, no project design-system classes. Will render broken if DaisyUI is not loaded.
- The `tabs tabs-boxed` tab bar is visually jarring compared to the topnav-style tab bars used elsewhere.
- `alert alert-info` at line 443 displays a dense one-liner of compliance summary with no visual hierarchy (`Tenant: X | Region: Y | Retention: Zd`).
- The `alert()` call for chain integrity (line 191) is a blocking native dialog for a critical security check.
- Cards nest inside panels inside tabs — three levels of containment for simple form fields. Flatten it.
- No empty state for the Reports tab when `templates.length === 0`.
- `Shield` icon reused as both the page header icon (Shield = compliance) and the "Verify Chain" button icon in the Audit tab — same icon, different meaning, no differentiation.
- **Score: 3/10** (worst page in the set)

### SettingsPage (`/settings`)

- Consistent with the design system (`WCard`, `Pill`, `dash-page`, `dash-section`).
- `marginBottom: 16` inline style on tab row (line 125) — should use `dash-section` margin instead.
- Section titles are all lowercase (`auth status`, `widget preferences`) — inconsistent with `dash-section-title` uppercase convention used elsewhere.
- The "Widget Preferences — coming in V4.1" placeholder card is dead weight for the user and should not be shown. Either ship the feature or show nothing.
- **Score: 6/10**

### InstallWizardPage (`/install`)

- Well-structured progressive flow — the only page with a numbered stepper.
- Hardcoded Tailwind colors: `bg-amber-500`, `bg-green-600`, `hover:text-amber-300`, `bg-amber-600`, `hover:bg-amber-500`. These pull from Tailwind's preset palette rather than `var(--accent)`. Will break under the `[data-variant="compact"]` teal theme.
- The step connector dots (`w-7 h-7 rounded-full`) have no visual connector between them — steps appear as isolated dots with no line showing progression.
- `bg-[var(--text-primary)]` (line 88) references `--text-primary` which does not exist in globals.css (correct token is `--text-bright` or `--text`).
- On step 4 (Complete), the page renders two text links (`underline hover:text-amber-300`) — low affordance for primary completion actions.
- **Score: 5/10**

### GovernancePage (`/governance`)

- Best functional coverage of the set — policies, secrets, approvals, budgets are all implemented.
- Inline `<style>` block conflicts with globals.css `.data-table` definition.
- `confirm()` for delete and `prompt()` for approval reason are hard failures.
- Budget cards are the hero-metric anti-pattern with progress bars.
- Tab implementation (`.gov-tabs`, `.tab-btn`) is a third variant of the tab pattern.
- Modal for Add Secret is well implemented and should be the template for the approval reason modal.
- `approval-item.completed { opacity: 0.5 }` — fading completed approvals is correct intent but 50% opacity makes them unreadable. Use `0.65` at minimum.
- **Score: 5/10**

### GatewayPage (`/gateway`)

- Technically the most data-rich page. Stats strip, circuit breakers, per-model usage, 100-row ledger.
- 51 inline style objects — highest density in the codebase.
- Hero metric layout for stats strip.
- Hardcoded `"#fff"` for active filter button text (line 135).
- Circuit breaker icons use hardcoded `style={{ color: "green" }}`, `style={{ color: "red" }}`, `style={{ color: "orange" }}` (lines 45-47) — all completely outside the token system.
- `fmtTs` returns ISO-ish format `2026-05-17 14:23:00` — readable but inconsistent with `fmtTs` in WorkflowsPage which returns `05-17 14:23:00` (drops the year).
- Raw `<div style={{ padding: "20px 24px" }}>` root.
- **Score: 4/10**

### WorkflowsPage (`/workflows`)

- Good empty state (the best on any new page).
- 50 inline style objects.
- The 8-column grid layout for InstanceRow is clever but the column proportions are hardcoded (`24px 1fr 100px 90px 100px 80px 1fr 80px`) — will collapse badly on tablet.
- Signal Modal uses drawer pattern correctly.
- `fmtTs` strips year from timestamps — after January 1, all entries look like they could be from any year.
- **Score: 6/10**

### ProjectsPage (`/projects`)

- Uses `.page-content` which has no CSS definition — zero padding at runtime.
- Uses `.page-header` (defined) but with a `.page-header-left` sub-element that is not defined — layout may collapse.
- Badge classes (`badge-blue`, `badge-yellow`, `badge-cyan`, `badge-orange`, `badge-gray`) are all undefined in globals.css — language badges will render unstyled.
- `detect-bar`, `detect-bar-input`, `detect-bar-icon`, `project-card`, `project-list`, `validator-cmd`, `detect-success-note`, `loading-note`, `error-note`, `form-field`, `form-label`, `form-input` are all used but none defined in globals.css.
- This page either has a separate CSS file that was not found, or all these classes render as unstyled. This is the second-most broken page after CompliancePage.
- **Score: 2/10** (presumed unstyled)

### TracePage (`/traces`)

- 43 inline style objects.
- Span-kind color badges use 6 hardcoded hex values outside the token system.
- The date sidebar is a bare list of buttons — no visual grouping, no month separators.
- The selected span detail panel renders inline below the table — good choice over a modal, but the panel has no animation/transition on appearance.
- Filter selects (lines 157–169) use inline `style={{ fontSize: 11, padding: "3px 6px", ... }}` instead of the project's `.filter-select` class defined in globals.css.
- Raw `<div style={{ padding: "20px 24px" }}>` root.
- **Score: 4/10**

### AboutPage (`/about`)

- Clean layout, good data structure.
- `border-l-4 border-amber-500` absolute ban violation on the update banner.
- `bg-[var(--text-primary)]` reference (non-existent token) on version badge (line 71).
- Mixed Tailwind and design-system classes: `p-6 max-w-2xl space-y-6` (Tailwind) alongside `w-card`, `font-mono`, and `text-[var(--text-primary)]` (inline-token).
- Version value inside `<span className="px-2 py-0.5 bg-[var(--bg-tertiary)] rounded text-amber-400 font-bold">` — `bg-[var(--bg-tertiary)]` references `--bg-tertiary` which doesn't exist in globals.css (correct token is `--bg-hover` or `--bg-panel`).
- The Install Paths card is all monospace with no hierarchy — path labels and path values at the same size.
- **Score: 5/10**

### MarketplacePage (`/marketplace`)

- Mostly uses `.dash-page`, `.btn`, `.btn-primary` design system classes — best integration of the set.
- `confirm()` for uninstall.
- Skill cards use raw inline styles for layout instead of leveraging the section-card pattern.
- The "installed skills" section title is lowercase (`installed skills`) — inconsistent with `.dash-section-title` uppercase convention.
- Skill kind and status badges are rendered as `.pill.gray` and a custom `SkillStatusBadge` — the custom badge component exactly duplicates the `.pill` pattern. It should just use `<span className={`pill ${color}`}>`.
- The run-output `<pre>` uses `var(--bg-2)` (line 249) which does not exist in globals.css.
- **Score: 6/10**

---

## 6. Quick Wins (< 30 minutes each)

### QW1 — Fix the border-l-4 in AboutPage (~5 min)
Replace line 54 with a background-tint banner. One-line change. Eliminates the only absolute-ban violation. High visibility since it only shows when an update is available.

```tsx
// Before
<div className="w-card amber border-l-4 border-amber-500">

// After  
<div style={{ background: "color-mix(in oklch, var(--amber-warn) 7%, transparent)", border: "1px solid color-mix(in oklch, var(--amber-warn) 30%, transparent)", borderRadius: 6, padding: "14px 16px" }}>
```

### QW2 — Replace alert() in CompliancePage (~10 min)
Add `const [chainResult, setChainResult] = useState<boolean | null>(null)` and replace `alert(...)` with `setChainResult(pass)`. Render inline:
```tsx
{chainResult !== null && (
  <div style={{ color: chainResult ? "var(--green)" : "var(--red)", fontSize: 12, marginTop: 8 }}>
    {chainResult ? "Chain integrity verified" : "Chain integrity FAILED"}
  </div>
)}
```

### QW3 — Fix GovernancePage root wrapper (~3 min)
Change `<div className="page">` to `<div className="dash-page">`. Immediately restores correct padding on the Governance page without any other changes.

### QW4 — Fix GatewayPage and TracePage root wrappers (~5 min)
Replace `<div style={{ padding: "20px 24px", maxWidth: 1100 }}>` with `<div className="dash-page">`. Two files, one-line change each. Consistent margins instantly.

### QW5 — Fix ProjectsPage root wrapper (~3 min)
Change `<div className="page-content">` to `<div className="dash-page">`. Restores padding to the Projects page.

### QW6 — Fix circuit icon hardcoded colors in GatewayPage (~5 min)
Lines 44-48: replace `style={{ color: "green" }}`, `style={{ color: "red" }}`, `style={{ color: "orange" }}` with `style={{ color: "var(--green)" }}`, `style={{ color: "var(--red)" }}`, `style={{ color: "var(--amber-warn)" }}`.

### QW7 — Replace `--text-primary` and `--bg-tertiary` ghost token references (~10 min)
Search-replace across all new pages:
- `var(--text-primary)` → `var(--text-bright)` (closer intent)
- `var(--bg-tertiary)` → `var(--bg-hover)` (closer intent)
- `var(--bg-2)` → `var(--bg-panel)` (closer intent)
- `var(--text-red, red)` → `var(--red)` (the fallback implies doubt; the real token exists)

### QW8 — Fix InstallWizardPage hardcoded Tailwind amber colors (~10 min)
Replace `bg-amber-500`, `bg-amber-600`, `hover:bg-amber-500`, `text-amber-400`, `hover:text-amber-300`, `border-amber-500`, `bg-green-600` with:
- `bg-amber-*` → `style={{ background: "var(--accent)" }}`
- `text-amber-*` → `style={{ color: "var(--accent)" }}`
- `hover:text-amber-300` → hover state handled in CSS or inline `onMouseEnter`/`onMouseLeave`
- `bg-green-600` → `style={{ background: "var(--green)" }}`

---

## Summary for Execution

**Immediate (before next deploy):** QW1–QW8 above. Collectively these take under 60 minutes and eliminate:
- 1 absolute-ban violation
- 4 pages with missing/broken padding
- 3 native dialog calls (alert, partial)
- All ghost token references

**Sprint 1:** P0 items — CompliancePage DaisyUI rewrite, native confirm/prompt replacement

**Sprint 2:** P1 items — GovernancePage inline style block extraction, TracePage hex color migration

**Sprint 3:** P2 items — GatewayPage hero metric redesign, inline style extraction for GatewayPage/WorkflowsPage

**Sprint 4:** P3 items — Empty state improvements, focus-visible states, accessibility pass
