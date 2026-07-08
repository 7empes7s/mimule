# MOBILE STYLE PASS — screenshot-driven, Sonnet 5 (staged; dispatch AFTER Slice 7 commits)

Operator: "run a style pass with screenshots on the mobile version — a lot of style issues especially with
mobile view." app + CSS only; NO server/schema. Fix at the SHARED/CSS level where possible (one media-query
fix should benefit many pages) rather than per-page hacks. Test at **iPhone viewport (390–393px)** in BOTH
light and dark themes. This is SCREENSHOT-DRIVEN: capture mobile screenshots, fix, re-screenshot, iterate.

## Baseline (Opus mobile audit 2026-07-01, 19 routes @ iPhone 15 Pro)
Good news: **0px horizontal overflow** on every route, and there's a working bottom tab bar. The issues are
layout/spacing/sizing, confirmed by screenshot:

1. **Two-column page layouts DON'T collapse to single-column on mobile** — the right/sidebar column runs off
   the right edge (clipped, so it doesn't count as overflow but IS cut off). Confirmed on **Data Explorer**
   (DATASETS | INSIGHTS — the INSIGHTS panel is cut off: "first 200 of 46…", search "S…"). Very likely the
   same on any page with a main+sidebar grid: **Governance** (User Directory | Permission Matrix/Tenants),
   **Cost** (main | config), **FinanceIntel** (main | Portfolio config/Manual trigger), **Admin**, etc.
   → Add a mobile media query so these 2-col (main+aside) grids **stack to a single column** ≤ ~700px.
   Grep for the grid containers (grid-template-columns with 2 tracks / flex rows w/ a fixed sidebar) and
   make them `1fr` / `flex-direction: column` on mobile.

2. **Page body lacks horizontal padding (gutter) on mobile** — the page `<h1>`, descriptions, and section
   content are glued to the screen's left/right edges (confirmed on FinanceIntel + Data Explorer), while
   the sticky top chrome has padding. → ensure the main content wrapper has a consistent mobile gutter
   (e.g. padding-inline) so nothing touches the edges.

3. **Stat / metric strips are oversized and labels get cut off on mobile** — confirmed on **Agent Team**
   (the stat grid: huge icons/numbers, and the "MODELS" label is truncated to "MOD…", "129/140 free" wraps
   awkwardly). Same risk on FinanceIntel/Admin/Cost stat rows. → responsive stat sizing on mobile: smaller
   number/icon, allow label to wrap (don't truncate), tighter vertical rhythm; make the stat strip a clean
   2-col (or 1-col) grid that fits 390px without clipping.

4. **Sub-44px touch targets on mobile** — many `span.sortable-th-arrow` (sort carets), section tabs, and
   `span.pill` are < 40px (Models 25, Agent Team 23, FinanceIntel 10, Gateway 7, Governance 5). → extend
   the existing coarse-pointer CSS (`@media (pointer: coarse)`) so interactive controls (sort headers,
   tabs, pills that act as filters/links) meet ≥44px hit area — without bloating desktop density.

5. **Wide many-column data-tables on 390px** — Models/Agent-Team/Governance/Content-Health tables are the
   widest element. Verify each `.data-table` sits in a horizontal-scroll wrapper on mobile (so all columns
   are reachable by swiping) OR collapses sensibly. If a table currently squishes/clips columns, wrap it in
   an `overflow-x:auto` container on mobile. Don't break the desktop layout.

## How to run it (screenshot-driven)
- Use Playwright with the iPhone 15 Pro device profile, `x-operator-token` header, `tib-theme` set to both
  `light` and `dark`. Capture full-page screenshots of at least: `/ /admin /insights /models /cost
  /agent-team /finance-intel /settings /incidents /governance /infra /data-explorer /builder /gateway
  /content-health` before and after. Iterate until the 5 issue classes above are visibly resolved in BOTH
  themes at 390px.
- Prefer SHARED fixes (globals.css media queries + shared layout classes). Only touch a specific page file
  when the markup itself needs a responsive class.

## Validate + document
- `bun run typecheck` clean; `bun run build` ok. No new deps. Append to BUILD_LOG.md with before/after notes.
- Confirm desktop (1440px) is UNCHANGED for a few pages (don't regress desktop density).

## Rules
Do NOT `git commit`/push/restart/`systemctl`. Do NOT touch `/opt/newsbites`. Do NOT modify
`package.json`/`tsconfig.json`/`bun.lock`. app + CSS ONLY. Both themes; iPhone 390px is the target. Don't
regress desktop. Finish clean, tree green.
