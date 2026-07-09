/**
 * HTTP utilities for Anime-Sama Nuvio provider
 */

export const BASE_URL = "https://anime-sama.to";
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

// setTimeout does not exist in every runtime (Nuvio Desktop's QuickJS has none) —
// always go through these guards instead of calling it directly.
export function safeSetTimeout(fn, ms) {
  try { if (typeof setTimeout === "function") return setTimeout(fn, ms); } catch (e) {}
  return null;
}

export function safeClearTimeout(id) {
  try { if (id !== null && typeof clearTimeout === "function") clearTimeout(id); } catch (e) {}
}

export function safeFetch(url, options = {}, timeoutMs = 8000) {
  let controller = null, tid = null;
  try { controller = new AbortController(); } catch (e) { controller = null; }
  if (controller) {
    tid = safeSetTimeout(() => { try { controller.abort(); } catch (e) {} }, timeoutMs);
  }
  const opts = { method: "GET", headers: DEFAULT_HEADERS, ...options };
  if (controller) { opts.signal = controller.signal; }
  let p;
  try { p = fetch(url, opts); }
  catch (e) { safeClearTimeout(tid); return Promise.resolve(null); }
  return p
    .then(res => { safeClearTimeout(tid); return res; })
    .catch(() => { safeClearTimeout(tid); return null; });
}

export async function fetchText(url, options = {}, timeoutMs = 8000) {
  const res = await safeFetch(url, options, timeoutMs);
  if (!res || !res.ok) {
    throw new Error("HTTP " + (res ? res.status : "error") + " for " + url);
  }
  return await res.text();
}

export async function searchSlugs(query) {
  try {
    const html = await fetchText(BASE_URL + "/template-php/defaut/fetch.php", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, "Content-Type": "application/x-www-form-urlencoded", "Referer": BASE_URL },
      body: "query=" + encodeURIComponent(query)
    }, 8000);
    const slugs = [], seen = {};
    const regex = /href="\/catalogue\/([a-z0-9][a-z0-9-]*)\/?"/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const slug = match[1];
      if (!seen[slug] && slug.length > 1) { seen[slug] = true; slugs.push(slug); }
    }
    console.log("[Anime-Sama] Search: " + slugs.length + " slugs for '" + query + "'");
    return slugs;
  } catch (e) {
    console.log("[Anime-Sama] Search failed: " + e.message);
    return [];
  }
}

export async function fetchEpisodesJs(slug, seasonPath, lang) {
  let url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  try { return await fetchText(url, {}, 8000); }
  catch (e) { return null; }
}

// String.prototype.normalize is missing from some QuickJS builds (Nuvio
// Desktop) \u2014 fall back to a manual accent map when it is unavailable.
const ACCENT_MAP = {
  "\u00e0": "a", "\u00e2": "a", "\u00e4": "a", "\u00e1": "a", "\u00e3": "a", "\u00e5": "a",
  "\u00e7": "c", "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e",
  "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i", "\u00f1": "n",
  "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f6": "o", "\u00f5": "o", "\u00f8": "o",
  "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u", "\u00fd": "y", "\u00ff": "y",
  "\u0153": "oe", "\u00e6": "ae", "\u00df": "ss",
};

function stripAccents(lower) {
  try {
    return lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    return lower.replace(/[\u00c0-\u024f]/g, function (ch) {
      return ACCENT_MAP[ch] !== undefined ? ACCENT_MAP[ch] : ch;
    });
  }
}

export function slugify(title) {
  return stripAccents(String(title).toLowerCase())
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
