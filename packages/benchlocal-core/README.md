# @benchlocal/core

BenchLocal 与 Bench Pack 的核心类型和共享运行时契约。

本包是 BenchLocal 生态的底层基础，定义了 BenchLocal 桌面应用、Bench Pack 宿主运行时和 Bench Pack SDK 共同遵循的数据结构。

当你需要直接使用协议和存储结构时，请使用 `@benchlocal/core`。如果你正在编写 Bench Pack，通常应改为从 `@benchlocal/sdk` 导入。

## 安装

```bash
npm install @benchlocal/core
```

## 本包包含的内容

- Bench Pack 清单与运行时协议类型
- 提供商、模型、密钥与验证器类型
- 工作区状态类型
- 配置加载与规范化辅助函数
- 主题类型

公共入口导出：

- `config`
- `protocol`
- `theme`
- `workspaces`

## 目标用户

- BenchLocal 应用与宿主代码
- Bench Pack 工具链
- 需要读取或校验 BenchLocal 配置、工作区状态的生态工具

## 稳定性

`@benchlocal/core` 属于 BenchLocal 生态公共接口的一部分，但层级低于 `@benchlocal/sdk`。除非确实需要直接访问核心协议或配置类型，Bench Pack 作者应优先使用 SDK。

## 仓库

- BenchLocal 单仓库：https://github.com/stevibe/BenchLocal
- 问题反馈：https://github.com/stevibe/BenchLocal/issues
