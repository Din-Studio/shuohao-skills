#!/usr/bin/env node
// lingying — 出图调用的确定性封装：提交 / 轮询 / 落盘 / 续传。
//
// 为什么有这个文件：这条管线里「写提示词」是模型的活，「把提示词提交给网关、
// 等它跑完、把图存下来」是代码的活。判据很简单——**换个模型跑会不会得到不同
// 结果**。会，交给模型；不会，交给代码。以前这段编排以 bash 片段的形式躺在
// references 里，让模型每次重新拼一遍，于是同一个 API 有无数种拼错的方式：
// 提示词里的引号把 --input_data 拆成两半、`node -e` 内层单引号跟外层打架、
// 轮询在整段 JSON 里搜 success 撞上恒为 success 的 message、while 循环没有出口。
// 这些全部不是模型能力问题，是职责放错了层。
//
// 三条硬保证，都在代码里，模型没有机会绕开：
//   1. **参数不经过 shell**——execFile 收数组，提示词里有什么字符都不会崩
//   2. **只读 data.status**——响应里的 "message": "success" 恒为 success，
//      粗糙匹配第一次轮询就假命中；这里读不到 data.status 直接报错，不猜
//   3. **超时是有限的**——单任务到点标记 timeout 继续下一张，不阻断整批；
//      任务多半还在网关那边跑，重跑本命令会接着轮询，不重复提交也不重复花钱
//
// 自包含：本文件按 skill 复制，不跨 skill import。三份副本各自被自己的
// selftest 守着，漂了会红——这比让三份 bash 文档各自漂移安全得多。
//
// 零依赖，Node 18+（用到全局 fetch）。

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const CLI_NAME = 'lingying';

/* 找不到 production.json 时的兜底档位，与 references/sheet.md 写的一致。 */
export const DEFAULT_IMAGE_MODEL = 'nanobanana2';
export const DEFAULT_RESOLUTION = '2K';
export const DEFAULT_ASPECT = '16:9';

/** 道具白底图转透明底的抠图模型（免费档）。 */
export const CUTOUT_MODEL = 'birefnet';

/** 单个任务的总超时。到点不是失败，是「还没好」——见文件头第 3 条。 */
export const DEFAULT_TIMEOUT_MS = 300_000;
/** 同时在网关那边跑的任务数。提交不等待，总耗时约等于最慢的那一张。 */
export const DEFAULT_CONCURRENCY = 4;

/*
 * 轮询退避：固定 3 秒空转会在一张图要两分钟时敲 40 次网关。
 * 前几次密一点（快的图几秒就好），之后拉开，封顶 15 秒。
 */
export const BACKOFF_MS = [3000, 5000, 8000, 12_000, 15_000];
export const backoffAt = (i) => BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)];

/* ------------------------------------------------------------------ */
/* CLI 与凭证                                                          */
/* ------------------------------------------------------------------ */

/** PATH 之外还翻这几个常见落点——装法五花八门，找不到就整步跳过。 */
export const EXTRA_BIN_DIRS = ['./bin', '~/.local/bin', '/opt/homebrew/bin', '/usr/local/bin'];

export function findLingying({ env = process.env, home = homedir(), existsImpl = existsSync } = {}) {
  const paths = (env.PATH ?? '').split(':').filter(Boolean);
  const extra = EXTRA_BIN_DIRS.map((d) => (d.startsWith('~/') ? join(home, d.slice(2)) : d));
  for (const dir of [...paths, ...extra]) {
    const hit = resolve(dir, CLI_NAME);
    if (existsImpl(hit)) return hit;
  }
  return null;
}

/**
 * 提交之前一次性把凭证问题查完——提交到第七张才发现 api_key 过期，
 * 前六张的钱已经花了。needUpload 只有变体参考图和抠图才要。
 */
export function preflight({ bin, home = homedir(), needUpload = false, existsImpl = existsSync, readImpl = readFileSync } = {}) {
  const problems = [];
  if (!bin) {
    problems.push(`PATH 与 ${EXTRA_BIN_DIRS.join(' / ')} 里都没有 ${CLI_NAME}——装上它，或者这一步整个跳过只交提示词`);
    return { status: 'skipped', category: 'base', level: 'error', reason: 'missing-upstream', problems };
  }
  const cfgPath = join(home, '.config', CLI_NAME, 'config.json');
  if (!existsImpl(cfgPath)) {
    problems.push(`没有 ${cfgPath}——${CLI_NAME} 的凭证文件，缺了提交必然 401`);
    return { status: 'skipped', category: 'base', level: 'error', reason: 'missing-upstream', problems };
  }
  let cfg;
  try {
    cfg = JSON.parse(readImpl(cfgPath, 'utf8'));
  } catch (e) {
    problems.push(`${cfgPath} 不是合法 JSON：${msgOf(e)}`);
    return { status: 'skipped', category: 'base', level: 'error', reason: 'missing-upstream', problems };
  }
  if (!cfg?.api_key) problems.push(`${cfgPath} 里没有 api_key`);
  if (needUpload && !cfg?.assethub_admin_token) {
    problems.push(`${cfgPath} 里没有 assethub_admin_token——挂参考图与抠图要上传，没有这个传不上去`);
  }
  return { status: problems.length ? 'skipped' : 'pass', category: 'base', level: 'error', ...(problems.length ? { reason: 'missing-upstream' } : {}), problems };
}

/* ------------------------------------------------------------------ */
/* 进程调用                                                            */
/* ------------------------------------------------------------------ */

/**
 * 默认执行器：**execFile 收参数数组，不经过 shell**。
 * 提示词里的引号、换行、中文原样进程间传递，没有任何一层需要转义——
 * 「参数解析错误」这一整类故障是在这一行被消灭的。
 */
export async function defaultExec(bin, args, { timeoutMs = 120_000 } = {}) {
  const { stdout } = await execFileAsync(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const msgOf = (e) => (e instanceof Error ? e.message : String(e));
const head = (s, n = 240) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * 从响应里按路径取值，取不到就抛——**不猜、不兜底**。
 * 静默把缺失的 status 当成「还没好」，会让一个坏掉的任务一直轮询到超时。
 */
export function pickData(stdout, path, what) {
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(`${what}：响应不是 JSON —— ${head(stdout)}`);
  }
  let cur = json;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') {
      throw new Error(`${what}：响应里没有 ${path.join('.')} —— ${head(stdout)}`);
    }
    cur = cur[k];
  }
  if (cur == null || cur === '') throw new Error(`${what}：${path.join('.')} 是空的 —— ${head(stdout)}`);
  return cur;
}

/** 失败任务尽量把网关给的原因带出来，带不出来就把整段 data 摆上。 */
function failDetail(stdout) {
  try {
    const d = JSON.parse(stdout)?.data ?? {};
    return head(d.error ?? d.fail_reason ?? d.message ?? JSON.stringify(d));
  } catch {
    return head(stdout);
  }
}

/* ------------------------------------------------------------------ */
/* 提交 / 轮询 / 落盘                                                   */
/* ------------------------------------------------------------------ */

/**
 * 提交一个生成任务。inputData 是**对象**，这里 JSON.stringify——
 * 手拼字符串是上一版最常炸的地方，接口收对象就没得炸。
 */
export async function submitTask({ bin, model, inputData, exec = defaultExec }) {
  const out = await exec(bin, ['image', 'create', '--model', String(model), '--json', '--input_data', JSON.stringify(inputData)]);
  return String(pickData(out, ['data', 'task_id'], '提交任务'));
}

/**
 * 轮询到终态。返回 success / failed / timeout 三选一，**绝不抛超时**——
 * 一张图卡住不该让整批停下。
 */
export async function pollTask({
  bin, taskId, exec = defaultExec, sleep = defaultSleep, now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS, onTick = () => {}, maxTransientErrors = 2,
}) {
  const started = now();
  let tick = 0;
  let transient = 0;
  for (;;) {
    let out = null;
    try {
      out = await exec(bin, ['task', 'get', taskId, '--json']);
      transient = 0;
    } catch (e) {
      // 网络抖动容错：连着几次拿不到才算真失败，一次超时就判死太脆
      transient += 1;
      if (transient > maxTransientErrors) {
        return { status: 'failed', taskId, detail: `task get 连续 ${transient} 次失败：${msgOf(e)}` };
      }
    }
    if (out !== null) {
      // 只认 data.status。响应里的 message 恒为 success，搜整段必假命中
      const status = String(pickData(out, ['data', 'status'], '轮询'));
      if (status === 'success') {
        return { status: 'success', taskId, url: String(pickData(out, ['data', 'result', 'url'], '取结果 URL')) };
      }
      if (status === 'failed') return { status: 'failed', taskId, detail: failDetail(out) };
      onTick({ taskId, status, waitedMs: now() - started, tick });
    }
    if (now() - started >= timeoutMs) {
      const sec = Math.round((now() - started) / 1000);
      return {
        status: 'timeout',
        taskId,
        detail: `等了 ${sec} 秒仍未完成——任务多半还在跑，重跑本命令会接着轮询这个 task_id，不重复提交`,
      };
    }
    await sleep(backoffAt(tick));
    tick += 1;
  }
}

/**
 * 落盘。**先写 .part 再改名**——断点续传靠「产物存在」判断，
 * 半截文件被当成已完成，下次重跑就永远跳过那张坏图。
 */
export async function downloadTo(url, dest, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('下载到 0 字节');
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  writeFileSync(part, buf);
  renameSync(part, dest);
  return buf.length;
}

/** 上传本地图拿 URL——生成接口只收 URL，不收本地路径。 */
export async function uploadAsset({ bin, filePath, exec = defaultExec }) {
  const out = await exec(bin, ['upload', filePath]);
  const text = String(out).trim();
  try {
    const j = JSON.parse(text);
    const url = j?.data?.url ?? j?.url ?? j?.data?.asset_url;
    if (url) return String(url);
  } catch {
    /* 不是 JSON 就当纯 URL——两种输出都见过 */
  }
  if (/^https?:\/\//.test(text)) return text;
  throw new Error(`upload 没给出 URL —— ${head(text)}`);
}

/* ------------------------------------------------------------------ */
/* 任务台账（断点续传）                                                  */
/* ------------------------------------------------------------------ */
/*
 * 超时不等于失败。提交成功就把 task_id 落到台账，中断后重跑接着轮询已提交的
 * 那些，不重复提交也不重复花钱。落盘成功的条目就从台账里消掉——产物本身
 * 才是完成的凭据，台账只管「提交了但还没拿到图」这个中间态。
 */

export const LEDGER_FILE = '.tasks.json';

export function loadLedger(dir, { readImpl = readFileSync, existsImpl = existsSync } = {}) {
  const p = join(dir, LEDGER_FILE);
  if (!existsImpl(p)) return {};
  try {
    const j = JSON.parse(readImpl(p, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {}; // 台账坏了不该阻断出图，大不了重新提交
  }
}

export function saveLedger(dir, ledger, { writeImpl = writeFileSync } = {}) {
  mkdirSync(dir, { recursive: true });
  writeImpl(join(dir, LEDGER_FILE), `${JSON.stringify(ledger, null, 2)}\n`);
}

/* ------------------------------------------------------------------ */
/* 批次编排                                                            */
/* ------------------------------------------------------------------ */

/** 并发限流：提交不等待，但也别一口气把几十个任务砸过去。 */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** 已经有图了就跳过——非空文件才算数，半截的 .part 不会被误认。 */
function alreadyDone(dest, { statImpl = statSync, existsImpl = existsSync } = {}) {
  if (!existsImpl(dest)) return false;
  try {
    return statImpl(dest).size > 0;
  } catch {
    return false;
  }
}

/**
 * 跑一批出图任务。
 *
 * jobs: [{ key, kind, name, file, prompt, negativePrompt, refFrom }]
 *   file    相对 outDir 的产物路径（render 按这个路径找图，两边必须一致）
 *   refFrom 变体场景的母场景 key——母图落盘后 upload 成 URL 当参考图。
 *           这个「先母后子」的分波次编排以前靠模型记着，现在写死在这里。
 *
 * 返回 { results, summary }：results 每条带 status，summary 是给汇报用的计数。
 */
export async function runBatch(jobs, {
  bin, model, inputBase = {}, outDir, ledgerDir = null,
  exec = defaultExec, sleep = defaultSleep, now = Date.now, fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS, concurrency = DEFAULT_CONCURRENCY,
  force = false, dryRun = false, log = () => {},
} = {}) {
  const results = new Map();
  const record = (job, status, extra = {}) => {
    results.set(job.key, { key: job.key, kind: job.kind, name: job.name, file: job.file, status, ...extra });
  };

  if (dryRun) {
    for (const job of jobs) {
      // 变体的参考图要等母图出来才有 URL，dry-run 阶段只把这个事实标出来
      record(job, 'dry-run', {
        model,
        inputData: buildInput(job, inputBase, null),
        ...(job.refFrom ? { detail: `出图时会先把「${job.refFrom}」的成图 upload 成 URL 挂进 images 当参考图` } : {}),
      });
    }
    return finish(results, jobs);
  }

  // 台账跟产物住同一格：跑完可以删的东西集中在 images/，段目录根只住交付物
  const ledgerAt = ledgerDir ?? outDir;
  const ledger = loadLedger(ledgerAt);
  const pending = [];
  for (const job of jobs) {
    const dest = resolve(outDir, job.file);
    if (!force && alreadyDone(dest)) {
      record(job, 'skipped', { detail: '已有产物，跳过（--force 覆盖）' });
      continue;
    }
    pending.push(job);
  }

  // 分波次：母场景先出，变体拿母图当参考图。同一波内部并发，波与波之间有序
  const waves = [pending.filter((j) => !j.refFrom), pending.filter((j) => j.refFrom)];
  const refUrls = new Map(); // 母图 URL 存下来整批复用，upload 按内容去重也省一次传输

  for (const wave of waves) {
    if (!wave.length) continue;

    /* --- 提交（并发，不等待） --- */
    const submitted = [];
    await mapLimit(wave, concurrency, async (job) => {
      let refUrl = null;
      if (job.refFrom) {
        const parent = results.get(job.refFrom);
        const parentFile = parent?.file ?? jobs.find((j) => j.key === job.refFrom)?.file;
        const parentPath = parentFile ? resolve(outDir, parentFile) : null;
        if (!parentPath || !alreadyDone(parentPath)) {
          record(job, 'failed', { detail: `变体的母场景 ${job.refFrom} 没有成图，参考图挂不上——先把母场景出出来` });
          return;
        }
        try {
          if (!refUrls.has(job.refFrom)) refUrls.set(job.refFrom, await uploadAsset({ bin, filePath: parentPath, exec }));
          refUrl = refUrls.get(job.refFrom);
        } catch (e) {
          record(job, 'failed', { detail: `母场景 ${job.refFrom} 上传失败：${msgOf(e)}` });
          return;
        }
      }

      const reuse = ledger[job.key]?.taskId;
      if (reuse) {
        // 上次提交过但没拿到图：接着轮询它，不重复提交
        log(`↻ ${job.name}：接着轮询上次的任务 ${reuse}`);
        submitted.push({ job, taskId: reuse });
        return;
      }
      try {
        const taskId = await submitTask({ bin, model, inputData: buildInput(job, inputBase, refUrl), exec });
        ledger[job.key] = { taskId, model, file: job.file, submittedAt: now() };
        saveLedger(ledgerAt, ledger); // 提交一个存一个——中断在哪都能续
        log(`→ ${job.name}：已提交 ${taskId}`);
        submitted.push({ job, taskId });
      } catch (e) {
        const m = msgOf(e);
        const hint = /input.?validation|invalid/i.test(m)
          ? `——档位或比例多半不在 ${model} 的枚举里，跑 novel-setup caps --model ${model} 对一眼`
          : '';
        record(job, 'failed', { detail: `提交失败：${m}${hint}` });
      }
    });

    /* --- 统一轮询 + 落盘 --- */
    await mapLimit(submitted, Math.max(concurrency, 4), async ({ job, taskId }) => {
      const r = await pollTask({
        bin, taskId, exec, sleep, now, timeoutMs,
        onTick: ({ status, waitedMs }) => log(`  · ${job.name}：${status}（已等 ${Math.round(waitedMs / 1000)} 秒）`),
      });
      if (r.status !== 'success') {
        // timeout 的 task_id 留在台账里，重跑接着轮询；failed 的清掉，重跑会重新提交
        if (r.status === 'failed') delete ledger[job.key];
        saveLedger(ledgerAt, ledger);
        record(job, r.status, { taskId, detail: r.detail });
        return;
      }
      try {
        const bytes = await downloadTo(r.url, resolve(outDir, job.file), { fetchImpl });
        delete ledger[job.key]; // 图落地了，台账里这条的使命就结束了
        saveLedger(ledgerAt, ledger);
        record(job, 'ok', { taskId, bytes, url: r.url });
        log(`✓ ${job.name} → ${job.file}（${Math.round(bytes / 1024)} KB）`);
      } catch (e) {
        record(job, 'failed', { taskId, detail: `落盘失败：${msgOf(e)}`, url: r.url });
      }
    });
  }

  return finish(results, jobs);
}

/** 提示词与参考图拼进 input_data。**永远是对象**，序列化交给 submitTask。 */
export function buildInput(job, inputBase = {}, refUrl = null) {
  const input = { ...inputBase, prompt: job.prompt };
  // negative_prompt 是独立字段，绝不塞回正向提示词
  if (job.negativePrompt) input.negative_prompt = job.negativePrompt;
  if (refUrl) input.images = [refUrl];
  return input;
}

function finish(results, jobs) {
  const ordered = jobs.map((j) => results.get(j.key)).filter(Boolean);
  const count = (s) => ordered.filter((r) => r.status === s).length;
  return {
    results: ordered,
    summary: {
      total: ordered.length,
      ok: count('ok'),
      skipped: count('skipped'),
      failed: count('failed'),
      timeout: count('timeout'),
      dryRun: count('dry-run'),
    },
  };
}

/**
 * 道具白底图转透明底：白底出图之后再走一次抠图任务，比让生图模型直接
 * 出透明底稳。抠完另存文件名——render 找的仍然是 <slug>-sheet.png。
 */
export async function cutout(files, {
  bin, outDir, exec = defaultExec, sleep = defaultSleep, now = Date.now, fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS, concurrency = DEFAULT_CONCURRENCY, force = false, log = () => {},
} = {}) {
  const out = [];
  await mapLimit(files, concurrency, async (f) => {
    const src = resolve(outDir, f.file);
    const dest = resolve(outDir, f.cutoutFile);
    if (!alreadyDone(src)) {
      out.push({ key: f.key, name: f.name, status: 'skipped', detail: '白底图还没出，抠图跳过' });
      return;
    }
    if (!force && alreadyDone(dest)) {
      out.push({ key: f.key, name: f.name, status: 'skipped', detail: '已有抠图产物' });
      return;
    }
    try {
      const url = await uploadAsset({ bin, filePath: src, exec });
      const taskId = await submitTask({ bin, model: CUTOUT_MODEL, inputData: { images: [url] }, exec });
      const r = await pollTask({ bin, taskId, exec, sleep, now, timeoutMs });
      if (r.status !== 'success') {
        out.push({ key: f.key, name: f.name, status: r.status, taskId, detail: r.detail });
        return;
      }
      const bytes = await downloadTo(r.url, dest, { fetchImpl });
      log(`✓ ${f.name} 抠图 → ${f.cutoutFile}`);
      out.push({ key: f.key, name: f.name, status: 'ok', taskId, bytes, file: f.cutoutFile });
    } catch (e) {
      out.push({ key: f.key, name: f.name, status: 'failed', detail: msgOf(e) });
    }
  });
  return out;
}
