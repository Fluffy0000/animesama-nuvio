/* voiranime - built 2026-08-26T11:14:42Z — GENERATED from src/, edit sources then `python3 build.py` */
// ---- core/net.js ----
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

// ---- core/text.js ----
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

// ---- core/tmdb.js ----
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

// ---- core/hosts.js ----
// core/hosts.js — resolve an embed/player URL to a direct video { url, referer, name } | null
// All requests go DIRECT from the device. No proxy, no third-party relay, ever.




// ---- host classification ----------------------------------------------------
var HOST_RULES = [
  [/uqload|up4fun|up4load|upload42|uppom/i, { name: "Uqload",  kind: "packer" }],
  [/dood|ds2play|ds2video|d0o0d|dooodster|vidply/i, { name: "Dood", kind: "dood" }],
  [/voe\.|voemfr|voeunblk|v-o-e|jeffery|kenneth|callistan|metagnat|20demidistance|fraudsecond/i, { name: "Voe", kind: "voe" }],
  [/filemoon|moonmov/i, { name: "Filemoon", kind: "packer" }],
  [/vidmoly|vidmolyme/i, { name: "Vidmoly", kind: "generic" }],
  [/voembed|vmcld|myvidplay|vidcloud9/i, { name: "Voembed", kind: "generic" }],
  [/sharecloudy|ofbax|vromov|dotrab|ramcloud|cloudiest|nonwt/i, { name: "Sharecloudy", kind: "generic" }],
  [/sibnet/i, { name: "Sibnet", kind: "sibnet" }],
  [/sendvid/i, { name: "Sendvid", kind: "generic" }],
  [/luluvdo|lulu/i, { name: "Luluvdo", kind: "generic" }],
  [/vidzy/i, { name: "Vidzy", kind: "packer" }],
  [/getvid\.club/i, { name: "Getvid", kind: "getvid" }],
  [/streamtape/i, { name: "Streamtape", kind: "generic" }],
  [/mixdrop/i, { name: "Mixdrop", kind: "packer" }],
  [/smoothpre|amethyst/i, { name: "Smoothpre", kind: "generic" }],
  [/upns|fmx|serix/i, { name: "FMX", kind: "skip" }] // hash-fragment transport: not server-resolvable
];

function classify(embedUrl) {
  for (var i = 0; i < HOST_RULES.length; i++) {
    if (HOST_RULES[i][0].test(embedUrl)) return HOST_RULES[i][1];
  }
  return { name: prettyHostName(embedUrl), kind: "generic" };
}

function prettyHostName(embedUrl) {
  var h = hostOf(embedUrl);
  var parts = h.split(".");
  var reg = parts.length >= 2 ? parts[parts.length - 2] : h;
  return reg.charAt(0).toUpperCase() + reg.slice(1);
}

function pageHeaders(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- extraction from a fetched page -----------------------------------------
function extractFromText(html) {
  var u = findVideoUrl(html);
  if (u) return u;
  var unpacked = unpackPackers(html);
  for (var i = 0; i < unpacked.length; i++) {
    u = findVideoUrl(unpacked[i]);
    if (u) return u;
  }
  return null;
}

// fetch page text AND the final URL after redirects — the referer a CDN expects is the
// FINAL embed page origin (sharecloudy.com/iframe -> ofbax.com/iframe => referer ofbax.com)
async function fetchPage(url, referer, timeoutMs) {
  var r = await safeFetch(url, { headers: pageHeaders(referer) }, timeoutMs || 12000);
  if (!netIsOk(r)) return null;
  var finalUrl = url;
  try { if (typeof r.url === "string" && r.url.indexOf("http") === 0) finalUrl = r.url; } catch (e) {}
  try { return { html: await r.text(), finalUrl: finalUrl }; } catch (e) { return null; }
}

// generic: fetch page, hunt video url, follow one nested iframe if needed
async function genericResolve(embedUrl, referer, depth) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var media = extractFromText(pg.html);
  if (!media && depth < 2) {
    var frames = findIframes(pg.html);
    for (var i = 0; i < Math.min(frames.length, 3); i++) {
      var r = await genericResolve(frames[i], pg.finalUrl, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!media) return null;
  return { url: media, referer: baseOf(pg.finalUrl) + "/" || refererFromMediaUrl(media), embedFrom: pg.finalUrl };
}

// fsvid/vidzy : quand le host n'a pas la vidéo il sert un VOD court (intro ~18s). Une vraie
// master playlist a des variantes (EXT-X-STREAM-INF); une media playlist VOD courte = leurre.
async function playlistLooksReal(url) {
  var t = await fetchText(url, { headers: { "User-Agent": CORE_UA } }, 12000);
  if (!t || t.indexOf("#EXTM3U") < 0) return true;      // réseau capricieux -> on ne tue pas le stream
  if (t.indexOf("#EXT-X-STREAM-INF") >= 0) return true;
  if (t.indexOf("#EXT-X-ENDLIST") < 0) return true;
  var mm = t.match(/#EXTINF:[\d.]+/g) || [];
  var sum = 0;
  for (var i = 0; i < mm.length; i++) sum += parseFloat(mm[i].split(":")[1]) || 0;
  return sum >= 240;
}

// uqload/filemoon/vidzy/mixdrop: packed jwplayer configs
async function packerResolve(embedUrl, referer) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var unpacked = unpackPackers(pg.html);
  var media = null;
  // fsvid/vidzy: le vrai lien est chiffré (cipher hostname-xor); le .m3u8 en clair est un leurre.
  var cipherHost = isCipherHost(pg.finalUrl) || isCipherHost(embedUrl);
  if (cipherHost) {
    var chkHost = hostOf(pg.finalUrl) || hostOf(embedUrl);
    media = decodeHostCipher(unpacked.join("\n"), chkHost) || decodeHostCipher(pg.html, chkHost);
    if (media) {
      if (isTrollUrl(media)) return null;
      if (/\.m3u8/i.test(media) && !(await playlistLooksReal(media))) return null;
      // leur CDN répond 200 SANS Referer mais 403 avec certains Referer -> pas de Referer
      return { url: media, referer: "", embedFrom: pg.finalUrl };
    }
  }
  for (var i = 0; i < unpacked.length; i++) {
    media = findVideoUrl(unpacked[i]);
    if (media) break;
  }
  if (!media) media = findVideoUrl(pg.html); // sometimes plain
  if (media && isTrollUrl(media)) media = null;
  if (!media) {
    var frames = findIframes(pg.html); // one nesting level
    for (var j = 0; j < Math.min(frames.length, 3) && !media; j++) {
      var pg2 = await fetchPage(frames[j], pg.finalUrl, 10000);
      if (pg2) media = extractFromText(pg2.html);
      if (media && isTrollUrl(media)) media = null;
      if (media) return { url: media, referer: baseOf(pg2.finalUrl) + "/", embedFrom: pg2.finalUrl };
    }
  }
  if (!media) return null;
  // packed hosts demand the (final) embed page origin as referer
  return { url: media, referer: baseOf(pg.finalUrl) + "/", embedFrom: pg.finalUrl };
}

// dood stream: /pass_md5 chain -> token URL
async function doodResolve(embedUrl, referer) {
  var html = await fetchText(embedUrl, { headers: pageHeaders(referer) }, 12000);
  if (!html) return null;
  var pm = /(\/pass_md5\/[^'"]+)/.exec(html);
  if (pm) {
    var passUrl = absUrl(embedUrl, pm[1]);
    var token = pm[1].split("/").pop();
    var r2 = await safeFetch(passUrl, { headers: pageHeaders(embedUrl) }, 10000);
    if (netIsOk(r2)) {
      var base = "";
      try { base = (await r2.text()).trim(); } catch (e) {}
      if (base && base.indexOf("http") === 0) {
        var rnd = "";
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 10; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
        return { url: base + rnd + "?token=" + token + "&expiry=" + Date.now(),
                 referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
      }
    }
  }
  // fallback: maybe a direct url is just lying in the page
  var media = extractFromText(html);
  if (media) return { url: media, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
  return null;
}

// voe: 'hls:' link or base64 prompt fallback (best effort; voe blocks datacenter IPs)
async function voeResolve(embedUrl, referer) {
  var html = await fetchText(embedUrl, { headers: pageHeaders(referer) }, 10000);
  if (!html) return null;
  var m = /['"]hls['"]\s*:\s*['"]([^'"]+)['"]/.exec(html);
  if (m && m[1].indexOf("http") === 0) return { url: m[1], referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
  m = /let\s+\w+\s*=\s*'([A-Za-z0-9+/=]{40,})'/.exec(html); // base64 m3u8 in var
  if (m) {
    try {
      var dec = atob(m[1]);
      if (dec.indexOf("http") === 0) return { url: dec, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
    } catch (e) {}
  }
  return genericResolve(embedUrl, referer, 0);
}

// sibnet: shell.php page holds player.src([{src: "/v/<hash>/<id>.mp4"}])
async function sibnetResolve(embedUrl, referer) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var m = /player\.src\(\[\{src:\s*"([^"]+\.mp4[^"]*)"/i.exec(pg.html);
  if (!m) m = /src:\s*"([^"]+\.m3u8[^"]*)"/i.exec(pg.html);
  if (!m) return genericResolve(embedUrl, referer, 0);
  var u = m[1].indexOf("http") === 0 ? m[1] : absUrl(pg.finalUrl, m[1]);
  return { url: u, referer: "https://video.sibnet.ru/", embedFrom: pg.finalUrl };
}

// getvid.club/player/index.php?data=... : try page; if nothing, hex-decode data
async function getvidResolve(embedUrl, referer) {
  var r = await genericResolve(embedUrl, referer, 1);
  if (r) return r;
  var dm = /[?&]data=([0-9a-fA-F]{16,})/.exec(embedUrl);
  if (dm) {
    var hex = dm[1], s = "";
    for (var i = 0; i + 1 < hex.length && hex.length <= 6000; i += 2) {
      s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    if (s.indexOf("http") !== -1) {
      var u = findVideoUrl(s);
      if (u) return { url: u, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
      var im = /https?:\/\/[^\s"'<>)]+/i.exec(s);
      if (im) return await genericResolve(im[0], embedUrl, 1);
    }
  }
  return null;
}

// ---- main entry --------------------------------------------------------------
// resolveEmbed(embedUrl, opts{ referer }) -> { url, referer, name } | null
async function resolveEmbed(embedUrl, opts) {
  if (!embedUrl) return null;
  if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
  if (embedUrl.indexOf("http") !== 0) return null;
  var referer = opts && opts.referer ? opts.referer : null;
  var cls = classify(embedUrl);
  try {
    var r = null;
    if (cls.kind === "skip") return null;
    else if (cls.kind === "dood") r = await doodResolve(embedUrl, referer);
    else if (cls.kind === "packer") r = await packerResolve(embedUrl, referer);
    else if (cls.kind === "voe") r = await voeResolve(embedUrl, referer);
    else if (cls.kind === "getvid") r = await getvidResolve(embedUrl, referer);
    else if (cls.kind === "sibnet") r = await sibnetResolve(embedUrl, referer);
    else r = await genericResolve(embedUrl, referer, 0);
    if (!r || !r.url) return null;
    if (!/\.(m3u8|mp4)(\?|#|$)/i.test(r.url)) return null; // sanity: real video file only
    return { url: r.url, referer: r.referer, name: cls.name };
  } catch (e) {
    return null;
  }
}

// ---- voiranime/index.js ----
// voiranime — provider for voir-anime.to (WP "Madara", anime VOSTFR + VF)
// Pipeline: search ?post_type=wp-manga&s= -> result cards -> CONFIRM each anime page
//           (per-candidate-title token coverage + year) -> season-aware episode pick
//           -> episode page iframe (voembed.net) -> direct multi-quality m3u8.
//
// Season/episode mapping: the site splits seasons into their own slugs
// (kimetsu-no-yaiba, kimetsu-no-yaiba-2, -3, -4...) each numbered from 1,
// while the BASE page numbers absolutely. Rule: if season>=2 and a "-<season>"
// slug exists -> mine it with the TMDB episode number; else -> base page, absolute ep.






var ORIGIN = "https://voir-anime.to";
var MAX_CANDS = 20;
var MAX_VERIFY = 6;
var MAX_EP = 5;

function log(m) {
  try {
    if (typeof process !== "undefined" && process && process.env && process.env.VOIRANIME_DEBUG) console.error("VA| " + m);
  } catch (e) {}
}

function hdrs(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// fetch an anime page following redirects; returns the CANONICAL slug from the final URL
// (/anime/kimetsu-no/ 301 -> /anime/kimetsu-no-yaiba/) so downstream regexes stay exact.
async function fetchAnimePage(slug) {
  var r = await safeFetch(ORIGIN + "/anime/" + slug + "/", { headers: hdrs(ORIGIN + "/") }, 12000);
  if (!netIsOk(r)) return null;
  var final = slug;
  try {
    if (typeof r.url === "string") {
      var m = /\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\//i.exec(r.url);
      if (m) final = m[1].toLowerCase();
    }
  } catch (e) {}
  try { return { slug: final, html: await r.text() }; } catch (e) { return null; }
}

function htmlEntities(s) {
  return String(s || "").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
                        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
                        .replace(/\s+/g, " ").trim();
}

// --- search -> [{slug, title}] via title="..." attr AND anchor inner text -----
function animeResults(html) {
  var out = [], seen = {}, m, a;
  var r1 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"([^>]*)>/gi;
  while ((m = r1.exec(html)) !== null) {
    var s = m[1].toLowerCase();
    if (s === "feed" || seen[s]) continue;
    seen[s] = true;
    var tm = /title="([^"]{2,140})"/i.exec(m[2] || "");
    out.push({ slug: s, title: htmlEntities(tm ? tm[1] : "") });
  }
  var r2 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,140})</gi;
  while ((a = r2.exec(html)) !== null) {
    var s2 = a[1].toLowerCase();
    if (s2 === "feed") continue;
    var txt = htmlEntities(a[2]);
    for (var i = 0; i < out.length; i++) {
      if (out[i].slug === s2 && !out[i].title && txt && !/^(lire|voir|ep|episode)/i.test(txt)) out[i].title = txt;
    }
    if (!seen[s2]) { seen[s2] = true; out.push({ slug: s2, title: txt }); }
  }
  return out;
}

// --- identity proof on an anime page -------------------------------------------
// best per-candidate-title token coverage found on page + TMDB year bonus
function titleTokens(t) {
  var toks = stripAccents(String(t).toLowerCase()).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/), out = [];
  for (var i = 0; i < toks.length; i++) if (toks[i].length >= 4 && !/^\d+$/.test(toks[i])) out.push(toks[i]);
  return out;
}
// normalize for phrase search: alnum collapsed to single spaces
function normTxt(s) { return " " + stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, " ") + " "; }

// identity proof: (a) a FULL candidate phrase on the page -> sure; else
// (b) >= 50% of a candidate's distinctive tokens at WORD STARTS, with >= 2 hits.
function pageConfirm(pageText, candTitles, tmdbYear) {
  if (!pageText) return { cov: 0, score: -1 };
  var p = normTxt(pageText);
  var best = 0;
  for (var i = 0; i < candTitles.length; i++) {
    var t = candTitles[i];
    var phrase = normTxt(t).replace(/\s+/g, " ").trim();
    if (phrase.length >= 5 && p.indexOf(" " + phrase + " ") !== -1) { best = 1; break; }
    var toks = titleTokens(t);
    if (!toks.length) continue;
    var hits = 0;
    for (var j = 0; j < toks.length; j++) {
      if (p.indexOf(" " + toks[j]) !== -1) hits++;
    }
    if (hits < 2) continue;                       // generic single tokens prove nothing
    var cov = hits / toks.length;
    if (cov > best) best = cov;
  }
  var score = Math.round(70 * best);
  if (tmdbYear && p.indexOf(" " + String(tmdbYear) + " ") !== -1) score += 25;
  return { cov: best, score: score };
}

// --- episode/film link mining ---------------------------------------------------
function pickEpisode(html, slug, epNum) {
  var out = { vostfr: null, vf: null };
  var re = new RegExp('href="(https?:\\/\\/voir-anime\\.to\\/anime\\/' + slug + '\\/[a-z0-9][a-z0-9-]*?-(\\d{2,5})-(vostfr|vf))\\/?"', "gi"), m;
  while ((m = re.exec(html)) !== null) {
    if (parseInt(m[2], 10) === epNum) {
      if (m[3] === "vf" && !out.vf) out.vf = m[1];
      if (m[3] === "vostfr" && !out.vostfr) out.vostfr = m[1];
    }
  }
  return out;
}
function pickMovieLinks(html, slug) {
  var out = [], seen = {}, m;
  var re = new RegExp('href="(https?:\\/\\/voir-anime\\.to\\/anime\\/' + slug + '\\/((?:film|films|special|movie|ova)-(vostfr|vf)-[a-z0-9-]+)\\/?)"', "gi");
  while ((m = re.exec(html)) !== null) {
    var key = m[1] + m[3];
    if (!seen[key]) { seen[key] = true; out.push({ href: m[1], lang: m[3] }); }
  }
  return out;
}
function playerIframes(html) {
  var out = [], seen = {}, m;
  var re = /<(?:iframe|source)[^>]*(?:src|data-src)="(https?:\/\/[^"]+)"/gi;
  while ((m = re.exec(html)) !== null) {
    var u = m[1];
    if (/googletagmanager|facebook|doubleclick|analytics|whos\.amung/i.test(u)) continue;
    if (!seen[u]) { seen[u] = true; out.push(u); }
  }
  return out;
}

async function pageStreams(url, lang, title, streams) {
  var html = await fetchText(url, { headers: hdrs(ORIGIN + "/") }, 10000);
  if (!html) { log("ep page empty " + url); return; }
  var frames = playerIframes(html).slice(0, 3);
  log("ep " + url + " frames=" + frames.length);
  var results = await mapLimit(frames, 2, function (f) { return resolveEmbed(f, { referer: url }); });
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r || !r.url) continue;
    var flag = lang === "VF" ? "🇫🇷" : "🇯🇵";
    var kind = /\.m3u8/i.test(r.url) ? "HLS" : "MP4";
    streams.push({
      name: flag + " VoirAnime · " + r.name + " · " + lang + " · " + kind,
      title: title + " · " + lang,
      url: r.url,
      quality: "auto",
      language: lang,
      provider: "VoirAnime",
      headers: streamHeaders(r.referer)
    });
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];
    var S = season || 1, E = episode || 1;

    var smap = isMovie ? {} : await getSeasonMap(tmdbId);
    var absEp = isMovie ? 1 : absoluteFromSeasonMap(smap, S, E);

    var alt = await getAltTitles(tmdbId, mediaType);
    var candTitles = info.titles.concat(alt);
    var queries = buildQueries(candTitles);
    log("queries: " + queries.join(" | "));

    // ---- search ----------------------------------------------------------------
    var cands = [], seenCand = {};
    for (var i = 0; i < queries.length && cands.length < MAX_CANDS; i++) {
      var sh = await fetchText(ORIGIN + "/?post_type=wp-manga&s=" + encodeURIComponent(queries[i]), { headers: hdrs(ORIGIN + "/") }, 10000);
      if (!sh) continue;
      var items = animeResults(sh);
      log("q='" + queries[i] + "' -> " + items.length + " items");
      for (var j = 0; j < items.length && cands.length < MAX_CANDS; j++) {
        if (!seenCand[items[j].slug]) { seenCand[items[j].slug] = true; cands.push(items[j]); }
      }
    }
    if (!cands.length) { log("no candidates"); return []; }

    // ---- pre-rank candidates by TITLE match (before opening any page) -----------
    var candSlugsTitle = candTitles.map(slugify);
    function rankOf(slug, title) {
      var best = 0;
      var t = slugify(title || "");
      if (t) t = t.replace(/-vf$/, "");
      for (var i = 0; i < candSlugsTitle.length; i++) {
        var c = candSlugsTitle[i];
        if (!c) continue;
        var s = 0;
        if (t && t === c) s = 100;
        else if (slug === c || slug === c + "-vf" || slug + "-vf" === c) s = 90;
        else if (t && t.length > 4 && c.length > 4 && (t.indexOf(c) === 0 || c.indexOf(t) === 0)) s = 60;
        else if (t && t.length > 6 && c.length > 6 && (t.indexOf(c) !== -1 || c.indexOf(t) !== -1)) s = 35;
        if (s > best) best = s;
      }
      return best;
    }
    cands.sort(function (a, b) {
      function adj(c) {
        var r = rankOf(c.slug, c.title);
        if (/-?(movie|film|ova|special|pillar|recap)-/.test("-" + c.slug + "-")) r -= 15;
        return r;
      }
      return adj(b) - adj(a);
    });
    log("cands: " + cands.map(function (c) { return c.slug; }).join(", "));

    // ---- open pages, confirm identity --------------------------------------------
    var confirmed = [], canonSeen = {};
    var openCap = Math.min(cands.length, isMovie ? 3 : MAX_VERIFY);
    for (var k = 0; k < openCap; k++) {
      var pg = await fetchAnimePage(cands[k].slug);
      if (!pg) continue;
      if (canonSeen[pg.slug]) continue;
      var pc = pageConfirm(pg.html, candTitles, isMovie ? info.year : null);
      log("verify " + cands[k].slug + " -> " + pg.slug + " cov=" + pc.cov.toFixed(2) + " score=" + pc.score);
      if (pc.cov >= 0.5) { canonSeen[pg.slug] = true; confirmed.push({ slug: pg.slug, html: pg.html, score: pc.score }); }
      if (isMovie && confirmed.length >= 2) break;
      if (!isMovie && confirmed.length >= 6) break;
    }
    if (!confirmed.length) { log("no confirmed page"); return []; }

    // ---- BASE PAGE = shortest REAL page among confirmed slugs and ALL their
    //      parent slugs (series homes are too old for search results; season/film
    //      slugs are always <base>-something). Shortest verified parent wins.
    if (!isMovie) {
      var parents = [], seenP = {};
      for (var pb = 0; pb < confirmed.length; pb++) {
        var toks = confirmed[pb].slug.split("-");
        for (var cut = toks.length - 1; cut >= 1; cut--) {
          var pslug = toks.slice(0, cut).join("-");
          if (pslug.length < 8) break;
          if (!seenP[pslug]) { seenP[pslug] = true; parents.push(pslug); }
        }
      }
      parents.sort(function (a, b) { return a.length - b.length; }); // shortest first
      var baseFound = null;
      for (var pq = 0; pq < parents.length && !baseFound && pq < 8; pq++) {
        var pgp = await fetchAnimePage(parents[pq]);
        if (!pgp) continue;
        if (canonSeen[pgp.slug]) { // already verified page re-resolved: it IS a base candidate
          baseFound = confirmed.filter(function (x) { return x.slug === pgp.slug; })[0] || null;
          break;
        }
        var pc2 = pageConfirm(pgp.html, candTitles, null);
        log("parent-probe " + parents[pq] + " -> " + pgp.slug + " cov=" + pc2.cov.toFixed(2));
        if (pc2.cov >= 0.5) {
          baseFound = { slug: pgp.slug, html: pgp.html, score: pc2.score };
          confirmed.push(baseFound);
          canonSeen[pgp.slug] = true;
        }
      }
    }

    // ---- pick the RIGHT page(s) -------------------------------------------------
    confirmed.sort(function (a, b) {
      if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
      return b.score - a.score;
    });
    var base = isMovie ? confirmed[0] : (typeof baseFound !== "undefined" && baseFound ? baseFound : confirmed[0]);
    log("base = " + base.slug);
    var seasonPage = null, seasonVfPage = null;
    if (!isMovie && S >= 2) {
      for (var c2 = 0; c2 < confirmed.length; c2++) {
        var sl = confirmed[c2].slug;
        if (new RegExp("-" + S + "$").test(sl)) seasonPage = confirmed[c2];
        else if (new RegExp("-" + S + "-vf$").test(sl)) seasonVfPage = confirmed[c2];
      }
    }

    var streams = [], minedEps = 0;
    if (isMovie) {
      for (var c3 = 0; c3 < confirmed.length && streams.length < 8; c3++) {
        var links = pickMovieLinks(confirmed[c3].html, confirmed[c3].slug);
        log(confirmed[c3].slug + " filmLinks=" + links.length);
        for (var L = 0; L < links.length && streams.length < 8; L++) {
          await pageStreams(links[L].href, links[L].lang.toUpperCase(), info.titles[0], streams);
        }
      }
      return streams;
    }

    // tv — season-aware mining order:
    //   1) exact "-<S>" / "-<S>-vf" season pages, TMDB episode number (site restarts at 1)
    //   2) non-numbered arc pages (yuukaku-hen etc.) with TMDB episode number
    //   3) base page with ABSOLUTE episode number
    function seasonNumOf(slug) {
      var m = /-(\d+)(-vf)?$/.exec(slug);
      return m ? parseInt(m[1], 10) : null;
    }
    var seasonPages = [], arcPages = [];
    for (var sp = 0; sp < confirmed.length; sp++) {
      var sn = seasonNumOf(confirmed[sp].slug);
      if (sn === S && confirmed[sp].slug !== base.slug) seasonPages.push(confirmed[sp]);
      else if (sn === null && confirmed[sp].slug !== base.slug) arcPages.push(confirmed[sp]);
    }
    arcPages.sort(function (a, b) { return b.score - a.score; });

    var works = [];
    for (var a1 = 0; a1 < seasonPages.length; a1++) works.push({ page: seasonPages[a1], epNum: E });
    var label = info.titles[0];
    if (S >= 2 && !seasonPages.length && arcPages.length) {
      if (absEp > 100) {
        // long-running absolute numbering (One Piece...): base page is the authority
        works.push({ page: base, epNum: absEp });
        for (var a2 = 0; a2 < arcPages.length; a2++) works.push({ page: arcPages[a2], epNum: E });
      } else {
        // cour-split seasons (Demon Slayer...): arc pages number their eps from 1
        for (var a3 = 0; a3 < arcPages.length; a3++) works.push({ page: arcPages[a3], epNum: E });
        works.push({ page: base, epNum: absEp });
      }
    } else {
      works.push({ page: base, epNum: absEp });
    }

    var usedSlugs = {};
    for (var w = 0; w < works.length && streams.length < 8 && minedEps < MAX_EP; w++) {
      var wk = works[w];
      if (usedSlugs[wk.page.slug]) continue;
      usedSlugs[wk.page.slug] = true;
      var pick = pickEpisode(wk.page.html, wk.page.slug, wk.epNum);
      log("mine " + wk.page.slug + " epNum=" + wk.epNum + " -> vostfr=" + !!pick.vostfr + " vf=" + !!pick.vf);
      var lb = label + " · S" + S + "E" + E;
      if (pick.vostfr) { minedEps++; await pageStreams(pick.vostfr, "VOSTFR", lb, streams); }
      if (pick.vf && streams.length < 8) { minedEps++; await pageStreams(pick.vf, "VF", lb, streams); }
      if (streams.length) break;
    }
    return streams;
  } catch (e) {
    log("THREW " + (e && e.message ? e.message : e));
    return [];
  }
}

// ---- nuvio export ----
var __exp = { __esModule: true, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) { module.exports = __exp; }
if (typeof exports !== "undefined") { exports.getStreams = getStreams; exports.__esModule = true; }
