// core/net.js — safe fetch helpers (QuickJS / Hermes safe, no Node APIs, no timers dependency)

var CORE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// merge default browser-ish headers; caller headers win
function withDefaultHeaders(h) {
  h = h || {};
  if (!h["User-Agent"] && !h["user-agent"]) h["User-Agent"] = CORE_UA;
  if (!h["Accept"] && !h["accept"]) h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!h["Accept-Language"] && !h["accept-language"]) h["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  return h;
}

// single attempt with REAL timeout via Promise.race (Nuvio ignores AbortController)
function fetchOnce(url, opts, timeoutMs) {
  var ctrl = null;
  try { ctrl = new AbortController(); } catch (e) {}
  var o = { method: opts.method, headers: opts.headers, redirect: "follow" };
  if (opts.body !== undefined) o.body = opts.body;
  if (ctrl) o.signal = ctrl.signal;
  var p;
  try { p = fetch(url, o); } catch (e) { return Promise.resolve(null); }
  var fetchP = p.then(function (r) { return r; }, function () { return null; });
  if (typeof setTimeout === "function" && timeoutMs && timeoutMs > 0) {
    var timeoutP = new Promise(function (res) {
      setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} res(null); }, timeoutMs);
    });
    return Promise.race([fetchP, timeoutP]);
  }
  return fetchP;
}

function netIsOk(r) {
  if (!r) return false;
  if (typeof r.ok === "boolean") return r.ok;
  if (typeof r.status === "number" && r.status > 0) return r.status >= 200 && r.status < 400;
  return true;
}

// retry with small backoff, never on real 4xx (except 429)
async function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9000;
  var opts = { method: options.method || "GET", headers: withDefaultHeaders(options.headers), body: options.body };
  var delays = [600, 1600];
  var r = null;
  for (var attempt = 0; attempt <= delays.length; attempt++) {
    r = await fetchOnce(url, opts, timeoutMs);
    if (netIsOk(r)) return r;
    if (r && r.status >= 400 && r.status < 500 && r.status !== 429) return r;
    if (attempt < delays.length) await netSleep(delays[attempt]);
  }
  return r;
}

// no timer dependency: resolve immediately when setTimeout is missing
function netSleep(ms) {
  return new Promise(function (res) {
    try { if (typeof setTimeout === "function") { setTimeout(res, ms); return; } } catch (e) {}
    res();
  });
}

async function fetchText(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!netIsOk(r)) return null;
  try { return await r.text(); } catch (e) { return null; }
}
async function fetchJson(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!netIsOk(r)) return null;
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// simple sequential map with bounded parallelism (keeps sites calm)
async function mapLimit(arr, limit, fn) {
  var out = new Array(arr.length), idx = 0;
  async function worker() {
    while (idx < arr.length) { var i = idx++; out[i] = await fn(arr[i], i); }
  }
  var workers = [];
  for (var w = 0; w < Math.max(1, limit); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// headers de stream pour le player Nuvio : N'envoie Referer QUE s'il est non vide
// (certains CDN — fsvid/vidzy — 403 quand un Referer est présent, 200 sans).
function streamHeaders(referer) {
  var h = { "User-Agent": CORE_UA };
  if (referer) h["Referer"] = referer;
  return h;
}

export { CORE_UA, withDefaultHeaders, safeFetch, fetchText, fetchJson, netIsOk, netSleep, mapLimit, streamHeaders };
