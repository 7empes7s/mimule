#!/usr/bin/env node

const DEFAULT_COMPANY_ID = "92de899d-c83d-49bb-9d96-7f98b85ec5fb";
const DEFAULT_API_BASE = "http://host.docker.internal:3100/api";

function getSettings() {
  const apiBase = process.env.PAPERCLIP_API_BASE || DEFAULT_API_BASE;
  const companyId = process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID;
  const boardApiKey = process.env.PAPERCLIP_BOARD_API_KEY || null;

  if (!boardApiKey) {
    throw new Error("Missing PAPERCLIP_BOARD_API_KEY");
  }

  return { apiBase, companyId, boardApiKey };
}

async function paperclipGet(settings, pathName) {
  return paperclipRequest(settings, "GET", pathName);
}

async function paperclipRequest(settings, method, pathName, body = undefined) {
  const normalizedPath = pathName.startsWith("/") ? pathName.slice(1) : pathName;
  const url = new URL(normalizedPath, settings.apiBase.endsWith("/") ? settings.apiBase : `${settings.apiBase}/`);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${settings.boardApiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`Paperclip ${method} ${url.pathname} failed: ${response.status} ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function buildSnapshot(settings) {
  const [tasks, approvals] = await Promise.all([
    paperclipGet(
      settings,
      `companies/${settings.companyId}/issues?assigneeUserId=me&unreadForUserId=me&status=backlog,todo,in_progress,in_review,blocked`,
    ),
    paperclipGet(settings, `companies/${settings.companyId}/approvals?status=pending`),
  ]);
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
  const [approval, issues] = await Promise.all([
    paperclipGet(settings, `approvals/${approvalId}`),
    paperclipGet(settings, `approvals/${approvalId}/issues`),
  ]);
  return {
    approval,
    issues: Array.isArray(issues) ? issues : [],
  };
}

async function applyApprovalAction(settings, approvalId, decision) {
  switch (decision) {
    case "approve":
      return paperclipRequest(settings, "POST", `approvals/${approvalId}/approve`, {
        decisionNote: "Approved from Telegram via Mimule.",
      });
    case "revision":
      return paperclipRequest(settings, "POST", `approvals/${approvalId}/request-revision`, {
        decisionNote: "Requesting changes from Telegram via Mimule.",
      });
    case "reject":
      return paperclipRequest(settings, "POST", `approvals/${approvalId}/reject`, {
        decisionNote: "Rejected from Telegram via Mimule.",
      });
    default:
      throw new Error(`Unsupported approval decision: ${decision}`);
  }
}

function button(text, callback_data) {
  return { text, callback_data };
}

function action(message, buttons) {
  return {
    action: "send",
    channel: "telegram",
    message,
    buttons,
  };
}

function compactType(type) {
  return String(type || "approval");
}

function needsVerb(count) {
  return count === 1 ? "needs" : "need";
}

function moneyFromCents(value) {
  if (!Number.isFinite(value)) return null;
  return `$${Math.round(value / 100)}/mo`;
}

function oneLine(value, fallback = "Untitled") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function humanButtonLabel(value, fallback = "Details") {
  const raw = oneLine(value, "");
  if (!raw) return fallback;
  if (raw.length <= 12) return raw;
  const words = raw.split(" ").filter(Boolean);
  const last = words[words.length - 1] || "";
  if (last && last.length <= 12) return last;
  return raw.slice(0, 12);
}

function issueLine(issue) {
  const prefix = issue.identifier ? `${issue.identifier}: ` : "";
  return `• ${prefix}${oneLine(issue.title)} (${issue.status})`;
}

function approvalLine(approval) {
  return `• ${compactType(approval.type)}: ${oneLine(approval?.payload?.name)} (${approval.status})`;
}

function backlogScreen(snapshot) {
  const taskCount = snapshot.tasks.length;
  const approvalCount = snapshot.approvals.length;
  if (taskCount === 0 && approvalCount === 0) {
    return action("Paperclip backlog is clear.\nNo approvals or tasks need you right now.", [
      [button("Back home", "back_home"), button("Custom reply", "custom_reply")],
    ]);
  }
  const message = [
    "Paperclip backlog ready.",
    `${approvalCount} approval${approvalCount === 1 ? "" : "s"} ${needsVerb(approvalCount)} you.`,
    `${taskCount} task${taskCount === 1 ? "" : "s"} ${needsVerb(taskCount)} you.`,
  ].join("\n");
  return action(message, [
    [button("Tasks", "paperclip_tasks"), button("Approvals", "paperclip_approvals")],
    [button("Back home", "back_home"), button("Custom reply", "custom_reply")],
  ]);
}

function taskListScreen(tasks) {
  if (tasks.length === 0) {
    return action("No Paperclip tasks need you right now.", [
      [button("Approvals", "paperclip_approvals"), button("Back home", "back_home")],
    ]);
  }

  const lines = [`${tasks.length} Paperclip task${tasks.length === 1 ? "" : "s"} ${needsVerb(tasks.length)} you.`];
  for (const issue of tasks.slice(0, 3)) {
    lines.push(issueLine(issue));
  }

  const detailButtons = tasks.slice(0, 2).map((issue) =>
    button(humanButtonLabel(issue.identifier || issue.title, "Task"), `pc_issue:${issue.id}`),
  );
  const buttons = [];
  if (detailButtons.length > 0) buttons.push(detailButtons);
  buttons.push([button("Approvals", "paperclip_approvals"), button("Back home", "back_home")]);

  return action(lines.join("\n"), buttons);
}

function approvalListScreen(approvals) {
  if (approvals.length === 0) {
    return action("No Paperclip approvals need you right now.", [
      [button("Tasks", "paperclip_tasks"), button("Back home", "back_home")],
    ]);
  }

  const lines = [`${approvals.length} Paperclip approval${approvals.length === 1 ? "" : "s"} ${needsVerb(approvals.length)} you.`];
  for (const approval of approvals.slice(0, 3)) {
    lines.push(approvalLine(approval));
  }

  const detailButtons = approvals.slice(0, 2).map((approval) =>
    button(
      humanButtonLabel(approval?.payload?.name || approval?.payload?.title || approval.type, "Approval"),
      `pc_appr:${approval.id}`,
    ),
  );
  const buttons = [];
  if (detailButtons.length > 0) buttons.push(detailButtons);
  buttons.push([button("Tasks", "paperclip_tasks"), button("Back home", "back_home")]);

  return action(lines.join("\n"), buttons);
}

function issueDetailScreen(detail) {
  const { issue, comments, approvals } = detail;
  const lines = [
    `${issue.identifier ? `${issue.identifier} - ` : ""}${oneLine(issue.title)}`,
    `Status: ${issue.status}${issue.priority ? ` · Priority: ${issue.priority}` : ""}.`,
  ];
  if (comments.length > 0 && comments[0]?.body) {
    lines.push(`Latest: ${oneLine(comments[0].body).slice(0, 90)}`);
  } else if (approvals.length > 0) {
    lines.push(`${approvals.length} approval${approvals.length === 1 ? "" : "s"} linked.`);
  }

  return action(lines.join("\n"), [
    [button("Back to tasks", "paperclip_tasks"), button("Back home", "back_home")],
    [button("Custom reply", "custom_reply")],
  ]);
}

function approvalDetailScreen(detail) {
  const { approval, issues } = detail;
  const payload = approval?.payload || {};
  const heartbeat = payload?.runtimeConfig?.heartbeat || {};
  const adapter = payload?.adapterType || payload?.requestedConfigurationSnapshot?.adapterType || "unknown";
  const notes = [
    `adapter=${adapter}`,
    heartbeat.wakeOnDemand ? "heartbeat wake-on-demand" : "heartbeat manual",
    moneyFromCents(payload?.budgetMonthlyCents),
  ].filter(Boolean).join(", ");

  const lines = [
    `Approval: ${compactType(approval.type)} - ${oneLine(payload.name)} (${approval.status})`,
    `Notes: ${notes}.`,
  ];

  if (payload?.adapterConfig?.dangerouslyBypassApprovalsAndSandbox) {
    lines.push("Risk: bypass approvals/sandbox is enabled.");
  } else if (issues.length > 0) {
    lines.push(`${issues.length} linked issue${issues.length === 1 ? "" : "s"}.`);
  }

  return action(lines.join("\n"), [
    [button("Approve", `pc_appr_ok:${approval.id}`), button("Changes", `pc_appr_rev:${approval.id}`)],
    [button("Reject", `pc_appr_no:${approval.id}`), button("Back to approvals", "paperclip_approvals")],
    [button("Back home", "back_home"), button("Custom reply", "custom_reply")],
  ]);
}

function approvalActionScreen(approval, decision) {
  const label = oneLine(approval?.payload?.name);
  const status = oneLine(approval?.status, "updated");
  const firstLine =
    decision === "approve"
      ? `Approved: ${label}.`
      : decision === "revision"
        ? `Changes requested: ${label}.`
        : `Rejected: ${label}.`;

  const secondLine = `Approval is now ${status}.`;
  const thirdLine =
    decision === "approve"
      ? "The agent can move forward."
      : decision === "revision"
        ? "Paperclip can revise and resubmit."
        : "This request is closed unless resubmitted.";

  return action([firstLine, secondLine, thirdLine].join("\n"), [
    [button("Backlog", "paperclip_backlog"), button("Approvals", "paperclip_approvals")],
    [button("Back home", "back_home"), button("Custom reply", "custom_reply")],
  ]);
}

function errorScreen(message, backCallback = "paperclip_backlog") {
  return action(`Paperclip action failed.\n${oneLine(message, "Unknown error")}`, [
    [button("Back", backCallback), button("Back home", "back_home")],
    [button("Custom reply", "custom_reply")],
  ]);
}

async function main() {
  const settings = getSettings();
  const callback = process.argv[2];

  if (!callback) {
    throw new Error("Usage: paperclip-telegram.js <callback>");
  }

  let result;
  if (callback === "paperclip_backlog") {
    result = backlogScreen(await buildSnapshot(settings));
  } else if (callback === "paperclip_tasks") {
    result = taskListScreen((await buildSnapshot(settings)).tasks);
  } else if (callback === "paperclip_approvals") {
    result = approvalListScreen((await buildSnapshot(settings)).approvals);
  } else if (callback.startsWith("pc_issue:")) {
    result = issueDetailScreen(await loadIssueDetail(settings, callback.slice("pc_issue:".length)));
  } else if (callback.startsWith("pc_appr:")) {
    result = approvalDetailScreen(await loadApprovalDetail(settings, callback.slice("pc_appr:".length)));
  } else if (callback.startsWith("pc_appr_ok:")) {
    const approvalId = callback.slice("pc_appr_ok:".length);
    const approval = await applyApprovalAction(settings, approvalId, "approve");
    result = approvalActionScreen(approval, "approve");
  } else if (callback.startsWith("pc_appr_rev:")) {
    const approvalId = callback.slice("pc_appr_rev:".length);
    const approval = await applyApprovalAction(settings, approvalId, "revision");
    result = approvalActionScreen(approval, "revision");
  } else if (callback.startsWith("pc_appr_no:")) {
    const approvalId = callback.slice("pc_appr_no:".length);
    const approval = await applyApprovalAction(settings, approvalId, "reject");
    result = approvalActionScreen(approval, "reject");
  } else {
    throw new Error(`Unsupported callback: ${callback}`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const rendered = errorScreen(error.message);
  process.stdout.write(`${JSON.stringify(rendered, null, 2)}\n`);
  process.exit(0);
});
