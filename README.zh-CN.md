<p align="center">
  <img src="./docs/assets/benchlocal-logo.svg" alt="BenchLocal logo" width="104" />
</p>

<h1 align="center">BenchLocal</h1>

<p align="center">
  在真实任务上测试大语言模型，直观对比不同模型的表现。
</p>

<p align="center">
  <a href="https://benchlocal.com">官网</a>
  ·
  <a href="https://github.com/stevibe/BenchLocal/releases/latest">下载</a>
  ·
  <a href="./docs/assets/benchlocal-demo.mp4">观看演示</a>
  ·
  <a href="./BENCH_PACK_AUTHORING.md">制作 Bench Pack</a>
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="./docs/assets/benchlocal-demo.mp4">
    <img src="./screenshot.png" alt="BenchLocal 桌面应用预览" />
  </a>
</p>

BenchLocal 是一款本地优先的桌面应用，用于针对本地或远程模型运行、对比和管理可安装的 LLM 基准包（Bench Pack）。

目前官方提供的 Bench Pack：

- [ToolCall-15](https://github.com/stevibe/ToolCall-15)
- [BugFind-15](https://github.com/stevibe/BugFind-15)
- [DataExtract-15](https://github.com/stevibe/DataExtract-15)
- [InstructFollow-15](https://github.com/stevibe/InstructFollow-15)
- [PromptAuthority-15](https://github.com/stevibe/PromptAuthority-15)
- [ReasonMath-15](https://github.com/stevibe/ReasonMath-15)
- [StructOutput-15](https://github.com/stevibe/StructOutput-15)
- [CLI-40](https://github.com/stevibe/CLI-40)
- [HermesAgent-20](https://github.com/stevibe/HermesAgent-20)

BenchLocal 负责共享的桌面运行时：

- 提供商（Provider）配置
- 模型注册表
- Bench Pack 安装与更新流程
- 每个标签页的采样参数覆盖
- 运行执行与结果历史
- 验证器（Verifier）生命周期管理
- 持久化的桌面 UI 状态

## 智能体访问（Agent Access）

BenchLocal 可以暴露本地智能体接口，让 AI 智能体和自动化工具在桌面 UI 保持在线的同时控制基准测试工作流。

在 **设置 > Agent 访问** 中启用。应用会显示：

- 一个 Bearer 令牌
- 本地 Agent 指南 URL
- OpenAPI URL
- MCP Streamable HTTP URL

HTTP API 使用 JSON 命令执行诸如列出 Bench Pack、管理提供商和模型、创建标签页、选择模型、刷新可用性、启动运行、继续运行、重试结果以及停止活动运行等操作。实时进度可通过 `/v1/events` 的 Server-Sent Events 获取。

支持 MCP 的智能体可以使用相同的 Bearer 令牌连接到 `/mcp`，使用标准的 `benchlocal_*` 工具以及 BenchLocal 状态资源。对于支持工具调用的智能体，这是首选的集成方式。

有关端点详情、MCP 工具/资源、安全规则，以及为智能体接口扩展未来 UI 功能的检查清单，请参阅 [docs/agent-control-api.md](./docs/agent-control-api.md)。

每个 Bench Pack 负责自身的基准测试行为：

- 场景定义
- 基准测试专用的提示词
- 评分逻辑
- 需要时的验证器契约
- 基准测试专用的轨迹与摘要

## 仓库结构

- `app/`
  Electron 应用外壳、桌面 UI、主进程、预加载脚本、渲染进程
- `packages/benchlocal-core`
  共享的协议、配置、工作区与主题类型
- `packages/benchlocal-sdk`
  用于 Bench Pack 仓库的创作辅助工具
- `packages/benchpack-host`
  宿主侧的安装、检查、验证器与运行编排逻辑
- `themes/`
  内置桌面主题
- `scripts/`
  本地 macOS 发布辅助脚本
- `docs/`
  打包与发布文档

## 开发者参考

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [BENCH_PACK_AUTHORING.md](./BENCH_PACK_AUTHORING.md)
- [BENCH_PROTOCOL_V1.md](./BENCH_PROTOCOL_V1.md)
- [CONFIG_SCHEMA_V1.md](./CONFIG_SCHEMA_V1.md)
- [BENCHLOCAL_REGISTRY_V1.md](./BENCHLOCAL_REGISTRY_V1.md)
- [docs/agent-control-api.md](./docs/agent-control-api.md)
- [docs/macos-release.md](./docs/macos-release.md)
- [docs/windows-release.md](./docs/windows-release.md)
- [docs/linux-release.md](./docs/linux-release.md)

## 构建命令

- `npm run build`
  为开发编译应用与工作区包
- `npm run pack`
  编译并打包生产桌面应用（含 DMG 与 ZIP 产物）
- `npm run build:dir`
  编译并生成未打包的本地应用目录
- `npm run build:win`
  编译并打包未签名的 Windows NSIS 与 ZIP 产物
- `npm run build:linux`
  编译并打包 Linux AppImage 与 tar.gz 产物
- `npm run release:all`
  一条命令构建已签名的 macOS 发布版以及 Windows、Linux 桌面产物

## 许可证

MIT
