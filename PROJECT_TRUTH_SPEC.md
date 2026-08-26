# Dreaming of the Sea｜项目真理文档（System Prompt Spec）

> 本文是开启新任务时唯一可信的项目上下文。旧聊天记录、草稿、过程稿和未确认方案均不具备约束力。

## 0. 当前基线

- 项目是一个静态 HTML/CSS/GSAP 个人作品集，当前只做两页：`首页（海面） → 海底页（DIVE MAP）`。
- 设计基准是桌面横版 16:9；移动端只做适配，不得用竖版布局反推桌面版。
- 当前最新状态：**上一版海面构图、拆分图层、下潜流程与海底页均保留**；首页生态运动与时间层为当前精修实现。
- 当前唯一海底页新增模块是个性化详情弹窗：毛玻璃档案卡、专属图标、编号、标签切换、作品卡片、关闭按钮；首页生态精修不改变五个栏目。
- 不使用 Three.js、3D 块状模型或通用 Modal。

## 1. 不可变锁定项

以下内容未经用户明确重新确认，禁止替换、重绘、重新生成、移动或改色：

1. 首页海面背景与整体插画语气。
2. 海底背景、珊瑚平台、发光路径和五个栏目素材的组合关系。
3. 五个栏目素材的位置、尺寸比例和视觉样式。
4. 潜水员原创透明素材、返回水母素材、首页网站名字体字形。
5. 已确认的光标核心、柔光和拖尾语言：小型淡黄光点 + 青色柔光 + 透明虹彩泡泡/星光/水波纹；拖尾中不得加入鱼或水母。
6. 首页/海底页顺序、桌面横版构图、基础导航文案和水下世界观。

## 2. 已确认素材（唯一有效路径）

### 页面与角色

- 首页拆分场景图层（当前最新基线）：
  - 天空与远山：`assets/surface-sky.png`
  - 海面与海水：`assets/surface-sea.png`
  - 云朵：`assets/surface-clouds.png`
  - 星球：`assets/surface-planet.png`
  - 水母：`assets/surface-jellyfish.png`
  - 鱼群：`assets/surface-fish.png`
- 首页独立生态裁切素材：`assets/surface-fish-near-school.png`、`assets/surface-fish-near-right.png`、`assets/surface-fish-near-curious.png`、`assets/surface-jellyfish-near.png`
- 原始合成背景仍保留为参考/回退素材：`assets/home-surface-background-v4.png`
- 海底背景：`assets/dive-world-final-v2-tech.png`
- 潜水员：`assets/freediver-final-transparent-v1.png`
- 首页标题字形：`assets/dreaming-title-transparent-v1.png`
- 标题参考：`assets/dreaming-title-reference-v1.png`
- 首页下潜/海底返回水母：`assets/return-jellyfish-v1.png`
- 过场专用潜水员 Emoji：`assets/diver-emoji-transition-v1.png`
- 详情 HUD 透明素材（作为详情卡低透明度装饰层）：`assets/detail-panel-hud-transparent-v1.png`

### 五个定版栏目素材

| 顺序 | 位置 | 栏目 | 唯一素材 |
|---|---|---|---|
| 01 | 左下平台 | 个人介绍 | `assets/station-logbook-book-transparent-v1.png` |
| 02 | 左上平台 | 内容与公关 | `assets/station-content-camera-transparent-v1.png` |
| 03 | 右上平台 | 整合传播 | `assets/station-communications-laptop-transparent-v1.png` |
| 04 | 下中平台 | 技能与工具 | `assets/station-tools-monitor-transparent-v1.png` |
| 05 | 右下平台 | 洞察与运营 | `assets/station-insight-compass-transparent-v1.png` |

栏目热区的 CSS 位置当前为：

```text
.logbook        left: 9%;  top: 62%; width: 18%; height: 24%;
.content        left: 5%;  top: 25%; width: 19%; height: 23%;
.communications left: 75%; top: 31%; width: 20%; height: 25%;
.tools          left: 46%; top: 75%; width: 18%; height: 15%;
.insight        left: 78%; top: 72%; width: 14%; height: 20%;
```

## 3. 首页（Surface View）当前行为

- 页面容器仍以原上一版的桌面横版构图为基准：桌面使用 16:9 场景尺寸，背景图 `object-fit: cover`。
- 标题使用透明 PNG 双层叠放：水上层清晰，水下层保留轻微模糊/色相偏移折射；不得添加粉色矩形底、边框、阴影盒或新的文字 DOM。
- 海面静态线已通过独立遮罩弱化，现有 SVG 波浪层 `.surface-wave-layer` 使用两条填充路径和 `MorphSVGPlugin` 循环变形；不要再添加僵硬的静态横线。
- 云朵、星光、随机气泡仍由 GSAP 驱动；气泡起点、大小、漂移、速度和透明度随机。
- 首页潜水员跟随鼠标，使用共享 `DiverPointerTracker`；指针光/柔光读取全屏 `pointerPosition`，潜水员读取独立 `diverTarget`，不新增另一套跟随物理。
- 首页 `DiverPointerTracker` 仅允许潜水员在海面以下活动，行为状态为 `UNDERWATER`、`SURFACE_APPROACH`、`SURFACE_FOLLOW`；采用水面、水平与底部的柔性边界，最终安全边界不允许潜水员中心高于 `55vh` 或低于 `85vh`；位置与旋转由 JS/GSAP 独占，`.diver` 不再使用位置/旋转 CSS transition。
- 首页生态交互以 `tracker.getPosition()` 为唯一生物响应坐标：独立近景鱼群使用速度/航向连续巡游与 `CRUISE`、`WANDER`、`FLEE`、`RECOVER`、`CURIOUS` 状态，逃逸后从当前位置恢复，不回到旧锚点；水母使用更慢的自主漂移与温和避让，不直接读取鼠标坐标。
- 首页 `data-time` 支持 `day`、`sunset`、`night` 三态；星球透明热点作为循环入口。昼夜在约 1.9 秒层过渡中同步影响 sky/sea/clouds/planet/jellyfish/fish/stars、生物运动强度和光标光色。
- 潜水员快速移动时沿反方向产生少量额外气泡；静止约 2.35 秒进入 calm，生物逐渐回游；夜晚 calm 持续约 4.6 秒时会出现极轻的发光浮游反馈。
- 下潜入口锚定在首页底部中右的书本/珊瑚区域，使用同一只水母 UI；文字为：

```text
下潜
EXPLORE
BELOW
THE SURFACE
```

- 点击下潜后播放上一版三层 2D SVG 波浪过场，再进入 `dive.html`；当前不要改成大弧度满屏波浪或新增海底入场动画。

## 4. 海底页（DIVE MAP）当前行为

- 背景和五个栏目素材保持定版构图；海底页不做镜头缩放。
- 顶部提示固定为：`/ MOVE TO GUIDE THE DIVER /`。
- 潜水员使用原创透明素材，跟随鼠标并朝运动方向转向；共享同一套 Lerp、最短角度旋转、光标核心和拖尾逻辑。
- 栏目靠近效果使用 GSAP `mapRange/clamp`：最大距离约 220px，最大缩放约 `1.28`；放大层覆盖原图，避免重影和模糊。
- 水母返回入口使用 `assets/return-jellyfish-v1.png`，文字为 `返回海面`。
- 海底顶部光束保留缓慢呼吸动画。

## 5. 唯一新增模块：个性化详情弹窗

详情卡 DOM 位于 `dive.html` 的 `.site-info`，不是光标，不得绑定到 `.cursor-layer`。它包含：

- `site-info-shell`：毛玻璃容器
- `site-info-icon`：当前栏目专属图标
- `/ 01 /` 等编号与英文栏目名
- `site-info-tabs`：二级分类标签
- `site-info-works`：两张作品信息卡
- `site-info-summary`：栏目短描述
- `site-info-close`：水滴/贝壳质感关闭按钮

五个栏目当前信息方向：

- 个人介绍：经历 / 方向 / 自述
- 内容与公关：新闻稿 / 热点策划 / 媒体沟通
- 整合传播：策略 / 创意 / 执行
- 技能与工具：内容 / 传播 / 工作流
- 洞察与运营：洞察 / 运营 / 复盘

交互规则：

- 潜水员或鼠标靠近栏目时，详情卡在栏目附近展开。
- 鼠标离开栏目与详情卡后自动淡出。
- 点击标签只切换卡片内容，不移动栏目、不替换栏目素材。
- 点击右上角 `×` 关闭详情卡。
- 详情卡可以使用透明 HUD 素材作为低透明度装饰，但不能变成旧式通用白框，也不能跟随鼠标光圈移动。

## 6. 文件职责

- `index.html`：首页结构、拆分 Surface Scene Layers、星球时间热点、独立生态生物、标题双层、动态海面 SVG、下潜入口、过场层。
- `dive.html`：海底场景、五个栏目热区、详情卡、返回水母。
- `styles.css`：布局、响应式规则、标题、光标、栏目热区和详情卡视觉。
- `motion.css`：纯动效层，包含 SVG 波浪、气泡、云朵、星光、昼夜滤镜、独立生物、夜晚浮游反馈和过场 fallback。
- `script.js`：共享潜水员跟随器（`pointerPosition`/`diverTarget` 解耦与显式水下状态）、首页柔性水域边界、连续巡游生态状态机、昼夜系统、速度气泡、idle/calm 反馈、首页动效、下潜过场、海底 proximity scale、详情卡数据与标签交互。
- `vendor/gsap.min.js`、`vendor/MorphSVGPlugin.min.js`：本地 GSAP 运行时。

## 7. 当前预览地址

- 首页：`http://localhost:8765/index.html?v=20260826-eco2`
- 海底页：`http://localhost:8765/dive.html?v=20260826-eco2`

本地服务默认端口为 `8765`。如果看到旧页面，使用带 `?v=20260826-eco2` 的地址刷新缓存。

## 8. 新任务执行协议

新对话开始时，先读取本文件，再执行以下步骤：

1. 先确认本次只改哪些模块；默认锁定第 1 节全部内容。
2. 修改前列出影响文件、视觉影响和交互影响；不直接重写全站。
3. 不使用旧聊天中的过程稿、未确认资产、旧布局或被否决的方案。
4. 修改后至少验证：首页、海底页、五个栏目位置、详情卡 hover/离开/标签/关闭、下潜/返回、控制台错误。
5. 若需要替换素材或移动五个栏目，必须先向用户单独确认，未确认不得执行。
6. 汇报时明确：改了什么、保留了什么、哪些项目仍待用户确认。

## 9. 当前待精修项（不是已授权修改）

- 详情卡文案可继续依据最终简历细化；目前仅为结构与示例内容。
- 详情卡在不同屏幕比例下的定位和可读性需要继续视觉复核。
- 首页标题水下折射强度、海面动态波幅可继续微调，但不得改变标题字形、背景和整体位置。
- 五个定版栏目素材、位置和背景绝不因上述精修而改变。

本版本说明：拆分后的 Surface Scene Layers、独立近景生态与指针/潜水员解耦已纳入当前基线；原始单背景仅作为参考/回退素材，不作为首页实际加载背景。五个定版栏目素材、位置和海底背景保持不变。
