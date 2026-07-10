// extractor.js — embed hosts -> direct .m3u8/.mp4. Focus: vidzy (proven), generic fallback.

import { safeFetch, USER_AGENT } from "./http.js";

// Dean Edwards unpacker (pure JS, no eval)
function unpackPacked(src) {
  var m = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(src);
  if (!m) return "";
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var a = parseInt(m[2], 10);
  var c = parseInt(m[3], 10);
  var k = m[4].split("|");
  if (a > 62) return "";
  while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]); }
  return p;
}

function findVideoUrl(text) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  e = /https?:\\\/\\\/[^\s"']*?\.mp4[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  return null;
}

function originOf(url) {
  var m = /^(https?:\/\/[^/]+)/i.exec(url);
  return m ? m[1] : "";
}
function resolveRelative(base, rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf("//") === 0) return "https:" + rel;
  if (rel.charAt(0) === "/") { var m = /^(https?:\/\/[^/]+)/i.exec(base); return m ? m[1] + rel : rel; }
  var q = base.indexOf("?"); var clean = q >= 0 ? base.slice(0, q) : base;
  return clean.slice(0, clean.lastIndexOf("/") + 1) + rel;
}

var CODEC = { "avc1": "H.264", "hvc1": "H.265", "hev1": "H.265", "av01": "AV1" };
function codecLabel(s) {
  if (!s) return "";
  var m = /(avc1|hvc1|hev1|av01)/i.exec(s);
  return m ? CODEC[m[1].toLowerCase()] : "";
}
function heightToLabel(h) {
  if (h >= 2000) return "4K"; if (h >= 1000) return "1080p"; if (h >= 700) return "720p";
  if (h >= 460) return "480p"; if (h >= 300) return "360p"; return h ? h + "p" : "";
}

// Explode a master playlist into per-quality variants (anti-buffering, §7).
// Returns [{ url, quality, height, codec }]. If the master has no STREAM-INF, returns the master itself.
export async function explodeHls(masterUrl, referer) {
  var r = await safeFetch(masterUrl, { headers: { "User-Agent": USER_AGENT, "Referer": referer } }, 12000);
  if (!r || !r.ok) return [];
  var text; try { text = await r.text(); } catch (e) { return []; }
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
      url = ln; break;
    }
    if (!url) continue;
    var hm = /RESOLUTION=\d+x(\d+)/i.exec(attrs);
    var height = hm ? parseInt(hm[1], 10) : 0;
    var cm = /CODECS="([^"]*)"/i.exec(attrs);
    out.push({ url: resolveRelative(masterUrl, url), quality: heightToLabel(height), height: height, codec: codecLabel(cm ? cm[1] : "") });
  }
  if (!out.length) out.push({ url: masterUrl, quality: "", height: 0, codec: "" });
  return out;
}

// Resolve any embed to { kind, masterUrl, referer } or null.
// vidzy -> HLS ; others -> whatever direct file we can find (mp4/m3u8), best effort.
export async function resolveHost(hostKey, embedUrl) {
  var referer = originOf(embedUrl) + "/";
  var r = await safeFetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": referer } }, 12000);
  if (!r || !r.ok) return null;
  var html; try { html = await r.text(); } catch (e) { return null; }

  var unpacked = unpackPacked(html);
  var media = findVideoUrl(unpacked) || findVideoUrl(html);

  // one nested iframe level
  if (!media) {
    var fm = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    if (fm) {
      var r2 = await safeFetch(fm[1], { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } }, 12000);
      if (r2 && r2.ok) { try { var h2 = await r2.text(); media = findVideoUrl(unpackPacked(h2)) || findVideoUrl(h2); referer = originOf(fm[1]) + "/"; } catch (e) {} }
    }
  }
  if (!media) return null;
  var kind = /\.m3u8/i.test(media) ? "hls" : "mp4";
  return { kind: kind, masterUrl: media, referer: referer };
}

// MP4 liveness (progressive hosts): drop only on hard 4xx/5xx.
export async function mp4Alive(url, referer) {
  var r = await safeFetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT, "Referer": referer, "Range": "bytes=0-1" } }, 9000);
  if (!r) return true; // network hiccup: don't drop
  if (r.status === 403 || r.status === 404 || r.status === 410 || r.status >= 500) return false;
  return true;
}
