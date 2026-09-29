# 基准协议 v1

## 目的

基准协议 v1（Bench Protocol v1）定义了 BenchLocal 与可安装 Bench Pack 之间的运行时契约。

它涵盖：

- Bench Pack 元数据
- 运行时入口
- 场景元数据
- 宿主上下文
- 生成设置
- 验证器端点
- 进度事件
- 场景结果

## 核心设计规则

- BenchLocal 负责共享的桌面运行时
- Bench Pack 负责基准测试特有的行为
- 元数据是静态的、基于文件的
- 运行时行为是显式且确定的
- 验证器依赖通过声明表达，而不是硬编码

## 安装产物

每个 Bench Pack 产物必须暴露：

```text
benchlocal.pack.json
dist/benchlocal/index.js
```

可选的运行时内容：

- `verification/`
- `README.md`
- `METHODOLOGY.md`

## 清单

文件名：

```text
benchlocal.pack.json
```

该文件是 Bench Pack 元数据的规范来源。

代表性结构：

```json
{
  "schemaVersion": 1,
  "protocolVersion": 1,
  "id": "bugfind-15",
  "name": "BugFind-15",
  "author": "stevibe",
  "version": "1.0.0",
  "description": "Execution-backed benchmark for bug finding and bug fixing.",
  "entry": "./dist/benchlocal/index.js",
  "requirements": {
    "benchlocal": {
      "minVersion": "0.2.0"
    },
    "hostFeatures": ["inferenceEndpoints", "dockerInferenceEndpoints"]
  },
  "samplingDefaults": {
    "temperature": 0
  },
  "capabilities": {
    "tools": false,
    "multiTurn": false,
    "streamingProgress": true,
    "verification": true
  },
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

重要字段：

- `id`
- `name`
- `version`
- `entry`
- `capabilities`

常见可选字段：

- `author`
- `description`
- `repository`
- `theme`
- `requirements`
- `samplingDefaults`
- `verifiers`

兼容性要求是可选的，由 BenchLocal 客户端在安装、检查和运行时强制执行。

支持的 requirements 字段：

- `requirements.benchlocal.minVersion`
  - 要求的最低 BenchLocal 客户端版本
- `requirements.benchlocal.maxVersionExclusive`
  - BenchLocal 客户端版本的排他上界
- `requirements.hostFeatures`
  - 包所需的可选宿主功能标志

## 运行时入口

BenchLocal 加载 `dist/benchlocal/index.js`，并期望默认导出具有如下形状：

```ts
export interface BenchPackRuntime {
  manifest: BenchPackManifest;
  listScenarios(): Promise<ScenarioMeta[]>;
  prepare(context: HostContext): Promise<PreparedBenchPack>;
  scoreModelResults(results: ScenarioResult[]): BenchmarkScore;
}

export interface PreparedBenchPack {
  runScenario(input: ScenarioRunInput, emit: ProgressEmitter): Promise<ScenarioResult>;
  dispose(): Promise<void>;
}
```

`prepare(context)` 是包为一次运行会话接收已解析宿主状态的时点。

## 场景元数据

`listScenarios()` 返回每个场景的 UI 可见元数据。

重要字段：

- `id`
- `title`
- `category`
- `description`
- `detailCards`

`detailCards` 支撑桌面 UI 中展示的结构化场景卡片，例如：

- `What this tests`
- `Success case`
- `Failure case`

## 宿主上下文

BenchLocal 为 `prepare(context)` 提供 `HostContext`。

关键字段：

- `benchPack`
  - 安装与存储路径
- `providers`
  - 已解析的提供商注册表
- `models`
  - 共享的已注册模型
- `secrets`
  - 从配置或环境解析出的提供商密钥
- `verifiers`
  - 已解析的验证器端点与状态
- `inferenceEndpoints`
  - 可选的宿主自有 OpenAI 兼容模型端点（面向选定的 Bench Pack）
- `logger`
  - 宿主日志桥接

Bench Pack 通常应使用 `@benchlocal/sdk` 提供的辅助函数，而不是手动读取原始上下文。

`inferenceEndpoints` 是增量的、可选的。现有包可以继续使用直接的提供商/模型访问。需要宿主管理的模型传输的包可以使用 `@benchlocal/sdk` 的推理端点辅助函数。

运行中的推理端点暴露：

- `baseUrl`
  - Bench Pack 运行时可访问的宿主侧 URL
- `dockerBaseUrl`
  - 可选的、Docker 验证器容器内可访问的 URL
- `apiKey`
  - 需要认证时由 BenchLocal 签发的临时 Bearer 令牌
- `exposedModel`
  - 包应发送给端点的稳定模型标识符

## 生成设置

每个场景的生成设置以如下形式到达：

```ts
type GenerationRequest = {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repetition_penalty?: number;
  presence_penalty?: number;
  request_timeout_seconds?: number;
};
```

行为：

- 如果字段存在，包可以将其转发给提供商客户端
- 如果包和用户都省略了某个字段，BenchLocal 会省略它，除非该字段有显式的 BenchLocal 默认值
- 被省略的采样字段不会由 BenchLocal 发送，推理后端会使用其启动或配置时的默认值
- 除非包或用户覆盖，BenchLocal 目前只应用 `request_timeout_seconds: 300`
- 每个测试的运行次数是 BenchLocal 的宿主控制项，不是生成设置，不会转发给提供商

这允许：

- 来自 `benchlocal.pack.json` 的包级默认值
- 来自 BenchLocal 的每标签页用户覆盖
- 省略不受支持或不必要的值

## 进度事件

Bench Pack 通过 `emit` 发出确定性的进度事件。

当前事件类型：

- `run_started`
- `scenario_started`
- `model_progress`
- `scenario_result`
- `scenario_finished`
- `run_finished`
- `run_error`

BenchLocal 会存储这些事件，用于独立日志窗口、状态 UI 和运行历史。

## 场景结果

每次 `runScenario(...)` 调用返回一个 `ScenarioResult`。

代表性结构：

```ts
type ScenarioResult = {
  scenarioId: string;
  status: "pass" | "partial" | "fail";
  score?: number;
  points?: number;
  summary: string;
  note?: string;
  rawLog: string;
  output?: ModelOutput;
  verifier?: VerifierResult;
  artifacts?: ArtifactRef[];
  timings?: {
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  };
};
```

## 基准得分

运行完成后，BenchLocal 会让包把模型级结果聚合成 `BenchmarkScore`。

代表性结构：

```ts
type BenchmarkScore = {
  totalScore: number;
  categories: Array<{
    id: string;
    label: string;
    score: number;
    weight?: number;
  }>;
  summary?: string;
};
```

## 验证器

依赖验证器的 Bench Pack 在清单中声明其验证器需求。

BenchLocal 负责：

- 验证器模式选择
- Docker 生命周期
- 动态分配宿主端口
- 健康检查
- 状态报告

Bench Pack 负责：

- 验证器实现
- 验证器请求与响应契约
- 使用解析出的验证器 URL

`listenPort` 是容器内部验证器的端口。BenchLocal 自动分配宿主端口。

## 兼容性说明

代码库中仍保留少量 `sidecar` 别名以保持向后兼容。

公共协议术语应使用：

- `verifier`
- `verifiers`

而不是 `sidecar`。
