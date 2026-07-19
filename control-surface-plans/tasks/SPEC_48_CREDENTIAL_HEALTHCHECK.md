# SPEC 48 — API-key / credential healthcheck (separate the dead key from the dead model)

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` **R4** (credentials, "the degraded bucket — fix, don't prune") + SPEC 43 `deriveHealthState` "degraded" · **Date:** 2026-07-18 UTC · **Status:** implementation contract
**Operator ask:** *"add an api key healthcheck with the model checks — maybe the models are failing due to the key expiring."*

**Type:** additive and observation-only. A per-provider credential probe that runs with the full model check, plus a fresh, status-only annotation in the existing model-health read path. This spec does **not** change fallback membership, pruning, quarantine, or recovery policy; those changes require a separate policy-versioned SPEC 46 slice and fresh shadow receipts.

## 1. Outcome

Today the health system probes **models** (`model-health-check.mjs` → `/var/lib/mimule/model-health.json`; reprobe → chains) but never probes the **credential** behind a provider. So an expired key, exhausted quota, rate limit, entitlement failure, and dead model are indistinguishable — exactly R4's ambiguity: `github-gpt41` (159 historical `auth` failures → `GITHUB_TOKEN`) and `coding-go-minimax-m3` (11 historical `auth` failures, 80.8%→0% → `OPENCODE_GO_API_KEY`) need current credential evidence before the operator can choose a repair. A route that earned 526 calls **deserves a diagnosed incident, not a delete based on a guessed cause.**

This slice adds a cheap per-**provider-key** probe that classifies each credential as `valid | missing | invalid | expired | revoked | quota | rate_limited | unknown`, records it (status only, never the value), and annotates every logical model gated by that key. Existing earned-history/auth evidence still decides whether a route is `degraded`; a fresh credential result makes the reason authoritative instead of guessed.

## 2. Verified facts (grounded)

- Provider keys are env vars referenced from `/etc/litellm/config.yaml` as `os.environ/<NAME>`, values in `/etc/litellm/litellm.env`. The schema-v1 allowlist is exact and name-only: `CEREBRAS_API_KEY`, `CEREBRAS_API_KEY_PAID`, `CLOUDFLARE_API_TOKEN` (with account ID only as adapter context), `GEMINI_API_KEY`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `NVIDIA_NIM_API_KEY`, `OPENCODE_GO_API_KEY`, `OPENCODE_ZEN_KEY`, and `OPENROUTER_API_KEY`. `LITELLM_MASTER_KEY`, personal/internal credentials, and arbitrary `*_KEY` discovery are excluded.
- `model-health-check.mjs` (`/opt/mimoun/scripts/`, on `model-health-check.timer`) runs the full check every **6 hours**; a separate quick refresh runs every 15 minutes. Credential probes run on the full cycle only. No unit edit is needed.
- SPEC 43 `server/api/modelHealthState.ts` already has a **`degraded`** state driven by auth signals; today it *infers* credential trouble from N ledger `auth` failures. This spec gives it an **authoritative** provider-key signal.
- CLAUDE.md rails: never commit `.env`/keys; CS never writes `config.yaml`; logical names only.

## 3. The credential probe

Add a pure `credential-health.mjs` module beside `model-health-check.mjs` and invoke it from the existing full-cycle path. Per explicitly allowlisted provider credential referenced by LiteLLM config:

- Build the canonical `model_name` → `api_key: os.environ/<NAME>` relationship from `/etc/litellm/config.yaml`. Do not infer it from model prefixes or `MODEL_REGISTRY`; the latter misses the exact `coding-go-*` routes.
- Use a pinned adapter registry per allowed credential. Prefer a provider-native account/credential endpoint; use an authenticated model listing only where it actually validates access; use one fallback-disabled, one-token representative completion only where no authoritative zero-token endpoint exists. Never probe `LITELLM_MASTER_KEY` or discover arbitrary `*_KEY` variables.
- **At most one request per key per full cycle.** Missing keys make no network request. A bounded lock/minimum interval prevents overlapping quick/full invocations.
- **Classify by outcome:**
  | Signal | Status |
  |---|---|
  | authenticated success whose adapter contract proves access | `valid` |
  | key absent | `missing` |
  | 401 or explicit invalid-key response | `invalid` (`expired` or `revoked` only when explicitly reported) |
  | bare 403 / entitlement or scope ambiguity | `unknown` |
  | 402 / "insufficient balance" / quota-exhausted | `quota` |
  | 429 | `rate_limited` (not proof that completion access is otherwise healthy) |
  | network / timeout / 5xx | `unknown` (infra, not the key) |
- Provider bodies are read only into a small bounded buffer for allowlisted sentinel matching. They are never logged or persisted.

### Output — `/var/lib/mimule/credential-health.json`

```jsonc
{
  "schemaVersion": 1,
  "policyVersion": "credential-observation-v1",
  "runId": "<random non-secret id>",
  "generatedAt": <epoch-ms>,
  "expiresAt": <epoch-ms>,
  "credentials": {
    "OPENCODE_GO_API_KEY": {
      "provider": "opencode-go",
      "status": "expired",         // valid|missing|invalid|expired|revoked|quota|rate_limited|unknown
      "httpCode": 401,
      "checkedAt": <epoch-ms>,
      "sinceStatus": <epoch-ms>,   // when it first entered a non-valid status (hysteresis)
      "gatesModels": ["coding-go-minimax-m3", ...],  // logical names this key routes
      "present": true              // is the env var set at all
    }
  }
}
```

**Never** store, log, hash-reversibly, or surface the key value or any provider error body that might echo it — persist only status/code/timestamps. Redact bodies before use.

The artifact is bounded, atomically replaced, symlink-safe, root-owned, and mode `0600`. The reader accepts only schema v1, allowlisted status/field values, bounded model/env names, and evidence no older than **13 hours** (slightly over two 6-hour opportunities). Missing, malformed, or stale evidence fails open as `unknown` and cannot affect `healthState`.

## 4. Wire into the model checks & classifier

- **Attribution:** the Control Surface reads `credential-health.json` and attaches a bounded `credentialHealth` annotation to every gated model. It never reads provider values.
- **Classifier (SPEC 43):** keep all existing state thresholds and precedence. When an earned route already qualifies as `degraded` because of corresponding auth/quota evidence, a fresh `invalid|expired|revoked|quota` result replaces "likely" with a status-specific, timestamped reason. Unproven routes retain their existing state and receive a separate `credentialBlocked` annotation; `valid`, `rate_limited`, `unknown`, stale, and malformed evidence cannot manufacture health.
- **Routing boundary:** reprobe behavior is unchanged in this slice. A future policy must define quarantine as removal from active fallbacks while preserving registration, earned history, and recovery eligibility; it needs a policy-version bump, fresh three-cycle shadow receipts, and separate activation authorization.

## 5. Control Surface surface (read-path)

- A **Credentials / API Keys** panel (or a section on `/models`): per-key `status`, freshness, `checkedAt`, and `gatesModels`. Use status-specific guidance: rotate for `invalid|expired|revoked`, configure for `missing`, restore quota for `quota`, wait/back off for `rate_limited`, investigate for `unknown`.
- On a model detail page, when `healthState=degraded` for a credential reason, show *"down because its key (`<ENV_VAR>`) is `expired` since `<date>` — not the model"* — the R4 recover-don't-prune message.
- **Never render the key value** — only the env-var name and status. Reuse the SPEC 43 health surface; this is one more signal on it.

## 6. Security rails (hard)

- Read keys from env only. **Persist/render status only** — never the value, never a reversible hash, never in the ledger, UI, logs, or error text. Redact provider error bodies.
- Probes are read-only, cheap, bounded, rate-limit-aware, and restricted to pinned HTTPS hosts. No key is written anywhere new; no new secret file is created.
- CS remains read-only over credentials — it *reports* a dead key and tells the operator to rotate it; it never reads, writes, or transmits the value. `config.yaml` stays reprobe-owned.
- `.env`/keys never committed (CLAUDE.md).

## 7. Build split & verification

- **P1 — probe (data source, low blast radius):** `credential-health.mjs` + `credential-health.json`, invoked only by the 6-hour full check. Verify with synthetic sentinel secrets and mocked provider responses: one request/key, missing-key zero requests, strict host/method/body caps, every status mapping, hysteresis, atomic output, and serialized output contains no input secret or response sentinel. The live run validates structure and journals without placing real secret values or prefixes in command arguments/process listings.
- **P2 — classifier annotation (CS, additive):** strict/stale-aware reader plus model annotation. Hermetic tests: earned auth failure + fresh invalid key → same `degraded` state with authoritative rotate reason; unearned model state unchanged but annotated; valid/rate-limited/unknown/stale/malformed evidence never changes state. `bun run check` + bounded tests green.
- **P3 — CS surface:** the credentials panel / detail callout; UI presentation tests (never renders a value).

## 8. Rails

- Additive; no routing/config write; reprobe owns `config.yaml`; logical names only.
- Kill by PID; ps-check before git ops.
- P1 lands in `/opt/mimoun` (probe); P2/P3 in `/opt/opencode-control-surface` (read-path), committed separately. Any reprobe/quarantine work is a third, separately authorized routing-policy slice.

## 9. Implementation status — shipped 2026-07-18 UTC

- P1 shipped at `/opt/mimoun@84770ba`; P2/P3 shipped and deployed at `/opt/opencode-control-surface@56934b0`.
- Verification: 15 focused Node tests, 23 existing reprobe tests, 50 focused Control Surface tests / 220 expectations, and `bun run check` all pass. Two independent final reviews found no remaining P0/P1.
- Live artifact: `/var/lib/mimule/credential-health.json`, schema v1, root-owned `0600`, ten accepted rows. No key value/provider body is present.
- Current diagnosis: OpenCode Go credential `valid`; `coding-go-minimax-m3` live and `coding-go-mimo-pro` slow. GitHub and OpenCode Zen are `rate_limited`, not proven expired. NVIDIA is inconclusive. Cloudflare/Groq's first persisted rows remain conservatively `unknown`; the corrected bounded official endpoints separately validate both current credentials as valid/200 and fake credentials as invalid/401, and the next eligible scheduled refresh will update the artifact.
- Boundary held: no routing/config write, pruning, quarantine, LiteLLM restart, or policy activation. `credentialBlocked` is an observation field only.
