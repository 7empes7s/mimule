#!/usr/bin/env node
/**
 * newsbites-autopipeline.mjs — Continuous editorial pipeline worker
 *
 * Single-process event loop with a priority queue, GPU mutex, and Unix socket
 * for Telegram/shell commands. Runs the full scout → publish pipeline.
 *
 * Managed from /home/agent/MIMULE_MASTER_PLAN_V3.md (Phase 3)
 */

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureClaimsCsv, ensureVerifyMd } from "./_dossier-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config from environment ──────────────────────────────────────────────────

const STATE_PATH = process.env.PIPELINE_STATE || "/var/lib/mimule/pipeline-state.json";
const SOCKET_PATH = process.env.PIPELINE_SOCKET || "/var/run/mimule/pipeline.sock";
const GPU_HEALTH_PATH = process.env.GPU_HEALTH || "/var/lib/mimule/gpu-health.json";
const SCOUT_INTERVAL_MS = Number(process.env.SCOUT_INTERVAL_MS) || 2 * 3600_000;  // Scout every 2 hours
const QUEUE_CHECK_MS = Number(process.env.QUEUE_CHECK_MS) || 30_000;
const MAX_STORIES = Number(process.env.MAX_CONCURRENT_STORIES) || 2;
const AUTO_PUBLISH = process.env.AUTO_PUBLISH_ENABLED !== "false";
const AUTO_PUBLISH_VERTICALS = (process.env.AUTO_PUBLISH_VERTICALS || "ai,trends,science").split(",").map(s => s.trim());
const SCOUT_BRIEF_COUNT = Number(process.env.SCOUT_BRIEF_COUNT) || 6;
const SCOUT_FANOUT_COUNT = Math.max(1, Number(process.env.SCOUT_FANOUT_COUNT || 1) || 1);
const HTTP_PORT = Number(process.env.PIPELINE_HTTP_PORT) || 3200;

// ── Paths ────────────────────────────────────────────────────────────────────

const EDITORIAL_ROOT = path.resolve(__dirname, "..");
const SCRIPTS = path.resolve(__dirname);
const RUNNER = path.join(SCRIPTS, "small-desk-runner.mjs");
const AGENT = path.join(SCRIPTS, "small-desk-agent.mjs");
const VALIDATOR = path.join(SCRIPTS, "validate-story-package.mjs");
const PUBLISH_DOSSIER = "/opt/newsbites/scripts/publish-dossier.mjs";
const DEPLOY_SCRIPT = "/opt/newsbites/deploy.sh";
const RUNS_ROOT = path.join(EDITORIAL_ROOT, "runs");
const DOSSIERS_ROOT = path.join(EDITORIAL_ROOT, "dossiers");
const PUBLISHED_ARTICLES_DIR = "/opt/newsbites/content/articles";

// Paperclip config
const PAPERCLIP_URL = process.env.PAPERCLIP_URL || "http://127.0.0.1:3100";
const PAPERCLIP_KEY = process.env.PAPERCLIP_BOARD_API_KEY || "";
const VERIFICATION_AGENT_ID = process.env.VERIFICATION_AGENT_ID || "cee5f7de-c677-42fb-8077-6a12693fc65d";

// Telegram (via OpenClaw gateway or direct bot API)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7783532877";

// ── Stage definitions ────────────────────────────────────────────────────────

const STAGES = [
  "scout", "rank", "init", "research", "validate-research",
  "write", "validate-write", "verify", "publish-prep",
  "fetch-image", "auto-gate", "publish", "deploy", "notify",
];

const GPU_32B_STAGES = new Set([]); // verify now uses GPU-first with cloud fallback
const GPU_8B_STAGES = new Set(["scout", "rank"]);
const CLOUD_STAGES = new Set(["research", "write", "publish-prep", "fetch-image"]);
const DEPLOY_STAGES = new Set(["deploy"]);

// ── State ────────────────────────────────────────────────────────────────────

let state = {
  queue: [],
  current: null,
  completed: [],
  paused: false,
  pauseReason: null,
  lastScout: 0,
  lastScoutRunDir: null,
  stats: { storiesCompleted: 0, storiesFailed: 0, totalDurationMs: 0 },
  // Image provider quota tracking — set when a provider exhausts its quota
  googleImgQuotaExhaustedAt: null,  // ms; skip Gemini/Imagen models until this clears
  cfImgQuotaExhaustedAt: null,      // ms; skip CF models until this clears (daily reset)
  fetchImagePausedUntil: null,      // ms; when ALL providers + stock fail, gate all fetch-image dispatches
  // Stock photo dedup — track used IDs so the same photo is never reused across articles
  usedStockPhotoIds: { pexels: [], pixabay: [] },
};

let gpuBusy = false;
let deployBusy = false; // separate from gpuBusy so verify doesn't wait on a 3-min build
let lastDeploySuccessAt = 0;
let cloudSlots = 0; // in-flight cloud-API stage calls
let shuttingDown = false;

// ── Dynamic model selection (reads /var/lib/mimule/model-health.json) ────────

const MODEL_HEALTH_FILE = "/var/lib/mimule/model-health.json";
const MODEL_HEALTH_MAX_AGE = 6 * 3600 * 1000; // 6 hours
const MODEL_QUALITY_FILE = "/var/lib/mimule/model-quality.json";
const MODEL_COOLDOWN_FILE = "/var/lib/mimule/model-cooldowns.json";
const ALERT_HISTORY_FILE = "/var/lib/mimule/pipeline-alerts.json";
const DOCTOR_LOG_FILE = "/var/lib/mimule/doctor-log.jsonl";
const QUALITY_WINDOW_MS = 24 * 3600 * 1000;
const MODEL_COOLDOWN_FLOOR_MS = 60_000;
const MODEL_COOLDOWN_CEILING_MS = 10 * 60_000;
const FAILURE_ALERT_COOLDOWN_MS = 6 * 3600_000;
const DOCTOR_MAX_ATTEMPTS = Number(process.env.PIPELINE_DOCTOR_MAX_ATTEMPTS || 2);
const DOCTOR_QUALITY_COOLDOWN_MS = Number(process.env.PIPELINE_DOCTOR_QUALITY_COOLDOWN_MS || 10 * 60_000);
const DOCTOR_SCAN_WINDOW_MS = Number(process.env.PIPELINE_DOCTOR_SCAN_WINDOW_MS || 2 * 60 * 60_000);
const DOCTOR_AUTO_REPAIR_STAGES = new Set(["publish-prep", "fetch-image", "publish", "notify", "verify"]);
const DEPLOY_THROTTLE_MS = 5 * 60_000;

// Image provider quota cooldowns
// Google monthly billing cap — once hit, skip Google models for 24h (they retry once/day)
const GOOGLE_IMG_QUOTA_COOLDOWN_MS = 24 * 3600 * 1000;
// CF daily neuron quota — resets at midnight UTC; 23h cooldown so we retry after reset
const CF_IMG_QUOTA_COOLDOWN_MS = 23 * 3600 * 1000;

function nextMidnightUTC() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function isGoogleImgQuotaError(msg) {
  return /monthly spend|monthly budget|spending limit|quota exceeded|resource.*exhausted/i.test(msg);
}

function isCfImgQuotaError(msg) {
  return msg.includes("429") && /daily free allocation|10.?000 neuron/i.test(msg);
}

function googleImgInCooldown() {
  return state.googleImgQuotaExhaustedAt &&
    (Date.now() - state.googleImgQuotaExhaustedAt) < GOOGLE_IMG_QUOTA_COOLDOWN_MS;
}

function cfImgInCooldown() {
  return state.cfImgQuotaExhaustedAt &&
    (Date.now() - state.cfImgQuotaExhaustedAt) < CF_IMG_QUOTA_COOLDOWN_MS;
}

let modelCooldowns = {};
let alertHistory = {};
let cloudModelUsage = {};

function getCloudModel(tier = "heavy") {
  // Read the ranked model list from the health file (updated every 15min by quick refresh).
  // Pick the top available model directly so the most current ranking is used, even between
  // full LiteLLM restarts. Falls back to the LiteLLM chain name if the health file is stale
  // or empty — the chain itself is also ranked and serves as a safety net.
  try {
    const raw = fs.readFileSync(MODEL_HEALTH_FILE, "utf8");
    const health = JSON.parse(raw);
    const age = Date.now() - (health.checkedAt || 0);
    if (age <= MODEL_HEALTH_MAX_AGE) {
      const ranked = health.ranked || {};
      const heavy  = ranked.heavy  || [];
      const medium = ranked.medium || [];
      const model  = tier === "heavy"
        ? (heavy[0] || medium[0])
        : (medium[0] || heavy[0]);
      if (model) return model;
    }
  } catch {
    // health file missing or corrupt — fall through
  }
  return tier === "heavy" ? "editorial-cloud-heavy" : "editorial-cloud-fast";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      state = { ...state, ...raw };
      // Clear in-flight markers from previous process — they can't still be running
      for (const item of state.queue) {
        item.running = false;
      }
      log(`Loaded state: ${state.queue.length} queued, paused=${state.paused}`);
    }
  } catch (e) {
    log(`Failed to load state: ${e.message}`);
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`Failed to save state: ${e.message}`);
  }
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function appendJsonLine(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function readObjectFile(filePath) {
  const value = readJsonFile(filePath, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pruneCooldowns() {
  const now = nowMs();
  let dirty = false;
  for (const [model, until] of Object.entries(modelCooldowns)) {
    if (!Number.isFinite(until) || until <= now) {
      delete modelCooldowns[model];
      dirty = true;
    }
  }
  return dirty;
}

function saveModelCooldowns() {
  pruneCooldowns();
  writeJsonFile(MODEL_COOLDOWN_FILE, modelCooldowns);
}

function saveAlertHistory() {
  const cutoff = nowMs() - (FAILURE_ALERT_COOLDOWN_MS * 4);
  for (const [key, sentAt] of Object.entries(alertHistory)) {
    if (!Number.isFinite(sentAt) || sentAt < cutoff) {
      delete alertHistory[key];
    }
  }
  writeJsonFile(ALERT_HISTORY_FILE, alertHistory);
}

function loadRuntimeLedgers() {
  modelCooldowns = readObjectFile(MODEL_COOLDOWN_FILE);
  alertHistory = readObjectFile(ALERT_HISTORY_FILE);
  if (pruneCooldowns()) {
    saveModelCooldowns();
  }
}

function readLatestStageRunResult(dossierDir, stage) {
  if (!dossierDir) return null;
  const runsDir = path.join(dossierDir, "agent_runs");
  if (!fs.existsSync(runsDir)) return null;

  const latestRun = fs.readdirSync(runsDir)
    .filter(name => name.includes(`-${stage}`))
    .sort()
    .pop();

  if (!latestRun) return null;

  const resultPath = path.join(runsDir, latestRun, "run-result.json");
  if (!fs.existsSync(resultPath)) return null;
  return readJsonFile(resultPath, null);
}

function readStageRunResults(dossierDir, stage) {
  if (!dossierDir) return [];
  const runsDir = path.join(dossierDir, "agent_runs");
  if (!fs.existsSync(runsDir)) return [];

  return fs.readdirSync(runsDir)
    .filter(name => name.includes(`-${stage}`))
    .sort()
    .map((name) => ({
      name,
      result: readJsonFile(path.join(runsDir, name, "run-result.json"), null),
    }))
    .filter(entry => entry.result);
}

function pushUnique(arr, value) {
  if (!arr || !value) return;
  if (!arr.includes(value)) arr.push(value);
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKnownStories() {
  const known = { slugs: new Set(), titles: new Set() };
  const addStory = (slugValue, titleValue = "") => {
    const slug = normalizeSlug(slugValue);
    const title = normalizeTitle(titleValue || slug.replace(/-/g, " "));
    if (slug) known.slugs.add(slug);
    if (title) known.titles.add(title);
  };

  for (const item of [...state.queue, ...state.completed]) {
    addStory(item.slug || path.basename(item.dossierDir || ""), item.title || "");
  }

  const dateDir = path.join(DOSSIERS_ROOT, today());
  if (fs.existsSync(dateDir)) {
    for (const dirent of fs.readdirSync(dateDir, { withFileTypes: true })) {
      if (dirent.isDirectory()) addStory(dirent.name);
    }
  }

  return known;
}

function classifyFailureBucket(message = "") {
  const text = String(message || "").toLowerCase();
  if (/http 429|rate.?limit|too many requests|quota|billing|capacity/.test(text)) return "capacity_rate_limit";
  if (/timed out|timeout|aborterror/.test(text)) return "transport_timeout";
  if (/http 5\d\d|service unavailable|bad gateway|fetch failed|terminated|401|403|forbidden|unauthorized/.test(text)) {
    return "transport_provider_error";
  }
  if (/missing string field|missing required file|validator|valid json|bad control character|empty output|json at position|unexpected token .* json|unexpected end of json|unterminated string in json|not valid json|json\.parse|syntaxerror.*json/.test(text)) {
    return "quality_garbage";
  }
  return "unknown";
}

function shouldSendAlert(key, cooldownMs = FAILURE_ALERT_COOLDOWN_MS) {
  const lastSentAt = Number(alertHistory[key] || 0);
  if (lastSentAt && (nowMs() - lastSentAt) < cooldownMs) {
    return false;
  }
  alertHistory[key] = nowMs();
  saveAlertHistory();
  return true;
}

function parseRetryAfterMs(message = "") {
  const match = String(message).match(/try again in ([0-9.]+)s/i);
  if (!match) return null;
  const seconds = Number.parseFloat(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function setModelCooldown(model, durationMs, reason = "") {
  if (!model) return;
  const cooldownMs = Math.max(MODEL_COOLDOWN_FLOOR_MS, Math.min(durationMs, MODEL_COOLDOWN_CEILING_MS));
  const until = nowMs() + cooldownMs;
  if ((modelCooldowns[model] || 0) >= until) return;
  modelCooldowns[model] = until;
  saveModelCooldowns();
  log(`[model] Cooling down ${model} for ${Math.round(cooldownMs / 1000)}s${reason ? ` (${reason})` : ""}`);
}

function adjustCloudModelUsage(model, delta) {
  if (!model) return;
  const next = Math.max(0, Number(cloudModelUsage[model] || 0) + delta);
  if (next === 0) {
    delete cloudModelUsage[model];
  } else {
    cloudModelUsage[model] = next;
  }
}

function getModelCandidates(tier = "heavy") {
  try {
    const health = JSON.parse(fs.readFileSync(MODEL_HEALTH_FILE, "utf8"));
    const age = nowMs() - (health.checkedAt || 0);
    if (age > MODEL_HEALTH_MAX_AGE) return [];
    const ranked = health.ranked || {};
    const ordered = tier === "heavy"
      ? [...(ranked.heavy || []), ...(ranked.medium || [])]
      : [...(ranked.medium || []), ...(ranked.heavy || [])];
    return [...new Set(ordered.filter(Boolean))];
  } catch {
    return [];
  }
}

function chooseCloudModel(tier = "heavy") {
  if (pruneCooldowns()) saveModelCooldowns();

  const fallback = tier === "heavy" ? "editorial-cloud-heavy" : "editorial-cloud-fast";
  const candidates = getModelCandidates(tier);
  if (candidates.length === 0) return fallback;

  const ledger = readJsonFile(MODEL_QUALITY_FILE, { models: {} });
  const qualityRank = { healthy: 0, probation: 1, degraded: 2, blocked: 3 };
  const now = nowMs();

  const viable = candidates
    .map((model, index) => ({
      model,
      index,
      quality: ledger?.models?.[model]?.status || "healthy",
      cooldownUntil: Number(modelCooldowns[model] || 0),
      inFlight: Number(cloudModelUsage[model] || 0),
    }))
    .filter(entry => entry.quality !== "blocked");

  const pool = viable.length > 0 ? viable : candidates.map((model, index) => ({
    model,
    index,
    quality: "healthy",
    cooldownUntil: Number(modelCooldowns[model] || 0),
    inFlight: Number(cloudModelUsage[model] || 0),
  }));

  const ready = pool.filter(entry => !entry.cooldownUntil || entry.cooldownUntil <= now);
  const ranked = (ready.length > 0 ? ready : pool).sort((a, b) =>
    a.inFlight - b.inFlight ||
    (qualityRank[a.quality] ?? 99) - (qualityRank[b.quality] ?? 99) ||
    a.index - b.index
  );

  return ranked[0]?.model || fallback;
}

function getQualityStatusAfterFailure(entry) {
  const failureCount = entry.recentFailures.length;
  if (entry.status === "blocked") return "blocked";
  if (failureCount >= 4 || (entry.status === "degraded" && entry.consecutiveGarbage >= 2)) {
    return "blocked";
  }
  if (failureCount >= 3) return "degraded";
  if (failureCount >= 2) return "probation";
  return entry.status || "healthy";
}

function maybeRecoverQualityStatus(entry) {
  if (entry.status === "blocked") return entry.status;
  if (entry.status === "degraded" && entry.cleanStreak >= 5 && entry.recentFailures.length < 3) {
    return "probation";
  }
  if (entry.status === "probation" && entry.cleanStreak >= 3 && entry.recentFailures.length < 2) {
    return "healthy";
  }
  return entry.status || "healthy";
}

async function recordModelQualityOutcome(item, stage, success) {
  if (!CLOUD_STAGES.has(stage) || !item?.dossierDir) return;

  const runResult = readLatestStageRunResult(item.dossierDir, stage);
  if (!runResult || runResult.backend !== "litellm") return;

  const qualityKey = String(runResult.resolvedModel || runResult.requestedModel || "").trim();
  if (!qualityKey) return;

  const ledger = readJsonFile(MODEL_QUALITY_FILE, { version: 1, models: {} });
  const now = nowMs();
  const entry = ledger.models[qualityKey] || {
    qualityKey,
    status: "healthy",
    aliases: [],
    successes: 0,
    garbageEvents: 0,
    cleanStreak: 0,
    consecutiveGarbage: 0,
    recentFailures: [],
    stageStats: {},
    firstSeenAtISO: new Date(now).toISOString(),
  };

  entry.lastSeenAtISO = new Date(now).toISOString();
  entry.aliases = entry.aliases || [];
  entry.stageStats = entry.stageStats || {};
  pushUnique(entry.aliases, runResult.requestedModel || null);
  pushUnique(entry.aliases, runResult.resolvedModel || null);

  const stageStats = entry.stageStats[stage] || {
    successes: 0,
    garbageEvents: 0,
    lastErrorType: null,
    lastErrorMessage: null,
  };

  const previousStatus = entry.status || "healthy";
  entry.recentFailures = (entry.recentFailures || []).filter(ts => now - ts <= QUALITY_WINDOW_MS);

  if (success) {
    entry.successes += 1;
    entry.cleanStreak += 1;
    entry.consecutiveGarbage = 0;
    stageStats.successes += 1;
    entry.status = maybeRecoverQualityStatus(entry);
  } else {
    if (!["quality_garbage", "quality_validation"].includes(runResult.errorType)) {
      return;
    }

    entry.garbageEvents += 1;
    entry.cleanStreak = 0;
    entry.consecutiveGarbage += 1;
    entry.recentFailures.push(now);
    entry.recentFailures = entry.recentFailures.filter(ts => now - ts <= QUALITY_WINDOW_MS);
    entry.lastGarbageAtISO = new Date(now).toISOString();
    stageStats.garbageEvents += 1;
    stageStats.lastErrorType = runResult.errorType || null;
    stageStats.lastErrorMessage = runResult.errorMessage || null;
    entry.status = getQualityStatusAfterFailure(entry);
  }

  entry.stageStats[stage] = stageStats;
  ledger.models[qualityKey] = entry;
  ledger.updatedAtISO = new Date(now).toISOString();
  writeJsonFile(MODEL_QUALITY_FILE, ledger);

  if (previousStatus !== "blocked" && entry.status === "blocked") {
    await sendTelegram(
      `<b>Model blocked</b> <code>${qualityKey}</code>\n` +
      `Stage: ${stage}\n` +
      `Reason: ${String(runResult.errorType || "quality failure").slice(0, 120)}`
    );
  }
}

function summarizeDoctorHistory(dossierDir, stage) {
  const runs = readStageRunResults(dossierDir, stage);
  const failed = runs.filter(({ result }) => result?.success !== true);
  const distinctModels = [...new Set(
    failed
      .map(({ result }) => result?.resolvedModel || result?.requestedModel || null)
      .filter(Boolean)
  )];
  return {
    runs,
    failed,
    distinctModels,
  };
}

function writeDoctorDecision(item, decision) {
  const entry = {
    ts: new Date().toISOString(),
    slug: item.slug || path.basename(item.dossierDir || "unknown"),
    dossierDir: item.dossierDir || null,
    stage: item.stage,
    failedAt: item.failedAt || null,
    retries: item.retries || 0,
    doctorAttempts: item.doctorAttempts || 0,
    source: decision.source || "manual",
    action: decision.action,
    reason: decision.reason,
    errorType: decision.errorType || null,
    failedModel: decision.failedModel || null,
    nextStage: decision.nextStage || null,
    nextPriority: decision.nextPriority ?? null,
    cooldownMs: decision.cooldownMs ?? null,
    distinctModelsTried: decision.distinctModelsTried ?? null,
  };
  appendJsonLine(DOCTOR_LOG_FILE, entry);
}

async function dispatchDoctorForItem(item, options = {}) {
  if (!item || item.status !== "stuck") {
    return { ok: false, error: "item is not stuck" };
  }

  const source = options.source || "manual";
  const slug = item.slug || path.basename(item.dossierDir || "unknown");
  const runResult = readLatestStageRunResult(item.dossierDir, item.stage);
  const errorType = runResult?.errorType || classifyFailureBucket(item.lastError || "");
  const failedModel = runResult?.resolvedModel || runResult?.requestedModel || null;
  const history = summarizeDoctorHistory(item.dossierDir, item.stage);
  const distinctModelsTried = history.distinctModels.length;
  const doctorAttempts = Number(item.doctorAttempts || 0);

  item.doctorLastEvaluatedAt = nowMs();

  const finalize = async (decision) => {
    item.doctorDisposition = decision.action;
    item.doctorReason = decision.reason;
    item.doctorErrorType = errorType;
    item.doctorFailedModel = failedModel;
    saveState();
    writeDoctorDecision(item, {
      ...decision,
      source,
      errorType,
      failedModel,
      distinctModelsTried,
    });
    if (decision.notify) {
      await sendTelegram(decision.notify);
    }
    return {
      ok: true,
      slug,
      stage: item.stage,
      action: decision.action,
      reason: decision.reason,
      distinctModelsTried,
    };
  };

  if (!["quality_garbage", "quality_validation", "capacity_rate_limit", "transport_timeout", "transport_provider_error"].includes(errorType)) {
    return finalize({
      action: "escalate",
      reason: `Unhandled failure type ${errorType}`,
      notify:
        `<b>Doctor escalated</b> <code>${slug}</code>\n` +
        `Stage: ${item.stage}\nReason: ${errorType}`,
    });
  }

  if (!DOCTOR_AUTO_REPAIR_STAGES.has(item.stage)) {
    return finalize({
      action: "escalate",
      reason: `Stage ${item.stage} is outside the late-stage auto-repair scope`,
    });
  }

  // fetch-image with capacity_rate_limit: if global pause is set, park the item instead of re-enqueuing
  if (item.stage === "fetch-image" && errorType === "capacity_rate_limit" && state.fetchImagePausedUntil) {
    return finalize({
      action: "waiting-quota",
      reason: `All image providers exhausted — waiting until ${new Date(state.fetchImagePausedUntil).toISOString()}`,
    });
  }

  if (failedModel && errorType === "quality_garbage") {
    setModelCooldown(failedModel, DOCTOR_QUALITY_COOLDOWN_MS, "doctor quality cooldown");
  }
  if (failedModel && errorType === "capacity_rate_limit") {
    const retryAfterMs = parseRetryAfterMs(runResult?.errorMessage || item.lastError || "") || MODEL_COOLDOWN_FLOOR_MS;
    setModelCooldown(failedModel, retryAfterMs + 30_000, "doctor rate limit cooldown");
  }

  if (doctorAttempts >= DOCTOR_MAX_ATTEMPTS || distinctModelsTried >= 3) {
    return finalize({
      action: "dead-content",
      reason: `No clean output after ${doctorAttempts} doctor retries and ${distinctModelsTried} model(s)`,
      notify:
        `<b>Doctor stopped retries</b> <code>${slug}</code>\n` +
        `Stage: ${item.stage}\nReason: repeated ${errorType} across ${distinctModelsTried} model(s)`,
    });
  }

  const repairableStage = DOCTOR_AUTO_REPAIR_STAGES.has(item.stage);
  if (!repairableStage) {
    return finalize({
      action: "escalate",
      reason: `Stage ${item.stage} is not yet auto-repairable`,
      notify:
        `<b>Doctor escalated</b> <code>${slug}</code>\n` +
        `Stage: ${item.stage}\nReason: stage is not auto-repairable yet`,
    });
  }

  const nextDoctorAttempts = doctorAttempts + 1;
  enqueue({
    type: item.type || "doctor",
    priority: 0,
    stage: item.stage,
    dossierDir: item.dossierDir,
    slug,
    doctorAttempts: nextDoctorAttempts,
    doctorParentFailedAt: item.failedAt || null,
    doctorTriggeredAt: nowMs(),
    doctorSource: source,
  });
  item.doctorAttempts = nextDoctorAttempts;

  return finalize({
    action: "requeued",
    reason: `Requeued stuck ${item.stage} after ${errorType}`,
    nextStage: item.stage,
    nextPriority: 0,
    cooldownMs: errorType === "quality_garbage" ? DOCTOR_QUALITY_COOLDOWN_MS : null,
    notify:
      `<b>Doctor requeued</b> <code>${slug}</code>\n` +
      `Stage: ${item.stage}\n` +
      `${failedModel ? `Last model: ${failedModel}\n` : ""}` +
      `Reason: ${errorType}`,
  });
}

async function doctorScanRecentStuckItems() {
  const stuck = state.completed
    .filter(item => item.status === "stuck")
    .sort((a, b) => Number(b.failedAt || 0) - Number(a.failedAt || 0));

  const results = [];
  for (const item of stuck) {
    if (!item.failedAt || (nowMs() - Number(item.failedAt)) > DOCTOR_SCAN_WINDOW_MS) {
      continue;
    }
    if (!DOCTOR_AUTO_REPAIR_STAGES.has(item.stage)) {
      continue;
    }
    if (["requeued", "dead-content", "escalate", "waiting-gpu", "waiting-quota"].includes(item.doctorDisposition)) {
      continue;
    }
    results.push(await dispatchDoctorForItem(item, { source: "timer" }));
  }
  return results;
}

function gpuHealthy() {
  try {
    const h = JSON.parse(fs.readFileSync(GPU_HEALTH_PATH, "utf8"));
    if (h.status === "up") return true;
    // False positive: probe was slow because GPU was busy (high util during pipeline work).
    // Only treat as down after 3+ consecutive failures or if util was genuinely 0.
    if (h.consec_fails < 3 && h.gpu_max_util > 0) return true;
    return false;
  } catch {
    return false;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowMs() {
  return Date.now();
}

// ── Process runner ───────────────────────────────────────────────────────────

function runProcess(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15 * 60_000;
  return new Promise((resolve, reject) => {
    log(`exec: ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      cwd: opts.cwd || EDITORIAL_ROOT,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`exit ${code}: ${stderr.slice(0, 500) || stdout.slice(0, 500)}`));
      }
    });
    child.on("error", reject);
  });
}

// ── Ollama-aware retry wrapper ────────────────────────────────────────────────
// Ollama returns HTTP 500 when a model is loading (cold swap) or the runner
// is busy. These are transient — retry with backoff before giving up.

const OLLAMA_RETRY_DELAYS = [30_000, 60_000, 120_000]; // 3 attempts: 30s, 60s, 120s

function isOllamaTransient(err) {
  const msg = err.message || "";
  return (
    msg.includes("HTTP 500") ||
    msg.includes("ollama backend failed") ||
    msg.includes("an error was encountered while running") ||
    msg.includes("runner process has terminated")
  );
}

async function runWithOllamaRetry(cmd, args, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= OLLAMA_RETRY_DELAYS.length; attempt++) {
    try {
      return await runProcess(cmd, args, opts);
    } catch (err) {
      lastErr = err;
      if (!isOllamaTransient(err) || attempt >= OLLAMA_RETRY_DELAYS.length) throw err;
      const delay = OLLAMA_RETRY_DELAYS[attempt];
      log(`Ollama transient error (attempt ${attempt + 1}/${OLLAMA_RETRY_DELAYS.length + 1}), retrying in ${delay / 1000}s: ${err.message.slice(0, 120)}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Telegram notifications ───────────────────────────────────────────────────

async function sendTelegram(text, buttons = null, timeoutMs = 15000) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log(`[telegram] no token/chat configured, skipping: ${text.slice(0, 80)}`);
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (buttons) {
      payload.reply_markup = { inline_keyboard: buttons };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log(`[telegram] send failed: ${res.status} ${body}`);
      // Retry without parse_mode if formatting caused the error
      if (res.status === 400) {
        payload.parse_mode = undefined;
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), timeoutMs);
        try {
          const retry = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller2.signal,
          });
          if (!retry.ok) log(`[telegram] retry also failed: ${retry.status}`);
        } finally {
          clearTimeout(timer2);
        }
      }
    }
  } catch (e) {
    log(`[telegram] error: ${e.message}`);
  }
}

// ── Paperclip API ────────────────────────────────────────────────────────────

async function paperclipWakeup(agentId) {
  const url = `${PAPERCLIP_URL}/api/agents/${agentId}/wakeup`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PAPERCLIP_KEY}`,
    },
    body: JSON.stringify({ source: "on_demand", triggerDetail: "manual" }),
  });
  if (!res.ok) {
    throw new Error(`Paperclip wakeup failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function paperclipRunStatus(runId) {
  // Query via Paperclip DB through the API is not directly available,
  // so we poll the heartbeat_runs via a shell command
  const { stdout } = await runProcess("docker", [
    "exec", "paperclip_db", "psql", "-U", "paperclip", "-d", "paperclip",
    "-t", "-A", "-c",
    `SELECT status, exit_code, EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::int FROM heartbeat_runs WHERE id='${runId}' LIMIT 1;`,
  ], { timeoutMs: 10_000 });
  const parts = stdout.trim().split("|");
  return { status: parts[0], exitCode: Number(parts[1]) || null, elapsedS: Number(parts[2]) || 0 };
}

// ── Cross-run deduplication ───────────────────────────────────────────────────

let publishedCache = null;

function loadPublishedArticles() {
  if (publishedCache) return publishedCache;
  const published = { urls: new Set(), slugs: new Set(), titles: new Set() };
  if (!fs.existsSync(PUBLISHED_ARTICLES_DIR)) {
    publishedCache = published;
    return published;
  }
  try {
    const files = fs.readdirSync(PUBLISHED_ARTICLES_DIR).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(PUBLISHED_ARTICLES_DIR, file), "utf8");
      const slug = file.replace(/\.md$/, "");
      published.slugs.add(slug);
      published.titles.add(slug.toLowerCase().replace(/-/g, " "));
      const linkMatch = content.match(/canonicalUrl:\s*["']?([^"'\n]+)["']?/i) ||
                        content.match(/sourceUrl:\s*["']?([^"'\n]+)["']?/i);
      if (linkMatch) published.urls.add(linkMatch[1].trim());
    }
  } catch (e) {
    log(`[dedup] Load error: ${e.message}`);
  }
  publishedCache = published;
  log(`[dedup] Loaded ${published.slugs.size} published articles`);
  return published;
}

function refreshPublishedCache() {
  publishedCache = null;
  return loadPublishedArticles();
}

function removeQueueItem(item) {
  const idx = state.queue.indexOf(item);
  if (idx !== -1) state.queue.splice(idx, 1);
}

function readDedupedPayload(runDir) {
  const dedupedPath = path.join(runDir, "deduped.json");
  if (!fs.existsSync(dedupedPath)) return null;
  return JSON.parse(fs.readFileSync(dedupedPath, "utf8"));
}

function selectScoutCandidates(payload, limit) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const target = Math.max(1, limit || 1);
  const selected = [];
  const seenIds = new Set();
  const seenVerticals = new Set();

  for (const item of items) {
    if (selected.length >= target) break;
    if (!item?.id || seenIds.has(item.id)) continue;
    const vertical = String(item.vertical || "").trim().toLowerCase();
    if (!vertical || seenVerticals.has(vertical)) continue;
    selected.push(item);
    seenIds.add(item.id);
    seenVerticals.add(vertical);
  }

  for (const item of items) {
    if (selected.length >= target) break;
    if (!item?.id || seenIds.has(item.id)) continue;
    selected.push(item);
    seenIds.add(item.id);
  }

  return selected;
}

function checkDuplicate(item) {
  const published = loadPublishedArticles();
  const known = getKnownStories();
  const url = item.canonicalUrl || item.link || "";
  const slug = normalizeSlug(item.slugIdea || item.title || "");
  if (url && published.urls.has(url)) return "url-already-published";
  if (slug && known.slugs.has(slug)) return "slug-already-seen";
  if (slug && published.slugs.has(slug)) return "slug-already-published";
  if (slug && published.slugs.has(slug.replace(/-in-his-portfolio$/, "-in-portfolio").replace(/-in-portfolio$/, "-in-his-portfolio"))) {
    return "slug-variant-published";
  }
  const titleNorm = normalizeTitle(item.title || "");
  for (const knownTitle of known.titles) {
    const sim = similarity(titleNorm, knownTitle);
    if (sim > 0.85) return `title-similarity-seen-${Math.round(sim * 100)}%`;
  }
  for (const pubTitle of published.titles) {
    const sim = similarity(titleNorm, pubTitle);
    if (sim > 0.85) return `title-similarity-${Math.round(sim * 100)}%`;
  }
  return null;
}

function similarity(a, b) {
  const arrA = a.split(" ").filter(x => x.length > 2);
  const arrB = b.split(" ").filter(x => x.length > 2);
  if (arrA.length === 0 || arrB.length === 0) return 0;
  const matches = arrA.filter(w => arrB.some(x => x.includes(w) || w.includes(x)));
  return matches.length / Math.max(arrA.length, arrB.length);
}

async function filterCandidatesForDuplicates(runDir) {
  const dedupedPath = path.join(runDir, "deduped.json");
  if (!fs.existsSync(dedupedPath)) {
    log(`[dedup] No deduped.json at ${runDir}`);
    return;
  }
  const payload = JSON.parse(fs.readFileSync(dedupedPath, "utf8"));
  const items = payload.items || [];
  const published = loadPublishedArticles();
  const before = items.length;
  const filtered = [];
  const dropped = [];
  for (const item of items) {
    const dup = checkDuplicate(item);
    if (dup) {
      dropped.push({ rank: item.rank, title: item.title, reason: dup });
      log(`[dedup] Skipping rank ${item.rank}: ${item.title?.slice(0, 50)} (${dup})`);
    } else {
      filtered.push(item);
    }
  }
  if (dropped.length > 0) {
    fs.writeFileSync(dedupedPath, JSON.stringify({ ...payload, items: filtered, dropped: [...(payload.dropped || []), ...dropped] }, null, 2));
    log(`[dedup] Filtered ${before} -> ${filtered.length} candidates (${dropped.length} duplicates)`);
  }
}

// ── Stage executors ──────────────────────────────────────────────────────────

async function execScout() {
  const dateStr = today();
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "T");
  const runDir = path.join(RUNS_ROOT, dateStr, ts);
  fs.mkdirSync(runDir, { recursive: true });

  await runProcess("node", [RUNNER, "scout", `--run-dir=${runDir}`, `--brief=${SCOUT_BRIEF_COUNT}`]);
  state.lastScout = nowMs();
  state.lastScoutRunDir = runDir;
  saveState();
  return runDir;
}

async function execRank(runDir) {
  // Cloud-first while GPU is rented (see feedback memory). Fall back to local Ollama
  // if the cloud call fails — keeps the pipeline running if cloud is rate-limited.
  const cloudModel = chooseCloudModel("fast");
  adjustCloudModelUsage(cloudModel, 1);
  try {
    await runProcess("node", [
      AGENT, "run", "--mode=scout", `--run-dir=${runDir}`,
      "--backend=litellm", `--model=${cloudModel}`,
      "--timeout-ms=180000",
    ], { timeoutMs: 4 * 60_000 });
    return;
  } catch (cloudErr) {
    log(`[rank] cloud (${cloudModel}) failed, falling back to local: ${String(cloudErr.message).slice(0, 120)}`);
  } finally {
    adjustCloudModelUsage(cloudModel, -1);
  }

  await runProcess("node", [
    AGENT, "run", "--mode=scout", `--run-dir=${runDir}`,
    "--backend=ollama", "--model=qwen3:8b",
  ]);
}

async function execInit(runDir, options = {}) {
  const dateStr = today();
  const args = [RUNNER, "start-story", `--run-dir=${runDir}`, `--date=${dateStr}`, "--force"];
  if (options.candidateId) {
    args.push(`--candidate-id=${options.candidateId}`);
  } else {
    args.push(`--rank=${options.rank || 1}`);
  }
  const { stdout } = await runProcess("node", args);

  // Preferred path: parse the structured JSON returned by small-desk-runner.
  try {
    const parsed = JSON.parse(stdout);
    if (parsed?.dossierDir && fs.existsSync(parsed.dossierDir)) return parsed.dossierDir;
  } catch {}

  // Backward-compatible fallback for older text output.
  const match = stdout.match(/Dossier (?:created|already exists): (.+)/);
  if (match) return match[1].trim();

  // Last-resort fallback: find the newest dossier for today. This is lossy and
  // should only be used if both JSON parsing and text extraction fail.
  const dateDir = path.join(DOSSIERS_ROOT, dateStr);
  if (fs.existsSync(dateDir)) {
    const dirs = fs.readdirSync(dateDir).sort().reverse();
    if (dirs.length > 0) return path.join(dateDir, dirs[0]);
  }
  throw new Error("Could not determine dossier path after start-story");
}

async function spawnStoriesFromScout(item, payload) {
  const selected = selectScoutCandidates(payload, item.scoutFanoutCount || SCOUT_FANOUT_COUNT);
  const spawned = [];

  for (const candidate of selected) {
    try {
      const dossierDir = await execInit(item.runDir, { candidateId: candidate.id });
      spawned.push({ candidate, dossierDir });
    } catch (e) {
      log(
        `[init] candidate ${candidate.rank || "?"} ` +
        `${String(candidate.title || "").slice(0, 80)} failed (${e.message.slice(0, 120)})`,
      );
    }
  }

  if (spawned.length === 0) {
    throw new Error("No dossiers could be created from scout candidates");
  }

  for (const [index, entry] of spawned.entries()) {
    enqueue({
      type: item.type || "auto",
      priority: item.priority,
      createdAt: (item.createdAt || nowMs()) + index,
      stage: "research",
      dossierDir: entry.dossierDir,
      slug: path.basename(entry.dossierDir),
      sourceRunDir: item.runDir,
      sourceCandidateId: entry.candidate.id,
      sourceCandidateRank: entry.candidate.rank,
      sourceVertical: entry.candidate.vertical,
      scoutParentId: item.id,
    });
  }

  log(
    `[${item.id}] Spawned ${spawned.length} dossier(s) from scout ` +
    `(${selected.length} selected, fan-out=${item.scoutFanoutCount || SCOUT_FANOUT_COUNT})`,
  );
  return "SPAWNED";
}

async function execResearch(dossierDir) {
  const model = chooseCloudModel("heavy");
  adjustCloudModelUsage(model, 1);
  try {
    await runProcess("node", [
      AGENT, "run", "--mode=research",
      `--dossier-dir=${dossierDir}`,
      "--backend=litellm", `--model=${model}`,
      "--timeout-ms=600000",
    ], { timeoutMs: 12 * 60_000 });
  } finally {
    adjustCloudModelUsage(model, -1);
  }
}

async function execValidate(dossierDir) {
  await runProcess("node", [VALIDATOR, dossierDir]);
}

async function execWrite(dossierDir) {
  const model = chooseCloudModel("heavy");
  adjustCloudModelUsage(model, 1);
  try {
    await runProcess("node", [
      AGENT, "run", "--mode=write",
      `--dossier-dir=${dossierDir}`,
      "--backend=litellm", `--model=${model}`,
      "--timeout-ms=600000",
    ], { timeoutMs: 12 * 60_000 });
  } finally {
    adjustCloudModelUsage(model, -1);
  }
}

async function execVerify(dossierDir) {
  // Trigger Verification Desk via Paperclip wakeup and poll for completion
  const run = await paperclipWakeup(VERIFICATION_AGENT_ID);
  const runId = run.id;
  log(`Verification run ${runId} queued, polling...`);

  const startMs = nowMs();
  const maxWaitMs = 10 * 60_000;
  while (nowMs() - startMs < maxWaitMs) {
    await new Promise(r => setTimeout(r, 5_000));
    try {
      const s = await paperclipRunStatus(runId);
      if (s.status === "succeeded") {
        const claimsResult = ensureClaimsCsv(dossierDir);
        if (claimsResult.created) {
          log(`[${path.basename(dossierDir)}] Backfilled claims.csv from DOSSIER claim table`);
        }
        const verifyResult = ensureVerifyMd(dossierDir, {
          runId,
          elapsedS: s.elapsedS,
          generatedAt: new Date().toISOString(),
        });
        if (verifyResult.created) {
          log(`[${path.basename(dossierDir)}] Backfilled verify.md after successful verification run`);
        }
        log(`Verification completed in ${s.elapsedS}s`);
        return;
      }
      if (s.status === "failed") {
        throw new Error(`Verification failed (exit ${s.exitCode}) after ${s.elapsedS}s`);
      }
    } catch (e) {
      if (!e.message.includes("Verification failed")) {
        log(`Verification poll error: ${e.message}`);
      } else {
        throw e;
      }
    }
  }
  throw new Error(`Verification timed out after ${maxWaitMs / 1000}s`);
}

async function execCloudVerify(dossierDir) {
  const model = chooseCloudModel("heavy");
  adjustCloudModelUsage(model, 1);
  try {
    await runProcess("node", [
      AGENT, "run", "--mode=verify",
      `--dossier-dir=${dossierDir}`,
      "--backend=litellm", `--model=${model}`,
      "--timeout-ms=300000",
    ], { timeoutMs: 7 * 60_000 });
  } finally {
    adjustCloudModelUsage(model, -1);
  }
}

async function execPublishPrep(dossierDir) {
  const model = chooseCloudModel("fast");
  adjustCloudModelUsage(model, 1);
  try {
    await runProcess("node", [
      AGENT, "run", "--mode=publish-prep",
      `--dossier-dir=${dossierDir}`,
      "--backend=litellm", `--model=${model}`,
      "--timeout-ms=300000",
    ], { timeoutMs: 7 * 60_000 });
  } finally {
    adjustCloudModelUsage(model, -1);
  }
}

const GEMINI_IMG_API = "https://generativelanguage.googleapis.com/v1beta/models";
const ARTICLES_IMG_DIR = "/opt/newsbites/public/images/articles";

// Fallback chain — tried in order until one succeeds.
// api: "imagen"       → /predict endpoint, returns predictions[].bytesBase64Encoded
// api: "gemini-native"→ /generateContent with responseModalities IMAGE, returns inlineData
// api: "cf"           → CF Workers AI /run endpoint, returns raw binary or JSON {result:{image}}
//                       cfBody(prompt) builds the request body (steps differ per model)
//                       CF models are last-resort: free but share a 10K neuron/day quota
const GEMINI_CHAIN = [
  { id: "imagen-4.0-ultra-generate-001",   api: "imagen",        label: "Imagen 4.0 Ultra"  },
  { id: "imagen-4.0-generate-001",         api: "imagen",        label: "Imagen 4.0"        },
  { id: "imagen-4.0-fast-generate-001",    api: "imagen",        label: "Imagen 4.0 Fast"   },
  { id: "gemini-3.1-flash-image-preview",  api: "gemini-native", label: "Gemini 3.1 Flash"  },
  { id: "gemini-2.5-flash-image",          api: "gemini-native", label: "Gemini 2.5 Flash"  },
];

// CF fallback for abstract/tech/concept verticals — Flux leads (stronger on non-human subjects)
const CF_CHAIN_ABSTRACT = [
  { id: "@cf/black-forest-labs/flux-1-schnell",         api: "cf", label: "CF Flux 1 Schnell",  cfBody: p => ({ prompt: p, num_steps: 4 }) },
  { id: "@cf/leonardo/lucid-origin",                    api: "cf", label: "CF Leonardo Lucid",  cfBody: p => ({ prompt: p }) },
  { id: "@cf/leonardo/phoenix-1.0",                     api: "cf", label: "CF Leonardo Phoenix", cfBody: p => ({ prompt: p }) },
  { id: "@cf/bytedance/stable-diffusion-xl-lightning",  api: "cf", label: "CF SDXL Lightning",  cfBody: p => ({ prompt: p }) },
  { id: "@cf/lykon/dreamshaper-8-lcm",                  api: "cf", label: "CF Dreamshaper LCM", cfBody: p => ({ prompt: p }) },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", api: "cf", label: "CF SDXL Base",       cfBody: p => ({ prompt: p }) },
];

// CF fallback for people-heavy verticals — Leonardo leads (stronger on faces/portraits)
const CF_CHAIN_PEOPLE = [
  { id: "@cf/leonardo/lucid-origin",                    api: "cf", label: "CF Leonardo Lucid",  cfBody: p => ({ prompt: p }) },
  { id: "@cf/leonardo/phoenix-1.0",                     api: "cf", label: "CF Leonardo Phoenix", cfBody: p => ({ prompt: p }) },
  { id: "@cf/black-forest-labs/flux-1-schnell",         api: "cf", label: "CF Flux 1 Schnell",  cfBody: p => ({ prompt: p, num_steps: 4 }) },
  { id: "@cf/bytedance/stable-diffusion-xl-lightning",  api: "cf", label: "CF SDXL Lightning",  cfBody: p => ({ prompt: p }) },
  { id: "@cf/lykon/dreamshaper-8-lcm",                  api: "cf", label: "CF Dreamshaper LCM", cfBody: p => ({ prompt: p }) },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", api: "cf", label: "CF SDXL Base",       cfBody: p => ({ prompt: p }) },
];

const PEOPLE_VERTICALS = new Set(["global-politics", "sports", "culture", "wellness", "healthcare"]);

function imageChainFor(vertical) {
  return [...GEMINI_CHAIN, ...(PEOPLE_VERTICALS.has(vertical) ? CF_CHAIN_PEOPLE : CF_CHAIN_ABSTRACT)];
}

const VERTICAL_STYLE = {
  ai:                "editorial technology photograph, glowing blue circuitry and digital interfaces, photorealistic",
  finance:           "editorial finance photograph, city financial district at dusk, stock market data, photorealistic",
  science:           "editorial science photograph, dramatic laboratory or natural environment, photorealistic",
  "global-politics": "editorial news photograph, governmental architecture or diplomatic summit, photorealistic",
  wellness:          "editorial health and wellness photograph, clean bright environment, natural light, photorealistic",
  culture:           "editorial culture and society photograph, vibrant human interest scene, photorealistic",
  trends:            "editorial lifestyle photograph, contemporary urban environment, photorealistic",
  climate:           "editorial environmental photograph, dramatic natural landscape or renewable energy, photorealistic",
  crypto:            "editorial fintech photograph, abstract digital currency visualization, dramatic blue lighting, photorealistic",
  cybersecurity:     "editorial cybersecurity photograph, abstract dark digital network with glowing nodes, photorealistic",
  economy:           "editorial economics photograph, bustling city commerce or industrial scene, photorealistic",
  healthcare:        "editorial healthcare photograph, modern hospital or medical research setting, photorealistic",
  energy:            "editorial energy photograph, power plant or renewable energy infrastructure, photorealistic",
  sports:            "editorial football (soccer) match photograph, players on the pitch competing for the ball, packed stadium, dramatic floodlit moment, photorealistic",
};

function buildImagePrompt(title, vertical, lead, tags) {
  const style = VERTICAL_STYLE[vertical] || "professional editorial news photograph, photorealistic";
  const context = lead ? lead.slice(0, 120) : title;
  const tagStr = tags.slice(0, 3).filter(Boolean).join(", ");
  const suffix = tagStr ? `, ${tagStr}` : "";
  return `${style}: ${context}${suffix}, dramatic cinematic lighting, Reuters/AP style news photography, 16:9`;
}

// Returns true when the error is a content/safety filter, false for infra failures.
// Content-filtered prompts need a softer prompt; infra failures need a different model.
function isContentPolicyError(errMsg) {
  return /safety|content|policy|filter|block|violat|inappropriate|harm/i.test(errMsg) ||
    errMsg.includes("No image in");
}

async function callImageModel(model, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  if (model.api === "imagen") {
    const res = await fetch(
      `${GEMINI_IMG_API}/${model.id}:predict?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const body = await res.json();
    const b64 = body?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error(`No image in ${model.label} response: ${JSON.stringify(body).slice(0, 120)}`);
    return { buf: Buffer.from(b64, "base64"), ext: "png" };
  }

  if (model.api === "cf") {
    const cfToken     = process.env.CLOUDFLARE_API_TOKEN;
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!cfToken || !cfAccountId) throw new Error("CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set");
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${model.id}`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(model.cfBody(prompt)),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!cfRes.ok) {
      const txt = await cfRes.text().catch(() => "");
      throw new Error(`HTTP ${cfRes.status}: ${txt.slice(0, 200)}`);
    }
    const ct = cfRes.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await cfRes.json();
      const b64 = body?.result?.image || body?.image;
      if (!b64) throw new Error(`No image in CF JSON response: ${JSON.stringify(body).slice(0, 120)}`);
      return { buf: Buffer.from(b64, "base64"), ext: "png" };
    }
    // Raw binary response
    const buf = Buffer.from(await cfRes.arrayBuffer());
    if (buf.length < 1000) throw new Error(`CF response too small (${buf.length}B) — likely an error`);
    const ext = ct.includes("jpeg") ? "jpg" : "png";
    return { buf, ext };
  }

  // gemini-native
  const res = await fetch(
    `${GEMINI_IMG_API}/${model.id}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = await res.json();
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) throw new Error(`No image in ${model.label} response: ${JSON.stringify(body).slice(0, 120)}`);
  const mime = imgPart.inlineData.mimeType || "image/png";
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
  return { buf: Buffer.from(imgPart.inlineData.data, "base64"), ext };
}

// ── Stock photo fallback ──────────────────────────────────────────────────────

const VERTICAL_STOCK_TERMS = {
  ai:                "technology digital abstract innovation",
  finance:           "business finance economy market",
  "global-politics": "world politics government diplomacy",
  science:           "science research discovery nature",
  wellness:          "health wellness lifestyle calm",
  culture:           "culture arts society entertainment",
  trends:            "modern urban lifestyle contemporary",
  climate:           "environment nature landscape green",
  crypto:            "digital technology finance blockchain",
  cybersecurity:     "technology security digital network",
  economy:           "business economy commerce industry",
  healthcare:        "healthcare medicine hospital wellbeing",
  energy:            "energy power infrastructure renewable",
  sports:            "soccer football match players pitch stadium",
};

const STOCK_QUERY_STOP_WORDS = new Set([
  "about", "after", "again", "against", "ahead", "also", "among", "another",
  "around", "asked", "because", "become", "before", "being", "between",
  "beyond", "could", "during", "every", "first", "following", "found",
  "great", "have", "having", "here", "however", "inside", "into", "later",
  "local", "major", "makes", "month", "more", "most", "never", "news",
  "next", "often", "only", "other", "over", "part", "people", "recent",
  "report", "right", "says", "second", "since", "should", "some", "still",
  "such", "takes", "than", "that", "their", "them", "then", "there",
  "these", "they", "this", "through", "today", "under", "until", "using",
  "very", "want", "what", "when", "where", "which", "while", "will",
  "with", "within", "without", "would", "years", "your",
]);

function buildStockQuery(vertical, tags, title = "") {
  const base = VERTICAL_STOCK_TERMS[vertical] || "world news current events";
  // Extract meaningful lowercase words from the article title (improves per-article specificity)
  const titleWords = title.toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 5 && !STOCK_QUERY_STOP_WORDS.has(w))
    .slice(0, 3);
  // Lowercase/generic tags only — skip proper nouns and very short terms
  const safeTags = tags.filter(t => t.length > 4 && !/^[A-Z][a-z]/.test(t) && !/^\d/.test(t)).slice(0, 2);
  return [...new Set([base, ...titleWords, ...safeTags])].slice(0, 6).join(" ");
}

async function fetchStockPhotoFromPexels(query, key, usedIds = new Set()) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const body = await res.json();
  const photos = body.photos || [];
  if (!photos.length) throw new Error("No Pexels results");
  // Pick the first photo not already used on another article; fall back to first if all used
  const photo = photos.find(p => !usedIds.has(p.id)) || photos[0];
  const imgUrl = photo.src?.landscape || photo.src?.large2x || photo.src?.large;
  if (!imgUrl) throw new Error("No suitable Pexels image URL");
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Pexels image download HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return {
    buf,
    ext: "jpg",
    photoId: photo.id,
    attribution: {
      type: "stock",
      provider: "pexels",
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      sourceUrl: photo.url,
    },
  };
}

async function fetchStockPhotoFromPixabay(query, key, usedIds = new Set()) {
  const url = `https://pixabay.com/api/?q=${encodeURIComponent(query)}&key=${key}&image_type=photo&orientation=horizontal&per_page=15&safesearch=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const body = await res.json();
  const hits = body.hits || [];
  if (!hits.length) throw new Error("No Pixabay results");
  const hit = hits.find(h => !usedIds.has(h.id)) || hits[0];
  const imgUrl = hit.largeImageURL || hit.webformatURL;
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Pixabay image download HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return {
    buf,
    ext: imgUrl.includes(".jpg") ? "jpg" : "png",
    photoId: hit.id,
    attribution: {
      type: "stock",
      provider: "pixabay",
      photographer: hit.user,
      photographerUrl: `https://pixabay.com/users/${hit.user}-${hit.user_id}/`,
      sourceUrl: hit.pageURL,
    },
  };
}

async function fetchStockPhoto(slug, vertical, tags, title = "") {
  const query = buildStockQuery(vertical, tags, title);
  const pexelsKey = process.env.PEXELS_API_KEY;
  const pixabayKey = process.env.PIXABAY_API_KEY;

  if (!pexelsKey && !pixabayKey) {
    log(`[${slug}] No PEXELS_API_KEY or PIXABAY_API_KEY set — stock photo fallback unavailable`);
    return null;
  }

  if (!state.usedStockPhotoIds) state.usedStockPhotoIds = { pexels: [], pixabay: [] };
  const usedPexels  = new Set(state.usedStockPhotoIds.pexels  || []);
  const usedPixabay = new Set(state.usedStockPhotoIds.pixabay || []);

  log(`[${slug}] Stock query: "${query}" (${usedPexels.size} Pexels IDs already used)`);

  if (pexelsKey) {
    try {
      const result = await fetchStockPhotoFromPexels(query, pexelsKey, usedPexels);
      log(`[${slug}] ✅ Stock photo from Pexels — photo #${result.photoId} (${result.attribution.photographer})`);
      // Register as used so no future article gets this photo
      if (result.photoId && !state.usedStockPhotoIds.pexels.includes(result.photoId)) {
        state.usedStockPhotoIds.pexels.push(result.photoId);
      }
      return result;
    } catch (e) {
      log(`[${slug}] Pexels failed: ${e.message}`);
    }
  }

  if (pixabayKey) {
    try {
      const result = await fetchStockPhotoFromPixabay(query, pixabayKey, usedPixabay);
      log(`[${slug}] ✅ Stock photo from Pixabay — photo #${result.photoId} (${result.attribution.photographer})`);
      if (result.photoId && !state.usedStockPhotoIds.pixabay.includes(result.photoId)) {
        state.usedStockPhotoIds.pixabay.push(result.photoId);
      }
      return result;
    } catch (e) {
      log(`[${slug}] Pixabay failed: ${e.message}`);
    }
  }

  return null;
}

// Writes or replaces a single-line frontmatter field in YAML content.
// Inserts after coverImage if the field doesn't already exist.
function patchFrontmatterField(content, field, value) {
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const re = new RegExp(`^${field}:.*$`, "m");
  if (re.test(content)) return content.replace(re, `${field}: '${escaped}'`);
  return content.replace(/^(coverImage:.*)$/m, `$1\n${field}: '${escaped}'`);
}

const GEMINI_VISION_MODEL = "gemini-2.0-flash";
const GEMINI_CONTENT_API  = "https://generativelanguage.googleapis.com/v1beta/models";

// Returns { pass: boolean, reason: string }.  Fails open on API errors.
async function verifyImageRelevance(buf, ext, title, lead) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { pass: true, reason: "no GEMINI_API_KEY" };

  const b64  = buf.toString("base64");
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const context = lead ? ` (context: ${lead.slice(0, 100)})` : "";
  const prompt =
    `You are a news photo editor. Does this image work as a cover photo for a news article ` +
    `titled "${title.slice(0, 120)}"${context}? ` +
    `Reply with PASS if appropriate, or FAIL followed by one sentence reason.`;

  try {
    const res = await fetch(
      `${GEMINI_CONTENT_API}/${GEMINI_VISION_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mime, data: b64 } },
            { text: prompt },
          ]}],
          generationConfig: { maxOutputTokens: 80, temperature: 0 },
        }),
        signal: AbortSignal.timeout(25_000),
      }
    );
    if (!res.ok) return { pass: true, reason: `vision API ${res.status} — failing open` };
    const body = await res.json();
    const text = (body?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const pass = /^PASS/i.test(text);
    return { pass, reason: text.slice(0, 150) };
  } catch (e) {
    return { pass: true, reason: `vision check error: ${e.message.slice(0, 60)} — failing open` };
  }
}

async function execFetchImage(dossierDir) {
  const slug = path.basename(dossierDir);
  const publishPath = path.join(dossierDir, "publish.md");

  if (!fs.existsSync(publishPath)) throw new Error("publish.md not found");
  const publishContent = fs.readFileSync(publishPath, "utf8");

  const fmMatch = publishContent.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error("No frontmatter in publish.md");
  const fm = fmMatch[1];

  const title    = (fm.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1]?.trim() || slug;
  const vertical = (fm.match(/^vertical:\s*["']?(\S+?)["']?\s*$/m) || [])[1]?.trim() || "ai";
  const lead     = (fm.match(/^lead:\s*["']?(.+?)["']?\s*$/m) || [])[1]?.trim() || "";
  const tags     = [...fm.matchAll(/^  - (.+)$/gm)].map(m => m[1].trim());

  const richPrompt    = buildImagePrompt(title, vertical, lead, tags);
  const genericPrompt = buildImagePrompt(title, vertical, "", []);

  const chain = imageChainFor(vertical);
  const googleSkipped = googleImgInCooldown();
  const cfSkipped     = cfImgInCooldown();
  const skippedMsg = [googleSkipped && "Google (quota cooldown)", cfSkipped && "CF (quota cooldown)"].filter(Boolean).join(", ");
  log(`[${slug}] fetch-image starting — ${chain.length} models in chain (vertical: ${vertical}, CF order: ${PEOPLE_VERTICALS.has(vertical) ? "people" : "abstract"}${skippedMsg ? `, skipping: ${skippedMsg}` : ""})`);

  let lastError = null;
  let cfQuotaExhausted = cfSkipped;     // honour global cooldown from previous runs
  let googleQuotaExhausted = googleSkipped;

  for (const model of chain) {
    const isGoogle = model.api === "imagen" || model.api === "gemini-native";
    const isCf     = model.api === "cf";

    if (isCf && cfQuotaExhausted) {
      log(`[${slug}] Skipping ${model.label} — CF quota exhausted`);
      continue;
    }
    if (isGoogle && googleQuotaExhausted) {
      log(`[${slug}] Skipping ${model.label} — Google quota exhausted`);
      continue;
    }

    // Try rich prompt first, then fall back to generic if content policy blocks it
    for (const [attempt, prompt] of [[1, richPrompt], [2, genericPrompt]]) {
      try {
        log(`[${slug}] Trying ${model.label} (attempt ${attempt})…`);
        const { buf, ext } = await callImageModel(model, prompt);

        // AI relevance gate — verify the generated image actually matches this article
        const relevance = await verifyImageRelevance(buf, ext, title, lead);
        if (!relevance.pass) {
          log(`[${slug}] ⚠ ${model.label} relevance FAIL: ${relevance.reason}`);
          lastError = new Error(`relevance-fail: ${relevance.reason}`);
          // Treat like a content-policy error: try the generic prompt next, then move on
          if (attempt === 1) continue;
          break;
        }
        log(`[${slug}] ✔ Relevance OK: ${relevance.reason}`);

        fs.mkdirSync(ARTICLES_IMG_DIR, { recursive: true });
        const imgPath = path.join(ARTICLES_IMG_DIR, `${slug}.${ext}`);
        fs.writeFileSync(imgPath, buf);
        log(`[${slug}] ✅ ${model.label} → ${(buf.length / 1024).toFixed(0)}KB .${ext}`);

        const coverImageValue = `/images/articles/${slug}.${ext}`;
        const sourceJson = JSON.stringify({ type: "ai", provider: model.id, label: model.label });
        let patched = publishContent.replace(/^coverImage:.*$/m, `coverImage: "${coverImageValue}"`);
        patched = patchFrontmatterField(patched, "imageSource", sourceJson);
        fs.writeFileSync(publishPath, patched, "utf8");
        log(`[${slug}] coverImage set to ${coverImageValue} (source: ${model.label})`);
        return; // done
      } catch (e) {
        const isPolicy = isContentPolicyError(e.message);
        log(`[${slug}] ❌ ${model.label} attempt ${attempt}: ${e.message.slice(0, 100)} (${isPolicy ? "content-policy" : "infra"})`);
        lastError = e;
        if (isCf && isCfImgQuotaError(e.message)) cfQuotaExhausted = true;
        if (isGoogle && isGoogleImgQuotaError(e.message)) googleQuotaExhausted = true;
        if (!isPolicy) break;
        if (attempt === 2) break;
      }
    }
  }

  // Update global quota state so the next story skips dead providers immediately
  if (googleQuotaExhausted && !googleSkipped) {
    state.googleImgQuotaExhaustedAt = Date.now();
    log(`[${slug}] Google image quota exhausted — setting 24h cooldown`);
  }
  if (cfQuotaExhausted && !cfSkipped) {
    state.cfImgQuotaExhaustedAt = Date.now();
    log(`[${slug}] CF image quota exhausted — setting 23h cooldown`);
  }

  // ── Stock photo last resort ────────────────────────────────────────────────
  const stockResult = await fetchStockPhoto(slug, vertical, tags, title);
  if (stockResult) {
    fs.mkdirSync(ARTICLES_IMG_DIR, { recursive: true });
    const imgPath = path.join(ARTICLES_IMG_DIR, `${slug}.${stockResult.ext}`);
    fs.writeFileSync(imgPath, stockResult.buf);
    const coverImageValue = `/images/articles/${slug}.${stockResult.ext}`;

    // Soft relevance check for stock photos (last resort — log warning but don't block)
    const stockRelevance = await verifyImageRelevance(stockResult.buf, stockResult.ext, title, lead);
    if (!stockRelevance.pass) {
      log(`[${slug}] ⚠ Stock photo relevance WARNING (accepting anyway): ${stockRelevance.reason}`);
    }

    const sourceJson = JSON.stringify(stockResult.attribution);
    let patched = publishContent.replace(/^coverImage:.*$/m, `coverImage: "${coverImageValue}"`);
    patched = patchFrontmatterField(patched, "imageSource", sourceJson);
    fs.writeFileSync(publishPath, patched, "utf8");
    saveState(); // persist the usedStockPhotoIds update
    log(`[${slug}] coverImage set to ${coverImageValue} (stock: ${stockResult.attribution.provider})`);
    return;
  }

  // All AI + stock exhausted — set global pause so the queue doesn't spin
  if (googleQuotaExhausted && cfQuotaExhausted) {
    const until = nextMidnightUTC();
    state.fetchImagePausedUntil = until;
    log(`[${slug}] All image providers exhausted — pausing fetch-image until ${new Date(until).toISOString()}`);
    sendTelegram(
      `⏳ <b>Image gen paused (all providers exhausted)</b>\n` +
      `Google: monthly cap hit. CF: daily neurons gone. Stock: no API keys.\n` +
      `Auto-resume at midnight UTC (${new Date(until).toUTCString()}).\n` +
      `Add PEXELS_API_KEY or PIXABAY_API_KEY to /etc/default/newsbites-autopipeline to enable stock photo fallback.`
    ).catch(() => {});
  }
  saveState();

  throw new Error(`fetch-image: all ${chain.length} AI models + stock photo exhausted. Last error: ${lastError?.message?.slice(0, 200)}`);
}

function execAutoGate(dossierDir) {
  // Deterministic checks — no GPU needed
  const publishMd = path.join(dossierDir, "publish.md");
  const sourcesJson = path.join(dossierDir, "sources.json");
  const verifyMd = path.join(dossierDir, "verify.md");

  if (!fs.existsSync(publishMd)) return { pass: false, reason: "missing publish.md" };
  if (!fs.existsSync(sourcesJson)) return { pass: false, reason: "missing sources.json" };
  if (!fs.existsSync(verifyMd)) return { pass: false, reason: "missing verify.md" };

  const publishText = fs.readFileSync(publishMd, "utf8");
  const sources = JSON.parse(fs.readFileSync(sourcesJson, "utf8"));

  // Check source count — research prompt minimum is 1 primary source
  if (!Array.isArray(sources) || sources.length < 1) {
    return { pass: false, reason: `no sources found` };
  }

  // Check for TODO/TBD markers
  if (/\b(TODO|TBD|REPLACE.?ME|PLACEHOLDER)\b/i.test(publishText)) {
    return { pass: false, reason: "contains TODO/TBD/REPLACE_ME markers" };
  }

  // Parse frontmatter for vertical
  const fmMatch = publishText.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { pass: false, reason: "no frontmatter" };
  const fm = fmMatch[1];
  const verticalMatch = fm.match(/vertical:\s*["']?(\S+?)["']?\s*$/m);
  const vertical = verticalMatch ? verticalMatch[1] : "";

  const allVerticals = AUTO_PUBLISH_VERTICALS.length === 1 && AUTO_PUBLISH_VERTICALS[0] === "*";
  if (!AUTO_PUBLISH || (!allVerticals && !AUTO_PUBLISH_VERTICALS.includes(vertical))) {
    return { pass: false, reason: `vertical "${vertical}" requires manual approval` };
  }

  return { pass: true, reason: "all gates passed" };
}

async function execPublish(dossierDir, autoApproved) {
  const status = autoApproved ? "published" : "approved";
  await runProcess("node", [PUBLISH_DOSSIER, dossierDir, `--status=${status}`], { cwd: "/opt/newsbites" });
  refreshPublishedCache(); // bust stale cache so next scout deduplicates correctly
}

async function execDeploy() {
  await runProcess("bash", [DEPLOY_SCRIPT], { cwd: "/opt/newsbites", timeoutMs: 5 * 60_000 });
}

async function execNotify(item) {
  const slug = item.slug || path.basename(item.dossierDir || "unknown");
  const url = `https://news.techinsiderbytes.com/articles/${slug}`;
  const dur = Math.round((nowMs() - item.startedAt) / 1000);
  const msg = `<b>Article published</b> <code>${slug}</code>\nTime: ${dur}s | <a href="${url}">Read</a>`;
  await sendTelegram(msg);
}

// ── Main stage dispatcher ────────────────────────────────────────────────────

async function runStage(item) {
  const stage = item.stage;
  log(`[${item.slug || "?"}] Stage: ${stage}`);

  switch (stage) {
    case "scout": {
      const runDir = await execScout();
      item.runDir = runDir;
      break;
    }
    case "rank":
      await execRank(item.runDir);
      await filterCandidatesForDuplicates(item.runDir);
      break;
    case "init": {
      const payload = readDedupedPayload(item.runDir);
      if (!payload?.items || payload.items.length === 0) {
        log(`[dedup] No valid candidates after deduplication, skipping story`);
        return "EMPTY";
      }

      if (!item.dossierDir && item.runDir) {
        return await spawnStoriesFromScout(item, payload);
      }

      const dossierDir = await execInit(item.runDir, { rank: item.rank || 1 });
      item.dossierDir = dossierDir;
      item.slug = path.basename(dossierDir);
      break;
    }
    case "research": {
      await execResearch(item.dossierDir);
      await recordModelQualityOutcome(item, "research", true);
      // Check if research model killed the story — honor immediately, no retries
      const agentRunsDir = path.join(item.dossierDir, "agent_runs");
      if (fs.existsSync(agentRunsDir)) {
        const agentRunDir = fs.readdirSync(agentRunsDir)
          .filter(d => d.includes("research"))
          .sort()
          .pop();
        if (agentRunDir) {
          const respPath = path.join(agentRunsDir, agentRunDir, "response.json");
          if (fs.existsSync(respPath)) {
            const resp = JSON.parse(fs.readFileSync(respPath, "utf8"));
            if (resp.kill === true) {
              const reason = resp.killReason || "insufficient sources";
              log(`[${item.slug}] Story killed by research: ${reason}`);
              sendTelegram(`<b>Story killed</b> <code>${item.slug}</code>\nResearch verdict: ${String(reason).slice(0, 200)}`).catch(() => {});
              // Return sentinel so the caller skips the normal advance/complete path
              return "KILLED";
            }
          }
        }
      }
      break;
    }
    case "validate-research":
      await execValidate(item.dossierDir);
      break;
    case "write":
      await execWrite(item.dossierDir);
      await recordModelQualityOutcome(item, "write", true);
      break;
    case "validate-write":
      await execValidate(item.dossierDir);
      break;
    case "verify":
      if (gpuHealthy()) {
        await execVerify(item.dossierDir);
      } else {
        log(`[${item.slug}] GPU down — using cloud verify fallback`);
        await execCloudVerify(item.dossierDir);
      }
      break;
    case "publish-prep":
      await execPublishPrep(item.dossierDir);
      await recordModelQualityOutcome(item, "publish-prep", true);
      break;
    case "fetch-image":
      await execFetchImage(item.dossierDir);
      break;
    case "auto-gate": {
      const gate = execAutoGate(item.dossierDir);
      item.autoApproved = gate.pass;
      item.gateReason = gate.reason;
      log(`[${item.slug}] Auto-gate: ${gate.pass ? "PASS" : "FAIL"} — ${gate.reason}`);
      if (!gate.pass) {
        await sendTelegram(
          `<b>Approval needed</b> for <code>${item.slug}</code>\n` +
          `Reason: ${gate.reason}`,
          [[
            { text: "\u2705 Publish", callback_data: `pipeline_publish_${item.id}` },
            { text: "\u274c Kill", callback_data: `pipeline_kill_${item.id}` },
          ]]
        );
        // Park the story — don't advance until manual approval
        item.waitingApproval = true;
      }
      break;
    }
    case "publish":
      if (item.waitingApproval && !item.manuallyApproved) {
        log(`[${item.slug}] Waiting for manual approval, skipping publish`);
        return false; // signal: do not advance
      }
      await execPublish(item.dossierDir, item.autoApproved);
      // Non-blocking finance enricher — fire-and-forget after article lands on disk
      if (new Set(["finance","economy","ai","crypto","trends","global-politics","science","energy","healthcare","cybersecurity"]).has(String(item.vertical || "").toLowerCase())) {
        log(`[${item.slug}] Triggering finance enricher (non-blocking)`);
        const articlePath = path.join("/opt/newsbites/content/articles", `${item.slug}.md`);
        const enrichChild = spawn("node", ["/opt/newsbites/scripts/finance-enricher.mjs", articlePath], {
          env: { ...process.env, LITELLM_URL: "http://localhost:4000", FINANCE_ENRICHER_MODEL: "editorial-fast" },
          detached: true, stdio: "ignore",
        });
        enrichChild.unref();
      }
      break;
    case "deploy":
      await execDeploy();
      break;
    case "notify":
      await execNotify(item);
      break;
  }

  return true; // stage completed, advance
}

// ── Manual dossier creation (topic injection bypassing scout) ────────────────

function createManualDossier(topic, vertical = "ai", slugOverride = "") {
  const dateStr = today();
  const slug = slugOverride ||
    topic.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80)
      .replace(/-+$/, "");

  const dossierDir = path.join(DOSSIERS_ROOT, dateStr, slug);
  fs.mkdirSync(dossierDir, { recursive: true });

  const EDITORIAL_ROOT_LOCAL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const playbook = path.join(EDITORIAL_ROOT_LOCAL, "SMALL_MODEL_NEWS_DESK_PLAYBOOK.md");
  const promptsRoot = path.join(EDITORIAL_ROOT_LOCAL, "prompts/small-model");

  const dossierMd = `# Story Dossier

## Story Identity
- Slug: ${slug}
- Working headline: ${topic}
- Vertical: ${vertical}
- Story owner: small-model desk
- Created: ${new Date().toISOString()}
- Last updated: ${new Date().toISOString()}
- Status:
  - researching

## Editorial Brief (Manual Lead)
${topic}

## Why This Story Matters
- Public importance: To be determined through research
- News value: Manual editorial assignment
- Why now: ${dateStr}
- Why NewsBites should cover it: Assigned by editor

## Core Angle
- One-sentence framing: TODO — complete after research
- What the story is not: TODO

## Claim Table
| Claim | Source(s) | Evidence quality | Confidence | Notes |
|---|---|---|---|---|
| (to be populated by research) | | | | |

## Primary Sources
- URL:
  - Type: to be researched
  - Publisher:
  - Date: ${dateStr}
  - Notes: Manual editorial assignment — research the topic above and find primary sources.

## Drafting Notes
- (to be filled during research and write stages)

## Research Notes
- (empty — to be filled by research stage)
`;

  const taskMd = `# Story Task

Main instruction file:
- \`${playbook}\`

Mode prompt files:
- research: \`${path.join(promptsRoot, "research.md")}\`
- write: \`${path.join(promptsRoot, "write.md")}\`
- publish prep: \`${path.join(promptsRoot, "publish-prep.md")}\`

Story:
- title: ${topic}
- slug: ${slug}
- vertical: ${vertical}
- story date: ${dateStr}
- dossier path: ${dossierDir}

Editorial brief:
${topic}

Files to complete:
- \`DOSSIER.md\`
- \`sources.json\`
- \`draft.md\`
- \`publish.md\`

Article shape to preserve:
1. opening paragraph
2. \`## What happened\`
3. one explanatory middle section
4. \`## Why it matters\`

Digest rule:
- one sentence
- 16-28 words
- user-facing nutshell, not article prose
`;

  const sourcesJson = [];

  // Stub publish.md — passes validate-research; write stage overwrites with real content.
  const publishMd = `---
title: "TODO"
slug: ${slug}
date: "${dateStr}"
vertical: ${vertical}
tags:
  - "${vertical}"
status: draft
lead: "TODO - one factual sentence after research is complete."
digest: "TODO - one sentence, 16-28 words, user-facing nutshell."
coverImage: ""
author: "NewsBites Desk"
---

## What happened

TODO

## Why it matters

TODO
`;

  // Stub draft.md — write stage requires this as input; it will overwrite with the real article.
  const draftMd = `---
title: "TODO"
slug: ${slug}
date: "${dateStr}"
vertical: ${vertical}
tags:
  - "${vertical}"
status: draft
lead: "TODO"
digest: "TODO"
coverImage: ""
author: "NewsBites Desk"
---

## What happened

TODO

## Background

TODO

## Why it matters

TODO
`;

  fs.writeFileSync(path.join(dossierDir, "DOSSIER.md"), dossierMd);
  fs.writeFileSync(path.join(dossierDir, "TASK.md"), taskMd);
  fs.writeFileSync(path.join(dossierDir, "sources.json"), JSON.stringify(sourcesJson, null, 2));
  fs.writeFileSync(path.join(dossierDir, "publish.md"), publishMd);
  fs.writeFileSync(path.join(dossierDir, "draft.md"), draftMd);

  log(`[manual-dossier] Created ${dossierDir}`);
  return dossierDir;
}

// ── Queue management ─────────────────────────────────────────────────────────

function enqueue(item) {
  item.id = item.id || `story-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  item.priority = item.priority ?? 2;
  item.stage = item.stage || "scout";
  item.createdAt = item.createdAt || nowMs();
  item.startedAt = null;
  item.retries = 0;
  item.doctorAttempts = Number(item.doctorAttempts || 0);

  // Deduplicate: skip if same slug+stage already queued (prevents doctor/fanout stampedes)
  const slug = item.slug || (item.dossierDir ? path.basename(item.dossierDir) : null);
  if (slug && item.stage !== "scout") {
    const existing = state.queue.find(q => q.slug === slug && q.stage === item.stage);
    if (existing) {
      log(`Dedup: skipped ${item.stage} for ${slug} (already queued as ${existing.id})`);
      return;
    }
  }

  state.queue.push(item);
  state.queue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  saveState();
  log(`Enqueued ${item.id} (priority=${item.priority}, stage=${item.stage})`);
}

function advanceStage(item) {
  const idx = STAGES.indexOf(item.stage);
  if (idx < 0 || idx >= STAGES.length - 1) {
    return null; // done
  }
  item.stage = STAGES[idx + 1];
  return item.stage;
}

// ── Main loop ────────────────────────────────────────────────────────────────

const APPROVAL_REPING_MS = 10 * 60 * 1000; // re-notify after 10 min silence

function finishItem(item) {
  const idx = state.queue.indexOf(item);
  if (idx !== -1) state.queue.splice(idx, 1);
  item.completedAt = nowMs();
  state.completed.unshift(item);
  if (state.completed.length > 50) state.completed.length = 50;
  state.stats.storiesCompleted++;
  state.stats.totalDurationMs += (item.completedAt - item.startedAt);
  saveState();
}

function failItem(item, err) {
  item.retries = (item.retries || 0) + 1;
  item.lastError = err.message;
  log(`[${item.slug || "?"}] Stage ${item.stage} FAILED: ${err.message}`);
  if (item.retries >= 2) {
    log(`[${item.slug}] Giving up after ${item.retries} retries`);
    const idx = state.queue.indexOf(item);
    if (idx !== -1) state.queue.splice(idx, 1);
    item.failedAt = nowMs();
    item.status = "stuck";
    state.completed.unshift(item);
    if (state.completed.length > 50) state.completed.length = 50;
    state.stats.storiesFailed++;
    saveState();
    const runResult = readLatestStageRunResult(item.dossierDir, item.stage);
    const errorBucket = runResult?.errorType || classifyFailureBucket(err.message);
    const failedModel = runResult?.resolvedModel || runResult?.requestedModel || "";
    const alertKey = `pipeline-failed:${item.slug || "unknown"}:${item.stage}:${errorBucket}`;
    if (shouldSendAlert(alertKey)) {
      sendTelegram(
        `<b>Pipeline failed</b> <code>${item.slug || "unknown"}</code>\n` +
        `Stage: ${item.stage}\n` +
        `${failedModel ? `Model: ${failedModel}\n` : ""}` +
        `Error: ${err.message.slice(0, 200)}`
      ).catch(() => {});
    } else {
      log(`[alert] Suppressed duplicate failure notification for ${item.slug || "unknown"} (${errorBucket})`);
    }
    if (DOCTOR_AUTO_REPAIR_STAGES.has(item.stage)) {
      setImmediate(() => {
        dispatchDoctorForItem(item, { source: "giveup" }).catch((doctorErr) => {
          log(`[doctor] ${item.slug || "unknown"} dispatch failed: ${doctorErr.message}`);
        });
      });
    }
  }
}

async function runCloudStage(item) {
  cloudSlots++;
  item.running = true;
  saveState();
  try {
    const advanced = await runStage(item);
    if (advanced === false || advanced === "KILLED") {
      item.running = false;
      cloudSlots--;
      if (advanced === "KILLED") {
        const idx = state.queue.indexOf(item);
        if (idx !== -1) state.queue.splice(idx, 1);
        item.status = "killed";
        item.failedAt = nowMs();
        state.completed.unshift(item);
        if (state.completed.length > 50) state.completed.length = 50;
        // killed = editorial decision, not a technical failure — don't increment storiesFailed
      }
      saveState();
      return;
    }
    const nextStage = advanceStage(item);
    if (!nextStage) {
      item.running = false;
      cloudSlots--;
      finishItem(item);
      log(`[${item.slug}] Pipeline complete!`);
    } else {
      item.running = false;
      cloudSlots--;
      saveState();
    }
  } catch (err) {
    item.running = false;
    cloudSlots--;
    const runResult = readLatestStageRunResult(item.dossierDir, item.stage);
    const failedModel = runResult?.resolvedModel || runResult?.requestedModel || null;
    const errorType = runResult?.errorType || classifyFailureBucket(err.message);
    if (failedModel && errorType === "capacity_rate_limit") {
      const retryAfterMs = parseRetryAfterMs(runResult?.errorMessage || err.message) || MODEL_COOLDOWN_FLOOR_MS;
      setModelCooldown(failedModel, retryAfterMs + 30_000, "rate limit");
    }
    await recordModelQualityOutcome(item, item.stage, false);
    const retryBefore = item.retries || 0;
    failItem(item, err);
    const retryAfter = item.retries || 0;
    // Back off before retrying cloud stages — immediate retry after fetch/timeout errors is pointless
    const backoffMs = retryAfter > retryBefore ? Math.min(30_000 * retryAfter, 120_000) : 0;
    if (backoffMs > 0) {
      log(`[${item.slug || "?"}] Cloud stage retry in ${backoffMs / 1000}s`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
  // Trigger next processing cycle so non-cloud stages can pick up immediately
  setImmediate(() => processQueue().catch(() => {}));
}

// Deploy runs with its own mutex so it doesn't block the GPU sequential path (verify)
async function runDeployStage(item) {
  deployBusy = true;
  item.running = true;
  saveState();
  try {
    if (nowMs() - lastDeploySuccessAt < DEPLOY_THROTTLE_MS) {
      log(`[${item.slug}] Deploy throttled — site rebuilt ${Math.round((nowMs()-lastDeploySuccessAt)/1000)}s ago, skipping`);
    } else {
      await runStage(item); // execDeploy (~3 min build)
      lastDeploySuccessAt = nowMs();
    }
    item.running = false;
    deployBusy = false;
    const nextStage = advanceStage(item);
    if (!nextStage) {
      log(`[${item.slug}] Pipeline complete!`);
      finishItem(item);
    } else {
      saveState();
    }
  } catch (err) {
    item.running = false;
    deployBusy = false;
    failItem(item, err);
  }
  setImmediate(() => processQueue().catch(() => {}));
}

async function processQueue() {
  if (shuttingDown || state.paused) return;
  if (state.queue.length === 0) return;

  // Find items that can run now — cloud stages run in parallel, GPU stages sequential
  for (let i = 0; i < state.queue.length; i++) {
    const item = state.queue[i];

    if (item.running) continue; // already in-flight

    // Re-ping approval items
    if (item.waitingApproval && !item.manuallyApproved) {
      const lastPing = item.lastApprovalPing || item.startedAt || 0;
      if (nowMs() - lastPing >= APPROVAL_REPING_MS) {
        item.lastApprovalPing = nowMs();
        log(`[${item.slug}] Re-pinging approval (waiting ${Math.round((nowMs() - (item.startedAt||0)) / 60000)}min)`);
        await sendTelegram(
          `<b>Still waiting for approval</b> — <code>${item.slug}</code>\n` +
          `Reason: ${item.gateReason || "manual review required"}`,
          [[
            { text: "\u2705 Publish", callback_data: `pipeline_publish_${item.id}` },
            { text: "\u274c Kill", callback_data: `pipeline_kill_${item.id}` },
          ]]
        );
        saveState();
      }
      continue;
    }

    if (CLOUD_STAGES.has(item.stage)) {
      // Cloud stage: parallel up to MAX_STORIES
      if (cloudSlots >= MAX_STORIES) continue;
      // fetch-image is gated when all providers are known-exhausted
      if (item.stage === "fetch-image" && state.fetchImagePausedUntil && Date.now() < state.fetchImagePausedUntil) {
        continue; // will retry once pause expires at midnight UTC
      }
      item.startedAt = item.startedAt || nowMs();
      // Fire and forget — do NOT await so the loop continues
      runCloudStage(item);
      // Continue loop to start more cloud stages if slots remain
      continue;
    }

    // Deploy stage: async, own mutex — does not block verify/GPU stages
    if (DEPLOY_STAGES.has(item.stage)) {
      if (deployBusy) continue;
      item.startedAt = item.startedAt || nowMs();
      runDeployStage(item);
      continue;
    }

    // GPU stage: sequential
    if (gpuBusy) continue;
    if (GPU_32B_STAGES.has(item.stage) && !gpuHealthy()) {
      log(`GPU not healthy, skipping 32B stage ${item.stage}`);
      continue;
    }

    state.current = item;
    item.startedAt = item.startedAt || nowMs();
    item.running = true;
    gpuBusy = true;
    saveState();

    try {
      const advanced = await runStage(item);
      if (advanced === false) {
        item.running = false;
        gpuBusy = false;
        state.current = null;
        saveState();
        return;
      }
      if (advanced === "SPAWNED" || advanced === "EMPTY") {
        item.running = false;
        if (advanced === "EMPTY") {
          item.status = "empty-scout";
          item.failedAt = nowMs();
          state.stats.storiesFailed++;
        }
        removeQueueItem(item);
        saveState();
        setImmediate(() => processQueue().catch(() => {}));
        return;
      }
      item.running = false;
      const nextStage = advanceStage(item);
      if (!nextStage) {
        log(`[${item.slug}] Pipeline complete!`);
        finishItem(item);
      }
    } catch (err) {
      item.running = false;
      failItem(item, err);
    } finally {
      gpuBusy = false;
      state.current = null;
      saveState();
    }

    // Trigger next cycle immediately after GPU stage completes
    setImmediate(() => processQueue().catch(() => {}));
    return; // one GPU stage per tick
  }
}

async function scoutTick() {
  if (state.paused || shuttingDown) return;
  if (nowMs() - state.lastScout < SCOUT_INTERVAL_MS) return;

  // Don't scout if we already have actively-processing stories in the queue.
  // Stories parked in waitingApproval don't count — they're frozen and won't
  // consume any processing resources until manually approved or killed.
  const activeStories = state.queue.filter(q => q.stage !== "scout" && !q.waitingApproval);
  if (activeStories.length >= MAX_STORIES) {
    log(`Queue has ${activeStories.length} active stories, skipping scout`);
    return;
  }

  log("Auto-scout triggered");
  enqueue({ type: "auto", priority: 2, stage: "scout" });
}

// ── Unix socket server (commands) ────────────────────────────────────────────

async function handleCommand(raw) {
  try {
    const msg = JSON.parse(raw);
    const cmd = msg.cmd || msg.command || "";

    switch (cmd) {
      case "queue":
        return {
          ok: true,
          queue: state.queue.map(q => ({
            id: q.id, slug: q.slug, stage: q.stage, priority: q.priority,
            waitingApproval: q.waitingApproval || false,
          })),
          current: state.current ? {
            id: state.current.id, slug: state.current.slug, stage: state.current.stage,
          } : null,
          paused: state.paused,
          pauseReason: state.pauseReason,
        };

      case "stats":
        return {
          ok: true,
          stats: state.stats,
          tuning: {
            scoutIntervalMs: SCOUT_INTERVAL_MS,
            scoutFanoutCount: SCOUT_FANOUT_COUNT,
            scoutBriefCount: SCOUT_BRIEF_COUNT,
            maxConcurrentStories: MAX_STORIES,
          },
          queueLength: state.queue.length,
          paused: state.paused,
          lastScout: state.lastScout ? new Date(state.lastScout).toISOString() : null,
          recentCompleted: state.completed.slice(0, 5).map(c => ({
            slug: c.slug, status: c.status || "completed",
            durationS: c.completedAt ? Math.round((c.completedAt - c.startedAt) / 1000) : null,
          })),
        };

      case "pause":
        state.paused = true;
        state.pauseReason = msg.reason || "user";
        saveState();
        return { ok: true, message: "Pipeline paused" };

      case "resume":
        state.paused = false;
        state.pauseReason = null;
        saveState();
        return { ok: true, message: "Pipeline resumed" };

      case "scout":
        enqueue({ type: "manual", priority: 1, stage: "scout" });
        return { ok: true, message: "Scout queued (priority 1)" };

      case "story": {
        const slug = msg.slug;
        const found = state.queue.find(q => q.slug === slug) ||
                      state.completed.find(c => c.slug === slug);
        if (!found) return { ok: false, error: `Story "${slug}" not found` };
        return { ok: true, story: found };
      }

      case "rush": {
        const item = state.queue.find(q => q.slug === msg.slug || q.id === msg.slug);
        if (!item) return { ok: false, error: `"${msg.slug}" not in queue` };
        item.priority = 0;
        state.queue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        saveState();
        return { ok: true, message: `"${msg.slug}" rushed to front` };
      }

      case "kill": {
        const idx = state.queue.findIndex(q => q.slug === msg.slug || q.id === msg.slug);
        if (idx < 0) return { ok: false, error: `"${msg.slug}" not in queue` };
        const removed = state.queue.splice(idx, 1)[0];
        saveState();
        return { ok: true, message: `Removed "${removed.slug || removed.id}"` };
      }

      case "publish": {
        const item = state.queue.find(q => (q.slug === msg.slug || q.id === msg.slug) && q.waitingApproval);
        if (!item) return { ok: false, error: `"${msg.slug}" not waiting for approval` };
        item.manuallyApproved = true;
        item.waitingApproval = false;
        saveState();
        return { ok: true, message: `"${item.slug}" approved for publish` };
      }

      case "doctor-scan": {
        return { ok: true, results: await doctorScanRecentStuckItems() };
      }

      case "doctor-dispatch": {
        const item = state.completed.find(q => q.slug === msg.slug && q.status === "stuck");
        if (!item) return { ok: false, error: `"${msg.slug}" not found in stuck stories` };
        return await dispatchDoctorForItem(item, { source: "manual" });
      }

      case "doctor-log": {
        const limit = Math.max(1, Math.min(100, Number(msg.limit || 20)));
        if (!fs.existsSync(DOCTOR_LOG_FILE)) return { ok: true, entries: [] };
        const lines = fs.readFileSync(DOCTOR_LOG_FILE, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .slice(-limit)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
        return { ok: true, entries: lines };
      }

      case "gpu": {
        let health = {};
        try { health = JSON.parse(fs.readFileSync(GPU_HEALTH_PATH, "utf8")); } catch {}
        return {
          ok: true,
          gpu: {
            status: health.status || "unknown",
            models: health.models || [],
            probeMs: health.probe_ms,
            gpuMaxUtil: health.gpu_max_util,
            checkedAt: health.checked_at ? new Date(health.checked_at * 1000).toISOString() : null,
          },
          pipelineGpuBusy: gpuBusy,
          pipelineDeployBusy: deployBusy,
        };
      }

      case "latest": {
        const articlesDir = "/opt/newsbites/content/articles";
        try {
          const files = fs.readdirSync(articlesDir)
            .filter(f => f.endsWith(".md"))
            .map(f => {
              const content = fs.readFileSync(path.join(articlesDir, f), "utf8");
              const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
              const fm = fmMatch ? fmMatch[1] : "";
              const title = (fm.match(/title:\s*"?(.+?)"?\s*$/m) || [])[1] || f;
              const date = (fm.match(/date:\s*"?(.+?)"?\s*$/m) || [])[1] || "";
              const status = (fm.match(/status:\s*"?(.+?)"?\s*$/m) || [])[1] || "";
              const slug = f.replace(/\.md$/, "");
              return { slug, title, date, status };
            })
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 5);
          return { ok: true, articles: files };
        } catch {
          return { ok: true, articles: [] };
        }
      }

      case "inject": {
        // Queue an existing dossier at a specific pipeline stage (use after partial manual work)
        const { dossierDir: dd, stage: stg, slug: sl } = msg;
        if (!dd || !stg) return { ok: false, error: "inject requires dossierDir and stage" };
        if (!STAGES.includes(stg)) return { ok: false, error: `Unknown stage: ${stg}. Valid: ${STAGES.join(", ")}` };
        if (!fs.existsSync(dd)) return { ok: false, error: `dossierDir not found: ${dd}` };
        const injectSlug = sl || path.basename(dd);
        enqueue({ type: "manual", priority: 0, stage: stg, dossierDir: dd, slug: injectSlug });
        return { ok: true, message: `Queued "${injectSlug}" at stage "${stg}"` };
      }

      case "add": {
        const topic = msg.topic || msg.url || "";
        if (topic) {
          // Topic provided — create a dossier directly and skip scout entirely
          const dossierDir = createManualDossier(topic, msg.vertical || "ai", msg.slug || "");
          const slug = path.basename(dossierDir);
          enqueue({
            type: "manual",
            priority: 0,
            stage: "research",
            topic,
            dossierDir,
            slug,
          });
          return { ok: true, message: `Manual dossier created for "${slug}", queued at research stage` };
        }
        // No topic — trigger a fresh scout run
        enqueue({ type: "manual", priority: 1, stage: "scout" });
        return { ok: true, message: "Scout queued (priority 1)" };
      }

      default:
        return { ok: false, error: `Unknown command: ${cmd}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function startSocketServer() {
  const sockDir = path.dirname(SOCKET_PATH);
  fs.mkdirSync(sockDir, { recursive: true });

  // Clean up stale socket
  try { fs.unlinkSync(SOCKET_PATH); } catch {}

  const server = net.createServer((conn) => {
    let data = "";
    conn.on("data", chunk => { data += chunk; });
    conn.on("end", () => {
      Promise.resolve(handleCommand(data))
        .then(result => conn.end(JSON.stringify(result) + "\n"))
        .catch(err => conn.end(JSON.stringify({ ok: false, error: err.message }) + "\n"));
    });
    conn.on("error", () => {}); // ignore broken pipe
  });

  server.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o666);
    log(`Socket server listening on ${SOCKET_PATH}`);
  });

  server.on("error", (e) => {
    log(`Socket server error: ${e.message}`);
  });

  return server;
}

// ── HTTP API (for Mimule / OpenClaw / curl) ─────────────────────────────────

function startHttpServer() {
  const httpServer = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/health") {
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
      return;
    }

    if (req.method === "GET" && req.url === "/stats") {
      Promise.resolve(handleCommand('{"cmd":"stats"}'))
        .then(result => res.end(JSON.stringify(result) + "\n"))
        .catch(err => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
        });
      return;
    }

    if (req.method === "GET" && req.url === "/queue") {
      Promise.resolve(handleCommand('{"cmd":"queue"}'))
        .then(result => res.end(JSON.stringify(result) + "\n"))
        .catch(err => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
        });
      return;
    }

    if (req.method === "GET" && req.url === "/doctor/log") {
      Promise.resolve(handleCommand('{"cmd":"doctor-log"}'))
        .then(result => res.end(JSON.stringify(result) + "\n"))
        .catch(err => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
        });
      return;
    }

    if (req.method === "POST" && req.url === "/doctor/scan") {
      Promise.resolve(handleCommand('{"cmd":"doctor-scan"}'))
        .then(result => res.end(JSON.stringify(result) + "\n"))
        .catch(err => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
        });
      return;
    }

    if (req.method === "POST" && req.url === "/doctor/dispatch") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        let payload;
        try {
          payload = JSON.parse(body || "{}");
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
          return;
        }
        Promise.resolve(handleCommand(JSON.stringify({ cmd: "doctor-dispatch", slug: payload.slug })))
          .then(result => res.end(JSON.stringify(result) + "\n"))
          .catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
          });
      });
      return;
    }

    if (req.method === "POST" && req.url === "/command") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        Promise.resolve(handleCommand(body))
          .then(result => res.end(JSON.stringify(result) + "\n"))
          .catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
          });
      });
      return;
    }

    // ── Dashboard control-plane API ────────────────────────────────────────────

    // GET /api/pipeline/state — full pipeline state
    if (req.method === "GET" && req.url === "/api/pipeline/state") {
      res.end(JSON.stringify({
        ok: true,
        queue: state.queue.map(q => ({
          id: q.id, slug: q.slug, stage: q.stage, priority: q.priority,
          status: q.status || "queued", running: q.running || false,
          waitingApproval: q.waitingApproval || false,
        })),
        current: state.current ? {
          id: state.current.id, slug: state.current.slug, stage: state.current.stage,
        } : null,
        paused: state.paused,
        pauseReason: state.pauseReason,
        stats: state.stats,
        lastScout: state.lastScout ? new Date(state.lastScout).toISOString() : null,
        queueLength: state.queue.length,
      }) + "\n");
      return;
    }

    // GET /api/pipeline/stories — story list with error info
    if (req.method === "GET" && req.url === "/api/pipeline/stories") {
      const allItems = [...state.queue, ...state.completed];
      res.end(JSON.stringify({
        ok: true,
        stories: allItems.map(item => ({
          slug: item.slug || null,
          stage: item.stage || null,
          status: item.status || "queued",
          retries: item.retries || 0,
          doctorAttempts: item.doctorAttempts || 0,
          startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : null,
          completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : null,
          failedAt: item.failedAt ? new Date(item.failedAt).toISOString() : null,
          lastError: item.lastError ? String(item.lastError).slice(0, 200) : null,
          dossierDir: item.dossierDir || null,
        })),
      }) + "\n");
      return;
    }

    // GET /api/models/health — serve model-health.json
    if (req.method === "GET" && req.url === "/api/models/health") {
      try {
        const data = fs.readFileSync(MODEL_HEALTH_FILE, "utf8");
        res.end(data);
      } catch (err) {
        res.statusCode = 503;
        res.end(JSON.stringify({ ok: false, error: `model-health.json not available: ${err.message}` }) + "\n");
      }
      return;
    }

    // GET /api/models/quality — serve model-quality.json
    if (req.method === "GET" && req.url === "/api/models/quality") {
      try {
        const data = fs.readFileSync(MODEL_QUALITY_FILE, "utf8");
        res.end(data);
      } catch (err) {
        res.statusCode = 503;
        res.end(JSON.stringify({ ok: false, error: `model-quality.json not available: ${err.message}` }) + "\n");
      }
      return;
    }

    // GET /api/health/score — read quality-rollup.json and return health score
    if (req.method === "GET" && req.url === "/api/health/score") {
      const ROLLUP_FILE = "/var/lib/mimule/quality-rollup.json";
      try {
        const rollup = JSON.parse(fs.readFileSync(ROLLUP_FILE, "utf8"));
        res.end(JSON.stringify({
          ok: true,
          score: rollup.pipeline?.healthScore ?? null,
          breakdown: rollup.pipeline?.healthScoreBreakdown ?? null,
          generatedAt: rollup.generatedAt ?? null,
          pipeline: {
            queueLength: rollup.pipeline?.queueLength ?? null,
            stuck: rollup.pipeline?.stuck ?? null,
            paused: rollup.pipeline?.paused ?? null,
            isActive: rollup.pipeline?.isActive ?? null,
            successRate24h: rollup.pipeline?.successRate24h ?? null,
          },
        }) + "\n");
      } catch (err) {
        res.statusCode = 503;
        res.end(JSON.stringify({ ok: false, error: `quality-rollup.json not available: ${err.message}` }) + "\n");
      }
      return;
    }

    // GET /api/doctor/log?limit=N — tail doctor-log.jsonl
    if (req.method === "GET" && req.url.startsWith("/api/doctor/log")) {
      const urlParams = new URL(req.url, `http://localhost`).searchParams;
      const limit = Math.max(1, Math.min(200, Number(urlParams.get("limit") || "20")));
      try {
        if (!fs.existsSync(DOCTOR_LOG_FILE)) {
          res.end(JSON.stringify({ ok: true, entries: [] }) + "\n");
          return;
        }
        const lines = fs.readFileSync(DOCTOR_LOG_FILE, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .slice(-limit)
          .map(line => { try { return JSON.parse(line); } catch { return { raw: line }; } });
        res.end(JSON.stringify({ ok: true, count: lines.length, entries: lines }) + "\n");
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: err.message }) + "\n");
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
    log(`HTTP API listening on 127.0.0.1:${HTTP_PORT}`);
  });

  return httpServer;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function main() {
  log("=== NewsBites Autopipeline starting ===");
  loadRuntimeLedgers();
  loadState();

  const server = startSocketServer();
  const httpSrv = startHttpServer();

  // Main loop
  const tick = async () => {
    if (shuttingDown) return;
    try {
      // Auto-resume fetch-image after quota pause expires (CF daily reset at midnight UTC)
      if (state.fetchImagePausedUntil && Date.now() >= state.fetchImagePausedUntil) {
        log("[fetch-image] Provider quota pause expired — auto-resuming");
        state.fetchImagePausedUntil = null;
        state.googleImgQuotaExhaustedAt = null;
        state.cfImgQuotaExhaustedAt = null;
        // Re-enqueue items parked with waiting-quota disposition
        const toResume = state.completed.filter(i =>
          i.status === "stuck" &&
          i.stage === "fetch-image" &&
          i.doctorDisposition === "waiting-quota"
        );
        for (const item of toResume.slice(0, 20)) {
          const idx = state.completed.indexOf(item);
          if (idx !== -1) state.completed.splice(idx, 1);
          enqueue({ stage: item.stage, dossierDir: item.dossierDir, slug: item.slug, priority: 0 });
        }
        if (toResume.length > 0) {
          log(`[fetch-image] Auto-resumed ${toResume.length} waiting-quota item(s)`);
          sendTelegram(
            `✅ <b>Image gen auto-resumed</b>\n${toResume.length} article(s) re-queued after quota reset.`
          ).catch(() => {});
        }
        saveState();
      }
      await scoutTick();
      await processQueue();
    } catch (e) {
      log(`Tick error: ${e.message}`);
    }
  };

  const interval = setInterval(tick, QUEUE_CHECK_MS);

  // Run first tick immediately
  await tick();

  // Graceful shutdown
  const shutdown = (signal) => {
    log(`Received ${signal}, shutting down...`);
    shuttingDown = true;
    clearInterval(interval);
    server.close();
    httpSrv.close();
    saveState();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  log(
    "Autopipeline running. Queue check every " + (QUEUE_CHECK_MS / 1000) +
    "s, scout every " + Math.round(SCOUT_INTERVAL_MS / 60000) +
    "m, scout fan-out " + SCOUT_FANOUT_COUNT,
  );
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
