/* purstream - built 2026-08-26T11:58:06Z — GENERATED from src/, edit sources then `python3 build.py` */
// ---- core\net.js ----
// core/net.js — safe fetch helpers (QuickJS / Hermes safe, no Node APIs, no timers dependency)

var CORE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// merge default browser-ish headers; caller headers win
function withDefaultHeaders(h) {
  h = h || {};
  if (!h["User-Agent"] && !h["user-agent"]) h["User-Agent"] = CORE_UA;
  if (!h["Accept"] && !h["accept"]) h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!h["Accept-Language"] && !h["accept-language"]) h["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  return h;
}

// single attempt with REAL timeout via Promise.race (Nuvio ignores AbortController)
function fetchOnce(url, opts, timeoutMs) {
  var ctrl = null;
  try { ctrl = new AbortController(); } catch (e) {}
  var o = { method: opts.method, headers: opts.headers, redirect: "follow" };
  if (opts.body !== undefined) o.body = opts.body;
  if (ctrl) o.signal = ctrl.signal;
  var p;
  try { p = fetch(url, o); } catch (e) { return Promise.resolve(null); }
  var fetchP = p.then(function (r) { return r; }, function () { return null; });
  if (typeof setTimeout === "function" && timeoutMs && timeoutMs > 0) {
    var timeoutP = new Promise(function (res) {
      setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} res(null); }, timeoutMs);
    });
    return Promise.race([fetchP, timeoutP]);
  }
  return fetchP;
}

function netIsOk(r) {
  if (!r) return false;
  if (typeof r.ok === "boolean") return r.ok;
  if (typeof r.status === "number" && r.status > 0) return r.status >= 200 && r.status < 400;
  return true;
}

// retry with small backoff, never on real 4xx (except 429)
async function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9000;
  var opts = { method: options.method || "GET", headers: withDefaultHeaders(options.headers), body: options.body };
  var delays = [600, 1600];
  var r = null;
  for (var attempt = 0; attempt <= delays.length; attempt++) {
    r = await fetchOnce(url, opts, timeoutMs);
    if (netIsOk(r)) return r;
    if (r && r.status >= 400 && r.status < 500 && r.status !== 429) return r;
    if (attempt < delays.length) await netSleep(delays[attempt]);
  }
  return r;
}

// no timer dependency: resolve immediately when setTimeout is missing
function netSleep(ms) {
  return new Promise(function (res) {
    try { if (typeof setTimeout === "function") { setTimeout(res, ms); return; } } catch (e) {}
    res();
  });
}

async function fetchText(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!netIsOk(r)) return null;
  try { return await r.text(); } catch (e) { return null; }
}
async function fetchJson(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!netIsOk(r)) return null;
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// simple sequential map with bounded parallelism (keeps sites calm)
async function mapLimit(arr, limit, fn) {
  var out = new Array(arr.length), idx = 0;
  async function worker() {
    while (idx < arr.length) { var i = idx++; out[i] = await fn(arr[i], i); }
  }
  var workers = [];
  for (var w = 0; w < Math.max(1, limit); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// headers de stream pour le player Nuvio : N'envoie Referer QUE s'il est non vide
// (certains CDN — fsvid/vidzy — 403 quand un Referer est présent, 200 sans).
function streamHeaders(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- core\text.js ----
// core/text.js — slugify, accents, Dean-Edwards unpacker, video-url finders (QuickJS safe)

var ACCENT_MAP = {
  "à":"a","á":"a","â":"a","ä":"a","ã":"a","å":"a","é":"e","è":"e","ê":"e","ë":"e",
  "í":"i","ì":"i","î":"i","ï":"i","ó":"o","ò":"o","ô":"o","ö":"o","õ":"o",
  "ú":"u","ù":"u","û":"u","ü":"u","ç":"c","ñ":"n","œ":"oe","æ":"ae","ß":"ss","ý":"y","ÿ":"y"
};
function stripAccents(s) {
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
function slugify(t) {
  return stripAccents(String(t).toLowerCase())
    .replace(/['’\\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// base-N conversion used by the packer (c.toString(a))
function toBaseN(num, base) {
  try { return num.toString(base); } catch (e) { return String(num); }
}

function unescapePacked(s) {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

// Dean Edwards unpacker: while(c--) if(k[c]) p=p.replace(word(c.toString(a)), k[c])
function unpackOne(p, a, c, k) {
  while (c-- > 0) {
    if (k[c]) {
      var needle = "\\b" + toBaseN(c, a) + "\\b";
      try { p = p.replace(new RegExp(needle, "g"), k[c]); } catch (e) { return p; }
    }
  }
  return p;
}

// find every eval(function(p,a,c,k,e,d){...}('...',N,N,'...'.split('|'))) block and
// return an array of the unpacked payloads (pure string ops — no eval())
function unpackPackers(html) {
  var out = [];
  if (!html) return out;
  var re = /\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/g, m;
  var guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 8) {
    try {
      var p = unescapePacked(m[1]);
      var a = parseInt(m[2], 10);
      var c = parseInt(m[3], 10);
      var k = m[4].split("|");
      if (a > 1 && c >= 1 && c <= 20000 && k.length > 1) out.push(unpackOne(p, a, c, k));
    } catch (e) {}
  }
  return out;
}

// find a direct video url in arbitrary text (handles escaped slashes + url-encoded)
function findVideoUrl(text) {
  if (!text) return null;
  var m = /https?:\/\/[^\s"'\\)>\]]+\.m3u8[^\s"'\\)>\]]*/i.exec(text); if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)>\]]+\.mp4[^\s"'\\)>\]]*/i.exec(text); if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  e = /https?:\\\/\\\/[^\s"']*?\.mp4[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  return null;
}

// ALL candidate video urls (for master playlists ranking)
function findAllVideoUrls(text) {
  var out = [], seen = {}, m;
  if (!text) return out;
  var re = /https?:\/\/[^\s"'\\)>\]]+\.(?:m3u8|mp4)[^\s"'\\)>\]]*/gi;
  while ((m = re.exec(text)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; out.push(m[0]); } }
  var re2 = /https?:\\\/\\\/[^\s"']*?\.(?:m3u8|mp4)[^\s"']*/gi;
  while ((m = re2.exec(text)) !== null) { var u = m[0].replace(/\\\//g, "/"); if (!seen[u]) { seen[u] = true; out.push(u); } }
  return out;
}

// all iframe srcs in a page (src + data-src)
function findIframes(html) {
  var out = [], seen = {}, m;
  if (!html) return out;
  var re = /<iframe[^>]*(?:src|data-src)=["']([^"']+)["']/gi;
  while ((m = re.exec(html)) !== null) {
    var u = m[1];
    if (u && u.indexOf("http") === 0 && !seen[u]) { seen[u] = true; out.push(u); }
  }
  return out;
}

// registrable-domain referer a CDN expects: share86131.sharecloudy.com -> https://sharecloudy.com/
function refererFromMediaUrl(mediaUrl) {
  var hm = /^https?:\/\/([^/]+)/i.exec(mediaUrl || "");
  if (!hm) return null;
  var host = hm[1];
  var parts = host.split(".");
  var reg = parts.length >= 2 ? parts.slice(parts.length - 2).join(".") : host;
  return "https://" + reg + "/";
}

function hostOf(url) {
  var m = /^https?:\/\/([^/:]+)/i.exec(url || "");
  return m ? m[1].toLowerCase() : "";
}
function baseOf(url) {
  var m = /^(https?:\/\/[^/:]+)/i.exec(url || "");
  return m ? m[1] : "";
}
function absUrl(base, href) {
  if (!href) return href;
  if (href.indexOf("//") === 0) return "https:" + href;
  if (/^https?:/i.test(href)) return href;
  if (href.charAt(0) === "/") return baseOf(base) + href;
  return baseOf(base) + "/" + href;
}

// ---- fsvid.lol / vidzy.cc anti-scrape cipher ----
// Page piégée : var _fsvHls = ".../troll/master.m3u8" (LEURRE : clip logo de 18 s) et
// player.src = (function(s){ ... })( "BASE64" ) où la vraie URL est
//   xor( reverse(atob(s)), (0x3d + i*89 + checksum(location.hostname)) & 255 ).
var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
// atob pur JS (QuickJS/Hermes n'ont pas atob)
function b64Decode(input) {
  var str = String(input).replace(/=+$/, "");
  var output = "";
  if (str.length % 4 === 1) return "";
  for (var bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = B64_CHARS.indexOf(buffer);
  }
  return output;
}
function decodeHostCipher(text, embedHost) {
  var m = /\}\s*\)\s*\(\s*"([A-Za-z0-9+/=]{50,})"\s*\)/.exec(text || "");
  if (!m) return null;
  var b = b64Decode(m[1]);
  if (!b) return null;
  var a = b.split("").reverse().join("");
  var H = 0;
  for (var j = 0; j < embedHost.length; j++) H = (H + embedHost.charCodeAt(j)) & 255;
  var r = "";
  for (var i = 0; i < a.length; i++) r += String.fromCharCode(a.charCodeAt(i) ^ ((0x3d + i * 89 + H) & 255));
  return /^https?:\/\//.test(r) ? r : null;
}
function isCipherHost(url) {
  return /fsvid|vidzy/i.test(url || "");
}
function isTrollUrl(url) {
  return /\/troll\//i.test(url || "");
}

// ---- core\tmdb.js ----
// core/tmdb.js — TMDB titles/year + season anatomy (needs fetchJson from net.js)




var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

// Returns { titles: [fr, then en/original, deduped], year: "YYYY"|null }
async function getTmdbInfo(tmdbId, mediaType) {
  var kind = mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";
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
      var ym = /^([0-9]{4})/.exec(rd);
      if (ym) year = ym[1];
    }
    add(d.title); add(d.name);
    add(d.original_title); add(d.original_name);
  }
  return { titles: out, year: year };
}

// alternative titles (e.g. romanized "Kimi no Na wa.") — latin-script only, deduped, capped 12
async function getAltTitles(tmdbId, mediaType) {
  var kind = mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";
  var d = await fetchJson(
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_KEY, {}, 9000);
  var out = [], seen = {};
  var arr = d && (d.titles || d.results);
  if (!arr) return out;
  for (var i = 0; i < arr.length && out.length < 12; i++) {
    var t = arr[i] && arr[i].title;
    if (!t || !/^[\x20-\x7EÀ-ſ ’'&+,:;.-]+$/.test(t)) continue; // keep latin scripts only
    var key = slugify(t);
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(t);
  }
  return out;
}

// season anatomy: map season number -> episode_count (skips specials season 0)
async function getSeasonMap(tmdbId) {
  var d = await fetchJson(
    "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US", {}, 9000);
  var map = {};
  if (d && d.seasons) {
    for (var i = 0; i < d.seasons.length; i++) {
      var s = d.seasons[i];
      if (s && typeof s.season_number === "number" && s.season_number >= 1) {
        map[s.season_number] = s.episode_count || 0;
      }
    }
  }
  return map;
}

// anime sites number episodes ABSOLUTELY (1..N across seasons). Convert TMDB S/E -> absolute.
// fallback: if season anatomy unavailable, take episode as-is (matches most S1 cases).
function absoluteFromSeasonMap(seasonMap, season, episode) {
  var keys = Object.keys(seasonMap).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
  if (!keys.length) return episode;
  var abs = 0;
  for (var i = 0; i < keys.length; i++) {
    var sn = keys[i];
    if (sn < season) abs += (seasonMap[sn] || 0);
  }
  return abs + episode;
}

// build SEARCH QUERY variants: full title + first-3 + first-2 + distinctive tokens.
// Site searches match substrings in THEIR titles — full long titles often hit nothing
// (their title is a short romaji), so word fragments and rare single tokens matter.
var STOP_TOKENS = { the:1, les:1, des:1, une:1, and:1, for:1, sur:1, aux:1, avec:1, dans:1, movie:1, film:1, an:1, en:1 };
function buildQueries(titles) {
  var seen = {}, out = [];
  function push(q) {
    q = String(q || "").trim();
    if (q.length < 2) return;
    var key = q.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(q);
  }
  var tokenPool = [];
  for (var i = 0; i < titles.length && out.length < 10; i++) {
    var toks = String(titles[i]).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (!toks.length) continue;
    push(titles[i]);                              // full title first
    if (toks.length >= 3) push(toks.slice(0, 3).join(" "));
    if (toks.length >= 2) push(toks.slice(0, 2).join(" "));
    var picked = 0;
    for (var t = 0; t < toks.length && picked < 2; t++) {
      var w = toks[t], lw = w.toLowerCase();
      if (w.length >= 5 && !STOP_TOKENS[lw] && !/^\d+$/.test(w)) { tokenPool.push(w); picked++; }
    }
    // distinctive tokens of THIS title right away (romaji sites match single tokens)
    tokenPool.sort(function (a, b) { return b.length - a.length; });
    var used = {};
    for (var p = 0; p < tokenPool.length && out.length < 10; p++) {
      if (!used[tokenPool[p].toLowerCase()]) { used[tokenPool[p].toLowerCase()] = 1; push(tokenPool[p]); }
    }
  }
  return out.slice(0, 10);
}

// ---- purstream\index.js ----
// PurStream — liens HLS DIRECTS (qualité HD, double audio FR/VO + sous-titres).
// Listing via l'API publique Movix (api.movix.fun) : seule la LISTE des liens passe par
// leur serveur (le flux vidéo part DIRECTEMENT de l'appareil vers le CDN finepulfe).
// Aucun compte, aucune clé : GET /api/purstream/movie|tv/<tmdbId>/stream[?season&s&episode=e]




var PROVIDER_NAME = "PurStream";
var LOG = "[purstream]";
var API = "https://api.movix.fun/api/purstream";

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    season = season || 1;
    episode = episode || 1;

    var url = API + (isMovie
      ? "/movie/" + encodeURIComponent(String(tmdbId)) + "/stream"
      : "/tv/" + encodeURIComponent(String(tmdbId)) + "/stream?season=" + season + "&episode=" + episode);

    var j = await fetchJson(url, { headers: { "Accept": "application/json" } }, 15000);
    if (!j || !j.sources || !j.sources.length) {
      console.log(LOG + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " -> rien");
      return [];
    }

    var title = null;
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (info && info.titles && info.titles.length) title = info.titles[0];
    if (!title) title = j.title || ("TMDB " + tmdbId);

    var out = [];
    for (var i = 0; i < j.sources.length; i++) {
      var s = j.sources[i];
      if (!s || typeof s.url !== "string" || !/^https?:\/\//i.test(s.url)) continue;
      var nm = String(s.name || "pulse");
      var qm = /(\d{3,4})p/i.exec(nm);
      var quality = qm ? qm[1] + "p" : "auto";
      var isMulti = /multi/i.test(nm);
      out.push({
        name: "🇫🇷 " + PROVIDER_NAME + " · " + quality + " · " + (isMulti ? "MULTI" : "VF") + " · HLS",
        title: title + (isMovie ? "" : " · S" + season + "E" + episode) + " · " + nm,
        url: s.url,
        quality: quality,
        language: isMulti ? "VF + VO (multi-audio, sous-titres FR)" : "VF",
        provider: PROVIDER_NAME,
        // CDN finepulfe : 403 si un Referer est présent, 200 sans -> pas de Referer
        headers: streamHeaders("")
      });
    }
    console.log(LOG + " => " + out.length + " streams");
    return out;
  } catch (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  }
}

// ---- nuvio export ----
var __exp = { __esModule: true, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) { module.exports = __exp; }
if (typeof exports !== "undefined") { exports.getStreams = getStreams; exports.__esModule = true; }
