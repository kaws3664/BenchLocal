# Windows 发布

BenchLocal 目前还没有生产就绪的 Windows 发布流水线。

当前目标：

- `nsis` 安装程序
- `zip` 便携产物
- 仅 `x64`

构建命令：

```bash
cd BenchLocal
npm run build:win
```

或在仓库根目录构建全部发布产物：

```bash
npm run release:all
```

预期产物：

- `app/dist/BenchLocal-<version>-windows-x64.exe`
- `app/dist/BenchLocal-<version>-windows-x64.zip`

当前缺口：

- 尚未配置 Windows `.ico` 图标资源
- 尚未配置 Windows 代码签名流程
- Bench Pack 归档解压仍依赖目标机器上可用的 `tar`

签名建议：

- 直接下载分发不需要 Microsoft Store 开发者账号
- 公开分发建议使用 Windows 代码签名证书
- 相比标准代码签名证书，EV 签名能获得更好的 SmartScreen 信任度

实际推进步骤：

1. 先产出未签名的 Windows 构建
2. 在真实的 Windows 机器上验证安装、启动、Bench Pack 安装/卸载，以及基于 Docker 的验证器流程
3. 运行时行为稳定后再加入签名
