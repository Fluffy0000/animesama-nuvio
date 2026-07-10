// index.js — getStreams orchestration for yablom.com (movies only)

import {
  resolveFolder, getTmdbInfo, searchFilms, fetchEmbedUrl, slugify, USER_AGENT
} from "./http.js";
import { resolveEmbed } from "./extractor.js";

// strip a trailing "(YYYY)" and return the clean slug of a site title
function siteSlug(title) {
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, ""));
}

// build search queries from titles: full title + a punctuation-safe first-3-tokens variant.
// the site search is a literal case-insensitive substring match, so a clean short prefix
// (e.g. "Super Mario Bros") hits where the full TMDB title ("Super Mario Bros., le film") misses.
function buildQueries(titles) {
  var seen = {}, out = [];
  function push(q) {
    q = String(q).trim();
    if (!q) return;
    var key = q.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(q);
  }
  for (var i = 0; i < titles.length; i++) {
    push(titles[i]);
    var toks = String(titles[i]).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (toks.length > 3) push(toks.slice(0, 3).join(" "));
    else if (toks.length >= 1) push(toks.join(" "));
  }
  return out;
}

// score a site film against the tmdb title candidates + year
function scoreFilm(film, candSlugs, tmdbYear) {
  var s = siteSlug(film.title);
  if (!s) return -1;
  var best = -1;
  for (var i = 0; i < candSlugs.length; i++) {
    var c = candSlugs[i];
    if (!c) continue;
    var base = -1;
    if (s === c) base = 100;
    else if (s.length > 4 && c.length > 4 && (s.indexOf(c) === 0 || c.indexOf(s) === 0)) base = 55;
    if (base < 0) continue;
    if (tmdbYear && film.year) base += (tmdbYear === film.year ? 15 : -25);
    if (base > best) best = base;
  }
  return best;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // yablom is a movie-only catalogue — TV series return nothing
    if (mediaType === "tv") return [];

    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];
    var candSlugs = info.titles.map(slugify);

    var folder = await resolveFolder();

    // search each query variant, dedupe films by link id
    var queries = buildQueries(info.titles);
    var byId = {}, done = false;
    for (var i = 0; i < queries.length && !done; i++) {
      var films = await searchFilms(folder, queries[i]);
      for (var j = 0; j < films.length; j++) {
        var f = films[j];
        if (!byId[f.id]) byId[f.id] = f;
        // early exit once we have a confident exact match
        if (scoreFilm(f, candSlugs, info.year) >= 100) done = true;
      }
    }

    // pick best match
    var best = null, bestScore = -1;
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      var sc = scoreFilm(byId[id], candSlugs, info.year);
      if (sc > bestScore) { bestScore = sc; best = byId[id]; }
    }
    if (!best || bestScore < 90) return []; // require a confident (exact-slug) match

    var embed = await fetchEmbedUrl(folder, best.id);
    if (!embed) return [];

    var res = await resolveEmbed(embed);
    if (!res || !res.url) return [];

    // HLS here is a mono-quality media playlist -> return as-is (manual §7)
    var lang = best.vostfr ? "VOSTFR" : "VF";
    var flag = best.vostfr ? "🇯🇵" : "🇫🇷";
    var kind = /\.m3u8/i.test(res.url) ? "HLS" : "MP4";

    var stream = {
      name: flag + " Sharecloudy · " + lang + " · " + kind,
      title: best.title + " · " + lang,
      url: res.url,
      quality: "auto",
      language: lang,
      provider: "Sharecloudy",
      headers: { "Referer": res.referer, "User-Agent": USER_AGENT }
    };
    return [stream];
  } catch (e) {
    return [];
  }
}

export { getStreams };
