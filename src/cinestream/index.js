// cinestream — provider for cinestream.info (films VF/VOSTFR)
// Pipeline: TMDB id -> search /search?q= -> /film/<slug> (RSC: players[] + tmdbid)
//           -> /player/<tmdbId>/<idx> -> embed iframe -> core/hosts -> direct file.

import { fetchText, CORE_UA, mapLimit, streamHeaders } from "../core/net.js";
import { getTmdbInfo, buildQueries } from "../core/tmdb.js";
import { resolveEmbed } from "../core/hosts.js";

var ORIGIN = "https://cinestream.info";
var MAX_PLAYERS = 12;

function headers(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// /film/<slug> links from a search page (server-rendered, deduped)
function filmLinks(html) {
  var out = [], seen = {}, m;
  var re = /href="\/(film\/[a-z0-9-]+)"/gi;
  while ((m = re.exec(html)) !== null) {
    if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
  }
  return out;
}

// escape-tolerant regex over the RSC payload ("tmdbid\":872585, \"players\":[{\"name\":\"Voe\"}...])
function parseDetail(html) {
  var idm = /tmdbid\\*"?\s*:\s*(\d+)/.exec(html);
  var tmdb = idm ? parseInt(idm[1], 10) : null;
  var names = [];
  var pm = /players\\*"?\s*:\s*\[([^\]]*)\]/.exec(html);
  if (pm) {
    var re = /name\\*"?\s*:\s*\\*"([^"\\]+)\\*"/g, m;
    while ((m = re.exec(pm[1])) !== null) names.push(m[1]);
  }
  return { tmdb: tmdb, players: names };
}

// iframe embed of a /player/<id>/<idx> page
async function playerEmbed(tmdbId, idx, referer) {
  var html = await fetchText(ORIGIN + "/player/" + tmdbId + "/" + idx, { headers: headers(referer) }, 9000);
  if (!html) return null;
  var m = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
  if (m && m[1].indexOf("googletagmanager") === -1) return m[1];
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== "movie") return []; // cinestream.info = films only

    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];

    // find the film page, CONFIRM identity via RSC tmdbid
    var queries = buildQueries(info.titles);
    var detailPath = null, playerNames = null;
    outer:
    for (var i = 0; i < queries.length; i++) {
      var sh = await fetchText(ORIGIN + "/search?q=" + encodeURIComponent(queries[i]), { headers: headers(ORIGIN + "/") }, 9000);
      if (!sh) continue;
      var links = filmLinks(sh);
      for (var j = 0; j < Math.min(links.length, 6); j++) {
        var dh = await fetchText(ORIGIN + "/" + links[j], { headers: headers(ORIGIN + "/") }, 9000);
        if (!dh) continue;
        var d = parseDetail(dh);
        if (d.tmdb === tmdbId) { detailPath = links[j]; playerNames = d.players; break outer; }
      }
    }
    if (!detailPath) return [];

    var detailUrl = ORIGIN + "/" + detailPath;
    var count = playerNames && playerNames.length ? Math.min(playerNames.length, MAX_PLAYERS) : MAX_PLAYERS;

    // 1) probe all /player/<id>/<idx> pages in parallel (bounded), keep order
    var indices = [];
    for (var n = 0; n < count; n++) indices.push(n);
    var embeds = await mapLimit(indices, 4, function (idx) {
      return playerEmbed(tmdbId, idx, detailUrl);
    });

    // 2) resolve embeds in parallel (bounded), build streams in site order
    var jobs = [];
    for (var k = 0; k < embeds.length; k++) {
      if (embeds[k]) jobs.push({ idx: k, embed: embeds[k] });
    }
    var resolved = await mapLimit(jobs, 3, function (job) {
      return resolveEmbed(job.embed, { referer: detailUrl });
    });

    var streams = [];
    for (var t = 0; t < jobs.length; t++) {
      var res = resolved[t];
      if (!res || !res.url) continue;
      var pname = (playerNames && playerNames[jobs[t].idx]) || res.name;
      var lang = /vostfr/i.test(pname) ? "VOSTFR" : "VF";
      var flag = lang === "VOSTFR" ? "🇯🇵" : "🇫🇷";
      var kind = /\.m3u8/i.test(res.url) ? "HLS" : "MP4";
      streams.push({
        name: flag + " CineStream · " + res.name + " · " + lang + " · " + kind,
        title: info.titles[0] + " · " + pname + " · " + lang,
        url: res.url,
        quality: "auto",
        language: lang,
        provider: "CineStream",
        headers: streamHeaders(res.referer)
      });
    }
    return streams;
  } catch (e) {
    return [];
  }
}

export { getStreams };
