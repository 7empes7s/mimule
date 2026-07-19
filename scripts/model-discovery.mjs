import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fchownSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { acquireCredentialProbeLock } from "./credential-health.mjs";

export const MODEL_CATALOG_SCHEMA_VERSION = 1;
export const MODEL_CATALOG_POLICY_VERSION = "bounded-provider-inventory-v1";
export const MODEL_CATALOG_FILE = "/var/lib/mimule/model-catalog.json";
export const DEFAULT_MODEL_HEALTH_LOCK = "/run/model-health-check.lock";
export const MAX_CATALOG_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_CATALOG_ARTIFACT_BYTES = 4 * 1024 * 1024;
export const MAX_CATALOG_ITEMS = 10_000;
export const MAX_CATALOG_PAGES = 100;
export const DEFAULT_CATALOG_TIMEOUT_MS = 15_000;
export const DEFAULT_REDEMPTION_PER_PROVIDER = 3;
export const DEFAULT_REDEMPTION_GLOBAL = 18;
export const DISCOVERY_RESTART_POLICY = "separate-authorized-workflow";
export const LEGACY_CATALOG_MIGRATION_VERSION = "health-artifact-2026-07-18-v1";
export const LEGACY_CATALOG_QUARANTINE = "unclassified-legacy-v1";

const DYNAMIC_PROVIDER_ADMISSION = Object.freeze({
  aihubmix: Object.freeze({
    eligibilityBasis: "zero-price-public+key-visible",
    pricingEvidence: "verified-zero-price",
    pricingTier: "free-rate-limited",
    rotationClass: "free-first",
    autoPromotionPolicy: "automatic-verified-zero",
  }),
  openrouter: Object.freeze({
    eligibilityBasis: "zero-price-provider-catalog",
    pricingEvidence: "verified-zero-price",
    pricingTier: "free-rate-limited",
    rotationClass: "free-first",
    autoPromotionPolicy: "automatic-verified-zero",
  }),
  github: Object.freeze({
    eligibilityBasis: "text-capable-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  groq: Object.freeze({
    eligibilityBasis: "text-capable-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  cloudflare: Object.freeze({
    eligibilityBasis: "text-capable-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  cerebras: Object.freeze({
    eligibilityBasis: "text-capable-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  nvidia: Object.freeze({
    eligibilityBasis: "text-capable-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  gemini: Object.freeze({
    eligibilityBasis: "generateContent-account-catalog",
    pricingEvidence: "included-quota-unverified",
    pricingTier: "unverified",
    rotationClass: "manual-approval-required",
    autoPromotionPolicy: "manual-approval-required",
  }),
  zen: Object.freeze({
    eligibilityBasis: "approved-subscription-catalog",
    pricingEvidence: "subscription-policy",
    pricingTier: "subscription",
    rotationClass: "subscription",
    autoPromotionPolicy: "operator-approved-subscription",
  }),
  alibaba: Object.freeze({
    eligibilityBasis: "approved-subscription-catalog",
    pricingEvidence: "subscription-policy",
    pricingTier: "subscription",
    rotationClass: "subscription",
    autoPromotionPolicy: "operator-approved-subscription",
  }),
  opencode: Object.freeze({
    eligibilityBasis: "approved-subscription-catalog",
    pricingEvidence: "subscription-policy",
    pricingTier: "subscription",
    rotationClass: "subscription",
    autoPromotionPolicy: "operator-approved-subscription",
  }),
});

// The pre-v1 health writer did not persist catalog provenance. This frozen,
// versioned set is the reviewed identity inventory from the last artifact made
// by that writer. It is deliberately exact: prefixes and logical names are not
// sufficient proof that an old row was auto-discovered. Anything else outside
// MODEL_REGISTRY is retained for operator visibility but quarantined below.
const REVIEWED_LEGACY_CATALOG_IDENTITIES_V1 = new Set([
  "openrouter\0tencent/hy3:free",
  "openrouter\0poolside/laguna-xs-2.1:free",
  "openrouter\0nvidia/nemotron-3.5-content-safety:free",
  "openrouter\0nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter\0nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "openrouter\0poolside/laguna-m.1:free",
  "openrouter\0google/lyria-3-pro-preview",
  "openrouter\0google/lyria-3-clip-preview",
  "openrouter\0openrouter/free",
  "openrouter\0openai/gpt-oss-20b:free",
  "openrouter\0qwen/qwen3-coder:free",
  "openrouter\0cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "openrouter\0meta-llama/llama-3.3-70b-instruct:free",
  "openrouter\0meta-llama/llama-3.2-3b-instruct:free",
  "openrouter\0nousresearch/hermes-3-llama-3.1-405b:free",
  "groq\0groq/compound",
  "groq\0allam-2-7b",
  "groq\0canopylabs/orpheus-arabic-saudi",
  "groq\0canopylabs/orpheus-v1-english",
  "groq\0groq/compound-mini",
  "groq\0llama-3.1-8b-instant",
  "groq\0openai/gpt-oss-20b",
  "groq\0qwen/qwen3.6-27b",
  "groq\0openai/gpt-oss-120b",
  "zen\0claude-fable-5",
  "zen\0claude-opus-4-8",
  "zen\0claude-opus-4-7",
  "zen\0claude-opus-4-6",
  "zen\0claude-opus-4-5",
  "zen\0claude-opus-4-1",
  "zen\0claude-sonnet-5",
  "zen\0claude-sonnet-4-5",
  "zen\0claude-sonnet-4",
  "zen\0claude-haiku-4-5",
  "zen\0gemini-3.5-flash",
  "zen\0gemini-3.1-pro",
  "zen\0gemini-3-flash",
  "zen\0gpt-5.6-sol",
  "zen\0gpt-5.6-terra",
  "zen\0gpt-5.6-luna",
  "zen\0gpt-5.5",
  "zen\0gpt-5.5-pro",
  "zen\0gpt-5.4-pro",
  "zen\0gpt-5.4-nano",
  "zen\0gpt-5.3-codex-spark",
  "zen\0gpt-5.2",
  "zen\0gpt-5.2-codex",
  "zen\0gpt-5.1",
  "zen\0gpt-5.1-codex-max",
  "zen\0gpt-5.1-codex",
  "zen\0gpt-5.1-codex-mini",
  "zen\0gpt-5",
  "zen\0gpt-5-codex",
  "zen\0gpt-5-nano",
  "zen\0grok-build-0.1",
  "zen\0grok-4.5",
  "zen\0deepseek-v4-pro",
  "zen\0deepseek-v4-flash",
  "zen\0glm-5.2",
  "zen\0glm-5.1",
  "zen\0glm-5",
  "zen\0minimax-m3",
  "zen\0kimi-k2.7-code",
  "zen\0kimi-k2.6",
  "zen\0kimi-k2.5",
  "zen\0qwen3.6-plus",
  "zen\0qwen3.5-plus",
  "zen\0deepseek-v4-flash-free",
  "zen\0mimo-v2.5-free",
  "zen\0hy3-free",
  "zen\0nemotron-3-ultra-free",
  "zen\0north-mini-code-free",
  "alibaba\0alibaba/qwen-plus",
  "alibaba\0alibaba/qwen-flash",
  "alibaba\0alibaba/qwen-turbo",
  "alibaba\0alibaba/qwen3.6-plus",
  "alibaba\0alibaba/qwen3-coder-plus",
  "alibaba\0alibaba/qwen3.6-27b",
  "alibaba\0alibaba/qwen-max",
  "alibaba\0alibaba/qwen3-235b-a22b",
  "alibaba\0alibaba/qwen3.5-plus",
  "alibaba\0alibaba/qwen3-next-80b-a3b-instruct",
  "opencode\0opencode-go/deepseek-v4-pro",
  "opencode\0opencode-go/deepseek-v4-flash",
  "opencode\0opencode-go/glm-5.1",
  "opencode\0opencode-go/kimi-k2.6",
  "opencode\0opencode-go/mimo-v2.5",
  "opencode\0opencode-go/mimo-v2.5-pro",
  "opencode\0opencode-go/minimax-m2.7",
  "opencode\0opencode-go/qwen3.6-plus",
  "cloudflare\0@cf/qwen/qwen2.5-coder-32b-instruct",
  "cloudflare\0@cf/qwen/qwq-32b",
  "cloudflare\0@cf/meta/llama-3.2-3b-instruct",
  "cloudflare\0@cf/meta/llama-3.1-8b-instruct-fp8",
  "cloudflare\0@cf/meta/llama-3.2-1b-instruct",
  "cloudflare\0@cf/google/gemma-4-26b-a4b-it",
  "openrouter\0cohere/north-mini-code:free",
]);

export function dynamicProviderAdmissionPolicy(provider) {
  const policy = DYNAMIC_PROVIDER_ADMISSION[String(provider || "").toLowerCase()];
  return policy ? { ...policy } : null;
}

export function hasExplicitBillingApproval(policyEntry) {
  return policyEntry?.billingApproved === true
    && typeof policyEntry?.billingApprovalProvenance === "string"
    && /^operator:[A-Za-z0-9._@+-]{1,96}$/.test(policyEntry.billingApprovalProvenance);
}

const DEFINITIVE_CREDENTIAL_BLOCK_STATUSES = new Set([
  "invalid", "expired", "revoked", "quota", "rate_limited",
]);

export function annotateCandidatesWithCredentialHealth(candidates, credentialHealth, observedAt) {
  const artifactCurrent = credentialHealth
    && Number.isFinite(observedAt)
    && credentialHealth.generatedAt === observedAt;
  return (Array.isArray(candidates) ? candidates : []).map(candidate => {
    const envName = candidate?.apiKeyEnv || candidate?.litellmApiKeyEnv;
    const row = artifactCurrent && typeof envName === "string"
      ? credentialHealth?.credentials?.[envName]
      : null;
    const current = row && row.checkedAt === observedAt;
    const status = current && typeof row.status === "string" ? row.status : "unknown";
    return {
      ...candidate,
      credentialStatus: status,
      credentialCheckedAt: current ? row.checkedAt : null,
      credentialBlocked: DEFINITIVE_CREDENTIAL_BLOCK_STATUSES.has(status),
    };
  });
}

export function buildActivationEvidence({
  previousPendingActivation = [],
  candidates = [],
  configuredBindings = [],
  runtimeBindings = null,
  observedAt = Date.now(),
} = {}) {
  const observationTime = Number.isFinite(observedAt) ? observedAt : null;
  const runtimeAvailable = runtimeBindings !== null;
  const groupBindings = values => {
    const grouped = new Map();
    for (const value of Array.isArray(values) ? values : []) {
      let logicalName;
      try { logicalName = assertSafeProviderModelId(value?.logicalName, "binding logical name"); } catch { continue; }
      if (!grouped.has(logicalName)) grouped.set(logicalName, []);
      grouped.get(logicalName).push(value);
    }
    return grouped;
  };
  const configured = groupBindings(configuredBindings);
  const runtime = groupBindings(runtimeBindings);

  // Activation evidence is intentionally single-run evidence. Name-only rows
  // from an older health artifact are never carried into a later apply path:
  // every full scan must re-propose the exact provider/model identity after a
  // current substantive probe and complete/current catalog observation.
  const discardedPreviousCount = Array.isArray(previousPendingActivation)
    ? previousPendingActivation.length
    : 0;
  const definitiveCredentialFailures = new Set(["invalid", "expired", "revoked", "quota", "rate_limited"]);
  const proposals = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    try {
      const logicalName = assertSafeProviderModelId(candidate?.logicalName, "activation logical name");
      const provider = assertSafeProviderModelId(candidate?.provider, "activation provider").toLowerCase();
      const modelId = assertSafeProviderModelId(candidate?.catalogModelId || candidate?.modelId, "activation model ID");
      const litellmModel = assertSafeProviderModelId(candidate?.litellmModel, "activation LiteLLM model ID");
      const litellmApiKeyEnv = assertSafeProviderModelId(candidate?.litellmApiKeyEnv, "activation credential name");
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(litellmApiKeyEnv)) continue;
      const litellmApiBase = normalizeApiBase(candidate?.litellmApiBase);
      const admission = dynamicProviderAdmissionPolicy(provider);
      if (!admission || !isExplicitCatalogDynamic(candidate)) continue;
      if (candidate.catalogComplete !== true || candidate.catalogEligibility !== "eligible") continue;
      if (candidate.probeSucceededThisRun !== true || candidate.lastTestedAt !== observationTime) continue;
      if (definitiveCredentialFailures.has(candidate.credentialStatus) || candidate.credentialBlocked === true) continue;
      if (Object.entries(admission).some(([key, value]) => candidate[key] !== value)) continue;
      if (admission.autoPromotionPolicy === "manual-approval-required"
        && !hasExplicitBillingApproval(candidate)) continue;
      proposals.push({
        logicalName,
        provider,
        modelId,
        identity: candidateIdentity({ provider, modelId }),
        bindingIdentity: activationBindingIdentity({
          logicalName, provider, modelId, litellmModel, litellmApiBase, litellmApiKeyEnv,
        }),
        litellmModel,
        litellmApiBase,
        litellmApiKeyEnv,
        provenance: "catalog-auto-v1",
        eligibilityBasis: admission.eligibilityBasis,
        pricingEvidence: admission.pricingEvidence,
        pricingTier: admission.pricingTier,
        rotationClass: admission.rotationClass,
        autoPromotionPolicy: admission.autoPromotionPolicy,
        billingApprovalProvenance: candidate.billingApprovalProvenance || null,
        catalogEvidenceAt: observationTime,
        substantiveEvidenceAt: candidate.lastTestedAt,
        credentialStatus: candidate.credentialStatus || "unknown",
        credentialEvidenceAt: Number.isFinite(candidate.credentialCheckedAt) ? candidate.credentialCheckedAt : null,
        proposedAt: observationTime,
      });
    } catch {
      // Provider-controlled or corrupt fields cannot become apply evidence.
    }
  }
  proposals.sort((a, b) => a.logicalName.localeCompare(b.logicalName));
  const exactConfigBinding = (actual, expected) => actual?.malformed !== true
    && actual?.logicalName === expected.logicalName
    && actual?.provider === expected.provider
    && actual?.modelId === expected.modelId
    && actual?.provenance === "catalog-auto-v1"
    && actual?.bindingIdentity === expected.bindingIdentity
    && actual?.litellmModel === expected.litellmModel
    && actual?.litellmApiBase === expected.litellmApiBase
    && actual?.litellmApiKeyEnv === expected.litellmApiKeyEnv;
  const exactRuntimeBinding = (actual, expected) => actual?.malformed !== true
    && actual?.logicalName === expected.logicalName
    && actual?.provider === expected.provider
    && actual?.modelId === expected.modelId
    && actual?.provenance === "catalog-auto-v1"
    && actual?.bindingIdentity === expected.bindingIdentity
    && actual?.litellmModel === expected.litellmModel
    && actual?.litellmApiBase === expected.litellmApiBase;
  const withBindingStatus = proposals.map(row => {
    const configuredRows = configured.get(row.logicalName) || [];
    const runtimeRows = runtime.get(row.logicalName) || [];
    const configuredExact = configuredRows.length > 0
      && configuredRows.every(actual => exactConfigBinding(actual, row));
    const runtimeExact = runtimeAvailable && runtimeRows.length > 0
      && runtimeRows.every(actual => exactRuntimeBinding(actual, row));
    return {
      ...row,
      configuredBindingStatus: configuredRows.length === 0 ? "missing" : (configuredExact ? "exact" : "mismatch"),
      runtimeBindingStatus: !runtimeAvailable
        ? "unavailable"
        : (runtimeRows.length === 0 ? "missing" : (runtimeExact ? "exact" : "mismatch")),
    };
  });
  const activated = withBindingStatus.filter(row => row.configuredBindingStatus === "exact"
    && row.runtimeBindingStatus === "exact");
  const pendingProposals = withBindingStatus.filter(row => !activated.includes(row));
  const pendingActivation = pendingProposals.map(row => row.logicalName);
  const applyRequired = pendingProposals.filter(row => row.configuredBindingStatus === "missing").map(row => row.logicalName);
  const configBindingMismatchNames = pendingProposals
    .filter(row => row.configuredBindingStatus === "mismatch").map(row => row.logicalName);
  const restartRequiredNames = runtimeAvailable
    ? pendingProposals.filter(row => row.configuredBindingStatus === "exact"
      && row.runtimeBindingStatus !== "exact").map(row => row.logicalName)
    : [];
  const runtimeBindingMismatchNames = runtimeAvailable
    ? pendingProposals.filter(row => row.runtimeBindingStatus === "mismatch").map(row => row.logicalName)
    : [];
  const runtimeProofRequiredNames = runtimeAvailable
    ? []
    : pendingProposals.filter(row => row.configuredBindingStatus === "exact").map(row => row.logicalName);
  return {
    policy: DISCOVERY_RESTART_POLICY,
    evidenceScope: "current-full-run-only",
    observedAt: observationTime,
    mutationAuthorized: false,
    runtimeProofAvailable: runtimeAvailable,
    discardedPreviousCount,
    applyRequired: applyRequired.length > 0,
    applyRequiredNames: applyRequired,
    configBindingMismatchNames,
    restartRequired: restartRequiredNames.length > 0,
    restartRequiredNames,
    runtimeBindingMismatchNames,
    runtimeProofRequiredNames,
    pendingActivation,
    pendingProposals,
    activated: activated.map(row => row.logicalName),
  };
}

// Provider-controlled identifiers may later become LiteLLM/YAML fields. Keep
// them deliberately boring: no whitespace, quotes, comments, controls, or
// YAML structural characters. Colons remain valid for IDs such as `:free` and
// are always quoted when rendered.
const SAFE_ID_RE = /^[A-Za-z0-9@][A-Za-z0-9._/@:+-]{0,255}$/;
const MODEL_NAME_RE = /^\s*-\s*model_name:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/;
const EDITORIAL_INCOMPATIBLE =
  /safeguard|prompt-guard|content-filter|content-moderation|guardrails|moderation|\bembed\b|embedding|rerank|whisper|\btts\b|speech|vision-only|image[-_ ]?(?:gen|generation)|dall-?e|stable-diffusion/i;
const APPROVED_ZEN_CATALOG_IDS = new Set([
  "big-pickle", "minimax-m2.5", "minimax-m2.5-free", "nemotron-3-super-free",
  "mimo-v2-pro-free", "mimo-v2-omni-free", "minimax-m2.7", "gpt-5.4",
  "gpt-5.4-mini", "gpt-5.3-codex", "claude-sonnet-4-6",
]);

const PINNED_CATALOG_ORIGINS = new Set([
  "https://aihubmix.com",
  "https://api.cerebras.ai",
  "https://api.cloudflare.com",
  "https://api.groq.com",
  "https://generativelanguage.googleapis.com",
  "https://integrate.api.nvidia.com",
  "https://models.github.ai",
  "https://opencode.ai",
  "https://openrouter.ai",
]);

function uniqueSafeIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value ?? "").trim())
    .filter(value => SAFE_ID_RE.test(value)))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_CATALOG_ITEMS);
}

export function assertSafeProviderModelId(value, field = "model ID") {
  const normalized = String(value ?? "").trim();
  if (!SAFE_ID_RE.test(normalized)) throw new TypeError(`${field} is not a safe provider identifier`);
  return normalized;
}

export function yamlSingleQuote(value) {
  const normalized = String(value ?? "");
  if (/[\0\r\n]/.test(normalized)) throw new TypeError("YAML scalar contains a control/newline");
  return `'${normalized.replaceAll("'", "''")}'`;
}

function normalizeApiBase(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new URL(String(value));
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError("LiteLLM API base is invalid");
  }
  return parsed.toString().replace(/\/$/, "");
}

function activationBindingIdentity(binding) {
  const fields = [
    binding.logicalName,
    binding.provider,
    binding.modelId,
    binding.litellmModel,
    binding.litellmApiBase || "",
    binding.litellmApiKeyEnv,
    "catalog-auto-v1",
  ];
  return createHash("sha256").update(fields.join("\0")).digest("hex");
}

export function renderLiteLLMModelEntry(model) {
  const logicalName = assertSafeProviderModelId(model?.logicalName, "logical model name");
  const litellmModel = assertSafeProviderModelId(model?.litellmModel, "LiteLLM model ID");
  const apiKeyEnv = assertSafeProviderModelId(model?.litellmApiKeyEnv, "credential environment name");
  const provider = assertSafeProviderModelId(model?.provider, "catalog provider").toLowerCase();
  const catalogModelId = assertSafeProviderModelId(model?.catalogModelId || model?.modelId, "catalog model ID");
  if (model?.dynamicProvenance !== "catalog-auto-v1") {
    throw new TypeError("catalog provenance is required");
  }
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(apiKeyEnv)) {
    throw new TypeError("credential environment name is invalid");
  }
  const apiBase = normalizeApiBase(model?.litellmApiBase);
  let entry = `\n  - model_name: ${yamlSingleQuote(logicalName)}\n    litellm_params:\n      model: ${yamlSingleQuote(litellmModel)}\n`;
  if (apiBase) entry += `      api_base: ${yamlSingleQuote(apiBase)}\n`;
  entry += `      api_key: ${yamlSingleQuote(`os.environ/${apiKeyEnv}`)}\n      timeout: 60\n`;
  entry += `    model_info:\n      mimule_catalog_provider: ${yamlSingleQuote(provider)}\n`;
  entry += `      mimule_catalog_model_id: ${yamlSingleQuote(catalogModelId)}\n`;
  entry += `      mimule_catalog_provenance: 'catalog-auto-v1'\n`;
  entry += `      mimule_binding_identity: ${yamlSingleQuote(activationBindingIdentity({
    logicalName,
    provider,
    modelId: catalogModelId,
    litellmModel,
    litellmApiBase: apiBase,
    litellmApiKeyEnv: apiKeyEnv,
  }))}\n`;
  return entry;
}

function catalogHash(ids) {
  return createHash("sha256").update(uniqueSafeIds(ids).join("\n")).digest("hex");
}

function assertPinnedCatalogUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.username || url.password || !PINNED_CATALOG_ORIGINS.has(url.origin)) {
    throw Object.assign(new Error("catalog target is not pinned"), { catalogClass: "target" });
  }
  return url;
}

export function classifyCatalogError(error) {
  if (typeof error?.catalogClass === "string") return error.catalogClass.slice(0, 40);
  if (error?.name === "AbortError") return "timeout";
  if (error?.code === "ERR_FR_TOO_MANY_REDIRECTS" || /redirect/i.test(String(error?.message || ""))) return "redirect";
  return "transport";
}

async function boundedResponseText(response, maxBytes) {
  const declared = Number.parseInt(response?.headers?.get?.("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Object.assign(new Error("catalog response exceeds byte limit"), { catalogClass: "bounds" });
  }

  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        if (bytes + chunk.length > maxBytes) {
          throw Object.assign(new Error("catalog response exceeds byte limit"), { catalogClass: "bounds" });
        }
        bytes += chunk.length;
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode();
      return text;
    } finally {
      try { await reader.cancel(); } catch { /* complete */ }
    }
  }

  const text = String(await response.text());
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw Object.assign(new Error("catalog response exceeds byte limit"), { catalogClass: "bounds" });
  }
  return text;
}

export async function fetchBoundedCatalogJson(rawUrl, {
  fetchImpl = globalThis.fetch,
  headers = {},
  timeoutMs = DEFAULT_CATALOG_TIMEOUT_MS,
  maxBytes = MAX_CATALOG_RESPONSE_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const url = assertPinnedCatalogUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response || !Number.isInteger(response.status)) {
      throw Object.assign(new Error("catalog response is invalid"), { catalogClass: "schema" });
    }
    if (response.status < 200 || response.status >= 300) {
      throw Object.assign(new Error(`catalog HTTP ${response.status}`), { catalogClass: `http_${response.status}` });
    }
    const text = await boundedResponseText(response, maxBytes);
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      throw Object.assign(new Error("catalog response is not JSON"), { catalogClass: "schema" });
    }
    if (!parsed || typeof parsed !== "object") {
      throw Object.assign(new Error("catalog response root is invalid"), { catalogClass: "schema" });
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function arrayAt(value, paths) {
  for (const path of paths) {
    let current = value;
    for (const key of path) current = current?.[key];
    if (Array.isArray(current)) return current;
  }
  return null;
}

function itemId(item) {
  if (typeof item === "string") return item.trim();
  for (const key of ["id", "model", "model_id", "modelId", "name", "slug"]) {
    if (typeof item?.[key] === "string" && item[key].trim()) return item[key].trim();
  }
  return "";
}

function textValue(value) {
  if (Array.isArray(value)) return value.map(textValue).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textValue).join(" ");
  return String(value ?? "");
}

export function isEditorialCompatibleId(id) {
  return SAFE_ID_RE.test(String(id || "")) && !EDITORIAL_INCOMPATIBLE.test(String(id));
}

function isTextCapable(item) {
  const typeText = textValue([item?.type, item?.types, item?.model_type, item?.modelType]).toLowerCase();
  if (/image[-_ ]?(?:gen|generation)|text[-_ ]to[-_ ]image/.test(typeText)) return false;
  const modalityText = textValue([
    item?.modalities,
    item?.input_modalities,
    item?.output_modalities,
    item?.supported_input_modalities,
    item?.supported_output_modalities,
    item?.capabilities,
    item?.task,
    item?.tasks,
  ]).toLowerCase().trim();
  if (/image[-_ ]?(?:gen|generation)|text[-_ ]to[-_ ]image/.test(modalityText)) return false;
  if (modalityText && !/(text|chat|completion|generatecontent|language)/.test(modalityText)) return false;
  return true;
}

function stringValues(value) {
  if (Array.isArray(value)) return value.map(item => String(item).toLowerCase());
  if (typeof value === "string") return value.split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  return [];
}

function githubTextOutputModel(item, id) {
  const outputs = stringValues(item?.supported_output_modalities);
  return outputs.includes("text")
    && !outputs.some(output => /embedding|image|audio|video/.test(output))
    && isEditorialCompatibleId(id)
    && isTextCapable(item);
}

function exactZero(value) {
  if (typeof value === "number") return Number.isFinite(value) && value === 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().replace(/^\$/, "");
  return normalized !== "" && Number(normalized) === 0;
}

function firstDefined(object, paths) {
  for (const path of paths) {
    let current = object;
    let found = true;
    for (const key of path) {
      if (current == null || !(key in Object(current))) { found = false; break; }
      current = current[key];
    }
    if (found) return current;
  }
  return undefined;
}

function hasZeroInputOutputPricing(item) {
  const input = firstDefined(item, [
    ["pricing", "input"], ["pricing", "prompt"], ["price", "input"],
    ["input_price"], ["inputPrice"], ["prompt_price"], ["promptPrice"],
  ]);
  const output = firstDefined(item, [
    ["pricing", "output"], ["pricing", "completion"], ["price", "output"],
    ["output_price"], ["outputPrice"], ["completion_price"], ["completionPrice"],
  ]);
  return exactZero(input) && exactZero(output);
}

function hasLlmType(item) {
  return /(?:^|[^a-z])llm(?:[^a-z]|$)/i.test(textValue([
    item?.type, item?.types, item?.model_type, item?.modelType, item?.category, item?.categories, item?.tags,
  ]));
}

export function filterAiHubMixFreeModels(keyVisiblePayload, publicPayload) {
  const visibleItems = arrayAt(keyVisiblePayload, [["data"], ["models"], ["result", "data"], ["result", "models"]]);
  const publicItems = Array.isArray(publicPayload)
    ? publicPayload
    : arrayAt(publicPayload, [["data"], ["models"], ["result"], ["result", "data"], ["result", "models"]]);
  if (!visibleItems || !publicItems) {
    throw Object.assign(new Error("AIHubMix catalog schema is invalid"), { catalogClass: "schema" });
  }
  if (visibleItems.length > MAX_CATALOG_ITEMS || publicItems.length > MAX_CATALOG_ITEMS) {
    throw Object.assign(new Error("AIHubMix catalog exceeds item limit"), { catalogClass: "bounds" });
  }
  const visible = new Set(uniqueSafeIds(visibleItems.map(itemId)));
  return uniqueSafeIds(publicItems
    .filter(item => {
      const id = itemId(item);
      return visible.has(id)
        && hasZeroInputOutputPricing(item)
        && hasLlmType(item)
        && isTextCapable(item)
        && isEditorialCompatibleId(id);
    })
    .map(itemId));
}

function successInventory(rawIds, eligibleIds, pages = 1) {
  if ((Array.isArray(rawIds) && rawIds.length > MAX_CATALOG_ITEMS)
    || (Array.isArray(eligibleIds) && eligibleIds.length > MAX_CATALOG_ITEMS)) {
    throw Object.assign(new Error("catalog exceeds item limit"), { catalogClass: "bounds" });
  }
  return { complete: true, rawIds: uniqueSafeIds(rawIds), eligibleIds: uniqueSafeIds(eligibleIds), pages, errorClass: null };
}

function failedInventory(error, partialRawIds = [], pages = 0) {
  return {
    complete: false,
    rawIds: uniqueSafeIds(partialRawIds),
    eligibleIds: [],
    pages,
    errorClass: classifyCatalogError(error),
  };
}

function bearer(secret) {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

async function singleArrayInventory({ url, headers, paths, eligible, fetchImpl, timeoutMs }) {
  const payload = await fetchBoundedCatalogJson(url, { fetchImpl, headers, timeoutMs });
  const items = Array.isArray(payload) ? payload : arrayAt(payload, paths);
  if (!items) throw Object.assign(new Error("catalog list is missing"), { catalogClass: "schema" });
  if (items.length > MAX_CATALOG_ITEMS) throw Object.assign(new Error("catalog exceeds item limit"), { catalogClass: "bounds" });
  const rawIds = uniqueSafeIds(items.map(itemId));
  if (items.length > 0 && rawIds.length === 0) {
    throw Object.assign(new Error("catalog model IDs are missing"), { catalogClass: "schema" });
  }
  const eligibleIds = uniqueSafeIds(items.filter(item => eligible(item, itemId(item))).map(itemId));
  return successInventory(rawIds, eligibleIds);
}

async function cloudflareInventory({ env, fetchImpl, timeoutMs }) {
  if (!env.CLOUDFLARE_API_TOKEN || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || "")) {
    throw Object.assign(new Error("Cloudflare credential/account missing"), { catalogClass: "missing_credential" });
  }
  const raw = [];
  const eligible = [];
  let page = 1;
  while (page <= MAX_CATALOG_PAGES) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search`;
    const payload = await fetchBoundedCatalogJson(`${base}?task=Text+Generation&per_page=100&page=${page}`, {
      fetchImpl,
      timeoutMs,
      headers: bearer(env.CLOUDFLARE_API_TOKEN),
    });
    const items = arrayAt(payload, [["result"]]);
    if (!items) throw Object.assign(new Error("Cloudflare result is missing"), { catalogClass: "schema" });
    if (raw.length + items.length > MAX_CATALOG_ITEMS) {
      throw Object.assign(new Error("Cloudflare catalog exceeds item limit"), { catalogClass: "bounds" });
    }
    for (const item of items) {
      const id = itemId(item);
      if (!id) continue;
      raw.push(id);
      if (isEditorialCompatibleId(id) && isTextCapable(item)) eligible.push(id);
    }
    const info = payload?.result_info || {};
    const totalCount = Number(info.total_count);
    const perPage = Number(info.per_page || 100);
    const derivedTotalPages = Number.isFinite(totalCount) && Number.isFinite(perPage) && perPage > 0
      ? Math.max(page, Math.ceil(totalCount / perPage))
      : (items.length >= 100 ? page + 1 : page);
    const totalPages = Number(info.total_pages || derivedTotalPages);
    if (!Number.isInteger(totalPages) || totalPages < page || totalPages > MAX_CATALOG_PAGES) {
      throw Object.assign(new Error("Cloudflare pagination is invalid"), { catalogClass: "bounds" });
    }
    if (page >= totalPages) return successInventory(raw, eligible, page);
    page += 1;
  }
  throw Object.assign(new Error("Cloudflare page limit reached"), { catalogClass: "bounds" });
}

async function geminiInventory({ env, fetchImpl, timeoutMs }) {
  if (!env.GEMINI_API_KEY) throw Object.assign(new Error("Gemini credential missing"), { catalogClass: "missing_credential" });
  const raw = [];
  const eligible = [];
  let pageToken = "";
  let pages = 0;
  do {
    if (++pages > MAX_CATALOG_PAGES) throw Object.assign(new Error("Gemini page limit reached"), { catalogClass: "bounds" });
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await fetchBoundedCatalogJson(`https://generativelanguage.googleapis.com/v1beta/models?${query}`, {
      fetchImpl,
      timeoutMs,
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
    });
    const items = arrayAt(payload, [["models"]]);
    if (!items) throw Object.assign(new Error("Gemini models are missing"), { catalogClass: "schema" });
    if (raw.length + items.length > MAX_CATALOG_ITEMS) throw Object.assign(new Error("Gemini catalog exceeds item limit"), { catalogClass: "bounds" });
    for (const item of items) {
      const id = itemId(item);
      if (!id) continue;
      raw.push(id);
      const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
      if (methods.includes("generateContent") && isEditorialCompatibleId(id) && isTextCapable(item)) eligible.push(id);
    }
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
  } while (pageToken);
  return successInventory(raw, eligible, pages);
}

async function aiHubMixInventory({ env, fetchImpl, timeoutMs }) {
  if (!env.AIHUBMIX_API_KEY) throw Object.assign(new Error("AIHubMix credential missing"), { catalogClass: "missing_credential" });
  const [visible, publicCatalog] = await Promise.all([
    fetchBoundedCatalogJson("https://aihubmix.com/v1/models", {
      fetchImpl,
      timeoutMs,
      headers: bearer(env.AIHUBMIX_API_KEY),
    }),
    fetchBoundedCatalogJson("https://aihubmix.com/api/v1/models", { fetchImpl, timeoutMs }),
  ]);
  const visibleItems = arrayAt(visible, [["data"], ["models"], ["result", "data"], ["result", "models"]]);
  if (!visibleItems) throw Object.assign(new Error("AIHubMix visible list is missing"), { catalogClass: "schema" });
  if (visibleItems.length > MAX_CATALOG_ITEMS) throw Object.assign(new Error("AIHubMix visible list exceeds item limit"), { catalogClass: "bounds" });
  const rawIds = uniqueSafeIds(visibleItems.map(itemId));
  return successInventory(rawIds, filterAiHubMixFreeModels(visible, publicCatalog), 2);
}

function cliInventory(provider, cliInventories) {
  const value = cliInventories?.[provider];
  if (!value) return failedInventory(Object.assign(new Error("CLI inventory unavailable"), { catalogClass: "cli_unavailable" }));
  if (value.complete !== true) return failedInventory(Object.assign(new Error("CLI inventory incomplete"), { catalogClass: "cli_incomplete" }), value.rawIds);
  return successInventory(value.rawIds, value.eligibleIds ?? value.rawIds, 1);
}

async function collectOne(provider, context) {
  const { env, fetchImpl, timeoutMs, cliInventories } = context;
  const editorial = (item, id) => isEditorialCompatibleId(id) && isTextCapable(item);
  try {
    switch (provider) {
      case "openrouter":
        return await singleArrayInventory({
          url: "https://openrouter.ai/api/v1/models", headers: bearer(env.OPENROUTER_API_KEY),
          paths: [["data"]], fetchImpl, timeoutMs,
          eligible: (item, id) => exactZero(item?.pricing?.prompt) && exactZero(item?.pricing?.completion) && editorial(item, id),
        });
      case "github":
        return await singleArrayInventory({
          url: "https://models.github.ai/catalog/models", headers: bearer(env.GITHUB_TOKEN),
          paths: [["data"], ["models"]], fetchImpl, timeoutMs,
          eligible: githubTextOutputModel,
        });
      case "groq":
        if (!env.GROQ_API_KEY) throw Object.assign(new Error("Groq credential missing"), { catalogClass: "missing_credential" });
        return await singleArrayInventory({
          url: "https://api.groq.com/openai/v1/models", headers: bearer(env.GROQ_API_KEY),
          paths: [["data"]], fetchImpl, timeoutMs, eligible: editorial,
        });
      case "zen":
        if (!env.OPENCODE_ZEN_KEY) throw Object.assign(new Error("Zen credential missing"), { catalogClass: "missing_credential" });
        return await singleArrayInventory({
          url: "https://opencode.ai/zen/v1/models", headers: bearer(env.OPENCODE_ZEN_KEY),
          paths: [["data"], ["models"]], fetchImpl, timeoutMs,
          eligible: (item, id) => APPROVED_ZEN_CATALOG_IDS.has(id) && editorial(item, id),
        });
      case "cloudflare": return await cloudflareInventory(context);
      case "cerebras": {
        const secret = env.CEREBRAS_API_KEY || env.CEREBRAS_API_KEY_PAID;
        if (!secret) throw Object.assign(new Error("Cerebras credential missing"), { catalogClass: "missing_credential" });
        return await singleArrayInventory({
          url: "https://api.cerebras.ai/v1/models", headers: bearer(secret), paths: [["data"]],
          fetchImpl, timeoutMs, eligible: editorial,
        });
      }
      case "nvidia":
        if (!env.NVIDIA_NIM_API_KEY) throw Object.assign(new Error("NVIDIA credential missing"), { catalogClass: "missing_credential" });
        return await singleArrayInventory({
          url: "https://integrate.api.nvidia.com/v1/models", headers: bearer(env.NVIDIA_NIM_API_KEY),
          paths: [["data"]], fetchImpl, timeoutMs, eligible: editorial,
        });
      case "gemini": return await geminiInventory(context);
      case "aihubmix": return await aiHubMixInventory(context);
      case "alibaba": return cliInventory("alibaba", cliInventories);
      case "opencode": return cliInventory("opencode", cliInventories);
      default: throw Object.assign(new Error("unknown provider"), { catalogClass: "adapter" });
    }
  } catch (error) {
    return failedInventory(error);
  }
}

function priorProvider(previous, provider) {
  const value = previous?.providers?.[provider];
  return value && typeof value === "object" ? value : null;
}

export function mergeProviderInventory(provider, current, previousProvider = null, observedAt = null) {
  const observedRawIds = uniqueSafeIds(current?.rawIds);
  const observedEligibleIds = uniqueSafeIds(current?.eligibleIds);
  const priorRawIds = uniqueSafeIds(previousProvider?.rawIds);
  const priorEligibleIds = uniqueSafeIds(previousProvider?.eligibleIds);
  const observedHash = catalogHash(observedRawIds);
  const claimsComplete = current?.complete === true;
  const suspiciousEmpty = claimsComplete && observedRawIds.length === 0 && priorRawIds.length > 0;
  const drasticCollapse = claimsComplete
    && priorRawIds.length >= 4
    && observedRawIds.length * 2 < priorRawIds.length;
  const collapseCandidate = suspiciousEmpty || drasticCollapse;
  const sameCollapse = collapseCandidate && previousProvider?.pendingCollapseHash === observedHash;
  const collapseObservations = collapseCandidate
    ? (sameCollapse ? Number(previousProvider?.pendingCollapseObservations || 0) + 1 : 1)
    : 0;
  const collapseConfirmed = collapseCandidate && collapseObservations >= 2;
  const complete = claimsComplete && (!collapseCandidate || collapseConfirmed);
  const carriedForward = !complete && Boolean(previousProvider) && (priorRawIds.length > 0 || priorEligibleIds.length > 0);
  const rawIds = complete ? observedRawIds : priorRawIds;
  const previousPendingRemovals = new Set(uniqueSafeIds(previousProvider?.pendingRemovalIds));
  const observedEligibleSet = new Set(observedEligibleIds);
  const observedRawSet = new Set(observedRawIds);
  // A currently visible model whose metadata no longer meets eligibility
  // (for example, AIHubMix changed it from zero-price to paid) is quarantined
  // immediately. Hysteresis applies only to a model absent from the catalog.
  const absentPriorEligible = complete
    ? priorEligibleIds.filter(id => !observedEligibleSet.has(id) && !observedRawSet.has(id))
    : [];
  const pendingRemovalIds = complete
    ? absentPriorEligible.filter(id => !previousPendingRemovals.has(id))
    : uniqueSafeIds(previousProvider?.pendingRemovalIds);
  const eligibleIds = complete
    ? uniqueSafeIds([...observedEligibleIds, ...pendingRemovalIds])
    : priorEligibleIds;
  const previousSet = new Set(priorRawIds);
  const currentSet = new Set(rawIds);
  const previousEligibleSet = new Set(priorEligibleIds);
  const currentEligibleSet = new Set(eligibleIds);
  return {
    provider,
    complete,
    carriedForward,
    lastSuccessfulAt: complete && Number.isFinite(observedAt)
      ? observedAt
      : (Number.isFinite(previousProvider?.lastSuccessfulAt) ? previousProvider.lastSuccessfulAt : null),
    rawIds,
    eligibleIds,
    rawCount: rawIds.length,
    eligibleCount: eligibleIds.length,
    counts: { raw: rawIds.length, eligible: eligibleIds.length },
    hash: catalogHash(rawIds),
    errorClass: complete ? null : String(
      suspiciousEmpty ? "empty_catalog" : (drasticCollapse ? "catalog_collapse" : (current?.errorClass || "unknown")),
    ).slice(0, 40),
    pages: Number.isInteger(current?.pages) && current.pages >= 0 ? current.pages : 0,
    addedIds: complete ? rawIds.filter(id => !previousSet.has(id)) : [],
    removedIds: complete ? priorRawIds.filter(id => !currentSet.has(id)) : [],
    eligibleAddedIds: complete ? eligibleIds.filter(id => !previousEligibleSet.has(id)) : [],
    eligibleRemovedIds: complete ? priorEligibleIds.filter(id => !currentEligibleSet.has(id)) : [],
    pendingRemovalIds,
    ...(pendingRemovalIds.length > 0 ? { observedEligibleIds } : {}),
    ...(!complete && collapseCandidate ? {
      pendingCollapseHash: observedHash,
      pendingCollapseObservations: collapseObservations,
    } : {}),
    ...(complete || observedRawIds.length === 0 ? {} : { observedRawIds }),
  };
}

export async function collectModelCatalog({
  env = {},
  previous = null,
  fetchImpl = globalThis.fetch,
  cliInventories = {},
  now = Date.now(),
  timeoutMs = DEFAULT_CATALOG_TIMEOUT_MS,
} = {}) {
  const providers = [
    "aihubmix", "openrouter", "github", "groq", "zen", "cloudflare",
    "cerebras", "nvidia", "gemini", "alibaba", "opencode",
  ];
  const current = await Promise.all(providers.map(provider => collectOne(provider, {
    env, fetchImpl, timeoutMs, cliInventories,
  })));
  const inventories = {};
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    const prior = priorProvider(previous, provider);
    const priorWithSuccess = prior && !Number.isFinite(prior.lastSuccessfulAt) && Number.isFinite(previous?.generatedAt)
      ? { ...prior, lastSuccessfulAt: previous.generatedAt }
      : prior;
    inventories[provider] = mergeProviderInventory(provider, current[index], priorWithSuccess, now);
  }
  return {
    schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
    policyVersion: MODEL_CATALOG_POLICY_VERSION,
    runId: randomUUID(),
    generatedAt: now,
    providers: inventories,
  };
}

export function candidateIdentity(model) {
  const provider = String(model?.provider || "unknown").toLowerCase();
  const modelId = String(model?.modelId || "").trim();
  if (modelId) return `${provider}\0${modelId}`;
  return `${provider}\0logical:${String(model?.logicalName || "").trim()}`;
}

export function isExplicitCatalogDynamic(model) {
  return model?.dynamicProvenance === "catalog-auto-v1";
}

function migrateOrQuarantineLegacyCandidate(model) {
  if (isExplicitCatalogDynamic(model)) return { ...model };
  const identity = candidateIdentity(model);
  if (REVIEWED_LEGACY_CATALOG_IDENTITIES_V1.has(identity)) {
    const provider = String(model?.provider || "").toLowerCase();
    const admission = dynamicProviderAdmissionPolicy(provider);
    if (admission) {
      return {
        ...model,
        catalogModelId: model.catalogModelId || model.modelId,
        dynamicProvenance: "catalog-auto-v1",
        legacyMigrationVersion: LEGACY_CATALOG_MIGRATION_VERSION,
        ...admission,
        probeContractRequired: true,
      };
    }
  }
  return {
    ...model,
    legacyProvenance: LEGACY_CATALOG_QUARANTINE,
    displayOnly: true,
    probeEligible: false,
    routingEligible: false,
    catalogEligibility: "unknown",
  };
}

export function mergeCatalogCandidates(registryModels = [], previousModels = [], discoveredModels = []) {
  const registry = Array.isArray(registryModels) ? registryModels : [];
  const registryLogical = new Set(registry.map(model => model?.logicalName).filter(Boolean));
  const registryIdentity = new Set(registry.map(candidateIdentity));
  const legacy = (Array.isArray(previousModels) ? previousModels : [])
    .filter(model => !registryLogical.has(model?.logicalName)
      && !registryIdentity.has(candidateIdentity(model)))
    .map(migrateOrQuarantineLegacyCandidate);
  const discovered = Array.isArray(discoveredModels) ? discoveredModels : [];
  const migratedIdentities = new Set(legacy
    .filter(model => model.legacyMigrationVersion === LEGACY_CATALOG_MIGRATION_VERSION)
    .map(candidateIdentity));
  const annotatedDiscovered = discovered.map(model => migratedIdentities.has(candidateIdentity(model))
    ? { ...model, legacyMigrationVersion: LEGACY_CATALOG_MIGRATION_VERSION }
    : model);
  // Registry and explicitly configured/manual routes win identity collisions.
  // Current discovery then wins over an exact migrated legacy copy. Unknown
  // rows come last, stay visible, and cannot suppress current catalog evidence.
  return dedupeAndNameCandidates([...registry, ...annotatedDiscovered, ...legacy]);
}

function shortIdentityHash(identity) {
  return createHash("sha256").update(identity).digest("hex").slice(0, 8);
}

export function dedupeAndNameCandidates(models) {
  const byIdentity = new Set();
  const byLogical = new Map();
  const output = [];
  for (const original of Array.isArray(models) ? models : []) {
    if (!original || typeof original !== "object") continue;
    const identity = candidateIdentity(original);
    if (byIdentity.has(identity)) continue;
    byIdentity.add(identity);
    let logicalName = String(original.logicalName || "").trim();
    if (!logicalName) logicalName = `model-${shortIdentityHash(identity)}`;
    const collision = byLogical.get(logicalName);
    if (collision && collision !== identity) logicalName = `${logicalName}-${shortIdentityHash(identity)}`;
    while (byLogical.has(logicalName) && byLogical.get(logicalName) !== identity) {
      logicalName = `${logicalName}-${shortIdentityHash(`${identity}\0${logicalName}`)}`;
    }
    byLogical.set(logicalName, identity);
    output.push({ ...original, logicalName });
  }
  return output;
}

export function parseConfiguredModelNames(configText) {
  const names = new Set();
  for (const line of String(configText || "").split(/\r?\n/)) {
    const match = line.match(MODEL_NAME_RE);
    if (!match) continue;
    const name = (match[1] || match[2] || match[3] || "").trim();
    if (SAFE_ID_RE.test(name)) names.add(name);
  }
  return names;
}

function parseConservativeYamlScalar(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) return null;
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }
  return /^[^\s#]+$/.test(raw) ? raw : null;
}

export function parseConfiguredModelBindings(configText) {
  const rows = [];
  let current = null;
  let section = null;
  let sectionIndent = -1;
  const finish = () => {
    if (current) rows.push(current);
    current = null;
    section = null;
    sectionIndent = -1;
  };

  for (const line of String(configText || "").split(/\r?\n/)) {
    const modelMatch = line.match(MODEL_NAME_RE);
    if (modelMatch) {
      finish();
      const logicalName = (modelMatch[1] || modelMatch[2] || modelMatch[3] || "").trim();
      if (!SAFE_ID_RE.test(logicalName)) continue;
      current = {
        logicalName,
        litellmModel: null,
        litellmApiBase: null,
        litellmApiKeyEnv: null,
        provider: null,
        modelId: null,
        provenance: null,
        bindingIdentity: null,
        malformed: false,
        entryIndent: line.length - line.trimStart().length,
      };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= current.entryIndent) {
      finish();
      continue;
    }
    if (trimmed === "litellm_params:") {
      section = "params";
      sectionIndent = indent;
      continue;
    }
    if (trimmed === "model_info:") {
      section = "info";
      sectionIndent = indent;
      continue;
    }
    if (!section || indent !== sectionIndent + 2) continue;
    const field = trimmed.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (!field) continue;
    const value = parseConservativeYamlScalar(field[2]);
    if (value === null) {
      current.malformed = true;
      continue;
    }
    try {
      if (section === "params" && field[1] === "model") {
        current.litellmModel = assertSafeProviderModelId(value, "configured LiteLLM model");
      } else if (section === "params" && field[1] === "api_base") {
        current.litellmApiBase = normalizeApiBase(value);
      } else if (section === "params" && field[1] === "api_key") {
        const match = value.match(/^os\.environ\/([A-Z][A-Z0-9_]{0,63})$/);
        if (!match) current.malformed = true;
        else current.litellmApiKeyEnv = match[1];
      } else if (section === "info" && field[1] === "mimule_catalog_provider") {
        current.provider = assertSafeProviderModelId(value, "configured catalog provider").toLowerCase();
      } else if (section === "info" && field[1] === "mimule_catalog_model_id") {
        current.modelId = assertSafeProviderModelId(value, "configured catalog model");
      } else if (section === "info" && field[1] === "mimule_catalog_provenance") {
        current.provenance = value;
      } else if (section === "info" && field[1] === "mimule_binding_identity") {
        current.bindingIdentity = /^[a-f0-9]{64}$/.test(value) ? value : null;
        if (!current.bindingIdentity) current.malformed = true;
      }
    } catch {
      current.malformed = true;
    }
  }
  finish();
  return rows.map(({ entryIndent: _entryIndent, ...row }) => row);
}

export function lookupModelEntry(entries, model) {
  const source = entries && typeof entries === "object" ? entries : {};
  for (const key of [model?.resolvedModel, model?.modelId, model?.logicalName]) {
    if (typeof key === "string" && key && source[key]) return source[key];
  }
  return null;
}

function catalogEligibleContains(inventory, value) {
  if (inventory?.complete !== true || !value) return false;
  const needle = String(value);
  for (const id of inventory?.eligibleIds || []) {
    if (id === needle || id === `models/${needle}` || needle === `models/${id}`) return true;
  }
  return false;
}

export function selectRedemptionCandidates(candidates, {
  previousModels = [],
  quality = { models: {} },
  policy = { models: {} },
  catalog = { providers: {} },
  perProviderCap = DEFAULT_REDEMPTION_PER_PROVIDER,
  globalCap = DEFAULT_REDEMPTION_GLOBAL,
} = {}) {
  const previousByLogical = new Map();
  const previousByIdentity = new Map();
  for (const previous of previousModels instanceof Map ? previousModels.values() : previousModels) {
    previousByLogical.set(previous.logicalName, previous);
    previousByIdentity.set(candidateIdentity(previous), previous);
  }
  const grouped = new Map();
  for (const model of candidates || []) {
    if (!model?.provider || model.provider === "local") continue;
    if (model.displayOnly === true || model.legacyProvenance === LEGACY_CATALOG_QUARANTINE) continue;
    if (model.credentialBlocked === true) continue;
    const inventory = catalog?.providers?.[model.provider];
    const catalogId = model.catalogModelId || model.modelId || model.resolvedModel || model.logicalName;
    if (!inventory || !catalogEligibleContains(inventory, catalogId)) continue;
    if (model.dynamicProvenance === "catalog-auto-v1" && model.catalogEligibility !== "eligible") continue;
    const previous = previousByLogical.get(model.logicalName) || previousByIdentity.get(candidateIdentity(model));
    const evidenceModel = { ...model, resolvedModel: previous?.resolvedModel || model.resolvedModel };
    const policyEntry = lookupModelEntry(policy?.models, evidenceModel);
    if (policyEntry?.forceBlock === true) continue;
    if (model.autoPromotionPolicy === "manual-approval-required" && !hasExplicitBillingApproval(policyEntry)) continue;
    const qualityEntry = lookupModelEntry(quality?.models, evidenceModel);
    const unavailable = previous?.available === false;
    const deferred = previous?.probeDeferred === true;
    const nonhealthy = Boolean(qualityEntry?.status && qualityEntry.status !== "healthy");
    const needsContract = model?.probeContractRequired === true && previous?.probeContractOk !== true;
    if (!unavailable && !nonhealthy && !deferred && !needsContract) continue;
    const record = {
      model,
      previous,
      priority: unavailable ? 0 : (nonhealthy ? 1 : (needsContract ? 2 : 3)),
      lastTestedAt: Number(previous?.lastTestedAt || 0),
    };
    if (!grouped.has(model.provider)) grouped.set(model.provider, []);
    grouped.get(model.provider).push(record);
  }
  for (const records of grouped.values()) {
    records.sort((a, b) => a.priority - b.priority
      || a.lastTestedAt - b.lastTestedAt
      || candidateIdentity(a.model).localeCompare(candidateIdentity(b.model)));
  }
  const providers = [...grouped.keys()].sort();
  const selected = [];
  const used = new Map();
  while (selected.length < globalCap) {
    let progressed = false;
    for (const provider of providers) {
      if (selected.length >= globalCap) break;
      const count = used.get(provider) || 0;
      if (count >= perProviderCap) continue;
      const record = grouped.get(provider)?.shift();
      if (!record) continue;
      selected.push(record.model);
      used.set(provider, count + 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return selected;
}

export function planModelProbeQueue(candidates, {
  mode,
  previousModels = [],
  quality = { models: {} },
  policy = { models: {} },
  catalog = null,
  now = Date.now(),
  staleAfterMs,
  staleCap,
  redemptionPerProvider = DEFAULT_REDEMPTION_PER_PROVIDER,
  redemptionGlobal = DEFAULT_REDEMPTION_GLOBAL,
  newPerProvider = 8,
  newGlobal = 48,
} = {}) {
  if (mode !== "full" && mode !== "quick") throw new TypeError("mode must be full or quick");
  const previousList = previousModels instanceof Map ? [...previousModels.values()] : previousModels;
  const previousByLogical = new Map(previousList.map(model => [model.logicalName, model]));
  const previousByIdentity = new Map(previousList.map(model => [candidateIdentity(model), model]));
  const previousFor = model => previousByLogical.get(model.logicalName) || previousByIdentity.get(candidateIdentity(model));
  const evidenceModel = (model, previous) => ({ ...model, resolvedModel: previous?.resolvedModel || model.resolvedModel });

  const redemption = mode === "full" && catalog
    ? selectRedemptionCandidates(candidates, {
      previousModels,
      quality,
      policy,
      catalog,
      perProviderCap: redemptionPerProvider,
      globalCap: redemptionGlobal,
    })
    : [];
  const allRedemption = mode === "full" && catalog
    ? selectRedemptionCandidates(candidates, {
      previousModels,
      quality,
      policy,
      catalog,
      perProviderCap: MAX_CATALOG_ITEMS,
      globalCap: MAX_CATALOG_ITEMS * 20,
    })
    : [];
  const selectedIds = new Set(redemption.map(candidateIdentity));
  const allRedemptionIds = new Set(allRedemption.map(candidateIdentity));
  const probe = redemption.map(model => ({ ...model, probeContractRequired: true, redemptionProbe: true }));
  const copy = [];
  const stale = [];
  const newCounts = new Map();
  let newTotal = 0;

  for (const model of candidates || []) {
    const identity = candidateIdentity(model);
    if (selectedIds.has(identity)) continue;
    const previous = previousFor(model);
    const evidence = evidenceModel(model, previous);
    const policyEntry = lookupModelEntry(policy?.models, evidence);
    const qualityEntry = lookupModelEntry(quality?.models, evidence);
    const nonhealthy = Boolean(qualityEntry?.status && qualityEntry.status !== "healthy");
    const needsRedemption = previous?.available === false
      || previous?.probeDeferred === true
      || nonhealthy
      || (model?.probeContractRequired === true && previous?.probeContractOk !== true);

    if (model.provider === "local") {
      probe.push(model);
      continue;
    }
    if (model.displayOnly === true || model.legacyProvenance === LEGACY_CATALOG_QUARANTINE) {
      copy.push({ model, reason: "legacy_provenance_quarantine" });
      continue;
    }
    if (model.credentialBlocked === true) {
      copy.push({ model, reason: `credential_${model.credentialStatus || "blocked"}` });
      continue;
    }
    if (policyEntry?.forceBlock === true) {
      copy.push({ model, reason: "force_block" });
      continue;
    }
    if (model.autoPromotionPolicy === "manual-approval-required" && !hasExplicitBillingApproval(policyEntry)) {
      copy.push({ model, reason: "billing_approval_required" });
      continue;
    }
    if (model.dynamicProvenance === "catalog-auto-v1" && model.catalogEligibility !== "eligible") {
      copy.push({ model, reason: model.catalogEligibility === "ineligible" ? "catalog_ineligible" : "catalog_unknown" });
      continue;
    }
    if (allRedemptionIds.has(identity)) {
      copy.push({ model, reason: "redemption_capped" });
      continue;
    }
    // Nonhealthy, unavailable, deferred, or unproven dynamic models may only
    // enter the catalog-bound full redemption lane above. Quick mode never
    // redeems them, and catalog-absent entries cannot bypass the lane as stale.
    if (needsRedemption) {
      copy.push({ model, reason: mode === "quick" ? "redemption_full_only" : "redemption_not_catalog_visible" });
      continue;
    }
    if (!previous) {
      if (mode === "quick") {
        copy.push({ model, reason: "new_full_only" });
        continue;
      }
      const providerCount = newCounts.get(model.provider) || 0;
      if (providerCount >= newPerProvider || newTotal >= newGlobal) {
        copy.push({ model: { ...model, probeDeferred: true }, reason: "new_capped" });
        continue;
      }
      newCounts.set(model.provider, providerCount + 1);
      newTotal += 1;
      probe.push(model);
      continue;
    }
    const lastTestedAt = Number(previous.lastTestedAt || 0);
    if (previous.available === true
      && !nonhealthy
      && Number.isFinite(staleAfterMs)
      && now - lastTestedAt > staleAfterMs) {
      stale.push({ model, previous });
      continue;
    }
    copy.push({ model, reason: "fresh_copy" });
  }

  stale.sort((a, b) => Number(a.previous?.lastTestedAt || 0) - Number(b.previous?.lastTestedAt || 0));
  const boundedStaleCap = Number.isInteger(staleCap) && staleCap >= 0 ? staleCap : 0;
  for (let index = 0; index < stale.length; index += 1) {
    if (index < boundedStaleCap) probe.push(stale[index].model);
    else copy.push({ model: stale[index].model, reason: "stale_capped" });
  }
  return { probe, copy, redemptionCount: redemption.length };
}

export function normalizeProbeFailure(httpCode = null, error = null) {
  if (Number.isInteger(httpCode) && httpCode >= 100 && httpCode <= 599) {
    let category = "http_error";
    if (httpCode === 401 || httpCode === 403) category = "auth";
    else if (httpCode === 402) category = "quota";
    else if (httpCode === 404 || httpCode === 410) category = "model_unavailable";
    else if (httpCode === 429) category = "rate_limit";
    else if (httpCode >= 500) category = "provider_error";
    return `HTTP ${httpCode} ${category}`;
  }
  if (error?.name === "AbortError" || /timeout|timed out|etimedout/i.test(String(error?.code || ""))) return "timeout";
  return "transport_error";
}

export function classifyAiHubMixCompletion(bodyText, jsonOk) {
  try {
    const parsed = JSON.parse(String(bodyText || ""));
    const content = parsed?.choices?.[0]?.message?.content ?? parsed?.choices?.[0]?.text ?? "";
    const zeroTokenUsage = parsed?.usage != null && Number(parsed?.usage?.total_tokens) === 0;
    if (zeroTokenUsage && /balance|quota|rate[ -]?limit|top[ -]?up|credit/i.test(String(content))) {
      return { available: false, error: "quota", jsonOk: false };
    }
  } catch { /* the caller's JSON validator remains authoritative */ }
  return { available: true, jsonOk: Boolean(jsonOk) };
}

export function isExactPingResponse(content) {
  if (typeof content !== "string") return false;
  try {
    const parsed = JSON.parse(content.trim());
    return Boolean(parsed)
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && parsed.status === "ok"
      && Object.keys(parsed).length === 1;
  } catch {
    return false;
  }
}

export function writeRootJsonAtomic(filePath, document, forbiddenValues = [], maxBytes = MAX_CATALOG_ARTIFACT_BYTES) {
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw new Error("JSON artifact exceeds size limit");
  for (const value of forbiddenValues) {
    if (typeof value === "string" && value && serialized.includes(value)) throw new Error("JSON artifact contains forbidden material");
  }
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("JSON artifact target must be a regular file");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = join(directory, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let fd = null;
  try {
    fd = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    writeSync(fd, serialized, null, "utf8");
    fchmodSync(fd, 0o600);
    if (typeof process.geteuid === "function" && process.geteuid() === 0) fchownSync(fd, 0, 0);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporaryPath, filePath);
    const dirFd = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  } catch (error) {
    if (fd !== null) try { closeSync(fd); } catch { /* closed */ }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function writeModelCatalogAtomic(filePath, document, forbiddenValues = []) {
  return writeRootJsonAtomic(filePath, document, forbiddenValues, MAX_CATALOG_ARTIFACT_BYTES);
}

export function readModelCatalogPrevious(filePath = MODEL_CATALOG_FILE) {
  let fd = null;
  try {
    fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CATALOG_ARTIFACT_BYTES) return null;
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    if (offset !== buffer.length) return null;
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (parsed?.schemaVersion !== MODEL_CATALOG_SCHEMA_VERSION || parsed?.policyVersion !== MODEL_CATALOG_POLICY_VERSION) return null;
    if (!parsed.providers || typeof parsed.providers !== "object" || Array.isArray(parsed.providers)) return null;
    return parsed;
  } catch {
    return null;
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* closed */ }
  }
}

export function acquireModelHealthRunLock(lockPath = DEFAULT_MODEL_HEALTH_LOCK) {
  return acquireCredentialProbeLock(lockPath);
}
