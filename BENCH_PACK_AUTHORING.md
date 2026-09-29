# Bench Pack 编写指南

## 目的

本指南描述 BenchLocal 可以安装和运行的 Bench Pack 的推荐结构。

Bench Pack 默认应是普通的基准测试仓库：

- 独立的 Web 应用是可选的
- 推荐提供 CLI 运行器
- 验证器运行时是可选的，仅当基准测试需要精确的外部校验时才需要

## 规范元数据来源

所有 Bench Pack 元数据都应放在：

```text
benchlocal.pack.json
```

该文件是唯一的编写的元数据来源。

不要在 `benchlocal/index.ts` 中重复 name、version、author、description、采样默认值或验证器元数据。

运行时入口应加载并导出该 JSON 清单。

## 必需的运行时产物

BenchLocal 要求每个构建产物都包含：

```text
benchlocal.pack.json
dist/benchlocal/index.js
```

可选的运行时内容：

- `verification/`
- `README.md`
- `METHODOLOGY.md`

## 推荐的仓库结构

### 最小 Bench Pack

```text
benchlocal.pack.json
benchlocal/
  index.ts
cli/
  run.ts
lib/
package.json
tsconfig.json
tsconfig.benchlocal.json
tsconfig.cli.json
README.md
METHODOLOGY.md
LICENSE
```

### 依赖验证器的 Bench Pack

```text
benchlocal.pack.json
benchlocal/
  index.ts
cli/
  run.ts
lib/
verification/
  Dockerfile
  server.mjs
  core.mjs
scripts/          # 可选的本地验证器辅助脚本
package.json
tsconfig.json
tsconfig.benchlocal.json
tsconfig.cli.json
README.md
METHODOLOGY.md
LICENSE
```

## 源码布局规则

- `lib/` 负责基准测试行为
  - 场景
  - 提示词
  - 评分
  - 提供商请求
  - 需要时的验证器客户端逻辑
- `benchlocal/index.ts` 是 BenchLocal 适配层
- `cli/` 推荐用于本地测试和调试
- `verification/` 只用于无法完全放在包运行时内部的精确外部校验

## 包依赖

Bench Pack 应依赖已发布的公共包：

```json
{
  "dependencies": {
    "@benchlocal/core": "0.2.0",
    "@benchlocal/sdk": "0.2.0"
  }
}
```

实际的包中请使用当前已发布的版本。上面的版本只是示例，并不承诺它一直是最新的。

## `benchlocal/index.ts`

`benchlocal/index.ts` 应保持精简。

它的职责是：

- 从 `benchlocal.pack.json` 加载清单
- 导出清单
- 为桌面 UI 列出场景
- 将 `HostContext` 桥接到包的运行时逻辑
- 返回确定性的 `ScenarioResult` 值

示例：

```ts
import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  requireScoredResults,
  type ScenarioRunInput,
  type ScenarioResult
} from "@benchlocal/sdk";

import { SCENARIOS, getScenarioCards, scoreModelResults } from "../lib/benchmark";
import { runScenarioForModel } from "../lib/orchestrator";

const manifest = loadBenchPackManifest(__dirname);

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      detailCards: getScenarioCards(scenario)
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);

    return {
      async runScenario(input: ScenarioRunInput): Promise<ScenarioResult> {
        return runScenarioForModel(input, helpers);
      },
      async dispose() {}
    };
  },

  scoreModelResults(results) {
    return scoreModelResults(requireScoredResults(results));
  }
});
```

## 采样默认值

Bench Pack 作者可以在 `benchlocal.pack.json` 中声明推荐默认值：

```json
{
  "samplingDefaults": {
    "temperature": 0
  }
}
```

行为：

- 如果 Bench Pack 提供了默认值，BenchLocal 会使用它，除非用户在该标签页中覆盖
- 如果包和用户都省略了某个字段，BenchLocal 会省略它，除非该字段有显式的 BenchLocal 默认值
- 被省略的采样字段不会由 BenchLocal 发送，推理后端会使用其启动或配置时的默认值
- 除非你的包或用户覆盖，BenchLocal 目前只应用 `request_timeout_seconds: 300`

## 兼容性要求

如果你的包依赖较新的 BenchLocal 客户端功能，请在 `benchlocal.pack.json` 中声明，以便旧客户端尽早且清晰地报错。

示例：

```json
{
  "requirements": {
    "benchlocal": {
      "minVersion": "0.2.0"
    },
    "hostFeatures": ["inferenceEndpoints", "dockerInferenceEndpoints"]
  }
}
```

在以下情况使用它：

- 你的包要求最低的 BenchLocal 客户端版本
- 你的包要求宿主管理的运行时功能（如推理端点）
- 为将来的破坏性变更设置客户端版本上限

## 无验证器与依赖验证器的包

### 无验证器的包

常见情况是只需要模型访问和评分逻辑的包。

这类包：

- 不声明 `verifiers`
- 不附带 `verification/`
- 只依赖 `HostContext` 提供的提供商/模型访问

如果你的包嵌入了期望自己的 OpenAI 兼容 base URL 的外部 Agent 运行时，请优先使用 `createHostHelpers(context).getRequiredInferenceEndpoint(modelId)`，而不是把提供商密钥直接接入包运行时。这样模型选择和上游凭据的所有权保持在 BenchLocal。

如果该运行时位于 Docker 验证器内，请把 `dockerBaseUrl ?? baseUrl` 转发给验证器，而不是转发上游提供商凭据。

### 依赖验证器的包

仅当基准测试确实需要外部执行或精确校验时才使用验证器。

如果包需要验证器：

- 在 `benchlocal.pack.json` 中声明它
- 将运行时包含在 `verification/` 中
- 使用 `createHostHelpers(context).getRequiredVerifier(...)` 消费解析出的端点

清单片段示例：

```json
{
  "verifiers": [
    {
      "id": "verifier",
      "transport": "http",
      "required": true,
      "defaultMode": "docker",
      "docker": {
        "buildContext": "./verification",
        "listenPort": 4010,
        "healthcheckPath": "/health"
      }
    }
  ]
}
```

重要：

- BenchLocal 自动分配宿主端口
- 包只声明内部的 `listenPort`

## CLI 测试

BenchLocal 不强制要求 CLI 运行器，但它对以下场景很有用：

- 本地基准测试调试
- 方法论验证
- 在桌面应用之外复现包行为

## 推荐的脚本

```json
{
  "scripts": {
    "build:benchlocal": "tsc -p tsconfig.benchlocal.json && tsc-alias -p tsconfig.benchlocal.json",
    "build:cli": "tsc -p tsconfig.cli.json && tsc-alias -p tsconfig.cli.json",
    "cli": "npm run build:cli && node dist-cli/cli/run.js"
  }
}
```

## 打包检查清单

发布 Bench Pack 产物时：

- 将 `benchlocal.pack.json` 保持在仓库根目录
- 将 BenchLocal 适配层编译到 `dist/benchlocal/index.js`
- 仅当包确实需要时才包含 `verification/`
- 避免打包运行时不需要的仓库本地开发文件

BenchLocal 会在激活前校验产物，因此运行时的表面应保持精简、确定且显式。
