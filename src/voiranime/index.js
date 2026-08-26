// voiranime — provider for voir-anime.to (WP "Madara", anime VOSTFR + VF)
// Pipeline: search ?post_type=wp-manga&s= -> result cards -> CONFIRM each anime page
//           (per-candidate-title token coverage + year) -> season-aware episode pick
//           -> episode page iframe (voembed.net) -> direct multi-quality m3u8.
//
// Season/episode mapping: the site splits seasons into their own slugs
// (kimetsu-no-yaiba, kimetsu-no-yaiba-2, -3, -4...) each numbered from 1,
// while the BASE page numbers absolutely. Rule: if season>=2 and a "-<season>"
// slug exists -> mine it with the TMDB episode number; else -> base page, absolute ep.

import { fetchText, safeFetch, netIsOk, CORE_UA, mapLimit, streamHeaders } from "../core/net.js";
import { getTmdbInfo, getAltTitles, getSeasonMap, absoluteFromSeasonMap, buildQueries } from "../core/tmdb.js";
import { slugify, stripAccents } from "../core/text.js";
import { resolveEmbed } from "../core/hosts.js";

var ORIGIN = "https://voir-anime.to";
var MAX_CANDS = 20;
var MAX_VERIFY = 6;
var MAX_EP = 5;

function log(m) {
  try {
    if (typeof process !== "undefined" && process && process.env && process.env.VOIRANIME_DEBUG) console.error("VA| " + m);
  } catch (e) {}
}

function hdrs(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// fetch an anime page following redirects; returns the CANONICAL slug from the final URL
// (/anime/kimetsu-no/ 301 -> /anime/kimetsu-no-yaiba/) so downstream regexes stay exact.
async function fetchAnimePage(slug) {
  var r = await safeFetch(ORIGIN + "/anime/" + slug + "/", { headers: hdrs(ORIGIN + "/") }, 12000);
  if (!netIsOk(r)) return null;
  var final = slug;
  try {
    if (typeof r.url === "string") {
      var m = /\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\//i.exec(r.url);
      if (m) final = m[1].toLowerCase();
    }
  } catch (e) {}
  try { return { slug: final, html: await r.text() }; } catch (e) { return null; }
}

function htmlEntities(s) {
  return String(s || "").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
                        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
                        .replace(/\s+/g, " ").trim();
}

// --- search -> [{slug, title}] via title="..." attr AND anchor inner text -----
function animeResults(html) {
  var out = [], seen = {}, m, a;
  var r1 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"([^>]*)>/gi;
  while ((m = r1.exec(html)) !== null) {
    var s = m[1].toLowerCase();
    if (s === "feed" || seen[s]) continue;
    seen[s] = true;
    var tm = /title="([^"]{2,140})"/i.exec(m[2] || "");
    out.push({ slug: s, title: htmlEntities(tm ? tm[1] : "") });
  }
  var r2 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,140})</gi;
  while ((a = r2.exec(html)) !== null) {
    var s2 = a[1].toLowerCase();
    if (s2 === "feed") continue;
    var txt = htmlEntities(a[2]);
    for (var i = 0; i < out.length; i++) {
      if (out[i].slug === s2 && !out[i].title && txt && !/^(lire|voir|ep|episode)/i.test(txt)) out[i].title = txt;
    }
    if (!seen[s2]) { seen[s2] = true; out.push({ slug: s2, title: txt }); }
  }
  return out;
}

// --- identity proof on an anime page -------------------------------------------
// best per-candidate-title token coverage found on page + TMDB year bonus
function titleTokens(t) {
  var toks = stripAccents(String(t).toLowerCase()).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/), out = [];
  for (var i = 0; i < toks.length; i++) if (toks[i].length >= 4 && !/^\d+$/.test(toks[i])) out.push(toks[i]);
  return out;
}
// normalize for phrase search: alnum collapsed to single spaces
function normTxt(s) { return " " + stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, " ") + " "; }

// identity proof: (a) a FULL candidate phrase on the page -> sure; else
// (b) >= 50% of a candidate's distinctive tokens at WORD STARTS, with >= 2 hits.
function pageConfirm(pageText, candTitles, tmdbYear) {
  if (!pageText) return { cov: 0, score: -1 };
  var p = normTxt(pageText);
  var best = 0;
  for (var i = 0; i < candTitles.length; i++) {
    var t = candTitles[i];
    var phrase = normTxt(t).replace(/\s+/g, " ").trim();
    if (phrase.length >= 5 && p.indexOf(" " + phrase + " ") !== -1) { best = 1; break; }
    var toks = titleTokens(t);
    if (!toks.length) continue;
    var hits = 0;
    for (var j = 0; j < toks.length; j++) {
      if (p.indexOf(" " + toks[j]) !== -1) hits++;
    }
    if (hits < 2) continue;                       // generic single tokens prove nothing
    var cov = hits / toks.length;
    if (cov > best) best = cov;
  }
  var score = Math.round(70 * best);
  if (tmdbYear && p.indexOf(" " + String(tmdbYear) + " ") !== -1) score += 25;
  return { cov: best, score: score };
}

// --- episode/film link mining ---------------------------------------------------
function pickEpisode(html, slug, epNum) {
  var out = { vostfr: null, vf: null };
  var re = new RegExp('href="(https?:\\/\\/voir-anime\\.to\\/anime\\/' + slug + '\\/[a-z0-9][a-z0-9-]*?-(\\d{2,5})-(vostfr|vf))\\/?"', "gi"), m;
  while ((m = re.exec(html)) !== null) {
    if (parseInt(m[2], 10) === epNum) {
      if (m[3] === "vf" && !out.vf) out.vf = m[1];
      if (m[3] === "vostfr" && !out.vostfr) out.vostfr = m[1];
    }
  }
  return out;
}
function pickMovieLinks(html, slug) {
  var out = [], seen = {}, m;
  var re = new RegExp('href="(https?:\\/\\/voir-anime\\.to\\/anime\\/' + slug + '\\/((?:film|films|special|movie|ova)-(vostfr|vf)-[a-z0-9-]+)\\/?)"', "gi");
  while ((m = re.exec(html)) !== null) {
    var key = m[1] + m[3];
    if (!seen[key]) { seen[key] = true; out.push({ href: m[1], lang: m[3] }); }
  }
  return out;
}
function playerIframes(html) {
  var out = [], seen = {}, m;
  var re = /<(?:iframe|source)[^>]*(?:src|data-src)="(https?:\/\/[^"]+)"/gi;
  while ((m = re.exec(html)) !== null) {
    var u = m[1];
    if (/googletagmanager|facebook|doubleclick|analytics|whos\.amung/i.test(u)) continue;
    if (!seen[u]) { seen[u] = true; out.push(u); }
  }
  return out;
}

async function pageStreams(url, lang, title, streams) {
  var html = await fetchText(url, { headers: hdrs(ORIGIN + "/") }, 10000);
  if (!html) { log("ep page empty " + url); return; }
  var frames = playerIframes(html).slice(0, 3);
  log("ep " + url + " frames=" + frames.length);
  var results = await mapLimit(frames, 2, function (f) { return resolveEmbed(f, { referer: url }); });
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r || !r.url) continue;
    var flag = lang === "VF" ? "🇫🇷" : "🇯🇵";
    var kind = /\.m3u8/i.test(r.url) ? "HLS" : "MP4";
    streams.push({
      name: flag + " VoirAnime · " + r.name + " · " + lang + " · " + kind,
      title: title + " · " + lang,
      url: r.url,
      quality: "auto",
      language: lang,
      provider: "VoirAnime",
      headers: streamHeaders(r.referer)
    });
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];
    var S = season || 1, E = episode || 1;

    var smap = isMovie ? {} : await getSeasonMap(tmdbId);
    var absEp = isMovie ? 1 : absoluteFromSeasonMap(smap, S, E);

    var alt = await getAltTitles(tmdbId, mediaType);
    var candTitles = info.titles.concat(alt);
    var queries = buildQueries(candTitles);
    log("queries: " + queries.join(" | "));

    // ---- search ----------------------------------------------------------------
    var cands = [], seenCand = {};
    for (var i = 0; i < queries.length && cands.length < MAX_CANDS; i++) {
      var sh = await fetchText(ORIGIN + "/?post_type=wp-manga&s=" + encodeURIComponent(queries[i]), { headers: hdrs(ORIGIN + "/") }, 10000);
      if (!sh) continue;
      var items = animeResults(sh);
      log("q='" + queries[i] + "' -> " + items.length + " items");
      for (var j = 0; j < items.length && cands.length < MAX_CANDS; j++) {
        if (!seenCand[items[j].slug]) { seenCand[items[j].slug] = true; cands.push(items[j]); }
      }
    }
    if (!cands.length) { log("no candidates"); return []; }

    // ---- pre-rank candidates by TITLE match (before opening any page) -----------
    var candSlugsTitle = candTitles.map(slugify);
    function rankOf(slug, title) {
      var best = 0;
      var t = slugify(title || "");
      if (t) t = t.replace(/-vf$/, "");
      for (var i = 0; i < candSlugsTitle.length; i++) {
        var c = candSlugsTitle[i];
        if (!c) continue;
        var s = 0;
        if (t && t === c) s = 100;
        else if (slug === c || slug === c + "-vf" || slug + "-vf" === c) s = 90;
        else if (t && t.length > 4 && c.length > 4 && (t.indexOf(c) === 0 || c.indexOf(t) === 0)) s = 60;
        else if (t && t.length > 6 && c.length > 6 && (t.indexOf(c) !== -1 || c.indexOf(t) !== -1)) s = 35;
        if (s > best) best = s;
      }
      return best;
    }
    cands.sort(function (a, b) {
      function adj(c) {
        var r = rankOf(c.slug, c.title);
        if (/-?(movie|film|ova|special|pillar|recap)-/.test("-" + c.slug + "-")) r -= 15;
        return r;
      }
      return adj(b) - adj(a);
    });
    log("cands: " + cands.map(function (c) { return c.slug; }).join(", "));

    // ---- open pages, confirm identity --------------------------------------------
    var confirmed = [], canonSeen = {};
    var openCap = Math.min(cands.length, isMovie ? 3 : MAX_VERIFY);
    for (var k = 0; k < openCap; k++) {
      var pg = await fetchAnimePage(cands[k].slug);
      if (!pg) continue;
      if (canonSeen[pg.slug]) continue;
      var pc = pageConfirm(pg.html, candTitles, isMovie ? info.year : null);
      log("verify " + cands[k].slug + " -> " + pg.slug + " cov=" + pc.cov.toFixed(2) + " score=" + pc.score);
      if (pc.cov >= 0.5) { canonSeen[pg.slug] = true; confirmed.push({ slug: pg.slug, html: pg.html, score: pc.score }); }
      if (isMovie && confirmed.length >= 2) break;
      if (!isMovie && confirmed.length >= 6) break;
    }
    if (!confirmed.length) { log("no confirmed page"); return []; }

    // ---- BASE PAGE = shortest REAL page among confirmed slugs and ALL their
    //      parent slugs (series homes are too old for search results; season/film
    //      slugs are always <base>-something). Shortest verified parent wins.
    if (!isMovie) {
      var parents = [], seenP = {};
      for (var pb = 0; pb < confirmed.length; pb++) {
        var toks = confirmed[pb].slug.split("-");
        for (var cut = toks.length - 1; cut >= 1; cut--) {
          var pslug = toks.slice(0, cut).join("-");
          if (pslug.length < 8) break;
          if (!seenP[pslug]) { seenP[pslug] = true; parents.push(pslug); }
        }
      }
      parents.sort(function (a, b) { return a.length - b.length; }); // shortest first
      var baseFound = null;
      for (var pq = 0; pq < parents.length && !baseFound && pq < 8; pq++) {
        var pgp = await fetchAnimePage(parents[pq]);
        if (!pgp) continue;
        if (canonSeen[pgp.slug]) { // already verified page re-resolved: it IS a base candidate
          baseFound = confirmed.filter(function (x) { return x.slug === pgp.slug; })[0] || null;
          break;
        }
        var pc2 = pageConfirm(pgp.html, candTitles, null);
        log("parent-probe " + parents[pq] + " -> " + pgp.slug + " cov=" + pc2.cov.toFixed(2));
        if (pc2.cov >= 0.5) {
          baseFound = { slug: pgp.slug, html: pgp.html, score: pc2.score };
          confirmed.push(baseFound);
          canonSeen[pgp.slug] = true;
        }
      }
    }

    // ---- pick the RIGHT page(s) -------------------------------------------------
    confirmed.sort(function (a, b) {
      if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
      return b.score - a.score;
    });
    var base = isMovie ? confirmed[0] : (typeof baseFound !== "undefined" && baseFound ? baseFound : confirmed[0]);
    log("base = " + base.slug);
    var seasonPage = null, seasonVfPage = null;
    if (!isMovie && S >= 2) {
      for (var c2 = 0; c2 < confirmed.length; c2++) {
        var sl = confirmed[c2].slug;
        if (new RegExp("-" + S + "$").test(sl)) seasonPage = confirmed[c2];
        else if (new RegExp("-" + S + "-vf$").test(sl)) seasonVfPage = confirmed[c2];
      }
    }

    var streams = [], minedEps = 0;
    if (isMovie) {
      for (var c3 = 0; c3 < confirmed.length && streams.length < 8; c3++) {
        var links = pickMovieLinks(confirmed[c3].html, confirmed[c3].slug);
        log(confirmed[c3].slug + " filmLinks=" + links.length);
        for (var L = 0; L < links.length && streams.length < 8; L++) {
          await pageStreams(links[L].href, links[L].lang.toUpperCase(), info.titles[0], streams);
        }
      }
      return streams;
    }

    // tv — season-aware mining order:
    //   1) exact "-<S>" / "-<S>-vf" season pages, TMDB episode number (site restarts at 1)
    //   2) non-numbered arc pages (yuukaku-hen etc.) with TMDB episode number
    //   3) base page with ABSOLUTE episode number
    function seasonNumOf(slug) {
      var m = /-(\d+)(-vf)?$/.exec(slug);
      return m ? parseInt(m[1], 10) : null;
    }
    var seasonPages = [], arcPages = [];
    for (var sp = 0; sp < confirmed.length; sp++) {
      var sn = seasonNumOf(confirmed[sp].slug);
      if (sn === S && confirmed[sp].slug !== base.slug) seasonPages.push(confirmed[sp]);
      else if (sn === null && confirmed[sp].slug !== base.slug) arcPages.push(confirmed[sp]);
    }
    arcPages.sort(function (a, b) { return b.score - a.score; });

    var works = [];
    for (var a1 = 0; a1 < seasonPages.length; a1++) works.push({ page: seasonPages[a1], epNum: E });
    var label = info.titles[0];
    if (S >= 2 && !seasonPages.length && arcPages.length) {
      if (absEp > 100) {
        // long-running absolute numbering (One Piece...): base page is the authority
        works.push({ page: base, epNum: absEp });
        for (var a2 = 0; a2 < arcPages.length; a2++) works.push({ page: arcPages[a2], epNum: E });
      } else {
        // cour-split seasons (Demon Slayer...): arc pages number their eps from 1
        for (var a3 = 0; a3 < arcPages.length; a3++) works.push({ page: arcPages[a3], epNum: E });
        works.push({ page: base, epNum: absEp });
      }
    } else {
      works.push({ page: base, epNum: absEp });
    }

    var usedSlugs = {};
    for (var w = 0; w < works.length && streams.length < 8 && minedEps < MAX_EP; w++) {
      var wk = works[w];
      if (usedSlugs[wk.page.slug]) continue;
      usedSlugs[wk.page.slug] = true;
      var pick = pickEpisode(wk.page.html, wk.page.slug, wk.epNum);
      log("mine " + wk.page.slug + " epNum=" + wk.epNum + " -> vostfr=" + !!pick.vostfr + " vf=" + !!pick.vf);
      var lb = label + " · S" + S + "E" + E;
      if (pick.vostfr) { minedEps++; await pageStreams(pick.vostfr, "VOSTFR", lb, streams); }
      if (pick.vf && streams.length < 8) { minedEps++; await pageStreams(pick.vf, "VF", lb, streams); }
      if (streams.length) break;
    }
    return streams;
  } catch (e) {
    log("THREW " + (e && e.message ? e.message : e));
    return [];
  }
}

export { getStreams };
