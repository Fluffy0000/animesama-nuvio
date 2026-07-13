/* diag v19 — bounded: search + film_api ONLY (no embed resolution). Always ONE row unless a
   safe-step fetch itself hangs. Tells us if the freeze is in film_api or in embed resolution. */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (t, a) => { for (var n in a) __defProp(t, n, { get: a[n], enumerable: true }); };
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let k of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, k) && k !== except) __defProp(to, k, { get: () => from[k], enumerable: true });
  }
  return to;
};
var __toCommonJS = (m) => __copyProps(__defProp({}, "__esModule", { value: true }), m);
var __async = (self, args, gen) => new Promise((res, rej) => {
  var f = (v) => { try { step(gen.next(v)); } catch (e) { rej(e); } };
  var r = (v) => { try { step(gen.throw(v)); } catch (e) { rej(e); } };
  var step = (x) => x.done ? res(x.value) : Promise.resolve(x.value).then(f, r);
  step((gen = gen.apply(self, args)).next());
});
var d = {}; __export(d, { getStreams: () => getStreams }); module.exports = __toCommonJS(d);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var HDRS = { "User-Agent": UA, "Referer": "https://fs20.lol/", "Cookie": "fsschal=1" };
function row(m) { return { name: "DIAG v19 | " + m, title: "DIAG v19 | " + m, url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", quality: "DIAG", language: "DIAG", provider: "DIAG", headers: { "User-Agent": UA } }; }

function run() {
  return __async(this, null, function* () {
    var t0 = Date.now();
    // 1. search Oppenheimer -> newsId  (bare fetch, cookie)
    var sBody = "";
    try {
      var rs = yield fetch("https://fs20.lol/engine/ajax/search.php", { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "Referer": "https://fs20.lol/", "Cookie": "fsschal=1" }, body: "query=oppenheimer&page=1" });
      sBody = yield rs.text();
    } catch (e) { return "search THREW:" + (e && e.message ? e.message : e); }
    var idm = /location\.href='\/(\d+)-/.exec(sBody);
    if (!idm) return "search OK mais 0 newsId (challenge? " + (sBody.indexOf("Verification") !== -1 ? "OUI" : "non") + ")";
    var newsId = idm[1];
    // 2. film_api.php?id=newsId  (le nouvel endpoint — est-ce qu'il répond chez toi ?)
    var fBody = "", fStatus = "?";
    try {
      var rf = yield fetch("https://fs20.lol/engine/ajax/film_api.php?id=" + newsId, { headers: HDRS });
      fStatus = rf.status;
      fBody = yield rf.text();
    } catch (e) { return "newsId=" + newsId + " | film_api THREW:" + (e && e.message ? e.message : e) + " en " + (Date.now() - t0) + "ms"; }
    var hosts = "?";
    try { var j = JSON.parse(fBody); hosts = j && j.players ? Object.keys(j.players).join(",") : "(pas de players)"; } catch (e) { hosts = "JSON-fail(" + fBody.length + "o, Verif=" + (fBody.indexOf("Verification") !== -1 ? "OUI" : "non") + ")"; }
    return "newsId=" + newsId + " | film_api HTTP " + fStatus + " | hosts=[" + hosts + "] | " + (Date.now() - t0) + "ms (PAS de resolution embed)";
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return run().then(function (m) { return [row(m)]; }, function (e) { return [row("CRASH " + (e && e.message ? e.message : e))]; });
}
