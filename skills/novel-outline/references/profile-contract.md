# 创作策略契约

## 职责与安全边界

本 skill 的策略只读取本地 `references/profiles/`。运行时不读取兄弟 skill，不执行策略代码，不加载远程资源。新增受支持能力内的 profile 只需增加本地目录，不修改代码或主流程。

目录推荐 `<dimension>/<id>/<version>/profile.json` 与 `guide.md`；narrativeStyle 的目录写作 narrative-style。扫描递归且按文件名排序，不通过目录顺序决定优先级。相同 dimension/id/version 重复出现即失败。描述文件内身份为匹配依据；目录名称不作为隐式别名。所有策略目录、文件和指南均拒绝符号链接（包括指向内部的链接），拒绝特殊文件。references/profiles 也不能通过链接逃逸。guide 限 profile 目录内相对 Markdown 路径，拒绝绝对路径、反斜线、空路径段、点路径段和父目录路径段。实际消费的指南文件必须存在且正文非空；描述文件与实际消费的指南须为合法 UTF-8，非法字节序列直接拒绝。

扫描与完整加载分为两步：

1. 安全扫描遍历全部目录项，拒绝符号链接、目录逃逸与非常规文件。解析全部 `profile.json`，仅检查可建立索引的 dimension/id/version 身份及其唯一性。损坏 JSON、非法身份和重复身份仍然阻断，不能因未选择而绕过。此步不读取指南，不校验规则、schema 版本或额外字段，不计算摘要。
2. 应用、查看所选组合与历史来源核验，只对实际选中的本阶段必需身份完整加载。此时严格校验 schema 版本、stage、字段、规则、默认值和指南，计算摘要。未知版本、字段或规则不能在实际消费时静默忽略。creation 的 structure 只参与安全身份索引，不读取其指南，不消费规则，不生成摘要。

显式升级时，未选旧版本的未知规则、未知 schema 版本、额外字段或缺失指南不阻断新版本。旧来源无法完整核验时，仍须逐项决定已有有效参数，不自动沿用旧覆盖。安全扫描失败不能通过升级解除。

## 选择与描述文件

完整 selection 恰好包含 genre、narrativeStyle、structure、pacing。每项恰好为 `{id,version}`。id 为小写字母开头的小写字母、数字与连字符标识；version 是精确语义版本，允许合法预发布和构建标识，不允许 latest、范围、v 前缀或浮动别名。

production.creative 为可选 `{version:1,selection}`，不包含规则和指南副本。缺失不会自动选择密集兑现；null 或损坏对象不是缺失。独立模式通过明确 selection 应用，不能宣称项目已对账。

profile.json 的必需字段只有 profileSchemaVersion（1）、dimension、id、version、stage、guide、rules；唯一可选字段为 defaults。未知顶层字段、规则、级别和参数全部失败。rules 可以为空，但 guide 必须提供适用目标、表达方法、应避免的做法、正反例、内容评审问题与来源说明。规则为空的真实指导不是占位。

## 阶段矩阵

| 阶段 | 必须加载 | 仅记录 | 不适用 |
| --- | --- | --- | --- |
| outline | 全部四维 | 无 | 无 |
| script | 全部四维 | 无 | 无 |
| creation | genre、narrativeStyle、pacing | structure | 无 |
| setup | 无 | 全部四维 | 无 |
| characters / art | 无 | genre、narrativeStyle 背景 | structure、pacing |

本模块仅接受 outline/script/creation，不替 characters/art 建立策略应用流程。creation 保留完整选择快照，但不加载 structure，也不伪造其摘要。每个 skill 仅安装本阶段实际需要的描述文件与指南。

## 规则与生成默认值

每个规则关闭对象必须恰好为 `{level:"off"}`。启用时 level 为 warn/error，必须提供该规则全部参数，拒绝未知字段。不允许把规则内部字段从多份 profile 拼接。正整数必须是有限数值，不接受字符串、零、负数和小数。有限正数同样不能为 NaN 或 Infinity。

| 阶段 | 键名 | 启用参数 |
| --- | --- | --- |
| outline | payoffCoverage | minPerEpisode：正整数 |
| outline | firstMajor | byEpisode：正整数 |
| outline | majorGap | maxGap：正整数 |
| outline | endingPayoff、arcPayoff | minWeight：minor/major |
| outline | endingModes | nonFinal、final：非空无重复的 suspense/closure/open 数组 |
| outline | optionalQuestions | allow：布尔值 |
| outline | stateProgress、arcCoverage | 无额外参数 |
| script | openingWindow | maxBeats：正整数 |
| script | lineLength | maxChars：正整数 |
| creation | cutDuration | minSeconds、maxSeconds：有限正数，前者不得大于后者 |

全部规则写入 `params.rules.<key>`。应用后保存本阶段全部注册项，未声明项为 off，不留下阈值。outline 另须保存 `params.defaults.questionResolveWithin`：正整数或 null，不带 level。其他阶段不支持生成默认值键。它只用于新建、未明确期限的 required 问题；optional、既有问题和明确期限不自动修改。实际 dueByEp 为提出集加默认值与总集数的较小值；最终集不可能履行的承诺由基础校验拒绝。本模块只应用参数，不重写故事问题。

validateParams 仅检查策略参数，不负责技术或估时参数。它拒绝缺少注册项、未知项、off 的多余阈值与旧字段：outline 的 maxBeatGap/pacing，script 的 hookWindow/maxLineChars，creation 的 minCutSeconds/maxCutSeconds。旧字段只允许在显式迁移中读取，不进行运行时双读；应用从中性配置重建并删除这些已停用字段，不将旧阈值自动换算为新规则。

## 组合、完整覆盖与决策预览

不同键直接组合，同键同值接受，同键不同值形成冲突。比较时忽略对象字段顺序，endingModes 的两个模式数组按集合比较；重复元素先判为非法。每个完整规则对象或完整默认值为最小覆盖单位。

覆盖文件是路径到完整值的对象，例如：

```json
{"params.rules.cutDuration":{"level":"warn","minSeconds":4,"maxSeconds":12}}
```

不接受内部字段路径、未知键、目标时长、资产预算、模型能力或其他技术路径。不存在按加载先后静默覆盖。未解决冲突可预览，但不能确认写入；候选文档对应冲突路径保持中性值，不能当作已生效产物。

每次应用（包括同组合重用）都从所有规则 off、默认值 null 重建。非策略参数与故事数据保持不变。changes 列出每个路径的 current、currentMissing、template、value、changed、previousOverride、manualDifference、decisionRequired、decision。旧覆盖必须逐项选择；未记录的手工差异同样进入 decisionsRequired。旧模板不可核验时，保守地要求对所有已有策略值逐项决定，不能推断哪些值来自手工编辑。

决策文件路径值为 keep/drop：keep 读取当前有效完整值并记录覆盖路径；drop 放弃旧差异，采用新组合。overrides 表示重新填写完整值。不能在同一路径同时填写决策和新值。drop 不能消除新组合本身的冲突；冲突仍须明确完整覆盖。旧覆盖不自动沿用。取消就是不传 --confirm，不写文件、不备份、不更新摘要。

## 原子应用与后续检查

applyToFile 先读取和预览，只有 confirm=true、conflicts 与 decisionsRequired 均为空才能写入。原始文件必须为非符号链接常规文件。写入前保留逐字节备份 `<file>.backup-<timestamp>-<random>`，在同目录排他创建临时文件，完成写入和 fsync 后通过 rename 整体替换；保留原文件权限。写入失败清理临时文件，原产物与来源记录保持不变；已创建的备份可保留供恢复。写入前复核原始字节，发现并发变化即拒绝。该机制保证文件整体替换，不宣称跨文件事务或断电后整个目录持久性。

应用不会自动重写故事，不执行内容评审，不把新参数写入 production。项目模式先更新 production 的选择，再逐阶段应用。成功后消费者必须重新检查本阶段和已知下游，并报告失效项。本模块不 import 消费者，以免循环依赖。CLI 成功写入后明确提醒仍未执行这些检查。

## 来源摘要与漂移

creativeContext 恰好包含 selection、references、overridePaths。selection 保存完整四维快照；references 恰好包含本阶段必需维度，每项恰好为 `{dimension,id,version,stage,sha256}`，与快照匹配。overridePaths 是无重复的完整规则/默认值路径数组，只保存路径，覆盖值仍取当前 params。摘要不跨阶段比较。

SHA-256 输入固定为 UTF-8 编码的 `JSON.stringify(["shuohao-profile-v1", descriptorRawUTF8, guideRawUTF8])`，顺序为域标记、描述文件原始 UTF-8 文本、指南原始 UTF-8 文本。不标准化换行、空白或 JSON 键顺序。摘要必须为 string 类型的64位小写十六进制。数组（包括单元素与嵌套数组）和其他非字符串值属于 base/error/fail，不降为来源漂移提醒。绝对路径不进入摘要，拷贝目录不改变身份；任一文件字节变化会改变摘要。对象语义相等可避免组合冲突，但不豁免同版本来源变化。

历史 validate/render 只检查已有参数，不重算、不写回。来源缺失或损坏为 source/warn/fail，reason=source-unverifiable；同版本摘要变化为 source/warn/fail，reason=source-drift。提醒不是结构通过项，也不阻断已有结构检查。继续创作前须核验来源；显式应用会拒绝继续使用任何已记录且本次仍选用的漂移身份，即使确认覆盖也不能接受同版本新摘要。恢复原始文件可继续；创建新版本并更新选择后允许升级，不要求恢复旧文件。取消和失败不更新摘要。

生产选择与快照不一致为 base/error/fail，表示待同步。没有 production 为 skipped/missing-upstream；production 没有 creative 为 skipped/stage-incomplete；已经提供却损坏的 production 失败，不冒充缺失。

## API 与命令

三个 skill 各自包含相同 API 的物理独立模块，使用 Node 标准库；不建立仓库共享运行库。函数同步返回，调用方也可以 await。

- RULE_KEYS：按阶段列出注册规则。
- neutralParams(stage)：完整中性规则和 outline 默认值。
- validateSelection(selection)、validateCreative(creative)、validateParams(stage,params)：返回错误字符串数组。
- discoverProfiles(skillRoot,stage)：显式查看本阶段完整目录，完整加载全部适用维度的已安装版本；不加载 creation 的 structure。数组每项含描述身份、rules/defaults、guide 正文、guidePath、profilePath、sha256。因为调用者请求整个目录，其中适用版本的契约错误仍会报错。选择应用与历史核验不调用此完整目录接口，而在安全身份索引后仅加载所选必需版本。
- resolveProfiles(skillRoot,stage,selection,options={})：返回 references/rules/defaults/guides；options.overrides 可完整解决冲突；未解决则抛错。guides 为含 dimension/id/version/stage/path/text 的数组。
- previewApplication(doc,{skillRoot,stage,selection,overrides={},decisions={}})：返回 document/changes/conflicts/decisionsRequired；decisionsRequired 为路径字符串数组，conflicts 为含 path/values 的数组。候选 document 不是已写入状态。decisions 为兼容扩展的可选参数。
- applyToFile(file,{skillRoot,stage,selection,overrides={},decisions={},confirm=false})：预览结果加 applied/backup，错误抛出；未确认时 applied=false、backup=null。
- inspectContext(doc,{skillRoot,stage,production})：返回检查对象数组，字段为 id/category/level/status/reason?/message，不含 ok。无文件写入。
- handleCreativeCommand(argv,{skillRoot,stage})：匹配命令返回 true，其他命令返回 false；解析或应用错误抛出，由 CLI 以非零状态退出。

命令由各阶段消费者入口调用：

```text
profiles
profile --selection selection.json
profile --production production.json
apply-profile DOC --selection selection.json [--overrides overrides.json] [--decisions decisions.json] [--confirm]
apply-profile DOC --production production.json [--overrides overrides.json] [--decisions decisions.json] [--confirm]
```

selection.json 内容直接为四维选择，不是 creative 包装。--production 与 --selection 必须二选一。所有提供的 JSON 文件严格读取，损坏或不可读就失败。未知参数、重复参数、多余位置参数拒绝。

## 检查语义与验证边界

基础失败与 error 策略失败阻断；warn 未满足记录 fail，但界面显示提醒、不计通过、不阻断；off 为 skipped/policy-disabled。其他跳过原因使用 missing-upstream、stage-incomplete、not-applicable，不能混淆。

本模块实现规则形状与应用，不实现故事、台词或镜头的实际策略计算。消费者按当前 params 执行规则；基础引用、位置、明确承诺、上游目标时长与模型限制不可关闭。无条件旧硬门须由消费者删除。内容评审与联合检查的执行状态单独报告。

## 本地测试

执行 `node scripts/profile-selftest.mjs`。测试使用本 skill 的 references、自有样例及隔离临时夹具。除模块测试外，启动真实 `novel-<stage>.mjs`，覆盖 profile、apply-profile、validate 和 render；验证旧版本损坏后的显式升级、仅记录维度、数组摘要基础失败及应用后消费者检查。独立复制本 skill 的 scripts、references 与 examples 后再次执行全套测试。不读取兄弟样例，不生成真实图片或视频，不调用付费模型。实际内容计算、基础契约与渲染回归由消费者自测和联合测试负责。

## 来源说明

本契约依据仓库本轮策略解耦方案第5、7、13.3节及冻结接口实现，并内化为可独立携带的说明。运行时不依赖方案文件、共享临时文件或第三方 skill。策略数值是创作起点，不证明创作质量或市场效果。
