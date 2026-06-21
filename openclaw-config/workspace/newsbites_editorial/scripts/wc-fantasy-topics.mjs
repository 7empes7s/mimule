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
import { fileURLToPath } from "node:url";

const FIFA_URL =
  "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=104&language=en";
const PIPELINE_HTTP = process.env.PIPELINE_HTTP || "http://127.0.0.1:3200";
const GAFFR_DATA = process.env.GAFFR_DATA || "/opt/provisioned/gaffrpro/apps/web/src/data";
const LEDGER_PATH = process.env.WC_LEDGER || "/var/lib/mimule/wc-fantasy-ledger.json";
const ARTICLES_DIR = process.env.NEWSBITES_ARTICLES || "/opt/newsbites/content/articles";
// Two stories within this many days about the same (kind + subject) are treated
// as the same event for near-dup suppression.
const DEDUP_WINDOW_DAYS = parseInt(process.env.WC_DEDUP_WINDOW_DAYS || "10", 10);
const DOSSIERS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dossiers");
const PER_RUN = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || process.env.WC_TOPICS_PER_RUN || "6",
  10,
);
// Source-grounded injury/transfer items injected per run (from real reporting).
const SOURCED_PER_RUN = parseInt(process.env.WC_SOURCED_PER_RUN || "4", 10);
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

// ── data-grounded topic builders (each yields { key, topic }) ───────────────
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
        kind: "result",
        topic: `${h} ${hs}-${as} ${a} at the 2026 FIFA World Cup: match report, standout performers and fantasy takeaways`,
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
    kind: "feature",
    topic: `${p.name} of ${p.team} at the 2026 FIFA World Cup: form, standout displays and fantasy outlook`,
  }));
}

// ── real-source ingestion (Google News RSS) ─────────────────────────────────
// Injury & transfer angles die in the research integrity gate when asked to be
// written from the model's memory of a "future" tournament. So we ground them in
// REAL current reporting via Google News RSS search — which surfaces ESPN, BBC,
// The Athletic, Transfermarkt and Fabrizio Romano-sourced stories. For each item
// that names a World Cup player/nation we pre-seed a dossier with the source and
// inject at the research stage, so the desk writes from a real, citable basis.

const NEWS_QUERIES = [
  { kind: "injury", q: '"world cup" (injury OR "ruled out" OR fitness OR doubt OR knock) when:5d' },
  { kind: "transfer", q: '"world cup" (transfer OR "Fabrizio Romano" OR Transfermarkt OR signing) when:5d' },
];

function normWord(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function decodeEntities(s) {
  return (s || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<item>(.*?)<\/item>/gs)]
      .map((m) => {
        const it = m[1];
        const pick = (re) => (it.match(re)?.[1] || "").trim();
        let title = decodeEntities(pick(/<title>(.*?)<\/title>/s));
        const source = decodeEntities(pick(/<source[^>]*>(.*?)<\/source>/s));
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const desc = decodeEntities(pick(/<description>(.*?)<\/description>/s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return { title, source: source || "Google News", desc, link: decodeEntities(pick(/<link>(.*?)<\/link>/s)), date: pick(/<pubDate>(.*?)<\/pubDate>/s) };
      })
      .filter((x) => x.title);
  } catch (e) {
    log(`WARN Google News (${query.slice(0, 28)}…): ${e.message}`);
    return [];
  }
}

// Tokenise to diacritic-folded lowercase words (spaces preserved) for
// word-boundary matching — avoids substring false positives.
function normTokens(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

// Index of WC nations (as token phrases) + player surnames from GaffrPro data,
// so we only act on items that map to our player universe (and thus match in
// GaffrPro's feed).
function wcIndex() {
  const playersRaw = readJson("players.json");
  const players = playersRaw?.players || playersRaw || [];
  const nations = new Map(); // "new zealand" -> { team, code }
  const surnames = new Map(); // "raphinha" -> { team, code, name }
  // Generic name particles that collide across many players — never index alone.
  const GENERIC = new Set(["junior", "silva", "santos", "souza", "pereira", "oliveira", "diallo", "traore"]);
  for (const p of players) {
    nations.set(normTokens(p.team).join(" "), { team: p.team, code: p.code });
    // Index the surname (last name token) only — indexing first names causes
    // collisions (e.g. "Jesse", "Christian" matching unrelated players).
    const toks = normTokens(p.name);
    const last = toks[toks.length - 1];
    if (last && last.length >= 5 && !GENERIC.has(last)) surnames.set(last, { team: p.team, code: p.code, name: p.name });
  }
  return { nations, surnames };
}

// Match a headline to WC teams via whole-word surname + nation-phrase matching.
// We deliberately don't force a player "focus" — the quoted headline already
// names the subject, so the writer centres correctly without us guessing (which
// caused wrong-focus kills when a first name collided with another player's
// surname).
function matchWc(title, idx) {
  const toks = new Set(normTokens(title));
  const phrase = ` ${normTokens(title).join(" ")} `;
  const teams = new Set(), codes = new Set(), surnames = new Set();
  for (const [surname, v] of idx.surnames) {
    if (toks.has(surname)) { teams.add(v.team); codes.add(v.code); surnames.add(surname); }
  }
  for (const [nation, v] of idx.nations) {
    if (nation && phrase.includes(` ${nation} `)) { teams.add(v.team); codes.add(v.code); }
  }
  return { teams: [...teams], codes: [...codes], surnames: [...surnames] };
}

// ── event-signature dedup ───────────────────────────────────────────────────
// The headline-hashed ledger key (`news:<kind>:<title48>`) only catches the SAME
// headline twice. Two different stories about the SAME event — e.g. "Brazil
// confirm Raphinha hamstring injury" and "Raphinha injury uncertainty over
// Brazilian star" — hash differently and each spawn a near-duplicate article.
// An event signature collapses them: it keys on (kind + subject), where the
// subject is the named player(s) when present, else the nation(s). Player
// precedence matters — when a player is named they ARE the event, and different
// headlines about them may or may not also name the country.
function detectKind(title) {
  if (/\b\d{1,2}\s*[-–]\s*\d{1,2}\b/.test(title) && /world\s*cup/i.test(title)) return "result";
  if (/\b(injur|ruled out|fitness|doubt|knock|sidelined|out for|hamstring|setback|recover|return from)/i.test(title)) return "injury";
  if (/\b(transfer|signing|signs|signed|move to|deal|fee|bid|loan|contract|joins?|swoop)/i.test(title)) return "transfer";
  return "feature";
}

function eventSig(kind, match) {
  const subjects = match.surnames.length
    ? [...match.surnames].sort()
    : [...match.codes].map((c) => c.toLowerCase()).sort();
  return `evt:${kind}:${subjects.join("+")}`;
}

// Scan already-published World Cup articles within a recent window and return the
// set of event signatures they already cover, so we never queue a near-dup of a
// story that's already live (caught even if it never passed through our ledger).
function scanExistingSignatures(idx, windowDays) {
  const sigs = new Set();
  const cutoff = Date.now() - windowDays * 86400000;
  let dir;
  try { dir = fs.readdirSync(ARTICLES_DIR); } catch { return sigs; }
  for (const file of dir) {
    if (!file.endsWith(".md")) continue;
    let md;
    try { md = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf8"); } catch { continue; }
    const fm = (md.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
    const status = (fm.match(/^status:\s*"?(\w+)"?/m) || [])[1] || "";
    if (!/^(published|approved)$/.test(status)) continue;
    const title = (fm.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
    const dateStr = (fm.match(/^date:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
    const isWc = /world\s*cup|fifa-world-cup/i.test(fm) || /world\s*cup/i.test(title);
    if (!isWc || !title) continue;
    const t = new Date(dateStr).getTime();
    if (!isNaN(t) && t < cutoff) continue; // outside the near-dup window
    const match = matchWc(title, idx);
    if (!match.surnames.length && !match.codes.length) continue;
    sigs.add(eventSig(detectKind(title), match));
  }
  return sigs;
}

// Vague/listicle headlines have no single verifiable claim and reliably die in
// the research gate (or mis-focus). Skip them.
const SKIP_TITLE = /\b(tracker|latest updates?|round-?up|live blog|live updates?|everything you need|player ratings|ratings|quiz|who am i|how do|how to watch|watch:|in pictures|gallery|predictions?|odds|tv schedule|highlights|injury[- ]time|best (goals|moments)|talking points)\b/i;

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80).replace(/-+$/, "");
}

// Build a dossier seeded with the real source, mirroring the autopipeline's
// manual-dossier skeleton, and return its dir + slug for injection at research.
function buildSourcedDossier(item, match, kind) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = slugify(`${kind} ${item.title}`) || `wc-${kind}-${Date.now()}`;
  const dossierDir = path.join(DOSSIERS_ROOT, dateStr, slug);
  fs.mkdirSync(dossierDir, { recursive: true });

  const teamsLine = match.teams.join(", ");
  const codesLine = match.codes.join(",");
  const focus = teamsLine ? ` for ${teamsLine}` : "";
  const brief =
    `Based strictly on this report (${item.source}, ${item.date || dateStr}): "${item.title}". ` +
    `Write a 2026 FIFA World Cup fantasy ${kind} analysis${focus}, centred on the player/subject named in that headline: confirm the situation from the cited source, ` +
    `explain what it means and the fantasy impact for managers. Do not invent any detail beyond the cited reporting; ` +
    `if the report is thin, keep the piece tight rather than padding with speculation.`;

  const sourceDate = (() => { const d = new Date(item.date); return isNaN(d) ? new Date().toISOString() : d.toISOString(); })();
  const sourceSummary = item.desc && item.desc.length > item.title.length ? item.desc : item.title;
  const sources = [{ url: item.link, type: "news", publisher: item.source, date: sourceDate, why_it_matters: sourceSummary }];

  const dossierMd = `# Story Dossier

## Story Identity
- Slug: ${slug}
- Working headline: ${item.title}
- Vertical: sports
- Story owner: small-model desk
- Created: ${new Date().toISOString()}
- Last updated: ${new Date().toISOString()}
- Status:
  - researching

## Editorial Brief (Manual Lead)
${brief}

## Why This Story Matters
- Public importance: World Cup ${kind} news with direct fantasy relevance
- News value: ${item.source} reporting
- Why now: ${dateStr}
- Why NewsBites should cover it: Fantasy desk assignment grounded in the cited report

## Core Angle
- One-sentence framing: TODO — complete from the cited source
- What the story is not: speculation beyond the cited reporting

## Claim Table
| Claim | Source(s) | Evidence quality | Confidence | Notes |
|---|---|---|---|---|
| ${item.title} | ${item.source} | secondary | medium | verify against the cited URL |

## Primary Sources
- URL: ${item.link}
  - Type: news
  - Publisher: ${item.source}
  - Date: ${sourceDate}
  - Notes: Seeded by the WC fantasy desk. Verify and expand from this report.

## Panel Signals
- competition: fifa-world-cup
- teams: ${teamsLine}
- country_codes: ${codesLine}

## Drafting Notes
- (to be filled during research and write stages)

## Research Notes
- Seed report: "${item.title}" — ${item.source} (${item.date || dateStr}). Confirm and build on this.
${item.desc && item.desc !== item.title ? `- Summary: ${item.desc}` : ""}
`;

  const taskMd = `# Story Task

Story:
- title: ${item.title}
- slug: ${slug}
- vertical: sports
- story date: ${dateStr}
- dossier path: ${dossierDir}

Editorial brief:
${brief}

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
- one sentence, 16-28 words, user-facing nutshell, not article prose
`;

  const stub = (extra) => `---
title: "TODO"
slug: ${slug}
date: "${dateStr}"
vertical: sports
tags:
  - "sports"
status: draft
lead: "TODO - one factual sentence after research is complete."
digest: "TODO - one sentence, 16-28 words, user-facing nutshell."
coverImage: ""
author: "NewsBites Desk"
---

## What happened

TODO
${extra}
## Why it matters

TODO
`;

  fs.writeFileSync(path.join(dossierDir, "DOSSIER.md"), dossierMd);
  fs.writeFileSync(path.join(dossierDir, "TASK.md"), taskMd);
  fs.writeFileSync(path.join(dossierDir, "sources.json"), JSON.stringify(sources, null, 2));
  fs.writeFileSync(path.join(dossierDir, "publish.md"), stub("\n"));
  fs.writeFileSync(path.join(dossierDir, "draft.md"), stub("\n## Background\n\nTODO\n\n"));
  return { dossierDir, slug };
}

// ── queue ───────────────────────────────────────────────────────────────────
async function postCommand(body) {
  const res = await fetch(`${PIPELINE_HTTP}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const out = await res.json().catch(() => ({}));
  if (!out.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out.message;
}

function interleave(buckets) {
  const out = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const b of buckets) if (b[i]) { out.push(b[i]); added = true; }
    if (!added) break;
  }
  return out;
}

async function main() {
  const matches = await fetchFifa();
  const round = maxFinishedRound(matches);
  const ledger = loadLedger();
  const idx = wcIndex();

  // Event signatures already covered: by the persistent ledger AND by articles
  // already live on the site (the latter catches near-dups our ledger never saw,
  // e.g. pre-ledger or from another source). `sigSeen` also collapses two
  // candidates for the same event inside a single run.
  const existingSigs = scanExistingSignatures(idx, DEDUP_WINDOW_DAYS);
  const sigSeen = new Set();
  const dupSig = (sig) => sigSeen.has(sig) || ledger.has(sig) || existingSigs.has(sig);

  // 1) Data-grounded angles that survive the research gate: match results +
  //    star-player performances. Queued via cmd:add (creates dossier at research).
  let dupData = 0;
  const dataFresh = interleave([resultTopics(matches), performanceTopics(round)])
    .filter((c) => !ledger.has(c.key))
    .filter((c) => {
      c.sig = eventSig(c.kind, matchWc(c.topic, idx));
      if (dupSig(c.sig)) { dupData++; return false; }
      sigSeen.add(c.sig);
      return true;
    })
    .slice(0, PER_RUN);

  // 2) Source-grounded injury/transfer from real reporting, injected at research.
  const sourced = [];
  const seen = new Set();
  let dupSourced = 0;
  for (const { kind, q } of NEWS_QUERIES) {
    for (const item of await fetchGoogleNews(q)) {
      if (SKIP_TITLE.test(item.title)) continue; // vague/listicle → dies in research
      const match = matchWc(item.title, idx);
      if (!match.teams.length) continue; // must map to a WC player/nation
      const key = `news:${kind}:${normWord(item.title).slice(0, 48)}`;
      if (ledger.has(key) || seen.has(key)) continue;
      seen.add(key);
      const sig = eventSig(kind, match);
      if (dupSig(sig)) { dupSourced++; continue; } // near-dup of an existing/queued event
      sigSeen.add(sig);
      sourced.push({ key, sig, kind, item, match });
    }
  }
  const sourcedPicked = sourced.slice(0, SOURCED_PER_RUN);

  log(`round ${round} · data-grounded ${dataFresh.length} · sourced ${sourcedPicked.length}/${sourced.length} · skipped near-dups: data ${dupData}, sourced ${dupSourced} (${existingSigs.size} live sigs) · ${DRY_RUN ? "DRY RUN" : "live"}`);

  let queued = 0;
  for (const c of dataFresh) {
    if (DRY_RUN) { log(`would add [${c.key}] ${c.topic}`); continue; }
    try {
      const msg = await postCommand({ cmd: "add", topic: c.topic, vertical: "sports" });
      ledger.add(c.key); if (c.sig) ledger.add(c.sig); queued++; log(`added [${c.key}] → ${msg}`);
    } catch (e) { log(`FAILED [${c.key}]: ${e.message}`); }
  }
  for (const s of sourcedPicked) {
    if (DRY_RUN) {
      log(`would inject [${s.key}] (${s.item.source}) "${s.item.title}" → ${s.match.teams.join(", ")}`);
      continue;
    }
    try {
      const { dossierDir, slug } = buildSourcedDossier(s.item, s.match, s.kind);
      const msg = await postCommand({ cmd: "inject", dossierDir, stage: "research", slug });
      ledger.add(s.key); if (s.sig) ledger.add(s.sig); queued++; log(`injected [${s.key}] (${s.item.source}) → ${msg}`);
    } catch (e) { log(`FAILED [${s.key}]: ${e.message}`); }
  }

  if (!DRY_RUN) saveLedger(ledger);
  log(`done — ${queued} queued.`);
}

// Pure helpers exported for unit tests; the pipeline run only fires when the
// script is executed directly (not when imported).
export { detectKind, eventSig, matchWc, wcIndex, scanExistingSignatures };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log("FATAL", e.message);
    process.exit(1);
  });
}
