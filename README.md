# TIanZhiAi

当前处于 P0 底座开发阶段。先安装固定工具链，再从本仓库构建；
模型循环、聊天和界面尚未实现。

使用 `.node-version` 或 `.nvmrc` 指定的 Node 26.8.1。
上游最低要求是 Node 24.9.0，本项目开发与 CI 固定实际核验的 26.8.1。
使用 `packageManager` 锁定的 pnpm 11.28.5。
下面通过 npm 获取精确版本，不依赖本机全局 pnpm。
本机旧 Corepack 在 Node 26 下动态导入失败，未作为可用安装入口。

```sh
npx --yes pnpm@11.28.5 install --frozen-lockfile
npx --yes pnpm@11.28.5 run build
node apps/cli/lib/index.js --version
```

TypeScript 固定 6.0.3，与 DSH 基线一致；esbuild 固定 0.28.2，
取自上游锁文件，用于本阶段 ESM 构建。只允许 esbuild 的安装脚本。
不复制完整上游 overrides、补丁及 Native 安装脚本：当前依赖闭包不包含它们，
Workspace 协议保持 Vendor 解析身份，具体依赖随锁文件提交。

`tsconfig.host.json` 检查 Host 入口，`tsconfig.client.json` 单独检查
浏览器安全的平台类型。前端选型按用户要求暂缓。
来源维护命令 `node scripts/audit-upstream.mjs` 需要显式可用的只读参考仓库；
构建和运行不使用参考仓库。

任务与验收见[总开发计划](总开发计划与进度记录.md)，
来源与本地适配见[迁移登记](docs/migration/M0-迁移登记.json)。
