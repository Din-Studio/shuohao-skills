#!/usr/bin/env node
// mint-video-prompt-review — 视频提示词审核方的确定性工具：登记审核结论。
// 只有 Node 18+ 标准库依赖。不读取任何其他 skill，不调用模型。
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorksheet, recordVerdict, approvalProblem, inputProblem, VERDICTS } from './lib/worksheet.mjs';

export { recordVerdict, VERDICTS };

const USAGE = `mint-video-prompt-review.mjs — 视频提示词审核方的确定性工具

  verdict approved --inputs <输入材料.json> <prompt.md>...
  verdict changes_requested <prompt.md>...
  verdict blocked <prompt.md>...
                    登记审核结论。先在工作单的「审核意见（仅本轮）」写好意见，再运行本命令。
                    通过 → approved（需 --inputs）；需返修 → changes_requested；待确认 → blocked。
                    审核意见采用固定标题、审核结论、返修意见、待确认事项。
  show [--inputs <输入材料.json>] <prompt.md>...
                    打印状态、轮次与批准是否仍然有效；给出输入材料时一并核对输入绑定

本工具只改写状态头与审核区，不改分镜结构和提示词正文。`;

/** 取出 --inputs 的值，其余参数原样返回。 */
function takeInputs(rest) {
  const i = rest.indexOf('--inputs');
  if (i < 0) return { material: null, args: rest };
  const path = rest[i + 1];
  if (!path || path.startsWith('--')) throw new Error('--inputs 缺少输入材料路径');
  const material = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!material || typeof material !== 'object' || !Array.isArray(material.seedScenes)) throw new Error(`${path} 不是输入材料：缺少 seedScenes`);
  return { material, args: [...rest.slice(0, i), ...rest.slice(i + 2)] };
}

function main(argv) {
  const [cmd, ...raw] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(USAGE); process.exit(cmd ? 0 : 1); }
  const { material, args: rest } = takeInputs(raw);
  if (cmd === 'show') {
    if (!rest.length) throw new Error('用法：show [--inputs <输入材料.json>] <prompt.md>...');
    for (const path of rest) {
      const s = parseWorksheet(readFileSync(resolve(path), 'utf8'));
      const stale = s.meta.status !== 'approved' || s.problems.length ? null : approvalProblem(s) ?? (material ? inputProblem(s, material) : null);
      const valid = s.meta.status !== 'approved' || s.problems.length ? '' : stale ? `；批准已失效（${stale}）` : material ? '；批准有效' : '；批准有效（没有给出输入材料，未核对输入绑定）';
      console.log(`${path}：${s.meta.status ?? '?'}，第 ${s.meta.round} 轮${valid}${s.problems.length ? `；格式问题：${s.problems.join('；')}` : ''}`);
    }
    return;
  }
  if (cmd === 'verdict') {
    const [verdict, ...paths] = rest;
    if (!verdict || !paths.length) throw new Error('用法：verdict <approved|changes_requested|blocked> [--inputs <输入材料.json>] <prompt.md>...');
    if (verdict === 'approved' && !material) throw new Error('批准需要输入材料：verdict approved --inputs <输入材料.json> <prompt.md>...');
    const results = paths.map(path => ({ path, ...recordVerdict(parseWorksheet(readFileSync(resolve(path), 'utf8')), verdict, material) }));
    const failed = results.filter(r => r.problems.length);
    for (const r of failed) console.error(`✗ ${r.path}\n${r.problems.map(x => '  ' + x).join('\n')}`);
    if (failed.length) process.exit(1);
    for (const r of results) { writeFileSync(resolve(r.path), r.text, 'utf8'); console.log(`✓ ${r.path} → ${verdict}`); }
    return;
  }
  throw new Error(`未知命令 ${cmd}\n\n${USAGE}`);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMainModule()) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}
