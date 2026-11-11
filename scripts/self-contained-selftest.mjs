#!/usr/bin/env node
// 每个 skill 物理拷贝后运行，隔离目录不包含兄弟 skill。零网络与生成调用。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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
  for (const name of readdirSync(join(root, 'skills')).filter(n => existsSync(join(root,'skills',n,'SKILL.md'))).sort()) {
    const source = join(root, 'skills', name);
    const isolated = join(temp, name, 'standalone');
    cpSync(source, isolated, { recursive: true });
    const documentOnly = ['video-prompt-writing','video-prompt-review'].includes(name);
    if (documentOnly) check(`${name} 自包含角色协议`, () => {
      for (const file of ['SKILL.md','references/method.md','references/protocol.md','references/h3-prompt.md','references/seedance2-prompt.md','examples/story.md']) assert.ok(existsSync(join(isolated,file)),file);
      const text = readFileSync(join(isolated,'SKILL.md'),'utf8');
      assert.ok(text.includes('不读取兄弟 skill'));
      assert.ok(text.includes('主 session'));
      assert.ok(!walk(isolated).some(p=>readFileSync(p,'utf8').includes('《收书人》')),'不能借用兄弟样例');
    });
    else check(`${name} 自测入口存在`, () => assert.ok(existsSync(join(isolated, 'scripts/selftest.mjs'))));
    if (['novel-outline', 'novel-script', 'novel-creation'].includes(name)) check(`${name} v3 自包含指南`, () => {
      assert.ok(existsSync(join(isolated, 'references/创作指南.md')));
      assert.ok(!existsSync(join(isolated, 'references/profiles')));
      assert.ok(!existsSync(join(isolated, 'references/profile-contract.md')));
      assert.ok(!existsSync(join(isolated, 'scripts/lib/creative.mjs')));
    });
    for (const file of (documentOnly ? [] : readdirSync(join(isolated, 'scripts'))).filter(n => n.endsWith('selftest.mjs')).sort()) {
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
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`本次实际执行 ${entries} 个独立自测入口；${passed} 组通过，${failures.length} 组失败。`);
if (failures.length) process.exitCode = 1;
