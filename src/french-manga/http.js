// http.js - safe fetch, dynamic domain, search, seasons, episodes API
// Compatible QuickJS (desktop / Compose) + Hermes (RN). No URL class, no regex backrefs, no lookbehind.

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Bare domain 301-redirects to the current wNN subdomain. Fallbacks used only if that fails.
var ROOT_REDIRECT = "https://french-manga.net/";
var FALLBACK_HOSTS = [
  "https://w16.french-manga.net",
  "https://w17.french-manga.net",
  "https://w15.french-manga.net",
  "https://w18.french-manga.net",
  "https://w14.french-manga.net"
];

export var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// ---- timeouts guarded (QuickJS does not always inject setTimeout) ----
function safeSetTimeout(fn, ms) {
  try { if (typeof setTimeout === "function") return setTimeout(fn, ms); } catch (e) {}
  return null;
}
function safeClearTimeout(id) {
  try { if (id !== null && typeof clearTimeout === "function") clearTimeout(id); } catch (e) {}
}

export function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9000;
  var ctrl = null, tid = null;
  try { ctrl = new AbortController(); } catch (e) {}
  if (ctrl) tid = safeSetTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
  var opts = { method: options.method || "GET", headers: options.headers || { "User-Agent": USER_AGENT } };
  if (options.body !== undefined) opts.body = options.body;
  if (options.redirect) opts.redirect = options.redirect;
  if (ctrl) opts.signal = ctrl.signal;
  var p;
  try { p = fetch(url, opts); } catch (e) { safeClearTimeout(tid); return Promise.resolve(null); }
  return p.then(function (r) { safeClearTimeout(tid); return r; })
          .catch(function () { safeClearTimeout(tid); return null; });
}

export async function fetchText(url, options, timeoutMs) {
  var r = await safeFetch(url, options, timeoutMs);
  if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "err"));
  return r.text();
}

export async function fetchJson(url, options, timeoutMs) {
  var txt = await fetchText(url, options, timeoutMs);
  return JSON.parse(txt);
}

// ---- accents / slug (safe fallback if normalize missing) ----
var ACCENT_MAP = {
  "à": "a", "á": "a", "â": "a", "ä": "a", "ã": "a", "å": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ó": "o", "ò": "o", "ô": "o", "ö": "o", "õ": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ç": "c", "ñ": "n", "ý": "y", "ÿ": "y",
  "œ": "oe", "æ": "ae", "ß": "ss"
};
export function stripAccents(s) {
  try { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch (e) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += ACCENT_MAP[c] || (ACCENT_MAP[c.toLowerCase()] ? ACCENT_MAP[c.toLowerCase()] : c);
    }
    return out;
  }
}
export function slugify(t) {
  return stripAccents(String(t).toLowerCase())
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- dynamic domain resolution ----
var cachedBase = null;
export async function resolveBase() {
  if (cachedBase) return cachedBase;
  var r = await safeFetch(ROOT_REDIRECT, { method: "GET" }, 8000);
  if (r && r.url) {
    var m = /^(https?:\/\/[^/]+)/i.exec(r.url);
    if (m && /french-manga\.net/i.test(m[1])) { cachedBase = m[1]; return cachedBase; }
  }
  if (r && r.ok) {
    // no redirect info exposed; fall through to fallback probing
  }
  for (var i = 0; i < FALLBACK_HOSTS.length; i++) {
    var rr = await safeFetch(FALLBACK_HOSTS[i] + "/", { method: "GET" }, 6000);
    if (rr && rr.ok) { cachedBase = FALLBACK_HOSTS[i]; return cachedBase; }
  }
  cachedBase = FALLBACK_HOSTS[0];
  return cachedBase;
}

// ---- live search: POST /engine/ajax/search.php ----
// Returns [{ newsId, title }]
export async function liveSearch(base, query) {
  var body = "query=" + encodeURIComponent(query) + "&page=1";
  var html;
  try {
    html = await fetchText(base + "/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": base + "/"
      },
      body: body
    }, 12000);
  } catch (e) { return []; }
  var out = [];
  // each item: location.href='/1498138-slug.html' ... class='search-title'>Title (2017)<
  var re = /location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g;
  var m;
  while ((m = re.exec(html)) !== null) {
    out.push({ newsId: m[1], title: decodeEntities(m[2]).trim() });
  }
  return out;
}

// ---- get_seasons: GET /engine/ajax/get_seasons.php ----
// Returns [{ id, title, season_number }]
export async function getSeasons(base, newsId, tag, titleBase) {
  var qs = "serie_tag=" + encodeURIComponent(tag || "") +
           "&news_id=" + encodeURIComponent(newsId) +
           "&title_base=" + encodeURIComponent(titleBase || "");
  try {
    var arr = await fetchJson(base + "/engine/ajax/get_seasons.php?" + qs, {
      headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId }
    }, 12000);
    if (arr && arr.length) return arr;
  } catch (e) {}
  return [];
}

// ---- story page meta: data-tagz + data-title from #manga-data ----
export async function fetchStoryMeta(base, newsId) {
  var html;
  try {
    html = await fetchText(base + "/index.php?newsid=" + newsId, {
      headers: { "User-Agent": USER_AGENT, "Referer": base + "/" }
    }, 12000);
  } catch (e) { return { tagz: "", title: "" }; }
  var tagz = "";
  var t = /data-tagz="([^"]*)"/i.exec(html);
  if (t) tagz = decodeEntities(t[1]);
  var title = "";
  var tt = /id="manga-data"[\s\S]{0,600}?data-title="([^"]*)"/i.exec(html);
  if (!tt) tt = /data-title="([^"]*)"/i.exec(html);
  if (tt) title = decodeEntities(tt[1]);
  return { tagz: tagz, title: title };
}

// ---- episodes API: GET /engine/ajax/manga_episodes_api.php?id= ----
export async function fetchEpisodes(base, newsId) {
  try {
    return await fetchJson(base + "/engine/ajax/manga_episodes_api.php?id=" + newsId, {
      headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId }
    }, 12000);
  } catch (e) { return null; }
}

// minimal HTML entity decode used on scraped titles/tags
export function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
