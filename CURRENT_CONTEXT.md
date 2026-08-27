# 当前任务摘要

本文件只保留当前可继续执行的目标、决策、约束、进度和行动。项目事实以根目录 `PROJECT_TRUTH_SPEC.md` 为准；旧聊天过程稿、被否决方案、重复日志和历史试验不作为依据。

## 当前目标

1. 增强首页底部 `DIVE IN, GET TO KNOW ME` 的淡黄色暖光呼吸峰值，保持文字本体样式不变。
2. 统一 `Dreaming of the Sea` 标题在 DAY / SUNSET / BLUE HOUR 三态的颜色、外观、位置、裁切、折射和层级。

## 关键决策

- CTA 主文案与 `CLICK TO DIVE` 是同一可点击整体；主文案字体、基础颜色、透明度、字号、字距和位置锁定。
- CTA 保留约 5.6 秒平滑暖色呼吸；仅增强外围 glow，不改变文字本体颜色或 opacity。
- CTA Hover 两行同步进入青色选中态，并保留自定义光标轻微收缩/ring；不增加按钮、边框或底色。
- CTA 点击位置生成两层短暂柔和水环，约 300ms 后复用既有 `playDiveTransition()`；不改转场本体。
- 独立 `↓` 箭头和 Idle 水纹已删除；不得恢复旧的持续箭头/水纹动画。
- 标题继续使用现有 `assets/dreaming-title-transparent-v1.png` 双层素材；三态使用同一裁切、mask、折射动画和 `.home-copy` 层级。

## 核心约束

- 只修改 CTA 提示视觉及标题三态一致性；不得改 Planet、Diver、Fish、Whale、海面、昼夜 Lighting、下潜入口逻辑、`dive.html` 或五个栏目。
- 不修改 DAY / SUNSET / BLUE HOUR 的背景和 Lighting 色值；统一的是标题自身渲染规则。
- 保留现有 `playDiveTransition()`、星球时间系统、DiverPointerTracker、Wake/气泡关闭状态及其他既有交互。
- 所有纯视觉层 `pointer-events:none`；CTA 区域保持可点击。
- 未经明确授权不执行 `git add`、commit 或 push。

## 当前进度

- `index.html`：CTA 仅保留主文案和 `CLICK TO DIVE` 两行；样式 cache-bust 为 `20260827-dive-text-v19`，脚本 cache-bust 为 `20260827-no-wake-v4`。
- `styles.css`：暖黄色呼吸 glow 峰值已增强；CTA 两行共享反向视差与 Hover 青色选中态；点击水环为动态两层结构。
- `motion.css`：标题 `.title-surface`、`.title-underwater` 与 `.home-copy` 已改为不依赖 `data-time` 的统一规则。
- `script.js`：CTA 区域绑定视差、Hover/cursor 状态和点击水环；300ms 后继续调用原有下潜转场。
- 当前工作树包含此前未提交的项目改动；本任务未执行 add/commit/push。代码检查已通过 `node --check script.js` 与 `git diff --check`。

## 未解决问题

- 需要在桌面预览中最终确认：三种时相标题肉眼完全一致，CTA 暖光峰值可感知但不改变文字本体。
- 需要补做一次三态浏览器截图/控制台检查；不得借此扩展到其他模块。

## 下一步行动

1. 仅验证首页 DAY / SUNSET / BLUE HOUR 的标题 computed style、位置与截图一致性，以及 CTA glow 可见度。
2. 若需调整，只允许改 CTA glow 强度或标题统一规则；先确认影响范围。
3. 完成后等待用户验收，不自动开始其他 Round。
