# 外部媒体生成交接

本地 CLI 只负责创作、校验与离线交接计划，不读取凭据、不上传、不提交、不轮询。人物角色整理完成后，agent 立即接续外部工具生成参考图；用户明确仅登记、仅提示词或暂不生图时除外。沿用已有生成授权，不重复确认。整个目录可独立拷走；缺少工具、必要参数或授权时交付文本、计划与报告，明确阻断项及“未生成”，不能把离线计划当成生图完成。

实际生成使用 [Din-Studio/skills](https://github.com/Din-Studio/skills) 的 `ly-image` / `ly-video`。它们独立安装，不复制到本 skill，也不是本地脚本的代码依赖。交接格式依据该仓库 9e3cebed82d1af08d9dfc6125010250295eca39b 的请求与恢复约定整理；实际调用前读取安装版本的 SKILL.md 和 references/commands.md。

## 安装与凭据

```bash
npx skills@latest add Din-Studio/skills --agent codex --skill ly-image ly-video -g -y
```

安装器把资源放到用户级 `~/.agents/skills/`，pi 也能发现该目录；其他 agent 按安装器选项选择目标。安装后重新加载技能或启动新会话。

外部 skill 要求 Node.js 22.20+，不要求安装 `ly` CLI。可复用已有 `~/.config/ly/config.json`；也支持执行环境中的 `LY_API_KEY` / `LY_ACCESS_TOKEN` 或 `LY_CONFIG_FILE`。不要打印配置、把密钥写进仓库、请求文件、回执或命令参数。

## 从计划到生成

1. 本地 `images` / `videos` 输出 `status: planned`。默认和 `--dry-run` 都不访问网络。`--out plan.json` 另存计划，不覆盖现有文件；不用该选项则只有 stdout。
2. 计划包含明确模型、每项 `id`、原文 `prompt`、原生类型 `params`、有序 `references`、`dependsOn`、目标 `output`。路径均为本机绝对路径；移动项目后重新导出。计划不是外部 skill 的请求 JSON，不可直接传给 `generate`。
3. 读取已安装的目标 skill；从其真实安装目录定位 `scripts/image.mjs` 或 `scripts/video.mjs`。执行 `models` 和 `models --model <明确ID>`，核对当前 input_schema、限制和价格。不静默换模型，不把本地能力快照当成实时承诺。
4. 按依赖顺序处理任务。先检查是否已有与当前输入匹配的产物或外部回执；已有文件不证明输入一致。依赖图必须核验完成并放到对应 output 后，才生成引用它的任务。不能把计划中的待生成路径当成已存在图片。
5. 为每项单独写 UTF-8 请求，仅含 `model`、`prompt`、`params`、`inputs`。保持提示词与素材顺序；按实时 schema 将每个 reference 绑定为 `{"field":"实际字段","path":"绝对路径"}`。不要猜测模型一定接受 images、反向词或音频；参数不兼容时报告并修正方案，不静默丢弃约束。路径不能塞进 params 冒充已上传 URL。
6. 运行外部 `generate --request request.json --dry-run`。该预览会访问模型发现，但不上传、不提交。说明模型、数量、视频总秒数与实时费用预估；只有用户已授权生成的范围才能继续，纯提示词或预览请求不等于付费授权。
7. 使用新回执路径 `generate --request request.json --job jobs/<id>.json` 提交一次。使用 `task --job jobs/<id>.json --wait 60 --download --output-dir downloads/<id>` 恢复查询和下载。退出码零不代表完成；检查 `ok` 和 `data.status`。
8. 检查返回文件存在、非空和真实媒体格式；图片按下文「视觉审核」逐项看图，视频核对时长、运动、画幅和音轨。外部脚本下载名不等于计划 output，检查后复制或转换到 output；不能把 JPEG 直接改扩展名当 PNG。目标已存在时先核对身份，替换须保留旧产物并确认范围。再运行本 skill 的 render，并汇报实际文件与任务 ID。

## 内容复核与视觉审核

`validate` 和 `images` 通过只说明结构完整：实际发送正文有一段非空、未与同类重复的主体描述，技术段齐全，纯净段收尾。**不说明描述正确**，也不说明图片画对了。下面两项由执行 agent 完成，本地脚本不调用模型、不自动批准。

**提交生成之前：内容复核。** 编写正文之后另行发起一次审核调用（同一模型也可以），或由人工完成；编写时的自评、结构检查通过都不算复核。按 [sheet-prompt.md](sheet-prompt.md) 第五节的清单，把最终请求的主体区和人物画像、`sourceRefs` 对照（`render` 报告里「设定图正文（实际发送）」与人物画像分开展示，可以直接对照）。结论为需返修或待确认时不提交；返修后重新执行 validate 和复核。

**下载之后：视觉审核。**

1. 拿实际成图逐项对照身份锁、服装、体型和版式；不能只根据文件存在、生成回执或请求文字判断合格。两个角色画成同一张脸、服装颜色与身份锁不符，都在这里发现。不一致就返修正文或重新生成；重新生成仍须遵守上面的授权规则。
2. **基准角色通过视觉审核之后，才能用 `--style-ref` 挂成其他角色的风格参考图。** 风格参考只借画风，审核挂了参考的角色时，确认没有带上基准角色的脸和体型。
3. 没有看图能力时，交付「已生成、待审核」的材料并明确说明，不当作可投产图片交给下游，也不提供给挂它当参考的任务。

不新增审核记录文件、失败日志或重试统计。

## 恢复

- 生成、上传、下载和任务回执完全归外部 skill，本地不维护任务台账。
- 超时、网络错误或下载失败只恢复原任务。`submitting` / `submission_unknown` 且缺 task ID 时先核对网关记录。不要删除回执或换文件名绕过状态不确定。
- 本地命令不接受 `--force`、`--cutout`、`--timeout`、`--concurrency`，提供即报错。透明底另交 ly-image 选择实时可用编辑模型，审核费用后生成到 `optionalCutoutOutput`；保留白底主图。
- 新生成或质量重做是另一项可能计费的任务。不得因轮询超时、效果不满意或自动驾驶而无限重投；没有明确授权就先汇报。
