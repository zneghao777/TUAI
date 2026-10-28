# DSH 源码迁移清单

本附录把主规范的迁移要求落实到源码目录、依赖检查和迁入批次。
表中策略表示迁移计划，不等于实际迁入状态；已实施来源见 migration 登记。
2026-10-27 的 P2 策略按[P2 换壳对齐需求](P2-DSH换壳对齐需求.md)更新。
上游基线、包名和依赖快照分别见
[上游基线](上游源码基线.json)和[包元数据](DSH包元数据清单.json)。

TZ-062 的 7 包 UI 基础源码、静态 ESM 适配和运行排除项见
[M4 迁移登记](../../migration/M4-迁移登记.json)与
[UI 基础核验](../../verification/TZ-062-DSH-UI基础迁移.md)。
TZ-063 另迁入 27 包对话与依赖源码，启用原 ChatView、过程、工具行和对话显示 settings；
适配与证据见[对话迁移核验](../../verification/TZ-063-DSH对话与过程迁移.md)。
TZ-064 再迁入 14 包，M4 累计 48 包；启用文件搜索、Todo、后台 Job、持久终端和 Web。
原会话菜单接到生产侧栏。测试闭包与实际挂载区分见[工具迁移核验](../../verification/TZ-064-DSH工具与工作区迁移.md)。
TZ-065～069 本批新增 19 包，M4 累计 67 包；原输入、指令、权限、问题、会话树与文件面板接到生产组合。
来源、差异和验证见[P2 收口核验](../../verification/P2-DSH换壳收口验收.md)，完成状态仍查总计划。
复制的其他插件不等于运行时启用；本表仍保留规划策略，实际事实查登记和核验。

## 1. 使用清单的方式

迁移人员先选择本批能力，再展开依赖、插件配置、构建生成物和平台资源。
不能直接把附录后面的全部包表当成首版安装集合。

表中的 `planned`、`reference_only`、`deferred`、`excluded` 是规划建议。
真正实施时，另建迁移登记表，按主规范的状态推进；不得直接修改本次来源快照
来掩盖上游升级或把规划状态当成实际完成。

建议每个迁移批次保留以下登记内容：

```yaml
batchId: migration-001
upstreamCommit: 22ddee3792402c3e70ec5f86a63c3e3e895a2f60
capability: persisted-agent-loop
sourcePackages: []
sourceFiles: []
configurationReferences: []
nativeAndWorkerResources: []
upstreamFilesChangedLocally: []
localPatches: []
generatedArtifacts: []
checks: []
status: planned
rollbackRevision: null
```

以上是拟议记录格式。实际文件必须填充可核查内容，尤其不能把空数组当成已审计。
迁移登记与应用版本分开维护，一次应用发布可能包含多个批次。

## 2. 必须保留的基础结构

首批尽量保留上游相对结构。DSH 构建包含 Host／Client 两个面、类型生成、
插件元数据、平台包和资源准备，单独复制 `agent-loop/src` 无法构成完整 Harness。

| 范围 | 实际上游入口 | 处理要求 |
| --- | --- | --- |
| Workspace | `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` | 锁定工具链；评审 overrides、patches 和 install scripts；不能直接删掉看似无关的锁项后宣称可重复构建 |
| TypeScript | `tsconfig.base.json`、`tsconfig.node.base.json`、`tsconfig.base.client.json`、`tsconfig.host.json`、`tsconfig.client.json` | 按保留包重建 references；保留 Host／Client 边界，避免 Node API 漏入浏览器 |
| 库构建 | `tsdown.config.ts`、包内 `tsdown.config.ts`、`scripts/build.ts`、`scripts/compile-referenced-projects.ts` | 先读其调用链；迁入实际使用的辅助脚本及生成依赖 |
| 协议生成 | `packages/typert/generator`、`loader`、`registry`、`protocol` | 保留生成器与运行协议匹配；客户端不能手写另一版序列化 |
| 启动器 | `apps/cli`、`packages/boot/app-boot`、`cmdline` | 延续 Profile 解析和 Loader 生命周期；产品入口最终独立命名 |
| 组合配置 | `packages/bundle/base/cordis.patch.yml`、`sdk-minimal/cordis.patch.yml`、`web-app/cordis.patch.yml` | 提取能力组合，重新写 TIanZhiAi Profile，不继承上游全部产品默认项 |
| 底层依赖 | `vendor/*` | Cordis、Loader、Schema 及工具保持单份身份；保留其许可 |
| 本地能力 | `native/system`、`native/system/packages/*` | 审计编译、平台选择、可执行权限和发布资源；按真实 Provider 纳入 |
| 测试框架 | 根目录 Vitest 配置、`scripts/vitest-*` 及 `packages/test-support/*` | 只迁本批测试实际依赖的支撑；保留回放素材与解释 |
| 补丁 | `patches/` 及 workspace `patchedDependencies` | 只带本批依赖对应补丁；升级时确认补丁仍适用，不能悄悄忽略 |
| 许可与来源 | 根目录 `LICENSE`、各 Vendor／Native 许可和第三方声明 | 保留与实际分发文件对应的声明，品牌与许可分别处理 |

构建脚本依赖的 `website`、`benchmarks`、`python/sdk-runtime` 等目录在完整上游
Workspace 内有用途。裁剪根脚本时，必须同步裁剪其依赖，不能保留指向不存在目录
的构建命令。本项目首版不以复刻上游官网或 Python 发行版为目标。

### 2.1 启动配置的三个陷阱

上游 Profile 体现了可组合思路，但不是 TIanZhiAi 的最终默认产品配置。

1. `sdk-minimal` 中包含文件、终端、子进程、MCP 等提供者，不能把名称中的
   “minimal” 理解成纯聊天内核。
2. 该配置包含 `danger-full-access`。迁入组合结构时，必须重新定义个人助理
   的默认权限与批准要求，不能把开发便利配置直接发布给用户。
3. `apps/cli/package.json` 依赖许多可选组合。把整个 CLI 的依赖闭包当成
   首批最小内核，会把大量尚未启用的功能一并带入。

## 3. 分批迁入内容

下列 M 编号是源码批次，P 编号是主规范的产品阶段；二者不要求一一对应。
每批都先完成原行为核验，再实现 TIanZhiAi 修改。

### M0：来源、工作区和可构建底座

这一批对应 P0，建立来源记录和可以承载核心的构建环境。

- 迁入必要 `vendor/*`，以及已选闭包涉及的 `packages/util/*`。
- 保留 Node、pnpm、TS 与构建器版本；新根包名可以使用产品名。
- 建立迁入包的 workspace、TS references 和 Host／Client 生成顺序。
- 选择启动器与 Profile 引导链；先运行 Loader 服务探针，不启用全部工具。
- 生成 import、配置字符串、资源与许可证报告。

验收要求：从干净缓存安装；探针能注册、获取并 dispose 服务；依赖身份唯一；
构建不读取同级 DSH 目录；报告中的缺失引用为零或有明确禁用证明。

### M1：Agent、模型、工具和会话

这一批对应 P1，完成一项可持久化执行的基本任务。

| 包组 | 需要优先检查的包 | 行为核验 |
| --- | --- | --- |
| Core | `scope`、`session`、`agent`、`agent-loop`、`system-prompt`、`tools`、`tool-executor-native` | 回合、流、工具结果、异常、取消、上下文和 dispose |
| LLM | `llm`、`llm-deepseek`、`llm-deepseek-api-key`、`llm-retry`、`token-meter`，以及所需扩展 | 假模型可回放；真实 Provider 无密钥时明确报错；重试不复制已确认工具效果 |
| Session | `session-format*`、`session-persistence`、`session-persistence-jsonl`、`session-projection`、`session-projection-cache`、`working-directory` | 合法事件顺序、重启、截断尾部、历史分页、投影重建 |
| Storage | `storage`、`storage-domain` 及所选 `storage-json`／`storage-sqlite` | 区分日志、索引与业务数据库；文件写入和迁移可恢复 |
| Compaction | `compaction`、`compaction-basic`、必要 image-offload／pruner | 压缩后模型可见历史、工具配对、媒体与引用仍一致 |
| Context | `agent-instructions`、`file-reference`、`file-reference-local`、`time-context`、必要 session-reference | 指令和用户资料的来源、顺序、权限边界明确 |
| Guard／Spill | `repeat-tool-reminder`、`timeout-policy`、`spill/*` 中实际依赖 | 无进展保护、超时、超长工具输出和清理 |

上游存在从旧 Session 格式到 v4 的转换包。保留哪些解码器取决于声明支持的
历史数据范围；一旦声明支持，必须迁入对应格式链及 fixture。
首次采用新数据目录并不意味着可以删除当前运行路径所依赖的格式包。

这一批不把 DS-Bot 的长期 Bot、群聊和 Steward 直接塞进 Agent Loop。
临时子智能体和产品持久任务将在后续批次接入。

### M2：Host 操作能力与用户交互

这一批为 P1/P2 提供最小可用操作环境。工具定义、执行 Provider 与策略必须成套。

- 文件：`packages/fs/*`、`packages/attachment/*` 和工作目录服务。
- 进程：`packages/subprocess/*`、`packages/shell/*`、`packages/terminal/*`。
- 隔离：`packages/sandbox/*` 及实际平台 Native 提供者。
- 用户交互：`commands`、`permission-presets`、`user-approval`、`user-questions`、
  `tool-ask-user`，以及相关 credentials／authorization 服务。
- 工具展现：`agent-tool-presentation` 保留模型参数与用户可见记录的一致关系。

先启用少量测试工具。对新个人助理不需要的 coding 工具，只迁定义或暂不启用，
并在 Profile 与工具目录中一致表达。不能靠前端隐藏按钮限制模型调用。

验收要求：真正测试文件／进程权限、取消后的清理、Windows shell 差异、批准失效
和日志中的真实结果，而非仅验证工具名出现在界面上。

### M3：类型化 API 与自主前端的数据层

这一批对应 P2，迁入前后端交互及 DSH 原工作区结构；天质仅在不改变行为的前提下适配品牌与主题。

- 迁入 `packages/typert/*`、`api/gateway`、`api/remotes`、`api/session-controller`。
- 根据工作区、文件和终端页面的实际范围加入相应 Controller。
- 迁入 `client/connection`、Session Client 对象、流归并和必要 `client/store`。
- 评估 `client/web`、`client/modules` 的启动／注入机制；使用新入口时保留
  静态模块共享身份，不能一边直接打包 React、一边加载第二份 React。
- P2 对话组件按[换壳对齐需求](P2-DSH换壳对齐需求.md)优先迁入：Conversation／Chat／Tool、
  Composer／Trigger／Commands／Reference、问题审批、工作区与富文本；产品层换主题。
- 主布局／侧栏和必要 settings 运行时属于必迁范围；新增 experimental/auto-review，接真实四项权限。
- 补齐 Goal／Plan、Compact／Feedback／Export 及文件／沙箱／Web 工具的 Host 组合。
  独立轨迹页和技能界面暂缓；新闭包不能误带账户、遥测和完整上游运行配置。
- 确需重写时登记无法复用原因与行为等价证据，不再默认以简化版替换原交互。

验收要求：连接、认证、发送、排队、停止、附件、流结束、历史、重连、审批与
问题卡片均通过真实类型化调用；浏览器重载不能造成重复任务。
新增 DSH-01～16 对照覆盖思考／步骤、指令、沙箱／Web、工作区与资源，不能仅验旧卡片。

### M4：Agent 组合、MCP、Skill 与临时协作

这一批对应 P3，为产品层的长期 Agent 管理提供内核能力。

| 上游范围 | 迁入方式 | 产品侧补充 |
| --- | --- | --- |
| `preset/agent-preset`、`agent-preset-registry`、`persona` | 保留运行时预设和系统指令组合 | AgentDirectory 管理长期身份、版本和权限 |
| `subagent/subagent`、`subagent-fork-in-process`、`subagent-spawn-in-process` | 选择实际使用的 DSH Provider | TaskRuntime 保存跨重启关系、结果和唤醒 |
| `subagent/tool-subagent`、`tool-subagent-control` | 适配产品委派策略和事件关联 | 防重复委派、父子取消和资源上限 |
| `mcp/mcp-client`、`mcp-resources` | 保留标准连接和资源能力 | 连接管理、凭据引用、工具权限与健康 |
| `skill/skill`、`skill-filesystem`、`tool-skill` | 保留基础发现、读取与使用行为 | 版本、学习、验证、作用域和回滚 |
| `jobs/jobs`、`jobs-local`、`tool-jobs` | 明确其工具后台作业语义 | 不把短期 Job 当成持久跨 Agent 业务任务 |

ACP、Codex、Claude Code、DSH SDK 等其他执行器可以延期。
首版不能为了“多智能体”同时引入多个独立 Loop，再尝试用前端拼接成同一产品。

### M5：OpenMuse 浏览器能力迁入

这一批对应 P4，采用“Worker → 服务 → 工具 → UI → 真实接管”的纵向方式。
详细事务约束以主规范第 9 节为准。

| 原项目文件 | 迁入目标 | 必须改造的边界 |
| --- | --- | --- |
| `apps/worker/src/browser.ts` | Browser Worker 生命周期与页面 | 工作区未提交修改单独审阅；Profile、代理、资源、窗口管理 |
| `apps/worker/src/browser-agent.ts` | 观察、引用与动作执行 | Snapshot、Ref、控件签名；不暴露能绕开检查的低层写操作 |
| `apps/worker/src/page-dom.ts` | DOM 与可见控件提取 | Frame、Shadow DOM、可见性和敏感字段处理 |
| `apps/worker/src/server.ts`、`network.ts`、`proxy.ts` | Worker 协议和网络 | 鉴权、监听地址、代理生命周期、网络配置与取消 |
| `apps/server/src/browser.ts` | 产品 BrowserService | OpenMuse DB、Config、Auth、Files 依赖改成产品接口 |
| `apps/server/src/booking/service.ts` | 产品 BrowserTransactionService | Task／Session 关联、准备、批准、执行意图、核验与未知结果 |
| `apps/server/src/booking/reviewer.ts` | 浏览器动作语义审核 | 使用迁入 DSH 的模型调用接口，移除 TanStack/CopilotKit 运行时耦合 |
| `apps/server/src/booking/tools.ts` | DSH Browser Tools | 使用 DSH 注册和执行上下文；保留参数、权限、审计及结果语义 |
| `apps/server/src/booking/routes.ts` | 产品 API 适配 | 主业务走统一类型化 API；专用图像／输入传输保持同等身份检查 |
| `apps/server/src/browser-console.ts` | 自主浏览器控制界面后端 | 真正输入通道、尺寸映射、控制代次、人控归还与断线 |
| `packages/domain/src/booking.ts` | 产品浏览器领域类型 | 评审后保留必要 Schema，显式记录兼容变化 |

还要追踪上述文件引用的 downloads、config、日志、文件落盘和 lifecycle 辅助代码。
表格只标出主要入口，不表示复制这十余个文件即可完成抽取。

迁移前后分别运行受控站点案例。现有 OpenMuse 的测试通过只能证明原项目组合，
不能代替在 TIanZhiAi 身份、控制权和任务模型下的回归。

### M6：计划与主动消息

这一批对应 P6。上游 Schedule 提供时间触发参考，产品仍需业务计划和可靠投递。

- 阅读 `packages/schedule/schedule`、`tool-schedule` 及 `client/ui-schedule`。
- 用产品 Plan／Trigger／Occurrence 持久化计划与发生记录。
- 把到期事件放入统一 TaskRuntime，使用版本与去重键失效旧计划。
- Notification Outbox 记录实际投递及回执，不把 UI 查询到消息当成外部渠道已送达。
- 区分 Worker 租约续期、周期扫描和主动关怀判断，不以单一“心跳”替代这些机制。

### M7：桌面与多端安装

这一批对应 P7，但 Platform 接口、Host／Client 边界与资源路径从 P0/P2 开始建立。

- 迁入并产品化 `apps/desktop` 的主进程、Host 子进程、Preload 和桥接协议。
- 追踪 `apps/desktop/scripts` 的运行时准备、包资源、签名和安装构建依赖。
- 按实际使用范围迁入 `scripts/primary-runtime`、Native 和第三方运行时。
- 更换产品 appId、名称、协议注册、数据目录、签名身份、更新地址与诊断字段。
- 为浏览器 Worker 和 Chromium 建立本机安装资源策略，不能依赖开发机缓存。

DSH 当前存在 macOS arm64／x64、Windows x64 相关桌面构建脚本。
Linux Host 与 Linux 桌面安装是两项工作；后者需要自行补齐打包与真实系统验收。
移动 Web 共用远程 Host，不能由 Electron 桌面基础推导出 Android／iOS 本机运行能力。

## 4. 静态依赖报告的含义

包元数据 JSON 枚举本地基线的 Workspace 包，保留各类依赖、内部依赖边、
客户端元数据、建议状态和文件摘要，并计算两个静态种子集合的闭包。

`coreCandidate` 从核心、日志、存储、模型及启动基础的显式种子开始；
`sessionClientCandidate` 从网关、Session API、连接与状态层开始。
运行候选展开 dependencies／peerDependencies／optionalDependencies；
构建候选额外展开 devDependencies。报告中的 Profile 引用单独列出。

本次静态计算得到以下数量，可用于估计迁移涉及的依赖面，不能当成最终工作量：

| 显式种子场景 | 运行候选包数 | 加入开发依赖后的构建候选包数 |
| --- | --- | --- |
| `coreCandidate` | 61 | 94 |
| `sessionClientCandidate` | 76 | 305 |

两组集合存在重叠，不能相加。构建候选偏大也可能来自测试和开发工具依赖，
不意味着第一批需要启用或发布 305 个包。完整种子和路径保存在 JSON。

这些集合不能直接作为最小安装结论，原因包括：

- Peer 表示包层面的契约关系，具体 Provider 仍需要 Profile 注册。
- 可选依赖可能只针对某个系统；静态展开不等于全部随每个系统分发。
- 配置可能通过表达式、动态加载或 Preset 引入更多服务。
- TS references、脚本、Worker、二进制、客户端 injection 及运行资源不全是包依赖。
- 上游 CLI 是组合入口，依赖面比本产品单个 Profile 更宽。

实施人员必须对启用插件树执行 Loader smoke test，并从安装产物启动，
完成静态报告之外的闭包验证。

## 5. 差异、上游升级与回滚

源码迁入后，原目录中的改动既可能来自上游同步，也可能来自产品适配，必须可区分。

建议按以下方式维护：

1. 每批记录上游 commit、原文件 SHA-256 和本地迁入位置。
2. 尽量把产品扩展写在 `packages/product/*`；需要修改上游包时记录原因、
   关联 ADR、回归案例和预期合并难度。
3. 不提交真实账号、会话 Cookie、MCP Token、个人浏览器 Profile 或 `.env` 内容。
4. 更新上游时比较文件和生成协议，不只修改包版本号。
5. 升级失败时先恢复兼容运行版本，再处理数据；包含不可逆数据迁移的版本必须
   通过备份恢复或向前修复处理，不能强行用旧二进制打开新格式。

## 6. 完整包清单

以下表格由本地基线元数据生成，覆盖实际 Workspace 清单。
“阶段”表示首个建议评估阶段，“策略”表示迁移建议，均未执行。
点击来源可打开锁定提交的 `package.json`；源码目录即其所在目录。


本次共发现 **386 个 Workspace 包**，不计根包；覆盖模式与精确元数据见 JSON。

| 包组 | 数量 |
| --- | --- |
| `acp` | 1 |
| `api` | 10 |
| `apps` | 5 |
| `attachment` | 2 |
| `benchmarks` | 1 |
| `boot` | 6 |
| `browser-use` | 1 |
| `bundle` | 6 |
| `client` | 68 |
| `compaction` | 5 |
| `computer-use` | 1 |
| `context` | 7 |
| `core` | 10 |
| `credentials` | 5 |
| `deliverables` | 3 |
| `document` | 1 |
| `experimental` | 58 |
| `extensions` | 4 |
| `feedback` | 2 |
| `fs` | 7 |
| `goal` | 4 |
| `guard` | 2 |
| `host` | 9 |
| `identity` | 1 |
| `interaction` | 5 |
| `jobs` | 3 |
| `llm` | 9 |
| `lsp` | 3 |
| `mcp` | 2 |
| `native` | 6 |
| `plan` | 1 |
| `preset` | 3 |
| `ptc-runtime` | 2 |
| `python` | 1 |
| `sandbox` | 4 |
| `schedule` | 2 |
| `sdk` | 3 |
| `session` | 22 |
| `session-query` | 3 |
| `settings` | 1 |
| `shell` | 10 |
| `skill` | 5 |
| `spill` | 3 |
| `ssh` | 5 |
| `storage` | 4 |
| `subagent` | 9 |
| `subprocess` | 3 |
| `telemetry` | 1 |
| `terminal` | 2 |
| `test-support` | 8 |
| `todo` | 1 |
| `typert` | 4 |
| `util` | 21 |
| `vendor` | 9 |
| `web` | 7 |
| `website` | 1 |
| `workflow` | 3 |
| `workspace` | 1 |

下表逐包记录建议。表中的状态不代表运行可用；因依赖闭包而迁入的文件，也不自动获得产品启用权限。

### acp

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/acp/acp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/acp/acp/package.json)<br>`@deepseek-ai/dsh-acp` | 后续 | `deferred` | 外部执行器协议按需扩展 |

### api

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/api/account-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/account-controller/package.json)<br>`@deepseek-ai/dsh-api-account-controller` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |
| [`packages/api/gateway`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/gateway/package.json)<br>`@deepseek-ai/dsh-api-gateway` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/job-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/job-controller/package.json)<br>`@deepseek-ai/dsh-api-job-controller` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/remote-access`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/remote-access/package.json)<br>`@deepseek-ai/dsh-api-remote-access` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/remotes`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/remotes/package.json)<br>`@deepseek-ai/dsh-api-remotes` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/session-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/package.json)<br>`@deepseek-ai/dsh-api-session-controller` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/settings-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/settings-controller/package.json)<br>`@deepseek-ai/dsh-api-settings-controller` | P2 | `planned` | 迁入网关与所用控制器；账户接口另审 |
| [`packages/api/terminal-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/terminal-controller/package.json)<br>`@deepseek-ai/dsh-api-terminal-controller` | P2 | `planned` | P2 长命令／终端状态与受控操作 |
| [`packages/api/workspace-controller`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/workspace-controller/package.json)<br>`@deepseek-ai/dsh-api-workspace-controller` | P2 | `planned` | P2 工作区树、Host cwd 与授权同步 |
| [`packages/api/workspace-files`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/workspace-files/package.json)<br>`@deepseek-ai/dsh-api-workspace-files` | P2 | `planned` | P2 文件／资源预览与所属工作区鉴权 |

### apps

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`apps/cli`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/cli/package.json)<br>`@deepseek-ai/dsh` | P0/P1 | `planned` | 迁入启动模式，裁剪可选组合依赖并产品化 |
| [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/desktop/package.json)<br>`@deepseek-ai/dsh-desktop` | P7 | `planned` | 迁入 Host 与平台壳，页面和品牌重新设计 |
| [`apps/desktop-host`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/desktop-host/package.json)<br>`@deepseek-ai/dsh-desktop-host` | 后续 | `reference_only` | 产品入口按能力选择迁入和重新设计 |
| [`apps/plugin-market-generator`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/plugin-market-generator/package.json)<br>`@deepseek-ai/dsh-plugin-market-generator` | 后续 | `reference_only` | 产品入口按能力选择迁入和重新设计 |
| [`apps/web`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/web/package.json)<br>`@deepseek-ai/dsh-web-frontend` | P2 | `reference_only` | 参考启动与打包，新产品页面自主实现 |

### attachment

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/attachment/attachment`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/attachment/attachment/package.json)<br>`@deepseek-ai/dsh-attachment` | P1/P2 | `planned` | 迁入附件与本地提供者 |
| [`packages/attachment/attachment-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/attachment/attachment-local/package.json)<br>`@deepseek-ai/dsh-attachment-local` | P1/P2 | `planned` | 迁入附件与本地提供者 |

### benchmarks

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`benchmarks`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/benchmarks/package.json)<br>`@deepseek-ai/dsh-benchmarks` | P1/P7 | `reference_only` | 复用相关性能方法和 fixture |

### boot

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/boot/app-boot`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/app-boot/package.json)<br>`@deepseek-ai/dsh-app-boot` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |
| [`packages/boot/cmdline`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/cmdline/package.json)<br>`@deepseek-ai/dsh-cmdline` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |
| [`packages/boot/config-editor`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/config-editor/package.json)<br>`@deepseek-ai/dsh-config-editor` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |
| [`packages/boot/hmr`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/hmr/package.json)<br>`@deepseek-ai/dsh-hmr` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |
| [`packages/boot/plugin-manager`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/plugin-manager/package.json)<br>`@deepseek-ai/dsh-plugin-manager` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |
| [`packages/boot/plugin-market`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/plugin-market/package.json)<br>`@deepseek-ai/dsh-plugin-market` | P0/P1 | `planned` | 迁入启动生命周期；市场与开发工具按需 |

### browser-use

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/browser-use/browser-use`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/browser-use/browser-use/package.json)<br>`@deepseek-ai/dsh-browser-use` | P4 | `reference_only` | 了解抽象；首版采用 OpenMuse 执行能力 |

### bundle

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/bundle/acp-app`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/acp-app/package.json)<br>`@deepseek-ai/dsh-acp-app` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |
| [`packages/bundle/base`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/base/package.json)<br>`@deepseek-ai/dsh-base` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |
| [`packages/bundle/headless`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/headless/package.json)<br>`@deepseek-ai/dsh-headless` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |
| [`packages/bundle/sdk-app`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/sdk-app/package.json)<br>`@deepseek-ai/dsh-sdk-app` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |
| [`packages/bundle/sdk-minimal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/sdk-minimal/package.json)<br>`@deepseek-ai/dsh-sdk-minimal` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |
| [`packages/bundle/web-app`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/web-app/package.json)<br>`@deepseek-ai/dsh-web-app` | P0/P2 | `reference_only` | 参考配置，编写产品 Profile |

### client

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/client/connection`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/connection/package.json)<br>`@deepseek-ai/dsh-client-connection` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |
| [`packages/client/file-upload`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/file-upload/package.json)<br>`@deepseek-ai/dsh-client-file-upload` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/hmr`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/hmr/package.json)<br>`@deepseek-ai/dsh-client-hmr` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/locale`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/locale/package.json)<br>`@deepseek-ai/dsh-client-locale` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/modules`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/modules/package.json)<br>`@deepseek-ai/dsh-client-modules` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |
| [`packages/client/product-analytics`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/product-analytics/package.json)<br>`@deepseek-ai/dsh-client-product-analytics` | 后续 | `excluded` | 不继承上游采集与传输配置 |
| [`packages/client/resources`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/resources/package.json)<br>`@deepseek-ai/dsh-client-resources` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/shortcuts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/shortcuts/package.json)<br>`@deepseek-ai/dsh-client-shortcuts` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/store`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/store/package.json)<br>`@deepseek-ai/dsh-client-store` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |
| [`packages/client/ui-agent-preset`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-agent-preset/package.json)<br>`@deepseek-ai/dsh-client-ui-agent-preset` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-approval`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-approval/package.json)<br>`@deepseek-ai/dsh-client-ui-approval` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-attachment`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-attachment/package.json)<br>`@deepseek-ai/dsh-client-ui-attachment` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-brand-official`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-brand-official/package.json)<br>`@deepseek-ai/dsh-client-ui-brand-official` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-chat`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-chat/package.json)<br>`@deepseek-ai/dsh-client-ui-chat` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-commands`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-commands/package.json)<br>`@deepseek-ai/dsh-client-ui-commands` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-conversation`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/package.json)<br>`@deepseek-ai/dsh-client-ui-conversation` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-deepseek-model-label-1017`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-deepseek-model-label-1017/package.json)<br>`@deepseek-ai/dsh-client-ui-deepseek-model-label-1017` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-deliverables`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-deliverables/package.json)<br>`@deepseek-ai/dsh-client-ui-deliverables` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-directory-picker-browse`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-directory-picker-browse/package.json)<br>`@deepseek-ai/dsh-client-ui-directory-picker-browse` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-directory-picker-native`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-directory-picker-native/package.json)<br>`@deepseek-ai/dsh-client-ui-directory-picker-native` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-dockkit`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-dockkit/package.json)<br>`@deepseek-ai/dsh-client-ui-dockkit` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-entry-customization`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-entry-customization/package.json)<br>`@deepseek-ai/dsh-client-ui-entry-customization` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-file-drag`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-file-drag/package.json)<br>`@deepseek-ai/dsh-client-ui-file-drag` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-goal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-goal/package.json)<br>`@deepseek-ai/dsh-client-ui-goal` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-input-trigger`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-input-trigger/package.json)<br>`@deepseek-ai/dsh-client-ui-input-trigger` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-jobs`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-jobs/package.json)<br>`@deepseek-ai/dsh-client-ui-jobs` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-layout`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-layout/package.json)<br>`@deepseek-ai/dsh-client-ui-layout` | P2 | `planned` | 迁原三栏骨架、宽度／折叠与 Slot 协调；TZ-063/068 |
| [`packages/client/ui-message-feedback`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-message-feedback/package.json)<br>`@deepseek-ai/dsh-client-ui-message-feedback` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-model-selection`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-model-selection/package.json)<br>`@deepseek-ai/dsh-client-ui-model-selection` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-open-in-app`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-open-in-app/package.json)<br>`@deepseek-ai/dsh-client-ui-open-in-app` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-permission-presets`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-permission-presets/package.json)<br>`@deepseek-ai/dsh-client-ui-permission-presets` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-plan`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-plan/package.json)<br>`@deepseek-ai/dsh-client-ui-plan` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-plugin-manager`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-plugin-manager/package.json)<br>`@deepseek-ai/dsh-client-ui-plugin-manager` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-plugin-market`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-plugin-market/package.json)<br>`@deepseek-ai/dsh-client-ui-plugin-market` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-primitives`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-primitives/package.json)<br>`@deepseek-ai/dsh-client-ui-primitives` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-reference`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-reference/package.json)<br>`@deepseek-ai/dsh-client-ui-reference` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-renderer`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-renderer/package.json)<br>`@deepseek-ai/dsh-client-ui-renderer` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |
| [`packages/client/ui-schedule`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-schedule/package.json)<br>`@deepseek-ai/dsh-client-ui-schedule` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-secret-mask`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-secret-mask/package.json)<br>`@deepseek-ai/dsh-client-ui-secret-mask` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-session`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-session/package.json)<br>`@deepseek-ai/dsh-client-ui-session` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-settings`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings/package.json)<br>`@deepseek-ai/dsh-client-ui-settings` | P2 | `planned` | 来源／契约已迁不等于运行时启用；接显示、输入与权限所需 settings 闭包；TZ-063/065/066 |
| [`packages/client/ui-settings-account`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-account/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-account` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |
| [`packages/client/ui-settings-agent-loop`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-agent-loop/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-agent-loop` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-general`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-general/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-general` | P2 | `planned` | 迁必要 General 偏好与原设置交互；不引入账户／遥测；TZ-063/065/066 |
| [`packages/client/ui-settings-models`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-models/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-models` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-plugin-inventory`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-plugin-inventory/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-plugin-inventory` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-plugins`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-plugins/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-plugins` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-session-log`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-session-log/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-session-log` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-shell`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-shell/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-shell` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-subagent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-subagent/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-subagent` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-settings-web-search`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-settings-web-search/package.json)<br>`@deepseek-ai/dsh-client-ui-settings-web-search` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-shortcuts`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-shortcuts/package.json)<br>`@deepseek-ai/dsh-client-ui-shortcuts` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-sidebar`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar` | P2 | `planned` | 迁原工作区侧栏容器与操作结构；TZ-068 |
| [`packages/client/ui-sidebar-browser`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar-browser/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar-browser` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-sidebar-documentpreview`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar-documentpreview/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar-documentpreview` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-sidebar-files`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar-files/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar-files` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-sidebar-right`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar-right/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar-right` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-sidebar-terminal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-sidebar-terminal/package.json)<br>`@deepseek-ai/dsh-client-ui-sidebar-terminal` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-skill`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-skill/package.json)<br>`@deepseek-ai/dsh-client-ui-skill` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-slots`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-slots/package.json)<br>`@deepseek-ai/dsh-client-ui-slots` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |
| [`packages/client/ui-subagent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-subagent/package.json)<br>`@deepseek-ai/dsh-client-ui-subagent` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-theme`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-theme/package.json)<br>`@deepseek-ai/dsh-client-ui-theme` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-tool`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-tool/package.json)<br>`@deepseek-ai/dsh-client-ui-tool` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-trajectory`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-trajectory/package.json)<br>`@deepseek-ai/dsh-client-ui-trajectory` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-user-questions`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-user-questions/package.json)<br>`@deepseek-ai/dsh-client-ui-user-questions` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/ui-workflow-run`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-workflow-run/package.json)<br>`@deepseek-ai/dsh-client-ui-workflow-run` | P2 | `reference_only` | 数据与连接优先迁入；视觉由产品独立设计 |
| [`packages/client/ui-workspace`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-workspace/package.json)<br>`@deepseek-ai/dsh-client-ui-workspace` | P2 | `planned` | 迁入所需行为与闭包，替换天质主题；按 ADR-015 验证 |
| [`packages/client/web`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/web/package.json)<br>`@deepseek-ai/dsh-client-web` | P2 | `planned` | 优先迁入连接、状态、启动或渲染契约，视觉可替换 |

### compaction

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/compaction/command-compact`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/compaction/command-compact/package.json)<br>`@deepseek-ai/dsh-command-compact` | P2 | `planned` | P2 手动压缩命令与真实回执 |
| [`packages/compaction/compaction`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/compaction/compaction/package.json)<br>`@deepseek-ai/dsh-compaction` | P1 | `planned` | 迁入上下文压缩及所需实现 |
| [`packages/compaction/compaction-basic`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/compaction/compaction-basic/package.json)<br>`@deepseek-ai/dsh-compaction-basic` | P1 | `planned` | 迁入上下文压缩及所需实现 |
| [`packages/compaction/compaction-image-offload`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/compaction/compaction-image-offload/package.json)<br>`@deepseek-ai/dsh-compaction-image-offload` | P1 | `planned` | 迁入上下文压缩及所需实现 |
| [`packages/compaction/compaction-tool-result-pruner`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/compaction/compaction-tool-result-pruner/package.json)<br>`@deepseek-ai/dsh-compaction-tool-result-pruner` | P1 | `planned` | 迁入上下文压缩及所需实现 |

### computer-use

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/computer-use/computer-use`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/computer-use/computer-use/package.json)<br>`@deepseek-ai/dsh-computer-use` | 后续 | `deferred` | 系统桌面操作不属于首版浏览器重点 |

### context

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/context/agent-instructions`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/agent-instructions/package.json)<br>`@deepseek-ai/dsh-agent-instructions` | P1 | `planned` | 按实际提示与引用能力迁入 |
| [`packages/context/file-reference`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/file-reference/package.json)<br>`@deepseek-ai/dsh-file-reference` | P1 | `planned` | 按实际提示与引用能力迁入 |
| [`packages/context/file-reference-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/file-reference-local/package.json)<br>`@deepseek-ai/dsh-file-reference-local` | P1 | `planned` | 按实际提示与引用能力迁入 |
| [`packages/context/harness-dev-context`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/harness-dev-context/package.json)<br>`@deepseek-ai/dsh-harness-dev-context` | P1 | `planned` | 按实际提示与引用能力迁入 |
| [`packages/context/session-reference`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/session-reference/package.json)<br>`@deepseek-ai/dsh-session-reference` | P2 | `planned` | P2 @ 会话引用与授权解析 |
| [`packages/context/time-context`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/time-context/package.json)<br>`@deepseek-ai/dsh-time-context` | P1 | `planned` | 按实际提示与引用能力迁入 |
| [`packages/context/tmux-context`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/tmux-context/package.json)<br>`@deepseek-ai/dsh-tmux-context` | P1 | `planned` | 按实际提示与引用能力迁入 |

### core

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/core/agent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent/package.json)<br>`@deepseek-ai/dsh-agent` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/agent-default-model`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-default-model/package.json)<br>`@deepseek-ai/dsh-agent-default-model` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/agent-loop`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-loop/package.json)<br>`@deepseek-ai/dsh-agent-loop` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/agent-tool-presentation`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-tool-presentation/package.json)<br>`@deepseek-ai/dsh-agent-tool-presentation` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/scope`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/scope/package.json)<br>`@deepseek-ai/dsh-scope` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/session`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/package.json)<br>`@deepseek-ai/dsh-session` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/system-prompt`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/system-prompt/package.json)<br>`@deepseek-ai/dsh-system-prompt` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/tool-executor-native`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/tool-executor-native/package.json)<br>`@deepseek-ai/dsh-tool-executor-native` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/tool-executor-ptc`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/tool-executor-ptc/package.json)<br>`@deepseek-ai/dsh-tool-executor-ptc` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |
| [`packages/core/tools`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/tools/package.json)<br>`@deepseek-ai/dsh-tools` | P1 | `planned` | 迁入核心契约和循环；PTC 依据启用情况 |

### credentials

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/credentials/authorization`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/authorization/package.json)<br>`@deepseek-ai/dsh-authorization` | P1/P2 | `planned` | 迁入凭据契约；替换产品账户集成 |
| [`packages/credentials/credentials`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/credentials/package.json)<br>`@deepseek-ai/dsh-credentials` | P1/P2 | `planned` | 迁入凭据契约；替换产品账户集成 |
| [`packages/credentials/credentials-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/credentials-local/package.json)<br>`@deepseek-ai/dsh-credentials-local` | P1/P2 | `planned` | 迁入凭据契约；替换产品账户集成 |
| [`packages/credentials/deepseek-account`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/deepseek-account/package.json)<br>`@deepseek-ai/dsh-deepseek-account` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |
| [`packages/credentials/deepseek-account-platform`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/credentials/deepseek-account-platform/package.json)<br>`@deepseek-ai/dsh-deepseek-account-platform` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |

### deliverables

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/deliverables/deliverable-file-references`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/deliverables/deliverable-file-references/package.json)<br>`@deepseek-ai/dsh-deliverable-file-references` | P2 | `reference_only` | 参考产物关联和下载边界 |
| [`packages/deliverables/tool-present`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/deliverables/tool-present/package.json)<br>`@deepseek-ai/dsh-tool-present` | P2 | `reference_only` | 参考产物关联和下载边界 |
| [`packages/deliverables/workspace-changes`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/deliverables/workspace-changes/package.json)<br>`@deepseek-ai/dsh-workspace-changes` | P2 | `reference_only` | 参考产物关联和下载边界 |

### document

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/document/office-to-pdf`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/document/office-to-pdf/package.json)<br>`@deepseek-ai/dsh-office-to-pdf` | 后续 | `deferred` | 文档引擎按需扩展 |

### experimental

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/experimental/action-cards`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/action-cards/package.json)<br>`@deepseek-ai/dsh-action-cards` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/agent-team`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/agent-team/package.json)<br>`@deepseek-ai/dsh-experimental-agent-team` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/agent-team-profile`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/agent-team-profile/package.json)<br>`@deepseek-ai/dsh-experimental-agent-team-profile` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/api-speech-to-text`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/api-speech-to-text/package.json)<br>`@deepseek-ai/dsh-experimental-api-speech-to-text` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/auto-review`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/auto-review/package.json)<br>`@deepseek-ai/dsh-experimental-auto-review` | P2 | `planned` | TZ-066：真实自动审查预设／工具前审查／拒绝与失败；修补热卸载隐式扩权；不以菜单占位替代 |
| [`packages/experimental/badge-skill-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/badge-skill-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-badge-skill-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/browser-use-chrome-devtools-mcp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/browser-use-chrome-devtools-mcp/package.json)<br>`@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/browser-use-playwright-mcp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/browser-use-playwright-mcp/package.json)<br>`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/browser-use-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/browser-use-runtime/package.json)<br>`@deepseek-ai/dsh-experimental-browser-use-runtime` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/browser-use-stagehand-native`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/browser-use-stagehand-native/package.json)<br>`@deepseek-ai/dsh-experimental-browser-use-stagehand-native` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/claude-code-mods`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/claude-code-mods/package.json)<br>`@deepseek-ai/dsh-experimental-claude-code-mods` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-action-cards`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-action-cards/package.json)<br>`@deepseek-ai/dsh-client-ui-action-cards` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-agent-team`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-agent-team/package.json)<br>`@deepseek-ai/dsh-experimental-client-ui-agent-team` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-claude-code-mods`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-claude-code-mods/package.json)<br>`@deepseek-ai/dsh-experimental-client-ui-claude-code-mods` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-cot-translation`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-cot-translation/package.json)<br>`@deepseek-ai/dsh-experimental-client-ui-cot-translation` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-creation-recommendations`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-creation-recommendations/package.json)<br>`@deepseek-ai/dsh-client-ui-creation-recommendations` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-plugin-recommendations`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-plugin-recommendations/package.json)<br>`@deepseek-ai/dsh-client-ui-plugin-recommendations` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/client-ui-voice-input`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/client-ui-voice-input/package.json)<br>`@deepseek-ai/dsh-experimental-client-ui-voice-input` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/computer-use-cua-driver-mcp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/computer-use-cua-driver-mcp/package.json)<br>`@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/computer-use-cua-driver-native`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/computer-use-cua-driver-native/package.json)<br>`@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/cot-translation-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/cot-translation-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-cot-translation-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/creation-recommendations`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/creation-recommendations/package.json)<br>`@deepseek-ai/dsh-creation-recommendations` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/cua`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/cua/package.json)<br>`@deepseek-ai/dsh-cua` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/cua-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/cua-bundle/package.json)<br>`@deepseek-ai/dsh-cua-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/cua-macos`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/cua-macos/package.json)<br>`@deepseek-ai/dsh-experimental-cua-macos` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/hook-protocol`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/hook-protocol/package.json)<br>`@deepseek-ai/dsh-hook-protocol` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/hooks-claude-code`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/hooks-claude-code/package.json)<br>`@deepseek-ai/dsh-hooks-claude-code` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/hooks-codex`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/hooks-codex/package.json)<br>`@deepseek-ai/dsh-hooks-codex` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/inspector`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/inspector/package.json)<br>`@deepseek-ai/dsh-experimental-inspector` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/inspector-profile`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/inspector-profile/package.json)<br>`@deepseek-ai/dsh-experimental-inspector-profile` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/liveshare-protocol`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/liveshare-protocol/package.json)<br>`@deepseek-ai/dsh-experimental-liveshare-protocol` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/personalized-recommendations`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/personalized-recommendations/package.json)<br>`@deepseek-ai/dsh-personalized-recommendations` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/plugin-market-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/plugin-market-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-plugin-market-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/plugin-recommendations`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/plugin-recommendations/package.json)<br>`@deepseek-ai/dsh-plugin-recommendations` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/ptc-runtime-python`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/ptc-runtime-python/package.json)<br>`@deepseek-ai/dsh-experimental-ptc-runtime-python` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/ralph-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/ralph-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-ralph-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/session-inspector`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/session-inspector/package.json)<br>`@deepseek-ai/dsh-experimental-session-inspector` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/session-search`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/session-search/package.json)<br>`@deepseek-ai/dsh-experimental-session-search` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/session-title-all-prompts-llm`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/session-title-all-prompts-llm/package.json)<br>`@deepseek-ai/dsh-session-title-all-prompts-llm` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/session-titles-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/session-titles-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-session-titles-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/skill-badge`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/skill-badge/package.json)<br>`@deepseek-ai/dsh-skill-badge` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/speech-to-text`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/speech-to-text/package.json)<br>`@deepseek-ai/dsh-experimental-speech-to-text` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/speech-to-text-sensevoice`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/speech-to-text-sensevoice/package.json)<br>`@deepseek-ai/dsh-experimental-speech-to-text-sensevoice` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/subagent-oar`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/subagent-oar/package.json)<br>`@deepseek-ai/dsh-experimental-subagent-oar` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/terminal-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/terminal-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-terminal-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-agent-team`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-agent-team/package.json)<br>`@deepseek-ai/dsh-experimental-tool-agent-team` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-ralph`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-ralph/package.json)<br>`@deepseek-ai/dsh-tool-ralph` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-session-query`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-session-query/package.json)<br>`@deepseek-ai/dsh-tool-session-query` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-subagent-oar`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-subagent-oar/package.json)<br>`@deepseek-ai/dsh-experimental-tool-subagent-oar` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-terminal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-terminal/package.json)<br>`@deepseek-ai/dsh-tool-terminal` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/tool-worktree`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/tool-worktree/package.json)<br>`@deepseek-ai/dsh-experimental-tool-worktree` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/translator`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/translator/package.json)<br>`@deepseek-ai/dsh-experimental-translator` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/voice-input-bundle`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/voice-input-bundle/package.json)<br>`@deepseek-ai/dsh-experimental-voice-input-bundle` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/webhook`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/webhook/package.json)<br>`@deepseek-ai/dsh-webhook` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/webhook-github`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/webhook-github/package.json)<br>`@deepseek-ai/dsh-webhook-github` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/webworker-packer`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/webworker-packer/package.json)<br>`@deepseek-ai/dsh-experimental-webworker-packer` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/webworker-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/webworker-runtime/package.json)<br>`@deepseek-ai/dsh-experimental-webworker-runtime` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |
| [`packages/experimental/worktree`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/experimental/worktree/package.json)<br>`@deepseek-ai/dsh-experimental-worktree` | 后续 | `deferred` | 实验能力不作为首版依赖，配置闭包引用另审 |

### extensions

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/extensions/cordis-client-runner`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/extensions/cordis-client-runner/package.json)<br>`@deepseek-ai/dsh-cordis-client-runner` | 后续 | `deferred` | 按实际扩展入口评估 |
| [`packages/extensions/cordis-host-runner`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/extensions/cordis-host-runner/package.json)<br>`@deepseek-ai/dsh-cordis-host-runner` | 后续 | `deferred` | 按实际扩展入口评估 |
| [`packages/extensions/tool-cordis`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/extensions/tool-cordis/package.json)<br>`@deepseek-ai/dsh-tool-cordis` | 后续 | `deferred` | 按实际扩展入口评估 |
| [`packages/extensions/ui-cordis`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/extensions/ui-cordis/package.json)<br>`@deepseek-ai/dsh-client-ui-cordis` | 后续 | `deferred` | 按实际扩展入口评估 |

### feedback

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/feedback/command-feedback`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/feedback/command-feedback/package.json)<br>`@deepseek-ai/dsh-command-feedback` | P2 | `planned` | P2 当前会话反馈；不接上游遥测或自动外传 |
| [`packages/feedback/message-feedback`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/feedback/message-feedback/package.json)<br>`@deepseek-ai/dsh-message-feedback` | 后续 | `deferred` | 反馈服务与产品渠道独立设计 |

### fs

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/fs/fs`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/fs/package.json)<br>`@deepseek-ai/dsh-fs` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/fs-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/fs-local/package.json)<br>`@deepseek-ai/dsh-fs-local` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/fs-observation-policy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/fs-observation-policy/package.json)<br>`@deepseek-ai/dsh-fs-observation-policy` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/fs-sandbox`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/fs-sandbox/package.json)<br>`@deepseek-ai/dsh-fs-sandbox` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/tool-fs`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/tool-fs/package.json)<br>`@deepseek-ai/dsh-tool-fs` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/tool-fs-search`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/tool-fs-search/package.json)<br>`@deepseek-ai/dsh-tool-fs-search` | P1 | `planned` | 迁入文件契约与选定工具 |
| [`packages/fs/tool-str-replace-editor`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/fs/tool-str-replace-editor/package.json)<br>`@deepseek-ai/dsh-tool-str-replace-editor` | P1 | `planned` | 迁入文件契约与选定工具 |

### goal

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/goal/command-goal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/goal/command-goal/package.json)<br>`@deepseek-ai/dsh-command-goal` | P2 | `planned` | P2 同 Session 有界目标；不替代 TaskRuntime，见 ADR-015 |
| [`packages/goal/goal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/goal/goal/package.json)<br>`@deepseek-ai/dsh-goal` | P2 | `planned` | P2 同 Session 有界目标；不替代 TaskRuntime，见 ADR-015 |
| [`packages/goal/goal-round-driver`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/goal/goal-round-driver/package.json)<br>`@deepseek-ai/dsh-goal-round-driver` | P2 | `planned` | P2 同 Session 有界目标；不替代 TaskRuntime，见 ADR-015 |
| [`packages/goal/tool-goal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/goal/tool-goal/package.json)<br>`@deepseek-ai/dsh-tool-goal` | P2 | `planned` | P2 同 Session 有界目标；不替代 TaskRuntime，见 ADR-015 |

### guard

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/guard/repeat-tool-reminder`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/guard/repeat-tool-reminder/package.json)<br>`@deepseek-ai/dsh-repeat-tool-reminder` | P1 | `planned` | 迁入错误与无进展保护 |
| [`packages/guard/timeout-policy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/guard/timeout-policy/package.json)<br>`@deepseek-ai/dsh-tool-call-timeout-policy` | P1 | `planned` | 迁入错误与无进展保护 |

### host

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/host/directory-picker`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/directory-picker/package.json)<br>`@deepseek-ai/dsh-host-directory-picker` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/directory-picker-auto`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/directory-picker-auto/package.json)<br>`@deepseek-ai/dsh-host-directory-picker-auto` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/directory-picker-browse`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/directory-picker-browse/package.json)<br>`@deepseek-ai/dsh-host-directory-picker-browse` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/directory-picker-native`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/directory-picker-native/package.json)<br>`@deepseek-ai/dsh-host-directory-picker-native` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/frontend-static`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/frontend-static/package.json)<br>`@deepseek-ai/dsh-host-frontend-static` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/open-in-app`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/open-in-app/package.json)<br>`@deepseek-ai/dsh-host-open-in-app` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/plugin-inventory`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/plugin-inventory/package.json)<br>`@deepseek-ai/dsh-host-plugin-inventory` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |
| [`packages/host/product-telemetry-otel`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/product-telemetry-otel/package.json)<br>`@deepseek-ai/dsh-host-product-telemetry-otel` | 后续 | `excluded` | 不继承上游采集与传输配置 |
| [`packages/host/webserver`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/webserver/package.json)<br>`@deepseek-ai/dsh-host-webserver` | P2/P7 | `planned` | 迁入 Web Host 与平台能力；遥测另审 |

### identity

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/identity/anonymous-user-id`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/identity/anonymous-user-id/package.json)<br>`@deepseek-ai/dsh-anonymous-user-id` | P2 | `reference_only` | 身份集成按本产品认证边界重建 |

### interaction

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/interaction/commands`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/interaction/commands/package.json)<br>`@deepseek-ai/dsh-commands` | P1/P2 | `planned` | 迁入审批、问题和权限语义 |
| [`packages/interaction/permission-presets`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/interaction/permission-presets/package.json)<br>`@deepseek-ai/dsh-permission-presets` | P1/P2 | `planned` | 迁入审批、问题和权限语义 |
| [`packages/interaction/tool-ask-user`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/interaction/tool-ask-user/package.json)<br>`@deepseek-ai/dsh-tool-ask-user` | P1/P2 | `planned` | 迁入审批、问题和权限语义 |
| [`packages/interaction/user-approval`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/interaction/user-approval/package.json)<br>`@deepseek-ai/dsh-user-approval` | P1/P2 | `planned` | 迁入审批、问题和权限语义 |
| [`packages/interaction/user-questions`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/interaction/user-questions/package.json)<br>`@deepseek-ai/dsh-user-questions` | P1/P2 | `planned` | 迁入审批、问题和权限语义 |

### jobs

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/jobs/jobs`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/jobs/jobs/package.json)<br>`@deepseek-ai/dsh-jobs` | P1/P3 | `planned` | 迁入后台工具作业；不替代 TaskRuntime |
| [`packages/jobs/jobs-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/jobs/jobs-local/package.json)<br>`@deepseek-ai/dsh-jobs-local` | P1/P3 | `planned` | 迁入后台工具作业；不替代 TaskRuntime |
| [`packages/jobs/tool-jobs`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/jobs/tool-jobs/package.json)<br>`@deepseek-ai/dsh-tool-jobs` | P1/P3 | `planned` | 迁入后台工具作业；不替代 TaskRuntime |

### llm

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/llm/deepseek-llm-api-extensions`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/deepseek-llm-api-extensions/package.json)<br>`@deepseek-ai/dsh-deepseek-llm-api-extensions` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/llm`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm/package.json)<br>`@deepseek-ai/dsh-llm` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/llm-deepseek`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm-deepseek/package.json)<br>`@deepseek-ai/dsh-llm-deepseek` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/llm-deepseek-account`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm-deepseek-account/package.json)<br>`@deepseek-ai/dsh-llm-deepseek-account` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |
| [`packages/llm/llm-deepseek-api-key`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm-deepseek-api-key/package.json)<br>`@deepseek-ai/dsh-llm-deepseek-api-key` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/llm-pi-ai`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm-pi-ai/package.json)<br>`@deepseek-ai/dsh-llm-pi-ai` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/llm-retry`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/llm-retry/package.json)<br>`@deepseek-ai/dsh-llm-retry` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/plugin-package-inventory-deepseek`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/plugin-package-inventory-deepseek/package.json)<br>`@deepseek-ai/dsh-plugin-package-inventory-deepseek` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |
| [`packages/llm/token-meter`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/llm/token-meter/package.json)<br>`@deepseek-ai/dsh-token-meter` | P1 | `planned` | 迁入模型抽象及选定 Provider；账号产品服务另审 |

### lsp

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/lsp/lsp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/lsp/lsp/package.json)<br>`@deepseek-ai/dsh-lsp` | 后续 | `deferred` | 代码语言服务非首版必要能力 |
| [`packages/lsp/lsp-stdio`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/lsp/lsp-stdio/package.json)<br>`@deepseek-ai/dsh-lsp-stdio` | 后续 | `deferred` | 代码语言服务非首版必要能力 |
| [`packages/lsp/tool-lsp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/lsp/tool-lsp/package.json)<br>`@deepseek-ai/dsh-tool-lsp` | 后续 | `deferred` | 代码语言服务非首版必要能力 |

### mcp

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/mcp/mcp-client`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/mcp/mcp-client/package.json)<br>`@deepseek-ai/dsh-mcp-client` | P3 | `planned` | 迁入连接和资源，增加产品权限管理 |
| [`packages/mcp/mcp-resources`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/mcp/mcp-resources/package.json)<br>`@deepseek-ai/dsh-mcp-resources` | P3 | `planned` | 迁入连接和资源，增加产品权限管理 |

### native

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`native/system`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/package.json)<br>`@deepseek-ai/node-addon-system-workspace` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |
| [`native/system/packages/darwin-arm64`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/packages/darwin-arm64/package.json)<br>`@deepseek-ai/node-addon-system-darwin-arm64` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |
| [`native/system/packages/darwin-x64`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/packages/darwin-x64/package.json)<br>`@deepseek-ai/node-addon-system-darwin-x64` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |
| [`native/system/packages/entry`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/packages/entry/package.json)<br>`@deepseek-ai/node-addon-system` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |
| [`native/system/packages/linux-arm64`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/packages/linux-arm64/package.json)<br>`@deepseek-ai/node-addon-system-linux-arm64` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |
| [`native/system/packages/linux-x64`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/native/system/packages/linux-x64/package.json)<br>`@deepseek-ai/node-addon-system-linux-x64` | P1/P7 | `planned` | 依真实平台能力纳入，验证二进制与资源 |

### plan

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/plan/plan-mode`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/plan/plan-mode/package.json)<br>`@deepseek-ai/dsh-plan-mode` | P2 | `planned` | P2 /plan 与规划审阅；不是 P6 Scheduler |

### preset

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/preset/agent-preset`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/preset/agent-preset/package.json)<br>`@deepseek-ai/dsh-agent-preset` | P3 | `planned` | 迁入运行预设，产品维护长期身份 |
| [`packages/preset/agent-preset-registry`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/preset/agent-preset-registry/package.json)<br>`@deepseek-ai/dsh-agent-preset-registry` | P3 | `planned` | 迁入运行预设，产品维护长期身份 |
| [`packages/preset/persona`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/preset/persona/package.json)<br>`@deepseek-ai/dsh-persona` | P3 | `planned` | 迁入运行预设，产品维护长期身份 |

### ptc-runtime

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/ptc-runtime/ptc-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ptc-runtime/ptc-runtime/package.json)<br>`@deepseek-ai/dsh-ptc-runtime` | 后续 | `deferred` | 首版优先 native 工具执行；依闭包另审 |
| [`packages/ptc-runtime/ptc-runtime-node`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ptc-runtime/ptc-runtime-node/package.json)<br>`@deepseek-ai/dsh-ptc-runtime-node` | 后续 | `deferred` | 首版优先 native 工具执行；依闭包另审 |

### python

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`python/sdk-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/python/sdk-runtime/package.json)<br>`dsh-python-runtime-closure` | 后续 | `deferred` | Python 发行版不是首版交付目标 |

### sandbox

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/sandbox/sandbox`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sandbox/sandbox/package.json)<br>`@deepseek-ai/dsh-sandbox` | P1/P7 | `planned` | 迁入契约和平台策略；重新设置默认权限 |
| [`packages/sandbox/sandbox-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sandbox/sandbox-local/package.json)<br>`@deepseek-ai/dsh-sandbox-local` | P1/P7 | `planned` | 迁入契约和平台策略；重新设置默认权限 |
| [`packages/sandbox/sandbox-policy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sandbox/sandbox-policy/package.json)<br>`@deepseek-ai/dsh-sandbox-policy` | P1/P7 | `planned` | 迁入契约和平台策略；重新设置默认权限 |
| [`packages/sandbox/sandbox-windows-acl`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sandbox/sandbox-windows-acl/package.json)<br>`@deepseek-ai/dsh-sandbox-windows-acl` | P1/P7 | `planned` | 迁入契约和平台策略；重新设置默认权限 |

### schedule

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/schedule/schedule`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/schedule/schedule/package.json)<br>`@deepseek-ai/dsh-schedule` | P6 | `reference_only` | 参考触发与工具，产品统一计划运行时 |
| [`packages/schedule/tool-schedule`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/schedule/tool-schedule/package.json)<br>`@deepseek-ai/dsh-tool-schedule` | P6 | `reference_only` | 参考触发与工具，产品统一计划运行时 |

### sdk

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/sdk/client`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sdk/client/package.json)<br>`@deepseek-ai/dsh-sdk-client` | 后续 | `deferred` | 不作为源码迁移的替代方案 |
| [`packages/sdk/protocol`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sdk/protocol/package.json)<br>`@deepseek-ai/dsh-sdk-protocol` | 后续 | `deferred` | 不作为源码迁移的替代方案 |
| [`packages/sdk/server`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/sdk/server/package.json)<br>`@deepseek-ai/dsh-sdk-jsonrpc-server` | 后续 | `deferred` | 不作为源码迁移的替代方案 |

### session

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/session/message-quotes`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/message-quotes/package.json)<br>`@deepseek-ai/dsh-message-quotes` | P2 | `planned` | P2 消息引用与结构化草稿，保留公开契约 |
| [`packages/session/session-checkpoint-policy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-checkpoint-policy/package.json)<br>`@deepseek-ai/dsh-session-checkpoint-policy` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format/package.json)<br>`@deepseek-ai/dsh-session-format` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format-catalog`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format-catalog/package.json)<br>`@deepseek-ai/dsh-session-format-catalog` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format-v0-to-v1`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format-v0-to-v1/package.json)<br>`@deepseek-ai/dsh-session-format-v0-to-v1` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format-v1-to-v2`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format-v1-to-v2/package.json)<br>`@deepseek-ai/dsh-session-format-v1-to-v2` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format-v2-to-v3`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format-v2-to-v3/package.json)<br>`@deepseek-ai/dsh-session-format-v2-to-v3` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-format-v3-to-v4`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-format-v3-to-v4/package.json)<br>`@deepseek-ai/dsh-session-format-v3-to-v4` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-log-deepseek`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-log-deepseek/package.json)<br>`@deepseek-ai/dsh-session-log-deepseek` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-persistence`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-persistence/package.json)<br>`@deepseek-ai/dsh-session-persistence` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-persistence-jsonl`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-persistence-jsonl/package.json)<br>`@deepseek-ai/dsh-session-persistence-jsonl` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-projection`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-projection/package.json)<br>`@deepseek-ai/dsh-session-projection` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-projection-cache`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-projection-cache/package.json)<br>`@deepseek-ai/dsh-session-projection-cache` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-stats`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-stats/package.json)<br>`@deepseek-ai/dsh-session-stats` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-telemetry`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-telemetry/package.json)<br>`@deepseek-ai/dsh-session-telemetry` | P2 | `reference_only` | 审计契约并替换产品账户或观测集成 |
| [`packages/session/session-telemetry-otel`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-telemetry-otel/package.json)<br>`@deepseek-ai/dsh-session-telemetry-otel` | 后续 | `excluded` | 不继承上游采集与传输配置 |
| [`packages/session/session-title`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-title/package.json)<br>`@deepseek-ai/dsh-session-title` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-title-first-prompt-llm`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-title-first-prompt-llm/package.json)<br>`@deepseek-ai/dsh-session-title-first-prompt-llm` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-title-llm`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-title-llm/package.json)<br>`@deepseek-ai/dsh-session-title-llm` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/session-turn-outline`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-turn-outline/package.json)<br>`@deepseek-ai/dsh-session-turn-outline` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/tool-working-directory`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/tool-working-directory/package.json)<br>`@deepseek-ai/dsh-tool-working-directory` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |
| [`packages/session/working-directory`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/working-directory/package.json)<br>`@deepseek-ai/dsh-working-directory` | P1 | `planned` | 迁入日志、格式、投影和恢复；遥测另审 |

### session-query

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/session-query/session-log-export`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session-query/session-log-export/package.json)<br>`@deepseek-ai/dsh-session-log-export` | P2 | `planned` | P2 /export ZIP／Markdown 与鉴权下载 |
| [`packages/session-query/session-query`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session-query/session-query/package.json)<br>`@deepseek-ai/dsh-session-query` | P2 | `planned` | 随 Session API 所需查询能力迁入 |
| [`packages/session-query/session-query-sqlite`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session-query/session-query-sqlite/package.json)<br>`@deepseek-ai/dsh-session-query-sqlite` | P2 | `planned` | 随 Session API 所需查询能力迁入 |

### settings

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/settings/settings`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/settings/settings/package.json)<br>`@deepseek-ai/dsh-settings` | P2 | `planned` | 迁入设置契约并做产品作用域适配 |

### shell

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/shell/bash-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/bash-local/package.json)<br>`@deepseek-ai/dsh-bash-local` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/bash-sandbox`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/bash-sandbox/package.json)<br>`@deepseek-ai/dsh-bash-sandbox` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/pwsh-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/pwsh-local/package.json)<br>`@deepseek-ai/dsh-pwsh-local` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/pwsh-sandbox`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/pwsh-sandbox/package.json)<br>`@deepseek-ai/dsh-pwsh-sandbox` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/shell`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/shell/package.json)<br>`@deepseek-ai/dsh-shell` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/shell-env`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/shell-env/package.json)<br>`@deepseek-ai/dsh-shell-env` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/tool-bash`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/tool-bash/package.json)<br>`@deepseek-ai/dsh-tool-bash` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/tool-bash-persistent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/tool-bash-persistent/package.json)<br>`@deepseek-ai/dsh-tool-bash-persistent` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/tool-pwsh`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/tool-pwsh/package.json)<br>`@deepseek-ai/dsh-tool-pwsh` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |
| [`packages/shell/tool-pwsh-persistent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/shell/tool-pwsh-persistent/package.json)<br>`@deepseek-ai/dsh-tool-pwsh-persistent` | P1 | `planned` | 按目标平台选 shell 提供者和工具 |

### skill

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/skill/skill`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/skill/package.json)<br>`@deepseek-ai/dsh-skill` | P3 | `planned` | 迁入基础加载，增加版本和学习管理 |
| [`packages/skill/skill-filesystem`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/skill-filesystem/package.json)<br>`@deepseek-ai/dsh-skill-filesystem` | P3 | `planned` | 迁入基础加载，增加版本和学习管理 |
| [`packages/skill/skill-office`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/skill-office/package.json)<br>`@deepseek-ai/dsh-skill-office` | 后续 | `deferred` | Office 与工作区运行时按需扩展 |
| [`packages/skill/tool-skill`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/tool-skill/package.json)<br>`@deepseek-ai/dsh-tool-skill` | P3 | `planned` | 迁入基础加载，增加版本和学习管理 |
| [`packages/skill/tool-workspace-dependencies`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/tool-workspace-dependencies/package.json)<br>`@deepseek-ai/dsh-tool-workspace-dependencies` | 后续 | `deferred` | Office 与工作区运行时按需扩展 |

### spill

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/spill/spill`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/spill/spill/package.json)<br>`@deepseek-ai/dsh-spill` | P1 | `planned` | 迁入大输出保留与检索 |
| [`packages/spill/spill-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/spill/spill-local/package.json)<br>`@deepseek-ai/dsh-spill-local` | P1 | `planned` | 迁入大输出保留与检索 |
| [`packages/spill/spill-policy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/spill/spill-policy/package.json)<br>`@deepseek-ai/dsh-spill-policy` | P1 | `planned` | 迁入大输出保留与检索 |

### ssh

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/ssh/fs-ssh`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ssh/fs-ssh/package.json)<br>`@deepseek-ai/dsh-fs-ssh` | 后续 | `deferred` | 跨机器执行边界按需扩展 |
| [`packages/ssh/sandbox-ssh`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ssh/sandbox-ssh/package.json)<br>`@deepseek-ai/dsh-sandbox-ssh` | 后续 | `deferred` | 跨机器执行边界按需扩展 |
| [`packages/ssh/ssh`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ssh/ssh/package.json)<br>`@deepseek-ai/dsh-ssh` | 后续 | `deferred` | 跨机器执行边界按需扩展 |
| [`packages/ssh/ssh-helper-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ssh/ssh-helper-runtime/package.json)<br>`@deepseek-ai/dsh-ssh-helper-runtime` | 后续 | `deferred` | 跨机器执行边界按需扩展 |
| [`packages/ssh/subprocess-ssh`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/ssh/subprocess-ssh/package.json)<br>`@deepseek-ai/dsh-subprocess-ssh` | 后续 | `deferred` | 跨机器执行边界按需扩展 |

### storage

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/storage/storage`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/storage/storage/package.json)<br>`@deepseek-ai/dsh-storage` | P1 | `planned` | 迁入存储契约与选定 Provider |
| [`packages/storage/storage-domain`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/storage/storage-domain/package.json)<br>`@deepseek-ai/dsh-storage-domain` | P1 | `planned` | 迁入存储契约与选定 Provider |
| [`packages/storage/storage-json`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/storage/storage-json/package.json)<br>`@deepseek-ai/dsh-storage-json` | P1 | `planned` | 迁入存储契约与选定 Provider |
| [`packages/storage/storage-sqlite`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/storage/storage-sqlite/package.json)<br>`@deepseek-ai/dsh-storage-sqlite` | P1 | `planned` | 迁入存储契约与选定 Provider |

### subagent

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/subagent/subagent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent/package.json)<br>`@deepseek-ai/dsh-subagent` | P3 | `planned` | 选择内进程提供者，关联持久任务 |
| [`packages/subagent/subagent-acp`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-acp/package.json)<br>`@deepseek-ai/dsh-subagent-acp` | 后续 | `deferred` | 外部执行器与 SDK 提供者按需扩展 |
| [`packages/subagent/subagent-claude-code`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-claude-code/package.json)<br>`@deepseek-ai/dsh-subagent-claude-code` | 后续 | `deferred` | 外部执行器与 SDK 提供者按需扩展 |
| [`packages/subagent/subagent-codex`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-codex/package.json)<br>`@deepseek-ai/dsh-subagent-codex` | 后续 | `deferred` | 外部执行器与 SDK 提供者按需扩展 |
| [`packages/subagent/subagent-dsh-sdk`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-dsh-sdk/package.json)<br>`@deepseek-ai/dsh-subagent-dsh-sdk` | 后续 | `deferred` | 外部执行器与 SDK 提供者按需扩展 |
| [`packages/subagent/subagent-fork-in-process`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-fork-in-process/package.json)<br>`@deepseek-ai/dsh-subagent-fork-in-process` | P3 | `planned` | 选择内进程提供者，关联持久任务 |
| [`packages/subagent/subagent-spawn-in-process`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/subagent-spawn-in-process/package.json)<br>`@deepseek-ai/dsh-subagent-spawn-in-process` | P3 | `planned` | 选择内进程提供者，关联持久任务 |
| [`packages/subagent/tool-subagent`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/tool-subagent/package.json)<br>`@deepseek-ai/dsh-tool-subagent` | P3 | `planned` | 选择内进程提供者，关联持久任务 |
| [`packages/subagent/tool-subagent-control`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subagent/tool-subagent-control/package.json)<br>`@deepseek-ai/dsh-tool-subagent-control` | P3 | `planned` | 选择内进程提供者，关联持久任务 |

### subprocess

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/subprocess/subprocess`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subprocess/subprocess/package.json)<br>`@deepseek-ai/dsh-subprocess` | P1 | `planned` | 迁入进程与取消清理 |
| [`packages/subprocess/subprocess-local`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subprocess/subprocess-local/package.json)<br>`@deepseek-ai/dsh-subprocess-local` | P1 | `planned` | 迁入进程与取消清理 |
| [`packages/subprocess/win32-process`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/subprocess/win32-process/package.json)<br>`@deepseek-ai/dsh-win32-process` | P1 | `planned` | 迁入进程与取消清理 |

### telemetry

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/telemetry/otel`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/telemetry/otel/package.json)<br>`@deepseek-ai/dsh-otel` | 后续 | `excluded` | 不继承上游采集目标；产品自行定义观测 |

### terminal

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/terminal/terminal`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/terminal/terminal/package.json)<br>`@deepseek-ai/dsh-terminal` | P2 | `planned` | P2 对话操作闭包；P7 其他平台实机验收 |
| [`packages/terminal/terminal-bash`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/terminal/terminal-bash/package.json)<br>`@deepseek-ai/dsh-terminal-bash` | P2 | `planned` | P2 对话操作闭包；P7 其他平台实机验收 |

### test-support

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/test-support/agent-loop-testkit`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/agent-loop-testkit/package.json)<br>`@deepseek-ai/dsh-agent-loop-testkit` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/client-runtime`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/client-runtime/package.json)<br>`@deepseek-ai/dsh-client-test-runtime` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/llm-mock-server`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/llm-mock-server/package.json)<br>`@deepseek-ai/dsh-llm-mock-server` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/llm-replay`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/llm-replay/package.json)<br>`@deepseek-ai/dsh-llm-replay` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/loader-smoke`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/loader-smoke/package.json)<br>`@deepseek-ai/dsh-loader-smoke` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/remote-mock`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/remote-mock/package.json)<br>`@deepseek-ai/dsh-remote-mock` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/session-snapshot`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/session-snapshot/package.json)<br>`@deepseek-ai/dsh-session-snapshot` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |
| [`packages/test-support/tool-testkit`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/test-support/tool-testkit/package.json)<br>`@deepseek-ai/dsh-tool-testkit` | P0/P7 | `planned` | 随所迁测试带入必要支撑 |

### todo

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/todo/tool-todo`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/todo/tool-todo/package.json)<br>`@deepseek-ai/dsh-tool-todo` | P2 | `reference_only` | 回合待办呈现不替代产品 Task |

### typert

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/typert/generator`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/typert/generator/package.json)<br>`@deepseek-ai/dsh-typert-generator` | 后续 | `deferred` | 需要单独评审 |
| [`packages/typert/loader`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/typert/loader/package.json)<br>`@deepseek-ai/dsh-typert-loader` | 后续 | `deferred` | 需要单独评审 |
| [`packages/typert/protocol`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/typert/protocol/package.json)<br>`@deepseek-ai/dsh-typert-protocol` | 后续 | `deferred` | 需要单独评审 |
| [`packages/typert/registry`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/typert/registry/package.json)<br>`@deepseek-ai/dsh-typert-registry` | 后续 | `deferred` | 需要单独评审 |

### util

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/util/atomic-write`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/atomic-write/package.json)<br>`@deepseek-ai/dsh-atomic-write` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/brand`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/brand/package.json)<br>`@deepseek-ai/dsh-brand` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/chunked-list`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/chunked-list/package.json)<br>`@deepseek-ai/dsh-chunked-list` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/code-language`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/code-language/package.json)<br>`@deepseek-ai/dsh-util-code-language` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/crypto`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/crypto/package.json)<br>`@deepseek-ai/dsh-util-crypto` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/deque`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/deque/package.json)<br>`@deepseek-ai/dsh-deque` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/file-drag`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/file-drag/package.json)<br>`@deepseek-ai/dsh-util-file-drag` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/home-paths`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/home-paths/package.json)<br>`@deepseek-ai/dsh-home-paths` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/http-proxy`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/http-proxy/package.json)<br>`@deepseek-ai/dsh-http-proxy` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/launch-environment`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/launch-environment/package.json)<br>`@deepseek-ai/dsh-launch-environment` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/lazy-require`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/lazy-require/package.json)<br>`@deepseek-ai/dsh-lazy-require` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/native-command`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/native-command/package.json)<br>`@deepseek-ai/dsh-native-command` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/official-bundles`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/official-bundles/package.json)<br>`@deepseek-ai/dsh-official-bundles` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/output-retention`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/output-retention/package.json)<br>`@deepseek-ai/dsh-output-retention` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/package-manifest`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/package-manifest/package.json)<br>`@deepseek-ai/dsh-package-manifest` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/plugin-detail`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/plugin-detail/package.json)<br>`@deepseek-ai/dsh-plugin-detail` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/plugin-market-index`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/plugin-market-index/package.json)<br>`@deepseek-ai/dsh-plugin-market-index` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/time`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/time/package.json)<br>`@deepseek-ai/dsh-util-time` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/timeout`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/timeout/package.json)<br>`@deepseek-ai/dsh-timeout` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/values`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/values/package.json)<br>`@deepseek-ai/dsh-util-values` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |
| [`packages/util/workspace-path`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/util/workspace-path/package.json)<br>`@deepseek-ai/dsh-util-workspace-path` | P0/P1 | `planned` | 依闭包迁入；品牌与官方清单产品化 |

### vendor

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`vendor/cordis`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/cordis/package.json)<br>`@deepseek-ai/cordis` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/cosmokit`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/cosmokit/package.json)<br>`@deepseek-ai/cosmokit` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/group`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/group/package.json)<br>`@deepseek-ai/cordis-plugin-group` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/hmr`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/hmr/package.json)<br>`@deepseek-ai/cordis-plugin-hmr` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/include`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/include/package.json)<br>`@deepseek-ai/cordis-plugin-include` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/loader`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/loader/package.json)<br>`@deepseek-ai/cordis-plugin-loader` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/logger-console`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/logger-console/package.json)<br>`@deepseek-ai/cordis-plugin-logger-console` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/schemastery`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/schemastery/package.json)<br>`@deepseek-ai/schemastery` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |
| [`vendor/timer`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/timer/package.json)<br>`@deepseek-ai/cordis-plugin-timer` | P0 | `planned` | 依闭包迁入并保持单份服务身份 |

### web

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/web/tool-web`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/tool-web/package.json)<br>`@deepseek-ai/dsh-tool-web` | P2 | `planned` | P2 真实搜索／抓取工具与结果 |
| [`packages/web/web`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web/package.json)<br>`@deepseek-ai/dsh-web` | P2 | `planned` | P2 搜索／抓取服务契约，不替代 P4 浏览器 |
| [`packages/web/web-deepseek-api`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web-deepseek-api/package.json)<br>`@deepseek-ai/dsh-web-deepseek-api` | 后续 | `deferred` | 网页搜索抓取按需配置，不替代浏览器 |
| [`packages/web/web-fetch-http`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web-fetch-http/package.json)<br>`@deepseek-ai/dsh-web-fetch-http` | P2 | `planned` | P2 抓取 Provider，保留地址与重定向保护 |
| [`packages/web/web-search-deepseek`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web-search-deepseek/package.json)<br>`@deepseek-ai/dsh-web-search-deepseek` | P2 | `planned` | P2 搜索候选；显式凭据与可用性需核实，不接账户默认项 |
| [`packages/web/web-search-exa`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web-search-exa/package.json)<br>`@deepseek-ai/dsh-web-search-exa` | 后续 | `deferred` | 网页搜索抓取按需配置，不替代浏览器 |
| [`packages/web/web-search-perplexity`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/web/web-search-perplexity/package.json)<br>`@deepseek-ai/dsh-web-search-perplexity` | 后续 | `deferred` | 网页搜索抓取按需配置，不替代浏览器 |

### website

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`website`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/website/package.json)<br>`@deepseek-ai/website` | 不纳入 | `excluded` | 上游官网不迁入本产品 |

### workflow

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/workflow/tool-workflow`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/workflow/tool-workflow/package.json)<br>`@deepseek-ai/dsh-tool-workflow` | 后续 | `reference_only` | 参考工具组合；网站经验使用受控工作流 |
| [`packages/workflow/workflow`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/workflow/workflow/package.json)<br>`@deepseek-ai/dsh-workflow` | 后续 | `reference_only` | 参考工具组合；网站经验使用受控工作流 |
| [`packages/workflow/workflow-ptc`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/workflow/workflow-ptc/package.json)<br>`@deepseek-ai/dsh-workflow-ptc` | 后续 | `reference_only` | 参考工具组合；网站经验使用受控工作流 |

### workspace

本组按能力、依赖和首次评估阶段处理，具体原因见各行。

| 源码目录与包 | 阶段 | 策略 | 说明 |
| --- | --- | --- | --- |
| [`packages/workspace/workspace`](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/workspace/workspace/package.json)<br>`@deepseek-ai/dsh-workspace` | P1 | `planned` | 迁入工作区作用域 |

## 7. 下一步

按总计划的当前任务续接，每项核查实际闭包并更新独立登记。
原 M0／M1／M3 实际来源和本地补丁保留，表中的 planned 不能替代实施证据。

## 9. P2 实际迁入索引

P2 的实际闭包、源文件哈希、许可、包清单适配与回滚基点见
[M3 迁移登记](../../migration/M3-迁移登记.json)。其中 API 双面配置与生成器保持
共享包身份，生成客户端与 Host codec 随构建生成；产品运行不依赖相邻参考源码。
前端参考项的采用/包装/重写见[前端参考 §8](前端协议与多端参考.md#8-p2-实施取舍登记)。
不修改上游基线或原包元数据快照来表示迁移进度。

## 10. P2 换壳补充批次

新增能力分为 M3.1 前端行为、M3.2 会话命令、M3.3 工具与资源，具体种子与
闭包核查见[P2 对齐附录 §6](P2-DSH换壳对齐需求.md#6-迁移方式与依赖闭包)。
这些是待实施批次，不能写入旧 M3 登记冒充已经迁入。

原先 ui-chat／conversation／tool 等 reference_only、Goal／Plan／Web 的后续安排
按本次范围调整为 P2 planned。其余包仍按实际需要核查，不把整个上游包表一次迁入。
上下游名称、源码哈希及包元数据 JSON 是证据快照，本次不修改；应用进度仅在总计划。
