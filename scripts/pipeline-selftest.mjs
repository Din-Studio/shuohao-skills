#!/usr/bin/env node
// 跨阶段离线回归：真实渲染、合并交互适配、退役 skill 安装清理。
// 仅在临时目录写入文件，不调用模型，不修改真实 HOME。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePane, scopeJs, splitDoc } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(root, 'skills/mint-creation/examples');
const temp = mkdtempSync(join(tmpdir(), 'mint-pipeline-'));
let passed = 0;
const ok = (value, message) => { assert.ok(value, message); passed++; };
const eq = (a, b, message) => { assert.equal(a, b, message); passed++; };
const run = (bin, args, opts = {}) => spawnSync(bin, args, {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: '' }, ...opts,
});
const report = (...args) => run(process.execPath, ['scripts/report.mjs', ...args]);

try {
  // Deterministic independent-authoring regression: no ignored demo file or skipped branch.
  const authored = { schemaVersion: 4, source: '桥头交班', params: { actionSeconds: 6 }, episodes: [
    { ep: 1, targetSeconds: 24, scenes: [{ sceneId: 'S01', characters: ['C01', 'C02'], props: ['P01'], flow: [
      { action: '姚青将巡检记录交给接班员。' },
      { speaker: 'C01', line: '只确认读数，不替我签名。', delivery: '平静而明确' },
      { action: '接班员另起一行记录实际读数。' },
      { speaker: 'C02', line: '这次是我的记录。', delivery: '低声' }
    ] }] }
  ] };
  const authoredFile = join(temp, 'independent-script.json');
  writeFileSync(authoredFile, JSON.stringify(authored));
  const before = readFileSync(authoredFile);
  const scriptCli = join(root, 'skills/mint-script/scripts/mint-script.mjs');
  const checked = run(process.execPath, [scriptCli, 'validate', authoredFile, '--no-production']);
  eq(checked.status, 0, checked.stdout + checked.stderr);
  const shown = run(process.execPath, [scriptCli, 'render', authoredFile, '--html', '--no-production']);
  eq(shown.status, 0, shown.stderr);
  const exported = JSON.parse(shown.stdout.match(/<script[^>]*id="script-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(exported, authored); passed++;
  eq(createHash('sha256').update(readFileSync(authoredFile)).digest('hex'), createHash('sha256').update(before).digest('hex'), '渲染保留正文、资产、目标时长与特殊 delivery');
  for (const ep of exported.episodes) {
    for (const field of ['endBeat', 'seedNote', 'hook', 'cliff', 'beatsClaimed', 'hookBeat']) ok(!(field in ep), `独立剧本不携带 ${field}`);
    ok(ep.scenes.every(scene => scene.flow.length > 0), '独立剧本正文没有被删除');
  }
  ok(!existsSync(join(root, 'skills/novel-storyboard')), '退役 skill 目录不存在');
  for (const lang of ['zh', 'en']) {
    const out = join(temp, `merged-${lang}.html`);
    const r = report('--from', sample, '--out', out, '--lang', lang);
    // creation 自有上游是消费接口夹具，不是完整角色／美术设定。
    // 部分消费者可渲染错误报告，部分拒绝不完整上游；均不得静默冒充成功。
    eq(r.status, 1, '不完整上游面板使合并命令返回非零');
    ok(/[1-5] 个面板/.test(r.stdout), '仍交付可渲染面板；完整五面板另以各自正式样例及联合 fixture 验证');
    const html = readFileSync(out, 'utf8');
    ok(html.includes('id="pane-creation"'), 'creation 接入合并报告');
    ok(html.includes(lang === 'en' ? 'Unavailable pane:' : '面板未生成：'), '无法渲染的资产面板在正文中明确标注');
    ok(!html.includes('pane-storyboard'), '不存在旧面板');
    ok(html.includes('id="creation--creation-data"'), 'creation 导出数据带作用域');
    ok(html.includes(lang === 'en' ? '>Creation<' : '>视频创作<'), '导航语言正确');
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    ok(images.length >= 4, '真实设定图进入合并报告');
    for (const image of images.filter((s) => !/^(data:|https?:)/.test(s))) {
      ok(existsSync(resolve(temp, image)), `重定位图片存在：${image}`);
    }
    for (const js of splitDoc(html).scripts) {
      assert.doesNotThrow(() => new Function(js)); passed++;
    }
  }

  // 不同正式故事不得被组合成伪联合交付。完整五面板正例在三组合联合测试中。
  const fixture = (skill, suffix) => {
    const stories = { 'mint-script': '修伞簿', 'mint-outline': '旧站时刻', 'mint-art': '雨棚留言', 'mint-characters': '渡口' };
    return join(root, 'skills', skill, 'examples', stories[skill] + suffix);
  };
  const explicit = report('--creation', join(sample, 'creation/收书人-creation.json'),
    '--script', fixture('mint-script', '-script.json'),
    '--outline', fixture('mint-outline', '-outline.json'),
    '--art', fixture('mint-art', '-art.json'),
    '--cast', fixture('mint-characters', '-cast.json'), '--out', join(temp, 'explicit.html'));
  eq(explicit.status, 1, '不同故事的上游投影不匹配，必须报告失败');
  const mixed = readFileSync(join(temp, 'explicit.html'), 'utf8');
  ok(mixed.includes('面板未生成：mint-script'), '不同故事组合不能伪装成剧本联合通过');
  // v4 creation also verifies supplied source identity; mismatched upstreams cannot render it.
  for (const id of ['characters', 'art']) ok(mixed.includes(`id="pane-${id}"`), '独立且可渲染的资产面板仍然保留');
  const urlTextArt = JSON.parse(readFileSync(fixture('mint-art', '-art.json'), 'utf8'));
  urlTextArt.scenes[0].summary += ' 资料路径记作 url(images/reference.png)，这是正文。';
  urlTextArt.exportNote = 'url(../original.png)';
  const urlTextFile = join(temp, 'url-text-art.json'); writeFileSync(urlTextFile, JSON.stringify(urlTextArt));
  const urlTextResult = report('--art', urlTextFile, '--out', join(temp, 'url-text.html'));
  eq(urlTextResult.status, 0, urlTextResult.stderr);
  const urlTextHtml = readFileSync(join(temp, 'url-text.html'), 'utf8');
  const embeddedArt = urlTextHtml.match(/<script type="application\/json" id="art--art-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embeddedArt), urlTextArt); passed++;
  ok(urlTextHtml.includes('资料路径记作 url(images/reference.png)'), '真实美术正文中的路径文本不被显示层改写');
  const partial = report('--cast', fixture('mint-characters', '-cast.json'), '--out', join(temp, 'partial.html'));
  eq(partial.status, 0, partial.stderr);
  ok(partial.stdout.includes('1 个面板'), '单阶段渲染保持可用');
  const conflict = report('--cast', fixture('mint-characters', '-cast.json'), '--production', 'production.json', '--no-production', '--out', join(temp, 'conflict.html'));
  eq(conflict.status, 1, '独立模式和显式制作配置不能混用');
  ok(!existsSync(join(temp, 'conflict.html')), '冲突参数不写入报告');
  const malformedProduction = join(temp, 'broken-production.json'); writeFileSync(malformedProduction, '{broken');
  const brokenProduction = report('--cast', fixture('mint-characters', '-cast.json'), '--production', malformedProduction, '--out', join(temp, 'broken-production.html'));
  eq(brokenProduction.status, 1, '损坏的显式制作配置不静默变成独立模式');
  ok(!existsSync(join(temp, 'broken-production.html')), '没有成功面板时不生成报告');
  const retired = report('--storyboard', 'old.json', '--cast', join(sample, 'characters/收书人-cast.json'), '--out', join(temp, 'retired.html'));
  eq(retired.status, 1, '旧参数不再静默忽略');
  ok(retired.stderr.includes('未知选项 --storyboard'), '旧参数明确报错');
  ok(!existsSync(join(temp, 'retired.html')), '旧参数失败不输出半成品');
  const legacy = join(temp, 'legacy');
  mkdirSync(join(legacy, 'storyboard'), { recursive: true });
  writeFileSync(join(legacy, 'storyboard/old-storyboard.json'), '{}');
  eq(report('--from', legacy, '--out', join(temp, 'legacy.html')).status, 1, '自动发现不再读取退役目录');

  // 真正执行 creation 渲染脚本的浏览器端代码；以最小 DOM 替身验证本次接入适配。
  const rendered = run(process.execPath, [join(root, 'skills/mint-creation/scripts/mint-creation.mjs'),
    'render', '收书人-creation.json', '--html', '--script', '../script/收书人-script.json',
    '--outline', '../outline/收书人-outline.json', '--art', '../art/收书人-art.json'], { cwd: join(sample, 'creation') });
  eq(rendered.status, 0, rendered.stderr);
  const pane = makePane(rendered.stdout, { id: 'creation' });
  const clicks = [], keys = [], classes = new Set();
  let removed = false, clipboardCalls = 0;
  const zone = { scrollHeight: 0, classList: { remove() {} } };
  const more = { previousElementSibling: zone, remove() { removed = true; }, addEventListener() {} };
  const bigImage = {};
  const backdrop = {};
  const lightbox = {
    querySelector: () => bigImage,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    contains: (node) => node === backdrop,
  };
  const paneRoot = {
    querySelector: (s) => s === '#creation--lightbox' ? lightbox : { addEventListener() {} },
    querySelectorAll: () => [more],
    addEventListener: (type, fn) => { eq(type, 'click', '点击绑定当前面板'); clicks.push(fn); },
  };
  const doc = {
    getElementById: () => paneRoot,
    addEventListener: (type, fn) => { eq(type, 'keydown', '键盘事件保留页面焦点响应'); keys.push(fn); },
  };
  const win = { document: doc };
  const execute = new Function('window', 'navigator', 'setTimeout', pane.js);
  execute(win, { clipboard: { writeText: async () => { clipboardCalls++; } } }, () => {});
  ok(!removed, '隐藏面板高度为零时保留展开按钮');
  const tile = { src: 'sheet.png' };
  clicks[0]({ target: { closest: () => tile } });
  ok(classes.has('on'), '图片点击打开灯箱');
  eq(bigImage.src, 'sheet.png', '灯箱显示目标图片');
  backdrop.closest = () => null;
  clicks[0]({ target: backdrop });
  ok(!classes.has('on'), '加前缀后的灯箱背景仍可关闭');
  classes.add('on'); keys[0]({ key: 'Escape' });
  ok(!classes.has('on'), '页面 Escape 仍可关闭灯箱');
  const button = { textContent: '复制', dataset: { copy: 'prompt' } };
  await clicks[1]({ target: { closest: () => button }, preventDefault() {} });
  eq(clipboardCalls, 1, '当前面板复制只调用一次');

  // 实际大纲 renderer 的后半集定位，在合并报告重命名ID之后仍能展开并定位。
  const outlineRendered = run(process.execPath, [join(root, 'skills/mint-outline/scripts/mint-outline.mjs'), 'render', fixture('mint-outline', '-outline.json'), '--html']);
  eq(outlineRendered.status, 0, outlineRendered.stderr);
  const locateCode = splitDoc(outlineRendered.stdout).scripts.join('\n').match(/function locateEpisode\(hash\)\{[\s\S]*?\n\}/)?.[0];
  ok(locateCode, '实际 renderer 包含分集定位逻辑');
  const locationState = { expanded: false, scrolled: false };
  const episodeTarget = { scrollIntoView() { locationState.scrolled = true; ok(locationState.expanded, '先展开后滚动'); } };
  const locationWindow = { document: { getElementById: () => ({ querySelector: selector => selector === '#outline--ep-6' ? episodeTarget : null }) }, state: locationState };
  new Function('window', scopeJs(`function expandEpisodes(){window.state.expanded=true;}\n${locateCode}\nlocateEpisode('#outline--ep-6');`, 'pane-outline', 'outline--'))(locationWindow);
  ok(locationState.scrolled, '带作用域的第6集链接执行真实定位函数');

  // 两个面板共享 document 时，点击监听仍各自归属，互不复制对方内容。
  const events = { a: [], b: [] };
  let active = 'a';
  const shared = { document: { getElementById: () => ({ addEventListener: (_t, fn) => events[active].push(fn) }) } };
  new Function('window', scopeJs("document.addEventListener('click', () => window.count++);", 'a', 'a--'))(shared);
  active = 'b';
  new Function('window', scopeJs("document.addEventListener('click', () => window.count++);", 'b', 'b--'))(shared);
  shared.count = 0; events.a.forEach((fn) => fn());
  eq(shared.count, 1, '一个面板点击不会触发另一个面板监听');

  // 安装器只在隔离 HOME 内运行。
  const home = join(temp, 'home');
  const skills = join(home, '.pi/agent/skills');
  mkdirSync(skills, { recursive: true });
  const old = join(skills, 'novel-storyboard');
  const own = join(root, 'skills/novel-storyboard');
  const install = (...args) => {
    const result = run('bash', ['scripts/install.sh', '--pi', ...args], { env: { ...process.env, HOME: home } });
    if (result.status !== 0 && !args.includes('novel-storyboard')) console.error(result.stderr);
    return result;
  };
  symlinkSync(own, old);
  eq(install().status, 0, '默认安装成功');
  const piAgent = name => join(home, '.pi/agent/agents', `${name}.md`);
  for (const agent of ['mint-video-prompt-writer', 'mint-video-prompt-reviewer']) {
    eq(readlinkSync(piAgent(agent)), join(root, 'agents/pi', `${agent}.md`), `安装到 pi 时链接角色定义 ${agent}`);
  }
  ok(!existsSync(old) && !lstatSync(old, { throwIfNoEntry: false }), '默认安装清理本仓库旧软链');
  eq(readlinkSync(join(skills, 'mint-creation')), join(root, 'skills/mint-creation'), '安装当前视频创作 skill');
  symlinkSync(own, old);
  eq(install('--uninstall', 'novel-storyboard').status, 0, '源目录删除后仍可显式卸载旧软链');
  ok(!lstatSync(old, { throwIfNoEntry: false }), '显式卸载删除本仓库旧软链');
  const foreign = join(temp, 'another-repo/skills/novel-storyboard');
  symlinkSync(foreign, old);
  eq(install().status, 0, '存在其他来源的旧软链仍可安装');
  eq(readlinkSync(old), foreign, '不删除其他来源软链');
  eq(install('--uninstall', 'novel-storyboard').status, 0, '显式卸载仍遵循归属检查');
  eq(readlinkSync(old), foreign, '显式卸载不删除其他来源软链');
  rmSync(old); mkdirSync(old); writeFileSync(join(old, 'user.txt'), 'keep');
  eq(install().status, 0, '存在真实旧目录仍可安装');
  eq(readFileSync(join(old, 'user.txt'), 'utf8'), 'keep', '不删除真实目录内容');
  eq(install('novel-storyboard').status, 1, '无法重新安装退役 skill');
  rmSync(old, { recursive: true }); symlinkSync(own, old);
  eq(install('--uninstall').status, 0, '默认卸载可清理退役链接');
  ok(!lstatSync(old, { throwIfNoEntry: false }), '默认卸载删除本仓库旧软链');
  ok(!lstatSync(piAgent('mint-video-prompt-writer'), { throwIfNoEntry: false }), '卸载删除 pi 角色定义软链');
  // subagent 定义只随 Claude Code 安装
  ok(!existsSync(join(home, '.claude')), '只安装到 pi 时不创建 Claude Code 目录');
  const claude = (...args) => run('bash', ['scripts/install.sh', '--claude', ...args], { env: { ...process.env, HOME: home } });
  const agentLink = name => join(home, '.claude/agents', `${name}.md`);
  eq(claude().status, 0, '安装到 Claude Code 成功');
  for (const [agent, skill] of [['mint-video-prompt-writer', 'mint-video-prompt'], ['mint-video-prompt-reviewer', 'mint-video-prompt-review']]) {
    eq(readlinkSync(agentLink(agent)), join(root, 'agents', `${agent}.md`), `软链 subagent 定义 ${agent}`);
    const text = readFileSync(join(root, 'agents', `${agent}.md`), 'utf8');
    ok(text.includes(`name: ${agent}\n`) && text.includes(`skills: [${skill}]`), `${agent} 预载 ${skill}`);
    ok(existsSync(join(root, 'skills', skill, 'SKILL.md')) && !/^tools:.*\bAgent\b/m.test(text), `${agent} 预载的 skill 存在且不能继续派发`);
  }
  // pi 的角色定义与 Claude Code 的同名：只用子代理扩展认识的字段，不写模型（继承调度会话），指南路径由任务简报给出
  const piTools = {
    'mint-video-prompt-writer': 'read, write, edit, bash, grep, find, ls',
    'mint-video-prompt-reviewer': 'read, edit, bash, grep, find, ls',
  };
  for (const [agent, tools] of Object.entries(piTools)) {
    const text = readFileSync(join(root, 'agents/pi', `${agent}.md`), 'utf8');
    const front = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    eq(front.split('\n').map(line => line.split(':')[0]).join(','), 'name,description,tools', `pi 角色定义 ${agent} 只有 name、description、tools`);
    ok(front.includes(`name: ${agent}`) && front.includes(`tools: ${tools}`), `pi 角色定义 ${agent} 的工具白名单`);
    ok(/最后一条回复/.test(text) && /不能向用户提问/.test(text), `pi 角色 ${agent} 说明非交互与回报方式`);
    ok(/不启动其他代理/.test(text), `pi 角色 ${agent} 不继续派发`);
  }
  ok(!existsSync(join(root, '.pi')), '仓库不保留项目级 .pi 角色定义');
  eq(claude('--uninstall').status, 0, '从 Claude Code 卸载成功');
  ok(!lstatSync(agentLink('mint-video-prompt-writer'), { throwIfNoEntry: false }), '卸载删除 subagent 软链');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`✓ ${passed} 项跨阶段离线自测全部通过`);
