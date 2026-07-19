import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";

export const CREDENTIAL_HEALTH_SCHEMA_VERSION = 1;
export const CREDENTIAL_HEALTH_POLICY_VERSION = "credential-observation-v1";
export const CREDENTIAL_HEALTH_TTL_MS = 13 * 60 * 60 * 1000;
export const MAX_RESPONSE_BYTES = 4096;
const MAX_MODEL_LIST_PROBE_BYTES = 256 * 1024;
export const MAX_ARTIFACT_BYTES = 256 * 1024;
export const MAX_MODELS_PER_CREDENTIAL = 256;
export const DEFAULT_CREDENTIAL_PROBE_LOCK = "/run/model-credential-health.lock";
const MALFORMED_LOCK_GRACE_MS = 30_000;

export const CREDENTIAL_STATUSES = Object.freeze([
  "valid",
  "missing",
  "invalid",
  "expired",
  "revoked",
  "quota",
  "rate_limited",
  "unknown",
]);

export const ALLOWED_CREDENTIAL_ENV_NAMES = Object.freeze([
  "AIHUBMIX_API_KEY",
  "CEREBRAS_API_KEY",
  "CEREBRAS_API_KEY_PAID",
  "CLOUDFLARE_API_TOKEN",
  "GEMINI_API_KEY",
  "GITHUB_TOKEN",
  "GROQ_API_KEY",
  "NVIDIA_NIM_API_KEY",
  "OPENCODE_GO_API_KEY",
  "OPENCODE_ZEN_KEY",
  "OPENROUTER_API_KEY",
]);

const ALLOWED_CREDENTIALS = new Set(ALLOWED_CREDENTIAL_ENV_NAMES);
const MODEL_NAME_RE = /^\s*-\s*model_name:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/;
const API_KEY_ENV_RE = /\bapi_key:\s*(?:"os\.environ\/([A-Z][A-Z0-9_]*)"|'os\.environ\/([A-Z][A-Z0-9_]*)'|os\.environ\/([A-Z][A-Z0-9_]*))(?:\s+#.*)?\s*$/;
const SAFE_MODEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/;
const SAFE_ENV_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

function bearerHeaders(secret) {
  return { Accept: "application/json", Authorization: `Bearer ${secret}` };
}

function completionRequest(url, secret, model) {
  return {
    url,
    options: {
      method: "POST",
      headers: { ...bearerHeaders(secret), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
        temperature: 0,
      }),
    },
  };
}

function parseBoundedJson(bodyText, limit = MAX_RESPONSE_BYTES) {
  try {
    const parsed = JSON.parse(String(bodyText || "").slice(0, limit));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function completionSuccess(bodyText) {
  const parsed = parseBoundedJson(bodyText);
  return Array.isArray(parsed?.choices);
}

function dataListSuccess(bodyText, limit = MAX_RESPONSE_BYTES) {
  const parsed = parseBoundedJson(bodyText, limit);
  return Array.isArray(parsed?.data);
}

function modelObjectSuccess(bodyText) {
  const parsed = parseBoundedJson(bodyText);
  return parsed?.object === "model" && typeof parsed.id === "string";
}

const PINNED_PROBE_ORIGINS = new Set([
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

function assertPinnedProbeUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.username || url.password || !PINNED_PROBE_ORIGINS.has(url.origin)) {
    throw new Error("credential adapter target is not pinned");
  }
}

const ADAPTERS = Object.freeze({
  AIHUBMIX_API_KEY: {
    provider: "aihubmix",
    maxResponseBytes: MAX_MODEL_LIST_PROBE_BYTES,
    request: ({ secret }) => ({
      url: "https://aihubmix.com/v1/models",
      options: { headers: bearerHeaders(secret) },
    }),
    success: bodyText => dataListSuccess(bodyText, MAX_MODEL_LIST_PROBE_BYTES),
  },
  CEREBRAS_API_KEY: {
    provider: "cerebras",
    request: ({ secret }) => ({ url: "https://api.cerebras.ai/v1/models", options: { headers: bearerHeaders(secret) } }),
    success: dataListSuccess,
  },
  CEREBRAS_API_KEY_PAID: {
    provider: "cerebras-paid",
    request: ({ secret }) => ({ url: "https://api.cerebras.ai/v1/models", options: { headers: bearerHeaders(secret) } }),
    success: dataListSuccess,
  },
  CLOUDFLARE_API_TOKEN: {
    provider: "cloudflare",
    request: ({ secret, env }) => {
      const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "");
      if (!/^[a-f0-9]{32}$/i.test(accountId)) return null;
      return {
        url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?search=__credential_health_access_probe_no_match__&per_page=1`,
        options: { headers: bearerHeaders(secret) },
      };
    },
    success: bodyText => {
      const parsed = parseBoundedJson(bodyText);
      return parsed?.success === true && Array.isArray(parsed?.result);
    },
  },
  GEMINI_API_KEY: {
    provider: "gemini",
    request: ({ secret }) => ({
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      options: { headers: { Accept: "application/json", "x-goog-api-key": secret } },
    }),
    success: bodyText => Array.isArray(parseBoundedJson(bodyText)?.models),
  },
  GITHUB_TOKEN: {
    provider: "github-models",
    request: ({ secret }) => completionRequest(
      "https://models.github.ai/inference/chat/completions",
      secret,
      "openai/gpt-4.1",
    ),
    success: completionSuccess,
  },
  GROQ_API_KEY: {
    provider: "groq",
    request: ({ secret }) => ({
      url: "https://api.groq.com/openai/v1/models/llama-3.3-70b-versatile",
      options: { headers: bearerHeaders(secret) },
    }),
    success: modelObjectSuccess,
  },
  NVIDIA_NIM_API_KEY: {
    provider: "nvidia-nim",
    request: ({ secret }) => completionRequest(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      secret,
      "meta/llama-3.3-70b-instruct",
    ),
    success: completionSuccess,
  },
  OPENCODE_GO_API_KEY: {
    provider: "opencode-go",
    request: ({ secret }) => completionRequest(
      "https://opencode.ai/zen/go/v1/chat/completions",
      secret,
      "minimax-m3",
    ),
    success: completionSuccess,
  },
  OPENCODE_ZEN_KEY: {
    provider: "opencode-zen",
    request: ({ secret }) => completionRequest(
      "https://opencode.ai/zen/v1/chat/completions",
      secret,
      "big-pickle",
    ),
    success: completionSuccess,
  },
  OPENROUTER_API_KEY: {
    provider: "openrouter",
    request: ({ secret }) => ({ url: "https://openrouter.ai/api/v1/key", options: { headers: bearerHeaders(secret) } }),
    success: bodyText => {
      const parsed = parseBoundedJson(bodyText);
      return Boolean(parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data));
    },
  },
});

export function credentialAdapterNames() {
  return Object.keys(ADAPTERS).sort();
}

export function parseCredentialModelMap(configText) {
  const mapped = new Map();
  let currentModel = null;

  for (const line of String(configText || "").split(/\r?\n/)) {
    const modelMatch = line.match(MODEL_NAME_RE);
    if (modelMatch) {
      const candidate = (modelMatch[1] || modelMatch[2] || modelMatch[3] || "").trim();
      currentModel = SAFE_MODEL_NAME_RE.test(candidate) ? candidate : null;
      continue;
    }
    if (!currentModel) continue;
    const keyMatch = line.match(API_KEY_ENV_RE);
    const envName = keyMatch ? (keyMatch[1] || keyMatch[2] || keyMatch[3]) : null;
    if (!envName || !ALLOWED_CREDENTIALS.has(envName)) continue;
    if (!mapped.has(envName)) mapped.set(envName, new Set());
    mapped.get(envName).add(currentModel);
  }

  return Object.fromEntries(
    [...mapped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([envName, names]) => [envName, [...names].sort()]),
  );
}

export function credentialNamesRequiringObservation(configText, env = {}) {
  const mapping = parseCredentialModelMap(configText);
  // Discovery credentials need an observation before their first model is
  // registered. Keep this exception explicit rather than probing every unused
  // personal credential loaded in the environment.
  if (typeof env.AIHUBMIX_API_KEY === "string" && env.AIHUBMIX_API_KEY.trim() && !mapping.AIHUBMIX_API_KEY) {
    mapping.AIHUBMIX_API_KEY = [];
  }
  return { mapping, envNames: Object.keys(mapping).filter(name => ALLOWED_CREDENTIALS.has(name)).sort() };
}

export function credentialHealthCoversRelevantKeys(previous, configText, env = {}) {
  const { envNames } = credentialNamesRequiringObservation(configText, env);
  return envNames.every(envName => {
    const row = previous?.credentials?.[envName];
    return row && typeof row === "object" && Number.isFinite(row.checkedAt);
  });
}

function explicitBodyStatus(bodyText) {
  const body = String(bodyText || "").slice(0, MAX_RESPONSE_BYTES).toLowerCase();
  if (/\brevok(?:ed|ation)\b/.test(body)) return "revoked";
  if (/\bexpir(?:ed|y)\b/.test(body)) return "expired";
  if (/insufficient (?:balance|credit)|quota (?:exceeded|exhausted)|billing quota|out of credits|credit balance/.test(body)) return "quota";
  if (/invalid (?:api[ -]?key|token|credential)|api[ -]?key is invalid|unauthorized token|bad credential/.test(body)) return "invalid";
  return null;
}

export function classifyCredentialResponse(httpCode, bodyText = "", authenticatedSuccess = false) {
  const code = Number.isInteger(httpCode) ? httpCode : null;
  const explicit = explicitBodyStatus(bodyText);

  if (code !== null && code >= 200 && code < 300) return authenticatedSuccess ? "valid" : "unknown";
  if (code === 429) return "rate_limited";
  if (code === 402) return "quota";
  if (code === 401) return explicit || "invalid";
  if (code === 403) return explicit || "unknown";
  if (code !== null && code >= 400 && code < 500 && explicit) return explicit;
  return "unknown";
}

async function boundedResponseText(response, limit = MAX_RESPONSE_BYTES) {
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let output = "";
    let bytes = 0;
    try {
      while (bytes < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        const take = chunk.subarray(0, Math.max(0, limit - bytes));
        output += decoder.decode(take, { stream: bytes + take.length < limit });
        bytes += take.length;
        if (take.length < chunk.length) break;
      }
    } finally {
      try { await reader.cancel(); } catch { /* response already complete */ }
    }
    return output.slice(0, limit);
  }
  if (typeof response?.text === "function") {
    return String(await response.text()).slice(0, limit);
  }
  return "";
}

function previousSinceStatus(previous, envName, status, now) {
  if (status === "valid") return null;
  const prior = previous?.credentials?.[envName];
  if (
    prior
    && prior.status === status
    && Number.isFinite(prior.sinceStatus)
    && prior.sinceStatus > 0
    && prior.sinceStatus <= now
  ) {
    return prior.sinceStatus;
  }
  return now;
}

function safeHttpCode(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function processStartTicks(pid) {
  let fd = null;
  try {
    fd = openSync(`/proc/${pid}/stat`, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const buffer = Buffer.alloc(4096);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const statLine = buffer.toString("utf8", 0, bytesRead);
    const closeParen = statLine.lastIndexOf(")");
    if (closeParen < 0) return null;
    const fieldsAfterComm = statLine.slice(closeParen + 1).trim().split(/\s+/);
    const startTicks = fieldsAfterComm[19]; // field 22 overall; suffix starts at field 3
    return /^\d+$/.test(startTicks || "") ? startTicks : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}

function createProbeLock(lockPath) {
  const startTicks = processStartTicks(process.pid);
  if (!startTicks) throw new Error("cannot identify credential probe process");
  const stamp = `${process.pid} ${startTicks}\n`;
  const fd = openSync(
    lockPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600,
  );
  let identity;
  try {
    writeSync(fd, stamp, null, "utf8");
    fchmodSync(fd, 0o600);
    fsyncSync(fd);
    const stat = fstatSync(fd);
    identity = { dev: stat.dev, ino: stat.ino };
  } finally {
    closeSync(fd);
  }

  let released = false;
  return {
    acquired: true,
    release() {
      if (released) return;
      released = true;
      try {
        const current = lstatSync(lockPath);
        if (current.isFile() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) {
          unlinkSync(lockPath);
        }
      } catch { /* lock already gone */ }
    },
  };
}

function inspectProbeLock(lockPath) {
  let fd = null;
  try {
    fd = openSync(lockPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { active: true, stat };
    if (stat.size <= 0 || stat.size > 128) {
      return { active: Date.now() - stat.mtimeMs <= MALFORMED_LOCK_GRACE_MS, stat };
    }
    const buffer = Buffer.alloc(stat.size);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const match = buffer.toString("utf8", 0, bytesRead).match(/^(\d+) (\d+)\n$/);
    if (!match) return { active: Date.now() - stat.mtimeMs <= MALFORMED_LOCK_GRACE_MS, stat };
    const pid = Number.parseInt(match[1], 10);
    return { active: processStartTicks(pid) === match[2], stat };
  } catch {
    return { active: true, stat: null };
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}

export function acquireCredentialProbeLock(lockPath = DEFAULT_CREDENTIAL_PROBE_LOCK) {
  try {
    return createProbeLock(lockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const existing = inspectProbeLock(lockPath);
  if (existing.active || !existing.stat) return { acquired: false, release() {} };
  try {
    const current = lstatSync(lockPath);
    if (!current.isFile()
      || current.isSymbolicLink()
      || current.dev !== existing.stat.dev
      || current.ino !== existing.stat.ino) {
      return { acquired: false, release() {} };
    }
    unlinkSync(lockPath);
  } catch {
    return { acquired: false, release() {} };
  }

  try {
    return createProbeLock(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") return { acquired: false, release() {} };
    throw error;
  }
}

export async function probeCredentialHealth({
  configText,
  env = {},
  previous = null,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  timeoutMs = 10_000,
  runId = randomUUID(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isFinite(now) || now <= 0) throw new TypeError("now must be a positive timestamp");

  const { mapping } = credentialNamesRequiringObservation(configText, env);
  const credentials = {};

  for (const envName of Object.keys(mapping).sort()) {
    if (!SAFE_ENV_NAME_RE.test(envName) || !ALLOWED_CREDENTIALS.has(envName)) continue;
    const adapter = ADAPTERS[envName];
    if (!adapter) continue;
    const gatesModels = mapping[envName].slice(0, MAX_MODELS_PER_CREDENTIAL);
    const secret = typeof env[envName] === "string" ? env[envName].trim() : "";
    const present = secret.length > 0;
    let status = "missing";
    let httpCode = null;

    if (present) {
      const request = adapter.request({ secret, env, gatesModels });
      if (request) {
        assertPinnedProbeUrl(request.url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(request.url, {
            ...request.options,
            redirect: "error",
            signal: controller.signal,
          });
          httpCode = safeHttpCode(response?.status);
          const bodyText = await boundedResponseText(response, adapter.maxResponseBytes || MAX_RESPONSE_BYTES);
          status = classifyCredentialResponse(httpCode, bodyText, adapter.success(bodyText));
        } catch {
          status = "unknown";
          httpCode = null;
        } finally {
          clearTimeout(timer);
        }
      } else {
        status = "unknown";
      }
    }

    credentials[envName] = {
      provider: adapter.provider,
      status,
      httpCode,
      checkedAt: now,
      sinceStatus: previousSinceStatus(previous, envName, status, now),
      gatesModels,
      present,
    };
  }

  return {
    schemaVersion: CREDENTIAL_HEALTH_SCHEMA_VERSION,
    policyVersion: CREDENTIAL_HEALTH_POLICY_VERSION,
    runId: String(runId).slice(0, 128),
    generatedAt: now,
    expiresAt: now + CREDENTIAL_HEALTH_TTL_MS,
    credentials,
  };
}

export function assertCredentialArtifactSafe(document, forbiddenValues = []) {
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_ARTIFACT_BYTES) {
    throw new Error("credential artifact exceeds size limit");
  }
  for (const value of forbiddenValues) {
    const secret = typeof value === "string" ? value : "";
    if (secret && serialized.includes(secret)) {
      throw new Error("credential artifact contains forbidden material");
    }
  }
  return serialized;
}

export function writeCredentialHealthAtomic(filePath, document, forbiddenValues = []) {
  const directory = dirname(filePath);
  const targetName = basename(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    const targetStat = lstatSync(filePath);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new Error("credential artifact target must be a regular file");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const serialized = assertCredentialArtifactSafe(document, forbiddenValues);
  const temporaryPath = join(directory, `.${targetName}.${process.pid}.${randomUUID()}.tmp`);
  let fd = null;
  try {
    fd = openSync(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeSync(fd, serialized, null, "utf8");
    fchmodSync(fd, 0o600);
    if (typeof process.geteuid === "function" && process.geteuid() === 0) {
      fchownSync(fd, 0, 0);
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporaryPath, filePath);
    const dirFd = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  } catch (error) {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function readCredentialHealthPrevious(filePath) {
  let fd = null;
  try {
    fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ARTIFACT_BYTES) return null;
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== buffer.length) return null;
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (parsed?.schemaVersion !== CREDENTIAL_HEALTH_SCHEMA_VERSION) return null;
    if (parsed?.policyVersion !== CREDENTIAL_HEALTH_POLICY_VERSION) return null;
    if (!parsed.credentials || typeof parsed.credentials !== "object" || Array.isArray(parsed.credentials)) return null;
    return parsed;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}
