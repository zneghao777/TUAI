# P2 DSH 换壳收口验收

2026-10-28，覆盖 TZ-065～069 与重新打开的 TZ-022。任务状态唯一维护在
[总计划](../../总开发计划与进度记录.md)。本记录补充旧 P2、TZ-062～064 的历史证据，
不把旧报告的自制 Composer、平面会话列表和纯文本队列语义当作当前实现。

## 生产组合

DSH 基线为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，参考仓库保持只读。
M4 累计 67 包，本批增加 19 包；运行时仍只有原 Session、Agent Loop、Connection 和生成协议。
[客户端组合](../../apps/web/src/model/chat-runtime.ts)直接挂载原 Layout、Workspace、
Conversation、Lexical Composer、Commands、References、Quotes、Questions、Approval、
Permission、Goal、文件树和文档预览。原产品 App／Composer／Interactions 退出生产导入链。
[产品 UI](../../apps/web/src/ui.tsx)只负责天质品牌、主题、设置组合和文件产物入口。

| 任务   | 本批实现                                                                                                        | 验证入口                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| TZ-065 | 原输入状态机、动态 `/`／`@`、模型与推理菜单、附件、Quote、QueueDock；IME 与键盘仲裁沿用原实现                   | 原组件测试、浏览器 chat／composer-controls／remaining                 |
| TZ-066 | 四项权限、完全权限／Auto 风险确认、当前与默认权限分离；goal／plan／compact／feedback／export 的真实 Host 处理器 | remaining-host、原 Auto／Goal／Plan／Command 测试、真实 DeepSeek      |
| TZ-067 | 原逐题问题、自由回答、规划审阅、审批详情与失效；等待期间可追加输入；按请求身份恢复                              | chat、多窗口竞争、HTTP 回执丢失／重连、submission-recovery            |
| TZ-068 | 原树／平铺／排序／过滤、内容搜索、置顶／归档／恢复、会话及消息位置分叉、独立受管目录                            | 原 Workspace 组件与 Host 测试、tools-workspaces／foundation／platform |
| TZ-069 | 原富文本、图片、代码／HTML／PDF／表格预览、文件树；鉴权产物与下载、已清理和不可预览错误                         | 原预览测试、remaining／chat-layout／chat                              |
| TZ-022 | 以上生产组合、真实模型与网络工具、平台契约、万条历史和独立目录构建重新验收                                      | 最终命令与结果见下文                                                  |

用量 UI 继续隐藏；保留当前已批准的上下文百分比及构成面板、真实日志和整轮耗时。
新会话由 Host 创建独立目录；分叉留在来源目录，旧历史不搬迁，归档不删除数据。
界面不提供自定义目录、连接工作区或目录路径标签。左下角设置包含原对话、输入、主题和默认权限偏好，
已有模型管理及凭据仍由天质自己的配置层管理。

## 必要适配

- 按 Host 隔离原导航、布局、草稿与待确认输入缓存。导入旧草稿和上传收据，原数据不删除；
  旧待确认请求沿用原 requestId 与内容顺序，迁移只执行一次。
- 原审批接管面板保留；产品通过默认关闭的 `approvalInput` 选项在审批等待时同时提供原 Composer。
  排队输入不等于批准工具。换窗口、取消、过期仍由同一 Host 请求决定。
- 队列编辑 RPC 仍只接受文本，Host 保留已准入的附件及引用，不接受任意替换的附件身份。
- 请求发出前保存身份；只对不确定的传输失败有限重试一次。明确拒绝保留可编辑草稿；
  刷新只核对历史／Inbox，不自动重发。上传中的文件刷新后明确要求重新选择，禁止发送伪造空文件。
- WorkingDirectory 和 WorkspaceFiles 使用 Session cwd；原文件 API 的私有目录、归属和软链接检查继续有效。
- 新安装默认 workspace-write＋ask，历史配置不提权；Auto 不作为默认值，真实审查失败不放行，
  卸载 Auto 将当前 Auto 会话限制为 readonly＋ask。
- 反馈只写本地会话。导出和下载走鉴权接口。HTML 预览使用空 sandbox，脚本及外部资源不执行。
  未接入桌面 Office 转换服务的格式明确报不可预览，可下载原文件；不宣称具备完整原生 Office 能力。

本次未新增 HeroUI 依赖：现有 DSH 原组件已覆盖操作与可访问性，复用它们可避免维护第二套状态机。
测试新增 React Testing Library 与同版本 React，仅供原 Slot 运行环境使用；生产 React 身份保持单份。
原 Excel／Lexical／node-pty 依赖补丁、PDF 静态资源与许可证随构建保留，离线产物不依赖同级源码。

## 来源与复现

来源文件、原 hash、本地 patch 和测试专用闭包见
[M4 登记](../migration/M4-迁移登记.json)、
[本批原始源码归档](../../provenance/dsh-p2-completion.tar.gz)、
[本地补丁](../../provenance/dsh-p2-completion-local.patch)。M1／M3 的跨包适配同步登记，历史归档不改写。
Skill／Secret 的少量 UserText 代码以及 tool-subagent 只供原测试闭包，不因此启用对应产品功能。

```sh
npx --yes pnpm@11.28.5 run check
node --expose-internals node_modules/@playwright/test/cli.js test --config playwright.config.ts --trace=off
node scripts/verify-conversation-parity.mjs /path/to/locked/deepseek-harness
node --expose-internals scripts/verify-p2-real.mjs --run
node --expose-internals scripts/verify-real-web.mjs --run
npx --yes pnpm@11.28.5 run verify:clean
```

最终验证结果（2026-10-28）：

| 检查                          | 实际结果                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| 空缓存独立目录 `verify:clean` | 通过；全新 npm 缓存与 pnpm store，安装 reused 0；安装 25.5 秒，完整 `check` 135.1 秒        |
| 构建、格式、来源和许可        | Host／Client 类型与 20 项生成协议、Web 构建通过；209 个独立包、4,177 项声明导入、347 项许可 |
| P0／P1 回归                   | 14 项启动／平台＋58 项 P0；4,670 项 P1＋10 项产品集成通过，1 项既有跳过                     |
| P2 单元／组件与 Host          | 5,089 项通过、4 项既有跳过；10 项真实 Host 集成通过                                         |
| 浏览器完整回归                | 同一完整运行 42/42 通过，0 失败、0 重试；含 PDF 真正渲染及 XLS Worker／中文单元格           |
| 同基线对照                    | 相同 11 份 fixture，220 项原始源码与 220 项产品断言通过                                     |
| 真实 Provider                 | DeepSeek Flash 的思考、Bash 审批、问题回答、整轮时间恢复、Auto 审查通过；真实搜索与抓取通过 |

独立构建运行源码指纹：`61fac23bbb36830396fe1b4407967384b62e50c7e93dc57f3cc595ced7703ff5`。
后续仅补充浏览器验收断言与文档记录，生产源码未变化。

首轮空缓存检查曾有一次原文件监听测试超时，未计通过；独立单项 43/43、
100 次连续立即重命名监听及第二轮完整空缓存均通过，保留此偶发性记录，不声称修复了一个已定位的监听缺陷。
此前浏览器失败分别定位到乐观队列尚未准入、原组件控件语义及触屏尺寸，修正后完成上述整轮回归。

受控模型浏览器测试连接真实 Host、JSONL、上传、权限和工具执行；
不能替代真实 Provider。真实模型脚本使用隔离临时 Profile，复制天质自己的加密配置，退出清理，
不输出或提交凭据。已实测 DeepSeek Flash 的 reasoning、Bash 一次审批、ask_user_question、
刷新后相同整轮耗时，以及一次真实 Auto 审查请求和执行成功；页面异常为零。

截图和机器报告位于忽略目录 `reports/p2/`，不把运行数据写入设计原稿。
独立目录验收不携带 node_modules、lib、缓存或 Host 数据；安装仍有界，完整 check 预算调整为 600 秒，
避免增加原组件测试后被旧 180 秒总时限截断。超时仍视为失败。

## 对齐案例与证据

| 案例       | 实施与验证证据                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| DSH-01～03 | 原 Chat／Conversation 同 fixture 对照；conversation 浏览器套件；真实 reasoning 与整轮计时                |
| DSH-04～06 | tools-workspaces Host／浏览器、nested；真实 Shell／终端／文件及 Web Provider                             |
| DSH-07～09 | Commands／Trigger／Reference 原测试；remaining、chat、composer-controls；附件队列编辑与跨 Host 拒绝      |
| DSH-10     | remaining-host、原 Permissions／Auto 测试及生产模型实际审查；默认值／旧会话隔离                          |
| DSH-11～12 | 原 Goal／Plan／Compact／Feedback／Export 测试；remaining 的菜单、目标、计划审阅与实际 ZIP 下载           |
| DSH-13～14 | 原 Questions／Approval；chat 多窗口、过期、取消、等待追加输入；用量隐藏与上下文回归                      |
| DSH-15     | 原 Workspace 树／导航测试；tools-workspaces、remaining、foundation、platform；归档、fork、恢复及目录授权 |
| DSH-16     | 原富文本／预览测试；chat-layout、remaining、ui-layout；真实 PDF／XLS、HTML 隔离及鉴权下载                |

## 长历史性能

在 Apple M5 Pro、macOS arm64、Chrome、1440×1000 下，实写并加载 10,000 条历史／50 页。
采样确认 Host 主要在等待浏览器，耗时集中在消息滚动测量触发的布局。原用户消息节点增加
`content-visibility: auto`，并将跨所有兄弟节点的间距选择器改为局部规则；保留全部历史节点、
查找及轮次导航。最终完整回归首屏约 70 毫秒，点击到回答绘制约 1,294 毫秒，自动化总耗时约 1,541 毫秒，
DOM 132,169 个。本轮门禁是首屏 1 秒、点击到绘制 2 秒以内；1 秒优化目标尚未完全达到。
诊断中的 2,000 条样本只用于定位，不作为万条验收结果。旧 15.6 秒与本轮修复前约 21 秒报告保留其历史含义。

## 边界

本轮止于 P2。Skill 管理、独立轨迹页、产品 TaskRuntime、多 Agent、MCP、浏览器接管、定时通知及
Electron 实壳仍在后续阶段。当前验收平台是 macOS arm64＋Chrome；跨 OS 和真实移动设备留 P7。
Web／Shell 的既有网络与沙箱事实边界沿用 TZ-064，不把 Shell 写入限制表述为整机读取隔离。
PDF／Excel 为按需加载的大块资源，保留构建体积警告；本机验收不等于完成弱网和所有设备的优化。
