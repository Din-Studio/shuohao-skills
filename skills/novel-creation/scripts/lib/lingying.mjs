#!/usr/bin/env node
// lingying — 视频下单调用的确定性封装：提交 / 轮询 / 落盘 / 续传。
//
// 起点是 novel-art / novel-characters 的 scripts/lib/lingying.mjs（出图那份）：
// findLingying / preflight / defaultExec / pickData / submitTask / pollTask /
// downloadTo / uploadAsset / loadLedger / saveLedger / mapLimit 原样复用——这些
// 函数与「生成图像还是生成视频」无关。三条硬保证同样原样继承：
//   1. 参数不经过 shell——execFile 收数组
//   2. 只读 data.status——响应里的 "message": "success" 恒为 success，不猜
//   3. 超时是有限的——单任务到点标记 timeout 继续下一个，重跑接着轮询同一个 task_id
//
// 与出图那份的两处不同，都是因为「视频任务之间没有互相依赖」：
//   - runBatch 去掉了图像那份的「母子波次」（refFrom 链）：视频生成不会拿另一段
//     视频的成片当参考图，参考图在提交前已经全部是现成的设定图文件，一次性
//     并发提交即可；参考图改成整批先去重上传，不分波次
//   - buildInput 从「最多一张 refUrl」改成「一组 refUrls 塞进 images 数组」
//
// 自包含：本文件按 skill 复制，不跨 skill import。
//
// 零依赖，Node 18+（用到全局 fetch）。

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const CLI_NAME = 'lingying';

/** 单个任务的总超时。视频生成比出图慢一个量级——实测 MiniMax H3 · managed
 *  5 秒片用了 196 秒，这里留足余量，不是拍脑袋（见 references/video-order.md）。 */
export const DEFAULT_TIMEOUT_MS = 900_000;
/** 同时在网关那边跑的任务数。提交不等待，总耗时约等于最慢的那一段。 */
export const DEFAULT_CONCURRENCY = 4;

/*
 * 轮询退避：视频一段大约三分钟起，用出图那边 3 秒起步的节奏去敲网关纯属浪费。
 * 起步 10 秒，逐步拉开，封顶 30 秒。
 */
export const BACKOFF_MS = [10_000, 15_000, 20_000, 30_000];
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
 * 提交之前一次性把凭证问题查完——提交到最后一段才发现 api_key 过期，
 * 前面几段的钱已经花了。参考图一定要上传，所以 assethub token 恒为必需
 * （与出图那份不同：那边的 needUpload 是可选的，这里没有可选的余地）。
 */
export function preflight({ bin, home = homedir(), existsImpl = existsSync, readImpl = readFileSync } = {}) {
  const problems = [];
  if (!bin) {
    problems.push(`PATH 与 ${EXTRA_BIN_DIRS.join(' / ')} 里都没有 ${CLI_NAME}——装上它，或者这一步整个跳过只交投产包`);
    return { ok: false, problems };
  }
  const cfgPath = join(home, '.config', CLI_NAME, 'config.json');
  if (!existsImpl(cfgPath)) {
    problems.push(`没有 ${cfgPath}——${CLI_NAME} 的凭证文件，缺了提交必然 401`);
    return { ok: false, problems };
  }
  let cfg;
  try {
    cfg = JSON.parse(readImpl(cfgPath, 'utf8'));
  } catch (e) {
    problems.push(`${cfgPath} 不是合法 JSON：${msgOf(e)}`);
    return { ok: false, problems };
  }
  if (!cfg?.api_key) problems.push(`${cfgPath} 里没有 api_key`);
  if (!cfg?.assethub_admin_token) problems.push(`${cfgPath} 里没有 assethub_admin_token——参考图要上传，没有这个传不上去`);
  return { ok: problems.length === 0, problems };
}

/* ------------------------------------------------------------------ */
/* 进程调用                                                            */
/* ------------------------------------------------------------------ */

/**
 * 默认执行器：**execFile 收参数数组，不经过 shell**。
 * 提示词里的引号、换行、中文原样进程间传递，没有任何一层需要转义。
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
  const out = await exec(bin, ['video', 'create', '--model', String(model), '--json', '--input_data', JSON.stringify(inputData)]);
  return String(pickData(out, ['data', 'task_id'], '提交任务'));
}

/**
 * 轮询到终态。返回 success / failed / timeout 三选一，**绝不抛超时**——
 * 一段视频卡住不该让整批停下。
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
 * 半截文件被当成已完成，下次重跑就永远跳过那一段。
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

export const LEDGER_FILE = '.tasks.json';

export function loadLedger(dir, { readImpl = readFileSync, existsImpl = existsSync } = {}) {
  const p = join(dir, LEDGER_FILE);
  if (!existsImpl(p)) return {};
  try {
    const j = JSON.parse(readImpl(p, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {}; // 台账坏了不该阻断下单，大不了重新提交
  }
}

export function saveLedger(dir, ledger, { writeImpl = writeFileSync } = {}) {
  mkdirSync(dir, { recursive: true });
  writeImpl(join(dir, LEDGER_FILE), `${JSON.stringify(ledger, null, 2)}\n`);
}

/* ------------------------------------------------------------------ */
/* 批次编排                                                            */
/* ------------------------------------------------------------------ */

/** 并发限流：提交不等待，但也别一口气把几十段砸过去。 */
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

/** 已经有视频了就跳过——非空文件才算数，半截的 .part 不会被误认。 */
function alreadyDone(dest, { statImpl = statSync, existsImpl = existsSync } = {}) {
  if (!existsImpl(dest)) return false;
  try {
    return statImpl(dest).size > 0;
  } catch {
    return false;
  }
}

/**
 * 跑一批下单任务。
 *
 * jobs: [{ key, name, file, prompt, duration, images: [{ path }] }]
 *   file    相对 outDir 的产物路径（<段号>/video.mp4）
 *   images  这一段挂载的本地参考图相对路径，顺序就是 Picture 序
 *
 * 与出图那份 runBatch 的核心区别：**没有母子波次**——视频任务之间没有互相
 * 依赖，参考图在提交前已经全部是现成文件，这里只做一件事：把整批任务用到的
 * 全部参考图先去重上传拿到一张「本地路径 → URL」的表（同一张设定图被十几段
 * 共用，只传一次），再一次性并发提交全部任务，统一轮询、统一落盘。
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
    results.set(job.key, { key: job.key, name: job.name, file: job.file, status, ...extra });
  };

  if (dryRun) {
    for (const job of jobs) {
      record(job, 'dry-run', {
        model,
        inputData: buildInput(job, inputBase, (job.images ?? []).map((i) => i.path)),
        ...((job.images ?? []).length
          ? { detail: `下单时会先把 ${job.images.length} 张参考图 upload 换成 URL（这里显示的是本地路径占位）` }
          : {}),
      });
    }
    return finish(results, jobs);
  }

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

  /* --- 参考图整批去重上传（不分波次，视频任务之间没有互相依赖） --- */
  const localPaths = [...new Set(pending.flatMap((j) => (j.images ?? []).map((i) => i.path)))];
  const urlOf = new Map(); // 本地路径 → URL，跨整批任务共用
  const uploadFailed = new Map(); // 本地路径 → 失败原因
  if (localPaths.length) {
    await mapLimit(localPaths, concurrency, async (p) => {
      try {
        urlOf.set(p, await uploadAsset({ bin, filePath: resolve(outDir, p), exec }));
      } catch (e) {
        uploadFailed.set(p, msgOf(e));
      }
    });
  }

  /* --- 提交（并发，不等待） --- */
  const submitted = [];
  await mapLimit(pending, concurrency, async (job) => {
    const badRef = (job.images ?? []).find((i) => uploadFailed.has(i.path));
    if (badRef) {
      record(job, 'failed', { detail: `参考图 ${badRef.path} 上传失败：${uploadFailed.get(badRef.path)}` });
      return;
    }
    const reuse = ledger[job.key]?.taskId;
    if (reuse) {
      // 上次提交过但没拿到视频：接着轮询它，不重复提交
      log(`↻ ${job.name}：接着轮询上次的任务 ${reuse}`);
      submitted.push({ job, taskId: reuse });
      return;
    }
    const urls = (job.images ?? []).map((i) => urlOf.get(i.path));
    try {
      const taskId = await submitTask({ bin, model, inputData: buildInput(job, inputBase, urls), exec });
      ledger[job.key] = { taskId, model, file: job.file, submittedAt: now() };
      saveLedger(ledgerAt, ledger); // 提交一个存一个——中断在哪都能续
      log(`→ ${job.name}：已提交 ${taskId}`);
      submitted.push({ job, taskId });
    } catch (e) {
      const m = msgOf(e);
      const hint = /input.?validation|invalid/i.test(m)
        ? `——档位、比例或时长多半不在 ${model} 的枚举/区间里，跑 novel-setup caps --model ${model} 对一眼`
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
      delete ledger[job.key]; // 视频落地了，台账里这条的使命就结束了
      saveLedger(ledgerAt, ledger);
      record(job, 'ok', { taskId, bytes, url: r.url });
      log(`✓ ${job.name} → ${job.file}（${Math.round(bytes / 1024)} KB）`);
    } catch (e) {
      record(job, 'failed', { taskId, detail: `落盘失败：${msgOf(e)}`, url: r.url });
    }
  });

  return finish(results, jobs);
}

/** 提示词、时长与参考图 URL 拼进 input_data。**永远是对象**，序列化交给 submitTask。 */
export function buildInput(job, inputBase = {}, refUrls = []) {
  const input = { ...inputBase, prompt: job.prompt };
  if (job.duration != null) input.duration = job.duration;
  const urls = (refUrls ?? []).filter(Boolean);
  if (urls.length) input.images = urls;
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
