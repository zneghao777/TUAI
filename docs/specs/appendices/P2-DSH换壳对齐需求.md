# P2：DSH 换壳对齐需求

P2 的交付目标是**以 DSH 原工作区为准的换壳版 DeepSeek Harness**。
用户与 Agent 对话时，输入方式、执行过程、思考内容、工具与沙箱结果、问题审批、
会话操作和协议行为必须与锁定 DSH 基线对齐。优先迁入原组件及组合，保留天质品牌与浅色主题。
“简易版”不再表示把这些能力压缩成一个输入框、文本流和通用工具卡片。

2026-10-28 用户进一步确认：暂不追求天质自己的交互做法，先以 DSH 为准。
现有布局、卡片尺寸、入口位置与自制 UI Kit 都不能成为迁移限制；结构、密度、
菜单、状态变化和操作顺序也属于对齐范围，不能仅做到协议可调用。
本版需求来自 DOC-005 的新截图和 TZ-062 后两方源码复核，不以需求条目表示实现完成。
实现状态、任务依赖和阶段出口唯一维护在[总开发计划](../../../总开发计划与进度记录.md)。
决策边界见 [ADR-015](../../adr/ADR-015-P2换壳与交互迁移.md)。

## 0. 2026-10-28 用户补充（随 TZ-064 实施）

本次用户明确授权以下调整，优先于此前默认工作区与用量展示方案：

- 暂时隐藏用量统计及对应显示开关；保留真实统计、日志和协议，待后续明确恢复展示。
- 左下角“模型”改为“设置”，集中承载模型配置与原 DSH 对话显示设置；下拉菜单采用不透明底色。移除右上角显示设置入口。
- 重命名、分叉、归档移入侧栏会话行菜单，复用 DSH 原菜单与归档状态语义；包括置顶、复制 Session ID、已归档列表和恢复。移除右上角重命名与派生按钮。
- 移除连接与工作区入口和搜索栏下方连接标签。新会话由 Host 自动创建独立受管目录，不展示路径、不提供自定义目录；归档保留目录和历史，不删除数据。
- “新会话”创建独立工作区；“分叉会话”按 DSH 原语义复制对话历史并留在来源工作区，避免历史文件引用失效。已有会话 cwd 和文件不自动搬迁。
- 执行层按 Session cwd 和当前权限解析，文件 API 拒绝跨会话私有目录访问；原 Shell 沙箱的写入限制不等于读取隔离。TZ-064 维持现有 Profile 默认；新安装的 workspace-write＋ask 默认与四项权限入口在 TZ-066 接入。本次不自动给历史会话提权。

上述侧栏和设置调整是 TZ-068／067 的提前交付子集，不代表两项全部完成。
验收须覆盖实际菜单、刷新持久化、空闲／运行中归档、独立目录及工具权限，不能只删掉按钮。

## 1. 核对基线与证据边界

下表记录 DOC-005 当时的比较证据：使用本地源码与用户提供的运行界面，
未重新运行应用、模型或上游 UI 测试。后续实施与验收记录见总计划。

| 对象 | 本次证据 |
| --- | --- |
| TIanZhiAI | HEAD `6d65d4e0657e6035b6f9442545ed4c250bfdb62e` 加当前未提交 TZ-062 修改；不能只比较 HEAD 忽略工作区 |
| DSH | `/Users/zenghao/杭州天智项目/deepseek-harness`，HEAD `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`；工作区干净，与锁定基线一致 |
| 用户提供的界面 | DSH 的执行过程、1 分 20 秒整轮耗时、工作区树、四项权限菜单；天质的通用 Bash 卡片、重复批准提示、平面会话列表和静态权限文本；沿用前次 `/` 菜单目标 |
| 未确认部分 | 已安装 DSH App 是否与源码基线完全同版；截图不用于推定后台协议、统计真实性或赛事内容正确性 |
| 工作区保护 | 原有 `AGENTS.md` 修改与未跟踪 `docs/design/` 保留；本轮不改设计原稿、应用代码或参考仓库 |

下文 DSH 路径均相对上述锁定仓库，产品路径相对 TIanZhiAI 根目录。
组件名称只作为定位入口；迁移必须核查实际 import、插件注入、Slot 和资源闭包。

## 2. 范围与一致性标准

本次确认的是 P2 对话工作区的功能与交互对齐。原有产品后续阶段继续在该基础上开发。

| 范围 | 要求 |
| --- | --- |
| P2 必须交付 | 单会话 Agent 对话闭环、完整过程展示、Composer、指令、模型／权限选择、文件／会话引用、工具／沙箱、问题审批、用量、工作区与会话、产物和恢复 |
| 本次明确暂缓 | Skill 发现／选择／管理界面，独立“轨迹”页；保留协议兼容及日志，不删除聊天内过程和工具树 |
| 保持原阶段 | 长期 Agent／团队／跨 Agent 持久任务与 MCP 管理在 P3，OpenMuse 浏览器和真实接管在 P4，Skill 学习在 P5，定时计划／自动化与主动消息在 P6，Electron 实壳与安装在 P7 |
| 产品独立配置 | 天质品牌、主题、模型配置与凭据、反馈归属；不复制 DSH 账户、遥测和更新服务器。权限菜单和默认值管理按 §5.1 迁入，不能以产品策略为由永久裁掉预设 |

“交互协议完全一致”按以下三层验收，不能只比较最终回答：

1. **接口与事件**：共同能力使用原方法、生成 codec、参数、错误、取消和回执语义。
   保持 Session 日志、Follow、Assistant attempt／revision／index、连接 generation。
   产品扩展使用自己的命名空间，不能把简化协议伪装成 DSH 协议。
2. **行为**：相同输入手势与事件顺序得到相同菜单、草稿、排队／插话、折叠、
   等待、停止和恢复结果；菜单选择有真实处理器，不能发一句提示词代替命令。
3. **呈现结构与内容**：DSH 对话中可查的 reasoning、步骤、命令、结果、错误、耗时、
   关联与用量保留真实数据（按 §0 暂隐藏用量 UI），过程层级、行密度、折叠入口和操作位置也要对应。
   颜色、字体、圆角、材质可以保留；不得用“大卡片＋额外说明”替代原紧凑过程列表。

默认展示对齐 DSH standard 策略：执行中有过程摘要，过程组与思考行可展开；
完成后可折叠本轮过程并保持回答可读。迁入 compact／standard／detailed／verbose
及折叠时机的策略，不用“极简”删掉信息。去掉多余宣传、说明和次标签，不能删执行证据。

`/plan` 是当前 Session 的规划模式；`/goal` 是当前 Session 的有界目标续跑。
它们不等于 P6 的计划触发，也不拥有 P3 Task 表、租约或跨 Agent 结算。

## 3. 两方源码差距与迁移落点

旧 P2 已有的底层继续复用。下表保留 DOC-005 时的源码观察及新增要求，后续 TZ-063／064 的实现见总计划与核验记录；不把包已复制、测试已存在
或某个协议可调用等同于产品界面已接通。

| 能力 | DSH 证据入口 | 产品现状与差距 | P2 迁移／改造要求 | 任务 |
| --- | --- | --- | --- | --- |
| 连接与会话对象 | `api/session-controller/src/client/`、`client/connection/` | 已迁入并接到 `apps/web/src/model/client.ts` | 保留对象与 wire 层，新增模块沿用生成和订阅生命周期 | TZ-062 |
| 前端组合 | `client/ui-conversation/src/client/apply.ts`、`ui-layout`、`ui-sidebar`、`ui-session` | TZ-062 已挂 Renderer／UiSession 等基础，但 `ui.tsx` 仍注册自制 App／Workspace；settings 仅来源和契约，未启用生产运行时 | 迁原主布局、会话骨架、侧栏和所需 settings 运行时；不是把旧组件包进 Slot 就算换壳 | TZ-063/065/068 |
| 思考流 | `ui-chat/src/client/conversation-nodes/assistant.ts`、`chat/ReasoningRow.tsx` | `model/transcript.ts` 只归并 text-delta，纯 reasoning 的持久消息被跳过；Conversation 不渲染 reasoning | 迁入 reasoning-delta、block-start/end、持久 reasoning、retry 和 interrupted 处理；逐块可展开 | TZ-063 |
| Turn／Step 过程 | `ui-conversation/src/client/conversation/assembler.ts`、`ui-chat/src/client/conversation-nodes/turn-process.ts`、`process-groups.ts`、`presentation-policy.ts` | Transcript 为扁平 Row；turn/start、step/start/end 被忽略，turn/end 变单条提示 | 迁入组装／投影／分组／折叠策略，显示本轮状态与时间，不把中间回复误当最终回答 | TZ-063 |
| 专用工具结果 | `ui-tool/src/client/tool/models/`、`toolviews/`、`ui-chat/src/client/conversation-nodes/tool.ts` | Conversation 是统一参数 pre 与原始输出卡；有 PTC 父子挂接但无完整专用呈现 | 迁入终端、读写／diff、搜索／网页、图片、todo、问题和 generic 模型；保留工具树、原始详情、错误和长输出 | TZ-064 |
| Host 操作闭环 | `shell/*`、`terminal/*`、`api/terminal-controller`、`sandbox/*` | `agent-runtime/src/host-tools.ts` 只读文件；Bash 后台关闭，15 秒默认／30 秒最大；每次需审批 | 核查并迁入当前对话需要的文件变更、长命令／后台任务／终端与取消链；真实能力由 Profile 和权限限定 | TZ-064 |
| 搜索／抓取 | `web/web`、`tool-web`、`web-fetch-http`、`web-search-deepseek` | 生产 Host 没有 web 工具组合 | 纳入 P2，先迁工具和 Provider 接口，再接有效搜索配置；抓取保留地址校验、重定向与错误语义 | TZ-064 |
| 输入状态机 | `ui-conversation/src/client/` 下的 `input/machine.ts`、`draft.ts`、`input/editor/`、`queue/QueueDock.tsx` | Composer 使用 textarea；Interactions 队列编辑只保留 text 并明示替换附件 | 迁入结构化草稿、编辑器、提交状态机、引用与附件编辑；排队编辑往返不能静默丢附件 | TZ-065 |
| `/` 与 `@` | `ui-input-trigger`、`ui-commands`、`ui-reference`、`context/session-reference` | `/` 无候选／命令处理；没有文件与会话的统一 @ 引用入口 | 迁入检测、候选、claim、键盘仲裁、目录缓存、命令执行；Host 补齐引用解析 | TZ-065 |
| 内置命令 | `command-compact`、`goal/*`、`plan/plan-mode`、`command-feedback`、`session-log-export` | Commands 服务已挂载，permission 可注册；目标、规划、手动压缩、导出、反馈的完整组合未接 | 命令 UI 与 Host 处理器成套接通，不能只做截图中的菜单 | TZ-066 |
| 权限与模型 | `ui-permission-presets`、`ui-model-selection`、`experimental/auto-review` | 模型及推理选择已有；权限仅显示 `defaultPreset` 文本，Profile 只有 readonly，Auto 未迁入 | 三个常规预设＋真实 Auto、原确认和 settings 默认值管理；读取会话实际投影，去掉 Bash 一律重复审批的产品限制 | TZ-064/066 |
| 问题与审批 | `ui-user-questions`、`ui-approval` | Remote 已接；AppClient 未保留 callId 等完整呈现关联，问题为简化表单 | 迁入请求身份、逐题导航／草稿、推荐项、plan-review、审批工具详情、失效和焦点控制 | TZ-067 |
| 用量与状态 | `ui-chat/src/client/chat/TurnUsagePanel.tsx`、`ui-conversation/src/client/skeleton/ContextMeter.tsx`、`session-stats` | stats 包存在；Transcript 忽略 usage，页面无 DSH 对应统计 | 轮／步数、耗时、速率、Token／缓存与上下文按真实投影显示；缺值不填 0、不编费用 | TZ-067 |
| 工作区与会话 | `ui-workspace`、`api/workspace-controller`、Session Controller | App 仅按已载入标题筛选，固定 Host 启动 cwd；有重命名与整会话 fork | 补工作区树／选择、会话检索、置顶／归档／恢复及消息 atSeq 分支；Host 路径与授权同步 | TZ-068 |
| 富文本与产物 | `ui-primitives`、`ui-chat/src/client/chat/AssistantMarkdown.tsx`、`ui-sidebar-files`、`ui-sidebar-documentpreview`、`ui-sidebar-right` | 安全 Markdown／图片下载已有；无同等代码／diff／引用预览和资源面板 | 迁入流式 Markdown 等成熟行为；文件、代码、diff、图片与产物可查看／复制／下载，未知格式退回安全下载 | TZ-069 |

上表 DSH 路径省略 `packages/`；UI 包名未带 client 前缀时均位于 `packages/client/`。
同一格中后续文件名相对其前述目录；产品路径相对本仓库。
可直接核查产品证据：[Transcript](../../../apps/web/src/model/transcript.ts)、
[Conversation](../../../apps/web/src/components/Conversation.tsx)、
[Composer](../../../apps/web/src/components/Composer.tsx)、
[Interactions](../../../apps/web/src/components/Interactions.tsx)、
[AppClient](../../../apps/web/src/model/client.ts)、[工作区](../../../apps/web/src/App.tsx)、
[Host 工具](../../../packages/product/agent-runtime/src/host-tools.ts)、
[最终权限](../../../packages/product/agent-runtime/src/permissions.ts)、
[Web Host 组合](../../../packages/product/web-host/src/index.ts)。

### 3.1 TZ-062 后仍未迁到主界面的部分

以下是 2026-10-28 的源码观察。包存在、契约生成、生产挂载、行为通过必须分开记录。

- **已经接入**：Renderer／Slots、UiSession、RemoteAccess、LocaleRuntime、Shortcuts，
  以及此前的 Connection／Session／codec。它们负责服务和订阅，不自动提供 DSH 页面。
- **只有来源／契约**：ui-settings、settings-controller 尚未挂生产；ui-primitives 仅使用
  少量基础入口。复制来源文件不能证明显示模式、全局设置、菜单和原富文本已经可用。
- **仍在使用简化实现**：[ui.tsx](../../../apps/web/src/ui.tsx) 的 root Slot 注册自制 App，
  session Slot 注册自制 Workspace；[ui-foundation.ts](../../../apps/web/src/model/ui-foundation.ts)
  未挂 Conversation／Chat／Tool／Workspace／Commands／Permission UI。
- **实际丢失的数据**：Transcript 的 internal 集合忽略 turn/start、step/start/end、usage
  和权限变化；只归并文本流，纯 reasoning 消息被跳过。turn/end 变成“本轮已完成”。
  当前工具展开后的耗时只是一次工具调用耗时，不能充当整轮执行时间。
- **画面差距的来源**：Conversation 把每个工具渲染为大卡片；approval/decided 再增加
  一条“已批准本次操作”通知。最终回答与过程没有上游层级，既拉长页面又遗漏思考。
- **原计划漏项**：ui-layout／ui-sidebar 仍列 reference_only，auto-review 仍列 deferred。
  本版将主框架和相关 settings 改为必迁候选，Auto 纳入 TZ-066，避免继续留下简化壳。

替换完成后，旧 Transcript、Conversation、Composer、Interactions 和 App 工作区的
对应生产路径退出；可以保留回归 fixture，不能长期维护两套会话投影或输入状态机。

## 4. 对话过程与工具显示合同

迁移以同一会话事件输入产生相同可观察结果为目标。不能在原扁平 Row 上只增加一行
“正在思考”，也不能以另一个前端计时器替代真实状态。

- 按 Session → Turn → Step → 内容块／工具调用组装；临时流与持久结果使用稳定身份合并。
  thinking、工具调用、中间回复、最终回答按原顺序保留，PTC 子调用挂在真实父调用下。
- 仅显示模型接口实际返回的 reasoning 内容；无该字段或推理关闭时不制造思考。
  不推断、请求或伪造模型未返回的内部推理。独立轨迹页暂缓不影响这些内容。
- 迁入执行摘要、思考行、工具行的展开状态与滚动行为；完成、失败、停止、重试、
  等待确认分别呈现。完成耗时基于事件，不以 accepted 或模型文字判定成功。
- 命令记录显示真实命令、cwd、已返回输出、错误、退出状态与可用的 job／terminal
  关联。后台已启动不等于命令已结束；协议没提供实时输出时不能伪造字符流。
- 文件读取显示实际文件／范围；变更显示真实 diff；搜索显示 query 和来源；网页显示
  URL 与正文／失败；支持图片和 todo。未知工具保留完整通用路径。
- 大结果折叠／分段展示并可取原文；spill、清理、超时与不可用明确区分。
  不能从一段截断输出猜测退出码，也不能把搜索摘要冒充网页已获取。
- 沙箱是 Host 真实执行环境，前端显示当前实际权限和审批对象。保留最终工具 guard、
  取消、租约／资源释放边界；新工具不因换名就绕过现有 Bash 的保护。

文件写入、长命令和多个工作区都需要 Host 改造，不能只显示可点击控件。
旧 Host 以启动 cwd 限制文件访问；迁入自动受管工作区时必须同时核对 Session cwd、
允许根目录、软链接、私有数据目录和产物归属，不能简单放开全盘读取。

### 4.1 截图对应的结构与时间

默认界面使用 DSH 的用户消息与时间／操作区 → 整轮状态／耗时 → 过程摘要 →
紧凑思考／工具行 → 最终回答与消息动作。过程列表有原来的高度约束、内部滚动、
单行摘要与展开详情；失败行突出错误，不在每个成功工具之后插入重复批准说明。
审批事实保留在关联请求、工具详情和日志中，不能因为删除冗余文字而删除审计记录。

时间和统计按不同口径迁入，不能混用：

| 展示位置 | 来源与验收 |
| --- | --- |
| 执行中状态／计时 | `ui-chat/src/client/chat/RunningStatus.tsx`；仅运行中挂载，从当前 Turn startTime 计时，客户端不可观察时冻结显示，重连继续原起点 |
| 已完成，用时… | `chat/TurnProcessNodeView.tsx`；正常完成用 `turn.end.time - turn.start.time`，显示最少 1 秒；停止／中断与错误使用原状态文案，不冒充正常完成耗时 |
| 单个工具详情 | 实际工具开始／结果、终端或 job 记录；不相加替代 Turn 时间，后台启动不等于完成 |
| 消息时间与动作 | 持久消息身份及时间；复制、引用、反馈、消息边界 fork 与用量入口按原 Slot 接入，不能只有复制 |
| 底部统计与详情 | `TurnUsagePanel`、session-stats、`ContextMeter`／contextPressure／contextBreakdown；轮／步数、tok/s、Token、缓存和上下文分别取实际数据；上下文估算保留估算含义 |

compact／standard／detailed／verbose、completion／next-input 折叠时机和 all／final
折叠后保留回复的选择，由原 `ui-chat/src/client/presentation-policy.ts` 与 Host settings
驱动。必须有可用设置入口和刷新恢复，不能只把四个模式写进前端枚举。

## 5. Composer 与命令合同

Composer 迁入 DSH 的编辑器和提交行为，再替换视觉；`/` 不做本地硬编码按钮列表。
真实协议为 `remote.commands.list(sessionId)` 与
`remote.commands.execute(sessionId, line, attachments)`，通过生成代理处理信号。
Host 实现接收解码后的 Agent 作用域；前端不能传任意 Agent 实例或新造 REST 命令接口。

| 入口 | P2 行为与来源 |
| --- | --- |
| `/` 或添加按钮 | 打开添加／指令分组；动态合并 Host catalog 与客户端 contribution；Skill 分组本期隐藏 |
| `/file` 文件 | `ui-conversation/src/client/apply.ts` 注册的客户端动作；调起附件选择，不发送给模型作命令 |
| `/model` 模型 | `ui-model-selection` 客户端贡献；选择真实目录和推理等级，沿用 Session selectModel |
| `/permission` 权限 | `permission-presets` Host 命令与 UI picker；显示当前会话预设／custom，变更后以实际投影收敛 |
| `/compact` 压缩 | 迁入 `compaction/command-compact`；真实压缩、进度／结果／失败与取消，不以清空界面代替 |
| `/plan` 规划 | 迁入 `plan/plan-mode` 和 `ui-plan`；进入／退出、提示上下文、exit_plan_mode 审阅及返回修改 |
| `/goal` 目标 | 迁入 `goal`、`command-goal`、`tool-goal`、`goal-round-driver` 与 `ui-goal`；创建／查看／编辑／暂停／恢复／清除，有界同会话续跑 |
| `/feedback` 反馈 | 迁入当前会话反馈事件和输入行为；反馈属于天质，不接上游遥测或自动外传；回执区分已记录和持久化 |
| `/export` 下载日志 | 迁入 `session-query/session-log-export` 的 ZIP／Markdown 路径和客户端贡献；鉴权、flush、失败与实际下载分别验证 |
| `@` 文件／会话 | `ui-reference`、fileReferences、sessionReferenceResolver；按当前 Host／工作区授权解析，保留引用身份和文本编码 |

补全必须覆盖输入过滤、中英文命令别名、上下选择、Enter／Tab 接受、Escape 关闭、
菜单失效与焦点返回。已 claim 命令、未知 slash 文本、目录暂不可用、重复点击和附件
接纳按上游状态机及测试判定，不能把加载失败降级为误发普通聊天。

发送／换行／加速发送、IME 合成保护、连续两次 Escape 停止及弹层优先消费 Escape
按 DSH `keymap.ts`、`submission-policy.ts`、`stop-sequence.ts` 迁入。
队列、插话与停止仍使用现有 Session API；编辑草稿和队列需保留附件／引用块。

### 5.1 权限必须迁到执行层

以 `bundle/base/cordis.patch.yml`、`interaction/permission-presets`、
`client/ui-permission-presets` 和 `experimental/auto-review` 为依据。截图四项均属于
对齐目标；Auto 是审查插件贡献的当前会话预设，不是一个无后台的开关。

| 界面选项 | 锁定源码语义 | 产品迁移要求 |
| --- | --- | --- |
| 仅可查看 | `read-only`＋`ask` | 按原沙箱文件策略与提权审批工作；ask 不等于每条 Bash 一律弹窗 |
| 工作区内修改 | `workspace-write`＋`ask` | 当前 Session cwd／授权根内真实读写；越界按原策略拒绝或请求升级 |
| 完全权限 | `danger-full-access`＋`never` | 原确认弹窗与勾选确认；用户明确选择后执行层同步生效，不能仍固定只读或逐次审批 |
| 自动审查 EXP | `auto`，固定 `danger-full-access`＋`ask`，工具前接模型审查 | 原确认、真实 review、拒绝理由和人工审批接力；原生调用及 PTC 内层实际调用均覆盖，审查失败不执行工具 |

以下缺口由 TZ-064／066 一起闭合：

1. 当前选择读 Session `permissions` projection；catalog 只供选项。底部按钮与
   `/permission` 通过同一命令写入，等待真实投影确认；custom、不可用、过期目录分别处理。
2. 分开“本会话权限”和“新会话默认”。锁定 base 无显式覆盖时是 workspace-write＋ask，
   不是全权限。新安装按此基线；旧会话及用户显式配置保留，旧 `readonly` 名称需要兼容。
   默认设置只影响随后创建的会话，Auto 按原约束不进入新会话默认目录。
3. 改造产品 `permissions.ts` 中所有 Bash 强制一次性审批、`host-tools.ts` 中写入工具
   关闭及固定只读／启动 cwd 的组合。使用原每调用策略与确认，不再叠一套与选中预设冲突的规则。
   最终 guard 仍核验当前执行、有效策略／批准和资源归属；全权限不是跨用户或读取产品密钥的权限。
4. Auto 沿原实现从 Session 日志读取 provider／model 配置执行真实审查，不另造一套选择器；
   迁入错误、取消和工具详情模型，未接通不伪装可用，
   也不能隐藏该项后宣称四项菜单已验收。无审查模型或凭据时写明阻塞条件。
5. **上游差异必须登记**：该基线 Auto 插件在热卸载时会将活动 Auto 会话设为全权限。
   这与“不隐式扩大权限”的现有约束冲突。迁移时保留拒绝执行的保护或转回明确受限策略，
   不能无确认转成全权限；记录最小补丁并验证卸载、取消和在途调用。

本需求授权迁移上述管理能力，不是替用户切换正在使用的会话或修改本机运行配置。

### 5.2 工作区与会话管理不能停在列表

以 `ui-layout`、`ui-sidebar`、`ui-workspace/src/client/tree.ts`、
`rows/WorkspaceBrowser.tsx`、`index.ts` 和 Workspace Controller 为实现入口。

- 迁原三栏骨架、侧栏折叠／宽度、会话头部菜单和右栏协调；所需入口由 Slot 注册。
  不受当前 App 的固定侧栏和顶部“重命名／派生”按钮布局限制。
- 迁工作区／文件夹层级、未分组会话、展开收起与“展开其余”、分组／平铺视图、手动／
  最近更新排序、允许范围内拖动排序；新会话改为后台创建独立目录，分叉沿用来源工作区。
- 搜索走 Host `sessions.search`，显示命中摘要与结果上限；不是过滤已经载入的标题。
  行内显示相对时间、运行、待问题／审批、未读完成状态，并在切换和恢复后收敛。
- 迁会话菜单：重命名、置顶／取消、归档／恢复、分支、复制 ID；工作区自动创建、重命名、
  移除与排序使用真实控制器；按 §0 不提供自定义目录入口。工作区移除不能被实现为删除磁盘目录。
- 归档空闲会话可撤销；活动会话先按原提示确认停止再归档；保留日志。归档过滤与恢复
  后再打开按原行为处理，不能用“删掉列表行”伪装归档。
- 侧栏整会话分支与消息 `atSeq` 分支分别实现。Host／工作区切换同步 cwd、文件权限、
  引用、草稿、选中与历史；不能跨工作区继续使用启动目录或上一会话的授权。

原生访达／编辑器打开入口按平台桥能力接入；Web 无该能力时提供真实可执行的路径操作，
在对照记录中写明平台差异。插件管理、自动化任务等后续业务仍按原阶段，不做空菜单。

## 6. 迁移方式与依赖闭包

采取“迁移行为与呈现模块，替换主题和产品组合”的路径。
只重写薄适配层；若某个原模块确实不能直接用，登记原因、公开契约与等价回放证据。

| 批次 | 迁移候选与核查重点 |
| --- | --- |
| M3.1 前端基础 | ui-conversation／chat／tool／commands／input-trigger／session／reference／attachment／workspace／approval／user-questions／model-selection／permission-presets／goal／plan；layout／sidebar／settings 运行时及所需 General／会话偏好是必迁闭包，不仅参考样式；按引用补 locale、shortcuts、primitives 与 slots／renderer |
| M3.2 会话能力 | command-compact、goal 四包、plan-mode、command-feedback、session-log-export、`session/message-quotes`、`context/session-reference`、experimental/auto-review 及权限／settings；检查 Host／Client 双面、Remote 白名单、projection 注册和生成类型 |
| M3.3 工具与资源 | web／tool-web／web-fetch-http 和经验证搜索 Provider；terminal／terminal-bash、所选 shell/job、terminal-controller、workspace-controller、api/workspace-files 与侧栏所需闭包 |

实施时先做以下核验，再加入依赖：

1. 现有 M0／M1／M3 迁移包及本地补丁不能被上游整目录覆盖；保留来源 commit、hash、
   许可、改动原因与回滚点。新增批次单独登记，旧元数据快照不改成完成态。
2. 不能仅扫描 `dependencies`／`peerDependencies`：DSH UI 的 Lexical、React、
   locale 和跨包导入也存在于 `devDependencies`、源码、Slot 与注入声明中。
3. 核查 Lexical 及其子包、Markdown／代码／数学渲染、图标／字体、终端与 Native
   资源，锁定实际使用版本；保持 React／ReactDOM／Cordis／Typert 单份身份。
4. 显式组合 P2 模块；ui-attachment 等共享包可包含 trajectory slot，需移除／禁用
   可选注册而不拖入独立轨迹页。Skill、账户、遥测和完整上游 App 不能因闭包误启用。
5. 新 Host 能力进入生成协议和认证／owner 检查；UI 只持有草稿、面板和展示状态。
   Browser／Task／Agent 等后续对象继续通过公开契约接入，不能产生第二套 Agent Loop。
6. 在同一正常生产 Profile 验证新能力，而非只在 demo 或测试 Host 中注册。

网页抓取与浏览器自动化分别管理。搜索 Provider 的 API 访问和凭据是否可用尚未验证；
已有聊天 Key 不代表拥有搜索能力。优先核查锁定 DSH 的显式凭据路径，不能自动读取
已安装 DSH 的账户令牌。若 Provider 不可用，明确阻塞搜索验收，不伪造搜索结果，
不把网页抓取的地址保护失败改为自动通过 Shell 绕行。

## 7. 对齐验收与交付门槛

新增案例为 [验收附录](验收场景与需求追踪.md#41-p2-换壳对齐验收) 的
`DSH-01～16`。每项记录“上游预期、产品操作、事件／请求、界面结果、差异与原因”。
通过旧 UI-01～06 或真实模型简单求和，不能替代本组验收。

- 同一脱敏事件 fixture 在上游和产品进行对照，覆盖 reasoning→多工具→失败→恢复→回答，
  临时流提交、重试、停止与历史恢复；上游测试未运行时不得写成两方测试通过。
- 实际浏览器操作 `/`、`@`、附件、排队编辑、规划审阅、批准／拒绝、工作区与消息分支；
  同时核对 Host 回执与日志。独立轨迹页关闭时仍能查看完整聊天执行过程。
- 在当前实际支持的 macOS Host 执行真实沙箱命令、文件操作和取消；授权环境完成
  一次真实搜索／抓取与专用卡片链路；分别记录 OS、权限、模型／Provider 和失败边界。
- 在真实模型可返回 reasoning 的配置下验证流式思考与工具过程；关闭推理再验无伪造内容。
  不能复用旧报告“关闭推理”的结果证明思考展示已完成。
- 旧 P2 的鉴权、附件、幂等、重连、窄屏和大历史验证继续保留；新增操作同样有键盘／
  语义角色、稳定目标与可观察回执，供用户和 UI Agent 使用。

UX：操作与执行细节可读可控；DX：复用上游模型和测试，减少平行状态机；
AI Agent 体验：真实工具 Schema／权限／结果一致，UI 可访问、可定位、可核验。
三者分别验收，不能用新视觉掩盖任何一项退化。

执行顺序为 TZ-062～069，最后重新执行 TZ-022。
TZ-015～021 保留原范围完成记录；TZ-022 新出口未通过前，默认不进入 TZ-023。

本版细化原 DSH-01～16，不靠新增任务数量代替实现。每项交付增加一条硬要求：
**生产组合实际使用原模块，用户能在主界面复现相应 DSH 操作，并有对照截图及请求证据。**
TZ-062 仅完成基础接入，不代表主界面已迁；后续不能继续以“已复制 N 个包”作为体验完成标准。
样式微调放在行为对齐之后，不等到 TZ-022 才首次检查主界面。
