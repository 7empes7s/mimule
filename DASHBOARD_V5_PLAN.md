# Control Surface V5 — "Admin Center" Plan (Extended)

> Canonical, findable copy on `master`. Same plan previously drafted as `DASHBOARD_V4_PLAN.md` on branch `plan/control-surface-v4`. References to "V4 Phase-0" below denote the security/stability hardening folded into Phase 1.

Last updated: 2026-06-28 UTC (extended census + IA + new phases 7–17 from research)

## Operator goals (the bar every phase is measured against)

- **G1 — Usable & stable.** No crashes, no dead pages, no "labs" surfaces that look broken.
- **G2 — Controllable via GUI.** Everything works and fits; no SSH/CLI required for any routine op.
- **G3 — Complete.** Every feature actually works (no mock data behind a real-looking page), plus extras.
- **G4 — Detects everything, including the unknown.** Detection catches every meaningful failure *and discovers every AI system running on the host/services — even ones nobody registered* (rogue model endpoints, stray agents, untracked CLIs, shadow API keys). Nothing AI-shaped runs on the box without the admin center seeing it.
- **G5 — Findable, readable, actionable.** One obvious place; severity-sorted; plain-language; one-click action.
- **G6 — Prefer automatic, fall back to a single Apply button.** Manual actions are always GUI-able; safe ones self-heal.
- **G7 — AI reasoning *before* insights.** Every finding carries analysis (root cause + recommended action) before the operator reads it.
- **G8 — An actual admin center.** M365-admin-center-but-smarter, not a status board.
- **G9 — Zero-config, works in ANY environment.** Holistic and as-advertised the moment it is installed: **no hardcoded host inventory.** Every module auto-discovers its own domain assets on a fresh machine (services, containers, model backends, spend sources, secrets, AI CLIs), surfaces what it found, and degrades gracefully where a given asset is absent — so the product is genuinely sellable, whole or in parts, into a customer's environment, not just tuned to this VPS.

Each phase below is tagged with the goals it advances, e.g. `(G4, G6)`.

> **Cross-cutting mandate (applies to every phase, page, and detector):** the surface must be **environment-agnostic**. The current detection is hardcoded to MIMULE's inventory (`server/adapters/system.ts:9–18` lists `newsbites`/`litellm`/`vast-tunnel`/`openclaw_gateway`/`paperclip`…). That makes it blind anywhere else. Replace hardcoded inventories with **discovery + a registry**: scan the host, find everything, let the operator register/confirm. See **Capability X — Universal AI Discovery & Zero-Config Inventory** below; it is a prerequisite lens on Phases 4, 5, 7, 12, 16, 17.

---

## X. Capability — Universal AI Discovery & Zero-Config Inventory (G4, G9) — *foundational, cross-cutting*

**Problem.** Detection today only "sees" a hardcoded list (`server/adapters/system.ts:9–18`, `:120–125`, `DOCKER_CONTAINERS` at `:18`). Drop the product onto any other machine and it reports "all clear" while AI systems run unseen. For a holistic, sellable, as-advertised product this must invert: **discover first, then let the operator register.**

**The model: discover → flag → register → manage (like CSPM / asset-inventory / MDM enrollment).**

1. **Discovery scanners** (`server/discovery/`, feeding the insights engine as a detector family) — read-only host probes, each fail-isolated, no hardcoded names:
   - **Processes** — scan `/proc/*/cmdline` (and `ps`) for AI signatures: `ollama`, `vllm`, `llama.cpp`, `litellm`, `python -m ...`, node AI servers, `codex`, `claude`, `gemini`, `opencode`, agent runners, MCP servers.
   - **Listening ports** — `ss -ltnp` → flag ports speaking model APIs (probe `/v1/models`, `/api/tags`, `/health`) to fingerprint OpenAI-compatible / Ollama / TGI / custom gateways.
   - **systemd units** — `systemctl list-units --type=service` → units whose exec/name match AI signatures (not a fixed allowlist).
   - **Containers** — `docker ps --format` + image inspect → AI images (ollama, vllm, text-generation-inference, langflow, n8n, etc.).
   - **Model backends & gateways** — enumerate any reachable OpenAI-compatible base URLs (env, LiteLLM config, `~/.config`), list their models.
   - **AI CLIs & agents** — `PATH` scan for `claude`/`codex`/`gemini`/`opencode`/`aider`/`ollama`/`llm`… + their config/auth files.
   - **Credentials / shadow keys** — detect AI-provider API keys in env, `.env`, dotfiles, configs (report *presence + location*, never the secret value) → ties into Security Center.
   - **Cron/timers** — scheduled jobs invoking AI tools.
2. **Inventory store** — a `discovered_assets` table (id, kind, signature, source-probe, first/last-seen, status=`unregistered|registered|ignored`, fingerprint JSON). Engine reconciles each scan against it; **new** unregistered AI assets raise a finding `unregistered-ai-system` (severity by exposure: a publicly-listening unauthenticated model endpoint = high/critical).
3. **Register-from-discovery flow (G2, G6)** — every flagged asset gets a one-click **Register** in the GUI: confirm name/kind/owner/criticality, optionally attach to a service/tenant, and it becomes a first-class managed asset (monitored, governed, costed). **Ignore** (with reason) and **Re-scan now** also one-click. No SSH, no editing `system.ts`.
4. **Zero-config bootstrap** — on first run in *any* environment, discovery populates the inventory and the rest of the surface (health score, cost sources, gateway backends, security exposure) builds off the discovered set, not a constant. The hardcoded `KNOWN_SERVICES`/`DOCKER_CONTAINERS` become *seed hints*, not the source of truth.

**Holistic application — every module inherits the discover-don't-assume principle:**
- **/insights & /security** — own the `unregistered-ai-system` + `exposed-model-endpoint` + `shadow-api-key` detectors and the inventory.
- **/governance & /governance/risk** — registered AI systems become governed assets (policy, ownership, risk scoring); discovery is what guarantees *complete* coverage for AI GRC.
- **/gateway & /models & /litellm** — discover reachable model backends/endpoints rather than reading only the local LiteLLM config.
- **/cost** — discover all spend sources (any provider key found, any GPU/host) instead of assuming Vast only.
- **/infra** — service/container list is the discovered set; unknown-but-running services are surfaced, not ignored.
- **editorial & CLI-console pages** — detect whether the pipeline / each CLI actually exists in this environment; render "not present / connect" instead of a broken page.

**Acceptance (G4, G9):** on a machine with an AI process/port/container the product has never been told about, within one scan cycle it appears on `/insights` (and `/security` if exposed) as an `unregistered-ai-system` finding with AI reasoning + a **Register** button; registering it makes it a managed asset everywhere; on a machine with *none* of MIMULE's services, no page crashes and every module shows an honest discovered-state (empty/connect), never mock or hardcoded data. → **Phase 4a (new): Universal AI Discovery & Inventory**, sequenced right after Phase 4; it is also a lens applied to Phases 5/7/12/16/17.

---

## 0. Reconciliation — plan vs. live codebase (read this first)

The original V5 draft was written against a stale mental model (`server/governance/engine.ts`, `src/pages/`). The live tree at `/opt/opencode-control-surface/` is much larger and the detection engine **already exists**. Build on it; do not fork a parallel system.

| Plan said | Reality on the VPS |
|---|---|
| Build `server/governance/engine.ts` + `detectors/*.ts` | The engine is **`server/insights/`** — `aggregate.ts`, `scheduler.ts`, `store.ts`, `scanners/*.ts`. Detectors are **scanners**. |
| Build `server/governance/ai.ts` | Already built: **`server/insights/ai.ts`** (signature-cached, `editorial-heavy` local-first, never blocks). |
| Build auto-apply | Already built: **`server/insights/autoapply.ts`** (`SAFE_AUTO_ACTIONS` allowlist, risk tiering, audited, token-gated). |
| New `src/pages/GovernancePage.tsx` | Frontend is **`app/routes/`** (wouter). The ops-governance UI is **`app/routes/InsightsPage.tsx`** (already has AI block, risk tiers, auto-apply badges). |
| `server/governance/*` is the engine | `server/governance/*` is the **access-control** governance (policy / rbac / secrets / budgets / approvals / retention) surfaced at `/governance`. **Different meaning of "governance" — do not conflate.** |

**Already shipped (Slices 1–4, live):**
- `scanners/ops.ts` — 11 ops detectors (service-down, disk/mem pressure, gpu-down, pipeline-paused, stuck-story, provider-outage, discovery-stale, cooldowns-piling, models-blocked, doctor-error-spike), fail-isolated per detector.
- `ai.ts` — per-finding AI reasoning, signature-cached in `ai_analysis`, 6h freshness, `editorial-heavy`.
- `autoapply.ts` — risk-tiered auto-apply; only `start-job:model-health:all` auto-fires today; everything else stays review-tier.
- `InsightsPage.tsx` — AI summary, evidence expander, risk-tier badges, Re-analyze, Apply/Dismiss.

**This extension's job:** finish the detector catalog, fix the *actually-broken* surfaces, unify the three reasoning systems, redesign the information architecture so it reads as one admin center, and push everything from "labs" to operator-ready.

---

## A. Full surface census (do not forget any part)

The control surface is **40+ routes / ~30 server modules**. Every route is classified by *operator readiness* (G1/G3), not just "exists." `✅ solid` · `🟡 partial / thin` · `🔴 mock or broken` · `🧪 labs (unfinished)`.

### Operations & governance (the admin-center core)
| Route | Backing | State | Gap to close |
|---|---|---|---|
| `/` DashHome | `/api/home`, `/api/product-health` | 🟡 | Add governance cluster + unified health score (Phase 3/9). |
| `/insights` | insights engine | ✅ | This **is** ops-governance; promote to the admin-center front door; finish detector catalog. |
| `/security` SecurityPage | `server/security-center` | 🧪 | **Expand into Unified Security Center (Phase 17).** |
| `/security/posture` | `server/security-center` | 🆕 | **New surface for CSPM & ASPM (Phase 17).** |
| `/security/vulnerabilities` | `server/security-center` | 🆕 | **New surface for CVE management (Phase 17).** |
| `/security/secrets` | `server/security-center` | 🆕 | **New surface for Secrets Management (Phase 17).** |
| `/governance` GovernancePage | policy/rbac/secrets/budgets/approvals/retention | 🧪 | Access-control governance; promote to core; rename. **Expand for user mgmt (Phase 14) & AI GRC (Phase 16).** |
| `/governance/risk` AIGovernancePage | `server/ai-grc` | 🆕 | **New surface for AI model risk, fairness, and compliance (Phase 16).** |
| `/compliance` CompliancePage | `server/compliance` | 🧪 | DPA/control mapping; tie evidence to audit chain; promote. |
| `/audit` AuditPage | `/api/actions/audit`, `/api/events` | ✅ | Add chain-status surfacing + export already present; link from every action. |
| `/incidents` IncidentsPage | reasoner incidents + sentinel | 🟡 | Unify with insights inbox (Phase 8), **add SLA tracking & post-mortems (Phase 10).** |
| `/doctor` DoctorPage | `:3200/doctor` | ✅ | Add scan-now + requeue GUI (Phase 4). |
| `/infra` InfraPage | `system.ts`, `vast.ts` | 🟡 | Add vast-reconcile + log-rotation + restart buttons via executor. |
| `/jobs` JobsPage | jobs table | 🟡 | Make jobs durable (Phase 1); add cancel/retry. |

### Models, gateway & cost
| Route | State | Gap |
|---|---|---|
| `/models` ModelsPage | 🟡 | Model-quality form edits. **Expand for model lifecycle mgmt (Phase 16).** |
| `/gateway` GatewayPage | 🟡 (experimental) | Circuit-breaker reset, route-healthiest, key mgmt exist; promote + audit. |
| `/litellm` LiteLLMPage | 🟡 | Read-only routing/config view; add health + "reload config" action. |
| `/cost` CostPage | 🔴 | **`cost.ts` returns mock usage + mock recommendations.** Wire to real `spend_ledger`. **Add budgets (Phase 5).** |
| `/traces` TracePage | ✅ | Gateway traces; fine. |
| `/feature-flags` FeatureFlagsPage | 🆕 | **New surface for feature flag management (Phase 15).** |

### Editorial / product pipeline
| Route | State | Gap |
|---|---|---|
| `/newsbites` | 🟡 | Deploy controls present; surface stale-deploy detector. |
| `/autopipeline` | ✅ | Queue + command; add inject UI parity. |
| `/scout`, `/content-health`, `/finance-intel`, `/dossier` | 🟡 | Functional detail pages; ensure each maps to insights deep-links. |
| `/today` TodayPage | 🟡 | "Today" rollup; fold into home/health-score. |

### Agent / build platform
| Route | State | Gap |
|---|---|---|
| `/builder` BuilderPage (3296 lines) | ✅ | Largest surface; reasoner diagnoses builder failures — unify into incidents/insights. |
| `/agents` AgentRegistry, `/agent-team`, `/workflows`, `/brainstorm`, `/projects` | 🟡 | Functional; tighten action parity + mobile. |
| `/opencode`, `/codex`, `/claude`, `/gemini` | 🟡 | Interactive CLI sessions; **`gemini.ts` model-selector is a TODO** (can't pick model per request). |
| `/marketplace` | 🧪 | Skills install/run; labs. |

### Admin / platform
| Route | State | Gap |
|---|---|---|
| `/settings` SettingsPage (879 lines) | 🔴 | **`systemConfig.ts` has `TODO: Actually persist config` + mock history.** Settings don't survive restart. |
| `/reports` ReportsPage | 🟡 | Operator digest/reports; wire weekly digest + vault export (partly present). |
| `/channels` ChannelsPage | 🟡 | Notification rules + brief preview/send; promote. |
| `/data-explorer` DataExplorerPage | 🆕 | **New surface for browsing/managing application data (Phase 10).** |
| `/about`, `/install` InstallWizard, `/status` (hidden), `/ratings` | 🧪 | Onboarding/landing; finish or hide cleanly. |

**Server modules not yet surfaced well:** `orchestrator` (signals/lanes/instances), `tenancy` (multi-tenant), `sso` (Google), `licensing`, `telemetry`, `webhooks`, `evals` (model eval scheduler), `reasoner` (builder diagnosis), `reporting`. Each needs either a GUI home or an explicit "internal-only" classification (no orphan APIs).

**Verified not-functional list (the `🔴`s) — Phase 7 targets:**
1. `server/api/cost.ts:332` — "For now, we'll return mock data."
2. `server/api/cost.ts:478` — "Mock recommendations — in a real implementation, this would analyze usage patterns."
3. `app/routes/CostPage.tsx:187` — "Calculate usage (mock for now)."
4. `server/api/systemConfig.ts:92` — "TODO: Actually persist the config in a database."
5. `server/api/systemConfig.ts:115` — "Return mock history data."
6. `server/api/gemini.ts:217` — model-selector not injected (can't choose Gemini model per request).

---

## B. Governance / Detection catalog (extended)

Each detector reads an existing source; risk tier is the single switch governing autonomous action. `✅ live` = already in `scanners/ops.ts`; `➕ new` = to add.

| Detector | Status | Source | Default remediation | Risk |
|---|---|---|---|---|
| Service down / flapping | ✅ | `system.ts` | restart service (allowlisted) | review (risky for `newsbites`) |
| Host disk pressure | ✅ | `system.ts` | prune backups / docker prune | review |
| Host RAM pressure | ✅ | `system.ts` | alert (+ memory-guard already runs) | n/a |
| **Cloud Misconfiguration (CSPM)** | ➕ | Security Center Scanners | **AI-suggested fix / auto-remediate** | review |
| **App Vulnerability (SAST/DAST)** | ➕ | Security Center Scanners | create ticket / notify owner | n/a |
| **High-Severity CVE Detected** | ➕ | Security Center Scanners | alert + link to CVE | n/a |
| **Exposed Secret Detected** | ➕ | Security Center Scanners | **auto-revoke + notify owner** | **auto (safe)** |
| GPU down / inference-wedged | ✅ | `gpu-health.json` | restart `vast-tunnel` / `vast-reconcile.sh` | review |
| Pipeline paused unexpectedly | ✅ | `/queue.paused` | resume | review |
| Stuck story / stage timeout | ✅ | `pipeline-state.json` | doctor-scan / requeue | safe |
| Provider outage (all models failing) | ✅ | `model-health.json` | route-healthiest | review |
| Model discovery stale (>6h) | ✅ | `model-health.json.lastFullCheckAt` | run `model-health-check` | **auto (safe)** |
| Cooldowns piling up | ✅ | `model-cooldowns.json` | clear stale cooldown | safe |
| Models blocked for quality | ✅ | `model-quality.json` | clear probation / unblock | safe |
| Doctor error-rate spike | ✅ | doctor log | doctor-scan | safe |
| **Vast balance low / short runway** | ➕ | `vast.ts` | none (alert + link) | n/a |
| **Doctor-log unbounded (>X MB)** | ➕ | stat `doctor-log.jsonl` | rotate + gzip | **auto (safe)** |
| **Approvals aging (>N h)** | ➕ | `/queue.waitingApproval` | surface + deep-link | n/a |
| **Expired-but-stuck cooldowns** | ➕ | `model-cooldowns.json` | clear stale cooldown | **auto (safe)** |
| **Site unreachable / stale deploy** | ➕ | HTTP probe + `git log -1` | redeploy NewsBites | review |
| **Cost / spend anomaly + budget threshold** | ➕ | `spend_ledger` (Phase 7) | alert (cap is policy) | n/a |
| **Auth/config self-check** | ➕ | env (`OPERATOR_TOKEN` unset, secrets missing) | alert — must fix in config | n/a |
| **Editorial 3-file policy drift** | ➕ | hash `news-desk.md`/`editorial-lead.md`/`EDITORIAL_POLICY.md` | alert + diff | n/a |
| **Cert / tunnel / DNS health** | ➕ | cloudflared status + cert expiry | restart `cloudflared` / alert | review |
| **Backup freshness (>26h)** | ➕ | stat `/opt/backups/<date>/` | run `mimule-backup` | safe |
| **Timer failures** (any `*.timer` failed) | ➕ | `systemctl --failed` | restart unit | review |
| **SSL/secret expiry windows** | ➕ | secrets store metadata | alert ahead of expiry | n/a |
| **Security posture regressions** | ➕ | `/api/security/posture` | route into inbox | review |
| **Compliance control gaps** | ➕ | `server/compliance` mapping | surface + link to evidence | n/a |
| **Incident approaching SLA breach** | ➕ | `incidents` table + SLA policies | escalate + notify | review |
| **Suspicious user activity** | ➕ | `audit` log (e.g., multiple failed logins) | lock account / notify | review |
| **Stale/permanent feature flag** | ➕ | `feature-flags` config (>N months old) | alert + link to flag | n/a |
| **AI Policy Violation (Pre-deploy)** | ➕ | CI/CD pipeline hook | block deployment | review |
| **Production Model Bias Degradation** | ➕ | GRC scan on prod model | alert + flag for review | review |
| **Production Model Performance Drift** | ➕ | GRC scan on prod model | trigger auto-retrain (if safe) | **auto (safe)** |
| **Model Deployed w/o GRC Scan** | ➕ | Model registry vs. GRC reports | alert + mark model as non-compliant | n/a |

> **Severity model:** `info | low | medium | high | critical`. **Risk model:** `auto` (idempotent/reversible, non-customer-facing — self-heals) · `review` (one human Apply) · `none` (alert only). Expanding the `auto` set is a deliberate decision in `SAFE_AUTO_ACTIONS`, never a default.

---

## C. Information architecture — making it read as ONE admin center (G5, G8)

The single biggest "not an admin center yet" problem is **discoverability and naming**, not missing data.

### C.1 The "governance" collision
Three different things wear the word: `/insights` (ops detection), `/governance` (access-control), `/security` + `/compliance`. An operator can't tell where to go.

**Resolution — a unified Control / Admin Center nav group**, with a single landing and clearly-labelled tabs:

```
Admin Center                         (new landing at /admin, = the Insights inbox + health header)
├─ Detections   → /insights          (rename UI label "Detections & Auto-fix")
├─ Security     → /security          (New top-level Unified Security Center)
├─ Access       → /governance        (rename UI label "Access & Policy")
├─ GRC          → /governance/risk   (new UI label "AI Governance, Risk & Compliance")
├─ Compliance   → /compliance
└─ Audit        → /audit
```

- Keep the routes (no breakage); change **nav grouping + labels** and add a top-level `/admin` that defaults to the inbox.
- Make this group the **first** item in primary nav. Promote `/insights`, `/governance`, `/security`, `/compliance` out of "labs" once Phase 7/10 land.

### C.2 One health number, everywhere
Today there are three disjoint scores: `product-health.json` (sentinel), `/api/security/trust-score`, and implicit insight counts. Define one **Admin Health Score (0–100)** in `server/insights/health.ts`:

```
score = 100
  − Σ open critical × Wc  − Σ open high × Wh  − Σ open medium × Wm
  − productHealth.fails × Wpf
  − securityTrust penalty
  − stale-detector penalty (any scanner not run in >2 cycles)
  − Σ high-risk models × Wgrc
```
Surfaced as: a **header gauge** on `/admin` and home, a **trend sparkline**, and a one-line AI "State of the Stack" caption (Phase 2). Clicking the gauge opens the inbox filtered to what's dragging it down. **Incorporate Golden Signals (latency, error rate) into the score.**

### C.3 Global command palette + search (G2, G5)
- `⌘K` / `Ctrl-K` palette: jump to any route, run any allowlisted action, search findings/audit/jobs by text.
- Every finding, incident, and audit row is **deep-linkable** (`/insights?focus=<sourceKey>`), so notifications/digests can link straight to the actionable item.

### C.4 Readability contract (every finding card)
`severity pill · subject · AI summary (1–2 lines) · evidence expander (raw signals + deep-link to detail page) · recommended action · [Apply] (review) or "Auto-applied ✓ @T" (auto) · [Snooze][Ack][Re-analyze]`. No raw JSON above the fold; plain language first (G7).

---

## D. Unify the three reasoning + remediation systems (G4, G7)

There are currently **three** overlapping "diagnose → recommend → fix" engines:
1. **insights** — `ai.ts` + `autoapply.ts` over findings (cost/security/build/data/ops).
2. **reasoner** — `server/reasoner/*` diagnoses **builder pass failures** (`failureClass`, `rootCauseHypothesis`, `suggestedActions`, playbooks, auto-remediation).
3. **incidents** — `/incidents` + `sentinelIncidents` scanner, which already bridges some reasoner output into insights.

**Plan:** keep their specialized producers, but make **insights the single inbox/consumer**:
- reasoner diagnoses for builder failures upsert an insight (domain `build`) with the diagnosis as the AI analysis (skip re-analysis — reuse it).
- incidents become a *view/filter* of insights (`domain in (ops, build)` + `severity>=high`), not a separate model.
- One playbook registry: `autoapply.SAFE_AUTO_ACTIONS` ∪ reasoner playbooks, both expressed as allowlisted executor actions with risk tiers. One audit stream (`governance_actions` / `action_audit`).

Result: the operator sees **one prioritized list**, every item already reasoned, with auto-fix or a single Apply — regardless of which engine produced it.

---

## Phases

> Phases 1–6 are the original plan, annotated with live status. Phases 7–17 are the extension.

### Phase 1 — Governance core + safety prerequisites (G1, G6) — *partially done*
The engine mutates state autonomously, so the action path must be safe **first**.
- **[DONE]** Risk-tiered executor + audit (`execute.ts`, `autoapply.ts`), ops detectors, AI layer, UI.
- **[DONE 2026-06-28] Fail-closed auth** in `server/api/actions.ts`: `checkToken()` returns false when `OPERATOR_TOKEN` is unset; `canMutate()` in `rbac.ts` also returns false — prevents dev-bootstrap from granting owner access on misconfigured deployments. Engine confirmed using internal token path. 8-test suite proves rejection at each layer.
- **[CONFIRMED — no action]** `GET /api/config` token-vending route is **not present** in current `router.ts`; the V5 draft's concern is already resolved.
- **[DONE 2026-06-28] Durable jobs**: confirmed deploy-job path writes to SQLite (createJob returns true when DASHBOARD_DB=1); `/jobs` gains `POST /api/jobs/:id/cancel` and `POST /api/jobs/:id/retry` with writer helpers (`requestJobCancel`, `retryJob`), both audited; Cancel/Retry buttons added to JobsPage detail drawer via useAction.
- **[DONE 2026-06-28] Register `POST /api/doctor/scan`** (already registered) — now wrapped as durable job returning jobId immediately; added `POST /api/doctor/requeue` for story requeue via autopipeline; `DoctorEntry.nextStage` and `cooldownMs` were already present (confirmed, no change needed).

### Phase 2 — AI reasoning layer (G7) — *done, extend*
- **[DONE]** `ai.ts` enrichment, signature cache, Re-analyze, `editorial-heavy` local-first.
- **[DONE 2026-06-30] "State of the Stack" daily AI briefing** (cached): `/api/admin/briefing` now returns a same-day cached briefing for `/admin` and home, persists LLM output in SQLite `system_configs`, and falls back to a deterministic local summary while refresh runs in the background.
- **[DONE 2026-06-30]** Feed **recent history + related findings** into the prompt (not just the single finding) so root-cause spans correlated signals. The insights AI prompt now includes same-domain/source-family findings, recent platform findings, and recent audit/config/job history; focused coverage seeds all three context sources.
- **[DONE 2026-06-30]** Confidence-gated auto-apply: only auto-fire when AI confidence >= threshold *and* action is in `SAFE_AUTO_ACTIONS`. Auto-apply policy now has `minAiConfidenceForAutoApply` with preview/execution gates and audit metadata.

### Phase 3 — Governance GUI (the admin-center surface) (G5) — *COMPLETE*
- **[DONE]** Finding cards w/ AI summary, evidence expander, risk-tier badges, Re-analyze on `InsightsPage`.
- **[DONE 2026-06-28] Auto-apply activity feed** — "Auto-fix Activity" tab on InsightsPage + AdminPage; rows from `/api/admin/autofixes` (actionKind=insights.auto-apply); per-row **Revert** where rollbackHint present.
- **[DONE 2026-06-28] Admin Health Score gauge** in `server/insights/health.ts`; `/api/admin/health` endpoint; severity/domain filter chips (saved to localStorage) on InsightsPage.
- **[DONE 2026-06-28] Home governance cluster** — replaces "demo opener": health score widget, open-critical count, auto-fixes/24h, AI briefing, top-3 findings with focus deep-links.
- **[DONE 2026-06-28] `/admin` landing** — `AdminPage.tsx` route registered; Admin Center first in nav; tabs link to all sub-sections without breaking existing routes.
- **[DONE 2026-07-01] Event markers on graphs** for deployments, config changes, and incidents. `/api/admin/events` now normalizes deploy jobs, config history, and reasoner incidents into graph markers; `/admin` overlays linked D/C/I markers on the health trend.

### Phase 4 — GUI completeness (every manual action via GUI) (G2, G6) — *COMPLETE*
Audit every action in CLAUDE.md/master-plan that needs CLI/SSH; add a GUI control for each, routed through the audited executor:
- **[DONE]** Doctor **scan now** + **requeue story**.
- **[DONE 2026-06-29]** **Model-quality form** (block/unblock/probation-clear/cooldown-clear) instead of JSON; required executor smoke passed for cooldown-clear, block, and unblock through `/api/actions/execute`.
- **[DONE]** **vast-reconcile** + **doctor-log rotation** + **service restart** buttons on `/infra`.
- **[DONE 2026-06-29]** **Incident acknowledge/mitigate** on `/incidents`; migration ordering fixed so `reasoner_incidents` lifecycle columns are added after table creation, focused tests pass, and smoke persisted ack/mitigate fields.
- **[DONE 2026-06-29]** **Cost-cap config** editor (`$20/mo`); required executor smoke passed for `mutate-policy:budget:global:set-cap`.
- **[DONE 2026-06-29]** **Timer run-now** for every `*.timer` (`/api/infra/run-timer` exists — surface all units); required executor smoke passed for `start-job:timer:model-health-check:run-now`.
- **[DONE]** **Backup run-now**, **cloudflared restart**, **LiteLLM config reload**.
- **[DONE]** Confirm-modal + audit on all; **mobile parity** (≥44px targets, no hover-only).

### Phase 4a — Universal AI Discovery & Inventory (G4, G9) — **[DONE 2026-06-29]** *foundational; see Capability X*
Make the surface environment-agnostic: discover all AI systems instead of assuming MIMULE's list.
- **[DONE]** **`server/discovery/`** read-only probes (fail-isolated): processes (`/proc/*/cmdline`), listening ports (`ss -ltnp`), systemd units, docker containers/images, reachable model backends (env), AI CLIs on `PATH`, AI-provider keys in env (presence + location only, never the value). **No hardcoded names** — match AI signatures.
- **[DONE]** **`discovered_assets`** table (kind, signature, source-probe, first/last-seen, status `unregistered|registered|ignored`, fingerprint JSON). Engine reconciles each scan; new unregistered AI assets raise `unregistered-ai-system` / `exposed-model-endpoint` / `shadow-api-key` findings with AI reasoning (G7).
- **[DONE]** **Register-from-discovery** GUI (G2, G6): `GET /api/discovery/assets`, `POST /api/discovery/assets/:id/register` (name/kind/owner/criticality, attach to service), `POST /api/discovery/assets/:id/ignore` (reason), `POST /api/discovery/rescan` — all audited, fail-closed, no SSH. AI Inventory tab on `/insights` with Register/Ignore inline forms, Re-scan now, status filter chips, ≥44px targets.
- **[DONE]** **De-hardcode** `server/adapters/system.ts`: `CRITICAL_SERVICES_SEEDS`/`DOCKER_CONTAINERS_SEEDS`/`KNOWN_TIMERS_SEEDS` are seed hints merged with live discovery (discoverSystemdUnits, discoverContainers, systemctl timer list), not the source of truth.
- **[DONE — also landed]** **Builder telemetry/repair** (in-flight work): `buildModelQualityTelemetry` TS2322 fix; `builderRepairBaselineHandler` + validation-profile + plan-sanity compile and pass tests.
- Acceptance: an AI process/port/container the product was never told about appears as a finding with a Register button within one scan; on a host with none of MIMULE's services, no page crashes and every module shows an honest discovered/empty state.

### Phase 5 — Telemetry, trends, cost (G3, G4)
- **`dashboard-ingestor`** (systemd timer) → existing **`metric_samples`** table (queue depth, doctor counts/hr, open-finding count, daily spend, health score, **golden signals**) → sparklines on `/admin` + home. (Don't invent `metrics_timeseries`; reuse `metric_samples`.)
- **LiteLLM/gateway spend ingestion** → spend tables (`spend_anomalies` exists; the cost-anomaly detector already keys off it; `spend_ledger` is referenced in `observability.ts`/`models.ts` — confirm the actual table/view and back `/cost` with it). Powers cost-anomaly detector, cost widget, `$20/mo` cap alerting. **Replaces the Phase-7 mock cost data.**
- **[DONE 2026-06-29] Budgeting System delta:** `/cost` now has a per-project budget editor/list using the audited executor action `mutate-policy:budget:project:<projectId>:set-cap`; project spend is computed from `cost_events.project`, and warning thresholds persist.
- **[DONE 2026-06-29] Model discovery ring-buffer:** `/cost` now persists and displays the last model-discovery events via `metric_samples(source='model-discovery')`, falling back to existing model-health samples when the JSONL log is absent.

### Phase 6 — Stability, polish, V3.x backlog (G1)
- **[DONE — verified 2026-07-02]** OpenCode **typecheck drift**: `bun run typecheck` passes (gate for CI).
- **[DONE 2026-07-02] Atomic-write/locking** for `model-health.json` reads: added a shared retrying atomic JSON reader and wired the core model-health API/adapter reads through it so torn writes are retried instead of surfacing as false unreadable health.
- **[DONE 2026-07-02, e07d9ba]** OpenCode **session-count** widget (live probe of the OpenCode server's `/session`, honest "unreachable"); widget **hide/reorder** (localStorage `cs.home.layout.v1`, customize mode, hidden tray); **Vast host sampler** (in-process ingestor task every 5 min, SSH sample when instance running, honest degrade to `off`/`unknown`/`unreachable` — GPU-off-by-operator renders as gray "off", never fake metrics or red noise; `deriveGpuStatus()` + `getVastInstanceState()`).
- `/impeccable` **animation pass** (non-load-bearing) on cards + status pills. *(remaining Phase 6 item)*
- **[DONE 2026-07-01] UX Styling Slice 5a:** Access & Policy uses shared button/table styling plus real-data summary cards and approvals table; Settings has nav-style tabs and real local/API-backed controls; Infra disk gauge is visible/proportional with warning coloring; LiteLLM status/routing/fallback/config boxes have responsive spacing. Validation: `bun run typecheck`, `bun run build`, focused settings/governance/channel tests, endpoint smoke, and light/dark Playwright screenshots.
- **[DONE 2026-07-01] UX Styling Slice 5b:** FinanceIntel now surfaces real finance-agent stats, run provenance, expandable run details, findings with ticker/confidence/source links, and existing portfolio controls; Agent Team now has real roster cards, status dots, job/model/activity/self-correction infographics, and reduced-motion-safe animation. Validation: `bun run typecheck`, `bun run build`, focused FinanceIntel API test, endpoint smoke, responsive overflow checks, and light/dark Playwright screenshots.

---

### Phase 7 — Make the "real-looking but mock" surfaces actually work (G3) — **highest user-visible value**
The pages most likely to make the product feel fake. Each is a verified `🔴`.
- **[DONE 2026-06-28] Cost is real:** removed mock branches in `cost.ts` (`:332` getVastRunway, `:478` getRecommendations, getCostSummary runway); now backed by real Vast adapter (`getVastInstance`/`getVastAccount`) + real gateway_calls spend analysis. `CostPage.tsx:187` 30%-mock budget usage removed — uses `used_cents`/`cap_cents`/`usage_pct` from API.
- **[DONE 2026-06-28] Settings persist:** added `system_configs` + `config_changes` tables to `dashboard.ts` schema; `systemConfig.ts` (`:92` TODO, `:115` mock history) fully rewritten — real SQLite persistence, versioned history with per-key diffs, falls back to defaults on fresh DB.
- **[DONE 2026-06-28] Gemini model selection:** wired `gemini.ts:217` to inject `--model` flag (Gemini CLI confirmed to support `-m`/`--model`); body type extended with `model?: string`.
- **[DONE 2026-07-02] Sweep for the rest:** `rg -n -i "mock|TODO|coming soon" server/api app/routes --glob '!*.test.ts' --glob '!*.test.tsx'` returns zero hits. The remaining `placeholder` hits are form/search placeholder attributes or CSS class names, not fake data or disabled controls.

### Phase 8 — Unify reasoning + remediation (Section D) (G4, G7) — *DONE 2026-06-30*
- **[DONE 2026-06-30]** Reasoner builder-failure diagnoses upsert `domain:build` insights via `server/insights/scanners/build.ts`, and the diagnosis is prefilled into `ai_analysis` as `reasoner-diagnosis`.
- **[DONE 2026-06-30]** `/incidents` is a saved view/filter of high-severity ops/security/build insights, with Detections deep links.
- **[DONE 2026-06-30]** `/api/policy/registry` merges safe auto actions, reasoner playbooks, and dynamic catalog actions with risk tiers; policy mutations use the shared executor/audit path.
- Acceptance: a builder failure, a stuck story, and a service-down all appear in the **same** prioritized inbox, each pre-reasoned.

### Phase 9 — Admin Center IA, health score, command palette (Section C) (G5, G8) — *DONE 2026-06-28*
- **[DONE]** `/admin` landing: `AdminPage.tsx`; health gauge + trend sparkline; AI briefing (in-memory 6h cache); score drivers; module cards; auto-fix feed.
- **[DONE]** Nav: `/admin` first in PRIMARY_NAV; "Detections" label; "Access & Policy" label; page meta for /admin + /insights.
- **[DONE]** `server/insights/health.ts` Admin Health Score (0-100 formula); `/api/admin/health` endpoint; scheduler writes trend sample.
- **[DONE]** `⌘K` command palette (`CommandPalette.tsx`): 22-route catalog + 3 allowlisted actions + full-text search via `/api/admin/search`.
- **[DONE]** Global deep-link: `/insights?focus=<sourceKey>` scrolls-to + highlight + focus-flash animation.

### Phase 10 — Promote labs → operator-ready (G1, G3)
Nothing in the primary admin path stays "labs."
- **[DONE 2026-06-30]** Finish + promote `/governance` (Access & Policy), `/compliance`, `/security`, `/gateway`, `/channels`, `/reports` from labs/experimental → core/advanced in `navRegistry.ts`, each with: real data, working actions, empty states, error states, loading states.
- **[DONE 2026-06-30] Data Explorer:** `/data-explorer` is an advanced experimental read-only surface with server-side allowlisted datasets, paginated/searchable fixed queries, hard redaction for sensitive column names, and 404s for non-allowlisted tables such as `system_configs`.
- **[DONE 2026-07-01] Global table standard Slice 1:** shared `useTableControls`/`TableControls` now support runtime page-size selection and row expansion state; shared table CSS/drawer detail patterns landed; Data Explorer, Traces, and Gateway recent calls use the standard for compact rows, search, sort, pagination, page size, and visible detail reveal.
- **[DONE 2026-07-01] Global header polish Slice 2:** `DashHeader` now resolves page titles from the shared nav registry by longest-prefix match instead of falling back to Operations; section/page header CSS keeps icons inline with titles; `/scout` statistics now place "Statistics" left and "Last updated" plus Refresh right.
- **[DONE 2026-07-01] Global table sweep Slice 3 batch 1:** Builder workflow/run/pass/artifact/validation/model-quality/plan-candidate/skill tables, Doctor decision log, and Today workload table now use the shared table standard with search, sort, pagination, page-size selection, and visible row detail reveal; plan-candidates no longer dumps the full set.
- **[DONE 2026-07-01] Global table sweep Slice 4 batch 2 (scoped):** `/cost` anomalies/budgets/model-discovery/spend/fallback tables now use the shared table controls with search, sort, page-size pagination, and visible inline detail; `/content-health` moved from borderless custom rows to bordered `.data-table` with the hardened shared search control and a stronger triage panel; `/models` column widths were rebalanced so logical model names truncate cleanly with tooltips, headers read fully, and pricing uses text labels. Audit/Jobs remain pending because they were outside `_NEXT.md` for this slice.
- **[DONE 2026-06-30] Enhanced Incident Management:** `/incidents` now surfaces real reasoner incident SLA metrics (MTTA, MTTR, oldest open age, 24h unacknowledged breach count), RCA from representative diagnoses, audited Ack/Resolve lifecycle actions, and operator post-mortem notes.
- **[DONE 2026-07-01] UX Styling Slice 6 Incidents:** `/incidents` now uses the shared table standard for both incident-grade detections and durable reasoner incidents, including search/sort/page-size pagination and visible row expansion. Reasoner lifecycle rows expose visible resolve/post-mortem inputs, Ack/Mitigate/Resolve controls, and a token-gated audited `POST /api/incidents/:id/suggest-postmortem` endpoint that drafts editable post-mortem text from real incident/RCA/timeline/signal data via logical `editorial-heavy`, falling back to a deterministic template when AI is unavailable.
- **[typecheck/build clean 2026-07-01, screenshot-verify pending] UX Styling Slice 8 — Mobile style pass:** fixed the root cause behind Opus's 5-issue-class iPhone 15 Pro audit: Data Explorer's inline-style 2-col grid never collapsed on mobile (converted to a `.data-explorer-grid` class + 700px collapse); FinanceIntel was missing the shared `dash-page` wrapper class so it had zero gutter on any viewport; Agent Team's `MiniMetric` stat card had 3 direct grid children against a 2-column template, mis-placing the value into the icon's column (wrapped label+value into one child, matching FinanceIntel's already-correct pattern) plus a new ≤480px single-column stat breakpoint; sortable `<th>` cells (the real click target per `useTableControls`) got a coarse-pointer padding bump to ≥44px. Wide-table wrapping (issue 5) was verified already correct on all target routes — no change needed. See BUILD_LOG.md 2026-07-01 17:22 UTC. Opus still owns before/after mobile screenshot verification + commit/restart/live-verify.
- **[DONE 2026-06-30]** **Bulk actions** in the inbox (multi-select → snooze/ack/apply-safe).
- **[DONE 2026-06-30]** **Undo/Revert** everywhere an action is reversible (store the inverse action in the audit row).
- **[DONE 2026-06-30] Mobile parity audit/remediation:** prior Playwright audit covered 39 routes × 3 viewports with 0 horizontal overflow/load failures and isolated sub-44px controls to shared chrome/table/button components. Shared coarse-pointer CSS now raises `.btn`/`.btn-sm`, filter inputs/selects, pagination buttons, hamburger, and tenant/project pills to ≥44px on touch; follow-up broad coarse-pointer selector also covers non-`.btn` primary controls (`button`, roles, selects, non-hidden text inputs, textareas) without changing desktop density. Representative iPhone 15 Pro re-audit on `/models`, `/insights`, `/admin`, `/channels`, `/gateway`, `/` kept horizontal overflow 0/6 and reduced controls shorter than 44px from 239 → 67; remaining short items are mostly link-style pills/cards/tabs or narrow-but-44px controls, not the flagged shared button/select controls.
- **Empty/orphan sweep:** every server module either has a GUI home or is explicitly tagged internal — no API without a surface, no surface without data.

### Phase 11 — Closed-loop autonomy & trust (G6, G7) — *DONE 2026-06-30*
The auto-apply engine must be *trusted*, which means *legible and governable from the GUI*.
- **[DONE 2026-06-30] Auto-apply policy editor** (GUI): `/insights` Autonomy Policy tab views the registry and toggles actions between `auto`/`review`/`off`; persisted in `system_configs`, versioned in `config_changes`, audited through `mutate-policy:autoapply:<key>:set-tier`, **no JSON editing**.
- **[DONE 2026-06-30] Dry-run / simulate:** `GET /api/insights/auto-apply/preview` and GUI button show what would auto-apply now without executing.
- **[DONE 2026-06-30] Blast-radius guardrails:** auto-applies are capped per trailing hour and repeated failed attempts for the same source key trip a circuit breaker that leaves the finding for review and emits an `security:autoapply-flapping:*` insight.
- **[DONE 2026-06-30] Explainability:** auto-action audit rows include finding id, source key, confidence, policy key, and tier. Revert is exposed only when an existing rollback hint/inverse action is present; no fabricated revert actions.
- **[DONE 2026-06-30] Approvals integration:** existing high-risk insight apply path routes through `server/governance/approvals`; review-tier non-high-risk actions remain human Apply.

### Phase 12 — Detector catalog completion (Section B `➕`s) (G4)
Implement the remaining detectors as `scanners/*.ts` (or extend `ops.ts`): vast-balance, doctor-log-size (+ auto-rotate), approvals-aging, expired-stuck-cooldowns (auto-clear), site-unreachable/stale-deploy, cost-cap/spend-anomaly, auth/config self-check, editorial-3-file drift, cert/tunnel/DNS health, backup freshness, failed-timer, security-posture regressions, compliance gaps, **SLA breach warnings, suspicious activity, stale feature flags.** Each: source + remediation + risk + AI-reasoned + deep-link. Goal: **nothing meaningful fails silently** (G4).
- **[DONE 2026-06-29 — Slice 1]** Ops scanner now surfaces already-sampled backup freshness, doctor-log size (+ safe auto-rotate), failed timers, expired stuck cooldowns (+ safe auto-clear), and aging governance approvals; focused ops scanner tests, typecheck, and build passed.
- **[DONE 2026-06-29 — Slice 2]** Edge scanner added for public URL reachability, TLS expiry, DNS failures, tunnel-down state, and low Vast runway; scheduler returns `edgeFindings`; hermetic edge scanner tests, typecheck, and build passed.
- **[DONE 2026-06-29 — Slice 3]** Governance/security scanner added for auth/config self-check, trust-score posture regression, honest compliance-not-configured gap, suspicious audit activity, SLA breach warnings, and Phase-15 feature-flag no-op; scheduler returns `governanceFindings`; focused tests, typecheck, and build passed.
- **[DONE 2026-06-29 — Validate-all]** Touched suites pass, `bun run typecheck` clean, `bun run build` ok, and temp-DB smoke verified failed timer, stale backup, unreachable site, project budget warning, stale-resolution, and token-gated project budget mutation.
- **[DONE 2026-06-30 — De-noise fix]** Fixed 3 false-positive sources behind the live `/admin` 15/100 score: SLA-breach scanner now requires the incident to be recently active (`last_seen` within 14d), not just long-open, so abandoned years-old incidents stop counting as live breaches; service-down scanner only treats `inactive` as down for `CRITICAL_SERVICES` (oneshot/triggered units resting at `inactive` no longer flag); edge scanner falls back to a localhost probe for our own control surface before flagging unreachable, so VPS-side hairpin NAT (can't reach our own public hostname through Cloudflare) no longer false-positives. See `BUILD_LOG.md` 2026-06-30 entry for full evidence.
- **[DONE 2026-06-30 — Incident auto-close]** Closed the root cause behind the de-noise fix above: nothing ever closed a `reasoner_incidents` row once its condition cleared, so incidents accumulated forever and aged into false SLA breaches (38 had to be bulk-resolved by hand). Added `autoResolveStaleIncidents()` (`server/reasoner/lifecycle.ts`) — idle-based sweep (default 7d, `INCIDENT_IDLE_RESOLVE_DAYS`-overridable), acknowledged incidents get a 2x grace period, every resolution audited (`incidents.auto-resolve`, fail-soft). Wired into `runInsightsScanOnce()` before the governance scan so SLA-breach findings auto-clear the same cycle. 6 hermetic tests + end-to-end temp-DB smoke (incident → SLA-breach finding → auto-resolve → finding clears) all green. See `BUILD_LOG.md` 2026-06-30 entry.
- **[DONE 2026-07-01 — Spend anomaly de-noise]** Fixed the last high false-positive from call-volume spikes being rendered as cost anomalies: `spend_anomalies` scanner now writes spend rows only for real/material spend signals, clamps near-zero-baseline ratios, and aggregation caps sub-$1 rows at low severity with honest "little or no prior baseline" wording. Focused anomaly/insights tests, typecheck, build, and temp-DB smoke all passed. See `BUILD_LOG.md` 2026-07-01 entry.
- **[DONE 2026-07-02 — Self-learning remediation loop, wedge 1: condition-based incident auto-close]** `autoResolveStaleIncidents()` only closes incidents on a 7-day idle timer (a guess). Added a precise, immediate closer inside `runSentinelIncidentScan()` (`server/insights/scanners/sentinelIncidents.ts`): reuses the same health-card read, removes the old `fails.length === 0` early-return (that was exactly the moment most incidents should auto-close), and after the create/bump loop closes any open `sentinel_health` incident whose finding id is no longer in the current fail set — with a freshness guard (`SENTINEL_AUTOCLOSE_MAX_AGE_MS`, default 6h) so a stale card can never fabricate an all-clear. Each auto-close is audited (`incidents.auto-close`, distinct from the stale sweep's `incidents.auto-resolve`) and fires a best-effort `incident.resolved` webhook. Scheduler (`server/insights/scheduler.ts`) logs the auto-closed count; return shape of `runInsightsScanOnce` untouched. 6 new hermetic tests (clears-on-pass, clears-on-empty-findings proving the removed early-return, stays-open-while-failing, missing-card-skips, stale-card-skips, never-touches-non-sentinel-incidents) — 11/11 pass. See `BUILD_LOG.md` 2026-07-02 entry.

### Phase 13 — Operator comms & onboarding (G5, G8)
- **[DONE 2026-06-30 — Slice 1]** **Notifications complete:** Telegram + `/channels` rules fire on new critical findings and auto-apply activity (dedup already exists); each message deep-links into `/insights?focus=`.
- **[DONE 2026-06-30 — Slice 2]** **Daily/weekly digest** (reporting module is present) with the health-score trend, top findings, auto-fixes applied, cost vs cap — to vault + Telegram. *Never make Marouane the monitor* (memory): the digest is a summary of what the system already handled, not a to-do list.
- **[DONE 2026-06-30 — Slice 3]** **Runbook links:** each detector links to a one-paragraph "what this means / what Apply does / how to revert."
- **[DONE 2026-06-30 — Slice 4]** **First-run onboarding** (`/install` wizard finished): operator token check, secrets present, tunnels up, sentinel running — a green-light checklist that doubles as the auth/config self-check detector.

---
### Phase 14 — Advanced User & Tenant Management (G2, G8)
Build out the `/governance` surface to be a full-fledged user and (if applicable) tenant management center, drawing from the existing `tenancy` and `sso` modules.
- ✅ **[DONE 2026-06-30 — Slice 1 backend]** Added grounded governance user directory, RBAC matrix, and owner-only audited role assignment APIs backed by existing `users` and `governance_role_bindings`; validated with focused governance API tests, typecheck, and build.
- ✅ **Tenant Management:** `/governance` Users & Roles tab lists real tenants from `/api/tenants`, status, created date, and cheap project counts when available; single-tenant deployments show honest single-tenant copy.
- ✅ **User Directory & Invitations:** User directory is implemented from the existing `users` table and role bindings. Email invitations are **SKIPPED for this grounded pass** because SMTP invitation infrastructure is not enabled in this stack; no invitation form/button was faked.
- ✅ **Role-Based Access Control (RBAC) Editor:** Owner-only GUI role assignment is implemented for the four real roles, with the permission matrix sourced from `ROLE_PERMISSIONS`.
- **"View As" Functionality:** **SKIPPED for this grounded pass** because impersonation is sensitive and deferred for a separately audited design; the UI labels it not enabled.
- **Impersonation Audit:** Deferred with "View As"; no impersonation session or audit trail was faked.
- ✅ **[DONE 2026-06-30 — Validate-all]** Touched suites, typecheck, build, endpoint smoke, and `/governance` owner/viewer render smoke passed for the grounded subset.

### Phase 15 — Integrated Feature Flagging (G2, G6) ✅ DONE 2026-06-30
Introduce a new, dedicated surface for managing feature flags, reducing reliance on config files and deployment cycles for enabling/disabling features.
- ✅ **New `/feature-flags` Page:** A central UI to create, view, edit, and toggle feature flags.
- ✅ **Flag Types:** Support boolean toggles, percentage-based rollouts, and user/tenant-segmented flags (targeting_json).
- ✅ **Audit History:** Track all changes to feature flags via config_changes table; per-flag history view in UI.
- ✅ **Stale Flag Detection:** Real `readStaleFeatureFlagFindings()` in governance scanner; ops:stale-feature-flag:<key> insights with 30-day/90-day thresholds; resolves when flag is removed.
- **Link flags to Insights:** (deferred — no flag-to-insight correlation wired in this pass)

### Phase 16 — AI Governance, Risk, and Compliance (GRC) Center (G2, G4, G7, G8)
Evolve the `/governance` surface into a world-class GRC center, focused on providing clear, actionable, and automated governance for all AI models in the system.
- **Policy-as-Code (PaC) Engine:**
    - Implement a core engine (e.g., using Open Policy Agent - OPA) for defining AI policies in a declarative language (Rego).
    - Create a UI in `/governance` for managing these policies, with versioning, history, and an **AI Assistant** to help write and debug policies from natural language prompts.
    - Policies will cover data access, model quality thresholds, fairness metrics, allowed libraries, and deployment criteria.
    - Integrate PaC checks into the CI/CD pipeline for automated pre-deployment enforcement.
- **AI Risk & Fairness Dashboard (`/governance/risk`):**
    - A dedicated, clinical dashboard to visualize model risks.
    - **Overall Risk Score:** A single, clear score per model, with drill-downs into contributing factors.
    - **Fairness & Bias Analysis:** Visualize fairness metrics (e.g., Disparate Impact) across protected attributes. Allow comparison between model versions.
    - **Explainability (XAI):** Surface model explanations (e.g., SHAP plots, LIME examples) for investigation.
    - **Performance Slicing:** Show model performance on critical data subsets, not just overall averages.
    - **Adversarial & Security Scans:** Display results from automated security tests against models.
- **Model Lifecycle Management:**
    - Enhance `/models` to show the full lifecycle of each model: from experiment, to evaluation, GRC scan results, deployment, and production monitoring.
    - A clear visual timeline for each model version, showing all associated artifacts, reports, and deployment events.
    - Enforce GRC gates: a model cannot be promoted to production without a passing GRC scan and an auditable approval.
- **Automated GRC & Compliance:**
    - GRC scans run automatically on new model candidates.
    - Production model scans run on a schedule to detect drift and degradation, automatically creating insights.
    - **One-Click Reporting:** Allow compliance managers to generate comprehensive, human-readable PDF reports for any model, detailing its GRC profile for auditors and regulators.

**Grounded subset status (2026-06-30):**
- [x] Slice 1 backend: Added `GET /api/models/:logicalName/lifecycle` backed by real `metric_samples source='model-eval'`, model quality policy state, optional routing reliability, current approval state, and traceable promotion readiness gates. Added approval-request mutation using existing `governance_approvals` plus `action_audit`; actual production promotion remains a follow-on because no safe production-state mutation exists in this stack.
- [x] Slice 2 UI: `/models` lifecycle expansion and GRC readiness panel render real eval score/latency timelines, quality state, approval state, promotion-request action, and honest not-available GRC notes.
- [x] Slice 3 validate-all and final documentation completed with focused model API tests, typecheck, production build, HTTP endpoint smoke, `/models` render smoke, grep, and diff hygiene.
- [x] OPA/Rego PaC, fairness/bias metrics, SHAP/LIME XAI, adversarial model scans, and one-click PDF compliance reports: explicitly skipped for the grounded subset because this stack does not currently produce those artifacts; no fake risk/fairness/XAI/security/PDF surfaces were added.
- [x] Phase 14-17 operator-approved grounded subset completed on 2026-06-30.

### Phase 17 — Unified Security Center (G2, G4, G6, G8)
Consolidate all security functions into a new top-level `/security` center that provides a single pane of glass for security posture, vulnerabilities, and secrets. This replaces the simple `/security` page.
- **Security Posture Management (CSPM & ASPM):**
    - A unified `/security/posture` dashboard showing a real-time security score.
    - Ingests findings from cloud configuration scanners (CSPM) and application scanners (SAST, DAST, SCA) to provide a complete asset inventory and misconfiguration list.
    - Maps findings to compliance frameworks (CIS, NIST, OWASP).
- **Vulnerability Management (`/security/vulnerabilities`):**
    - A dedicated CVE management dashboard.
    - Aggregates vulnerability data from all scanners.
    - Provides AI-powered prioritization based on severity, exploitability, and business context (application criticality).
    - Integrates with ticketing systems to create and track remediation tasks.
- **Secrets Management (`/security/secrets`):**
    - A full lifecycle management dashboard for secrets.
    - Automatically scans Git history, container images, and environment variables for exposed secrets.
    - Provides a central inventory of all detected secrets, their location, age, and owner.
    - **AI-Driven Remediation Workflow:** When a secret is found, the system automatically:
        1. Creates a high-priority insight.
        2. Notifies the owner via the appropriate channel.
        3. Initiates a one-click or fully-automated rotation/revocation workflow via integration with a secrets vault (e.g., HashiCorp Vault).
        4. Re-scans to verify the secret is no longer exposed.
- **AI-Powered Automated Remediation Engine:**
    - A core workflow engine that powers all security automation.
    - For a detected misconfiguration (e.g., public S3 bucket), an **AI Assistant** analyzes the finding and proposes a fix as code (e.g., Terraform HCL, AWS CLI command).
    - The operator can review the proposed fix and apply it with one click.
    - For low-risk, well-understood findings, the engine can be configured to apply the fix automatically, with a clear audit trail and rollback capability.

**Grounded subset status (2026-06-30):**
- [x] Slice 1: Added metadata-only `GET /api/security/secrets` and `/security` Secrets lifecycle table backed by `governance_secrets` metadata plus real `security:weak_secret:*` / `security:audit_secret_leak_signal` insights. Secret values, encrypted DEKs, IVs, and key IDs are not returned.
- [x] Slice 2: Unified `/security` IA into Posture, Findings, Secrets, and Vulnerabilities sections on the existing route; Vulnerabilities and CSPM/cloud posture render honest not-configured states with no fabricated CVEs, assets, CVSS, tickets, or cloud inventory.
- [x] Slice 3: Final validate-all and documentation pass completed with typecheck, production build, focused security API tests, metadata-only endpoint smoke, no-token mutation smoke, scoped grep, diff hygiene, and desktop/mobile browser render smoke.
- [x] CVE/SAST/DAST/SCA/CSPM/Vault/IaC remediation integrations: explicitly skipped as not configured in this single-host stack; do not show fabricated findings.

---

## Sequencing & priority

1. **Phase 7** (kill the mock data — biggest "feels fake" fix) — *do first, highest visible payoff.*
2. **Phase 1 TODOs** (fail-closed auth, durable jobs) — *safety before more autonomy.*
3. **Phase 9 + 3 remainder** (Admin Center IA, health score, home cluster) — *makes it findable/an admin center.*
4. **Phase 4** (every manual action via GUI) — *G2 completeness.*
5. **Phase 4a** (Universal AI Discovery & Inventory) — *G9 zero-config; makes detection real in ANY environment; prerequisite lens for the detector/cost/security work below.*
6. **Phase 12** (finish detectors) + **Phase 5** (telemetry/cost real + budgets) — *G4 detect-everything.*
7. **Phase 8** (unify reasoning) + **Phase 11** (trustable autonomy).
8. **Phase 10** (promote labs, mobile parity, bulk/undo, Data Explorer, Incidents+)
9. **Phase 14 & 15** (User Mgmt, Feature Flags) — *powerful new capabilities.*
10. **Phase 16** (AI GRC Center) — *critical for long-term trust and safety; governs the discovered AI inventory.*
11. **Phase 17** (Unified Security Center) — *centralizes all security operations; consumes discovery for exposure/secret findings.*
12. **Phase 2/13 extras** + **Phase 6 polish**.

Ship in small, validated slices (typecheck + targeted tests + ephemeral smoke + multi-viewport Playwright) per the dashboard-orchestrator skill. Every mutating slice writes an audit row and is revertible.

---

## Critical files (VPS tree — corrected)

- `server/insights/scanners/ops.ts` — extend with Phase-12 detectors.
- **New Discovery module (Phase 4a):** `server/discovery/{processes,ports,systemd,docker,backends,clis,credentials,reconcile}.ts` + `server/insights/scanners/discovery.ts` (emits `unregistered-ai-system`/`exposed-model-endpoint`/`shadow-api-key`).
- `server/adapters/system.ts` — **de-hardcode** `KNOWN_SERVICES`/`DOCKER_CONTAINERS`/timers (`:9–18`, `:120–125`) into discovery seed-hints.
- **New GRC Scanners:** `server/insights/scanners/ai_grc.ts`.
- **New Security Scanners:** `server/security-center/scanners/{cspm,aspm,cve,secrets}.ts`.
- `server/insights/{ai,autoapply,scheduler,store,aggregate,health}.ts` — `health.ts` is **new** (Admin Health Score).
- **New Security Center modules:** `server/security-center/{engine,remediation_engine,reporting}.ts`.
- `server/api/execute.ts` / `server/api/actions.ts` — fail-closed auth, durable jobs, new executor actions.
- **New GRC modules:** `server/ai-grc/{engine,scanners,opa_service,reporter}.ts`.
- `server/api/router.ts` — mount `/admin`-supporting endpoints; deep-link params; mount `/governance/risk` and `/security/*` endpoints.
- `server/api/cost.ts` + `app/routes/CostPage.tsx` — remove mock; back with `spend_ledger`/gateway ledger; add budget APIs.
- `server/api/systemConfig.ts` — real persistence + versioned history.
- `server/api/gemini.ts` — model selector or cleanly disable.
- `server/reasoner/*` — emit `domain:build` insights (Phase 8).
- `server/db/dashboard.ts` (+ `server/db/observability.ts`) — Add tables for `discovered_assets` (Phase 4a), `feature_flags`, `budgets`, `ai_policies`, `ai_grc_reports`, `security_findings`, `cve_database`, `exposed_secrets`.
- `app/routes/InsightsPage.tsx` — activity feed, health gauge, filters, bulk, revert; **new** `app/routes/AdminPage.tsx` (or repurpose InsightsPage as the `/admin` default).
- **New Routes:** `app/routes/FeatureFlagsPage.tsx`, `app/routes/DataExplorerPage.tsx`, `app/routes/AIGovernancePage.tsx`, `app/routes/security/{Posture,Vulnerabilities,Secrets}Page.tsx`.
- `app/lib/navRegistry.ts` — Admin Center group; promote labs→core; resolve naming; add GRC and Security tabs.
- `app/routes/{Infra,Doctor,Models,Incidents,Settings,Cost,Governance,Security,Compliance}Page.tsx` — new GUI actions + promotion.
- Reuse: LiteLLM `:4000` (logical names only), autopipeline `:3200/command`, SSE `/api/stream`, `useAction` hook, `vast-reconcile.sh`, `model-health-check.service`.
- New systemd: `dashboard-ingestor.timer`.

---

## Per-detector acceptance criteria (the G4 bar)

A detector is "done" only when **all** hold: (a) fires within one scheduler cycle of the condition; (b) auto-resolves when the condition clears; (c) carries a non-empty AI summary + recommended action; (d) deep-links to the originating detail page; (e) safe remediations self-heal and are audited with a revert path; review remediations show a single Apply; (f) has a unit test over the pure mapping function with a synthetic source; (g) appears in the unified inbox sorted by severity.

---

## Verification (run on the VPS, with evidence)

1. **Build/type/lint:** `cd /opt/opencode-control-surface && bun run typecheck && bun run build` — passes (Phase 6 gate).
2. **No mock left (Phase 7):** `/cost` shows real per-model spend from `spend_ledger`; changing a setting on `/settings` survives `systemctl restart control-surface.service`; `grep -rn 'mock\|TODO: Actually persist\|return mock' server/api app/routes` returns nothing load-bearing.
3. **Auth fail-closed:** with `OPERATOR_TOKEN` unset, `curl -X POST /api/infra/service-restart` → 401/403; with header → allowed + audit row.
4. **Detection + autonomous remediation (safe):** stop a non-critical service (e.g. `systemctl stop paperclip`); within one cycle confirm a `service_down` finding via `GET /api/insights`, an auto/Apply path, an audit row, service back up, finding auto-resolves.
5. **Apply-gated (review):** induce a "stale deploy" finding; it shows awaiting-Apply and only redeploys after `POST /api/insights/:id/apply`.
6. **AI cache:** `ai_analysis` row exists with non-empty `summary`/`recommended_action`; Re-analyze updates `generated_at`; used `editorial-heavy` (or logged cloud fallback); creation not blocked when GPU busy.
7. **Unified inbox (Phase 8):** a builder failure, a stuck story, and a service-down all appear in one severity-sorted list, each pre-reasoned.
8. **Admin Center (Phase 9):** `/admin` is the first nav item; health gauge renders; ⌘K navigates + runs an action + searches; clicking the gauge filters the inbox.
9. **Trust/autonomy (Phase 11):** the auto-apply policy editor toggles a detector auto→review (persisted, audited); a flapping remediation circuit-breaks after K attempts and escalates; every auto-row shows "why" + Revert.
10. **GUI parity (Phase 4/10):** every CLI action in CLAUDE.md has a GUI control; mobile (iPhone 16 Pro) — findings + actions usable, ≥44px, no hover-only, no horizontal scroll.
11. **Durability:** restart `control-surface.service` mid-job; job state survives (SQLite); open findings + settings reload.
12. **Regression:** existing V3/V4 pages and mutations still work; removed routes 404; no orphan API (every endpoint has a surface or is tagged internal).
13. **New Features (Phase 14/15):** The `/feature-flags` page allows toggling a flag. The `/governance` page shows a list of users.
14. **GRC (Phase 16):** A model failing a fairness check in CI is blocked from deployment. `/governance/risk` shows a risk score for a production model.
15. **Security Center (Phase 17):** A new high-severity CVE finding appears in `/security/vulnerabilities`. An exposed secret in a Git repo creates an insight and is automatically revoked.
16. **Universal AI Discovery (Phase 4a, G4/G9):** start an AI process/port/container the product was never told about (e.g. a stray `ollama serve` on a new port) → within one scan cycle it appears on `/insights` (and `/security` if exposed) as an `unregistered-ai-system` finding with AI reasoning + a **Register** button; registering it makes it a managed asset everywhere; an exposed unauthenticated model endpoint scores high/critical.
17. **Zero-config / any environment (G9):** on a host with NONE of MIMULE's services (no newsbites/litellm/vast/paperclip), every page loads without crashing and shows an honest discovered/empty/connect state — never mock or hardcoded data; the inventory and health score reflect only what was actually discovered.

## Status Note - 2026-06-30 02:17 UTC - V5 Phase 2 Auto-Apply Confidence Gate

- Completed the remaining Phase 2 autonomy guard: safe auto-apply now requires cached AI analysis confidence to meet `minAiConfidenceForAutoApply` before preview/execution.
- Confirmed the prompt-context Phase 2 item is already implemented and marked done: analysis prompts include related findings, recent platform findings, and recent action/config/job history.
- Validation: `bun test server/insights/autoapply.test.ts server/insights/ai.test.ts --timeout 30000` passed 16/0; `timeout 240s bun run typecheck` passed; `timeout 360s bun run build` passed with the known Vite large-chunk warning; scoped `git diff --check` passed.
- Next: Phase 3 event markers on graphs, then Phase 7 mock/TODO/placeholder sweep.

## Status Note - 2026-07-02 14:10 UTC - V5 Phase 6 Model Health Atomic Reads

- Continued the scheduler-plan handoff into the next active V5 Phase 6 stability item because the scheduler plan has no unchecked `[ ]` implementation items.
- Added `server/lib/atomicJson.ts`, a synchronous retrying JSON reader that opens a stable file descriptor, checks for concurrent size/mtime changes, retries parse failures, and supports explicit fallbacks.
- Wired `server/api/models.ts` and `server/adapters/models.ts` model-health reads through the helper so transient torn `model-health.json` writes do not make `/api/models` falsely fail.
- Validation: `bun test server/lib/atomicJson.test.ts server/api/models.test.ts --timeout 30000` passed 8/0; `bun run typecheck` passed; `bun run build` passed with the known Vite large-chunk warning; `bun run check` passed with the same warning.
- Next: continue Phase 6 with the OpenCode session-count widget or widget hide/reorder.

## Status Note - 2026-07-02 14:12 UTC - V5 Phase 7 Incident Mute Stub Removal

- Continued the scheduler-plan handoff into the Phase 7 fake-surface sweep.
- Replaced the `incident mute is not implemented` executor stub with a durable tenant-scoped update of `reasoner_incidents.muted_at`, `muted_by`, and `mute_reason`.
- Added the `/api/incidents/:id/mute` route and removed synthetic legacy incident lifecycle action descriptors from the global catalog so controls are either real durable reasoner-incident actions or absent.
- Validation: `bun test server/api/incidents.test.ts server/api/actionDescriptors.test.ts --timeout 30000` passed 10/0; `bun test server/lib/atomicJson.test.ts --timeout 30000` passed 2/0; `bun run typecheck`, `bun run build`, and `bun run check` passed with the known Vite large-chunk warning; isolated `/health` + `/api/incidents` smoke passed; focused `/incidents` visual check passed across desktop/tablet/iPhone 16 Pro.
- Next: continue Phase 7 with the remaining grep hits, filtering out harmless input placeholder text and SQL placeholder variables while removing or wiring any actual fake controls.

## Status Note - 2026-07-07 09:43 UTC - V5 Phase 7 Fake-Surface Sweep Recheck

- Continued the scheduler-plan handoff into the Phase 7 fake-surface sweep.
- Found the only production `mock|TODO|coming soon` hits were explanatory `server/api/shell.ts` comments about test-time module replacement, not fake data or incomplete controls; rephrased them so the proof command is clean again.
- Fixed the existing dirty `server/api/disk-reclaim-backup.test.ts` typecheck failure with a response `jobId` cast, preserving the A3b disk/backup test behavior.
- Validation: `rg -n -i 'mock|TODO|coming soon' server/api app/routes --glob '!*.test.ts' --glob '!*.test.tsx'` returned zero hits; `bun test server/api/disk-reclaim-backup.test.ts --timeout 30000` passed 12/0; `bun run typecheck`, `bun run build`, and `bun run check` passed with the known Vite large-chunk warning; `git diff --check` passed.
- Next: return to the active A3b infra-actions slice visible in the dirty workspace and finish/validate disk-pressure reclaim plus backup-freshness detector work.

## Status Note - 2026-07-07 09:47 UTC - A3b Disk Reclaim and Backup Action Validation

- Continued the scheduler-plan handoff into the active A3b infra-actions dirty slice.
- Validated the disk-pressure reclaim and backup-freshness remediation wiring: scanner findings carry `reclaim:disk:docker-prune` and `run:backup:now`, action descriptors are present, and execute paths create durable jobs without test-time real Docker/systemd calls.
- Confirmed bounded reclaim never uses `docker prune -a`/`--all`; it runs builder-cache prune and dangling-image prune only, records before/after `df -BG /`, updates job output, and writes audit evidence.
- Validation: focused A3b tests passed 34/0; `bun run typecheck`, `bun run build`, and `bun run check` passed with the known Vite large-chunk warning; isolated `:3299` smoke confirmed `/health` and both catalog IDs; live `control-surface.service` restarted active and `/health` returned OK.
- Next: commit this A3b slice when ready, then continue ULTRAPLAN Phase 3 with the next action-catalog item.
