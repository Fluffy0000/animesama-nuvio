/**
 * Anime-Sama Provider for Nuvio
 * Based on original scraper logic - 100% Hermes compatible
 */
var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

var ALLOWED_HOST_PATTERNS = [
  /(^|\.)vidmoly\./i,
  /(^|\.)oneupload\./i,
  /(^|\.)smoothpre\./i,
  /(^|\.)sibnet\./i,
  /(^|\.)sendvid\./i,
  /(^|\.)vk\.com$/i,
  /(^|\.)vkvideo\.ru$/i,
  /(^|\.)video\.sibnet\.ru$/i
];

var PREFERRED_HOSTS = ["vidmoly.biz", "video.sibnet.ru", "smoothpre.com"];

/* ------------------------------------------------------------------ */
/*  slugify - accent map (Hermes-safe, no normalize)                  */
/* ------------------------------------------------------------------ */
function slugify(title) {
  var MAP = {
    "à":"a","â":"a","ä":"a","á":"a","ã":"a","å":"a","æ":"ae",
    "ç":"c",
    "è":"e","é":"e","ê":"e","ë":"e",
    "ì":"i","î":"i","ï":"i","í":"i",
    "ñ":"n",
    "ò":"o","ô":"o","ö":"o","ó":"o","õ":"o","ø":"o",
    "ù":"u","û":"u","ü":"u","ú":"u",
    "ý":"y","ÿ":"y",
    "À":"a","Â":"a","Ä":"a","Á":"a","Ã":"a","Å":"a","Æ":"ae",
    "Ç":"c",
    "È":"e","É":"e","Ê":"e","Ë":"e",
    "Ì":"i","Î":"i","Ï":"i","Í":"i",
    "Ñ":"n",
    "Ò":"o","Ô":"o","Ö":"o","Ó":"o","Õ":"o","Ø":"o",
    "Ù":"u","Û":"u","Ü":"u","Ú":"u",
    "Ý":"y","Ÿ":"y",
    "ß":"ss"
  };
  var r = "";
  for (var i = 0; i < title.length; i++) {
    r += MAP[title[i]] || title[i];
  }
  return r
    .replace(/['\u2019]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Host filtering - same logic as original scraper                   */
/* ------------------------------------------------------------------ */
function isAllowedEmbedHost(url) {
  if (!url) return false;
  try {
    var hostname = (new URL(url)).hostname.toLowerCase();
    for (var i = 0; i < ALLOWED_HOST_PATTERNS.length; i++) {
      if (ALLOWED_HOST_PATTERNS[i].test(hostname)) return true;
    }
    return false;
  } catch (e) { return false; }
}

function looksLikeEmbedUrl(url) {
  if (!url) return false;
  try {
    var full = ((new URL(url)).hostname + (new URL(url)).pathname).toLowerCase();
    return full.indexOf("/embed") !== -1 ||
           full.indexOf("embed-") !== -1 ||
           full.indexOf("/shell.php") !== -1 ||
           full.indexOf("/e/") !== -1 ||
           full.indexOf("/v/") !== -1;
  } catch (e) { return false; }
}

function urlMentionedInSource(url, jsSource) {
  if (!url || !jsSource) return false;
  var candidates = [url];
  try {
    var u = new URL(url);
    if (u.hostname === "vidmoly.biz") {
      var a1 = new URL(url); a1.hostname = "vidmoly.to"; candidates.push(a1.toString());
      var a2 = new URL(url); a2.hostname = "vidmoly.net"; candidates.push(a2.toString());
    }
  } catch (e) {}
  for (var i = 0; i < candidates.length; i++) {
    if (jsSource.indexOf(candidates[i]) !== -1) return true;
  }
  return false;
}

function isPreferredHost(url) {
  if (!url) return false;
  try {
    var hn = (new URL(url)).hostname.toLowerCase();
    for (var i = 0; i < PREFERRED_HOSTS.length; i++) {
      if (PREFERRED_HOSTS[i] === hn) return true;
    }
    return false;
  } catch (e) { return false; }
}

function normalizeEmbedUrl(raw) {
  if (!raw) return "";
  try {
    var u = new URL(String(raw).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    var host = u.hostname.toLowerCase();
    if (host === "vidmoly.to" || host === "vidmoly.net") u.hostname = "vidmoly.biz";
    return u.toString();
  } catch (e) { return ""; }
}

/* ------------------------------------------------------------------ */
/*  Extract URL from episode entry - original logic                   */
/* ------------------------------------------------------------------ */
function extractUrlFromEpisodeEntry(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") {
    var s = entry.trim();
    var md = s.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/i);
    if (md) return md[1].trim();
    var dl = s.match(/https?:\/\/[^\s"'`)\]>]+/i);
    if (dl) return dl[0].trim();
    return "";
  }
  if (Array.isArray(entry)) {
    for (var i = 0; i < entry.length; i++) {
      var found = extractUrlFromEpisodeEntry(entry[i]);
      if (found) return found;
    }
    return "";
  }
  if (typeof entry === "object") {
    var keys = ["url", "src", "iframe", "embed", "link", "video"];
    for (var k = 0; k < keys.length; k++) {
      if (entry[keys[k]]) {
        var found = extractUrlFromEpisodeEntry(entry[keys[k]]);
        if (found) return found;
      }
    }
    var objKeys = Object.keys(entry);
    for (var j = 0; j < objKeys.length; j++) {
      var found = extractUrlFromEpisodeEntry(entry[objKeys[j]]);
      if (found) return found;
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Parse episodes.js - eval approach + regex fallback                */
/* ------------------------------------------------------------------ */
function extractEpisodeArraysFromJsSource(jsSource) {
  var arrays = [];
  if (!jsSource || jsSource.indexOf("eps1") === -1) return arrays;

  // Try eval approach (like original vm.runInContext)
  var captured = {};
  try {
    var fn = new Function(
      "var _captured = {};" +
      "var _g = (typeof globalThis !== 'undefined') ? globalThis : this;" +
      "try { eval(\"" + jsSource.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n") + "\"); } catch(_e) {}" +
      "for (var _k in _g) {" +
      "  if (/^eps\\d+$/.test(_k)) { try { _captured[_k] = _g[_k]; } catch(_e2) {} }" +
      "}" +
      "return _captured;"
    );
    captured = fn();
  } catch (e) {
    // Regex fallback
    return extractEpisodesWithRegex(jsSource);
  }

  var epsNames = Object.keys(captured).filter(function(k) { return /^eps\d+$/.test(k); });
  epsNames.sort(function(a, b) {
    return parseInt(a.replace("eps", ""), 10) - parseInt(b.replace("eps", ""), 10);
  });

  for (var i = 0; i < epsNames.length; i++) {
    var raw = captured[epsNames[i]];
    if (!Array.isArray(raw)) continue;

    var accepted = [];
    var rejected = [];

    raw.filter(function(e) { return e != null && e !== ""; }).forEach(function(entry, idx) {
      var extracted = extractUrlFromEpisodeEntry(entry);
      var normalized = normalizeEmbedUrl(extracted);
      var okHost = isAllowedEmbedHost(normalized);
      var okEmbed = looksLikeEmbedUrl(normalized);
      var okMention = urlMentionedInSource(normalized, jsSource);
      var okPreferred = isPreferredHost(normalized);

      var item = {
        index: idx + 1,
        raw: entry,
        url: normalized,
        flags: { okHost: okHost, okEmbed: okEmbed, okMention: okMention, okPreferred: okPreferred }
      };

      if (normalized && okHost && okEmbed && okMention && okPreferred) {
        accepted.push(item);
      } else {
        rejected.push(item);
      }
    });

    arrays.push({
      playerIndex: parseInt(epsNames[i].replace("eps", ""), 10),
      items: accepted,
      rejectedItems: rejected,
      length: accepted.length,
      rejectedCount: rejected.length
    });
  }

  return arrays;
}

function extractEpisodesWithRegex(jsSource) {
  var arrays = [];
  var urlRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)+(?:vidmoly\.\w+|sibnet\.\w+|smoothpre\.\w+|oneupload\.\w+|sendvid\.\w+|vk\.com|vkvideo\.ru)\/[^\s"')\]}>]+/gi;
  var urls = [];
  var seen = {};
  var match;
  while ((match = urlRegex.exec(jsSource)) !== null) {
    var normalized = normalizeEmbedUrl(match[0]);
    if (normalized && !seen[normalized] && isAllowedEmbedHost(normalized)) {
      seen[normalized] = true;
      urls.push({ index: urls.length + 1, url: normalized });
    }
  }
  if (urls.length > 0) {
    arrays.push({ playerIndex: 1, items: urls, rejectedItems: [], length: urls.length, rejectedCount: 0 });
  }
  return arrays;
}

/* ------------------------------------------------------------------ */
/*  getPlayerName                                                     */
/* ------------------------------------------------------------------ */
function getPlayerName(url) {
  if (!url) return "Unknown";
  var l = url.toLowerCase();
  if (l.indexOf("sibnet") !== -1) return "Sibnet";
  if (l.indexOf("vidmoly") !== -1) return "Vidmoly";
  if (l.indexOf("sendvid") !== -1) return "Sendvid";
  if (l.indexOf("smoothpre") !== -1) return "Smoothpre";
  if (l.indexOf("oneupload") !== -1 || l.indexOf("uqload") !== -1) return "Uqload";
  if (l.indexOf("voe") !== -1) return "Voe";
  if (l.indexOf("streamtape") !== -1 || l.indexOf("stape") !== -1) return "Streamtape";
  if (l.indexOf("dood") !== -1) return "Doodstream";
  return "Player";
}

/* ------------------------------------------------------------------ */
/*  Fetch episodes.js                                                 */
/* ------------------------------------------------------------------ */
function fetchEpisodesJs(slug, seasonPath, lang) {
  var url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  return fetch(url, { headers: { "User-Agent": UA, "Referer": BASE_URL + "/" } })
    .then(function(r) { return r.ok ? r.text() : null; })
    .catch(function() { return null; });
}

/* ------------------------------------------------------------------ */
/*  Try one slug × path × lang                                       */
/* ------------------------------------------------------------------ */
function tryOne(slug, path, lang, episode, jsSourceHolder) {
  return fetchEpisodesJs(slug, path, lang).then(function(jsSource) {
    if (!jsSource) return [];
    // Share jsSource for urlMentionedInSource check
    jsSourceHolder.src = jsSource;
    var epsArrays = extractEpisodeArraysFromJsSource(jsSource);
    if (epsArrays.length === 0) return [];

    // Use best array (first with items, like original scraper)
    var best = null;
    for (var i = 0; i < epsArrays.length; i++) {
      if (epsArrays[i].items.length > 0) { best = epsArrays[i]; break; }
    }
    if (!best) best = epsArrays[0];
    if (best.items.length < episode) return [];

    var item = best.items[episode - 1];
    if (!item || !item.url) return [];

    return [{
      name: "Anime-Sama",
      title: getPlayerName(item.url) + " - Ep " + episode + " - " + lang.toUpperCase(),
      url: item.url,
      quality: "HD",
      headers: { "Referer": BASE_URL + "/", "User-Agent": UA }
    }];
  });
}

/* ------------------------------------------------------------------ */
/*  tryOneSlug - all path×lang combos, prefers VOSTFR then VF        */
/* ------------------------------------------------------------------ */
function tryOneSlug(slug, season, episode) {
  var languages = ["vostfr", "vf"];
  var paths = ["saison" + season, ""];

  function tryAll(remaining) {
    if (remaining.length === 0) return Promise.resolve([]);
    var combo = remaining[0];
    var jsSourceHolder = {};
    return tryOne(slug, combo.path, combo.lang, episode, jsSourceHolder).then(function(streams) {
      if (streams.length > 0) return streams;
      return tryAll(remaining.slice(1));
    });
  }

  var combos = [];
  for (var i = 0; i < languages.length; i++) {
    for (var j = 0; j < paths.length; j++) {
      combos.push({ lang: languages[i], path: paths[j] });
    }
  }

  return tryAll(combos);
}

/* ------------------------------------------------------------------ */
/*  getStreams - MAIN ENTRY POINT (Nuvio API)                        */
/* ------------------------------------------------------------------ */
function getStreams(tmdbId, mediaType, season, episode) {
  var sn = season || 1;
  var ep = episode || 1;

  return fetch("https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=439c478a771f35c05022f9feabcca01c&language=en-US")
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var titles = [];
      if (data.name) titles.push(data.name);
      if (data.original_name && data.original_name !== data.name) titles.push(data.original_name);

      var slugs = [];
      for (var t = 0; t < titles.length; t++) {
        var sg = slugify(titles[t]);
        if (sg && slugs.indexOf(sg) === -1) slugs.push(sg);
      }

      function tryNext(idx) {
        if (idx >= slugs.length) return [];
        return tryOneSlug(slugs[idx], sn, ep).then(function(streams) {
          if (streams.length > 0) return streams;
          return tryNext(idx + 1);
        });
      }

      return tryNext(0);
    })
    .catch(function(e) { return []; });
}

module.exports = { getStreams: getStreams };
