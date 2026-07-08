/**
 * Anime-Sama Provider for Nuvio
 * 100% Hermes-compatible - no async/await, no normalize(), no import/export
 * Exports: getStreams(tmdbId, mediaType, season, episode) → Promise<Array>
 */
var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var REF = BASE_URL + "/";

/* ------------------------------------------------------------------ */
/*  slugify - Hermes-safe (no normalize)                              */
/* ------------------------------------------------------------------ */
function slugify(t) {
  var MAP = {
    "à": "a", "â": "a", "ä": "a", "á": "a", "ã": "a", "å": "a", "æ": "ae",
    "ç": "c",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "ì": "i", "î": "i", "ï": "i", "í": "i",
    "ñ": "n",
    "ò": "o", "ô": "o", "ö": "o", "ó": "o", "õ": "o", "ø": "o",
    "ù": "u", "û": "u", "ü": "u", "ú": "u",
    "ý": "y", "ÿ": "y",
    "À": "a", "Â": "a", "Ä": "a", "Á": "a", "Ã": "a", "Å": "a", "Æ": "ae",
    "Ç": "c",
    "È": "e", "É": "e", "Ê": "e", "Ë": "e",
    "Ì": "i", "Î": "i", "Ï": "i", "Í": "i",
    "Ñ": "n",
    "Ò": "o", "Ô": "o", "Ö": "o", "Ó": "o", "Õ": "o", "Ø": "o",
    "Ù": "u", "Û": "u", "Ü": "u", "Ú": "u",
    "Ý": "y", "Ÿ": "y",
    "ß": "ss"
  };
  var r = "";
  for (var i = 0; i < t.length; i++) {
    r += MAP[t[i]] || t[i];
  }
  return r
    .replace(/['\u2019]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  getPlayerName                                                     */
/* ------------------------------------------------------------------ */
function getPlayerName(u) {
  if (!u) return "Unknown";
  var l = u.toLowerCase();
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
/*  parseEpisodesJs - extract URLs from episodes.js                   */
/* ------------------------------------------------------------------ */
function parseEpisodesJs(c) {
  if (!c) return [];
  var results = [];
  var re = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
  var m;
  while ((m = re.exec(c)) !== null) {
    var name = m[1];
    var body = m[2];
    var urls = [];
    var ure = /['"](https?:\/\/[^'"]+)['"]/g;
    var um;
    while ((um = ure.exec(body)) !== null) {
      if (urls.indexOf(um[1]) === -1) {
        urls.push(um[1]);
      }
    }
    if (urls.length > 0) {
      results.push({ n: name, u: urls });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  fetchEpisodesJs                                                   */
/* ------------------------------------------------------------------ */
function fetchEpisodesJs(slug, seasonPath, lang) {
  var url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  return fetch(url, {
    headers: { "User-Agent": UA, "Referer": REF }
  })
    .then(function (r) {
      return r.ok ? r.text() : null;
    })
    .catch(function () {
      return null;
    });
}

/* ------------------------------------------------------------------ */
/*  tryOneSlug - all path×lang combos for one slug                    */
/* ------------------------------------------------------------------ */
function tryOneSlug(slug, season, episode) {
  var languages = ["vostfr", "vf"];
  var paths = ["saison" + season, ""];

  var promises = [];
  for (var i = 0; i < languages.length; i++) {
    for (var j = 0; j < paths.length; j++) {
      (function (lang, path) {
        promises.push(
          fetchEpisodesJs(slug, path, lang).then(function (js) {
            if (!js) return [];
            var parsed = parseEpisodesJs(js);
            var streams = [];
            for (var k = 0; k < parsed.length; k++) {
              var urls = parsed[k].u;
              if (urls.length >= episode) {
                var u = urls[episode - 1];
                if (u && u.indexOf("http") === 0) {
                  streams.push({
                    name: "Anime-Sama",
                    title: getPlayerName(u) + " - Ep " + episode + " - " + lang.toUpperCase(),
                    url: u,
                    quality: "HD",
                    headers: { "Referer": REF, "User-Agent": UA }
                  });
                }
              }
            }
            return streams;
          })
        );
      })(languages[i], paths[j]);
    }
  }

  return Promise.all(promises).then(function (results) {
    var all = [];
    for (var i = 0; i < results.length; i++) {
      for (var j = 0; j < results[i].length; j++) {
        all.push(results[i][j]);
      }
    }
    return all;
  });
}

/* ------------------------------------------------------------------ */
/*  getStreams - MAIN ENTRY POINT                                     */
/* ------------------------------------------------------------------ */
function getStreams(tmdbId, mediaType, season, episode) {
  var apiUrl =
    "https://api.themoviedb.org/3/" +
    mediaType +
    "/" +
    tmdbId +
    "?api_key=439c478a771f35c05022f9feabcca01c&language=en-US";

  return fetch(apiUrl)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var titles = [];
      if (data.name) titles.push(data.name);
      if (data.original_name && data.original_name !== data.name) {
        titles.push(data.original_name);
      }

      var slugs = [];
      for (var t = 0; t < titles.length; t++) {
        var sg = slugify(titles[t]);
        if (sg && slugs.indexOf(sg) === -1) {
          slugs.push(sg);
        }
      }

      var sn = season || 1;
      var ep = episode || 1;

      function tryNext(idx) {
        if (idx >= slugs.length) return Promise.resolve([]);
        return tryOneSlug(slugs[idx], sn, ep).then(function (streams) {
          if (streams.length > 0) return streams;
          return tryNext(idx + 1);
        });
      }

      return tryNext(0);
    })
    .catch(function (e) {
      return [];
    });
}

module.exports = { getStreams: getStreams };
