# /infra — Product Plan
> One-line: the infrastructure operations console for operators who need host, service, GPU, Vast, timer, backup, tunnel, and remediation controls without SSH.

## 1. Today (verified, with file:line)
- Frontend route: `/infra` renders `InfraPage` in dashboard layout at `app/App.tsx:130` and `app/App.tsx:131`; nav marks it core at `app/lib/navRegistry.ts:26`.
- Sidebar/header copy: sidebar labels it "Infra" at `app/components/DashSidebar.tsx:68`; header says "Hetzner · Vast · GPU · services" at `app/components/DashHeader.tsx:16`.
- Data polling: `InfraPage` fetches `/api/infra` every 30s and owns service restart plus timer run actions at `app/routes/InfraPage.tsx:28` through `app/routes/InfraPage.tsx:32`.
- Current UI: it renders Hetzner memory/disk/load, GPU tunnel, Vast instance/account/runway, remote host stats, services, and timers at `app/routes/InfraPage.tsx:76` through `app/routes/InfraPage.tsx:221`.
- Confirmed service/timer modals exist: service restart and timer run-now use `ConfirmModal` at `app/routes/InfraPage.tsx:49` through `app/routes/InfraPage.tsx:73`.
- Service controls: every listed service/container gets a restart button at `app/routes/InfraPage.tsx:166` through `app/routes/InfraPage.tsx:185`.
- Timer controls are partial: the UI only shows run-now buttons for `model-health-check` and `mimule-backup` at `app/routes/InfraPage.tsx:207` through `app/routes/InfraPage.tsx:214`.
- Backend handler: `/api/infra` concurrently reads host stats, service status, timers, Vast instance/account, GPU health file, and Vast host JSON at `server/api/infra.ts:15` through `server/api/infra.ts:77`.
- System adapter: services are hardcoded systemd units plus Docker containers at `server/adapters/system.ts:8` through `server/adapters/system.ts:18`, status is read via `systemctl` and `docker inspect` at `server/adapters/system.ts:20` through `server/adapters/system.ts:64`, and timers are hardcoded at `server/adapters/system.ts:118` through `server/adapters/system.ts:152`.
- Vast adapter: instance data comes from `vastai show instances`, account data from Vast API using `/root/.config/vastai/vast_api_key`, and GPU util from `/var/lib/mimule/gpu-health.json` at `server/adapters/vast.ts:47` through `server/adapters/vast.ts:154`.
- Mutations: service/container restart and run-timer endpoints are mounted at `server/api/router.ts:1020` through `server/api/router.ts:1029`; handlers audit service restarts at `server/api/actions.ts:410` through `server/api/actions.ts:494` and timers at `server/api/actions.ts:496` through `server/api/actions.ts:548`.
- Insights integration exists: service down, disk pressure, memory pressure, GPU unavailable, and stale model discovery map to `/infra` or related pages at `server/insights/scanners/ops.ts:45` through `server/insights/scanners/ops.ts:123`.
- Readiness: 🟡 partial. The page uses real data and audited controls, but timer/service coverage is allowlist-limited, actions bypass durable jobs, and key CLI operations such as Vast reconcile, doctor-log rotation, cloudflared restart health, and backup freshness are not first-class.

## 2. Gaps, mock & broken parts
- Timer GUI coverage does not match discovered timers: `KNOWN_TIMERS` lists seven timers at `server/adapters/system.ts:118` through `server/adapters/system.ts:126`, but the UI only enables two names at `app/routes/InfraPage.tsx:207` through `app/routes/InfraPage.tsx:214`.
- Timer backend allowlist is only two timers at `server/api/actions.ts:20`, so action descriptors disable other visible timers as "not in the manual-run allowlist" at `server/api/actionDescriptors.ts:158` through `server/api/actionDescriptors.ts:175`.
- Service restarts execute synchronously and do not create durable jobs: `infraServiceRestartHandler` calls `systemctl restart` or `docker restart` directly at `server/api/actions.ts:419` through `server/api/actions.ts:467`.
- Timer run-now executes synchronously and does not create durable jobs at `server/api/actions.ts:518` through `server/api/actions.ts:533`.
- No Vast reconcile action: page shows Vast details at `app/routes/InfraPage.tsx:119` through `app/routes/InfraPage.tsx:160`, but only service restart/timer actions are wired at `app/routes/InfraPage.tsx:31` through `app/routes/InfraPage.tsx:32`.
- No explicit backup freshness, failed timer, cert/DNS/tunnel, or doctor-log size cards even though V5 calls them detector targets; current `/api/infra` response only includes hetzner, Vast, GPU, services, and timers at `server/api/infra.ts:40` through `server/api/infra.ts:70`.
- Source errors are coarse: `/api/infra` returns `sourceStatus` for hetzner/vast only at `server/api/infra.ts:72` through `server/api/infra.ts:75`, not per service, timer, GPU file, or Vast host sample.

## 3. Goal alignment (G1–G8)
- G1: make infra readable and stable under partial source failure, slow Vast API, missing JSON files, and failed system commands.
- G2: all routine infra ops need GUI controls: restart allowed services, run timers, run backup, run model health, restart cloudflared/vast-tunnel, run vast-reconcile, rotate doctor log, inspect logs.
- G3: all visible controls must execute, persist job status, and show output/audit.
- G4: detectors must cover service down/flapping, disk/memory pressure, GPU/tunnel down, Vast runway low, backup stale, failed timers, cert/DNS/tunnel health, doctor log growth, and stale host samples.
- G5: sort by severity and actionability; expose one health score and next best action.
- G6: safe actions such as log rotation and backup run-now can be auto or one-click; service restarts stay review-tier.
- G7: every infra finding shows AI root cause and recommended action before raw metrics.
- G8: sellable infra admin module: professional, dense, auditable, mobile usable.

## 4. Best-practice research
- Use an SRE service catalog pattern: each service has status, owner, dependencies, last deploy/restart, recent errors, actions, and linked runbook.
- Use golden signals: latency, traffic, errors, saturation for public services and gateway where available.
- Use action cards with impact previews: "what this restarts", expected downtime, dependencies, rollback, and recent audit.
- Use freshness badges for every source: systemd, Docker, GPU file, Vast API, timer metadata, backup path, DNS/cert probe.
- Use progressive risk: diagnostics/copy/log view are low risk; run timer/log rotate are medium/safe; service restarts and tunnel changes require confirmation/approval.
- Use topology: show dependency chain Cloudflare/Caddy -> services -> LiteLLM/GPU -> editorial pipeline so root cause is easier to see.

## 5. Target design
- Layout: top Admin Health / Infra Health band with failing services, saturated resources, GPU status, backup freshness, tunnel/cert status, and AI "State of Infra" line.
- Service catalog: grouped by public apps, AI/gateway, editorial pipeline, containers, and platform; each row shows status, uptime, last restart, recent events, dependencies, and actions.
- Resource section: host CPU/load/memory/disk, Vast host CPU/RAM/GPU/disk, GPU models/util, runway/cost, trends from `metric_samples`.
- Timer/maintenance section: all timers, active state, next run, last result, last duration, run-now eligibility, and failed timer insights.
- Actions: restart service/container, run timer, run backup, run model health, run vast-reconcile, restart tunnel, rotate doctor log, copy diagnostic command, open logs.
- Empty/error states: partial-source cards state exactly which source failed and how stale the last good sample is.
- Mobile parity: service/timer rows become cards; actions use icon buttons with labels/tooltips and 44px touch targets.
- AI before raw data: insight/health cards show likely cause and recommended action above gauges and command evidence.

## 6. Features to add (prioritized)
- MUST: Expand timer run-now to every allowlisted routine timer; acceptance: UI and backend allowlist match `KNOWN_TIMERS`, all run through executor/audit, unsupported timers explain why.
- MUST: Make infra actions durable jobs; acceptance: restart/run timer/vast-reconcile/log-rotate create `jobs` rows with output tail, status, actor, and audit link.
- MUST: Add Vast reconcile/tunnel controls; acceptance: GPU-down insight can Apply a review-tier action and `/infra` exposes the same action with confirmation.
- MUST: Add backup freshness and failed timer cards/detectors; acceptance: stale backup or failed timer appears on `/infra` and `/insights` with action or runbook.
- SHOULD: Add service dependency view and recent audit/job history per service; acceptance: clicking a service opens a drawer with dependencies, last 10 audits, and logs command.
- SHOULD: Add log rotation for doctor log; acceptance: oversized log creates insight and a safe rotate/gzip action.
- SHOULD: Add cert/DNS/cloudflared health probe; acceptance: failing cert/tunnel/DNS creates actionable infra insight.
- EXTRA: Delight: "maintenance timeline" showing timer runs, restarts, deploys, and incidents as event markers over resource graphs.

## 7. Sellable-in-parts
- Standalone module pitch: "AI Infrastructure Admin Center: service catalog, GPU/Vast operations, timers, backups, tunnels, AI diagnostics, and audited one-click remediation."
- Suite fit: `/infra` is the manual page and evidence source for many ops insights, feeds Incidents when critical, and writes Jobs/Audit for every action.
- Packaging boundary: standalone can integrate with systemd/Docker/Vast/Cloudflare/backups; in-suite it reuses adapters, insights, executor, jobs, metric samples, and audit.

## 8. Backend work
- Add or extend endpoints through `/api/actions/execute` for `start-job:service:<name>:restart`, `start-job:timer:<name>:run-now`, `start-job:vast:reconcile`, `start-job:doctor-log:rotate`, `start-job:backup:run-now`, `start-job:tunnel:cloudflared-restart`.
- Convert direct `infraServiceRestartHandler` and `infraRunTimerHandler` to job-backed execution or make them compatibility wrappers over executor.
- Add source freshness fields to `/api/infra`: `servicesCheckedAt`, `timersCheckedAt`, `gpuHealthCheckedAt`, `vastApiCheckedAt`, `backupLastRunAt`, `certExpiresAt`, `dnsStatus`.
- Prefer existing `jobs`, `metric_samples`, `events`, and `action_audit` tables; add small config tables only for service metadata/runbook/dependency mapping.
- Extend `server/insights/scanners/ops.ts` for Vast balance low, doctor-log-size, backup freshness, failed timer, cert/tunnel/DNS health, and stale sampler.
- Add pure tests for each detector and action allowlist mapping.

## 9. Build slices
- Slice 1: Align timer allowlists and UI in `server/adapters/system.ts`, `server/api/actions.ts`, `server/api/actionDescriptors.ts`, and `app/routes/InfraPage.tsx`.
- Slice 2: Wrap infra actions in durable jobs using `server/db/writer.ts`, with compatibility responses for existing buttons.
- Slice 3: Add backup/timer/log/tunnel/Vast fields to `server/api/infra.ts` and adapters; validate partial-source behavior.
- Slice 4: Add new ops detectors and tests in `server/insights/scanners/ops.ts`.
- Slice 5: Redesign `InfraPage` into service catalog, resource, maintenance, and topology sections; validate mobile and desktop screenshots.
- Documentation to update during implementation: `/root/DASHBOARD_V5_PLAN.md`, infra runbook, detector catalog, action allowlist docs, and service catalog ownership metadata.

## 10. Verification
- Current behavior citations are rechecked against `app/routes/InfraPage.tsx`, `server/api/infra.ts`, `server/adapters/system.ts`, `server/adapters/vast.ts`, and `server/api/actions.ts`.
- G1: partial source failures show clear stale/error states.
- G2/G6: all routine timers, backup, tunnel, Vast reconcile, log rotate, and service restarts are GUI actions with correct risk gating.
- G3: no visible action bypasses durable job/audit status.
- G4/G7: infra detector catalog fires and shows AI RCA before raw metrics.
- G5: default view orders critical failing services and SLA-risk maintenance first.
- G8: page works as a sellable infra module and links every action to Jobs/Audit/Insights.
