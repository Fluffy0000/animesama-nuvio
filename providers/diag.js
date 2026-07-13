/* diag v12 — full french-manga -> vidzy -> CDN chain probe. Always returns exactly ONE row. */
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
var VERSION = "DIAG v12 (chain probe)";
var BASE = "https://w16.french-manga.net";

function row(msg) {
  return {
    name: VERSION + " | " + msg,
    title: VERSION + " | " + msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}

// Dean Edwards unpacker (same as our extractors)
function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10), c = parseInt(m[3], 10), k = m[4].split("|");
  if (a > 62) return "";
  try { while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); } }
  catch (e) { return "TOSTRING_THREW:" + (e && e.message ? e.message : e); }
  return p;
}
function findM3u8(t) { var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(t); return m ? m[0] : null; }

function check() {
  return __async(this, null, function* () {
    var out = [];
    var firstUrl = null, hostKey = null, m3u8 = null;

    // 1) search
    try {
      var r1 = yield fetch(BASE + "/engine/ajax/search.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/" },
        body: "query=naruto&page=1"
      });
      var b1 = yield r1.text();
      var ids = b1.match(/location\.href='\/(\d+)-/g) || [];
      out.push("search=" + ids.length + "@" + r1.status);
      var idm = /location\.href='\/(\d+)-/.exec(b1);
      var newsId = idm ? idm[1] : null;

      // 2) episodes API
      if (newsId) {
        var r2 = yield fetch(BASE + "/engine/ajax/manga_episodes_api.php?id=" + newsId, { headers: { "User-Agent": UA, "Referer": BASE + "/index.php?newsid=" + newsId } });
        var b2 = yield r2.text();
        var j = null; try { j = JSON.parse(b2); } catch (e) {}
        if (!j) { out.push("api=NOTJSON@" + r2.status + "(len" + b2.length + ")"); }
        else {
          var langObj = j.vf || j.vostfr || j.vo || null;
          var ep = langObj ? (langObj["1"] || langObj[Object.keys(langObj)[0]]) : null;
          if (ep) {
            var keys = Object.keys(ep);
            hostKey = ep.vidzy ? "vidzy" : keys[0];
            firstUrl = ep[hostKey];
            out.push("api=OK(" + keys.join(",") + ")");
          } else { out.push("api=OK-but-noEp"); }
        }
      }
    } catch (e) { out.push("search/api THREW:" + (e && e.message ? e.message : e)); }

    // 3) embed -> unpack -> m3u8
    if (firstUrl) {
      try {
        var origin = (/^(https?:\/\/[^/]+)/i.exec(firstUrl) || ["", ""])[1];
        var r3 = yield fetch(firstUrl, { headers: { "User-Agent": UA, "Referer": BASE + "/" } });
        var b3 = yield r3.text();
        var up = unpackPacked(b3);
        if (up.indexOf("THREW") === 0) { out.push("embed=" + up); }
        else {
          m3u8 = findM3u8(up) || findM3u8(b3);
          out.push("embed=" + hostKey + "@" + r3.status + "(" + (m3u8 ? "m3u8OK" : "noM3u8,unpack" + up.length) + ")");
        }
      } catch (e) { out.push("embed THREW:" + (e && e.message ? e.message : e)); }
    } else { out.push("embed=SKIP(noUrl)"); }

    // 4) THE SUSPECT: fetch the CDN m3u8 (explodeHls step)
    if (m3u8) {
      try {
        var cdnHost = (/^https?:\/\/([^/]+)/i.exec(m3u8) || ["", "?"])[1];
        var r4 = yield fetch(m3u8, { headers: { "User-Agent": UA, "Referer": "https://vidzy.live/" } });
        var b4 = yield r4.text();
        var tag = b4.indexOf("#EXT") !== -1 ? "#EXT-OK" : "NO-EXT(len" + b4.length + ")";
        out.push("CDN=" + r4.status + "/" + tag + "@" + cdnHost);
      } catch (e) { out.push("CDN THREW:" + (e && e.message ? e.message : e)); }
    } else { out.push("CDN=SKIP(noM3u8)"); }

    return out.join(" | ");
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return check().then(function (msg) { return [row(msg)]; }, function (e) { return [row("CRASH " + (e && e.message ? e.message : e))]; });
}
