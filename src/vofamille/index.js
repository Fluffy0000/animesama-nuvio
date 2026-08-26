// vofamille — generic provider for the yablom-skeleton family:
//   yablom.com, kordoz.com, ilmiv.com, kidraz.com (films only, VF/VOSTFR, sharecloudy)
// Pipeline: resolve folder token -> /{f}/api_search.php?searchword= (Referer REQUIRED)
//           -> /{f}/b/<tag>/<id> -> iframe (sharecloudy/ofbax) -> direct m3u8.
// SITE config is injected at build time by build.py (see VARIANTS).

import { fetchText, fetchJson, CORE_UA, netIsOk, safeFetch, streamHeaders } from "../core/net.js";
import { getTmdbInfo, buildQueries } from "../core/tmdb.js";
import { slugify } from "../core/text.js";
import { resolveEmbed } from "../core/hosts.js";

/*__SITE_CONFIG__*/

var PROVIDER_NAME = SITE.name;

function headers(referer) {
  var h = { "User-Agent": CORE_UA, "Cookie": "g=true" };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- folder token (validated by content, auto-rediscovered if it rotates) ----
var cachedFolder = null;

async function folderWorks(folder) {
  var home = SITE.origin + "/" + folder + "/home/" + SITE.tag;
  var r = await safeFetch(home, { headers: headers(null) }, 9000);
  if (!netIsOk(r)) return false;
  try {
    var html = await r.text();
    return html && html.length > 40000; // the real home page is a fat film catalogue
  } catch (e) { return false; }
}

async function resolveFolder() {
  if (cachedFolder) return cachedFolder;
  if (await folderWorks(SITE.folder)) { cachedFolder = SITE.folder; return cachedFolder; }
  try {
    var html = await fetchText(SITE.origin + "/", { headers: headers(null) }, 9000);
    if (html) {
      var seen = {}, cands = [], re = /href="\/?([a-zA-Z0-9]{4,14})"/g, m;
      while ((m = re.exec(html)) !== null) {
        var tok = m[1];
        if (!seen[tok]) { seen[tok] = true; cands.push(tok); }
      }
      for (var i = 0; i < cands.length; i++) {
        if (await folderWorks(cands[i])) { cachedFolder = cands[i]; return cachedFolder; }
      }
    }
  } catch (e) {}
  cachedFolder = SITE.folder;
  return cachedFolder;
}

// ---- search (Referer to the folder home is MANDATORY — without it: 0 films) ----
async function searchFilms(folder, query) {
  var url = SITE.origin + "/" + folder + "/api_search.php?searchword=" + encodeURIComponent(query);
  var j = await fetchJson(url, { headers: headers(SITE.origin + "/" + folder + "/home/" + SITE.tag) }, 9000);
  if (!j || !j.films) return [];
  var out = [];
  for (var i = 0; i < j.films.length; i++) {
    var f = j.films[i];
    if (!f) continue;
    // JSON `link` uses a stale folder/tag (/ALBRAD/b/localhost/<id>); only trailing id is real
    var linkId = "";
    if (f.link) { var lm = /(\d+)\s*$/.exec(String(f.link)); if (lm) linkId = lm[1]; }
    if (!linkId && f.id) linkId = String(f.id);
    if (!linkId) continue;
    var ym = /\((\d{4})\)/.exec(String(f.title || ""));
    out.push({ id: linkId, title: String(f.title || ""), vostfr: !!f.vostfr, year: ym ? ym[1] : null });
  }
  return out;
}

// strip trailing "(YYYY)" then slug
function siteSlug(title) {
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, ""));
}

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

async function fetchEmbedUrl(folder, linkId) {
  var home = SITE.origin + "/" + folder + "/home/" + SITE.tag;
  var html = await fetchText(SITE.origin + "/" + folder + "/b/" + SITE.tag + "/" + linkId,
                             { headers: headers(home) }, 10000);
  if (!html) return null;
  var m = /src="(https?:\/\/[a-z0-9.-]+\/iframe\/[A-Za-z0-9]+)"/i.exec(html);
  if (m) return m[1];
  var g = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
  return g ? g[1] : null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" || mediaType === "anime") return []; // films-only catalogue
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];
    var candSlugs = info.titles.map(slugify);

    var folder = await resolveFolder();
    var queries = buildQueries(info.titles);
    var byId = {}, done = false;
    for (var i = 0; i < queries.length && !done; i++) {
      var films = await searchFilms(folder, queries[i]);
      for (var j = 0; j < films.length; j++) {
        var f = films[j];
        if (!byId[f.id]) byId[f.id] = f;
        if (scoreFilm(f, candSlugs, info.year) >= 100) done = true;
      }
    }
    var best = null, bestScore = -1;
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      var sc = scoreFilm(byId[id], candSlugs, info.year);
      if (sc > bestScore) { bestScore = sc; best = byId[id]; }
    }
    if (!best || bestScore < 65) return [];

    var embed = await fetchEmbedUrl(folder, best.id);
    if (!embed) return [];
    var res = await resolveEmbed(embed, { referer: SITE.origin + "/" });
    if (!res || !res.url) return [];

    var lang = best.vostfr ? "VOSTFR" : "VF";
    var flag = best.vostfr ? "🇯🇵" : "🇫🇷";
    var kind = /\.m3u8/i.test(res.url) ? "HLS" : "MP4";
    return [{
      name: flag + " " + PROVIDER_NAME + " · " + res.name + " · " + lang + " · " + kind,
      title: best.title.replace(/^\u200e/, "") + " · " + lang,
      url: res.url,
      quality: "auto",
      language: lang,
      provider: PROVIDER_NAME,
      headers: streamHeaders(res.referer)
    }];
  } catch (e) {
    return [];
  }
}

export { getStreams };
