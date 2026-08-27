# 当前任务摘要

本摘要只保留当前可继续执行的状态。项目事实唯一来源是根目录 `PROJECT_TRUTH_SPEC.md`；旧聊天过程稿、被否决方案、重复日志和历史试验记录均不作为事实。

## 当前目标

完成 Round 4A Fish Behavior Prototype，只验证临时鱼在无用户操作时是否自然自主巡游，以及对 Diver 的轻量感知与避让。Prototype 仅通过 URL 开关启用，生产首页默认保持无鱼基线。当前不制作正式 Fish Assets，不开始 Marine Ecology。

## 关键决策

- 使用 5 条临时低细节鱼，分别承担宽阔横向、长弧线、深水小回游、边缘进入/离开和中景短回游等运动角色。
- 鱼使用闭合 Catmull–Rom 巡游曲线作为基础趋势，再叠加轻微 organic wander、惯性转向、个体速度/相位/反应差异；不是随机目标点 tween，也不是固定路径上的同步列车。
- 鱼的朝向由平滑后的实际运动 heading 决定，不读取鼠标，不使用即时 `scaleX` flip；转向通过角度插值完成。
- Diver proximity 只提供 steering influence：FAR 无反应，接近后渐进进入 `AVOID`，离开后经过 `RETURN` 逐步回到 `CRUISE`；不创建固定逃跑目的地，不做 panic scatter。
- 使用轻量 fish–fish separation 与软水域边界；不实现 alignment、cohesion、完整 boids 或新渲染依赖。
- Prototype 入口：`index.html?round=4a-fish-prototype`；可选 `&fishDebug=1` 显示巡游曲线、控制点和 heading 线。Debug 默认关闭，生产页面不显示路径。未启用 MotionPathHelper，使用同一套轻量调试 overlay。

## 核心约束

- `PROJECT_TRUTH_SPEC.md` 的不可变锁定项全部有效：Planet、Planet 序列/旋转/点击、DAY / SUNSET / BLUE HOUR、TURN THE SKY、标题、Diver 运动与姿态、海面、下潜入口、背景构图、五个栏目和 `dive.html` 均不得修改。
- Whale 必须继续隐藏；不得恢复、移动、缩放、改透明度、改素材或添加动画。
- 当前 Dive Jellyfish placeholder 保持原样；不美化、不移动、不删除。
- Fish Prototype 只在显式 URL 开关下运行；不调用旧的 `initSurfaceCreatures()`，不把临时鱼当作正式首页生态。
- Reduced Motion 下只保留 3 条鱼，降低速度与运动幅度；不增加高频动画。不得引入 Three.js、物理引擎、WebGL 或新的动画依赖。
- 本阶段结束后停止，不开始正式 Fish Art、Marine Ecology、Surface Decision Boundary、Dive Transition 或 Responsive Round；不执行 `git add`、commit 或 push，除非用户明确授权。

## 当前进度

- `index.html` 新增隐藏的 `.surface-fish-prototype-field` 和 5 个临时鱼节点，均复用现有 `assets/surface-fish-near-curious.png`；默认 `display:none`，不影响正式首页。
- `motion.css` 新增 Prototype 鱼的水域层、远/中/近景尺寸与透明度、Debug SVG 样式；Whale 仍由 `.surface-whale-layer{display:none!important;animation:none!important}` 隐藏。
- `script.js` 新增 `initSurfaceFishPrototype()`，仅在 Prototype URL 下启动。系统包含 5 条差异化闭合曲线、平滑 heading/惯性、micro wander、软 surface/edge steering、fish separation、Diver proximity 的 AVOID/RETURN/CRUISE 状态和 Debug 数据。
- 已验证：默认首页字段 `display:none` 且可见鱼为 0；Prototype 页面显示 5 条鱼并持续移动；Diver 靠近时至少一条鱼进入 `AVOID`，移开后回到 `CRUISE`；Whale 仍隐藏，下潜水母仍为 1 只。
- 已验证 `fishDebug=1` 只在调试参数下显示 5 条曲线；Node 语法检查和 `git diff --check` 通过。未执行 Git 操作。

## 未解决问题

- 尚未完成用户要求的 30–60 秒无操作长时间观测，以及全部边界组合（近表面、左右边缘、交叉、转向中遇到 Diver）的人工验收；这些是当前 Prototype 的待验收项，不应通过扩大功能范围解决。
- 当前临时鱼仅用于行为判断，正式插画鱼资产、数量和是否回归首页尚未决定。

## 下一步行动

1. 等待用户在 `index.html?round=4a-fish-prototype` 预览并验收行为；需要路径辅助时追加 `&fishDebug=1`。
2. 根据验收结果只修正鱼的运动参数；不修改 Diver、Planet、Whale、时间系统、背景或下潜系统。
3. 用户确认 Prototype 通过后再停止本阶段；正式 Fish Assets / Marine Ecology 需另行授权。
