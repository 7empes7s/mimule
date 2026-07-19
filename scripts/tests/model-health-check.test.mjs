import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, "..", "model-health-check.mjs");
const source = fs.readFileSync(scriptPath, "utf8");

function fallbackPlannerSource() {
  const start = source.indexOf("function buildFallbackPlan(ranked, dynamicBilling = {})");
  const end = source.indexOf("\nfunction loadPolicy()", start);
  assert.notEqual(start, -1, "buildFallbackPlan must exist");
  assert.notEqual(end, -1, "buildFallbackPlan must end before loadPolicy");
  return source.slice(start, end);
}

test("fallback planner is pure and the old config rewrite path is absent", () => {
  const planner = fallbackPlannerSource();

  assert.doesNotMatch(planner, /\bfs\./);
  assert.doesNotMatch(planner, /LITELLM_CFG/);
  assert.doesNotMatch(planner, /writeFileSync/);
  assert.doesNotMatch(source, /rewriteFallbackChains/);
  assert.doesNotMatch(source, /fallback chain update/);

  assert.doesNotMatch(source, /fs\.writeFileSync\(LITELLM_CFG/);
  assert.doesNotMatch(source, /validateLiteLLMConfigText\(/);
  assert.doesNotMatch(source, /writeLiteLLMConfigAtomic\(/);
  assert.doesNotMatch(source, /\/model\/new/);
  assert.doesNotMatch(source, /systemctl/);
});

test("fallback planner preserves deterministic recommendations without writing files", () => {
  const context = {
    PAID_LAST_RESORT_MODELS: new Set(["paid-heavy", "paid-medium"]),
  };
  vm.runInNewContext(
    `${fallbackPlannerSource()}\nglobalThis.buildPlan = buildFallbackPlan;`,
    context,
  );

  const plan = JSON.parse(JSON.stringify(context.buildPlan({
    heavy: ["free-heavy", "paid-heavy", "free-heavy"],
    medium: ["free-medium", "paid-medium"],
    light: ["light-one", "light-two", "light-three"],
  })));

  assert.deepEqual(plan, {
    heavyChain: [
      "free-heavy",
      "free-medium",
      "github-gpt41",
      "editorial-heavy",
      "paid-heavy",
      "paid-medium",
    ],
    fastChain: [
      "free-medium",
      "free-heavy",
      "github-gpt41",
      "editorial-fast",
      "paid-heavy",
      "paid-medium",
    ],
    gpuHeavyFallback: [
      "free-heavy",
      "free-medium",
      "editorial-cloud-heavy",
      "paid-heavy",
      "paid-medium",
    ],
    gpuFastFallback: [
      "free-medium",
      "free-heavy",
      "editorial-cloud-fast",
      "paid-heavy",
      "paid-medium",
    ],
    cheapFallback: ["free-medium", "light-one", "light-two", "paid-medium"],
    chatFallback: ["free-medium", "free-heavy", "github-gpt4o-mini"],
  });
});

test("only verified-zero dynamic routes precede the local sentinel", () => {
  const context = { PAID_LAST_RESORT_MODELS: new Set() };
  vm.runInNewContext(`${fallbackPlannerSource()}\nglobalThis.buildPlan = buildFallbackPlan;`, context);
  const plan = JSON.parse(JSON.stringify(context.buildPlan({
    heavy: ["free-auto", "quota-auto", "subscription-auto"], medium: [], light: [],
  }, {
    "free-auto": { pricingEvidence: "verified-zero-price", autoPromotionPolicy: "automatic-verified-zero", rotationClass: "free-first" },
    "quota-auto": { pricingEvidence: "included-quota-unverified", autoPromotionPolicy: "manual-approval-required", rotationClass: "manual-approval-required" },
    "subscription-auto": { pricingEvidence: "subscription-policy", autoPromotionPolicy: "operator-approved-subscription", rotationClass: "subscription" },
  })));
  assert.ok(plan.heavyChain.indexOf("free-auto") < plan.heavyChain.indexOf("editorial-heavy"));
  assert.ok(plan.heavyChain.indexOf("quota-auto") > plan.heavyChain.indexOf("editorial-heavy"));
  assert.ok(plan.heavyChain.indexOf("subscription-auto") > plan.heavyChain.indexOf("editorial-heavy"));
});

test("credential observations run only on full checks and cannot fail the model check", () => {
  const callIndex = source.indexOf("await refreshCredentialHealth(now);");
  assert.notEqual(callIndex, -1);
  const guardIndex = source.lastIndexOf('if (mode === "full") {', callIndex);
  assert.notEqual(guardIndex, -1);
  assert.match(source.slice(guardIndex, callIndex + 80), /if \(mode === "full"\) \{\s*try \{\s*credentialHealth = await refreshCredentialHealth\(now\);/);
  assert.match(source, /Credential health: refresh unavailable; model check continues/);
  assert.equal((source.match(/await refreshCredentialHealth\(now\);/g) ?? []).length, 1);
  assert.match(source, /CREDENTIAL_HEALTH_FILE = "\/var\/lib\/mimule\/credential-health\.json"/);
  assert.doesNotMatch(source, /recent observation retained|credentialHealthCoversRelevantKeys/);
  assert.match(source, /annotateCandidatesWithCredentialHealth\(candidates, credentialHealth, now\)/);
});

test("catalog discovery is full-only, atomic, and queue mode is explicit", () => {
  assert.match(source, /if \(mode === "full"\) \{\s*const full = await buildFullCandidateSet\(readModelCatalogPrevious\(MODEL_CATALOG_FILE\), now, previous\.models \|\| \[\]\)/);
  assert.match(source, /writeModelCatalogAtomic\(MODEL_CATALOG_FILE, catalog, forbiddenValues\)/);
  assert.match(source, /planModelProbeQueue\(candidates, \{\s*mode,/);
  assert.doesNotMatch(source, /models\.inference\.ai\.azure\.com/);
  assert.match(source, /https:\/\/models\.github\.ai\/inference/);
  assert.doesNotMatch(source, /CF_MAX_DISCOVERED|slice\(0, CF_MAX_DISCOVERED\)/);
});

test("registration needs a substantive direct response and recovery notifications use Map.get", () => {
  assert.match(source, /result\.testVia === "direct"\s*&& result\.probeSucceededThisRun === true/);
  assert.match(source, /result\.probeSucceededThisRun === true/);
  assert.match(source, /buildActivationEvidence\(\{/);
  assert.doesNotMatch(source, /hotAddModel|addToLitellmConfig/);
  assert.match(source, /const prev = prevMap\.get\(result\.logicalName\);/);
  assert.doesNotMatch(source, /prevMap\[result\.logicalName\]/);
});

test("activation wiring carries exact configured and runtime catalog identities", () => {
  assert.match(source, /parseConfiguredModelBindings\(fs\.readFileSync\(LITELLM_CFG/);
  assert.match(source, /async function fetchRuntimeModelBindings\(\)/);
  assert.match(source, /model_info\?\.mimule_catalog_provider/);
  assert.match(source, /model_info\?\.mimule_catalog_model_id/);
  assert.match(source, /model_info\?\.mimule_binding_identity/);
  assert.match(source, /configuredBindings,/);
  assert.match(source, /runtimeBindings,/);
  assert.match(source, /configBindingMismatchNames: activationEvidence\.configBindingMismatchNames/);
});

test("OpenCode probes use bounded hidden titles passed as argv", () => {
  assert.match(source, /__mimule_probe_v1__:model-health:workload:/);
  assert.match(source, /__mimule_probe_v1__:model-health:availability:/);
  assert.match(source, /spawn\("\/root\/\.opencode\/bin\/opencode", args/);
  assert.match(source, /execFileSync\("\/root\/\.opencode\/bin\/opencode", args/);
  assert.doesNotMatch(source, /execSync\(`\/root\/\.opencode\/bin\/opencode run/);
});

test("direct model failures are status/category only and AIHub canned quota responses are rejected", () => {
  assert.match(source, /normalizeProbeFailure\(res\.status\)/);
  assert.match(source, /classifyAiHubMixCompletion\(body, probeContractOk\)/);
  assert.doesNotMatch(source, /error: `HTTP \$\{res\.status\}: \$\{txt\.slice/);
});
