# Control Surface — UX / Styling Remediation Pass (Phase 6, operator-directed 2026-07-01)

Operator walked the live UI and gave a detailed brief. This is the authoritative capture. Every item
below is a real, operator-observed defect. Verify each fix with BEFORE/AFTER screenshots in BOTH
light and dark themes (operator uses light mode; Claude audited in dark — several bugs are theme-independent).

Standing rules: Claude never edits directly — dispatch to a coder (codex primary), Opus verifies
independently → commit → restart → live-verify → advance (full-auto per feedback_v5_full_auto_drive).
Never touch /opt/newsbites; no config/lockfile contamination; server+app only.

---

## PART A — THE GLOBAL TABLE STANDARD (applies to EVERY table in the app)
> Operator, verbatim: **"ALL TABLES MUST HAVE THE SAME BEHAVIOUR."**

Every table across the product must support, via ONE shared component/hook (extend the existing
`app/hooks/useTableControls.ts` + `app/components/TableControls.tsx`; do NOT fork per-page):
1. **Collapsed + paginated** with a **user-selectable page size** (e.g. 10 / 25 / 50 / 100) — never dump
   the whole dataset.
2. **Orderable** — clickable column headers, asc/desc/none sort.
3. **Filterable + searchable** — global search box + column/faceted filters where it helps.
4. **Row expand / detail reveal** — clicking a row (or a "details" affordance) reveals detail through a
   **VISIBLE** mechanism: inline expand-under-the-row, a side drawer, a modal/pop-up, OR force-scroll to
   the section. **NEVER silently render detail the user may not notice** (operator, verbatim). Pick a
   sensible default per table (inline expand for light detail, drawer for rich detail).
5. **Cell padding + borders + density** — text must NOT be glued to the left border; consistent padding,
   visible row/column separation, no bland borderless tables.
6. **Per-row actions** surfaced where relevant (Builder/Doctor/etc. currently show 0 actions).

Build the standard first, apply to the 3 worst offenders (Data Explorer, Traces, Gateway) as the proving
ground, then sweep the remaining ~29 raw-`<table>` pages onto it in batches.

---

## PART B — PER-PAGE ITEMS (operator brief, 2026-07-01)

- **Traces** (`/traces`): table too long; bottom tables too congested; clicking an event shows detail but
  it's very hard to see. → apply table standard; event-click opens a VISIBLE detail (drawer/expand),
  never silent.
- **LiteLLM** (`/litellm`): long-standing **congestion within the boxes** → fix box layout/spacing.
- **FinanceIntel** (`/finance-intel`): looks bad; provides **no functionality/insight/reports** of what
  the agent did, its findings, and why. → add real agent-activity/findings/reasoning content; keep the
  table but attach per-row details behind a click-to-expand (expand/sidebar/pop-up) so it never congests.
- **Scout** (`/scout`): header icons **misplaced**; "Statistics" and "Last updated" **congested** → put
  Statistics on the LEFT, "Last updated" + refresh button on the RIGHT; fix icon alignment.
- **Content Health** (`/content-health`): very **bland**; search-bar text too long so the **search icon
  renders on top** (overlap bug); **0 borders** on the table. → fix the search input, add borders,
  de-bland.
- **Reports** (`/reports`): bland, **no borders**; reports not rich, not easy to read. → richer, readable
  reports + **export templates**: each report producible as a **PowerPoint slide / Word / PDF** in simple
  natural language, with charts/tables/findings. (Own slice — needs export libs.)
- **Data Explorer** (`/data-explorer`): bad column **sizing** (some columns too long → cut off
  everything); **ID and domain stacked on top of each other**; **plain_summary too large & vertically
  stacked** → hard to read. → apply table standard; collapse long fields into click-to-expand detail;
  fix column widths.
- **Gateway** (`/gateway`): recent-calls table → apply table standard (collapse/expand/filter/order/search).
- **Builder** (`/builder`): tables are collapsed but with **0 actions, not filterable, not orderable, not
  expandable** (can't choose page size); **plan-candidates table isn't even collapsed**. → apply table
  standard to BOTH.
- **Access & Policy** (`/governance`): bland; **not enough info/controls**; the **Save button when adding
  a budget is badly styled**; all table text is **congested / glued to the left-most border**. → padding,
  borders, richer controls/content, restyle the Save button.
- **Agent Team** (`/agent-team`): styling pass — easier to look at & extract info; **more animation, more
  images/shapes/dynamic infographics**.
- **Incidents** (`/incidents`): the **write text-boxes are not visible**; page risks being too big; want an
  **AI-suggested post-mortem note** offered when the user Acknowledges; add **pagination** so it doesn't
  load too many results.
- **Settings** (`/settings`): **0 controls / 0 customization / 0 actions**, very bland; **tabs are plain
  text but are actually navigation items** → style tabs as nav; add real controls.
- **Doctor** (`/doctor`): decision log **too long / too many items** → apply table standard.
- **Today** (`/today`): the **workload table is too big** → apply table standard.

## PART C — CARRIED FROM CLAUDE'S 2026-07-01 AUDIT (related; confirmed in code)
- **DashHeader eyebrow bug**: `app/components/DashHeader.tsx` `PAGE_META` covers only ~14 routes; ~20+
  pages (`/security`, `/audit`, `/governance`, `/cost`, `/traces`, `/jobs`, `/feature-flags`,
  `/compliance`, `/gateway`, `/channels`, `/reports`, `/agents`, `/agent-team`, `/today`, `/scout`,
  `/pipeline`, `/workflows`, `/finance-intel`, `/content-health` …) fall back to the wrong
  "Operations / Live stack telemetry" title/subtitle. → derive header meta from the nav registry (single
  source of truth) so it can never drift. (Confirmed in the operator's own Security screenshot.)
- **Section-header icon alignment**: shared section-header renders the icon ABOVE the title on some pages
  (Scout, Governance shield) instead of inline — fix the shared component.
- **Models table**: LOGICAL model column crushed to ~60px / 3-line wrap while other columns waste width;
  truncated headers (LOGICAL…, PROVIDE…, LATENCY…). Covered by table standard + column-width rebalance.
- **Infra disk bar**: MEMORY bar renders, DISK bar at 93% appeared absent — verify + fix.

---

## SEQUENCING (each slice: dispatch → Opus verify (typecheck/build/tests + before/after shots both
## themes) → commit → restart → live-verify → advance)
1. [x] **Slice 1 — Table Standard** (foundation): extend `useTableControls` + `TableControls` with page-size
   selector, column sort, faceted filter, and row-expand/detail-reveal; shared CSS for padding/borders/
   density. Apply to **Data Explorer + Traces + Gateway** as the proving ground.
2. [x] **Slice 2 — Global header polish**: DashHeader nav-registry meta fix + shared section-header icon
   alignment. (Low-risk, every page benefits, fixes Scout/Security/Audit/etc. titles.)
3. [x] **Slice 3 — Table sweep batch 1**: Builder tables, Doctor decision log, and Today workload table
   now use the shared table standard with search, sort, pagination, page-size selection, and visible row detail.
4. [x] **Slice 4 — Table sweep batch 2 (scoped by `_NEXT.md`)**: Cost's five tables now use the shared table
   standard; Content Health uses `.data-table` with borders/search controls and a stronger queue panel; Models
   has a readable logical-model column, full headers, and text-based pricing indicators. Audit and Jobs were
   named in the older broad line but were not in the authoritative `_NEXT.md` scope and remain pending.
5. [x] **Slice 5a — Per-page style (concrete)**: Access & Policy padding + Save-button restyle
   + richer controls; Settings controls + nav-tab styling; Infra disk bar; LiteLLM box congestion.
6. [x] **Slice 5b — Per-page CONTENT** (operator 2026-07-01: "show what the agent actually did"): FinanceIntel
   = real agent activity (run history, findings + WHY expandable, source links); Agent Team = roster cards
   w/ live status + animated activity/dynamic infographics. Design from existing data; no fake content.
7. **Envelope fix pt.2**: wrap the 4 remaining bare endpoints (`/api/product-health`, `/api/reasoner/jobs`,
   `/api/reasoner/diagnoses`, `/api/reasoner/incidents`) in `{data}` — DashHome widgets. (pt.1 = `58817ee`.)
8. **Also pending (deferred from broad line)**: Audit/Jobs table sweep — apply the standard for consistency.
9. [x] **Slice 6 — Incidents**: pagination + visible write inputs + AI-suggested post-mortem on Acknowledge.
10. **Slice 7 — Reports export** (operator: "all three now"): PPTX + Word + PDF templates in natural
    language w/ charts/tables/findings. NOTE: the ONLY slice allowed to add export deps
    (package.json/bun.lock) — spell out that exception in its _NEXT.md.
11. [~] **Slice 8 — Mobile style pass** (operator: "a lot of style issues especially with mobile view"):
    Opus's 19-route iPhone 15 Pro screenshot audit found 5 issue-classes (2-col grids not collapsing, missing
    page gutter, oversized/truncated stat strips, sub-44px sortable-th targets, wide tables). Sonnet 5 fixed the
    root cause of each at the shared-CSS/component level (Data Explorer inline-style grid, FinanceIntel's missing
    `dash-page` class, Agent Team's `MiniMetric` grid mis-placement, coarse-pointer `.sortable-th` padding) —
    see BUILD_LOG.md 2026-07-01 17:22 UTC for the full root-cause writeup. `bun run typecheck` + `bun run build`
    clean. **Not yet [x]**: Opus still owns before/after mobile screenshot verification (both themes, 390px) per
    the division of labor in `_NEXT.md`, plus commit/restart/live-verify.

## PARKED (not dropped)
- **Self-learning remediation loop** (AI troubleshooter/resolver authors a fix the first time, captures it
  as a reusable script keyed to the finding signature, "Apply" replays it or invokes the resolver, with
  revert + "didn't work" feedback that re-engages the resolver). Revisit after the styling pass. See the
  2026-07-01 conversation for the full spec + the architecture mapping.
