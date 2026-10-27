# TIanZhiAi

P0 底座已通过验收，P1 尚未开始。先安装固定工具链，再从本仓库构建；
模型循环、聊天和界面尚未实现。P0 生产 Profile 为空，开发 Profile 启用生命周期探针。

使用 `.node-version` 或 `.nvmrc` 指定的 Node 26.8.1。
上游最低要求是 Node 24.9.0，本项目开发与 CI 固定实际核验的 26.8.1。
使用 `packageManager` 锁定的 pnpm 11.28.5。
下面通过 npm 获取精确版本，不依赖本机全局 pnpm。
本机旧 Corepack 在 Node 26 下动态导入失败，未作为可用安装入口。

```sh
npx --yes pnpm@11.28.5 install --frozen-lockfile
npx --yes pnpm@11.28.5 run build
node apps/cli/lib/index.js --version
node --expose-internals apps/cli/lib/index.js --profile development --check
```

TypeScript 固定 6.0.3，与 DSH 基线一致；esbuild 固定 0.28.2，
取自上游锁文件，用于本阶段 ESM 构建。只允许 esbuild 的安装脚本。
不复制完整上游 overrides、补丁及 Native 安装脚本：当前依赖闭包不包含它们，
Workspace 协议保持 Vendor 解析身份，具体依赖随锁文件提交。

`--check` 在加载并核验插件树后释放资源、退出；省略它则保持 Host 进程，
按 Ctrl+C 或发送 SIGTERM 退出。配置清单显式列出 Profile 的根配置和补丁，
CLI 输出配置路径与启用树，不输出配置值。未引入上游账户、遥测、更新或全权限配置。
Profile 与 Patch 是本机用户维护的可信代码配置，不能接受网页或其他 Agent 自动写入。

`tsconfig.host.json` 检查 Host 入口，`tsconfig.client.json` 单独检查
浏览器安全的平台类型。前端已确认 React＋TypeScript＋Vite，采用独立于 Host 的客户端 SPA；
P0 仅完成选型，依赖安装、版本兼容验证和界面开发安排在 P2。
来源维护命令 `node scripts/audit-upstream.mjs` 需要显式可用的只读参考仓库；
构建和运行不使用参考仓库。

首次启动创建独立产品目录和无密钥的 `config/host.json`，保持 Host 身份不变。
可以在启动环境中设置 `TIANZHIAI_HOME` 进行隔离，例如：

```sh
TIANZHIAI_HOME="$PWD/.runtime" node --expose-internals apps/cli/lib/index.js --profile development --check
```

前端选型、默认目录与分域规则见 [ADR-003](docs/adr/ADR-003-前端选型与平台契约.md)。
`config/host.example.json` 只演示凭据引用，密钥由显式环境变量解析，
不会写入配置或客户端投影；当前尚无实际模型 Provider。
本阶段未实现 Keychain、加密磁盘凭据库、目录选择桥接或系统通知。

P0 质量门禁与空缓存复现命令如下：

```sh
npx --yes pnpm@11.28.5 run check
npx --yes pnpm@11.28.5 run verify:clean
```

`check` 包括格式、类型与构建、文档链接和进度、来源与依赖身份、许可及行为测试。
构建将包间依赖保留为外部引用，检查输入防止重复打包 Cordis；根清单提供唯一基础 Peer。
`verify:clean` 复制到临时工作区，使用空缓存安装、验证，随后清理临时目录。
来源、原样迁入文档和历史总计划不做自动排版改写。
GitLab CI 配置已提供，尚未推送或远程执行。
结果与限制见 [P0 验收记录](docs/verification/P0验收记录.md)。

任务与验收见[总开发计划](总开发计划与进度记录.md)，
来源与本地适配见[迁移登记](docs/migration/M0-迁移登记.json)。
