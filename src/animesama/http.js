/**
 * HTTP utilities for Anime-Sama Nuvio provider
 */

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Dynamic domain — Anime-Sama rotates domains, so we never hardcode one.
// The status page anime-sama.pw links to the active mirror; if that fails we
// probe a fallback list. Resolved once per getStreams call (auto-renewal).
// ---------------------------------------------------------------------------

const STATUS_URL = "https://anime-sama.pw/";
// Known domains, best-first. The status page domain is tried before these.
const FALLBACK_DOMAINS = [
  "anime-sama.to", "anime-sama.tv", "anime-sama.org", "anime-sama.eu",
  "anime-sama.fr", "anime-sama.net", "anime-sama.si", "anime-sama.com",
];
// Reference endpoint that only a fully working mirror serves correctly.
const PROBE_PATH = "/catalogue/one-piece/saison1/vostfr/episodes.js";

let ACTIVE_BASE = "https://anime-sama.to";
let baseResolvePromise = null;

// Current active base URL (no trailing slash). Valid after resolveBase().
export function getBase() { return ACTIVE_BASE; }

// A mirror is "working" only if it actually serves the episodes.js data — a
// 200 on the catalogue page is not enough (dead mirrors return an empty shell).
async function probeDomain(domain) {
  const res = await safeFetch("https://" + domain + PROBE_PATH, {}, 6000);
  if (!res || !res.ok) return false;
  try {
    const js = await res.text();
    return js.indexOf("var eps") !== -1;
  } catch (e) { return false; }
}

async function domainFromStatusPage() {
  try {
    const res = await safeFetch(STATUS_URL, {}, 6000);
    if (!res || !res.ok) return null;
    const html = await res.text();
    const m =
      /href=["'](https?:\/\/anime-sama\.[a-z.]+)["'][^>]*>\s*Acc[èe]der/i.exec(html) ||
      /class=["'][^"']*btn-primary[^"']*["']\s+href=["'](https?:\/\/anime-sama\.[a-z.]+)["']/i.exec(html);
    if (!m) return null;
    const host = m[1].replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return host === "anime-sama.pw" ? null : host;
  } catch (e) { return null; }
}

export function resolveBase() {
  if (baseResolvePromise) return baseResolvePromise;
  baseResolvePromise = (async () => {
    // Candidate order: the domain the status page points at, then known ones.
    const statusHost = await domainFromStatusPage();
    const candidates = [];
    const seen = {};
    if (statusHost) { candidates.push(statusHost); seen[statusHost] = true; }
    for (const d of FALLBACK_DOMAINS) if (!seen[d]) { seen[d] = true; candidates.push(d); }

    for (const d of candidates) {
      if (await probeDomain(d)) {
        ACTIVE_BASE = "https://" + d;
        console.log("[Anime-Sama] Domaine actif: https://" + d +
          (d === statusHost ? " (status)" : " (sonde)"));
        return ACTIVE_BASE;
      }
    }

    console.log("[Anime-Sama] Aucun domaine confirmé, défaut: " + ACTIVE_BASE);
    return ACTIVE_BASE;
  })();
  return baseResolvePromise;
}

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
    const html = await fetchText(getBase() + "/template-php/defaut/fetch.php", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, "Content-Type": "application/x-www-form-urlencoded", "Referer": getBase() + "/" },
      body: "query=" + encodeURIComponent(query)
    }, 8000);
    const slugs = [], seen = {};
    // Search results link with ABSOLUTE hrefs (https://domain/catalogue/slug/),
    // so match /catalogue/<slug> anywhere rather than requiring a relative href.
    const regex = /\/catalogue\/([a-z0-9][a-z0-9-]*)/gi;
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
  let url = getBase() + "/catalogue/" + slug;
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
