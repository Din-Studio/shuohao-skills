import assert from 'node:assert/strict';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createSkillTools } from '../.pi/extensions/skill-tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(here, '../.pi/skills');
const worksheet = await import(pathToFileURL(join(skillsRoot, 'mint-video-prompt-review/scripts/lib/worksheet.mjs')));

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'mint-skill-tool-')));
  const workspaceRoot = join(base, 'workspace');
  mkdirSync(workspaceRoot);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { base, workspaceRoot };
}
function tool(workspaceRoot, role = 'main', root = skillsRoot) {
  return createSkillTools({ workspaceRoot, skillsRoot: root, role })[0];
}
const call = (instance, skill, args, signal) => instance.execute('test', { skill, args }, signal);
const success = r => { assert.equal(r.details.exitCode, 0, JSON.stringify(r.details)); assert.equal(r.isError, false); return r.details; };
const failure = r => { assert.notEqual(r.details.exitCode, 0, JSON.stringify(r.details)); assert.equal(r.isError, true); return r.details; };
function probe(t, code, skill = 'mint-setup', role = 'main') {
  const f = fixture(t);
  const root = join(f.base, 'skills');
  const entry = join(root, skill, 'scripts', `${skill}.mjs`);
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(entry, code);
  return { ...f, root, entry, instance: tool(f.workspaceRoot, role, root) };
}

test('real initialization, validation failure, chunk output, and literal arguments', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  const initialized = success(await call(instance, 'mint-setup', ['init', '--aspect', '16:9']));
  const production = JSON.parse(initialized.stdout);
  assert.equal(production.schemaVersion, 3);
  writeFileSync(join(f.workspaceRoot, 'production.json'), initialized.stdout);
  const invalid = failure(await call(instance, 'mint-setup', ['validate', 'production.json']));
  assert.equal(invalid.exitCode, 1);
  assert.match(invalid.stderr, /style|画风/);
  writeFileSync(join(f.workspaceRoot, 'book.txt'), 'A story.\n\nAnother paragraph.');
  success(await call(instance, 'mint-characters', ['chunk', 'book.txt', 'chunks']));
  assert.match(readFileSync(join(f.workspaceRoot, 'chunks/chunk-00.txt'), 'utf8'), /A story/);
  const literal = '$(not-a-command); echo unsafe | > file';
  const r = success(await call(instance, 'mint-setup', ['init', '--aspect', '16:9', '--source', literal]));
  assert.equal(JSON.parse(r.stdout).source, literal);
  assert.equal(existsSync(join(f.workspaceRoot, 'file')), false);
});

test('existing creation example runs seed, render, worksheets, export, and offline videos', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  cpSync(join(skillsRoot, 'mint-creation/examples'), f.workspaceRoot, { recursive: true });
  const input = 'creation/收书人-creation.json';
  const run = (...args) => call(instance, 'mint-creation', args);
  success(await run('seed', 'script/收书人-script.json'));
  assert.match(success(await run('render', input, '--html')).stdout, /<html/i);
  success(await run('prompts', 'brief', input, '--ep', '1'));
  success(await run('prompts', 'init', input));
  success(await run('prompts', 'check', input));
  failure(await run('prompts', 'status', input));
  failure(await run('export', input, '--out', 'pack'));
  const doc = JSON.parse(readFileSync(join(f.workspaceRoot, input), 'utf8'));
  for (const ep of doc.episodes) for (const seg of ep.segments) {
    const file = join(f.workspaceRoot, 'creation', seg.id, 'prompt.md');
    const sheet = worksheet.parseWorksheet(readFileSync(file, 'utf8'));
    writeFileSync(file, worksheet.serializeWorksheet({ ...sheet,
      meta: { ...sheet.meta, status: 'in_review', round: 1 }, review: '结论：通过。' }));
    success(await run('prompts', 'verdict', input, 'approved', seg.id));
  }
  success(await run('prompts', 'apply', input));
  success(await run('export', input, '--out', 'pack'));
  const plan = JSON.parse(success(await run('videos', 'pack/manifest.json', '--dry-run')).stdout);
  assert.equal(plan.jobs.length, 4);
  assert.ok(plan.jobs.every(job => job.output.startsWith(f.workspaceRoot)));
});

test('rejects unknown skills, arbitrary scripts/actions, Node flags, and malformed argv', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  for (const [skill, args] of [
    ['../../evil', ['init']], ['mint-setup/scripts/mint-setup.mjs', ['init']],
    ['constructor', ['init']], ['mint-setup', ['constructor']],
    ['mint-setup', ['stats']], ['mint-setup', ['--eval', 'process.exit(0)']],
    ['mint-setup', ['models', '--import', 'evil.mjs']],
    ['mint-setup', ['init', '--aspect=16:9']],
    ['mint-setup', ['init', '--aspect', '16:9', '--aspect', '9:16']],
    ['mint-setup', ['models', '>output.json']], ['mint-setup', ['models', '--']],
    ['mint-setup', ['models', '\0']], ['mint-setup', ['models', 3]],
    ['mint-creation', ['prompts', 'delete', 'creation.json']],
  ]) await assert.rejects(call(instance, skill, args));
  await assert.rejects(instance.execute('test', { skill: 'mint-setup', args: ['models'], cwd: f.base }));
  assert.throws(() => tool(f.workspaceRoot, 'admin'), /Unknown role/);
});

test('rejects direct input/output escapes and platform path aliases', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  writeFileSync(join(f.base, 'outside.json'), '{"private":"not-for-child"}');
  for (const path of ['../outside.json', '..\\outside.json', join(f.base, 'outside.json'),
    'file:stream', '\\\\?\\C:\\outside', 'NUL', 'trailing.']) {
    await assert.rejects(call(instance, 'mint-setup', ['validate', path]), /Path|path/);
  }
  await assert.rejects(call(instance, 'mint-video-prompt', ['new', 'E01-01', '--out', '..']), /workspace/);
  await assert.rejects(call(instance, 'mint-setup', ['migrate-v3', 'old.json', '--out', '../new.json']), /workspace/);
  await assert.rejects(call(instance, 'mint-characters', ['images', 'cast.json', '--images', '../../outside']), /directory name/);
  await assert.rejects(call(instance, 'mint-setup', ['validate', join(skillsRoot, 'mint-setup/examples/production.json')]), /workspace/);
});

test('actual manifest cannot read an embedded creation path outside the workspace', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  writeFileSync(join(f.base, 'outside.json'), '{"private":"OUTSIDE_SECRET"}');
  writeFileSync(join(f.workspaceRoot, 'manifest.json'), JSON.stringify({
    video: { model: 'MiniMax H3' }, creation: '../outside.json', segments: [],
  }));
  const r = failure(await call(instance, 'mint-creation', ['videos', 'manifest.json']));
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Access to this API has been restricted|ERR_ACCESS_DENIED/);
  assert.doesNotMatch(r.stdout + r.stderr, /OUTSIDE_SECRET/);
});

test('actual worksheet initialization cannot write through an embedded segment path escape', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  cpSync(join(skillsRoot, 'mint-creation/examples'), f.workspaceRoot, { recursive: true });
  const file = join(f.workspaceRoot, 'creation/收书人-creation.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.episodes[0].segments[0].id = '../../escaped';
  writeFileSync(file, JSON.stringify(doc));
  const r = failure(await call(instance, 'mint-creation', ['prompts', 'init', 'creation/收书人-creation.json']));
  assert.match(r.stderr, /Access to this API has been restricted|ERR_ACCESS_DENIED/);
  assert.equal(existsSync(join(f.base, 'escaped/prompt.md')), false);
});

test('Node permission boundary denies embedded reads/writes and keeps skill assets read-only', async t => {
  const f = probe(t, `import { readFileSync, writeFileSync } from 'node:fs';
    const doc = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    if (doc.write) writeFileSync(doc.target, 'overwritten');
    else console.log(readFileSync(doc.target, 'utf8'));
  `);
  const outside = join(f.base, 'outside.txt');
  writeFileSync(outside, 'OUTSIDE_SECRET');
  const doc = join(f.workspaceRoot, 'doc.json');
  for (const [target, write] of [[outside, false], [outside, true], [f.entry, true]]) {
    writeFileSync(doc, JSON.stringify({ target, write }));
    const r = failure(await call(f.instance, 'mint-setup', ['migrate-v3', 'doc.json']));
    assert.match(r.stderr, /ERR_ACCESS_DENIED/);
    assert.doesNotMatch(r.stdout + r.stderr, /OUTSIDE_SECRET/);
  }
  assert.equal(readFileSync(outside, 'utf8'), 'OUTSIDE_SECRET');
  assert.match(readFileSync(f.entry, 'utf8'), /readFileSync/);
  const target = join(f.workspaceRoot, 'allowed.txt');
  writeFileSync(doc, JSON.stringify({ target, write: true }));
  success(await call(f.instance, 'mint-setup', ['migrate-v3', 'doc.json']));
  assert.equal(readFileSync(target, 'utf8'), 'overwritten');
  failure(await call(f.instance, 'mint-setup', ['validate', 'doc.json']));
});

test('rejects symlinks, junctions, dangling links, and hardlinks before child execution', async t => {
  const f = fixture(t), instance = tool(f.workspaceRoot);
  const outside = join(f.base, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.json'), '{"secret":true}');
  const link = join(f.workspaceRoot, 'alias');
  symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(call(instance, 'mint-setup', ['validate', 'alias/secret.json']), /Linked/);
  await assert.rejects(call(instance, 'mint-video-prompt', ['new', 'E01-01', '--out', 'alias']), /Linked/);
  assert.equal(existsSync(join(outside, 'E01-01/prompt.md')), false);
  // Also catches paths selected indirectly from JSON or automatic upstream lookup.
  await assert.rejects(call(instance, 'mint-setup', ['models']), /Linked/);
  rmSync(link);
  symlinkSync(join(f.base, 'missing'), link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(call(instance, 'mint-setup', ['models']), /Linked/);
  rmSync(link);
  linkSync(join(outside, 'secret.json'), link);
  await assert.rejects(call(instance, 'mint-setup', ['validate', 'alias']), /Linked/);
});

test('rejects linked packaged assets and overlapping roots', async t => {
  const f = probe(t, 'console.log("should not run")');
  const alias = join(f.root, 'mint-setup', 'outside');
  symlinkSync(f.workspaceRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(call(f.instance, 'mint-setup', ['models']), /Linked/);
  const overlap = tool(f.base, 'main', f.root);
  await assert.rejects(call(overlap, 'mint-setup', ['models']), /disjoint/);
});

test('writer/reviewer operation restrictions and reviewer verdict preserve creative content', async t => {
  const f = fixture(t), writer = tool(f.workspaceRoot, 'writer'), reviewer = tool(f.workspaceRoot, 'reviewer');
  success(await call(writer, 'mint-video-prompt', ['new', 'E01-01', '--out', '.']));
  failure(await call(writer, 'mint-video-prompt', ['lint', 'E01-01/prompt.md']));
  const example = readFileSync(join(skillsRoot, 'mint-video-prompt-review/examples/回执/第一轮/E01-01/prompt.md'), 'utf8');
  const before = worksheet.parseWorksheet(example);
  const file = join(f.workspaceRoot, 'E01-01/prompt.md');
  writeFileSync(file, worksheet.serializeWorksheet({ ...before, meta: { ...before.meta, status: 'in_review' } }));
  success(await call(reviewer, 'mint-video-prompt-review', ['verdict', 'changes_requested', 'E01-01/prompt.md']));
  const after = worksheet.parseWorksheet(readFileSync(file, 'utf8'));
  assert.equal(after.meta.status, 'changes_requested');
  assert.deepEqual(after.structure, before.structure);
  assert.equal(after.body, before.body);
  success(await call(reviewer, 'mint-video-prompt-review', ['show', 'E01-01/prompt.md']));
  for (const args of [['new', 'E01-02', '--out', '.'], ['submit', 'E01-01/prompt.md']]) {
    await assert.rejects(call(reviewer, 'mint-video-prompt', args), /role reviewer/);
  }
  for (const instance of [writer, reviewer]) {
    await assert.rejects(call(instance, 'mint-creation', ['prompts', 'verdict', 'creation.json', 'approved', 'E01-01']), /role/);
    await assert.rejects(call(instance, 'mint-outline', ['chunk', 'book.txt', '.']), /role/);
    await assert.rejects(call(instance, 'mint-setup', ['migrate-v3', 'input.json', '--out', 'overwrite.json']), /role/);
  }
  await assert.rejects(call(writer, 'mint-video-prompt-review', ['verdict', 'approved', 'E01-01/prompt.md']), /role writer/);
  writeFileSync(join(f.workspaceRoot, 'other.txt'), example);
  await assert.rejects(call(reviewer, 'mint-video-prompt-review', ['verdict', 'blocked', 'other.txt']), /prompt.md/);
  await assert.rejects(call(reviewer, 'mint-video-prompt-review', ['verdict', 'blocked', 'missing/prompt.md']), /ENOENT/);
});

test('reviewer child has write permission only for explicitly named existing worksheets', async t => {
  const f = probe(t, `import { writeFileSync } from 'node:fs';
    writeFileSync('unrelated.txt', 'unauthorized');
  `, 'mint-video-prompt-review', 'reviewer');
  writeFileSync(join(f.workspaceRoot, 'prompt.md'), 'existing');
  const r = failure(await call(f.instance, 'mint-video-prompt-review', ['verdict', 'blocked', 'prompt.md']));
  assert.match(r.stderr, /ERR_ACCESS_DENIED/);
  assert.equal(existsSync(join(f.workspaceRoot, 'unrelated.txt')), false);
});

test('does not inherit Node preload options or credential environment', async t => {
  const f = probe(t, `console.log(JSON.stringify({ options: process.env.NODE_OPTIONS, token: process.env.MINT_TEST_SECRET }));`);
  const oldOptions = process.env.NODE_OPTIONS, oldSecret = process.env.MINT_TEST_SECRET;
  process.env.NODE_OPTIONS = '--import=missing-preload.mjs';
  process.env.MINT_TEST_SECRET = 'SECRET_SENTINEL';
  try {
    assert.deepEqual(JSON.parse(success(await call(f.instance, 'mint-setup', ['models'])).stdout), {});
  } finally {
    if (oldOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = oldOptions;
    if (oldSecret === undefined) delete process.env.MINT_TEST_SECRET; else process.env.MINT_TEST_SECRET = oldSecret;
  }
});

test('preserves stdout, stderr, and genuine nonzero exit status', async t => {
  const f = probe(t, 'console.log("output"); console.error("diagnostic"); process.exitCode = 7;');
  const r = failure(await call(f.instance, 'mint-setup', ['models']));
  assert.equal(r.exitCode, 7);
  assert.equal(r.stdout, 'output\n');
  assert.equal(r.stderr, 'diagnostic\n');
});

test('kills on combined output limit without treating truncation as success', async t => {
  const f = probe(t, 'while (true) process.stdout.write("x".repeat(65536));');
  const r = failure(await call(f.instance, 'mint-setup', ['models']));
  assert.equal(r.outputLimitExceeded, true);
  assert.ok(Buffer.byteLength(r.stdout) + Buffer.byteLength(r.stderr) <= 1024 * 1024);
});

test('honors pre-abort and terminates an active child on cancellation', async t => {
  const f = probe(t, 'console.log("started"); setInterval(() => {}, 1000);');
  const pre = new AbortController();
  pre.abort();
  const early = failure(await call(f.instance, 'mint-setup', ['models'], pre.signal));
  assert.equal(early.aborted, true);
  assert.equal(early.stdout, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    const r = failure(await call(f.instance, 'mint-setup', ['models'], controller.signal));
    assert.equal(r.aborted, true);
    assert.match(r.stdout, /started/);
  } finally { clearTimeout(timer); }
});

test('kills a running child at the fixed 30-second timeout', { timeout: 40_000 }, async t => {
  const f = probe(t, 'console.log("started"); setInterval(() => {}, 1000);');
  const r = failure(await call(f.instance, 'mint-setup', ['models']));
  assert.equal(r.timedOut, true);
  assert.equal(r.aborted, false);
  assert.match(r.stdout, /started/);
});
