/**
 * HTTP utilities for Anime-Sama Nuvio provider
 */

export const BASE_URL = "https://anime-sama.to";
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

// setTimeout does not exist in every runtime (Nuvio Desktop's QuickJS has none) —
// always go through these guards instead of calling it directly.
export function safeSetTimeout(fn, ms) {
  try { if (typeof setTimeout === "function") return setTimeout(fn, ms); } catch (e) {}
  return null;
}

export function safeClearTimeout(id) {
  try { if (id !== null && typeof clearTimeout === "function") clearTimeout(id); } catch (e) {}
}

export function safeFetch(url, options = {}, timeoutMs = 8000) {
  let controller = null, tid = null;
  try { controller = new AbortController(); } catch (e) { controller = null; }
  if (controller) {
    tid = safeSetTimeout(() => { try { controller.abort(); } catch (e) {} }, timeoutMs);
  }
  const opts = { method: "GET", headers: DEFAULT_HEADERS, ...options };
  if (controller) { opts.signal = controller.signal; }
  let p;
  try { p = fetch(url, opts); }
  catch (e) { safeClearTimeout(tid); return Promise.resolve(null); }
  return p
    .then(res => { safeClearTimeout(tid); return res; })
    .catch(() => { safeClearTimeout(tid); return null; });
}

export async function fetchText(url, options = {}, timeoutMs = 8000) {
  const res = await safeFetch(url, options, timeoutMs);
  if (!res || !res.ok) {
    throw new Error("HTTP " + (res ? res.status : "error") + " for " + url);
  }
  return await res.text();
}

export async function searchSlugs(query) {
  try {
    const html = await fetchText(BASE_URL + "/template-php/defaut/fetch.php", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, "Content-Type": "application/x-www-form-urlencoded", "Referer": BASE_URL },
      body: "query=" + encodeURIComponent(query)
    }, 8000);
    const slugs = [], seen = {};
    const regex = /href="\/catalogue\/([a-z0-9][a-z0-9-]*)\/?"/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const slug = match[1];
      if (!seen[slug] && slug.length > 1) { seen[slug] = true; slugs.push(slug); }
    }
    console.log("[Anime-Sama] Search: " + slugs.length + " slugs for '" + query + "'");
    return slugs;
  } catch (e) {
    console.log("[Anime-Sama] Search failed: " + e.message);
    return [];
  }
}

export async function fetchEpisodesJs(slug, seasonPath, lang) {
  let url = BASE_URL + "/catalogue/" + slug;
  if (seasonPath) url += "/" + seasonPath;
  url += "/" + lang + "/episodes.js";
  try { return await fetchText(url, {}, 8000); }
  catch (e) { return null; }
}

export function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
