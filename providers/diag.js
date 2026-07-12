/* diag v2 — full-chain probe: site -> search -> film page -> embed host -> CDN .m3u8 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// diag/diag.js
var diag_exports = {};
__export(diag_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(diag_exports);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var HDRS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "identity"
};

function fakeStream(msg) {
  return {
    name: msg,
    title: msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG",
    language: "DIAG",
    provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}

// tolerant fetch: returns { status, body } and never throws
function grab(url, options) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    try {
      var r = yield fetch(url, options || { headers: HDRS });
      var status = r ? (typeof r.status === "number" ? r.status : "?") : "null";
      var body = "";
      try { body = yield r.text(); } catch (e) { body = ""; }
      var ms = Date.now() - t0;
      return { status: status, body: body || "", ms: ms };
    } catch (e) {
      return { status: "THROW", body: "", ms: Date.now() - t0, err: (e && e.message ? e.message : String(e)) };
    }
  });
}

function tag(body) {
  var b = body || "";
  if (b.indexOf("Just a moment") !== -1 || b.indexOf("cf-browser-verification") !== -1 || b.indexOf("Attention Required") !== -1)
    return " [CLOUDFLARE-CHALLENGE]";
  return "";
}
function line(label, res, extra) {
  var s = label + ": HTTP " + res.status + " " + (res.body ? res.body.length : 0) + "o " + res.ms + "ms" + tag(res.body);
  if (res.err) s += " ERR=" + res.err;
  if (extra) s += " | " + extra;
  return s;
}

// --- minimal packed-JS unpacker (same as fs20/french-manga extractor) ---
function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10);
  var c = parseInt(m[3], 10);
  var k = m[4].split("|");
  if (a > 62) return "";
  while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); }
  return p;
}
function findM3u8(text) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  return null;
}
function originOf(url) { var m = /^(https?:\/\/[^/]+)/i.exec(url); return m ? m[1] : ""; }

// ---- the real end-to-end chain for fs20 (Oppenheimer) ----
function fs20Chain(out) {
  return __async(this, null, function* () {
    // 1. search
    var sres = yield grab("https://fs20.lol/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": UA, "Accept-Encoding": "identity",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest", "Referer": "https://fs20.lol/"
      },
      body: "query=oppenheimer&page=1"
    });
    var idm = /location\.href='\/(\d+)-/.exec(sres.body);
    var newsId = idm ? idm[1] : null;
    out.push(fakeStream(line("A.fs20 search", sres, newsId ? ("newsId=" + newsId) : "NO newsId parsed")));
    if (!newsId) return;

    // 2. film page -> vidzy embed
    var fres = yield grab("https://fs20.lol/index.php?newsid=" + newsId, { headers: { "User-Agent": UA, "Referer": "https://fs20.lol/" } });
    var em = /class="option"\s+data-url="([^"]+)"/.exec(fres.body);
    var embed = em ? em[1] : null;
    out.push(fakeStream(line("B.fs20 film page", fres, embed ? ("embed=" + embed.slice(0, 40)) : "NO embed parsed")));
    if (!embed) return;

    // 3. embed host page
    var eref = originOf(embed) + "/";
    var eres = yield grab(embed, { headers: { "User-Agent": UA, "Referer": eref } });
    var hasPacked = eres.body.indexOf("}(") !== -1 && /eval|p,a,c,k/.test(eres.body);
    out.push(fakeStream(line("C.vidzy embed", eres, hasPacked ? "packed-JS present" : "NO packed JS (host changed?)")));

    // 4. unpack -> m3u8
    var unpacked = unpackPacked(eres.body);
    var m3u8 = findM3u8(unpacked) || findM3u8(eres.body);
    out.push(fakeStream("D.vidzy unpack: " + (m3u8 ? ("m3u8 FOUND " + m3u8.slice(0, 50)) : "m3u8 NOT extracted (unpacker failed)")));
    if (!m3u8) return;

    // 5. fetch the real CDN master playlist — THIS is the actual video endpoint
    var cres = yield grab(m3u8, { headers: { "User-Agent": UA, "Referer": eref } });
    var isPlaylist = cres.body.indexOf("#EXT") !== -1;
    out.push(fakeStream(line("E.CDN master.m3u8", cres, isPlaylist ? "VALID playlist ✓ (playback should work)" : "reachable but NOT a playlist")));
  });
}

function run() {
  return __async(this, null, function* () {
    var out = [];
    // site-level reachability (like the old diag)
    out.push(fakeStream(line("1.TMDB", yield grab("https://api.themoviedb.org/3/movie/872585?api_key=439c478a771f35c05022f9feabcca01c&language=fr-FR"), (yield grab("https://api.themoviedb.org/3/movie/872585?api_key=439c478a771f35c05022f9feabcca01c&language=fr-FR")).body.slice(0, 30))));
    out.push(fakeStream(line("2.fs20 home", yield grab("https://fs20.lol/", { headers: HDRS }))));
    out.push(fakeStream(line("3.frenchmanga", yield grab("https://w16.french-manga.net/", { headers: HDRS }))));
    out.push(fakeStream(line("4.yablom", yield grab("https://yablom.com/", { headers: HDRS }))));

    // FULL CHAIN — the part the old diag never tested
    yield fs20Chain(out);

    // video hosts used by the other providers
    out.push(fakeStream(line("F.sharecloudy (yablom host)", yield grab("https://sharecloudy.com/", { headers: HDRS }))));
    out.push(fakeStream(line("G.luluvdo (fmanga host)", yield grab("https://luluvdo.com/", { headers: HDRS }))));
    out.push(fakeStream(line("H.sibnet (animesama host)", yield grab("https://video.sibnet.ru/", { headers: HDRS }))));
    return out;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return run().catch(function (e) {
    return [fakeStream("DIAG crashed: " + (e && e.message ? e.message : e))];
  });
}
