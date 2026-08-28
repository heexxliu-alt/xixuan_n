# 当前任务摘要

项目事实唯一以根目录 `PROJECT_TRUTH_SPEC.md` 为准；旧聊天过程稿、被否决方案、重复日志和历史试验均不作为依据。

## 当前目标

完成首页 Water Polish 的可感知度收敛：只增强现有浅层通透变化、弥散明度漂移和纵向深度衰减，使用户在 2–3 秒内察觉水体存在缓慢的大尺度变化，同时保持安静、薄、透、梦幻的插画语气。

## 关键决策

- 只使用现有 `.surface-water-particles` 容器及其已有 `::before` / `::after` 弥散场；不新增 DOM、图层或机制。
- 弥散场保持错峰慢速漂移：约 22s 与 29s，第二层带负相位；不得同步循环或整体集体呼吸。
- 纵向深度只通过连续、低对比的现有渐变表达；水面波形与水面动态保持原样。
- 三时相基础海色、Lighting Composition、标题、CTA、Planet、Diver、Fish、Whale、气泡、wake、下潜逻辑、`dive.html` 和五个栏目全部锁定。

## 核心约束

- 不重做海洋，不增加生态或装饰元素，不添加新波浪、caustics、光束、射线、粒子或 shader 特效。
- 仅允许调整现有水体层的范围、对比度、透明度、模糊和运动幅度；不得改变色相关系或水面结构。
- 不执行 `git add`、commit 或 push，除非用户明确授权。

## 当前进度

- `motion.css` 已在现有伪元素结构内提高弥散场可感知度，并保留连续纵向 attenuation；当前参数为 22s / 29s 错峰漂移、`.34` / `.28` 层级透明度和 34px 柔化。
- `index.html` 仅更新 `motion.css` cache-bust 至 `20260827-water-polish-v2`；本轮未改 `script.js` 或 `styles.css`。
- 已通过 `node --check script.js` 与 `git diff --check`；本次仅整理摘要文档，未改首页代码。

## 未解决问题

- 尚需在最新桌面首页确认：水体变化是否自然可感知、是否覆盖 surface band 下缘至 Diver 活动区域、是否仍不可辨认为独立光斑，且三时相基础颜色和水面动态未变。
- 尚需补做一次最新截图及控制台错误检查；若无问题则停止，不扩展任务范围。

## 下一步行动

1. 使用最新 cache-bust 打开首页，检查 `.surface-water-particles` 两个伪元素的 computed style、错峰动画和纵向渐变。
2. 进行桌面截图与 Console 检查；只在确有问题时微调现有水体参数。
3. 完成验证后等待用户验收，不开始其他 Round。
