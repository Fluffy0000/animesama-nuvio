/**
 * Anime-Sama Provider for Nuvio
 * getStreams(tmdbId, mediaType, season, episode) -> Promise<Array>
 */

import { extractStreams } from "./extractor.js";
import { slugify } from "./http.js";

const TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";

async function getTmdbTitles(tmdbId, mediaType, season) {
  const sp = mediaType === "tv" && season ? "&season=" + season : "";

  async function fetchLang(lang) {
    const url = TMDB_BASE + "/" + mediaType + "/" + tmdbId +
      "?api_key=" + TMDB_KEY + "&language=" + lang + sp +
      "&append_to_response=alternative_titles";
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const titles = [];
      if (data.name) titles.push(data.name);
      if (data.title) titles.push(data.title);
      if (data.original_name) titles.push(data.original_name);
      if (data.original_title) titles.push(data.original_title);
      if (data.alternative_titles?.titles) {
        for (const alt of data.alternative_titles.titles) titles.push(alt.title);
      }
      return titles;
    } catch (e) { return []; }
  }

  const [enTitles, frTitles] = await Promise.all([fetchLang("en-US"), fetchLang("fr-FR")]);

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
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    console.log("[Anime-Sama] " + mediaType + "/" + tmdbId +
      (mediaType === "tv" ? " S" + season + "E" + episode : ""));

    const titles = await getTmdbTitles(tmdbId, mediaType, season);
    if (titles.length === 0) return [];

    const streams = await extractStreams(tmdbId, mediaType, season || 1, episode || 1, titles);
    console.log("[Anime-Sama] => " + streams.length + " streams");
    return streams;
  } catch (e) {
    console.log("[Anime-Sama] Error: " + e.message);
    return [];
  }
}

export { getStreams };
