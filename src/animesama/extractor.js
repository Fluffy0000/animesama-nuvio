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

import { BASE_URL, USER_AGENT, fetchText, fetchEpisodesJs, searchSlugs, slugify, safeSetTimeout, safeClearTimeout } from "./http.js";

const MAX_BUDGET_MS = 10000;

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
  const re = /panneauAnime\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].trim();
    const path = m[2].trim().replace(/^\/+|\/+$/g, "");
    if (!name || !path) continue;
    if (!/^(saison\d|film|oav|ova)/i.test(path)) continue;
    const url = BASE_URL + "/catalogue/" + slug + "/" + path + "/";
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

function langFromPath(path) {
  const segs = path.toLowerCase().split("/");
  return segs.length > 1 && segs[1] ? segs[1] : "vostfr";
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
      else if (src.charAt(0) === "/") scriptUrl = BASE_URL + src;
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

function buildStreamsFromArrays(parsedArrays, lang, episode) {
  const idx = episode - 1;
  const streams = [];
  const seen = {};
  for (const arr of parsedArrays) {
    const url = normalizeEmbedUrl(arr.urls[idx]);
    if (!url || seen[url]) continue;
    if (!isAllowedEmbedHost(url)) continue;
    seen[url] = true;
    streams.push({
      name: "Anime-Sama",
      title: getPlayerName(url) + " - Ep " + episode + " - " + lang.toUpperCase(),
      url,
      quality: "HD",
      headers: { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT },
    });
  }
  streams.sort((a, b) => hostRank(a.url) - hostRank(b.url));
  return streams;
}

// ---------------------------------------------------------------------------
// One slug: catalogue panels first, direct episodes.js guesses as fallback
// ---------------------------------------------------------------------------

async function tryOneSlug(slug, season, episode, isMovie) {
  // 1) Catalogue page -> panels (the scraper's flow)
  let panels = [];
  try {
    const html = await fetchText(BASE_URL + "/catalogue/" + slug + "/", {}, 8000);
    panels = extractPanels(html, slug);
  } catch (e) {
    panels = [];
  }

  const matching = panels.filter((p) => panelMatchesRequest(p.path, season, isMovie));
  if (matching.length > 0) {
    const results = await Promise.all(matching.map(async (p) => {
      const js = await loadEpisodesJs(p.url);
      const parsed = parseEpisodesJs(js);
      return buildStreamsFromArrays(parsed, langFromPath(p.path), episode);
    }));
    const streams = results.flat();
    if (streams.length > 0) return streams;
  }

  // 2) Fallback: guess episodes.js paths directly (older site layouts)
  const languages = ["vostfr", "vf"];
  const paths = isMovie ? ["film"] : ["saison" + season, ""];
  const promises = [];
  for (const lang of languages) {
    for (const path of paths) {
      promises.push(
        fetchEpisodesJs(slug, path, lang).then((js) => {
          const parsed = parseEpisodesJs(js);
          return buildStreamsFromArrays(parsed, lang, episode);
        })
      );
    }
  }
  const results = await Promise.all(promises);
  return results.flat();
}

// ---------------------------------------------------------------------------
// Race slugs against the time budget
// ---------------------------------------------------------------------------

// Small batches: Nuvio Desktop's fetch binding freezes the whole plugin
// runtime when too many requests run concurrently (NuvioDesktop#185).
const SLUG_BATCH_SIZE = 3;

function raceBatch(slugs, season, episode, isMovie, deadline) {
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
      tryOneSlug(slug, season, episode, isMovie)
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

async function raceSlugs(slugs, season, episode, isMovie, deadline) {
  for (let i = 0; i < slugs.length; i += SLUG_BATCH_SIZE) {
    if (Date.now() >= deadline) return [];
    const batch = slugs.slice(i, i + SLUG_BATCH_SIZE);
    const streams = await raceBatch(batch, season, episode, isMovie, deadline);
    if (streams.length > 0) return streams;
  }
  return [];
}

export async function extractStreams(tmdbId, mediaType, season, episode, titles) {
  if (!titles || titles.length === 0) return [];
  const deadline = Date.now() + MAX_BUDGET_MS;
  const s = season || 1, ep = episode || 1;
  const isMovie = mediaType === "movie";

  const slugs = [], seen = {};
  for (const title of titles) {
    const sg = slugify(title);
    if (sg && !seen[sg]) { seen[sg] = true; slugs.push(sg); }
  }

  console.log("[Anime-Sama] Racing " + slugs.length + " slugs: " + slugs.slice(0, 5).join(", "));
  let streams = await raceSlugs(slugs, s, ep, isMovie, deadline);
  if (streams.length > 0) return streams;

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
  if (newSlugs.length === 0 || Date.now() >= deadline) {
    console.log("[Anime-Sama] No streams found");
    return [];
  }
  return raceSlugs(newSlugs, s, ep, isMovie, deadline);
}
