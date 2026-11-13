// 仅为离线结构测试构造五部分文本，不是写作代理或语义审核。
import { CAMERA_REFERENCE, FIXED_ENDING } from './lib/prompt.mjs';
export function promptFixture(body, images = []) {
  const names = images.map((x,i) => typeof x === 'string' ? x : `测试对象${i+1}`);
  const refs = names.map((n,i) => `${n}@图片${i+1}：仅供文件与顺序检查。`).join('\n') || '无';
  return `${CAMERA_REFERENCE}\n光源：室内顶灯从上方照射，柔光，4000 K\n环境：室内持续有空气流动\n色调：低饱和灰色，重点物件保留原色\n质感：平稳细腻的整体成像\n风格参照：写实取向，材质自然\n氛围：平静\n\n参考素材：${refs}\n\n${names.map((n,i)=>`${n}@图片${i+1}在场。`).join('')}${body}\n\n写实画风，整体材质自然。${FIXED_ENDING}\n\n负面提示词：\n人物身份互换，物件穿模，错人说话`;
}
