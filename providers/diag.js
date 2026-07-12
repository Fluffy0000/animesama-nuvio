/* diag v11 — deploy + anti-bot check. Always returns exactly ONE row (cannot disappear). */
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
var VERSION = "DEPLOY v11 (cookie build)";

function row(msg) {
  return {
    name: VERSION + " | " + msg,
    title: VERSION + " | " + msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}

// Two searches to fs20 — one WITH the fsschal cookie, one WITHOUT — reported inline.
// Never throws, always resolves, always returns exactly one row.
function check() {
  return __async(this, null, function* () {
    var withCookie, without;
    try {
      var r1 = yield fetch("https://fs20.lol/engine/ajax/search.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Referer": "https://fs20.lol/", "Cookie": "fsschal=1" },
        body: "query=oppenheimer&page=1"
      });
      var b1 = yield r1.text();
      withCookie = b1.indexOf("Verification") !== -1 ? "CHALLENGED" : (/location\.href='\/\d+/.test(b1) ? "OK-results" : "empty");
    } catch (e) { withCookie = "THREW:" + (e && e.message ? e.message : e); }
    try {
      var r2 = yield fetch("https://fs20.lol/engine/ajax/search.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Referer": "https://fs20.lol/" },
        body: "query=oppenheimer&page=1"
      });
      var b2 = yield r2.text();
      without = b2.indexOf("Verification") !== -1 ? "CHALLENGED" : (/location\.href='\/\d+/.test(b2) ? "OK-results" : "empty");
    } catch (e) { without = "THREW:" + (e && e.message ? e.message : e); }
    return "avec-cookie=" + withCookie + " | sans-cookie=" + without;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return check().then(function (msg) { return [row(msg)]; }, function (e) { return [row("CRASH " + (e && e.message ? e.message : e))]; });
}
