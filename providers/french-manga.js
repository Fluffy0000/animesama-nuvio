/* french-manga - isOk fix 2026-07-10T14:16:38.482Z */
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

// src/french-manga/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/french-manga/http.js
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var ROOT_REDIRECT = "https://french-manga.net/";
var FALLBACK_HOSTS = [
  "https://w16.french-manga.net",
  "https://w17.french-manga.net",
  "https://w15.french-manga.net",
  "https://w18.french-manga.net",
  "https://w14.french-manga.net",
  "https://w19.french-manga.net",
  "https://w20.french-manga.net",
  "https://w13.french-manga.net"
];
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
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
function sleep(ms) {
  return new Promise(function(res) {
    try {
      if (typeof setTimeout === "function") {
        setTimeout(res, ms);
        return;
      }
    } catch (e) {
    }
    res();
  });
}
function withDefaultHeaders(h) {
  h = h || {};
  if (!h["User-Agent"] && !h["user-agent"]) h["User-Agent"] = USER_AGENT;
  if (!h["Accept"] && !h["accept"]) h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!h["Accept-Language"] && !h["accept-language"]) h["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  if (!h["Accept-Encoding"] && !h["accept-encoding"]) h["Accept-Encoding"] = "identity";
  return h;
}
function fetchOnce(url, options, opts, timeoutMs) {
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
  var o = { method: opts.method, headers: opts.headers, redirect: options.redirect || "follow" };
  if (opts.body !== void 0) o.body = opts.body;
  if (ctrl) o.signal = ctrl.signal;
  var p;
  try {
    p = fetch(url, o);
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
function safeFetch(url, options, timeoutMs) {
  return __async(this, null, function* () {
    if (!options) options = {};
    if (!timeoutMs) timeoutMs = 9e3;
    var opts = { method: options.method || "GET", headers: withDefaultHeaders(options.headers), body: options.body };
    var delays = [700, 2e3];
    var r = null;
    for (var attempt = 0; attempt <= delays.length; attempt++) {
      r = yield fetchOnce(url, options, opts, timeoutMs);
      if (isOk(r)) return r;
      if (r && r.status >= 400 && r.status < 500 && r.status !== 429) return r;
      if (attempt < delays.length) yield sleep(delays[attempt]);
    }
    return r;
  });
}
function isOk(r) {
  if (!r) return false;
  if (typeof r.ok === "boolean") return r.ok;
  if (typeof r.status === "number" && r.status > 0) return r.status >= 200 && r.status < 400;
  return true;
}
function fetchText(url, options, timeoutMs) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, options, timeoutMs);
    if (!isOk(r)) throw new Error("HTTP " + (r ? r.status : "err"));
    return r.text();
  });
}
function fetchJson(url, options, timeoutMs) {
  return __async(this, null, function* () {
    var txt = yield fetchText(url, options, timeoutMs);
    return JSON.parse(txt);
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
  "\xFD": "y",
  "\xFF": "y",
  "\u0153": "oe",
  "\xE6": "ae",
  "\xDF": "ss"
};
function stripAccents(s) {
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += ACCENT_MAP[c] || (ACCENT_MAP[c.toLowerCase()] ? ACCENT_MAP[c.toLowerCase()] : c);
    }
    return out;
  }
}
function slugify(t) {
  return stripAccents(String(t).toLowerCase()).replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
var cachedBase = null;
function probeHost(base) {
  return __async(this, null, function* () {
    var r = yield safeFetch(base + "/", { method: "GET" }, 6e3);
    if (!isOk(r)) return false;
    try {
      var html = yield r.text();
      return html.indexOf("french-manga") !== -1 || html.indexOf("engine/ajax") !== -1;
    } catch (e) {
      return false;
    }
  });
}
function resolveBase() {
  return __async(this, null, function* () {
    if (cachedBase) return cachedBase;
    var candidates = [];
    var seen = {};
    var r = yield safeFetch(ROOT_REDIRECT, { method: "GET" }, 7e3);
    if (r && r.url) {
      var m = /\/\/([a-z0-9-]+\.french-manga\.net)/i.exec(r.url);
      if (m) {
        var h = "https://" + m[1];
        if (!seen[h]) {
          seen[h] = true;
          candidates.push(h);
        }
      }
    }
    for (var i = 0; i < FALLBACK_HOSTS.length; i++) {
      if (!seen[FALLBACK_HOSTS[i]]) {
        seen[FALLBACK_HOSTS[i]] = true;
        candidates.push(FALLBACK_HOSTS[i]);
      }
    }
    for (var j = 0; j < candidates.length; j++) {
      if (yield probeHost(candidates[j])) {
        cachedBase = candidates[j];
        return cachedBase;
      }
    }
    cachedBase = FALLBACK_HOSTS[0];
    return cachedBase;
  });
}
function liveSearch(base, query) {
  return __async(this, null, function* () {
    var body = "query=" + encodeURIComponent(query) + "&page=1";
    var html;
    try {
      html = yield fetchText(base + "/engine/ajax/search.php", {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": base + "/"
        },
        body
      }, 12e3);
    } catch (e) {
      return [];
    }
    var out = [];
    var re = /location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g;
    var m;
    while ((m = re.exec(html)) !== null) {
      out.push({ newsId: m[1], title: decodeEntities(m[2]).trim() });
    }
    return out;
  });
}
function getSeasons(base, newsId, tag, titleBase) {
  return __async(this, null, function* () {
    var qs = "serie_tag=" + encodeURIComponent(tag || "") + "&news_id=" + encodeURIComponent(newsId) + "&title_base=" + encodeURIComponent(titleBase || "");
    try {
      var arr = yield fetchJson(base + "/engine/ajax/get_seasons.php?" + qs, {
        headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId }
      }, 12e3);
      if (arr && arr.length) return arr;
    } catch (e) {
    }
    return [];
  });
}
function fetchStoryMeta(base, newsId) {
  return __async(this, null, function* () {
    var html;
    try {
      html = yield fetchText(base + "/index.php?newsid=" + newsId, {
        headers: { "User-Agent": USER_AGENT, "Referer": base + "/" }
      }, 12e3);
    } catch (e) {
      return { tagz: "", title: "" };
    }
    var tagz = "";
    var t = /data-tagz="([^"]*)"/i.exec(html);
    if (t) tagz = decodeEntities(t[1]);
    var title = "";
    var tt = /id="manga-data"[\s\S]{0,600}?data-title="([^"]*)"/i.exec(html);
    if (!tt) tt = /data-title="([^"]*)"/i.exec(html);
    if (tt) title = decodeEntities(tt[1]);
    return { tagz, title };
  });
}
function fetchEpisodes(base, newsId) {
  return __async(this, null, function* () {
    try {
      return yield fetchJson(base + "/engine/ajax/manga_episodes_api.php?id=" + newsId, {
        headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId }
      }, 12e3);
    } catch (e) {
      return null;
    }
  });
}
function decodeEntities(s) {
  if (!s) return "";
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&eacute;/g, "\xE9").replace(/&egrave;/g, "\xE8").replace(/&agrave;/g, "\xE0").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// src/french-manga/extractor.js
function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10);
  var c = parseInt(m[3], 10);
  var k = m[4].split("|");
  if (a > 62) return "";
  while (c--) {
    if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
  }
  return p;
}
function resolveRelative(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf("//") === 0) return "https:" + rel;
  if (rel.charAt(0) === "/") {
    var m = /^(https?:\/\/[^/]+)/i.exec(base);
    return m ? m[1] + rel : rel;
  }
  var q = base.indexOf("?");
  var clean = q >= 0 ? base.slice(0, q) : base;
  return clean.slice(0, clean.lastIndexOf("/") + 1) + rel;
}
function originOf(url) {
  var m = /^(https?:\/\/[^/]+)/i.exec(url);
  return m ? m[1] : url;
}
function findVideoUrl(text) {
  if (!text) return null;
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"'\\)]*?\.m3u8[^\s"']*/i.exec(text);
  if (e) return e[0].replace(/\\\//g, "/");
  return null;
}
function resolveHost(hostKey, embedUrl) {
  return __async(this, null, function* () {
    var origin = originOf(embedUrl);
    var referer = origin + "/";
    var html;
    var r = yield safeFetch(embedUrl, {
      headers: { "User-Agent": USER_AGENT, "Referer": referer, "Accept": "*/*" }
    }, 12e3);
    if (!isOk(r)) return null;
    if (r.url) {
      var fo = originOf(r.url);
      if (/^https?:\/\//i.test(fo)) {
        origin = fo;
        referer = origin + "/";
      }
    }
    try {
      html = yield r.text();
    } catch (e) {
      return null;
    }
    var unpacked = unpackPacked(html);
    var searchIn = unpacked && unpacked.length ? unpacked : html;
    var video = findVideoUrl(searchIn);
    if (!video) video = findVideoUrl(html);
    if (!video) return null;
    var externalSubs = [];
    var vtt = /https?:\/\/[^\s"'\\)]+\.vtt[^\s"'\\)]*/i.exec(searchIn) || /https?:\/\/[^\s"'\\)]+\.vtt[^\s"'\\)]*/i.exec(html);
    if (vtt) externalSubs.push({ url: vtt[0], lang: "fr", language: "Fran\xE7ais" });
    var kind = /\.m3u8/i.test(video) ? "hls" : "mp4";
    return { masterUrl: video, referer, kind, externalSubs };
  });
}
function qualityFromHeight(h) {
  if (!h) return "";
  if (h >= 2160) return "2160p";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 540) return "540p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  return h + "p";
}
function codecLabel(codecs) {
  if (!codecs) return "";
  if (/hvc1|hev1/i.test(codecs)) return "H.265";
  if (/av01/i.test(codecs)) return "AV1";
  if (/avc1/i.test(codecs)) return "H.264";
  return "";
}
function explodeHls(masterUrl, referer) {
  return __async(this, null, function* () {
    var text;
    try {
      text = yield fetchText(masterUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer, "Accept": "*/*" }
      }, 12e3);
    } catch (e) {
      return [];
    }
    if (text.indexOf("#EXT") < 0) return [];
    var hasSubs = /#EXT-X-MEDIA:[^\n]*TYPE=SUBTITLES/i.test(text);
    var variants = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
        var res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
        var cod = /CODECS="([^"]*)"/i.exec(line);
        var height = res ? parseInt(res[2], 10) : 0;
        var url = "";
        for (var j = i + 1; j < lines.length; j++) {
          var u = lines[j].trim();
          if (!u || u.charAt(0) === "#") continue;
          url = u;
          i = j;
          break;
        }
        if (url) {
          variants.push({
            url: resolveRelative(masterUrl, url),
            height,
            quality: qualityFromHeight(height),
            codec: codecLabel(cod ? cod[1] : "")
          });
        }
      }
    }
    if (hasSubs && variants.length >= 1) {
      var best = variants[0];
      for (var v = 1; v < variants.length; v++) if (variants[v].height > best.height) best = variants[v];
      return [{ url: masterUrl, quality: best.quality, height: best.height, codec: best.codec, hasSubs: true }];
    }
    if (variants.length >= 2) {
      variants.sort(function(a, b) {
        return b.height - a.height;
      });
      return variants.map(function(v2) {
        return { url: v2.url, quality: v2.quality, height: v2.height, codec: v2.codec, hasSubs: false };
      });
    }
    if (variants.length === 1) {
      var only = variants[0];
      return [{ url: only.url, quality: only.quality, height: only.height, codec: only.codec, hasSubs: false }];
    }
    if (/#EXTINF/i.test(text)) {
      return [{ url: masterUrl, quality: "", height: 0, codec: "", hasSubs: false }];
    }
    return [];
  });
}
function mp4Alive(url, referer) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, "Referer": referer, "Range": "bytes=0-1" }
      }, 9e3);
      if (!r) return true;
      if (r.status === 403 || r.status === 404 || r.status === 410 || r.status >= 500) return false;
      return true;
    } catch (e) {
      return true;
    }
  });
}

// src/french-manga/index.js
var LOG = "[French-Manga]";
function getTmdbTitles(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var titles = [];
    function add(t2) {
      if (t2 && typeof t2 === "string" && t2.trim()) titles.push(t2.trim());
    }
    var langs = ["en-US", "fr-FR"];
    for (var i = 0; i < langs.length; i++) {
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + langs[i] + "&append_to_response=alternative_titles";
      var j = null;
      try {
        j = yield fetchJson(url, { headers: { "User-Agent": USER_AGENT } }, 1e4);
      } catch (e) {
        j = null;
      }
      if (!j) continue;
      add(j.name);
      add(j.title);
      add(j.original_name);
      add(j.original_title);
      var alt = j.alternative_titles;
      var list = alt ? alt.results || alt.titles || [] : [];
      for (var a = 0; a < list.length; a++) {
        var iso = list[a].iso_3166_1 || "";
        if (iso === "FR" || iso === "US" || iso === "GB" || iso === "JP" || iso === "") add(list[a].title);
      }
    }
    var seen = {}, latin = [], other = [];
    for (var k = 0; k < titles.length; k++) {
      var t = titles[k];
      var key = t.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      if (slugify(t).length > 0) latin.push(t);
      else other.push(t);
    }
    return latin.concat(other);
  });
}
function parseCandidateTitle(title) {
  var yearM = /\((\d{4})\)/.exec(title);
  var year = yearM ? yearM[1] : "";
  var t = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  var isMovie = /\b(movie|film)\b/i.test(t) || /[-\u2013]\s*the\s*movie/i.test(t);
  var seasonM = /saison\s*(\d+)/i.exec(t);
  var season = seasonM ? parseInt(seasonM[1], 10) : null;
  var base = t.replace(/[-\u2013]\s*saison\s*\d+.*$/i, "").replace(/[-\u2013]?\s*the\s*movie\s*[-\u2013]?.*$/i, "").replace(/[-\u2013]\s*(movie|film)\b.*$/i, "").trim();
  return { base, season: isMovie ? 999 : season === null ? 1 : season, isMovie, year };
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
function gatherCandidates(base, titles) {
  return __async(this, null, function* () {
    var cands = [];
    var seen = {};
    var maxQueries = Math.min(titles.length, 3);
    for (var i = 0; i < maxQueries; i++) {
      var items = yield liveSearch(base, titles[i]);
      for (var j = 0; j < items.length; j++) {
        if (seen[items[j].newsId]) continue;
        seen[items[j].newsId] = true;
        cands.push({ newsId: items[j].newsId, title: items[j].title, parsed: parseCandidateTitle(items[j].title) });
      }
      var strong = false;
      for (var c = 0; c < cands.length; c++) if (matchScore(cands[c].parsed.base, titles) >= 2) {
        strong = true;
        break;
      }
      if (strong && cands.length >= 2) break;
    }
    return cands;
  });
}
function mergeSeasons(base, seed, titles) {
  return __async(this, null, function* () {
    var meta = yield fetchStoryMeta(base, seed.newsId);
    var titleBase = (meta.title || seed.title).replace(/[-\u2013]\s*saison\s*\d+.*$/i, "").trim();
    var arr = yield getSeasons(base, seed.newsId, meta.tagz, titleBase);
    var list = [{
      newsId: seed.newsId,
      season: seed.parsed.season,
      isMovie: seed.parsed.isMovie,
      title: seed.title
    }];
    var seen = {};
    seen[seed.newsId] = true;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || !e.id || seen[e.id]) continue;
      seen[e.id] = true;
      var sn = e.season_number;
      var isMovie = sn === 999 || /\b(movie|film)\b/i.test(e.title || "");
      list.push({ newsId: String(e.id), season: isMovie ? 999 : sn || 1, isMovie, title: e.title || "" });
    }
    return list;
  });
}
function findTargetNewsId(base, titles, mediaType, season) {
  return __async(this, null, function* () {
    var cands = yield gatherCandidates(base, titles);
    if (cands.length === 0) return null;
    var scored = [];
    for (var i = 0; i < cands.length; i++) {
      var sc = matchScore(cands[i].parsed.base, titles);
      if (sc > 0) {
        cands[i].score = sc;
        scored.push(cands[i]);
      }
    }
    if (scored.length === 0) return null;
    scored.sort(function(a, b) {
      return b.score - a.score;
    });
    if (mediaType === "movie") {
      var movies = scored.filter(function(c) {
        return c.parsed.isMovie;
      });
      if (movies.length) return pickBestMovie(movies, titles).newsId;
      var merged = yield mergeSeasons(base, scored[0], titles);
      var mv = merged.filter(function(c) {
        return c.isMovie;
      });
      if (mv.length) return pickBestMovie(mv, titles).newsId;
      return scored[0].newsId;
    }
    var exact = scored.filter(function(c) {
      return !c.parsed.isMovie && c.parsed.season === season;
    });
    if (exact.length) return exact[0].newsId;
    var seed = null;
    for (var s = 0; s < scored.length; s++) if (!scored[s].parsed.isMovie) {
      seed = scored[s];
      break;
    }
    if (!seed) seed = scored[0];
    var full = yield mergeSeasons(base, seed, titles);
    var hit = null;
    for (var f = 0; f < full.length; f++) if (!full[f].isMovie && full[f].season === season) {
      hit = full[f];
      break;
    }
    if (hit) return hit.newsId;
    if (season === 1) return seed.newsId;
    return null;
  });
}
function pickBestMovie(movies, titles) {
  var best = movies[0];
  var bestScore = -1;
  for (var i = 0; i < movies.length; i++) {
    var b = movies[i].parsed ? movies[i].parsed.base : movies[i].title || "";
    var sc = matchScore(b, titles);
    if (sc > bestScore) {
      bestScore = sc;
      best = movies[i];
    }
  }
  return best;
}
function hostDisplayName(hostKey, url) {
  if (/vidzy/i.test(url) || hostKey === "vidzy") return "Vidzy";
  if (/luluvdo|luluvid|luluvdoo|lulustream|vidhsareup|tnmr/i.test(url) || hostKey === "luluvid") return "Luluvdo";
  var m = /^https?:\/\/([^/]+)/i.exec(url);
  if (m) {
    var h = m[1].replace(/^www\./, "").split(".")[0];
    return h.charAt(0).toUpperCase() + h.slice(1);
  }
  return hostKey || "Player";
}
function runBatched(items, worker, size) {
  return __async(this, null, function* () {
    var out = [];
    for (var i = 0; i < items.length; i += size) {
      var slice = items.slice(i, i + size);
      var res = yield Promise.all(slice.map(worker));
      for (var j = 0; j < res.length; j++) if (res[j]) out.push(res[j]);
    }
    return out;
  });
}
function buildStreamsForHost(job) {
  return __async(this, null, function* () {
    var resolved = yield resolveHost(job.hostKey, job.embedUrl);
    if (!resolved) return null;
    var display = hostDisplayName(job.hostKey, job.embedUrl);
    var langLabel = job.lang === "vf" ? "VF" : "VOSTFR";
    var flag = job.lang === "vf" ? "\u{1F1EB}\u{1F1F7}" : "\u{1F1EF}\u{1F1F5}";
    if (resolved.kind === "hls") {
      var variants = yield explodeHls(resolved.masterUrl, resolved.referer);
      if (!variants.length) return null;
      return variants.map(function(v) {
        var parts = [display];
        if (v.quality) parts.push(v.quality);
        if (v.codec && v.codec !== "H.264") parts.push(v.codec);
        parts.push(langLabel);
        var s = {
          name: flag + " " + parts.join(" \xB7 "),
          title: display + " \xB7 " + (v.quality || "HD") + " \xB7 " + langLabel + " \xB7 Ep " + job.episode,
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
    var alive = yield mp4Alive(resolved.masterUrl, resolved.referer);
    if (!alive) return null;
    var one = {
      name: flag + " " + display + " \xB7 MP4 \xB7 " + langLabel,
      title: display + " \xB7 MP4 \xB7 " + langLabel + " \xB7 Ep " + job.episode,
      url: resolved.masterUrl,
      quality: "HD",
      language: langLabel,
      provider: display,
      headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
      _sort: { lang: job.lang, height: 1, host: display }
    };
    if (resolved.externalSubs && resolved.externalSubs.length) one.subtitles = resolved.externalSubs;
    return [one];
  });
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
function getStreamsImpl(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var isMovie = mediaType === "movie";
    season = season || 1;
    episode = episode || 1;
    var base = yield resolveBase();
    console.log(LOG + " base=" + base + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode));
    var titles = yield getTmdbTitles(tmdbId, mediaType);
    if (!titles.length) {
      console.log(LOG + " no TMDB titles");
      return [];
    }
    console.log(LOG + " titles: " + titles.slice(0, 4).join(" | "));
    var newsId = yield findTargetNewsId(base, titles, isMovie ? "movie" : "tv", season);
    if (!newsId) {
      console.log(LOG + " no matching page");
      return [];
    }
    console.log(LOG + " newsId=" + newsId);
    var data = yield fetchEpisodes(base, newsId);
    if (!data) {
      console.log(LOG + " episodes API empty");
      return [];
    }
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
        jobs.push({ hostKey: hk, embedUrl: url, lang, episode: isMovie ? 1 : episode });
      }
    }
    if (!jobs.length) {
      console.log(LOG + " no host links for episode");
      return [];
    }
    var groups = yield runBatched(jobs, buildStreamsForHost, 3);
    var streams = [];
    for (var g = 0; g < groups.length; g++) for (var x = 0; x < groups[g].length; x++) streams.push(groups[g][x]);
    var langRank = { vostfr: 0, vf: 1 };
    streams.sort(function(a, b) {
      var la = langRank[a._sort.lang], lb = langRank[b._sort.lang];
      if (la !== lb) return la - lb;
      if (b._sort.height !== a._sort.height) return b._sort.height - a._sort.height;
      return a._sort.host < b._sort.host ? -1 : 1;
    });
    for (var i2 = 0; i2 < streams.length; i2++) delete streams[i2]._sort;
    console.log(LOG + " => " + streams.length + " streams");
    return streams;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return getStreamsImpl(tmdbId, mediaType, season, episode).catch(function(e) {
    console.log(LOG + " Error: " + (e && e.message ? e.message : e));
    return [];
  });
}
