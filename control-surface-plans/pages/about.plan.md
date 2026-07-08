# /about — Product Plan
> One-line: the product/version, runtime, licensing, and upgrade-readiness page for operators and buyers.

## 1. Today (verified, with file:line)
- Frontend route: `/about` renders `AboutPage` (`app/App.tsx:172`-`app/App.tsx:174`); nav marks it labs and experimental (`app/lib/navRegistry.ts:44`).
- Data sources: the page fetches `/api/version` and `/api/home` on mount (`app/routes/AboutPage.tsx:26`-`app/routes/AboutPage.tsx:35`).
- Update action: it posts `/api/update-check` and stores `updateAvailable` in local state (`app/routes/AboutPage.tsx:37`-`app/routes/AboutPage.tsx:45`).
- UI shows version, commit, build time, platform, node env, install paths, SQLite path, uptime, and memory (`app/routes/AboutPage.tsx:66`-`app/routes/AboutPage.tsx:149`).
- Backend `/api/version` optionally refreshes cached update info and returns `getVersionInfo()` plus update data (`server/api/router.ts:573`-`server/api/router.ts:578`).
- Backend `/api/update-check` is mutation-protected and refreshes update data (`server/api/router.ts:579`-`server/api/router.ts:584`).
- Current readiness: 🧪 labs; useful diagnostics exist, but content is sparse, partly stale, and not positioned as a professional product/about surface.

## 2. Gaps, mock & broken parts
- Install paths are hard-coded to `tib-builder` locations (`app/routes/AboutPage.tsx:111`-`app/routes/AboutPage.tsx:129`), which does not match the control-surface service path described in the system overview.
- Errors while loading version/home are swallowed and only stop loading (`app/routes/AboutPage.tsx:26`-`app/routes/AboutPage.tsx:35`); there is no visible degraded state.
- The page does not show license status even though `/api/licensing/status` exists and Settings consumes it (`server/api/router.ts:1358`-`server/api/router.ts:1362`, `app/routes/SettingsPage.tsx:176`-`app/routes/SettingsPage.tsx:178`).
- No links to docs/tutorials even though `/api/docs/tutorials` is registered (`server/api/router.ts:1391`-`server/api/router.ts:1392`).
- No audit/support bundle export; operators cannot send a concise diagnostic bundle from this page.
- Cross-page blocker to call out: About should not claim settings durability until `/settings` persistence is fixed (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: accurate version/runtime diagnostics and visible degraded states.
- G2: update check, diagnostic bundle, license refresh, and support export from GUI.
- G3: remove stale hard-coded install paths and source everything from real runtime/config APIs.
- G4: surface missing license, update drift, DB disabled, and unsupported runtime as insights.
- G5: make support facts findable in one place: version, commit, DB, license, services, docs.
- G6: safe checks run automatically; export/update-check are one-button audited actions.
- G7: AI support summary explains likely issue and next action before raw diagnostics.
- G8: sellable product identity and support page, not just internal metadata.

## 4. Best-practice research
- Admin-center product pages should connect health, history, and support communications; Microsoft service health patterns are a useful reference: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- OWASP logging practices support diagnostic bundles that include enough event attributes but redact sensitive values: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Grafana dashboard best practices favor clear purpose, links, and reusable context so users know what a page is for: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/

## 5. Target design
- Layout: product header with version/license/update status, runtime health cards, environment paths, docs/support links, diagnostic bundle, and changelog.
- Components: `VersionCard`, `LicenseCard`, `RuntimeCard`, `StorageCard`, `SupportBundleButton`, `DocsLinks`, `ChangelogPanel`.
- Empty/error states: if `/api/version` or `/api/home` fails, show a degraded diagnostic card and link to `/status` and `/insights`.
- Mobile parity: cards stack; long paths truncate with copy buttons and accessible labels.
- AI reasoning appears as "Support summary": what changed recently, whether runtime is healthy, and what action to take.
- Actions: update check, generate support bundle, refresh license, and copy diagnostics are single-button, audited when mutating or exporting.

## 6. Features to add (prioritized)
- MUST: replace hard-coded install paths with backend runtime paths; acceptance: values match `/opt/opencode-control-surface`, DB path, service name, and config locations.
- MUST: add visible error/degraded state for failed version/home loads.
- MUST: add license status and docs/tutorial links.
- SHOULD: add diagnostic bundle export with redaction; acceptance: includes version, runtime, route registry, recent errors, audit chain status, DB status, and no secrets.
- SHOULD: add changelog/update detail drawer.
- EXTRA: "copy support summary" generated by AI with source facts and redactions.

## 7. Sellable-in-parts
- Standalone pitch: "Self-hosted AI admin-center support and upgrade readiness page."
- Suite fit: it anchors product identity, licensing, support, docs, and diagnostics across all modules.
- It should link to `/status` for public health, `/settings` for configuration, `/audit` for chain state, and `/install` for first-run completion.

## 8. Backend work
- Add or expand `/api/about` to aggregate version, runtime paths, DB path, service name, license, update status, docs links, audit chain status, and last deploy/update event.
- Add `POST /api/about/support-bundle` as an audited export action with redaction.
- Reuse `getVersionInfo`, `homeHandler`, `getActiveLicense`, audit chain status, and docs handler.
- Add detector for update drift/license expiry/support bundle failure if useful.

## 9. Build slices
- Slice 1: `/api/about` aggregator and tests.
- Slice 2: redesign `app/routes/AboutPage.tsx` around real runtime data and error states.
- Slice 3: support bundle export + audit.
- Slice 4: docs/changelog/license integration.
- Validation: `bun run typecheck`, API tests, browser smoke for loading/error/update/export.
- Documentation to update: support bundle contents, product install paths, `/root/DASHBOARD_V5_PLAN.md` Phase 10 promotion status.

## 10. Verification
- `/about` shows accurate control-surface paths and service identity from backend data.
- Failed `/api/version` or `/api/home` does not silently hide errors.
- License, docs, update, DB path, uptime, memory, and audit chain status are visible.
- Support bundle export redacts secrets and writes an audit row.
- AI support summary cites facts and links to source pages.
- Mobile view handles long paths and copy buttons cleanly.
