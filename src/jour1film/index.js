// 1Jour1Film — le site (1jour1film0826.online, domaine roulant) est sous Cloudflare strict ;
// la LISTE des lecteurs passe par l'API publique Movix (api.movix.fun — GET anonyme),
// puis chaque lecteur est résolu DIRECTEMENT depuis l'appareil (vidara/api-stream, packers…).
// Contract : TMDB id in -> players VF/VOSTFR -> m3u8 direct.

import { fetchJson, safeFetch, netIsOk, CORE_UA, mapLimit, streamHeaders } from "../core/net.js";
import { getTmdbInfo } from "../core/tmdb.js";
import { resolveEmbed } from "../core/hosts.js";
import { hostOf } from "../core/text.js";

var PROVIDER_NAME = "1Jour1Film";
var LOG = "[j1f]";
var API = "https://api.movix.fun/api/j1f";
var MAX_RESOLVE = 6;

// ---------- parsing helpers (QuickJS-safe: pas de classe URL) ----------
function originOf(url) {
  var m = /^(https?:\/\/[^/]+)/i.exec(url || "");
  return m ? m[1] : "";
}
function filecodeOf(url) {
  // NB: vidara utilise des filecodes url-safe pouvant commencer par '-' ou contenir '_'
  var m = /^https?:\/\/[^/]+\/e\/([0-9a-zA-Z_-]+)\/?$/i.exec(url || "");
  if (m) return m[1];
  var parts = String(url || "").split("?")[0].split("#")[0].split("/").filter(function (s) { return !!s; });
  var last = parts[parts.length - 1] || "";
  return /^[0-9a-zA-Z_-]+$/.test(last) ? last : null;
}

// ---------- onregardeou.site wrapper : "servers":[{name,url,type}] ----------
function extractJsonArray(text, key) {
  var i = text.indexOf('"' + key + '"');
  if (i < 0) return null;
  i = text.indexOf("[", i);
  if (i < 0) return null;
  var depth = 0, inStr = false, esc = false;
  for (var j = i; j < text.length; j++) {
    var ch = text.charAt(j);
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}

async function unwrapWrapper(url) {
  var wrap = url.split("#")[0].split("?")[0].replace(/\/+$/, "") + "/";
  // onregardeou: WAF LiteSpeed erratique (403 par rafales) -> Referer obligatoire + retries
  var html = null;
  for (var attempt = 0; attempt < 3 && html === null; attempt++) {
    var r = await safeFetch(wrap, { headers: {
      "User-Agent": CORE_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      "Referer": originOf(url) + "/"
    } }, 12000);
    if (!netIsOk(r)) continue;
    try { html = await r.text(); } catch (e) { html = null; }
    if (html && html.indexOf('"servers"') < 0) html = null; // page d'erreur déguisée
  }
  if (!html) return null;
  var raw = extractJsonArray(html, "servers");
  if (!raw) return null;
  try {
    var arr = JSON.parse(raw);
    return (Array.isArray(arr) && arr.length) ? arr : null;
  } catch (e) {
    return null;
  }
}

// ---------- vidara (et miroirs) : POST {origin}/api/stream ----------
async function resolveVidara(url) {
  var fc = filecodeOf(url);
  if (!fc) return null;
  var origins = [originOf(url)];
  // la page peut annoncer un miroir (var MIRROR = 'https://...')
  var r0 = await safeFetch(originOf(url) + "/e/" + fc, { headers: { "User-Agent": CORE_UA } }, 10000);
  if (netIsOk(r0)) {
    try {
      var h = await r0.text();
      var mm = /MIRROR\s*=\s*'([^']+)'/i.exec(h);
      if (mm && /^https?:\/\//.test(mm[1])) {
        var mo = originOf(mm[1]);
        if (mo && origins.indexOf(mo) < 0) origins.push(mo);
      }
      var fo = r0.url && /^https?:\/\//.test(r0.url) ? originOf(r0.url) : null;
      if (fo && origins.indexOf(fo) < 0) origins.push(fo);
    } catch (e) {}
  }
  for (var i = 0; i < origins.length; i++) {
    var o = origins[i];
    if (!o) continue;
    var res = await safeFetch(o + "/api/stream", {
      method: "POST",
      headers: {
        "User-Agent": CORE_UA,
        "Accept": "application/json, */*",
        "Content-Type": "application/json",
        "Referer": o + "/e/" + fc,
        "Origin": o
      },
      body: JSON.stringify({ filecode: fc, device: "web" })
    }, 12000);
    if (!netIsOk(res)) continue;
    var payload = null;
    try { payload = await res.json(); } catch (e) { payload = null; }
    if (payload && typeof payload.streaming_url === "string" && payload.streaming_url.indexOf("http") === 0) {
      return { url: payload.streaming_url, referer: o + "/", host: "Vidara", subs: null };
    }
  }
  return null;
}

// ---------- une entrée player -> stream résolu ----------
async function resolvePlayerEntry(p, title, langKey, epLabel) {
  var url = p && p.url;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return [];
  if (url.indexOf("#") >= 0) return []; // transport par fragment: non résolvable côté appareil
  var host = hostOf(url);
  var out = [];

  // wrapper onregardeou -> liste de serveurs imbriqués
  if (/onregardeou/i.test(url)) {
    var nested = await unwrapWrapper(url);
    if (nested) {
      var jobs = nested.map(function (n) {
        return { url: n && n.url, name: n && n.name };
      });
      var res = await mapLimit(jobs, 3, async function (job) {
        return resolvePlayerEntry({ url: job.url }, title, langKey, epLabel);
      });
      for (var i = 0; i < res.length; i++) if (res[i]) out.push.apply(out, res[i]);
      return out;
    }
    return [];
  }

  var lang = langKey === "vostfr" ? "VOSTFR" : "VF";
  var flag = langKey === "vostfr" ? "🇯🇵" : "🇫🇷";
  var kind, media, referer, hostName;

  if (/vidara/i.test(url)) {
    var v = await resolveVidara(url);
    if (!v) return [];
    media = v.url; referer = v.referer; hostName = "Vidara";
  } else {
    var g = await resolveEmbed(url, {});
    if (!g || !g.url) return [];
    media = g.url; referer = g.referer; hostName = (g.name || host).replace(/\..*$/, "");
  }

  kind = /\.m3u8/i.test(media) ? "HLS" : "MP4";
  hostName = hostName.charAt(0).toUpperCase() + hostName.slice(1);
  out.push({
    name: flag + " " + PROVIDER_NAME + " · " + hostName + " · " + lang + " · " + kind,
    title: title + (epLabel || "") + " · " + hostName + " · " + lang,
    url: media,
    quality: "auto",
    language: lang,
    provider: PROVIDER_NAME,
    headers: streamHeaders(referer)
  });
  return out;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    season = season || 1;
    episode = episode || 1;

    var url = API + (isMovie
      ? "/movie/" + encodeURIComponent(String(tmdbId))
      : "/tv/" + encodeURIComponent(String(tmdbId)) + "/season/" + season + "?episode=" + episode);

    var j = await fetchJson(url, { headers: { "Accept": "application/json" } }, 18000);
    if (!j || j.success !== true || !j.players) {
      console.log(LOG + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " -> rien");
      return [];
    }

    var title = j.title || null;
    if (!title) {
      var info = await getTmdbInfo(tmdbId, mediaType);
      if (info && info.titles && info.titles.length) title = info.titles[0];
    }
    title = title || ("TMDB " + tmdbId);
    var epLabel = isMovie ? "" : " · S" + season + "E" + episode;

    var entries = [];
    var seen = {};
    var langs = ["vf", "vostfr"];
    for (var li = 0; li < langs.length; li++) {
      var arr = j.players[langs[li]] || [];
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i] && arr[i].url;
        if (typeof u !== "string" || u.indexOf("http") !== 0) continue;
        var k = langs[li] + "|" + u;
        if (seen[k]) continue;
        seen[k] = 1;
        entries.push({ url: u, langKey: langs[li] });
      }
    }
    if (!entries.length) return [];

    var results = await mapLimit(entries.slice(0, MAX_RESOLVE), 3, async function (e) {
      try {
        return await resolvePlayerEntry(e, title, e.langKey, epLabel);
      } catch (err) { return []; }
    });
    var out = [], seenMedia = {};
    for (var r = 0; r < results.length; r++) {
      var list = results[r] || [];
      for (var x = 0; x < list.length; x++) {
        if (seenMedia[list[x].url]) continue;
        seenMedia[list[x].url] = 1;
        out.push(list[x]);
      }
    }
    console.log(LOG + " => " + out.length + " streams");
    return out;
  } catch (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  }
}

export { getStreams };
