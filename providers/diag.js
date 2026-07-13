/* diag v14 — "référencement" probe. Uses the REAL tmdbId Nuvio passes. Shows, for THIS title,
   whether fs20/yablom have it (search hit) and whether the title MATCH score passes. Always ONE row. */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: true });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var diag_exports = {};
__export(diag_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(diag_exports);

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var TMDB = "439c478a771f35c05022f9feabcca01c";
var VERSION = "DIAG v14 (referencement)";

function row(msg) {
  return { name: VERSION + " | " + msg, title: VERSION + " | " + msg,
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "DIAG", language: "DIAG", provider: "DIAG", headers: { "User-Agent": UA } };
}
var ACCENT = {"à":"a","á":"a","â":"a","ä":"a","é":"e","è":"e","ê":"e","ë":"e","î":"i","ï":"i","ô":"o","ö":"o","û":"u","ü":"u","ç":"c","ñ":"n","œ":"oe","æ":"ae"};
function strip(s){ try { return s.normalize("NFD").replace(/[̀-ͯ]/g,""); } catch(e){ var o=""; for(var i=0;i<s.length;i++){ var c=s.charAt(i); o+=ACCENT[c]||ACCENT[c.toLowerCase()]||c; } return o; } }
function slug(t){ return strip(String(t).toLowerCase()).replace(/['’\\]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function baseSlug(t){ return slug(String(t).replace(/\s*\(\d{4}\)\s*$/,"").replace(/[-–]\s*saison\s*\d+.*$/i,"")); }
function score(siteTitle, candSlug, tmdbYear, siteYear){
  var s = baseSlug(siteTitle); if(!s) return -1;
  var base = -1;
  if (s === candSlug) base = 100;
  else if (s.length>4 && candSlug.length>4 && (s.indexOf(candSlug)===0 || candSlug.indexOf(s)===0)) base = 55;
  if (base<0) return -1;
  if (tmdbYear && siteYear) base += (tmdbYear===siteYear?12:-20);
  return base;
}
function tGet(url){ return fetch(url,{headers:{"User-Agent":UA}}).then(function(r){return r.text();},function(){return "";}); }

function check(tmdbId, mediaType){
  return __async(this,null,function*(){
    var kind = mediaType==="tv"?"tv":"movie";
    // TMDB titles + year
    var titles=[], year=null, seen={};
    var langs=["fr-FR","en-US"];
    for(var li=0; li<langs.length; li++){
      var t=""; try{ t = yield tGet("https://api.themoviedb.org/3/"+kind+"/"+tmdbId+"?api_key="+TMDB+"&language="+langs[li]); }catch(e){}
      var d=null; try{ d=JSON.parse(t); }catch(e){}
      if(!d) continue;
      if(!year){ var rd=d.release_date||d.first_air_date||""; var ym=/^(\d{4})/.exec(rd); if(ym) year=ym[1]; }
      var names=[d.title,d.name,d.original_title,d.original_name];
      for(var n=0;n<names.length;n++){ if(names[n]){ var k=slug(names[n]); if(k&&!seen[k]){ seen[k]=1; titles.push(names[n]); } } }
    }
    if(!titles.length) return "TMDB=FAIL(id="+tmdbId+" type="+mediaType+") <- Nuvio passe peut-etre un id non-TMDB";
    var candSlugs=[]; for(var c=0;c<titles.length;c++) candSlugs.push(slug(titles[c]));
    var head = 'TMDB="'+titles[0]+'"('+(year||"?")+")";

    // fs20 search + score
    var fs="";
    try{
      var body="query="+encodeURIComponent(titles[0])+"&page=1";
      var h1 = yield fetch("https://fs20.lol/engine/ajax/search.php",{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded","X-Requested-With":"XMLHttpRequest","Referer":"https://fs20.lol/","Cookie":"fsschal=1"},body:body}).then(function(r){return r.text();});
      var items=[], re=/location\.href='\/(\d+)-[^']*'[\s\S]*?search-title'>([^<]*)</g, m;
      while((m=re.exec(h1))!==null){ var ti=m[2].replace(/&#0?39;/g,"'").replace(/&amp;/g,"&"); var ym=/\((\d{4})\)/.exec(ti); items.push({title:ti,year:ym?ym[1]:null}); }
      if(!items.length) fs="fs20:ABSENT(search=0)";
      else{
        var best=-1,bt="";
        for(var i=0;i<items.length;i++){ for(var cs=0;cs<candSlugs.length;cs++){ var sc=score(items[i].title,candSlugs[cs],year,items[i].year); if(sc>best){best=sc;bt=items[i].title;} } }
        fs="fs20:search="+items.length+' best="'+bt+'"score='+best+(best>=90?" MATCH":" REJECTED(<90)");
      }
    }catch(e){ fs="fs20:THREW:"+(e&&e.message?e.message:e); }

    // yablom search + score (movies only)
    var ya="";
    if(kind==="movie"){
      try{
        var yt = yield fetch("https://yablom.com/euvcw7/api_search.php?searchword="+encodeURIComponent(titles[0]),{headers:{"User-Agent":UA,"Cookie":"g=true"}}).then(function(r){return r.text();});
        var yj=null; try{ yj=JSON.parse(yt); }catch(e){}
        if(!yj||!yj.films) ya="yablom:api-fail";
        else if(!yj.films.length) ya="yablom:ABSENT(search=0)";
        else{
          var yb=-1,ybt="";
          for(var f=0;f<yj.films.length;f++){ var ft=String(yj.films[f].title||""); var fym=/\((\d{4})\)/.exec(ft); var fy=fym?fym[1]:null; for(var cs2=0;cs2<candSlugs.length;cs2++){ var sc2=score(ft,candSlugs[cs2],year,fy); if(sc2>yb){yb=sc2;ybt=ft;} } }
          ya="yablom:search="+yj.films.length+' best="'+ybt+'"score='+yb+(yb>=90?" MATCH":" REJECTED(<90)");
        }
      }catch(e){ ya="yablom:THREW:"+(e&&e.message?e.message:e); }
    } else ya="yablom:skip(tv)";

    return head+" | "+fs+" | "+ya;
  });
}

function getStreams(tmdbId, mediaType, season, episode){
  return check(tmdbId, mediaType).then(function(msg){ return [row(msg)]; }, function(e){ return [row("CRASH "+(e&&e.message?e.message:e))]; });
}
