var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var REF = BASE_URL + "/";

function slugify(title) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function getPlayerName(url) {
  if (!url) return "Unknown";
  var u = url.toLowerCase();
  if (u.indexOf("sibnet") !== -1) return "Sibnet";
  if (u.indexOf("vidmoly") !== -1) return "Vidmoly";
  if (u.indexOf("sendvid") !== -1) return "Sendvid";
  if (u.indexOf("smoothpre") !== -1) return "Smoothpre";
  if (u.indexOf("oneupload") !== -1 || u.indexOf("uqload") !== -1) return "Uqload";
  return "Player";
}

function parseEpisodesJs(jsContent) {
  if (!jsContent) return [];
  var results = [];
  var varRegex = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
  var match;
  while ((match = varRegex.exec(jsContent)) !== null) {
    var varName = match[1];
    var urls = [];
    var urlRegex = /['"](https?:\/\/[^'"]+)['"]/g;
    var um;
    while ((um = urlRegex.exec(match[2])) !== null) {
      if (urls.indexOf(um[1]) === -1) urls.push(um[1]);
    }
    if (urls.length > 0) results.push({ varName: varName, urls: urls });
  }
  return results;
}

function fetchEpisodesJs(slug, seasonPath, lang) {
  var url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  return fetch(url, { headers: { "User-Agent": UA, "Referer": REF } })
    .then(function(r) { return r.ok ? r.text() : null; })
    .catch(function() { return null; });
}

function tryOneSlug(slug, season, episode) {
  var languages = ["vostfr", "vf"];
  var paths = ["saison" + season, ""];
  return Promise.all(languages.map(function(lang) {
    return Promise.all(paths.map(function(path) {
      return fetchEpisodesJs(slug, path, lang).then(function(js) {
        if (!js) return [];
        var parsed = parseEpisodesJs(js);
        var streams = [];
        for (var i = 0; i < parsed.length; i++) {
          var arr = parsed[i];
          if (arr.urls.length >= episode) {
            var url = arr.urls[episode - 1];
            if (url && url.indexOf("http") === 0) {
              streams.push({
                name: "Anime-Sama",
                title: getPlayerName(url) + " - Ep " + episode + " - " + lang.toUpperCase(),
                url: url,
                quality: "HD",
                headers: { "Referer": REF, "User-Agent": UA, "Origin": BASE_URL }
              });
            }
          }
        }
        return streams;
      });
    }));
  })).then(function(results) {
    var all = [];
    for (var i = 0; i < results.length; i++) {
      for (var j = 0; j < results[i].length; j++) {
        all = all.concat(results[i][j]);
      }
    }
    return all;
  });
}

function resolveSibnet(url) {
  return fetch(url, { headers: { "User-Agent": UA, "Referer": REF } })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      // Find video src in the player page
      var m = html.match(/src:\s*['"]([^'"]+)['"]/) 
           || html.match(/file:\s*['"]([^'"]+)['"]/)
           || html.match(/source\s+src=['"]([^'"]+)['"]/);
      return m ? m[1] : url;
    })
    .catch(function() { return url; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Anime-Sama] " + mediaType + "/" + tmdbId + " S" + season + "E" + episode);
  return fetch("https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=439c478a771f35c05022f9feabcca01c&language=en-US")
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var titles = [];
      if (data.name) titles.push(data.name);
      if (data.original_name && data.original_name !== data.name) titles.push(data.original_name);
      var slugs = [];
      for (var t = 0; t < titles.length; t++) {
        var s = slugify(titles[t]);
        if (s && slugs.indexOf(s) === -1) slugs.push(s);
      }
      function tryNext(index) {
        if (index >= slugs.length) return [];
        return tryOneSlug(slugs[index], season || 1, episode || 1).then(function(streams) {
          if (streams.length > 0) return streams;
          return tryNext(index + 1);
        });
      }
      return tryNext(0);
    })
    .catch(function(e) { return []; });
}

module.exports = { getStreams: getStreams };