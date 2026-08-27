# 当前任务摘要

本摘要只保留当前可继续执行的状态。项目事实唯一来源是根目录 `PROJECT_TRUTH_SPEC.md`；旧聊天过程稿、被否决方案、重复日志和历史试验记录均不作为事实。

## 当前目标

完成 Round 4A Fish Behavior Prototype 的重新验证：只用两条临时鱼检验“自主巡游是否有生命感”以及鱼是否能感知 Diver 并以曲线方式避让。本轮仍是行为原型，不制作正式鱼素材，不进入 Marine Ecology 或 Fish Visual 阶段。

## 关键决策

- 5 条闭合 Catmull–Rom 路径方案已否决；不再以 MotionPath、路径进度、固定 waypoint 或 tween 作为正常游动控制器。
- Prototype 仅在 `index.html?round=4a-fish-prototype`（或 `fishPrototype=1`）启用；正式首页默认仍无生态鱼。原型调试层在该 URL 下始终显示。
- 首页临时鱼严格为 2 条。每条鱼独立持有 `position`、`velocity`、`heading`、`cruiseSpeed`、`wanderState`。
- 每帧唯一 steering 来源为：WANDER、软边界、鱼间 separation、Diver avoidance。速度推动位置，平滑速度 heading 决定朝向；无预设路线、同步列车、随机目标点、CSS keyframe 或 180° 瞬时翻转。
- Diver 避让使用当前位置加速度预测位置：中距离半径约 190px、近距离约 104px；避让力连续增强，转向仍受最大角速度限制，离开后直接由 WANDER 接管，不回到旧路径。
- 原型 Debug 始终显示 Diver 中/近距离圆环、鱼 velocity 向量、heading 向量、steering 向量和 `A / WANDER`、`B / AVOID` 状态文字。

## 核心约束

- `PROJECT_TRUTH_SPEC.md` 的不可变锁定项全部有效：Planet、Planet 序列/旋转/点击、DAY / SUNSET / BLUE HOUR、TURN THE SKY、标题、Diver 运动与姿态、海面、下潜入口、背景构图、五个栏目和 `dive.html` 均不得修改。
- Whale 继续隐藏；不恢复、移动、缩放、改透明度、改素材或添加动画。Dive Jellyfish placeholder 保持原样。
- 不修改 `initSurfaceCreatures()` 的未来复用代码，也不在正式首页调用它；本原型不使用 Three.js、物理引擎、WebGL 或新的动画依赖。
- Reduced Motion 仍保持两条鱼但降低运动幅度/速度；调试信息保留以便检查行为。
- 本阶段结束即停止，不开始正式 Fish Art、Marine Ecology、Surface Decision Boundary、Dive Transition 或 Responsive Round；不执行 `git add`、commit 或 push，除非用户明确授权。

## 当前进度

- `index.html` 已将原型 DOM 收敛为两条临时鱼，资源仍复用 `assets/surface-fish-near-curious.png`；默认字段 `display:none`，不影响正式首页。
- `script.js` 已将原型控制器改为 requestAnimationFrame 驱动的 velocity-steering：两条鱼有不同起点、巡航速度、wander 相位和最大转向速率；Diver 速度参与威胁点预测；无 MotionPath/路径进度。
- `motion.css` 已更新为两鱼尺寸/透明度及始终可见的行为 Debug 样式；Whale 规则保持 `display:none!important` 与无动画。
- 首页脚本与样式 cache-bust 更新为 `20260827-round4a-v2`。
- 尚待执行本轮浏览器验证：默认首页无鱼；原型页恰好两鱼且 Debug 可见；静止巡游、Diver 从不同方向接近、停止追逐后自然续游、两鱼独立反应；控制台无异常。

## 未解决问题

- 需要在原型 URL 上完成用户要求的长时间无操作和五项人工行为验收；这些只用于判断 steering 参数，不应通过扩大系统范围解决。
- 临时鱼仍是行为测试素材，正式插画鱼资产、数量和是否回归首页尚未决定。

## 下一步行动

1. 运行脚本语法检查与 `git diff --check`。
2. 用本地首页和 `?round=4a-fish-prototype` 验证默认/原型 DOM、两鱼移动、Debug 圆环/向量、Diver 避让和控制台。
3. 只在行为验收失败时调整本原型 steering 参数；保持所有锁定系统不变。
4. 向用户报告本轮实现与测试结果，然后停止等待验收。
