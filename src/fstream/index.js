// FStream·One — french-stream.one (miroir French Stream), films & séries VF/VFQ/VFF/VOSTFR.
// La LISTE des lecteurs passe par l'API publique Movix (api.movix.fun — GET anonyme, lien
// vers fstream page + embeds déjà groupés), puis chaque embed est résolu DIRECTEMENT depuis
// l'appareil (cipher fsvid/vidzy décodé localement, packers uqload, dood, voe/sydney…).
// Complète fs20.js (scrape direct de fs20.lol) quand le site bouge ou est injoignable.
// Contract : TMDB id in -> m3u8/mp4 direct.

import { fetchJson, mapLimit, streamHeaders } from "../core/net.js";
import { getTmdbInfo } from "../core/tmdb.js";
import { resolveEmbed } from "../core/hosts.js";

var PROVIDER_NAME = "FStream·One";
var LOG = "[fstream]";
var API = "https://api.movix.fun/api/fstream";
var MAX_RESOLVE = 8;

// ---------- collecte des entrées players ----------
function movieEntries(players, seen) {
  var out = [];
  // groupes upstream observés: VFQ, VFF, VOSTFR, Default (= onglet par défaut de la page,
  // c.-à-d. VF sur ce site FR). Règle: contient "vost" -> VOSTFR, tout le reste -> VF.
  var keys = [];
  for (var k in players) keys.push(k);
  keys.sort(function (a, b) { return (/vost/i.test(a) ? 1 : 0) - (/vost/i.test(b) ? 1 : 0); });
  for (var g = 0; g < keys.length; g++) {
    var arr = players[keys[g]];
    if (!Array.isArray(arr)) continue;
    var lang = /vost/i.test(keys[g]) ? "VOSTFR" : "VF";
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i] || {};
      var u = p.url;
      if (typeof u !== "string" || u.indexOf("http") !== 0) continue;
      var dk = lang + "|" + u;
      if (seen[dk]) continue;
      seen[dk] = 1;
      out.push({ url: u, lang: lang, player: p.player || null });
    }
  }
  return out;
}

function tvEntries(episodes, episode, seen) {
  var out = [];
  if (!episodes) return out;
  var ep = episodes[String(episode)] || episodes[episode] || null;
  if (!ep || !ep.languages) return out;
  var langs = ep.languages;
  var keys = [];
  for (var k in langs) keys.push(k);
  // VF en premier
  keys.sort(function (a, b) { return (/vostfr/i.test(a) ? 1 : 0) - (/vostfr/i.test(b) ? 1 : 0); });
  for (var ki = 0; ki < keys.length; ki++) {
    var langName = keys[ki];
    var lang = /vostfr/i.test(langName) ? "VOSTFR" : "VF";
    var arr = langs[langName];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i] || {};
      var u = p.url;
      if (typeof u !== "string" || u.indexOf("http") !== 0) continue;
      var dk = lang + "|" + u;
      if (seen[dk]) continue;
      seen[dk] = 1;
      out.push({ url: u, lang: lang, player: p.player || null });
    }
  }
  return out;
}

// ---------- résolution d'un embed -> stream ----------
async function resolveEntry(entry, title, epLabel) {
  var url = entry.url;
  if (url.indexOf("#") >= 0) return null; // transport par fragment: non résolvable
  var r = await resolveEmbed(url, null);
  if (!r || !r.url) return null;
  var lang = entry.lang;
  var flag = lang === "VOSTFR" ? "🇯🇵" : "🇫🇷";
  var hostName = entry.player || r.name || "Host";
  hostName = hostName.charAt(0).toUpperCase() + hostName.slice(1);
  var kind = /\.m3u8/i.test(r.url) ? "HLS" : "MP4";
  return {
    name: flag + " " + PROVIDER_NAME + " · " + hostName + " · " + lang + " · " + kind,
    title: title + (epLabel || "") + " · " + hostName + " · " + lang,
    url: r.url,
    quality: "auto",
    language: lang,
    provider: PROVIDER_NAME,
    headers: streamHeaders(r.referer || "")
  };
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
    if (!j || j.success !== true) {
      console.log(LOG + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " -> rien");
      return [];
    }

    var seen = {};
    var entries = isMovie ? movieEntries(j.players || {}, seen) : tvEntries(j.episodes, episode, seen);
    if (!entries.length) {
      console.log(LOG + " aucun player upstream");
      return [];
    }

    var title = (j.tmdb && j.tmdb.title) || j.title || null;
    if (!title) {
      var info = await getTmdbInfo(tmdbId, isMovie ? "movie" : "tv");
      if (info && info.titles && info.titles.length) title = info.titles[0];
    }
    title = title || ("TMDB " + tmdbId);
    var epLabel = isMovie ? "" : " · S" + season + "E" + episode;

    var results = await mapLimit(entries.slice(0, MAX_RESOLVE), 3, async function (e) {
      try { return await resolveEntry(e, title, epLabel); } catch (err) { return null; }
    });

    var out = [], seenMedia = {};
    for (var i = 0; i < results.length; i++) {
      var s = results[i];
      if (!s || seenMedia[s.url]) continue;
      seenMedia[s.url] = 1;
      out.push(s);
    }
    console.log(LOG + " => " + out.length + " streams");
    return out;
  } catch (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  }
}

export { getStreams };
