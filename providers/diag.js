/* diag v13 — probes the two FILM providers (fs20 + yablom) end-to-end on-device. Always ONE row. */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: true });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var diag_exports = {};
__export(diag_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(diag_exports);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var VERSION = "DIAG v13 (film chains)";

function row(msg) {
  return {
    name: VERSION + " | " + msg,
    title: VERSION + " | " + msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}
function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10), c = parseInt(m[3], 10), k = m[4].split("|");
  if (a > 62) return "";
  try { while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); } }
  catch (e) { return "TOSTRING_THREW"; }
  return p;
}
function findMedia(t) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(t); if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(t); if (m) return m[0];
  return null;
}
function status(r) { return r && typeof r.status === "number" ? r.status : "?"; }

// ---------------- fs20 film chain ----------------
function checkFs20() {
  return __async(this, null, function* () {
    var base = "https://fs20.lol", ck = "fsschal=1";
    try {
      var r1 = yield fetch(base + "/engine/ajax/search.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Referer": base + "/", "Cookie": ck },
        body: "query=inception&page=1"
      });
      var b1 = yield r1.text();
      var items = [], re = /location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g, mm;
      while ((mm = re.exec(b1)) !== null) items.push({ id: mm[1], title: mm[2] });
      if (!items.length) return "fs20[search=0@" + status(r1) + " len" + b1.length + "]";
      // first film without "saison"
      var film = null;
      for (var i = 0; i < items.length; i++) { if (!/saison/i.test(items[i].title)) { film = items[i]; break; } }
      if (!film) film = items[0];
      // film page -> players
      var r2 = yield fetch(base + "/index.php?newsid=" + film.id, { headers: { "User-Agent": UA, "Referer": base + "/", "Cookie": ck } });
      var b2 = yield r2.text();
      var players = [], re2 = /class="option"\s+data-url="([^"]+)"><span>([^<]*)</g, m2;
      while ((m2 = re2.exec(b2)) !== null) players.push(m2[1]);
      if (!players.length) return "fs20[search=" + items.length + " film=" + film.id + " players=0@" + status(r2) + " len" + b2.length + "]";
      // resolve first embed
      var emb = players[0];
      var org = (/^(https?:\/\/[^/]+)/i.exec(emb) || ["", ""])[1];
      var r3 = yield fetch(emb, { headers: { "User-Agent": UA, "Referer": org + "/" } });
      var b3 = yield r3.text();
      var media = findMedia(unpackPacked(b3)) || findMedia(b3);
      if (!media) return "fs20[search=" + items.length + " players=" + players.length + " embed@" + status(r3) + " NO-MEDIA]";
      var r4 = yield fetch(media, { headers: { "User-Agent": UA, "Referer": org + "/" } });
      var b4 = yield r4.text();
      var tag = b4.indexOf("#EXT") !== -1 ? "#EXT-OK" : "NO-EXT";
      return "fs20[OK search=" + items.length + " players=" + players.length + " CDN=" + status(r4) + "/" + tag + "]";
    } catch (e) { return "fs20[THREW:" + (e && e.message ? e.message : e) + "]"; }
  });
}

// ---------------- yablom film chain ----------------
function checkYablom() {
  return __async(this, null, function* () {
    var O = "https://yablom.com", folder = "euvcw7", ck = "g=true";
    try {
      var r1 = yield fetch(O + "/" + folder + "/api_search.php?searchword=inception", { headers: { "User-Agent": UA, "Cookie": ck } });
      var b1 = yield r1.text();
      var j = null; try { j = JSON.parse(b1); } catch (e) {}
      if (!j || !j.films) return "yablom[folder/api NOTJSON@" + status(r1) + " len" + b1.length + "]";
      if (!j.films.length) return "yablom[search=0]";
      var f = j.films[0], lm = /(\d+)\s*$/.exec(String(f.link || "")), id = lm ? lm[1] : null;
      if (!id) return "yablom[search=" + j.films.length + " no-linkId]";
      var r2 = yield fetch(O + "/" + folder + "/b/yablom/" + id, { headers: { "User-Agent": UA, "Cookie": ck } });
      var b2 = yield r2.text();
      var im = /src="(https?:\/\/[a-z0-9.-]+\/iframe\/[A-Za-z0-9]+)"/i.exec(b2) || /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(b2);
      if (!im) return "yablom[search=" + j.films.length + " detail@" + status(r2) + " NO-IFRAME len" + b2.length + "]";
      var eh = (/^https?:\/\/([^/]+)/i.exec(im[1]) || ["", "?"])[1];
      return "yablom[OK search=" + j.films.length + " embed@" + status(r2) + "=" + eh + "]";
    } catch (e) { return "yablom[THREW:" + (e && e.message ? e.message : e) + "]"; }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var a, b;
    try { a = yield checkFs20(); } catch (e) { a = "fs20[CRASH]"; }
    try { b = yield checkYablom(); } catch (e) { b = "yablom[CRASH]"; }
    return [row(a + " || " + b)];
  }).then(function (x) { return x; }, function (e) { return [row("CRASH " + (e && e.message ? e.message : e))]; });
}
