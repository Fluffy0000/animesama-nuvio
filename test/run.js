#!/usr/bin/env node
// Nuvio provider test harness — simulates the app calling getStreams,
// then LIVE-verifies every returned stream URL (status + real playlist/video payload).
// usage: node test/run.js <provider.js> <tmdbId> <movie|tv|anime> [season episode] [--noverify]
'use strict';
const { performance } = require('perf_hooks');

const [,, provPath, idArg, type, sArg, eArg, flag] = process.argv;
if (!provPath || !idArg || !type) {
  console.error('usage: node test/run.js <provider.js> <tmdbId> <movie|tv|anime> [season episode] [--noverify]');
  process.exit(2);
}
const tmdbId = parseInt(idArg, 10);
const season = sArg ? parseInt(sArg, 10) : undefined;
const episode = eArg ? parseInt(eArg, 10) : undefined;
const verify = flag !== '--noverify';

function withTimeout(promise, ms, tag) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(tag + ' timeout')), ms))]);
}

async function fetchM3U8(url, headers, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    const text = (await res.text()).slice(0, 2 * 1024 * 1024);
    return { status: res.status, text };
  } finally { clearTimeout(timer); }
}

function sumVodSeconds(text) {
  // null si ce n'est pas un VOD complet (pas d'ENDLIST -> live/event : on ne juge pas)
  if (!text.includes('#EXT-X-ENDLIST')) return null;
  const ms = text.match(/#EXTINF:([\d.]+)/g) || [];
  if (!ms.length) return null;
  return ms.reduce((a, l) => a + (parseFloat(l.split(':')[1]) || 0), 0);
}

function resolveVariant(master, line) {
  try {
    let u = new URL(line, master).href;
    if (!u.includes('?') && master.includes('?')) u += master.slice(master.indexOf('?'));
    return u;
  } catch { return null; }
}

async function verifyStream(s) {
  const baseHeaders = Object.assign({}, s.headers || {});
  try {
    if (/\.m3u8/i.test(s.url)) {
      // HLS : fetch COMPLET (pas de Range — il faut l'ENDLIST pour mesurer la durée)
      const m = await fetchM3U8(s.url, baseHeaders, 20000);
      let ok = m.status >= 200 && m.status < 400;
      let text = m.text;
      let note = `HTTP ${m.status}, ${text.length}o`;
      ok = ok && text.includes('#EXTM3U');
      if (!ok) return { ok, note: note + ' (PAS UN PLAYLIST!)' };
      let dur = null;
      if (text.includes('#EXT-X-STREAM-INF')) {
        // master -> suit la 1re variante et mesure le VOD
        const line = text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
        if (line) {
          const vu = resolveVariant(s.url, line);
          if (vu) {
            try {
              const v = await fetchM3U8(vu, baseHeaders, 20000);
              if (v.text.includes('#EXTM3U')) { dur = sumVodSeconds(v.text); note += ' → variante ✓'; }
            } catch { /* variante injoignable: on garde le master OK */ }
          }
        }
      } else {
        dur = sumVodSeconds(text);
      }
      if (dur != null) {
        const mm = Math.floor(dur / 60), ss = Math.round(dur % 60);
        note += ` (VOD ${mm}min${String(ss).padStart(2, '0')})`;
        if (dur < 240) { ok = false; note += ' ⚠️ TROP COURT — leurre/intro probable'; }
      }
      return { ok, note };
    }
    // mp4 : Range
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(s.url, { headers: Object.assign({ Range: 'bytes=0-8191' }, baseHeaders), signal: ctrl.signal, redirect: 'follow' });
      const buf = await res.arrayBuffer();
      let ok = res.status >= 200 && res.status < 400 && (res.status === 206 || buf.byteLength >= 1000);
      return { ok, note: `HTTP ${res.status}, ${buf.byteLength}o` + (res.status === 206 ? ' (range ✓)' : '') };
    } finally { clearTimeout(timer); }
  } catch (e) {
    return { ok: false, note: 'ERR ' + (e && e.message ? e.message : e) };
  }
}

(async () => {
  const t0 = performance.now();
  let mod;
  try { mod = require(require('path').resolve(provPath)); }
  catch (e) { console.log(`LOAD-FAIL ${provPath}: ${e.message}`); process.exit(1); }
  const getStreams = mod.getStreams || (mod.default && mod.default.getStreams);
  if (typeof getStreams !== 'function') { console.log('NO-EXPORT getStreams'); process.exit(1); }

  console.log(`\n=== ${provPath.split('/').pop()} :: getStreams(${tmdbId}, ${type}, ${season}, ${episode}) ===`);
  let streams;
  try { streams = await withTimeout(Promise.resolve(getStreams(tmdbId, type, season, episode)), 120000, 'getStreams'); }
  catch (e) { console.log(`THREW: ${e.message}`); process.exit(1); }
  const dt = ((performance.now() - t0) / 1000).toFixed(1);

  if (!Array.isArray(streams)) { console.log('NOT-ARRAY'); process.exit(1); }
  console.log(`-> ${streams.length} stream(s) en ${dt}s`);
  let good = 0;
  for (const s of streams) {
    let verdict = '';
    if (verify && s.url && !/DIAG/.test(s.quality || '')) {
      const v = await verifyStream(s);
      verdict = ` [${v.ok ? 'PLAYABLE' : 'KO'} — ${v.note}]`;
      if (v.ok) good++;
    } else if (verify) { good++; verdict = ' [diag row]'; }
    console.log(`  • ${s.name}\n      ${s.title}\n      ${(s.url || '').slice(0, 130)}${verdict}`);
  }
  const shapeOk = streams.every(s => s && typeof s.name === 'string' && typeof s.url === 'string');
  if (!shapeOk) console.log('  !! format de stream invalide (name/url manquants)');
  console.log(`RESULT: ${streams.length ? (verify ? `${good}/${streams.length} playable` : `${streams.length} found`) : 'EMPTY'}`);
  process.exit(streams.length ? 0 : 3);
})();
