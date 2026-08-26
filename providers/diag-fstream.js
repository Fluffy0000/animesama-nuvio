/* diag-fstream v20 — bissection FStream·One DANS Nuvio, toujours UNE ligne.
   Étapes bornées : 1) écho des arguments reçus  2) API movix (status/success/groupes)
   3) 1er embed : page joignable ? cipher présent ? décodage local OK ?
   AUCUNE résolution complète, AUCUN fetch de playlist. */
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function row(m) {
  return { name: "DIAG20 | " + m, title: "DIAG20 | " + m,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG", headers: { "User-Agent": UA } };
}
function kindOf(v) { return v === null ? "null" : typeof v + (typeof v === "number" ? "" : ":" + String(v).slice(0, 12)); }

// mini b64decode + cipher fsvid/vidzy (copie conforme du core, pur JS)
function b64Decode(input) {
  var C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var str = String(input).replace(/=+$/, ""), out = "";
  if (str.length % 4 === 1) return "";
  for (var bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? out += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) buffer = C.indexOf(buffer);
  return out;
}
function decodeCipher(text, host) {
  var m = /\}\s*\)\s*\(\s*"([A-Za-z0-9+/=]{50,})"\s*\)/.exec(text || "");
  if (!m) return null;
  var b = b64Decode(m[1]); if (!b) return null;
  var a = b.split("").reverse().join(""), H = 0;
  for (var j = 0; j < host.length; j++) H = (H + host.charCodeAt(j)) & 255;
  var r = "";
  for (var i = 0; i < a.length; i++) r += String.fromCharCode(a.charCodeAt(i) ^ ((0x3d + i * 89 + H) & 255));
  return /^https?:\/\//.test(r) ? r : null;
}

function firstEmbed(j, isTV, episode) {
  var pools = [];
  if (!isTV && j.players) for (var k in j.players) pools.push(j.players[k]);
  if (isTV && j.episodes) { var ep = j.episodes[String(episode)] || null; if (ep && ep.languages) for (var l in ep.languages) pools.push(ep.languages[l]); }
  for (var p = 0; p < pools.length; p++) {
    var arr = pools[p];
    if (!arr || typeof arr.length !== "number" || !arr.length) continue;
    for (var i = 0; i < arr.length; i++) {
      var u = arr[i] && arr[i].url;
      if (typeof u === "string" && u.indexOf("http") === 0) return u;
    }
  }
  return null;
}

async function run(tmdbId, mediaType, season, episode) {
  var t0 = Date.now();
  var isTV = mediaType === "tv";
  var url = "https://api.movix.fun/api/fstream/" + (isTV
    ? "tv/" + encodeURIComponent(String(tmdbId)) + "/season/" + (season || 1) + "?episode=" + (episode || 1)
    : "movie/" + encodeURIComponent(String(tmdbId)));
  var head = kindOf(tmdbId) + "/" + kindOf(mediaType) + "/S" + kindOf(season) + "E" + kindOf(episode);
  // 1) API
  var r, txt = "", st = "?";
  try {
    r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    st = r.status; txt = await r.text();
  } catch (e) { return "API THREW " + (e && e.message ? e.message : e) + " [" + head + "] " + (Date.now() - t0) + "ms"; }
  var j;
  try { j = JSON.parse(txt); } catch (e) { return "HTTP " + st + " JSON-fail " + txt.length + "o début=" + txt.slice(0, 60) + " [" + head + "]"; }
  if (!j || j.success !== true) return "HTTP " + st + " success!=" + (j && j.success) + " clés=[" + Object.keys(j || {}).join(",") + "] [" + head + "]";
  var groups = [];
  if (!isTV && j.players) { for (var g in j.players) groups.push(g + "=" + (j.players[g] && j.players[g].length || 0)); }
  if (isTV && j.episodes) { var ep2 = j.episodes[String(episode)]; if (ep2 && ep2.languages) { for (var g2 in ep2.languages) groups.push(g2 + "=" + (ep2.languages[g2] && ep2.languages[g2].length || 0)); } else groups.push("ep" + episode + ":absent"); }
  // 2) premier embed : page + cipher (borné)
  var emb = firstEmbed(j, isTV, episode || 1);
  if (!emb) return "OK mais 0 embed | groupes[" + groups.join(" ") + "] [" + head + "] " + (Date.now() - t0) + "ms";
  var pst = "?", body = "";
  try { var rp = await fetch(emb, { headers: { "User-Agent": UA } }); pst = rp.status; body = await rp.text(); }
  catch (e) { return "embedPage THREW " + (e && e.message ? e.message : e) + " | groupes[" + groups.join(" ") + "] [" + head + "]"; }
  var hm = /^https?:\/\/([^\/]+)/.exec(emb); var host = hm ? hm[1] : "?";
  var hasPack = /\}\s*\)\s*\(\s*"[A-Za-z0-9+/=]{50,}"\s*\)/.test(body);
  var troll = /_fsvHls/.test(body) ? "trollMarker " : "";
  var dec = hasPack ? decodeCipher(body, host) : null;
  var decTxt = hasPack ? (dec ? ("cipher→OK " + dec.slice(0, 46)) : "cipher→ÉCHEC") : "pas-de-cipher";
  return "API✓ grp[" + groups.join(" ") + "] | " + host + " HTTP " + pst + " " + troll + decTxt + " [" + head + "] " + (Date.now() - t0) + "ms";
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try { return [row(await run(tmdbId, mediaType, season, episode))]; }
  catch (e) { return [row("CRASH " + (e && e.message ? e.message : e))]; }
}
var __exp = { __esModule: true, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __exp;
if (typeof exports !== "undefined") { exports.getStreams = getStreams; exports.__esModule = true; }
