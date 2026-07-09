// extractor.js - host resolvers (vidzy, luluvid + generic), HLS variant explosion
import { USER_AGENT, fetchText, safeFetch } from "./http.js";

// ---- Dean Edwards unpacker (pure JS, no eval) ----
export function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10); var c = parseInt(m[3], 10); var k = m[4].split("|");
  if (a > 62) return "";
  while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); }
  return p;
}

// ---- resolve relative urls without URL class ----
export function resolveRelative(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf("//") === 0) return "https:" + rel;
  if (rel.charAt(0) === "/") { var m = /^(https?:\/\/[^/]+)/i.exec(base); return m ? m[1] + rel : rel; }
  var q = base.indexOf("?"); var clean = q >= 0 ? base.slice(0, q) : base;
  return clean.slice(0, clean.lastIndexOf("/") + 1) + rel;
}

function originOf(url) {
  var m = /^(https?:\/\/[^/]+)/i.exec(url);
  return m ? m[1] : url;
}

// pull first .m3u8 or .mp4 URL out of text (already-unescaped or raw)
function findVideoUrl(text) {
  if (!text) return null;
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(text);
  if (m) return m[0];
  // handle escaped slashes: https:\/\/...\/master.m3u8
  var e = /https?:\\\/\\\/[^\s"'\\)]*?\.m3u8[^\s"']*/i.exec(text);
  if (e) return e[0].replace(/\\\//g, "/");
  return null;
}

// ---- host resolver: returns { masterUrl, referer, kind, externalSubs } or null ----
export async function resolveHost(hostKey, embedUrl) {
  var origin = originOf(embedUrl);
  var referer = origin + "/";
  var html;
  var r = await safeFetch(embedUrl, {
    headers: { "User-Agent": USER_AGENT, "Referer": referer, "Accept": "*/*" }
  }, 12000);
  if (!r || !r.ok) return null;
  // embeds redirect (e.g. luluvid.com -> luluvdo.com); prefer the final origin as referer
  if (r.url) { var fo = originOf(r.url); if (/^https?:\/\//i.test(fo)) { origin = fo; referer = origin + "/"; } }
  try { html = await r.text(); } catch (e) { return null; }

  var unpacked = unpackPacked(html);
  var searchIn = unpacked && unpacked.length ? unpacked : html;
  var video = findVideoUrl(searchIn);
  if (!video) video = findVideoUrl(html);
  if (!video) return null;

  var externalSubs = [];
  // vidzy serves subtitles as a separate VTT (srtproxy). lulu embeds subs inside the master.
  var vtt = /https?:\/\/[^\s"'\\)]+\.vtt[^\s"'\\)]*/i.exec(searchIn) || /https?:\/\/[^\s"'\\)]+\.vtt[^\s"'\\)]*/i.exec(html);
  if (vtt) externalSubs.push({ url: vtt[0], lang: "fr", language: "Français" });

  var kind = /\.m3u8/i.test(video) ? "hls" : "mp4";
  return { masterUrl: video, referer: referer, kind: kind, externalSubs: externalSubs };
}

// ---- quality / codec labels ----
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

// ---- turn an HLS master into playable stream descriptors ----
// Returns [{ url, quality, height, codec, hasSubs }]
export async function explodeHls(masterUrl, referer) {
  var text;
  try {
    text = await fetchText(masterUrl, {
      headers: { "User-Agent": USER_AGENT, "Referer": referer, "Accept": "*/*" }
    }, 12000);
  } catch (e) { return []; }
  if (text.indexOf("#EXT") < 0) return []; // dead / not a playlist

  var hasSubs = /#EXT-X-MEDIA:[^\n]*TYPE=SUBTITLES/i.test(text);

  // collect variants: STREAM-INF line + following url line
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
        url = u; i = j; break;
      }
      if (url) {
        variants.push({
          url: resolveRelative(masterUrl, url),
          height: height,
          quality: qualityFromHeight(height),
          codec: codecLabel(cod ? cod[1] : "")
        });
      }
    }
  }

  // If the master carries soft subtitles, keep the master as a single entry so the
  // player can load them (site masters are single-quality, no adaptive switching risk).
  if (hasSubs && variants.length >= 1) {
    var best = variants[0];
    for (var v = 1; v < variants.length; v++) if (variants[v].height > best.height) best = variants[v];
    return [{ url: masterUrl, quality: best.quality, height: best.height, codec: best.codec, hasSubs: true }];
  }

  if (variants.length >= 2) {
    variants.sort(function (a, b) { return b.height - a.height; });
    return variants.map(function (v) { return { url: v.url, quality: v.quality, height: v.height, codec: v.codec, hasSubs: false }; });
  }
  if (variants.length === 1) {
    var only = variants[0];
    return [{ url: only.url, quality: only.quality, height: only.height, codec: only.codec, hasSubs: false }];
  }
  // master was actually a media playlist (has #EXTINF but no STREAM-INF)
  if (/#EXTINF/i.test(text)) {
    return [{ url: masterUrl, quality: "", height: 0, codec: "", hasSubs: false }];
  }
  return [];
}

// ---- lenient liveness check for progressive mp4 ----
export async function mp4Alive(url, referer) {
  try {
    var r = await safeFetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, "Referer": referer, "Range": "bytes=0-1" }
    }, 9000);
    if (!r) return true; // network hiccup: don't drop
    if (r.status === 403 || r.status === 404 || r.status === 410 || r.status >= 500) return false;
    return true;
  } catch (e) { return true; }
}
