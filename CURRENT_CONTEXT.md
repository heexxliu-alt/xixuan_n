# 当前任务摘要

本文件只记录当前可继续执行的事实。项目事实唯一来源是根目录 `PROJECT_TRUTH_SPEC.md`；旧聊天过程稿、被否决方案、重复日志和历史试验不作为当前依据。

## 当前目标

完成 Round 4A Surface Ecology 的跟随效果预览：在潜水员移动时，水流尾迹与潜水员来源气泡沿其运动产生并独立消散。此阶段只验证跟随关系与可见性，不进入下一轮。

## 关键决策

- Fish 是非交互的 2D 背景生态；游动恢复自 Git 提交 `b08ecb1` 的散开交互前版本：持续 velocity、慢速 wander、软边界和独立参数。
- Fish 不读取 Diver、鼠标、距离、预测或交互状态；不启用 scatter、awareness、avoidance、escape steering、状态机或 debug 层。
- Fish 原型仅通过 `?round=4a-fish-prototype` / `fishPrototype=1` 显示；正式首页默认隐藏。
- Surface 不再使用鼠标拖尾或自主随机气泡。尾流与气泡只由潜水员实际移动触发，生成后固定在世界坐标并独立淡出。
- 尾流与气泡由 Diver 实际移动触发，沿历史轨迹生成后留在世界坐标中独立消散；两者互不替代。
- Wake 采用多枚海水色、细长、断续的柔性扰动单元，跟随 Diver 曲线历史分布；气泡独立从 Diver 后方生成并上浮。

## 核心约束

- 不修改 Fish locomotion、Planet、Diver 运动核心、DAY / SUNSET / BLUE HOUR、背景、标题、下潜入口、Dive Map 或五个栏目。
- 尾流和气泡必须在海水背景之上、潜水员之后：当前层级为 `z-index:4`，潜水员为 `z-index:6`。
- 尾流从潜水员后方生成；气泡从潜水员后方/下方生成，向上独立漂移并在海面前淡出。
- `prefers-reduced-motion` 下不生成尾流/来源气泡；Fish 降速，悬浮水粒子动画关闭。
- Whale 继续隐藏；Dive Map 原有 `.trail` 保留。
- 禁止 `git add`、commit、push，除非用户另行明确授权。

## 当前进度

- `index.html`：Surface 光标层仅保留 glow/cursor-light；加入水粒子、尾流、来源气泡容器；原型鱼节点仍为 3 条且默认隐藏。
- `script.js`：Fish 交互层已移除；尾流/气泡生成、世界坐标脱离、水面边界、独立清理和调试级可见度已实现。
- `motion.css`：尾流/气泡均位于海水背景之上（`z-index:4`、`pointer-events:none`）；尾流为海水色断续水纹，气泡为独立上浮单元。
- 已用实际浏览器移动测试确认 DOM 会生成尾流与 Diver 气泡；当前正在补做实际截图验收。
- 已确认正式首页默认不显示临时鱼/动态尾流/动态气泡，Whale 隐藏；Dive Map 的 `.trail` 保留。
- 当前 cache-bust：脚本 `20260827-wake-follow-v2`；样式 `20260827-wake-follow-v2`。

## 未解决问题

- 需要用户先确认截图中的跟随关系、层级、位置和独立运动是否符合预期；美术强度仍可后续单独调整。
- 正式鱼素材、数量及是否回归首页仍未决定。

## 下一步行动

1. 等待用户验收调试截图；不自动进入 Fish Visual、Marine Ecology 或其他新任务。
2. 仅当用户明确要求时，再单独把尾流/气泡从调试级参数收回最终审美值。
3. 任何后续修改前，先重新读取 `PROJECT_TRUTH_SPEC.md` 并确认影响范围。

## 当前工作树

本轮相关未提交修改涉及：`CURRENT_CONTEXT.md`、`index.html`、`script.js`、`motion.css`。`PROJECT_TRUTH_SPEC.md`、`styles.css`、`dive.html` 和素材未改动。
