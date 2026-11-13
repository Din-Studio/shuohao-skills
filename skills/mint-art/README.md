**中文** · [English](README.en.md)

# mint-art

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

独立从原剧本识别地点与物品，维护稳定美术身份，按任务需要完成设计。**登记身份不要求出图。**

正式版本：**art v1**（`kind: mint-art`）；可选故事输入 **outline v5**；人物身份输入 **cast v1**（`kind: mint-characters`）；视觉参数 **production v3**。其他版本一律报错，详见 [接口与生命周期](references/lifecycle.md)。

## 入口

```bash
node scripts/mint-art.mjs seed --source 原剧本.txt --title 剧名 --out draft.json
node scripts/mint-art.mjs seed --source 原剧本.txt --title 剧名 --existing previous-art.json --out next.json
node scripts/mint-art.mjs seed --design --title 原创空间 --out design.json
node scripts/mint-art.mjs register draft.json --kind scene --key permanent-key --name 地点名称 --out registered.json
```

seed 只计算原件摘要与行数，资产数组和已读范围为空。模型或人工阅读原件后，填写事实、引用、资产取舍、负责范围及身份确认。场次不等于地点；物件被提及、交接或损坏不自动建立新资产。outline 不再提供资产身份。人物身份由 characters 判断。

`identity-inputs FILE` 打印复核输入摘要，不自动确认；身份可以保持 `designStatus: none`。

## 核验与交付

```bash
node scripts/mint-art.mjs validate art.json --outline outline.json --cast cast.json
node scripts/mint-art.mjs checkup art.json
node scripts/mint-art.mjs verify-sources art.json
node scripts/mint-art.mjs reconcile candidate.json --previous previous-art.json --out next.json
node scripts/mint-art.mjs render art.json --md > art-report.md
node scripts/mint-art.mjs render art.json --html > art-report.html
node scripts/mint-art.mjs images art.json --production production.json --only S01 --out plan.json
```

- CLI 核验、渲染和图片计划都校验实际原件、文档身份、SHA256、物理行数、引用与范围。缺失或改版失败，不伪装 skipped。
- 缺少可选 outline/cast/production 时相应对账 skipped。已经提供的损坏、版本错误或不匹配输入失败。
- 增量读取既有 registry；重排不改 S/P ID。合并、拆分、纠正、删除必须追加显式映射和依据；退休 ID 永不复用。
- `budgets` 在本产物保存。明确预算超额阻断；参考值仅提醒。增量变更明确预算需要保存原值和用户依据。
- `designStatus: none` 不要求设计字段；planned/ready 执行锚点、场景空景、英文提示词、光照状态与色温、道具状态、尺寸参照、白底、版式与纯净画质段等检查。只有 ready 进入图片计划。
- 场景设定图是左侧前后左右四宫格加右侧正交平面图；道具设定图是正面、最容易认错的一面、匿名手或人作尺寸参照三格。道具 `states` 第二个起各出一张以基准图为参考的变体图。写法见 [设定图出图](references/sheet.md)、[设定图提示词](references/sheet-prompt.md)。
- 写场景、道具设定前先读 [全局原则](references/principles.md) 和 [术语](references/glossary.md)；有题材信息时查 `references/genres/`。
- 图片计划只离线导出，未提交、未生成。production 画风唯一来自 `style.scene`；不依赖任何外部生成 skill 才能完成本阶段交付。
- JSON 是唯一编辑源。报告保留输入导出值。报告 HTML 不进入版本控制。技术检查不等于内容或媒体审核。

完整流程固定为 **outline → characters → art → script → creation**。项目级调用方负责顺序与交接；单独运行不证明上游完成，也不声称跨阶段映射已通过。正文局部标记与 S/P ID 字符相同不构成映射，联合映射权威在 script.assetMappings；见 [接口与生命周期](references/lifecycle.md)。

## 自有样例

先阅读 [故事提案](examples/雨棚留言-故事提案.md)。再阅读 `examples/雨棚留言-原剧本.txt`：

- 四个场次标题只识别为两个地点；雨棚清空不新增地点身份。
- 旧留言板转交不新增道具身份；口头提及雨伞不建立道具。
- `雨棚留言-识别-art.json` 只登记两个地点、两件物品，无设计、无图片。
- `雨棚留言-art.json` 保留独立原创设计样例，包括雨棚视觉变体；它不是从剧本自动提取的已审结论。
- `雨棚留言-outline.json` 仅为本阶段消费测试的故事投影，不冒充全功能 outline 校验样例。
- 人物夹具属于本 skill，不从其他目录读取。所有图片均未实际生成。

```bash
node scripts/mint-art.mjs validate examples/雨棚留言-识别-art.json --outline examples/雨棚留言-outline.json --cast examples/雨棚留言-cast-names.json --no-production
node scripts/mint-art.mjs validate examples/雨棚留言-art.json --production examples/雨棚留言-production.json --cast examples/雨棚留言-cast-names.json
node scripts/mint-art.mjs render examples/雨棚留言-识别-art.json --cast examples/雨棚留言-cast-names.json --html
node scripts/run-selftests.mjs
```

Node 18+、标准库、无需安装依赖。当前实际测试环境以运行报告为准。详细工作流见 [SKILL.md](SKILL.md)，契约见 [schema](references/schema.md)。
