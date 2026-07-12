/* diag v2 — full-chain probe: site -> search -> film page -> embed host -> CDN .m3u8 */
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
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// diag/diag.js
var diag_exports = {};
__export(diag_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(diag_exports);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var HDRS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "identity"
};

function fakeStream(msg) {
  return {
    name: msg,
    title: msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG",
    language: "DIAG",
    provider: "DIAG",
    headers: { "User-Agent": UA }
  };
}

// tolerant fetch: returns { status, body } and never throws
function grab(url, options) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    try {
      var r = yield fetch(url, options || { headers: HDRS });
      var status = r ? (typeof r.status === "number" ? r.status : "?") : "null";
      var body = "";
      try { body = yield r.text(); } catch (e) { body = ""; }
      var ms = Date.now() - t0;
      return { status: status, body: body || "", ms: ms };
    } catch (e) {
      return { status: "THROW", body: "", ms: Date.now() - t0, err: (e && e.message ? e.message : String(e)) };
    }
  });
}

function tag(body) {
  var b = body || "";
  if (b.indexOf("Just a moment") !== -1 || b.indexOf("cf-browser-verification") !== -1 || b.indexOf("Attention Required") !== -1)
    return " [CLOUDFLARE-CHALLENGE]";
  return "";
}
function line(label, res, extra) {
  var s = label + ": HTTP " + res.status + " " + (res.body ? res.body.length : 0) + "o " + res.ms + "ms" + tag(res.body);
  if (res.err) s += " ERR=" + res.err;
  if (extra) s += " | " + extra;
  return s;
}

// --- minimal packed-JS unpacker (same as fs20/french-manga extractor) ---
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
function findM3u8(text) {
  var m = /https?:\/\/[^\s"'\\)]+\.m3u8[^\s"'\\)]*/i.exec(text); if (m) return m[0];
  var e = /https?:\\\/\\\/[^\s"']*?\.m3u8[^\s"']*/i.exec(text); if (e) return e[0].replace(/\\\//g, "/");
  return null;
}
function originOf(url) { var m = /^(https?:\/\/[^/]+)/i.exec(url); return m ? m[1] : ""; }

// ============================================================================
// RUNTIME PRIMITIVE TESTS — the shared http.js of the 3 broken providers relies
// on setTimeout callbacks firing (sleep in its retry loop) and on AbortController.
// Anime-Sama (which works) has NO retry/sleep. If setTimeout callbacks never fire
// in Nuvio's scraper sandbox, sleep() hangs forever -> retry loop freezes -> the
// provider never returns -> Nuvio kills it -> 0 streams. These probes prove it.
// ============================================================================
function runtimeTests(out) {
  return __async(this, null, function* () {
    // T1: does a setTimeout callback actually fire? We schedule it, then yield the
    // event loop by awaiting a REAL network round-trip (~200ms) — no microtask spin
    // that would starve the timer. If timers work, the flag flips during the fetch.
    var t1fired = false, t1threw = "";
    try { setTimeout(function () { t1fired = true; }, 100); } catch (e) { t1threw = String(e && e.message); }
    yield grab("https://fs20.lol/", { headers: HDRS });          // burns ~200ms of real loop time
    out.push(fakeStream("T1 setTimeout(100) after a real fetch: " + (t1threw ? ("THREW " + t1threw) : (t1fired ? "FIRED ✓" : "NEVER FIRED ✗ (timers dead -> sleep()/retry hangs)"))));

    // T2: does the shared sleep() (exact copy from the 3 providers) resolve?
    // Bounded yield loop: keep ceding the loop via real fetches until the sleep flag
    // flips or we give up. Can never hang the DIAG (bounded), robust to fetch speed.
    var t2done = false, t2t0 = Date.now();
    (function () {
      return new Promise(function (res) {
        try { if (typeof setTimeout === "function") { setTimeout(res, 300); return; } } catch (e) {}
        var end = Date.now() + 300; (function spin() { if (Date.now() >= end) return res(); Promise.resolve().then(spin); })();
      });
    })().then(function () { t2done = true; });
    for (var t2i = 0; t2i < 8 && !t2done; t2i++) { yield grab("https://fs20.lol/", { headers: HDRS }); }
    out.push(fakeStream("T2 shared sleep(300): " + (t2done ? ("RESOLVED in ~" + (Date.now() - t2t0) + "ms ✓") : "NOT resolved ✗ (retry loop would freeze here)")));

    // T3: AbortController present?
    out.push(fakeStream("T3 AbortController: " + (typeof AbortController === "function" ? "present ✓" : "ABSENT") + " | setTimeout: " + typeof setTimeout + " | clearTimeout: " + typeof clearTimeout));
  });
}

// ---- fetch-option isolation: which option makes Nuvio's fetch fail? ----
// The real providers add AbortController `signal` + `redirect:"follow"` to every request.
// DIAG uses a bare fetch. If a provider-style option throws/fails in Nuvio, providers return
// [] while DIAG works. These probes hit the SAME known-good URL 4 ways to find the culprit.
function styledFetch(url, useSignal, useRedirect) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var ctrl = null, tid = null, note = "";
    var o = { method: "GET", headers: { "User-Agent": UA, "Accept-Encoding": "identity" } };
    if (useRedirect) o.redirect = "follow";
    if (useSignal) {
      try { if (typeof AbortController === "function") { ctrl = new AbortController(); o.signal = ctrl.signal; } else note = "(no AbortController)"; }
      catch (e) { note = "(AbortController threw: " + (e && e.message) + ")"; }
      if (ctrl) { try { tid = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 9000); } catch (e) {} }
    }
    try {
      var r = yield fetch(url, o);
      try { if (tid !== null) clearTimeout(tid); } catch (e) {}
      var st = r ? (typeof r.status === "number" ? r.status : "?") : "null";
      var blen = 0; try { blen = (yield r.text()).length; } catch (e) {}
      return { status: st, ms: Date.now() - t0, note: note, len: blen };
    } catch (e) {
      try { if (tid !== null) clearTimeout(tid); } catch (e2) {}
      return { status: "THROW", ms: Date.now() - t0, note: note, err: (e && e.message ? e.message : String(e)) };
    }
  });
}
function isoLine(label, res) {
  var s = label + ": HTTP " + res.status + " " + (res.len || 0) + "o " + res.ms + "ms";
  if (res.note) s += " " + res.note;
  if (res.err) s += " ERR=" + res.err;
  return s;
}
function fetchIsolation(out) {
  return __async(this, null, function* () {
    var U = "https://fs20.lol/";
    out.push(fakeStream(isoLine("X1 bare fetch", yield styledFetch(U, false, false))));
    out.push(fakeStream(isoLine("X2 +redirect:follow", yield styledFetch(U, false, true))));
    out.push(fakeStream(isoLine("X3 +signal(Abort)", yield styledFetch(U, true, false))));
    out.push(fakeStream(isoLine("X4 +signal+redirect (=provider style)", yield styledFetch(U, true, true))));
  });
}

// ---- the real end-to-end chain for FRENCH-MANGA (an anime it has) ----
// Proves, inside Nuvio, whether French-Manga resolves an anime to a playable .m3u8.
function fmChain(out) {
  return __async(this, null, function* () {
    var base = "https://w16.french-manga.net";
    // 1. search a known anime
    var sres = yield grab(base + "/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": UA, "Accept-Encoding": "identity",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest", "Referer": base + "/"
      },
      body: "query=" + encodeURIComponent("The Irregular at Magic High School") + "&page=1"
    });
    // prefer the "saison-1" result, else first
    var newsId = null;
    var re = /location\.href='\/(\d+)-([^']*)'/g, mm;
    while ((mm = re.exec(sres.body)) !== null) {
      if (!newsId) newsId = mm[1];
      if (/saison-1\b/.test(mm[2])) { newsId = mm[1]; break; }
    }
    out.push(fakeStream(line("FM.A search", sres, newsId ? ("newsId=" + newsId) : "NO newsId")));
    if (!newsId) return;

    // 2. episodes API (JSON)
    var eres = yield grab(base + "/engine/ajax/manga_episodes_api.php?id=" + newsId, { headers: { "User-Agent": UA, "Referer": base + "/index.php?newsid=" + newsId } });
    var embed = null, lang = "";
    try {
      var j = JSON.parse(eres.body);
      var langs = ["vostfr", "vf", "vo"];
      for (var li = 0; li < langs.length && !embed; li++) {
        var d = j[langs[li]];
        if (!d) continue;
        var ep = d["1"];
        if (!ep) continue;
        for (var hk in ep) { if (ep[hk] && /^https?:\/\//.test(ep[hk]) && /vidzy/i.test(ep[hk])) { embed = ep[hk]; lang = langs[li]; break; } }
        if (!embed) { for (var hk2 in ep) { if (ep[hk2] && /^https?:\/\//.test(ep[hk2])) { embed = ep[hk2]; lang = langs[li]; break; } } }
      }
    } catch (e) {}
    out.push(fakeStream(line("FM.B episodes API", eres, embed ? (lang + " embed=" + embed.slice(0, 40)) : "NO episode-1 embed in JSON")));
    if (!embed) return;

    // 3. resolve the embed host -> m3u8
    var eref = originOf(embed) + "/";
    var vres = yield grab(embed, { headers: { "User-Agent": UA, "Referer": eref } });
    var m3u8 = findM3u8(unpackPacked(vres.body)) || findM3u8(vres.body);
    out.push(fakeStream(line("FM.C embed host", vres, m3u8 ? ("m3u8 FOUND " + m3u8.slice(0, 45)) : "m3u8 NOT extracted")));
    if (!m3u8) return;

    // 4. CDN playlist
    var cres = yield grab(m3u8, { headers: { "User-Agent": UA, "Referer": eref } });
    out.push(fakeStream(line("FM.D CDN master.m3u8", cres, cres.body.indexOf("#EXT") !== -1 ? "VALID playlist ✓ (French-Manga WORKS in Nuvio)" : "reachable but NOT a playlist")));
  });
}

// ---- the real end-to-end chain for fs20 (Oppenheimer) ----
function fs20Chain(out) {
  return __async(this, null, function* () {
    // 1. search
    var sres = yield grab("https://fs20.lol/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": UA, "Accept-Encoding": "identity",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest", "Referer": "https://fs20.lol/"
      },
      body: "query=oppenheimer&page=1"
    });
    var idm = /location\.href='\/(\d+)-/.exec(sres.body);
    var newsId = idm ? idm[1] : null;
    out.push(fakeStream(line("A.fs20 search", sres, newsId ? ("newsId=" + newsId) : "NO newsId parsed")));
    if (!newsId) return;

    // 2. film page -> vidzy embed
    var fres = yield grab("https://fs20.lol/index.php?newsid=" + newsId, { headers: { "User-Agent": UA, "Referer": "https://fs20.lol/" } });
    var em = /class="option"\s+data-url="([^"]+)"/.exec(fres.body);
    var embed = em ? em[1] : null;
    out.push(fakeStream(line("B.fs20 film page", fres, embed ? ("embed=" + embed.slice(0, 40)) : "NO embed parsed")));
    if (!embed) return;

    // 3. embed host page
    var eref = originOf(embed) + "/";
    var eres = yield grab(embed, { headers: { "User-Agent": UA, "Referer": eref } });
    var hasPacked = eres.body.indexOf("}(") !== -1 && /eval|p,a,c,k/.test(eres.body);
    out.push(fakeStream(line("C.vidzy embed", eres, hasPacked ? "packed-JS present" : "NO packed JS (host changed?)")));

    // 4. unpack -> m3u8
    var unpacked = unpackPacked(eres.body);
    var m3u8 = findM3u8(unpacked) || findM3u8(eres.body);
    out.push(fakeStream("D.vidzy unpack: " + (m3u8 ? ("m3u8 FOUND " + m3u8.slice(0, 50)) : "m3u8 NOT extracted (unpacker failed)")));
    if (!m3u8) return;

    // 5. fetch the real CDN master playlist — THIS is the actual video endpoint
    var cres = yield grab(m3u8, { headers: { "User-Agent": UA, "Referer": eref } });
    var isPlaylist = cres.body.indexOf("#EXT") !== -1;
    out.push(fakeStream(line("E.CDN master.m3u8", cres, isPlaylist ? "VALID playlist ✓ (playback should work)" : "reachable but NOT a playlist")));
  });
}

function run(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var out = [];
    // *** MOST IMPORTANT: runtime primitives the 3 broken providers depend on ***
    yield runtimeTests(out);
    // fetch-option isolation
    yield fetchIsolation(out);
    // real French-Manga chain for an anime it has (proves it in Nuvio)
    yield fmChain(out);
    // real fs20 movie chain
    yield fs20Chain(out);
    return out;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return run(tmdbId, mediaType, season, episode).catch(function (e) {
    return [fakeStream("DIAG crashed: " + (e && e.message ? e.message : e))];
  });
}
