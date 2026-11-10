# 创作产物与指南精简验收

## 结论与范围

- 状态：本地实施与测试完成，未提交、未推送。
- 日期：2026-11-08。
- 依据：[实施计划](skills-创作产物与指南精简实施计划.md)。
- 基线：`d0b4b412fa29815e11125e2bfe480b535d3bdfd7`。
- 环境：macOS、Node v22.20.0。未据此声称其他平台已验证。
- JSON 保存正文与必要引用；创作方法改为各阶段本地 Markdown；可推导的结束坐标不再持久化。

本次验证覆盖结构、迁移、跨阶段接口、离线媒体交接与报告。没有调用图片或视频生成模型，没有重新验证实际成片效果，也没有将结构通过等同内容评审通过。

## 1. 主要交付

### 创作指南与项目要求

- outline、script、creation 各新增 `references/创作指南.md`。
- 合并题材、叙事方式、结构、节奏、正反例、适用例外、评审问题及学习来源。
- 删除三份 `scripts/lib/creative.mjs`、三份 profile-contract，以及 33 组 profile 的描述文件和指南，共 66 个 profile 文件。
- 相关 pass/review 文档中的创作方法并入指南。schema、迁移、模型提示词、媒体交接和分卷技术资料仍独立保留。
- 正式入口不再要求四维选择、版本、摘要、覆盖路径或 apply-profile。
- production 使用 `schemaVersion: 3`，可选 `creativeBrief` 为自然语言，不解释成机器规则。

### outline v3

- 保留故事、分集、重要事件、资产 ID、endingBeatId 和分阶段检查。
- 原创不强制改编说明、人物来源、人物变化弧和观众期待。
- 删除 adaptation.core、story.drive、节点 type、分集 stateChange、preferences、rules/defaults 和 creativeContext。
- 独有信息在迁移预览中提供合并去向；自有正式样例经过语义核对，避免机械拼接重复正文。
- kind/weight/position 按需填写。节点仍按稳定 ID 认领，不重编号。
- suspense 不强制 Q；已经登记的 required 问题仍检查唯一后续回收及明确期限。
- 工具参考预算只提醒，用户明确预算仍可阻断。

### script v3

- 保留场次、动作/台词顺序、人物/场景/道具引用及 beatClaims。
- 删除 endBeat，统一从最后实际 flow 项计算。
- openingBeat 可省略，不把第一拍伪装成已核验开场。
- 项目模式直接读取 outline 的 opening/ending，不在剧本维护逐字副本；独立模式允许自己的计划。
- 估时参数提供统一默认值，不回写 JSON；偏差作为提醒，非法数值仍阻断。
- 删除 seedNote 和策略配置。特殊 delivery 保留，样例中机械重复的 delivery 删除。

### creation、setup、characters、art

- creation 与全部已知上游消费者接入 v3。
- creation 不持久化 opening/ending/endBeat，读取当前上游计划并计算结束位置。
- 保留真实节拍覆盖、模型时长限制、媒体引用身份与顺序。
- setup 改为采集创作说明，不修改视觉正文和外部媒体生成职责。
- characters/art 消费可选字段的新大纲；自身资产输出协议保持。
- 三份 media-plan.mjs 与基线无差异，未恢复内置生成编排。

### 报告

正文优先，交接关系与检查随后。删除选择快照、摘要、覆盖与关闭规则首页。可选内容缺省时不展示空配置表。保留结构状态、提醒、缺少上游及内容评审未执行的区别。

## 2. 迁移安全与集成修复

四个正式迁移入口：setup、outline、script、creation 的 `migrate-v3`。

- 默认预览，不覆盖原输入。
- 语义项必须确认，确认不等于内容评审通过。
- 输出独占创建；既有文件、同路径、符号链接输入和损坏编码不能被静默替换。
- 原文证据与输入字节保留，旧配置和语义待确认项有可查去向。
- outline/script 使用 `.v2-backup` 和 `.review` 旁路文件；creation 使用 `.review`，原输入作为恢复副本。它们不以 `.json` 结束，不进入阶段 JSON 自动发现。
- 旧正式 JSON 若仍在同阶段目录，会形成多候选；文档要求显式指定新文件或由作者整理旧文件，不自动搬动用户项目。

主进程集成检查修复了：

1. setup 迁移原先可接受符号链接输入，现明确拒绝。
2. outline 迁移原先会替换非法 UTF-8 字节，现严格解码并停止写入。
3. script/creation 迁移侧文件可能被根合并器视为正式 JSON，现改为非 JSON 后缀，并增加真实阶段目录迁移后五面板自动发现测试。

这些反例先复现失败，再修复重跑。没有通过取消引用、媒体或损坏输入检查来取得通过。

## 3. 实际测试结果

基线原有 27 个自测入口全部通过，记录在 `.work/simplify-v3/baseline-tests.log`。新实现最终实际运行 **30 个入口，全部退出 0**：

| 范围 | 最终入口数 |
| --- | ---: |
| novel-art | 5 |
| novel-characters | 5 |
| novel-creation | 6 |
| novel-outline | 3 |
| novel-script | 3 |
| novel-setup | 4 |
| 仓库根 scripts | 4 |

最终命令：

```bash
for f in skills/*/scripts/*selftest.mjs scripts/*-selftest.mjs; do
  node "$f" || exit
done
```

根级结果：

| 入口 | 结果 |
| --- | --- |
| `scripts/v3-pipeline-selftest.mjs` | 111 组通过，0 失败；305 次真实 CLI |
| `scripts/self-contained-selftest.mjs` | 26 个独立复制自测入口；41 组通过，0 失败 |
| `scripts/pipeline-selftest.mjs` | 371 项通过 |
| `scripts/report-selftest.mjs` | 116 项通过 |

联合测试保留三份独立原创故事，覆盖 init、seed、validate、渲染和五面板合并，新增迁移到真实阶段目录后的自动发现检查。保留 Q 回收、漏领/错集/重复/重叠坐标、明确预算、模型边界、镜头覆盖和参考图身份反例。

所有当前 MJS 的语法检查、`git diff --check` 通过。独立复制测试同时检查本地 Markdown 链接和不越出 skill 的文档依赖。没有受版本控制的 report/gallery HTML。

详细日志：`.work/simplify-v3/final-tests/`。这是本次临时测试记录，不是产品运行时失败累积功能。

## 4. 样例与浏览器证据

### 样例保持

对基线 21 份 examples JSON 做比较，包括改名的 outline-v3 资产消费样例：

- 集数、稳定人物/场景/道具/事件 ID 保持。
- 原动作与台词正文、事件结果保持；合并 setup 时保留旧正文。
- 原文 evidence 逐字保持。
- creation 镜头 segments、提示词、时长和参考图数组保持。
- 正式样例不含旧 creative/creativeContext/rules/defaults。

证据：`.work/simplify-v3/sample-preservation.json`，以及各阶段迁移回归与样例核对说明。

### 浏览器

使用 ego-browser 检查实际渲染报告：

- outline/script 中英文正文优先，无旧配置区、无空表。
- script 英文 390px 窄屏无页面横向溢出，截图目检通过。
- script 浏览器实际下载 JSON 与输入逐项一致。
- 合并报告可切换到 creation，显示真实缺图占位和相应检查失败，不伪装可投产；交互错误数组为空。
- 分阶段另检查 creation 实际样例的中英文报告、图片 lightbox 与窄屏；characters/art 的中英文报告亦已检查。

主进程证据：`.work/simplify-v3/browser/`。分阶段补充证据位置记录于 `.work/simplify-v3/*-result.md`。浏览器任务与本轮临时 HTTP 服务已关闭，HTML 和截图未进入版本控制。

## 5. 对实施计划的逐项核对

| 计划要求 | 验收依据 |
| --- | --- |
| 不再管理 profile 版本、摘要与覆盖 | 正式入口/目录检索，旧命令拒绝测试 |
| 各阶段一份自包含创作指南 | 三份指南，独立复制与文档链接测试 |
| 唯一自然语言要求 | production v3、双 brief 冲突反例、要求变化不产生身份失败 |
| 原创最小结构和可选分类 | outline/script/creation 本地测试与联合最小结构测试 |
| Q 按需登记但明确承诺仍有效 | 无 Q suspense、漏回收/重复/提前/超期反例 |
| 删除可推导结束坐标 | 追加动作后结束位置变化，旧镜头漏覆盖失败 |
| 正文与必要交接能力保留 | 节点认领、资产、模型和媒体协议回归 |
| 所有消费者接入 | 三个原创完整生产配置的六阶段真实 CLI 联合检查 |
| 显式安全迁移 | 四阶段预览/确认/损坏输入/原件恢复与自动发现测试 |
| 样例和证据不丢失 | 基线比较、迁移回归、样例核对说明 |
| 中英文正文优先，无空配置区 | 渲染回归与浏览器检查 |
| 无第三方 skill 依赖、新付费调用或失败累积功能 | 独立运行、媒体模块无差异、变更范围检查 |

## 6. 验证边界与本地文件

- 未调用真实供应商模型，不评价生成画面、音轨或成片连续性。
- 没有重新执行故事内容评审，报告明确其未执行状态。
- creation 自带 production/art/cast 是阶段消费夹具，不是完整上游生成样例；完整联合检查使用三份原创集成项目，不冒称这些最小夹具通过 setup 全量检查。
- 根目录 `demo-script.json` 是被 Git 忽略的本地早期 v1 文件，不是正式 v2 样例。已检查旧协议，并将审阅候选与旧备注保存在 `.work/simplify-v3/`；原文件已按备份逐字节恢复。没有将 v1 审阅候选宣称为正式 v2 迁移验收，也没有擅自替换用户已有项目。
- 旧数据不能只改版本号继续运行，须按迁移说明处理。
- 没有已知的本次计划内实现或测试失败遗留。提交、推送和用户项目迁移仍需单独授权。
