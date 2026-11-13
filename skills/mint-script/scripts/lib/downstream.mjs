// Local project interface checks. No sibling code imports.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { documentErrors, productionErrors } from './document.mjs';
export function readJsonStrict(file) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
}
const array = x => Array.isArray(x) ? x : [];
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function projectRoot(file, productionPath) {
  if (productionPath) return dirname(resolve(productionPath));
  const dir = dirname(resolve(file));
  return basename(dir) === 'script' ? dirname(dir) : dir;
}
export function stageFiles(root, stage) {
  const dir = join(root, stage);
  try { lstatSync(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return readdirSync(dir).filter(n => n.endsWith('.json') && !n.startsWith('.') && !/manifest|\.backup|\.bak|\.tmp/i.test(n)).sort().map(n => join(dir,n));
}
export function loadKnownUpstreams(root, explicit = {}) {
  const context = {};
  for (const [stage,key] of [['outline','outline'],['art','art'],['characters','cast']]) {
    if (Object.hasOwn(explicit, key)) continue;
    const files = stageFiles(root,stage);
    if (files.length > 1) throw new Error(`${stage}: multiple known inputs; run validate with an explicit --${key} before joint delivery: ${files.join(', ')}`);
    if (files.length) { context[key] = readJsonStrict(files[0]); context[`${key}Path`] = files[0]; }
  }
  return context;
}
export function checkKnownCreation(script, { root, production } = {}) {
  let files;
  try { files = stageFiles(root, 'creation'); } catch (error) { return [{ id: 'downstream-creation', category: 'base', level: 'error', status: 'fail', messages: [error.message] }]; }
  if (!files.length) return [{id:'downstream-creation',category:'base',level:'error',status:'skipped',reason:'not-applicable',messages:['No known creation JSON; no downstream interface was checked.']}];
  return files.map(file => {
    const messages = [];
    try {
      const doc = readJsonStrict(file);
      if (doc?.schemaVersion !== 3) messages.push('creation.schemaVersion must be 3');
      messages.push(...documentErrors(doc, 'creation'));
      if (production !== undefined) messages.push(...productionErrors(production, [['creation', doc]]));
      if (doc?.source !== script.source) messages.push('creation.source differs from script');
      if (!Array.isArray(doc?.episodes) || !doc.episodes.length) messages.push('creation.episodes must be a nonempty array');
      const tolerance = doc?.params?.tolerance ?? 0.15;
      if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance >= 1) messages.push('creation.params.tolerance must be finite and nonnegative');
      const seen = new Set(); let lastEp = 0;
      for (const ep of array(doc?.episodes)) {
        const upstream = array(script?.episodes).find(s => s?.ep === ep?.ep);
        if (!Number.isSafeInteger(ep?.ep) || ep.ep <= lastEp || seen.has(ep.ep)) messages.push('creation ep must be ordered unique positive integers');
        seen.add(ep?.ep); lastEp = ep?.ep;
        if (!upstream) { messages.push(`E${ep?.ep}: not in current script`); continue; }
        for (const key of ['opening', 'ending', 'endBeat']) if (Object.hasOwn(ep, key)) messages.push(`E${ep.ep}.${key}: not part of creation v3`);
        if (!equal(ep.openingBeat, upstream.openingBeat)) messages.push(`E${ep.ep}.openingBeat: stale script landing; never invent a missing opening`);
        if (!Array.isArray(ep.segments) || !ep.segments.length) messages.push(`E${ep.ep}.segments must be a nonempty array`);
        let seconds = 0;
        const cursors = new Map(), owned = new Set(), audioLast = new Map(); let lastScene = 0, cutIndex = 0;
        for (const seg of array(ep.segments)) {
          const index = seg?.sceneIndex, scene = array(upstream.scenes)[index-1];
          if (!Number.isSafeInteger(index) || index < 1 || !scene || index < lastScene) { messages.push(`E${ep.ep}: invalid/out-of-order sceneIndex`); continue; }
          lastScene = index;
          if (!Array.isArray(seg.cuts) || !seg.cuts.length) messages.push(`${seg.id}: cuts required`);
          for (const cut of array(seg.cuts)) {
            cutIndex++;
            if (typeof cut?.seconds !== 'number' || !Number.isFinite(cut.seconds) || cut.seconds <= 0) messages.push(`${seg.id}: cut seconds must be finite and positive`);
            else seconds += cut.seconds;
            if (Object.hasOwn(cut ?? {},'audioRefs')) {
              if (!Array.isArray(cut.audioRefs)) messages.push(`${seg.id}: audioRefs must be an array`);
              const refs = new Set();
              for (const ref of array(cut.audioRefs)) {
                const key = JSON.stringify(ref);
                const line = Array.isArray(ref) && ref.length === 2 && ref.every(n => Number.isSafeInteger(n) && n > 0) ? upstream.scenes?.[ref[0]-1]?.flow?.[ref[1]-1] : null;
                if (!line || typeof line.line !== 'string' || !line.line.trim() || !owned.has(key) || refs.has(key)) messages.push(`${seg.id}: audioRefs require a unique line occurrence owned by an earlier cut in this episode`);
                if (owned.has(key) && audioLast.get(key) !== cutIndex-1) messages.push(`${seg.id}: audioRefs cannot skip an intervening cut in the same playback`);
                audioLast.set(key,cutIndex);
                refs.add(key);
              }
            }
            const range = cut?.beats, next = cursors.get(index) ?? 1;
            if (!Array.isArray(range) || range.length !== 2 || !range.every(n => Number.isSafeInteger(n) && n > 0) || range[0] !== next || range[1] < range[0] || range[1] > array(scene.flow).length) messages.push(`${seg.id}: invalid, missing or repeated script beat range`);
            else { cursors.set(index, range[1]+1); for(let beat=range[0];beat<=range[1];beat++) {const key=JSON.stringify([index,beat]);owned.add(key);audioLast.set(key,cutIndex);} }
          }
        }
        for (const [i,scene] of array(upstream.scenes).entries()) if ((cursors.get(i+1) ?? 1) !== array(scene.flow).length+1) messages.push(`E${ep.ep} scene ${i+1}: incomplete beat coverage`);
        const epsilon = Number.EPSILON * Math.max(1, Math.abs(upstream.targetSeconds), Math.abs(seconds)) * 4;
        if (!Number.isFinite(seconds) || !Number.isFinite(upstream.targetSeconds) || upstream.targetSeconds <= 0 || seconds < upstream.targetSeconds*(1-tolerance)-epsilon || seconds > upstream.targetSeconds*(1+tolerance)+epsilon) messages.push(`E${ep.ep}: cut duration does not fit the current script target`);
      }
    } catch (e) { messages.push(`Unreadable downstream: ${e.message}`); }
    return {id:'downstream-creation',file,category:'base',level:'error',status:messages.length?'fail':'pass',messages,scope:'Interface only: version, identity, episode projection, target duration, exactly-once script beat ownership and earlier-line audio continuation. Model limits, assets and content still require creation validation/review.'};
  });
}
