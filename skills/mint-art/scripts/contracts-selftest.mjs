import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { seedFromOutline, gateReport, creativeBackground, imageJobsFrom, renderHtml, slug } from './mint-art.mjs';
import { assertOutlineV3, assetProductionProblems } from './lib/contracts.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const outline = JSON.parse(readFileSync(join(here, '../examples/雨棚留言-outline-v3.json'), 'utf8'));
const doc = JSON.parse(readFileSync(join(here, '../examples/雨棚留言-art.json'), 'utf8'));
// Natural language requirements do not select strategy implementations.
const blockName = 'scene';
// Deliberately local synthetic production projection. No sibling fixture or profile read.
const production = {
  source: '雨棚留言', schemaVersion: 3, creativeBrief: 'Express restrained everyday choices.',
  style: { label: { zh: '真人实拍', en: 'Live action' }, phrase: 'live action',
    [blockName]: { render: 'Photorealistic live-action film environment',
      surface: 'authentic materials', lighting: 'soft directional light', negative: 'watermark', tags: ['photorealistic'] } },
  image: { model: 'nanobanana2', asset: { resolution: '2K', aspectRatio: '16:9' } }
};
const input = doc;
const checks = prod => gateReport(doc, [], prod);
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
  o => { o.scenes[0].id = [['S01']]; },
  o => { o.characters.push(structuredClone(o.characters[0])); },
  o => { o.characters[0].tier = 'unknown'; },
  o => { o.characters[0].from = 'wrong'; }
]) {
  const bad = structuredClone(outline); mutate(bad); assert.throws(() => seedFromOutline(bad), /outline v3/);
}
for (const kind of ['event','pressure','turn','payoff']) {
  const o = structuredClone(outline); o.beats[0].kind = kind;
  if (kind === 'payoff') o.beats[0].weight = 'minor';
  const seeded = seedFromOutline(o);
  assert.equal(seeded.props[0].usage.beatIds[0], 'B01');
  assert.ok(seeded.props[0].usage.beats.includes(o.beats[0].outcome));
}
const oneOff = structuredClone(outline); for (const s of oneOff.scenes) delete s.reusePlan;
assert.ok(seedFromOutline(oneOff).scenes.every(s => !s.seedNote));
for (const mutate of [
  o => { o.props[0].beatIds = ['B99']; }, o => { o.props[0].beatIds = ['B01','B01']; },
  o => { o.beats[0].episode = 99; }, o => { o.beats[0].kind = 'reward'; },
  o => { o.episodes[0].sceneIds = ['S99']; }, o => { o.scenes[0].reusePlan = null; }
]) { const bad = structuredClone(outline); mutate(bad); assert.throws(() => assertOutlineV3(bad), /outline v3/); }
const noProps = { ...doc, props: [] };
assert.ok(gateReport(noProps).filter(g => g.id.startsWith('prop-')).every(g => g.status === 'skipped' && g.reason === 'not-applicable'));
const malformed = structuredClone(doc); malformed.scenes[0].lighting = 'wrong';
assert.ok(gateReport(malformed).some(g => g.status === 'fail'));
const html = renderHtml(doc, 'en', production);
assert.ok(html.includes(production.creativeBrief));
assert.ok(html.includes('Content review: not performed'));

assert.equal(JSON.stringify(doc), before, 'render does not write context or inferred defaults');
const dir = mkdtempSync(join(tmpdir(), 'art-contract-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'mint-art.mjs'), ...args], { encoding: 'utf8' });
try {
  const upstream = join(dir, 'outline.json');
  writeFileSync(upstream, JSON.stringify(outline)); assert.equal(cli('seed', upstream).status, 0);
  for (const text of ['{', 'null', JSON.stringify({ ...outline, schemaVersion: 1 })]) {
    writeFileSync(upstream, text); assert.equal(cli('seed', upstream).status, 1);
  }
  assert.equal(cli('seed', join(dir, 'absent.json')).status, 1);
  for (const field of ['characters','scenes']) {
    const bad = structuredClone(outline); bad[field][0].id = [bad[field][0].id];
    writeFileSync(upstream, JSON.stringify(bad)); assert.equal(cli('seed', upstream).status, 1, 'array ID must fail the real seed CLI');
  }
  const asset = join(dir, 'art.json'); writeFileSync(asset, JSON.stringify(doc));
  const prod = join(dir, 'production.json'); writeFileSync(prod, JSON.stringify(production));
  assert.equal(cli('validate', asset, '--production', prod).status, 0);
  assert.equal(cli('checkup', asset, '--production', prod).status, 0);
  for (const mutate of [
    d => { d.scenes[0].id = ['S01']; }, d => { d.props[0].id = ['P01']; },
    d => { d.props[0].id = ['P01']; d.props[1].id = ['P01']; },
    d => { d.props[0].usage.beatIds = [['B01'], ['B01']]; }
  ]) {
    const bad = structuredClone(doc); mutate(bad); writeFileSync(asset, JSON.stringify(bad));
    assert.ok(gateReport(bad, null, production).some(g => g.id === 'asset-contract' && g.status === 'fail'));
    assert.equal(cli('validate', asset, '--production', prod).status, 1);
    assert.equal(cli('checkup', asset, '--production', prod).status, 1);
  }
  writeFileSync(asset, JSON.stringify(doc));
  const cast = join(dir, 'cast.json');
  for (const text of ['{', 'null', '{}', '{"characters":"broken"}', '{"characters":[{"name":" "}]}', '{"characters":[{"name":"Valid","aliases":[12]}]}']) {
    writeFileSync(cast, text);
    for (const cmd of ['validate', 'checkup', 'render']) for (const format of ['--html', '--md']) {
      const r = cli(cmd, asset, format, '--cast', cast, '--production', prod);
      assert.equal(r.status, 1, `${cmd}: damaged cast must fail`);
      assert.ok(!r.stdout.includes('missing-upstream'));
    }
  }
  for (const cmd of ['validate', 'checkup', 'render']) {
    assert.equal(cli(cmd, asset, '--cast', join(dir, 'missing-cast.json')).status, 1);
    assert.equal(cli(cmd, asset, '--cast').status, 1);
  }
  const name = 'Sherlock Holmes';
  for (const names of [[], [name]]) {
    writeFileSync(cast, JSON.stringify({ characters: names.map(name => ({ name, aliases: ['Detective Alias'] })) }));
    for (const banned of ['', name, 'Detective Alias']) {
      const input = structuredClone(doc); input.scenes[0].image.prompt += ` ${banned}`;
      writeFileSync(asset, JSON.stringify(input));
      const failed = names.length > 0 && banned !== '';
      const gate = gateReport(input, names.length ? [name, 'Detective Alias'] : [], production).find(g => g.id === 'no-names');
      assert.equal(gate.status, failed ? 'fail' : 'pass');
      assert.ok(!gate.detail.includes('未提供'));
      for (const cmd of ['validate', 'checkup']) assert.equal(cli(cmd, asset, '--cast', cast, '--production', prod).status, failed ? 1 : 0);
      for (const uiLang of ['zh', 'en']) for (const format of ['--html', '--md']) {
        const r = cli('render', asset, format, '--lang', uiLang, '--cast', cast, '--production', prod);
        assert.equal(r.status, 0, r.stderr);
        assert.ok(!r.stdout.includes('missing-upstream'));
        if (failed) assert.ok(r.stdout.includes(banned));
        const label = uiLang === 'en' ? 'Prompts carry no character names' : '提示词不含角色名';
        const status = failed ? 'fail' : 'pass';
        if (format === '--md') assert.ok(r.stdout.includes(`${label} [${status}; base; error]`));
        else assert.ok(r.stdout.includes(`<li class="${status}"><span class="m">${failed ? '✗' : '✓'}</span><span>${label}`));
      }
    }
  }
  writeFileSync(asset, JSON.stringify(doc));
  for (const format of ['--html', '--md']) assert.ok(cli('render', asset, format, '--production', prod).stdout.includes(format === '--md' ? 'missing-upstream' : '未提供 cast.json，本门跳过'));
  writeFileSync(cast, JSON.stringify({ characters: [] }));
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJesAAAAASUVORK5CYII=', 'base64');
  for (const withImage of [false, true]) for (const existingImage of [false, true]) {
    const input = { ...structuredClone(doc), reviewNote: '</script><img src=x onerror=1>' };
    if (existingImage) input.scenes[0].sheetImage = 'original-reference.png';
    const images = join(dir, 'images'); rmSync(images, { recursive: true, force: true });
    if (withImage) {
      mkdirSync(images);
      for (const item of [...input.scenes, ...input.props]) writeFileSync(join(images, `${slug(item.name)}-sheet.png`), pixel);
    }
    writeFileSync(asset, JSON.stringify(input));
    for (const lang of ['zh', 'en']) for (const format of ['--html', '--md']) {
      const r = cli('render', asset, format, '--lang', lang, '--cast', cast, '--production', prod);
      assert.equal(r.status, 0, r.stderr);
      if (withImage) assert.ok(r.stdout.includes(`images/${slug(input.scenes[0].name)}-sheet.png`));
      if (format === '--html') {
        const raw = r.stdout.match(/<script type="application\/json" id="art-data">([\s\S]*?)<\/script>/)[1];
        assert.deepEqual(JSON.parse(raw), input, 'display attachments must never alter export');
        assert.ok(!raw.includes('</script>'));
      }
      assert.deepEqual(JSON.parse(readFileSync(asset, 'utf8')), input);
    }
  }
  for (const text of ['{', 'null', '{}']) {
    writeFileSync(prod, text); assert.equal(cli('validate', asset, '--production', prod).status, 1);
  }
  assert.equal(cli('validate', asset, '--production', join(dir, 'missing.json')).status, 1);
  assert.equal(cli('validate', asset, '--production', prod, '--no-production').status, 1);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ art v3 上游、创作背景及检查状态回归通过');
