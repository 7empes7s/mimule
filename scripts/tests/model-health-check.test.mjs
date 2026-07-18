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
  const start = source.indexOf("function buildFallbackPlan(ranked)");
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

  const configWrites = source.match(/fs\.writeFileSync\(LITELLM_CFG/g) ?? [];
  assert.equal(configWrites.length, 1, "only model registration may write the LiteLLM config");
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

test("credential observations run only on full checks and cannot fail the model check", () => {
  const callIndex = source.indexOf("await refreshCredentialHealth(now);");
  assert.notEqual(callIndex, -1);
  const guardIndex = source.lastIndexOf('if (mode === "full") {', callIndex);
  assert.notEqual(guardIndex, -1);
  assert.match(source.slice(guardIndex, callIndex + 40), /if \(mode === "full"\) \{\s*try \{\s*await refreshCredentialHealth\(now\);/);
  assert.match(source, /Credential health: refresh unavailable; model check continues/);
  assert.equal((source.match(/await refreshCredentialHealth\(now\);/g) ?? []).length, 1);
  assert.match(source, /CREDENTIAL_HEALTH_FILE = "\/var\/lib\/mimule\/credential-health\.json"/);
});
