/* fs20 - built 2026-07-10T14:16:38.305Z */
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

// src/fs20/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/fs20/http.js
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var FALLBACK_HOSTS = [
  "https://fs20.lol",
  "https://french-stream.one",
  "https://french-stream.club"
];
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
    var end = Date.now() + ms;
    (function spin() {
      if (Date.now() >= end) return res();
      Promise.resolve().then(spin);
    })();
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
function fetchOnce(url, opts, timeoutMs) {
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
  var o = { method: opts.method, headers: opts.headers, redirect: "follow" };
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
      r = yield fetchOnce(url, opts, timeoutMs);
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
function fetchText(url, o, t) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, o, t);
    if (!isOk(r)) throw new Error("HTTP " + (r ? r.status : "err"));
    return r.text();
  });
}
function fetchJson(url, o, t) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, o, t);
    if (!isOk(r)) return null;
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
function decodeEntities(s) {
  if (!s) return "";
  return s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&eacute;/g, "\xE9").replace(/&egrave;/g, "\xE8").replace(/&agrave;/g, "\xE0").replace(/&ecirc;/g, "\xEA").replace(/&ocirc;/g, "\xF4").replace(/&icirc;/g, "\xEE").replace(/&ccedil;/g, "\xE7").replace(/&ucirc;/g, "\xFB").replace(/&acirc;/g, "\xE2").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
var cachedBase = null;
function probeBase(base) {
  return __async(this, null, function* () {
    var r = yield safeFetch(base + "/", {}, 6e3);
    if (!isOk(r)) return false;
    try {
      var h = yield r.text();
      return h.indexOf("FRENCH STREAM") !== -1 || h.indexOf("engine/ajax") !== -1;
    } catch (e) {
      return false;
    }
  });
}
function resolveBase() {
  return __async(this, null, function* () {
    if (cachedBase) return cachedBase;
    for (var i = 0; i < FALLBACK_HOSTS.length; i++) {
      if (yield probeBase(FALLBACK_HOSTS[i])) {
        cachedBase = FALLBACK_HOSTS[i];
        return cachedBase;
      }
    }
    cachedBase = FALLBACK_HOSTS[0];
    return cachedBase;
  });
}
function liveSearch(base, query) {
  return __async(this, null, function* () {
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
        body: "query=" + encodeURIComponent(query) + "&page=1"
      }, 12e3);
    } catch (e) {
      return [];
    }
    var out = [];
    var re = /location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var title = decodeEntities(m[2]).trim();
      var ym = /\((\d{4})\)/.exec(title);
      var sm = /saison\s*(\d+)/i.exec(title);
      out.push({ newsId: m[1], title, year: ym ? ym[1] : null, season: sm ? parseInt(sm[1], 10) : null });
    }
    return out;
  });
}
function fetchFilmPlayers(base, newsId) {
  return __async(this, null, function* () {
    var html;
    try {
      html = yield fetchText(base + "/index.php?newsid=" + newsId, { headers: { "User-Agent": USER_AGENT, "Referer": base + "/" } }, 12e3);
    } catch (e) {
      return [];
    }
    var out = [];
    var re = /class="option"\s+data-url="([^"]+)"><span>([^<]*)</g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var url = m[1];
      var label = m[2].toUpperCase();
      var lang = /VOSTFR|VOST/.test(label) ? "VOSTFR" : "VF";
      var vm = /(TRUEFRENCH|VF2|VFF|VFQ|FRENCH|VOSTFR|VO)/.exec(label);
      out.push({ url, lang, variant: vm ? vm[1] : lang });
    }
    return out;
  });
}
function fetchSeriesEpisodes(base, newsId) {
  return __async(this, null, function* () {
    var v = Math.floor(Date.now() / 3e4);
    var paths = [
      "/static/series/" + newsId + ".js?v=" + v,
      "/data/eps_" + newsId + ".txt?v=" + v,
      "/ep-data.php?id=" + newsId + "&format=js&v=" + v
    ];
    for (var i = 0; i < paths.length; i++) {
      var j = yield fetchJson(base + paths[i], { headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId } }, 12e3);
      if (j && (j.vf || j.vostfr || j.vo)) return j;
    }
    return null;
  });
}

// src/fs20/extractor.js
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
function originOf(url) {
  var m = /^(https?:\/\/[^/]+)/i.exec(url);
  return m ? m[1] : "";
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
var CODEC = { "avc1": "H.264", "hvc1": "H.265", "hev1": "H.265", "av01": "AV1" };
function codecLabel(s) {
  if (!s) return "";
  var m = /(avc1|hvc1|hev1|av01)/i.exec(s);
  return m ? CODEC[m[1].toLowerCase()] : "";
}
function heightToLabel(h) {
  if (h >= 2e3) return "4K";
  if (h >= 1e3) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  if (h >= 300) return "360p";
  return h ? h + "p" : "";
}
function explodeHls(masterUrl, referer) {
  return __async(this, null, function* () {
    var r = yield safeFetch(masterUrl, { headers: { "User-Agent": USER_AGENT, "Referer": referer } }, 12e3);
    if (!isOk(r)) return [];
    var text;
    try {
      text = yield r.text();
    } catch (e) {
      return [];
    }
    if (text.indexOf("#EXT") === -1) return [];
    if (text.indexOf("#EXT-X-STREAM-INF") === -1) {
      return [{ url: masterUrl, quality: "", height: 0, codec: "" }];
    }
    var out = [];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
      var attrs = lines[i];
      var url = "";
      for (var j = i + 1; j < lines.length; j++) {
        var ln = lines[j].trim();
        if (!ln) continue;
        if (ln.charAt(0) === "#") continue;
        url = ln;
        break;
      }
      if (!url) continue;
      var hm = /RESOLUTION=\d+x(\d+)/i.exec(attrs);
      var height = hm ? parseInt(hm[1], 10) : 0;
      var cm = /CODECS="([^"]*)"/i.exec(attrs);
      out.push({ url: resolveRelative(masterUrl, url), quality: heightToLabel(height), height, codec: codecLabel(cm ? cm[1] : "") });
    }
    if (!out.length) out.push({ url: masterUrl, quality: "", height: 0, codec: "" });
    return out;
  });
}
function resolveHost(hostKey, embedUrl) {
  return __async(this, null, function* () {
    var referer = originOf(embedUrl) + "/";
    var r = yield safeFetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": referer } }, 12e3);
    if (!isOk(r)) return null;
    var html;
    try {
      html = yield r.text();
    } catch (e) {
      return null;
    }
    var unpacked = unpackPacked(html);
    var media = findVideoUrl(unpacked) || findVideoUrl(html);
    if (!media) {
      var fm = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
      if (fm) {
        var r2 = yield safeFetch(fm[1], { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } }, 12e3);
        if (isOk(r2)) {
          try {
            var h2 = yield r2.text();
            media = findVideoUrl(unpackPacked(h2)) || findVideoUrl(h2);
            referer = originOf(fm[1]) + "/";
          } catch (e) {
          }
        }
      }
    }
    if (!media) return null;
    var kind = /\.m3u8/i.test(media) ? "hls" : "mp4";
    return { kind, masterUrl: media, referer };
  });
}
function mp4Alive(url, referer) {
  return __async(this, null, function* () {
    var r = yield safeFetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT, "Referer": referer, "Range": "bytes=0-1" } }, 9e3);
    if (!r) return true;
    if (r.status === 403 || r.status === 404 || r.status === 410 || r.status >= 500) return false;
    return true;
  });
}

// src/fs20/index.js
var LOG = "[fs20]";
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var kind = mediaType === "tv" ? "tv" : "movie";
    var titles = [], seen = {}, year = null;
    function add(t) {
      if (!t) return;
      var k = slugify(t);
      if (!k || seen[k]) return;
      seen[k] = true;
      titles.push(t);
    }
    var langs = ["fr-FR", "en-US"];
    for (var i = 0; i < langs.length; i++) {
      var d = yield fetchJson("https://api.themoviedb.org/3/" + kind + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + langs[i], { headers: { "User-Agent": USER_AGENT } }, 9e3);
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
    return { titles, year };
  });
}
function buildQueries(titles) {
  var seen = {}, out = [];
  function push(q) {
    q = String(q).trim();
    if (!q) return;
    var k = q.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    out.push(q);
  }
  for (var i = 0; i < titles.length; i++) {
    push(titles[i]);
    var toks = String(titles[i]).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (toks.length > 3) push(toks.slice(0, 3).join(" "));
  }
  return out;
}
function baseSlug(title) {
  return slugify(String(title).replace(/\s*\(\d{4}\)\s*$/, "").replace(/[-–]\s*saison\s*\d+.*$/i, ""));
}
function scoreItem(item, candSlugs, year) {
  var s = baseSlug(item.title);
  if (!s) return -1;
  var best = -1;
  for (var i = 0; i < candSlugs.length; i++) {
    var c = candSlugs[i];
    if (!c) continue;
    var base = -1;
    if (s === c) base = 100;
    else if (s.length > 4 && c.length > 4 && (s.indexOf(c) === 0 || c.indexOf(s) === 0)) base = 55;
    if (base < 0) continue;
    if (year && item.year) base += year === item.year ? 12 : -20;
    if (base > best) best = base;
  }
  return best;
}
var HOST_NAME = { vidzy: "Vidzy", uqload: "Uqload", voe: "Voe", netu: "Netu", premium: "Premium" };
var HOST_ORDER = ["vidzy", "uqload", "voe", "premium", "netu"];
function langLabel(v) {
  return v === "vostfr" ? "VOSTFR" : v === "vo" ? "VO" : "VF";
}
function langFlag(v) {
  return v === "vostfr" || v === "vo" ? "\u{1F1EF}\u{1F1F5}" : "\u{1F1EB}\u{1F1F7}";
}
function buildStreams(hostKey, embedUrl, langKey, epNum, langText) {
  return __async(this, null, function* () {
    var resolved = yield resolveHost(hostKey, embedUrl);
    if (!resolved) return [];
    var name = HOST_NAME[hostKey] || hostKey.charAt(0).toUpperCase() + hostKey.slice(1);
    var label = langText || langLabel(langKey), flag = langFlag(langKey);
    if (resolved.kind === "hls") {
      var variants = yield explodeHls(resolved.masterUrl, resolved.referer);
      if (!variants.length) return [];
      return variants.map(function(v) {
        var parts = [name];
        if (v.quality) parts.push(v.quality);
        if (v.codec && v.codec !== "H.264") parts.push(v.codec);
        parts.push(label);
        return {
          name: flag + " " + parts.join(" \xB7 "),
          title: name + " \xB7 " + (v.quality || "HD") + " \xB7 " + label + (epNum ? " \xB7 Ep " + epNum : ""),
          url: v.url,
          quality: v.quality || "HD",
          language: label,
          provider: name,
          headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
          _sort: { lang: langKey, height: v.height || 0, host: name }
        };
      });
    }
    var alive = yield mp4Alive(resolved.masterUrl, resolved.referer);
    if (!alive) return [];
    return [{
      name: flag + " " + name + " \xB7 MP4 \xB7 " + label,
      title: name + " \xB7 MP4 \xB7 " + label + (epNum ? " \xB7 Ep " + epNum : ""),
      url: resolved.masterUrl,
      quality: "HD",
      language: label,
      provider: name,
      headers: { "Referer": resolved.referer, "User-Agent": USER_AGENT },
      _sort: { lang: langKey, height: 1, host: name }
    }];
  });
}
function runBatched(items, worker, size) {
  return __async(this, null, function* () {
    var out = [];
    for (var i = 0; i < items.length; i += size) {
      var res = yield Promise.all(items.slice(i, i + size).map(worker));
      for (var j = 0; j < res.length; j++) if (res[j]) out.push(res[j]);
    }
    return out;
  });
}
function sortStreams(streams) {
  var rank = { vf: 0, vostfr: 1, vo: 2 };
  streams.sort(function(a, b) {
    var la = rank[a._sort.lang], lb = rank[b._sort.lang];
    if (la !== lb) return la - lb;
    if (b._sort.height !== a._sort.height) return b._sort.height - a._sort.height;
    return a._sort.host < b._sort.host ? -1 : 1;
  });
  for (var i = 0; i < streams.length; i++) delete streams[i]._sort;
  return streams;
}
function getStreamsImpl(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var isMovie = mediaType !== "tv";
    season = season || 1;
    episode = episode || 1;
    var info = yield getTmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) {
      console.log(LOG + " no TMDB titles");
      return [];
    }
    var candSlugs = info.titles.map(slugify);
    var base = yield resolveBase();
    console.log(LOG + " base=" + base + " " + mediaType + "/" + tmdbId + (isMovie ? "" : " S" + season + "E" + episode) + " | " + info.titles.slice(0, 2).join(" | "));
    var queries = buildQueries(info.titles);
    var items = [], byId = {};
    for (var q = 0; q < queries.length; q++) {
      var found = yield liveSearch(base, queries[q]);
      for (var f = 0; f < found.length; f++) {
        if (!byId[found[f].newsId]) {
          byId[found[f].newsId] = 1;
          items.push(found[f]);
        }
      }
    }
    if (!items.length) {
      console.log(LOG + " search empty");
      return [];
    }
    var jobs = [];
    if (isMovie) {
      var best = null, bestScore = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].season) continue;
        var sc = scoreItem(items[i], candSlugs, info.year);
        if (sc > bestScore) {
          bestScore = sc;
          best = items[i];
        }
      }
      if (!best || bestScore < 90) {
        console.log(LOG + " no film match");
        return [];
      }
      console.log(LOG + " film newsId=" + best.newsId + " (" + best.title + ")");
      var players = yield fetchFilmPlayers(base, best.newsId);
      for (var p = 0; p < players.length; p++) {
        var lk = players[p].lang === "VOSTFR" ? "vostfr" : "vf";
        jobs.push({ hostKey: "vidzy", embedUrl: players[p].url, langKey: lk, epNum: null, langText: players[p].variant });
      }
    } else {
      var seed = null, seedScore = -1;
      for (var s = 0; s < items.length; s++) {
        if (items[s].season !== season) continue;
        var sc2 = scoreItem(items[s], candSlugs, null);
        if (sc2 > seedScore) {
          seedScore = sc2;
          seed = items[s];
        }
      }
      if (!seed && season === 1) {
        for (var s2 = 0; s2 < items.length; s2++) {
          var sc3 = scoreItem(items[s2], candSlugs, null);
          if (sc3 > seedScore) {
            seedScore = sc3;
            seed = items[s2];
          }
        }
      }
      if (!seed || seedScore < 90) {
        console.log(LOG + " no season match");
        return [];
      }
      console.log(LOG + " serie newsId=" + seed.newsId + " (" + seed.title + ")");
      var eps = yield fetchSeriesEpisodes(base, seed.newsId);
      if (!eps) {
        console.log(LOG + " episodes API empty");
        return [];
      }
      var vers = ["vf", "vostfr", "vo"];
      for (var vi = 0; vi < vers.length; vi++) {
        var dict = eps[vers[vi]];
        if (!dict) continue;
        var ep = dict[String(episode)];
        if (!ep) continue;
        for (var h = 0; h < HOST_ORDER.length; h++) {
          var hk = HOST_ORDER[h];
          var url = ep[hk];
          if (url && typeof url === "string" && /^https?:\/\//i.test(url)) {
            jobs.push({ hostKey: hk, embedUrl: url, langKey: vers[vi], epNum: episode });
          }
        }
      }
    }
    if (!jobs.length) {
      console.log(LOG + " no player links");
      return [];
    }
    var groups = yield runBatched(jobs, function(job) {
      return buildStreams(job.hostKey, job.embedUrl, job.langKey, job.epNum, job.langText);
    }, 3);
    var streams = [];
    for (var g = 0; g < groups.length; g++) for (var x = 0; x < groups[g].length; x++) streams.push(groups[g][x]);
    sortStreams(streams);
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
