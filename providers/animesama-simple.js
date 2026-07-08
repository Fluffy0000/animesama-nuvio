/**
 * Anime-Sama Provider for Nuvio - WITH RESOLVERS
 * Extracts direct video URLs from embed pages
 */
var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

var ALLOWED_HOSTS = ["vidmoly", "sibnet", "smoothpre", "oneupload", "sendvid", "vk.com", "vkvideo"];

function slugify(t) {
  var M = {"à":"a","â":"a","ä":"a","á":"a","ã":"a","å":"a","æ":"ae","ç":"c","è":"e","é":"e","ê":"e","ë":"e","ì":"i","î":"i","ï":"i","í":"i","ñ":"n","ò":"o","ô":"o","ö":"o","ó":"o","õ":"o","ø":"o","ù":"u","û":"u","ü":"u","ú":"u","ý":"y","ÿ":"y","À":"a","Â":"a","Ä":"a","Á":"a","Ã":"a","Å":"a","Æ":"ae","Ç":"c","È":"e","É":"e","Ê":"e","Ë":"e","Ì":"i","Î":"i","Ï":"i","Í":"i","Ñ":"n","Ò":"o","Ô":"o","Ö":"o","Ó":"o","Õ":"o","Ø":"o","Ù":"u","Û":"u","Ü":"u","Ú":"u","Ý":"y","Ÿ":"y","ß":"ss"};
  var r = "";
  for (var i = 0; i < t.length; i++) r += M[t[i]] || t[i];
  return r.replace(/['\u2019]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();
}

function isAllowedHost(url) {
  if (!url) return false;
  try { var h = (new URL(url)).hostname.toLowerCase(); for (var i = 0; i < ALLOWED_HOSTS.length; i++) { if (h.indexOf(ALLOWED_HOSTS[i]) !== -1) return true; } } catch(e) {}
  return false;
}

function normalizeUrl(raw) {
  if (!raw) return "";
  try { var u = new URL(String(raw).trim()); if (u.protocol !== "http:" && u.protocol !== "https:") return ""; u.hash = ""; if (u.hostname === "vidmoly.to" || u.hostname === "vidmoly.net") u.hostname = "vidmoly.biz"; return u.toString(); } catch(e) { return ""; }
}

function getPlayerName(url) {
  if (!url) return "Unknown";
  var l = url.toLowerCase();
  if (l.indexOf("sibnet") !== -1) return "Sibnet";
  if (l.indexOf("vidmoly") !== -1) return "Vidmoly";
  if (l.indexOf("sendvid") !== -1) return "Sendvid";
  if (l.indexOf("smoothpre") !== -1) return "Smoothpre";
  if (l.indexOf("oneupload") !== -1 || l.indexOf("uqload") !== -1) return "Uqload";
  if (l.indexOf("voe") !== -1) return "Voe";
  return "Player";
}

/* ------------------------------------------------------------------ */
/*  RESOLVER: extracts direct video URL from embed page              */
/* ------------------------------------------------------------------ */
function resolveStreamUrl(embedUrl) {
  if (!embedUrl) return Promise.resolve(null);

  return fetch(embedUrl, {
    headers: { "User-Agent": UA, "Referer": BASE_URL + "/", "Accept": "text/html,application/xhtml+xml" }
  })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      if (!html) return embedUrl;

      // Pattern 1: Sibnet - source src="..." or player.src = "..."
      var m = html.match(/src:\s*['"]([^'"]+\.(?:mp4|m3u8)[^'"]*)['"]/i)
           || html.match(/source\s+src=['"]([^'"]+)['"]/i)
           || html.match(/player\.src\s*=\s*['"]([^'"]+)['"]/i);

      // Pattern 2: Vidmoly - sources: ["..."] or file: "..."
      if (!m) m = html.match(/sources:\s*\[\s*['"]([^'"]+)['"]/i);
      if (!m) m = html.match(/file:\s*['"]([^'"]+)['"]/i);

      // Pattern 3: Generic mp4/m3u8 URL anywhere in the page
      if (!m) m = html.match(/https?:\/\/[^'"\s<>]+\.(?:mp4|m3u8)[^'"\s<>]*/i);

      // Pattern 4: Video tag with src
      if (!m) m = html.match(/<video[^>]+src=['"]([^'"]+)['"]/i);

      if (m && m[1]) {
        console.log("[Anime-Sama] Resolved: " + m[1].substring(0, 60) + "...");
        return m[1];
      }

      // Pattern 5: Sibnet specific - look for videoid and build URL
      var vidMatch = html.match(/videoid[=:]\s*['"]?(\d+)['"]?/i)
                  || embedUrl.match(/videoid=(\d+)/);
      if (vidMatch) {
        var mp4Url = "https://video.sibnet.ru/video" + vidMatch[1] + ".mp4";
        console.log("[Anime-Sama] Guessed Sibnet: " + mp4Url);
        return mp4Url;
      }

      // Nothing found, return original embed URL
      console.log("[Anime-Sama] Could not resolve, using embed URL");
      return embedUrl;
    })
    .catch(function() {
      console.log("[Anime-Sama] Resolve failed, using embed URL");
      return embedUrl;
    });
}

function parseEpisodesJs(jsContent) {
  if (!jsContent) return [];
  var results = [];
  var re = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*;/g, m;
  while ((m = re.exec(jsContent)) !== null) {
    var urls = [], ure = /['"](https?:\/\/[^'"]+)['"]/g, um;
    while ((um = ure.exec(m[2])) !== null) { var n = normalizeUrl(um[1]); if (n && isAllowedHost(n) && urls.indexOf(n) === -1) urls.push(n); }
    if (urls.length > 0) results.push({ n: m[1], u: urls });
  }
  return results;
}

function fetchJs(slug, seasonPath, lang) {
  var url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  return fetch(url, { headers: { "User-Agent": UA, "Referer": BASE_URL + "/" } })
    .then(function(r) { return r.ok ? r.text() : null; })
    .catch(function() { return null; });
}

function tryOneSlug(slug, season, episode, isMovie) {
  var paths = isMovie ? ["film"] : ["saison" + season, ""];
  var langs = ["vostfr", "vf"];
  var all = [];
  for (var p = 0; p < paths.length; p++) {
    for (var l = 0; l < langs.length; l++) {
      (function(path, lang) {
        all.push(
          fetchJs(slug, path, lang).then(function(js) {
            if (!js) return [];
            var parsed = parseEpisodesJs(js);
            if (parsed.length === 0) return [];
            var best = null;
            for (var k = 0; k < parsed.length; k++) { if (parsed[k].u.length > 0) { best = parsed[k]; break; } }
            if (!best) best = parsed[0];
            if (best.u.length < episode) return [];
            var embedUrl = best.u[episode - 1];
            if (!embedUrl) return [];

            // Resolve embed URL to direct video URL
            return resolveStreamUrl(embedUrl).then(function(directUrl) {
              var finalUrl = directUrl || embedUrl;
              return [{
                name: "Anime-Sama",
                title: getPlayerName(embedUrl) + " - Ep " + episode + " - " + lang.toUpperCase(),
                url: finalUrl,
                quality: "HD",
                headers: { "Referer": BASE_URL + "/", "User-Agent": UA }
              }];
            });
          })
        );
      })(paths[p], langs[l]);
    }
  }
  return Promise.all(all).then(function(r) { var x = []; for (var i = 0; i < r.length; i++) x = x.concat(r[i]); return x; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var sn = season || 1, ep = episode || 1, isMovie = mediaType === "movie";
  return fetch("https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=439c478a771f35c05022f9feabcca01c&language=en-US")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var titles = [];
      if (d.name) titles.push(d.name);
      if (d.original_name && d.original_name !== d.name) titles.push(d.original_name);
      if (d.title && titles.indexOf(d.title) === -1) titles.push(d.title);
      var slugs = [];
      for (var t = 0; t < titles.length; t++) { var sg = slugify(titles[t]); if (sg && slugs.indexOf(sg) === -1) slugs.push(sg); }
      function nx(i) { if (i >= slugs.length) return []; return tryOneSlug(slugs[i], sn, ep, isMovie).then(function(s) { if (s.length > 0) return s; return nx(i + 1); }); }
      return nx(0);
    }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
