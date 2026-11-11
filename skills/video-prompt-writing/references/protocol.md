# Markdown 交接协议

每段一份 prompt.md，正文是唯一人工提示词编辑源；宿主 creation JSON 保持结构数据及工具同步的兼容镜像。只允许当前角色编辑获授权区域。文件必须包含唯一且有序的下列区域：

```markdown
# E01-01 · 视频提示词
<!-- review-meta:start -->
{"version":1,"revision":1,"status":"draft","reviewedRevision":null,"approvedInput":null}
<!-- review-meta:end -->

## 提示词正文
<!-- prompt:start -->
实际提示词
<!-- prompt:end -->

## 编写说明
当前修改与逐条回应。

## 当前审核
当前结论、审核范围、证据、阻断意见与建议。
```

编写者提交 pending_review，审核者决定 approved / changes_requested / blocked。编写者不能批准，审核者不能改正文。宿主提供 review CLI 时使用主 session 给出的绝对脚本路径：

```bash
node <host-cli> review <manifest.json> --segment E01-01 --status pending_review
node <host-cli> review <manifest.json> --segment E01-01 --status changes_requested --reviewer prompt-reviewer --opinion <本轮意见文件>
```

approved 与 blocked 使用同一命令格式。只有审核角色执行结论命令。宿主工具将意见写入同一 Markdown，并绑定当前输入；不要手写 approvedInput。元数据里的 reviewer 不是认证机制，真正角色分离依赖主 session 与运行环境权限。没有宿主工具时可交付本格式的 draft 文档及审核意见，但不得声称取得机器验证的投产批准。

正文、上游、模型参数或参考图改变会使旧批准失效。修改之后重新提交，再由独立审核者审核。只维护当前意见和本轮回应，不增加累计评分或门失败日志。

主 session 串行执行循环，默认整批批准后生成。遇到上游冲突、缺图、反复分歧或预算不足时暂停协调，不为了结束循环自动批准。内容批准不授权付费生成。
