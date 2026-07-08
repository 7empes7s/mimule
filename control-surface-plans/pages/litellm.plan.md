# /litellm — Product Plan
> One-line: the LiteLLM proxy configuration and health evidence page for platform operators managing the underlying AI gateway proxy.

## 1. Today (verified, with file:line)
- Frontend: `/litellm` is registered in `app/App.tsx:124` and imports `LiteLLMPage` at `app/App.tsx:23`; navigation marks it `advanced` and `experimental` in `app/lib/navRegistry.ts:47`. Current readiness: 🟡 partial, useful but mostly read-only.
- `LiteLLMPage` fetches authenticated status, routing, and config endpoints in `app/routes/LiteLLMPage.tsx:78`, `app/routes/LiteLLMPage.tsx:79`, `app/routes/LiteLLMPage.tsx:80`, and `app/routes/LiteLLMPage.tsx:81`.
- The page exposes a restart modal that uses `/api/actions/execute` with `start-job:service:litellm:restart` in `app/routes/LiteLLMPage.tsx:82`, `app/routes/LiteLLMPage.tsx:111`, `app/routes/LiteLLMPage.tsx:123`, and `app/routes/LiteLLMPage.tsx:124`.
- It displays service/proxy/model/fallback cards, service status, fallback chains, configured models, and a redacted config block in `app/routes/LiteLLMPage.tsx:171`, `app/routes/LiteLLMPage.tsx:188`, `app/routes/LiteLLMPage.tsx:221`, `app/routes/LiteLLMPage.tsx:237`, and `app/routes/LiteLLMPage.tsx:269`.
- Backend routes are mounted at `server/api/router.ts:760`, `server/api/router.ts:761`, `server/api/router.ts:762`, and `server/api/router.ts:763`.
- `server/api/litellm.ts` treats `/etc/litellm/config.yaml`, `/etc/litellm/litellm.env`, and `http://127.0.0.1:4000` as defaults in `server/api/litellm.ts:49`, `server/api/litellm.ts:50`, and `server/api/litellm.ts:51`.
- Status reads `systemctl show litellm.service` in `server/api/litellm.ts:115` and probes `/health` and `/v1/models` with the master key in `server/api/litellm.ts:273`, `server/api/litellm.ts:289`, `server/api/litellm.ts:291`, and `server/api/litellm.ts:292`.
- Config parsing is regex/string based, redacts obvious secret fields, counts models and fallback chains, and returns redacted YAML in `server/api/litellm.ts:137`, `server/api/litellm.ts:168`, `server/api/litellm.ts:191`, and `server/api/litellm.ts:201`.
- Routing and config endpoints return parsed model/fallback summaries and redacted config in `server/api/litellm.ts:318` and `server/api/litellm.ts:331`.

## 2. Gaps, mock & broken parts
- The page is still experimental in `app/lib/navRegistry.ts:47`, so it reads like a support tool rather than a stable part of the gateway product.
- The current UI has restart but no lighter-weight "reload config" action; restart is high-blast-radius and should not be the only GUI path for config refresh.
- Config parsing uses regex over YAML in `server/api/litellm.ts:168`, which can misread nested config or nonstandard YAML. A sellable product should parse with a YAML parser and preserve line-level evidence.
- There is no config diff/history, no validation before restart/reload, no route testing per logical model, and no drift detection between `/etc/litellm/config.yaml`, `/api/models`, and gateway runtime.
- The page shows backend model names from config in `app/routes/LiteLLMPage.tsx:246`; operator-facing actions and docs must still use logical model names only.
- Cross-module warning: `/cost` still contains mock Vast runway and recommendations in `server/api/cost.ts:332` and `server/api/cost.ts:478`, plus UI budget mock usage in `app/routes/CostPage.tsx:187`; LiteLLM cost evidence should flow through real gateway/cost tables.

## 3. Goal alignment (G1–G8)
- G1: make status and config parsing robust, clear about partial data, and safe on mobile.
- G2: routine LiteLLM operations must be GUI-able: health probe, validate config, reload config, restart only when needed, compare live models to config.
- G3: no fake proxy health; every status comes from systemd, proxy probe, config file, or gateway ledger.
- G4: detect proxy down, auth missing, config drift, missing fallback chains, invalid logical model, and stale pricing/catalog data.
- G5: position `/litellm` as "Proxy Config" under the Gateway/FinOps module, not a separate mystery page.
- G6: safe validation/probe can auto-run; reload/restart require Apply and audit.
- G7: show AI explanation before raw config when config drift or proxy health fails.
- G8: make it a professional proxy admin surface that supports the standalone gateway product.

## 4. Best-practice research
- Config-management pattern: validate before apply, show diff, require reason, keep version history, offer rollback, and distinguish reload from restart.
- LiteLLM proxy pattern: proxy management should include health, auth, virtual keys, budget/rate limits, spend tracking, and model routing evidence; this page should own config truth while `/gateway` owns runtime traffic.
- SRE pattern: service status, proxy health, error budget, recent restarts, and config deploy events should be shown together.
- Security pattern: redaction must be structured and conservative; never rely only on regex for secrets when parsing YAML.
- Observability pattern: config changes should appear as event markers on gateway latency/error/cost graphs.

## 5. Target design
- IA: Proxy Health, Config Validation, Routing Table, Fallback Chains, Config Diff & History, Actions.
- Header: service active state, proxy reachable, model count, fallback count, auth configured, last validated, last reload/restart.
- Config validation panel: parse errors, duplicate logical names, missing fallback targets, unknown providers, missing API key refs, unsafe backend names in operator docs.
- Routing table: logical name, provider, timeout, fallback count, live `/v1/models` availability, last gateway call, cost tier, key allowlist usage.
- Redacted config remains, but as evidence beneath validation and diff.
- AI first: if unhealthy, top panel says root cause and recommended action before showing systemd/config details.
- Actions: Probe proxy auto-refresh; Validate config is safe; Reload config is review-tier; Restart is high-risk review-tier with reason, impact, and audit link.
- Empty/loading/error: distinguish service unknown, config missing, master key missing, health endpoint failed, and DB unavailable.

## 6. Features to add (prioritized)
- MUST: Replace regex YAML parsing with structured YAML parsing; acceptance: nested config and quoted values parse correctly, secrets remain redacted.
- MUST: Add config validation endpoint and UI; acceptance: invalid config produces actionable errors before restart/reload.
- MUST: Add audited reload action separate from restart if LiteLLM supports it; acceptance: operator can reload config without full restart where available.
- MUST: Add config drift detector; acceptance: `/insights` fires when config model count/fallbacks disagree with gateway runtime or `/api/models`.
- SHOULD: Add config history/diff using `system_configs`/`config_changes` or file snapshot table; acceptance: last N changes and rollback hint visible.
- SHOULD: Add per-model test action; acceptance: logical model probe returns status, latency, token usage, and trace/ledger row.
- SHOULD: Add event markers to `/gateway` and `/traces` for reload/restart/config changes.
- EXTRA: Add "explain this config" AI summary for complex fallback chains and cost risks.

## 7. Sellable-in-parts
- Standalone pitch: "A LiteLLM proxy admin center that validates routing config, proves live health, reloads safely, and ties every proxy change to gateway traffic and spend."
- Buyer value: platform engineers can manage proxy reliability without SSH, while keeping secrets redacted and changes auditable.
- Suite fit: `/litellm` is the proxy evidence layer behind `/gateway`; `/models` uses logical names; `/cost` uses ledger/cost events; `/audit` proves changes.

## 8. Backend work
- Add `GET /api/litellm/validation` returning parsed YAML, errors, warnings, and model/fallback drift.
- Add `POST /api/litellm/reload` through `server/api/execute.ts` or an action descriptor; fallback to restart only if reload unsupported and communicate that clearly.
- Add `POST /api/litellm/probe-model` for logical model probes via proxy/gateway with trace ID.
- Add config snapshot/diff storage; prefer existing `system_configs`/`config_changes` if this is metadata, or add `litellm_config_snapshots` if full redacted snapshots are needed.
- Add detectors in `server/insights/scanners`: proxy unreachable, auth missing, config drift, invalid fallback target, pricing catalog stale.
- Documentation to update during implementation: LiteLLM operator docs, logical model docs, action catalog, `/root/DASHBOARD_V5_PLAN.md`, and runbook for reload vs restart.

## 9. Build slices
- Slice 1: Structured parser and validation endpoint in `server/api/litellm.ts`; validate with new unit tests against representative YAML.
- Slice 2: Validation UI above raw config in `app/routes/LiteLLMPage.tsx`; validate loading/error/mobile states.
- Slice 3: Reload action descriptor and confirm UX; validate audit rows and no service restart unless explicitly selected.
- Slice 4: Config drift detector and insights link; validate scanner tests and deep-link to `/litellm`.
- Slice 5: Per-model probe and event markers; validate ledger/trace creation and gateway linkbacks.

## 10. Verification
- Config parser handles real `/etc/litellm/config.yaml` structure and redacts secrets.
- Invalid fallback target or missing key creates a clear validation warning and optional insight.
- Reload/restart actions require auth, reason, confirmation, and create audit rows with rollback hints.
- `/litellm` shows AI reasoning before raw config for unhealthy proxy states.
- Logical names are used in operator-facing controls and docs; backend names stay as evidence only.
- `bun run typecheck`, `server/api/litellm.test.ts`, ephemeral smoke for `/api/litellm/status`, `/api/litellm/routing`, `/api/litellm/config`, and Playwright desktop/mobile checks pass.
- Documentation explains validation, reload, restart, redaction, and relation to `/gateway`.

