// Self-contained creative-profile implementation. Node standard library only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RULE_KEYS = Object.freeze({
  outline: Object.freeze(['payoffCoverage', 'firstMajor', 'majorGap', 'endingPayoff', 'endingModes', 'optionalQuestions', 'stateProgress', 'arcCoverage', 'arcPayoff']),
  script: Object.freeze(['openingWindow', 'lineLength']),
  creation: Object.freeze(['cutDuration']),
});
const DIMENSIONS = ['genre', 'narrativeStyle', 'structure', 'pacing'];
const REQUIRED = { outline: DIMENSIONS, script: DIMENSIONS, creation: ['genre', 'narrativeStyle', 'pacing'] };
const OLD = { outline: ['maxBeatGap', 'pacing'], script: ['hookWindow', 'maxLineChars'], creation: ['minCutSeconds', 'maxCutSeconds'] };
const SHAPES = {
  payoffCoverage: { minPerEpisode: 'integer' }, firstMajor: { byEpisode: 'integer' }, majorGap: { maxGap: 'integer' },
  endingPayoff: { minWeight: 'weight' }, endingModes: { nonFinal: 'modes', final: 'modes' }, optionalQuestions: { allow: 'boolean' },
  stateProgress: {}, arcCoverage: {}, arcPayoff: { minWeight: 'weight' },
  openingWindow: { maxBeats: 'integer' }, lineLength: { maxChars: 'integer' }, cutDuration: { minSeconds: 'positive', maxSeconds: 'positive' },
};
const own = (o, k) => Object.hasOwn(o, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const clone = v => structuredClone(v);
const idValid = v => typeof v === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v);
const versionValid = v => typeof v === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(v);
const fail = message => { throw new Error(message); };
function stageKeys(stage) { if (!own(RULE_KEYS, stage)) fail(`不支持的阶段：${stage}`); return RULE_KEYS[stage]; }
function fields(value, required, optional, label) {
  if (!object(value)) return [`${label} 必须为对象`];
  return [...required.filter(k => !own(value, k)).map(k => `${label}.${k} 缺失`),
    ...Object.keys(value).filter(k => ![...required, ...optional].includes(k)).map(k => `${label}.${k} 未知字段`)];
}
function assertErrors(errors) { if (errors.length) fail(errors.join('\n')); }
function canonical(v, key = '') {
  if (Array.isArray(v)) { const a = v.map(x => canonical(x)); return ['nonFinal', 'final'].includes(key) ? a.sort() : a; }
  if (object(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k], k)]));
  return v;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const identity = p => `${p.dimension}/${p.id}/${p.version}`;
function ruleErrors(stage, key, value, label = `rules.${key}`) {
  if (!stageKeys(stage).includes(key)) return [`${label} 未知规则`];
  if (!object(value)) return [`${label} 必须为完整规则对象`];
  if (value.level === 'off') return fields(value, ['level'], [], label);
  const shape = SHAPES[key];
  const errors = fields(value, ['level', ...Object.keys(shape)], [], label);
  if (!['warn', 'error'].includes(value.level)) errors.push(`${label}.level 必须为 off/warn/error`);
  for (const [name, type] of Object.entries(shape)) {
    const v = value[name];
    const valid = type === 'integer' ? Number.isInteger(v) && v > 0
      : type === 'positive' ? typeof v === 'number' && Number.isFinite(v) && v > 0
      : type === 'boolean' ? typeof v === 'boolean'
      : type === 'weight' ? ['minor', 'major'].includes(v)
      : Array.isArray(v) && v.length > 0 && v.every(x => ['suspense', 'closure', 'open'].includes(x)) && new Set(v).size === v.length;
    if (!valid) errors.push(`${label}.${name} 非法参数（${type}）`);
  }
  if (key === 'cutDuration' && value.minSeconds > value.maxSeconds) errors.push(`${label} minSeconds 不得大于 maxSeconds`);
  return errors;
}
function defaultErrors(stage, defaults, complete = false, label = 'defaults') {
  const keys = stage === 'outline' ? ['questionResolveWithin'] : [];
  const errors = fields(defaults, complete ? keys : [], complete ? [] : keys, label);
  if (object(defaults) && own(defaults, 'questionResolveWithin')) {
    const v = defaults.questionResolveWithin;
    if (!(v === null || Number.isInteger(v) && v > 0)) errors.push(`${label}.questionResolveWithin 必须为正整数或 null`);
  }
  return errors;
}
export function neutralParams(stage) {
  return { rules: Object.fromEntries(stageKeys(stage).map(k => [k, { level: 'off' }])), ...(stage === 'outline' ? { defaults: { questionResolveWithin: null } } : {}) };
}
export function validateSelection(selection) {
  const errors = fields(selection, DIMENSIONS, [], 'selection');
  if (!object(selection)) return errors;
  for (const d of DIMENSIONS) {
    const entry = selection[d];
    errors.push(...fields(entry, ['id', 'version'], [], `selection.${d}`));
    if (!idValid(entry?.id)) errors.push(`selection.${d}.id 必须为小写连字符标识`);
    if (!versionValid(entry?.version)) errors.push(`selection.${d}.version 必须为精确语义版本`);
  }
  return errors;
}
export function validateCreative(creative) {
  if (creative === undefined) return [];
  const errors = fields(creative, ['version', 'selection'], [], 'creative');
  if (creative?.version !== 1) errors.push('creative.version 仅支持 1');
  return [...errors, ...validateSelection(creative?.selection)];
}
export function validateParams(stage, params) {
  stageKeys(stage);
  if (!object(params)) return ['params 必须为对象'];
  const errors = fields(params.rules, RULE_KEYS[stage], [], 'params.rules');
  if (object(params.rules)) for (const [key, value] of Object.entries(params.rules)) errors.push(...ruleErrors(stage, key, value, `params.rules.${key}`));
  if (stage === 'outline' || own(params, 'defaults')) errors.push(...defaultErrors(stage, params.defaults, true, 'params.defaults'));
  for (const key of OLD[stage]) if (own(params, key)) errors.push(`params.${key} 旧字段已停用；请显式迁移`);
  return errors;
}
function within(root, file) { const rel = path.relative(root, file); return rel === '' || !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); }
function readUTF8(file) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file)); }
  catch (e) { fail(`${file} 无法读取合法 UTF-8：${e.message}`); }
}
function entryExists(file) {
  try { fs.lstatSync(file); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
function safeRoot(skillRoot) {
  const root = fs.realpathSync(skillRoot);
  const refs = path.join(root, 'references');
  if (!entryExists(refs)) return null;
  if (fs.lstatSync(refs).isSymbolicLink() || !within(root, fs.realpathSync(refs))) fail('references 不允许符号链接或目录逃逸');
  const profiles = path.join(refs, 'profiles');
  if (!entryExists(profiles)) return null;
  if (fs.lstatSync(profiles).isSymbolicLink() || !within(refs, fs.realpathSync(profiles))) fail('profiles 不允许符号链接或目录逃逸');
  return profiles;
}
function safeGuide(root, directory, guide) {
  if (typeof guide !== 'string' || !guide || path.isAbsolute(guide) || /^[A-Za-z]:/.test(guide) || guide.includes('\\') || guide.includes('\0') || guide.split('/').some(p => !p || p === '.' || p === '..') || !guide.endsWith('.md')) fail('guide 必须为 profile 目录内的相对 Markdown 路径');
  const file = path.resolve(directory, guide);
  if (!within(directory, file) || !within(root, file)) fail('guide 目录逃逸');
  let cursor = directory;
  for (const part of guide.split('/')) { cursor = path.join(cursor, part); if (fs.lstatSync(cursor).isSymbolicLink()) fail('guide 不允许符号链接'); }
  if (!fs.statSync(file).isFile() || !within(root, fs.realpathSync(file))) fail('guide 必须为本地常规文件');
  return file;
}
function profileErrors(p, stage) {
  const errors = fields(p, ['profileSchemaVersion', 'dimension', 'id', 'version', 'stage', 'guide', 'rules'], ['defaults'], 'profile');
  if (p?.profileSchemaVersion !== 1) errors.push('profileSchemaVersion 仅支持 1');
  if (!DIMENSIONS.includes(p?.dimension)) errors.push('profile.dimension 非法');
  if (!idValid(p?.id)) errors.push('profile.id 非法');
  if (!versionValid(p?.version)) errors.push('profile.version 必须为精确语义版本');
  if (p?.stage !== stage) errors.push(`profile.stage 必须为 ${stage}`);
  if (!object(p?.rules)) errors.push('profile.rules 必须为对象');
  else for (const [k, v] of Object.entries(p.rules)) errors.push(...ruleErrors(stage, k, v));
  if (object(p) && own(p, 'defaults')) errors.push(...defaultErrors(stage, p.defaults));
  return errors;
}
// Index all descriptor identities without consuming rules, guides or schema extensions.
// Safety and uniqueness remain global, including unselected versions/dimensions.
function indexProfiles(skillRoot) {
  const root = safeRoot(skillRoot);
  if (!root) return [];
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) fail(`策略目录不允许符号链接：${file}`);
      if (!within(root, fs.realpathSync(file))) fail(`策略目录逃逸：${file}`);
      if (stat.isDirectory()) walk(file);
      else if (!stat.isFile()) fail(`策略目录包含非常规文件：${file}`);
      else if (name === 'profile.json') files.push(file);
    }
  }
  walk(root);
  const seen = new Set();
  return files.map(file => {
    const raw = readUTF8(file);
    let p; try { p = JSON.parse(raw); } catch (e) { fail(`${file} JSON 无效：${e.message}`); }
    if (!object(p) || !DIMENSIONS.includes(p.dimension) || !idValid(p.id) || !versionValid(p.version)) fail(`${file}: profile 身份无效`);
    const key = identity(p); if (seen.has(key)) fail(`重复 profile 身份：${key}`); seen.add(key);
    return { root, file, raw, descriptor: p };
  });
}
function loadProfile(entry, stage) {
  const { root, file, raw, descriptor: p } = entry;
  assertErrors(profileErrors(p, stage).map(e => `${file}: ${e}`));
  const guidePath = safeGuide(root, path.dirname(file), p.guide);
  const guide = readUTF8(guidePath);
  if (!guide.trim()) fail(`指南正文为空：${guidePath}`);
  const sha256 = crypto.createHash('sha256').update(JSON.stringify(['shuohao-profile-v1', raw, guide]), 'utf8').digest('hex');
  return { ...p, guide, guidePath, profilePath: file, sha256 };
}
export function discoverProfiles(skillRoot, stage) {
  stageKeys(stage);
  // Explicit catalogue inspection consumes every applicable entry, not record-only dimensions.
  return indexProfiles(skillRoot).filter(e => REQUIRED[stage].includes(e.descriptor.dimension)).map(e => loadProfile(e, stage));
}
function selectedProfiles(skillRoot, stage, selection) {
  const installed = indexProfiles(skillRoot);
  return REQUIRED[stage].map(d => {
    const entry = installed.find(({ descriptor: p }) => p.dimension === d && p.id === selection[d].id && p.version === selection[d].version);
    if (!entry) fail(`缺少必需 profile：${stage}/${d}/${selection[d].id}/${selection[d].version}`);
    return loadProfile(entry, stage);
  });
}

function overrideErrors(stage, overrides) {
  if (!object(overrides)) return ['overrides 必须为路径到完整值的对象'];
  const errors = [];
  for (const [p, value] of Object.entries(overrides)) {
    const parts = p.split('.');
    if (parts.length !== 3 || parts[0] !== 'params') { errors.push(`非法覆盖路径：${p}`); continue; }
    if (parts[1] === 'rules') errors.push(...ruleErrors(stage, parts[2], value, p));
    else if (stage === 'outline' && parts[1] === 'defaults' && parts[2] === 'questionResolveWithin') errors.push(...defaultErrors(stage, { questionResolveWithin: value }));
    else errors.push(`不可覆盖技术、基础或未知路径：${p}`);
  }
  return errors;
}
function compose(skillRoot, stage, selection, overrides = {}) {
  assertErrors(validateSelection(selection)); assertErrors(overrideErrors(stage, overrides));
  const profiles = selectedProfiles(skillRoot, stage, selection);
  const params = neutralParams(stage), entries = new Map(), conflicts = [];
  for (const p of profiles) for (const group of ['rules', 'defaults']) for (const [key, value] of Object.entries(p[group] ?? {})) {
    const target = `params.${group}.${key}`;
    if (!entries.has(target)) entries.set(target, []);
    entries.get(target).push({ source: identity(p), value });
  }
  for (const [target, values] of entries) {
    const [, group, key] = target.split('.');
    const unique = values.filter((v, i) => !values.slice(0, i).some(x => equal(x.value, v.value)));
    if (unique.length > 1 && !own(overrides, target)) conflicts.push({ path: target, values: clone(values) });
    // A conflicting candidate stays neutral until an explicit complete override resolves it.
    else params[group][key] = clone(own(overrides, target) ? overrides[target] : values[0].value);
  }
  for (const [target, value] of Object.entries(overrides)) { const [, group, key] = target.split('.'); params[group][key] = clone(value); }
  return {
    references: profiles.map(({ dimension, id, version, stage, sha256 }) => ({ dimension, id, version, stage, sha256 })),
    rules: params.rules, defaults: params.defaults ?? {},
    guides: profiles.map(p => ({ dimension: p.dimension, id: p.id, version: p.version, stage: p.stage, path: p.guidePath, text: p.guide })),
    conflicts,
  };
}
export function resolveProfiles(skillRoot, stage, selection, options = {}) {
  if (!object(options)) fail('resolveProfiles options 必须为对象');
  const result = compose(skillRoot, stage, selection, options.overrides === undefined ? {} : options.overrides);
  if (result.conflicts.length) fail(`策略冲突，需要完整覆盖：${result.conflicts.map(c => c.path).join(', ')}`);
  const { conflicts, ...resolved } = result; return resolved;
}
function contextErrors(context, stage) {
  const errors = fields(context, ['selection', 'references', 'overridePaths'], [], 'creativeContext');
  if (!object(context)) return errors;
  errors.push(...validateSelection(context.selection));
  if (!Array.isArray(context.references)) errors.push('creativeContext.references 必须为数组');
  else {
    const seen = new Set();
    for (const r of context.references) {
      errors.push(...fields(r, ['dimension', 'id', 'version', 'stage', 'sha256'], [], 'reference'));
      if (!REQUIRED[stage].includes(r?.dimension) || seen.has(r?.dimension)) errors.push('reference 维度重复或不属于必需范围');
      seen.add(r?.dimension);
      if (r?.stage !== stage || !idValid(r?.id) || !versionValid(r?.version) || typeof r?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) errors.push('reference 身份、阶段或 SHA-256 无效');
      if (!equal(context.selection?.[r?.dimension], { id: r?.id, version: r?.version })) errors.push('reference 与选择快照不一致');
    }
    for (const d of REQUIRED[stage]) if (!seen.has(d)) errors.push(`reference 缺少 ${d}`);
  }
  if (!Array.isArray(context.overridePaths) || new Set(context.overridePaths).size !== context.overridePaths.length) errors.push('overridePaths 必须为无重复的完整路径数组');
  else for (const p of context.overridePaths) if (!parameterPaths(stage).includes(p)) errors.push(`非法覆盖路径：${p}`);
  return errors;
}
function parameterPaths(stage) { return [...stageKeys(stage).map(k => `params.rules.${k}`), ...(stage === 'outline' ? ['params.defaults.questionResolveWithin'] : [])]; }
function get(doc, p) { return p.split('.').reduce((v, k) => v?.[k], doc); }
export function previewApplication(doc, { skillRoot, stage, selection, overrides = {}, decisions = {} }) {
  stageKeys(stage);
  if (!object(doc) || doc.params !== undefined && !object(doc.params)) fail('产物及 params 必须为对象');
  assertErrors(validateSelection(selection)); assertErrors(overrideErrors(stage, overrides));
  if (!object(decisions)) fail('decisions 必须为对象');
  for (const [p, v] of Object.entries(decisions)) {
    if (!parameterPaths(stage).includes(p) || !['keep', 'drop'].includes(v)) fail(`非法决策：${p}（仅支持 keep/drop）`);
    if (own(overrides, p)) fail(`同一路径不能同时填写 overrides 与 decisions：${p}`);
  }
  if (doc.creativeContext !== undefined) assertErrors(contextErrors(doc.creativeContext, stage));
  const template = compose(skillRoot, stage, selection);
  for (const ref of doc.creativeContext?.references ?? []) {
    const next = template.references.find(r => identity(r) === identity(ref));
    if (next && next.sha256 !== ref.sha256) fail(`来源漂移：${identity(ref)}；必须恢复原文件或创建新版本并更新选择，不能接受同版本新摘要`);
  }
  let previous = neutralParams(stage), oldConflicts = [];
  if (doc.creativeContext) {
    try {
      const old = compose(skillRoot, stage, doc.creativeContext.selection);
      previous = { rules: old.rules, ...(stage === 'outline' ? { defaults: old.defaults } : {}) };
      oldConflicts = old.conflicts.map(c => c.path);
      // Unverifiable old bytes cannot establish which values were manually edited.
      if (old.references.some(r => doc.creativeContext.references.find(x => identity(x) === identity(r))?.sha256 !== r.sha256)) previous = null;
    } catch { previous = null; }
  }
  const actualOverrides = { ...overrides };
  for (const [p, decision] of Object.entries(decisions)) if (decision === 'keep') {
    actualOverrides[p] = clone(get(doc, p));
  }
  assertErrors(overrideErrors(stage, actualOverrides));
  const result = compose(skillRoot, stage, selection, actualOverrides);
  const candidate = clone(doc);
  candidate.params = { ...(candidate.params ?? {}), rules: result.rules };
  if (stage === 'outline') candidate.params.defaults = result.defaults;
  else delete candidate.params.defaults;
  for (const key of OLD[stage]) delete candidate.params[key];
  const decisionsRequired = [], changes = [];
  for (const p of parameterPaths(stage)) {
    const current = get(doc, p), templateValue = get({ params: { rules: template.rules, defaults: template.defaults } }, p);
    const recorded = doc.creativeContext?.overridePaths.includes(p) ?? false;
    const manual = current !== undefined && (previous === null || oldConflicts.includes(p) || !equal(current, get({ params: previous }, p)));
    const required = recorded || manual;
    if (required && !own(actualOverrides, p) && !own(decisions, p)) decisionsRequired.push(p);
    changes.push({ path: p, current: current === undefined ? null : clone(current), currentMissing: current === undefined,
      template: clone(templateValue), value: clone(get(candidate, p)), previousOverride: recorded, manualDifference: manual,
      changed: !equal(current, get(candidate, p)), decisionRequired: required,
      decision: own(overrides, p) ? 'replace' : decisions[p] ?? null });
  }
  candidate.creativeContext = { selection: clone(selection), references: result.references, overridePaths: Object.keys(actualOverrides).sort() };
  assertErrors(validateParams(stage, candidate.params));
  return { document: candidate, changes, conflicts: result.conflicts, decisionsRequired };
}
export function applyToFile(file, options) {
  if (!object(options) || options.confirm !== undefined && typeof options.confirm !== 'boolean') fail('应用 options 必须为对象，confirm 必须为布尔值');
  const absolute = path.resolve(file);
  if (fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(absolute).isFile()) fail('产物必须为非符号链接的常规文件');
  const original = fs.readFileSync(absolute);
  const doc = JSON.parse(original.toString('utf8'));
  const preview = previewApplication(doc, options);
  if (!options.confirm) return { ...preview, applied: false, backup: null };
  if (preview.conflicts.length || preview.decisionsRequired.length) fail(`应用存在未决项：${[...preview.conflicts.map(c => c.path), ...preview.decisionsRequired].join(', ')}`);
  const nonce = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const backup = `${absolute}.backup-${nonce}`, temp = `${absolute}.tmp-${nonce}`;
  let descriptor;
  try {
    if (!fs.readFileSync(absolute).equals(original)) fail('产物在预览后已变化，请重新应用');
    fs.writeFileSync(backup, original, { flag: 'wx', mode: fs.statSync(absolute).mode & 0o777 });
    descriptor = fs.openSync(temp, 'wx', fs.statSync(absolute).mode & 0o777);
    fs.writeFileSync(descriptor, `${JSON.stringify(preview.document, null, 2)}\n`);
    fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    if (fs.lstatSync(absolute).isSymbolicLink() || !fs.readFileSync(absolute).equals(original)) fail('产物在写入前已变化，请重新应用');
    fs.renameSync(temp, absolute);
  } catch (e) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw e;
  }
  return { ...preview, applied: true, backup };
}
export function inspectContext(doc, { skillRoot, stage, production }) {
  stageKeys(stage);
  const checks = [];
  const add = (id, category, level, status, message, reason) => checks.push({ id, category, level, status, ...(reason ? { reason } : {}), message });
  const context = doc?.creativeContext;
  if (context === undefined) add('creative-context', 'source', 'warn', 'skipped', '尚未应用策略；仅检查当前有效参数', 'stage-incomplete');
  else {
    const errors = contextErrors(context, stage);
    add('creative-context', 'base', 'error', errors.length ? 'fail' : 'pass', errors.join('；') || '策略来源记录结构有效');
    if (!errors.length) {
      let profiles;
      try { profiles = indexProfiles(skillRoot); }
      catch (e) { add('creative-sources', 'source', 'warn', 'fail', `来源不可核验：${e.message}`, 'source-unverifiable'); }
      if (profiles) for (const ref of context.references) {
        const entry = profiles.find(p => identity(p.descriptor) === identity(ref));
        let profile;
        if (entry) {
          try { profile = loadProfile(entry, stage); }
          catch (e) { add(`creative-source-${ref.dimension}`, 'source', 'warn', 'fail', `来源不可核验：${e.message}`, 'source-unverifiable'); continue; }
        }
        if (!profile) add(`creative-source-${ref.dimension}`, 'source', 'warn', 'fail', `来源未安装：${identity(ref)}；继续按既有参数检查`, 'source-unverifiable');
        else if (profile.sha256 !== ref.sha256) add(`creative-source-${ref.dimension}`, 'source', 'warn', 'fail', `来源漂移：${identity(ref)}；参数及摘要保持不变`, 'source-drift');
        else add(`creative-source-${ref.dimension}`, 'source', 'warn', 'pass', `来源摘要匹配：${identity(ref)}（不证明内容质量）`);
      }
    }
  }
  if (production === undefined) add('creative-project', 'base', 'error', 'skipped', '未提供 production，不能宣称项目选择已对账', 'missing-upstream');
  else if (!object(production)) add('creative-project', 'base', 'error', 'fail', '提供的 production 必须为有效对象');
  else {
    const errors = validateCreative(production.creative);
    if (errors.length) add('creative-project', 'base', 'error', 'fail', errors.join('；'));
    else if (!production.creative) add('creative-project', 'base', 'error', 'skipped', '项目尚未记录创作选择', 'stage-incomplete');
    else add('creative-project', 'base', 'error', equal(context?.selection, production.creative.selection) ? 'pass' : 'fail', equal(context?.selection, production.creative.selection) ? '项目选择已对账；摘要仅比较本阶段来源' : '项目选择与应用快照不一致，待同步');
  }
  return checks;
}
function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`${file} 无法读取 JSON：${e.message}`); } }
export function handleCreativeCommand(argv, { skillRoot, stage }) {
  const [command, ...args] = argv;
  if (!['profiles', 'profile', 'apply-profile'].includes(command)) return false;
  stageKeys(stage);
  const options = {}, positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') { if (options.confirm) fail('重复 --confirm'); options.confirm = true; }
    else if (['--selection', '--production', '--overrides', '--decisions'].includes(arg)) {
      const key = arg.slice(2); if (own(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) fail(`参数缺失或重复：${arg}`);
      options[key] = args[++i];
    } else if (arg.startsWith('-')) fail(`未知参数：${arg}`);
    else positional.push(arg);
  }
  if (command === 'profiles') {
    if (args.length) fail('profiles 不接受参数');
    console.log(JSON.stringify(discoverProfiles(skillRoot, stage), null, 2)); return true;
  }
  if (!!options.selection === !!options.production) fail('必须且只能提供 --selection 或 --production');
  let selection;
  if (options.production) {
    const production = readJSON(options.production);
    if (!object(production)) fail('production 必须为对象');
    assertErrors(validateCreative(production.creative));
    if (!production.creative) fail('production 未记录 creative；不自动选择策略');
    selection = production.creative.selection;
  } else selection = readJSON(options.selection);
  assertErrors(validateSelection(selection));
  if (command === 'profile') {
    if (positional.length || options.confirm || options.decisions || options.overrides) fail('profile 仅接受选择输入');
    console.log(JSON.stringify(resolveProfiles(skillRoot, stage, selection), null, 2)); return true;
  }
  if (positional.length !== 1) fail('apply-profile 必须指定一个产物 JSON 路径');
  const result = applyToFile(positional[0], { skillRoot, stage, selection,
    overrides: options.overrides ? readJSON(options.overrides) : {}, decisions: options.decisions ? readJSON(options.decisions) : {}, confirm: options.confirm ?? false });
  console.log(JSON.stringify(result, null, 2));
  if (result.applied) console.error('策略参数已写入；尚未重新校验本阶段及已知下游，也未执行内容评审。请运行消费者校验并核对下游失效项。');
  return true;
}
