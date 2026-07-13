// index.js — fs20.lol (French Stream) provider: films + séries live-action, VF/VOSTFR.
import {
  USER_AGENT, TMDB_API_KEY, fetchJson, slugify,
  resolveBase, liveSearch, fetchFilmPlayers, fetchSeriesEpisodes
} from "./http.js";
import { resolveHost, explodeHls, mp4Alive } from "./extractor.js";

var LOG = "[fs20]";

// ---------- TMDB ----------
async function getTmdbInfo(tmdbId, mediaType) {
  var kind = mediaType === "tv" ? "tv" : "movie";
  var titles = [], seen = {}, year = null;
  function add(t) { if (!t) return; var k = slugify(t); if (!k || seen[k]) return; seen[k] = true; titles.push(t); }
  var langs = ["fr-FR", "en-US"];
  for (var i = 0; i < langs.length; i++) {
    var d = await fetchJson("https://api.themoviedb.org/3/" + kind + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=" + langs[i], { headers: { "User-Agent": USER_AGENT } }, 9000);
    if (!d) continue;
    if (!year) { var rd = d.release_date || d.first_air_date || ""; var ym = /^(\d{4})/.exec(rd); if (ym) year = ym[1]; }
    add(d.title); add(d.name); add(d.original_title); add(d.original_name);
  }
  return { titles: titles, year: year };
}

// queries: full title + punctuation-safe first-3-tokens (site search is literal-ish)
function buildQueries(titles) {
  var seen = {}, out = [];
  function push(q) { q = String(q).trim(); if (!q) return; var k = q.toLowerCase(); if (seen[k]) return; seen[k] = true; out.push(q); }
  for (var i = 0; i < titles.length; i++) {
    push(titles[i]);
    var toks = String(titles[i]).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (toks.length > 3) push(toks.slice(0, 3).join(" "));
  }
  return out;
}

function baseSlug(title) {
  // strip trailing "(YYYY)" and "- Saison N"
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, "").replace(/[-–]\s*saison\s*\d+.*$/i, ""));
}
function scoreItem(item, candSlugs, year) {
  var s = baseSlug(item.title);
  if (!s) return -1;
  var best = -1;
  for (var i = 0; i < candSlugs.length; i++) {
    var c = candSlugs[i]; if (!c) continue;
    var base = -1;
    if (s === c) base = 100;
    else if (s.length > 4 && c.length > 4 && (s.indexOf(c) === 0 || c.indexOf(s) === 0)) base = 55;
    if (base < 0) continue;
    if (year && item.year) base += (year === item.year ? 12 : -20);
    if (base > best) best = base;
  }
  return best;
}

// ---------- host display / labels ----------
var HOST_NAME = { vidzy: "Vidzy", uqload: "Uqload", voe: "Voe", netu: "Netu", premium: "Premium" };
var HOST_ORDER = ["vidzy", "uqload", "voe", "premium", "netu"];
function langLabel(v) { return v === "vostfr" ? "VOSTFR" : (v === "vo" ? "VO" : "VF"); }
function langFlag(v) { return v === "vostfr" || v === "vo" ? "🇯🇵" : "🇫🇷"; }

async function buildStreams(hostKey, embedUrl, langKey, epNum, langText) {
  var resolved = await resolveHost(hostKey, embedUrl);
  if (!resolved) return [];
  var name = HOST_NAME[hostKey] || (hostKey.charAt(0).toUpperCase() + hostKey.slice(1));
  var label = langText || langLabel(langKey), flag = langFlag(langKey);

  if (resolved.kind === "hls") {
    var variants = await explodeHls(resolved.masterUrl, resolved.referer);
    if (!variants.length) return [];
    return variants.map(function (v) {
      var parts = [name];
      if (v.quality) parts.push(v.quality);
      if (v.codec && v.codec !== "H.264") parts.push(v.codec);
      parts.push(label);
      return {
        name: flag + " " + parts.join(" · "),
        title: name + " · " + (v.quality || "HD") + " · " + label + (epNum ? " · Ep " + epNum : ""),
        url: v.url,
        quality: v.quality || "HD",
        language: label,
        provider: name,
        headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
        _sort: { lang: langKey, height: v.height || 0, host: name }
      };
    });
  }
  // mp4
  var alive = await mp4Alive(resolved.masterUrl, resolved.referer);
  if (!alive) return [];
  return [{
    name: flag + " " + name + " · MP4 · " + label,
    title: name + " · MP4 · " + label + (epNum ? " · Ep " + epNum : ""),
    url: resolved.masterUrl,
    quality: "HD",
    language: label,
    provider: name,
    headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
    _sort: { lang: langKey, height: 1, host: name }
  }];
}

async function runBatched(items, worker, size) {
  var out = [];
  for (var i = 0; i < items.length; i += size) {
    var res = await Promise.all(items.slice(i, i + size).map(worker));
    for (var j = 0; j < res.length; j++) if (res[j]) out.push(res[j]);
  }
  return out;
}

function sortStreams(streams) {
  var rank = { vf: 0, vostfr: 1, vo: 2 };
  streams.sort(function (a, b) {
    var la = rank[a._sort.lang], lb = rank[b._sort.lang];
    if (la !== lb) return la - lb;
    if (b._sort.height !== a._sort.height) return b._sort.height - a._sort.height;
    return a._sort.host < b._sort.host ? -1 : 1;
  });
  for (var i = 0; i < streams.length; i++) delete streams[i]._sort;
  return streams;
}

// ---------- main ----------
async function getStreamsImpl(tmdbId, mediaType, season, episode) {
  var isMovie = mediaType !== "tv";
  season = season || 1;
  episode = episode || 1;

  var info = await getTmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) { console.log(LOG + " no TMDB titles"); return []; }
  var candSlugs = info.titles.map(slugify);
  var base = await resolveBase();
  console.log(LOG + " base=" + base + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " | " + info.titles.slice(0, 2).join(" | "));

  // search all query variants
  var queries = buildQueries(info.titles);
  var items = [], byId = {};
  for (var q = 0; q < queries.length; q++) {
    var found = await liveSearch(base, queries[q]);
    for (var f = 0; f < found.length; f++) { if (!byId[found[f].newsId]) { byId[found[f].newsId] = 1; items.push(found[f]); } }
  }
  if (!items.length) { console.log(LOG + " search empty"); return []; }

  var jobs = [];

  if (isMovie) {
    // films: items WITHOUT a season, best slug+year match
    var best = null, bestScore = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].season) continue;
      var sc = scoreItem(items[i], candSlugs, info.year);
      if (sc > bestScore) { bestScore = sc; best = items[i]; }
    }
    // Accept a year-confirmed prefix match (base 55 + year 12 = 67). The old >=90 threshold
    // rejected present titles whose site name has an extra subtitle/season suffix.
    if (!best || bestScore < 65) { console.log(LOG + " no film match (best=" + bestScore + ")"); return []; }
    console.log(LOG + " film newsId=" + best.newsId + " (" + best.title + ")");
    var players = await fetchFilmPlayers(base, best.newsId);
    // resolve most-reliable hosts first (we return after the first player that yields streams)
    var prio = { vidzy: 0, uqload: 1, premium: 2, voe: 3, sibnet: 4, netu: 5 };
    players.sort(function (a, b) {
      var pa = prio[a.hostKey]; if (pa === undefined) pa = 9;
      var pb = prio[b.hostKey]; if (pb === undefined) pb = 9;
      return pa - pb;
    });
    var seenJob = {};
    for (var p = 0; p < players.length; p++) {
      var lk = players[p].lang === "VOSTFR" ? "vostfr" : (players[p].lang === "VO" ? "vo" : "vf");
      var jkey = (players[p].hostKey || "vidzy") + "|" + lk;
      if (seenJob[jkey]) continue;        // one job per host+language (VF variants dedup)
      seenJob[jkey] = 1;
      jobs.push({ hostKey: players[p].hostKey || "vidzy", embedUrl: players[p].url, langKey: lk, epNum: null, langText: players[p].variant });
    }
  } else {
    // séries: item matching "<title> - Saison <season>"
    var seed = null, seedScore = -1;
    for (var s = 0; s < items.length; s++) {
      if (items[s].season !== season) continue;
      var sc2 = scoreItem(items[s], candSlugs, info.year);
      if (sc2 > seedScore) { seedScore = sc2; seed = items[s]; }
    }
    // fallback: season 1 requested but not labelled → best non-season / any match
    if (!seed && season === 1) {
      for (var s2 = 0; s2 < items.length; s2++) { var sc3 = scoreItem(items[s2], candSlugs, info.year); if (sc3 > seedScore) { seedScore = sc3; seed = items[s2]; } }
    }
    if (!seed || seedScore < 65) { console.log(LOG + " no season match (best=" + seedScore + ")"); return []; }
    console.log(LOG + " serie newsId=" + seed.newsId + " (" + seed.title + ")");
    var eps = await fetchSeriesEpisodes(base, seed.newsId);
    if (!eps) { console.log(LOG + " episodes API empty"); return []; }
    var vers = ["vf", "vostfr", "vo"];
    for (var vi = 0; vi < vers.length; vi++) {
      var dict = eps[vers[vi]];
      if (!dict) continue;
      var ep = dict[String(episode)];
      if (!ep) continue;
      for (var h = 0; h < HOST_ORDER.length; h++) {
        var hk = HOST_ORDER[h];
        var url = ep[hk];
        if (url && typeof url === "string" && /^https?:\/\//i.test(url)) {
          jobs.push({ hostKey: hk, embedUrl: url, langKey: vers[vi], epNum: episode });
        }
      }
    }
  }

  if (!jobs.length) { console.log(LOG + " no player links"); return []; }

  // Lock onto the FIRST host that yields streams and resolve only its jobs (both languages),
  // then stop. In Nuvio's runtime a single hanging embed host (one blocked on the user's network)
  // can't be aborted and would wipe out everything — so never risk a second host once one works.
  var streams = [];
  var lockedHost = null;
  var MAX_JOBS = 8;
  for (var ji = 0; ji < jobs.length && ji < MAX_JOBS; ji++) {
    var jb = jobs[ji];
    if (lockedHost && jb.hostKey !== lockedHost) break;
    var g = await buildStreams(jb.hostKey, jb.embedUrl, jb.langKey, jb.epNum, jb.langText);
    if (g.length) {
      lockedHost = jb.hostKey;
      for (var gx = 0; gx < g.length; gx++) streams.push(g[gx]);
    }
  }
  sortStreams(streams);
  console.log(LOG + " => " + streams.length + " streams");
  return streams;
}

export function getStreams(tmdbId, mediaType, season, episode) {
  return getStreamsImpl(tmdbId, mediaType, season, episode).catch(function (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  });
}
