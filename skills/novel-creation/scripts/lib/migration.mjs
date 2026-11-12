// Explicit creation v2 -> v3 migration. Never used by validate/render.
import { lstatSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { object, nonempty, episodeIntent } from './document.mjs';
import { shapeProblems, scriptProblems, outlineProblems, endingProblems, reconcile } from './contracts.mjs';
const own = (o,k) => Object.hasOwn(o,k);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function legacyContextValid(c) {
  const dimensions = ['genre','narrativeStyle','structure','pacing'];
  const identity = x => object(x) && nonempty(x.id) && /^[a-z][a-z0-9-]*$/.test(x.id) && typeof x.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(x.version);
  if (!object(c) || Object.keys(c).some(k => !['selection','references','overridePaths'].includes(k)) || !object(c.selection) || Object.keys(c.selection).length !== dimensions.length || dimensions.some(k => !identity(c.selection[k]))) return false;
  if (!Array.isArray(c.references) || c.references.length !== 3 || new Set(c.references.map(r => r?.dimension)).size !== 3) return false;
  for (const r of c.references) if (!identity(r) || !['genre','narrativeStyle','pacing'].includes(r.dimension) || r.stage !== 'creation' || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256) || c.selection[r.dimension].id !== r.id || c.selection[r.dimension].version !== r.version) return false;
  return Array.isArray(c.overridePaths) && new Set(c.overridePaths).size === c.overridePaths.length && c.overridePaths.every(p => p === 'params.rules.cutDuration');
}
export function migrateV3(input, {script, outline, confirm = false} = {}) {
  if (typeof confirm !== 'boolean') throw new Error('confirm 必须为布尔值');
  if (!object(input) || input.schemaVersion !== 2) throw new Error('迁移入口仅接受 creation schemaVersion:2');
  const errors = [], pending = [], archived = {};
  if (!object(input.params?.rules) || !object(input.params.rules.cutDuration)) errors.push('旧 v2 必须显式保存 params.rules.cutDuration，缺失时先修复输入');
  if (script !== undefined) errors.push(...scriptProblems(script));
  if (outline !== undefined) errors.push(...outlineProblems(outline));
  const doc = structuredClone(input);
  doc.schemaVersion = 3;
  for (const key of ['creativeContext', 'creative', 'selection', 'decisions', 'overrides', 'seedNote']) if (own(doc,key)) {
    archived[key] = doc[key];
    if (key === 'creativeContext' && !legacyContextValid(doc[key])) errors.push('旧 creativeContext 结构损坏');
    if (key === 'seedNote') pending.push({path:key,value:doc[key],action:'保留在迁移工作记录，人工检查创作信息'});
    delete doc[key];
  }
  if (object(doc.params)) {
    for (const key of ['rules','defaults','preferences','minCutSeconds','maxCutSeconds']) if (own(doc.params,key)) {
      archived['params.'+key] = doc.params[key];
      if (key === 'rules') {
        const rules = doc.params.rules;
        if (!object(rules) || Object.keys(rules).some(k => k !== 'cutDuration') || !object(rules.cutDuration)) errors.push('旧 params.rules 损坏');
        else {
          const r = rules.cutDuration;
          if (!['off','warn','error'].includes(r.level) || Object.keys(r).some(k => !(r.level === 'off' ? ['level'] : ['level','minSeconds','maxSeconds']).includes(k)) || (r.level !== 'off' && (!Number.isFinite(r.minSeconds) || !Number.isFinite(r.maxSeconds) || r.minSeconds <= 0 || r.maxSeconds < r.minSeconds))) errors.push('旧 cutDuration 非法');
          pending.push({path:'params.rules.cutDuration',value:r,manualOverride:input.creativeContext?.overridePaths?.includes('params.rules.cutDuration') ?? false,action:'确认不再作为机器规则；需要的镜头建议合并到唯一 creativeBrief'});
        }
      } else pending.push({path:'params.'+key,value:doc.params[key],action:'人工确认创作要求或工作记录去向'});
      delete doc.params[key];
    }
  }
  for (const ep of doc.episodes ?? []) {
    if (!object(ep)) { errors.push('旧 episode 非法'); continue; }
    if (!nonempty(ep.opening)) errors.push(`E${ep.ep} 旧 opening 不能为空`);
    errors.push(...endingProblems(ep.ending, `旧 E${ep.ep}`));
    const coords = (ep.segments ?? []).flatMap(s => (s.cuts ?? []).map(c => ({scene:s.sceneIndex,beats:c.beats})));
    for (const key of ['openingBeat','endBeat']) {
      const pos = ep[key];
      if (!Array.isArray(pos) || pos.length !== 2 || !pos.every(n => Number.isInteger(n) && n > 0) || !coords.some(c => c.scene === pos[0] && c.beats?.[0] <= pos[1] && c.beats?.[1] >= pos[1])) errors.push(`E${ep.ep} 旧 ${key} 无效`);
    }
    const last = coords.at(-1);
    if (!same(ep.endBeat, [last?.scene,last?.beats?.[1]])) errors.push(`E${ep.ep} 旧 endBeat 不在最后镜头`);
    const oldPlan = {opening:ep.opening,ending:ep.ending,openingBeat:ep.openingBeat,endBeat:ep.endBeat};
    archived[`episodes.${ep.ep}.plan`] = oldPlan;
    if (!errors.length) {
      const current = episodeIntent(ep.ep,{script,outline});
      if (current.planSource === 'missing-upstream') pending.push({path:`episodes.${ep.ep}.plan`,value:oldPlan,action:'无当前上游，旧计划保存在迁移记录；迁移后必须提供上游重新对账'});
      else {
        if (current.opening !== ep.opening || current.ending?.mode !== ep.ending?.mode || current.ending?.event !== ep.ending?.event) errors.push(`E${ep.ep} 旧计划与当前上游不同，先人工合并，不能丢弃`);
        if (script && (!same(ep.endBeat,current.endBeat) || !same(ep.openingBeat,current.openingBeat))) errors.push(`E${ep.ep} 旧坐标与当前剧本不同，先修复镜头覆盖`);
      }
    }
    for (const key of ['opening','ending','endBeat']) delete ep[key];
  }
  errors.push(...shapeProblems(doc));
  if (!errors.length) errors.push(...reconcile(doc,script,outline));
  if (errors.length) throw new Error(errors.join('；'));
  // Keep meaningful text rather than silently dropping preferences. Rules are
  // archived for review, not mechanically converted from profile names.
  const preferences = archived['params.preferences'];
  if (preferences !== undefined && confirm) {
    if (typeof preferences !== 'string' && !Array.isArray(preferences)) throw new Error('preferences 无法安全合并，请先人工整理为文本');
    const lines = Array.isArray(preferences) ? preferences : [preferences];
    if (!lines.every(nonempty)) throw new Error('preferences 含非文本内容，请人工整理');
    doc.creativeBrief = [doc.creativeBrief,...lines].filter(Boolean).join('\n');
  }
  return {status:pending.length && !confirm ? 'pending' : 'ready', document:doc, pending, archived,
    verification:'仅完成迁移结构检查；内容未评审，模型/参考图/完整覆盖请运行 validate'};
}
export function migrateFile(input, options = {}) {
  const file = resolve(input), stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('迁移输入必须为非符号链接常规文件');
  const original = readFileSync(file);
  const value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original));
  const result = migrateV3(value, options);
  if (!options.out || result.status === 'pending') return {...result,written:false};
  const out = resolve(options.out), report = out+'.review';
  if (out === file) throw new Error('迁移必须写入新文件，输入是可恢复的原始备份');
  // Exclusive creation prevents replacing files, including dangling symlinks.
  const record = {...result,document:undefined,input:file,output:out,originalBackup:file};
  writeFileSync(report,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  try { writeFileSync(out,JSON.stringify(result.document,null,2)+'\n',{flag:'wx'}); }
  catch (error) { unlinkSync(report); throw error; }
  return {...result,written:true,output:out,record:report,originalBackup:file};
}
