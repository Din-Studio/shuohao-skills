import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOutlineV3, documentProblems, creativeBackground } from './lib/contracts.mjs';
import { seedFromOutline, renderHtml, renderMarkdown } from './mint-art.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const outline = JSON.parse(readFileSync(join(here, '../examples/雨棚留言-outline-v3.json'), 'utf8'));
const minimal = structuredClone(outline);
for (const c of minimal.characters) { delete c.from; delete c.arc; }
delete minimal.adaptation;
delete minimal.arcs;
delete minimal.creativeBrief;
for (const s of minimal.scenes) delete s.reusePlan;
minimal.params = { episodes: 2 };
minimal.beats = [
  { id: 'B01', episode: 1, setup: '沿用既有角色处境', outcome: '角色作出选择' },
  { id: 'B02', episode: 2, setup: '选择产生后果', outcome: '角色承担后果' }
];
minimal.episodes = [{ ep: 1 }, { ep: 2 }];
minimal.props = [{ id: 'P01', name: '既有物件', function: '承载人物选择', beatIds: ['B01'] }];
const before = JSON.stringify(minimal);
assert.equal(assertOutlineV3(minimal), minimal);
const seed = seedFromOutline(minimal);
assert.equal(JSON.stringify(minimal), before);
assert.equal(seed.creativeBrief, undefined, 'asset outputs do not duplicate project requirements');
assert.deepEqual(seed.props[0].usage.beatIds, ['B01']);
assert.deepEqual(seed.props[0].usage.beats, [minimal.beats[0].outcome]);
delete minimal.props[0].beatIds;
assert.deepEqual(seedFromOutline(minimal).props[0].usage.beatIds, [], 'do not infer precise association');
const payoff = structuredClone(minimal); payoff.beats[0].kind = 'payoff';
assert.doesNotThrow(() => assertOutlineV3(payoff), 'payoff weight optional');
payoff.beats[0].weight = 'major'; assert.doesNotThrow(() => assertOutlineV3(payoff));
const evidence = '原文逐字证据。\n包含空白。';
const adapted = structuredClone(minimal);
adapted.adaptation = { keep: ['既有角色'], evidence: [evidence] };
adapted.characters[0].from = ['原作人物'];
seedFromOutline(adapted); assert.equal(adapted.adaptation.evidence[0], evidence);
for (const mutate of [
  o => { o.schemaVersion = 2; }, o => { o.schemaVersion = '3'; },
  o => { o.creative = {}; }, o => { o.creativeContext = {}; },
  o => { o.creativeBrief = ' '; }, o => { o.params.rules = {}; },
  o => { o.params.defaults = {}; }, o => { o.params.preferences = '限制'; },
  o => { o.story = { drive: {} }; }, o => { o.adaptation = { core: '旧核心' }; },
  o => { o.episodes[0].stateChange = '旧变化'; }, o => { o.beats[0].type = '旧分类'; },
  o => { o.beats[0].kind = null; }, o => { o.beats[0].position = 'invalid'; },
  o => { o.beats[0].weight = 'minor'; },
  o => { o.beats[0].kind = 'payoff'; o.beats[0].weight = null; },
  o => { o.beats.reverse(); }, o => { o.beats[0].episode = 3; },
  o => { o.props[0].beatIds = null; }, o => { o.props[0].beatIds = ['B99']; }, o => { o.props[0].beatIds = ['B01','B01']; },
  o => { o.episodes[0].characterIds = ['C99']; },
  o => { o.characters[0].from = null; }, o => { o.characters[0].arc = ''; },
  o => { o.beats[0].id = ['B01']; }
]) {
  const broken = structuredClone(minimal); mutate(broken);
  assert.throws(() => seedFromOutline(broken), /outline v3/, 'invalid consumed data still blocks');
}
assert.deepEqual(documentProblems({ schemaVersion: 3 }), []);
for (const value of ['', ' ', null, [], {}, false, 12])
  assert.ok(documentProblems({ schemaVersion: 3, creativeBrief: value }).length);
for (const key of ['creative','creativeContext','selection','decisions','overrides'])
  assert.ok(documentProblems({ schemaVersion: 3, [key]: {} }).length);
assert.equal(creativeBackground({ schemaVersion: 3, creativeBrief: ' 不强行和解。 ' }), ' 不强行和解。 ');
const doc = JSON.parse(readFileSync(join(here, '../examples/雨棚留言-art.json'), 'utf8'));
for (const lang of ['zh', 'en']) {
  const html = renderHtml(doc, lang);
  const md = renderMarkdown(doc, lang);
  assert.ok(!html.includes('creativeContext') && !md.includes('creativeContext'));
  assert.ok(!html.includes('未配置') && !md.includes('未配置'));
  assert.ok(html.indexOf('id="sec-cards"' ) < html.indexOf('id="sec-gates"'), 'assets precede structural checks');
}
console.log('✓ mint-art v3 optional upstream fields, strict legacy rejection, unchanged output and content-first reports');
