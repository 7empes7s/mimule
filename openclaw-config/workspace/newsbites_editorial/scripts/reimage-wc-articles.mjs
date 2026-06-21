#!/usr/bin/env node
// reimage-wc-articles.mjs — retroactively give published World Cup articles
// football-specific cover images.
//
// The sports stock-image query used to be generic ("athletics …") so some WC
// articles got wrong-sport photos. The autopipeline is now fixed for new
// articles; this re-images the EXISTING ones. It writes a NEW versioned filename
// ({slug}-fb.jpg) and repoints coverImage, so CDN/browser caches don't serve the
// stale image. The GaffrPro feed (dynamic) reflects it immediately; run
// deploy.sh afterwards so the NewsBites article pages (SSG) pick it up too.
//
// Usage:
//   PEXELS_API_KEY=… node scripts/reimage-wc-articles.mjs --dry-run
//   PEXELS_API_KEY=… node scripts/reimage-wc-articles.mjs [--limit=N]

import fs from "node:fs";
import path from "node:path";

const ARTICLES = "/opt/newsbites/content/articles";
const PUBLIC = "/opt/newsbites/public/images/articles";
const STATE = "/var/lib/mimule/pipeline-state.json";
const PEXELS = process.env.PEXELS_API_KEY;
const DRY = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0", 10);

const SPORTS_BASE = "soccer football match players pitch stadium";
const STOP = new Set("about after again against ahead also among another around asked because become before being between beyond could during every first following found great have having here however inside into later local major makes month more most never news next often only other over part people recent report right says second since should some still such takes than that their them then there these they this through today under until using very want what when where which while will with within without would years your".split(" "));

const log = (...a) => console.log(new Date().toISOString(), "[reimage]", ...a);

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
}
function fmField(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1].trim() : "";
}
function fmTags(fm) {
  const block = fm.match(/^tags:\n([\s\S]*?)(?=^\S|\Z)/m);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*-\s*"?(.*?)"?\s*$/gm)].map((x) => x[1].trim());
}
function isWorldCup(fm, tags) {
  if (tags.some((t) => /world-?cup|wc-?2026/i.test(t))) return true;
  const comp = (fm.match(/competition:\s*"?(.*?)"?\s*$/m) || [])[1] || "";
  return /world\s*cup|fifa-world-cup|wc\s?20?26/i.test(comp);
}

function buildQuery(title, tags) {
  const titleWords = title.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 5 && !STOP.has(w)).slice(0, 3);
  const safeTags = tags.filter((t) => t.length > 4 && !/^[A-Z][a-z]/.test(t) && !/^\d/.test(t)).slice(0, 2);
  return [...new Set([SPORTS_BASE, ...titleWords, ...safeTags])].slice(0, 6).join(" ");
}

async function pexelsPick(query, used) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: PEXELS }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const photos = (await res.json()).photos || [];
  const photo = photos.find((p) => !used.has(p.id)) || photos[0];
  if (!photo) throw new Error("no results");
  const imgUrl = photo.src?.landscape || photo.src?.large2x || photo.src?.large;
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error(`download HTTP ${imgRes.status}`);
  return { id: photo.id, buf: Buffer.from(await imgRes.arrayBuffer()), photographer: photo.photographer, photographerUrl: photo.photographer_url, sourceUrl: photo.url };
}

function yamlEscape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function setFmLine(md, key, value) {
  const line = `${key}: "${value}"`;
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(md.split(/\n---/)[0])) return md.replace(re, line);
  // insert before the closing --- of frontmatter
  return md.replace(/\n---\n/, `\n${line}\n---\n`);
}

// ── World Cup player photos (preferred over stock) ──────────────────────────
// Mirror of the autopipeline's resolver: use the real FIFA headshot of the player
// the article is about, resolved from CAPITALISED tokens in the title/lead.
const GAFFR_DATA = process.env.GAFFR_DATA || "/opt/provisioned/gaffrpro/apps/web/src/data";
const NAME_PARTICLES = new Set(["junior", "filho", "neto", "segundo"]);
let _wcIndex = null;
function wcPlayerIndex() {
  if (_wcIndex !== null) return _wcIndex;
  try {
    const players = JSON.parse(fs.readFileSync(path.join(GAFFR_DATA, "players.json"), "utf8"));
    const roster = players.players || players.squads || players;
    const photos = JSON.parse(fs.readFileSync(path.join(GAFFR_DATA, "stats.json"), "utf8")).photos || {};
    const byKey = new Map(); // surname (or first name if surname is a particle) -> candidate[]
    for (const p of roster) {
      const photo = photos[String(p.id)];
      if (!photo) continue;
      const toks = String(p.name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter((t) => t.length >= 4);
      if (!toks.length) continue;
      const last = toks[toks.length - 1];
      const key = NAME_PARTICLES.has(last) && toks.length > 1 ? toks[0] : last;
      const cand = { name: p.name, team: p.team, photo, tokens: new Set(toks) };
      (byKey.get(key) || byKey.set(key, []).get(key)).push(cand);
    }
    _wcIndex = byKey;
  } catch (e) { log(`roster unavailable: ${e.message}`); _wcIndex = new Map(); }
  return _wcIndex;
}
function capTokens(s) {
  return (String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").match(/\b[A-Z][A-Za-z'’-]*\b/g) || [])
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, "")).filter((w) => w.length >= 4);
}
// Key on the surname; disambiguate shared surnames by full-name overlap (Amad
// Diallo beats other Diallos); a lone ambiguous surname resolves to nobody.
function resolveWcPlayer(title, lead) {
  const byKey = wcPlayerIndex();
  for (const text of [title, lead]) {
    const caps = capTokens(text);
    const capsSet = new Set(caps);
    for (const tok of caps) {
      const cands = byKey.get(tok);
      if (!cands || !cands.length) continue;
      let best = null, bestScore = -1, tie = false;
      for (const c of cands) {
        let score = 0;
        for (const t of c.tokens) if (capsSet.has(t)) score++;
        if (score > bestScore) { best = c; bestScore = score; tie = false; }
        else if (score === bestScore && best && c.name !== best.name) tie = true;
      }
      if (best && !tie) return best;
    }
  }
  return null;
}
async function downloadPlayerPhoto(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error("image too small");
  return { buf, ext };
}

async function main() {
  if (!PEXELS) { log("FATAL: PEXELS_API_KEY not set"); process.exit(1); }
  let used = new Set();
  try { used = new Set(JSON.parse(fs.readFileSync(STATE, "utf8")).usedStockPhotoIds?.pexels || []); } catch {}
  log(`${used.size} Pexels IDs already used site-wide (avoided).`);

  const targets = [];
  for (const file of fs.readdirSync(ARTICLES).filter((f) => f.endsWith(".md"))) {
    const md = fs.readFileSync(path.join(ARTICLES, file), "utf8");
    const fm = frontmatter(md);
    const status = fmField(fm, "status");
    const vertical = fmField(fm, "vertical");
    if (!/^(published|approved)$/.test(status) || vertical !== "sports") continue;
    const tags = fmTags(fm);
    if (!isWorldCup(fm, tags)) continue;
    targets.push({ file, slug: fmField(fm, "slug") || file.replace(/\.md$/, ""), title: fmField(fm, "title"), lead: fmField(fm, "lead"), tags, curCover: fmField(fm, "coverImage") });
  }
  log(`${targets.length} published World Cup articles to re-image${LIMIT ? ` (cap ${LIMIT})` : ""}.`);

  const picked = LIMIT ? targets.slice(0, LIMIT) : targets;
  let done = 0, byPlayer = 0, skipped = 0;
  for (const t of picked) {
    const player = resolveWcPlayer(t.title, t.lead);
    const hasPlayerCover = /-pl\.(png|jpg|jpeg|webp)$/.test(t.curCover || "");
    const hasCover = !!t.curCover;
    // Idempotent: a correctly-resolved player already has their photo → leave it;
    // an article with no player match keeps its existing (football) cover. Only
    // upgrade an article that now resolves to a player but doesn't have one yet.
    if ((player && hasPlayerCover) || (!player && hasCover)) {
      skipped++;
      if (DRY) log(`skip ${t.slug} (${player ? `already ${player.name}` : "no player, keep current"})`);
      continue;
    }
    const query = buildQuery(t.title, t.tags);
    if (DRY) {
      log(player ? `would UPGRADE ${t.slug} ← PLAYER ${player.name} (${player.team})` : `would set ${t.slug} ← stock "${query}"`);
      continue;
    }
    const fp = path.join(ARTICLES, t.file);
    // 1) Prefer the real player's FIFA photo.
    if (player) {
      try {
        const { buf, ext } = await downloadPlayerPhoto(player.photo);
        const outName = `${t.slug}-pl.${ext}`;
        fs.writeFileSync(path.join(PUBLIC, outName), buf);
        const imageSource = JSON.stringify({ type: "player-photo", provider: "fifa", player: player.name, team: player.team, sourceUrl: player.photo });
        let md = fs.readFileSync(fp, "utf8");
        md = setFmLine(md, "coverImage", `/images/articles/${outName}`);
        md = setFmLine(md, "imageSource", yamlEscape(imageSource));
        fs.writeFileSync(fp, md);
        done++; byPlayer++;
        log(`✓ ${t.slug} → PLAYER ${player.name} (${player.team})`);
        continue;
      } catch (e) {
        log(`… ${t.slug}: player photo (${player.name}) failed: ${e.message} — using stock`);
      }
    }
    // 2) Fall back to football stock.
    try {
      const p = await pexelsPick(query, used);
      used.add(p.id);
      const outName = `${t.slug}-fb.jpg`;
      fs.writeFileSync(path.join(PUBLIC, outName), p.buf);
      const imageSource = JSON.stringify({ type: "stock", provider: "pexels", photographer: p.photographer, photographerUrl: p.photographerUrl, sourceUrl: p.sourceUrl });
      let md = fs.readFileSync(fp, "utf8");
      md = setFmLine(md, "coverImage", `/images/articles/${outName}`);
      md = setFmLine(md, "imageSource", yamlEscape(imageSource));
      fs.writeFileSync(fp, md);
      done++;
      log(`✓ ${t.slug} → stock #${p.id} (${p.photographer})`);
      await new Promise((r) => setTimeout(r, 350)); // be gentle on Pexels
    } catch (e) {
      log(`✗ ${t.slug}: ${e.message}`);
    }
  }
  log(`done — ${done}/${picked.length} re-imaged (${byPlayer} player photos, ${done - byPlayer} stock), ${skipped} left unchanged.${DRY ? " (dry run)" : ""}`);
}

main().catch((e) => { log("FATAL", e.message); process.exit(1); });
