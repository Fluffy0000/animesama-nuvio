/* diag */
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
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// diag/diag.js
var diag_exports = {};
__export(diag_exports, {
  getStreams: () => getStreams
});
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
    // a real public HLS so the row is tappable
    quality: "DIAG",
    language: "DIAG",
    provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}
function probe(label, url, options) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    try {
      var r = yield fetch(url, options || { headers: HDRS });
      var status = r ? r.status : "null";
      var body = "";
      try {
        body = yield r.text();
      } catch (e) {
        body = "[body read FAIL]";
      }
      var ms = Date.now() - t0;
      var head = (body || "").slice(0, 40).replace(/\s+/g, " ");
      var cf = (body || "").indexOf("Just a moment") !== -1 || (body || "").indexOf("cf-browser-verification") !== -1 || (body || "").indexOf("Attention Required") !== -1;
      return label + ": HTTP " + status + " " + (body ? body.length : 0) + "o " + ms + "ms" + (cf ? " [CLOUDFLARE-CHALLENGE]" : "") + " | " + head;
    } catch (e) {
      return label + ": THROW " + (e && e.message ? e.message : e);
    }
  });
}
function run() {
  return __async(this, null, function* () {
    var out = [];
    out.push(fakeStream(yield probe("1.TMDB", "https://api.themoviedb.org/3/movie/872585?api_key=439c478a771f35c05022f9feabcca01c&language=fr-FR")));
    out.push(fakeStream(yield probe("2.fs20.lol", "https://fs20.lol/", { headers: HDRS })));
    out.push(fakeStream(yield probe("3.search", "https://fs20.lol/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Accept-Encoding": "identity",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://fs20.lol/"
      },
      body: "query=oppenheimer&page=1"
    })));
    out.push(fakeStream(yield probe("4.static", "https://fs20.lol/static/series/9562.js?v=1", { headers: HDRS })));
    out.push(fakeStream(yield probe("5.frenchmanga", "https://w16.french-manga.net/", { headers: HDRS })));
    out.push(fakeStream(yield probe("6.yablom", "https://yablom.com/", { headers: HDRS })));
    return out;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return run().catch(function(e) {
    return [fakeStream("DIAG crashed: " + (e && e.message ? e.message : e))];
  });
}
