function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.resolve([
    {
      name: "Anime-Sama",
      title: "Test - Ep " + (episode || 1),
      url: "https://video.sibnet.ru/shell.php?videoid=4826196",
      quality: "HD",
      headers: { "Referer": "https://anime-sama.to/", "User-Agent": "Mozilla/5.0" }
    }
  ]);
}
module.exports = { getStreams: getStreams };
