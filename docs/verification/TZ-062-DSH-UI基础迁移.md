# TZ-062：DSH UI 基础迁移核验

本项把天质现有页面接到 DSH 的 Renderer、Slot、Session 绑定和快捷键服务。
页面视觉继续由 `App.module.css`、`theme.css` 和产品组件负责。
思考／过程投影、结构化 Composer 和指令菜单分别由 TZ-063、TZ-065、TZ-066 接续，
本项不代表整个 P2 换壳已完成。任务状态以[总计划](../../总开发计划与进度记录.md)为准。

## 来源与迁移范围

源仓库锁定 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，迁移前工作区干净。
用户截图的逐条思考／工具过程和 `/` 菜单仍是后续目标；未推定已安装 App 与此提交同版。
新增 7 包、448 个上游文件，保留原 MIT 许可、逐文件 SHA-256 和适配补丁：

| 包                        | 本项用途与运行边界                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `client/ui-session`       | 原 Session 状态源、标准 hooks、显式 SessionProvider 绑定、释放和重挂载                        |
| `client/locale`           | 原 LocaleRuntime 与中英文公共字典；当前天质组合固定中文，不启用 LanguageRow 或 Host 设置写入  |
| `client/shortcuts`        | 原 DOM／输入法／弹窗仲裁、注册与存储；接入新会话动作                                          |
| `client/ui-settings`      | 原设置表单、镜像、schema 与 Slot 契约独立编译；暂不挂载运行服务                               |
| `client/ui-primitives`    | 快捷键所需的输入法和弹窗工具，以及 locale 编译所需组件；其余控件随对应任务接入                |
| `util/file-drag`          | primitives 的类型／源码闭包；本项未启用桌面拖动能力                                           |
| `api/settings-controller` | 生成原 settings 契约及 codec 供类型检查；不注册到生产 Host／Client，不开放其 credentials 操作 |

复用已迁入的 `ui-renderer`、`ui-slots`、`store`、Session Controller、Connection、
Gateway、RemoteAccess 与 Typert。RemoteAccess Client 原实现本项实际启用，Host 最终授权不变。
M1／M3 迁移源码、模型与权限补丁保持不变。

对应材料：

- [M4 迁移登记](../migration/M4-迁移登记.json)：依赖、来源哈希和产品补丁。
- [原始源码快照](../../provenance/dsh-m4-ui-foundation.tar.gz)。
- [M4 独立补丁](../../provenance/dsh-p2-ui-foundation-local.patch)。
- [应用组合](../../apps/web/src/ui.tsx)、[服务组合](../../apps/web/src/model/ui-foundation.ts)。

## 依赖与构建闭包

依赖检查覆盖 `.ts` 和 `.tsx`，源代码实际导入的依赖不能只因上游放在
`devDependencies` 就漏迁。迁移工具在复制前校验全部新增 manifest，类型入口同时识别 TSX。
React 18.3.1、ReactDOM、Cordis 和 Typert 保持单份解析与 Vite 去重。

新增 UI 包从 TypeScript 产出的 JS 生成静态 ESM，保留 CSS Modules 文件及相对引用，
Host／Client 类型分别检查。原 DSH 闭包加载器不参与天质 Vite 运行；静态构建无同级源码依赖。
renderer 的 JSX 使用 automatic runtime，不依赖全局 React。

原子组件提供 keyboard／modal／menu／icons 小入口，避免基础服务导入整包高亮器和数学资源。
Vite 构建检查实际输出模块，拒绝 Skill、轨迹页、账户、遥测、settings 控制器及 Node 浏览器占位模块。
构建证据输出到 `reports/p2/ui-foundation-bundle.json`。

已经核对的后续闭包：

| 后续任务    | 上游依赖与本项处理                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| TZ-063      | `ui-conversation` assembler／registry／groups 与 `ui-chat` 节点；当前仍使用旧 Transcript，不提前宣称思考流接通              |
| TZ-065      | `lexical`、`@lexical/headless/utils/text/plain-text/history` 均为上游 `^0.49.0`；迁编辑器时成组锁定安装，本项不加载空编辑器 |
| TZ-065／066 | `ui-commands`、`ui-input-trigger`、`ui-reference` 和 Host 命令实际处理器；尚未提供 `/` 菜单                                 |
| TZ-066      | settings mirror／configForms 必须有真实且受限的 Host 配置提供方再启用；当前模型管理沿用既有天质加密存储接口                 |
| TZ-068／069 | 工作区、资源、文件与预览需对应 Host 能力；不为满足 import 接入账户、桌面桥或整套上游壳                                      |

`ui-conversation` 对 ui-layout、ui-workspace、goal、plan、analytics 等依赖仍须在接入对应
行为时分类；本项不会把这张后续依赖清单当成已迁入的包或已启用的能力。

## 运行与样式边界

产品根注册到 DSH `root` Slot；聊天区通过 `tianzhiai.workspace` Session Slot 消费
原 `useSession`。当前会话引用记为 `mainView`，显式 Provider 接收原 Controller 引用。
切换和卸载释放引用，不在产品层复制 Session 状态机。现有 Transcript／Composer 留待后续替换。

启动页使用静态 DOM，成功后仅由 DSH renderer 创建一个 React 根；关闭时先卸载 UI 再释放服务。
新会话快捷键采用上游 Web 的主修饰键＋Alt＋N，桌面为主修饰键＋N；键帽来自实际目录，
弹窗和输入法优先处理。Linux Web 沿用上游未提供默认键的行为，按钮仍可用。
快捷键本地存储改为天质命名空间，不读 DSH 用户偏好。

主题、布局、Markdown、模型设置、只读默认权限、审批和工具 guard 均继续使用天质现有实现。
Locale 的通用语言设置、技能、独立轨迹页、账户、遥测、更新服务不随基础迁移启动。

## 核验与恢复

本项覆盖 DSH-01 前置、CORE-01/02 与 PROTO-07/08 的 UI 基础部分。
执行命令、结果及未测范围追加在总计划本次 RUN；测试产物保存在 `reports/`。
新增真实 Host 生命周期用例见 [ui-foundation.test.mjs](../../tests/p2/ui-foundation.test.mjs)，
真实页面的反复会话切换／快捷键／弹窗用例见
[foundation.spec.ts](../../tests/p2/browser/foundation.spec.ts)。

回滚基点为产品提交 `6d65d4e0657e6035b6f9442545ed4c250bfdb62e`。
回滚时仅撤销本项 App 组合、构建、包依赖与 M4 文件，重新安装原 lockfile 并构建；
保留已修订的 P2 计划、用户 AGENTS.md 和设计目录。数据库、Session 日志和凭据无迁移，
无需删除用户数据；不可直接用整仓 reset 覆盖并行工作。
