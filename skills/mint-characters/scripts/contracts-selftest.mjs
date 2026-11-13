import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { seedFromOutline, gateReport, creativeBackground, imageJobsFrom, renderHtml, slug } from './mint-characters.mjs';
import { assertOutlineV3, assetProductionProblems } from './lib/contracts.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const outline = JSON.parse(readFileSync(join(here, '../examples/渡口-outline-v3.json'), 'utf8'));
const doc = JSON.parse(readFileSync(join(here, '../examples/渡口-cast.json'), 'utf8'));
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
const input = doc.characters;
const checks = prod => gateReport(doc.characters, null, 'zh', prod);
assert.equal(existsSync(join(here, '../references/profiles')), false, 'asset stage installs no placeholder profiles');
assert.equal(creativeBackground(production), production.creativeBrief);
assert.equal(creativeBackground({ schemaVersion: 3 }), null);
assert.throws(() => creativeBackground({}), /schemaVersion/);
assert.equal(assetProductionProblems(production, blockName).length, 0);
const before = JSON.stringify(doc);
assert.ok(checks(production).every(g => g.status !== 'fail'));
assert.equal(JSON.stringify(doc), before, 'validation does not rewrite asset data');
assert.equal(doc.creativeContext, undefined);
assert.equal(production.creativeContext, undefined);
for (const g of checks(production)) {
  assert.ok(['pass','fail','skipped'].includes(g.status));
  assert.equal(g.category, 'base'); assert.equal(g.level, 'error'); assert.ok(!('ok' in g));
}
assert.ok(checks(null).some(g => g.status === 'skipped' && g.reason === 'missing-upstream'));
for (const mutate of [
  p => { p.style[blockName].surface = ''; }, p => { delete p.style[blockName].negative; },
  p => { p.style[blockName].tags = []; }, p => { p.image.asset.aspectRatio = '9:16'; },
  p => { p.image.asset.resolution = ''; }, p => { p.image.asset.resolution = '   '; }, p => { p.image.asset.resolution = 2; },
  ...['', '   ', 123, null, false, {}, []].map(model => p => { p.image.model = model; }),
  p => { p.creative = {}; }, p => { p.creativeBrief = ' '; }, p => { p.schemaVersion = 2; }
]) {
  const bad = structuredClone(production); mutate(bad);
  assert.ok(checks(bad).some(g => g.status === 'fail'));
  assert.ok(imageJobsFrom(input, bad).problems.length);
}
assert.ok(imageJobsFrom(input, null).problems.length, 'generation cannot guess production');
assert.equal(imageJobsFrom(input, production).problems.length, 0);
for (const bad of [null, {}, [], { ...outline, schemaVersion: 1 }, { ...outline, schemaVersion: '2' }, { ...outline, schemaVersion: 2 }, { ...outline, characters: 'broken' }, { ...outline, scenes: null }])
  assert.throws(() => seedFromOutline(bad), /outline v3/);
for (const mutate of [
  o => { o.characters[0].id = '../C01'; },
  o => { o.characters[0].id = ['C01']; },
  o => { o.scenes = [{id:[['S01']],name:'测试场景',primary:true}]; },
  o => { o.characters.push(structuredClone(o.characters[0])); },
  o => { o.characters[0].tier = 'unknown'; },
  o => { o.characters[0].from = 'wrong'; }
]) {
  const bad = structuredClone(outline); mutate(bad); assert.throws(() => seedFromOutline(bad), /outline v3/);
}
const html = renderHtml(doc.characters, doc.source, doc.summary, 'en', null, production);
assert.ok(html.includes(production.creativeBrief));
assert.ok(html.includes('Content review: not performed'));

assert.equal(JSON.stringify(doc), before, 'render does not write context or inferred defaults');
const dir = mkdtempSync(join(tmpdir(), 'characters-contract-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'mint-characters.mjs'), ...args], { encoding: 'utf8' });
try {
  const upstream = join(dir, 'outline.json');
  writeFileSync(upstream, JSON.stringify(outline)); assert.equal(cli('seed', upstream, '--legacy').status, 0);
  for (const text of ['{', 'null', JSON.stringify({ ...outline, schemaVersion: 1 })]) {
    writeFileSync(upstream, text); assert.equal(cli('seed', upstream, '--legacy').status, 1);
  }
  assert.equal(cli('seed', join(dir, 'absent.json')).status, 1);
  for (const field of ['characters','scenes']) {
    const bad = structuredClone(outline);
    if (!bad[field].length) bad[field].push({id:'S01',name:'测试场景',primary:true});
    bad[field][0].id = [bad[field][0].id];
    writeFileSync(upstream, JSON.stringify(bad)); assert.equal(cli('seed', upstream, '--legacy').status, 1, 'array ID must fail the real seed CLI');
  }
  const asset = join(dir, 'cast.json'); writeFileSync(asset, JSON.stringify(doc));
  const prod = join(dir, 'production.json'); writeFileSync(prod, JSON.stringify(production));
  assert.equal(cli('validate', asset, '--production', prod).status, 0);
  assert.equal(cli('checkup', asset, '--production', prod).status, 0);
  const original = { ...doc, lang: 'zh', reviewNote: '</script><img src=x onerror=1>' };
  writeFileSync(asset, JSON.stringify(original));
  const rendered = cli('render', asset, '--html', '--lang', 'en', '--source', 'Display title', '--production', prod);
  assert.equal(rendered.status, 0, rendered.stderr);
  const embedded = rendered.stdout.match(/<script type="application\/json" id="cast-data">([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'raw export block exists');
  assert.deepEqual(JSON.parse(embedded[1]), original, 'display overrides and extension fields must not alter exported JSON');
  assert.ok(!embedded[1].includes('</script>'), 'raw export safely escapes script terminators');
  assert.deepEqual(JSON.parse(readFileSync(asset, 'utf8')), original, 'render is read-only');
  // Local IDs remain mandatory when present, even without either upstream.
  const identified = structuredClone(doc);
  identified.characters.forEach((c, i) => { c.id = `C${String(i + 1).padStart(2, '0')}`; });
  for (const invalid of ['BROKEN', '', '  ', 'C1', ' C01 ', 12, null, {}, []]) {
    const bad = structuredClone(identified); bad.characters[1].id = invalid;
    assert.equal(gateReport(bad.characters)[0].status, 'fail');
    writeFileSync(asset, JSON.stringify(bad));
    for (const cmd of ['validate', 'checkup']) assert.equal(cli(cmd, asset, '--no-production').status, 1);
    for (const format of ['--html', '--md']) {
      const r = cli('render', asset, format, '--no-production');
      assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.includes('cast-contract: fail'));
    }
  }
  const duplicate = structuredClone(identified); duplicate.characters[1].id = duplicate.characters[0].id;
  writeFileSync(asset, JSON.stringify(duplicate));
  for (const cmd of ['validate', 'checkup']) assert.equal(cli(cmd, asset, '--no-production').status, 1);
  for (const format of ['--html', '--md']) assert.ok(cli('render', asset, format, '--no-production').stdout.includes('id 重复'));
  assert.equal(gateReport(identified.characters)[0].status, 'pass');
  const legacy = structuredClone(identified); legacy.characters.forEach(c => { delete c.id; });
  assert.equal(gateReport(legacy.characters)[0].status, 'pass', 'missing legacy IDs are explicitly supported');

  // Content language is not the report language. Cover both directions and wrong content.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJesAAAAASUVORK5CYII=', 'base64');
  for (const contentLang of ['zh', 'en']) {
    const input = { ...structuredClone(identified), lang: contentLang, reviewNote: original.reviewNote };
    if (contentLang === 'en') for (const c of input.characters)
      for (const key of ['timbre', 'pitch', 'pace', 'accent', 'emotion', 'referenceHint']) c.voice[key] = 'Warm natural voice';
    // Explicit existing image paths must also survive auto-discovery unchanged in exports.
    input.characters[0].sheetImage = 'original-reference.png';
    for (const withImage of [false, true]) {
      const images = join(dir, 'images'); rmSync(images, { recursive: true, force: true });
      if (withImage) { mkdirSync(images); writeFileSync(join(images, `${slug(input.characters[0].name)}-sheet.png`), pixel); }
      for (const broken of [false, true]) {
        const value = structuredClone(input);
        if (broken) value.characters[0].voice.timbre = contentLang === 'zh' ? 'English only' : '中文音色';
        writeFileSync(asset, JSON.stringify(value));
        assert.equal(cli('validate', asset, '--production', prod).status, broken ? 1 : 0);
        for (const uiLang of ['zh', 'en']) for (const format of ['--html', '--md']) {
          const r = cli('render', asset, format, '--lang', uiLang, '--production', prod);
          assert.equal(r.status, 0, r.stderr);
          assert.ok(r.stdout.includes(`cast-contract: ${broken ? 'fail' : 'pass'}`), `${contentLang}/${uiLang}/${format}`);
          if (withImage) assert.ok(r.stdout.includes(`images/${slug(input.characters[0].name)}-sheet.png`));
          if (format === '--html') {
            const raw = r.stdout.match(/<script type="application\/json" id="cast-data">([\s\S]*?)<\/script>/)[1];
            assert.deepEqual(JSON.parse(raw), value);
            assert.ok(!raw.includes('</script>'));
          }
          assert.deepEqual(JSON.parse(readFileSync(asset, 'utf8')), value);
        }
      }
    }
  }
  // Square assets keep all technical layout constraints; only the production ratio changes.
  const square = structuredClone(production); square.image.asset.aspectRatio = '1:1';
  const squareCast = structuredClone(identified);
  for (const c of squareCast.characters) c.image.sheet = c.image.sheet.replaceAll('16:9', '1:1').replaceAll('landscape', 'square');
  assert.ok(gateReport(squareCast.characters, null, 'zh', square).every(g => g.status !== 'fail'));
  assert.ok(gateReport(identified.characters, null, 'zh', square).some(g => g.status === 'fail'));
  for (const text of ['{', 'null', '{}']) {
    writeFileSync(prod, text); assert.equal(cli('validate', asset, '--production', prod).status, 1);
  }
  assert.equal(cli('validate', asset, '--production', join(dir, 'missing.json')).status, 1);
  assert.equal(cli('validate', asset, '--production', prod, '--no-production').status, 1);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ characters v3 上游、创作背景及检查状态回归通过');
