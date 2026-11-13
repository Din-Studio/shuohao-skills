#!/usr/bin/env node
// All fixtures belong to this skill. No sibling code, examples or network access.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DEFAULT_PARAMS, paramsOf, endBeatOf, plansFor, SKILL_ROOT, lineChars, beatSeconds, sceneSeconds, episodeTimeline, coordinateIndex, claimRange, computeStats, gateReport, checkup, validateScript, seedFromOutline, renderHtml, renderMarkdown, findProduction, stageDirNote, autopilotOf, slug } from './mint-script.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(join(root, 'examples', file), 'utf8'));
const DOC = read('修伞簿-script.json'), OUTLINE = read('修伞簿-outline.fixture.json'), ART = read('修伞簿-art.fixture.json'), CAST = read('修伞簿-cast.fixture.json'), PRODUCTION = read('修伞簿-production.fixture.json');
DOC.params = {};
const CTX = { outline: OUTLINE, art: ART, production: PRODUCTION, cast: CAST };
const clone = x => structuredClone(x);
let passed = 0;
function test(name, fn) { try { fn(); passed++; } catch (e) { throw new Error(`${name}: ${e.message}`, { cause: e }); } }
function gate(doc, id, ctx = {}) { return gateReport(doc, ctx).find(g => g.id === id); }
function mutate(name, edit, id = 'fields', ctx = {}) {
  test(name, () => { const doc = clone(DOC); edit(doc); assert.equal(gate(doc, id, ctx).status, 'fail'); assert(validateScript(doc, ctx).length); });
}
function near(a, b) { assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`); }

// Baseline and strict deterministic seed projection.
test('bundled independent story', () => { assert.equal(DOC.source, '修伞簿'); assert.equal(DOC.episodes.length, 3); assert.equal(computeStats(DOC).totals.lines, 30); });
test('local validation', () => assert.deepEqual(validateScript(DOC), []));
test('upstream validation', () => assert.deepEqual(validateScript(DOC, CTX), []));
test('seed minimal references, not duplicated plans or defaults', () => {
  const seed = seedFromOutline(OUTLINE);
  assert.equal(seed.schemaVersion, 4); assert(!Object.hasOwn(seed, 'params'));
  seed.episodes.forEach(e => {
    assert(!Object.hasOwn(e,'targetSeconds'));
    assert.deepEqual(e.beatClaims, OUTLINE.beats.filter(b => b.episode === e.ep).map(b => ({ beatId: b.id, start: null, end: null })));
    assert.deepEqual(e.scenes, []);
    for (const key of ['opening', 'ending', 'openingBeat', 'endBeat', 'seedNote']) assert(!Object.hasOwn(e, key));
  });
});
test('seed range', () => assert.deepEqual(seedFromOutline(OUTLINE, [2, 2]).episodes.map(e => e.ep), [2]));
for (const range of [[0, 1], [2, 1], [1.5, 2], [9, 9], ['1', 2]]) test(`seed invalid range ${range}`, () => assert.throws(() => seedFromOutline(OUTLINE, range)));
for (const input of [null, {}, { schemaVersion: 1 }, { ...OUTLINE, schemaVersion: undefined }, { ...OUTLINE, params: { minutesPerEpisode: '1' } }, { ...OUTLINE, beats: null }]) test('seed rejects damaged upstream', () => assert.throws(() => seedFromOutline(input)));
test('skeleton has explicit skipped timing', () => {
  const s = seedFromOutline(OUTLINE);
  assert.deepEqual(validateScript(s, { outline: OUTLINE, stage: 'skeleton' }), []);
  assert.equal(gate(s, 'duration', { stage: 'skeleton' }).reason, 'stage-incomplete');
  assert(validateScript(s, { outline: OUTLINE }).length);
});
test('skeleton still checks projection and claims', () => { const s = seedFromOutline(OUTLINE); s.episodes[0].beatClaims.pop(); assert.equal(gate(s, 'beats-claimed', { outline: OUTLINE, stage: 'skeleton' }).status, 'fail'); });

// Timing is a single unrounded axis, including cross-scene ranges and boundaries.
test('line character algorithm unchanged', () => { assert.equal(lineChars('  你 好，  '), 3); assert.equal(lineChars('😀'), 2); assert.equal(lineChars(null), 0); });
test('beat duration', () => { assert.equal(beatSeconds({ action: '观察' }), 2.5); assert.equal(beatSeconds({ speaker: 'VO', line: '一二三四五六七八九' }), 2); });
test('invalid beat not zero seconds', () => { assert.equal(beatSeconds({ action: '', line: '台词' }), null); assert.equal(beatSeconds({ action: '观察' }, { actionSeconds: Infinity }), null); });
test('numeric overflow is unavailable, never zero', () => {
  assert.equal(beatSeconds({ line: '文本' }, { charsPerSecond: Number.MIN_VALUE }), null);
  const ep = { scenes: [{ flow: [{ action: '等待' }, { action: '观察' }] }] };
  assert.equal(episodeTimeline(ep, { actionSeconds: Number.MAX_VALUE }).at(-1).endSeconds, null);
  assert.equal(sceneSeconds(ep.scenes[0], { actionSeconds: Number.MAX_VALUE }).total, null);
});
test('scene duration', () => assert.deepEqual(sceneSeconds({ flow: [{ action: '停留' }, { line: '一二三四五六七八九' }] }), { dialogue: 2, action: 2.5, total: 4.5 }));
test('same axis for stats, claims and final beat', () => {
  const stats = computeStats(DOC);
  DOC.episodes.forEach((ep, i) => {
    const rows = episodeTimeline(ep, DOC.params);
    assert.equal(stats.episodes[i].est, rows.at(-1).endSeconds);
    assert.equal(coordinateIndex(ep, endBeatOf(ep)), rows.length - 1);
    near(stats.sceneTable.filter(s => s.ep === ep.ep).reduce((n, s) => n + s.estSeconds, 0), rows.at(-1).endSeconds);
    for (const c of ep.beatClaims) {
      const r = claimRange(ep, c, DOC.params);
      assert.equal(r.startSeconds, rows[coordinateIndex(ep, c.start)].startSeconds);
      assert.equal(r.endSeconds, rows[coordinateIndex(ep, c.end)].endSeconds);
      near(r.endSeconds - r.startSeconds, r.rows.reduce((n, r) => n + r.seconds, 0));
    }
  });
});
test('no scene-by-scene rounding', () => {
  const ep = { scenes: Array.from({ length: 10 }, () => ({ flow: [{ speaker: 'VO', line: '字' }] })) };
  near(episodeTimeline(ep, { charsPerSecond: 3 }).at(-1).endSeconds, 10 / 3);
});
test('invalid range unavailable', () => { const ep = DOC.episodes[0]; assert.equal(claimRange(ep, { start: [9, 1], end: [9, 2] }, DOC.params), null); });
test('invalid timing propagates instead of zero', () => {
  const d = clone(DOC); d.episodes[0].scenes[0].flow[2] = {};
  assert.equal(computeStats(d).episodes[0].est, null); assert.equal(computeStats(d).totals.estSeconds, null);
  assert.equal(claimRange(d.episodes[0], d.episodes[0].beatClaims[0], d.params), null);
  assert(renderHtml(d).includes('无效范围／估时不可用'));
});

// Core contracts cannot be disabled by policies.
for (const value of [undefined, null, 1, '2']) mutate(`schema version ${value}`, d => { d.schemaVersion = value; });
for (const value of [null, '', 2]) mutate(`source ${value}`, d => { d.source = value; });
for (const value of [null, 'params', []]) mutate('params malformed', d => { d.params = value; });
for (const key of ['charsPerSecond', 'actionSeconds']) for (const value of [0, -1, '4', Infinity, NaN, undefined]) mutate(`${key} invalid ${value}`, d => { d.params[key] = value; });
for (const value of [-1, 1, '0.15', Infinity, undefined]) mutate(`tolerance invalid ${value}`, d => { d.params.tolerance = value; });
for (const value of [null, [], {}]) mutate('episodes malformed', d => { d.episodes = value; });
for (const value of [0, '1', 1.5]) mutate(`ep invalid ${value}`, d => { d.episodes[0].ep = value; });
mutate('duplicate ep', d => { d.episodes[1].ep = 1; });
mutate('out-of-order ep', d => { d.episodes.reverse(); });
for (const value of [0, -1, '60', Infinity]) mutate(`target invalid ${value}`, d => { d.episodes[0].targetSeconds = value; });
mutate('opening nonempty', d => { d.episodes[0].opening = ' '; });
for (const value of [null, {}, { mode: 'wrong', event: '事件' }, { mode: 'open', event: ' ' }]) mutate('ending type/mode/event', d => { d.episodes[0].ending = value; });
for (const key of ['question', 'questionId', 'dueByEp', 'resolves', 'unknown']) mutate(`ending rejects ${key}`, d => { d.episodes[0].ending = { mode: 'open', event: '结束', [key]: 'Q01' }; });
for (const key of ['hook', 'hookBeat', 'cliff', 'closure', 'beatsClaimed']) mutate(`non-contract episode ${key}`, d => { d.episodes[0][key] = 'x'; });
for (const key of ['openingBeat']) for (const value of [undefined, null, [0, 1], [1, 0], ['1', 1], [1, 1.5], [99, 1], [1, 99], [1, 1, 1]]) mutate(`${key} invalid ${JSON.stringify(value)}`, d => { d.episodes[0][key] = value; });
mutate('endBeat must be last', d => { d.episodes[0].endBeat = [2, 7]; });
mutate('upstream claims required', d => { delete d.episodes[0].beatClaims; }, 'beats-claimed', CTX);
mutate('claim ID format', d => { d.episodes[0].beatClaims[0].beatId = 'B1'; });
mutate('claim duplicate ID local', d => { d.episodes[0].beatClaims[1].beatId = 'B01'; });
mutate('claim duplicate ID global', d => { d.episodes[1].beatClaims[0].beatId = 'B01'; });
mutate('claim missing coordinate', d => { delete d.episodes[0].beatClaims[0].start; });
mutate('claim null coordinate full', d => { d.episodes[0].beatClaims[0].start = null; });
mutate('claim out of bounds', d => { d.episodes[0].beatClaims[0].start = [2, 99]; });
mutate('claim reversed', d => { d.episodes[0].beatClaims[0].start = [2, 3]; });
mutate('claim overlapping inclusive endpoint', d => { d.episodes[0].beatClaims[1].start = [2, 2]; });
mutate('claim ranges out of order', d => { const cs = d.episodes[0].beatClaims; [cs[0].start, cs[1].start] = [cs[1].start, cs[0].start]; [cs[0].end, cs[1].end] = [cs[1].end, cs[0].end]; });
mutate('claim extra field', d => { d.episodes[0].beatClaims[0].decisive = [1, 3]; });
mutate('no scenes full', d => { d.episodes[0].scenes = []; });
mutate('scene ID', d => { d.episodes[0].scenes[0].sceneId = 'S1'; });
mutate('characters required', d => { delete d.episodes[0].scenes[0].characters; });
mutate('characters duplicate', d => { d.episodes[0].scenes[0].characters.push('C01'); });
mutate('props malformed', d => { d.episodes[0].scenes[0].props = ['P1']; });
mutate('lighting type', d => { d.episodes[0].scenes[0].lighting = 1; });
mutate('flow nonempty', d => { d.episodes[0].scenes[0].flow = []; });
mutate('action and line exclusive', d => { d.episodes[0].scenes[0].flow[0].line = '台词'; });
mutate('neither action nor line', d => { d.episodes[0].scenes[0].flow[0] = {}; });
mutate('action empty', d => { d.episodes[0].scenes[0].flow[0].action = ' '; });
mutate('line empty', d => { d.episodes[0].scenes[0].flow[1].line = ' '; });
mutate('speaker must be present', d => { d.episodes[0].scenes[0].flow[1].speaker = 'C99'; });
mutate('delivery string', d => { d.episodes[0].scenes[0].flow[1].delivery = null; });
mutate('action cannot carry speaker', d => { d.episodes[0].scenes[0].flow[0].speaker = 'C01'; });
test('duration too long warns', () => { const d = clone(DOC); d.params.actionSeconds = 20; assert.equal(gate(d, 'duration').level, 'warn'); assert.equal(gate(d, 'duration').status, 'fail'); assert.deepEqual(validateScript(d), []); });
test('duration too short warns', () => { const d = clone(DOC); d.params.charsPerSecond = 100; assert(checkup(d).warnings); assert.deepEqual(validateScript(d), []); });
test('VO legal', () => { const d = clone(DOC); d.episodes[0].scenes[0].flow[1].speaker = 'VO'; assert.deepEqual(validateScript(d), []); });
test('no required action quota', () => {
  const d = clone(DOC);
  d.episodes[0].scenes.forEach(sc => { sc.flow = sc.flow.map(b => b.action ? { speaker: 'C01', line: '先在这里等一会儿。' } : b); });
  d.episodes[0].targetSeconds = computeStats(d).episodes[0].est;
  assert.deepEqual(validateScript(d), []);
});
test('standalone suspense requires no Q', () => { const d = clone(DOC); d.episodes[0].ending = { mode: 'suspense', event: '仍未回答' }; assert.deepEqual(validateScript(d), []); });
test('core segment may span scenes and share outside setup', () => { assert.deepEqual(validateScript(DOC, CTX), []); assert(DOC.episodes[0].beatClaims[0].start[0] < DOC.episodes[0].beatClaims[0].end[0]); });
test('same scene multiple core segments', () => { const d = clone(DOC); d.episodes[0].beatClaims = [{ beatId: 'B01', start: [1, 2], end: [1, 3] }, { beatId: 'B02', start: [1, 4], end: [1, 5] }]; assert.deepEqual(validateScript(d, CTX), []); });

// Exact projection and upstream identity/target checks independent of tolerance.
mutate('opening must match byte for byte', d => { d.episodes[0].opening = OUTLINE.episodes[0].opening; }, 'upstream-projection', CTX);
mutate('ending mode cannot drift', d => { d.episodes[0].ending = { mode: 'open', event: '结束' }; }, 'upstream-projection', CTX);
mutate('ending event cannot paraphrase', d => { d.episodes[0].ending = { mode: 'closure', event: '交还伞，约定再见。' }; }, 'upstream-projection', CTX);
test('target belongs only to script', () => { const d=clone(DOC); d.params.tolerance=0.9; d.episodes[0].targetSeconds=60.000001; assert.deepEqual(validateScript(d,CTX),[]); });
mutate('unknown ep', d => { d.episodes[2].ep = 4; }, 'upstream-projection', CTX);
mutate('missing claim', d => { d.episodes[0].beatClaims.pop(); }, 'beats-claimed', CTX);
mutate('additional claim', d => { d.episodes[0].beatClaims.unshift({ beatId: 'B99', start: [1, 1], end: [1, 1] }); }, 'beats-claimed', CTX);
mutate('wrong episode claim', d => { d.episodes[0].beatClaims[0].beatId = 'B03'; }, 'beats-claimed', CTX);
mutate('upstream claim ID order', d => { const c = d.episodes[0].beatClaims; [c[0].beatId, c[1].beatId] = [c[1].beatId, c[0].beatId]; }, 'beats-claimed', CTX);
test('same type different IDs still required separately', () => {
  const o = clone(OUTLINE); delete o.beats[0].kind; delete o.beats[1].kind;
  assert.deepEqual(validateScript(DOC, { ...CTX, outline: o }), []);
  const d = clone(DOC); d.episodes[0].beatClaims.pop(); assert.equal(gate(d, 'beats-claimed', { outline: o }).status, 'fail');
});
test('non-contract upstream minutes cannot silently provide targets', () => { const o = clone(OUTLINE); o.params.minutesPerEpisode = 2; assert.equal(gate(DOC, 'outline-input', { outline: o }).status, 'fail'); });
test('batch final does not become series final', () => { const d = clone(DOC); d.episodes = [d.episodes[0]]; assert.deepEqual(validateScript(d, CTX), []); });
mutate('character refs', d => { d.episodes[0].scenes[0].characters.push('C99'); }, 'asset-mappings', { ...CTX, requiredMappings:true });
mutate('scene refs', d => { d.episodes[0].scenes[0].sceneId = 'S99'; }, 'asset-mappings', { ...CTX, requiredMappings:true });
test('lighting refs use explicit mapped art identity', () => { const d=read('修伞簿-mapped-script.json');d.episodes[0].scenes[0].lighting='未登记';assert.equal(gate(d,'refs-scenes',CTX).status,'fail'); });
mutate('prop refs', d => { d.episodes[0].scenes[0].props.push('P99'); }, 'asset-mappings', { ...CTX, requiredMappings:true });
for (const [key, id] of [['outline', 'outline-input'], ['art', 'art-input'], ['cast', 'cast-input']]) {
  test(`missing ${key} is skipped, not pass`, () => { assert.equal(gate(DOC, id).status, 'skipped'); assert.equal(gate(DOC, id).reason, 'missing-upstream'); });
  for (const value of [null, {}, [], 'broken']) test(`supplied invalid ${key} fails`, () => { assert.equal(gate(DOC, id, { [key]: value }).status, 'fail'); assert(validateScript(DOC, { [key]: value }).length); });
}
test('invalid upstream versions fail', () => assert.equal(gate(DOC, 'outline-input', { outline: { ...OUTLINE, schemaVersion: 1 } }).status, 'fail'));
test('unsupported art and cast versions fail', () => {
  assert.equal(gate(DOC, 'art-input', { art: { ...ART, schemaVersion: 999 } }).status, 'fail');
  assert.equal(gate(DOC, 'cast-input', { cast: { ...CAST, schemaVersion: 999 } }).status, 'fail');
});
test('duplicate upstream beat fails', () => { const o = clone(OUTLINE); o.beats[1].id = o.beats[0].id; assert.equal(gate(DOC, 'outline-input', { outline: o }).status, 'fail'); });
test('malformed upstream beat fails', () => { const o = clone(OUTLINE); o.beats[0].kind = 'unknown'; assert.equal(gate(DOC, 'outline-input', { outline: o }).status, 'fail'); });

// Non-contract configuration never silently changes behavior.
for (const key of ['rules', 'defaults', 'preferences', 'hookWindow', 'maxLineChars']) mutate(`non-contract params ${key}`, d => { d.params[key] = {}; });
for (const key of ['creativeContext', 'creative', 'seedNote', 'selection', 'decisions', 'overrides']) mutate(`non-contract root ${key}`, d => { d[key] = {}; });
test('no implicit params persisted by rendering', () => { const d = clone(DOC); delete d.params; const before = JSON.stringify(d); renderHtml(d); renderMarkdown(d); assert.equal(JSON.stringify(d), before); assert.deepEqual(validateScript(d), []); });
test('default and explicit timing axes equal', () => { const d = clone(DOC); d.params = {...DEFAULT_PARAMS}; assert.deepEqual(computeStats(d), computeStats(DOC)); });
test('partial overrides applied everywhere', () => {
  const d = clone(DOC); d.params = {actionSeconds: 7, charsPerSecond: 3};
  const ep=d.episodes[0], rows=episodeTimeline(ep,d.params), stats=computeStats(d);
  assert.equal(stats.episodes[0].est,rows.at(-1).endSeconds);
  assert.equal(claimRange(ep,ep.beatClaims[0],d.params).startSeconds,rows[coordinateIndex(ep,ep.beatClaims[0].start)].startSeconds);
  assert(renderHtml(d).includes(String(Math.round(rows.at(-1).endSeconds*10)/10)));
});
test('computed end follows appended flow, not stale persisted position', () => {
  const d=clone(DOC),ep=d.episodes[0],before=endBeatOf(ep);
  ep.scenes.at(-1).flow.push({action:'林禾收好工具。'});
  assert.deepEqual(endBeatOf(ep),[before[0],before[1]+1]); assert.deepEqual(validateScript(d,CTX),[]);
});
test('standalone may omit plans, claims and opening landing', () => {
  const d=clone(DOC); for(const e of d.episodes){delete e.openingBeat;delete e.beatClaims;}
  assert.deepEqual(validateScript(d),[]); assert(renderHtml(d).includes('未标注开场落点'));
  assert(!renderHtml(d).includes('节点计划与内容落点')); assert(!renderMarkdown(d).includes('上游问题与回答落点'));
});
test('current upstream plan read rather than inferred synchronized from title', () => {
  const outline=clone(OUTLINE);outline.episodes[0].opening='新的开场计划';
  assert(renderHtml(DOC,{outline}).includes('新的开场计划'));
  assert(!renderHtml(DOC,{outline}).includes(OUTLINE.episodes[0].opening));
  assert.equal(plansFor(DOC.episodes[0],{outline}).opening,'新的开场计划');
  outline.source='别的作品';assert(validateScript(DOC,{outline}).length);
});
test('source beat deletion breaks actual claim IDs', () => { const o=clone(OUTLINE);o.beats.shift();assert(validateScript(DOC,{outline:o}).length); });
test('brief conflict requires human merge', () => {
  const d=clone(DOC);d.creativeBrief='保留停顿';
  assert.deepEqual(validateScript(d),[]);assert(validateScript(d,{production:{schemaVersion:3,creativeBrief:'表达克制'}}).length);
  assert(validateScript(DOC,{production:{schemaVersion:3,creativeBrief:' '}}).length);
});
test('wrong production version and non-contract creative fields rejected', () => {
  assert(validateScript(DOC,{production:{schemaVersion:2}}).length);
  assert(validateScript(DOC,{production:{schemaVersion:3,creative:{}}}).length);
});
test('delivery optional and special delivery preserved in both line books', () => {
  const d=clone(DOC);d.episodes[0].scenes[0].flow[1].delivery='掩饰惊讶';
  assert.deepEqual(validateScript(d),[]);
  for(const render of [renderHtml,renderMarkdown]) {const output=render(d);assert(output.slice(output.indexOf('台词本')).includes('掩饰惊讶'));}
});

test('upstream optional categories and positions do not gate claims', () => {
  const o=clone(OUTLINE);
  for(const b of o.beats){delete b.kind;delete b.weight;delete b.position;}
  assert.deepEqual(validateScript(DOC,{outline:o}),[]);
  o.beats[0].position='ending';o.beats[1].position='opening';
  assert(validateScript(DOC,{outline:o}).length);
  o.beats[0].position='unknown';assert(validateScript(DOC,{outline:o}).length);
});
test('upstream supplied weight is conditional, not required', () => {
  const o=clone(OUTLINE);delete o.beats.at(-1).weight;
  assert.deepEqual(validateScript(DOC,{outline:o}),[]);
  o.beats[0].weight='minor';assert(validateScript(DOC,{outline:o}).length);
});
test('outline alone does not own scene or prop identities', () => {
  for(const key of ['sceneId','props']) {const d=clone(DOC);d.episodes[0].scenes[0][key]=key==='sceneId'?'S99':['P99'];assert.deepEqual(validateScript(d,{outline:OUTLINE}),[]);}
});
test('overflowed clock is structural failure rather than duration notice', () => {
  const d=clone(DOC);d.params.actionSeconds=Number.MAX_VALUE;assert(validateScript(d).length);
});
test('brief types and obsolete outline fields rejected', () => {
  for(const brief of [null,'',[],2]){const d=clone(DOC);d.creativeBrief=brief;assert(validateScript(d).length);}
  const o=clone(OUTLINE);o.episodes[0].stateChange={before:'之前',after:'之后'};assert(validateScript(DOC,{outline:o}).length);
});

// Reporting includes actual text, Q locations, status separation and original export.
for (const lang of ['zh', 'en']) test(`${lang} HTML and Markdown rendering`, () => {
  const h = renderHtml(DOC, { ...CTX, lang }), m = renderMarkdown(DOC, { ...CTX, lang });
  assert(h.includes(`lang="${lang}"`)); assert(h.includes('B01')); assert(h.includes(OUTLINE.beats[0].setup)); assert(h.includes(OUTLINE.beats[0].outcome));
  assert(h.includes(DOC.episodes[0].scenes[0].flow[3].line)); assert(h.includes('Q01'));
  assert(h.includes('[1,3]–[2,2]')); assert(!h.includes('creativeContext'));
  assert(h.includes(lang === 'en' ? 'Content review not performed' : '内容评审未执行'));
  assert(!h.includes(lang === 'en' ? 'Policy disabled' : '策略关闭'));
  assert(m.includes(lang === 'en' ? 'Episode 1' : '分集 1'));
  assert(h.includes('data-copy=')); assert(!h.includes(CAST.characters[0].voice.prompt)); assert(renderHtml(read('修伞簿-mapped-script.json'),CTX).includes(CAST.characters[0].voice.prompt));
  assert(!/src="https?:|href="https?:|@import|url\(https?:/.test(h));
  assert(h.includes('@media(max-width:750px)')); assert(h.includes('@media print')); assert(h.includes('beforeprint'));
  const raw = h.match(/<script id="script-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(raw), DOC);
});
test('UI language precedence', () => { const d = clone(DOC); d.lang = 'en'; assert(renderHtml(d).includes('lang="en"')); assert(renderHtml(d, { lang: 'zh' }).includes('lang="zh"')); assert(renderHtml(DOC, { production: { lang: 'en' } }).includes('lang="en"')); });
test('unknown UI language fails', () => assert.throws(() => renderHtml(DOC, { lang: 'fr' })));
test('warning display', () => { const d = clone(DOC); d.params.actionSeconds = 100; const h = renderHtml(d, { lang: 'en' }); assert(h.includes('Warning · Estimated duration notice')); assert(h.includes('Blocking failures: 0')); });
test('missing upstream is not pass', () => { const h = renderHtml(DOC, { lang: 'en' }); assert(h.includes('Missing upstream')); assert(!h.includes('treated as passing')); });
test('no payoff classification without outline', () => assert(!renderHtml(DOC, { lang: 'en' }).includes(' · payoff /')));
test('renderer API rejects other schema versions', () => { for(const render of [renderHtml,renderMarkdown]) assert.throws(()=>render({...DOC,schemaVersion:2}),/schemaVersion must be 4/); });
test('malformed parameters are escaped in Markdown diagnostics', () => { const d=clone(DOC);d.params.actionSeconds='<img src=x onerror=alert(1)>';assert(!renderMarkdown(d).includes('<img')); });
test('source / line / attribute / JSON escaping', () => {
  const d = clone(DOC); d.source = '</script><img src=x onerror=alert(1)>'; d.episodes[0].scenes[0].flow[1].line = '<img src=x onerror="alert(1)">';
  const h = renderHtml(d);
  assert(!h.includes('<img src=x')); assert(!h.includes('</script><img')); assert(h.includes('\\u003c')); assert(h.includes('&lt;img'));
  const raw = h.match(/<script id="script-data" type="application\/json">([\s\S]*?)<\/script>/)[1]; assert.deepEqual(JSON.parse(raw), d);
});
test('invalid numeric identity is escaped in HTML attributes and Markdown', () => {
  const d = clone(DOC); d.episodes[0].ep = '\"><img src=x onerror=alert(1)>';
  d.episodes[0].ending = {mode: '<script>alert(1)</script>', event:'结束'};
  const h = renderHtml(d), m = renderMarkdown(d);
  assert(!h.includes('<img src=x')); assert(!h.includes('<script>alert(1)'));
  assert(!m.includes('<img src=x')); assert(!m.includes('<script>alert(1)'));
});
test('Q answer maps by resolves ID into actual core text', () => {
  const o = clone(OUTLINE); o.episodes[0].ending = { mode: 'suspense', event: '询问旧伞是谁修过的。', question: { id: 'Q02', text: '谁修过旧伞？', sourceRefs: o.episodes[0].sourceRefs } }; o.beats[2].resolves = ['Q02'];
  const d = clone(DOC);
  const h = renderHtml(d, { outline: o });
  assert(h.includes('Q02')); assert(h.includes('B03 E2:')); assert(h.includes('教大家的人叫许秋。我的伞，是她修的。'));
  assert(!Object.hasOwn(d.episodes[0], 'ending'));
});
test('nonfinal closure and final open survive render', () => { const h = renderHtml(DOC, CTX); assert(h.includes('集尾 · closure')); assert(h.includes('集尾 · open')); });
test('stats API retained', () => { const s = computeStats(DOC); assert.equal(s.sceneTable.length, 6); assert.equal(s.castLines.length, 3); assert.equal(s.totals.targetSeconds, 180); });
test('slug and autopilot', () => { assert.equal(slug('a b/c'), 'a-b-c'); assert.equal(slug(' '), 'script'); assert(autopilotOf({ autopilot: true })); assert(!autopilotOf({ autopilot: 'true' })); });

// Real CLI failures, atomic application through the frozen API, and isolated copy.
const temp = mkdtempSync(join(tmpdir(), 'mint-script-'));
try {
  const scriptDir = join(temp, 'script'); mkdirSync(scriptDir);
  const file = join(scriptDir, '修伞簿-script.json'), productionFile = join(temp, 'production.json');
  writeFileSync(file, JSON.stringify(DOC)); writeFileSync(productionFile, JSON.stringify(PRODUCTION));
  const cli = (args, cwd = temp, entry = join(root, 'scripts/mint-script.mjs')) => spawnSync(process.execPath, [entry, ...args], { cwd, encoding: 'utf8' });
  test('find production and artifact location', () => { assert.equal(findProduction(scriptDir), productionFile); assert.equal(stageDirNote(file, productionFile), null); assert(stageDirNote(join(temp, 'wrong.json'), productionFile)); });
  test('CLI full validation', () => assert.equal(cli(['validate', file]).status, 0));
  test('CLI checkup JSON status', () => { const r = cli(['checkup', file, '--json']); assert.equal(r.status, 0); const data = JSON.parse(r.stdout); assert.equal(data.blockingFailures, 0); assert(!data.gates.some(g => Object.hasOwn(g, 'ok'))); });
  test('CLI duration warning does not block', () => {
    const d=clone(DOC);d.params.actionSeconds=100;writeFileSync(file,JSON.stringify(d));
    const r=cli(['checkup',file,'--json']);assert.equal(r.status,0);assert(JSON.parse(r.stdout).warnings);
  });
  writeFileSync(file, JSON.stringify(DOC));
  test('CLI unreadable supplied upstream', () => assert.equal(cli(['validate', file, '--outline', join(temp, 'absent.json')]).status, 1));
  test('CLI corrupt supplied upstream', () => { const bad = join(temp, 'broken.json'); writeFileSync(bad, '{'); assert.equal(cli(['checkup', file, '--art', bad]).status, 1); });
  test('CLI render reports supplied malformed upstream and returns failure', () => {
    const bad = join(temp, 'malformed-art.json'); writeFileSync(bad, '{}');
    const r = cli(['render', file, '--html', '--art', bad]);
    assert.equal(r.status, 1); assert(r.stdout.includes('<!doctype html>'));
  });
  test('CLI null supplied upstream not skipped', () => { const bad = join(temp, 'null.json'); writeFileSync(bad, 'null'); assert.equal(cli(['checkup', file, '--outline', bad]).status, 1); });
  test('CLI corrupt discovered production not skipped', () => { writeFileSync(productionFile, '{'); assert.equal(cli(['validate', file]).status, 1); writeFileSync(productionFile, JSON.stringify(PRODUCTION)); });
  test('CLI render and lang inheritance', () => { const p = clone(PRODUCTION); p.lang = 'en'; writeFileSync(productionFile, JSON.stringify(p)); const r = cli(['render', file, '--html']); assert.equal(r.status, 0); assert(r.stdout.includes('lang="en"')); writeFileSync(productionFile, JSON.stringify(PRODUCTION)); });
  test('isolated skill copy imports only itself', () => {
    const copied = join(temp, 'isolated'); cpSync(root, copied, { recursive: true });
    const local = join(copied, 'examples/修伞簿-script.json');
    const r = cli(['validate', local, '--outline', join(copied, 'examples/修伞簿-outline.fixture.json'), '--art', join(copied, 'examples/修伞簿-art.fixture.json')], copied, join(copied, 'scripts/mint-script.mjs'));
    // The temporary parent production is a project anchor; delete it before standalone validation.
    rmSync(productionFile); const independent = cli(['validate', local, '--outline', join(copied, 'examples/修伞簿-outline.fixture.json'), '--art', join(copied, 'examples/修伞簿-art.fixture.json')], copied, join(copied, 'scripts/mint-script.mjs'));
    assert.equal(independent.status, 0, independent.stderr + independent.stdout); assert(r.status !== null);
    const ownSource = readFileSync(join(copied, 'scripts/mint-script.mjs'), 'utf8'); assert(!/from ['"]\.\.\/\.\.\/mint-/.test(ownSource));
  });
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log(`✓ ${passed} script v4 tests passed (local fixtures; no paid calls).`);
