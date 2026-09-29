# Linux 发布

BenchLocal 可以打包为以下 Linux 产物：

- `AppImage`，用于直接下载和执行
- `tar.gz`，作为次要的便携归档

当前发布目标：

- `x64`

在仓库根目录构建：

```bash
cd BenchLocal
npm run build:linux
```

或在仓库根目录构建全部发布产物：

```bash
npm run release:all
```

产物输出到：

- `app/dist/`

预期产物：

- `BenchLocal-<version>-linux-x64.AppImage`
- `BenchLocal-<version>-linux-x64.tar.gz`

注意事项：

- 直接分发不需要 Linux 开发者账号
- 首条 Linux 发布路径的代码签名是可选的
- 依赖验证器的 Bench Pack 仍要求目标机器安装并运行 Docker
- 发布前应在真实的 Linux 机器上完成验证
