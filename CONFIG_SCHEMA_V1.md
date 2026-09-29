# BenchLocal 配置 Schema v1

## 目的

本文档描述存储在以下位置的持久用户配置：

```text
~/.benchlocal/config.toml
```

BenchLocal 通过桌面 UI 编辑此文件。高级用户也可以手动编辑。

## 持久配置与 UI 状态

BenchLocal 维护两个不同的本地文件：

- `config.toml`
  - 持久配置
  - 提供商
  - 模型
  - 已安装 Bench Pack 的状态
  - 验证器偏好
  - 主题选择
  - 界面语言
- `state.json`
  - 工作区与标签页
  - 每个标签页所选的模型
  - 每个标签页的采样参数覆盖
  - 每个标签页的执行模式

本文档只涉及 `config.toml`。

## 存储布局

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

## 当前顶层 Schema

```toml
schema_version = 1
default_benchpack = ""
run_storage_dir = "~/.benchlocal/runs"
benchpack_storage_dir = "~/.benchlocal/benchpacks"
log_storage_dir = "~/.benchlocal/logs"
cache_dir = "~/.benchlocal/cache"

[registry]
official_url = "https://raw.githubusercontent.com/stevibe/benchlocal-registry/main/registry.json"

[ui]
theme = "system"
language = "zh-CN"

[agent]
enabled = false
access = "localhost"
```

全新配置有意从空白开始：

- 没有提供商
- 没有模型
- 没有已安装的 Bench Pack

BenchLocal 不会自动填充提供商或模型。

## Agent 访问

Agent 访问位于：

```toml
[agent]
enabled = false
access = "localhost"
port = 41373
```

字段：

- `enabled` 启动或停止本地 Agent 控制 API
- `access` 控制绑定范围：`localhost` 绑定到 `127.0.0.1`；`local_network` 绑定到 `0.0.0.0`
- `port` 可选；省略则由 BenchLocal 选择一个可用的本地端口

Agent 访问使用生成的 Bearer 令牌，单独存储在 `~/.benchlocal/agent-session.json`。除非其他设备上的 Agent 需要通过局域网连接，否则请保持 `access = "localhost"`。

## 提供商

提供商位于：

```toml
[providers.<provider-id>]
```

示例：

```toml
[providers.openrouter]
kind = "openrouter"
name = "OpenRouter"
enabled = true
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"
```

支持的提供商类型：

- `openrouter`
- `ollama`
- `llamacpp`
- `mlx`
- `lmstudio`
- `pico`
- `openai_compatible`

提供商字段：

- `kind`
- `name`
- `enabled`
- `base_url`
- `api_key` 可选
- `api_key_env` 可选

## 模型

模型以数组形式存储：

```toml
[[models]]
id = "openrouter:openai/gpt-4.1"
provider = "openrouter"
model = "openai/gpt-4.1"
label = "GPT-4.1 via OpenRouter"
group = "primary"
enabled = true
```

模型字段：

- `id`
- `provider`
- `model`
- `label`
- `group`
- `enabled`

`id` 必须保持稳定，因为标签页和运行历史会引用它。

## 已安装的 Bench Pack

Bench Pack 安装状态位于：

```toml
[benchpacks.<benchpack-id>]
```

官方安装示例：

```toml
[benchpacks.toolcall-15]
enabled = true
source = "registry"
version = "1.0.0"
```

第三方安装示例：

```toml
[benchpacks.third-party-pack]
enabled = true
source = "archive"
url = "https://example.com/benchpack.tar.gz"
version = "1.0.0"
```

支持的存储来源：

- `registry`
- `archive`
- `github`
- `local`
- `git`

在正常产品使用中，重要的是：

- `registry`
- `archive`

其余的为兼容性和本地开发工作流保留。

Bench Pack 字段：

- `enabled`
- `source`
- `version` 可选
- `repo` 可选
- `path` 可选
- `url` 可选
- `ref` 可选
- `auto_update` 可选

## 验证器偏好

验证器偏好位于每个已安装 Bench Pack 块内部：

```toml
[benchpacks.structoutput-15.verifiers.verifier]
mode = "docker"
auto_start = true
```

验证器字段：

- `mode`
  - `docker`
  - `cloud`
  - `custom_url`
- `auto_start`
- `custom_url` 可选
- `cloud_url` 可选
- `docker_image` 可选

BenchLocal 自动管理 Docker 宿主端口。用户无需在 `config.toml` 中配置它们。

## UI 设置

当前的 UI 设置有意保持精简：

```toml
[ui]
theme = "system"
language = "zh-CN"
```

`theme` 支持的内置值：

- `system`
- `light`
- `dark`
- `night`

自定义主题可添加到：

```text
~/.benchlocal/themes/
```

`language` 控制界面语言：

- `zh-CN` 简体中文（默认）
- `en-US` English

也可以在应用内的主题菜单中切换界面语言；切换会写回此字段。

## 兼容性别名

BenchLocal 在迁移期间仍会读取少量旧版键名：

- `default_bench_pack`
- `default_plugin`
- `bench_pack_storage_dir`
- `plugin_storage_dir`
- `bench_packs`
- `plugins`

这些别名仅用于向后兼容。新配置应使用上文所述的 `benchpack` 形式。
