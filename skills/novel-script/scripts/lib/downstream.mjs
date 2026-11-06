// Local project-JSON interface checks after explicit application. No sibling code imports.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { validateSelection } from './creative.mjs';
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
  return readdirSync(dir).filter(n => n.endsWith('.json') && !n.startsWith('.') && !/manifest|\.backup|\.bak|\.tmp|\.review/i.test(n)).sort().map(n => join(dir,n));
}
export function loadKnownUpstreams(root) {
  const context = {};
  for (const [stage,key] of [['outline','outline'],['art','art'],['characters','cast']]) {
    const files = stageFiles(root,stage);
    if (files.length > 1) throw new Error(`${stage}: multiple known inputs; run validate with an explicit --${key} before joint delivery: ${files.join(', ')}`);
    if (files.length) context[key] = JSON.parse(readFileSync(files[0], 'utf8'));
  }
  return context;
}
export function checkKnownCreation(script, { root, production } = {}) {
  const files = stageFiles(root, 'creation');
  if (!files.length) return [{id:'downstream-creation',category:'base',level:'error',status:'skipped',reason:'not-applicable',messages:['No known creation JSON; no downstream interface was checked.']}];
  return files.map(file => {
    const messages = [];
    try {
      const doc = JSON.parse(readFileSync(file,'utf8'));
      if (doc?.schemaVersion !== 2) messages.push('creation.schemaVersion must be 2');
      if (doc?.source !== script.source) messages.push('creation.source differs from script');
      if (!Array.isArray(doc?.episodes) || !doc.episodes.length) messages.push('creation.episodes must be a nonempty array');
      const tolerance = doc?.params?.tolerance;
      if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) messages.push('creation.params.tolerance must be finite and nonnegative');
      const selection = production?.creative?.selection ?? script?.creativeContext?.selection;
      if (selection) {
        const actual = doc?.creativeContext?.selection;
        messages.push(...validateSelection(actual));
        if (['genre','narrativeStyle','structure','pacing'].some(k => actual?.[k]?.id !== selection[k]?.id || actual?.[k]?.version !== selection[k]?.version)) messages.push('creation creative selection is stale');
      }
      const seen = new Set();
      for (const ep of array(doc?.episodes)) {
        const upstream = array(script?.episodes).find(s => s?.ep === ep?.ep);
        if (!Number.isSafeInteger(ep?.ep) || ep.ep <= 0 || seen.has(ep.ep)) messages.push('creation ep must be unique positive integers');
        seen.add(ep?.ep);
        if (!upstream) { messages.push(`E${ep?.ep}: not in current script`); continue; }
        for (const key of ['opening','openingBeat','endBeat']) if (!equal(ep[key],upstream[key])) messages.push(`E${ep.ep}.${key}: stale script projection`);
        if (ep?.ending?.mode !== upstream.ending?.mode || ep?.ending?.event !== upstream.ending?.event) messages.push(`E${ep.ep}.ending: stale script projection`);
        if (!Array.isArray(ep.segments) || !ep.segments.length) messages.push(`E${ep.ep}.segments must be a nonempty array`);
        let seconds = 0;
        const cursors = new Map(); let lastScene = 0;
        for (const seg of array(ep.segments)) {
          const index = seg?.sceneIndex, scene = array(upstream.scenes)[index-1];
          if (!Number.isSafeInteger(index) || index < 1 || !scene || index < lastScene) { messages.push(`E${ep.ep}: invalid/out-of-order sceneIndex`); continue; }
          lastScene = index;
          if (!Array.isArray(seg.cuts) || !seg.cuts.length) messages.push(`${seg.id}: cuts required`);
          for (const cut of array(seg.cuts)) {
            if (typeof cut?.seconds !== 'number' || !Number.isFinite(cut.seconds) || cut.seconds <= 0) messages.push(`${seg.id}: cut seconds must be finite and positive`);
            else seconds += cut.seconds;
            const range = cut?.beats, next = cursors.get(index) ?? 1;
            if (!Array.isArray(range) || range.length !== 2 || !range.every(n => Number.isSafeInteger(n) && n > 0) || range[0] !== next || range[1] < range[0] || range[1] > array(scene.flow).length) messages.push(`${seg.id}: invalid, missing or repeated script beat range`);
            else cursors.set(index, range[1]+1);
          }
        }
        for (const [i,scene] of array(upstream.scenes).entries()) if ((cursors.get(i+1) ?? 1) !== array(scene.flow).length+1) messages.push(`E${ep.ep} scene ${i+1}: incomplete beat coverage`);
        const epsilon = Number.EPSILON * Math.max(1, Math.abs(upstream.targetSeconds), Math.abs(seconds)) * 4;
        if (!Number.isFinite(seconds) || !Number.isFinite(upstream.targetSeconds) || seconds < upstream.targetSeconds*(1-tolerance)-epsilon || seconds > upstream.targetSeconds*(1+tolerance)+epsilon) messages.push(`E${ep.ep}: cut duration does not fit the current script target`);
      }
    } catch (e) { messages.push(`Unreadable downstream: ${e.message}`); }
    return {id:'downstream-creation',file,category:'base',level:'error',status:messages.length?'fail':'pass',messages,scope:'Interface only: version, identity, episode projection, target duration and script beat coverage. Model limits, assets and content still require creation validation/review.'};
  });
}
