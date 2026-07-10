// http.js — fs20.lol (French Stream: films + séries live-action). QuickJS + Hermes safe.

export var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// Domain can rotate; validate by content, never trust a redirect (QuickJS may not expose response.url).
var FALLBACK_HOSTS = [
  "https://fs20.lol",
  "https://french-stream.one",
  "https://french-stream.club"
];

function safeSetTimeout(fn, ms) { try { if (typeof setTimeout === "function") return setTimeout(fn, ms); } catch (e) {} return null; }
function safeClearTimeout(id) { try { if (id !== null && typeof clearTimeout === "function") clearTimeout(id); } catch (e) {} }

export function safeFetch(url, options, timeoutMs) {
  if (!options) options = {};
  if (!timeoutMs) timeoutMs = 9000;
  var ctrl = null, tid = null;
  try { ctrl = new AbortController(); } catch (e) {}
  if (ctrl) tid = safeSetTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
  var headers = options.headers || {};
  // browser-like header set (mirrors a working provider): passes soft Cloudflare bot rules,
  // and Accept-Encoding: identity avoids gzip the QuickJS fetch may not decode -> unreadable body.
  if (!headers["User-Agent"] && !headers["user-agent"]) headers["User-Agent"] = USER_AGENT;
  if (!headers["Accept"] && !headers["accept"]) headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!headers["Accept-Language"] && !headers["accept-language"]) headers["Accept-Language"] = "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  if (!headers["Accept-Encoding"] && !headers["accept-encoding"]) headers["Accept-Encoding"] = "identity";
  var opts = { method: options.method || "GET", headers: headers };
  if (options.body !== undefined) opts.body = options.body;
  if (ctrl) opts.signal = ctrl.signal;
  var p;
  try { p = fetch(url, opts); } catch (e) { safeClearTimeout(tid); return Promise.resolve(null); }
  return p.then(function (r) { safeClearTimeout(tid); return r; })
          .catch(function () { safeClearTimeout(tid); return null; });
}

export async function fetchText(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "err"));
  return r.text();
}
export async function fetchJson(url, o, t) {
  var r = await safeFetch(url, o, t);
  if (!r || !r.ok) return null;
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// ---- slug ----
var ACCENT_MAP = {
  "à":"a","á":"a","â":"a","ä":"a","ã":"a","å":"a",
  "é":"e","è":"e","ê":"e","ë":"e",
  "í":"i","ì":"i","î":"i","ï":"i",
  "ó":"o","ò":"o","ô":"o","ö":"o","õ":"o",
  "ú":"u","ù":"u","û":"u","ü":"u",
  "ç":"c","ñ":"n","œ":"oe","æ":"ae","ß":"ss","ý":"y","ÿ":"y"
};
export function stripAccents(s) {
  try { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch (e) {
    var o = "";
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); o += ACCENT_MAP[c] || ACCENT_MAP[c.toLowerCase()] || c; }
    return o;
  }
}
export function slugify(t) {
  return stripAccents(String(t).toLowerCase())
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function decodeEntities(s) {
  if (!s) return "";
  return s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à")
    .replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô").replace(/&icirc;/g, "î")
    .replace(/&ccedil;/g, "ç").replace(/&ucirc;/g, "û").replace(/&acirc;/g, "â")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// ---- domain resolution (content-validated) ----
var cachedBase = null;
async function probeBase(base) {
  var r = await safeFetch(base + "/", {}, 6000);
  if (!r || !r.ok) return false;
  try { var h = await r.text(); return h.indexOf("FRENCH STREAM") !== -1 || h.indexOf("engine/ajax") !== -1; }
  catch (e) { return false; }
}
export async function resolveBase() {
  if (cachedBase) return cachedBase;
  for (var i = 0; i < FALLBACK_HOSTS.length; i++) {
    if (await probeBase(FALLBACK_HOSTS[i])) { cachedBase = FALLBACK_HOSTS[i]; return cachedBase; }
  }
  cachedBase = FALLBACK_HOSTS[0];
  return cachedBase;
}

// ---- search: POST /engine/ajax/search.php ----
// Returns [{ newsId, title, year, season }]
export async function liveSearch(base, query) {
  var html;
  try {
    html = await fetchText(base + "/engine/ajax/search.php", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": base + "/"
      },
      body: "query=" + encodeURIComponent(query) + "&page=1"
    }, 12000);
  } catch (e) { return []; }
  var out = [];
  var re = /location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var title = decodeEntities(m[2]).trim();
    var ym = /\((\d{4})\)/.exec(title);
    var sm = /saison\s*(\d+)/i.exec(title);
    out.push({ newsId: m[1], title: title, year: ym ? ym[1] : null, season: sm ? parseInt(sm[1], 10) : null });
  }
  return out;
}

// ---- film detail page: /<newsid>-slug.html ----
// Returns [{ url, lang }]  (lang: "VF" | "VOSTFR")
export async function fetchFilmPlayers(base, newsId) {
  var html;
  try { html = await fetchText(base + "/index.php?newsid=" + newsId, { headers: { "User-Agent": USER_AGENT, "Referer": base + "/" } }, 12000); }
  catch (e) { return []; }
  var out = [];
  var re = /class="option"\s+data-url="([^"]+)"><span>([^<]*)</g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    var label = m[2].toUpperCase();
    var lang = /VOSTFR|VOST/.test(label) ? "VOSTFR" : "VF";
    // keep the precise variant word (TRUEFRENCH / FRENCH / VOSTFR) for a distinguishable label
    var vm = /(TRUEFRENCH|VF2|VFF|VFQ|FRENCH|VOSTFR|VO)/.exec(label);
    out.push({ url: url, lang: lang, variant: vm ? vm[1] : lang });
  }
  return out;
}

// ---- series episodes: /static/series/<newsid>.js (JSON, disguised asset) ----
// Returns { vf:{ep:{host:url}}, vostfr:{...}, vo:{...} } or null
export async function fetchSeriesEpisodes(base, newsId) {
  var v = Math.floor(Date.now() / 30000);
  var paths = [
    "/static/series/" + newsId + ".js?v=" + v,
    "/data/eps_" + newsId + ".txt?v=" + v,
    "/ep-data.php?id=" + newsId + "&format=js&v=" + v
  ];
  for (var i = 0; i < paths.length; i++) {
    var j = await fetchJson(base + paths[i], { headers: { "User-Agent": USER_AGENT, "Referer": base + "/index.php?newsid=" + newsId } }, 12000);
    if (j && (j.vf || j.vostfr || j.vo)) return j;
  }
  return null;
}
