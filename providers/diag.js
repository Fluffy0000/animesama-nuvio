/* diag v17 — trivial deploy marker. Does NOT embed fs20. Always returns exactly ONE row. */
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
var d = {};
__export(d, { getStreams: () => getStreams });
module.exports = __toCommonJS(d);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function getStreams(tmdbId, mediaType, season, episode) {
  var msg = "DEPLOY v17 OK | fs20 = version FIABLE (1 stream). Teste le VRAI French Stream, pas ce diag.";
  return Promise.resolve([{
    name: msg, title: msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG",
    headers: { "User-Agent": UA }
  }]);
}
