import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { creativeProblems, initProduction, gateReport, resolveStage, renderMarkdown, validateProduction } from './novel-setup.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '../examples/回南天-production.json'), 'utf8'));
const selection = doc.creative.selection;
const copy = value => structuredClone(value);
assert.deepEqual(initProduction({ aspect: '9:16', selection }).creative, doc.creative);
assert.equal(initProduction({ aspect: '16:9' }).creative, undefined);
const absent = copy(doc); delete absent.creative;
const skipped = gateReport(absent).find(g => g.id === 'creative-selection');
assert.equal(skipped.status, 'skipped'); assert.equal(skipped.reason, 'not-applicable');
assert.equal(validateProduction(absent).length, 0);
assert.equal(resolveStage(absent, 'art').creativeBackground, undefined);
assert.ok(renderMarkdown(absent).includes('不推断默认策略'));
for (const value of [null, [], {}, { version: 2, selection }, { version: '1', selection }, { version: 1, selection, rules: {} }]) {
  assert.ok(creativeProblems(value).length, JSON.stringify(value));
}
for (const key of Object.keys(selection)) {
  for (const value of [null, [], {}, { id: 'mystery', version: 'latest' }, { id: '../escape', version: '1.0.0' }, { id: 'mystery', version: '^1.0.0' }, { id: 'mystery', version: '1.x' }, { id: 'mystery', version: '01.0.0' }, { id: 'mystery', version: 1 }, { id: 'mystery', version: '1.0.0', rules: {} }]) {
    const bad = copy(selection); bad[key] = value;
    assert.throws(() => initProduction({ aspect: '9:16', selection: bad }));
    assert.ok(validateProduction({ ...doc, creative: { version: 1, selection: bad } }).length);
    assert.throws(() => resolveStage({ ...doc, creative: { version: 1, selection: bad } }, 'art'));
  }
  const missing = copy(selection); delete missing[key];
  assert.throws(() => initProduction({ aspect: '9:16', selection: missing }));
}
assert.throws(() => initProduction({ aspect: '9:16', selection: { ...selection, style: {} } }));
const uninstalled = Object.fromEntries(Object.keys(selection).map(k => [k, { id: 'not-installed-anywhere', version: '77.0.1' }]));
const uninstalledDoc = { ...doc, creative: { version: 1, selection: uninstalled } };
assert.equal(validateProduction(uninstalledDoc).length, 0);
for (const stage of ['characters', 'art']) {
  const result = resolveStage(uninstalledDoc, stage);
  assert.deepEqual(Object.keys(result.creativeBackground), ['genre', 'narrativeStyle']);
  assert.equal(result.creativeContext, undefined);
  assert.equal(result.references, undefined);
  assert.equal(result.creative, undefined);
}
assert.deepEqual(resolveStage(doc, 'video').creative, doc.creative);
assert.ok(renderMarkdown(doc).includes('measured @ 1.0.0'));
for (const g of gateReport(doc)) {
  assert.ok(['pass', 'fail', 'skipped'].includes(g.status));
  assert.equal(g.category, 'base'); assert.equal(g.level, 'error'); assert.ok(!Object.hasOwn(g, 'ok'));
}
for (const mutate of [p => { p.video.model = 12; }, p => { p.image.model = 12; }, p => { p.style.scene.render = 12; }, p => { p.style.character.tags = [12]; }]) {
  const bad = copy(doc); mutate(bad); assert.ok(validateProduction(bad).length, '技术字段与视觉正文必须保持严格类型');
}
const dir = mkdtempSync(join(tmpdir(), 'setup-contract-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'novel-setup.mjs'), ...args], { encoding: 'utf8' });
try {
  const path = join(dir, 'selection.json'); writeFileSync(path, JSON.stringify(selection));
  const good = cli('init', '--aspect', '9:16', '--selection', path);
  assert.equal(good.status, 0, good.stderr); assert.deepEqual(JSON.parse(good.stdout).creative, doc.creative);
  assert.equal(cli('init', '--aspect', '9:16', '--selection').status, 1);
  writeFileSync(path, '{'); assert.equal(cli('init', '--aspect', '9:16', '--selection', path).status, 1);
  writeFileSync(path, JSON.stringify({ version: 1, selection })); assert.equal(cli('init', '--aspect', '9:16', '--selection', path).status, 1);
  writeFileSync(join(dir, 'production.json'), JSON.stringify(doc));
  assert.equal(cli('resolve', '--from', dir, '--for', 'art').status, 0);
  const productionPath = join(dir, 'production.json');
  for (const field of ['video', 'image']) {
    const gateId = field === 'video' ? 'video-model' : 'model-caps';
    const fieldGate = field === 'video' ? 'video-model' : 'fields';
    for (const model of [123, {}, [], null, false, '', '   ']) {
      const bad = copy(doc); bad[field].model = model;
      const gates = gateReport(bad);
      assert.equal(gates.find(g => g.id === fieldGate).status, 'fail', `${field} ${JSON.stringify(model)} must retain type failure`);
      assert.notEqual(gates.find(g => g.id === gateId).status, 'skipped');
      writeFileSync(productionPath, JSON.stringify(bad));
      for (const command of ['validate', 'checkup']) assert.equal(cli(command, productionPath).status, 1);
    }
    const padded = copy(doc); padded[field].model = ` ${field === 'video' ? 'MiniMax H3' : 'nanobanana2'} `;
    assert.equal(gateReport(padded).find(g => g.id === gateId).status, 'pass', 'normalized known model is checked');
    writeFileSync(productionPath, JSON.stringify(padded));
    for (const command of ['validate', 'checkup']) assert.equal(cli(command, productionPath).status, 0);
    (field === 'video' ? padded.video : padded.image.asset).resolution = 'not-a-resolution';
    assert.equal(gateReport(padded).find(g => g.id === gateId).status, 'fail');
    writeFileSync(productionPath, JSON.stringify(padded));
    for (const command of ['validate', 'checkup']) assert.equal(cli(command, productionPath).status, 1);
    for (const model of [' custom-model ', 'constructor']) {
      const unknown = copy(doc); unknown[field].model = model;
      assert.equal(gateReport(unknown).find(g => g.id === gateId).status, 'skipped');
      assert.equal(validateProduction(unknown).length, 0);
      writeFileSync(productionPath, JSON.stringify(unknown));
      for (const command of ['validate', 'checkup']) assert.equal(cli(command, productionPath).status, 0);
    }
  }
  writeFileSync(join(dir, 'production.json'), '{'); assert.equal(cli('resolve', '--from', dir, '--for', 'art').status, 1);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ setup creative 契约与 CLI 回归通过');
