// debug the voiranime selection flow step by step
'use strict';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const KEY = '439c478a771f35c05022f9feabcca01c';
const [,, idArg, type] = process.argv;
const stripAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = t => stripAccents(String(t).toLowerCase()).replace(/['’\\]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

function buildQueries(titles) {
  const seen = {}, out = [], STOP = {the:1,les:1,des:1,une:1,and:1,for:1,sur:1,aux:1,avec:1,dans:1,movie:1,film:1,an:1,en:1};
  const push = q => { q=String(q||'').trim(); if(q.length<2)return; const k=q.toLowerCase(); if(seen[k])return; seen[k]=1; out.push(q); };
  const pool = [];
  for (const t of titles) {
    const toks = String(t).match(/[A-Za-z0-9À-ſ]+/g) || [];
    if (!toks.length) continue;
    push(t);
    if (toks.length>=3) push(toks.slice(0,3).join(' '));
    if (toks.length>=2) push(toks.slice(0,2).join(' '));
    for (const w of toks) if (w.length>=5 && !STOP[w.toLowerCase()] && !/^\d+$/.test(w)) pool.push(w);
  }
  pool.sort((a,b)=>b.length-a.length);
  pool.slice(0,4).forEach(push);
  return out.slice(0,8);
}

function animeResults(html) {
  const out = [], seen = {}; let m, a;
  const r1 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"([^>]*)>/gi;
  while ((m = r1.exec(html)) !== null) {
    const s = m[1].toLowerCase();
    if (s === 'feed' || seen[s]) continue;
    seen[s] = 1;
    const tm = /title="([^"]{2,140})"/i.exec(m[2] || '');
    out.push({ slug: s, title: tm ? tm[1].replace(/\s+/g,' ').trim() : '' });
  }
  const r2 = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,140})</gi;
  while ((a = r2.exec(html)) !== null) {
    const s2 = a[1].toLowerCase(); if (s2==='feed') continue;
    const txt = a[2].replace(/\s+/g,' ').trim();
    for (const o of out) if (o.slug===s2 && !o.title && txt && !/^(lire|voir|ep|episode)/i.test(txt)) o.title = txt;
    if (!seen[s2]) { seen[s2]=1; out.push({slug:s2,title:txt}); }
  }
  return out;
}

(async () => {
  const kind = type==='movie'?'movie':'tv', id=parseInt(idArg,10);
  const fr = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}?api_key=${KEY}&language=fr-FR`)).json();
  const en = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}?api_key=${KEY}&language=en-US`)).json();
  const alt = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}/alternative_titles?api_key=${KEY}`)).json();
  const titles = [fr.title||fr.name, en.title||en.name, fr.original_title||fr.original_name].filter(Boolean);
  const alts = (alt.titles||alt.results||[]).map(t=>t.title).filter(t=>/^[ -~À-ſ ’'&+,:;.-]+$/.test(t)).slice(0,12);
  const cands = titles.concat(alts);
  const tokens = {};
  for (const t of cands) for (const w of stripAccents(t.toLowerCase()).replace(/[^a-z0-9 ]+/g,' ').split(/\s+/)) if (w.length>=4) tokens[w]=1;
  const tk = Object.keys(tokens);
  console.log('TOKEN SET:', tk);
  const queries = buildQueries(cands);
  console.log('QUERIES:', queries);
  const year = (fr.release_date||fr.first_air_date||'').slice(0,4);
  console.log('YEAR:', year);

  const candSlugs = [], seen = {};
  for (const q of queries) {
    const r = await fetch('https://voir-anime.to/?post_type=wp-manga&s='+encodeURIComponent(q), {headers:{'User-Agent':UA}});
    const sh = await r.text();
    const items = animeResults(sh);
    console.log(`q="${q}" -> ${items.length} items:`, items.slice(0,5));
    for (const it of items) { if (!seen[it.slug] && candSlugs.length<10) { seen[it.slug]=1; candSlugs.push(it); } }
  }
  console.log('\nCANDIDATES:', candSlugs);
  for (const c of candSlugs.slice(0,5)) {
    const r = await fetch(`https://voir-anime.to/anime/${c.slug}/`, {headers:{'User-Agent':UA}});
    const page = await r.text();
    const p = stripAccents(page.toLowerCase());
    const hits = tk.filter(t=>p.includes(t));
    const cov = tk.length ? hits.length/tk.length : 0;
    const hasYear = year && p.includes(year);
    console.log(`verify ${c.slug}: cov=${cov.toFixed(2)} hits=[${hits.join(',')}] year=${hasYear} score=${Math.round(60*cov)+(hasYear?25:0)}`);
  }
})().catch(e=>{console.error(e);process.exit(1)});
