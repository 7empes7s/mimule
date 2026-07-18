import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ALLOWED_CREDENTIAL_ENV_NAMES,
  MAX_MODELS_PER_CREDENTIAL,
  acquireCredentialProbeLock,
  assertCredentialArtifactSafe,
  classifyCredentialResponse,
  credentialAdapterNames,
  parseCredentialModelMap,
  probeCredentialHealth,
  readCredentialHealthPrevious,
  writeCredentialHealthAtomic,
} from "../credential-health.mjs";

const CONFIG = `
model_list:
  - model_name: github-gpt41
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/GITHUB_TOKEN
  - model_name: coding-go-minimax-m3
    litellm_params:
      model: hosted_vllm/minimax-m3
      api_key: os.environ/OPENCODE_GO_API_KEY
  - model_name: coding-go-mimo-pro
    litellm_params:
      model: hosted_vllm/mimo-v2.5-pro
      api_key: os.environ/OPENCODE_GO_API_KEY
  - model_name: openrouter-safe
    litellm_params:
      model: openrouter/example:free
      api_key: os.environ/OPENROUTER_API_KEY
  - model_name: internal-route
    litellm_params:
      model: openai/local
      api_key: os.environ/LITELLM_MASTER_KEY
  - model_name: unrelated-route
    litellm_params:
      model: openai/example
      api_key: os.environ/TELEGRAM_BOT_TOKEN
`;

test("parses canonical config model-to-key mappings and excludes internal credentials", () => {
  assert.deepEqual(parseCredentialModelMap(CONFIG), {
    GITHUB_TOKEN: ["github-gpt41"],
    OPENCODE_GO_API_KEY: ["coding-go-mimo-pro", "coding-go-minimax-m3"],
    OPENROUTER_API_KEY: ["openrouter-safe"],
  });
  assert.deepEqual(credentialAdapterNames(), [...ALLOWED_CREDENTIAL_ENV_NAMES].sort());
  assert.ok(!credentialAdapterNames().includes("LITELLM_MASTER_KEY"));
});

test("classifies provider responses conservatively", () => {
  assert.equal(classifyCredentialResponse(200, "{}"), "unknown");
  assert.equal(classifyCredentialResponse(200, "{}", true), "valid");
  assert.equal(classifyCredentialResponse(401, "unauthorized"), "invalid");
  assert.equal(classifyCredentialResponse(401, "token expired"), "expired");
  assert.equal(classifyCredentialResponse(401, "credential revoked"), "revoked");
  assert.equal(classifyCredentialResponse(402, ""), "quota");
  assert.equal(classifyCredentialResponse(403, "forbidden"), "unknown");
  assert.equal(classifyCredentialResponse(403, "invalid api key"), "invalid");
  assert.equal(classifyCredentialResponse(403, "quota exceeded"), "quota");
  assert.equal(classifyCredentialResponse(429, "invalid api key"), "rate_limited");
  assert.equal(classifyCredentialResponse(500, "invalid api key"), "unknown");
  assert.equal(classifyCredentialResponse(null, ""), "unknown");
});

test("probes once per present configured key and makes no request for a missing key", async () => {
  const calls = [];
  const document = await probeCredentialHealth({
    configText: CONFIG,
    env: {
      GITHUB_TOKEN: "github-secret-sentinel",
      OPENCODE_GO_API_KEY: "",
      OPENROUTER_API_KEY: "openrouter-secret-sentinel",
    },
    now: 1_784_405_000_000,
    runId: "run-one",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        url.includes("chat/completions")
          ? '{"choices":[{"message":{"content":"OK"}}]}'
          : '{"data":{"label":"test"}}',
        { status: 200 },
      );
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.options.redirect === "error"), true);
  assert.equal(calls.some(call => call.url.includes("models.inference.ai.azure.com")), true);
  assert.equal(calls.some(call => call.url === "https://openrouter.ai/api/v1/key"), true);
  assert.equal(document.credentials.GITHUB_TOKEN.status, "valid");
  assert.equal(document.credentials.OPENROUTER_API_KEY.status, "valid");
  assert.deepEqual(document.credentials.OPENCODE_GO_API_KEY, {
    provider: "opencode-go",
    status: "missing",
    httpCode: null,
    checkedAt: 1_784_405_000_000,
    sinceStatus: 1_784_405_000_000,
    gatesModels: ["coding-go-mimo-pro", "coding-go-minimax-m3"],
    present: false,
  });
  const serialized = JSON.stringify(document);
  assert.doesNotMatch(serialized, /github-secret-sentinel|openrouter-secret-sentinel/);
});

test("OpenCode Go uses one direct one-token representative probe", async () => {
  const calls = [];
  const document = await probeCredentialHealth({
    configText: CONFIG,
    env: {
      OPENCODE_GO_API_KEY: "go-provider-secret-sentinel",
    },
    now: 1_784_405_100_000,
    runId: "run-go",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://opencode.ai/zen/go/v1/chat/completions");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "minimax-m3");
  assert.equal(body.max_tokens, 1);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(document.credentials.OPENCODE_GO_API_KEY.status, "valid");
  assert.doesNotMatch(JSON.stringify(document), /go-provider-secret-sentinel/);
});

test("bounds the model inventory attached to one credential", async () => {
  const configText = Array.from(
    { length: MAX_MODELS_PER_CREDENTIAL + 3 },
    (_, index) => `  - model_name: github-model-${index}\n    litellm_params:\n      api_key: os.environ/GITHUB_TOKEN`,
  ).join("\n");
  const document = await probeCredentialHealth({
    configText,
    env: { GITHUB_TOKEN: "bounded-secret-sentinel" },
    now: 1_784_405_150_000,
    runId: "run-bounded",
    fetchImpl: async () => new Response('{"choices":[]}', { status: 200 }),
  });

  assert.equal(document.credentials.GITHUB_TOKEN.gatesModels.length, MAX_MODELS_PER_CREDENTIAL);
  assert.equal(document.credentials.GITHUB_TOKEN.status, "valid");
});

test("uses small authoritative access endpoints for Cloudflare and Groq", async () => {
  const configText = `
    - model_name: cloudflare-route
      litellm_params:
        api_key: os.environ/CLOUDFLARE_API_TOKEN
    - model_name: groq-route
      litellm_params:
        api_key: os.environ/GROQ_API_KEY
  `;
  const calls = [];
  const document = await probeCredentialHealth({
    configText,
    env: {
      CLOUDFLARE_API_TOKEN: "cloudflare-secret-sentinel",
      CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      GROQ_API_KEY: "groq-secret-sentinel",
    },
    now: 1_784_405_175_000,
    runId: "run-access-endpoints",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("api.cloudflare.com")) {
        return new Response('{"success":true,"result":[]}', { status: 200 });
      }
      return new Response('{"id":"llama-3.3-70b-versatile","object":"model"}', { status: 200 });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("search=__credential_health_access_probe_no_match__"), true);
  assert.equal(calls[1].url, "https://api.groq.com/openai/v1/models/llama-3.3-70b-versatile");
  assert.equal(document.credentials.CLOUDFLARE_API_TOKEN.status, "valid");
  assert.equal(document.credentials.GROQ_API_KEY.status, "valid");
  assert.doesNotMatch(JSON.stringify(document), /cloudflare-secret-sentinel|groq-secret-sentinel/);
});

test("body and credential sentinels affect status but never enter evidence", async () => {
  const secret = "credential-secret-sentinel";
  const bodySentinel = "provider-body-secret-sentinel";
  const document = await probeCredentialHealth({
    configText: `
      - model_name: github-gpt41
        litellm_params:
          api_key: os.environ/GITHUB_TOKEN
    `,
    env: { GITHUB_TOKEN: secret },
    now: 1_784_405_200_000,
    runId: "run-leak",
    fetchImpl: async () => new Response(`invalid api key ${secret} ${bodySentinel}`, { status: 401 }),
  });

  assert.equal(document.credentials.GITHUB_TOKEN.status, "invalid");
  assert.doesNotThrow(() => assertCredentialArtifactSafe(document, [secret, bodySentinel]));
  assert.doesNotMatch(JSON.stringify(document), /credential-secret-sentinel|provider-body-secret-sentinel/);
});

test("preserves sinceStatus only while the same non-valid status continues", async () => {
  const configText = `
    - model_name: github-gpt41
      litellm_params:
        api_key: os.environ/GITHUB_TOKEN
  `;
  const previous = {
    credentials: {
      GITHUB_TOKEN: { status: "invalid", sinceStatus: 1_700_000_000_000 },
    },
  };
  const invalid = await probeCredentialHealth({
    configText,
    env: { GITHUB_TOKEN: "sentinel-one" },
    previous,
    now: 1_784_405_300_000,
    runId: "run-invalid",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  });
  assert.equal(invalid.credentials.GITHUB_TOKEN.sinceStatus, 1_700_000_000_000);

  const quota = await probeCredentialHealth({
    configText,
    env: { GITHUB_TOKEN: "sentinel-two" },
    previous,
    now: 1_784_405_400_000,
    runId: "run-quota",
    fetchImpl: async () => new Response("quota exceeded", { status: 402 }),
  });
  assert.equal(quota.credentials.GITHUB_TOKEN.sinceStatus, 1_784_405_400_000);

  const valid = await probeCredentialHealth({
    configText,
    env: { GITHUB_TOKEN: "sentinel-three" },
    previous,
    now: 1_784_405_500_000,
    runId: "run-valid",
    fetchImpl: async () => new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200 }),
  });
  assert.equal(valid.credentials.GITHUB_TOKEN.sinceStatus, null);
});

test("writes bounded evidence atomically with mode 0600 and rejects symlink targets", () => {
  const directory = mkdtempSync(join(tmpdir(), "credential-health-"));
  try {
    const target = join(directory, "credential-health.json");
    const document = {
      schemaVersion: 1,
      policyVersion: "credential-observation-v1",
      runId: "run-write",
      generatedAt: 1,
      expiresAt: 2,
      credentials: {},
    };
    writeCredentialHealthAtomic(target, document, ["must-not-appear"]);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), document);
    assert.equal(lstatSync(target).mode & 0o777, 0o600);

    assert.throws(
      () => writeCredentialHealthAtomic(target, { ...document, runId: "must-not-appear" }, ["must-not-appear"]),
      /forbidden material/,
    );

    const symlinkTarget = join(directory, "linked.json");
    symlinkSync(target, symlinkTarget);
    assert.throws(
      () => writeCredentialHealthAtomic(symlinkTarget, document),
      /regular file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("previous-evidence reads reject symlinks and oversized files", () => {
  const directory = mkdtempSync(join(tmpdir(), "credential-previous-"));
  try {
    const validPath = join(directory, "valid.json");
    writeFileSync(validPath, JSON.stringify({
      schemaVersion: 1,
      policyVersion: "credential-observation-v1",
      credentials: {},
    }));
    assert.deepEqual(readCredentialHealthPrevious(validPath)?.credentials, {});

    const symlinkPath = join(directory, "symlink.json");
    symlinkSync(validPath, symlinkPath);
    assert.equal(readCredentialHealthPrevious(symlinkPath), null);

    const oversizedPath = join(directory, "oversized.json");
    writeFileSync(oversizedPath, "x".repeat(256 * 1024 + 1));
    assert.equal(readCredentialHealthPrevious(oversizedPath), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("probe lock excludes concurrent refreshes and releases cleanly", () => {
  const directory = mkdtempSync(join(tmpdir(), "credential-lock-"));
  try {
    const lockPath = join(directory, "credential-health.lock");
    const first = acquireCredentialProbeLock(lockPath);
    assert.equal(first.acquired, true);
    const concurrent = acquireCredentialProbeLock(lockPath);
    assert.equal(concurrent.acquired, false);
    first.release();
    const afterRelease = acquireCredentialProbeLock(lockPath);
    assert.equal(afterRelease.acquired, true);
    afterRelease.release();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("probe lock does not reap a newly published stamp and recovers an old malformed lock", () => {
  const directory = mkdtempSync(join(tmpdir(), "credential-lock-race-"));
  try {
    const lockPath = join(directory, "credential-health.lock");
    writeFileSync(lockPath, "");
    assert.equal(acquireCredentialProbeLock(lockPath).acquired, false);

    const old = new Date(Date.now() - 60_000);
    utimesSync(lockPath, old, old);
    const recovered = acquireCredentialProbeLock(lockPath);
    assert.equal(recovered.acquired, true);
    recovered.release();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
