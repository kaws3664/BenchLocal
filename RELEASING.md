# 发布 BenchLocal

本文档记录当前发布新版 BenchLocal 桌面版的流程。

## 版本号

- BenchLocal 桌面版使用工作区/应用的版本号，例如 `0.2.1`。
- 仅发布桌面客户端时，需要更新：
  - `package.json`
  - `app/package.json`
  - `package-lock.json`
- 只有在实际发布这些 npm 包时，才应升级 `@benchlocal/core` 和 `@benchlocal/sdk` 的版本。
- 内部工作区包不需要为每次桌面发布升级版本号。

## 发布流程

1. 升级桌面客户端版本号，暂不创建标签：

```bash
npm version <version> --workspace app --include-workspace-root --no-git-tag-version
```

示例：

```bash
npm version 0.2.2 --workspace app --include-workspace-root --no-git-tag-version
```

2. 检查工作树并提交发布准备：

```bash
git status --short
git add package.json app/package.json package-lock.json
git commit -m "Release BenchLocal v<version>"
```

3. 从该发布提交构建发布产物：

```bash
npm run release:mac
npm run build:win
npm run build:linux
```

注意：
- macOS 应使用 `release:mac`，而不是 `build:mac`
- Windows 和 Linux 使用 `build:win` 和 `build:linux`
- `npm run release:all` 会按顺序执行这三个构建

4. 在 `app/dist` 中确认发布产物：

- `BenchLocal-<version>-apple-silicon.dmg`
- `BenchLocal-<version>-apple-silicon.dmg.blockmap`
- `BenchLocal-<version>-apple-silicon.zip`
- `BenchLocal-<version>-apple-silicon.zip.blockmap`
- `BenchLocal-<version>-windows-x64.exe`
- `BenchLocal-<version>-windows-x64.exe.blockmap`
- `BenchLocal-<version>-windows-x64.zip`
- `BenchLocal-<version>-linux-x64.AppImage`
- `BenchLocal-<version>-linux-x64.tar.gz`
- `latest.yml`
- `latest-mac.yml`
- `latest-linux.yml`

注意：
- 这些 `latest*.yml` 文件支撑应用内自更新流程
- 每次桌面发布都必须随平台产物一起发布对应的元数据文件
- blockmap 文件供 `electron-updater` 用于差分下载，应与生成它们的产物一起上传
- GitHub 标签必须是 `v<version>`，因为更新器配置的 `tagNamePrefix` 是 `v`

5. 推送发布提交并创建发布标签：

```bash
git push origin main
git tag v<version>
git push origin v<version>
```

6. 为 `v<version>` 创建 GitHub Release，并上传 `app/dist` 中的产物。

注意：
- 在所有资源上传完毕后再发布 GitHub Release；草稿发布对更新源不可见
- 将 `latest*.yml` 元数据文件和 `.blockmap` 文件与安装包、归档一起上传
- 如果发布时缺少 `latest-mac.yml`、`latest.yml` 或 `latest-linux.yml`，已安装的应用在用户点击「检查更新」时可能出现 404 错误

## 自更新要求

BenchLocal 使用 `electron-updater` 的 GitHub Releases 提供方。生产环境的更新检查会查找最新的已发布 GitHub Release 并下载对应的更新元数据：

- macOS：`latest-mac.yml`
- Windows：`latest.yml`
- Linux：`latest-linux.yml`

宣布发布前，请验证这些 URL 返回 HTTP 200：

```bash
curl -fsSL https://github.com/stevibe/BenchLocal/releases/download/v<version>/latest-mac.yml
curl -fsSL https://github.com/stevibe/BenchLocal/releases/download/v<version>/latest.yml
curl -fsSL https://github.com/stevibe/BenchLocal/releases/download/v<version>/latest-linux.yml
```

然后检查每个元数据文件并确认：

- `version:` 与 `<version>` 一致
- 每个被引用的 `url:` 文件都存在于同一 GitHub Release 资源中
- macOS 元数据引用的是 `.zip` 产物，因为 Squirrel.Mac 在更新安装时使用它

`v0.2.2` 是第一个包含自更新客户端的版本。`v0.2.1` 的用户仍需手动安装 `v0.2.2`。用户升级到 `v0.2.2` 或更高版本后，后续版本即可通过应用内更新器安装。

## macOS 发布检查

使用 `release:mac` 之前，请确保本地 macOS 发布环境已就绪：

```bash
npm run release:doctor:mac
```

如需配置：

```bash
npm run release:setup:mac
```

## 本地自更新测试

无需创建 GitHub Release，通过让已安装的 BenchLocal 构建指向本地 HTTP 更新源，即可端到端测试更新器。

1. 安装一个较旧的打包构建，例如 `0.2.2`。
2. 构建一个较新的发布版，例如 `0.2.3`，使 `app/dist` 包含：
   - 平台产物
   - `latest.yml`
   - `latest-mac.yml`
   - `latest-linux.yml`
3. 通过 HTTP 提供 `app/dist`，例如：

```bash
cd app/dist
python3 -m http.server 9000
```

4. 启动已安装的旧版应用，并将 `BENCHLOCAL_UPDATE_URL` 指向该服务器：

```bash
BENCHLOCAL_UPDATE_URL=http://127.0.0.1:9000/ /Applications/BenchLocal.app/Contents/MacOS/BenchLocal
```

注意：
- 更新器覆盖变量用于打包应用的测试；开发模式仍会禁用自更新
- 如需覆盖更新渠道名称，可使用可选的 `BENCHLOCAL_UPDATE_CHANNEL`
- 「关于」对话框会显示当前生效的更新源，可借此确认应用正在使用本地测试服务器
- 「重启以更新」之后，如需再次检查本地更新源，请重新带上 `BENCHLOCAL_UPDATE_URL` 启动；更新器的重启可能不会保留环境覆盖变量

## 发布说明素材

发布前收集：

- 自上一个发布标签以来的提交日志
- 自上一个发布以来面向用户的变化
- 新增的官方 Bench Pack 支持或平台/运行时变化
- 影响生产使用的安装包/运行时修复

有用的命令：

```bash
git log --oneline <previous-tag>..HEAD
```

## 发布后检查清单

- 验证标签指向预期的发布提交
- 验证 GitHub Release 资源与当前版本号一致
- 验证 `latest*.yml` 的 GitHub URL 返回 HTTP 200
- 验证具备更新能力的已安装构建能从 GitHub Releases 检测到新版本
- 验证应用能启动并正确报告新版本号
- 如果发布捆绑了更新的运行时包，验证 Bench Pack 的安装与执行在构建出的应用上仍可工作
