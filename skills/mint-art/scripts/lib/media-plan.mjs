// Offline handoff only. No credentials, network calls, task state or external runtime.
import { statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function mediaPlan(jobs, { kind, model, inputBase = {}, outDir, only = null }) {
  if (!['image', 'video'].includes(kind) || !model) throw new Error('交接计划需要类型与显式模型');
  const byId = new Map();
  const outputs = new Set();
  for (const job of jobs) {
    if (!job.key || byId.has(job.key)) throw new Error('交接任务 ID 缺失或重复');
    if (!job.prompt?.trim() || !job.file) throw new Error(`${job.key} 缺少提示词或产物路径`);
    const output = resolve(outDir, job.file);
    if (outputs.has(output)) throw new Error('交接任务产物路径重复');
    outputs.add(output);
    byId.set(job.key, job);
  }
  const selected = only === null ? [...byId.keys()] : only.split(',').map(s => s.trim()).filter(Boolean);
  if (!selected.length) throw new Error('交接计划没有选中任务');
  const ordered = [], visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    const job = byId.get(id);
    if (!job) throw new Error(`任务或参考依赖不存在：${id}`);
    if (visiting.has(id)) throw new Error(`参考依赖形成循环：${id}`);
    visiting.add(id);
    if (job.refFrom) visit(job.refFrom);
    visiting.delete(id); visited.add(id); ordered.push(job);
  }
  selected.forEach(visit);
  return {
    schemaVersion: 1, status: 'planned', kind, skill: `ly-${kind}`, model,
    note: '离线交接材料，不是 generate 请求。先读取已安装 skill，发现实时 schema；按字段绑定 references，审核 params 并构造 request JSON。未提交、未生成。',
    jobs: ordered.map(job => {
      const references = (job.images ?? []).map(ref => {
        const path = resolve(outDir, ref.path);
        const stat = statSync(path);
        if (!stat.isFile() || !stat.size) throw new Error(`参考素材不是非空文件：${path}`);
        return { ...ref, path };
      });
      if (job.refFrom) references.push({ path: resolve(outDir, byId.get(job.refFrom).file), fromJob: job.refFrom });
      return {
        id: job.key, prompt: job.prompt,
        ...(job.inputDigest ? { inputDigest: job.inputDigest } : {}),
        params: { ...inputBase, ...(job.negativePrompt ? { negative_prompt: job.negativePrompt } : {}),
          ...(job.duration !== undefined ? { duration: job.duration } : {}) },
        references, dependsOn: job.refFrom ? [job.refFrom] : [],
        output: resolve(outDir, job.file),
        ...(job.cutoutFile ? { optionalCutoutOutput: resolve(outDir, job.cutoutFile) } : {}),
      };
    }),
  };
}

export function checkPlanFlags(args) {
  const retired = ['--force', '--cutout', '--timeout', '--concurrency'];
  const flag = args.find(arg => retired.some(f => arg === f || arg.startsWith(f + '=')));
  if (flag) throw new Error(`${flag} 已移除：本命令只导出计划。生成、抠图和任务恢复请交给 ly-image / ly-video；不要自动重新提交。`);
  for (const name of ['--out', '--only', '--style-ref', '--images']) {
    const i = args.indexOf(name);
    if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith('--') || args.indexOf(name, i + 1) >= 0))
      throw new Error(`${name} 需要唯一参数值`);
  }
}

export function printPlan(plan, path) {
  const json = JSON.stringify(plan, null, 2);
  // Exclusive creation protects existing requests, receipts and source documents.
  if (path) writeFileSync(resolve(path), json + '\n', { flag: 'wx' });
  console.log(json);
}
