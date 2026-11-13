// Execution text is not a semantic permission engine. Candidates stay in .work.
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (x,k) => obj(x) && Object.hasOwn(x,k);
const text = x => typeof x === 'string' && x.trim().length > 0;
const cid = x => typeof x === 'string' && /^C\d{2,}$/.test(x);
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const arr = x => Array.isArray(x) ? x : [];
export function transformationErrors(value,path) {
  return !obj(value) || Object.keys(value).some(k => !['reason','authorization'].includes(k)) || !text(value.reason) || !text(value.authorization) ? [`${path}: nonempty reason/authorization required`] : [];
}
export function sceneSemanticsErrors(scene,path) {
  const errors = [];
  if (own(scene,'context') || own(scene,'candidates')) errors.push(`${path}: use scene notes; candidates belong in .work`);
  if (own(scene,'notes')) {
    if (!Array.isArray(scene.notes)) errors.push(`${path}.notes: expected array`);
    for (const note of arr(scene.notes)) {
      if (!obj(note) || !['performance','background','continuity','restriction'].includes(note.kind) || !text(note.text)) errors.push(`${path}.notes: text and non-speaking kind required`);
      for (const key of ['line','speaker','action','sound','subtitle','audio','seconds','beatClaims','candidate','candidates']) if (own(note,key)) errors.push(`${path}.notes.${key}: notes never speak, count time or claim beats`);
      if (own(note,'transformation')) errors.push(...transformationErrors(note.transformation,`${path}.notes.transformation`));
    }
  }
  for (const [i,b] of arr(scene?.flow).entries()) {
    const at = `${path} beat ${i+1}`, kinds = ['action','line','subtitle','sound'].filter(k => own(b,k));
    if (!obj(b) || kinds.length !== 1) { errors.push(`${at}: exactly one action/line/subtitle/sound required`); continue; }
    const kind = kinds[0];
    const allowed = [kind,'sourceRefs','transformation', ...(kind === 'line' ? ['speaker','delivery','audio'] : kind === 'sound' ? ['audio','seconds'] : kind === 'subtitle' ? ['seconds'] : [])];
    for (const k of Object.keys(b)) if (!allowed.includes(k)) errors.push(`${at}.${k}: not allowed on ${kind}`);
    if (!text(b[kind])) errors.push(`${at}: empty ${kind}`);
    if (kind === 'line') {
      if (b.speaker !== 'VO' && (!cid(b.speaker) || !arr(scene.characters).includes(b.speaker))) errors.push(`${at}: speaker must be in scene or VO`);
      if (own(b,'delivery') && !text(b.delivery)) errors.push(`${at}.delivery: expected nonempty text`);
    }
    if (own(b,'seconds') && !positive(b.seconds)) errors.push(`${at}.seconds: expected finite positive number`);
    if (own(b,'audio')) {
      const a = b.audio;
      if (!obj(a) || !['onscreen','offscreen','voiceover','inner'].includes(a.mode) || Object.keys(a).some(k => !['mode','audibleTo','subjective'].includes(k))) errors.push(`${at}.audio: malformed audio semantics`);
      if (own(a,'audibleTo') && (!Array.isArray(a.audibleTo) || a.audibleTo.some(c => !cid(c) || !arr(scene.characters).includes(c)) || new Set(a.audibleTo).size !== a.audibleTo.length)) errors.push(`${at}.audio.audibleTo: expected unique scene character IDs`);
      if (own(a,'subjective') && typeof a.subjective !== 'boolean') errors.push(`${at}.audio.subjective: expected boolean`);
    }
    if (own(b,'transformation')) errors.push(...transformationErrors(b.transformation,`${at}.transformation`));
  }
  return errors;
}
