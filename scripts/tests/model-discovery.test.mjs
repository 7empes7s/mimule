import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  annotateCandidatesWithCredentialHealth,
  buildActivationEvidence,
  candidateIdentity,
  classifyAiHubMixCompletion,
  collectModelCatalog,
  dedupeAndNameCandidates,
  dynamicProviderAdmissionPolicy,
  fetchBoundedCatalogJson,
  filterAiHubMixFreeModels,
  mergeProviderInventory,
  mergeCatalogCandidates,
  normalizeProbeFailure,
  parseConfiguredModelBindings,
  parseConfiguredModelNames,
  planModelProbeQueue,
  renderLiteLLMModelEntry,
  selectRedemptionCandidates,
  hasExplicitBillingApproval,
  isExplicitCatalogDynamic,
  isExactPingResponse,
  LEGACY_CATALOG_MIGRATION_VERSION,
  LEGACY_CATALOG_QUARANTINE,
  writeModelCatalogAtomic,
} from "../model-discovery.mjs";

test("reviewed same-identity legacy auto row receives versioned dynamic provenance", () => {
  const legacy = {
    logicalName: "openrouter-tencent-hy3",
    provider: "openrouter",
    modelId: "tencent/hy3:free",
    testVia: "direct",
  };
  const discovered = {
    ...legacy,
    catalogEligibility: "eligible",
    dynamicProvenance: "catalog-auto-v1",
    probeContractRequired: true,
  };
  const [result] = mergeCatalogCandidates([], [legacy], [discovered]);
  assert.equal(result.dynamicProvenance, "catalog-auto-v1");
  assert.equal(result.legacyMigrationVersion, LEGACY_CATALOG_MIGRATION_VERSION);
  assert.equal(result.probeContractRequired, true);
});

test("known registry direct route remains manual across legacy reconciliation", () => {
  const manual = {
    logicalName: "groq-llama70b",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    testVia: "direct",
  };
  const [result] = mergeCatalogCandidates([manual], [{ ...manual, available: false }], []);
  assert.equal(result.dynamicProvenance, undefined);
  assert.equal(result.legacyProvenance, undefined);
  assert.equal(result.displayOnly, undefined);
});

test("unknown legacy row is display-only quarantined and cannot probe", () => {
  const unknown = {
    logicalName: "unknown-upstream-row",
    provider: "groq",
    modelId: "unknown/upstream-row",
    testVia: "direct",
    available: true,
  };
  const [result] = mergeCatalogCandidates([], [unknown], []);
  assert.equal(result.legacyProvenance, LEGACY_CATALOG_QUARANTINE);
  assert.equal(result.displayOnly, true);
  assert.equal(result.routingEligible, false);
  const planned = planModelProbeQueue([result], {
    mode: "full",
    previousModels: [unknown],
    catalog: { providers: { groq: { complete: true, eligibleIds: [unknown.modelId] } } },
  });
  assert.deepEqual(planned.probe, []);
  assert.equal(planned.copy[0].reason, "legacy_provenance_quarantine");
});

test("AIHubMix intersects key-visible IDs and admits only zero-price text LLMs", () => {
  const visible = { data: [
    { id: "coding-glm-5.2-free" }, { id: "paid/text" }, { id: "free/image" }, { id: "missing-price" },
  ] };
  const publicCatalog = { data: [
    {
      model_id: "coding-glm-5.2-free",
      model_name: "GLM 5.2 Free",
      types: "llm",
      input_modalities: "text",
      pricing: { cache_read: 0, input: 0, output: 0 },
    },
    { id: "paid/text", type: "llm", pricing: { input: 0, output: "0.1" }, modalities: ["text"] },
    { id: "free/image", types: "image_generation,llm", pricing: { input: 0, output: 0 }, input_modalities: "text" },
    { id: "missing-price", type: "llm", modalities: ["text"] },
    { id: "not-visible", type: "llm", pricing: { input: 0, output: 0 }, modalities: ["text"] },
  ] };

  assert.deepEqual(filterAiHubMixFreeModels(visible, publicCatalog), ["coding-glm-5.2-free"]);
  assert.throws(() => filterAiHubMixFreeModels({ wrong: [] }, publicCatalog), /schema/i);
});

test("AIHubMix canned 200 balance response is unavailable without retaining body", () => {
  const body = JSON.stringify({
    choices: [{ message: { content: "Free quota exhausted. Please top up your balance." } }],
    usage: { total_tokens: 0 },
  });
  assert.deepEqual(classifyAiHubMixCompletion(body, true), {
    available: false,
    error: "quota",
    jsonOk: false,
  });
  assert.deepEqual(classifyAiHubMixCompletion(JSON.stringify({
    choices: [{ message: { content: '{"status":"ok"}' } }],
    usage: { total_tokens: 9 },
  }), true), { available: true, jsonOk: true });
});

test("bounded catalog fetch rejects oversized data and forces redirect-error", async () => {
  let options;
  await assert.rejects(
    fetchBoundedCatalogJson("https://openrouter.ai/api/v1/models", {
      maxBytes: 8,
      fetchImpl: async (_url, requestOptions) => {
        options = requestOptions;
        return new Response('{"data":[1]}', { status: 200 });
      },
    }),
    error => error.catalogClass === "bounds",
  );
  assert.equal(options.redirect, "error");
  await assert.rejects(
    fetchBoundedCatalogJson("https://example.com/models", { fetchImpl: async () => new Response("{}") }),
    error => error.catalogClass === "target",
  );
});

test("incomplete inventory carries prior candidates and cannot invent removals", () => {
  const previous = {
    rawIds: ["old-a", "old-b"],
    eligibleIds: ["old-a"],
  };
  const merged = mergeProviderInventory("groq", {
    complete: false,
    rawIds: ["partial-new"],
    eligibleIds: [],
    errorClass: "bounds",
    pages: 1,
  }, previous);
  assert.equal(merged.complete, false);
  assert.deepEqual(merged.rawIds, ["old-a", "old-b"]);
  assert.deepEqual(merged.eligibleIds, ["old-a"]);
  assert.deepEqual(merged.observedRawIds, ["partial-new"]);
  assert.deepEqual(merged.addedIds, []);
  assert.deepEqual(merged.removedIds, []);

  const suspiciousEmpty = mergeProviderInventory("groq", {
    complete: true,
    rawIds: [],
    eligibleIds: [],
    pages: 1,
  }, previous, 500);
  assert.equal(suspiciousEmpty.complete, false);
  assert.equal(suspiciousEmpty.carriedForward, true);
  assert.equal(suspiciousEmpty.errorClass, "empty_catalog");
  assert.deepEqual(suspiciousEmpty.rawIds, ["old-a", "old-b"]);

  const changed = mergeProviderInventory("groq", {
    complete: true,
    rawIds: ["old-b", "new-c"],
    eligibleIds: ["new-c"],
    pages: 1,
  }, previous, 600);
  assert.deepEqual(changed.addedIds, ["new-c"]);
  assert.deepEqual(changed.removedIds, ["old-a"]);
  assert.equal(changed.lastSuccessfulAt, 600);
});

test("full collection walks every Cloudflare page and preserves raw policy-ineligible IDs", async () => {
  const calls = [];
  const secret = "catalog-secret-sentinel";
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("aihubmix.com/api/v1/models")) return new Response(JSON.stringify({ data: [] }));
    if (url.includes("aihubmix.com/v1/models")) return new Response(JSON.stringify({ data: [] }));
    if (url.includes("api.cloudflare.com")) {
      const page = new URL(url).searchParams.get("page");
      return new Response(JSON.stringify({
        result: page === "1"
          ? [{ name: "@cf/meta/text-one" }, { name: "@cf/meta/image-generation-model" }]
          : [{ name: "@cf/qwen/text-two" }],
        result_info: { total_pages: 2 },
      }));
    }
    if (url.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ models: [] }));
    if (url.includes("models.github.ai")) return new Response(JSON.stringify([]));
    return new Response(JSON.stringify({ data: [] }));
  };
  const catalog = await collectModelCatalog({
    fetchImpl,
    env: {
      AIHUBMIX_API_KEY: secret,
      CEREBRAS_API_KEY: secret,
      CLOUDFLARE_API_TOKEN: secret,
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      GEMINI_API_KEY: secret,
      GITHUB_TOKEN: secret,
      GROQ_API_KEY: secret,
      NVIDIA_NIM_API_KEY: secret,
      OPENCODE_ZEN_KEY: secret,
      OPENROUTER_API_KEY: secret,
    },
    cliInventories: {
      alibaba: { complete: true, rawIds: ["alibaba/a"], eligibleIds: [] },
      opencode: { complete: true, rawIds: ["opencode-go/a"], eligibleIds: ["opencode-go/a"] },
    },
    now: 123,
  });

  assert.equal(catalog.providers.cloudflare.complete, true);
  assert.equal(catalog.providers.cloudflare.pages, 2);
  assert.deepEqual(catalog.providers.cloudflare.rawIds, [
    "@cf/meta/image-generation-model", "@cf/meta/text-one", "@cf/qwen/text-two",
  ]);
  assert.deepEqual(catalog.providers.cloudflare.eligibleIds, ["@cf/meta/text-one", "@cf/qwen/text-two"]);
  assert.equal(calls.filter(call => call.url.includes("api.cloudflare.com")).length, 2);
  assert.doesNotMatch(JSON.stringify(catalog), /catalog-secret-sentinel/);
  assert.ok(calls.every(call => call.options.redirect === "error"));
  assert.ok(calls.some(call => call.url === "https://models.github.ai/catalog/models"));
});

test("identity dedupe uses provider and exact model ID and resolves logical collisions", () => {
  const candidates = dedupeAndNameCandidates([
    { provider: "one", modelId: "a/b", logicalName: "same" },
    { provider: "one", modelId: "a/b", logicalName: "duplicate-name" },
    { provider: "two", modelId: "a/b", logicalName: "same" },
    { provider: "one", logicalName: "logical-only" },
  ]);
  assert.equal(candidates.length, 3);
  assert.equal(candidateIdentity(candidates[0]), "one\0a/b");
  assert.equal(candidates[0].logicalName, "same");
  assert.match(candidates[1].logicalName, /^same-[a-f0-9]{8}$/);
  assert.equal(candidateIdentity(candidates[2]), "one\0logical:logical-only");
});

test("manual routes keep their identity and are never inferred as catalog-dynamic", () => {
  const manual = { logicalName: "manual-groq", provider: "groq", modelId: "vendor/same", testVia: "direct" };
  const discovered = { ...manual, logicalName: "auto-groq", dynamicProvenance: "catalog-auto-v1" };
  const merged = mergeCatalogCandidates([manual], [manual], [discovered]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].logicalName, "manual-groq");
  assert.equal(isExplicitCatalogDynamic(merged[0]), false);
});

test("billing admission distinguishes verified-zero, subscription, and explicit unverified approval", () => {
  assert.equal(dynamicProviderAdmissionPolicy("aihubmix").pricingEvidence, "verified-zero-price");
  assert.equal(dynamicProviderAdmissionPolicy("openrouter").rotationClass, "free-first");
  assert.equal(dynamicProviderAdmissionPolicy("groq").autoPromotionPolicy, "manual-approval-required");
  assert.equal(dynamicProviderAdmissionPolicy("zen").rotationClass, "subscription");
  assert.equal(hasExplicitBillingApproval({ forceAllow: true }), false);
  assert.equal(hasExplicitBillingApproval({ billingApproved: true, billingApprovalProvenance: "operator:alice" }), true);
  assert.equal(hasExplicitBillingApproval({ billingApproved: true, billingApprovalProvenance: "ticket-only" }), false);
});

test("current credential failures suppress all model fanout sharing that key", () => {
  const now = 1234;
  const candidates = annotateCandidatesWithCredentialHealth([
    { logicalName: "one", provider: "groq", modelId: "one", apiKeyEnv: "GROQ_API_KEY" },
    { logicalName: "two", provider: "groq", modelId: "two", apiKeyEnv: "GROQ_API_KEY" },
  ], {
    generatedAt: now,
    credentials: { GROQ_API_KEY: { status: "expired", checkedAt: now } },
  }, now);
  const planned = planModelProbeQueue(candidates, { mode: "full", now });
  assert.deepEqual(planned.probe, []);
  assert.deepEqual(planned.copy.map(row => row.reason), ["credential_expired", "credential_expired"]);
  assert.equal(candidates.every(row => row.credentialBlocked), true);
});

test("forceAllow cannot authorize an unverified dynamic provider probe", () => {
  const admission = dynamicProviderAdmissionPolicy("groq");
  const candidate = {
    logicalName: "groq-new", provider: "groq", modelId: "new", dynamicProvenance: "catalog-auto-v1",
    catalogEligibility: "eligible", ...admission,
  };
  const blocked = planModelProbeQueue([candidate], {
    mode: "full", policy: { models: { "groq-new": { forceAllow: true } } },
  });
  assert.equal(blocked.copy[0].reason, "billing_approval_required");
  const approved = planModelProbeQueue([candidate], {
    mode: "full", policy: { models: { "groq-new": {
      forceAllow: true, billingApproved: true, billingApprovalProvenance: "operator:alice",
    } } },
  });
  assert.deepEqual(approved.probe.map(row => row.logicalName), ["groq-new"]);
});

test("activation proposals are current-run identity evidence and stale/price-drift rows are dropped", () => {
  const now = 5000;
  const admission = dynamicProviderAdmissionPolicy("aihubmix");
  const candidate = {
    logicalName: "aihubmix-free", provider: "aihubmix", modelId: "free/model",
    catalogModelId: "free/model", dynamicProvenance: "catalog-auto-v1",
    litellmModel: "openai/free/model", litellmApiBase: "https://aihubmix.com/v1",
    litellmApiKeyEnv: "AIHUBMIX_API_KEY",
    catalogComplete: true, catalogEligibility: "eligible",
    probeSucceededThisRun: true, lastTestedAt: now, credentialStatus: "valid",
    ...admission,
  };
  const proposed = buildActivationEvidence({
    previousPendingActivation: ["stale-name-only"], candidates: [candidate],
    configuredBindings: [], runtimeBindings: [], observedAt: now,
  });
  assert.equal(proposed.mutationAuthorized, false);
  assert.equal(proposed.discardedPreviousCount, 1);
  assert.deepEqual(proposed.pendingActivation, ["aihubmix-free"]);
  assert.equal(proposed.pendingProposals[0].identity, "aihubmix\0free/model");
  assert.equal(proposed.pendingProposals[0].substantiveEvidenceAt, now);

  const drifted = buildActivationEvidence({
    previousPendingActivation: proposed.pendingProposals,
    candidates: [{ ...candidate, catalogEligibility: "ineligible", pricingEvidence: "paid" }],
    configuredBindings: [], runtimeBindings: [], observedAt: now + 1,
  });
  assert.deepEqual(drifted.pendingActivation, []);
  assert.equal(drifted.discardedPreviousCount, 1);

  const runtimePending = buildActivationEvidence({
    candidates: [{ ...candidate, lastTestedAt: now + 2 }],
    configuredBindings: [proposed.pendingProposals[0]], runtimeBindings: null, observedAt: now + 2,
  });
  assert.deepEqual(runtimePending.runtimeProofRequiredNames, [candidate.logicalName]);
  assert.equal(runtimePending.restartRequired, false);
});

test("same logical name on a wrong or paid backend cannot satisfy activation identity", () => {
  const now = 6000;
  const candidate = {
    logicalName: "aihubmix-free", provider: "aihubmix", modelId: "free/model",
    catalogModelId: "free/model", dynamicProvenance: "catalog-auto-v1",
    litellmModel: "openai/free/model", litellmApiBase: "https://aihubmix.com/v1",
    litellmApiKeyEnv: "AIHUBMIX_API_KEY",
    catalogComplete: true, catalogEligibility: "eligible",
    probeSucceededThisRun: true, lastTestedAt: now, credentialStatus: "valid",
    ...dynamicProviderAdmissionPolicy("aihubmix"),
  };
  const proposal = buildActivationEvidence({
    candidates: [candidate], configuredBindings: [], runtimeBindings: [], observedAt: now,
  }).pendingProposals[0];
  const exactConfig = { ...proposal };
  const exactRuntime = { ...proposal };
  delete exactRuntime.litellmApiKeyEnv;
  const wrongPaidConfig = {
    ...exactConfig,
    provider: "openrouter",
    modelId: "vendor/paid",
    litellmModel: "openrouter/vendor/paid",
  };
  const wrongRuntime = { ...exactRuntime, modelId: "paid/model", litellmModel: "openai/paid/model" };

  const wrongConfig = buildActivationEvidence({
    candidates: [candidate], configuredBindings: [wrongPaidConfig], runtimeBindings: [exactRuntime], observedAt: now,
  });
  assert.deepEqual(wrongConfig.activated, []);
  assert.deepEqual(wrongConfig.configBindingMismatchNames, [candidate.logicalName]);
  assert.equal(wrongConfig.pendingProposals[0].configuredBindingStatus, "mismatch");

  const wrongLive = buildActivationEvidence({
    candidates: [candidate], configuredBindings: [exactConfig], runtimeBindings: [wrongRuntime], observedAt: now,
  });
  assert.deepEqual(wrongLive.activated, []);
  assert.deepEqual(wrongLive.runtimeBindingMismatchNames, [candidate.logicalName]);
  assert.equal(wrongLive.restartRequired, true);

  const exact = buildActivationEvidence({
    candidates: [candidate], configuredBindings: [exactConfig], runtimeBindings: [exactRuntime], observedAt: now,
  });
  assert.deepEqual(exact.activated, [candidate.logicalName]);
  assert.deepEqual(exact.pendingActivation, []);
});

test("configured model lookup is exact rather than substring-based", () => {
  const names = parseConfiguredModelNames(`
    - model_name: alpha-long
    - model_name: "quoted/model"
    # - model_name: ignored-comment
  `);
  assert.equal(names.has("alpha-long"), true);
  assert.equal(names.has("alpha"), false);
  assert.equal(names.has("quoted/model"), true);
  assert.equal(names.has("ignored-comment"), false);
});

test("redemption is catalog-bound, quality-key aware, fair, capped, and forceBlock-safe", () => {
  const candidates = [
    { provider: "groq", logicalName: "g-one", modelId: "g/one", resolvedModel: "resolved/g-one" },
    { provider: "groq", logicalName: "g-two", modelId: "g/two" },
    { provider: "groq", logicalName: "g-three", modelId: "g/three" },
    { provider: "zen", logicalName: "z-one", modelId: "z/one" },
    { provider: "zen", logicalName: "z-blocked", modelId: "z/blocked" },
    { provider: "other", logicalName: "not-visible", modelId: "missing" },
  ];
  const previousModels = candidates.map((model, index) => ({
    ...model,
    available: index !== 0 ? true : false,
    lastTestedAt: index + 1,
  }));
  const selected = selectRedemptionCandidates(candidates, {
    previousModels,
    quality: { models: {
      "resolved/g-one": { status: "degraded" },
      "g/two": { status: "blocked" },
      "g/three": { status: "probation" },
      "z/one": { status: "degraded" },
      "z/blocked": { status: "blocked" },
    } },
    policy: { models: { "z/blocked": { forceBlock: true } } },
    catalog: { providers: {
      groq: { complete: true, rawIds: ["g/one", "g/two", "g/three"], eligibleIds: ["g/one", "g/two", "g/three"] },
      zen: { complete: true, rawIds: ["z/one", "z/blocked"], eligibleIds: ["z/one", "z/blocked"] },
      other: { complete: true, rawIds: [], eligibleIds: [] },
    } },
    perProviderCap: 2,
    globalCap: 3,
  });
  assert.deepEqual(selected.map(model => model.logicalName), ["g-one", "z-one", "g-two"]);
  assert.equal(selected.some(model => model.logicalName === "z-blocked"), false);
});

test("GitHub live catalog schema admits text-output chat IDs and rejects embeddings", async () => {
  const chat = {
    id: "openai/gpt-4.1",
    supported_input_modalities: ["text", "image"],
    supported_output_modalities: ["text"],
    capabilities: ["agents", "streaming", "tool-calling", "agentsV2"],
  };
  const embedding = {
    id: "openai/text-embedding-3-large",
    supported_input_modalities: ["text"],
    supported_output_modalities: ["embeddings"],
    capabilities: [],
  };
  const empty = JSON.stringify({ data: [] });
  const fetchImpl = async url => {
    if (url.includes("models.github.ai/catalog/models")) return new Response(JSON.stringify([chat, embedding]));
    if (url.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ models: [] }));
    if (url.includes("api.cloudflare.com")) return new Response(JSON.stringify({ result: [], result_info: { total_pages: 1 } }));
    return new Response(empty);
  };
  const secret = "fixture-secret";
  const catalog = await collectModelCatalog({
    fetchImpl,
    env: {
      AIHUBMIX_API_KEY: secret, CEREBRAS_API_KEY: secret, CLOUDFLARE_API_TOKEN: secret,
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", GEMINI_API_KEY: secret,
      GITHUB_TOKEN: secret, GROQ_API_KEY: secret, NVIDIA_NIM_API_KEY: secret,
      OPENCODE_ZEN_KEY: secret, OPENROUTER_API_KEY: secret,
    },
    cliInventories: {
      alibaba: { complete: true, rawIds: [], eligibleIds: [] },
      opencode: { complete: true, rawIds: [], eligibleIds: [] },
    },
  });
  assert.deepEqual(catalog.providers.github.rawIds, ["openai/gpt-4.1", "openai/text-embedding-3-large"]);
  assert.deepEqual(catalog.providers.github.eligibleIds, ["openai/gpt-4.1"]);
});

test("catalog collapse and absent removal require repeated authoritative observations", () => {
  const prior = {
    rawIds: ["a", "b", "c", "d", "e", "f"],
    eligibleIds: ["a", "b", "c", "d", "e", "f"],
    lastSuccessfulAt: 1,
  };
  const partial = { complete: true, rawIds: ["a"], eligibleIds: ["a"], pages: 1 };
  const first = mergeProviderInventory("groq", partial, prior, 2);
  assert.equal(first.complete, false);
  assert.deepEqual(first.eligibleIds, prior.eligibleIds);
  const second = mergeProviderInventory("groq", partial, first, 3);
  assert.equal(second.complete, true);
  assert.deepEqual(second.pendingRemovalIds, ["b", "c", "d", "e", "f"]);
  assert.deepEqual(second.eligibleIds, prior.eligibleIds);
  const third = mergeProviderInventory("groq", partial, second, 4);
  assert.deepEqual(third.eligibleIds, ["a"]);
  assert.deepEqual(third.eligibleRemovedIds, ["b", "c", "d", "e", "f"]);
});

test("visible price/type ineligibility is immediate rather than removal-hysteresis", () => {
  const merged = mergeProviderInventory("aihubmix", {
    complete: true,
    rawIds: ["was-free"],
    eligibleIds: [],
    pages: 2,
  }, {
    rawIds: ["was-free"],
    eligibleIds: ["was-free"],
  }, 9);
  assert.deepEqual(merged.pendingRemovalIds, []);
  assert.deepEqual(merged.eligibleIds, []);
  assert.deepEqual(merged.eligibleRemovedIds, ["was-free"]);
});

test("quick queue only refreshes bounded stale healthy incumbents", () => {
  const now = 100_000;
  const candidates = [
    { logicalName: "redeem", provider: "groq", modelId: "g/redeem", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
    { logicalName: "stale", provider: "groq", modelId: "g/stale", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
    { logicalName: "blocked", provider: "groq", modelId: "g/blocked", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
  ];
  const previousModels = [
    { ...candidates[0], available: false, probeContractOk: false, lastTestedAt: 1 },
    { ...candidates[1], available: true, probeContractOk: true, lastTestedAt: 2 },
    { ...candidates[2], available: true, probeContractOk: true, lastTestedAt: 3 },
  ];
  const planned = planModelProbeQueue(candidates, {
    mode: "quick", previousModels, now, staleAfterMs: 10, staleCap: 1,
    quality: { models: { blocked: { status: "blocked" } } },
  });
  assert.deepEqual(planned.probe.map(model => model.logicalName), ["stale"]);
  assert.equal(planned.copy.find(row => row.model.logicalName === "redeem").reason, "redemption_full_only");
  assert.equal(planned.copy.find(row => row.model.logicalName === "blocked").reason, "redemption_full_only");
});

test("full redemption is current-eligible, fair, and capped", () => {
  const candidates = [
    { logicalName: "g1", provider: "groq", modelId: "g/1", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
    { logicalName: "g2", provider: "groq", modelId: "g/2", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
    { logicalName: "z1", provider: "zen", modelId: "z/1", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "eligible", probeContractRequired: true },
    { logicalName: "gone", provider: "zen", modelId: "z/gone", dynamicProvenance: "catalog-auto-v1", catalogEligibility: "ineligible", probeContractRequired: true },
  ];
  const previousModels = candidates.map(model => ({ ...model, available: false, lastTestedAt: 1 }));
  const planned = planModelProbeQueue(candidates, {
    mode: "full", previousModels, staleAfterMs: 10, staleCap: 1,
    catalog: { providers: {
      groq: { complete: true, eligibleIds: ["g/1", "g/2"] },
      zen: { complete: true, eligibleIds: ["z/1"] },
    } },
    redemptionPerProvider: 1,
    redemptionGlobal: 2,
  });
  assert.deepEqual(planned.probe.map(model => model.logicalName), ["g1", "z1"]);
  assert.equal(planned.copy.find(row => row.model.logicalName === "g2").reason, "redemption_capped");
  assert.equal(planned.copy.find(row => row.model.logicalName === "gone").reason, "catalog_ineligible");
});

test("exact probe contract and YAML rendering reject near-misses and injection", () => {
  assert.equal(isExactPingResponse('{"status":"ok"}'), true);
  assert.equal(isExactPingResponse('{"status":"ok","extra":true}'), false);
  assert.equal(isExactPingResponse('```json\n{"status":"ok"}\n```'), false);
  const entry = renderLiteLLMModelEntry({
    logicalName: "openrouter-safe-free",
    provider: "openrouter",
    modelId: "vendor/model:free",
    catalogModelId: "vendor/model:free",
    dynamicProvenance: "catalog-auto-v1",
    litellmModel: "openrouter/vendor/model:free",
    litellmApiBase: "https://openrouter.ai/api/v1",
    litellmApiKeyEnv: "OPENROUTER_API_KEY",
  });
  assert.match(entry, /model_name: 'openrouter-safe-free'/);
  assert.match(entry, /model: 'openrouter\/vendor\/model:free'/);
  assert.match(entry, /mimule_catalog_provider: 'openrouter'/);
  const [binding] = parseConfiguredModelBindings(entry);
  assert.equal(binding.provider, "openrouter");
  assert.equal(binding.modelId, "vendor/model:free");
  assert.equal(binding.provenance, "catalog-auto-v1");
  assert.match(binding.bindingIdentity, /^[a-f0-9]{64}$/);
  assert.throws(() => renderLiteLLMModelEntry({
    logicalName: "evil\n# injected", provider: "openrouter", modelId: "x",
    dynamicProvenance: "catalog-auto-v1", litellmModel: "openai/x", litellmApiKeyEnv: "SAFE_KEY",
  }), /safe provider identifier/);
  assert.throws(() => renderLiteLLMModelEntry({
    logicalName: "safe", provider: "openrouter", modelId: "x",
    dynamicProvenance: "catalog-auto-v1", litellmModel: "openai/x#comment", litellmApiKeyEnv: "SAFE_KEY",
  }), /safe provider identifier/);
});

test("provider failures normalize to status/category only", () => {
  assert.equal(normalizeProbeFailure(401), "HTTP 401 auth");
  assert.equal(normalizeProbeFailure(429), "HTTP 429 rate_limit");
  assert.equal(normalizeProbeFailure(503), "HTTP 503 provider_error");
  assert.equal(normalizeProbeFailure(null, new Error("secret provider body")), "transport_error");
});

test("catalog writes atomically with root-only mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-catalog-"));
  try {
    const target = join(directory, "catalog.json");
    const document = { schemaVersion: 1, policyVersion: "bounded-provider-inventory-v1", providers: {} };
    writeModelCatalogAtomic(target, document, ["secret-not-present"]);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), document);
    assert.equal(statSync(target).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
