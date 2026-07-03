#!/usr/bin/env node
/**
 * model-health-check.mjs — TechInsiderBytes model availability + ranking check
 *
 * Modes:
 *   --mode=full  : every 6h, probe registry models, discover free-eligible cloud
 *                  models across providers, rewrite LiteLLM fallback chains
 *   --mode=quick : every 15m, re-check the last known-good cloud pool and
 *                  proactively rewrite chains; if the pool collapses, force a
 *                  full discovery pass immediately
 *
 * Availability and quality are separate concerns:
 *   - availability: can the provider answer right now?
 *   - quality: when it answers, does it produce usable structured output?
 *
 * Output:
 *   - /var/lib/mimule/model-health.json
 *   - reads /var/lib/mimule/model-quality.json
 *   - reads /etc/mimule/model-policy.json
 */

import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { recalculateAllStatuses } from "/opt/mimoun/scripts/model-quality-writer.mjs";

const HEALTH_FILE         = "/var/lib/mimule/model-health.json";
const QUALITY_FILE        = "/var/lib/mimule/model-quality.json";
const POLICY_FILE         = "/etc/mimule/model-policy.json";
const DISCOVERY_LOG_FILE  = "/var/lib/mimule/model-discovery-log.jsonl";
const LITELLM_ENV  = "/etc/litellm/litellm.env";
const AUTOPIPE_ENV = "/etc/default/newsbites-autopipeline";
const LITELLM_CFG  = "/etc/litellm/config.yaml";

const PING_PROMPT   = 'Reply with exactly this JSON object on one line, nothing else: {"status":"ok"}';
const PING_TIMEOUT  = 20_000;
const PING_MAX_TOKENS = 40;
const GOOD_LATENCY  = 15_000;
const QUALITY_REQUIRED_CAPABILITIES = new Set(["heavy", "medium"]);
const PAID_LAST_RESORT_MODELS = new Set([
  "cerebras-qwen3-235b-paid",  // PAID key — last resort + OpenCode only
]);

const SUBSCRIPTION_FALLBACK_MODELS = new Set([
  "zen-minimax-m2-7",
  "zen-gpt-5-4",
  "zen-gpt-5-4-mini",
  "zen-gpt-5-3-codex",
  "zen-claude-sonnet-4-6",
]);



function extractAssistantContent(body) {
  try {
    const obj = JSON.parse(body);
    const content = obj?.choices?.[0]?.message?.content ?? obj?.choices?.[0]?.text ?? "";
    // Cloudflare Workers AI returns content as a parsed JSON object, not a string
    if (typeof content === "object" && content !== null) return JSON.stringify(content);
    return content;
  } catch {
    return "";
  }
}

function isParseableJsonResponse(content) {
  if (!content || typeof content !== "string") return false;
  const text = content.trim();
  if (!text) return false;
  // Try direct parse first; if that fails, try to extract a JSON object from
  // surrounding text (some models still wrap in markdown despite instructions).
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === "object";
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return false;
    try {
      const obj = JSON.parse(match[0]);
      return obj && typeof obj === "object";
    } catch {
      return false;
    }
  }
}
const MAX_NEW_OR    = 8;
const FULL_STALE_MS = 7 * 3600 * 1000;
const QUICK_COLLAPSE_MIN_PREV = 3;
const QUICK_COLLAPSE_MAX_CURR = 1;

// ── Workload probes ─────────────────────────────────────────────────────────
const WORKLOAD_PROBE_TIMEOUT  = 30_000;
const WORKLOAD_CLI_PROBE_TIMEOUT = 45_000;
const WORKLOAD_PROBE_MAX_TOK  = 150;
// How stale a workload result must be before re-probing (24h)
const WORKLOAD_TTL_MS         = 24 * 3600 * 1000;
const WORKLOAD_QUEUE_DEPTH       = 8;                       // cloud models workload-scored per run (oldest-first rotation)
const WORKLOAD_CLI_MAX_PER_RUN   = 3;                       // cap opencode-CLI workload probes per run (they are slow)
const AVAILABILITY_RETEST_MS     = 24 * 3600 * 1000;        // re-ping a "healthy" cloud model if last REALLY probed > 24h ago
const AVAILABILITY_RETEST_MAX    = 24;                      // cap stale healthy-cloud re-pings per run (avoid rate limits)
const RETIRE_AFTER_MS            = 30 * 24 * 3600 * 1000;   // drop models unavailable continuously > 30 days
const BENCHMARKS_FILE         = "/var/lib/mimule/model-benchmarks.json";

const WORKLOAD_TASKS = {
  coding: {
    prompt: "Write a TypeScript function called sumPositives that takes an array of numbers and returns the sum of all positive numbers. Output only the function, no explanation, no markdown fences.",
    score(content) {
      const c = content || "";
      const hasName = /sumPositives/.test(c);
      const hasReturn = /return/.test(c);
      if (!hasName) return 0;
      if (!hasReturn) return 30;
      return 100;
    },
  },
  writing: {
    prompt: "Write a single paragraph (3–4 sentences, plain text, no markdown, no headings) explaining how photosynthesis works.",
    score(content) {
      const c = (content || "").trim();
      const words = c.split(/\s+/).length;
      if (words < 20 || words > 250) return 20;
      if (/^[#*\-]/m.test(c)) return 40;
      if (!/photosynthesis|sunlight|chlorophyll|glucose|carbon dioxide/i.test(c)) return 50;
      return 100;
    },
  },
  reasoning: {
    prompt: "Alice is taller than Bob. Bob is taller than Carol. Who is the shortest? Reply with exactly one word, no punctuation.",
    score(content) {
      return (content || "").trim().toLowerCase().replace(/[^a-z]/g, "") === "carol" ? 100 : 0;
    },
  },
};

// Run an opencode CLI probe in its OWN process group and SIGKILL the whole group on
// timeout, so the opencode process (and any children) can never orphan to init.
function runOpencodeProbe(modelId, prompt, key, timeoutMs) {
  return new Promise((resolve) => {
    const args = ["run", "--dangerously-skip-permissions"];
    if (modelId) args.push("--model", modelId);
    args.push("-");
    const child = spawn("/root/.opencode/bin/opencode", args, {
      detached: true, // new process group → kill(-pid) reaps the whole tree
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_ZEN_KEY: key },
    });
    let out = "", err = "", done = false;
    const finish = (res) => { if (done) return; done = true; clearTimeout(timer); resolve(res); };
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
      finish({ timedOut: true, stdout: out, stderr: err });
    }, timeoutMs);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", (e) => finish({ error: e.message, stdout: out, stderr: err }));
    child.on("close", () => finish({ stdout: out, stderr: err }));
    try { child.stdin.write(prompt); child.stdin.end(); } catch { /* race on early exit */ }
  });
}

async function runWorkloadProbe(model, taskKey) {
  const task = WORKLOAD_TASKS[taskKey];
  if (model.testVia === "opencode") {
    const key = env[model.apiKeyEnv];
    if (!key) return { score: 0, latencyMs: 0, error: `no ${model.apiKeyEnv}` };
    const start = Date.now();
    const modelFlag = model.modelId || "";
    const r = await runOpencodeProbe(modelFlag, task.prompt, key, WORKLOAD_CLI_PROBE_TIMEOUT);
    const latencyMs = Date.now() - start;
    if (r.timedOut) return { score: 0, latencyMs, error: "timeout" };
    if (r.error)    return { score: 0, latencyMs, error: r.error.slice(0, 120) };
    const lines = stripAnsi(r.stdout || "").split("\n").map(l => l.trim()).filter(Boolean);
    const content = lines.filter(l => !l.startsWith("> ")).pop() || "";
    return { score: task.score(content), latencyMs };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKLOAD_PROBE_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:4000/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LITELLM_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: model.logicalName,
        messages: [{ role: "user", content: task.prompt }],
        temperature: 0,
        max_tokens: WORKLOAD_PROBE_MAX_TOK,
        store: false,
        // Disable router fallbacks so we score THIS model, not whichever
        // fallback silently answered for a dead group.
        fallbacks: [],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { score: 0, latencyMs: Date.now() - start, error: `HTTP ${res.status}` };
    const content = extractAssistantContent(await res.text().catch(() => ""));
    return { score: task.score(content), latencyMs: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { score: 0, latencyMs: Date.now() - start, error: e.name === "AbortError" ? "timeout" : e.message };
  }
}

// Run workload probes for a batch of results; merge into quality file.
// Returns a Map<logicalName, workloadScores>.
async function runWorkloadProbesForResults(results, quality) {
  const now = Date.now();
  const shouldProbe = r => {
    const q = quality?.models?.[r.logicalName];
    const lastProbed = q?.workloadScores?.lastProbedAt ?? 0;
    return now - lastProbed > WORKLOAD_TTL_MS;
  };

  const lastProbedOf = (r) => quality?.models?.[r.logicalName]?.workloadScores?.lastProbedAt ?? 0;
  // Always probe available local models (GPU health is critical and cheap via LiteLLM).
  const localAvail = results.filter(r => r.available && r.provider === "local" && shouldProbe(r));
  // Rotate cloud models oldest-first (never-probed = 0 sorts first), capping queue depth and CLI probes.
  const cloudPool = results
    .filter(r => r.available && r.provider !== "local" && shouldProbe(r))
    .sort((a, b) => lastProbedOf(a) - lastProbedOf(b));
  const cloudQueued = [];
  let cliUsed = 0;
  for (const m of cloudPool) {
    if (cloudQueued.length >= WORKLOAD_QUEUE_DEPTH) break;
    if (m.testVia === "opencode") {
      if (cliUsed >= WORKLOAD_CLI_MAX_PER_RUN) continue;
      cliUsed++;
    }
    cloudQueued.push(m);
  }
  const toProbe = [...localAvail, ...cloudQueued];
  const unavailable = results.filter(r => !r.available && shouldProbe(r));

  if (toProbe.length === 0 && unavailable.length === 0) return new Map();

  console.log(`\nWorkload probes: ${toProbe.length} queued (${localAvail.length} local, ${cloudQueued.length} cloud; ${cloudPool.length} cloud eligible) + ${unavailable.length} unavailable zero-score records...`);

  const scoreMap = new Map();

  for (const model of unavailable) {
    const scores = {
      json: 0,
      coding: 0,
      writing: 0,
      reasoning: 0,
      lastProbedAt: now,
      unavailable: true,
      availabilityError: String(model.error || "unavailable").slice(0, 200),
    };
    scoreMap.set(model.logicalName, scores);
    console.log(`  [workload] ${model.logicalName}: unavailable -> zero-score`);
  }

  for (const model of toProbe) {
    const scores = {};
    // json score derived from availability check result (no extra probe)
    scores.json = model.jsonOk === false ? 0 : model.jsonOk === true ? 100 : null;

    for (const key of Object.keys(WORKLOAD_TASKS)) {
      const result = await runWorkloadProbe(model, key);
      scores[key] = result.score;
      if (result.error) console.log(`  [workload/${key}] ${model.logicalName}: err=${result.error}`);
    }
    scores.lastProbedAt = now;
    scoreMap.set(model.logicalName, scores);
    console.log(`  [workload] ${model.logicalName}: json=${scores.json ?? "—"} coding=${scores.coding} writing=${scores.writing} reasoning=${scores.reasoning}`);
  }

  // Persist into quality file
  try {
    const qPath = QUALITY_FILE;
    const qdata = readJsonFile(qPath, { models: {} });
    for (const [name, scores] of scoreMap) {
      qdata.models[name] = qdata.models[name] || { status: "healthy", incidents: [] };
      qdata.models[name].workloadScores = scores;
    }
    writeJsonFile(qPath, qdata);
  } catch (e) {
    console.warn("Failed to persist workload scores:", e.message);
  }

  return scoreMap;
}

// ── Benchmark anchors ───────────────────────────────────────────────────────

function loadBenchmarks() {
  try {
    const data = readJsonFile(BENCHMARKS_FILE, null);
    if (!data) return null;
    const ageMs = Date.now() - (data.updatedAt ? new Date(data.updatedAt).getTime() : 0);
    if (ageMs > 7 * 24 * 3600 * 1000) return null; // stale (>7d)
    return data;
  } catch {
    return null;
  }
}

function resolveBenchmarkAnchor(model, benchmarks) {
  if (!benchmarks) return null;
  const anchors = benchmarks.anchors ?? {};
  const patterns = benchmarks.patterns ?? [];

  // Exact match on logical name or model id
  for (const key of [model.logicalName, model.modelId, model.resolvedModel]) {
    if (key && anchors[key] != null) return anchors[key];
  }
  // Pattern match (regex) against logical name
  for (const { match, score } of patterns) {
    try {
      if (new RegExp(match, "i").test(model.logicalName || "")) return score;
    } catch {}
  }
  return null;
}

// ── Composite rating100 ─────────────────────────────────────────────────────

function computeRating100(model, qualityEntry, benchmarkAnchor) {
  const components = {};

  // probe_pass_rate: mean of available workload scores (0-100 each)
  const ws = qualityEntry?.workloadScores;
  if (ws) {
    const vals = ["json", "coding", "writing", "reasoning"]
      .map(k => ws[k])
      .filter(v => v != null && typeof v === "number");
    if (vals.length > 0) {
      components.probe = { score: vals.reduce((a, b) => a + b, 0) / vals.length, weight: 0.35 };
    }
  }

  // latency: 0ms→100, 60000ms→0, unavailable→0
  if (model.available && model.latency != null) {
    const latScore = Math.max(0, Math.min(100, 100 * (1 - model.latency / 60000)));
    components.latency = { score: latScore, weight: 0.20 };
  }

  // availability
  components.availability = { score: model.available ? 100 : 0, weight: 0.20 };

  // benchmark anchor (optional)
  if (benchmarkAnchor != null) {
    components.benchmark = { score: benchmarkAnchor, weight: 0.15 };
  }

  // history: stage success rate from quality stageStats
  const stageStats = qualityEntry?.stageStats;
  if (stageStats) {
    let totalSuccess = 0, totalAttempts = 0;
    for (const s of Object.values(stageStats)) {
      totalSuccess += (s.successes || 0);
      totalAttempts += (s.successes || 0) + (s.garbageEvents || 0);
    }
    if (totalAttempts > 0) {
      components.history = { score: (totalSuccess / totalAttempts) * 100, weight: 0.10 };
    }
  }

  if (Object.keys(components).length === 0) {
    return { score: null, confidence: 0, sources: [], missing: ["probe", "latency", "benchmark", "history"], components: {} };
  }

  // Re-normalize weights so they sum to 1.0
  const totalWeight = Object.values(components).reduce((a, c) => a + c.weight, 0);
  let weightedSum = 0;
  const normalizedComponents = {};
  for (const [key, { score, weight }] of Object.entries(components)) {
    const w = weight / totalWeight;
    const contribution = score * w;
    weightedSum += contribution;
    normalizedComponents[key] = { score: Math.round(score * 10) / 10, weight: Math.round(w * 100) / 100, contribution: Math.round(contribution * 10) / 10 };
  }

  const allSources = ["probe", "latency", "availability", "benchmark", "history"];
  const sources = allSources.filter(k => k in components);
  const missing = allSources.filter(k => !(k in components) && k !== "availability");

  // Confidence: fraction of max possible sources (5)
  const confidence = Math.round((sources.length / allSources.length) * 100);

  return {
    score: Math.round(weightedSum),
    confidence,
    sources,
    missing,
    components: normalizedComponents,
  };
}

function parseArgs(argv) {
  const modeArg = argv.find(arg => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : "full";
  if (!["full", "quick"].includes(mode)) {
    throw new Error(`Unsupported --mode: ${mode}`);
  }
  return { mode };
}

function loadEnvFile(p) {
  try {
    const env = {};
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync("/var/lib/mimule", { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const env = { ...loadEnvFile(LITELLM_ENV), ...loadEnvFile(AUTOPIPE_ENV) };
const LITELLM_KEY    = env.LITELLM_MASTER_KEY;
const OPENROUTER_KEY = env.OPENROUTER_API_KEY;
const GITHUB_TOKEN   = env.GITHUB_TOKEN;
const ZEN_KEY        = env.OPENCODE_ZEN_KEY;
const GROQ_KEY       = env.GROQ_API_KEY;
const CF_TOKEN       = env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID  = env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_BASE    = CF_ACCOUNT_ID
  ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1`
  : null;
const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT  = env.TELEGRAM_CHAT_ID;

if (!LITELLM_KEY) {
  console.error("LITELLM_MASTER_KEY not found");
  process.exit(1);
}

// User-approved billing assumptions for automatic free discovery:
// - OpenRouter: explicit pricing.prompt/completion === 0
// - GitHub Models: treat chat-completion catalog as included-free/free-eligible
//   only while paid usage is not opted in; demote to PAID_LAST_RESORT_MODELS if
//   the account is configured to bill past the included free quota.
// - Groq: treat catalog models as non-billed / free-eligible
// - Zen / OpenCode: do not auto-promote new models unless a free signal exists
const DISCOVERY_ASSUMPTIONS = {
  githubAsFree: true,
  groqAsFree: true,
  zenRequiresExplicitFreeSignal: false,
  cloudflareAsFree: true, // included with account; free tier has daily neuron quota
};

// Canonical pricing tiers. Returns one of:
//   "free-local"        — runs on owned hardware (RTX 3090 via Vast.ai)
//   "free-rate-limited" — third-party with a free quota (OpenRouter :free,
//                         GitHub Models included quota, Groq, Cloudflare,
//                         Cerebras non-paid key, NVIDIA NIM free quota,
//                         documented Zen free model IDs)
//   "subscription"      — included with a paid subscription we already pay for
//                         (OpenCode Pro: opencode-go/*, alibaba/*, Zen GPT-5 /
//                         Claude-Sonnet / minimax-m2-7 fallback IDs)
//   "api-paid"          — pay-as-you-go, charged per request
//                         (cerebras-qwen3-235b-paid via CEREBRAS_API_KEY_PAID,
//                         any future OpenRouter non-:free entry)
//
// Inputs: { provider, logicalName, modelId, apiKeyEnv } from MODEL_REGISTRY
// or buildDiscoveredCandidate. Never throws — returns "subscription" as the
// most conservative tier for unknown providers so the ranker treats them as
// post-free / pre-paid.
function pricingTierFor(model) {
  const provider = String(model?.provider || "").toLowerCase();
  const logicalName = String(model?.logicalName || "");
  const modelId = String(model?.modelId || "");
  const apiKeyEnv = String(model?.apiKeyEnv || "");

  if (provider === "local") return "free-local";

  // OpenCode subscription pool (CLI-routed, included with OpenCode Pro)
  if (provider === "opencode" || provider === "alibaba") return "subscription";
  if (logicalName.startsWith("opencode-go/") || logicalName.startsWith("alibaba/")) return "subscription";

  // Cerebras: distinguish key path. The "-paid" logical name and
  // CEREBRAS_API_KEY_PAID env signal pay-as-you-go.
  if (provider === "cerebras") {
    if (logicalName.endsWith("-paid") || apiKeyEnv === "CEREBRAS_API_KEY_PAID") return "api-paid";
    return "free-rate-limited";
  }

  // Zen models: documented free IDs are free-rate-limited; otherwise treated
  // as subscription (delivered via the OpenCode Pro Zen quota).
  if (provider === "zen") {
    if (modelId.endsWith("-free") || modelId.includes(":free") || logicalName.includes("-free")) return "free-rate-limited";
    return "subscription";
  }

  // OpenRouter: explicit :free suffix → free-rate-limited, else api-paid.
  // (Discovery currently only auto-enrolls :free IDs, so non-free entries are
  // ones we deliberately opted in — treat as api-paid.)
  if (provider === "openrouter") {
    if (modelId.endsWith(":free") || logicalName.endsWith("-free") || logicalName.includes("-free-")) return "free-rate-limited";
    return "api-paid";
  }

  // Groq, GitHub Models, Cloudflare, NVIDIA NIM — all have free quotas.
  if (provider === "groq" || provider === "github" || provider === "cloudflare" || provider === "nvidia") {
    return "free-rate-limited";
  }

  // Unknown provider — return conservative middle tier.
  return "subscription";
}

const ZEN_DOCUMENTED_FREE_MODEL_IDS = [
  "big-pickle",
  "minimax-m2.5-free",
  "nemotron-3-super-free",
  "mimo-v2-pro-free",
  "mimo-v2-omni-free",
];

const ZEN_GO_FALLBACK_MODEL_IDS = [
  "minimax-m2.7",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "claude-sonnet-4-6",
];

const MODEL_REGISTRY = [
  { logicalName: "editorial-heavy",  provider: "local", testVia: "litellm", capability: "heavy",  params: 26 },
  { logicalName: "editorial-fast",   provider: "local", testVia: "litellm", capability: "heavy",  params: 26 },
  { logicalName: "coding-heavy",     provider: "local", testVia: "litellm", capability: "heavy",  params: 26 },
  { logicalName: "coding-fast",      provider: "local", testVia: "litellm", capability: "medium", params: 32 },
  { logicalName: "mimule-chat",      provider: "local", testVia: "litellm", capability: "light",  params: 8  },

  { logicalName: "openrouter-nemotron-120b-free",             provider: "openrouter", testVia: "litellm", modelId: "nvidia/nemotron-3-super-120b-a12b:free",        capability: "heavy",  params: 120 },
  { logicalName: "openrouter-qwen3-80b-free",                 provider: "openrouter", testVia: "litellm", modelId: "qwen/qwen3-next-80b-a3b-instruct:free",         capability: "heavy",  params: 80  },
  { logicalName: "openrouter-gemma4-31b-free",                provider: "openrouter", testVia: "litellm", modelId: "google/gemma-4-31b-it:free",                    capability: "heavy",  params: 31  },
  { logicalName: "openrouter-minimax-free",                   provider: "openrouter", testVia: "litellm", modelId: "minimax/minimax-m2.5:free",                     capability: "heavy",  params: 70  },
  { logicalName: "openrouter-gemma4-26b-free",                provider: "openrouter", testVia: "litellm", modelId: "google/gemma-4-26b-a4b-it:free",                capability: "medium", params: 26  },
  { logicalName: "openrouter-arcee-trinity-free",             provider: "openrouter", testVia: "litellm", modelId: "arcee-ai/trinity-large-preview:free",           capability: "medium", params: 30  },
  { logicalName: "openrouter-nvidia-nemotron-3-nano-30b-a3b", provider: "openrouter", testVia: "litellm", modelId: "nvidia/nemotron-3-nano-30b-a3b:free",           capability: "medium", params: 30  },
  { logicalName: "openrouter-nvidia-nemotron-nano-12b-v2-vl", provider: "openrouter", testVia: "litellm", modelId: "nvidia/nemotron-nano-12b-v2-vl:free",           capability: "light",  params: 12  },
  { logicalName: "openrouter-nvidia-nemotron-nano-9b-v2",     provider: "openrouter", testVia: "litellm", modelId: "nvidia/nemotron-nano-9b-v2:free",               capability: "light",  params: 9   },
  { logicalName: "openrouter-liquid-lfm-free",                provider: "openrouter", testVia: "litellm", modelId: "liquid/lfm-2.5-1.2b-thinking:free",            capability: "light",  params: 1   },
  { logicalName: "openrouter-liquid-lfm-2-5-1-2b-instruct",   provider: "openrouter", testVia: "litellm", modelId: "liquid/lfm-2.5-1.2b-instruct:free",            capability: "light",  params: 1   },

  { logicalName: "github-gpt41",      provider: "github", testVia: "litellm", modelId: "gpt-4.1",                       capability: "heavy",  params: 200 },
  { logicalName: "github-llama405b",  provider: "github", testVia: "direct",  modelId: "Meta-Llama-3.1-405B-Instruct", capability: "heavy",  params: 405, apiBase: "https://models.inference.ai.azure.com", apiKeyEnv: "GITHUB_TOKEN", litellmModel: "openai/Meta-Llama-3.1-405B-Instruct", litellmApiBase: "https://models.inference.ai.azure.com", litellmApiKeyEnv: "GITHUB_TOKEN" },
  { logicalName: "github-gpt4o",      provider: "github", testVia: "direct",  modelId: "gpt-4o",                       capability: "heavy",  params: 200, apiBase: "https://models.inference.ai.azure.com", apiKeyEnv: "GITHUB_TOKEN", litellmModel: "openai/gpt-4o", litellmApiBase: "https://models.inference.ai.azure.com", litellmApiKeyEnv: "GITHUB_TOKEN" },
  { logicalName: "github-gpt4o-mini", provider: "github", testVia: "direct",  modelId: "gpt-4o-mini",                  capability: "medium", params: 20,  apiBase: "https://models.inference.ai.azure.com", apiKeyEnv: "GITHUB_TOKEN", litellmModel: "openai/gpt-4o-mini", litellmApiBase: "https://models.inference.ai.azure.com", litellmApiKeyEnv: "GITHUB_TOKEN" },
  { logicalName: "github-llama8b",    provider: "github", testVia: "direct",  modelId: "Meta-Llama-3.1-8B-Instruct",   capability: "light",  params: 8,   apiBase: "https://models.inference.ai.azure.com", apiKeyEnv: "GITHUB_TOKEN", litellmModel: "openai/Meta-Llama-3.1-8B-Instruct", litellmApiBase: "https://models.inference.ai.azure.com", litellmApiKeyEnv: "GITHUB_TOKEN" },

  { logicalName: "zen-big-pickle",     provider: "zen", testVia: "direct", modelId: "big-pickle",       capability: "heavy", params: 100, apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/big-pickle", litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  { logicalName: "zen-minimax",        provider: "zen", testVia: "direct", modelId: "minimax-m2.5",     capability: "heavy", params: 70,  apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/minimax-m2.5", litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  // OpenCode Go subscription fallback pool. These are ranked after free/included
  // providers and before explicit pay-as-you-go last-resort models.
  { logicalName: "zen-minimax-m2-7",        provider: "zen", testVia: "direct", modelId: "minimax-m2.7",        capability: "heavy",  params: 70,  apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/minimax-m2.7",        litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  { logicalName: "zen-gpt-5-4",             provider: "zen", testVia: "direct", modelId: "gpt-5.4",             capability: "heavy",  params: 200, apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/gpt-5.4",             litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  { logicalName: "zen-gpt-5-4-mini",        provider: "zen", testVia: "direct", modelId: "gpt-5.4-mini",        capability: "medium", params: 20,  apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/gpt-5.4-mini",        litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  { logicalName: "zen-gpt-5-3-codex",       provider: "zen", testVia: "direct", modelId: "gpt-5.3-codex",       capability: "heavy",  params: 200, apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/gpt-5.3-codex",       litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },
  { logicalName: "zen-claude-sonnet-4-6",   provider: "zen", testVia: "direct", modelId: "claude-sonnet-4-6",   capability: "heavy",  params: 200, apiBase: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_ZEN_KEY", litellmModel: "openai/claude-sonnet-4-6",   litellmApiBase: "https://opencode.ai/zen/v1", litellmApiKeyEnv: "OPENCODE_ZEN_KEY" },

  // FREE tier (30 RPM / 1M tok/day) — normal pipeline rotation
  { logicalName: "cerebras-qwen3-235b-instruct", provider: "cerebras", testVia: "direct", modelId: "qwen-3-235b-a22b-instruct-2507", capability: "heavy", params: 235, apiBase: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY",      litellmModel: "cerebras/qwen-3-235b-a22b-instruct-2507", litellmApiKeyEnv: "CEREBRAS_API_KEY"      },
  { logicalName: "cerebras-llama31-8b",          provider: "cerebras", testVia: "direct", modelId: "llama3.1-8b",                   capability: "light", params: 8,   apiBase: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY",      litellmModel: "cerebras/llama3.1-8b",                    litellmApiKeyEnv: "CEREBRAS_API_KEY"      },
  // PAID — last resort in fallback chains + OpenCode direct access; never picked by chooseCloudModel
  { logicalName: "cerebras-qwen3-235b-paid",     provider: "cerebras", testVia: "direct", modelId: "qwen-3-235b-a22b-instruct-2507", capability: "heavy", params: 235, apiBase: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY_PAID", litellmModel: "cerebras/qwen-3-235b-a22b-instruct-2507", litellmApiKeyEnv: "CEREBRAS_API_KEY_PAID" },

  { logicalName: "nvidia-llama33-70b", provider: "nvidia", testVia: "direct", modelId: "meta/llama-3.3-70b-instruct",        capability: "heavy", params: 70, apiBase: "https://integrate.api.nvidia.com/v1", apiKeyEnv: "NVIDIA_NIM_API_KEY", litellmModel: "openai/meta/llama-3.3-70b-instruct",        litellmApiBase: "https://integrate.api.nvidia.com/v1", litellmApiKeyEnv: "NVIDIA_NIM_API_KEY" },
  { logicalName: "nvidia-qwen3-80b",   provider: "nvidia", testVia: "direct", modelId: "qwen/qwen3-next-80b-a3b-instruct", capability: "heavy", params: 80, apiBase: "https://integrate.api.nvidia.com/v1", apiKeyEnv: "NVIDIA_NIM_API_KEY", litellmModel: "openai/qwen/qwen3-next-80b-a3b-instruct", litellmApiBase: "https://integrate.api.nvidia.com/v1", litellmApiKeyEnv: "NVIDIA_NIM_API_KEY" },

  { logicalName: "groq-llama70b",      provider: "groq", testVia: "direct", modelId: "llama-3.3-70b-versatile",                    capability: "heavy",  params: 70, apiBase: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY", litellmModel: "groq/llama-3.3-70b-versatile", litellmApiKeyEnv: "GROQ_API_KEY" },
  { logicalName: "groq-qwen3-32b",     provider: "groq", testVia: "direct", modelId: "qwen/qwen3-32b",                             capability: "heavy",  params: 32, apiBase: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY", litellmModel: "groq/qwen/qwen3-32b", litellmApiKeyEnv: "GROQ_API_KEY" },
  { logicalName: "groq-llama4-scout",  provider: "groq", testVia: "direct", modelId: "meta-llama/llama-4-scout-17b-16e-instruct", capability: "medium", params: 17, apiBase: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY", litellmModel: "groq/meta-llama/llama-4-scout-17b-16e-instruct", litellmApiKeyEnv: "GROQ_API_KEY" },

  // Cloudflare Workers AI — free tier (neurons/day); content returned as parsed JSON object
  { logicalName: "cf-llama33-70b",  provider: "cloudflare", testVia: "direct", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", capability: "heavy",  params: 70, apiBase: CF_API_BASE, apiKeyEnv: "CLOUDFLARE_API_TOKEN", litellmModel: "openai/@cf/meta/llama-3.3-70b-instruct-fp8-fast", litellmApiBase: CF_API_BASE, litellmApiKeyEnv: "CLOUDFLARE_API_TOKEN" },
  { logicalName: "cf-llama4-scout", provider: "cloudflare", testVia: "direct", modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",  capability: "medium", params: 17, apiBase: CF_API_BASE, apiKeyEnv: "CLOUDFLARE_API_TOKEN", litellmModel: "openai/@cf/meta/llama-4-scout-17b-16e-instruct",  litellmApiBase: CF_API_BASE, litellmApiKeyEnv: "CLOUDFLARE_API_TOKEN" },
  { logicalName: "cf-llama31-8b",   provider: "cloudflare", testVia: "direct", modelId: "@cf/meta/llama-3.1-8b-instruct",           capability: "light",  params: 8,  apiBase: CF_API_BASE, apiKeyEnv: "CLOUDFLARE_API_TOKEN", litellmModel: "openai/@cf/meta/llama-3.1-8b-instruct",           litellmApiBase: CF_API_BASE, litellmApiKeyEnv: "CLOUDFLARE_API_TOKEN" },
];

const DISCOVERY_EXCLUDE = new Set([
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6-fast",
  "gpt-4.1",
]);

const EDITORIAL_INCOMPATIBLE_PATTERN =
  /safeguard|prompt-guard|content-filter|content-moderation|guardrails|moderation|\bembed\b|embedding|rerank|whisper|\btts\b|vision-only|image-gen|dall-?e|stable-diffusion/i;

function isEditorialIncompatible(modelId = "", logicalName = "") {
  return EDITORIAL_INCOMPATIBLE_PATTERN.test(String(modelId)) ||
    EDITORIAL_INCOMPATIBLE_PATTERN.test(String(logicalName));
}

const CLOUD_EXCLUDE = new Set([
  "editorial-heavy", "editorial-fast", "coding-heavy", "coding-fast", "mimule-chat",
  "editorial-cloud-heavy", "editorial-cloud-fast",
  "routing-cheap", "mimule-chat-gemma", "mimule-chat-qwen", "openrouter/mimule-chat",
  "gemini-flash", "gemini-pro", "gpt5-mini", "gemini-flash-direct",
]);

function slugify(value, max = 48) {
  return String(value || "")
    .replace(/:free$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, max);
}

function guessCapability(modelId) {
  const id = String(modelId || "").toLowerCase();
  const paramMatch = id.match(/(\d+)b/);
  const params = paramMatch ? parseInt(paramMatch[1], 10) : 0;
  // Explicit heavy indicators (regardless of param count)
  const heavyIndicators = /max|plus|pro|large|opus|codex|heavy|120b|235b|405b|70b/;
  if (params >= 30 || heavyIndicators.test(id)) {
    return { capability: "heavy", params: params || 70 };
  }
  if (params >= 10) {
    return { capability: "medium", params };
  }
  return { capability: "light", params: params || 1 };
}

function findRegistryMatch(provider, modelId) {
  return MODEL_REGISTRY.find(model => model.provider === provider && model.modelId === modelId) || null;
}

function buildDiscoveredCandidate(provider, modelId) {
  const existing = findRegistryMatch(provider, modelId);
  if (existing) return existing;

  const guessed = guessCapability(modelId);

  if (provider === "github") {
    return {
      logicalName: `github-${slugify(modelId)}`,
      provider,
      testVia: "direct",
      modelId,
      ...guessed,
      apiBase: "https://models.inference.ai.azure.com",
      apiKeyEnv: "GITHUB_TOKEN",
      litellmModel: `openai/${modelId}`,
      litellmApiBase: "https://models.inference.ai.azure.com",
      litellmApiKeyEnv: "GITHUB_TOKEN",
    };
  }

  if (provider === "groq") {
    return {
      logicalName: `groq-${slugify(modelId)}`,
      provider,
      testVia: "direct",
      modelId,
      ...guessed,
      apiBase: "https://api.groq.com/openai/v1",
      apiKeyEnv: "GROQ_API_KEY",
      litellmModel: `groq/${modelId}`,
      litellmApiKeyEnv: "GROQ_API_KEY",
    };
  }

  if (provider === "zen") {
    return {
      logicalName: `zen-${slugify(modelId)}`,
      provider,
      testVia: "direct",
      modelId,
      ...guessed,
      apiBase: "https://opencode.ai/zen/v1",
      apiKeyEnv: "OPENCODE_ZEN_KEY",
      litellmModel: `openai/${modelId}`,
      litellmApiBase: "https://opencode.ai/zen/v1",
      litellmApiKeyEnv: "OPENCODE_ZEN_KEY",
    };
  }

  if (provider === "openrouter") {
    return {
      logicalName: `openrouter-${slugify(modelId, 40)}`,
      provider,
      testVia: "direct",
      modelId,
      ...guessed,
      apiBase: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
      litellmModel: `openrouter/${modelId}`,
      litellmApiBase: "https://openrouter.ai/api/v1",
      litellmApiKeyEnv: "OPENROUTER_API_KEY",
    };
  }

  if (provider === "cloudflare") {
    return {
      logicalName: `cf-${slugify(modelId)}`,
      provider,
      testVia: "direct",
      modelId,
      ...guessed,
      apiBase: CF_API_BASE,
      apiKeyEnv: "CLOUDFLARE_API_TOKEN",
      litellmModel: `openai/${modelId}`,
      litellmApiBase: CF_API_BASE,
      litellmApiKeyEnv: "CLOUDFLARE_API_TOKEN",
    };
  }

  return {
    logicalName: `${provider}-${slugify(modelId)}`,
    provider,
    testVia: "direct",
    modelId,
    ...guessed,
  };
}

function dedupeModels(models) {
  const out = [];
  const seen = new Set();
  for (const model of models) {
    const key = `${model.provider}:${model.logicalName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT,
        text,
        parse_mode: "HTML",
        disable_notification: true,
      }),
    });
  } catch {
    // silent
  }
}

async function testLitellm(modelName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:4000/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LITELLM_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: PING_PROMPT }],
        temperature: 0,
        max_tokens: PING_MAX_TOKENS,
        store: false,
        // Disable router fallbacks: a dead group must report its own true
        // status (404/429), not a fallback's 200 (2026-07-02 cerebras bug —
        // dead models stayed "available: true" and kept being re-selected).
        fallbacks: [],
      }),
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { available: false, latency, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` };
    }
    const body = await res.text().catch(() => "");
    let resolvedModel = null;
    try {
      resolvedModel = JSON.parse(body)?.model || null;
    } catch {
      // ignore
    }
    const content = extractAssistantContent(body);
    const jsonOk = isParseableJsonResponse(content);
    return { available: true, latency, resolvedModel, jsonOk, sampleContent: content.slice(0, 80) };
  } catch (e) {
    clearTimeout(timer);
    return {
      available: false,
      latency: Date.now() - start,
      error: e.name === "AbortError" ? "timeout" : e.message,
    };
  }
}

// Reactive Zen credit detection: the first paid-zen probe that comes back with a
// CreditsError flips this flag, and the remaining paid-zen models are skipped this
// run instead of issuing ~44 doomed probes. Free zen models are always probed.
let _zenNoCredits = false;
function isZenFreeModel(model) {
  const id = model.modelId || "";
  return ZEN_DOCUMENTED_FREE_MODEL_IDS.includes(id)
      || ZEN_GO_FALLBACK_MODEL_IDS.includes(id)
      || /(?:^|[-_])free$/i.test(id)
      || /free/i.test(model.logicalName || "");
}

// Only models that look permanently gone (removed/renamed by the provider) should
// accrue toward 30-day retirement. Transient states — rate limits, timeouts, 5xx,
// out-of-credits — must NOT start the clock, or healthy throttled models get retired.
function isGoneError(error) {
  if (!error) return false;
  return /HTTP 404|not found|not supported|no such model|does not exist|unknown model|invalid model/i.test(error);
}

async function testDirect(model, retryOnRateLimit = true) {
  const key = env[model.apiKeyEnv];
  if (!key) return { available: false, latency: 0, error: `no ${model.apiKeyEnv}` };

  if (model.provider === "zen" && _zenNoCredits && !isZenFreeModel(model)) {
    return { available: false, latency: 0, error: "zen: no credits (balance empty)" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(`${model.apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model.modelId,
        messages: [{ role: "user", content: PING_PROMPT }],
        temperature: 0,
        max_tokens: PING_MAX_TOKENS,
        // no "store": OpenAI-only param — cerebras and other strict providers
        // reject unknown properties with HTTP 400 (false "unavailable").
      }),
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      // 429 = rate-limited, not broken. Retry once after a short delay so the
      // health check doesn't permanently exclude a working model just because
      // two tests from the same provider ran back-to-back.
      if (res.status === 429 && retryOnRateLimit) {
        await new Promise(r => setTimeout(r, 3000));
        return testDirect(model, false);
      }
      if (model.provider === "zen" && /CreditsError|Insufficient balance/i.test(txt)) {
        _zenNoCredits = true;
      }
      return { available: false, latency, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` };
    }
    const body = await res.text().catch(() => "");
    const content = extractAssistantContent(body);
    const jsonOk = isParseableJsonResponse(content);
    return { available: true, latency, resolvedModel: model.modelId, jsonOk, sampleContent: content.slice(0, 80) };
  } catch (e) {
    clearTimeout(timer);
    return {
      available: false,
      latency: Date.now() - start,
      error: e.name === "AbortError" ? "timeout" : e.message,
    };
  }
}

function stripAnsi(str) {
  return String(str || "").replace(/\x1b\[[0-9;]*m/g, "");
}

async function testOpencodeCli(model) {
  const key = env[model.apiKeyEnv];
  if (!key) return { available: false, latency: 0, error: `no ${model.apiKeyEnv}` };

  const start = Date.now();
  try {
    const modelFlag = model.modelId ? ` --model ${model.modelId}` : "";
    const stdout = execSync(`/root/.opencode/bin/opencode run --dangerously-skip-permissions${modelFlag} -`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_ZEN_KEY: key },
      input: PING_PROMPT,
      timeout: 25000,
    });
    const latency = Date.now() - start;
    const lines = stripAnsi(stdout).split("\n").map(l => l.trim()).filter(Boolean);
    const content = lines.filter(l => !l.startsWith("> ")).pop() || "";
    const jsonOk = isParseableJsonResponse(content);
    return { available: true, latency, jsonOk, sampleContent: content.slice(0, 80) };
  } catch (e) {
    const latency = Date.now() - start;
    const stderr = stripAnsi(e.stderr?.toString() || "");
    const msg = stderr || e.message || "";
    if (msg.includes("Insufficient balance")) {
      return { available: false, latency, error: "insufficient balance" };
    }
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT") || e.code === "ETIMEDOUT") {
      return { available: false, latency, error: "timeout" };
    }
    return { available: false, latency, error: msg.slice(0, 120) };
  }
}

async function testCandidate(model) {
  if (model.testVia === "litellm") {
    return testLitellm(model.logicalName);
  }
  if (model.testVia === "opencode") {
    return testOpencodeCli(model);
  }
  return testDirect(model);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchOpenRouterFreeModels() {
  if (!OPENROUTER_KEY) return [];
  try {
    const data = await fetchJson("https://openrouter.ai/api/v1/models", {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
    });
    return (data.data || [])
      .filter(model =>
        String(model.pricing?.prompt) === "0" &&
        String(model.pricing?.completion) === "0" &&
        !DISCOVERY_EXCLUDE.has(model.id) &&
        !isEditorialIncompatible(model.id)
      )
      .map(model => buildDiscoveredCandidate("openrouter", model.id));
  } catch (e) {
    console.log(`  [discover:openrouter] skipped: ${e.message}`);
    return [];
  }
}

function isGithubChatModel(model) {
  return String(model.task || "").toLowerCase() === "chat-completion";
}

async function fetchGithubCatalogModels() {
  if (!GITHUB_TOKEN || !DISCOVERY_ASSUMPTIONS.githubAsFree) return [];
  try {
    const data = await fetchJson("https://models.inference.ai.azure.com/models", {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    });
    return (data || [])
      .filter(isGithubChatModel)
      .map(model => buildDiscoveredCandidate("github", model.name))
      .filter(model =>
        !DISCOVERY_EXCLUDE.has(model.modelId) &&
        !isEditorialIncompatible(model.modelId, model.logicalName)
      );
  } catch (e) {
    console.log(`  [discover:github] skipped: ${e.message}`);
    return [];
  }
}

async function fetchGroqCatalogModels() {
  if (!GROQ_KEY || !DISCOVERY_ASSUMPTIONS.groqAsFree) return [];
  try {
    const data = await fetchJson("https://api.groq.com/openai/v1/models", {
      Authorization: `Bearer ${GROQ_KEY}`,
    });
    return (data.data || [])
      .map(model => buildDiscoveredCandidate("groq", model.id))
      .filter(model =>
        !DISCOVERY_EXCLUDE.has(model.modelId) &&
        !isEditorialIncompatible(model.modelId, model.logicalName)
      );
  } catch (e) {
    console.log(`  [discover:groq] skipped: ${e.message}`);
    return [];
  }
}

async function fetchZenCatalogModels() {
  if (!ZEN_KEY) return [];
  const documentedFree = [...ZEN_DOCUMENTED_FREE_MODEL_IDS, ...ZEN_GO_FALLBACK_MODEL_IDS]
    .map(modelId => buildDiscoveredCandidate("zen", modelId));

  // Primary source: the live OpenCode Zen catalog (/v1/models) — the authoritative,
  // current set of model IDs (paid + free). Using it means discovery never carries
  // stale/renamed IDs. Paid models are skipped by the credit short-circuit when the
  // balance is empty; free models (and any model once credits exist) probe with correct IDs.
  try {
    const data = await fetchJson("https://opencode.ai/zen/v1/models", {
      Authorization: `Bearer ${ZEN_KEY}`,
    });
    const live = (data.data || data.models || [])
      .map(model => model.id)
      .filter(Boolean)
      .map(modelId => buildDiscoveredCandidate("zen", modelId))
      .filter(model =>
        !DISCOVERY_EXCLUDE.has(model.modelId) &&
        !isEditorialIncompatible(model.modelId, model.logicalName)
      );
    if (live.length > 0) {
      console.log(`  [discover:zen] ${live.length} models from live /v1/models`);
      return dedupeModels(live);
    }
    console.log("  [discover:zen] live /v1/models returned no usable models — falling back to CLI/documented");
  } catch (e) {
    console.log(`  [discover:zen] live /v1/models unavailable (${e.message}) — falling back to CLI/documented`);
  }

  // Fallback 1: opencode CLI catalog (may be stale; used only when the live API is down).
  try {
    const stdout = execSync("/root/.opencode/bin/opencode models opencode", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_ZEN_KEY: ZEN_KEY },
    });
    const cliModels = stdout
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => line.startsWith("opencode/"))
      .map(line => line.replace(/^opencode\//, ""))
      .filter(modelId =>
        !DISCOVERY_EXCLUDE.has(modelId) &&
        !isEditorialIncompatible(modelId)
      )
      .map(modelId => buildDiscoveredCandidate("zen", modelId));
    if (cliModels.length > 0) return dedupeModels([...documentedFree, ...cliModels]);
  } catch (e) {
    console.log(`  [discover:zen] CLI fallback unavailable: ${e.message}`);
  }

  // Fallback 2: documented free IDs only.
  return documentedFree;
}

// Alibaba models are accessible through the opencode CLI but not through the Zen API.
// We health-check a curated subset via CLI and include them in the health file.
const ALIBABA_CANDIDATES = [
  "alibaba/qwen-plus",
  "alibaba/qwen-flash",
  "alibaba/qwen-turbo",
  "alibaba/qwen3.6-plus",
  "alibaba/qwen3-coder-plus",
  "alibaba/qwen3.6-27b",
  "alibaba/qwen-max",
  "alibaba/qwen3-235b-a22b",
  "alibaba/qwen3.5-plus",
  "alibaba/qwen3-next-80b-a3b-instruct",
];

async function fetchAlibabaModels() {
  if (!ZEN_KEY) return [];
  try {
    const stdout = execSync("/root/.opencode/bin/opencode models", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_ZEN_KEY: ZEN_KEY },
      timeout: 10000,
    });
    const available = new Set(
      stdout.split("\n").map(l => l.trim()).filter(l => l.startsWith("alibaba/"))
    );
    return ALIBABA_CANDIDATES
      .filter(id => available.has(id))
      .map(id => ({
        logicalName: id,
        provider: "alibaba",
        testVia: "opencode",
        modelId: id,
        ...guessCapability(id),
        apiKeyEnv: "OPENCODE_ZEN_KEY",
      }));
  } catch (e) {
    console.log(`  [discover:alibaba] CLI unavailable: ${e.message}`);
    return [];
  }
}

// opencode-go models — Go subscription tier, CLI-only (no REST endpoint).
// Not routable via LiteLLM; used by autopipeline when calling opencode CLI directly.
const OPENCODE_GO_CANDIDATES = [
  "opencode-go/deepseek-v4-pro",
  "opencode-go/deepseek-v4-flash",
  "opencode-go/glm-5.1",
  "opencode-go/glm-5",
  "opencode-go/kimi-k2.6",
  "opencode-go/kimi-k2.5",
  "opencode-go/mimo-v2.5",
  "opencode-go/mimo-v2.5-pro",
  "opencode-go/minimax-m2.7",
  "opencode-go/minimax-m2.5",
  "opencode-go/qwen3.6-plus",
  "opencode-go/qwen3.5-plus",
];

async function fetchOpencodeGoModels() {
  if (!ZEN_KEY) return [];
  try {
    const stdout = execSync("/root/.opencode/bin/opencode models", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCODE_ZEN_KEY: ZEN_KEY },
      timeout: 10000,
    });
    const available = new Set(
      stdout.split("\n").map(l => l.trim()).filter(l => l.startsWith("opencode-go/"))
    );
    return OPENCODE_GO_CANDIDATES
      .filter(id => available.has(id))
      .map(id => ({
        logicalName: id,
        provider: "opencode",
        testVia: "opencode",
        modelId: id,
        ...guessCapability(id),
        apiKeyEnv: "OPENCODE_ZEN_KEY",
      }));
  } catch (e) {
    console.log(`  [discover:opencode-go] CLI unavailable: ${e.message}`);
    return [];
  }
}

// Models that can only be tested via opencode CLI (not via LiteLLM direct API).
// These are discovered and health-checked, but excluded from automatic LiteLLM
// fallback chains because the autopipeline routes through LiteLLM.
const OPENCODE_CLI_ONLY_MODELS = new Set([
  ...ALIBABA_CANDIDATES,
  ...OPENCODE_GO_CANDIDATES,
]);

// Add CLI-only models to the cloud exclusion set after both are defined.
for (const m of OPENCODE_CLI_ONLY_MODELS) CLOUD_EXCLUDE.add(m);

// Cloudflare Workers AI text-generation models compatible with editorial pipeline.
// Skips vision-only, image-gen, reasoning-only, embedding, and classifier models.
// The known-good list acts as a static fallback if the API is unreachable.
const CF_KNOWN_GOOD = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.1-8b-instruct",
];
const CF_COMPATIBLE_INCOMPATIBLE = /lora$|lora-|\bguard\b|vision|image|embedding|sql|math|whisper|tts/i;

const CF_PREFERRED_PREFIXES = ["@cf/meta/", "@cf/mistral/", "@cf/qwen/", "@cf/google/", "@cf/deepseek/"];
const CF_MAX_DISCOVERED = 12;

async function fetchCloudflareModels() {
  if (!CF_TOKEN || !CF_ACCOUNT_ID) {
    console.log("  [discover:cloudflare] CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set — skipping");
    return CF_KNOWN_GOOD.map(id => buildDiscoveredCandidate("cloudflare", id));
  }
  try {
    const data = await fetchJson(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/models/search?task=Text+Generation&per_page=100`,
      { Authorization: `Bearer ${CF_TOKEN}` },
    );
    const models = Array.isArray(data.result) ? data.result : [];
    const candidates = models
      .map(m => (typeof m === "string" ? m : m?.name || ""))
      .filter(Boolean)
      .filter(id => !CF_COMPATIBLE_INCOMPATIBLE.test(id) && !isEditorialIncompatible(id))
      // Exclude reasoning-only models confirmed to return null content (thinking goes to reasoning_content)
      .filter(id => !id.includes("qwen3") && !id.includes("kimi") && !id.includes("deepseek-r1"))
      // Prefer well-known providers; skip deprecated third-party HF models
      .filter(id => CF_PREFERRED_PREFIXES.some(p => id.startsWith(p)) || CF_KNOWN_GOOD.includes(id))
      .slice(0, CF_MAX_DISCOVERED)
      .map(id => buildDiscoveredCandidate("cloudflare", id))
      .filter(m => m.apiBase); // skip if CF_API_BASE is null (no account ID)
    if (candidates.length > 0) {
      console.log(`  [discover:cloudflare] ${candidates.length} eligible text-gen models`);
      return dedupeModels(candidates);
    }
    throw new Error("empty model list");
  } catch (e) {
    console.log(`  [discover:cloudflare] API error (${e.message}) — using known-good fallback list`);
    return CF_KNOWN_GOOD
      .map(id => buildDiscoveredCandidate("cloudflare", id))
      .filter(m => m.apiBase);
  }
}

function isInLitellmConfig(logicalName, modelId) {
  const cfg = fs.readFileSync(LITELLM_CFG, "utf8");
  return cfg.includes(`model_name: ${logicalName}`);
}

function addToLitellmConfig(model) {
  if (!model.litellmModel) return false;
  if (isInLitellmConfig(model.logicalName, model.modelId)) return false;

  let entry = `\n  - model_name: ${model.logicalName}\n    litellm_params:\n      model: ${model.litellmModel}\n`;
  if (model.litellmApiBase) entry += `      api_base: ${model.litellmApiBase}\n`;
  entry += `      api_key: os.environ/${model.litellmApiKeyEnv}\n      timeout: 60\n`;

  const cfg = fs.readFileSync(LITELLM_CFG, "utf8");
  const insertBefore = "\n# Fallback chains:";
  if (!cfg.includes(insertBefore)) return false;
  fs.writeFileSync(LITELLM_CFG, cfg.replace(insertBefore, entry + insertBefore), "utf8");
  return true;
}

function rewriteFallbackChains(ranked) {
  const dedupe = arr => [...new Set(arr.filter(Boolean))];
  const withoutPaid = arr => arr.filter(model => !PAID_LAST_RESORT_MODELS.has(model));
  const paidOnly = arr => arr.filter(model => PAID_LAST_RESORT_MODELS.has(model));

  const freeHeavy = withoutPaid(ranked.heavy);
  const paidHeavy = paidOnly(ranked.heavy);
  const freeMedium = withoutPaid(ranked.medium);
  const paidMedium = paidOnly(ranked.medium);

  // Cloud chains (autopipeline cloud stages: research, write, publish-prep)
  // Paid models are after local GPU. The normal path is free cloud first, then
  // owned/rented local GPU, then paid cloud only as a final continuity fallback.
  const cloudHeavyChain = dedupe([
    ...freeHeavy,
    ...freeMedium,
    "github-gpt41",
    "editorial-heavy",
    ...paidHeavy,
    ...paidMedium,
  ]);

  const cloudFastChain = dedupe([
    ...freeMedium,
    ...freeHeavy.slice(0, 3),
    "github-gpt41",
    "editorial-fast",
    ...paidHeavy.slice(0, 1),
    ...paidMedium,
  ]);

  // GPU-stage fallbacks (verify, scout, rank, Paperclip agents).
  // Primary is the local GPU model; these fire when the tunnel is down or GPU is overloaded.
  // Paid cloud remains last resort after the free cloud safety net.
  const gpuHeavyFallback = dedupe([
    ...freeHeavy,
    ...freeMedium,
    "editorial-cloud-heavy",
    ...paidHeavy,
    ...paidMedium,
  ]);

  const gpuFastFallback = dedupe([
    ...freeMedium,
    ...freeHeavy.slice(0, 3),
    "editorial-cloud-fast",
    ...paidHeavy.slice(0, 1),
    ...paidMedium,
  ]);

  // routing-cheap: classification and triage — medium models are sufficient, light is too risky
  const cheapFallback = dedupe([
    ...freeMedium,
    ...ranked.light.slice(0, 2),
    ...paidMedium,
  ]);

  // mimule-chat: Telegram bot — prefer medium for coherence; format may differ from qwen3:8b
  const chatFallback = dedupe([
    ...freeMedium.slice(0, 2),
    ...freeHeavy.slice(0, 1),
    "github-gpt4o-mini",
  ]);

  // Map of pattern → replacement string for every chain in router_settings.fallbacks
  const chains = [
    [/- editorial-cloud-heavy:\s+\[[^\]]*\]/, `- editorial-cloud-heavy: [${cloudHeavyChain.join(", ")}]`],
    [/- editorial-cloud-fast:\s+\[[^\]]*\]/,  `- editorial-cloud-fast:  [${cloudFastChain.join(", ")}]`],
    [/- editorial-heavy:\s+\[[^\]]*\]/,       `- editorial-heavy: [${gpuHeavyFallback.join(", ")}]`],
    [/- editorial-fast:\s+\[[^\]]*\]/,        `- editorial-fast:  [${gpuFastFallback.join(", ")}]`],
    [/- routing-cheap:\s+\[[^\]]*\]/,         `- routing-cheap:   [${cheapFallback.join(", ")}]`],
    [/- mimule-chat:\s+\[[^\]]*\]/,           `- mimule-chat:     [${chatFallback.join(", ")}]`],
    [/- openrouter\/mimule-chat:\s+\[[^\]]*\]/, `- openrouter/mimule-chat: [${chatFallback.join(", ")}]`],
  ];

  let cfg = fs.readFileSync(LITELLM_CFG, "utf8");
  const prevCfg = cfg;

  for (const [pattern, replacement] of chains) {
    cfg = cfg.replace(pattern, replacement);
  }

  const changed = cfg !== prevCfg;
  if (changed) {
    fs.writeFileSync(LITELLM_CFG, cfg, "utf8");
  }
  return { changed, heavyChain: cloudHeavyChain, fastChain: cloudFastChain, gpuHeavyFallback, gpuFastFallback };
}

function loadPolicy() {
  return readJsonFile(POLICY_FILE, { models: {} });
}

function loadQuality() {
  return readJsonFile(QUALITY_FILE, { models: {} });
}

function getPolicyForResult(result, policy) {
  return (
    policy.models?.[result.logicalName] ||
    (result.modelId ? policy.models?.[result.modelId] : null) ||
    null
  );
}

function getQualityForResult(result, quality) {
  return (
    (result.modelId ? quality.models?.[result.modelId] : null) ||
    quality.models?.[result.logicalName] ||
    null
  );
}

function applyQualityAndPolicy(result, quality, policy) {
  const policyEntry = getPolicyForResult(result, policy) || {};
  const qualityEntry = getQualityForResult(result, quality) || {};
  const effectiveStatus = policyEntry.forceBlock
    ? "blocked"
    : policyEntry.forceAllow
      ? "healthy"
      : (qualityEntry.status || "healthy");

  let effectiveCapability = result.capability;
  let qualityBucket = 0;

  if (effectiveStatus === "blocked") {
    return { ...result, effectiveStatus, effectiveCapability: null, qualityBucket: 99 };
  }

  // JSON-quality test result: if a model that's expected to handle structured
  // editorial output can't return parseable JSON for a trivial prompt, demote it.
  // Heavy/medium drop out of cloud rotation entirely. Light is informational only —
  // light models (mimule-chat) don't need JSON quality.
  const jsonRequired = QUALITY_REQUIRED_CAPABILITIES.has(result.capability);
  const jsonProbed = result.jsonOk !== undefined; // direct probe ran (older runs may lack the field)
  if (jsonProbed && !result.jsonOk && jsonRequired && !policyEntry.forceAllow) {
    return {
      ...result,
      effectiveStatus: "json_failed",
      effectiveCapability: null,
      qualityBucket: 99,
      qualityEntry,
      policyEntry,
    };
  }

  if (effectiveStatus === "probation") {
    qualityBucket = 1;
  } else if (effectiveStatus === "degraded") {
    qualityBucket = 2;
    if (result.capability === "heavy") {
      effectiveCapability = "medium";
    } else {
      effectiveCapability = null;
    }
  }

  return {
    ...result,
    effectiveStatus,
    effectiveCapability,
    qualityBucket,
    qualityEntry,
    policyEntry,
  };
}

function rankCloudModels(results, quality, policy) {
  const eligible = results
    .filter(result => result.provider !== "local" && !CLOUD_EXCLUDE.has(result.logicalName))
    .map(result => applyQualityAndPolicy(result, quality, policy))
    .filter(result => result.available && result.effectiveCapability);

  const sortFn = (a, b) => {
    // Tier ordering: free-local (0) → free-rate-limited (1) → subscription (2) → api-paid (3).
    // Legacy explicit sets still win where they apply (paid-last-resort hard last).
    const tierBucket = result => {
      if (PAID_LAST_RESORT_MODELS.has(result.logicalName)) return 3;
      const tier = result.pricingTier || pricingTierFor(result);
      if (tier === "free-local") return 0;
      if (tier === "free-rate-limited") return 1;
      if (tier === "subscription") return 2;
      if (tier === "api-paid") return 3;
      if (SUBSCRIPTION_FALLBACK_MODELS.has(result.logicalName)) return 2;
      return 1;
    };
    const aBilling = tierBucket(a);
    const bBilling = tierBucket(b);
    if (aBilling !== bBilling) return aBilling - bBilling;
    if (a.qualityBucket !== b.qualityBucket) return a.qualityBucket - b.qualityBucket;
    return a.latency - b.latency;
  };

  const rankByCapability = cap => eligible
    .filter(result => result.effectiveCapability === cap)
    .sort(sortFn)
    .map(result => result.logicalName);

  return {
    heavy: rankByCapability("heavy"),
    medium: rankByCapability("medium"),
    light: rankByCapability("light"),
  };
}

function totalPrimaryCloud(ranked) {
  return ranked.heavy.length + ranked.medium.length;
}

function shouldForceFullFromQuick(previous, ranked, now) {
  if (!previous?.lastFullCheckAt) return true;
  if (now - previous.lastFullCheckAt > FULL_STALE_MS) return true;

  const prevPrimary = (previous.ranked?.heavy?.length || 0) + (previous.ranked?.medium?.length || 0);
  const currPrimary = totalPrimaryCloud(ranked);

  if (currPrimary === 0) return true;
  if (prevPrimary >= QUICK_COLLAPSE_MIN_PREV && currPrimary <= QUICK_COLLAPSE_MAX_CURR) return true;
  return false;
}

async function buildFullCandidateSet() {
  const discovered = await Promise.all([
    fetchOpenRouterFreeModels(),
    fetchGithubCatalogModels(),
    fetchGroqCatalogModels(),
    fetchZenCatalogModels(),
    fetchCloudflareModels(),
    fetchAlibabaModels(),
    fetchOpencodeGoModels(),
  ]);

  const all = dedupeModels([
    ...MODEL_REGISTRY,
    ...discovered.flat(),
  ]);

  return all;
}

function buildQuickCandidateSet(previous) {
  const priorModels = Array.isArray(previous?.models) ? previous.models : [];
  const priorMap = new Map(priorModels.map(m => [m.logicalName, m]));

  // Quick mode: include ALL registry models and ALL prior models so the
  // dashboard stays complete and nothing disappears. Only local models
  // are actually tested; everything else is copy-forwarded by testCandidateSet.
  const all = dedupeModels([...MODEL_REGISTRY, ...priorModels]);
  const enriched = all.map(model => {
    const prior = priorMap.get(model.logicalName);
    return prior ? { ...prior, ...model } : model;
  });

  return enriched;
}

function shouldTestModel(model, prev, quality) {
  // Always test local models (GPU tunnel health is critical)
  if (model.provider === "local") return true;

  // Test models we have never seen before
  if (!prev) return true;

  // Test models with non-healthy quality status (probation, degraded, blocked)
  const q = quality?.models?.[model.logicalName];
  if (q && q.status && q.status !== "healthy") return true;

  // Re-test healthy cloud models that have gone stale, so silently-dead providers
  // get caught and recovered models get re-promoted (capped per run by the caller).
  // Only lastTestedAt counts as a real probe — checkedAt is re-stamped on every
  // copy-forward, so using it here would reset the staleness clock forever
  // (2026-07-03: dead cerebras models stayed "available: true" for weeks).
  if (!prev.lastTestedAt) return "stale";
  if (Date.now() - prev.lastTestedAt > AVAILABILITY_RETEST_MS) return "stale";
  return false;
}

async function testCandidateSet(candidates, now, prevMap, quality) {
  const toTest = [];
  const toCopy = [];

  const staleCandidates = [];
  for (const model of candidates) {
    const prev = prevMap.get(model.logicalName);
    const decision = shouldTestModel(model, prev, quality);
    if (decision === true) {
      toTest.push(model);
    } else if (decision === "stale") {
      staleCandidates.push(model);
    } else {
      // Copy-forward path: prev result preserved, registry fields refreshed,
      // pricingTier recomputed every cycle so taxonomy changes propagate
      // without waiting for a re-probe. lastTestedAt must survive untouched —
      // it is the staleness clock and only a real probe may advance it.
      toCopy.push({ ...prev, ...model, lastTestedAt: prev.lastTestedAt ?? null, checkedAt: now, pricingTier: pricingTierFor(model) });
    }
  }
  // Never-really-probed first, then oldest real probe; cap re-pings per run.
  const lastTestedOf = (name) => prevMap.get(name)?.lastTestedAt ?? 0;
  staleCandidates.sort((a, b) => lastTestedOf(a.logicalName) - lastTestedOf(b.logicalName));
  for (let i = 0; i < staleCandidates.length; i++) {
    const model = staleCandidates[i];
    if (i < AVAILABILITY_RETEST_MAX) {
      toTest.push(model);
    } else {
      const prev = prevMap.get(model.logicalName);
      toCopy.push({ ...prev, ...model, lastTestedAt: prev.lastTestedAt ?? null, checkedAt: now, pricingTier: pricingTierFor(model) });
    }
  }

  console.log(`\nTesting ${toTest.length} models (${toCopy.length} copy-forwarded)...`);
  const results = [...toCopy];

  // Separate CLI-based tests from API-based tests
  const apiCandidates = toTest.filter(m => m.testVia !== "opencode");
  const cliCandidates = toTest.filter(m => m.testVia === "opencode");

  // Test API candidates in concurrent batches with delays.
  const batchSize = 4;
  const batchDelayMs = 3000;
  for (let i = 0; i < apiCandidates.length; i += batchSize) {
    const batch = apiCandidates.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async (model) => {
      const status = await testCandidate(model);
      const jsonTag = status.available && status.jsonOk === false
        ? " ⚠ json-fail"
        : "";
      const printable = status.available
        ? `✅ ${status.latency}ms${jsonTag}`
        : `❌ ${String(status.error || "unavailable").slice(0, 80)}`;
      const keyMissing = status.error?.startsWith("no ") ? " (key not set)" : "";
      console.log(`  [${model.provider.padEnd(10)}] ${model.logicalName}: ${printable}${keyMissing}`);
      return { ...model, ...status, checkedAt: now, lastTestedAt: now, pricingTier: pricingTierFor(model) };
    }));
    results.push(...batchResults);
    if (i + batchSize < apiCandidates.length) {
      await new Promise(r => setTimeout(r, batchDelayMs));
    }
  }

  // Test CLI candidates sequentially with a small delay between each.
  for (let i = 0; i < cliCandidates.length; i++) {
    const model = cliCandidates[i];
    const status = await testCandidate(model);
    const jsonTag = status.available && status.jsonOk === false
      ? " ⚠ json-fail"
      : "";
    const printable = status.available
      ? `✅ ${status.latency}ms${jsonTag}`
      : `❌ ${String(status.error || "unavailable").slice(0, 80)}`;
    const keyMissing = status.error?.startsWith("no ") ? " (key not set)" : "";
    console.log(`  [${model.provider.padEnd(10)}] ${model.logicalName}: ${printable}${keyMissing}`);
    results.push({ ...model, ...status, checkedAt: now, lastTestedAt: now, pricingTier: pricingTierFor(model) });
    if (i < cliCandidates.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results.map(r => {
    const prev = prevMap.get(r.logicalName);
    const unavailableSince = (!r.available && isGoneError(r.error))
      ? (prev?.unavailableSince ?? r.checkedAt ?? now)
      : null; // available, or transient failure (429/timeout/5xx/no-credits) — don't retire
    return { ...r, unavailableSince };
  });
}

async function hotAddModel(model) {
  if (!model.litellmModel) return false;
  const litellmParams = { model: model.litellmModel, timeout: 60 };
  if (model.litellmApiBase) litellmParams.api_base = model.litellmApiBase;
  if (model.litellmApiKeyEnv) litellmParams.api_key = `os.environ/${model.litellmApiKeyEnv}`;
  try {
    const res = await fetch("http://127.0.0.1:4000/model/new", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LITELLM_KEY}` },
      body: JSON.stringify({ model_name: model.logicalName, litellm_params: litellmParams }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.log(`  Hot-add ${model.logicalName}: HTTP ${res.status} — ${txt.slice(0, 100)}`);
      return false;
    }
    console.log(`  → Hot-activated ${model.logicalName} via /model/new (no restart needed)`);
    return true;
  } catch (e) {
    console.log(`  Hot-add ${model.logicalName} failed: ${e.message}`);
    return false;
  }
}

async function waitForLiteLLMIdle(maxWaitMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const out = execSync("ss -tn state established '( dport = :4000 )' 2>/dev/null | tail -n +2 | wc -l", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (parseInt(out, 10) === 0) return;
      console.log(`  ${out} active LiteLLM connection(s) — waiting to drain...`);
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  console.log("  Drain timeout reached — proceeding with restart");
}

async function maybeRestartLiteLLM(needed, reason, mode = "full") {
  if (!needed) return;
  if (mode === "quick") {
    console.log(`\nSkipping LiteLLM restart in quick mode (${reason}) — config updated, will apply on next full run`);
    return;
  }
  console.log(`\nGraceful LiteLLM restart (${reason})...`);
  await waitForLiteLLMIdle(60_000);
  try {
    execSync("systemctl restart litellm.service", { stdio: "inherit" });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {
    console.error(`LiteLLM restart failed: ${e.message}`);
  }
}

async function execute(mode, trigger = "manual") {
  const now = Date.now();
  console.log(`[model-health-check] ${new Date(now).toISOString()} mode=${mode}`);

  // Refresh quality statuses (applies auto-recovery + prunes stale incidents)
  recalculateAllStatuses();

  const previous = readJsonFile(HEALTH_FILE, {});
  const prevMap = new Map((previous.models || []).map(model => [model.logicalName, model]));
  const quality = loadQuality();
  const policy = loadPolicy();

  // Quick mode only runs if the last full check is fresh enough.
  if (mode === "quick" && (!previous?.lastFullCheckAt || now - previous.lastFullCheckAt > FULL_STALE_MS)) {
    console.log("Quick mode requested but last full discovery is missing/stale — forcing full discovery");
    return execute("full", "quick-stale");
  }

  const candidates = mode === "full"
    ? await buildFullCandidateSet()
    : buildQuickCandidateSet(previous);

  let results = await testCandidateSet(candidates, now, prevMap, quality);
  const retired = results.filter(r => r.unavailableSince && now - r.unavailableSince > RETIRE_AFTER_MS);
  if (retired.length > 0) {
    console.log(`\nRetiring ${retired.length} model(s) unavailable > 30 days: ${retired.map(r => r.logicalName).join(", ")}`);
  }
  results = results.filter(r => !(r.unavailableSince && now - r.unavailableSince > RETIRE_AFTER_MS));
  const added = [];
  const needsRestartForNewModels = [];

  if (mode === "full") {
    for (const result of results) {
      if (result.testVia !== "direct" || !result.available) continue;
      try {
        if (addToLitellmConfig(result)) {
          added.push({ logicalName: result.logicalName, latency: result.latency });
          console.log(`  → Added ${result.logicalName} to LiteLLM config`);
          const hotAdded = await hotAddModel(result);
          if (!hotAdded) needsRestartForNewModels.push(result.logicalName);
        }
      } catch (e) {
        console.error(`  Failed to add ${result.logicalName}: ${e.message}`);
      }
    }
  }

  await maybeRestartLiteLLM(needsRestartForNewModels.length > 0, "new model entries (hot-add unavailable)", mode);

  // Run workload-specific probes (full mode only) and compute rating100 for all models
  let workloadScoreMap = new Map();
  if (mode === "full") {
    workloadScoreMap = await runWorkloadProbesForResults(results, quality);
    // Reload quality after writes
    const qualityFresh = loadQuality();
    const benchmarks = loadBenchmarks();
    results = results.map(r => {
      const qEntry = qualityFresh.models?.[r.logicalName];
      const anchor = resolveBenchmarkAnchor(r, benchmarks);
      const breakdown = computeRating100(r, qEntry, anchor);
      return { ...r, rating100: breakdown.score, ratingBreakdown: breakdown, workloadScores: qEntry?.workloadScores ?? null };
    });
  } else {
    // In quick mode: carry forward existing rating100 from previous health file
    const benchmarks = loadBenchmarks();
    results = results.map(r => {
      const prev = prevMap.get(r.logicalName);
      if (prev?.rating100 != null) {
        return { ...r, rating100: prev.rating100, ratingBreakdown: prev.ratingBreakdown ?? null, workloadScores: prev.workloadScores ?? null };
      }
      const qEntry = quality.models?.[r.logicalName];
      const anchor = resolveBenchmarkAnchor(r, benchmarks);
      const breakdown = computeRating100(r, qEntry, anchor);
      return { ...r, rating100: breakdown.score, ratingBreakdown: breakdown, workloadScores: qEntry?.workloadScores ?? null };
    });
  }

  let ranked = rankCloudModels(results, quality, policy);

  console.log("\nRanked cloud models:");
  for (const [capability, models] of Object.entries(ranked)) {
    console.log(`  ${capability}: ${models.length > 0 ? models.join(", ") : "(none available)"}`);
  }

  const { changed: chainsChanged, heavyChain, fastChain, gpuHeavyFallback, gpuFastFallback } = rewriteFallbackChains(ranked);
  await maybeRestartLiteLLM(chainsChanged, "fallback chain update", mode);

  const lastFullCheckAt = mode === "full" ? now : (previous.lastFullCheckAt || now);
  const health = {
    checkedAt: now,
    checkedAtISO: new Date(now).toISOString(),
    mode,
    trigger,
    lastFullCheckAt,
    lastFullCheckAtISO: new Date(lastFullCheckAt).toISOString(),
    lastQuickCheckAt: mode === "quick" ? now : (previous.lastQuickCheckAt || null),
    lastQuickCheckAtISO: mode === "quick" ? new Date(now).toISOString() : (previous.lastQuickCheckAtISO || null),
    bestLocal: results.find(result => result.provider === "local" && result.available)?.logicalName || previous.bestLocal || null,
    bestCloudHeavy: ranked.heavy[0] || ranked.medium[0] || "github-gpt41",
    bestCloudFast: ranked.medium[0] || ranked.heavy[0] || "github-gpt41",
    ranked,
    availableByCapability: {
      heavy: ranked.heavy.length,
      medium: ranked.medium.length,
      light: ranked.light.length,
    },
    qualitySummary: {
      blocked: Object.values(quality.models || {}).filter(entry => entry.status === "blocked").length,
      degraded: Object.values(quality.models || {}).filter(entry => entry.status === "degraded").length,
      probation: Object.values(quality.models || {}).filter(entry => entry.status === "probation").length,
    },
    models: results,
    newModelsAdded: added,
    fallbacks: {
      editorialCloudHeavy: heavyChain,
      editorialCloudFast: fastChain,
      editorialHeavy: gpuHeavyFallback,
      editorialFast: gpuFastFallback,
    },
  };

  writeJsonFile(HEALTH_FILE, health);
  console.log(`\nHealth file written: ${HEALTH_FILE}`);

  // Append to discovery log (ring-buffer: keep last 100 entries)
  if (mode !== "quick") {
    try {
      const entry = JSON.stringify({
        ts: new Date().toISOString(),
        newModelsAdded: added.map(m => m.logicalName ?? String(m)),
        totalModelCount: results.length,
      });
      let existing = "";
      try { existing = fs.readFileSync(DISCOVERY_LOG_FILE, "utf8"); } catch {}
      const lines = existing.split("\n").filter(l => l.trim());
      lines.push(entry);
      const kept = lines.slice(-100);
      fs.writeFileSync(DISCOVERY_LOG_FILE, kept.join("\n") + "\n", "utf8");
      console.log(`Discovery log updated: ${DISCOVERY_LOG_FILE}`);
    } catch (e) {
      console.warn("Failed to write discovery log:", e.message);
    }
  }

  const changes = [];

  for (const result of results) {
    if (result.provider === "local") continue;
    const prev = prevMap[result.logicalName];
    if (!prev) continue;
    if (!prev.available && result.available) changes.push(`🟢 <b>${result.logicalName}</b> back online (${result.latency}ms)`);
    if (prev.available && !result.available) changes.push(`🔴 <b>${result.logicalName}</b> went offline`);
  }

  for (const addedModel of added) {
    changes.push(`✨ New model: <code>${addedModel.logicalName}</code> (${addedModel.latency}ms)`);
  }

  if (totalPrimaryCloud(ranked) === 0) {
    changes.push("⚠️ <b>No primary cloud models available</b> — pipeline will fall back to local GPU only");
  }

  if (changes.length > 0) {
    const availSummary = `Heavy: ${ranked.heavy.length} | Medium: ${ranked.medium.length} | Light: ${ranked.light.length}`;
    const msg =
      `<b>Model health update</b>\n\n${changes.join("\n")}\n\n` +
      `<b>Mode:</b> <code>${mode}</code>\n` +
      `<b>Available cloud:</b> ${availSummary}\n` +
      `<b>Best heavy:</b> <code>${health.bestCloudHeavy}</code>\n` +
      `<b>Best fast:</b> <code>${health.bestCloudFast}</code>`;
    await sendTelegram(msg);
    console.log("Telegram notification sent");
  }

  const cloudResults = results.filter(result => result.provider !== "local" && !CLOUD_EXCLUDE.has(result.logicalName));
  const totalAvail = results.filter(result => result.available).length;
  const cloudAvail = cloudResults.filter(result => result.available).length;
  const missingKeys = [...new Set(results.filter(result => result.error?.startsWith("no ")).map(result => result.error.replace("no ", "")))];
  console.log(`\n── Summary ─────────────────────────────────────`);
  console.log(`Total available: ${totalAvail}/${results.length}`);
  console.log(`Cloud available: ${cloudAvail}/${cloudResults.length}`);
  console.log(`  Heavy: ${ranked.heavy.join(", ") || "(none)"}`);
  console.log(`  Medium: ${ranked.medium.join(", ") || "(none)"}`);
  console.log(`  Light: ${ranked.light.join(", ") || "(none)"}`);
  if (missingKeys.length > 0) {
    console.log(`Missing API keys: ${missingKeys.join(", ")} (set in /etc/litellm/litellm.env)`);
  }
  if (added.length > 0) {
    console.log(`New models added: ${added.map(entry => entry.logicalName).join(", ")}`);
  }
}

try {
  const { mode } = parseArgs(process.argv.slice(2));
  await execute(mode, "systemd");
} catch (e) {
  console.error("model-health-check failed:", e);
  process.exit(1);
}
