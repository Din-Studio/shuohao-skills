#!/usr/bin/env node
// 每个 skill 物理拷贝后运行，隔离目录不包含兄弟 skill。零网络与生成调用。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  for (const name of readdirSync(join(root, 'skills')).filter(n => n.startsWith('mint-')).sort()) {
    const source = join(root, 'skills', name);
    const isolated = join(temp, name, 'standalone');
    cpSync(source, isolated, { recursive: true });
    check(`${name} 自测入口存在`, () => assert.ok(existsSync(join(isolated, 'scripts/selftest.mjs'))));
    if (['mint-outline', 'mint-script', 'mint-creation'].includes(name)) check(`${name} 当前契约自包含指南`, () => {
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
  // 分镜由 mint-script 产出、mint-creation 按它分段：两份解析与检查库必须逐字一致
  check('两份分镜解析库一致', () => {
    const read = name => readFileSync(join(root, 'skills', name, 'scripts/lib/storyboard.mjs'), 'utf8');
    assert.equal(read('mint-creation'), read('mint-script'));
  });
  // 工作单是三个 skill 之间唯一的协作格式：解析库各持一份副本，必须逐字一致
  check('三份工作单解析库一致', () => {
    const copies = ['mint-creation', 'mint-video-prompt', 'mint-video-prompt-review'].map(name => readFileSync(join(root, 'skills', name, 'scripts/lib/worksheet.mjs'), 'utf8'));
    assert.equal(copies[1], copies[0]); assert.equal(copies[2], copies[0]);
    assert.equal(readFileSync(join(root, 'skills/mint-video-prompt/references/worksheet.md'), 'utf8'), readFileSync(join(root, 'skills/mint-video-prompt-review/references/worksheet.md'), 'utf8'), '两份工作单格式说明一致');
  });
  check('两份提示词格式检查库与三份写作规则一致', () => {
    const read=(skill,path)=>readFileSync(join(root,'skills',skill,path),'utf8');
    assert.equal(read('mint-creation','scripts/lib/prompt.mjs'),read('mint-video-prompt','scripts/lib/prompt.mjs'));
    assert.equal(read('mint-video-prompt-review','references/creation-prompt.md'),read('mint-creation','references/creation-prompt.md'));
  });
  check('三份显式身份映射消费库一致', () => {
    const copies=['mint-creation','mint-video-prompt','mint-video-prompt-review'].map(name=>readFileSync(join(root,'skills',name,'scripts/lib/asset-mapping.mjs'),'utf8'));
    assert.equal(copies[1],copies[0]);assert.equal(copies[2],copies[0]);
    const refs=['mint-creation','mint-video-prompt','mint-video-prompt-review'].map(name=>readFileSync(join(root,'skills',name,'references/asset-identity-handoff.md'),'utf8'));
    assert.equal(refs[1],refs[0]);assert.equal(refs[2],refs[0]);
  });
  // 调度方可以单独拷走：它保存编写方与审核方指南的副本，必须与两个角色 skill 逐字一致
  check('mint-creation 的指南副本与编写方、审核方一致', () => {
    const ref = (skill, file) => readFileSync(join(root, 'skills', skill, 'references', file), 'utf8');
    for (const file of ['creation-prompt.md', 'h3-prompt.md', 'seedance2-prompt.md', '分镜指南.md', 'worksheet.md']) assert.equal(ref('mint-creation', file), ref('mint-video-prompt', file), file);
    for (const file of ['审核清单.md', 'worksheet.md']) assert.equal(ref('mint-creation', file), ref('mint-video-prompt-review', file), file);
    const dispatch = ref('mint-creation', 'dispatch.md');
    assert.ok(!/\{baseDir\}\/\.\./.test(dispatch + readFileSync(join(root, 'skills/mint-creation/SKILL.md'), 'utf8')), '调度方不按相对位置读取兄弟 skill');
  });
  // 编写方与审核方各自的样例工作单，必须通过调度方的完整结构检查
  check('新 skill 的样例工作单通过 mint-creation 结构检查', () => {
    const cli = join(root, 'skills/mint-creation/scripts/mint-creation.mjs');
    for (const [skill, dir, target] of [['mint-video-prompt', '第七盏灯', 20], ['mint-video-prompt-review', '回执/第一轮', 10], ['mint-video-prompt-review', '回执/第二轮', 14]]) {
      const base = join(root, 'skills', skill, 'examples', dir), work = join(temp, 'bridge', skill, dir.replace('/', '-'), 'creation');
      const inputBase = base.replace(/\/第.轮$/, '');
      const input = JSON.parse(readFileSync(join(inputBase, '输入材料.json'), 'utf8'));
      cpSync(base, work, { recursive: true });
      const provenance = input.provenance ? structuredClone(input.provenance) : undefined;
      for (const [i, doc] of (provenance?.documents ?? []).entries()) {
        const source = resolve(inputBase, doc.path);
        assert.ok(source.startsWith(join(root, 'skills', skill) + '/'), '来源必须属于样例自己的 skill');
        const local = `source-${i + 1}.txt`;
        cpSync(source, join(work, local)); doc.path = local;
      }
      const script = { schemaVersion: 4, source: input.source, ...(input.assetMappings ? {assetMappings:input.assetMappings.map(({mappingErrors,...m})=>m)} : {}), ...(provenance ? {provenance} : {}), episodes: [{ ep: 1, targetSeconds: target, scenes: input.seedScenes.map(sc => ({
        sceneId: sc.sceneId, lighting: sc.lighting, characters: sc.characters, props: sc.props,
        ...(sc.notes ? {notes: sc.notes} : {}), ...(sc.sourceRefs ? {sourceRefs: sc.sourceRefs} : {}),
        // brief seconds on action/line are derived estimates, not editable script fields.
        flow: sc.beats.map(b => ({[b.kind]: b.text, ...(b.kind === 'line' ? {speaker: b.speaker, ...(b.delivery ? {delivery: b.delivery} : {})} : {}), ...(b.audio ? {audio: b.audio} : {}), ...(b.sourceRefs ? {sourceRefs: b.sourceRefs} : {}), ...(b.transformation ? {transformation: b.transformation} : {}), ...(['sound','subtitle'].includes(b.kind) && b.seconds ? {seconds: b.seconds} : {})})) })) }] };
      writeFileSync(join(work, 'script.json'), JSON.stringify(script));
      assert.ok(input.assetMappings?.length, '样例需提供显式映射，不能以同 ID 推定');
      for (const [key, lists] of [['cast', ['characters']], ['art', ['scenes', 'props']]]) {
        const authority={schemaVersion:1,source:input.source,provenance};
        for (const list of lists) authority[list]=input.assets[list].map(a=>structuredClone(a.specification));
        writeFileSync(join(work, key+'.json'),JSON.stringify(authority));
      }
      writeFileSync(join(work, 'c.json'), JSON.stringify({ schemaVersion: 3, source: input.source, promptLang: input.promptLang, video: input.video,
        params: { maxSegmentSeconds: input.maxSegmentSeconds, maxOnScreen: input.maxOnScreen, tolerance: 0.15 }, episodes: [{ ep: 1, segments: [] }] }));
      const checkArgs=[cli, 'prompts', 'check', 'c.json', '--script', 'script.json', '--cast', 'cast.json', '--art', 'art.json', '--no-production'];
      const missing=spawnSync(process.execPath,checkArgs,{cwd:work,encoding:'utf8'});
      assert.notEqual(missing.status,0,'显式挂载的参考图缺失不能因为是样例而 skipped');
      assert.match(missing.stdout+'\n'+missing.stderr,/设定图|reference|image/i);
      // Root-owned one-pixel PNG markers test file/path consumption only. They are
      // not generated reference sheets, semantic evidence, or production approval.
      const marker=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=','base64');
      for(const a of Object.values(input.assets).flat()) {
        const path=resolve(work,a.sheet);
        assert.ok(path.startsWith(temp+'/'),'媒体路径仍在隔离目录中');
        mkdirSync(dirname(path),{recursive:true});writeFileSync(path,marker);
      }
      const run = spawnSync(process.execPath,checkArgs,{cwd:work,encoding:'utf8'});
      assert.equal(run.status, 0, `${skill}/${dir}\n${run.stdout}\n${run.stderr}`);
    }
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`本次实际执行 ${entries} 个独立自测入口；${passed} 组通过，${failures.length} 组失败。`);
if (failures.length) process.exitCode = 1;
