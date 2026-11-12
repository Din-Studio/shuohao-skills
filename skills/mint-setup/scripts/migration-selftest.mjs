import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { migrateProduction, validateProduction } from './mint-setup.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const production = JSON.parse(readFileSync(join(here, '../examples/回南天-production.json'), 'utf8'));
const old = structuredClone(production); delete old.schemaVersion; delete old.creativeBrief;
old.creative = { version: 1, selection: Object.fromEntries(['genre','narrativeStyle','structure','pacing'].map(k => [k, { id: 'historical-choice', version: '1.0.0' }])) };
old.params = { genre: '生活悬疑', preferences: ['不强行和解。', '保留停顿与反应。'] };
old.evidence = '逐字原文： 雨还没有停。\n';
const original = JSON.stringify(old, null, 3) + '\n';
const preview = migrateProduction(old, validateProduction);
assert.equal(preview.status, 'pending');
assert.equal(preview.pending.length, 2);
assert.equal(preview.candidate.schemaVersion, 3);
assert.equal(preview.candidate.creative, undefined);
assert.equal(preview.candidate.params.preferences, undefined);
assert.equal(preview.candidate.params.genre, old.params.genre);
assert.equal(preview.candidate.creativeBrief, old.params.preferences.join('\n'));
assert.ok(!preview.candidate.creativeBrief.includes('historical-choice'));
assert.equal(preview.candidate.evidence, old.evidence);
for (const field of ['source','style','image','video','autopilot','lang','promptLang']) assert.deepEqual(preview.candidate[field], old[field]);
assert.equal(JSON.stringify(old, null, 3) + '\n', original);
const clean = structuredClone(old); delete clean.creative; delete clean.params;
assert.equal(migrateProduction(clean, validateProduction).status, 'ready');
assert.equal(migrateProduction({ ...clean, schemaVersion: 2 }, validateProduction).status, 'ready');
const merged = migrateProduction({ ...clean, creativeBrief: '保持克制。', params: { preferences: { ending: '不强行和解。' } } }, validateProduction);
assert.equal(merged.candidate.creativeBrief, '保持克制。\nending：不强行和解。');
for (const bad of [null, [], {}, { ...old, schemaVersion: 1 }, { ...old, schemaVersion: '2' }, production,
  { ...old, creative: null }, { ...old, creative: {} }, { ...old, creativeBrief: '' }, { ...old, params: [] },
  { ...old, params: { preferences: 12 } }, { ...old, params: { preferences: [null] } },
  { ...old, params: { rules: { forceEnding: false } } }, { ...old, params: { defaults: {} } },
  { ...old, overrides: { ending: false } }, { ...old, creativeContext: {} },
  { ...old, image: { ...old.image, model: 12 } }, { ...old, style: {} }]) assert.throws(() => migrateProduction(bad, validateProduction));
const dir = mkdtempSync(join(tmpdir(), 'setup-migration-'));
const cli = (...args) => spawnSync(process.execPath, [join(here, 'mint-setup.mjs'), ...args], { encoding: 'utf8' });
try {
  const input = join(dir, 'old.json'), out = join(dir, 'new.json');
  writeFileSync(input, original);
  assert.equal(cli('migrate-v3', input).status, 0);
  assert.equal(existsSync(out), false);
  assert.equal(cli('migrate-v3', input, '--out', out).status, 1);
  assert.equal(existsSync(out), false);
  const migrated = cli('migrate-v3', input, '--out', out, '--confirm');
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(JSON.parse(migrated.stdout).contentReview, 'not-performed');
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), preview.candidate);
  assert.equal(readFileSync(input, 'utf8'), original, 'original bytes remain the recoverable backup');
  const restore = join(dir, 'restored.json'); writeFileSync(restore, readFileSync(input));
  assert.equal(readFileSync(restore, 'utf8'), original);
  assert.equal(cli('migrate-v3', input, '--out', out, '--confirm').status, 1);
  assert.equal(cli('migrate-v3', input, '--out', input, '--confirm').status, 1);
  for (const target of [input, join(dir, 'absent-target.json')]) {
    const link = join(dir, 'link.json'); symlinkSync(target, link);
    assert.equal(cli('migrate-v3', input, '--out', link, '--confirm').status, 1);
    rmSync(link);
  }
  const alias = join(dir, 'input-alias.json'); symlinkSync(input, alias);
  const aliasOut = join(dir, 'alias-output.json');
  assert.equal(cli('migrate-v3', alias, '--out', aliasOut, '--confirm').status, 1);
  assert.equal(existsSync(aliasOut), false, 'input symlink must not be migrated');
  const invalidUtf8 = join(dir, 'invalid-utf8.json');
  writeFileSync(invalidUtf8, Buffer.concat([Buffer.from(original.replace(old.source, '__SOURCE__').split('__SOURCE__')[0]), Buffer.from([0xff]), Buffer.from(original.replace(old.source, '__SOURCE__').split('__SOURCE__')[1])]));
  assert.equal(cli('migrate-v3', invalidUtf8, '--out', aliasOut, '--confirm').status, 1);
  assert.equal(existsSync(aliasOut), false, 'invalid UTF-8 must not be repaired during migration');
  for (const args of [[], ['--out'], ['--out', '--confirm'], ['--unknown'], ['--confirm', '--confirm'], ['--out', out, '--out', out]])
    assert.equal(cli('migrate-v3', ...(args.length ? [input, ...args] : [])).status, 1);
  writeFileSync(input, '{'); assert.equal(cli('migrate-v3', input, '--out', join(dir, 'broken.json'), '--confirm').status, 1);
  assert.equal(existsSync(join(dir, 'broken.json')), false);
  writeFileSync(input, JSON.stringify(clean));
  assert.equal(cli('migrate-v3', input, '--out', join(dir, 'clean.json')).status, 0);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ production v3 migration: preview, semantic confirmation, preservation, recovery, invalid inputs and exclusive output');
