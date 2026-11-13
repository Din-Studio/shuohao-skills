// Self-contained outline v5 consumer boundary, not semantic fidelity review.
import { documentErrors } from './document.mjs';
import { evidenceErrors } from './source.mjs';
const arr = x => Array.isArray(x) ? x : [];
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const id = (x,p) => typeof x === 'string' && new RegExp(`^${p}\\d{2,}$`).test(x);
const own = (x,k) => obj(x) && Object.hasOwn(x,k);
export function outlineInputErrors(outline) {
  if (!obj(outline) || outline.schemaVersion !== 5) return ['outline.schemaVersion must be 5'];
  const errors = [...documentErrors(outline,'outline'), ...evidenceErrors(outline,{outline:true})];
  if (!text(outline.source)) errors.push('outline.source: expected work title');
  for (const k of ['adaptation','arcs','characters','scenes','props','assetMappings']) if (own(outline,k)) errors.push(`outline.${k}: not part of outline v5`);
  if (own(outline,'params') && !obj(outline.params)) errors.push('outline.params: expected object');
  for (const k of ['adaptMode','minutesPerEpisode','episodes','thresholds']) if (own(outline.params,k)) errors.push(`outline.params.${k}: not part of outline v5`);
  if (!text(outline.story?.summary) || own(outline.story,'drive')) errors.push('outline.story.summary: required; story.drive not part of outline v5');
  const sets = {};
  for (const [key,prefix] of [['beats','B']]) {
    sets[key] = new Set();
    if (!Array.isArray(outline[key])) errors.push(`outline.${key}: expected array`);
    for (const item of arr(outline[key])) {
      if (!id(item?.id,prefix) || sets[key].has(item?.id)) errors.push(`outline.${key}: invalid/duplicate ID`);
      sets[key].add(item?.id);
    }
  }
  if (!Array.isArray(outline.episodes) || !outline.episodes.length) errors.push('outline.episodes: expected nonempty array');
  const eps = new Set(), questions = new Map(); let last = 0;
  for (const ep of arr(outline.episodes)) {
    if (!Number.isSafeInteger(ep?.ep) || ep.ep <= last) errors.push('outline.episodes: ordered positive integers required');
    last = ep?.ep; eps.add(ep?.ep);
    if (!text(ep?.synopsis)) errors.push(`outline E${ep?.ep}.synopsis: required`);
    for (const key of ['characterIds','sceneIds','propIds']) if (own(ep,key)) errors.push(`outline.episodes.${key}: not part of outline v5`);
    if (own(ep,'stateChange')) errors.push('outline.episodes.stateChange: not part of outline v5');
    if (own(ep,'opening') && !text(ep.opening)) errors.push('outline.opening: expected nonempty text');
    if (own(ep,'ending')) {
      if (!obj(ep.ending) || !text(ep.ending.event) || own(ep.ending,'mode') && !['suspense','closure','open'].includes(ep.ending.mode)) errors.push('outline.ending: malformed event/mode');
      if (own(ep.ending,'question')) {
        const q = ep.ending.question;
        if (!id(q?.id,'Q') || questions.has(q?.id) || !text(q?.text) || own(q,'reason') && !text(q.reason) || own(q,'resolution') || own(q,'dueByEp')) errors.push('outline.question: malformed or retired planning fields');
        questions.set(q?.id,ep.ep);
      }
    }
  }
  last = 0; const resolved = new Set();
  for (const b of arr(outline.beats)) {
    if (!eps.has(b?.episode) || b?.episode < last || !text(b?.setup) || !text(b?.outcome)) errors.push(`outline ${b?.id}: malformed event or episode order`);
    last = b?.episode;
    for (const k of ['position','kind','weight','type']) if (own(b,k)) errors.push(`outline ${b?.id}.${k}: not part of outline v5`);
    if (own(b,'resolves')) {
      if (!Array.isArray(b.resolves)) errors.push('outline.resolves: expected array');
      for (const q of arr(b.resolves)) {
        if (!questions.has(q) || questions.get(q) >= b.episode || resolved.has(q)) errors.push(`outline ${b?.id}: invalid/duplicate/out-of-order resolution ${q}`);
        resolved.add(q);
      }
    }
  }
  if (own(outline.story,'endingBeatId') && !sets.beats.has(outline.story.endingBeatId)) errors.push('outline.story.endingBeatId: unknown beat');
  if (own(outline.story,'focusCharacterIds')) errors.push('outline.story.focusCharacterIds: not part of outline v5');
  const checkNotes = value => {
    if (Array.isArray(value)) value.forEach(checkNotes);
    else if (obj(value)) for (const [key,item] of Object.entries(value)) {
      if (['characterIds','sceneIds','propIds','speakerId','characterId','sceneId','propId'].includes(key)) errors.push(`outline.${key}: not part of outline v5`);
      checkNotes(item);
    }
  };
  checkNotes(outline);
  return errors;
}
