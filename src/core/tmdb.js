// core/tmdb.js — TMDB titles/year + season anatomy (needs fetchJson from net.js)

import { fetchJson } from "./net.js";
import { slugify } from "./text.js";

var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

// Returns { titles: [fr, then en/original, deduped], year: "YYYY"|null }
async function getTmdbInfo(tmdbId, mediaType) {
  var kind = mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";
  var out = [], seen = {}, year = null;
  function add(t) {
    if (!t) return;
    var key = slugify(t);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(t);
  }
  var urls = [
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=fr-FR",
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US"
  ];
  for (var i = 0; i < urls.length; i++) {
    var d = await fetchJson(urls[i], {}, 9000);
    if (!d) continue;
    if (!year) {
      var rd = d.release_date || d.first_air_date || "";
      var ym = /^([0-9]{4})/.exec(rd);
      if (ym) year = ym[1];
    }
    add(d.title); add(d.name);
    add(d.original_title); add(d.original_name);
  }
  return { titles: out, year: year };
}

// alternative titles (e.g. romanized "Kimi no Na wa.") — latin-script only, deduped, capped 12
async function getAltTitles(tmdbId, mediaType) {
  var kind = mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";
  var d = await fetchJson(
    "https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_KEY, {}, 9000);
  var out = [], seen = {};
  var arr = d && (d.titles || d.results);
  if (!arr) return out;
  for (var i = 0; i < arr.length && out.length < 12; i++) {
    var t = arr[i] && arr[i].title;
    if (!t || !/^[\x20-\x7EÀ-ſ ’'&+,:;.-]+$/.test(t)) continue; // keep latin scripts only
    var key = slugify(t);
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(t);
  }
  return out;
}

// season anatomy: map season number -> episode_count (skips specials season 0)
async function getSeasonMap(tmdbId) {
  var d = await fetchJson(
    "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US", {}, 9000);
  var map = {};
  if (d && d.seasons) {
    for (var i = 0; i < d.seasons.length; i++) {
      var s = d.seasons[i];
      if (s && typeof s.season_number === "number" && s.season_number >= 1) {
        map[s.season_number] = s.episode_count || 0;
      }
    }
  }
  return map;
}

// anime sites number episodes ABSOLUTELY (1..N across seasons). Convert TMDB S/E -> absolute.
// fallback: if season anatomy unavailable, take episode as-is (matches most S1 cases).
function absoluteFromSeasonMap(seasonMap, season, episode) {
  var keys = Object.keys(seasonMap).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
  if (!keys.length) return episode;
  var abs = 0;
  for (var i = 0; i < keys.length; i++) {
    var sn = keys[i];
    if (sn < season) abs += (seasonMap[sn] || 0);
  }
  return abs + episode;
}

// build SEARCH QUERY variants: full title + first-3 + first-2 + distinctive tokens.
// Site searches match substrings in THEIR titles — full long titles often hit nothing
// (their title is a short romaji), so word fragments and rare single tokens matter.
var STOP_TOKENS = { the:1, les:1, des:1, une:1, and:1, for:1, sur:1, aux:1, avec:1, dans:1, movie:1, film:1, an:1, en:1 };
function buildQueries(titles) {
  var seen = {}, out = [];
  function push(q) {
    q = String(q || "").trim();
    if (q.length < 2) return;
    var key = q.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(q);
  }
  var tokenPool = [];
  for (var i = 0; i < titles.length && out.length < 10; i++) {
    var toks = String(titles[i]).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (!toks.length) continue;
    push(titles[i]);                              // full title first
    if (toks.length >= 3) push(toks.slice(0, 3).join(" "));
    if (toks.length >= 2) push(toks.slice(0, 2).join(" "));
    var picked = 0;
    for (var t = 0; t < toks.length && picked < 2; t++) {
      var w = toks[t], lw = w.toLowerCase();
      if (w.length >= 5 && !STOP_TOKENS[lw] && !/^\d+$/.test(w)) { tokenPool.push(w); picked++; }
    }
    // distinctive tokens of THIS title right away (romaji sites match single tokens)
    tokenPool.sort(function (a, b) { return b.length - a.length; });
    var used = {};
    for (var p = 0; p < tokenPool.length && out.length < 10; p++) {
      if (!used[tokenPool[p].toLowerCase()]) { used[tokenPool[p].toLowerCase()] = 1; push(tokenPool[p]); }
    }
  }
  return out.slice(0, 10);
}

export { TMDB_KEY, getTmdbInfo, getAltTitles, getSeasonMap, absoluteFromSeasonMap, buildQueries };
