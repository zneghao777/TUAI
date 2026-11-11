# 设置与会话侧栏 UI 修复

2026-10-28，按用户要求独立检查和修复当前界面的布局与视觉一致性。
本次不推进原开发计划，不修改任务编号、阶段计数或验收状态。

## 修复范围

检查覆盖桌面首页、会话侧栏、会话菜单、模型列表与编辑、对话显示、
聊天内容、文件与产物空态，以及窄屏与触摸场景。

| 问题                                             | 处理                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 会话操作使用浏览器默认按钮和文本三点             | 复用已迁入的 DSH `IconEllipsisOutlineRegular` 与原 `Menu`；桌面悬停、键盘聚焦或菜单打开时显示，触摸端常显，点击区域为 44px |
| 两个设置分类使用不同弹窗，背景、位置和尺寸不一致 | 新增共享 `SettingsDialog`，统一 DSH Modal、白色面板、4px 背景虚化及分类导航                                                |
| 切换分类销毁模型编辑器                           | 保留同一个窗口与表单实例；隐藏分类不进入焦点顺序，未保存草稿和滚动位置保留到关闭窗口                                       |
| 当前会话的高亮选择器作用在错误元素               | 选中样式绑定实际会话行，保留 `aria-current`                                                                                |
| 单会话工作区重复显示相同标题                     | 单会话直接展示；有多个关联会话的工作区继续保留可折叠分组                                                                   |
| 置顶使用不一致的文本符号                         | 使用原 DSH 图标，保留可访问名称                                                                                            |
| 左下角设置按钮过小且靠右                         | 改为与导航对齐的整行入口                                                                                                   |
| 模型列表卡片、虚线添加框与设置行风格不一致       | 改为分隔线列表及普通添加操作，保留配置状态与操作                                                                           |
| 长标题可能挤压页头操作                           | 标题区域可收缩并截断，文件入口保留宽度                                                                                     |
| 长模型表单使导航和关闭入口离开视野               | 只滚动右侧内容区；窄屏分类横排，关闭与分类保持可见                                                                         |
| 手机菜单按 Esc 同时关闭整个侧栏                  | 侧栏尊重子菜单已处理的事件；设置关闭后恢复到导航入口                                                                       |
| 隐藏导航仍持有焦点导致可访问性警告               | 设置打开前释放侧栏焦点，后台使用 `inert`，移除重复的 `aria-hidden`                                                         |

## 实现与来源

代码复用已迁入的 DSH 公共组件，不新增依赖、不修改参考仓库或迁入包。
三点图标和显隐行为参考 DSH 的
`packages/client/ui-workspace/src/client/rows/Rows.tsx` 与 `Rows.module.css`；
触摸点击区域在产品样式层扩大，保留原菜单行为。

主要文件如下：

- [共享设置窗口](../../apps/web/src/components/SettingsDialog.tsx)：统一弹窗、分类、焦点和忙碌状态。
- [模型设置](../../apps/web/src/components/ModelSettings.tsx)：保留读取、编辑、测试、保存和移除逻辑，作为分类内容挂载。
- [会话侧栏](../../apps/web/src/components/SessionSidebar.tsx)：菜单入口、分组与置顶图标。
- [应用入口](../../apps/web/src/App.tsx)：设置入口、侧栏键盘事件和焦点归还。
- [产品样式](../../apps/web/src/App.module.css)与[DSH 主题适配](../../apps/web/src/chat-theme.css)：统一面板与遮罩，修复响应式布局。
- [行为回归](../../tests/p2/browser/ui-layout.spec.ts)：分类切换、草稿、菜单键盘、长标题、触摸与长表单滚动。

## 验证

浏览器使用真实 Host、持久化与工具服务，模型采用项目现有受控 fixture；
不把这些结果视为外部模型或 Electron 实机验收。

- `npx --yes pnpm@11.28.5 build:web`：TypeScript 与生产构建通过。
- `node --expose-internals node_modules/@playwright/test/cli.js test tests/p2/browser/ui-layout.spec.ts tests/p2/browser/tools-workspaces.spec.ts tests/p2/browser/foundation.spec.ts tests/p2/browser/conversation.spec.ts --trace=off`：11 项通过。
- `node --expose-internals --test --test-timeout=30000 tests/p2/models.test.mjs tests/p2/chat-settings.test.mjs`：5 项通过，覆盖模型配置、版本冲突、密钥与偏好持久化。
- 最后移除重复的 `aria-hidden` 后，重新构建并单独复验 `ui-layout.spec.ts`：3 项通过。
- 检查 1440、820、390、320px 宽度；长标题无横向溢出。触摸场景验证 44px 菜单入口、内容滚动与关闭焦点。
- 两个设置分类的窗口位置与尺寸相同，桌面为 940 × 640px；遮罩均为 `blur(4px)`。
- Impeccable 对本次应用文件的机械扫描无报告项；视觉检查覆盖桌面与窄屏截图。

本地截图位于 `reports/ui-layout/`。构建仍提示既有大资源包警告，
本次未处理打包拆分、万条历史性能或其他原计划开发项。
按用户后续要求，与本会话的对话和输入区 UI 改动合并为一次中文提交，不推送；
用户原有 `AGENTS.md` 与 `docs/design/` 改动保留，不纳入提交。
