# P4 Ego 来源与运行边界

本轮新增代码由本项目实现，通过已安装的 Ego 公开执行接口连接本机浏览器。
不复制 Ego 程序、Chromium、个人 Profile、Cookie 或安装包，不把独立原型作为依赖。

## 已核对的接口

2026-11-03 本机安装版本为 `ego-browser 0.6.2.5`，报告的 Chromium 版本为
`156.0.8078.74`，嵌入 Node 为 `v24.22.1`。接口依据安装版本提供的 v2.2.0
操作指南及实际受控调用；版本与 PNG 能力由连接器启动时再次探测。

连接器使用 `taskSpace`、`TaskSpace.pages/page`、页面快照与 Ref 操作、
`Page.events`、受限媒体／人工输入 CDP、下载和 `TaskSpace.finish`。
原生交接使用 `handOff`，只有明确用户归还才使用 `takeOverTaskSpace`。
`Browser.getVersion` 在当前执行环境不可用，因此不依赖它；`Page.events()`
是缓冲事件读取接口，不按 EventEmitter 使用。

Ego 是外部安装依赖。本轮没有取得或扩大其再分发授权；P7 需要另行核对安装、
许可、签名与分发。本轮仅验证用户现有安装，不将 npm 依赖许可检查当作 Ego 许可。

## 代码和依赖

| 内容 | 来源及边界 |
| --- | --- |
| `packages/product/ego-connector` | 新增的独立进程桥接与受检协议；运行时仅依赖 PATH 中的 Ego 和 Node 内建模块 |
| `packages/product/task-runtime` | 新增的浏览器最小 Task／Execution／SessionBinding、SQLite 租约与通知 outbox |
| `packages/product/browser-service` | 新增的产品领域、严格输入校验、批准、审计与文件授权 |
| Host／UI 接入 | 复用已迁入的 Cordis、DSH Loop、工具最终 guard、统一模型、Typert、Connection、侧栏及 DSH 控件 |
| WebSocket | 使用锁定的 `ws 8.22.0`，MIT；不新增远程中继或媒体云服务 |
| OpenMuse | 本轮未复制其源码、配置或依赖；历史 M5 来源记录保留 |
| 临时原型 | 仅参考已确认的画面与浮动控制交互；目录保留，正式源码和构建不导入其文件 |

现有 DSH 迁移登记继续约束原组件来源。真实归还验收发现 Session 重复通知导致
React 更新循环，生命周期快照稳定性补丁登记在 M3，补丁文件为
`provenance/dsh-p4-session-snapshot.patch`。新增产品代码未另建 Loop；媒体和隐藏
IME 代理是新增专用适配，因为既有 iframe／Electron 新开页面无法显示同一 Ego 页面。

## 身份与资源策略

当前只支持单个个人 Host owner 使用其已授权的本机 Ego 安装。`profileGrantId`
表示该 owner 的连接授权，不表示已识别某个网站账号或支持独立 Profile 选择。
不枚举个人标签、切换网站账号或复制登录状态；多 owner 请求在服务入口拒绝。
跨网站账号隔离、其他平台和设备权限仍须分别验证。

仅管理 SDK 返回的当前任务页面，按 `openedBy` 展示来源，结束时使用 SDK 自有资源
释放规则。隐藏面板仅退订媒体；归还、结束任务和关闭页面分别处理。
连接器退出时清理自身随机套接字和执行子进程，不结束整个 Ego。

下载保存在 Host 私有目录，绑定 owner／Session，外部只得到不透明产物身份；
单文件最多 50 MiB、截图最多 8 MiB，每 Session 最多 64 个、256 MiB。
失败的临时文件清理，超过预算拒绝新产物；已发布文件按现有 Session 产物保留策略
保存，本轮不增加自动删除真实用户文件的策略。
输入正文不进入操作审计，只保存类型及输入身份的摘要；截图不随普通诊断自动采集。

## 回滚

禁用产品浏览器挂载后，已有聊天、技能、文件和 DSH Loop 可独立运行；
Ego 安装与原型目录无需改动。业务迁移幂等执行；通知表升级保留原有通知身份和状态。
本轮没有替换系统浏览器、扩大 Renderer 权限或修改外部安装。
