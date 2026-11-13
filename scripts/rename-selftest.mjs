#!/usr/bin/env node
// mint 命名与安装迁移回归。仅操作临时 HOME，不修改真实安装目录。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suffixes = ['art', 'characters', 'creation', 'outline', 'script', 'setup', 'video-prompt', 'video-prompt-review'];
const names = suffixes.map(s => `mint-${s}`);
const roles = ['video-prompt-writer', 'video-prompt-reviewer'];
const temp = mkdtempSync(join(tmpdir(), 'mint-rename-'));
let passed = 0;
const ok = (value, message) => { assert.ok(value, message); passed++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const present = path => !!lstatSync(path, { throwIfNoEntry: false });
const link = (target, path) => { mkdirSync(dirname(path), { recursive: true }); symlinkSync(target, path); };
try {
  eq(readdirSync(join(root, 'skills')).sort(), names, '恰好八个 mint 技能目录，没有旧名称或重复副本');
  for (const name of names) {
    const base = join(root, 'skills', name);
    const skill = readFileSync(join(base, 'SKILL.md'), 'utf8');
    eq(skill.match(/^name: (.+)$/m)?.[1], name, `${name} 元数据与目录同名`);
    ok(existsSync(join(base, 'scripts', `${name}.mjs`)), `${name} 脚本入口存在`);
    ok(!existsSync(join(base, 'scripts', name.replace('mint-', 'novel-') + '.mjs')), '旧脚本入口不再提供');
    const help = spawnSync(process.execPath, [join(base, 'scripts', `${name}.mjs`), '--help'], { encoding: 'utf8' });
    eq(help.status, 0, help.stderr);
    ok(help.stdout.includes(name) && !help.stdout.includes('novel-'), `${name} 帮助使用新名称`);
    if (name === 'mint-outline') {
      ok(/mint-outline v5/.test(help.stdout) && /migrate-v5/.test(help.stdout), '正式 v5 与历史迁移入口区分');
      ok(!/^\s+assets\b/m.test(help.stdout), '大纲资产命令不再作为正式接口发布');
    }
    if (['mint-characters','mint-art'].includes(name)) ok(/seed --source path --title title/.test(help.stdout) && /migrate-outline/.test(help.stdout), `${name} 独立原件 seed 与大纲迁移入口区分`);
  }
  for (const [flag, skillDir, agentDir, defs] of [
    ['--pi', '.pi/agent/skills', '.pi/agent/agents', 'agents/pi'],
    ['--claude', '.claude/skills', '.claude/agents', 'agents'],
    ['--codex', '.codex/skills', null, null],
  ]) {
    const home = join(temp, flag.slice(2));
    const skills = join(home, skillDir);
    const install = (...args) => {
      const r = spawnSync('bash', [join(root, 'scripts/install.sh'), flag, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } });
      eq(r.status, 0, r.stderr || r.stdout);
    };
    const oldLinks = suffixes.map(s => [join(root, 'skills', `novel-${s}`), join(skills, `novel-${s}`)]);
    if (agentDir) for (const role of roles) oldLinks.push([join(root, defs, `novel-${role}.md`), join(home, agentDir, `novel-${role}.md`)]);
    for (const [target, path] of oldLinks) link(target, path);
    install('mint-art');
    ok(!present(join(skills, 'novel-art')), '单独安装清理对应旧名称');
    for (const suffix of suffixes.filter(s => s !== 'art')) {
      eq(readlinkSync(join(skills, `novel-${suffix}`)), join(root, 'skills', `novel-${suffix}`), '单独安装不移除其他技能的旧安装');
    }
    install('--uninstall', 'novel-setup');
    ok(!present(join(skills, 'novel-setup')), '单独卸载旧名称只清理对应技能');
    ok(present(join(skills, 'novel-script')), '单独卸载不移除其他旧安装');
    install();
    for (const [, path] of oldLinks) ok(!present(path), `${flag} 清理本仓库旧名称软链，包括断链`);
    for (const name of names) eq(readlinkSync(join(skills, name)), join(root, 'skills', name), `${flag} 安装新名称`);
    if (agentDir) for (const role of roles) {
      const path = join(root, defs, `mint-${role}.md`);
      eq(readlinkSync(join(home, agentDir, `mint-${role}.md`)), path, `${flag} 安装新角色名称`);
      eq(readFileSync(path, 'utf8').match(/^name: (.+)$/m)?.[1], `mint-${role}`, '角色元数据与文件名一致');
    }
    install(); // 重复安装幂等
    for (const [target, path] of oldLinks) link(target, path);
    install('--uninstall', ...suffixes.map(s => `novel-${s}`));
    for (const [, path] of oldLinks) ok(!present(path), '支持按旧名称显式卸载');
    for (const [target, path] of oldLinks) link(target, path);
    install('--uninstall');
    for (const [, path] of oldLinks) ok(!present(path), '默认卸载清理旧名称');
    for (const name of names) ok(!present(join(skills, name)), '默认卸载清理新名称');
    if (agentDir) for (const role of roles) ok(!present(join(home, agentDir, `mint-${role}.md`)), '默认卸载清理新角色名称');

    // 旧名称属于其他仓库时不删除，即使是断链。
    for (const [, path] of oldLinks) link(join(temp, 'foreign', 'missing'), path);
    install();
    install('--uninstall', ...suffixes.map(s => `novel-${s}`));
    for (const [, path] of oldLinks) eq(readlinkSync(path), join(temp, 'foreign', 'missing'), '保留其他来源旧软链');
    // 用户真实目录也不删除。
    for (const [, path] of oldLinks) {
      rmSync(path); mkdirSync(path); writeFileSync(join(path, 'keep.txt'), 'keep');
    }
    install();
    install('--uninstall');
    for (const [, path] of oldLinks) eq(readFileSync(join(path, 'keep.txt'), 'utf8'), 'keep', '保留用户真实旧目录');
    install('mint-art');
    ok(existsSync(join(skills, 'mint-art', 'SKILL.md')), '支持单独安装新名称');
    ok(!present(join(skills, 'mint-setup')), '单独安装不安装其他技能');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`✓ ${passed} 项命名与安装迁移自测全部通过`);
