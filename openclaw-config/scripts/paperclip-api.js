#!/usr/bin/env node

const crypto = require("node:crypto");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createJwt() {
  const secret = process.env.PAPERCLIP_AGENT_JWT_SECRET;
  const agentId = process.env.PAPERCLIP_AGENT_ID;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  const adapterType = process.env.PAPERCLIP_AGENT_ADAPTER_TYPE || "openclaw_gateway";
  const issuer = process.env.PAPERCLIP_AGENT_JWT_ISSUER || "paperclip";
  const audience = process.env.PAPERCLIP_AGENT_JWT_AUDIENCE || "paperclip-api";

  if (!secret) fail("Missing PAPERCLIP_AGENT_JWT_SECRET");
  if (!agentId) fail("Missing PAPERCLIP_AGENT_ID");
  if (!companyId) fail("Missing PAPERCLIP_COMPANY_ID");

  const now = Math.floor(Date.now() / 1000);
  const runId = crypto.randomUUID();
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    sub: agentId,
    company_id: companyId,
    adapter_type: adapterType,
    run_id: runId,
    iat: now,
    exp: now + 300,
    iss: issuer,
    aud: audience,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return { token: `${signingInput}.${signature}`, runId };
}

async function main() {
  const method = (process.argv[2] || "GET").toUpperCase();
  const pathArg = process.argv[3];
  const bodyArg = process.argv[4];
  const base = process.env.PAPERCLIP_API_BASE;

  if (!base) fail("Missing PAPERCLIP_API_BASE");
  if (!pathArg) fail("Usage: paperclip-api.js <METHOD> </path> [json-body]");

  const normalizedPath = pathArg.startsWith("/") ? pathArg.slice(1) : pathArg;
  const url = new URL(normalizedPath, base.endsWith("/") ? base : `${base}/`);
  const apiKey = process.env.PAPERCLIP_AGENT_API_KEY;
  const auth = apiKey ? { token: apiKey, runId: null } : createJwt();
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    Accept: "application/json",
  };
  const init = { method, headers };

  if (auth.runId) {
    headers["x-paperclip-run-id"] = auth.runId;
  }

  if (bodyArg) {
    headers["Content-Type"] = "application/json";
    init.body = bodyArg;
  }

  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    process.stderr.write(text ? `${text}\n` : `${response.status} ${response.statusText}\n`);
    process.exit(response.status || 1);
  }

  if (!text) return;

  try {
    process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  } catch {
    process.stdout.write(`${text}\n`);
  }
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
