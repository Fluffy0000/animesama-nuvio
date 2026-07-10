/**
 * animesama - Built from src/animesama/
 * Generated: 2026-07-09T13:55:38.937Z
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
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var STATUS_URL = "https://anime-sama.pw/";
var FALLBACK_DOMAINS = [
  "anime-sama.to",
  "anime-sama.tv",
  "anime-sama.org",
  "anime-sama.eu",
  "anime-sama.fr",
  "anime-sama.net",
  "anime-sama.si",
  "anime-sama.com"
];
var PROBE_PATH = "/catalogue/one-piece/saison1/vostfr/episodes.js";
var ACTIVE_BASE = "https://anime-sama.to";
var baseResolvePromise = null;
function getBase() {
  return ACTIVE_BASE;
}
function probeDomain(domain) {
  return __async(this, null, function* () {
    const res = yield safeFetch2("https://" + domain + PROBE_PATH, {}, 6e3);
    if (!res || !res.ok) return false;
    try {
      const js = yield res.text();
      return js.indexOf("var eps") !== -1;
    } catch (e) {
      return false;
    }
  });
}
function domainFromStatusPage() {
  return __async(this, null, function* () {
    try {
      const res = yield safeFetch2(STATUS_URL, {}, 6e3);
      if (!res || !res.ok) return null;
      const html = yield res.text();
      const m = /href=["'](https?:\/\/anime-sama\.[a-z.]+)["'][^>]*>\s*Acc[èe]der/i.exec(html) || /class=["'][^"']*btn-primary[^"']*["']\s+href=["'](https?:\/\/anime-sama\.[a-z.]+)["']/i.exec(html);
      if (!m) return null;
      const host = m[1].replace(/^https?:\/\//, "").replace(/\/+$/, "");
      return host === "anime-sama.pw" ? null : host;
    } catch (e) {
      return null;
    }
  });
}
function resolveBase() {
  if (baseResolvePromise) return baseResolvePromise;
  baseResolvePromise = (() => __async(null, null, function* () {
    const statusHost = yield domainFromStatusPage();
    const candidates = [];
    const seen = {};
    if (statusHost) {
      candidates.push(statusHost);
      seen[statusHost] = true;
    }
    for (const d of FALLBACK_DOMAINS) if (!seen[d]) {
      seen[d] = true;
      candidates.push(d);
    }
    for (const d of candidates) {
      if (yield probeDomain(d)) {
        ACTIVE_BASE = "https://" + d;
        console.log("[Anime-Sama] Domaine actif: https://" + d + (d === statusHost ? " (status)" : " (sonde)"));
        return ACTIVE_BASE;
      }
    }
    console.log("[Anime-Sama] Aucun domaine confirm\xE9, d\xE9faut: " + ACTIVE_BASE);
    return ACTIVE_BASE;
  }))();
  return baseResolvePromise;
}
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
function safeFetch2(url, options = {}, timeoutMs = 8e3) {
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
    const res = yield safeFetch2(url, options, timeoutMs);
    if (!res || !res.ok) {
      throw new Error("HTTP " + (res ? res.status : "error") + " for " + url);
    }
    return yield res.text();
  });
}
function searchSlugs(query) {
  return __async(this, null, function* () {
    try {
      const html = yield fetchText(getBase() + "/template-php/defaut/fetch.php", {
        method: "POST",
        headers: __spreadProps(__spreadValues({}, DEFAULT_HEADERS), { "Content-Type": "application/x-www-form-urlencoded", "Referer": getBase() + "/" }),
        body: "query=" + encodeURIComponent(query)
      }, 8e3);
      const slugs = [], seen = {};
      const regex = /\/catalogue\/([a-z0-9][a-z0-9-]*)/gi;
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
    let url = getBase() + "/catalogue/" + slug;
    if (seasonPath) url += "/" + seasonPath;
    url += "/" + lang + "/episodes.js";
    try {
      return yield fetchText(url, {}, 8e3);
    } catch (e) {
      return null;
    }
  });
}
var ACCENT_MAP = {
  "\xE0": "a",
  "\xE2": "a",
  "\xE4": "a",
  "\xE1": "a",
  "\xE3": "a",
  "\xE5": "a",
  "\xE7": "c",
  "\xE8": "e",
  "\xE9": "e",
  "\xEA": "e",
  "\xEB": "e",
  "\xEC": "i",
  "\xED": "i",
  "\xEE": "i",
  "\xEF": "i",
  "\xF1": "n",
  "\xF2": "o",
  "\xF3": "o",
  "\xF4": "o",
  "\xF6": "o",
  "\xF5": "o",
  "\xF8": "o",
  "\xF9": "u",
  "\xFA": "u",
  "\xFB": "u",
  "\xFC": "u",
  "\xFD": "y",
  "\xFF": "y",
  "\u0153": "oe",
  "\xE6": "ae",
  "\xDF": "ss"
};
function stripAccents(lower) {
  try {
    return lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    return lower.replace(/[\u00c0-\u024f]/g, function(ch) {
      return ACCENT_MAP[ch] !== void 0 ? ACCENT_MAP[ch] : ch;
    });
  }
}
function slugify(title) {
  return stripAccents(String(title).toLowerCase()).replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// src/animesama/extractor.js
var MAX_BUDGET_MS = 2e4;
var BLACKLIST_HOST_PATTERNS = [
  /(^|\.)anime-sama\./i,
  /(^|\.)w3schools\.com$/i,
  /(^|\.)statically\.io$/i,
  /(^|\.)google-analytics\./i,
  /(^|\.)doubleclick\./i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /big.?buck.?bunny/i,
  /sample-videos\.com/i,
  /(^|\.)example\.com$/i,
  /localhost/i
];
var PREFERRED_HOSTS = ["vidmoly.biz", "video.sibnet.ru", "smoothpre.com"];
var LANGS = ["vostfr", "vf"];
function langRank(lang) {
  const l = (lang || "").toUpperCase();
  if (l === "VOSTFR") return 0;
  if (l === "VF") return 1;
  return 2;
}
var PREFERRED_PLAYERS = ["Vidmoly", "Smoothpre", "Movearnpre", "Sibnet", "Sendvid"];
function playerRank(player) {
  const idx = PREFERRED_PLAYERS.indexOf(player);
  return idx === -1 ? PREFERRED_PLAYERS.length : idx;
}
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
  return !BLACKLIST_HOST_PATTERNS.some((re) => re.test(hostname));
}
function hostRank(url) {
  const idx = PREFERRED_HOSTS.indexOf(getHostname(url));
  return idx === -1 ? PREFERRED_HOSTS.length : idx;
}
function hostOrigin(url) {
  const m = /^(https?:\/\/[^/]+)/i.exec(url || "");
  return m ? m[1] + "/" : "";
}
function getPlayerName(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("sibnet")) return "Sibnet";
  if (u.includes("vidmoly")) return "Vidmoly";
  if (u.includes("sendvid")) return "Sendvid";
  if (u.includes("oneupload") || u.includes("uqload")) return "Uqload";
  if (u.includes("smoothpre")) return "Smoothpre";
  if (u.includes("movearnpre") || u.includes("movearn")) return "Movearnpre";
  if (u.includes("filemoon") || u.includes("moonplayer")) return "Filemoon";
  if (u.includes("vidhide") || u.includes("vidhidepre") || u.includes("niam") || u.includes("earn")) return "Vidhide";
  if (u.includes("voe") || u.includes("do\u0648\u062F")) return "Voe";
  if (u.includes("dood") || u.includes("ds2play") || u.includes("d0o0d")) return "Doodstream";
  if (u.includes("streamtape") || u.includes("stape") || u.includes("tapecontent")) return "Streamtape";
  if (u.includes("vidoza")) return "Vidoza";
  if (u.includes("myvi")) return "Myvi";
  if (u.includes("vk.com") || u.includes("vkvideo") || u.includes("vkvideo")) return "VK";
  const host = getHostname(url).replace(/^www\./, "");
  const parts = host.split(".");
  const base = parts.length >= 2 ? parts[parts.length - 2] : host;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Player";
}
function extractPanels(html, slug) {
  const panels = [];
  const seen = {};
  const re = /panneauAnime\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].trim();
    const path = m[2].trim().replace(/^\/+|\/+$/g, "");
    if (!name || !path) continue;
    if (!/^(saison\d|film|oav|ova)/i.test(path)) continue;
    const url = getBase() + "/catalogue/" + slug + "/" + path + "/";
    if (seen[url]) continue;
    seen[url] = true;
    panels.push({ name, path, url });
  }
  return panels;
}
function panelMatchesRequest(path, season, isMovie) {
  const seg = path.toLowerCase().split("/")[0];
  if (isMovie) return /^film\d*$/.test(seg);
  return seg === "saison" + season;
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
        else if (src.charAt(0) === "/") scriptUrl = getBase() + src;
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
function buildCandidates(parsedArrays, lang, index, label) {
  const streams = [];
  const seen = {};
  for (const arr of parsedArrays) {
    const url = normalizeEmbedUrl(arr.urls[index]);
    if (!url || seen[url]) continue;
    if (!isAllowedEmbedHost(url)) continue;
    const player = getPlayerName(url);
    seen[url] = true;
    streams.push({
      embedUrl: url,
      player,
      lang: lang.toUpperCase(),
      label
    });
  }
  streams.sort((a, b) => hostRank(a.embedUrl) - hostRank(b.embedUrl));
  return streams;
}
function normText(s) {
  return slugify(String(s || "")).replace(/-/g, " ").trim();
}
function extractFilmNames(html) {
  const names = [];
  const re = /newSPF\(\s*"([^"]*)"\s*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) names.push(m[1]);
  return names;
}
function filmNameScore(name, titles) {
  const f = normText(name);
  if (!f) return 0;
  let best = 0;
  for (const raw of titles) {
    const t = normText(raw);
    if (!t) continue;
    let score = 0;
    if (t === f) score = 100 + f.length;
    else if ((" " + t + " ").indexOf(" " + f + " ") >= 0) score = 50 + f.length;
    else if ((" " + f + " ").indexOf(" " + t + " ") >= 0) score = 40 + t.length;
    else {
      const ft = f.split(" ");
      const tt = {};
      for (const w of t.split(" ")) tt[w] = true;
      let ov = 0;
      for (const w of ft) if (w.length > 2 && tt[w]) ov += w.length;
      score = ov;
    }
    if (score > best) best = score;
  }
  return best;
}
function maxArrayLen(parsedArrays) {
  let n = 0;
  for (const a of parsedArrays) n = Math.max(n, a.urls.length);
  return n;
}
function firstMatch(text, re) {
  const m = re.exec(text);
  return m ? m[1] : "";
}
function qualityLabel(height) {
  if (!height) return "HD";
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return height + "p";
}
function resolveRelative(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf("//") === 0) return "https:" + rel;
  if (rel.charAt(0) === "/") {
    const m = /^(https?:\/\/[^/]+)/i.exec(base);
    return m ? m[1] + rel : rel;
  }
  const q = base.indexOf("?");
  const clean = q >= 0 ? base.slice(0, q) : base;
  const dir = clean.slice(0, clean.lastIndexOf("/") + 1);
  return dir + rel;
}
var CODEC_MAP = {
  avc1: "H.264",
  h264: "H.264",
  hev1: "H.265",
  hvc1: "H.265",
  h265: "H.265",
  av01: "AV1",
  av1: "AV1",
  vp9: "VP9",
  vp09: "VP9"
};
function mapVideoCodec(codecString) {
  if (!codecString) return null;
  for (const part of codecString.split(",")) {
    const key = part.trim().split(".")[0].toLowerCase();
    if (CODEC_MAP[key] && ["H.264", "H.265", "AV1", "VP9"].indexOf(CODEC_MAP[key]) !== -1) return CODEC_MAP[key];
  }
  return null;
}
function extractHlsVariants(masterUrl, referer) {
  return __async(this, null, function* () {
    let text;
    try {
      text = yield fetchText(masterUrl, { headers: { "Referer": referer, "User-Agent": USER_AGENT } }, 6e3);
    } catch (e) {
      return [];
    }
    if (text.indexOf("#EXT") === -1) return [];
    if (!/#EXT-X-STREAM-INF/i.test(text)) return [{ url: masterUrl, height: 0, codec: null, fps: null }];
    const lines = text.split(/\r?\n/);
    const out = [];
    const seen = {};
    for (let i = 0; i < lines.length; i++) {
      const tag = lines[i].trim();
      if (tag.indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
      let next = "";
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim();
        if (l && l.charAt(0) !== "#") {
          next = l;
          break;
        }
      }
      if (!next) continue;
      const hM = tag.match(/RESOLUTION=\d+x(\d+)/i);
      const fM = tag.match(/FRAME-RATE=([0-9.]+)/i);
      const cM = tag.match(/CODECS="([^"]+)"/i);
      const url = resolveRelative(masterUrl, next);
      if (seen[url]) continue;
      seen[url] = true;
      out.push({
        url,
        height: hM ? parseInt(hM[1], 10) : 0,
        fps: fM ? Math.round(parseFloat(fM[1])) : null,
        codec: mapVideoCodec(cM && cM[1])
      });
    }
    out.sort((a, b) => b.height - a.height);
    return out;
  });
}
function unpackPacked(src) {
  const m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const a = parseInt(m[2], 10);
  let c = parseInt(m[3], 10);
  const k = m[4].split("|");
  if (a > 36) return "";
  while (c--) {
    if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
  }
  return p;
}
function resolveVidmoly(embedUrl) {
  return __async(this, null, function* () {
    const html = yield fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8e3);
    const file = firstMatch(html, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i) || firstMatch(html, /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (!file) return null;
    return { kind: "hls", url: file, referer: "https://vidmoly.biz/" };
  });
}
function findMediaUrl(text) {
  if (!text) return null;
  const hls = firstMatch(text, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+\.m3u8[^"']*)["']/i) || firstMatch(text, /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || firstMatch(text, /["'](https?:\/\/[^"'\\ ]+\.m3u8[^"'\\ ]*)["']/i);
  if (hls) return { kind: "hls", url: hls };
  const mp4 = firstMatch(text, /og:video["']\s+content=["']([^"']+\.mp4[^"']*)["']/i) || firstMatch(text, /sources:\s*\[\s*\{\s*file:\s*["']([^"']+\.mp4[^"']*)["']/i) || firstMatch(text, /file:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) || firstMatch(text, /src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) || firstMatch(text, /["'](https?:\/\/[^"'\\ ]+\.mp4[^"'\\ ]*)["']/i);
  if (mp4) return { kind: "mp4", url: mp4.replace(/&amp;/g, "&") };
  return null;
}
function resolveGeneric(embedUrl, referer, depth) {
  return __async(this, null, function* () {
    depth = depth || 0;
    let html;
    try {
      html = yield fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8e3);
    } catch (e) {
      return null;
    }
    let found = findMediaUrl(html);
    if (!found) {
      const un = unpackPacked(html);
      if (un) found = findMediaUrl(un);
    }
    if (found && isAllowedEmbedHost(found.url)) {
      return { kind: found.kind, url: found.url, referer: referer || hostOrigin(embedUrl) };
    }
    if (depth < 1) {
      const iframe = firstMatch(html, /<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframe) {
        const abs = resolveRelative(embedUrl, iframe);
        if (abs && isAllowedEmbedHost(abs)) return yield resolveGeneric(abs, referer, depth + 1);
      }
    }
    return null;
  });
}
function resolveSibnet(embedUrl) {
  return __async(this, null, function* () {
    const html = yield fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8e3);
    let path = firstMatch(html, /player\.src\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']/i) || firstMatch(html, /["'](\/v\/[^"']+\.mp4)["']/i);
    if (!path) return null;
    if (path.charAt(0) === "/") path = "https://video.sibnet.ru" + path;
    return { kind: "mp4", url: path, referer: "https://video.sibnet.ru/", height: 720 };
  });
}
function resolveSendvid(embedUrl) {
  return __async(this, null, function* () {
    const html = yield fetchText(embedUrl, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8e3);
    const file = firstMatch(html, /og:video["']\s+content=["']([^"']+)["']/i) || firstMatch(html, /source\s+src=["']([^"']+\.mp4[^"']*)["']/i) || firstMatch(html, /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (!file) return null;
    const height = parseInt(firstMatch(html, /og:video:height["']\s+content=["'](\d+)["']/i), 10) || 0;
    const url = file.replace(/&amp;/g, "&");
    if (url.toLowerCase().indexOf(".m3u8") !== -1) return { kind: "hls", url, referer: "https://sendvid.com/" };
    return { kind: "mp4", url, referer: "https://sendvid.com/", height: height || 720 };
  });
}
function resolveTarget(embedUrl, player) {
  return __async(this, null, function* () {
    try {
      if (player === "Vidmoly") return yield resolveVidmoly(embedUrl);
      if (player === "Sibnet") return yield resolveSibnet(embedUrl);
      if (player === "Sendvid") return yield resolveSendvid(embedUrl);
      return yield resolveGeneric(embedUrl, hostOrigin(embedUrl), 0);
    } catch (e) {
    }
    return null;
  });
}
function isLinkAlive(url, headers) {
  return __async(this, null, function* () {
    try {
      if (url.toLowerCase().indexOf(".m3u8") !== -1) {
        const res2 = yield safeFetch(url, { method: "GET", headers }, 6e3);
        if (!res2 || !res2.ok) return false;
        const body = yield res2.text();
        return body.indexOf("#EXT") !== -1;
      }
      const res = yield safeFetch(url, { method: "HEAD", headers }, 5e3);
      if (!res) return true;
      const s = res.status || 0;
      if (s === 403 || s === 404 || s === 410 || s >= 500) return false;
      return true;
    } catch (e) {
      return true;
    }
  });
}
function resolveCandidate(c) {
  return __async(this, null, function* () {
    const target = yield resolveTarget(c.embedUrl, c.player);
    if (!target || !target.url) return [];
    const headers = { "Referer": target.referer, "User-Agent": USER_AGENT };
    const mkStream = (url, height, extra) => {
      const q = qualityLabel(height);
      const parts = [c.player, q];
      if (extra) parts.push(extra);
      parts.push(c.lang);
      return {
        name: parts.join(" \xB7 "),
        title: parts.join(" \xB7 ") + " \xB7 " + c.label,
        url,
        quality: q,
        language: c.lang,
        provider: c.player,
        height: height || 0,
        player: c.player,
        headers
      };
    };
    if (target.kind === "mp4") {
      if (!(yield isLinkAlive(target.url, headers))) {
        console.log("[Anime-Sama] Dropped dead link (" + c.player + ")");
        return [];
      }
      return [mkStream(target.url, target.height || 720, null)];
    }
    const variants = yield extractHlsVariants(target.url, target.referer);
    if (variants.length === 0) {
      console.log("[Anime-Sama] Dropped dead HLS (" + c.player + ")");
      return [];
    }
    return variants.map((v) => {
      const extra = [];
      if (v.codec) extra.push(v.codec);
      if (v.fps && v.fps > 30) extra.push(v.fps + "fps");
      return mkStream(v.url, v.height, extra.length ? extra.join(" ") : null);
    });
  });
}
function resolveStreams(candidates) {
  return __async(this, null, function* () {
    const resolved = [];
    const BATCH = 3;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const parts = yield Promise.all(batch.map((c) => resolveCandidate(c)));
      for (const arr of parts) for (const s of arr) resolved.push(s);
    }
    const seenUrl = {};
    const unique = [];
    for (const s of resolved) {
      if (!seenUrl[s.url]) {
        seenUrl[s.url] = true;
        unique.push(s);
      }
    }
    unique.sort((a, b) => langRank(a.language) - langRank(b.language) || b.height - a.height || playerRank(a.player) - playerRank(b.player));
    for (const s of unique) delete s.height;
    return unique;
  });
}
function loadFilmDir(slug, seg, lang) {
  return __async(this, null, function* () {
    const dir = getBase() + "/catalogue/" + slug + "/" + seg + "/" + lang + "/";
    let html = "";
    try {
      html = yield fetchText(dir, { headers: { "Referer": getBase() + "/", "User-Agent": USER_AGENT } }, 8e3);
    } catch (e) {
      html = "";
    }
    const names = extractFilmNames(html);
    const parsed = parseEpisodesJs(yield loadEpisodesJs(dir));
    return { seg, lang, names, parsed };
  });
}
function movieStreams(slug, filmSegs, titles) {
  return __async(this, null, function* () {
    if (filmSegs.length === 0) return [];
    const dirTasks = [];
    for (const seg of filmSegs) for (const lang of LANGS) dirTasks.push(loadFilmDir(slug, seg, lang));
    const dirs = (yield Promise.all(dirTasks)).filter((d) => d.parsed.length > 0);
    if (dirs.length === 0) return [];
    const films = {};
    for (const d of dirs) {
      const count = Math.max(d.names.length, maxArrayLen(d.parsed));
      for (let i = 0; i < count; i++) {
        const key = d.seg + "#" + i;
        if (!films[key]) films[key] = { index: i, name: "", langs: {} };
        if (!films[key].name && d.names[i]) films[key].name = d.names[i];
        films[key].langs[d.lang] = d.parsed;
      }
    }
    const keys = Object.keys(films);
    if (keys.length === 0) return [];
    let bestKey = null, bestScore = 0;
    for (const k of keys) {
      const sc = filmNameScore(films[k].name, titles);
      if (sc > bestScore) {
        bestScore = sc;
        bestKey = k;
      }
    }
    let chosen = null;
    if (bestKey && bestScore >= 3) chosen = films[bestKey];
    else if (keys.length === 1) chosen = films[keys[0]];
    if (!chosen) return [];
    const out = [];
    for (const lang of Object.keys(chosen.langs)) {
      const built = buildCandidates(chosen.langs[lang], lang, chosen.index, chosen.name || "Film");
      for (const st of built) out.push(st);
    }
    return out;
  });
}
function tryOneSlug(slug, season, episode, isMovie, titles) {
  return __async(this, null, function* () {
    let panels = [];
    try {
      const html = yield fetchText(getBase() + "/catalogue/" + slug + "/", {}, 8e3);
      panels = extractPanels(html, slug);
    } catch (e) {
      panels = [];
    }
    if (isMovie) {
      let segs = [];
      const seenSeg = {};
      for (const p of panels) {
        const seg = p.path.split("/")[0];
        if (/^film/i.test(seg) && !seenSeg[seg]) {
          seenSeg[seg] = true;
          segs.push(seg);
        }
      }
      if (segs.length === 0) segs = ["film", "film1", "film2"];
      return yield movieStreams(slug, segs, titles);
    }
    const matching = panels.filter((p) => panelMatchesRequest(p.path, season, isMovie));
    if (matching.length > 0) {
      const tasks = [];
      const seenPL = {};
      for (const p of matching) {
        const seg = p.path.split("/")[0];
        for (const lang of LANGS) {
          const key = seg + "/" + lang;
          if (seenPL[key]) continue;
          seenPL[key] = true;
          const dir = getBase() + "/catalogue/" + slug + "/" + seg + "/" + lang + "/";
          tasks.push(loadEpisodesJs(dir).then((js) => buildCandidates(parseEpisodesJs(js), lang, episode - 1, "Ep " + episode)));
        }
      }
      const streams = (yield Promise.all(tasks)).flat();
      if (streams.length > 0) return streams;
    }
    const promises = [];
    for (const lang of LANGS) {
      for (const path of ["saison" + season, ""]) {
        promises.push(
          fetchEpisodesJs(slug, path, lang).then((js) => buildCandidates(parseEpisodesJs(js), lang, episode - 1, "Ep " + episode))
        );
      }
    }
    return (yield Promise.all(promises)).flat();
  });
}
var SLUG_BATCH_SIZE = 3;
function raceBatch(slugs, season, episode, isMovie, titles, deadline) {
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
      tryOneSlug(slug, season, episode, isMovie, titles).then((streams) => {
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
function raceSlugs(slugs, season, episode, isMovie, titles, deadline) {
  return __async(this, null, function* () {
    for (let i = 0; i < slugs.length; i += SLUG_BATCH_SIZE) {
      if (Date.now() >= deadline) return [];
      const batch = slugs.slice(i, i + SLUG_BATCH_SIZE);
      const streams = yield raceBatch(batch, season, episode, isMovie, titles, deadline);
      if (streams.length > 0) return streams;
    }
    return [];
  });
}
function buildMovieSlugs(titles) {
  const out = [], seen = {};
  const add = (s) => {
    if (s && s.length > 1 && !seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  };
  for (const t of titles) {
    add(slugify(t));
    const cleaned = String(t).replace(/[:\-–—]/g, " ").replace(/\b(le\s+)?film\b/gi, " ").replace(/\bmovie\b/gi, " ").replace(/\s+/g, " ").trim();
    const words = cleaned.split(" ");
    for (let n = words.length; n >= 2; n--) add(slugify(words.slice(0, n).join(" ")));
  }
  return out.slice(0, 14);
}
function findCandidates(tmdbId, mediaType, season, episode, titles, deadline) {
  return __async(this, null, function* () {
    const s = season || 1, ep = episode || 1;
    const isMovie = mediaType === "movie";
    const seen = {};
    const slugs = [];
    const rawSlugs = isMovie ? buildMovieSlugs(titles) : titles.map(slugify);
    for (const sg of rawSlugs) {
      if (sg && sg.length > 1 && !seen[sg]) {
        seen[sg] = true;
        slugs.push(sg);
      }
    }
    console.log("[Anime-Sama] Racing " + slugs.length + " slugs: " + slugs.slice(0, 5).join(", "));
    let cands = yield raceSlugs(slugs, s, ep, isMovie, titles, deadline);
    if (cands.length > 0) return cands;
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
    if (newSlugs.length === 0 || Date.now() >= deadline) return [];
    return raceSlugs(newSlugs, s, ep, isMovie, titles, deadline);
  });
}
function extractStreams(tmdbId, mediaType, season, episode, titles) {
  return __async(this, null, function* () {
    if (!titles || titles.length === 0) return [];
    yield resolveBase();
    const deadline = Date.now() + MAX_BUDGET_MS;
    const candidates = yield findCandidates(tmdbId, mediaType, season, episode, titles, deadline);
    if (candidates.length === 0) {
      console.log("[Anime-Sama] No streams found");
      return [];
    }
    console.log("[Anime-Sama] Resolving " + candidates.length + " embeds...");
    const resolved = yield resolveStreams(candidates);
    console.log("[Anime-Sama] Resolved " + resolved.length + "/" + candidates.length + " streams");
    return resolved;
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
