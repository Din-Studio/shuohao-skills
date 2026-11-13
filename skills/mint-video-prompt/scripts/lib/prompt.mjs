// 五部分视频提示词的离线格式检查。各 skill 自带副本，不读取兄弟 skill。
export const CAMERA_REFERENCE = '镜头参考：自由切分镜头，根据剧情需要自运镜（建议多使用子弹时间，升格，环绕运镜，荷兰角，移焦，摇臂升降，云台悬浮，穿越推进，侧跟，格莱美运镜，破窗转场，时间切片 ），禁止单个分镜超过3秒，禁止镜头固定，禁止对白正反打硬切。';
export const FIXED_ENDING = '无任何字幕、水印、logo 与额外图形符号；无配乐、无背景音乐，保留正文中的对白、原生环境音效与人物动作交互音效。环境反应和音效根据画面内容自行卡点。';
export const GLOBAL_FIELDS = ['镜头参考','光源','环境','色调','质感','风格参照','氛围'];
export const TIMECODE_RE = /\b(?:at|after|before)\s+(?:the\s+)?(?:second|sec)\s+\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?|(?:第\s*)?\d+(?:\.\d+)?\s*(?:[-–—~～至到]\s*\d+(?:\.\d+)?\s*)?(?:秒|[- ]?(?:seconds?|secs?)\b|s\b)/i;

export function parsePrompt(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  const blocks = text.split(/\n\s*\n/);
  // 七栏为第一块；素材、正文可以有多个自然段。固定结尾和负面区界定正文。
  const reference = text.indexOf('\n\n参考素材：');
  const negative = text.lastIndexOf('\n\n负面提示词：\n');
  const ending = text.indexOf(FIXED_ENDING);
  const endingStart = ending < 0 ? -1 : text.lastIndexOf('\n\n', ending);
  const middle = reference < 0 || endingStart < reference ? '' : text.slice(reference + 2, endingStart);
  const bodyStart = middle.indexOf('\n\n');
  return { text, globals: blocks[0] ?? '', references: bodyStart < 0 ? middle : middle.slice(0, bodyStart),
    body: bodyStart < 0 ? '' : middle.slice(bodyStart + 2).trim(),
    ending: endingStart < 0 || negative < 0 ? '' : text.slice(endingStart + 2, negative).trim(),
    negative: negative < 0 ? '' : text.slice(negative + '\n\n负面提示词：\n'.length).trim(), reference, negativeStart:negative };
}

/** 固定镜头策略不是事件时间轴。只豁免首行完整匹配，不删除正文内的任何数字。 */
export function promptTimecode(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  const rest = text.startsWith(CAMERA_REFERENCE + '\n') ? text.slice(CAMERA_REFERENCE.length + 1) : text;
  return rest.match(TIMECODE_RE)?.[0] ?? null;
}

export function promptProblems(value, images = []) {
  const p = parsePrompt(value), problems = [];
  if (!p.text) return ['提示词正文为空'];
  const lines = p.globals.split('\n');
  if (lines[0] !== CAMERA_REFERENCE) problems.push('镜头参考必须逐字保留固定内容');
  if (lines.length !== GLOBAL_FIELDS.length || GLOBAL_FIELDS.some((f,i) => !lines[i]?.startsWith(f + '：') || !lines[i].slice(f.length + 1).trim())) problems.push('全局七栏必须完整并按镜头参考、光源、环境、色调、质感、风格参照、氛围排列');
  if (!/\d+(?:\.\d+)?\s*K\b/i.test(lines[1] ?? '')) problems.push('光源必须包含以 K 标注的具体色温');
  if (p.reference < 0 || !p.references.slice('参考素材：'.length).trim()) problems.push('缺少参考素材部分；没有匹配素材时明确写无');
  if (!p.body) problems.push('缺少散文正文；参考素材后以空行分隔正文');
  if (!p.ending.endsWith(FIXED_ENDING) || !p.ending.slice(0, -FIXED_ENDING.length).trim()) problems.push('结尾必须先写画风句，再逐字保留固定声音与画面说明');
  if (!p.negative || /\n/.test(p.negative)) problems.push('负面提示词必须另起一段，下一行以逗号分隔错误项');
  if (/\[(?:Shot|镜头)\s*\d+\]|^\s*(?:shots:|ambience:|镜头描述：|环境声与配乐：)/im.test(p.text)) problems.push('正文采用散文，不使用逐镜编号或 shots/ambience 骨架');
  if (/\[(?:本段|角色全称|该角色|年龄|全剧角色|本段应|散文|画风句)[^\]\n]*\]/.test(p.text) || /<提示词正文>/.test(p.text)) problems.push('提示词不能保留模板占位符');
  const refs = [...p.text.matchAll(/@(图片|音频|视频)(\d+)/g)];
  for (const [,kind,n] of refs) if (kind !== '图片' || Number(n) < 1 || Number(n) > images.length) problems.push(`未提供可提交的素材引用 @${kind}${n}；本工具只挂载 images 中的图片`);
  for (let i=1;i<=images.length;i++) {
    const re = new RegExp(`@图片${i}(?!\\d)`);
    if (!re.test(p.references)) problems.push(`参考素材缺少 @图片${i}；清单内使用单换行，清单后的首个空行开始正文`);
    if (!re.test(p.body)) problems.push(`正文缺少 @图片${i}；素材列表不能代替正文引用`);
  }
  return [...new Set(problems)];
}
