#!/usr/bin/env node
// Self-contained script v4 consumer. No sibling imports.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PARAMS, effectiveParams, parameterErrors, documentErrors, productionErrors } from './lib/document.mjs';
import { projectRoot, loadKnownUpstreams, checkKnownCreation, readJsonStrict } from './lib/downstream.mjs';

import { sceneSemanticsErrors } from './lib/semantics.mjs';
import { mappingErrors, mappedAssetId } from './lib/asset-mappings.mjs';
export { mappingErrors, mappedAssetId, assetDigest } from './lib/asset-mappings.mjs';
import { outlineInputErrors } from './lib/outline-input.mjs';
import { evidenceErrors, verifySources, rebaseProvenance } from './lib/source.mjs';
import { parseStoryboard, storyboardErrors, seedStoryboard, storyboardPathOf } from './lib/storyboard.mjs';
export { parseStoryboard, storyboardErrors, seedStoryboard, storyboardPathOf } from './lib/storyboard.mjs';
export { verifySources } from './lib/source.mjs';

export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export { DEFAULT_PARAMS };
export const PRODUCTION_FILE = 'production.json';
export const PRODUCTION_DEPTH = 5;
export const STAGE_DIR = 'script';
export const autopilotOf = p => p?.autopilot === true;
export const AUTOPILOT_NOTE = '自动驾驶：开启；继续检查并汇报每项决定，不要停下来问用户。';
const arr = x => Array.isArray(x) ? x : [];
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const integer = x => Number.isSafeInteger(x) && x > 0;
const own = (x, k) => obj(x) && Object.hasOwn(x, k);
const idOK = (x, prefix) => typeof x === 'string' && new RegExp(`^${prefix}\\d{2,}$`).test(x);
const r1 = x => Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
export const lineChars = line => String(line ?? '').replace(/\s+/g, '').length;
export const paramsOf = doc => effectiveParams(doc?.params);
export function endBeatOf(ep) {
  for (let si = arr(ep?.scenes).length - 1; si >= 0; si--) {
    const count = arr(ep.scenes[si]?.flow).length;
    if (count) return [si + 1, count];
  }
  return null;
}
export function plansFor(ep, ctx = {}) {
  return own(ctx, 'outline') ? arr(ctx.outline?.episodes).find(e => e?.ep === ep?.ep) ?? {} : ep ?? {};
}
export function findProduction(fromDir = '.', depth = PRODUCTION_DEPTH) {
  let dir = resolve(fromDir);
  for (let i = 0; i <= depth; i++) {
    const p = resolve(dir, PRODUCTION_FILE);
    try { lstatSync(p); return p; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const up = dirname(dir);
    if (dir === up) break;
    dir = up;
  }
  return null;
}
export function stageDirNote(docPath, productionPath, stage = STAGE_DIR) {
  if (!docPath || !productionPath) return null;
  const want = resolve(dirname(resolve(productionPath)), stage);
  return dirname(resolve(docPath)) === want ? null : `Expected artifact directory: ${want}`;
}
export function slug(name) {
  return String(name ?? '').trim().replace(/[\s/\\:*?"<>|·]+/g, '-').replace(/^-+|-+$/g, '') || 'script';
}

// One unrounded clock for every scene, episode, position and inclusive claim.
export function beatSeconds(beat, params = DEFAULT_PARAMS) {
  params = effectiveParams(params);
  if (!obj(beat) || ['action','line','subtitle','sound'].filter(k => own(beat,k)).length !== 1) return null;
  for (const key of ['action','subtitle','sound']) if (own(beat,key)) {
    const seconds = key !== 'action' && own(beat,'seconds') ? beat.seconds : params.actionSeconds;
    return text(beat[key]) && positive(seconds) ? seconds : null;
  }
  if (!text(beat.line) || !positive(params.charsPerSecond)) return null;
  const seconds = lineChars(beat.line) / params.charsPerSecond;
  return positive(seconds) ? seconds : null;
}
export function episodeTimeline(ep, params = DEFAULT_PARAMS) {
  let clock = 0;
  const rows = [];
  arr(ep?.scenes).forEach((scene, si) => arr(scene?.flow).forEach((beat, bi) => {
    const seconds = beatSeconds(beat, params);
    const startSeconds = clock;
    const next = clock === null || seconds === null ? null : clock + seconds;
    clock = Number.isFinite(next) ? next : null;
    rows.push({ coord: [si + 1, bi + 1], index: rows.length + 1, startSeconds, endSeconds: clock, seconds, beat });
  }));
  return rows;
}
export function coordinateIndex(ep, coord) {
  if (!Array.isArray(coord) || coord.length !== 2 || !coord.every(integer)) return null;
  const scenes = arr(ep?.scenes);
  if (coord[0] > scenes.length || coord[1] > arr(scenes[coord[0] - 1]?.flow).length) return null;
  return scenes.slice(0, coord[0] - 1).reduce((n, s) => n + arr(s?.flow).length, 0) + coord[1] - 1;
}
export function claimRange(ep, claim, params = DEFAULT_PARAMS) {
  const start = coordinateIndex(ep, claim?.start), end = coordinateIndex(ep, claim?.end);
  if (start === null || end === null || start > end) return null;
  const rows = episodeTimeline(ep, params).slice(start, end + 1);
  if (rows.some(r => r.startSeconds === null || r.endSeconds === null)) return null;
  return { startIndex: start, endIndex: end, startSeconds: rows[0].startSeconds, endSeconds: rows.at(-1).endSeconds, rows };
}
export function sceneSeconds(scene, params = DEFAULT_PARAMS) {
  const rows = episodeTimeline({ scenes: [scene] }, params);
  if (rows.some(r => r.seconds === null || r.endSeconds === null)) return { dialogue: null, action: null, total: null };
  const dialogue = rows.filter(r => own(r.beat, 'line')).reduce((n, r) => n + r.seconds, 0);
  const action = rows.filter(r => own(r.beat, 'action')).reduce((n, r) => n + r.seconds, 0);
  return { dialogue, action, total: rows.at(-1)?.endSeconds ?? 0 };
}
export function computeStats(doc) {
  const params = paramsOf(doc), sceneTable = [], byCharacter = new Map();
  const episodes = arr(doc?.episodes).map(ep => {
    const timeline = episodeTimeline(ep, params);
    const valid = timeline.every(r => r.seconds !== null && r.endSeconds !== null);
    const dialogueSeconds = valid ? timeline.filter(r => own(r.beat, 'line')).reduce((n, r) => n + r.seconds, 0) : null;
    const actionSeconds = valid ? timeline.filter(r => own(r.beat, 'action')).reduce((n, r) => n + r.seconds, 0) : null;
    const soundSeconds = valid ? timeline.filter(r => own(r.beat,'sound')).reduce((n,r) => n+r.seconds,0) : null;
    const subtitleSeconds = valid ? timeline.filter(r => own(r.beat,'subtitle')).reduce((n,r) => n+r.seconds,0) : null;
    arr(ep?.scenes).forEach((sc, i) => {
      const lines = arr(sc?.flow).filter(b => typeof b?.line === 'string');
      sceneTable.push({ ep: ep?.ep, index: i + 1, sceneId: sc?.sceneId, lighting: sc?.lighting, characters: arr(sc?.characters), props: arr(sc?.props), lineCount: lines.length, estSeconds: sceneSeconds(sc, params).total });
      for (const b of lines) {
        const entry = byCharacter.get(b.speaker) ?? { id: b.speaker, lines: [], chars: 0 };
        entry.lines.push({ ep: ep?.ep, sceneIndex: i + 1, sceneId: sc?.sceneId, line: b.line, delivery: b.delivery });
        entry.chars += lineChars(b.line);
        byCharacter.set(b.speaker, entry);
      }
    });
    return { ep: ep?.ep, target: ep?.targetSeconds, est: timeline.at(-1)?.endSeconds ?? (timeline.length ? null : 0), dialogueSeconds, actionSeconds, soundSeconds, subtitleSeconds, lines: timeline.filter(r => own(r.beat, 'line')).length, sceneCount: arr(ep?.scenes).length, timeline };
  });
  const sum = key => episodes.some(e => !Number.isFinite(e[key])) ? null : episodes.reduce((n, e) => n + e[key], 0);
  return { params, episodes, sceneTable, castLines: [...byCharacter.values()].map(c => ({ ...c, count: c.lines.length })).sort((a, b) => b.count - a.count), totals: { episodes: episodes.length, scenes: sceneTable.length, lines: episodes.reduce((n, e) => n + e.lines, 0), estSeconds: sum('est'), targetSeconds: sum('target'), dialogueSeconds: sum('dialogueSeconds') } };
}

const MODES = ['suspense', 'closure', 'open'];
function endingErrors(ending, path, script = true) {
  const errors = [];
  if (!obj(ending)) return [`${path}: expected object`];
  if (!MODES.includes(ending.mode)) errors.push(`${path}.mode: expected suspense/closure/open`);
  if (!text(ending.event)) errors.push(`${path}.event: expected nonempty text`);
  if (script && Object.keys(ending).some(k => !['mode', 'event'].includes(k))) errors.push(`${path}: only mode/event allowed; Q plans belong to outline`);
  return errors;
}
export { outlineInputErrors } from './lib/outline-input.mjs';
function artInputErrors(art, source) {
  if (!obj(art) || !Array.isArray(art.scenes) || !Array.isArray(art.props)) return ['art: expected scenes and props arrays'];
  const errors = [];
  if (!text(art.source) || source !== undefined && art.source !== source) errors.push('art.source: expected matching work title');
  if (art.schemaVersion !== 1) errors.push('art.schemaVersion: expected 1');
  for (const [key, prefix] of [['scenes', 'S'], ['props', 'P']]) {
    const seen = new Set();
    for (const item of art[key]) {
      if (!obj(item) || !text(item.name)) errors.push(`art.${key}: expected named asset objects`);
      if (!idOK(item?.id, prefix) || seen.has(item?.id)) errors.push(`art.${key}: invalid or duplicate ID`);
      seen.add(item?.id);
      if (key === 'scenes' && own(item, 'lighting') && (!Array.isArray(item.lighting) || item.lighting.some(l => !text(l?.state)))) errors.push(`art ${item?.id}: malformed lighting`);
    }
  }
  return errors;
}
function castInputErrors(cast, source) {
  if (!obj(cast) || !Array.isArray(cast.characters)) return ['cast: expected characters array'];
  const errors = [], seen = new Set();
  if (!text(cast.source) || source !== undefined && cast.source !== source) errors.push('cast.source: expected matching work title');
  if (cast.schemaVersion !== 1) errors.push('cast.schemaVersion: expected 1');
  for (const c of cast.characters) {
    if (!obj(c) || !text(c.name)) errors.push('cast.characters: expected named character objects');
    if (!own(c, 'id')) errors.push('cast.characters: explicit identity required');
    if (own(c, 'id')) {
      if (!idOK(c.id, 'C') || seen.has(c.id)) errors.push('cast.characters: invalid or duplicate ID');
      seen.add(c.id);
    }
    if (own(c, 'voice') && (!obj(c.voice) || own(c.voice, 'prompt') && !text(c.voice.prompt))) errors.push('cast.voice.prompt: expected nonempty text when supplied');
  }
  return errors;
}
function localErrors(doc, stage) {
  const errors = [];
  if (!obj(doc)) return ['script: expected object'];
  if (doc.schemaVersion !== 4) errors.push('schemaVersion must be 4');
  errors.push(...evidenceErrors(doc));
  for (const key of ['candidates','context']) if (own(doc,key)) errors.push(`${key}: candidates belong in .work; context belongs in scene notes`);
  errors.push(...documentErrors(doc, 'script'));
  if (!text(doc.source)) errors.push('source: expected nonempty text');
  if (own(doc, 'lang') && !['zh', 'en'].includes(doc.lang)) errors.push('lang: expected zh/en');
  if (!['full', 'skeleton'].includes(stage)) errors.push('stage: expected full/skeleton');
  errors.push(...parameterErrors(doc));
  if (!Array.isArray(doc.episodes) || !doc.episodes.length) errors.push('episodes: expected nonempty array');
  const eps = new Set(), claims = new Set();
  let lastEp = 0;
  for (const ep of arr(doc.episodes)) {
    const path = `E${ep?.ep}`;
    if (!integer(ep?.ep) || eps.has(ep?.ep) || ep?.ep <= lastEp) errors.push(`${path}: invalid/duplicate/out-of-order ep`);
    eps.add(ep?.ep); lastEp = ep?.ep;
    if (own(ep, 'targetSeconds') && !positive(ep.targetSeconds)) errors.push(`${path}.targetSeconds: expected finite positive number`);
    if (own(ep, 'opening') && !text(ep.opening)) errors.push(`${path}.opening: expected nonempty text`);
    if (own(ep, 'ending')) errors.push(...endingErrors(ep.ending, `${path}.ending`));
    for (const key of ['endBeat', 'seedNote']) if (own(ep, key)) errors.push(`${path}.${key}: not part of script v4`);
    for (const key of ['hook', 'hookBeat', 'cliff', 'closure', 'beatsClaimed']) if (own(ep, key)) errors.push(`${path}.${key}: not part of script v4`);
    if (!Array.isArray(ep?.scenes) || (stage === 'full' && !ep.scenes.length)) errors.push(`${path}.scenes: expected ${stage === 'full' ? 'nonempty ' : ''}array`);
    if (own(ep, 'openingBeat') && coordinateIndex(ep, ep.openingBeat) === null) errors.push(`${path}.openingBeat: invalid coordinate`);
    if (own(ep, 'beatClaims') && !Array.isArray(ep.beatClaims)) errors.push(`${path}.beatClaims: expected array`);
    let lastEnd = -1;
    for (const claim of arr(ep?.beatClaims)) {
      if (!obj(claim) || Object.keys(claim).some(k => !['beatId', 'start', 'end'].includes(k))) errors.push(`${path}.beatClaims: only beatId/start/end allowed`);
      if (!idOK(claim?.beatId, 'B') || claims.has(claim?.beatId)) errors.push(`${path}.beatClaims: invalid/duplicate beatId ${claim?.beatId}`);
      claims.add(claim?.beatId);
      if (stage === 'skeleton' && claim?.start === null && claim?.end === null) continue;
      const start = coordinateIndex(ep, claim?.start), end = coordinateIndex(ep, claim?.end);
      if (start === null || end === null || start > end) errors.push(`${path} ${claim?.beatId}: invalid/reversed range`);
      else {
        if (start <= lastEnd) errors.push(`${path} ${claim?.beatId}: core ranges must be ordered and non-overlapping`);
        lastEnd = end;
      }
    }
    for (const [si, sc] of arr(ep?.scenes).entries()) {
      const at = `${path} S${si + 1}`;
      if (!idOK(sc?.sceneId, 'S')) errors.push(`${at}.sceneId: invalid ID`);
      for (const [key, prefix] of [['characters', 'C'], ['props', 'P']]) {
        if (key === 'props' && !own(sc, key)) continue;
        if (!Array.isArray(sc?.[key]) || sc[key].some(id => !idOK(id, prefix)) || new Set(sc[key]).size !== sc[key].length) errors.push(`${at}.${key}: expected unique valid IDs`);
      }
      if (own(sc, 'lighting') && !text(sc.lighting)) errors.push(`${at}.lighting: expected nonempty text`);
      if (!Array.isArray(sc?.flow) || !sc.flow.length) errors.push(`${at}.flow: expected nonempty array`);
      errors.push(...sceneSemanticsErrors(sc,at));
    }
  }
  return errors;
}
const LABELS = {
  storyboard: ['分镜文件', 'Storyboard document'], 'storyboard-duration': ['分镜单段估时提醒', 'Storyboard segment timing notice'],
  fields: ['基础字段与位置', 'Fields and positions'], 'duration-input': ['估时输入合法性', 'Timing input validity'], duration: ['估算时长提醒', 'Estimated duration notice'],
  'outline-input': ['大纲输入契约', 'Outline input contract'], 'upstream-projection': ['上游计划来源与作品对账', 'Upstream plans and source reconciliation'],
  'upstream-duration': ['上游目标时长', 'Upstream target duration'], 'beats-claimed': ['节点 ID 与顺序对账', 'Beat IDs and order'],
  'art-input': ['美术输入契约', 'Art input contract'], 'cast-input': ['角色输入契约', 'Cast input contract'], 'refs-scenes': ['已映射场景光照', 'Mapped scene lighting'],
  'production-input': ['项目契约与创作要求', 'Project contract and creative brief'], 'content-review': ['内容评审未执行', 'Content review not performed'],
  'question-plan': ['问题计划由大纲检查', 'Question plan checked by outline'], 'artifact-directory': ['产物目录', 'Artifact directory'],
  'source-verification': ['来源文件核验', 'Source file verification'], 'outline-source-verification': ['大纲来源文件核验', 'Outline source file verification'], 'production-target': ['制作目标确认', 'Production target confirmation'],
  'downstream-creation': ['下游制作接口', 'Downstream creation interface'],
  'cast-source-verification': ['角色映射原件核验', 'Cast mapping source verification'], 'art-source-verification': ['美术映射原件核验', 'Art mapping source verification'],
  'asset-mappings': ['局部引用与资产映射', 'Local references and asset mappings'], 'joint-reconciliation': ['已确认映射对账（不含待确认项）', 'Confirmed mapping reconciliation (pending records excluded)']
};
export const isBlocking = g => g.status === 'fail' && g.level === 'error' && g.category !== 'source';
function verifyMappedSources(doc, ctx, stage) {
  const rows = arr(doc?.assetMappings).filter(m => stage === 'cast' ? m?.kind === 'character' : ['scene','prop'].includes(m?.kind));
  if (!rows.length) return {status:'not-applicable',errors:[]};
  const ids = new Set(rows.flatMap(m => arr(m?.documentVersions).map(v => v?.id)));
  const authority = ctx[stage], artifactPath = ctx[`${stage}Path`];
  const documents = [...ids].map(id => {
    const source = arr(authority?.provenance?.documents).find(d => d?.id === id);
    if (!source) return null;
    const d = {...source};
    // The asset producers may retain absolute source paths. Only this temporary
    // verification view rebases them; neither authority nor script is rewritten.
    if (artifactPath && text(d.path) && isAbsolute(d.path)) d.path = relative(dirname(resolve(artifactPath)),d.path);
    return d;
  });
  return verifySources({provenance:{kind:'script',scope:'partial',documents,coverage:arr(authority?.provenance?.coverage).filter(r => ids.has(r?.documentId))},episodes:[]},artifactPath);
}
export function gateReport(doc, ctx = {}) {
  const gates = [], stage = ctx.stage ?? 'full';
  const add = (id, errors = [], category = 'base', level = 'error', reason = null) => gates.push({ id, category, level, status: reason ? 'skipped' : errors.length ? 'fail' : 'pass', ...(reason ? { reason } : {}), label: LABELS[id]?.[0] ?? id, messages: errors });
  add('fields', localErrors(doc, stage));
  if (ctx.requireTarget) add('production-target', arr(doc?.episodes).filter(e => !positive(e?.targetSeconds)).map(e => `E${e?.ep}.targetSeconds: required before production`));
  const verification = ctx.verifySources ? verifySources(doc, ctx.docPath) : null;
  add('source-verification', verification?.errors ?? [], 'base', 'error', ctx.verifySources ? (verification.status === 'not-applicable' ? 'not-applicable' : null) : 'not-performed');
  if (ctx.verifySources && ctx.outline !== undefined) add('outline-source-verification', verifySources(ctx.outline, ctx.outlinePath, { outline:true }).errors);
  const eps = arr(doc?.episodes), p = paramsOf(doc), stats = computeStats(doc);
  const duration = [];
  stats.episodes.forEach(e => {
    if (e.target === undefined) return;
    if (!Number.isFinite(e.est) || !positive(e.target) || !Number.isFinite(p.tolerance)) duration.push(`E${e.ep}: invalid timing inputs`);
    else if (e.est < e.target * (1 - p.tolerance) - Number.EPSILON*Math.max(1,e.target,e.est)*4 || e.est > e.target * (1 + p.tolerance) + Number.EPSILON*Math.max(1,e.target,e.est)*4) duration.push(`E${e.ep}: estimated ${r1(e.est)}s / target ${e.target}s / tolerance ${p.tolerance}`);
  });
  add('duration-input', stats.episodes.filter(e => !Number.isFinite(e.est)).map(e => `E${e.ep}: unavailable/overflowed timing; repair beats or parameters`), 'base', 'error', stage === 'skeleton' ? 'stage-incomplete' : null);
  add('duration', duration, 'base', 'warn', stage === 'skeleton' ? 'stage-incomplete' : null);
  // 分镜是第四个正式产物：提供时完整检查；正式交付（--production-ready）必须提供。
  if (stage === 'skeleton') { add('storyboard', [], 'base', 'error', 'stage-incomplete'); add('storyboard-duration', [], 'base', 'warn', 'stage-incomplete'); }
  else if (typeof ctx.storyboard !== 'string') {
    const missing = ctx.requireTarget ? [`missing storyboard ${ctx.storyboardPath ?? '<script>-storyboard.md'}; formal delivery has four files`] : [];
    add('storyboard', missing, 'base', 'error', missing.length ? null : 'not-provided');
    add('storyboard-duration', [], 'base', 'warn', 'not-provided');
  } else {
    const result = storyboardErrors(parseStoryboard(ctx.storyboard), doc, p);
    add('storyboard', result.errors);
    add('storyboard-duration', result.warnings, 'base', 'warn');
  }
  const hasOutline = own(ctx, 'outline') && ctx.outline !== undefined;
  const oe = hasOutline ? outlineInputErrors(ctx.outline) : [];
  add('outline-input', oe, 'base', 'error', hasOutline ? null : 'missing-upstream');
  const projection = [], claimErrors = [];
  if (hasOutline && !oe.length) {
    const outline = ctx.outline;
    if (doc?.source !== outline.source) projection.push('source: must match outline; matching titles alone do not establish content synchronization');
    for (const source of arr(doc?.provenance?.documents)) {
      const upstream = arr(outline.provenance?.documents).find(d => d?.id === source?.id);
      if (!upstream) projection.push(`provenance ${source?.id}: no matching outline source identity; reconcile sources before production`);
      else if (upstream.sha256 !== source?.sha256 || upstream.lineCount !== source?.lineCount) projection.push(`provenance ${source?.id}: script and outline source versions differ; re-read and reconcile before production`);
    }
    for (const ep of eps) {
      const upstream = outline.episodes.find(e => e.ep === ep?.ep);
      if (!upstream) { projection.push(`E${ep?.ep}: episode absent from outline`); }
      else {
        for (const key of ['opening', 'ending']) if (own(ep, key)) projection.push(`E${ep?.ep}.${key}: duplicates the outline plan; remove the local copy`);
      }
      const expected = outline.beats.filter(b => b.episode === ep?.ep).map(b => b.id), actual = arr(ep?.beatClaims).map(c => c?.beatId);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) claimErrors.push(`E${ep?.ep}: expected ordered IDs ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  }
  for (const [id, errors] of [['upstream-projection', projection], ['beats-claimed', claimErrors]]) {
    add(id, hasOutline && oe.length ? ['Invalid supplied outline; reconciliation cannot run'] : errors, 'base', 'error', hasOutline ? null : 'missing-upstream');
  }
  const hasArt = own(ctx, 'art') && ctx.art !== undefined, ae = hasArt ? artInputErrors(ctx.art,doc?.source) : [], refs = [];
  add('art-input', ae, 'base', 'error', hasArt ? null : 'missing-upstream');
  if (hasArt && !ae.length) for (const ep of eps) for (const sc of arr(ep?.scenes)) {
    const id = mappedAssetId(doc,'scene',sc?.sceneId);
    const scene = id && ctx.art.scenes.find(s => s.id === id);
    if (scene && own(sc, 'lighting') && !arr(scene.lighting).some(l => l.state === sc.lighting)) refs.push(`E${ep?.ep} ${sc.sceneId}: unregistered lighting ${sc.lighting}`);
  }
  add('refs-scenes', ae.length ? ['Invalid supplied art; reconciliation cannot run'] : refs, 'base', 'error', hasArt ? null : 'missing-upstream');
  const hasCast = own(ctx, 'cast') && ctx.cast !== undefined;
  add('cast-input', hasCast ? castInputErrors(ctx.cast,doc?.source) : [], 'base', 'error', hasCast ? null : 'missing-upstream');
  add('asset-mappings', mappingErrors(doc,ctx,{required:own(ctx,'requiredMappings') ? ctx.requiredMappings : []}));
  for (const key of ['cast','art']) if (ctx[key] !== undefined) {
    const verification = ctx.verifySources ? verifyMappedSources(doc,ctx,key) : null;
    add(`${key}-source-verification`, verification?.errors ?? [], 'base', 'error', ctx.verifySources ? (verification.status === 'not-applicable' ? 'not-applicable' : null) : 'not-performed');
  }
  const jointErrors = [];
  if (ctx.fullWorkflow) for (const key of ['outline','cast','art']) if (ctx[key] === undefined) jointErrors.push(`full workflow requires completed ${key} handoff`);
  const jointMissing = !hasOutline || !hasArt || !hasCast;
  const noDependencies = ctx.requiredMappings !== true && !arr(ctx.requiredMappings).length && !arr(doc?.assetMappings).some(m=>m?.status==='confirmed');
  const jointFailures = jointErrors.length ? jointErrors : gates.filter(g => g.status === 'fail' && g.level === 'error').flatMap(g => g.messages);
  add('joint-reconciliation', jointFailures, 'base', 'error', jointFailures.length ? null : jointMissing ? 'missing-upstream' : noDependencies ? 'no-production-dependencies' : null);
  add('production-input', own(ctx, 'production') ? productionErrors(ctx.production, [['script', doc], ['outline', ctx.outline]]) : [], 'base', 'error', own(ctx, 'production') ? null : 'missing-upstream');
  if (ctx.docPath && ctx.productionPath) add('artifact-directory', stageDirNote(ctx.docPath, ctx.productionPath) ? [stageDirNote(ctx.docPath, ctx.productionPath)] : []);
  else add('artifact-directory', [], 'base', 'error', 'missing-upstream');
  add('question-plan', [], 'content', 'warn', hasOutline ? 'not-applicable' : 'missing-upstream');
  add('content-review', [], 'content', 'warn', 'not-applicable');
  return gates;
}
export function checkup(doc, ctx = {}) {
  const gates = gateReport(doc, ctx);
  if (ctx.root && (ctx.stage ?? 'full') === 'full') gates.push(...checkKnownCreation(doc, { root: ctx.root, production: ctx.production, outline: ctx.outline }));
  return { schemaVersion: 4, sourceVerification: ctx.verifySources ? (gates.some(g => /source-verification/.test(g.id) && g.status === 'fail') ? 'fail' : doc?.provenance ? 'pass' : 'not-applicable') : 'not-performed', stage: ctx.stage ?? 'full', gates, stats: computeStats(doc), blockingFailures: gates.filter(isBlocking).length, warnings: gates.filter(g => g.status === 'fail' && g.level === 'warn').length, contentReview: 'not-performed', scope: { outlineProvided: own(ctx, 'outline'), artProvided: own(ctx, 'art'), castProvided: own(ctx, 'cast'), productionProvided: own(ctx, 'production') } };
}
export function validateScript(doc, ctx = {}) {
  return checkup(doc, ctx).gates.filter(isBlocking).flatMap(g => g.messages.length ? g.messages.map(m => `${g.id}: ${m}`) : [`${g.id}: failed`]);
}
export function seedFromOutline(outline, epRange = null) {
  const errors = outlineInputErrors(outline);
  if (errors.length) throw new Error(errors.join('\n'));
  if (epRange && (!Array.isArray(epRange) || epRange.length !== 2 || !epRange.every(integer) || epRange[0] > epRange[1])) throw new Error('Invalid episode range');
  const episodes = outline.episodes.filter(e => !epRange || e.ep >= epRange[0] && e.ep <= epRange[1]).map(e => ({
    ep: e.ep,
    beatClaims: outline.beats.filter(b => b.episode === e.ep).map(b => ({ beatId: b.id, start: null, end: null })),
    scenes: []
  }));
  if (!episodes.length) throw new Error('No outline episodes in requested range');
  const provenance = structuredClone(outline.provenance);
  if (episodes.length !== outline.episodes.length) provenance.scope = 'partial';
  return { schemaVersion: 4, source: outline.source, provenance, episodes };
}

const I18N = {
  zh: { title: '剧本', effective: '估时有效参数', brief: '创作要求', script: '分集剧本', episode: '分集', scene: '场次', opening: '开场计划', ending: '集尾', unmarked: '未标注开场落点；未核验开场表达', final: '正文计算的结束位置', claims: '节点计划与内容落点', plan: '上游计划', actual: '实际核心段', setup: '承接', outcome: '结果', questions: '上游问题与回答落点', missing: '缺少上游，未核验', invalid: '无效范围／估时不可用', duration: '估算时长', target: '目标时长', timeline: '分集正文与估算时间轴', timingNote: '估算不是实际表演时间。所有位置共用未舍入累计轴，仅显示值四舍五入。超出估时范围属于提醒，不要求删除有效表演。', scenes: '场次总表', lines: '台词本', voice: '音色提示词', copy: '复制', export: '导出 JSON', checks: '结构检查与内容评审状态', content: '内容评审未执行。位置合法不证明意图已表达；创作要求变化后须重新阅读正文评审。', scope: '独立或批次校验不代表完整联合交付。问题计划完整性由大纲校验负责。', pass: '通过', fail: '失败', warn: '提醒', skipped: '跳过', base: '基础契约', contentCategory: '内容评审', copied: '已复制', copyFailed: '复制失败', blocking: '阻断失败', warnings: '提醒数量', chars: '字数', count: '台词句数', lighting: '光照', characters: '人物', props: '道具', reason: { 'missing-upstream': '缺少上游', 'stage-incomplete': '阶段未完成', 'not-applicable': '不适用', 'no-production-dependencies': '未指定制作身份依赖', 'not-provided': '尚未提供' } },
  en: { title: 'Script', effective: 'Effective estimation parameters', brief: 'Creative brief', script: 'Episode scripts', episode: 'Episode', scene: 'Scene', opening: 'Opening plan', ending: 'Ending', unmarked: 'Opening landing not marked; expression not verified', final: 'End position computed from text', claims: 'Beat plans and content locations', plan: 'Upstream plan', actual: 'Actual core range', setup: 'Setup', outcome: 'Outcome', questions: 'Upstream questions and answer locations', missing: 'Missing upstream; not verified', invalid: 'Invalid range / timing unavailable', duration: 'Estimated duration', target: 'Target duration', timeline: 'Episode text and estimated timeline', timingNote: 'Estimates are not performance timings. All positions share one unrounded clock. Duration differences are notices, not instructions to delete valid performances.', scenes: 'Scene table', lines: 'Line book', voice: 'Voice prompt', copy: 'Copy', export: 'Export JSON', checks: 'Structural checks and content review', content: 'Content review not performed. Valid coordinates do not prove intent. Review the actual text again when the creative brief changes.', scope: 'Standalone or batch validation is not full joint delivery. The outline validator owns question-plan completeness.', pass: 'Pass', fail: 'Fail', warn: 'Warning', skipped: 'Skipped', base: 'Base contract', contentCategory: 'Content review', copied: 'Copied', copyFailed: 'Copy failed', blocking: 'Blocking failures', warnings: 'Warnings', chars: 'Characters', count: 'Line count', lighting: 'Lighting', characters: 'Cast', props: 'Props', reason: { 'missing-upstream': 'Missing upstream', 'stage-incomplete': 'Stage incomplete', 'not-applicable': 'Not applicable', 'no-production-dependencies': 'No production identity dependencies requested', 'not-provided': 'Not provided yet' } }
};
export function tOf(lang = 'zh') { if (!Object.hasOwn(I18N, lang)) throw new Error('Report language must be zh/en'); return I18N[lang]; }
const langOf = (doc, ctx) => ctx.lang ?? doc?.lang ?? ctx.production?.lang ?? 'zh';
const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const embed = x => JSON.stringify(x).replace(/</g, '\\u003c');
const format = x => Number.isFinite(x) ? String(r1(x)) : '—';
const pretty = x => JSON.stringify(x ?? null, null, 2);
function names(doc, ctx) {
  // Even identical C/S/P IDs or names never create an implicit mapping.
  const invalid = new Set(mappingErrors(doc,ctx).flatMap(e => { const m=e.match(/^script\.assetMappings\[(\d+)\]/); return m ? [Number(m[1])] : []; }));
  const cache = new Map();
  const asset = (kind,id) => {
    const key = `${kind}:${id}`;
    if (cache.has(key)) return cache.get(key);
    const target = mappedAssetId(doc,kind,id), index = arr(doc?.assetMappings).findIndex(m => m?.kind === kind && m?.localId === id);
    const result = !target || invalid.has(index) ? null : arr(kind === 'character' ? ctx.cast?.characters : kind === 'scene' ? ctx.art?.scenes : ctx.art?.props).find(a => a?.id === target) ?? null;
    cache.set(key,result);
    return result;
  };
  const label = (kind,id) => { const a = asset(kind,id); return a ? `${id} → ${a.id} · ${a.name ?? a.id}` : id; };
  return { char: id => label('character',id), scene: id => label('scene',id), prop: id => label('prop',id), voice: id => asset('character',id)?.voice?.prompt };
}
const beatText = (b, n) => {
  const body = own(b,'action') ? b.action : own(b,'subtitle') ? `[subtitle] ${b.subtitle}` : own(b,'sound') ? `[sound] ${b.sound}` : `${b?.speaker ?? ''}${b?.delivery ? ` (${b.delivery})` : ''}: ${b?.line ?? ''}`;
  return body + (b?.audio ? ` · audio: ${pretty(b.audio)}` : '') + (b?.sourceRefs ? ` · sourceRefs: ${pretty(b.sourceRefs)}` : '') + (b?.transformation ? ` · transformation: ${pretty(b.transformation)}` : '');
};
function landing(ep, coord, p, t, n) {
  const index = coordinateIndex(ep, coord), row = index === null ? null : episodeTimeline(ep, p)[index];
  return row && row.startSeconds !== null && row.endSeconds !== null ? `[${coord}] ${format(row.startSeconds)}–${format(row.endSeconds)}s · ${beatText(row.beat, n)}` : t.invalid;
}
function questionsFor(ep, ctx) {
  return arr(ctx.outline?.episodes).filter(e => e?.ep === ep?.ep && e?.ending?.question).map(e => e.ending.question);
}
function resolutionLocations(q, doc, ctx, t, n) {
  return arr(ctx.outline?.beats).filter(b => arr(b?.resolves).includes(q.id)).map(b => {
    const ep = arr(doc?.episodes).find(e => e?.ep === b.episode), claim = arr(ep?.beatClaims).find(c => c?.beatId === b.id);
    const range = ep && claim ? claimRange(ep, claim, paramsOf(doc)) : null;
    return `${b.id} E${b.episode}: ${range ? `[${claim.start}]–[${claim.end}] ${format(range.startSeconds)}–${format(range.endSeconds)}s\n${range.rows.map(r => beatText(r.beat, n)).join('\n')}` : t.invalid}`;
  });
}
function statusText(g, t) { return g.status === 'fail' && (g.level === 'warn' || g.category === 'source') ? t.warn : t[g.status] ?? g.status; }
function gateLabel(g, lang) { return LABELS[g.id]?.[lang === 'en' ? 1 : 0] ?? g.id; }
export function renderMarkdown(doc, ctx = {}) {
  if (doc?.schemaVersion !== 4) throw new Error('schemaVersion must be 4');
  const lang = langOf(doc, ctx), t = tOf(lang), n = names(doc, ctx), report = checkup(doc, ctx), p = paramsOf(doc);
  const out = [`# ${esc(doc?.source)} · ${t.title}`, ...(doc?.provenance ? ['','## provenance',esc(pretty(doc.provenance))] : []), '', `## ${t.script}`];
  for (const [i, ep] of arr(doc?.episodes).entries()) {
    const plan = plansFor(ep, ctx);
    out.push('', `### ${t.episode} ${esc(ep?.ep)}`);
    for (const [si, sc] of arr(ep?.scenes).entries()) {
      out.push('', `#### ${t.scene} ${si + 1} · ${esc(n.scene(sc?.sceneId))}`, [sc?.lighting ? `${t.lighting}: ${esc(sc.lighting)}` : '', `${t.characters}: ${esc(arr(sc?.characters).map(n.char).join(', '))}`, arr(sc?.props).length ? `${t.props}: ${esc(sc.props.map(n.prop).join(', '))}` : ''].filter(Boolean).join(' · '));
      for (const note of arr(sc?.notes)) out.push(`- [${lang === 'en' ? 'Non-speaking note' : '非发声说明'}] ${esc(pretty(note))}`);
      if (sc?.sourceRefs) out.push(`sourceRefs: ${esc(pretty(sc.sourceRefs))}`);
      for (const row of episodeTimeline(ep, p).filter(r => r.coord[0] === si + 1)) out.push(`- [${row.coord}] ${format(row.startSeconds)}–${format(row.endSeconds)}s · ${esc(beatText(row.beat, n))}`);
    }
    if (plan.opening) out.push(`${t.opening}: ${esc(plan.opening)}`);
    out.push(own(ep, 'openingBeat') ? esc(landing(ep, ep.openingBeat, p, t, n)) : t.unmarked);
    if (plan.ending) out.push(`${t.ending}: ${esc(plan.ending.mode)} · ${esc(plan.ending.event)}`);
    out.push(`${t.final}: ${esc(landing(ep, endBeatOf(ep), p, t, n))}`);
    if (arr(ep?.beatClaims).length) out.push('', `#### ${t.claims}`);
    for (const c of arr(ep?.beatClaims)) {
      const b = arr(ctx.outline?.beats).find(b => b?.id === c?.beatId), range = claimRange(ep, c, p);
      out.push(`- ${esc(c?.beatId)}${b?.kind ? ` (${esc(b.kind)})` : ''}: ${t.plan}: ${esc(b ? `${b.setup} → ${b.outcome}` : t.missing)}`, `  ${t.actual}: ${range ? `[${c.start}]–[${c.end}] ${format(range.startSeconds)}–${format(range.endSeconds)}s · ${esc(range.rows.map(r => beatText(r.beat, n)).join(' / '))}` : t.invalid}`);
    }
    const questions = questionsFor(ep, ctx);
    if (questions.length) out.push(`#### ${t.questions}`);
    for (const q of questions) out.push(esc(pretty(q)), ...resolutionLocations(q, doc, ctx, t, n).map(esc));
    out.push(`${t.duration}: ${format(report.stats.episodes[i].est)}s / ${t.target}: ${positive(ep?.targetSeconds) ? `${format(ep.targetSeconds)}s` : lang === 'en' ? 'Not confirmed' : '尚未确认'}`);
  }
  out.push('', `## ${t.scenes}`);
  for (const s of report.stats.sceneTable) out.push(`- E${esc(s.ep)} ${t.scene} ${s.index}: ${esc(n.scene(s.sceneId))} · ${format(s.estSeconds)}s · ${s.lineCount} ${t.count}`);
  out.push('', `## ${t.lines}`);
  for (const c of report.stats.castLines) out.push(`### ${esc(n.char(c.id))}`, ...c.lines.map(l => `- E${esc(l.ep)} [${l.sceneIndex}] ${esc(`${l.delivery ? `(${l.delivery}) ` : ''}${l.line}`)}`));
  out.push('', `## ${t.duration}`, t.timingNote, `${t.effective}: ${esc(pretty(p))}`, ...[ctx.production?.creativeBrief, doc?.creativeBrief].filter(text).map(b => `${t.brief}: ${esc(b)}`), t.scope, t.content);
  if (doc?.assetMappings) out.push('', '## assetMappings', esc(pretty(doc.assetMappings)));
  out.push('', `## ${t.checks}`, `${t.blocking}: ${report.blockingFailures} · ${t.warnings}: ${report.warnings}`);
  for (const g of report.gates) out.push(`- ${statusText(g, t)} · ${gateLabel(g, lang)} (${g.category}/${g.level})${g.reason ? ` · ${t.reason[g.reason] ?? g.reason}` : ''}${g.messages.length ? `: ${g.messages.map(esc).join('; ')}` : ''}`);
  return out.join('\n') + '\n';
}
export function renderHtml(doc, ctx = {}) {
  if (doc?.schemaVersion !== 4) throw new Error('schemaVersion must be 4');
  const lang = langOf(doc, ctx), t = tOf(lang), n = names(doc, ctx), report = checkup(doc, ctx), p = paramsOf(doc);
  const pre = value => `<pre>${esc(pretty(value))}</pre>`;
  const copy = value => `<button data-copy="${esc(value)}">${t.copy}</button>`;
  const eps = arr(doc?.episodes).map((ep, i) => {
    const timeline = episodeTimeline(ep, p), est = report.stats.episodes[i].est, plan = plansFor(ep, ctx);
    const scenes = arr(ep?.scenes).map((s, si) => `<section><h4>${t.scene} ${si + 1} · ${esc(n.scene(s?.sceneId))}</h4><p>${s?.lighting ? `${t.lighting}: ${esc(s.lighting)} · ` : ''}${t.characters}: ${esc(arr(s?.characters).map(n.char).join(', '))}${arr(s?.props).length ? ` · ${t.props}: ${esc(s.props.map(n.prop).join(', '))}` : ''}</p>${s?.sourceRefs ? pre({sourceRefs:s.sourceRefs}) : ''}${arr(s?.notes).map(note => `<aside><strong>${lang === 'en' ? 'Non-speaking note' : '非发声说明'}</strong>${pre(note)}</aside>`).join('')}<ol>${timeline.filter(r => r.coord[0] === si + 1).map(r => `<li id="ep-${esc(ep?.ep)}-${r.coord.join('-')}"><small>[${r.coord}] ${format(r.startSeconds)}–${format(r.endSeconds)}s</small><p>${esc(beatText(r.beat, n))}</p>${own(r.beat, 'line') ? copy(r.beat.line) : ''}</li>`).join('')}</ol></section>`).join('');
    const claims = arr(ep?.beatClaims).map(c => {
      const b = arr(ctx.outline?.beats).find(b => b?.id === c?.beatId), range = claimRange(ep, c, p);
      return `<article class="claim"><div><h5>${esc(c?.beatId)}${b?.kind ? ` · ${esc(b.kind)}` : ''}</h5><strong>${t.plan}</strong><p>${b ? `${t.setup}: ${esc(b.setup)}<br>${t.outcome}: ${esc(b.outcome)}` : t.missing}</p>${arr(b?.resolves).length ? `<p>resolves: ${esc(arr(b.resolves).join(', '))}</p>` : ''}</div><div><strong>${t.actual}</strong>${range ? `<p>[${c.start}]–[${c.end}] · ${format(range.startSeconds)}–${format(range.endSeconds)}s</p>${range.rows.map(r => `<p><a href="#ep-${esc(ep.ep)}-${r.coord.join('-')}">[${r.coord}]</a> ${esc(beatText(r.beat, n))}</p>`).join('')}` : `<p>${t.invalid}</p>`}</div></article>`;
    }).join('');
    const q = questionsFor(ep, ctx).map(q => `${pre(q)}<pre>${esc(resolutionLocations(q, doc, ctx, t, n).join('\n') || '—')}</pre>`).join('');
    return `<article class="episode"><h3>${t.episode} ${esc(ep?.ep)}</h3><details open><summary>${t.timeline}</summary>${scenes}</details>${plan.opening ? `<h4>${t.opening}</h4><p>${esc(plan.opening)}</p>` : ''}<p>${own(ep, 'openingBeat') ? esc(landing(ep, ep.openingBeat, p, t, n)) : t.unmarked}</p>${plan.ending ? `<h4>${t.ending} · ${esc(plan.ending.mode)}</h4><p>${esc(plan.ending.event)}</p>` : ''}<p>${t.final}: ${esc(landing(ep, endBeatOf(ep), p, t, n))}</p>${claims ? `<h4>${t.claims}</h4>${claims}` : ''}${q ? `<h4>${t.questions}</h4>${q}` : ''}<p>${t.duration}: ${format(est)}s / ${t.target}: ${positive(ep?.targetSeconds) ? `${format(ep.targetSeconds)}s` : lang === 'en' ? 'Not confirmed' : '尚未确认'}</p></article>`;
  }).join('');
  const checks = report.gates.map(g => `<li class="${g.status === 'fail' ? isBlocking(g) ? 'fail' : 'warn' : g.status}"><strong>${esc(statusText(g, t))} · ${esc(gateLabel(g, lang))}</strong> <small>${esc(t[g.category === 'content' ? 'contentCategory' : g.category] ?? g.category)} / ${esc(g.level)}</small>${g.reason ? `<p>${esc(t.reason[g.reason] ?? g.reason)}</p>` : ''}${g.messages.map(m => `<p>${esc(m)}</p>`).join('')}</li>`).join('');
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc?.source)} · ${t.title}</title><style>
:root{--paper:#eceded;--panel:#f5f6f5;--seal:#8a3324;--ok:#3d6b4f}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:#252827;font:16px/1.65 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}h1,h2,h3{font-family:Georgia,serif}h1{font-size:2.5rem}h2{border-top:2px solid var(--seal);padding-top:20px;margin-top:36px}h4,h5{margin:12px 0}a{color:var(--seal)}p,li,pre{overflow-wrap:anywhere}pre{white-space:pre-wrap;font-size:.85rem;max-width:100%;padding:12px;background:#e4e7e4}button,summary{cursor:pointer}button{padding:7px 12px;border:1px solid #999;background:var(--panel);border-radius:4px}small{color:#555}li{margin:10px 0}li p{margin:4px 0}.eps,.casts,.config{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.episode,.cast,.config>div{min-width:0;padding:20px;background:var(--panel);border:1px solid #ccc}.claim{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border-top:1px solid #ccc;padding:12px 0}.claim>div{min-width:0}.claim h5{font-size:1rem}meter{width:100%;height:18px}.cast ul{max-height:260px;overflow:auto}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ccc;padding:8px}.fail{border-left:4px solid var(--seal);padding-left:12px}.warn{border-left:4px solid #a66b18;padding-left:12px}.pass{color:var(--ok)}.notice{padding:16px;background:#fff4dc}.skipped{color:#666}#checks{list-style:none;padding:0}@media(max-width:750px){main{padding:14px}.eps,.casts,.config,.claim{grid-template-columns:minmax(0,1fr)}.episode{padding:14px}h1{font-size:1.8rem}}@media print{button{display:none}.eps,.casts,.config{display:block}.episode,.cast{break-inside:avoid}.cast ul{max-height:none;overflow:visible}body{background:white}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><main><header><h1>${esc(doc?.source)} · ${t.title}</h1><button id="export">${t.export}</button><p>${t.blocking}: ${report.blockingFailures} · ${t.warnings}: ${report.warnings}</p></header>
${doc?.provenance ? `<h2>provenance</h2>${pre(doc.provenance)}` : ''}<h2>${t.script}</h2><div class="eps">${eps}</div>
<h2>${t.scenes}</h2><div class="table-wrap"><table><thead><tr>${[t.episode, t.scene, t.lighting, t.characters, t.props, t.count, t.duration].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${report.stats.sceneTable.map(s => `<tr>${[s.ep, `${s.index} · ${n.scene(s.sceneId)}`, s.lighting ?? '—', s.characters.map(n.char).join(', '), s.props.map(n.prop).join(', '), s.lineCount, `${format(s.estSeconds)}s`].map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<h2>${t.lines}</h2><div class="casts">${report.stats.castLines.map(c => `<article class="cast"><h3>${esc(n.char(c.id))}</h3><p>${t.count}: ${c.count} · ${t.chars}: ${c.chars}</p>${copy(c.lines.map(l => l.line).join('\n'))}${text(n.voice(c.id)) ? `<details><summary>${t.voice}</summary><pre>${esc(n.voice(c.id))}</pre>${copy(n.voice(c.id))}</details>` : ''}<ul>${c.lines.map(l => `<li>E${esc(l.ep)} [${l.sceneIndex}]: ${esc(`${l.delivery ? `(${l.delivery}) ` : ''}${l.line}`)}</li>`).join('')}</ul></article>`).join('')}</div>
<h2>${t.duration}</h2><p>${t.timingNote}</p><h3>${t.effective}</h3>${pre(p)}${[ctx.production?.creativeBrief, doc?.creativeBrief].filter(text).map(b => `<h3>${t.brief}</h3><p>${esc(b)}</p>`).join('')}<p>${t.scope}</p>
${doc?.assetMappings ? `<h2>assetMappings</h2>${pre(doc.assetMappings)}` : ''}<h2>${t.checks}</h2><ul id="checks">${checks}</ul><p>${t.content}</p></main>
<script id="script-data" type="application/json">${embed(doc)}</script><script>
const labels=${embed({ copied: t.copied, failed: t.copyFailed })};
async function copyText(value){
  if(location.protocol!=='file:'&&navigator.clipboard?.writeText){try{await Promise.race([navigator.clipboard.writeText(value),new Promise((_,reject)=>setTimeout(()=>reject(new Error('clipboard timeout')),1000))]);return}catch{}}
  const previous=document.activeElement;const area=document.createElement('textarea');area.value=value;area.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(area);area.select();
  try{if(!document.execCommand('copy'))throw new Error('copy failed')}finally{area.remove();previous?.focus({preventScroll:true})}
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const old=b.textContent;try{await copyText(b.dataset.copy);b.textContent=labels.copied}catch{b.textContent=labels.failed}setTimeout(()=>b.textContent=old,1600)});
document.getElementById('export').onclick=()=>{const raw=document.getElementById('script-data').textContent;const url=URL.createObjectURL(new Blob([JSON.stringify(JSON.parse(raw),null,2)+'\\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=${embed(slug(doc?.source) + '-script.json')};a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)};
window.addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(d=>{d.dataset.wasOpen=d.open;d.open=true}));window.addEventListener('afterprint',()=>document.querySelectorAll('details').forEach(d=>{d.open=d.dataset.wasOpen==='true'}));
</script></body></html>`;
}

const USAGE = `mint-script v4 (Node 18+, no dependencies)
  seed OUTLINE [--eps 1-3] [--output-path OUTPUT.json]
  validate SCRIPT [--outline FILE] [--art FILE] [--cast FILE] [--production FILE | --no-production] [--stage skeleton|full] [--verify-sources] [--production-ready] [--required-mappings FILE] [--full-workflow]
  checkup SCRIPT [same options] [--json]
  render SCRIPT [--html|--md] [--lang zh|en] [same options] [--cast FILE]
  verify-sources SCRIPT [--outline FILE] [--no-production]
  storyboard SCRIPT [--limit 15]   print a storyboard skeleton (one segment per scene) to fill in
  (validate/checkup/render read SCRIPT-storyboard.md beside the JSON, or --storyboard FILE)
  slug NAME
Full delivery requires upstream reconciliation and separate content review.`;
const readJson = path => readJsonStrict(resolve(path));
function flag(args, key, fallback = undefined) {
  const i = args.indexOf(key);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${key}: missing argument`);
  return args[i + 1];
}
function loadCtx(args, path) {
  const ctx = { docPath: resolve(path), stage: flag(args, '--stage', 'full'), verifySources: args.includes('--verify-sources') || args.includes('--production-ready'), requireTarget: args.includes('--production-ready'), requiredMappings: args.includes('--production-ready') ? true : [], fullWorkflow: args.includes('--full-workflow') };
  const requiredFile = flag(args,'--required-mappings');
  if (requiredFile !== undefined) ctx.requiredMappings = readJson(requiredFile);
  ctx.storyboardPath = resolve(flag(args, '--storyboard') ?? storyboardPathOf(path));
  try { ctx.storyboard = readFileSync(ctx.storyboardPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT' || flag(args, '--storyboard') !== undefined) throw error; }
  for (const key of ['outline', 'art', 'cast']) {
    const file = flag(args, `--${key}`);
    if (file !== undefined) { ctx[key] = readJson(file); ctx[`${key}Path`] = resolve(file); } // supplied damaged/unreadable inputs fail; never skipped
  }
  if (args.includes('--production') && args.includes('--no-production')) throw new Error('--production and --no-production are mutually exclusive');
  const productionPath = args.includes('--no-production') ? undefined : flag(args, '--production') ?? findProduction(dirname(resolve(path)));
  if (productionPath) { ctx.production = readJson(productionPath); ctx.productionPath = productionPath; }
  ctx.root = projectRoot(path, productionPath);
  Object.assign(ctx, loadKnownUpstreams(ctx.root, ctx));
  const lang = flag(args, '--lang'); if (lang) ctx.lang = lang;
  return ctx;
}
export async function main(argv) {
  const [command, path, ...args] = argv;
  if (!command || ['--help', '-h'].includes(command)) { console.log(USAGE); return; }
  if (!path) throw new Error(USAGE);
  if (command === 'slug') { console.log(slug(path)); return; }
  if (command === 'seed') {
    const raw = flag(args, '--eps'), match = raw?.match(/^(\d+)(?:-(\d+))?$/);
    if (raw && !match) throw new Error('--eps: expected N or N-M');
    const outline = readJson(path), verification = verifySources(outline,path,{outline:true});
    if (verification.errors.length) throw new Error(verification.errors.join('\n'));
    const seeded = seedFromOutline(outline, match ? [+match[1], +(match[2] ?? match[1])] : null);
    const outputPath = flag(args,'--output-path');
    if (outputPath) seeded.provenance = rebaseProvenance(seeded.provenance,path,outputPath);
    console.log(pretty(seeded)); return;
  }
  if (command === 'storyboard') {
    const doc = readJson(path), limit = Number(flag(args, '--limit', '15'));
    if (doc?.schemaVersion !== 4) throw new Error('schemaVersion must be 4');
    if (!(limit > 0)) throw new Error('--limit: expected positive seconds');
    process.stdout.write(seedStoryboard(doc, { scriptName: basename(path), limit })); return;
  }
  const doc = readJson(path), ctx = loadCtx(args, path);
  if (command === 'verify-sources') { ctx.verifySources = true; const result = checkup(doc,ctx); console.log(pretty(result)); if(result.blockingFailures) process.exitCode=1; return; }
  if (autopilotOf(ctx.production)) console.error(AUTOPILOT_NOTE);
  if (command === 'render') {
    if (doc?.schemaVersion !== 4) throw new Error('schemaVersion must be 4');
    process.stdout.write((args.includes('--html') ? renderHtml(doc, ctx) : renderMarkdown(doc, ctx)) + '\n');
    if (checkup(doc, ctx).blockingFailures) process.exitCode = 1;
    return;
  }
  if (['checkup', 'validate'].includes(command)) {
    const result = checkup(doc, ctx);
    if (args.includes('--json')) console.log(pretty(result));
    else {
      for (const g of result.gates) console.log(`${g.status}/${g.category}/${g.level} ${g.id}${g.reason ? ` (${g.reason})` : ''}${g.messages.length ? ': ' + g.messages.join('; ') : ''}`);
      console.log(`${result.blockingFailures} blocking failures; ${result.warnings} warnings. Content review not performed. Stage: ${result.stage}.`);
    }
    if (result.blockingFailures) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command: ${command}\n${USAGE}`);
}
function isMain() { try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } }
if (isMain()) {
  process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e; });
  try { await main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
