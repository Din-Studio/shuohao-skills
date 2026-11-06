#!/usr/bin/env node
// 跨阶段离线回归：真实渲染、合并交互适配、退役 skill 安装清理。
// 仅在临时目录写入文件，不调用模型，不修改真实 HOME。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePane, scopeJs, splitDoc } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(root, 'skills/novel-creation/examples');
const temp = mkdtempSync(join(tmpdir(), 'novel-pipeline-'));
let passed = 0;
const ok = (value, message) => { assert.ok(value, message); passed++; };
const eq = (a, b, message) => { assert.equal(a, b, message); passed++; };
const run = (bin, args, opts = {}) => spawnSync(bin, args, {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: '' }, ...opts,
});
const report = (...args) => run(process.execPath, ['scripts/report.mjs', ...args]);

try {
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
    const stories = { 'novel-script': '修伞簿', 'novel-outline': '旧站时刻', 'novel-art': '雨棚留言', 'novel-characters': '渡口' };
    return join(root, 'skills', skill, 'examples', stories[skill] + suffix);
  };
  const explicit = report('--creation', join(sample, 'creation/收书人-creation.json'),
    '--script', fixture('novel-script', '-script.json'),
    '--outline', fixture('novel-outline', '-outline.json'),
    '--art', fixture('novel-art', '-art.json'),
    '--cast', fixture('novel-characters', '-cast.json'), '--out', join(temp, 'explicit.html'));
  eq(explicit.status, 1, '不同故事的上游投影不匹配，必须报告失败');
  const mixed = readFileSync(join(temp, 'explicit.html'), 'utf8');
  ok(mixed.includes('面板未生成：novel-script'), '不同故事组合不能伪装成剧本联合通过');
  ok(mixed.includes('id="pane-creation"'), '其他可渲染面板仍然保留');
  const urlTextArt = JSON.parse(readFileSync(fixture('novel-art', '-art.json'), 'utf8'));
  urlTextArt.scenes[0].summary += ' 资料路径记作 url(images/reference.png)，这是正文。';
  urlTextArt.exportNote = 'url(../original.png)';
  const urlTextFile = join(temp, 'url-text-art.json'); writeFileSync(urlTextFile, JSON.stringify(urlTextArt));
  const urlTextResult = report('--art', urlTextFile, '--out', join(temp, 'url-text.html'));
  eq(urlTextResult.status, 0, urlTextResult.stderr);
  const urlTextHtml = readFileSync(join(temp, 'url-text.html'), 'utf8');
  const embeddedArt = urlTextHtml.match(/<script type="application\/json" id="art--art-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embeddedArt), urlTextArt); passed++;
  ok(urlTextHtml.includes('资料路径记作 url(images/reference.png)'), '真实美术正文中的路径文本不被显示层改写');
  const partial = report('--cast', fixture('novel-characters', '-cast.json'), '--out', join(temp, 'partial.html'));
  eq(partial.status, 0, partial.stderr);
  ok(partial.stdout.includes('1 个面板'), '单阶段渲染保持可用');
  const retired = report('--storyboard', 'old.json', '--cast', join(sample, 'characters/收书人-cast.json'), '--out', join(temp, 'retired.html'));
  eq(retired.status, 1, '旧参数不再静默忽略');
  ok(retired.stderr.includes('未知选项 --storyboard'), '旧参数明确报错');
  ok(!existsSync(join(temp, 'retired.html')), '旧参数失败不输出半成品');
  const legacy = join(temp, 'legacy');
  mkdirSync(join(legacy, 'storyboard'), { recursive: true });
  writeFileSync(join(legacy, 'storyboard/old-storyboard.json'), '{}');
  eq(report('--from', legacy, '--out', join(temp, 'legacy.html')).status, 1, '自动发现不再读取退役目录');

  // 真正执行 creation 渲染脚本的浏览器端代码；以最小 DOM 替身验证本次接入适配。
  const rendered = run(process.execPath, [join(root, 'skills/novel-creation/scripts/novel-creation.mjs'),
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
  const outlineRendered = run(process.execPath, [join(root, 'skills/novel-outline/scripts/novel-outline.mjs'), 'render', fixture('novel-outline', '-outline.json'), '--html']);
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
  ok(!existsSync(old) && !lstatSync(old, { throwIfNoEntry: false }), '默认安装清理本仓库旧软链');
  eq(readlinkSync(join(skills, 'novel-creation')), join(root, 'skills/novel-creation'), '安装当前视频创作 skill');
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
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`✓ ${passed} 项跨阶段离线自测全部通过`);
