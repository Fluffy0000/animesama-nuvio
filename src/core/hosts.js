// core/hosts.js — resolve an embed/player URL to a direct video { url, referer, name } | null
// All requests go DIRECT from the device. No proxy, no third-party relay, ever.

import { safeFetch, fetchText, CORE_UA, netIsOk } from "./net.js";
import { unpackPackers, findVideoUrl, findAllVideoUrls, findIframes,
         refererFromMediaUrl, hostOf, absUrl, baseOf,
         decodeHostCipher, isCipherHost, isTrollUrl } from "./text.js";

// ---- host classification ----------------------------------------------------
var HOST_RULES = [
  [/uqload|up4fun|up4load|upload42|uppom/i, { name: "Uqload",  kind: "packer" }],
  [/dood|ds2play|ds2video|d0o0d|dooodster|vidply/i, { name: "Dood", kind: "dood" }],
  [/voe\.|voemfr|voeunblk|v-o-e|sydney|jeffery|kenneth|callistan|metagnat|20demidistance|fraudsecond/i, { name: "Voe", kind: "voe" }],
  [/filemoon|moonmov/i, { name: "Filemoon", kind: "packer" }],
  [/vidmoly|vidmolyme/i, { name: "Vidmoly", kind: "generic" }],
  [/voembed|vmcld|myvidplay|vidcloud9/i, { name: "Voembed", kind: "generic" }],
  [/sharecloudy|ofbax|vromov|dotrab|ramcloud|cloudiest|nonwt/i, { name: "Sharecloudy", kind: "generic" }],
  [/sibnet/i, { name: "Sibnet", kind: "sibnet" }],
  [/sendvid/i, { name: "Sendvid", kind: "generic" }],
  [/luluvdo|lulu/i, { name: "Luluvdo", kind: "generic" }],
  [/vidzy/i, { name: "Vidzy", kind: "packer" }],
  [/fsvid/i, { name: "Fsvid", kind: "packer" }],
  [/getvid\.club/i, { name: "Getvid", kind: "getvid" }],
  [/streamtape/i, { name: "Streamtape", kind: "generic" }],
  [/mixdrop/i, { name: "Mixdrop", kind: "packer" }],
  [/smoothpre|amethyst/i, { name: "Smoothpre", kind: "generic" }],
  [/upns|fmx|serix/i, { name: "FMX", kind: "skip" }] // hash-fragment transport: not server-resolvable
];

function classify(embedUrl) {
  for (var i = 0; i < HOST_RULES.length; i++) {
    if (HOST_RULES[i][0].test(embedUrl)) return HOST_RULES[i][1];
  }
  return { name: prettyHostName(embedUrl), kind: "generic" };
}

function prettyHostName(embedUrl) {
  var h = hostOf(embedUrl);
  var parts = h.split(".");
  var reg = parts.length >= 2 ? parts[parts.length - 2] : h;
  return reg.charAt(0).toUpperCase() + reg.slice(1);
}

function pageHeaders(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

// ---- extraction from a fetched page -----------------------------------------
function extractFromText(html) {
  var u = findVideoUrl(html);
  if (u) return u;
  var unpacked = unpackPackers(html);
  for (var i = 0; i < unpacked.length; i++) {
    u = findVideoUrl(unpacked[i]);
    if (u) return u;
  }
  return null;
}

// fetch page text AND the final URL after redirects — the referer a CDN expects is the
// FINAL embed page origin (sharecloudy.com/iframe -> ofbax.com/iframe => referer ofbax.com)
async function fetchPage(url, referer, timeoutMs) {
  var r = await safeFetch(url, { headers: pageHeaders(referer) }, timeoutMs || 12000);
  if (!netIsOk(r)) return null;
  var finalUrl = url;
  try { if (typeof r.url === "string" && r.url.indexOf("http") === 0) finalUrl = r.url; } catch (e) {}
  try { return { html: await r.text(), finalUrl: finalUrl }; } catch (e) { return null; }
}

// generic: fetch page, hunt video url, follow one nested iframe if needed
async function genericResolve(embedUrl, referer, depth) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var media = extractFromText(pg.html);
  if (!media && depth < 2) {
    var frames = findIframes(pg.html);
    for (var i = 0; i < Math.min(frames.length, 3); i++) {
      var r = await genericResolve(frames[i], pg.finalUrl, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!media) return null;
  return { url: media, referer: baseOf(pg.finalUrl) + "/" || refererFromMediaUrl(media), embedFrom: pg.finalUrl };
}

// fsvid/vidzy : quand le host n'a pas la vidéo il sert un VOD court (intro ~18s). Une vraie
// master playlist a des variantes (EXT-X-STREAM-INF); une media playlist VOD courte = leurre.
async function playlistLooksReal(url, referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  var t = await fetchText(url, { headers: h }, 12000);
  if (!t || t.indexOf("#EXTM3U") < 0) return true;      // réseau capricieux -> on ne tue pas le stream
  if (t.indexOf("#EXT-X-STREAM-INF") >= 0) return true;
  if (t.indexOf("#EXT-X-ENDLIST") < 0) return true;
  var mm = t.match(/#EXTINF:[\d.]+/g) || [];
  var sum = 0;
  for (var i = 0; i < mm.length; i++) sum += parseFloat(mm[i].split(":")[1]) || 0;
  return sum >= 240;
}

// uqload/filemoon/vidzy/mixdrop: packed jwplayer configs
async function packerResolve(embedUrl, referer) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var unpacked = unpackPackers(pg.html);
  var media = null;
  // fsvid/vidzy: le vrai lien est chiffré (cipher hostname-xor); le .m3u8 en clair est un leurre.
  var cipherHost = isCipherHost(pg.finalUrl) || isCipherHost(embedUrl);
  if (cipherHost) {
    var chkHost = hostOf(pg.finalUrl) || hostOf(embedUrl);
    media = decodeHostCipher(unpacked.join("\n"), chkHost) || decodeHostCipher(pg.html, chkHost);
    if (media) {
      if (isTrollUrl(media)) return null;
      // Referer = origine de la page embed (ce qu'envoie le vrai player):
      // certains edges l'exigent (v6.vidzy.cc -> 403 sans), les autres l'acceptent (u14 -> 200).
      var cref = baseOf(pg.finalUrl) || baseOf(embedUrl) || "";
      if (cref) cref += "/";
      if (/\.m3u8/i.test(media) && !(await playlistLooksReal(media, cref))) return null;
      return { url: media, referer: cref, embedFrom: pg.finalUrl };
    }
  }
  for (var i = 0; i < unpacked.length; i++) {
    media = findVideoUrl(unpacked[i]);
    if (media) break;
  }
  if (!media) media = findVideoUrl(pg.html); // sometimes plain
  if (media && isTrollUrl(media)) media = null;
  if (!media) {
    var frames = findIframes(pg.html); // one nesting level
    for (var j = 0; j < Math.min(frames.length, 3) && !media; j++) {
      var pg2 = await fetchPage(frames[j], pg.finalUrl, 10000);
      if (pg2) media = extractFromText(pg2.html);
      if (media && isTrollUrl(media)) media = null;
      if (media) return { url: media, referer: baseOf(pg2.finalUrl) + "/", embedFrom: pg2.finalUrl };
    }
  }
  if (!media) return null;
  // packed hosts demand the (final) embed page origin as referer
  return { url: media, referer: baseOf(pg.finalUrl) + "/", embedFrom: pg.finalUrl };
}

// dood stream: /pass_md5 chain -> token URL
async function doodResolve(embedUrl, referer) {
  var html = await fetchText(embedUrl, { headers: pageHeaders(referer) }, 12000);
  if (!html) return null;
  var pm = /(\/pass_md5\/[^'"]+)/.exec(html);
  if (pm) {
    var passUrl = absUrl(embedUrl, pm[1]);
    var token = pm[1].split("/").pop();
    var r2 = await safeFetch(passUrl, { headers: pageHeaders(embedUrl) }, 10000);
    if (netIsOk(r2)) {
      var base = "";
      try { base = (await r2.text()).trim(); } catch (e) {}
      if (base && base.indexOf("http") === 0) {
        var rnd = "";
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 10; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
        return { url: base + rnd + "?token=" + token + "&expiry=" + Date.now(),
                 referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
      }
    }
  }
  // fallback: maybe a direct url is just lying in the page
  var media = extractFromText(html);
  if (media) return { url: media, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
  return null;
}

// voe: 'hls:' link or base64 prompt fallback (best effort; voe blocks datacenter IPs)
async function voeResolve(embedUrl, referer) {
  var html = await fetchText(embedUrl, { headers: pageHeaders(referer) }, 10000);
  if (!html) return null;
  var m = /['"]hls['"]\s*:\s*['"]([^'"]+)['"]/.exec(html);
  if (m && m[1].indexOf("http") === 0) return { url: m[1], referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
  m = /let\s+\w+\s*=\s*'([A-Za-z0-9+/=]{40,})'/.exec(html); // base64 m3u8 in var
  if (m) {
    try {
      var dec = atob(m[1]);
      if (dec.indexOf("http") === 0) return { url: dec, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
    } catch (e) {}
  }
  return genericResolve(embedUrl, referer, 0);
}

// sibnet: shell.php page holds player.src([{src: "/v/<hash>/<id>.mp4"}])
async function sibnetResolve(embedUrl, referer) {
  var pg = await fetchPage(embedUrl, referer, 12000);
  if (!pg) return null;
  var m = /player\.src\(\[\{src:\s*"([^"]+\.mp4[^"]*)"/i.exec(pg.html);
  if (!m) m = /src:\s*"([^"]+\.m3u8[^"]*)"/i.exec(pg.html);
  if (!m) return genericResolve(embedUrl, referer, 0);
  var u = m[1].indexOf("http") === 0 ? m[1] : absUrl(pg.finalUrl, m[1]);
  return { url: u, referer: "https://video.sibnet.ru/", embedFrom: pg.finalUrl };
}

// getvid.club/player/index.php?data=... : try page; if nothing, hex-decode data
async function getvidResolve(embedUrl, referer) {
  var r = await genericResolve(embedUrl, referer, 1);
  if (r) return r;
  var dm = /[?&]data=([0-9a-fA-F]{16,})/.exec(embedUrl);
  if (dm) {
    var hex = dm[1], s = "";
    for (var i = 0; i + 1 < hex.length && hex.length <= 6000; i += 2) {
      s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    if (s.indexOf("http") !== -1) {
      var u = findVideoUrl(s);
      if (u) return { url: u, referer: baseOf(embedUrl) + "/", embedFrom: embedUrl };
      var im = /https?:\/\/[^\s"'<>)]+/i.exec(s);
      if (im) return await genericResolve(im[0], embedUrl, 1);
    }
  }
  return null;
}

// ---- main entry --------------------------------------------------------------
// resolveEmbed(embedUrl, opts{ referer }) -> { url, referer, name } | null
async function resolveEmbed(embedUrl, opts) {
  if (!embedUrl) return null;
  if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
  if (embedUrl.indexOf("http") !== 0) return null;
  var referer = opts && opts.referer ? opts.referer : null;
  var cls = classify(embedUrl);
  try {
    var r = null;
    if (cls.kind === "skip") return null;
    else if (cls.kind === "dood") r = await doodResolve(embedUrl, referer);
    else if (cls.kind === "packer") r = await packerResolve(embedUrl, referer);
    else if (cls.kind === "voe") r = await voeResolve(embedUrl, referer);
    else if (cls.kind === "getvid") r = await getvidResolve(embedUrl, referer);
    else if (cls.kind === "sibnet") r = await sibnetResolve(embedUrl, referer);
    else r = await genericResolve(embedUrl, referer, 0);
    if (!r || !r.url) return null;
    if (!/\.(m3u8|mp4)(\?|#|$)/i.test(r.url)) return null; // sanity: real video file only
    return { url: r.url, referer: r.referer, name: cls.name };
  } catch (e) {
    return null;
  }
}

export { resolveEmbed, classify, prettyHostName };
