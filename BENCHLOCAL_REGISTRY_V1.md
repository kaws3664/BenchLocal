# BenchLocal 注册表 v1

`benchlocal-registry` 是 BenchLocal 项目发布的官方 Bench Pack 的权威数据源。

BenchLocal 不会在本地配置中硬编码官方目录。取而代之的是：

- 注册表发布官方列表
- BenchLocal 在可用时拉取该列表
- 本地配置只保存安装状态和用户覆盖项

即使注册表不可达，BenchLocal 也应能正常启动，已安装的 Bench Pack 应保持可用。

## 目标

- 定义官方 Bench Pack 目录
- 为官方包提供安装元数据
- 将本地用户状态与公开目录元数据分离
- 为将来的完整性校验（如校验和或签名）留出空间

## 当前注册表结构

BenchLocal 目前期望如下的顶层结构：

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "dataextract-15",
      "name": "DataExtract-15",
      "author": "stevibe",
      "description": "Deterministic data extraction benchmark with 15 fixed scenarios.",
      "version": "1.0.0",
      "source": {
        "type": "github",
        "repo": "stevibe/DataExtract-15",
        "tag": "v1.0.0"
      },
      "homepage": "https://github.com/stevibe/DataExtract-15",
      "license": "MIT",
      "scenarioCount": 15,
      "capabilities": {
        "tools": false,
        "multiTurn": false,
        "verification": false
      }
    }
  ]
}
```

## 条目字段

必填：

- `id`
- `name`
- `version`
- `source`

常见可选字段：

- `author`
- `description`
- `homepage`
- `license`
- `scenarioCount`
- `capabilities`

## 来源类型

### GitHub 来源

```json
{
  "source": {
    "type": "github",
    "repo": "stevibe/ToolCall-15",
    "tag": "v1.0.0"
  }
}
```

BenchLocal 会将其转换为 GitHub 归档下载进行安装。

### 归档来源

```json
{
  "source": {
    "type": "archive",
    "url": "https://example.com/toolcall-15-v1.0.0.tar.gz"
  }
}
```

适用于本地注册表或替代分发渠道。

## 注册表不存储的内容

注册表不是用户状态。

它不存储：

- 本地安装路径
- 每个用户的启用/禁用状态
- 所选模型
- 验证器模式偏好
- 主题偏好

这些属于 `~/.benchlocal/config.toml` 与 `~/.benchlocal/state.json`。

## 官方与第三方

官方注册表只覆盖由 BenchLocal 项目维护的 Bench Pack。

第三方 Bench Pack 由桌面应用通过 URL 直接安装。它们由各自的作者维护，而非 BenchLocal。

这类安装在本地配置中以 `source = "archive"` 存储；除非项目决定收录，否则不会出现在官方注册表中。

## 本地开发说明

在本地开发注册表时，服务端可以直接从磁盘打包仓库，例如：

```bash
cd /path/to/StructOutput-15
npm run build:benchlocal
```

该本地打包流程只是开发便利，不属于公共注册表契约的一部分。

## 未来的扩展

当前注册表有意保持精简。

合理的未来新增项包括：

- Bench Pack 包的校验和
- 签名
- BenchLocal 应用的最低版本要求
- 发布说明
- 更丰富的能力元数据
