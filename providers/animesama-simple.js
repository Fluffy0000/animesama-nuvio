var BASE_URL = "https://anime-sama.to";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

function slugify(t) {
  var M = {"à":"a","â":"a","ä":"a","á":"a","ã":"a","å":"a","æ":"ae","ç":"c","è":"e","é":"e","ê":"e","ë":"e","ì":"i","î":"i","ï":"i","í":"i","ñ":"n","ò":"o","ô":"o","ö":"o","ó":"o","õ":"o","ø":"o","ù":"u","û":"u","ü":"u","ú":"u","ý":"y","ÿ":"y","À":"a","Â":"a","Ä":"a","Á":"a","Ã":"a","Å":"a","Æ":"ae","Ç":"c","È":"e","É":"e","Ê":"e","Ë":"e","Ì":"i","Î":"i","Ï":"i","Í":"i","Ñ":"n","Ò":"o","Ô":"o","Ö":"o","Ó":"o","Õ":"o","Ø":"o","Ù":"u","Û":"u","Ü":"u","Ú":"u","Ý":"y","Ÿ":"y","ß":"ss"};
  var r = "";
  for (var i = 0; i < t.length; i++) r += M[t[i]] || t[i];
  return r.replace(/['\u2019]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();
}

function isAllowedHost(url) {
  var h = getHostname(url);
  return h.indexOf("sibnet") !== -1;
}

function getHostname(url) {
  var m = url.match(/https?:\/\/([^\/:?#]+)/);
  return m ? m[1].toLowerCase() : "";
}

function normalizeUrl(raw) {
  if (!raw) return "";
  var u = String(raw).trim();
  if (u.indexOf("http://")!==0 && u.indexOf("https://")!==0) return "";
  var h = u.indexOf("#"); if (h!==-1) u = u.substring(0,h);
  u = u.replace(/\/\/vidmoly\.to\//,"//vidmoly.biz/").replace(/\/\/vidmoly\.net\//,"//vidmoly.biz/");
  return u;
}

function getPlayerName(url) {
  if (!url) return "Unknown";
  var l = url.toLowerCase();
  if (l.indexOf("sibnet")!==-1) return "Sibnet";
  if (l.indexOf("vidmoly")!==-1) return "Vidmoly";
  if (l.indexOf("sendvid")!==-1) return "Sendvid";
  if (l.indexOf("smoothpre")!==-1) return "Smoothpre";
  if (l.indexOf("oneupload")!==-1||l.indexOf("uqload")!==-1) return "Uqload";
  return "Player";
}

function parseEpisodesJs(c) {
  if (!c) return [];
  var r = [], re = /var\s+([a-zA-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*;/g, m;
  while ((m = re.exec(c)) !== null) {
    var uu = [], ure = /['"](https?:\/\/[^'"]+)['"]/g, um;
    while ((um = ure.exec(m[2])) !== null) {
      var n = normalizeUrl(um[1]);
      if (n && isAllowedHost(n) && uu.indexOf(n)===-1) uu.push(n);
    }
    if (uu.length > 0) r.push({ n: m[1], u: uu });
  }
  return r;
}

function fetchJs(slug, sp, lang) {
  var url = BASE_URL + "/catalogue/" + slug;
  if (sp) url += "/" + sp;
  url += "/" + lang + "/episodes.js";
  return fetch(url, { headers: { "User-Agent": UA, "Referer": BASE_URL+"/" } })
    .then(function(r) { return r.ok ? r.text() : null; })
    .catch(function() { return null; });
}

function resolveSibnet(embedUrl) {
  return fetch(embedUrl, { headers: { "User-Agent": UA, "Referer": BASE_URL+"/" } })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var m = html.match(/src:\s*"(\/v\/[^"]+\.mp4)"/);
      if (m) return "https://video.sibnet.ru" + m[1];
      return embedUrl;
    })
    .catch(function() { return embedUrl; });
}

function tryOne(slug, season, episode, isMovie) {
  var paths = isMovie ? ["film"] : ["saison"+season, ""];
  var langs = ["vostfr", "vf"];
  var all = [];
  for (var p = 0; p < paths.length; p++) {
    for (var l = 0; l < langs.length; l++) {
      (function(pt, lg) {
        all.push(
          fetchJs(slug, pt, lg).then(function(js) {
            if (!js) return [];
            var parsed = parseEpisodesJs(js);
            if (parsed.length===0) return [];
            var best = null;
            for (var k = 0; k < parsed.length; k++) { if (parsed[k].u.length>0) { best=parsed[k]; break; } }
            if (!best) best=parsed[0];
            if (best.u.length < episode) return [];
            var embedUrl = best.u[episode-1];
            if (!embedUrl) return [];
            return resolveSibnet(embedUrl).then(function(directUrl) {
              return [{
                name: "Anime-Sama",
                title: "Sibnet - Ep "+episode+" - "+lg.toUpperCase(),
                url: directUrl,
                quality: "HD",
                headers: { "Referer": BASE_URL+"/", "User-Agent": UA }
              }];
            });
          })
        );
      })(paths[p], langs[l]);
    }
  }
  return Promise.all(all).then(function(rr) { var x=[]; for (var i=0;i<rr.length;i++) x=x.concat(rr[i]); return x; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var sn=season||1, ep=episode||1, isMovie=mediaType==="movie";
  return fetch("https://api.themoviedb.org/3/"+(isMovie?"movie":"tv")+"/"+tmdbId+"?api_key=439c478a771f35c05022f9feabcca01c&language=en-US")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var tl=[];
      if (d.name) tl.push(d.name);
      if (d.original_name&&d.original_name!==d.name) tl.push(d.original_name);
      if (d.title&&tl.indexOf(d.title)===-1) tl.push(d.title);
      var ss=[];
      for (var t=0;t<tl.length;t++){var sg=slugify(tl[t]);if(sg&&ss.indexOf(sg)===-1)ss.push(sg);}
      function nx(i){if(i>=ss.length)return[];return tryOne(ss[i],sn,ep,isMovie).then(function(s){if(s.length>0)return s;return nx(i+1);});}
      return nx(0);
    }).catch(function(){return[];});
}

module.exports = { getStreams: getStreams };
