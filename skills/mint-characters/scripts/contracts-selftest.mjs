import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { creativeBackground, imageJobsFrom, productionProblems } from './mint-characters.mjs';
import { assetProductionProblems, documentProblems } from './lib/contracts.mjs';
import { sourceLineCount } from './lib/source-facts.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '../examples');
const doc = JSON.parse(readFileSync(join(examples, '渡口-cast.json'), 'utf8'));
const cards = doc.characters.map(c => ({ ...c, aliases: c.aliases.map(a => a.name) }));
// Natural language requirements do not select strategy implementations.
const blockName = 'character';
// Deliberately local synthetic production projection. No sibling fixture or profile read.
const production = {
  source: '渡口', schemaVersion: 3, creativeBrief: 'Express restrained everyday choices.',
  style: { label: { zh: '真人实拍', en: 'Live action' }, phrase: 'live action',
    [blockName]: { render: 'Photorealistic portrait of a real human actor',
      surface: 'authentic materials', lighting: 'soft directional light', negative: 'watermark', tags: ['photorealistic'] } },
  image: { model: 'nanobanana2', asset: { resolution: '2K', aspectRatio: '16:9' } }
};
assert.equal(existsSync(join(here, '../references/profiles')), false, 'asset stage installs no placeholder profiles');
assert.equal(creativeBackground(production), production.creativeBrief);
assert.equal(creativeBackground({ schemaVersion: 3 }), null);
assert.throws(() => creativeBackground({}), /schemaVersion/);
for (const version of [undefined, 2, 4, '3']) assert.ok(documentProblems({ ...production, schemaVersion: version }).length, `production ${version} rejected`);
assert.deepEqual(documentProblems({ schemaVersion: 3 }), []);
for (const value of ['', ' ', null, [], {}, false, 12])
  assert.ok(documentProblems({ schemaVersion: 3, creativeBrief: value }).length);
assert.equal(creativeBackground({ schemaVersion: 3, creativeBrief: ' 不强行和解。 ' }), ' 不强行和解。 ');
assert.equal(sourceLineCount(Buffer.from('one\r\ntwo\r\n')), 2);
assert.equal(sourceLineCount(Buffer.from('one\ntwo')), 2);
assert.equal(assetProductionProblems(production, blockName).length, 0);
const before = JSON.stringify(doc);
assert.equal(productionProblems(cards, production).length, 0);
assert.equal(JSON.stringify(doc), before, 'validation does not rewrite asset data');
for (const mutate of [
  p => { p.style[blockName].surface = ''; }, p => { delete p.style[blockName].negative; },
  p => { p.style[blockName].tags = []; }, p => { p.image.asset.aspectRatio = '9:16'; },
  p => { p.image.asset.resolution = ''; }, p => { p.image.asset.resolution = '   '; }, p => { p.image.asset.resolution = 2; },
  ...['', '   ', 123, null, false, {}, []].map(model => p => { p.image.model = model; }),
  p => { p.creativeBrief = ' '; }, p => { p.schemaVersion = 2; }
]) {
  const bad = structuredClone(production); mutate(bad);
  assert.ok(productionProblems(cards, bad).length);
  assert.ok(imageJobsFrom(cards, bad).problems.length);
}
assert.ok(imageJobsFrom(cards, null).problems.length, 'generation cannot guess production');
assert.equal(imageJobsFrom(cards, production).problems.length, 0);

const dir = mkdtempSync(join(tmpdir(), 'characters-contract-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'mint-characters.mjs'), ...args], { encoding: 'utf8', cwd: dir });
try {
  copyFileSync(join(examples, '渡口.txt'), join(dir, '渡口.txt'));
  const asset = join(dir, 'cast.json'); writeFileSync(asset, JSON.stringify(doc));
  const prod = join(dir, 'production.json'); writeFileSync(prod, JSON.stringify(production));
  assert.equal(cli('validate', asset, '--production', prod).status, 0);
  assert.equal(cli('checkup', asset, '--production', prod).status, 0);

  // Only cast v1 is accepted; unversioned objects, bare arrays and other versions fail every entry.
  for (const value of [{ source: doc.source, lang: 'zh', summary: '', characters: cards }, cards, { ...doc, schemaVersion: 2 }, { ...doc, kind: 'other' }]) {
    const old = join(dir, 'other.json'); writeFileSync(old, JSON.stringify(value));
    for (const cmd of ['validate', 'checkup', 'render', 'images']) {
      const r = cli(cmd, old, '--no-production');
      assert.equal(r.status, 1, `${cmd} rejects non-v1 cast`);
      assert.match(r.stderr, /schemaVersion: 1, kind: mint-characters/);
    }
  }
  for (const removed of [['seed', asset], ['merge', dir], ['assemble', dir, '--source', 'x'], ['ui-template', 'fr']])
    assert.equal(cli(...removed).status, 1, `${removed[0]} is not a command`);

  const rendered = cli('render', asset, '--html', '--lang', 'en', '--production', prod);
  assert.equal(rendered.status, 0, rendered.stderr);
  const embedded = rendered.stdout.match(/<script type="application\/json" id="cast-data">([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'raw export block exists');
  assert.deepEqual(JSON.parse(embedded[1].replace(/\\u003c/g, '<')), doc, 'display options must not alter exported JSON');
  assert.deepEqual(JSON.parse(readFileSync(asset, 'utf8')), doc, 'render is read-only');

  // Content language is not the report language; wrong-language human fields fail validation.
  const broken = structuredClone(doc); broken.characters[0].voice.timbre = 'English only';
  writeFileSync(asset, JSON.stringify(broken));
  assert.equal(cli('validate', asset, '--production', prod).status, 1);
  writeFileSync(asset, JSON.stringify(doc));

  // Square assets keep all technical layout constraints; only the production ratio changes.
  const square = structuredClone(production); square.image.asset.aspectRatio = '1:1';
  const squareCards = structuredClone(cards);
  for (const c of squareCards) c.image.sheet = c.image.sheet.replaceAll('16:9', '1:1').replaceAll('landscape', 'square');
  assert.equal(productionProblems(squareCards, square).length, 0);
  assert.ok(productionProblems(cards, square).length);
  for (const text of ['{', 'null', '{}']) {
    writeFileSync(prod, text); assert.equal(cli('validate', asset, '--production', prod).status, 1);
  }
  assert.equal(cli('validate', asset, '--production', join(dir, 'missing.json')).status, 1);
  assert.equal(cli('validate', asset, '--production', prod, '--no-production').status, 1);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ characters production v3、cast v1 入口及检查状态回归通过');
