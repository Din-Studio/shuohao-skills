# 人物真实感

**真实感来自不完美，不是细节量。**

五个层面：不完美的面部与毛发 · 松弛的姿态与眼神 · 有穿着痕迹的服饰 · 不磨皮的原生质感 · 不居中的构图。

## 先想清楚：假从哪来

图像模型学的是修过的照片，它的默认输出是「所有人都刚做完医美、站在环形灯下、正对镜头、笑容标准」。看着假不是因为细节不够，是因为**该有的破绽被抹平了**：毛孔被磨掉、左右脸被拉对称、光被打匀、人被摆到正中。

所以提示词的方向不是「更真实」——`ultra realistic`、`8K`、`masterpiece`、`flawless skin` 这类词只会推模型往「更精修」走，越写越假。**要写的是真实世界里的皮肤、光、镜头具体什么样。**

## 1. 面部与毛发：把破绽写回去

| 部位 | 写进去的东西 | 英文短语 |
| --- | --- | --- |
| 皮肤 | 毛孔、细纹、颧骨轻微泛红、痘印与痣、眼下暗沉、鼻翼与耳缘的细微毛细血管、T 区油光 | `visible pores, natural skin micro-texture, uneven skin tone, faint blemishes, subtle oiliness` |
| 不对称 | 眼型与眉形左右略有高低、嘴角一高一低、笑起来单边法令纹更深 | `slight facial asymmetry, one eyebrow set higher, uneven smile` |
| 毛发 | 碎发、毛躁、发尾分叉、发际线不规整、鬓角边界不齐 | `flyaway hairs breaking the hairline, frizz, split ends` |
| 眼睛 | 湿润高光、虹膜纤维、下睫毛在眼睑的投影 | `moist catchlights, visible iris fibers, lower lash shadow` |

年龄要落到**皱纹的走向**上：法令纹、鱼尾纹、抬头纹顺着表情肌走，不是随机刻上去的线。四十岁的脸有眼袋、松弛的下颌线、色素沉着，写出来比写 `40 years old` 有用得多。

**细节量要跟景别匹配。**特写才写到毛孔级；半身以上写 `natural skin texture` 就够。隔着三米还能数清毛孔的图，看着是处理过的，不是拍出来的。

## 2. 姿态与表情：拒绝摆拍

- **肢体**：避开对称站姿和标准姿势。耸一边肩、歪头、手腕放松、手指微弯、重心压在一条腿上、手随便搭在什么东西上。
- **动作**：写一个**正在进行的日常瞬间**，不要堆静态名词。
  - 坏：`standing, holding a cup, looking at camera`
  - 好：`caught mid-turn, weight on one leg, one hand still on the door frame, cup tilted in the other`
- **表情**：自然半笑、微抿嘴、眉头轻蹙、走神时嘴角松开。真人的表情是零点几秒的肌肉变化，写具体的微表情比写 `smiling` 有效。
- **眼神**：眼睛要有**去处**和**情绪**——看向画外某处、垂着眼、疲惫、防备、走神。`looking at camera` 配上完美对称的脸，就是恐怖谷的标准配方。

## 3. 服饰：衣服要像被穿过

面料褶皱、穿后变形的领口与袖口、线头、轻微磨损与污渍、肘部和膝盖磨出的光泽。

材质要点名：粗棉、亚麻、起球的羊毛、哑光化纤——不要只写 `a shirt`。

```
coarse cotton shirt, collar softened and slightly out of shape, sleeve
hems frayed, fabric weave visible, creases from being worn all day
```

## 4. 质感与光：不磨皮，不打匀

- **皮肤**：保留原生纹理，明确拒绝美颜与过度平滑。
- **光**：避开影棚均匀光和环形灯——脸上一点阴影都没有，是「一眼假」最大的单一来源。自然光优先（窗边光、阴天、黄昏），每次交代四件事：**主光从哪来、什么光质（硬光/漫射）、色温、落在脸的哪些位置**。允许眼窝、下巴下方、颈部有阴影，脸才有体积。
- **镜头**：焦段决定观感——`35mm` 抓拍感、`50mm` 自然、`85mm` 标准人像。再加浅景深、轻微手持模糊、镜头眩光。
- **画质**：轻微颗粒 / 噪点（`subtle film grain`），模拟真实拍摄设备而不是渲染器。

```
late-afternoon window light from the left, soft directional falloff,
warm 4500K, shadow pooling under the jaw and in the eye sockets;
shot on 50mm, shallow depth of field, subtle film grain
```

## 5. 构图：像随手拍的

- **人物**：偏左或偏右，不居中；画面边缘可以裁掉一部分肢体。
- **视角**：自拍、俯拍、侧拍、越肩——避开正脸平视的证件照感。
- **比例**：打破完美三分与黄金分割，接受随手拍的失衡。

## 6. 反向提示词

```
smooth skin, plastic skin, waxy, airbrushed, flawless, over-smoothed,
beauty filter, doll-like, 3d render, cgi, perfect symmetry,
ring-light flat lighting, studio beauty lighting, retouched, oversaturated
```

`flawless` / `perfect` / `beauty` 这几个词写在正向里就是在要塑料脸，它们属于反向词。

## 四条常踩的坑

1. **堆形容词不如给物理条件。**`ultra realistic, 8K, masterpiece` 是审美指令，模型只会输出模板脸。换成镜头、光、皮肤的具体描述。
2. **细节量匹配景别**（见第 1 节）。
3. **分辨率不够时毛孔无处可画。**出图偏小的时候，配方再对也是塑料感——先提分辨率，再怀疑提示词。
4. **真实感样板词会让同一批角色长成一个人。**毛孔、毛细血管、次表面散射、虹膜纤维这些是所有人共用的底子；**区分度必须落在个体描述上**——脸型、五官比例、体态、衣着的具体材质与磨损、这个人独有的那一处细节。个体描述写得短、样板词占了大半，两个年龄性别接近的角色出来就是同一张脸。

---

**学习来源**：不完美细节、负面词与提示词结构内化自 [Imagera《How to Fix Plastic-Looking AI Skin》](https://imagera.ai/blog/fix-ai-skin-plastic-look-2026)、[QuestStudio《Make AI Images Look Real》](https://queststudio.io/blog/make-it-look-real-prompt-rules)、[AVB《The Ultimate Guide to Photorealistic AI Prompts》](https://aivideobootcamp.com/blog/photorealistic-ai-prompts-guide-2026/)；「别写审美指令、要写镜头与光」和低风格化值内化自[《一个技巧去除 AI 味，让作品告别塑料感》](https://www.woshipm.com/ai/6394014.html)、[《Midjourney 真实面部与皮肤生成终极指南》](https://blog.bigbigwork.com/archives/202505093)；微表情与眼神空洞的成因内化自[《AI 人像不再有假人感：微表情提示词完整教学》](https://vocus.cc/article/6a0408eefd89780001628703)、[知乎《为什么你的 AI 人像永远像建模》](https://zhuanlan.zhihu.com/p/2056321651587995280)。第 4 条坑来自本仓库生产实践（见 `skills/mint-characters/references/profile-pass.md` 的雷同度门）。
