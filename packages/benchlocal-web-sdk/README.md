# @benchlocal/web-sdk

BenchLocal 生态中用于交互式 Web Bench Pack 的浏览器 SDK。

本包是 `github.com/stevibe/BenchLocal` 项目的一部分。BenchLocal 是本地 LLM 基准测试桌面应用。Web SDK 让托管的 Bench Pack UI 能够请求本地 BenchLocal 应用使用用户已保存的提供商和所选模型运行推理，而无需向托管页面暴露提供商凭据。

当你要构建以 Web 应用形式渲染（而不是标准 BenchLocal 结果表格）的 Bench Pack 时，请使用本包。

## 安装

```bash
npm install @benchlocal/web-sdk
```

`@benchlocal/web-sdk` 采用 MIT 许可证。

## 本 SDK 的作用

交互式 Web Bench Pack 运行在 BenchLocal 桌面应用内的浏览器界面中。Web 页面负责视觉化的基准测试体验。BenchLocal 负责本地状态和敏感执行：

- 提供商凭据
- 模型配置
- 当前标签页所选的模型
- 对话与流式推理
- 显示在 BenchLocal 标签页外壳中的运行状态
- 历史记录与产物

SDK 通过一个窄接口的 `postMessage` 桥接层与 BenchLocal 通信。它不是通用 HTTP 代理，也不暴露 API 密钥。

## 何时使用

对需要比表格更丰富呈现形式的托管或本地 Web 基准测试，请使用 `@benchlocal/web-sdk`：

- 填表基准测试
- 类浏览器的任务模拟
- 交互式提示词挑战
- 视觉化工具调用测试
- Agent 工作流演示
- 带自定义进度、回放或产物的基准测试

对于常规的表格型 Bench Pack，请改用 `@benchlocal/sdk`。

## 快速开始

```ts
import { createBenchLocalClient } from "@benchlocal/web-sdk";

const benchlocal = createBenchLocalClient();

const environment = await benchlocal.environment.detect({ timeoutMs: 500 });

if (!environment.isInsideBenchLocal) {
  // 渲染普通浏览器的落地页状态。
  // 不要在这里向用户索要提供商凭据。
}

const selected = await benchlocal.models.getSelected();
const model = selected.models[0];

if (!model) {
  throw new Error("No BenchLocal model is selected for this tab.");
}

await benchlocal.runs.startState({
  message: "Running web benchmark.",
  metadata: { modelId: model.id }
});

try {
  const response = await benchlocal.inference.chat({
    modelId: model.id,
    messages: [{ role: "user", content: "Fill the form with this profile..." }],
    generation: {
      temperature: 0.2,
      max_tokens: 1024
    }
  });

  await benchlocal.history.save({
    status: "completed",
    metadata: {
      modelId: model.id,
      answer: response.content
    }
  });
} catch (error) {
  await benchlocal.history.save({
    status: "error",
    metadata: {
      message: error instanceof Error ? error.message : String(error)
    }
  });
} finally {
  await benchlocal.runs.stopState({ message: "Benchmark finished." });
}
```

## 运行时检测

Web Bench Pack 也可能在普通浏览器中打开。在调用需要 BenchLocal 的桥接 API 之前，请先做环境检测。

```ts
const benchlocal = createBenchLocalClient();

const environment = await benchlocal.environment.detect({ timeoutMs: 500 });

if (environment.isInsideBenchLocal) {
  console.log("Running inside BenchLocal", environment.capabilities);
} else if (environment.reason === "top-level") {
  console.log("Opened directly in a browser.");
} else {
  console.log("Embedded, but BenchLocal bridge is unavailable.");
}
```

检测结果的形状如下：

```ts
interface BenchLocalWebEnvironmentInfo {
  isEmbedded: boolean;
  isInsideBenchLocal: boolean;
  bridgeAvailable: boolean;
  bridgeVersion?: 1;
  capabilities?: BenchLocalWebCapabilities;
  reason?: "top-level" | "timeout" | "error";
  error?: string;
}
```

`environment.isEmbedded` 是同步的 iframe 检查。`environment.detect()` 通过发起一次短超时的 `capabilities` 桥接请求，确认父框架是否真的是 BenchLocal。

## 创建客户端

```ts
const benchlocal = createBenchLocalClient({
  requestTimeoutMs: 30000
});
```

选项：

```ts
interface BenchLocalWebClientOptions {
  target?: Window;
  targetOrigin?: string;
  requestTimeoutMs?: number;
}
```

大多数 Bench Pack 应以无选项方式调用 `createBenchLocalClient()`。默认目标是 `window.parent`。

## 能力

```ts
const capabilities = await benchlocal.capabilities();
```

返回已安装 Web 包的信息，以及 BenchLocal 根据包清单授予的权限。

```ts
interface BenchLocalWebCapabilities {
  bridgeVersion: 1;
  permissions: string[];
  pack: {
    id: string;
    name: string;
    version: string;
    entry: string;
    buildId?: string;
  };
  history?: {
    runId?: string;
    mode?: "live" | "history";
    playback: boolean;
  };
}
```

使用 `capabilities.history?.mode === "history"` 渲染只读的历史回放体验。

## 模型 API

### 列出可用模型

```ts
const { models, availability } = await benchlocal.models.list();
```

`models.list()` 返回 BenchLocal 可以暴露给当前 Web 包的模型。当你的 UI 想展示所有允许的选项时使用它。

### 获取所选模型

```ts
const { models } = await benchlocal.models.getSelected();
```

`models.getSelected()` 返回当前 BenchLocal 标签页上所选的模型。这是 Web 基准测试最常用的 API。如果你的基准测试一次支持一个模型，请展示这些模型并让用户在你的 Web UI 中选择一个。

### 响应模型选择变化

```ts
const unsubscribe = benchlocal.models.onChanged((event) => {
  console.log("BenchLocal model selection changed", event.models);
});

// 之后：
unsubscribe();
```

当用户从桌面 UI 更改标签页所选模型时，BenchLocal 发出此事件。

### 模型结构

SDK 从 `@benchlocal/core` 重新导出 `RegisteredModel` 与 `ModelAvailability`。

```ts
interface RegisteredModel {
  id: string;
  provider: string;
  model: string;
  label: string;
  enabled: boolean;
  group: string;
}

type ModelAvailabilityStatus = "online" | "offline";

interface ModelAvailability {
  modelId: string;
  providerId: string;
  status: ModelAvailabilityStatus;
  reason:
    | "available"
    | "provider_missing"
    | "provider_disabled"
    | "auth_missing"
    | "provider_unreachable"
    | "provider_error"
    | "model_missing";
  details?: string;
  checkedAt: string;
}
```

调用推理 API 时使用 `model.id`。把 `model.provider` 当作显示名。BenchLocal 不向 Web 页面暴露提供商密钥。

## 推理 API

推理通过本地 BenchLocal 应用执行，使用用户配置的提供商和模型。

### 非流式对话

```ts
const result = await benchlocal.inference.chat({
  modelId: model.id,
  messages: [
    { role: "system", content: "You are a precise form-filling assistant." },
    { role: "user", content: "Fill this application form." }
  ],
  generation: {
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 1500,
    request_timeout_seconds: 300
  },
  metadata: {
    scenarioId: "case-001"
  }
});

console.log(result.content);
```

请求形状：

```ts
interface BenchLocalChatRequest {
  modelId: string;
  messages: ChatMessage[];
  generation?: GenerationRequest;
  tools?: unknown[];
  toolChoice?: unknown;
  metadata?: Record<string, unknown>;
}
```

响应形状：

```ts
interface BenchLocalChatResponse {
  id?: string;
  modelId: string;
  message?: ChatMessage;
  content?: string;
  finishReason?: string;
  usage?: Record<string, unknown>;
  raw?: unknown;
}
```

### 流式对话

```ts
let content = "";

for await (const event of benchlocal.inference.streamChat({
  modelId: model.id,
  messages: [{ role: "user", content: "Solve the task step by step." }],
  generation: { temperature: 0.2 }
})) {
  if (event.type === "delta" && event.content) {
    content += event.content;
  }

  if (event.type === "tool_call") {
    console.log("Tool call", event.toolCall);
  }

  if (event.type === "error") {
    throw new Error(event.message);
  }
}
```

流事件：

```ts
type BenchLocalChatStreamEvent =
  | { type: "start"; id?: string; modelId: string }
  | { type: "delta"; id?: string; modelId: string; content?: string; raw?: unknown }
  | { type: "tool_call"; id?: string; modelId: string; toolCall: ToolCallRecord; raw?: unknown }
  | {
      type: "done";
      id?: string;
      modelId: string;
      message?: ChatMessage;
      content?: string;
      finishReason?: string;
      usage?: Record<string, unknown>;
      raw?: unknown;
    }
  | { type: "error"; modelId: string; message: string; code?: string; retryable?: boolean };
```

## 运行状态 API

交互式 Web Bench Pack 控制自己的 UI，因此必须在运行开始、推进、停止或取消时告知 BenchLocal。BenchLocal 用这些状态显示标签页加载指示器和宿主侧的「停止」按钮。

### 开始运行

```ts
await benchlocal.runs.startState({
  message: "Started form-filling benchmark.",
  metadata: { modelId: model.id }
});
```

### 更新进度

```ts
await benchlocal.runs.updateProgress({
  status: "running",
  progress: 0.42,
  message: "Filled employment history.",
  metadata: {
    step: "employment-history"
  }
});
```

进度输入：

```ts
interface BenchLocalWebRunProgressInput {
  status?: "created" | "running" | "completed" | "cancelled" | "error";
  message?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}
```

### 处理停止请求

BenchLocal 可以要求 Web 应用停止。取消由 Web 应用负责，因为基准测试工作流归它所有。

```ts
let stopped = false;

const unsubscribeStop = benchlocal.runs.onStopRequested(async (event) => {
  stopped = true;

  await benchlocal.history.save({
    status: "cancelled",
    events: [
      {
        type: "stop_requested",
        createdAt: event.requestedAt,
        payload: { reason: event.reason }
      }
    ]
  });

  await benchlocal.runs.stopState({ message: "Stopped by BenchLocal." });
});

// 在步骤、工具调用、流式分片或动画帧之间检查它。
if (stopped) {
  return;
}

// 之后：
unsubscribeStop();
```

### 停止运行

当活动运行完成、被取消或出错时，务必调用 `stopState()`。

```ts
await benchlocal.runs.stopState({
  message: "Completed benchmark.",
  metadata: { status: "completed" }
});
```

## 历史 API

历史让 Web 包把数据持久化到 BenchLocal，用户以后可以重新查看运行。

### 加载历史

```ts
const history = await benchlocal.history.load<{
  selectedModelId?: string;
  score?: number;
}>();

if (history.payload) {
  renderPlayback(history.payload.metadata);
}
```

在 `capabilities.history?.mode === "history"` 时使用它。

### 保存历史

```ts
await benchlocal.history.save({
  status: "completed",
  score: {
    totalScore: 87,
    categories: [
      { id: "accuracy", label: "Accuracy", score: 90 },
      { id: "format", label: "Format", score: 80 }
    ]
  },
  metadata: {
    selectedModelId: model.id,
    completedCases: 15
  },
  events: [
    {
      type: "case_completed",
      createdAt: new Date().toISOString(),
      payload: { caseId: "case-001" }
    }
  ]
});
```

历史载荷：

```ts
interface WebBenchPackHistoryPayload {
  status?: "created" | "running" | "completed" | "cancelled" | "error";
  score?: BenchmarkScore;
  metadata?: Record<string, unknown>;
  artifacts?: ArtifactRef[];
  events?: Array<{
    type: string;
    createdAt: string;
    payload?: unknown;
  }>;
}
```

### 写入产物

```ts
const artifact = await benchlocal.history.writeArtifact({
  kind: "json",
  label: "Final form state",
  path: "form-state.json",
  contentType: "application/json",
  content: JSON.stringify(formState, null, 2)
});

await benchlocal.history.save({
  status: "completed",
  artifacts: [artifact],
  metadata: { savedArtifact: artifact.path }
});
```

产物输入：

```ts
interface BenchLocalWebArtifactWriteInput {
  kind: string;
  label: string;
  path?: string;
  contentType?: string;
  content: string | ArrayBuffer | Uint8Array;
}
```

## 权限模型

Bench Pack 清单声明托管页面需要哪些桥接权限。BenchLocal 应在响应桥接调用前强制执行这些权限。

常见权限：

| 权限 | 启用的功能 |
| --- | --- |
| `models:list` | `models.list()` |
| `models:read` | `models.getSelected()` 和 `models.onChanged()` |
| `inference:chat` | `inference.chat()` |
| `inference:stream` | `inference.streamChat()` |
| `runs:write` | `runs.startState()`、`runs.updateProgress()`、`runs.stopState()` 和停止回调 |
| `history:read` | `history.load()` |
| `history:write` | `history.save()` |
| `artifacts:write` | `history.writeArtifact()` |

Web 清单片段示例：

```json
{
  "type": "web",
  "web": {
    "bridgeVersion": 1,
    "allowedOrigins": ["https://packs.benchlocal.com"],
    "permissions": [
      "models:list",
      "models:read",
      "inference:chat",
      "inference:stream",
      "runs:write",
      "history:read",
      "history:write",
      "artifacts:write"
    ],
    "historyPlayback": true
  }
}
```

## 安全注意事项

- 不要让用户把提供商 API 密钥粘贴到你的 Web 包中。
- 不要把提供商凭据发送到你的服务器。
- 不要依赖浏览器直接请求 LLM 提供商。CORS 和凭据信任正是本 SDK 存在的原因。
- 把 Web 应用视为呈现层和基准测试编排层。
- 把 BenchLocal 视为提供商执行、所选模型、历史和产物的本地权威。
- 如果你的 Web 包调用远程服务，请在 Bench Pack 数据策略中声明这些源，并说明发送了什么数据。
- 存储足够的历史元数据，让用户能理解并复现一次运行，但避免存储密钥。

## 错误处理

桥接调用以 `Error` 拒绝。BenchLocal 可能附加 `code` 和 `retryable` 字段。

```ts
try {
  await benchlocal.inference.chat(request);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
  console.error("BenchLocal bridge error", { message, code });
}
```

常见情况：

- `BenchLocal bridge request timed out`：页面不在 BenchLocal 内、父级桥接不可用，或请求耗时超过 `requestTimeoutMs`。
- 权限错误：已安装的 Web 清单没有授予该方法的权限。
- 推理错误：所选模型/提供商在本地执行失败。

## 开发工作流

本地开发时，把 Web Bench Pack 清单指向你的开发服务器：

```json
{
  "schemaVersion": 1,
  "protocolVersion": 1,
  "type": "web",
  "id": "my-web-benchpack",
  "name": "My Web Bench Pack",
  "version": "0.1.0",
  "entry": "http://127.0.0.1:5174",
  "web": {
    "bridgeVersion": 1,
    "allowedOrigins": ["http://127.0.0.1:5174"],
    "permissions": ["models:read", "inference:chat", "runs:write", "history:write"]
  },
  "capabilities": {
    "tools": true,
    "multiTurn": true,
    "streamingProgress": true,
    "verification": false
  }
}
```

对于官方托管包，请使用不可变的托管 URL，例如：

```text
https://packs.benchlocal.com/{pack-id}/{version}/index.html
```

这使 Web 交付保持可修补，同时 BenchLocal 历史仍能记录该次运行所用的包 id、版本、入口 URL、构建 id 和清单元数据。

## 版本管理

本包遵循 BenchLocal 生态包的版本号。`@benchlocal/web-sdk@0.3.0` 面向与 `@benchlocal/core@0.3.0` 搭配使用。

浏览器桥接有自己的协议版本：

```ts
BENCHLOCAL_WEB_BRIDGE_VERSION === 1;
```

桥接消息的破坏性变更应递增桥接版本。

## 相关包

- `@benchlocal/core`：共享的 BenchLocal 协议与数据类型
- `@benchlocal/sdk`：面向表格/运行时型 Bench Pack 的 SDK
- `@benchlocal/web-sdk`：面向交互式 Web Bench Pack 的浏览器 SDK

## 仓库

- BenchLocal 单仓库：https://github.com/stevibe/BenchLocal
- 问题反馈：https://github.com/stevibe/BenchLocal/issues

## 许可证

MIT。Copyright (c) 2026 stevibe。
