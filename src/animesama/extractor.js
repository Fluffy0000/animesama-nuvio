/**
 * Extractor for Anime-Sama — ported from the local Node.js scraper.
 *
 * Flow:
 *  1. Fetch the catalogue page and parse panneauAnime("name", "path") panels.
 *  2. Keep panels matching the requested season (saisonN) or film, all languages.
 *  3. For each panel, fetch the panel page, locate the episodes.js <script> tag
 *     (it carries a cache-busting query), then fetch its source.
 *  4. Parse "var epsN = [...]" arrays positionally (index = episode number),
 *     normalize and filter embed URLs to playable hosts.
 *
 * No vm/https/zlib: everything is fetch + regex so it runs under Hermes.
 */

import { getBase, resolveBase, USER_AGENT, fetchText, fetchEpisodesJs, searchSlugs, slugify, safeSetTimeout, safeClearTimeout } from "./http.js";

const MAX_BUDGET_MS = 20000;

const ALLOWED_HOST_PATTERNS = [
  /(^|\.)vidmoly\./i,
  /(^|\.)oneupload\./i,
  /(^|\.)smoothpre\./i,
  /(^|\.)sibnet\./i,
  /(^|\.)sendvid\./i,
  /(^|\.)vk\.com$/i,
  /(^|\.)vkvideo\.ru$/i,
];

const PREFERRED_HOSTS = ["vidmoly.biz", "video.sibnet.ru", "smoothpre.com"];

// VOSTFR listed first so it groups above VF by default (see langRank/sort).
const LANGS = ["vostfr", "vf"];

function langRank(lang) {
  const l = (lang || "").toUpperCase();
  if (l === "VOSTFR") return 0;
  if (l === "VF") return 1;
  return 2;
}

// Hosts we can turn into a direct playable URL. Others are skipped so we never
// build a candidate we can't resolve.
const RESOLVABLE_PLAYERS = { Vidmoly: 1, Sibnet: 1, Smoothpre: 1, Sendvid: 1 };

// Preferred players on equal quality (resolved URLs point at CDNs, so we rank
// by the player name rather than the final host).
const PREFERRED_PLAYERS = ["Vidmoly", "Smoothpre", "Sibnet", "Sendvid"];
function playerRank(player) {
  const idx = PREFERRED_PLAYERS.indexOf(player);
  return idx === -1 ? PREFERRED_PLAYERS.length : idx;
}

// ---------------------------------------------------------------------------
// URL helpers (no URL class: Hermes/RN URL support is unreliable)
// ---------------------------------------------------------------------------

function getHostname(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(url || "");
  return m ? m[1].toLowerCase() : "";
}

export function normalizeEmbedUrl(raw) {
  if (!raw) return "";
  let url = String(raw).trim();
  if (!/^https?:\/\//i.test(url)) return "";
  const hashIndex = url.indexOf("#");
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  // vidmoly.to / vidmoly.net redirect to vidmoly.biz — normalize upfront
  url = url.replace(/^(https?:\/\/)(www\.)?vidmoly\.(to|net)/i, "$1vidmoly.biz");
  return url;
}

export function isAllowedEmbedHost(url) {
  const hostname = getHostname(url);
  if (!hostname) return false;
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(hostname));
}

function hostRank(url) {
  const idx = PREFERRED_HOSTS.indexOf(getHostname(url));
  return idx === -1 ? PREFERRED_HOSTS.length : idx;
}

export function getPlayerName(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("sibnet")) return "Sibnet";
  if (u.includes("vidmoly")) return "Vidmoly";
  if (u.includes("sendvid")) return "Sendvid";
  if (u.includes("oneupload") || u.includes("uqload")) return "Uqload";
  if (u.includes("smoothpre")) return "Smoothpre";
  if (u.includes("vk.com") || u.includes("vkvideo")) return "VK";
  return "Player";
}

// ---------------------------------------------------------------------------
// Catalogue page -> panels
// ---------------------------------------------------------------------------

export function extractPanels(html, slug) {
  const panels = [];
  const seen = {};
  // Use a backreference for the quote so apostrophes inside a double-quoted
  // name (e.g. "Train de l'infini") don't cut the match short.
  const re = /panneauAnime\s*\(\s*(["'])([\s\S]*?)\1\s*,\s*(["'])([\s\S]*?)\3\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[2].trim();
    const path = m[4].trim().replace(/^\/+|\/+$/g, "");
    if (!name || !path) continue;
    if (!/^(saison\d|film|oav|ova)/i.test(path)) continue;
    const url = getBase() + "/catalogue/" + slug + "/" + path + "/";
    if (seen[url]) continue;
    seen[url] = true;
    panels.push({ name, path, url });
  }
  return panels;
}

function panelMatchesRequest(path, season, isMovie) {
  const p = path.toLowerCase();
  if (isMovie) return /^film(\d|\/|$)/.test(p);
  const m = /^saison(\d+)/.exec(p);
  return m !== null && parseInt(m[1], 10) === season;
}


// ---------------------------------------------------------------------------
// Panel page -> episodes.js source
// ---------------------------------------------------------------------------

async function loadEpisodesJs(panelUrl) {
  let scriptUrl = null;
  try {
    const html = await fetchText(panelUrl, {}, 8000);
    const m = /<script[^>]+src=["']([^"']*episodes\.js[^"']*)["']/i.exec(html);
    if (m) {
      const src = m[1].trim();
      if (/^https?:\/\//i.test(src)) scriptUrl = src;
      else if (src.charAt(0) === "/") scriptUrl = getBase() + src;
      else scriptUrl = panelUrl + src;
    }
  } catch (e) { /* fall through to the guessed URL */ }
  if (!scriptUrl) scriptUrl = panelUrl + "episodes.js";
  try { return await fetchText(scriptUrl, {}, 8000); }
  catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// episodes.js source -> per-player URL arrays (positional!)
// ---------------------------------------------------------------------------

export function parseEpisodesJs(jsContent) {
  if (!jsContent) return [];
  const results = [];
  const varRegex = /var\s+(eps\d+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
  let match;
  while ((match = varRegex.exec(jsContent)) !== null) {
    // Keep every quoted entry, including empty ones, so that the array index
    // still maps to the episode number.
    const urls = [];
    const entryRegex = /['"]([^'"]*)['"]/g;
    let em;
    while ((em = entryRegex.exec(match[2])) !== null) {
      const direct = /https?:\/\/[^\s"'`)\]>]+/i.exec(em[1]);
      urls.push(direct ? direct[0] : "");
    }
    if (urls.some((u) => u !== "")) {
      results.push({ varName: match[1], urls });
    }
  }
  results.sort((a, b) => {
    const na = parseInt(a.varName.replace("eps", ""), 10);
    const nb = parseInt(b.varName.replace("eps", ""), 10);
    return na - nb;
  });
  return results;
}

// index is 0-based into each eps array; label is shown in the stream title.
function buildCandidates(parsedArrays, lang, index, label) {
  const streams = [];
  const seen = {};
  for (const arr of parsedArrays) {
    const url = normalizeEmbedUrl(arr.urls[index]);
    if (!url || seen[url]) continue;
    if (!isAllowedEmbedHost(url)) continue;
    const player = getPlayerName(url);
    if (!RESOLVABLE_PLAYERS[player]) continue; // skip hosts we can't resolve
    seen[url] = true;
    // embedUrl is the player page; resolved to a direct file later.
    streams.push({
      embedUrl: url,
      player,
      lang: lang.toUpperCase(),
      label,
    });
  }
  streams.sort((a, b) => hostRank(a.embedUrl) - hostRank(b.embedUrl));
  return streams;
}

// ---------------------------------------------------------------------------
// Films inside a series catalogue (e.g. /dragon-ball-super/film/vostfr/).
// The film page lists movie names in order via newSPF("..."); we match the
// requested movie title to the right index.
// ---------------------------------------------------------------------------

function normText(s) {
  // slugify strips accents/punctuation; turn back into spaced words.
  return slugify(String(s || "")).replace(/-/g, " ").trim();
}

function extractFilmNames(html) {
  const names = [];
  // Backreferenced quote so apostrophes inside the name survive (l'Infini).
  const re = /newSPF\(\s*(["'])([\s\S]*?)\1\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) names.push(m[2]);
  return names;
}

// How strongly a film name matches any of the movie's titles (0 = no match).
function filmNameScore(name, titles) {
  const f = normText(name);
  if (!f) return 0;
  let best = 0;
  for (const raw of titles) {
    const t = normText(raw);
    if (!t) continue;
    let score = 0;
    if (t === f) score = 100 + f.length;
    else if ((" " + t + " ").indexOf(" " + f + " ") >= 0) score = 50 + f.length;
    else if ((" " + f + " ").indexOf(" " + t + " ") >= 0) score = 40 + t.length;
    else {
      const ft = f.split(" ");
      const tt = {};
      for (const w of t.split(" ")) tt[w] = true;
      let ov = 0;
      for (const w of ft) if (w.length > 2 && tt[w]) ov += w.length;
      score = ov;
    }
    if (score > best) best = score;
  }
  return best;
}

function maxArrayLen(parsedArrays) {
  let n = 0;
  for (const a of parsedArrays) n = Math.max(n, a.urls.length);
  return n;
}

// ---------------------------------------------------------------------------
// Embed resolution: player page -> direct .mp4 / .m3u8 URL
// Nuvio's player cannot open the embed HTML pages, so every stream must be a
// direct file before it is returned.
// ---------------------------------------------------------------------------

function firstMatch(text, re) {
  const m = re.exec(text);
  return m ? m[1] : "";
}

// Height (px) -> human label. Used both for display and for sorting.
function qualityLabel(height) {
  if (!height) return "HD";
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return height + "p";
}

// Fetch an HLS master playlist once: confirms it is live (#EXT present) and
// returns the highest advertised resolution. This single fetch doubles as the
// liveness check for HLS hosts (no second request that CDNs would rate-limit).
async function fetchHlsInfo(masterUrl, referer) {
  try {
    const pl = await fetchText(masterUrl, { headers: { "Referer": referer, "User-Agent": USER_AGENT } }, 6000);
    if (pl.indexOf("#EXT") === -1) return { ok: false, height: 0 };
    let best = 0, m;
    const re = /RESOLUTION=\d+x(\d+)/gi;
    while ((m = re.exec(pl)) !== null) best = Math.max(best, parseInt(m[1], 10));
    return { ok: true, height: best };
  } catch (e) { return { ok: false, height: 0 }; }
}

// Dean Edwards p,a,c,k,e,d unpacker (pure JS, no eval) — used by Smoothpre and
// other JWPlayer-based hosts that pack their sources config.
function unpackPacked(src) {
  const m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const a = parseInt(m[2], 10);
  let c = parseInt(m[3], 10);
  const k = m[4].split("|");
  if (a > 36) return ""; // radix beyond toString support; skip rather than corrupt
  while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); }
  return p;
}

async function resolveVidmoly(embedUrl) {
  const html = await fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8000);
  const file = firstMatch(html, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (!file) return null;
  const info = await fetchHlsInfo(file, "https://vidmoly.biz/");
  if (!info.ok) return null; // playlist unreachable -> treat as dead
  return { url: file, quality: qualityLabel(info.height), height: info.height || 720,
    headers: { "Referer": "https://vidmoly.biz/", "User-Agent": USER_AGENT } };
}

async function resolveSmoothpre(embedUrl) {
  const html = await fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8000);
  let file = firstMatch(html, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (!file) {
    const un = unpackPacked(html);
    file = firstMatch(un, /file:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
      firstMatch(un, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i) ||
      firstMatch(un, /(https?:\/\/[^"'\\ ]+\.m3u8[^"'\\ ]*)/i);
  }
  if (!file) return null;
  const info = await fetchHlsInfo(file, "https://smoothpre.com/");
  if (!info.ok) return null;
  return { url: file, quality: qualityLabel(info.height), height: info.height || 720,
    headers: { "Referer": "https://smoothpre.com/", "User-Agent": USER_AGENT } };
}

async function resolveSibnet(embedUrl) {
  const html = await fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8000);
  let path = firstMatch(html, /player\.src\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /["'](\/v\/[^"']+\.mp4)["']/i);
  if (!path) return null;
  if (path.charAt(0) === "/") path = "https://video.sibnet.ru" + path;
  return { url: path, quality: "HD", height: 720,
    headers: { "Referer": "https://video.sibnet.ru/", "User-Agent": USER_AGENT } };
}

async function resolveSendvid(embedUrl) {
  const html = await fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8000);
  const file = firstMatch(html, /og:video["']\s+content=["']([^"']+)["']/i) ||
    firstMatch(html, /source\s+src=["']([^"']+\.mp4[^"']*)["']/i) ||
    firstMatch(html, /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (!file) return null;
  const height = parseInt(firstMatch(html, /og:video:height["']\s+content=["'](\d+)["']/i), 10) || 0;
  return { url: file.replace(/&amp;/g, "&"), quality: qualityLabel(height), height: height || 720,
    headers: { "Referer": "https://sendvid.com/", "User-Agent": USER_AGENT } };
}

async function resolveEmbed(embedUrl, player) {
  try {
    if (player === "Vidmoly") return await resolveVidmoly(embedUrl);
    if (player === "Sibnet") return await resolveSibnet(embedUrl);
    if (player === "Sendvid") return await resolveSendvid(embedUrl);
    if (player === "Smoothpre") return await resolveSmoothpre(embedUrl);
  } catch (e) { /* host down or layout changed */ }
  return null;
}

// Verify a resolved URL is actually playable (drops 403 / expired / dead links).
// - HLS: fetch the (small) playlist and confirm it is real m3u8.
// - MP4: a tiny Range request; hosts answer 206 (or 200) when the file is live.
async function isLinkAlive(url, headers) {
  try {
    if (url.toLowerCase().indexOf(".m3u8") !== -1) {
      const res = await safeFetch(url, { method: "GET", headers }, 6000);
      if (!res || !res.ok) return false;
      const body = await res.text();
      return body.indexOf("#EXT") !== -1;
    }
    // mp4 hosts: a HEAD is enough to spot a hard-dead file. Be lenient — the
    // resolve step already proved the page was live, so only drop on a clear
    // 403/404/410/5xx and assume alive on network hiccups.
    const res = await safeFetch(url, { method: "HEAD", headers }, 5000);
    if (!res) return true;
    const s = res.status || 0;
    if (s === 403 || s === 404 || s === 410 || s >= 500) return false;
    return true;
  } catch (e) { return true; }
}

async function resolveStreams(candidates) {
  // Resolve in small batches to avoid overloading the desktop fetch runtime.
  const resolved = [];
  const BATCH = 3;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const parts = await Promise.all(batch.map(async (c) => {
      const direct = await resolveEmbed(c.embedUrl, c.player);
      if (!direct || !direct.url) return null;
      // Never return a dead link. HLS was already validated during resolve;
      // check mp4 hosts here with a tiny Range request.
      const isHls = direct.url.toLowerCase().indexOf(".m3u8") !== -1;
      if (!isHls && !(await isLinkAlive(direct.url, direct.headers))) {
        console.log("[Anime-Sama] Dropped dead link (" + c.player + ")");
        return null;
      }
      return {
        name: "Anime-Sama",
        title: c.lang + " - " + (direct.quality || "HD") + " - " + c.player + " - " + c.label,
        url: direct.url,
        quality: direct.quality || "HD",
        language: c.lang,
        height: direct.height || 0,
        player: c.player,
        headers: direct.headers,
      };
    }));
    for (const p of parts) if (p) resolved.push(p);
  }
  // Group by language (VOSTFR then VF), best quality first within each group,
  // then preferred host so the top pick is the most reliable.
  resolved.sort((a, b) =>
    (langRank(a.language) - langRank(b.language)) ||
    (b.height - a.height) ||
    (playerRank(a.player) - playerRank(b.player)));
  // height was only needed for ranking — drop it from the returned objects.
  for (const s of resolved) delete s.height;
  return resolved;
}

// ---------------------------------------------------------------------------
// One slug: catalogue panels first, direct episodes.js guesses as fallback
// ---------------------------------------------------------------------------

// Fetch a film dir: its ordered film names + parsed eps arrays.
async function loadFilmDir(slug, seg, lang) {
  const dir = getBase() + "/catalogue/" + slug + "/" + seg + "/" + lang + "/";
  let html = "";
  try { html = await fetchText(dir, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8000); }
  catch (e) { html = ""; }
  const names = extractFilmNames(html);
  const parsed = parseEpisodesJs(await loadEpisodesJs(dir));
  return { seg, lang, names, parsed };
}

// Movies live inside a series catalogue as one or more "film" panels, each
// holding one or more films. Collect every film, then pick the one whose name
// matches the requested movie. When nothing matches, only return a result if
// the catalogue has a single film total (else we'd hand back the wrong movie).
async function movieStreams(slug, filmSegs, titles) {
  if (filmSegs.length === 0) return [];
  const dirTasks = [];
  for (const seg of filmSegs) for (const lang of LANGS) dirTasks.push(loadFilmDir(slug, seg, lang));
  const dirs = (await Promise.all(dirTasks)).filter((d) => d.parsed.length > 0);
  if (dirs.length === 0) return [];

  // Distinct films keyed by seg+index (shared across languages).
  const films = {};
  for (const d of dirs) {
    const count = Math.max(d.names.length, maxArrayLen(d.parsed));
    for (let i = 0; i < count; i++) {
      const key = d.seg + "#" + i;
      if (!films[key]) films[key] = { index: i, name: "", langs: {} };
      if (!films[key].name && d.names[i]) films[key].name = d.names[i];
      films[key].langs[d.lang] = d.parsed;
    }
  }
  const keys = Object.keys(films);
  if (keys.length === 0) return [];

  // Pick the best title match across all films.
  let bestKey = null, bestScore = 0;
  for (const k of keys) {
    const sc = filmNameScore(films[k].name, titles);
    if (sc > bestScore) { bestScore = sc; bestKey = k; }
  }
  let chosen = null;
  if (bestKey && bestScore >= 3) chosen = films[bestKey];
  else if (keys.length === 1) chosen = films[keys[0]]; // unambiguous single film

  if (!chosen) return [];
  const out = [];
  for (const lang of Object.keys(chosen.langs)) {
    const built = buildCandidates(chosen.langs[lang], lang, chosen.index, chosen.name || "Film");
    for (const st of built) out.push(st);
  }
  return out;
}

async function tryOneSlug(slug, season, episode, isMovie, titles) {
  // Catalogue page -> panels (the scraper's flow)
  let panels = [];
  try {
    const html = await fetchText(getBase() + "/catalogue/" + slug + "/", {}, 8000);
    panels = extractPanels(html, slug);
  } catch (e) {
    panels = [];
  }

  if (isMovie) {
    // Film panels from the catalogue, else guess the usual film dirs.
    let segs = [];
    const seenSeg = {};
    for (const p of panels) {
      const seg = p.path.split("/")[0];
      if (/^film/i.test(seg) && !seenSeg[seg]) { seenSeg[seg] = true; segs.push(seg); }
    }
    if (segs.length === 0) segs = ["film", "film1", "film2"];
    return await movieStreams(slug, segs, titles);
  }

  // Series: match the season panel(s), trying both languages (vostfr + vf).
  const matching = panels.filter((p) => panelMatchesRequest(p.path, season, isMovie));
  if (matching.length > 0) {
    const tasks = [];
    const seenPL = {};
    for (const p of matching) {
      const seg = p.path.split("/")[0]; // e.g. "saison1"
      for (const lang of LANGS) {
        const key = seg + "/" + lang;
        if (seenPL[key]) continue;
        seenPL[key] = true;
        const dir = getBase() + "/catalogue/" + slug + "/" + seg + "/" + lang + "/";
        tasks.push(loadEpisodesJs(dir).then((js) =>
          buildCandidates(parseEpisodesJs(js), lang, episode - 1, "Ep " + episode)));
      }
    }
    const streams = (await Promise.all(tasks)).flat();
    if (streams.length > 0) return streams;
  }

  // Fallback: guess episodes.js paths directly (older site layouts).
  const promises = [];
  for (const lang of LANGS) {
    for (const path of ["saison" + season, ""]) {
      promises.push(
        fetchEpisodesJs(slug, path, lang).then((js) =>
          buildCandidates(parseEpisodesJs(js), lang, episode - 1, "Ep " + episode))
      );
    }
  }
  return (await Promise.all(promises)).flat();
}

// ---------------------------------------------------------------------------
// Race slugs against the time budget
// ---------------------------------------------------------------------------

// Small batches: Nuvio Desktop's fetch binding freezes the whole plugin
// runtime when too many requests run concurrently (NuvioDesktop#185).
const SLUG_BATCH_SIZE = 3;

function raceBatch(slugs, season, episode, isMovie, titles, deadline) {
  if (slugs.length === 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { resolve([]); return; }
    let done = false;
    const finish = (streams) => {
      if (done) return;
      done = true;
      safeClearTimeout(timer);
      resolve(streams);
    };
    const timer = safeSetTimeout(() => finish([]), remaining);
    let settled = 0;
    for (const slug of slugs) {
      tryOneSlug(slug, season, episode, isMovie, titles)
        .then((streams) => {
          settled++;
          if (streams.length > 0) {
            console.log("[Anime-Sama] Found " + streams.length + " streams @ " + slug);
            finish(streams);
          } else if (settled === slugs.length) {
            finish([]);
          }
        })
        .catch(() => {
          settled++;
          if (settled === slugs.length) finish([]);
        });
    }
  });
}

async function raceSlugs(slugs, season, episode, isMovie, titles, deadline) {
  for (let i = 0; i < slugs.length; i += SLUG_BATCH_SIZE) {
    if (Date.now() >= deadline) return [];
    const batch = slugs.slice(i, i + SLUG_BATCH_SIZE);
    const streams = await raceBatch(batch, season, episode, isMovie, titles, deadline);
    if (streams.length > 0) return streams;
  }
  return [];
}

// Movies are often stored inside a series catalogue, so besides the exact-title
// slug we also try progressively trimmed series slugs (dragon-ball-super-broly
// -> dragon-ball-super -> dragon-ball) and let film-name matching pick the film.
function buildMovieSlugs(titles) {
  const out = [], seen = {};
  const add = (s) => { if (s && s.length > 1 && !seen[s]) { seen[s] = true; out.push(s); } };
  for (const t of titles) {
    add(slugify(t));
    const cleaned = String(t)
      .replace(/[:\-–—]/g, " ")
      .replace(/\b(le\s+)?film\b/gi, " ")
      .replace(/\bmovie\b/gi, " ")
      .replace(/\s+/g, " ").trim();
    const words = cleaned.split(" ");
    for (let n = words.length; n >= 2; n--) add(slugify(words.slice(0, n).join(" ")));
  }
  return out.slice(0, 14);
}

async function findCandidates(tmdbId, mediaType, season, episode, titles, deadline) {
  const s = season || 1, ep = episode || 1;
  const isMovie = mediaType === "movie";

  const seen = {};
  const slugs = [];
  const rawSlugs = isMovie ? buildMovieSlugs(titles) : titles.map(slugify);
  for (const sg of rawSlugs) {
    if (sg && sg.length > 1 && !seen[sg]) { seen[sg] = true; slugs.push(sg); }
  }

  console.log("[Anime-Sama] Racing " + slugs.length + " slugs: " + slugs.slice(0, 5).join(", "));
  let cands = await raceSlugs(slugs, s, ep, isMovie, titles, deadline);
  if (cands.length > 0) return cands;

  if (Date.now() >= deadline) {
    console.log("[Anime-Sama] Budget exhausted");
    return [];
  }

  // Search fallback: ask the site for slugs matching the titles
  console.log("[Anime-Sama] Search fallback...");
  const searchPromises = titles.slice(0, 4)
    .filter((t) => slugify(t).length > 0)
    .map((t) => searchSlugs(t.replace(/[.:!?,;]/g, " ").replace(/\s+/g, " ").trim()));
  const allFound = await Promise.all(searchPromises);
  const newSlugs = [];
  for (const batch of allFound) {
    for (const sg of batch) {
      if (!seen[sg]) { seen[sg] = true; newSlugs.push(sg); }
    }
  }
  if (newSlugs.length === 0 || Date.now() >= deadline) return [];
  return raceSlugs(newSlugs, s, ep, isMovie, titles, deadline);
}

export async function extractStreams(tmdbId, mediaType, season, episode, titles) {
  if (!titles || titles.length === 0) return [];

  // Resolve the active Anime-Sama domain before anything else (auto-renewal).
  await resolveBase();

  const deadline = Date.now() + MAX_BUDGET_MS;
  const candidates = await findCandidates(tmdbId, mediaType, season, episode, titles, deadline);
  if (candidates.length === 0) {
    console.log("[Anime-Sama] No streams found");
    return [];
  }

  // Turn embed player pages into direct .mp4/.m3u8 URLs the player can open.
  console.log("[Anime-Sama] Resolving " + candidates.length + " embeds...");
  const resolved = await resolveStreams(candidates);
  console.log("[Anime-Sama] Resolved " + resolved.length + "/" + candidates.length + " streams");
  return resolved;
}
