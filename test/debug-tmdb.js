// debug — trace each pipeline stage for voiranime
'use strict';
const KEY = '439c478a771f35c05022f9feabcca01c';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const [,, idArg, type, sA, eA] = process.argv;

function slugify(t){return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’\\]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}

(async () => {
  const kind = type === 'movie' ? 'movie' : 'tv';
  const id = parseInt(idArg, 10);
  const fr = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}?api_key=${KEY}&language=fr-FR`)).json();
  const en = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}?api_key=${KEY}&language=en-US`)).json();
  const alt = await (await fetch(`https://api.themoviedb.org/3/${kind}/${id}/alternative_titles?api_key=${KEY}`)).json();
  const titles = [fr.title||fr.name, fr.original_title||fr.original_name, en.title||en.name, en.original_title||en.original_name].filter(Boolean);
  const alts = (alt.titles||alt.results||[]).map(t=>t.title).filter(t=>/^[\x20-\x7EÀ-ſ ’'&+,:;.-]+$/.test(t)).slice(0,6);
  console.log('TITLES:', titles);
  console.log('ALT:', alts);
  const cands = titles.concat(alts).map(slugify);
  console.log('CAND SLUGS:', [...new Set(cands)]);

  // search
  const q = titles[0];
  for (const qq of [q, alts[0]].filter(Boolean)) {
    const r = await fetch('https://voir-anime.to/?post_type=wp-manga&s='+encodeURIComponent(qq), {headers:{'User-Agent':UA}});
    const html = await r.text();
    const re = /href="https?:\/\/voir-anime\.to\/anime\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?"[^>]*?(?:title="([^"]{2,120})")?/gi;
    let m, items=[];
    while((m=re.exec(html))!==null && items.length<10) items.push({slug:m[1], t:m[2]||''});
    console.log(`\nsearch "${qq}" -> ${html.length}o, items:`, items.slice(0,6));
  }
})().catch(e=>{console.error(e);process.exit(1)});
