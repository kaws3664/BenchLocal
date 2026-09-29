# macOS 发布工作流

BenchLocal 以如下形式发布标准 macOS 桌面版：

- `BenchLocal-<version>-apple-silicon.dmg`
- `BenchLocal-<version>-apple-silicon.zip`

本仓库使用本地签名工作流。Apple 凭据保存在发布机器上，不会提交到仓库。

## 前提条件

- macOS
- Xcode 命令行工具
- Apple Developer 会员资格
- 登录钥匙串中已安装 `Developer ID Application` 证书

面向公网分发时，还需要配置公证（notarization）。

## 命令参考

在仓库根目录：

```bash
npm run build
```

仅编译。这是常规的开发构建。

```bash
npm run pack
```

编译并打包生产应用，包含 DMG 和 ZIP 产物。

```bash
npm run build:dir
```

编译并产出未打包的本地 `.app` 包。

```bash
npm run build:mac
```

通过 app 工作区显式编译并打包 macOS DMG 和 ZIP。

```bash
npm run release:all
```

先构建已签名的 macOS 发布版，再从仓库根目录打包 Windows 和 Linux 产物。

要进行真正的签名发布，请使用：

```bash
npm run release:setup:mac
npm run release:doctor:mac
npm run release:mac
```

## 本地密钥

不要把 Apple 签名或公证的值提交到仓库。

BenchLocal 使用一个被忽略的本地文件：

```text
.env.release.local
```

示例模板已提交在：

```text
.env.release.example
```

使用交互式配置助手：

```bash
npm run release:setup:mac
```

校验本地发布环境：

```bash
npm run release:doctor:mac
```

在加载本地密钥后构建签名发布：

```bash
npm run release:mac
```

该命令会构建、签名并公证发布产物，并为生成的 `.app` 装订（staple）票据。

## 签名与公证

这是两个独立的步骤。

### 签名

签名在本地使用钥匙串中的证书完成。

BenchLocal 需要：

- `CSC_NAME`
  - 来自「钥匙串访问」的签名标识名称，不含 `Developer ID Application:` 前缀

### 公证

公证发生在应用完成签名之后，与 Apple 通信。

BenchLocal 支持两种公证流程：

- App Store Connect API 密钥
- Apple ID + App 专用密码

优先使用：

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

备用：

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## 验证命令

发布构建后有用的本地检查：

```bash
codesign --verify --deep --strict --verbose=2 app/dist/mac-arm64/BenchLocal.app
codesign -dv --verbose=4 app/dist/mac-arm64/BenchLocal.app 2>&1 | rg "Authority|TeamIdentifier|Identifier"
spctl --assess --type execute --verbose=4 app/dist/mac-arm64/BenchLocal.app
xcrun stapler validate app/dist/mac-arm64/BenchLocal.app
```

BenchLocal 将公证后的 `.app` 作为信任验证的权威产物；生成的 `.dmg` 只是交付容器。

## 典型的本地发布流程

1. 确认本地已安装正确的 `Developer ID Application` 证书。
2. 创建或更新 `.env.release.local`。
3. 运行：

```bash
npm run release:doctor:mac
npm run release:mac
```

4. 验证生成的产物。
5. 将完成的 `.dmg` 和 `.zip` 上传到 GitHub Releases。

本仓库有意支持纯本地的发布管理，无需将 Apple 凭据放入 GitHub。

## 输出

产物写入：

```text
app/dist/
```

典型输出：

- `BenchLocal-<version>-apple-silicon.dmg`
- `BenchLocal-<version>-apple-silicon.zip`
- `mac-arm64/BenchLocal.app`
