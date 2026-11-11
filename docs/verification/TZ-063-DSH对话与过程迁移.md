# TZ-063 DSH 对话与过程迁移核验

2026-10-28。本项把主对话接到 DSH 原组件与交互上。
任务状态以[总计划 TZ-063](../../总开发计划与进度记录.md#tz-063)为准；本记录不代替整个 P2 出口验收。

## 迁入和实际启用范围

基线仍为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，参考仓库只读。
本项迁入 27 包源码及其许可，累计 M4 登记 34 包；来源、文件哈希和本地改动见
[M4 迁移登记](../migration/M4-迁移登记.json)。

| 层次           | 实际采用方式                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 对话对象与投影 | 原 `UiConversation`、assembler、ChatSnapshotBuilder、Turn／Step／块节点；复用既有 Session 服务，无第二份会话真相                                       |
| 主对话         | 原 `ChatView`、`ChatFlow`、`ChatNodeSeat`、`ChatGroupSeat`、`MessageItem`；旧 `Conversation`／扁平 Transcript 已退出生产入口                           |
| 思考与工具     | 原 `ReasoningRow`、原工具插件及专用行；工具状态和错误从真实事件派生，思考保留流式及持久正文                                                            |
| 时间           | 原 `RunningStatus` 和 `TurnProcessNodeView`；运行时间从 `turn/start` 计，完成时间由持久的开始／结束事件计算，不累计各步骤时间                          |
| 显示偏好       | 原 `TranscriptViewRow`、`TranscriptViewPolicy`、`ConfigForms`、`SettingsController` 与生成 codec；标准／简洁／详细／完全展开、折叠时机和回复保留可保存 |
| 主题与图像     | 原图标、基础样式、附件图库；产品只覆盖主题颜色与内容宽度，保留 TUAI 品牌                                                                               |
| 外部框架       | 主会话 Slot 已承载原聊天；当前侧栏、Composer 和审批入口继续由后续 TZ-065／066／067／068 迁移                                                           |

`ui-layout`、workspace、sidebar、plan、goal、schedule、office-to-pdf 等依赖已复制，
只有本项所需的类型、组件或资源被引用，未将整套插件注册到生产 Host。
账户、遥测、技能 UI、独立轨迹页和更新器没有因复制依赖而启用。
Vite 门禁核对原会话组件确实进入产物，同时禁止上述无关运行模块和 Node 外部占位模块进入浏览器包。

## 本地适配及原因

1. 从原 `ui-conversation.apply` 分离 `mountConversationCore`，复用原组装、用户文本和 Session 绑定，避免提前激活完整 Composer、工作区导航。
2. 从原 `ui-chat.apply` 分离 `mountChat`，注入打开会话、打开文件的宿主动作；节点、投影、组、思考、计时及滚动算法保持原实现。当前文件预览给出可恢复的提示，产物下载仍可用；完整预览由 TZ-069 完成。
3. 产品 Host 没有上游 Loader 的配置文档所有权，因此给原 `SettingsController` 注入窄 `SettingsProvider`。只开放 `ui-chat` 偏好，原 schema、Remote 错误和 codec 不变；原子写入 `config/chat-preferences.json`，保留修订号并拒绝旧版本覆盖。没有挂凭据控制器或扩大权限。
4. 补足 API facade 的公开类型导出和真实依赖声明。双面 TS 项目引用指向 Host／Client 叶配置；迁移脚本同步处理，避免依靠已有构建输出通过类型检查。
5. 附件插件保留原图库，移除尚未接入的轨迹 Slot 注册。显示设置使用原 DSH Modal，与原菜单配合，避免浏览器原生 dialog 令 body portal 菜单失去交互。
6. 原 Markdown 增加可继承的外部图片开关，默认仍保留上游行为；产品根显式关闭外部图片自动加载，沿用 TUAI 既有边界。已上传附件仍通过鉴权图库加载，安全回归同时检查 DOM 与实际请求。

原始源码归档和本地补丁分别为
[`dsh-tz063-conversation.tar.gz`](../../provenance/dsh-tz063-conversation.tar.gz)与
[`dsh-tz063-conversation-local.patch`](../../provenance/dsh-tz063-conversation-local.patch)。
既有 M3、TZ-062 归档及补丁保留。新增核心入口在登记中作为 additionalFiles 记录。

构建沿用静态 ESM 与资源复制方式。测试新增 `@testing-library/dom@10.4.1` 满足原测试依赖，
虚拟列表依赖对齐上游 `3.14.10`；类型闭包中的 OpenTelemetry API 固定 `1.9.0`，满足其 peer 范围。
未关闭严格 peer 检查，未启用遥测。依赖许可核验共 273 条通过。

## 验证证据

| 验证                                                                 | 结果                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`、Host 构建、`pnpm build:web`                        | 独立目录从源码通过类型、生成协议、Host 与生产前端构建                   |
| `node scripts/verify-conversation-parity.mjs ../deepseek-harness`    | 11 个完全相同的 fixture 文件，在原始基线和迁入代码上分别 220 / 220 通过 |
| `pnpm test:p2`                                                       | 独立目录 1,636 项单元测试、7 项真实 Host 测试通过                       |
| `pnpm test:ui --trace=off`                                           | 最终一次 26 / 26 通过（约 2.8 分钟），包含一万条历史与新增 4 场景       |
| `node --expose-internals scripts/verify-real-conversation.mjs --run` | 真实 DeepSeek 高推理、工具执行、主界面和刷新恢复通过                    |
| `pnpm check:workspace`                                               | 176 包、3,457 处声明导入、共享身份与源码哈希通过                        |
| `pnpm check:licenses`                                                | 273 条依赖／迁入包许可通过                                              |

对照脚本只从锁定基线归档源码，在临时目录用本项目的依赖环境运行相同原测试，
校验 fixture 字节哈希；它证明投影与状态语义对齐，不声称已验收完整上游桌面应用。
覆盖事件组装、思考和文本块、旧 attempt、持久替换、retry／interrupted／unknown、
过程分组、计时与用户手动折叠状态。原始测试、生产组合和产品浏览器场景分别保留。

浏览器场景使用真实 Host／Session／读文件与审批工具，受控模型只负责稳定输出事件。
新增场景核验思考流、纯思考停止、重连、无思考回答、红色失败行、紧凑行高、
长过程内部滚动、四种显示模式、偏好持久化和刷新后耗时不变。
原审批、附件、排队、插话、断线恢复、历史分页及代理路径回归继续保留。

DSH 的历史实现保留已加载节点以支持轮次导航和浏览器查找，未照搬旧 TUAI 的
“DOM 少于 40 条”指标；主动发送会跟随新输入，远端增长时保持读者位置。
这是本轮依照 DSH 交互基线调整的验证口径，不能继续宣称旧虚拟列表实现仍在运行。

本次 M5 Pro／macOS arm64／Chrome、1440×1000 实测：初始可见 174 ms，
50 页全部加载后约 132,003 个 DOM 节点，新输入至显示约 15,646 ms。
这较旧 TUAI 约 297 ms 的记录明显退化，不能以功能通过掩盖。已加入 TZ-067 和
TZ-022 的渲染与性能复核；本项不宣布 P2 性能验收通过。

独立目录复验命令为 `node /tmp/tianzhiai-063-independent.mjs`，报告
`reports/p2/063-independent.json` 记录离线 frozen 安装、Host／Web 构建、来源／许可和 P2 测试均通过。
它复用 pnpm 内容缓存，但不带已有 `lib`、`dist`、node_modules、Native 输出或 tsbuildinfo，目录外没有参考源码。

## 真实模型结果

使用已有本机加密配置，在隔离临时 Host 中调用 `deepseek-official / deepseek-flash`，
界面选择高推理。没有输出或更改用户密钥；临时配置和会话随测试清理。

本次成功样本记录 2 个思考块、2,646 个思考字符、2 个助手消息、2 次真实
`sum_numbers` 调用。Host 整轮为 **8,602 ms**，页面显示 **“已完成，用时 8秒”**。
刷新后思考块数量、内容来源和时间一致，页面无 JavaScript 错误。
这些是本机小样本，不是模型速度或效果承诺。

真实接口也曾对简单问题不返回思考块；此时界面正常显示工具和回答，不伪造思考。
验收脚本随后采用需要分析的题目检查实际返回的 reasoning。脚本中的字段读取和
“只调用一次”假设在调试中修正；只有最终退出成功的运行计入通过。

本机报告及截图位于 `reports/p2/`（未跟踪）：`063-source-parity.json`、
`063-real-model.json`、`063-streaming.png`、`063-conversation.png`、
`063-preferences.png`、`063-narrow-process.png`、`063-real-conversation.png`。
报告只记录验收元数据，不保存认证 URL、请求头或凭据。

## 边界与继续入口

本项不代表完整的 DSH 换壳已经完成。TZ-064 继续补全工具与沙箱／Web 能力，
TZ-065 完成原 Composer 与 `/` 指令，TZ-066 完成权限，TZ-067 补齐问题／用量／恢复，
TZ-068 完成工作区会话树和整体框架，TZ-069 完成预览与产物区。
技能入口与独立轨迹页仍按既定范围延期。

Vite 主包仍超过 500 kB，暂未扩展为分包优化。没有进行 Windows、Electron 安装包、
手机实机或公网部署验收。本次没有重跑空 npm／pnpm 缓存的全阶段门禁，
以前的 `verify:clean` 超时记录保留，不能据本次独立目录构建改称通过。
3100 本地 Host 已重启。另在现有“你好”会话检查原整轮状态、紧凑执行与思考，
并打开真实显示设置，页面无 JavaScript 错误；证据为 `063-current-host.png/json`。
未向该历史会话发送新消息。代码与文档只在本地修改，未提交、未推送。
