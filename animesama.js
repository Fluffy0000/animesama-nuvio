// index.js - French-Manga (french-manga.net) provider for Nuvio
// getStreams(tmdbId, mediaType, season, episode) -> Promise<stream[]>
import {
  USER_AGENT, TMDB_API_KEY, fetchJson, slugify,
  resolveBase, liveSearch, getSeasons, fetchStoryMeta, fetchEpisodes
} from "./http.js";
import { resolveHost, explodeHls, mp4Alive } from "./extractor.js";

var LOG = "[French-Manga]";

// ---------- TMDB titles ----------
async function getTmdbTitles(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var titles = [];
  function add(t) { if (t && typeof t === "string" && t.trim()) titles.push(t.trim()); }
  var langs = ["en-US", "fr-FR"];
  for (var i = 0; i < langs.length; i++) {
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=" + langs[i] + "&append_to_response=alternative_titles";
    var j = null;
    try { j = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } }, 10000); } catch (e) { j = null; }
    if (!j) continue;
    add(j.name); add(j.title); add(j.original_name); add(j.original_title);
    var alt = j.alternative_titles;
    var list = alt ? (alt.results || alt.titles || []) : [];
    for (var a = 0; a < list.length; a++) {
      var iso = list[a].iso_3166_1 || "";
      if (iso === "FR" || iso === "US" || iso === "GB" || iso === "JP" || iso === "") add(list[a].title);
    }
  }
  // dedupe; latin-script (sluggable) first
  var seen = {}, latin = [], other = [];
  for (var k = 0; k < titles.length; k++) {
    var t = titles[k]; var key = t.toLowerCase();
    if (seen[key]) continue; seen[key] = true;
    if (slugify(t).length > 0) latin.push(t); else other.push(t);
  }
  return latin.concat(other);
}

// ---------- title parsing / matching ----------
function parseCandidateTitle(title) {
  var yearM = /\((\d{4})\)/.exec(title);
  var year = yearM ? yearM[1] : "";
  var t = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  var isMovie = /\b(movie|film)\b/i.test(t) || /[-–]\s*the\s*movie/i.test(t);
  var seasonM = /saison\s*(\d+)/i.exec(t);
  var season = seasonM ? parseInt(seasonM[1], 10) : null;
  var base = t
    .replace(/[-–]\s*saison\s*\d+.*$/i, "")
    .replace(/[-–]?\s*the\s*movie\s*[-–]?.*$/i, "")
    .replace(/[-–]\s*(movie|film)\b.*$/i, "")
    .trim();
  return { base: base, season: isMovie ? 999 : (season === null ? 1 : season), isMovie: isMovie, year: year };
}

function matchScore(candidateBase, targetTitles) {
  var cb = slugify(candidateBase);
  if (!cb) return 0;
  var best = 0;
  for (var i = 0; i < targetTitles.length; i++) {
    var s = slugify(targetTitles[i]);
    if (!s) continue;
    if (cb === s) return 3;
    if (cb.indexOf(s) === 0 || s.indexOf(cb) === 0) best = Math.max(best, 2);
    else if (cb.indexOf(s) >= 0 || s.indexOf(cb) >= 0) best = Math.max(best, 1);
  }
  return best;
}

async function gatherCandidates(base, titles) {
  var cands = [];
  var seen = {};
  var maxQueries = Math.min(titles.length, 3);
  for (var i = 0; i < maxQueries; i++) {
    var items = await liveSearch(base, titles[i]);
    for (var j = 0; j < items.length; j++) {
      if (seen[items[j].newsId]) continue;
      seen[items[j].newsId] = true;
      cands.push({ newsId: items[j].newsId, title: items[j].title, parsed: parseCandidateTitle(items[j].title) });
    }
    // stop early once we have a strong title match
    var strong = false;
    for (var c = 0; c < cands.length; c++) if (matchScore(cands[c].parsed.base, titles) >= 2) { strong = true; break; }
    if (strong && cands.length >= 2) break;
  }
  return cands;
}

// merge the full season/movie graph using a seed candidate
async function mergeSeasons(base, seed, titles) {
  var meta = await fetchStoryMeta(base, seed.newsId);
  var titleBase = (meta.title || seed.title).replace(/[-–]\s*saison\s*\d+.*$/i, "").trim();
  var arr = await getSeasons(base, seed.newsId, meta.tagz, titleBase);
  var list = [{
    newsId: seed.newsId, season: seed.parsed.season,
    isMovie: seed.parsed.isMovie, title: seed.title
  }];
  var seen = {}; seen[seed.newsId] = true;
  for (var i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (!e || !e.id || seen[e.id]) continue;
    seen[e.id] = true;
    var sn = e.season_number;
    var isMovie = sn === 999 || /\b(movie|film)\b/i.test(e.title || "");
    list.push({ newsId: String(e.id), season: isMovie ? 999 : (sn || 1), isMovie: isMovie, title: e.title || "" });
  }
  return list;
}

async function findTargetNewsId(base, titles, mediaType, season) {
  var cands = await gatherCandidates(base, titles);
  if (cands.length === 0) return null;

  var scored = [];
  for (var i = 0; i < cands.length; i++) {
    var sc = matchScore(cands[i].parsed.base, titles);
    if (sc > 0) { cands[i].score = sc; scored.push(cands[i]); }
  }
  if (scored.length === 0) return null;
  scored.sort(function (a, b) { return b.score - a.score; });

  if (mediaType === "movie") {
    var movies = scored.filter(function (c) { return c.parsed.isMovie; });
    if (movies.length) return pickBestMovie(movies, titles).newsId;
    // no movie flagged in search: expand via season graph
    var merged = await mergeSeasons(base, scored[0], titles);
    var mv = merged.filter(function (c) { return c.isMovie; });
    if (mv.length) return pickBestMovie(mv, titles).newsId;
    // last resort: the best scored candidate
    return scored[0].newsId;
  }

  // TV
  var exact = scored.filter(function (c) { return !c.parsed.isMovie && c.parsed.season === season; });
  if (exact.length) return exact[0].newsId;

  // need the season graph
  var seed = null;
  for (var s = 0; s < scored.length; s++) if (!scored[s].parsed.isMovie) { seed = scored[s]; break; }
  if (!seed) seed = scored[0];
  var full = await mergeSeasons(base, seed, titles);
  var hit = null;
  for (var f = 0; f < full.length; f++) if (!full[f].isMovie && full[f].season === season) { hit = full[f]; break; }
  if (hit) return hit.newsId;

  // fallback: season 1 requested and only one entry -> use seed
  if (season === 1) return seed.newsId;
  return null;
}

function pickBestMovie(movies, titles) {
  var best = movies[0]; var bestScore = -1;
  for (var i = 0; i < movies.length; i++) {
    var b = movies[i].parsed ? movies[i].parsed.base : (movies[i].title || "");
    var sc = matchScore(b, titles);
    if (sc > bestScore) { bestScore = sc; best = movies[i]; }
  }
  return best;
}

// ---------- host normalization ----------
function hostDisplayName(hostKey, url) {
  if (/vidzy/i.test(url) || hostKey === "vidzy") return "Vidzy";
  if (/luluvdo|luluvid|luluvdoo|lulustream|vidhsareup|tnmr/i.test(url) || hostKey === "luluvid") return "Luluvdo";
  var m = /^https?:\/\/([^/]+)/i.exec(url);
  if (m) { var h = m[1].replace(/^www\./, "").split(".")[0]; return h.charAt(0).toUpperCase() + h.slice(1); }
  return hostKey || "Player";
}

// ---------- small-batch runner (avoid fetch freeze under concurrency) ----------
async function runBatched(items, worker, size) {
  var out = [];
  for (var i = 0; i < items.length; i += size) {
    var slice = items.slice(i, i + size);
    var res = await Promise.all(slice.map(worker));
    for (var j = 0; j < res.length; j++) if (res[j]) out.push(res[j]);
  }
  return out;
}

async function buildStreamsForHost(job) {
  var resolved = await resolveHost(job.hostKey, job.embedUrl);
  if (!resolved) return null;
  var display = hostDisplayName(job.hostKey, job.embedUrl);
  var langLabel = job.lang === "vf" ? "VF" : "VOSTFR";
  var flag = job.lang === "vf" ? "🇫🇷" : "🇯🇵";

  if (resolved.kind === "hls") {
    var variants = await explodeHls(resolved.masterUrl, resolved.referer);
    if (!variants.length) return null;
    return variants.map(function (v) {
      var parts = [display];
      if (v.quality) parts.push(v.quality);
      if (v.codec && v.codec !== "H.264") parts.push(v.codec);
      parts.push(langLabel);
      var s = {
        name: flag + " " + parts.join(" · "),
        title: display + " · " + (v.quality || "HD") + " · " + langLabel + " · Ep " + job.episode,
        url: v.url,
        quality: v.quality || "HD",
        language: langLabel,
        provider: display,
        headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
        _sort: { lang: job.lang, height: v.height || 0, host: display }
      };
      if (resolved.externalSubs && resolved.externalSubs.length && !v.hasSubs) s.subtitles = resolved.externalSubs;
      return s;
    });
  }

  // progressive mp4
  var alive = await mp4Alive(resolved.masterUrl, resolved.referer);
  if (!alive) return null;
  var one = {
    name: flag + " " + display + " · MP4 · " + langLabel,
    title: display + " · MP4 · " + langLabel + " · Ep " + job.episode,
    url: resolved.masterUrl,
    quality: "HD",
    language: langLabel,
    provider: display,
    headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
    _sort: { lang: job.lang, height: 1, host: display }
  };
  if (resolved.externalSubs && resolved.externalSubs.length) one.subtitles = resolved.externalSubs;
  return [one];
}

function pickEpisodeKey(dict, episode, isMovie) {
  if (!dict) return null;
  if (isMovie) {
    if (dict[String(episode)]) return String(episode);
    var keys = Object.keys(dict);
    return keys.length ? keys[0] : null;
  }
  return dict[String(episode)] ? String(episode) : null;
}

// ---------- main ----------
async function getStreamsImpl(tmdbId, mediaType, season, episode) {
  var isMovie = mediaType === "movie";
  season = season || 1;
  episode = episode || 1;

  var base = await resolveBase();
  console.log(LOG + " base=" + base + " " + mediaType + "/" + tmdbId +
    (isMovie ? "" : " S" + season + "E" + episode));

  var titles = await getTmdbTitles(tmdbId, mediaType);
  if (!titles.length) { console.log(LOG + " no TMDB titles"); return []; }
  console.log(LOG + " titles: " + titles.slice(0, 4).join(" | "));

  var newsId = await findTargetNewsId(base, titles, isMovie ? "movie" : "tv", season);
  if (!newsId) { console.log(LOG + " no matching page"); return []; }
  console.log(LOG + " newsId=" + newsId);

  var data = await fetchEpisodes(base, newsId);
  if (!data) { console.log(LOG + " episodes API empty"); return []; }

  var jobs = [];
  var langs = ["vostfr", "vf"];
  for (var l = 0; l < langs.length; l++) {
    var lang = langs[l];
    var dict = data[lang];
    var epKey = pickEpisodeKey(dict, episode, isMovie);
    if (!epKey) continue;
    var hosts = dict[epKey];
    for (var hk in hosts) {
      if (!Object.prototype.hasOwnProperty.call(hosts, hk)) continue;
      var url = hosts[hk];
      if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
      jobs.push({ hostKey: hk, embedUrl: url, lang: lang, episode: isMovie ? 1 : episode });
    }
  }
  if (!jobs.length) { console.log(LOG + " no host links for episode"); return []; }

  var groups = await runBatched(jobs, buildStreamsForHost, 3);
  var streams = [];
  for (var g = 0; g < groups.length; g++) for (var x = 0; x < groups[g].length; x++) streams.push(groups[g][x]);

  // sort: VOSTFR first, then quality desc, then host name
  var langRank = { vostfr: 0, vf: 1 };
  streams.sort(function (a, b) {
    var la = langRank[a._sort.lang], lb = langRank[b._sort.lang];
    if (la !== lb) return la - lb;
    if (b._sort.height !== a._sort.height) return b._sort.height - a._sort.height;
    return a._sort.host < b._sort.host ? -1 : 1;
  });
  for (var i2 = 0; i2 < streams.length; i2++) delete streams[i2]._sort;

  console.log(LOG + " => " + streams.length + " streams");
  return streams;
}

export function getStreams(tmdbId, mediaType, season, episode) {
  return getStreamsImpl(tmdbId, mediaType, season, episode).catch(function (e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  });
}
