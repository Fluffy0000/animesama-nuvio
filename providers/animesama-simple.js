var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var REF = BASE_URL + "/";

function slugify(t) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function getPlayerName(u) {
  if (!u) return "Unknown";
  var l = u.toLowerCase();
  if (l.indexOf("sibnet") !== -1) return "Sibnet";
  if (l.indexOf("vidmoly") !== -1) return "Vidmoly";
  if (l.indexOf("sendvid") !== -1) return "Sendvid";
  if (l.indexOf("smoothpre") !== -1) return "Smoothpre";
  if (l.indexOf("oneupload") !== -1 || l.indexOf("uqload") !== -1) return "Uqload";
  return "Player";
}

function parseEpisodesJs(c) {
  if (!c) return [];
  var r = [], re = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*;/g, m;
  while ((m = re.exec(c)) !== null) {
    var urls = [], ure = /['"](https?:\/\/[^'"]+)['"]/g, um;
    while ((um = ure.exec(m[2])) !== null) { if (urls.indexOf(um[1]) === -1) urls.push(um[1]); }
    if (urls.length > 0) r.push({ n: m[1], u: urls });
  }
  return r;
}

function fetchJs(s, p, l) {
  var u = BASE_URL + "/catalogue/" + s;
  if (p) u += "/" + p;
  u += "/" + l + "/episodes.js";
  return fetch(u, { headers: { "User-Agent": UA, "Referer": REF } }).then(function(r) { return r.ok ? r.text() : null; }).catch(function() { return null; });
}

function trySlug(s, sn, ep) {
  var lgs = ["vostfr", "vf"], pts = ["saison" + sn, ""];
  return Promise.all(lgs.map(function(lg) {
    return Promise.all(pts.map(function(pt) {
      return fetchJs(s, pt, lg).then(function(js) {
        if (!js) return [];
        var pr = parseEpisodesJs(js), st = [];
        for (var i = 0; i < pr.length; i++) {
          if (pr[i].u.length >= ep) {
            var u = pr[i].u[ep - 1];
            if (u && u.indexOf("http") === 0) {
              st.push({ name: "Anime-Sama", title: getPlayerName(u) + " - Ep " + ep + " - " + lg.toUpperCase(), url: u, quality: "HD", headers: { "Referer": REF, "User-Agent": UA } });
            }
          }
        }
        return st;
      });
    }));
  })).then(function(rr) { var a = []; for (var i = 0; i < rr.length; i++) for (var j = 0; j < rr[i].length; j++) a = a.concat(rr[i][j]); return a; });
}

function getStreams(id, type, sn, ep) {
  console.log("[AS] " + type + "/" + id + " S" + sn + "E" + ep);
  return fetch("https://api.themoviedb.org/3/" + type + "/" + id + "?api_key=439c478a771f35c05022f9feabcca01c&language=en-US")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var tt = [];
      if (d.name) tt.push(d.name);
      if (d.original_name && d.original_name !== d.name) tt.push(d.original_name);
      var ss = [];
      for (var t = 0; t < tt.length; t++) { var sg = slugify(tt[t]); if (sg && ss.indexOf(sg) === -1) ss.push(sg); }
      function nx(i) { if (i >= ss.length) return []; return trySlug(ss[i], sn || 1, ep || 1).then(function(st) { if (st.length > 0) return st; return nx(i + 1); }); }
      return nx(0);
    }).catch(function(e) { return []; });
}

module.exports = { getStreams: getStreams };
