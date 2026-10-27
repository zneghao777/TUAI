# TIanZhiAi

通用个人助理 Harness。P1 已接通原 DSH 模型／工具循环、DeepSeek Provider、
JSONL 会话恢复、只读文件与沙箱 Shell、上下文压缩和审批。P2 新增真实 Host 驱动的
React Web 工作区、类型化协议、上传、审批、队列和恢复；持久 TaskRuntime 仍属 P3。
当前阶段验收状态见[总开发计划](总开发计划与进度记录.md)。

## 安装与运行

使用 `.node-version`／`.nvmrc` 指定的 Node 26.8.1、pnpm 11.28.5 和
TypeScript 6.0.3。以下命令不依赖本机全局 pnpm。
当前开发构建需要本机 C 编译器和 Node 头文件，macOS 使用 Command Line Tools 的 `cc`，
用于构建 Session 日志锁的 Node-API 模块。仅 macOS arm64 已实际验收。
Linux／Windows 的源码和契约不等于这些平台的安装验收。

```sh
npx --yes pnpm@11.28.5 install --frozen-lockfile
npx --yes pnpm@11.28.5 run build
node --expose-internals apps/cli/lib/index.js --check
node --expose-internals apps/cli/lib/index.js --demo --session demo-001
node --expose-internals apps/cli/lib/index.js --demo --session demo-001 --resume
```

`--demo` 显式选择离线假模型，执行求和与读取公开 Host 标识两种真实工具，并写入会话日志。
它不调用外部模型。`--prompt` 使用真实 DeepSeek Provider；取消信号和 120 秒总期限会中止当前执行。
一次 CLI 输出包含实际文本、事件和结束原因，失败或中断的退出码为 1。
不带 `--prompt`／`--demo` 时保持 Host 进程，Ctrl+C 或 SIGTERM 释放服务；
`--check` 加载并核验插件树后退出。

首次启动创建独立产品目录与无密钥配置 `config/host.json`。
可以通过 `TIANZHIAI_HOME` 指定隔离目录，例如：

```sh
TIANZHIAI_HOME="$PWD/.runtime" node --expose-internals apps/cli/lib/index.js --demo
```

在该产品目录的 `config/host.json` 中设置
`credentialReferences.deepseek = { "source": "environment", "name": "TIANZHIAI_SECRET_MODEL" }`，
然后在启动环境中提供对应密钥；配置格式见 [示例](config/host.example.json)。
密钥不放入 Profile、源码或命令参数。没有显式引用时不会自动发现其他环境凭据或 `.env`。

```sh
node --expose-internals apps/cli/lib/index.js --prompt '你好' --session chat-001
```

模型协议已使用本机受控 HTTP 服务验证；本次没有调用真实外部模型。
Keychain 和加密磁盘凭据库尚未实现。

## Web 工作区

安装、构建后从希望授权读取的工作区启动 Host。文件工具的读取范围以启动工作区为准。

```sh
npx --yes pnpm@11.28.5 run build
npx --yes pnpm@11.28.5 run build:web
npx --yes pnpm@11.28.5 run start:web
```

默认监听 `127.0.0.1:3100`。打开终端输出的登录入口，完成一次交换后访问
`http://127.0.0.1:3100/`。登录链接含凭证，不要提交或转发；网页不保存模型密钥。
生产入口只使用 Host 配置的 DeepSeek 环境引用，没有凭据不会切换到测试模型。

```sh
# 显式受控模型演示：真实 Host/上传/工具/审批，临时数据退出后清理
npx --yes pnpm@11.28.5 run demo:p2
# 前端开发服务器；先启动上面的 Host，并使用 Host 终端登录链接
npx --yes pnpm@11.28.5 run dev:web
```

受控演示默认端口 3101，模型名称明确显示“P2 受控验收模型”；普通文本产生受控流，
“读取工具”“用户问题”“审批”“持续运行”“大输出”用于重现验收流程。
这些测试场景只存在于 `tests/p2`，不进入生产启动组合。
如果 3101 已被原型预览占用，可用 `P2_DEMO_PORT=3110 npx --yes pnpm@11.28.5 run demo:p2`，
无需停止已有预览服务。

远程部署可用 `start:web -- --host 0.0.0.0 --trusted-host ai.example.com`。应由 HTTPS
反向代理保留浏览器侧 Host/Origin，转发 WebSocket Upgrade 并移除部署前缀；
静态资源、RPC、MUX 和附件均使用同一页面相对路径。不要把通配信任或任意 Origin 放开。
受控代理 `/assistant/` 与另一 Host 的身份/草稿隔离已有浏览器验收；公网部署不在本次交付中。

```sh
npx --yes pnpm@11.28.5 run test:p2
npx --yes pnpm@11.28.5 run test:ui
node --expose-internals tests/p2/capture.mjs
```

浏览器报告、实际截图和关键流程录像生成于 `reports/p2/`；万条历史与恢复测量也在该目录。
Web 文件选择来自当前设备，Host 目录选择/原生打开返回 unavailable。
Electron 已确认；当前只验证受控桥的调用方、Host、代次和资源检查，未交付安装包。

## 当前能力与边界

- 保留原 Loop、Session v4 及 v0～v3 读取迁移链，完整事件与产物分开存放。
- 文件工具仅允许当前工作区及当前会话的 Spill 产物，写入／编辑工具未注册。
- macOS Shell 使用真实只读沙箱，逐次调用需要 Host 批准，模型参数不能扩大权限。
  CLI 没有交互审批界面，没有回答端时拒绝执行；Web 可批准、拒绝或取消真实请求。
- 上下文启用 DSH 指令、文件引用、时间、压缩、图片卸载、结果裁剪、Spill 和重复提醒；
  单回合达到 32 步会记录失败并停止。跨会话查询、子 Agent、PTC 执行与 MCP 未启用。
- Profile 与 Patch 是用户维护的可信本机代码配置。未接入上游账户、匿名身份收集、遥测或更新服务。
  模型协议的原始包归属字段保留，产品不生成上游匿名身份。

Host 与 Client 类型分别检查；Web 使用 React 18.3.1、TypeScript 6.0.3 和 Vite 6.4.3，
使用 CSS Modules、设计变量与独立客户端对象/订阅绑定。
来源包保留 DSH 名称和许可，产品适配位于 `packages/product/agent-runtime`。
不引入第二套模型循环，也不使用 Session 的运行标志冒充产品任务成功。

## 验证与来源

```sh
npx --yes pnpm@11.28.5 run check
npx --yes pnpm@11.28.5 run verify:clean
```

`check` 包括格式、类型、构建、文档与进度、文件来源／许可／依赖身份，以及 P0/P1/P2 协议与对象行为测试。浏览器验收另运行 `pnpm test:ui`，需要 Google Chrome。
测试中的外部网络默认禁用，Provider 使用本机受控服务。
`verify:clean` 在开发目录之外的中文／空格路径中，以空 npm 缓存和空 pnpm Store 安装并运行同一门禁，
不携带本地编译产物。构建和运行均不依赖参考仓库。
允许安装脚本仅为 esbuild、koffi 和 node-pty，另保留 subprocess-local 已登记的启动辅助构建脚本。

以下仅为来源维护命令，需要显式提供锁定版本的只读参考仓库；不是普通构建前提：

```sh
node scripts/audit-upstream.mjs
node scripts/verify-replay.mjs <锁定的上游目录>
```

详情见 [P1 验收记录](docs/verification/P1验收记录.md)、
[M1/M2 迁移登记](docs/migration/M1-迁移登记.json)、
[M3 迁移登记](docs/migration/M3-迁移登记.json) 和
[P0 来源登记](docs/migration/M0-迁移登记.json)。
GitLab CI 已维护，尚未推送或远程执行。
