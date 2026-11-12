import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { documentProblems, initProduction, gateReport, resolveStage, renderMarkdown, validateProduction } from './mint-setup.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '../examples/回南天-production.json'), 'utf8'));
const copy = value => structuredClone(value);
assert.equal(initProduction({ aspect: '9:16', creativeBrief: doc.creativeBrief }).creativeBrief, doc.creativeBrief);
assert.equal(initProduction({ aspect: '16:9' }).creativeBrief, undefined);
assert.equal(initProduction({ aspect: '16:9' }).schemaVersion, 3);
const absent = copy(doc); delete absent.creativeBrief;
assert.equal(validateProduction(absent).length, 0);
assert.equal(resolveStage(absent, 'art').creativeBrief, undefined);
assert.ok(!renderMarkdown(absent).includes('未选择'));
for (const value of [null, [], {}, '', '  ', 0, false]) {
  assert.ok(documentProblems({ schemaVersion: 3, creativeBrief: value }).length);
  assert.throws(() => initProduction({ aspect: '9:16', creativeBrief: value }));
}
for (const value of [undefined, 2, '3', null, 4]) {
  const bad = { ...doc, schemaVersion: value };
  assert.ok(validateProduction(bad).length);
  assert.throws(() => resolveStage(bad, 'art'));
  assert.throws(() => renderMarkdown(bad));
}
for (const field of ['creative', 'creativeContext', 'selection', 'decisions', 'overrides']) {
  const bad = { ...doc, [field]: {} };
  assert.ok(validateProduction(bad).length);
  assert.throws(() => resolveStage(bad, 'art'));
  assert.throws(() => renderMarkdown(bad));
}
for (const field of ['rules','defaults','preferences'])
  assert.ok(validateProduction({ ...doc, params: { [field]: {} } }).length);
assert.throws(() => initProduction({ aspect: '9:16', selection: {} }), /已废弃/);
for (const stage of ['characters', 'art', 'video']) {
  const result = resolveStage(doc, stage);
  assert.equal(result.creativeBrief, doc.creativeBrief);
  assert.equal(result.creativeContext, undefined);
  assert.equal(result.creative, undefined);
  assert.equal(result.references, undefined);
}
assert.ok(renderMarkdown(doc).includes(doc.creativeBrief));
for (const g of gateReport(doc)) {
  assert.ok(['pass', 'fail', 'skipped'].includes(g.status));
  assert.equal(g.category, 'base'); assert.equal(g.level, 'error'); assert.ok(!Object.hasOwn(g, 'ok'));
}
for (const mutate of [p => { p.video.model = 12; }, p => { p.image.model = 12; }, p => { p.style.scene.render = 12; }, p => { p.style.character.tags = [12]; }]) {
  const bad = copy(doc); mutate(bad); assert.ok(validateProduction(bad).length, '技术字段与视觉正文必须保持严格类型');
}
const dir = mkdtempSync(join(tmpdir(), 'setup-contract-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'mint-setup.mjs'), ...args], { encoding: 'utf8' });
try {
  const good = cli('init', '--aspect', '9:16', '--creative-brief', doc.creativeBrief);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).creativeBrief, doc.creativeBrief);
  assert.equal(cli('init', '--aspect', '9:16', '--creative-brief').status, 1);
  assert.equal(cli('init', '--aspect', '9:16', '--creative-brief', '--autopilot').status, 1);
  assert.equal(cli('init', '--aspect', '9:16', '--selection', 'old.json').status, 1);
  assert.equal(cli('init', '--aspect', '9:16').status, 0);
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
console.log('✓ setup v3 契约与 CLI 回归通过');
