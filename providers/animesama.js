/**
 * animesama - Built from src/animesama/
 * Generated: 2026-07-09T08:14:22.926Z
 */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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

// src/animesama/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/animesama/http.js
var BASE_URL = "https://anime-sama.to";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
};
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
function safeFetch(url, options = {}, timeoutMs = 8e3) {
  let controller = null, tid = null;
  try {
    controller = new AbortController();
  } catch (e) {
    controller = null;
  }
  if (controller) {
    tid = safeSetTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
      }
    }, timeoutMs);
  }
  const opts = __spreadValues({ method: "GET", headers: DEFAULT_HEADERS }, options);
  if (controller) {
    opts.signal = controller.signal;
  }
  let p;
  try {
    p = fetch(url, opts);
  } catch (e) {
    safeClearTimeout(tid);
    return Promise.resolve(null);
  }
  return p.then((res) => {
    safeClearTimeout(tid);
    return res;
  }).catch(() => {
    safeClearTimeout(tid);
    return null;
  });
}
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}, timeoutMs = 8e3) {
    const res = yield safeFetch(url, options, timeoutMs);
    if (!res || !res.ok) {
      throw new Error("HTTP " + (res ? res.status : "error") + " for " + url);
    }
    return yield res.text();
  });
}
function searchSlugs(query) {
  return __async(this, null, function* () {
    try {
      const html = yield fetchText(BASE_URL + "/template-php/defaut/fetch.php", {
        method: "POST",
        headers: __spreadProps(__spreadValues({}, DEFAULT_HEADERS), { "Content-Type": "application/x-www-form-urlencoded", "Referer": BASE_URL }),
        body: "query=" + encodeURIComponent(query)
      }, 8e3);
      const slugs = [], seen = {};
      const regex = /href="\/catalogue\/([a-z0-9][a-z0-9-]*)\/?"/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const slug = match[1];
        if (!seen[slug] && slug.length > 1) {
          seen[slug] = true;
          slugs.push(slug);
        }
      }
      console.log("[Anime-Sama] Search: " + slugs.length + " slugs for '" + query + "'");
      return slugs;
    } catch (e) {
      console.log("[Anime-Sama] Search failed: " + e.message);
      return [];
    }
  });
}
function fetchEpisodesJs(slug, seasonPath, lang) {
  return __async(this, null, function* () {
    let url = BASE_URL + "/catalogue/" + slug;
    if (seasonPath) url += "/" + seasonPath;
    url += "/" + lang + "/episodes.js";
    try {
      return yield fetchText(url, {}, 8e3);
    } catch (e) {
      return null;
    }
  });
}
function slugify(title) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// src/animesama/extractor.js
var MAX_BUDGET_MS = 1e4;
var ALLOWED_HOST_PATTERNS = [
  /(^|\.)vidmoly\./i,
  /(^|\.)oneupload\./i,
  /(^|\.)smoothpre\./i,
  /(^|\.)sibnet\./i,
  /(^|\.)sendvid\./i,
  /(^|\.)vk\.com$/i,
  /(^|\.)vkvideo\.ru$/i
];
var PREFERRED_HOSTS = ["vidmoly.biz", "video.sibnet.ru", "smoothpre.com"];
function getHostname(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(url || "");
  return m ? m[1].toLowerCase() : "";
}
function normalizeEmbedUrl(raw) {
  if (!raw) return "";
  let url = String(raw).trim();
  if (!/^https?:\/\//i.test(url)) return "";
  const hashIndex = url.indexOf("#");
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  url = url.replace(/^(https?:\/\/)(www\.)?vidmoly\.(to|net)/i, "$1vidmoly.biz");
  return url;
}
function isAllowedEmbedHost(url) {
  const hostname = getHostname(url);
  if (!hostname) return false;
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(hostname));
}
function hostRank(url) {
  const idx = PREFERRED_HOSTS.indexOf(getHostname(url));
  return idx === -1 ? PREFERRED_HOSTS.length : idx;
}
function getPlayerName(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("sibnet")) return "Sibnet";
  if (u.includes("vidmoly")) return "Vidmoly";
  if (u.includes("sendvid")) return "Sendvid";
  if (u.includes("oneupload") || u.includes("uqload")) return "Uqload";
  if (u.includes("smoothpre")) return "Smoothpre";
  if (u.includes("vk.com") || u.includes("vkvideo")) return "VK";
  return "Player";
}
function extractPanels(html, slug) {
  const panels = [];
  const seen = {};
  const re = /panneauAnime\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].trim();
    const path = m[2].trim().replace(/^\/+|\/+$/g, "");
    if (!name || !path) continue;
    if (!/^(saison\d|film|oav|ova)/i.test(path)) continue;
    const url = BASE_URL + "/catalogue/" + slug + "/" + path + "/";
    if (seen[url]) continue;
    seen[url] = true;
    panels.push({ name, path, url });
  }
  return panels;
}
function panelMatchesRequest(path, season, isMovie) {
  const p = path.toLowerCase();
  if (isMovie) return /^film(\d|\/|$)/.test(p);
  const m = /^saison(\d+)/.exec(p);
  return m !== null && parseInt(m[1], 10) === season;
}
function langFromPath(path) {
  const segs = path.toLowerCase().split("/");
  return segs.length > 1 && segs[1] ? segs[1] : "vostfr";
}
function loadEpisodesJs(panelUrl) {
  return __async(this, null, function* () {
    let scriptUrl = null;
    try {
      const html = yield fetchText(panelUrl, {}, 8e3);
      const m = /<script[^>]+src=["']([^"']*episodes\.js[^"']*)["']/i.exec(html);
      if (m) {
        const src = m[1].trim();
        if (/^https?:\/\//i.test(src)) scriptUrl = src;
        else if (src.charAt(0) === "/") scriptUrl = BASE_URL + src;
        else scriptUrl = panelUrl + src;
      }
    } catch (e) {
    }
    if (!scriptUrl) scriptUrl = panelUrl + "episodes.js";
    try {
      return yield fetchText(scriptUrl, {}, 8e3);
    } catch (e) {
      return null;
    }
  });
}
function parseEpisodesJs(jsContent) {
  if (!jsContent) return [];
  const results = [];
  const varRegex = /var\s+(eps\d+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
  let match;
  while ((match = varRegex.exec(jsContent)) !== null) {
    const urls = [];
    const entryRegex = /['"]([^'"]*)['"]/g;
    let em;
    while ((em = entryRegex.exec(match[2])) !== null) {
      const direct = /https?:\/\/[^\s"'`)\]>]+/i.exec(em[1]);
      urls.push(direct ? direct[0] : "");
    }
    if (urls.some((u) => u !== "")) {
      results.push({ varName: match[1], urls });
    }
  }
  results.sort((a, b) => {
    const na = parseInt(a.varName.replace("eps", ""), 10);
    const nb = parseInt(b.varName.replace("eps", ""), 10);
    return na - nb;
  });
  return results;
}
function buildStreamsFromArrays(parsedArrays, lang, episode) {
  const idx = episode - 1;
  const streams = [];
  const seen = {};
  for (const arr of parsedArrays) {
    const url = normalizeEmbedUrl(arr.urls[idx]);
    if (!url || seen[url]) continue;
    if (!isAllowedEmbedHost(url)) continue;
    seen[url] = true;
    streams.push({
      name: "Anime-Sama",
      title: getPlayerName(url) + " - Ep " + episode + " - " + lang.toUpperCase(),
      url,
      quality: "HD",
      headers: { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT }
    });
  }
  streams.sort((a, b) => hostRank(a.url) - hostRank(b.url));
  return streams;
}
function tryOneSlug(slug, season, episode, isMovie) {
  return __async(this, null, function* () {
    let panels = [];
    try {
      const html = yield fetchText(BASE_URL + "/catalogue/" + slug + "/", {}, 8e3);
      panels = extractPanels(html, slug);
    } catch (e) {
      panels = [];
    }
    const matching = panels.filter((p) => panelMatchesRequest(p.path, season, isMovie));
    if (matching.length > 0) {
      const results2 = yield Promise.all(matching.map((p) => __async(null, null, function* () {
        const js = yield loadEpisodesJs(p.url);
        const parsed = parseEpisodesJs(js);
        return buildStreamsFromArrays(parsed, langFromPath(p.path), episode);
      })));
      const streams = results2.flat();
      if (streams.length > 0) return streams;
    }
    const languages = ["vostfr", "vf"];
    const paths = isMovie ? ["film"] : ["saison" + season, ""];
    const promises = [];
    for (const lang of languages) {
      for (const path of paths) {
        promises.push(
          fetchEpisodesJs(slug, path, lang).then((js) => {
            const parsed = parseEpisodesJs(js);
            return buildStreamsFromArrays(parsed, lang, episode);
          })
        );
      }
    }
    const results = yield Promise.all(promises);
    return results.flat();
  });
}
var SLUG_BATCH_SIZE = 3;
function raceBatch(slugs, season, episode, isMovie, deadline) {
  if (slugs.length === 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      resolve([]);
      return;
    }
    let done = false;
    const finish = (streams) => {
      if (done) return;
      done = true;
      safeClearTimeout(timer);
      resolve(streams);
    };
    const timer = safeSetTimeout(() => finish([]), remaining);
    let settled = 0;
    for (const slug of slugs) {
      tryOneSlug(slug, season, episode, isMovie).then((streams) => {
        settled++;
        if (streams.length > 0) {
          console.log("[Anime-Sama] Found " + streams.length + " streams @ " + slug);
          finish(streams);
        } else if (settled === slugs.length) {
          finish([]);
        }
      }).catch(() => {
        settled++;
        if (settled === slugs.length) finish([]);
      });
    }
  });
}
function raceSlugs(slugs, season, episode, isMovie, deadline) {
  return __async(this, null, function* () {
    for (let i = 0; i < slugs.length; i += SLUG_BATCH_SIZE) {
      if (Date.now() >= deadline) return [];
      const batch = slugs.slice(i, i + SLUG_BATCH_SIZE);
      const streams = yield raceBatch(batch, season, episode, isMovie, deadline);
      if (streams.length > 0) return streams;
    }
    return [];
  });
}
function extractStreams(tmdbId, mediaType, season, episode, titles) {
  return __async(this, null, function* () {
    if (!titles || titles.length === 0) return [];
    const deadline = Date.now() + MAX_BUDGET_MS;
    const s = season || 1, ep = episode || 1;
    const isMovie = mediaType === "movie";
    const slugs = [], seen = {};
    for (const title of titles) {
      const sg = slugify(title);
      if (sg && !seen[sg]) {
        seen[sg] = true;
        slugs.push(sg);
      }
    }
    console.log("[Anime-Sama] Racing " + slugs.length + " slugs: " + slugs.slice(0, 5).join(", "));
    let streams = yield raceSlugs(slugs, s, ep, isMovie, deadline);
    if (streams.length > 0) return streams;
    if (Date.now() >= deadline) {
      console.log("[Anime-Sama] Budget exhausted");
      return [];
    }
    console.log("[Anime-Sama] Search fallback...");
    const searchPromises = titles.slice(0, 4).filter((t) => slugify(t).length > 0).map((t) => searchSlugs(t.replace(/[.:!?,;]/g, " ").replace(/\s+/g, " ").trim()));
    const allFound = yield Promise.all(searchPromises);
    const newSlugs = [];
    for (const batch of allFound) {
      for (const sg of batch) {
        if (!seen[sg]) {
          seen[sg] = true;
          newSlugs.push(sg);
        }
      }
    }
    if (newSlugs.length === 0 || Date.now() >= deadline) {
      console.log("[Anime-Sama] No streams found");
      return [];
    }
    return raceSlugs(newSlugs, s, ep, isMovie, deadline);
  });
}

// src/animesama/index.js
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE = "https://api.themoviedb.org/3";
function getTmdbTitles(tmdbId, mediaType, season) {
  return __async(this, null, function* () {
    const sp = mediaType === "tv" && season ? "&season=" + season : "";
    function fetchLang(lang) {
      return __async(this, null, function* () {
        var _a;
        const url = TMDB_BASE + "/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=" + lang + sp + "&append_to_response=alternative_titles";
        try {
          const res = yield fetch(url);
          if (!res.ok) return [];
          const data = yield res.json();
          const titles = [];
          if (data.name) titles.push(data.name);
          if (data.title) titles.push(data.title);
          if (data.original_name) titles.push(data.original_name);
          if (data.original_title) titles.push(data.original_title);
          if ((_a = data.alternative_titles) == null ? void 0 : _a.titles) {
            for (const alt of data.alternative_titles.titles) titles.push(alt.title);
          }
          return titles;
        } catch (e) {
          return [];
        }
      });
    }
    const [enTitles, frTitles] = yield Promise.all([fetchLang("en-US"), fetchLang("fr-FR")]);
    const raw = [...enTitles, ...frTitles];
    const seen = {}, latin = [], nonLatin = [];
    for (const t of raw) {
      if (!t || typeof t !== "string") continue;
      const key = t.toLowerCase().trim();
      if (seen[key]) continue;
      seen[key] = true;
      if (slugify(t).length > 0) latin.push(t.trim());
      else nonLatin.push(t.trim());
    }
    const result = [...latin, ...nonLatin];
    console.log("[Anime-Sama] TMDB: " + result.slice(0, 4).join(", "));
    return result;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log("[Anime-Sama] " + mediaType + "/" + tmdbId + (mediaType === "tv" ? " S" + season + "E" + episode : ""));
      const titles = yield getTmdbTitles(tmdbId, mediaType, season);
      if (titles.length === 0) return [];
      const streams = yield extractStreams(tmdbId, mediaType, season || 1, episode || 1, titles);
      console.log("[Anime-Sama] => " + streams.length + " streams");
      return streams;
    } catch (e) {
      console.log("[Anime-Sama] Error: " + e.message);
      return [];
    }
  });
}
