# Dreaming of the Sea — Surface / Dive Transition 交接手册

> 这份手册用于开启“海底页（Deep Sea / DIVE MAP）”的新窗口。首页 Surface 与进入海底前的 Dive Transition 目前先冻结，不在新任务中顺手重做。

## 1. 当前目标与冻结边界

下一步工作范围：**只开始海底页 `dive.html` 的后续设计与实现**。

当前先保留并冻结：

- Surface 首页的构图、拆分背景、标题、Planet 时间入口、CTA、Diver 行为、Water、Fish / Ecology。
- Surface → Dive 的点击链路和当前 point-based water morph 过场。
- Deep Sea 页的背景、五个栏目素材、栏目位置、基础潜水员跟随和返回入口。

本轮没有执行 `git add`、commit 或 push。当前工作区已有用户认可但尚未提交的改动，**不要 reset、checkout、clean 或覆盖这些改动**。

## 2. 唯一事实来源与当前工作区状态

开始任何新工作前，先完整阅读根目录的 [`PROJECT_TRUTH_SPEC.md`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/PROJECT_TRUTH_SPEC.md)。它是项目事实和锁定决策的唯一可信来源；旧聊天记录、草稿、否决方案和重复日志不具备约束力。

当前 `git status --short`：

```text
 M index.html
 M motion.css
 M script.js
```

这 3 个文件的未提交内容属于当前首页/转场基线的一部分，不要为了“清洁工作区”而回滚。`CURRENT_CONTEXT.md` 主要记录上一轮 Water Polish，不能替代 `PROJECT_TRUTH_SPEC.md`，也不能覆盖当前代码事实。

## 3. Surface 首页：当前冻结状态

### 3.1 场景与图层

`index.html` 的 `.surface-hero` 是桌面横版 16:9 Surface 场景。当前主要层级包括：

- `surface-sky-layer`：`assets/surface-sky.png`
- `surface-sea-layer`：`assets/surface-sea.png?v=20260826-sea2`
- `surface-clouds-layer`：`assets/surface-clouds.png`
- `surface-jellyfish-layer`：`assets/surface-jellyfish.png`
- `surface-whale-layer`：`assets/sky-whale-master-v1.png`（素材保留，但当前由 CSS 隐藏）
- Planet 初始帧：`assets/planet-final/day/planet-day-001.webp`
- 双层标题（清晰层 + 水下折射层）、CTA、SVG surface wave、Water particles、cursor / glow。

保持现有 2D 世界层规则：天空、远山、云、海面、海水、远景鱼影、环境星光和背景装饰均为 2D。只有直接与用户发生关系的主体才允许轻 2.5D；不要借做 Deep Sea 的机会把 Surface 重新 3D 化。

### 3.2 时间与 Planet

- `data-time` 三态顺序固定：`day → sunset → blue-hour → day`。
- 星球 `.planet-hotspot` 是唯一时间切换入口；`/ TURN THE SKY /` 是其提示。
- 当前 Planet、orbit、时间切换与已确认静态视觉保持不动。
- 不要修改 DAY / SUNSET / BLUE HOUR 的基础 Lighting Composition、Planet 位置/尺寸/纹理，除非有新的明确任务。

### 3.3 CTA 与 Surface Diver

CTA 仍是统一点击区域：

```html
<div class="dive-cta-region" aria-label="进入海底页面">
  <a class="dive-trigger" href="dive.html" aria-label="进入海底页面">
    DIVE IN, GET TO KNOW ME
    <span class="dive-trigger-hint">CLICK TO DIVE</span>
  </a>
</div>
```

保留 CTA 文案、字号、位置、点击语义和已确认的克制 glow / parallax；不要在海底页任务中重做 CTA。

Surface Diver 使用 `assets/freediver-final-transparent-v1.png` 和共享 `DiverPointerTracker`：水下 follow、接近水面边界、天空中的 WAIT/WATCH 与姿态平滑规则均已锁定。

点击 Dive 后，Surface Diver 不再继续讲故事：`exitForDive(.2)` 会先冻结当前坐标、销毁 Surface follow / WAIT-WATCH 监听和 ticker，并在约 200ms 内淡出；它不会在转场中重新出现。返回 Surface 时按正常首页状态重新初始化。

### 3.4 Surface Ecology / Water

Surface ecology 和 Water 目前先冻结：

- Whale 素材保留但首页暂时隐藏，不能重新调位置、透明度、运动或层级。
- Shark 当前隐藏；远景鱼群 / 当前保留生态按现状处理，不新增物种或复杂 AI。
- 不恢复被撤出的普通生态水母、scatter、Diver avoidance、awareness、boids 等互动层。
- Wake / 水流保持当前关闭或冻结状态；不要把它们带入 Deep Sea 任务。
- Water 的 surface wave、depth / translucency、diffuse luminance variation 和三时相海色保持当前实现；不要继续加新 Water layer。

## 4. Dive Transition：当前实际实现

当前入口链路：

```text
点击 DIVE CTA
  → CTA local ripple 立即出现
  → Surface Diver 停止所有 Surface behavior，并在约 0.2s 内消失
  → 约 300ms 后启动 transition layer
  → point-based dynamic water morph / wash
  → 完全覆盖后导航到 dive.html
```

### 4.1 DOM / visual layers

`index.html` 仍保留 `.transition-layer`、`.transition-morph` 和 3 条 SVG `.transition-wave` 路径，以及历史 `.transition-emoji` 标记。当前运行时由 `playDiveTransition()`：

- 只使用前两条 `.transition-wave`；第三条隐藏。
- 隐藏 `.transition-emoji`，所以转场中不会再次出现 Diver 插画。
- 通过 `.transition-layer` 覆盖 Surface UI；原有 CTA ripple 与转场起始阶段可短暂重叠。

### 4.2 point-based morph 机制

当前不是单一 SVG path 的整体 translate，也不是旧的统一 MorphSVG 目标路径。`script.js` 的 `playDiveTransition(entry)` 使用：

- 每层 11 个横向 points，初始 `Y = 101`（画面下方）。
- 每个 point 有独立 target Y 与 deterministic delay，制造横向 lead / lag 和 height difference。
- GSAP 每帧通过 `onUpdate: renderWash` 重建 cubic Bézier path 的 `d` 属性。
- 两层水体分别错相推进，形成 irregular crest / trough、dragging / pulling / wash 感。
- GSAP 不可用或 reduced-motion 时直接设置 target path，并较快进入 `dive.html`。

当前参考的运动架构是 GSAP Dynamic Morphing Demo / CodePen [qBedXpg](https://codepen.io/GreenSock/pen/qBedXpg)：借用 point-based asynchronous morphing architecture，不复制其橙色视觉、UI 或速度。相关官方插件文档可参考 [MorphSVG](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/)，但当前实现的核心是逐点重建路径。

### 4.3 当前已验证结果

- 点击前 Surface Diver 可见；点击后约 540ms，Surface Diver `opacity = 0` / hidden。
- transition emoji `display:none`。
- transition layer 显示；首层 wave opacity 约 `.93`；第三层 wave 隐藏。
- transition path 的 `d` 在运行中持续变化，而非静态切换。
- 约 3.6s 总时间后进入 `http://localhost:8765/dive.html`。
- 最近一次有效页面 Console 检查无错误。

以上行为目前视为冻结基线。除非用户另行授权，不要调整 morph 点数、时序、颜色、层数、Surface Diver 退出逻辑或最终导航机制。

## 5. Deep Sea 页当前结构（新窗口的工作起点）

文件：[`dive.html`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/dive.html)

当前结构：

```text
.dive-world[data-page="dive"]
├─ .dive-art                         assets/dive-world-final-v2-tech.png
├─ .dive-rays                        顶部缓慢光束/呼吸层
├─ .dive-nav                         DIVE MAP / 01 + / MOVE TO GUIDE THE DIVER /
├─ .jelly-return                     assets/return-jellyfish-v1.png + 返回海面
├─ .site-info[role="dialog"]         个性化详情卡壳层
├─ 5 × .station                      五个栏目热区（原图 + zoom 图）
├─ .cursor-layer                     cursor / glow / trail
└─ .diver.swimmer.swimmer-art        assets/freediver-final-transparent-v1.png
```

### 5.1 五个栏目（不可移动、不可替换）

| 顺序 | class / 区域 | 素材 | 当前 CSS 热区 |
|---|---|---|---|
| 01 | `.logbook` 左下 | `assets/station-logbook-book-transparent-v1.png` | `left:9%; top:62%; width:18%; height:24%` |
| 02 | `.content` 左上 | `assets/station-content-camera-transparent-v1.png` | `left:5%; top:25%; width:19%; height:23%` |
| 03 | `.communications` 右上 | `assets/station-communications-laptop-transparent-v1.png` | `left:75%; top:31%; width:20%; height:25%` |
| 04 | `.tools` 下中 | `assets/station-tools-monitor-transparent-v1.png` | `left:46%; top:75%; width:18%; height:15%` |
| 05 | `.insight` 右下 | `assets/station-insight-compass-transparent-v1.png` | `left:78%; top:72%; width:14%; height:20%` |

这些素材、位置、尺寸比例、海底背景与珊瑚平台关系是锁定项。不要改成 Three.js、3D 块状场景或通用 Modal。

### 5.2 现有 Deep Sea 交互

`script.js` 的 `initDivePage(world)` 当前负责：

- 创建 `DiverPointerTracker(world, swimmer)`，复用潜水员 follow / 最短角度旋转 / cursor 语言。
- 以 GSAP `mapRange / clamp` 计算栏目 proximity；`maxDistance ≈ 220px`、`maxScale ≈ 1.28`。
- proximity 时显示/更新 `.site-info` 详情卡；点击栏目、标签、关闭按钮按现有逻辑工作。
- `site-info` 是独立详情卡，不属于 `.cursor-layer`，不能让它跟随光圈移动。
- `.jelly-return` 通过现有 `playJellyClick()` 播放返回反馈后回到 `index.html`。
- `.dive-rays`、水母 idle / ripple 等已有动效保持当前状态，除非新任务明确指定。

## 6. 文件职责速查

- [`index.html`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/index.html)：Surface DOM、背景拆分、Planet 热点、生态节点、标题、CTA、transition markup。
- [`dive.html`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/dive.html)：Deep Sea 场景、五个 station、详情卡、返回水母。
- [`styles.css`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/styles.css)：布局、响应式、标题、cursor、station 热区、详情卡视觉。
- [`motion.css`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/motion.css)：云、星光、波浪、气泡、Water、时间滤镜、生态和 transition fallback 动效。
- [`script.js`](/Users/liuxinran/Documents/ChatGPT/个人网站gogogo/script.js)：共享 Diver tracker、时间 / Planet、Surface ecology / Water、Surface CTA、Dive transition、Deep Sea proximity 和详情卡逻辑。

## 7. 新窗口的硬约束

除非用户明确扩大范围，不要修改：

- Surface Water / surface wave / Water motion。
- Planet、DAY / SUNSET / BLUE HOUR、`/ TURN THE SKY /`。
- Surface Fish / Shark / Jelly / Whale、Diver 行为和 CTA 文案/位置。
- Dive Transition 的 point morph、Surface Diver fade-out、ripple 与导航机制。
- `dive.html` 中五个栏目素材、位置、尺寸比例、海底背景与珊瑚平台。
- `playJellyClick()`、`playDiveTransition()`、`UNDERWATER` / Surface movement 规则，除非任务明确要求。

新模块若需要改变锁定项，应先说明影响文件、视觉影响、交互影响并等待确认；不要“顺手优化”。

## 8. 推荐的 Deep Sea 下一步流程

1. 在新窗口再次读取 `PROJECT_TRUTH_SPEC.md`，再读取本手册。
2. 运行 `git status --short`、`git diff --stat`，确认没有误覆盖当前未提交首页/转场改动。
3. 只检查 `dive.html`、`styles.css`、`motion.css`、`script.js` 中 Deep Sea 相关结构和 computed layout；先列出准备修改的模块与影响范围。
4. 以桌面 16:9 为主要验收视口，使用 cache-busted URL 预览，不要用旧缓存判断。
5. 每次改动后最小验证：五个 station 位置、proximity scale、详情卡展开/离开/标签/关闭、Diver follow、返回 Surface、Console。
6. 如需提交或推送，必须等用户明确授权；当前交接阶段不执行 Git 写操作。

## 9. 尚未授权 / 待后续决定

- 五个栏目详情卡的最终简历文案仍是示例内容，后续可单独细化。
- 详情卡在不同桌面比例下的定位与可读性仍可做专门视觉复核，但不能因此移动五个栏目。
- Deep Sea 的下一步视觉或交互方向尚未在本手册中预先授权；新窗口应先确认目标，再动手。
- `PROJECT_TRUTH_SPEC.md` 对旧版 transition 的描述与当前未提交 point-morph 实现存在版本差异；当前首页/转场先按代码现状冻结，不要自动回退旧版。

## 10. 交接结论

**现在可以安全开始 Deep Sea 页工作。** 首页和 Dive Transition 已经有明确的冻结边界；新任务应把注意力放在 `dive.html` 的深海世界、五个栏目交互与详情内容上，不要重新打开已经暂时接受的 Surface / Transition 争议。
