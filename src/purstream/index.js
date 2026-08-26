// PurStream — liens HLS DIRECTS (qualité HD, double audio FR/VO + sous-titres).
// Listing via l'API publique Movix (api.movix.fun) : seule la LISTE des liens passe par
// leur serveur (le flux vidéo part DIRECTEMENT de l'appareil vers le CDN finepulfe).
// Aucun compte, aucune clé : GET /api/purstream/movie|tv/<tmdbId>/stream[?season&s&episode=e]

import { fetchJson, streamHeaders } from "../core/net.js";
import { getTmdbInfo } from "../core/tmdb.js";

var PROVIDER_NAME = "PurStream";
var LOG = "[purstream]";
var API = "https://api.movix.fun/api/purstream";

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    season = season || 1;
    episode = episode || 1;

    var url = API + (isMovie
      ? "/movie/" + encodeURIComponent(String(tmdbId)) + "/stream"
      : "/tv/" + encodeURIComponent(String(tmdbId)) + "/stream?season=" + season + "&episode=" + episode);

    var j = await fetchJson(url, { headers: { "Accept": "application/json" } }, 15000);
    if (!j || !j.sources || !j.sources.length) {
      console.log(LOG + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " -> rien");
      return [];
    }

    var title = null;
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (info && info.titles && info.titles.length) title = info.titles[0];
    if (!title) title = j.title || ("TMDB " + tmdbId);

    var out = [];
    for (var i = 0; i < j.sources.length; i++) {
      var s = j.sources[i];
      if (!s || typeof s.url !== "string" || !/^https?:\/\//i.test(s.url)) continue;
      var nm = String(s.name || "pulse");
      var qm = /(\d{3,4})p/i.exec(nm);
      var quality = qm ? qm[1] + "p" : "auto";
      var isMulti = /multi/i.test(nm);
      out.push({
        name: "🇫🇷 " + PROVIDER_NAME + " · " + quality + " · " + (isMulti ? "MULTI" : "VF") + " · HLS",
        title: title + (isMovie ? "" : " · S" + season + "E" + episode) + " · " + nm,
        url: s.url,
        quality: quality,
        language: isMulti ? "VF + VO (multi-audio, sous-titres FR)" : "VF",
        provider: PROVIDER_NAME,
        // CDN finepulfe : 403 si un Referer est présent, 200 sans -> pas de Referer
        headers: streamHeaders("")
      });
    }
    console.log(LOG + " => " + out.length + " streams");
    return out;
  } catch (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  }
}

export { getStreams };
