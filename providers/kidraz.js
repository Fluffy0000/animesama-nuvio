/* vofamille/kidraz - built 2026-08-26T16:58:01Z — GENERATED from src/, edit sources then `python3 build.py` */
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
  [/voe\.|voemfr|voeunblk|v-o-e|sydney|jeffery|kenneth|callistan|metagnat|20demidistance|fraudsecond/i, { name: "Voe", kind: "voe" }],
  [/filemoon|moonmov/i, { name: "Filemoon", kind: "packer" }],
  [/vidmoly|vidmolyme/i, { name: "Vidmoly", kind: "generic" }],
  [/voembed|vmcld|myvidplay|vidcloud9/i, { name: "Voembed", kind: "generic" }],
  [/sharecloudy|ofbax|vromov|dotrab|ramcloud|cloudiest|nonwt/i, { name: "Sharecloudy", kind: "generic" }],
  [/sibnet/i, { name: "Sibnet", kind: "sibnet" }],
  [/sendvid/i, { name: "Sendvid", kind: "generic" }],
  [/luluvdo|lulu/i, { name: "Luluvdo", kind: "generic" }],
  [/vidzy/i, { name: "Vidzy", kind: "packer" }],
  [/fsvid/i, { name: "Fsvid", kind: "packer" }],
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
async function playlistLooksReal(url, referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  var t = await fetchText(url, { headers: h }, 12000);
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
      // Referer = origine de la page embed (ce qu'envoie le vrai player):
      // certains edges l'exigent (v6.vidzy.cc -> 403 sans), les autres l'acceptent (u14 -> 200).
      var cref = baseOf(pg.finalUrl) || baseOf(embedUrl) || "";
      if (cref) cref += "/";
      if (/\.m3u8/i.test(media) && !(await playlistLooksReal(media, cref))) return null;
      return { url: media, referer: cref, embedFrom: pg.finalUrl };
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

// ---- vofamille/index.js ----
// vofamille — generic provider for the yablom-skeleton family:
//   yablom.com, kordoz.com, ilmiv.com, kidraz.com (films only, VF/VOSTFR, sharecloudy)
// Pipeline: resolve folder token -> /{f}/api_search.php?searchword= (Referer REQUIRED)
//           -> /{f}/b/<tag>/<id> -> iframe (sharecloudy/ofbax) -> direct m3u8.
// SITE config is injected at build time by build.py (see VARIANTS).






var SITE = {"id": "kidraz", "name": "Kidraz", "origin": "https://www.kidraz.com", "tag": "kidraz", "folder": "saby1jy"};

var PROVIDER_NAME = SITE.name;

function headers(referer) {
  var h = { "User-Agent": CORE_UA, "Cookie": "g=true" };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- folder token (validated by content, auto-rediscovered if it rotates) ----
var cachedFolder = null;

async function folderWorks(folder) {
  var home = SITE.origin + "/" + folder + "/home/" + SITE.tag;
  var r = await safeFetch(home, { headers: headers(null) }, 9000);
  if (!netIsOk(r)) return false;
  try {
    var html = await r.text();
    return html && html.length > 40000; // the real home page is a fat film catalogue
  } catch (e) { return false; }
}

async function resolveFolder() {
  if (cachedFolder) return cachedFolder;
  if (await folderWorks(SITE.folder)) { cachedFolder = SITE.folder; return cachedFolder; }
  try {
    var html = await fetchText(SITE.origin + "/", { headers: headers(null) }, 9000);
    if (html) {
      var seen = {}, cands = [], re = /href="\/?([a-zA-Z0-9]{4,14})"/g, m;
      while ((m = re.exec(html)) !== null) {
        var tok = m[1];
        if (!seen[tok]) { seen[tok] = true; cands.push(tok); }
      }
      for (var i = 0; i < cands.length; i++) {
        if (await folderWorks(cands[i])) { cachedFolder = cands[i]; return cachedFolder; }
      }
    }
  } catch (e) {}
  cachedFolder = SITE.folder;
  return cachedFolder;
}

// ---- search (Referer to the folder home is MANDATORY — without it: 0 films) ----
async function searchFilms(folder, query) {
  var url = SITE.origin + "/" + folder + "/api_search.php?searchword=" + encodeURIComponent(query);
  var j = await fetchJson(url, { headers: headers(SITE.origin + "/" + folder + "/home/" + SITE.tag) }, 9000);
  if (!j || !j.films) return [];
  var out = [];
  for (var i = 0; i < j.films.length; i++) {
    var f = j.films[i];
    if (!f) continue;
    // JSON `link` uses a stale folder/tag (/ALBRAD/b/localhost/<id>); only trailing id is real
    var linkId = "";
    if (f.link) { var lm = /(\d+)\s*$/.exec(String(f.link)); if (lm) linkId = lm[1]; }
    if (!linkId && f.id) linkId = String(f.id);
    if (!linkId) continue;
    var ym = /\((\d{4})\)/.exec(String(f.title || ""));
    out.push({ id: linkId, title: String(f.title || ""), vostfr: !!f.vostfr, year: ym ? ym[1] : null });
  }
  return out;
}

// strip trailing "(YYYY)" then slug
function siteSlug(title) {
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, ""));
}

function scoreFilm(film, candSlugs, tmdbYear) {
  var s = siteSlug(film.title);
  if (!s) return -1;
  var best = -1;
  for (var i = 0; i < candSlugs.length; i++) {
    var c = candSlugs[i];
    if (!c) continue;
    var base = -1;
    if (s === c) base = 100;
    else if (s.length > 4 && c.length > 4 && (s.indexOf(c) === 0 || c.indexOf(s) === 0)) base = 55;
    if (base < 0) continue;
    if (tmdbYear && film.year) base += (tmdbYear === film.year ? 15 : -25);
    if (base > best) best = base;
  }
  return best;
}

async function fetchEmbedUrl(folder, linkId) {
  var home = SITE.origin + "/" + folder + "/home/" + SITE.tag;
  var html = await fetchText(SITE.origin + "/" + folder + "/b/" + SITE.tag + "/" + linkId,
                             { headers: headers(home) }, 10000);
  if (!html) return null;
  var m = /src="(https?:\/\/[a-z0-9.-]+\/iframe\/[A-Za-z0-9]+)"/i.exec(html);
  if (m) return m[1];
  var g = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
  return g ? g[1] : null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" || mediaType === "anime") return []; // films-only catalogue
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];
    var candSlugs = info.titles.map(slugify);

    var folder = await resolveFolder();
    var queries = buildQueries(info.titles);
    var byId = {}, done = false;
    for (var i = 0; i < queries.length && !done; i++) {
      var films = await searchFilms(folder, queries[i]);
      for (var j = 0; j < films.length; j++) {
        var f = films[j];
        if (!byId[f.id]) byId[f.id] = f;
        if (scoreFilm(f, candSlugs, info.year) >= 100) done = true;
      }
    }
    var best = null, bestScore = -1;
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      var sc = scoreFilm(byId[id], candSlugs, info.year);
      if (sc > bestScore) { bestScore = sc; best = byId[id]; }
    }
    if (!best || bestScore < 65) return [];

    var embed = await fetchEmbedUrl(folder, best.id);
    if (!embed) return [];
    var res = await resolveEmbed(embed, { referer: SITE.origin + "/" });
    if (!res || !res.url) return [];

    var lang = best.vostfr ? "VOSTFR" : "VF";
    var flag = best.vostfr ? "🇯🇵" : "🇫🇷";
    var kind = /\.m3u8/i.test(res.url) ? "HLS" : "MP4";
    return [{
      name: flag + " " + PROVIDER_NAME + " · " + res.name + " · " + lang + " · " + kind,
      title: best.title.replace(/^\u200e/, "") + " · " + lang,
      url: res.url,
      quality: "auto",
      language: lang,
      provider: PROVIDER_NAME,
      headers: streamHeaders(res.referer)
    }];
  } catch (e) {
    return [];
  }
}

// ---- nuvio export ----
var __exp = { __esModule: true, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) { module.exports = __exp; }
if (typeof exports !== "undefined") { exports.getStreams = getStreams; exports.__esModule = true; }
