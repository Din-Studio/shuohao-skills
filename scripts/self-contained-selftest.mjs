#!/usr/bin/env node
// 每个 skill 物理拷贝后运行，隔离目录不包含兄弟 skill。零网络与生成调用。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'shuohao-standalone-'));
let passed = 0, entries = 0;
const failures = [];
function check(label, fn) {
  try { fn(); passed++; console.log(`✓ ${label}`); }
  catch (e) { failures.push(label); console.error(`失败 ${label}\n${e.message}`); }
}
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
try {
  for (const name of readdirSync(join(root, 'skills')).filter(n => n.startsWith('novel-')).sort()) {
    const source = join(root, 'skills', name);
    const isolated = join(temp, name, 'standalone');
    cpSync(source, isolated, { recursive: true });
    check(`${name} 自测入口存在`, () => assert.ok(existsSync(join(isolated, 'scripts/selftest.mjs'))));
    if (['novel-outline', 'novel-script', 'novel-creation'].includes(name)) check(`${name} v3 自包含指南`, () => {
      assert.ok(existsSync(join(isolated, 'references/创作指南.md')));
      assert.ok(!existsSync(join(isolated, 'references/profiles')));
      assert.ok(!existsSync(join(isolated, 'references/profile-contract.md')));
      assert.ok(!existsSync(join(isolated, 'scripts/lib/creative.mjs')));
    });
    for (const file of readdirSync(join(isolated, 'scripts')).filter(n => n.endsWith('selftest.mjs')).sort()) {
      entries++;
      check(`${name}/${file} 独立拷贝`, () => {
        const run = spawnSync(process.execPath, [join(isolated, 'scripts', file)], {
          cwd: isolated, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000,
          env: { ...process.env, NODE_OPTIONS: '' },
        });
        assert.ifError(run.error);assert.equal(run.signal,null);
        assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
      });
    }
    check(`${name} 所有本地文档链接`, () => {
      for (const file of walk(isolated).filter(p => p.endsWith('.md'))) {
        const md = readFileSync(file, 'utf8');
        for (const match of md.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
          const link = match[1];
          if (/^(?:[a-z]+:|#|\/)/i.test(link) || /[<>]/.test(link)) continue;
          const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
          assert.ok(target === isolated || target.startsWith(isolated + '/'), `${file} → ${link} 越出独立目录`);
          assert.ok(existsSync(target), `${file} → ${link} 链接失效`);
        }
      }
    });
  }
  // 工作单是三个 skill 之间唯一的协作格式：解析库各持一份副本，必须逐字一致
  check('三份工作单解析库一致', () => {
    const copies = ['novel-creation', 'novel-video-prompt', 'novel-video-prompt-review'].map(name => readFileSync(join(root, 'skills', name, 'scripts/lib/worksheet.mjs'), 'utf8'));
    assert.equal(copies[1], copies[0]); assert.equal(copies[2], copies[0]);
    assert.equal(readFileSync(join(root, 'skills/novel-video-prompt/references/worksheet.md'), 'utf8'), readFileSync(join(root, 'skills/novel-video-prompt-review/references/worksheet.md'), 'utf8'), '两份工作单格式说明一致');
  });
  // 编写方与审核方各自的样例工作单，必须通过调度方的完整结构检查
  check('新 skill 的样例工作单通过 novel-creation 结构检查', () => {
    const cli = join(root, 'skills/novel-creation/scripts/novel-creation.mjs');
    for (const [skill, dir, target] of [['novel-video-prompt', '第七盏灯', 20], ['novel-video-prompt-review', '回执/第一轮', 10], ['novel-video-prompt-review', '回执/第二轮', 14]]) {
      const base = join(root, 'skills', skill, 'examples', dir), work = join(temp, 'bridge', skill, dir.replace('/', '-'), 'creation');
      const input = JSON.parse(readFileSync(join(base.replace(/\/第.轮$/, ''), '输入材料.json'), 'utf8'));
      cpSync(base, work, { recursive: true });
      const script = { schemaVersion: 3, source: input.source, episodes: [{ ep: 1, targetSeconds: target, scenes: input.seedScenes.map(sc => ({
        sceneId: sc.sceneId, lighting: sc.lighting, characters: sc.characters, props: sc.props,
        flow: sc.beats.map(b => b.kind === 'line' ? { speaker: b.speaker, line: b.text } : { action: b.text }) })) }] };
      writeFileSync(join(work, 'script.json'), JSON.stringify(script));
      writeFileSync(join(work, 'c.json'), JSON.stringify({ schemaVersion: 3, source: input.source, promptLang: input.promptLang, video: input.video,
        params: { maxSegmentSeconds: input.maxSegmentSeconds, maxOnScreen: input.maxOnScreen, tolerance: 0.15 }, episodes: [{ ep: 1, segments: [] }] }));
      const run = spawnSync(process.execPath, [cli, 'prompts', 'check', 'c.json', '--script', 'script.json', '--no-production'], { cwd: work, encoding: 'utf8' });
      assert.equal(run.status, 0, `${skill}/${dir}\n${run.stdout}\n${run.stderr}`);
    }
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`本次实际执行 ${entries} 个独立自测入口；${passed} 组通过，${failures.length} 组失败。`);
if (failures.length) process.exitCode = 1;
