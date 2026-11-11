#!/usr/bin/env node
// novel-video-prompt-review — 视频提示词审核方的确定性工具：登记审核结论。
// 只有 Node 18+ 标准库依赖。不读取任何其他 skill，不调用模型。
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorksheet, serializeWorksheet, reviewItems, hashOf, REVIEW_PLACEHOLDER, RESPONSE_PLACEHOLDER, MUST_FIX, SUGGEST } from './lib/worksheet.mjs';

export const VERDICTS = ['approved', 'changes_requested'];
const CONCLUSION_RE = /^结论[：:]\s*\S/m;
const EVIDENCE_RE = /镜头\s*\d+|Shot\s*\d+|整段|参考图|声景|图\s*\d+|Picture\s*\d+/i;

/**
 * 登记结论。审核方只写审核区与状态：分镜结构与提示词正文原样保留。
 * approved 绑定当前内容的摘要，此后任何改动都让批准失效。
 */
export function recordVerdict(sheet, verdict) {
  const problems = [...sheet.problems];
  if (!VERDICTS.includes(verdict)) problems.push(`结论必须为 ${VERDICTS.join(' 或 ')}`);
  if (problems.length) return { problems };
  if (sheet.meta.status !== 'in_review') problems.push(`只能审核 in_review 的工作单，当前为 ${sheet.meta.status}——由编写方提交后再审核`);
  if (!sheet.review || sheet.review === REVIEW_PLACEHOLDER) problems.push('「审核意见（仅本轮）」还没有填写');
  else {
    if (!CONCLUSION_RE.test(sheet.review)) problems.push('审核意见需要一行「结论：……」，概括本轮判断与依据');
    const { must, suggest } = reviewItems(sheet.review);
    if (verdict === 'approved' && must.length) problems.push(`仍有 ${must.length} 条 ${MUST_FIX}，不能批准`);
    if (verdict === 'changes_requested' && !must.length) problems.push(`要求修改时至少写一条「- ${MUST_FIX} ……」；只有「- ${SUGGEST}」不构成退回理由`);
    for (const line of [...must, ...suggest]) if (!EVIDENCE_RE.test(line)) problems.push(`意见需要指明镜号或位置（镜头 k／整段／参考图／声景）：${line}`);
  }
  if (!sheet.body) problems.push('提示词正文为空，无法审核');
  if (problems.length) return { problems };
  const meta = { ...sheet.meta, status: verdict, bodyHash: verdict === 'approved' ? hashOf(sheet.structure, sheet.body) : '' };
  // 新一轮意见写出后，上一轮的编写回应已经完成使命
  return { problems, text: serializeWorksheet({ ...sheet, meta, response: verdict === 'changes_requested' ? RESPONSE_PLACEHOLDER : sheet.response }) };
}

const USAGE = `novel-video-prompt-review.mjs — 视频提示词审核方的确定性工具

  verdict <approved|changes_requested> <prompt.md>...
                    登记审核结论。先在工作单的「审核意见（仅本轮）」写好意见，再运行本命令。
                    approved 要求没有 [必须修改]；changes_requested 要求至少一条 [必须修改]。
  show <prompt.md>... 打印状态、轮次与批准是否仍然有效

本工具只改写状态头与审核区，不改分镜结构和提示词正文。`;

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(USAGE); process.exit(cmd ? 0 : 1); }
  if (cmd === 'show') {
    if (!rest.length) throw new Error('用法：show <prompt.md>...');
    for (const path of rest) {
      const s = parseWorksheet(readFileSync(resolve(path), 'utf8'));
      const valid = s.meta.status !== 'approved' ? '' : s.meta.bodyHash === hashOf(s.structure, s.body) ? '；批准有效' : '；批准已失效（批准后内容被修改）';
      console.log(`${path}：${s.meta.status ?? '?'}，第 ${s.meta.round} 轮${valid}${s.problems.length ? `；格式问题：${s.problems.join('；')}` : ''}`);
    }
    return;
  }
  if (cmd === 'verdict') {
    const [verdict, ...paths] = rest;
    if (!verdict || !paths.length) throw new Error('用法：verdict <approved|changes_requested> <prompt.md>...');
    const results = paths.map(path => ({ path, ...recordVerdict(parseWorksheet(readFileSync(resolve(path), 'utf8')), verdict) }));
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
