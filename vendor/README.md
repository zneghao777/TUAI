# Vendor 来源与补丁

六个 Vendor 包来自同一 DSH 基线，未改动 `src/`。
各包保留 MIT 许可，逐文件摘要见
[M0 登记](../docs/migration/M0-迁移登记.json)。

DSH 在 Cordis 上已有生命周期、模块解析、配置、Schema 和日志补丁。
完整原始修改清单保全在 `provenance/dsh-m0.tar.gz` 的 `vendor/README.md`，
不能将这些源码当成未修改的公共 Cordis rc.7。

本项目仅调整 TS 构建配置的格式和当前依赖引用；构建器改由根脚本统一驱动。
新增源码差异必须先记入迁移登记，再进行相应行为验证。
可选 Native helper 本阶段不安装；开发入口显式使用 `--expose-internals`，
真实 Loader 文件加载、服务身份及清理已由 `tests/loader.test.mjs` 验证。
此方式仅用于 P0 开发底座，独立安装包的 Node/Native 闭包仍在 P7 验收。
