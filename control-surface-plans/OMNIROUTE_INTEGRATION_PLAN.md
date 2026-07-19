# OmniRoute integration plan — add a self-hosted free-model aggregator to the rotation

**Date:** 2026-07-18 · **Author:** Claude Opus (planner) · **Requested by:** operator ("add OmniRoute to the rotation", "pull AI models from it", "keep it separated from my API keys — it may be shared with others, so no password / personal info", "look for projects like that and add or suggest").

**One-line:** Evaluate OmniRoute as a **credential-isolated, semi-trusted leaf provider** behind LiteLLM, admit only provider adapters proven safe with keyless or dedicated nonpersonal credentials, and keep routing authority and personal credentials outside its trust boundary.

---

## 0. What OmniRoute is (grounded)

Canonical repo: **`github.com/diegosouzapw/OmniRoute`** (MIT; Node `>=22.22.2 <23 || >=24 <27` at audited commit `a5e5e880`). The other `omniroute` repos in search are forks — pin the original. It is a self-hosted, OpenAI-compatible multi-provider gateway with routing/fallback, an admin dashboard, and several protocol surfaces. Upstream's current provider totals are volatile and internally inconsistent (README: 264/90+ free; generated reference: 265), so they are marketing context, not admission evidence.

Concrete surface (discovery only; not an approved runbook):
- The upstream quick-start uses a mutable image and broad port publishing. **Do not run that form here.** Phase 1 must resolve a reviewed commit to an immutable image digest and bind only `127.0.0.1:20128:20128`.
- Endpoint: `http://localhost:20128/v1` — `POST /v1/chat/completions`, `GET /v1/models` (connected OpenAI-shaped inventory), and `GET /api/models/catalog` (full catalog). Lightweight liveness is `GET /api/health/ping`; `/health` is not the audited route.
- Auth, verified against upstream commit `a5e5e880`: `REQUIRE_API_KEY` defaults **false**, so Phase 1 must set it true. First-boot dashboard bootstrap uses `INITIAL_PASSWORD`. Provider credentials live in local SQLite under `DATA_DIR`; `STORAGE_ENCRYPTION_KEY` must be set because the empty/default path permits plaintext passthrough rather than encrypted-at-rest storage.
- Model naming: `alias/model` (e.g. `cc/claude-opus-4-6`).
- Upstream advertises a mixture of keyless, free-with-credential, OAuth/session, subscription, and unofficial adapters. The audited reference makes **Pollinations the only clearly documented keyless candidate from the originally named set**. NVIDIA, Cerebras, Cloudflare, and OpenCode Zen require API keys; Qoder is OAuth; Qwen OAuth is discontinued; and Kiro's documented terms prohibit this proxy/harness use. Qwen and Kiro are excluded, and every other adapter remains ineligible until its pinned manifest row passes review.
- **Do not use `/api/v1/registered-keys` for inference auth.** At the audited commit its validator has no production inference call site. Create DB-backed keys through the authenticated `/api/keys` administration path, with explicit endpoint/model scopes, rate limits, expiry, and `noLog`; prove each key on the real inference middleware before relying on it.

**Due-diligence flag:** it aggregates many providers, some via unofficial/reverse-engineered access (ToS + trust risk), and it *stores credentials*. Because the operator says it "may be shared", treat OmniRoute as **semi-untrusted**: pin a commit, sandbox it, and never hand it a personal key.

Pinned source audit anchors: [runtime/license and package constraints](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/package.json#L51-L69), [security-related environment defaults](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/.env.example#L16-L51), [plaintext encryption fallback](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/src/lib/db/encryption.ts#L119-L149), [client API authorization](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/src/server/authz/policies/clientApi.ts#L65-L99), [DB-backed key controls](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/src/app/api/keys/%5Bid%5D/route.ts#L60-L118), [provider categories and warnings](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/docs/reference/PROVIDER_REFERENCE.md#L48-L55), and [unsafe upstream Docker profiles](https://github.com/diegosouzapw/OmniRoute/blob/a5e5e880928886fe47362cdba63ca7c2c2cf55b4/docker-compose.yml#L103-L165).

---

## 1. Design principle — the trust boundary

```
   personal keys (litellm.env, mimoun/.env, vault)      <-- NEVER cross into OmniRoute
        │
   LiteLLM :4000  ── routing authority, owns config via reprobe ──┐
        │                                                          │
        ├── direct free providers (openrouter, groq, nvidia, …)    │  keep as today
        │                                                          │
        └── openai/<model> @ http://127.0.0.1:20128/v1 ────────────┘
                    │  (one internal gateway token, not a personal key)
             OmniRoute (sandboxed, own SQLite, manifest-approved providers only)
                    │
             Pollinations initially; separately approved dedicated-key adapters later
```

**OmniRoute is a leaf, not the brain.** LiteLLM remains the routing authority; `model-health-check.mjs` owns sanctioned model registration/hot-adds and `model-fallback-reprobe.py` owns fallback-chain rewrites. Credential isolation bounds secret exposure, but OmniRoute still receives prompts and responses and has outbound network access. Until data-handling and egress controls are proven, send only synthetic/non-sensitive prompts; assume private editorial data could leak through a compromised adapter.

---

## 2. Credential isolation & shareable-safe posture (the operator's hard constraint)

1. **No personal key ever enters OmniRoute.** Admit an adapter only after a pinned manifest labels it `truly-keyless`, `dedicated-nonpersonal-key`, `OAuth/session`, or `unsupported`. Only the first two are eligible. Dedicated credentials must be newly minted, minimally scoped, independently revocable, and absent from `litellm.env`.
2. **No personal info or reused password.** `INITIAL_PASSWORD`, `STORAGE_ENCRYPTION_KEY`, and inference keys are independently generated service credentials, not personal credentials. Phase 1 must prove a secret-delivery path such as Docker/systemd credentials (or an upstream-supported secret-file mechanism); never place them in image layers, Compose YAML, command-line flags, or a broadly readable environment file. Verify encrypted-at-rest behavior with a sentinel before any provider credential is admitted.
3. **Sandboxed runtime.** Use the upstream `runner-base` image path only, never its `cli` or `host` profiles: the former mounts the Docker socket and the latter mounts agent homes such as `.codex`, `.claude`, and `.openclaw`. The container gets no broad host mounts — only its own data volume and, if supported, narrowly scoped read-only service-credential files. It cannot read `/etc/litellm`, `/opt/mimoun`, `/opt/ai-vault`, or `/root`. Harden: `--read-only` rootfs where feasible, `--cap-drop ALL`, `--security-opt no-new-privileges`, memory/CPU caps, no `--privileged`. (If run via systemd/npm instead: dedicated `omniroute` system user, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true`, explicit `ReadWritePaths` = its data dir only.)
4. **Network default = localhost.** Bind `127.0.0.1:20128`. LiteLLM (also local) reaches it over loopback. Dashboard stays localhost-only (never public).
5. **Internal auth.** Set `REQUIRE_API_KEY=true` and enable the separate `requireAuthForModels` setting, then create a random DB-backed inference-only key through authenticated `/api/keys` for LiteLLM. Scope it to the admitted `/v1` endpoint(s) and model allowlist, set a rate limit/expiry and `noLog`, and prove denial outside that scope. Do **not** hand LiteLLM the environment-derived `OMNIROUTE_API_KEY` or `ROUTER_API_KEY`: upstream synthesizes that class with `manage` scope, unlimited access, and logging enabled. Define a coordinated rotation procedure (install next key, update LiteLLM, verify, revoke old key); reprobe config regeneration alone does not rotate the upstream key.
6. **If actually shared externally** (decision D3): expose **only** the `/v1` inference path via a *new* subdomain (`omniroute.techinsiderbytes.com`) behind CF Tunnel + CF Access. Issue one independently revocable, DB-backed `/api/keys` key per consumer with endpoint/model scopes, rate limits, expiry, and `noLog`, and verify it through the production inference middleware. Never expose the dashboard or `/api/*`. This surface is disjoint from `control.techinsiderbytes.com` and the personal stack. Do not assume another gateway supplies privacy controls; any front door needs its own pinned audit.
7. **Prompt/data boundary.** Default allow only synthetic health probes and content classified public. Before real workloads, verify request/response log retention, disable content logging where possible, define redaction, and obtain an explicit disposition for private drafts, credentials in prompts, personal data, and unpublished dossiers.
8. **Egress boundary.** Deny host, RFC1918, loopback, link-local, and cloud-metadata destinations from the container; allow only reviewed provider hosts plus required DNS/HTTPS. Test SSRF resistance with synthetic endpoints before enabling any third-party adapter.

---

## 3. Deployment (Phase 1)

1. Pin `diegosouzapw/OmniRoute` at a reviewed commit/tag and immutable image digest; read its operator/provider references; audit every candidate adapter for auth type, ToS, prompt transport, logging, redirects, and egress/secret handling.
2. Produce the provider manifest and reject anything not proven `truly-keyless` or `dedicated-nonpersonal-key`.
3. Build/use only the pinned `runner-base` image, then run the hardened container (§2.3), bound to `127.0.0.1:20128`, with the reviewed egress policy and only its private data volume. Prove the Docker socket and all agent-home paths are absent.
4. First-boot config (dashboard over an SSH tunnel, never public): inject `INITIAL_PASSWORD` and `STORAGE_ENCRYPTION_KEY` through the proven secret-delivery path; set `REQUIRE_API_KEY=true` and `requireAuthForModels`; create least-privilege DB-backed `/api/keys` inference keys; enable only manifest-approved providers; and disable internal fallback/combos during attribution tests. Confirm the default-manage environment key is not used by LiteLLM or any consumer. Store a sentinel through the credential path and inspect SQLite to prove ciphertext; upstream falls back to plaintext when encryption material is absent or encryption fails.
5. Health: `GET /api/health/ping`, then authenticated `GET /v1/models` → confirm a non-empty connected-model list; compare only for diagnostics with `/api/models/catalog`. Add a systemd unit or Docker restart policy plus a bounded watchdog only after the observation run is clean.

**Definition of done (P1):** the pinned image answers synthetic `/v1/chat/completions` probes on at least three manifest-approved models over loopback; holds zero personal credentials; cannot read host secret paths; cannot reach denied host/private/metadata addresses; emits no prompt/credential content to its logs; and produces provider/model attribution for every hop.

## 4. Wire into the rotation (Phases 2–4)

**P2 — LiteLLM backends (through sanctioned owners, not by hand).** For each healthy manifest-approved OmniRoute model, add a logical entry mirroring the existing shape:
```yaml
  - model_name: omniroute-<slug>
    litellm_params:
      model: openai/<omniroute-alias/model>
      api_base: http://127.0.0.1:20128/v1
      api_key: os.environ/OMNIROUTE_TOKEN   # internal token, not personal
      timeout: 60
      stream_timeout: 60
```
Model registration follows the existing sanctioned `model-health-check.mjs` add/hot-add path; fallback-chain placement follows `model-fallback-reprobe.py`. Never hand-edit `/etc/litellm/config.yaml`, and do not trigger a restart while the R1 observation window is active without separate authorization.

**P2 — placement in the fallback chains.** OmniRoute is an extra hop (LiteLLM→OmniRoute→provider), so tier it for **breadth, after** direct free providers in the free-first chain, consistent with the memory rules (`free_models_first`, `fallback_breadth`, `provider_cycling`): `… nvidia → groq → cerebras → openrouter → **omniroute** → … → paid last`. Add "omniroute" as a provider in the reprobe's cycling set.

**P3 — discovery in shadow first.** Read OmniRoute's authenticated `GET /v1/models` with `requireAuthForModels` proven active, validate/canonicalize IDs, reject collisions and non-text models, cap inventory, require manifest/free-tier proof, and record a shadow diff. New IDs need repeated healthy observations; missing IDs age out across multiple cycles and provider-wide outages retain the prior inventory. Promotion/removal is atomic and separately authorized; a discovery result must not silently restart LiteLLM.

**P4 — Control Surface visibility.** Top-level calls flow through LiteLLM, but `gateway_calls.resolved_model` does not prove OmniRoute's final upstream provider/model when it internally falls back. Disable OmniRoute fallback for discrete attribution or add hop-level correlation/receipts before claiming provider truth. Register OmniRoute as a governed actor/provider and label the aggregator hop explicitly on `/models`.

**P5 (optional) — controlled sharing.** Only if D3 = yes: the hardened `/v1` subdomain + CF Access + separately scoped DB-backed `/api/keys` credentials (§2.6). The audited `/api/v1/registered-keys` path is explicitly out of scope until its validator is proven in the production inference call graph.

## 5. Similar projects — add or suggest

Grounded survey (the operator asked to "add them or suggest"):

| Project | What | Verdict |
|---|---|---|
| **OmniRoute** (diegosouzapw) | MIT, OpenAI-compatible multi-provider gateway; upstream inventory totals are volatile | **EVALUATE FOR ADDITION** — this gated plan; not approved for deployment yet |
| [**Portkey Gateway**](https://github.com/Portkey-AI/gateway/tree/669825cbe89ee51569918b8f78a9db486fd69dd4) | MIT; Gateway 2.0 is pre-release; OSS guardrail plugins exist, while turnkey PII redaction is advertised as Enterprise | **EVALUATE ONLY** — not a presumed privacy front door; audit every guardrail's third-party data flow before use |
| [**Free LLM Gateway**](https://github.com/MrFadiAi/free-llm-gateway/tree/749941ec2c869179ea64c4e65b0a317efbb0718e) (MrFadiAi) | OpenAI-compatible free-provider aggregator | **REJECT at audited main** — [unauthenticated key mutation](https://github.com/MrFadiAi/free-llm-gateway/blob/749941ec2c869179ea64c4e65b0a317efbb0718e/main.py#L702-L829) and [raw master-key disclosure](https://github.com/MrFadiAi/free-llm-gateway/blob/749941ec2c869179ea64c4e65b0a317efbb0718e/main.py#L960-L993) violate the isolation boundary |
| [**FreeLLMAPI**](https://github.com/tashfeenahmed/freellmapi/tree/e88c5cc3c9600490da27a841f8dc3cb76c7549a6) (tashfeenahmed) | MIT, single-user/non-production aggregator; syncs an external signed catalog and retains request analytics by default | **LOCAL EVALUATION ONLY** — [upstream explicitly says not to expose/share](https://github.com/tashfeenahmed/freellmapi/blob/e88c5cc3c9600490da27a841f8dc3cb76c7549a6/README.md#L769-L776); not eligible for this shared rotation |
| [**gpt4free**](https://github.com/xtekky/gpt4free/tree/68b4b4d6418a95d684d382e8392844c5846b725c) (xtekky) | Reverse-engineered/browser-automated access with persisted cookies/HAR support | **AWARENESS ONLY** — high ToS/security risk; keep out of the shared path entirely |
| LiteLLM / OpenRouter | Already the core / already in the chain | incumbent |

**Recommendation:** evaluate OmniRoute first, starting with Pollinations-only synthetic traffic. Do not deploy the currently audited MrFadiAi/free-llm-gateway. Revalidate every alternative against its current primary documentation and pinned source before adoption; do not add a second aggregator until the first produces clean isolation, attribution, and reliability evidence. If sharing externally is later approved, evaluate a separately pinned/red-team-tested front door; product claims such as PII redaction are not substitutes for local verification. Keep reverse-engineered aggregators off any shared surface.

## 6. Risks & mitigations

- **Aggregator trust / reverse-engineered providers** → sandbox, pin commit, manifest-approved providers only, audit egress, semi-untrusted posture.
- **Extra-hop latency & double-fallback opacity** → tier OmniRoute after direct providers; let LiteLLM/reprobe own the top-level chain; use OmniRoute's own combos sparingly.
- **Prompt or credential leakage if shared** → §2 credential, data-classification, retention, and egress boundaries; least-privilege DB-backed per-consumer keys and quotas are necessary but not sufficient.
- **Free-tier volatility** → reprobe health + discovery already handle churn; OmniRoute models prune/promote like any other.
- **Maintenance** → watchdog + Control Surface health states surface breakage; MIT + self-host means no vendor lock.

## 7. Rails

- Model registration via the sanctioned health-check path and fallback edits via reprobe; **CS never writes `/etc/litellm/config.yaml`** (A4c stands).
- No personal credential, reused personal password, or PII inside OmniRoute. Generated, independently rotatable service credentials are allowed only through the approved delivery path.
- Dashboard never public; inference path only, behind CF Access + least-privilege DB-backed per-consumer keys if shared.
- Deploy sandboxed; verify it cannot read secret paths before trusting it.
- This document is a **plan**. No deployment, container, or config change happens until the operator approves the open decisions below.

## 8. Open decisions (operator)

- **D1 — Runtime:** Docker (recommended, best isolation) vs npm+systemd. *Default: Docker.*
- **D2 — Integration mode:** enumerate manifest-approved OmniRoute models as discrete LiteLLM backends (recommended for attribution) vs a few OmniRoute "combo" endpoints. *Default: discrete models with internal fallback disabled during validation.*
- **D3 — Sharing scope:** internal-only (localhost, simplest, safest) vs externally shared (needs the separately authorized P5 hardened subdomain and a fresh front-door audit). *Default: internal-only until you say otherwise.*
- **D4 — Second aggregator now or later:** evaluate another candidate only after OmniRoute, or stop at OmniRoute. The currently audited MrFadiAi/free-llm-gateway is not eligible. *Default: OmniRoute first, no second deployment.*
- **D5 — Data class:** synthetic/public-only (recommended initial gate) vs permission for real editorial prompts after retention/redaction proof. *Default: synthetic/public-only.*
- **D6 — Provider manifest:** truly keyless only vs dedicated nonpersonal credentials also allowed. *Default: truly keyless for the first observation run.*
