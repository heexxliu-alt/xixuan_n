# Dreaming of the Sea — CURRENT CONTEXT

> 更新时间：2026-09-03
> 本文件以当前工作区实际代码为准。`PROJECT_TRUTH_SPEC.md` 负责项目边界与冻结决策；`SURFACE_DIVE_HANDOFF.md` 是交接背景，若与现行代码冲突，以现行代码为实现事实。

## 1. 当前同步范围

本次工作区的有效开发内容集中在 Deep Sea 连续下潜页：

- `dive.html`：连续下潜页面结构、世界场景、案例发现层和 LTPO 阅读层。
- `script.js`：连续相机、世界坐标、游动碰撞、裂隙自动下潜、案例状态机、上浮返回和视觉变量驱动。
- `styles.css`：连续世界、旧有深海层、地形、光照/水体氛围、光标、案例阅读及响应式布局。
- 当前实际引用的新主世界素材：`assets/deep-sea-world-master-v36-natural-deepest-no-cave.png`。
- 当前实际引用的裂隙背景素材：`assets/rift-formal-background-v1.png`；`rift-dropoff-environment-v1.png` 等既有资源继续由样式引用。

工作区还存在大量 `v1–v35`、hidden-cave、master-background、candidate 等候选图，以及 `build_resume*.py`、`update_resume*.py` 和 `outputs/`。它们没有因为存在于工作区就自动成为当前页面资源；发布时只纳入实际引用且确认过的文件。

## 2. 页面入口与整体结构

`dive.html` 当前入口为：

```html
<main class="dive-world dive-descent" data-page="dive" data-prototype="continuous-descent">
```

页面是固定视口的连续下潜世界，真实滚动距离由 `.descent-scroll-spacer` 提供；可视层包括：

1. `downstream-world-scene`：一张全幅纵向主世界图 + 两层缓慢水体/深度氛围。
2. `descent-layer-distant / middle / foreground`：沿用的入口水体、鱼、雾、光束、caustic 和地形层；在连续世界中按进度渐退，避免出现拼接缝。
3. `descent-layer-content`：个人介绍、经历与教育坐标。
4. `case-discovery-layer`：靠近案例锚点时出现的入口按钮。
5. `case-reading-layer`：案例阅读状态层。
6. `descent-lifeline`、水面返回提示、深度读数、onboarding、气泡和光标层。

Surface 首页与既定 Surface → Dive 边界本轮未改；详情页是从首页下潜后进入的当前工作重点。

## 3. 世界图与深度坐标

当前主世界常量位于 `script.js`：

- 资源：`deep-sea-world-master-v36-natural-deepest-no-cave.png`
- 设计尺寸：735 × 3850
- 旧版已确认的上半段高度：2755
- 通过 `previousMasterWorldY()`、`remapMasterY()` 和 `createDeepSeaWorldRanges()` 将旧物理锚点映射到新主图，保留上半段旅程节奏，把新增距离放入底部 `deeperOpenSea`。

当前世界段落及节奏：

| 段落 | 滚动区间（约） | 视觉节奏 |
| --- | --- | --- |
| `upperOpenWater` | 0–20% | slow |
| `riftApproach` | 20–30% | tighten |
| `rift` | 30–40% | direct |
| `riftExit` | 40–47% | open |
| `greatChamber` | 47–72% | linger |
| `deeperOpenSea` | 72–100% | slow |

`renderDownstreamVisual()` 将滚动映射为主图位移、两层氛围漂移、旧层透明度、焦点和 `data-world-progress`；深度读数当前按世界进度显示，最大约 420m。

## 4. 游动、碰撞与返回

- `DiverPointerTracker` 负责指针跟随、平滑位置、朝向和姿态；滚动仍是连续下潜主轴。
- `DEEP_SEA_SWIM_MAP` 为 v1 归一化游动地图，包含六个纵向区域、自由水域、岩壁/岩台 blocked polygons 和预留但未启用的未来路线。
- Great Chamber 使用不对称中央自由水域与左右岩体/内侧 ledge，避免潜水员进入可见岩块。
- onboarding 只有在滚动至少 16px 且指针移动至少 32px 后消失，提示为 `SCROLL TO DESCEND` / `MOVE TO SWIM`。
- 右侧上浮 lifeline 使用现有救生圈、绳索和 `PULL TO BACK ↑` 提示；拖拽达到阈值（118）或轻点击触发上浮时间线，完成后回到 `index.html`。短拉会回弹，正常漂浮位置保留。

## 5. 裂隙自动下潜

当潜水员进入裂隙进度窗口、处在中部泳道且低于视口约 46% 时，状态机会从 `FREE` 进入：

`ENTERING_RIFT → AUTO_DIVE → EXITING_RIFT → SETTLING_IN_CHAMBER → FREE_IN_CHAMBER`

该段是唯一有意锁定滚轮/触控的电影化过场，GSAP 时间线约 6.25 秒；潜水员朝向下潜，抵达 chamber 后等待约 820ms 再恢复自由游动。除此之外没有路线吸附或强制跳转。

## 6. 案例发现与阅读

数据层目前有四个案例锚点：

- `ltpo`：PRIMARY_CAVE，`ENTER`，已确认且启用。
- `mediaLab`：SECONDARY_CAVE，`ENTER`，已确认且启用。
- `hundredInch`：ROCK_PLATFORM，`APPROACH`，仅数据锚点。
- `beijing2022`：ROCK_TERRACE，`APPROACH`，仅数据锚点。

生产态只创建前两个 `ENTER` 发现按钮；后两个尚无生产入口，不应描述为已完成详情页。

案例状态为 `FREE → PROXIMITY → READING`：潜水员进入 approach polygon 时，入口按钮在锚点屏幕位置出现；点击后隐藏发现层、暂停指针跟随并打开阅读层。阅读状态会拦截外部滚动，内部滚动更新 section focus 与 progress；返回按钮或 Escape 恢复进入前的滚动、潜水员位置/朝向/姿态和自由状态。

### LTPO 当前已实现内容

`ltpo-reading` 是目前唯一完整的真实阅读流，共六个内容段：

1. `01 / LANDING`：LTPO 技术营销、日期、角色。
2. `02 / WHAT IS LTPO`：技术解释、三项体验价值和 Challenge。
3. `03 / STRATEGY`：认知基建 → 集中传播 → 长尾运营；前两阶段 complete，第三阶段 planned。
4. `04 / SELECTED WORK`：`《“牛马”相对论》`、北京电视台四集微短剧、职责和技术转译路径；媒体仍是占位框。
5. `05 / FOUNDATION EVIDENCE`：百度百科基础信息；参考图仍是占位框。
6. 结果/返回段：当前页面结尾提供回到 Great Chamber 的路径。

代码中的 `REAL MATERIAL TO COME`、`REFERENCE CAPTURE TO COME` 是当前真实状态，不应在交接中写成已补齐素材。

`mediaLab` 目前只走通用 placeholder landing（`CASE CONTENT COMING NEXT`），尚未有独立内容页。

## 7. 当前视觉与动画系统

- `dive-world` 使用深蓝到浅青的连续径向水色底；主世界图承载地质结构，单独叠加低对比 water/depth atmosphere。
- 入口旧层包含 haze、柔化 Tyndall 光束、caustic suggestion、远处鱼与深度地形；其透明度由 `renderDownstreamVisual()` 连续驱动。
- 水体大尺度明度使用两层低对比、错峰的 `deep-reference-water-drift`；光束和 caustic 也以慢速漂移为主，避免硬边和集体呼吸。
- 光标保留小的亮点与较宽、溶解式 glow；不参与案例阅读层查询。
- `styles.css` 包含桌面与 `max-width:700px` 移动端布局，案例阅读层在小屏下改为单列。

## 8. 调试开关与非生产内容

- `DEBUG_HIDDEN_CAVE = false`：默认不显示隐藏洞穴；URL 参数 `?debug-hidden-cave` 才开启实验性隐藏洞穴及额外 spacer。
- URL 参数 `?debug-swim-map` 才显示游动地图 SVG、碰撞多边形、案例 approach 和实时读数。
- `script.js` 中仍保留旧的 `initDivePage()` stations/profile 路径，但当前 `dive.html` 的 `dive-descent` 不会调用它；它属于兼容/旧路径，不是本页生产结构。
- 候选图片、实验性背景和简历生成脚本不等于页面依赖，除非代码实际引用并在发布清单中明确纳入。

## 9. 冻结边界

以下内容按项目真相规范保持冻结，本次没有修改：

- Surface 首页的既定视觉、下潜入口、光标/拖尾、海面体系和 Surface → Dive 过场。
- 已确认的叙事方向：SURFACE → DIVE → DEEP SEA，以及求职导向的专业表达。
- 本次只整理上下文并同步当前有效实现；不借机重构、压缩/转换素材、删除候选文件或改写其他页面功能。

## 10. 发布与后续验证

本次提交应只包含：`CURRENT_CONTEXT.md`、当前修改的 `dive.html` / `script.js` / `styles.css`，以及代码实际引用的新资源。不得加入 `outputs/`、简历脚本或未引用候选资产。

发布后应核对：

1. 远程分支文件树与上述清单一致。
2. `dive.html` 的 cache-bust、主世界素材路径和 LTPO 阅读结构可直接打开。
3. `?debug-swim-map`、`?debug-hidden-cave` 仍为显式调试入口。
4. Git 工作区只剩未纳入发布范围的候选文件，且没有误提交敏感或本地生成文件。
