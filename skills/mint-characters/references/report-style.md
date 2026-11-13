# cast-report 的设计约定

报告由 `scripts/mint-characters.mjs render cast.json --md|--html` 生成，实现在 `lib/identity.mjs` 的 `renderIdentity()`。输入只能是 cast v1。身份可以没有任何设计块，不能为了渲染而伪造空画像或音色。

## 它是什么

制作使用的角色身份册。读者要据此核对身份、来源和审核状态，再拿设计块去出图或配音。页面的工作：**先让人确认这是谁、依据在哪，再给出可复制的设计。**

## 内容顺序

1. 顶栏：标题、`cast v1 · 范围 · 语义审核状态`、「结构与来源核验不等于内容审核，联合对账 skipped」的声明、角色预算与用量、待重新核验的身份（`lifecycle.recheckIds`）。
2. 每个身份一节，以 `[C ID] 名称` 为标题：来源身份（identityKey、tier、aliases、entityType、presence、speech、unknowns、sourceRefs、notes），随后按需展示人物画像、图片提示词、音色提示词。设计块标注「制作设计／含制作补定」，不冒充来源事实。
3. 末尾：来源与生命周期（provenance、lifecycle、budgets 与预算检查结果）。

重核身份在顶栏明确列出，不能把旧图显示等同为旧图审核仍有效。

## 图片

只从 `images/<C ID>-sheet.png` 自动发现，存在才显示；路径只进入显示，不写入导出 JSON。未提供图片不影响身份报告。

## 语言

界面支持中文，其他语言码回退英文标签。`--lang` 只覆盖界面，不改变 `cast.lang` 的设计语言校验。

## 规矩

- **自包含**：样式内联，不加载任何外部脚本、字体或图片，报告要能离线双击打开。
- **导出 JSON**：数据以 `<script type="application/json" id="cast-data">` 内嵌一份，内容就是 `cast.json` 本身的形状，`<` 转义为 `<`，防止 `</script` 截断数据块。导出使用 Blob 下载，`URL.revokeObjectURL` 延后调用，避免 Safari 存下空文件。
- **转义**：所有动态值经 `esc()` 转义后再拼进 HTML。
- **复制按钮**：每个字段分组都有复制按钮。
- **打印**：隐藏导航与按钮，展开全部已展示的字段，条目不跨页断开。
- **可访问性**：窄屏塌成单栏；键盘焦点可见；`prefers-reduced-motion` 关闭平滑滚动。

## 检查状态

来源、语义审核和联合交接状态分别显示，skipped 不计为通过。报告不附加统计或失败累计信息。
