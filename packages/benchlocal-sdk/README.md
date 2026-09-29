# @benchlocal/sdk

用于编写在 BenchLocal 中运行的 Bench Pack 的 SDK。

本包位于 `@benchlocal/core` 之上，提供官方 Bench Pack 使用的轻量编写层：

- 带类型的清单加载
- Bench Pack 运行时定义辅助函数
- 宿主上下文查询辅助函数
- 用于评分的结果辅助函数

## 安装

```bash
npm install @benchlocal/sdk
```

## 典型用法

把基准测试逻辑放在你自己的仓库代码中，只在 `benchlocal/index.ts` 里使用 SDK。

```ts
import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  requireScoredResults
} from "@benchlocal/sdk";

const manifest = loadBenchPackManifest(__dirname);

export { manifest };

export default defineBenchPack({
  manifest,
  async listScenarios() {
    return [];
  },
  async prepare(context) {
    const helpers = createHostHelpers(context);

    return {
      async runScenario(input) {
        const provider = helpers.getRequiredProvider(input.model.provider, { enabledOnly: true });
        const inference = helpers.getInferenceEndpoint(input.model.id);

        return {
          scenarioId: input.scenario.id,
          status: "pass",
          summary: inference?.status === "running" ? inference.baseUrl : provider.baseUrl
        };
      },
      async dispose() {}
    };
  },
  scoreModelResults(results) {
    const scored = requireScoredResults(results);

    return {
      totalScore: scored.reduce((sum, result) => sum + result.score, 0),
      categories: []
    };
  }
});
```

## 主要辅助函数

- `loadBenchPackManifest(__dirname)`
- `defineBenchPack(...)`
- `defineBenchPackManifest(...)`
- `createHostHelpers(context)`
- `requireScoredResults(results)`

常用的宿主查询：

- `getRequiredProvider(providerId, { enabledOnly: true })`
- `getRequiredInferenceEndpoint(modelId)`
- `getRequiredVerifier(verifierId)`

当 Bench Pack 使用 Docker 验证器时，返回的推理端点还可能包含 `dockerBaseUrl`。请将 `dockerBaseUrl ?? baseUrl` 转发给验证器侧的运行时。

`@benchlocal/sdk` 还会重新导出 `@benchlocal/core` 的主要公共类型。

## 编写模式

- 将规范的 Bench Pack 元数据保存在 `benchlocal.pack.json`
- 从 `benchlocal/index.ts` 加载并导出该元数据
- 将基准测试逻辑保存在你自己的仓库模块中（例如 `lib/`）
- SDK 只用于 BenchLocal 适配层

## 仓库

- BenchLocal 单仓库：https://github.com/stevibe/BenchLocal
- 问题反馈：https://github.com/stevibe/BenchLocal/issues
