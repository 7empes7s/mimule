#!/usr/bin/env node
// wc-fantasy-topics.mjs — World Cup 2026 fantasy desk topic generator.
//
// Feeds the NewsBites autopipeline a steady stream of *fantasy-relevant* World
// Cup topics so they publish (vertical: sports, AUTO_PUBLISH_VERTICALS=*) and
// flow into GaffrPro's /api/wc-feed (tags + panel_hints teams/country_codes →
// matched to followed players/teams).
//
// Angles: match results/recaps, match previews, standout player performances,
// scouting/value differentials, injury & availability watch, transfer talk.
//
// Topics are grounded in REAL data — the FIFA public calendar (results, fixtures,
// 3-letter country codes) and GaffrPro's stats.json/players.json (top performers,
// value) — so the research/verify stages have facts to work from, not vibes.
//
// Dedup is via a persistent ledger keyed on stable ids (match id, player id +
// round) so a match/player is never re-queued. A per-run cap controls cost.
//
// Usage:
//   node scripts/wc-fantasy-topics.mjs                 # queue up to WC_TOPICS_PER_RUN
//   node scripts/wc-fantasy-topics.mjs --dry-run       # print, queue nothing
//   node scripts/wc-fantasy-topics.mjs --limit=10      # override the per-run cap

import fs from "node:fs";
import path from "node:path";

const FIFA_URL =
  "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=104&language=en";
const PIPELINE_HTTP = process.env.PIPELINE_HTTP || "http://127.0.0.1:3200";
const GAFFR_DATA = process.env.GAFFR_DATA || "/opt/provisioned/gaffrpro/apps/web/src/data";
const LEDGER_PATH = process.env.WC_LEDGER || "/var/lib/mimule/wc-fantasy-ledger.json";
const PER_RUN = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || process.env.WC_TOPICS_PER_RUN || "6",
  10,
);
const DRY_RUN = process.argv.includes("--dry-run");

const log = (...a) => console.log(new Date().toISOString(), "[wc-fantasy]", ...a);

// ── ledger (persistent dedup) ───────────────────────────────────────────────
function loadLedger() {
  try {
    return new Set(JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")).keys ?? []);
  } catch {
    return new Set();
  }
}
function saveLedger(set) {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify({ updated: new Date().toISOString(), keys: [...set] }, null, 2));
  } catch (e) {
    log("WARN could not write ledger:", e.message);
  }
}

// ── data sources ────────────────────────────────────────────────────────────
function teamName(side) {
  const n = side?.TeamName;
  if (Array.isArray(n) && n.length) return n[0].Description;
  return typeof n === "string" ? n : side?.ShortClubName || "";
}

async function fetchFifa() {
  try {
    const res = await fetch(FIFA_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`FIFA ${res.status}`);
    const data = await res.json();
    return data.Results || data.results || [];
  } catch (e) {
    log("WARN FIFA feed unavailable:", e.message);
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(GAFFR_DATA, file), "utf8"));
  } catch {
    return null;
  }
}

// Join GaffrPro stats.json (cumulative points) with players.json (name/team/pos).
function topPerformers(limit = 8) {
  const stats = readJson("stats.json");
  const playersRaw = readJson("players.json");
  if (!stats?.players || !playersRaw) return [];
  const players = playersRaw.players || playersRaw;
  const byId = new Map(players.map((p) => [String(p.id), p]));
  return Object.entries(stats.players)
    .map(([id, s]) => ({ p: byId.get(String(id)), s }))
    .filter((x) => x.p && (x.s.points ?? 0) > 0)
    .sort((a, b) => (b.s.points ?? 0) - (a.s.points ?? 0))
    .slice(0, limit);
}

// High value-for-money picks (points per £m), excluding the obvious stars, as
// differential candidates.
function valuePicks(limit = 6) {
  const stats = readJson("stats.json");
  const playersRaw = readJson("players.json");
  if (!stats?.players || !playersRaw) return [];
  const players = playersRaw.players || playersRaw;
  const byId = new Map(players.map((p) => [String(p.id), p]));
  return Object.entries(stats.players)
    .map(([id, s]) => ({ p: byId.get(String(id)), s }))
    .filter((x) => x.p && (x.s.points ?? 0) >= 4 && x.p.price)
    .map((x) => ({ ...x, value: (x.s.points ?? 0) / x.p.price }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ── topic builders (each yields { key, topic }) ─────────────────────────────
function isFinished(m) {
  return m.MatchStatus === 0 && (m.HomeTeamScore != null || m.AwayTeamScore != null);
}
function isUpcoming(m) {
  return m.MatchStatus !== 0 && new Date(m.Date).getTime() > Date.now();
}
function maxFinishedRound(matches) {
  return matches.filter(isFinished).reduce((mx, m) => Math.max(mx, m.MatchDay || 0), 0) || 1;
}

function resultTopics(matches) {
  return matches
    .filter(isFinished)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date))
    .map((m) => {
      const h = teamName(m.Home), a = teamName(m.Away);
      const hs = m.HomeTeamScore, as = m.AwayTeamScore;
      if (!h || !a) return null;
      return {
        key: `result:${m.IdMatch}`,
        topic: `${h} ${hs}-${as} ${a} at the 2026 FIFA World Cup: match report, standout performers and fantasy takeaways`,
      };
    })
    .filter(Boolean);
}

function previewTopics(matches) {
  return matches
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date))
    .map((m) => {
      const h = teamName(m.Home), a = teamName(m.Away);
      if (!h || !a) return null;
      return {
        key: `preview:${m.IdMatch}`,
        topic: `${h} vs ${a} 2026 FIFA World Cup preview: team news, form, predicted lineups and fantasy picks`,
      };
    })
    .filter(Boolean);
}

function performanceTopics(round) {
  // Prefer marquee names (star flag) — they're the most newsworthy and the most
  // likely to have verifiable coverage, so they survive the research integrity
  // gate. Goals/assists come from real match events; we don't assert GaffrPro's
  // internal fantasy-points number as fact in a news article.
  const top = topPerformers(12);
  const ordered = [...top.filter((x) => x.p.star), ...top.filter((x) => !x.p.star)];
  return ordered.slice(0, 8).map(({ p }) => ({
    key: `perf:${p.id}:md${round}`,
    topic: `${p.name} of ${p.team} at the 2026 FIFA World Cup: form, standout displays and fantasy outlook`,
  }));
}

function transferTopics(round) {
  return topPerformers(3).map(({ p }) => ({
    key: `transfer:${p.id}:md${round}`,
    topic: `${p.name}'s 2026 FIFA World Cup form for ${p.team} fuels transfer speculation: what clubs and fantasy managers should know`,
  }));
}

function scoutingTopics(round) {
  const picks = valuePicks(5);
  const names = picks.slice(0, 3).map((x) => `${x.p.name} (${x.p.team})`).join(", ");
  const out = [
    {
      key: `scout:value:md${round}`,
      topic: `2026 FIFA World Cup fantasy scouting: best-value picks and differentials${names ? ` such as ${names}` : ""}`,
    },
  ];
  for (const pos of ["defender", "midfielder", "forward"]) {
    out.push({
      key: `scout:${pos}:md${round}`,
      topic: `2026 FIFA World Cup fantasy scouting: standout ${pos} options, form and budget differentials`,
    });
  }
  return out;
}

function injuryTopics(matches, round) {
  // Prominent teams = those in the most upcoming fixtures soon, plus top scorers' nations.
  const soon = matches
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date))
    .slice(0, 8);
  const teams = new Set();
  for (const m of soon) {
    teams.add(teamName(m.Home));
    teams.add(teamName(m.Away));
  }
  for (const { p } of topPerformers(4)) teams.add(p.team);
  return [...teams].filter(Boolean).map((t) => ({
    key: `injury:${t}:md${round}`,
    topic: `2026 FIFA World Cup injury and availability update: latest team news and fantasy impact for ${t}`,
  }));
}

// ── queue ───────────────────────────────────────────────────────────────────
async function enqueue(topic) {
  const res = await fetch(`${PIPELINE_HTTP}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "add", topic, vertical: "sports" }),
    signal: AbortSignal.timeout(15000),
  });
  const out = await res.json().catch(() => ({}));
  if (!out.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out.message;
}

async function main() {
  const matches = await fetchFifa();
  const round = maxFinishedRound(matches);
  const ledger = loadLedger();

  // Interleave angles for variety, results first (most fact-grounded & timely).
  const buckets = [
    resultTopics(matches),
    previewTopics(matches),
    performanceTopics(round),
    scoutingTopics(round),
    injuryTopics(matches, round),
    transferTopics(round),
  ];
  const candidates = [];
  for (let i = 0; candidates.length < 200; i++) {
    let added = false;
    for (const b of buckets) {
      if (b[i]) {
        candidates.push(b[i]);
        added = true;
      }
    }
    if (!added) break;
  }

  const fresh = candidates.filter((c) => !ledger.has(c.key));
  log(`round ${round} · ${candidates.length} candidates · ${fresh.length} fresh · cap ${PER_RUN} · ${DRY_RUN ? "DRY RUN" : "live"}`);

  const picked = fresh.slice(0, PER_RUN);
  if (!picked.length) {
    log("nothing fresh to queue.");
    return;
  }

  let queued = 0;
  for (const c of picked) {
    if (DRY_RUN) {
      log(`would queue [${c.key}] ${c.topic}`);
      continue;
    }
    try {
      const msg = await enqueue(c.topic);
      ledger.add(c.key);
      queued++;
      log(`queued [${c.key}] → ${msg}`);
    } catch (e) {
      log(`FAILED [${c.key}]: ${e.message}`);
    }
  }
  if (!DRY_RUN) saveLedger(ledger);
  log(`done — ${queued}/${picked.length} queued.`);
}

main().catch((e) => {
  log("FATAL", e.message);
  process.exit(1);
});
