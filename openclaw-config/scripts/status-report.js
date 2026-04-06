#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");

const DOCKER_SOCKET = "/var/run/docker.sock";

function toMiB(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

function pct(num, den) {
  if (!den) return null;
  return Number(((num / den) * 100).toFixed(1));
}

function readFile(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readMemInfo() {
  const text = readFile("/proc/meminfo");
  if (!text) return null;
  const map = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([^:]+):\s+(\d+)/);
    if (m) map[m[1]] = Number(m[2]) * 1024;
  }
  const total = map.MemTotal || 0;
  const available = map.MemAvailable || 0;
  const used = total - available;
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usedPct: pct(used, total),
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, body };
}

function dockerGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path,
        method: "GET",
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`docker parse failed for ${path}: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getDockerStatus() {
  if (!fs.existsSync(DOCKER_SOCKET)) {
    return { available: false, reason: "docker socket not mounted" };
  }

  const [info, containers] = await Promise.all([
    dockerGet("/info"),
    dockerGet("/containers/json?all=1"),
  ]);

  const interestingNames = new Set([
    "openclaw_gateway",
    "paperclip",
    "paperclip_db",
    "goblin_game",
  ]);

  const selected = containers.filter((c) =>
    c.Names.some((name) => interestingNames.has(name.replace(/^\//, "")))
  );

  const withStats = await Promise.all(
    selected.map(async (container) => {
      const name = container.Names[0].replace(/^\//, "");
      let inspect = null;
      let stats = null;
      try {
        inspect = await dockerGet(`/containers/${container.Id}/json`);
      } catch {}
      try {
        stats = await dockerGet(`/containers/${container.Id}/stats?stream=0`);
      } catch {}

      let cpuPct = null;
      let memUsageBytes = null;
      let memLimitBytes = null;
      let memPct = null;

      if (stats && stats.cpu_stats && stats.precpu_stats) {
        const cpuDelta =
          (stats.cpu_stats.cpu_usage.total_usage || 0) -
          (stats.precpu_stats.cpu_usage.total_usage || 0);
        const systemDelta =
          (stats.cpu_stats.system_cpu_usage || 0) -
          (stats.precpu_stats.system_cpu_usage || 0);
        const cpus =
          stats.cpu_stats.online_cpus ||
          (stats.cpu_stats.cpu_usage.percpu_usage || []).length ||
          1;
        if (cpuDelta > 0 && systemDelta > 0) {
          cpuPct = Number(((cpuDelta / systemDelta) * cpus * 100).toFixed(1));
        }
        memUsageBytes = stats.memory_stats?.usage ?? null;
        memLimitBytes = stats.memory_stats?.limit ?? null;
        memPct =
          memUsageBytes && memLimitBytes ? pct(memUsageBytes, memLimitBytes) : null;
      }

      return {
        name,
        image: container.Image,
        state: container.State,
        status: container.Status,
        health: inspect?.State?.Health?.Status || null,
        ports: container.Ports,
        cpuPct,
        memUsageMiB: memUsageBytes == null ? null : toMiB(memUsageBytes),
        memLimitMiB: memLimitBytes == null ? null : toMiB(memLimitBytes),
        memPct,
      };
    })
  );

  return {
    available: true,
    host: {
      containers: info.Containers,
      running: info.ContainersRunning,
      paused: info.ContainersPaused,
      stopped: info.ContainersStopped,
      images: info.Images,
      cpus: info.NCPU,
      memTotalMiB: toMiB(info.MemTotal || 0),
      serverVersion: info.ServerVersion,
    },
    containers: withStats,
  };
}

async function main() {
  const [gateway, docker] = await Promise.all([
    getJson("http://127.0.0.1:18789/health").catch((err) => ({
      ok: false,
      status: 0,
      body: { error: err.message },
    })),
    getDockerStatus().catch((err) => ({
      available: false,
      reason: err.message,
    })),
  ]);

  const paperclipContainer =
    docker.available &&
    Array.isArray(docker.containers) &&
    docker.containers.find((container) => container.name === "paperclip");

  const paperclip = paperclipContainer
    ? {
        ok:
          paperclipContainer.state === "running" &&
          (paperclipContainer.health === "healthy" || paperclipContainer.health == null),
        status: paperclipContainer.health || paperclipContainer.state,
        body: {
          state: paperclipContainer.state,
          health: paperclipContainer.health,
          status: paperclipContainer.status,
          cpuPct: paperclipContainer.cpuPct,
          memUsageMiB: paperclipContainer.memUsageMiB,
          memPct: paperclipContainer.memPct,
        },
      }
    : {
        ok: false,
        status: "unknown",
        body: { error: "paperclip container not found via docker socket" },
      };

  const mem = readMemInfo();
  const uptimeText = readFile("/proc/uptime");
  const uptimeSeconds = uptimeText ? Number(uptimeText.split(" ")[0]) : null;

  const report = {
    generatedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      uptimeSeconds,
      memory:
        mem && {
          totalMiB: toMiB(mem.totalBytes),
          usedMiB: toMiB(mem.usedBytes),
          availableMiB: toMiB(mem.availableBytes),
          usedPct: mem.usedPct,
        },
    },
    services: {
      gateway: {
        ok: gateway.ok,
        status: gateway.status,
        body: gateway.body,
      },
      paperclip: {
        ok: paperclip.ok,
        status: paperclip.status,
        body: paperclip.body,
      },
    },
    docker,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
