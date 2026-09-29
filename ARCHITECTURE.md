# BenchLocal 架构

## 目的

BenchLocal 是用于安装、配置和运行 LLM 基准包（Bench Pack）的桌面宿主。

产品分为两层：

- BenchLocal
  - 桌面 UI
  - 提供商与模型注册表
  - Bench Pack 安装与更新流程
  - 验证器生命周期管理
  - 运行编排与历史记录
- Bench Pack（基准包）
  - 场景
  - 提示词
  - 评分
  - 可选的验证器契约与实现

## 职责边界

BenchLocal 负责共享运行时：

- 用户配置
- 共享的提供商与模型
- 已安装 Bench Pack 的状态
- 本地存储位置
- 验证器启动与健康检查
- 每个标签页的模型选择
- 每个标签页的采样参数覆盖
- 运行持久化

Bench Pack 负责基准测试特有的行为：

- 场景元数据
- 提示词与工具逻辑
- 评分逻辑
- 轨迹与摘要
- 可选的验证器请求/响应契约
- 推荐的采样参数默认值

Bench Pack 不负责共享的桌面设置或宿主特有的基础设施细节（例如 Docker 宿主端口）。

## 主要组件

```text
app/
  src/main/      Electron 主进程
  src/preload/   安全的渲染进程桥接层
  src/renderer/  桌面 UI
packages/
  benchlocal-core/
    共享协议、配置、工作区、主题
  benchlocal-sdk/
    Bench Pack 编写辅助工具
  benchpack-host/
    安装、检查、验证器与运行编排
themes/
  内置桌面主题
scripts/
    本地 macOS 发布辅助脚本
```

## 运行时生命周期

1. BenchLocal 加载 `~/.benchlocal/config.toml` 与 `~/.benchlocal/state.json`。
2. BenchLocal 检查 `~/.benchlocal/benchpacks` 下已安装的 Bench Pack。
3. 渲染进程展示当前工作区、标签页、提供商、模型和可用的 Bench Pack。
4. 运行开始时，BenchLocal 会：
   - 解析活动的 Bench Pack
   - 解析该标签页所选的模型
   - 解析提供商密钥
   - 按需启动验证器
   - 构造 `HostContext`
   - 加载 Bench Pack 运行时入口
5. Bench Pack 执行场景并发出进度事件。
6. BenchLocal 将运行日志、运行摘要和结果历史持久化到 `~/.benchlocal/runs`。

## Bench Pack 安装模型

BenchLocal 将 Bench Pack 作为运行时产物安装，而不是源码检出。

可安装的产物包含：

- `benchlocal.pack.json`
- `dist/benchlocal/index.js`
- 可选的 `verification/`
- 可选的小型元数据文件（如 `README.md`、`METHODOLOGY.md`）

BenchLocal 支持两种产品级来源：

- BenchLocal 官方注册表
- 第三方产物的直接 URL

宿主会在激活前对 Bench Pack 进行暂存与校验。安装失败不应替换可用的既有安装。

## 验证器模型

依赖验证器的 Bench Pack 会在 `benchlocal.pack.json` 中声明验证器需求。

BenchLocal 负责：

- 验证器模式选择
  - `docker`
  - `cloud`
  - `custom_url`
- 本地 Docker 生命周期
- 动态分配宿主端口
- 健康检查
- UI 中展示的验证器状态

Bench Pack 负责：

- 验证器实现
- 验证器请求与响应契约
- 使用解析出的验证器端点

重要的契约细节是：

- Bench Pack 声明验证器内部的 `listenPort`
- BenchLocal 自动分配宿主端口

公开术语是 `verifier`。`sidecar` 仅在少数内部类型中作为向后兼容别名保留。

## 本地存储

BenchLocal 将用户数据存储在：

```text
~/.benchlocal/
  config.toml
  state.json
  benchpacks/
  runs/
  logs/
  cache/
  themes/
```

`config.toml` 用于持久配置：

- 提供商
- 模型
- 已安装 Bench Pack 的状态
- 验证器偏好
- 主题选择

`state.json` 用于工作区与标签页状态：

- 工作区
- 标签页
- 每个标签页所选的模型
- 每个标签页的采样参数覆盖
- 每个标签页的执行模式

## 公共包边界

BenchLocal 发布两个公共 npm 包：

- `@benchlocal/core`
- `@benchlocal/sdk`

Bench Pack 作者依赖这两个包。

Electron 应用和宿主编排仍是 BenchLocal 桌面应用仓库的一部分。

## 产品假设

- 即使官方注册表不可达，BenchLocal 也必须可用。
- 已安装的 Bench Pack 必须在离线时仍可用。
- Bench Pack 不需要独立的 Web 应用。
- CLI 运行器对包开发很有用，但宿主并不强制要求。
- 依赖验证器的 Bench Pack 是一等公民，但无验证器的包应保持为默认且最简单的情况。

## 相关文档

- [README.md](./README.md)
- [BENCH_PACK_AUTHORING.md](./BENCH_PACK_AUTHORING.md)
- [BENCH_PROTOCOL_V1.md](./BENCH_PROTOCOL_V1.md)
- [CONFIG_SCHEMA_V1.md](./CONFIG_SCHEMA_V1.md)
- [BENCHLOCAL_REGISTRY_V1.md](./BENCHLOCAL_REGISTRY_V1.md)
- [docs/macos-release.md](./docs/macos-release.md)
