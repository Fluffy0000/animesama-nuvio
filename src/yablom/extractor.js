// extractor.js — embed (sharecloudy/vromov/dotrab...) -> direct .m3u8/.mp4 + correct Referer

import { safeFetch, USER_AGENT, isOk } from "./http.js";

// find a direct video url in embed page text (handles escaped slashes too)
export function findVideoUrl(text) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  m = /https?:\/\/[^\s"'\\)]+\.mp4[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  e = /https?:\\\/\\\/[^\s"']*?\.mp4[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  return null;
}

// Build the Referer the CDN expects: the registrable domain of the media host.
// e.g. share86131.sharecloudy.com -> https://sharecloudy.com/  (more reliable than response.url, §1.2/§6)
export function refererFromMediaUrl(mediaUrl) {
  var hm = /^https?:\/\/([^/]+)/i.exec(mediaUrl);
  if (!hm) return null;
  var host = hm[1];
  var parts = host.split(".");
  var reg = parts.length >= 2 ? parts.slice(parts.length - 2).join(".") : host;
  return "https://" + reg + "/";
}

// Resolve an embed URL to { url, referer } or null.
// fetch() follows the (rotating) 301 to vromov/dotrab; if it stays on sharecloudy the referer still works.
// Retries once, since these CDNs occasionally throttle rapid repeated hits.
export async function resolveEmbed(embedUrl) {
  var media = null;
  for (var attempt = 0; attempt < 2 && !media; attempt++) {
    media = await resolveOnce(embedUrl);
  }
  if (!media) return null;
  var referer = refererFromMediaUrl(media) || "https://sharecloudy.com/";
  return { url: media, referer: referer };
}

async function resolveOnce(embedUrl) {
  var r = await safeFetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://yablom.com/" } }, 12000);
  if (!isOk(r)) return null;
  var html;
  try { html = await r.text(); } catch (e) { return null; }

  var media = findVideoUrl(html);

  // one level of nested iframe, just in case
  if (!media) {
    var fm = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    if (fm) {
      var r2 = await safeFetch(fm[1], { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } }, 12000);
      if (isOk(r2)) { try { media = findVideoUrl(await r2.text()); } catch (e) {} }
    }
  }
  return media || null;
}
