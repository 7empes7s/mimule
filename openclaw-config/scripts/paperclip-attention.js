#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const OPENCLAW_CONFIG_PATH = "/opt/mimoun/openclaw-config/openclaw.json";
const STATE_PATH = "/opt/mimoun/openclaw-config/telegram/paperclip-action-state.json";
const DEFAULT_COMPANY_ID = "92de899d-c83d-49bb-9d96-7f98b85ec5fb";
const DEFAULT_HOST_API_BASE = "http://127.0.0.1:3100/api";

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function getSettings() {
  const config = readJson(OPENCLAW_CONFIG_PATH, {});
  const account = config?.channels?.telegram?.accounts?.default ?? {};
  const botToken = account.botToken;
  const chatId = Array.isArray(account.allowFrom) && account.allowFrom[0] ? String(account.allowFrom[0]) : null;
  const boardApiKey = process.env.PAPERCLIP_BOARD_API_KEY || null;

  if (!botToken || !chatId) {
    throw new Error("Missing Telegram bot token or allowlist target in openclaw.json");
  }
  if (!boardApiKey) {
    throw new Error("Missing PAPERCLIP_BOARD_API_KEY");
  }

  return {
    botToken,
    chatId,
    boardApiKey,
    companyId: process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID,
    apiBase: process.env.PAPERCLIP_API_BASE || DEFAULT_HOST_API_BASE,
  };
}

async function paperclipGet(settings, pathName) {
  const normalizedPath = pathName.startsWith("/") ? pathName.slice(1) : pathName;
  const url = new URL(normalizedPath, settings.apiBase.endsWith("/") ? settings.apiBase : `${settings.apiBase}/`);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.boardApiKey}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`Paperclip GET ${url.pathname} failed: ${response.status} ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function buildSnapshot(settings) {
  const tasks = await paperclipGet(
    settings,
    `companies/${settings.companyId}/issues?assigneeUserId=me&unreadForUserId=me&status=backlog,todo,in_progress,in_review,blocked`,
  );
  const approvals = await paperclipGet(
    settings,
    `companies/${settings.companyId}/approvals?status=pending`,
  );

  return {
    tasks: Array.isArray(tasks) ? tasks : [],
    approvals: Array.isArray(approvals) ? approvals : [],
  };
}

async function loadIssueDetail(settings, issueId) {
  const [issue, comments, approvals] = await Promise.all([
    paperclipGet(settings, `issues/${issueId}`),
    paperclipGet(settings, `issues/${issueId}/comments?limit=3&order=desc`),
    paperclipGet(settings, `issues/${issueId}/approvals`),
  ]);
  return {
    issue,
    comments: Array.isArray(comments) ? comments : [],
    approvals: Array.isArray(approvals) ? approvals : [],
  };
}

async function loadApprovalDetail(settings, approvalId) {
  const [approval, issues, comments] = await Promise.all([
    paperclipGet(settings, `approvals/${approvalId}`),
    paperclipGet(settings, `approvals/${approvalId}/issues`),
    paperclipGet(settings, `approvals/${approvalId}/comments`),
  ]);
  return {
    approval,
    issues: Array.isArray(issues) ? issues : [],
    comments: Array.isArray(comments) ? comments : [],
  };
}

function issueMessage(issue) {
  const prefix = issue.identifier ? `${issue.identifier} - ` : "";
  return {
    text: `Paperclip task needs you.\n${prefix}${issue.title}\nStatus: ${issue.status}.`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Tasks", callback_data: "paperclip_tasks" },
          { text: "Details", callback_data: `pc_issue:${issue.id}` },
        ],
        [
          { text: "Custom reply", callback_data: "custom_reply" },
        ],
      ],
    },
  };
}

function approvalLabel(type) {
  return String(type || "approval").replace(/_/g, " ");
}

function humanButtonLabel(value, fallback = "Details") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw.length <= 12) return raw;
  const words = raw.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  if (last && last.length <= 12) return last;
  return raw.slice(0, 12);
}

function approvalMessage(approval) {
  const detailLabel = humanButtonLabel(
    approval?.payload?.name || approval?.payload?.title || approval?.type,
    "Details",
  );
  return {
    text: `Paperclip approval needs you.\n• ${approval.type}: ${approval?.payload?.name || "Untitled"} (${approval.status})`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approvals", callback_data: "paperclip_approvals" },
          { text: detailLabel, callback_data: `pc_appr:${approval.id}` },
        ],
        [
          { text: "Custom reply", callback_data: "custom_reply" },
        ],
      ],
    },
  };
}

async function sendTelegram(settings, message) {
  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.chatId,
      text: message.text,
      reply_markup: message.reply_markup,
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(data)}`);
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function notify(settings, dryRun = false) {
  const state = readJson(STATE_PATH, { items: {} });
  const snapshot = await buildSnapshot(settings);
  const nextState = { items: {} };
  const changed = [];

  for (const issue of snapshot.tasks) {
    const key = `issue:${issue.id}`;
    const fingerprint = `${issue.status}|${issue.updatedAt || issue.updated_at || ""}`;
    nextState.items[key] = fingerprint;
    if (state.items[key] !== fingerprint) {
      changed.push({ kind: "issue", payload: issue, fingerprint });
    }
  }

  for (const approval of snapshot.approvals) {
    const key = `approval:${approval.id}`;
    const fingerprint = `${approval.status}|${approval.updatedAt || approval.updated_at || ""}`;
    nextState.items[key] = fingerprint;
    if (state.items[key] !== fingerprint) {
      changed.push({ kind: "approval", payload: approval, fingerprint });
    }
  }

  if (dryRun) {
    printJson({
      changed: changed.map((item) => ({ kind: item.kind, id: item.payload.id, fingerprint: item.fingerprint })),
      totalActionable: snapshot.tasks.length + snapshot.approvals.length,
    });
    return;
  }

  for (const item of changed) {
    const message = item.kind === "issue" ? issueMessage(item.payload) : approvalMessage(item.payload);
    await sendTelegram(settings, message);
  }

  writeJson(STATE_PATH, nextState);
  printJson({
    notified: changed.length,
    totalActionable: snapshot.tasks.length + snapshot.approvals.length,
  });
}

async function main() {
  const settings = getSettings();
  const command = process.argv[2] || "notify";

  switch (command) {
    case "notify":
      await notify(settings, process.argv.includes("--dry-run"));
      return;
    case "tasks":
      printJson((await buildSnapshot(settings)).tasks);
      return;
    case "approvals":
      printJson((await buildSnapshot(settings)).approvals);
      return;
    case "all": {
      const snapshot = await buildSnapshot(settings);
      printJson(snapshot);
      return;
    }
    case "issue": {
      const issueId = process.argv[3];
      if (!issueId) throw new Error("Missing issue id");
      printJson(await loadIssueDetail(settings, issueId));
      return;
    }
    case "approval": {
      const approvalId = process.argv[3];
      if (!approvalId) throw new Error("Missing approval id");
      printJson(await loadApprovalDetail(settings, approvalId));
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
