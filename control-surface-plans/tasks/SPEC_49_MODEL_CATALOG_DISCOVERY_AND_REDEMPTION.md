# SPEC 49 — complete model catalogs, free-model admission, and bounded redemption

**Date:** 2026-07-18 UTC
**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` R3/R4/R5
**Status:** implemented and pushed in `/opt/mimoun@4007b3f`; first scheduled full-run evidence pending

## 1. Outcome

The model-health system must distinguish four facts that were previously collapsed:

1. a provider currently lists a model;
2. policy considers that model eligible for this rotation;
3. a credential can access the provider;
4. the model produced a substantive response in a bounded probe.

Only the fourth fact can admit a newly discovered route into LiteLLM. A catalog entry is an invitation to test, not proof that a model works. A credential-listing `200` is not proof that completion quota exists. A formerly failing model may earn another bounded test when a complete catalog still lists it, but a `429`, `5xx`, empty body, malformed body, or provider quota notice cannot redeem or promote it.

## 2. Verified provider snapshot

This is a 2026-07-18 UTC observation, not a permanent model count.

| Source | Observed catalog | Integration decision |
|---|---:|---|
| AIHubMix detailed public catalog | 812 records; 29 zero input/output price; 27 text/chat candidates after removal/image filtering | Discover from public pricing, intersect with the key-visible list, then require a substantive completion before registration |
| AIHubMix key-visible `/v1/models` | 355 records | Access evidence only; not pricing evidence |
| `api.inferera.com` | Same AIHubMix service and model inventory | Documented backup hostname, not an independent provider or redundancy domain |
| OpenRouter | 344 records | Admit only explicit zero-prompt and zero-completion pricing |
| GitHub Models | 37 records; 35 text-output and 2 embeddings | Use current namespaced catalog ids and official `models.github.ai` inference endpoint; exclude embeddings |
| Groq | 15 records | Catalog all text/chat candidates; free-tier eligibility remains an explicit operator policy |
| OpenCode Zen | 55 records | Catalog all raw ids; only policy-eligible candidates enter testing |
| Cerebras | 3 current records | Stop trusting removed static ids; keep free and paid credential identities separate |
| NVIDIA NIM | 119 records | Catalog and probe through the pinned official endpoint |
| Gemini | 54 records | Catalog models supporting `generateContent`; treat quota/tier as explicit policy, not verified zero-price |
| Cloudflare Workers AI | 26 Text Generation records | Traverse the bounded result set; remove the former 12-model slice |
| OpenCode CLI | 229 records overall | Record complete raw Alibaba and OpenCode Go namespaces without replacing the separate role-roster discovery job |

Arena API, Mammouth AI, and Lookatmy.ai are not admitted by this slice. Arena has a documented authenticated, credit-billed developer API but no verified public free API catalog. Mammouth exposes 79 public catalog records and none has both input and output price equal to zero. Lookatmy.ai has a free consumer product and BYOK behavior but no documented public developer API. Consumer endpoints must not be scraped to manufacture a provider integration.

## 3. Canonical catalog artifact

Full model-health runs produce `/var/lib/mimule/model-catalog.json` with:

- schema and policy version;
- run id and UTC generation time;
- one record per bounded provider adapter;
- raw ids, policy-eligible ids, exact counts, sorted hashes, pages, and sanitized error class;
- added and removed ids relative to the last accepted complete observation;
- `complete`, `carriedForward`, and `lastSuccessfulAt` evidence.

The artifact is root-owned, mode `0600`, size-bounded, written through exclusive temporary creation plus `fsync` and atomic rename, and must not contain credentials or raw provider error bodies.

An incomplete, oversized, redirected, malformed, empty-after-nonempty, or implausibly collapsed catalog cannot invent removals. It carries forward the last accepted provider inventory and records why. First deployment seeds continuity from the current health/config evidence so a partial first scan cannot erase previously discovered models. Destructive catalog removals require repeated complete observations or an equally strong explicit policy decision.

## 4. Provider adapters

Every adapter must have:

- a pinned HTTPS origin;
- redirect rejection;
- a total deadline that remains active through bounded body consumption;
- maximum bytes, items, and pages;
- exact response-schema validation;
- lossless provider/model identity;
- a conservative text/chat eligibility predicate;
- sanitized status/category-only failures.

Provider ids are untrusted configuration input. They must pass a conservative character/length contract and be safely quoted before any YAML generation. Config replacement is atomic and validated; malformed ids cannot corrupt `config.yaml`.

### AIHubMix

- Read zero-price evidence from `https://aihubmix.com/api/v1/models`.
- Read key visibility from `https://aihubmix.com/v1/models`.
- Intersect exact `model_id` values.
- Require numeric zero `pricing.input` and `pricing.output`.
- Require text-capable LLM/chat behavior and reject image generation, embeddings, audio-only, reranking, moderation, and other incompatible modalities even when a record also contains an `llm` tag.
- Treat AIHubMix and inferera as one provider identity.
- Normalize the observed canned HTTP-200, zero-token balance/quota response to unavailable. Never persist its text.

### GitHub Models

- Use `https://models.github.ai/catalog/models`.
- Use exact catalog ids such as `openai/gpt-4.1` for current inference.
- Admit records with text output, excluding embedding output.
- Preserve legacy logical routes until a separately verified migration or create a distinct official route after a direct substantive success. Exact-name detection must not silently leave a route on an obsolete endpoint while claiming it migrated.

## 5. Admission proposal and separate activation

A newly discovered direct model can become an activation proposal only when all conditions hold in the same full run:

- its provider inventory is complete and current;
- the exact model id is policy-eligible;
- required credential evidence covers the credential now in use;
- a bounded direct probe returns HTTP `200`;
- the response satisfies the explicit probe contract, not merely JSON syntax;
- no manual `forceBlock` applies;
- the model is inside per-provider and global new-probe caps.

The result records a `probeSucceededThisRun` or equivalent field. Copy-forward state, an old `available=true`, a credential-list success, a bare provider `200`, or `jsonOk` being merely non-false cannot propose a model.

Discovery itself is observation-only: it does not edit LiteLLM configuration, hot-add a model, or restart LiteLLM. It writes an atomic current-evidence proposal containing the exact provider/model identity, pricing evidence, probe time, and activation state. Proposed routes remain unavailable to workload probes, ranking, and fallbacks.

Configuration apply, runtime hot-add, and any necessary restart are separate authorized evidence events. A later apply path must revalidate current catalog, credential, price, and substantive-probe evidence; stale, removed, newly paid, or otherwise ineligible proposals expire rather than carrying forward by name. Runtime activation clears a proposal only after a bounded authenticated model-inventory check proves the exact route active. Any LiteLLM restart remains subject to the existing repair-arc restart gate.

An existing quality `forceAllow` is not spend authorization. Providers whose catalog proves only account visibility or included quota require a distinct `billingApproved=true` policy with explicit operator provenance before completion probes, workload probes, activation proposals, or fallback probing. Only AIHubMix/OpenRouter records with verified zero input and output price can enter the automatic free-first probe lane.

## 6. Bounded redemption

Redemption runs only during a full catalog scan.

- A prior unavailable, degraded, probation, or automatic quality-blocked route may be selected only when the current complete catalog still contains its exact id.
- A manual policy `forceBlock` is authoritative and cannot be bypassed by discovery.
- Selection is oldest-first and fair across providers, with per-provider and global caps.
- Quick refreshes may perform their existing bounded stale-healthy observations, but cannot run an uncapped blocked/degraded redemption cohort.
- Catalog-absent models cannot escape into a generic stale path.
- Recovery notices and health/ranking changes require a substantive current-run success.

Fallback reprobe promotion requires three consecutive substantive HTTP `200` observations whose bounded assistant payload satisfies the probe contract. Empty, malformed, or provider quota/balance bodies do not count. `429`, `500`, and `503` may preserve an incumbent during a transient provider problem but cannot build recovery evidence for a non-incumbent.

## 7. Price and eligibility drift

Auto-discovered routes retain provenance linking logical name, provider, exact model id, catalog policy version, and eligibility evidence.

- A new promotion requires a current, complete, policy-eligible catalog record.
- If a later complete AIHubMix catalog shows that a route is no longer zero-price/text-eligible, the route is quarantined from the free rotation and cannot be retained merely because it still returns `200`.
- Authoritative ineligible, newly paid, or unapproved dynamic routes are removed from the fallback probe queue before any network request. Unknown non-incumbents wait for bounded full-scan redemption rather than consuming scheduled probe traffic.
- An incomplete or stale catalog cannot create promotion evidence.
- Static/manual routes are not removed by name-prefix guesses. Their policy remains explicit and independently reviewable.
- Gemini, GitHub, Groq, Cloudflare, NVIDIA, and subscription-backed providers must be labeled according to their actual tier assumption; they are not described as verified zero-price merely because a free quota may exist.

This contract prevents the catalog checker and the fallback reprobe from disagreeing in a way that causes surprise billing.

## 8. Concurrency and test-session hygiene

Model health and fallback reprobe share one PID/start-tick-aware lock so they cannot write overlapping health, catalog, config, or pool state.

Every OpenCode health/workload probe uses the exact reserved title namespace `__mimule_probe_v1__:` through argv, never shell interpolation. This marker is a producer signal for the separate immutable visibility migration in `ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md`; it does not by itself make existing sessions private.

Every full scan refreshes the bounded credential observation once per relevant key and consumes the fresh status before model fan-out. Definitive invalid, expired, revoked, or quota evidence suppresses redundant per-model completion/workload probes and removes old availability from ranking; rate-limit evidence is handled conservatively, and unknown evidence remains fail-open. The artifact records only the credential name/status and affected logical models, never values or provider bodies.

The adjacent `/usr/local/bin/mimule-model-discovery.py` job remains a separate role-roster generator. Its non-atomic registry write is a future hardening slice and must not be confused with this catalog artifact.

## 9. Acceptance tests

Hermetic tests must execute, not merely source-match, the following behavior:

- the live AIHubMix record shape and the mixed `image_generation,llm` exclusion;
- the live GitHub text-output and embedding record shapes;
- redirect, timeout, oversize, malformed, empty, and partial catalog failure;
- first-run seeding, non-empty collapse carry-forward, and confirmed removal hysteresis;
- exact identity and logical-name collision handling;
- exact parsed config membership and adversarial YAML ids;
- newly added credential coverage despite a young cached artifact;
- capped, fair, full-only redemption and quick-mode exclusion;
- catalog-absent and manually force-blocked models staying out;
- HTTP-200 malformed/canned responses not recovering, ranking, notifying, registering, or promoting;
- three consecutive substantive HTTP-200 promotion and reset on `429`/`5xx`;
- price/eligibility removal quarantining only auto-discovered routes;
- unapproved included-quota routes making no completion/workload/fallback network call, and `forceAllow` alone not authorizing spend;
- definitive shared-credential failure suppressing fan-out across affected models while a full scan refreshes same-name key rotations;
- activation proposals expiring on price/eligibility drift and remaining outside rankings until exact runtime proof;
- discovery containing no config-write, hot-add, or service-restart path;
- atomic `0600` writes, lock overlap, stale-lock recovery, and no secret/provider-body leakage;
- both OpenCode probe producers using the exact versioned marker.

Focused tests are followed by JavaScript syntax checks, Python tests without bytecode artifacts, `git diff --check`, and a no-secret staged diff scan. A live full run is a separate operational action because it queries provider catalogs and may perform bounded verified-zero or explicitly billing-approved model probes. It produces proposals only; it cannot mutate LiteLLM configuration or restart a service.

## 10. Deployment boundary

The supplied AIHubMix key belongs only in `/etc/litellm/litellm.env` as `AIHUBMIX_API_KEY`, mode `0600`, and never in Git, plans, logs, process arguments, or browser state. Because it was pasted into chat, rotation is recommended even if it remains functional.

The current key-visible catalog advertises free ids, but the observed completion responses converged to a canned zero-token balance/quota message. Therefore this session has **zero durably verified working AIHubMix free models**, and no AIHubMix route may be added merely from the catalog. The scheduled full scanner may retest within its bounds after credential/quota recovery and propose only a substantive success for the separately authorized activation path.

No Arena, Mammouth, Lookatmy, OmniRoute, inferera-duplicate, or other research candidate is deployed by this specification. OmniRoute remains governed by `OMNIROUTE_INTEGRATION_PLAN.md` and its separate credential-isolation authorization.

## 11. Implementation evidence — 2026-07-19 UTC

`/opt/mimoun@4007b3f` implements this contract in eight scoped files and is pushed to `origin/main`. The full scanner now writes a bounded canonical catalog, detects additions/removals/schema and eligibility drift, refreshes credential evidence before model fan-out, gives exact catalog identities a capped full-scan redemption opportunity, and rejects empty, malformed, canned quota, rate-limit, and server-error responses as promotion evidence.

Discovery remains observation-only. It can write current evidence and exact identity-bound activation proposals, but it cannot edit either routing configuration, hot-add a model, or restart LiteLLM. The Python reprobe remains the sole fallback writer and now pair-validates both routing candidates, uses atomic metadata-preserving replacement, detects an operator/config race, rolls back the first target if the second replacement fails, and records bounded success or failure receipts. Exact configured and runtime provider/model/backend binding is required before a proposal can leave `activationPending` or enter ranking.

Acceptance gates passed once after the final repair: 50 Node tests, 50 Python tests, three JavaScript syntax checks, Python AST parsing, tracked and untracked whitespace checks, exact frozen-diff SHA-256 `acaeaabae5c1e6d8f793bf0ebdaf027234e49952fc3c73cfa2c44049a946624b`, a high-confidence secret scan, and bytecode/temp-artifact hygiene. The first natural full scan is intentionally left to the existing timer; no manual scan or service restart was used to manufacture acceptance evidence.
