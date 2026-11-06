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
let passed = 0;
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
try {
  for (const name of readdirSync(join(root, 'skills')).filter(n => n.startsWith('novel-'))) {
    const source = join(root, 'skills', name);
    const isolated = join(temp, name, 'standalone');
    cpSync(source, isolated, { recursive: true });
    assert.ok(existsSync(join(isolated, 'scripts/selftest.mjs')), `${name} 缺少基础自测`);
    for (const file of readdirSync(join(isolated, 'scripts')).filter(n => n.endsWith('selftest.mjs')).sort()) {
      const test = join(isolated, 'scripts', file);
      const run = spawnSync(process.execPath, [test], {
        cwd: isolated, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: '' },
      });
      assert.equal(run.status, 0, `${name}/${file}\n${run.stdout}\n${run.stderr}`);
      console.log(`✓ ${name}/${file} 独立拷贝通过`);
      passed++;
    }
    for (const file of walk(isolated).filter(p => p.endsWith('.md'))) {
      const md = readFileSync(file, 'utf8');
      for (const match of md.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
        const link = match[1];
        if (/^(?:[a-z]+:|#|\/)/i.test(link) || /[<>]/.test(link)) continue;
        const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
        assert.ok(target === isolated || target.startsWith(isolated + '/'), `${name} 文档链接越出独立目录：${file} → ${link}`);
        assert.ok(existsSync(target), `${name} 文档链接失效：${file} → ${link}`);
        passed++;
      }
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`✓ ${passed} 项独立拷贝与本地链接检查通过`);
