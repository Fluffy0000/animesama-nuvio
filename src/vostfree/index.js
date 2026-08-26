// vostfree — provider for vostfree.ws (DataLife Engine, anime VF/VOSTFR)
// Two post shapes:
//  A) per-episode/movie posts  -> host embeds lie raw in the HTML (dood/getvid/...)
//  B) full-series posts        -> <option value="buttons_N">Episode ..N</option>;
//     buttons_<ep> holds <div id="player_<pid>" class="new_player_<host>">,
//     and #content_player_<pid> holds an opaque id/url per host
//     (sibnet video id, uqload embed id, gtv id, direct url...).

import { fetchText, CORE_UA, mapLimit, streamHeaders } from "../core/net.js";
import { getTmdbInfo, getAltTitles, getSeasonMap, absoluteFromSeasonMap, buildQueries } from "../core/tmdb.js";
import { slugify, stripAccents } from "../core/text.js";
import { resolveEmbed } from "../core/hosts.js";

var ORIGIN = "https://vostfree.ws";
var MAX_POSTS = 3;
var MAX_EMBEDS = 6;

function log(m) {
  try {
    if (typeof process !== "undefined" && process && process.env && process.env.VOSTFREE_DEBUG) console.error("VF| " + m);
  } catch (e) {}
}

function hdrs(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- search results ------------------------------------------------------------
function searchPosts(html) {
  var out = [], seen = {}, m;
  var re = /href="(https?:\/\/[^"]*?vostfree\.ws\/(?:bridge\.php\?url=)?\/?(\d+)-([a-z0-9-]+)\.html[^"]*)"/gi;
  while ((m = re.exec(html)) !== null) {
    var url = m[1], slug = m[3];
    if (/\.(css|js|png|jpg)/.test(url)) continue;
    if (seen[url]) continue;
    seen[url] = true;
    out.push({ url: url, slug: slug.toLowerCase() });
  }
  return out;
}

// title sanity for a post slug: share >= 2 long tokens with some candidate (or full slug contained)
function slugTitleOk(slug, candSlugs) {
  var toks = slug.split("-").filter(function (x) { return x.length >= 5 && !/^\d+$/.test(x); });
  for (var i = 0; i < candSlugs.length; i++) {
    var c = candSlugs[i];
    if (!c) continue;
    var ct = c.split("-").filter(function (x) { return x.length >= 5; });
    var hits = 0;
    for (var j = 0; j < ct.length; j++) {
      if (slug.indexOf(ct[j]) !== -1) hits++;
    }
    if (ct.length && hits >= Math.min(2, ct.length)) return true;
    if (c.length >= 8 && slug.indexOf(c) !== -1) return true;
  }
  return false;
}

// is this post usable for our request?
function postMatches(slug, candSlugs, absEp, isMovie) {
  if (!slugTitleOk(slug, candSlugs)) return { ok: false };
  if (isMovie) return { ok: true };
  var em = /-(\d{1,4})-(?:vostfr|vf)(?:-|$)/i.exec(slug);
  if (em) {
    var n = parseInt(em[1], 10);
    return n === absEp ? { ok: true, perEpisode: true } : { ok: false };
  }
  return { ok: true, series: true }; // no ep number -> full-series post
}

// ---- embed extraction, shape A: raw urls in post html ---------------------------
function postEmbeds(html) {
  var out = [], seen = {}, m;
  var re = /https?:\/\/(?:[a-z0-9-]*dood[a-z0-9-]*\.[a-z.]+|ds2(?:play|video)\.[a-z.]+|getvid\.club|video\.sibnet\.ru|[a-z0-9.-]*voe[a-z0-9.-]*\.[a-z]{2,}|uqload\.[a-z.]+|filemoon\.[a-z.]+|vidmoly\.[a-z.]+|sendvid\.com|mixdrop\.[a-z.]+|streamtape\.[a-z.]+)\/[^\s"'<>),;\]\\]+/gi;
  while ((m = re.exec(html)) !== null) {
    var u = m[0];
    if (/\.(jpg|jpeg|png|css|js|ico)($|\?)/i.test(u)) continue;
    if (!seen[u]) { seen[u] = true; out.push(u); }
  }
  return out;
}

// ---- embed extraction, shape B: typed player ids for one episode -----------------
// returns [{url}]
function episodeEmbeds(html, absEp) {
  // buttons_N matches episode N (labels are "Episode 01"/"Episode 010" etc.)
  var bm = new RegExp('id="buttons_' + absEp + '" class="button_box">(.*?)</div>\\s*(?=<div id="buttons_|</div>)', "i").exec(html);
  if (!bm) return [];
  var block = bm[1];
  var out = [], seen = {}, pm;
  var pre = /id="(player_\d+)" class="(new_player_[a-z0-9_]+)(?:\s+nower)?"/gi;
  while ((pm = pre.exec(block)) !== null) {
    var pid = pm[1], type = pm[2];
    var cm = new RegExp('id="content_' + pid + '"[^>]*>([^<]{1,500})', "i").exec(html);
    if (!cm) continue;
    var content = cm[1].trim();
    var urls = buildUrlsFor(type, content);
    for (var q = 0; q < urls.length; q++) {
      if (!seen[urls[q]]) { seen[urls[q]] = true; out.push(urls[q]); }
    }
  }
  return out;
}

// typed host -> embed url candidates
function buildUrlsFor(type, content) {
  var c = content;
  if (/^https?:\/\//i.test(c)) return [c];
  switch (type) {
    case "new_player_sibnet":   return ["https://video.sibnet.ru/shell.php?videoid=" + encodeURIComponent(c)];
    case "new_player_uqload":
    case "new_player_vip":      return ["https://uqload.com/embed-" + c + ".html", "https://uqload.io/embed-" + c + ".html"];
    case "new_player_gtv":      return ["https://iframedream.com/embed/" + c + ".html"];
    case "new_player_doo":
    case "new_player_dood":     return ["https://dood.so/e/" + c];
    case "new_player_fembed":   return ["https://feurl.com/v/" + c, "https://fembed.com/v/" + c];
    case "new_player_mytv":
    case "new_player_myvi":     return ["https://fs.myvi.ru/player/embed/html/" + c];
    case "new_player_mp4":      return [];
    case "new_player_mail2":
    case "new_player_mail":     return []; // mail.ru ids unresolved
    case "new_player_next":
    case "new_player_vidfast":  return ["https://hdvb.cc/embed/" + c + ".html"];
    default:
      if (/^[A-Za-z0-9_-]{8,40}$/.test(c)) {
        return ["https://uqload.com/embed-" + c + ".html", "https://dood.so/e/" + c];
      }
      return [];
  }
}

async function streamsFromEmbeds(embeds, referer, label, langBase, streams) {
  var limited = embeds.slice(0, MAX_EMBEDS);
  var resolved = await mapLimit(limited, 3, function (e) { return resolveEmbed(e, { referer: referer }); });
  var seenUrls = {};
  for (var s0 = 0; s0 < streams.length; s0++) seenUrls[streams[s0].url] = true;
  for (var i = 0; i < resolved.length && streams.length < 9; i++) {
    var x = resolved[i];
    if (!x || !x.url || seenUrls[x.url]) continue;
    seenUrls[x.url] = true;
    var lang = langBase;
    var flag = lang === "VF" ? "🇫🇷" : "🇯🇵";
    var kind = /\.m3u8/i.test(x.url) ? "HLS" : "MP4";
    streams.push({
      name: flag + " Vostfree · " + x.name + " · " + lang + " · " + kind,
      title: label + " · " + lang,
      url: x.url,
      quality: "auto",
      language: lang,
      provider: "Vostfree",
      headers: streamHeaders(x.referer)
    });
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var isMovie = mediaType === "movie";
    var info = await getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];

    var absEp = episode || 1;
    if (!isMovie) {
      var smap = await getSeasonMap(tmdbId);
      absEp = absoluteFromSeasonMap(smap, season || 1, episode || 1);
    }

    var alt = await getAltTitles(tmdbId, mediaType);
    var candSlugs = info.titles.concat(alt).map(slugify);
    var queries = buildQueries(info.titles.concat(alt.slice(0, 2)));
    log("queries: " + queries.join(" | "));

    // pick posts: prefer per-episode, then series-level
    var perEp = [], series = [], seenPosts = {};
    for (var i = 0; i < queries.length && (perEp.length + series.length) < MAX_POSTS; i++) {
      var q = queries[i];
      var html = await fetchText(ORIGIN + "/index.php?do=search&subaction=search&story=" + encodeURIComponent(q),
                                 { headers: hdrs(ORIGIN + "/") }, 10000);
      if (!html) continue;
      var posts = searchPosts(html);
      for (var j = 0; j < posts.length && (perEp.length + series.length) < MAX_POSTS; j++) {
        var p = posts[j];
        if (seenPosts[p.url]) continue;
        var m = postMatches(p.slug, candSlugs, absEp, isMovie);
        if (!m.ok) continue;
        seenPosts[p.url] = true;
        if (m.perEpisode) perEp.push(p); else if (m.series) series.push(p);
        if (isMovie) break;
      }
    }
    var picks = (isMovie ? series.concat(perEp) : perEp.concat(series)).slice(0, MAX_POSTS);
    log("picks: " + picks.map(function (p) { return p.slug; }).join(", "));
    if (!picks.length) return [];

    var streams = [];
    var label = isMovie ? info.titles[0] : info.titles[0] + " · Épisode " + absEp;
    for (var k = 0; k < picks.length && streams.length < 9; k++) {
      var post = picks[k];
      var phtml = await fetchText(post.url, { headers: hdrs(ORIGIN + "/") }, 12000);
      if (!phtml) continue;
      var lang = /(^|[^a-z])vf([^a-z]|$)/i.test(post.slug) && !/vostfr/i.test(post.slug) ? "VF" : "VOSTFR";
      var embeds = postEmbeds(phtml);
      if (!isMovie && !embeds.length) embeds = episodeEmbeds(phtml, absEp);
      log(post.slug + " embeds=" + embeds.length);
      await streamsFromEmbeds(embeds, post.url, label, lang, streams);
    }
    return streams;
  } catch (e) {
    log("THREW " + (e && e.message ? e.message : e));
    return [];
  }
}

export { getStreams };
