# /status — Product Plan
> One-line: the public, plain-English health page for customers and external stakeholders.

## 1. Today (verified, with file:line)
- Frontend route: `/status` is public-layout, outside the authenticated dashboard shell (`app/App.tsx:70`-`app/App.tsx:83`); nav marks it hidden (`app/lib/navRegistry.ts:52`).
- The page fetches `/api/public-status` with `cache: "no-store"` and polls every 30 seconds (`app/routes/StatusPage.tsx:111`-`app/routes/StatusPage.tsx:125`).
- UI shows headline, summary, health score, uptime, last check, agent liveness chips, and footer copy (`app/routes/StatusPage.tsx:152`-`app/routes/StatusPage.tsx:193`).
- Backend `/api/public-status` is intentionally unauthenticated (`server/api/router.ts:406`-`server/api/router.ts:407`).
- Backend reads sentinel health from `/var/lib/mimule/product-health.json` unless overridden (`server/api/status.ts:3`-`server/api/status.ts:39`), maps score to operational/degraded/down (`server/api/status.ts:50`-`server/api/status.ts:54`), reads uptime from `/proc/uptime` (`server/api/status.ts:41`-`server/api/status.ts:48`), and returns `services: []` (`server/api/status.ts:78`-`server/api/status.ts:85`).
- Current readiness: 🧪 labs/hidden; the page is stable and public, but too thin for a trustable customer status page.

## 2. Gaps, mock & broken parts
- `services` is always an empty array (`server/api/status.ts:24`-`server/api/status.ts:26`, `server/api/status.ts:78`-`server/api/status.ts:85`), so service-level status is not surfaced.
- Status comes only from sentinel product-health, not the V5 unified Admin Health Score or insights engine (`server/api/status.ts:73`-`server/api/status.ts:86`).
- There is no incident history, maintenance window, subscriber update, or component detail.
- Public copy says the team has been notified for major outage (`app/routes/StatusPage.tsx:22`-`app/routes/StatusPage.tsx:25`), but no channel/audit evidence is linked.
- Agent liveness is the only component list (`app/routes/StatusPage.tsx:179`-`app/routes/StatusPage.tsx:188`).
- Cross-page blocker to call out: public status should not expose or rely on unpersisted settings until `/settings` config persistence is fixed (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: public page must always render, even when backend data is partial.
- G2: maintenance posts, incident updates, and component visibility managed from GUI.
- G3: no empty component arrays disguised as status; every component comes from real checks.
- G4: public-impacting detections automatically update component status and incident history.
- G5: plain-language headline, component list, timeline, and current incident are obvious.
- G6: safe public updates can auto-post from verified incidents; manual public updates use one Apply.
- G7: internal AI reasoning produces public-safe summaries before publishing.
- G8: credible public trust page for a sellable suite.

## 4. Best-practice research
- Microsoft 365 service health exposes current health and recent incident/advisory history for affected tenants: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- Incident communication readiness stresses knowing where to find relevant communications and reporting issues when not represented: https://learn.microsoft.com/en-us/services-hub/microsoft-engage-center/health/incident-readiness/ir-m365
- Google SRE golden signals provide the health basis for components: latency, traffic, errors, saturation: https://sre.google/sre-book/monitoring-distributed-systems/
- Grafana annotations support correlating outages, deploys, and incidents with health timelines: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/annotate-visualizations/

## 5. Target design
- Layout: public hero status, component health grid, current incident/maintenance card, 30-day incident history, uptime/latency summary, and timestamp.
- Components: `PublicComponentStatus`, `IncidentTimeline`, `MaintenanceBanner`, `PublicSafeSummary`, `SubscribeButton` if channels support it.
- States: no data = degraded with "last successful check"; backend down = static fallback if possible; stale sentinel = warn.
- Mobile parity: one-column component cards and timeline; no tiny chips as only state.
- AI reasoning appears internally first: draft public summary from root cause and impact, with secret redaction, then operator Apply or auto-publish only for low-risk resolved notices.
- Actions: status updates managed from `/incidents` or `/insights`, not direct public editing; manual public update is audited.

## 6. Features to add (prioritized)
- MUST: populate `services` with real components: Control Surface, NewsBites, LiteLLM Gateway, Autopipeline, Paperclip, Mimule/OpenClaw, GPU/Vast, Channels.
- MUST: define public-safe mapping from internal insights/incidents to public status components.
- MUST: add incident history and maintenance events from `events`/`insights`/`action_audit`.
- SHOULD: add Admin Health Score adapter that redacts private causes but reflects public impact.
- SHOULD: add GUI controls in `/incidents` or `/insights` for public update draft/apply.
- EXTRA: status subscription through `/channels` for email/Telegram/webhook stakeholders.

## 7. Sellable-in-parts
- Standalone pitch: "Public trust and uptime page backed by AI-operated internal detections."
- Suite fit: it is the external face of `/insights`, `/incidents`, `/channels`, and `/reports`.
- It should remain hidden from authenticated nav unless a "Public status" link is shown in About/Status settings.

## 8. Backend work
- Expand `publicStatusHandler` to include components, incidents, maintenance, freshness, and public-safe messages.
- Add `public_status_components` config or derive from `system.ts`, product-health, gateway health, and insights.
- Add `POST /api/status/public-update` or integrate into incidents executor for audited public updates.
- Add redaction guard: no internal hostnames, secrets, stack traces, or raw evidence on public endpoint.
- Add cache headers appropriate for public polling and optional static fallback.

## 9. Build slices
- Slice 1: backend components and incident history in `server/api/status.ts`; tests for redaction and stale data.
- Slice 2: redesign `app/routes/StatusPage.tsx` with component cards and timeline.
- Slice 3: internal public-update draft/apply flow from incidents/insights.
- Slice 4: subscriptions through `/channels`.
- Validation: `bun run typecheck`, public endpoint tests without auth, Playwright public page smoke.
- Documentation to update: public status policy, redaction rules, incident communication runbook, `/root/DASHBOARD_V5_PLAN.md` Phase 13 status.

## 10. Verification
- `/status` loads without auth and never exposes secrets.
- Components array is populated from real sources and reflects degraded/down states.
- Current incident and 30-day history render when internal events exist.
- Public status updates are either auto-safe or operator-approved and audited.
- Stale data is visibly marked with last successful check time.
- Mobile view has readable component cards and timeline.
