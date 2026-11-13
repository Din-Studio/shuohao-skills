#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaPlan, checkPlanFlags, printPlan } from './lib/media-plan.mjs';

const dir = mkdtempSync(join(tmpdir(), 'media-plan-'));
const job = (key, extra = {}) => ({ key, file: key + '.png', prompt: '中文 "quotes"\n$PATH `echo nope`', ...extra });
const opts = { kind: 'image', model: 'explicit-model', inputBase: { resolution: '2K', aspect_ratio: '16:9' }, outDir: dir };
try {
  const jobs = [job('child', { refFrom: 'parent', negativePrompt: 'no text' }), job('parent', { refFrom: 'anchor' }), job('anchor')];
  const plan = mediaPlan(jobs, { ...opts, only: 'child' });
  assert.equal(plan.status, 'planned'); assert.equal(plan.skill, 'ly-image');
  assert.deepEqual(plan.jobs.map(j => j.id), ['anchor', 'parent', 'child']);
  assert.equal(plan.jobs[2].prompt, jobs[0].prompt);
  assert.equal(plan.jobs[2].params.negative_prompt, 'no text');
  assert.equal(plan.jobs[2].params.resolution, '2K');
  assert.deepEqual(plan.jobs[2].references, [{ path: join(dir, 'parent.png'), fromJob: 'parent' }]);
  assert.deepEqual(plan.jobs[2].dependsOn, ['parent']);
  assert.equal(existsSync(plan.jobs[0].output), false);
  assert.throws(() => mediaPlan(jobs, { ...opts, only: 'missing' }), /不存在/);
  assert.throws(() => mediaPlan(jobs, { ...opts, only: ',' }), /没有选中/);
  assert.throws(() => mediaPlan([job('a', { refFrom: 'b' }), job('b', { refFrom: 'a' })], opts), /循环/);
  assert.throws(() => mediaPlan([job('a'), job('a')], opts), /重复/);
  assert.throws(() => mediaPlan([job('a'), job('b', { file: 'a.png' })], opts), /重复/);
  assert.throws(() => mediaPlan([job('a', { prompt: '' })], opts), /提示词/);
  for (const option of ['--force', '--cutout', '--timeout', '--concurrency', '--force=true'])
    assert.throws(() => checkPlanFlags([option]), /不支持/);
  for (const option of ['--out', '--only', '--style-ref', '--images'])
    assert.throws(() => checkPlanFlags([option, '--dry-run']), /参数值/);
  checkPlanFlags(['--dry-run', '--out', 'plan.json']);
  writeFileSync(join(dir, 'a.png'), 'fixture a');
  writeFileSync(join(dir, 'b.png'), 'fixture b');
  const video = job('clip', { file: 'clip/video.mp4', duration: 7, images: [{ path: 'b.png' }, { path: 'a.png' }] });
  const vp = mediaPlan([video], { ...opts, kind: 'video' });
  assert.equal(vp.skill, 'ly-video'); assert.equal(vp.jobs[0].params.duration, 7);
  assert.deepEqual(vp.jobs[0].references.map(r => r.path), [join(dir, 'b.png'), join(dir, 'a.png')]);
  assert.throws(() => mediaPlan([job('clip', { images: [{ path: 'absent' }] })], opts));
  writeFileSync(join(dir, 'empty.png'), '');
  assert.throws(() => mediaPlan([job('clip', { images: [{ path: 'empty.png' }] })], opts), /非空文件/);
  const output = join(dir, 'plan.json'), log = console.log;
  try { console.log = () => {}; printPlan(plan, output); } finally { console.log = log; }
  assert.deepEqual(JSON.parse(readFileSync(output)), plan);
  assert.throws(() => printPlan(vp, output), /EEXIST/);
  assert.deepEqual(JSON.parse(readFileSync(output)), plan);
  console.log('✓ 离线交接：依赖排序、原文、类型、素材顺序、缺失文件、不支持的生成选项与防覆盖通过');
} finally { rmSync(dir, { recursive: true, force: true }); }
