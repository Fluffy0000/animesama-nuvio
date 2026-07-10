/* yablom - built 2026-07-10T13:48:24.987Z */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/yablom/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/yablom/http.js
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var ORIGIN = "https://yablom.com";
var SITE_TAG = "yablom";
var DEFAULT_FOLDER = "euvcw7";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
function safeSetTimeout(fn, ms) {
  try {
    if (typeof setTimeout === "function") return setTimeout(fn, ms);
  } catch (e) {
  }
  return null;
}
function safeClearTimeout(id) {
  try {
    if (id !== null && typeof clearTimeout === "function") clearTimeout(id);
  } catch (e) {
  }
}
function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9e3;
  var ctrl = null, tid = null;
  try {
    ctrl = new AbortController();
  } catch (e) {
  }
  if (ctrl) tid = safeSetTimeout(function() {
    try {
      ctrl.abort();
    } catch (e) {
    }
  }, timeoutMs);
  var headers = options.headers || {};
  if (!headers["User-Agent"] && !headers["user-agent"]) headers["User-Agent"] = USER_AGENT;
  if (!headers["Accept"] && !headers["accept"]) headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!headers["Accept-Language"] && !headers["accept-language"]) headers["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  if (!headers["Accept-Encoding"] && !headers["accept-encoding"]) headers["Accept-Encoding"] = "identity";
  if (!headers["Cookie"] && !headers["cookie"]) headers["Cookie"] = "g=true";
  var opts = { method: options.method || "GET", headers };
  if (options.body !== void 0) opts.body = options.body;
  if (ctrl) opts.signal = ctrl.signal;
  var p;
  try {
    p = fetch(url, opts);
  } catch (e) {
    safeClearTimeout(tid);
    return Promise.resolve(null);
  }
  return p.then(function(r) {
    safeClearTimeout(tid);
    return r;
  }).catch(function() {
    safeClearTimeout(tid);
    return null;
  });
}
function fetchText(url, o, t) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, o, t);
    if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "err"));
    return r.text();
  });
}
function fetchJson(url, o, t) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, o, t);
    if (!r || !r.ok) return null;
    try {
      return JSON.parse(yield r.text());
    } catch (e) {
      return null;
    }
  });
}
var ACCENT_MAP = {
  "\xE0": "a",
  "\xE1": "a",
  "\xE2": "a",
  "\xE4": "a",
  "\xE3": "a",
  "\xE5": "a",
  "\xE9": "e",
  "\xE8": "e",
  "\xEA": "e",
  "\xEB": "e",
  "\xED": "i",
  "\xEC": "i",
  "\xEE": "i",
  "\xEF": "i",
  "\xF3": "o",
  "\xF2": "o",
  "\xF4": "o",
  "\xF6": "o",
  "\xF5": "o",
  "\xFA": "u",
  "\xF9": "u",
  "\xFB": "u",
  "\xFC": "u",
  "\xE7": "c",
  "\xF1": "n",
  "\u0153": "oe",
  "\xE6": "ae",
  "\xDF": "ss",
  "\xFD": "y",
  "\xFF": "y"
};
function stripAccents(s) {
  try {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch (e) {
    var o = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      o += ACCENT_MAP[c] || ACCENT_MAP[c.toLowerCase()] || c;
    }
    return o;
  }
}
function slugify(t) {
  return stripAccents(String(t).toLowerCase()).replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
var cachedFolder = null;
function folderWorks(folder) {
  return __async(this, null, function* () {
    var j = yield fetchJson(ORIGIN + "/" + folder + "/api_search.php?searchword=a", {}, 8e3);
    return !!(j && j.films && typeof j.films.length === "number");
  });
}
function resolveFolder() {
  return __async(this, null, function* () {
    if (cachedFolder) return cachedFolder;
    if (yield folderWorks(DEFAULT_FOLDER)) {
      cachedFolder = DEFAULT_FOLDER;
      return cachedFolder;
    }
    try {
      var html = yield fetchText(ORIGIN + "/", {}, 8e3);
      var seen = {}, cands = [], re = /href="\/?([a-zA-Z0-9]{4,12})"/g, m;
      while ((m = re.exec(html)) !== null) {
        var tok = m[1];
        if (!seen[tok]) {
          seen[tok] = true;
          cands.push(tok);
        }
      }
      for (var i = 0; i < cands.length; i++) {
        if (yield folderWorks(cands[i])) {
          cachedFolder = cands[i];
          return cachedFolder;
        }
      }
    } catch (e) {
    }
    cachedFolder = DEFAULT_FOLDER;
    return cachedFolder;
  });
}
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var kind = mediaType === "tv" ? "tv" : "movie";
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
      var d = yield fetchJson(urls[i], {}, 9e3);
      if (!d) continue;
      if (!year) {
        var rd = d.release_date || d.first_air_date || "";
        var ym = /^(\d{4})/.exec(rd);
        if (ym) year = ym[1];
      }
      add(d.title);
      add(d.name);
      add(d.original_title);
      add(d.original_name);
    }
    return { titles: out, year };
  });
}
function searchFilms(folder, query) {
  return __async(this, null, function* () {
    var url = ORIGIN + "/" + folder + "/api_search.php?searchword=" + encodeURIComponent(query);
    var j = yield fetchJson(url, {}, 9e3);
    if (!j || !j.films) return [];
    var out = [];
    for (var i = 0; i < j.films.length; i++) {
      var f = j.films[i];
      if (!f) continue;
      var linkId = "";
      if (f.link) {
        var lm = /(\d+)\s*$/.exec(String(f.link));
        if (lm) linkId = lm[1];
      }
      if (!linkId) continue;
      var ym = /\((\d{4})\)/.exec(String(f.title || ""));
      out.push({
        id: linkId,
        title: String(f.title || ""),
        poster: f.poster || "",
        vostfr: !!f.vostfr,
        year: ym ? ym[1] : null
      });
    }
    return out;
  });
}
function fetchEmbedUrl(folder, linkId) {
  return __async(this, null, function* () {
    var url = ORIGIN + "/" + folder + "/b/" + SITE_TAG + "/" + linkId;
    var html;
    try {
      html = yield fetchText(url, {}, 1e4);
    } catch (e) {
      return null;
    }
    var m = /src="(https?:\/\/[a-z0-9.-]+\/iframe\/[A-Za-z0-9]+)"/i.exec(html);
    if (m) return m[1];
    var g = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    return g ? g[1] : null;
  });
}

// src/yablom/extractor.js
function findVideoUrl(text) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text);
  if (e) return e[0].replace(/\\\//g, "/");
  e = /https?:\\\/\\\/[^\s"']*?\.mp4[^\s"']*/i.exec(text);
  if (e) return e[0].replace(/\\\//g, "/");
  return null;
}
function refererFromMediaUrl(mediaUrl) {
  var hm = /^https?:\/\/([^/]+)/i.exec(mediaUrl);
  if (!hm) return null;
  var host = hm[1];
  var parts = host.split(".");
  var reg = parts.length >= 2 ? parts.slice(parts.length - 2).join(".") : host;
  return "https://" + reg + "/";
}
function resolveEmbed(embedUrl) {
  return __async(this, null, function* () {
    var media = null;
    for (var attempt = 0; attempt < 2 && !media; attempt++) {
      media = yield resolveOnce(embedUrl);
    }
    if (!media) return null;
    var referer = refererFromMediaUrl(media) || "https://sharecloudy.com/";
    return { url: media, referer };
  });
}
function resolveOnce(embedUrl) {
  return __async(this, null, function* () {
    var r = yield safeFetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://yablom.com/" } }, 12e3);
    if (!r || !r.ok) return null;
    var html;
    try {
      html = yield r.text();
    } catch (e) {
      return null;
    }
    var media = findVideoUrl(html);
    if (!media) {
      var fm = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
      if (fm) {
        var r2 = yield safeFetch(fm[1], { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } }, 12e3);
        if (r2 && r2.ok) {
          try {
            media = findVideoUrl(yield r2.text());
          } catch (e) {
          }
        }
      }
    }
    return media || null;
  });
}

// src/yablom/index.js
function siteSlug(title) {
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, ""));
}
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
    if (tmdbYear && film.year) base += tmdbYear === film.year ? 15 : -25;
    if (base > best) best = base;
  }
  return best;
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      if (mediaType === "tv") return [];
      var info = yield getTmdbInfo(tmdbId, mediaType);
      if (!info.titles.length) return [];
      var candSlugs = info.titles.map(slugify);
      var folder = yield resolveFolder();
      var queries = buildQueries(info.titles);
      var byId = {}, done = false;
      for (var i = 0; i < queries.length && !done; i++) {
        var films = yield searchFilms(folder, queries[i]);
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
        if (sc > bestScore) {
          bestScore = sc;
          best = byId[id];
        }
      }
      if (!best || bestScore < 90) return [];
      var embed = yield fetchEmbedUrl(folder, best.id);
      if (!embed) return [];
      var res = yield resolveEmbed(embed);
      if (!res || !res.url) return [];
      var lang = best.vostfr ? "VOSTFR" : "VF";
      var flag = best.vostfr ? "\u{1F1EF}\u{1F1F5}" : "\u{1F1EB}\u{1F1F7}";
      var kind = /\.m3u8/i.test(res.url) ? "HLS" : "MP4";
      var stream = {
        name: flag + " Sharecloudy \xB7 " + lang + " \xB7 " + kind,
        title: best.title + " \xB7 " + lang,
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
  });
}
