// http.js — safe fetch, folder resolution, TMDB titles, search, detail fetch (QuickJS + Hermes safe)

export var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export var ORIGIN = "https://yablom.com";
export var SITE_TAG = "yablom";          // middle URL segment of detail pages (/{folder}/b/yablom/<id>)
var DEFAULT_FOLDER = "euvcw7";           // path token; auto-rediscovered if it rotates
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

// ---- safe timers / fetch (see manual §1, §5) -------------------------------
function safeSetTimeout(fn, ms) {
  try { if (typeof setTimeout === "function") return setTimeout(fn, ms); } catch (e) {}
  return null;
}
function safeClearTimeout(id) {
  try { if (id !== null && typeof clearTimeout === "function") clearTimeout(id); } catch (e) {}
}

// QuickJS-safe sleep: setTimeout if present, else microtask spin (no timer dependency)
function sleep(ms) {
  return new Promise(function (res) {
    try { if (typeof setTimeout === "function") { setTimeout(res, ms); return; } } catch (e) {}
    // No timers in Nuvio's sandbox (Hermes): resolve immediately instead of a
    // microtask busy-spin, which would block the JS thread for `ms` and get the
    // scraper killed by Nuvio's watchdog. Retries then happen back-to-back.
    res();
  });
}

// browser-like default headers: passes soft Cloudflare bot rules; Accept-Encoding: identity
// avoids gzip the QuickJS fetch may not decode -> unreadable body -> 0 result.
function withDefaultHeaders(h) {
  h = h || {};
  if (!h["User-Agent"] && !h["user-agent"]) h["User-Agent"] = USER_AGENT;
  if (!h["Accept"] && !h["accept"]) h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!h["Accept-Language"] && !h["accept-language"]) h["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  if (!h["Accept-Encoding"] && !h["accept-encoding"]) h["Accept-Encoding"] = "identity";
  // site is age-gated by a "g=true" cookie; sending it avoids the redirect bounce on detail pages
  if (!h["Cookie"] && !h["cookie"]) h["Cookie"] = "g=true";
  return h;
}

function fetchOnce(url, opts, timeoutMs) {
  var ctrl = null, tid = null;
  try { ctrl = new AbortController(); } catch (e) {}
  if (ctrl) tid = safeSetTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
  var o = { method: opts.method, headers: opts.headers, redirect: "follow" };
  if (opts.body !== undefined) o.body = opts.body;
  if (ctrl) o.signal = ctrl.signal;
  var p;
  try { p = fetch(url, o); } catch (e) { safeClearTimeout(tid); return Promise.resolve(null); }
  return p.then(function (r) { safeClearTimeout(tid); return r; })
          .catch(function () { safeClearTimeout(tid); return null; });
}

// Retry with backoff, but NEVER on a real 4xx (except 429) — survives intermittent
// Cloudflare/5xx hiccups without hammering genuine 404s.
export async function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9000;
  var opts = { method: options.method || "GET", headers: withDefaultHeaders(options.headers), body: options.body };
  var delays = [700, 2000];
  var r = null;
  for (var attempt = 0; attempt <= delays.length; attempt++) {
    r = await fetchOnce(url, opts, timeoutMs);
    if (isOk(r)) return r;
    if (r && r.status >= 400 && r.status < 500 && r.status !== 429) return r;
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return r;
}

// Success check tolerant of runtimes where response.ok is missing (some Nuvio/QuickJS fetch
// polyfills don't set it) — derive from status, and if there's no status at all, trust the body.
export function isOk(r) {
  if (!r) return false;
  if (typeof r.ok === "boolean") return r.ok;
  if (typeof r.status === "number" && r.status > 0) return r.status >= 200 && r.status < 400;
  return true;
}

export async function fetchText(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!isOk(r)) throw new Error("HTTP " + (r ? r.status : "err"));
  return r.text();
}
export async function fetchJson(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!isOk(r)) return null;
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// ---- slugify (normalize may be missing in QuickJS) -------------------------
var ACCENT_MAP = {
  "à":"a","á":"a","â":"a","ä":"a","ã":"a","å":"a","é":"e","è":"e","ê":"e","ë":"e",
  "í":"i","ì":"i","î":"i","ï":"i","ó":"o","ò":"o","ô":"o","ö":"o","õ":"o",
  "ú":"u","ù":"u","û":"u","ü":"u","ç":"c","ñ":"n","œ":"oe","æ":"ae","ß":"ss","ý":"y","ÿ":"y"
};
export function stripAccents(s) {
  try { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch (e) {
    var o = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      o += ACCENT_MAP[c] || ACCENT_MAP[c.toLowerCase()] || c;
    }
    return o;
  }
}
export function slugify(t) {
  return stripAccents(String(t).toLowerCase())
    .replace(/['’\\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- folder resolution (validate by content, never blind — manual §1.2) ----
var cachedFolder = null;

async function folderWorks(folder) {
  var j = await fetchJson(ORIGIN + "/" + folder + "/api_search.php?searchword=a", {}, 8000);
  return !!(j && j.films && typeof j.films.length === "number");
}

export async function resolveFolder() {
  if (cachedFolder) return cachedFolder;
  if (await folderWorks(DEFAULT_FOLDER)) { cachedFolder = DEFAULT_FOLDER; return cachedFolder; }
  // fallback: discover from root page (link is <a href="euvcw7">)
  try {
    var html = await fetchText(ORIGIN + "/", {}, 8000);
    var seen = {}, cands = [], re = /href="\/?([a-zA-Z0-9]{4,12})"/g, m;
    while ((m = re.exec(html)) !== null) {
      var tok = m[1];
      if (!seen[tok]) { seen[tok] = true; cands.push(tok); }
    }
    for (var i = 0; i < cands.length; i++) {
      if (await folderWorks(cands[i])) { cachedFolder = cands[i]; return cachedFolder; }
    }
  } catch (e) {}
  cachedFolder = DEFAULT_FOLDER; // last resort
  return cachedFolder;
}

// ---- TMDB titles -----------------------------------------------------------
// Returns { titles: [strings, latin first, deduped], year: "YYYY"|null }
export async function getTmdbInfo(tmdbId, mediaType) {
  var kind = mediaType === "tv" ? "tv" : "movie";
  var out = [], seen = {}, year = null;
  function add(t) {
    if (!t) return;
    var key = slugify(t);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(t);
  }
  var urls = [
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=fr-FR",
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US"
  ];
  for (var i = 0; i < urls.length; i++) {
    var d = await fetchJson(urls[i], {}, 9000);
    if (!d) continue;
    if (!year) {
      var rd = d.release_date || d.first_air_date || "";
      var ym = /^(\d{4})/.exec(rd);
      if (ym) year = ym[1];
    }
    add(d.title); add(d.name);
    add(d.original_title); add(d.original_name);
  }
  return { titles: out, year: year };
}

// ---- search ----------------------------------------------------------------
// Returns array of { id, title, poster, vostfr, link, year }
export async function searchFilms(folder, query) {
  var url = ORIGIN + "/" + folder + "/api_search.php?searchword=" + encodeURIComponent(query);
  var j = await fetchJson(url, {}, 9000);
  if (!j || !j.films) return [];
  var out = [];
  for (var i = 0; i < j.films.length; i++) {
    var f = j.films[i];
    if (!f) continue;
    // the JSON `link` uses a stale folder/tag (/ALBRAD/b/localhost/<id>); only the trailing id is real
    var linkId = "";
    if (f.link) { var lm = /(\d+)\s*$/.exec(String(f.link)); if (lm) linkId = lm[1]; }
    if (!linkId) continue;
    var ym = /\((\d{4})\)/.exec(String(f.title || ""));
    out.push({
      id: linkId,
      title: String(f.title || ""),
      poster: f.poster || "",
      vostfr: !!f.vostfr,
      year: ym ? ym[1] : null
    });
  }
  return out;
}

// ---- detail page -> embed url ----------------------------------------------
export async function fetchEmbedUrl(folder, linkId) {
  var url = ORIGIN + "/" + folder + "/b/" + SITE_TAG + "/" + linkId;
  var html;
  try { html = await fetchText(url, {}, 10000); } catch (e) { return null; }
  // iframe id is mixed-case: [A-Za-z0-9]+
  var m = /src="(https?:\/\/[a-z0-9.-]+\/iframe\/[A-Za-z0-9]+)"/i.exec(html);
  if (m) return m[1];
  // generic fallback: any embed-looking iframe
  var g = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
  return g ? g[1] : null;
}
