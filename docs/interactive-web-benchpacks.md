# 交互式 Web Bench Pack

BenchLocal 目前支持通过标准宿主运行时运行、并在表格中渲染结果的 Bench Pack。交互式 Web Bench Pack 增加了第二种呈现模型：由托管的 Web 应用渲染基准测试体验，而 BenchLocal 仍是凭据、提供商、模型、推理、历史和产物的本地权威。

这是 BenchLocal 协议的演进，而不是对表格型 Bench Pack 的替代。

## 目标

- 保持与安装、打开普通 Bench Pack 相同的用户体验。
- 让官方托管的包能渲染比表格更丰富的基准测试体验。
- 提供商凭据与模型执行保留在桌面应用本地。
- 通过用户已信任的同一套本地提供商/模型配置支持流式与非流式推理。
- 让 Web 包把结构化元数据和产物存入 BenchLocal 历史。
- 当用户打开已保存的运行时，让 Web 包拥有自己的历史回放 UI。
- 保持架构与 Agent API 和 MCP 接口兼容，以便未来 UI 功能扩展。

## 包类型

BenchLocal 应支持两种清单类型：

- `table`：当前的运行时模块型 Bench Pack。BenchLocal 导入本地 JS 入口，运行场景，对结果评分，并渲染表格。
- `web`：托管的交互式 Bench Pack。BenchLocal 打开一个沙箱化的 Web 界面并注入一个窄接口的桥接 API。

现有包可以省略 `type`；BenchLocal 会将它们视为 `table`。

## 托管版本管理

官方 Web 包入口应按版本不可变：

```text
https://packs.benchlocal.com/{pack-id}/{version}/index.html
```

示例：

```text
https://packs.benchlocal.com/llm-form-filling-test/1.0.0/index.html
```

注册表仍然负责安装发现和版本管理。安装 Web 包是把它的清单装入 BenchLocal，而不只是一个裸 URL。托管应用可以通过发布新版本并更新注册表来修补。

本地开发可以使用 `http://localhost` 或 `http://127.0.0.1` 入口，但注册表托管的官方 Web 包应使用 `https`。

每次运行都必须持久化所用 Web 包的精确身份：

```json
{
  "packId": "llm-form-filling-test",
  "packType": "web",
  "version": "1.0.0",
  "entryUrl": "https://packs.benchlocal.com/llm-form-filling-test/1.0.0/index.html",
  "buildId": "2026-05-31-a84f91",
  "manifestHash": "sha256-..."
}
```

这使托管交付保持灵活，同时保留基准测试的可追溯性。

## 清单结构

```json
{
  "schemaVersion": 1,
  "protocolVersion": 1,
  "type": "web",
  "id": "llm-form-filling-test",
  "name": "LLM Form Filling Test",
  "version": "1.0.0",
  "entry": "https://packs.benchlocal.com/llm-form-filling-test/1.0.0/index.html",
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
    "historyPlayback": true,
    "dataPolicy": {
      "mayUseRemoteServices": true,
      "remoteOrigins": ["https://api.packs.benchlocal.com"],
      "sendsModelOutputs": false,
      "sendsRunMetadata": true,
      "description": "This pack may use hosted test assets and anonymous aggregate run metadata. Provider credentials stay local."
    }
  },
  "capabilities": {
    "tools": true,
    "multiTurn": true,
    "streamingProgress": true,
    "verification": false
  }
}
```

## 注册表结构

注册表条目应支持托管的 Web 来源：

```json
{
  "id": "llm-form-filling-test",
  "name": "LLM Form Filling Test",
  "version": "1.0.0",
  "source": {
    "type": "web",
    "entry": "https://packs.benchlocal.com/llm-form-filling-test/1.0.0/index.html",
    "manifest": "https://packs.benchlocal.com/llm-form-filling-test/1.0.0/benchlocal.pack.json"
  }
}
```

如果存在 `manifest`，BenchLocal 应在安装时获取并校验它。如果不存在，则可将注册表条目转换为最小的已安装清单。

对于本地开发和第三方测试，既有的从 URL 安装流程也可以直接指向 Web Bench Pack 清单：

```text
http://127.0.0.1:5174/benchlocal.pack.json
```

本地的 `http://localhost` 与 `http://127.0.0.1` 清单 URL 在开发时可接受。公开的远程 Web Bench Pack 条目应使用 `https`。

## 安全边界

托管页面不被信任持有提供商凭据。

强制规则：

- 官方托管包只加载已声明的 `https` 入口。
- 只允许清单中声明的源与桥接层通信。
- 在 Web 界面中禁用 Node 集成和直接文件系统访问。
- 不向 Web 应用暴露提供商 API 密钥、密钥环境变量名或原始提供商配置。
- 不提供任意的带凭据 HTTP 代理。
- 将桥接权限视为能力（capability），并按已安装的包逐个强制执行。
- 将包 id、版本、入口 URL 和构建元数据持久化到每次运行中。

如果清单声明了，Web 应用可以调用自己的服务器。提供商请求仍然通过 BenchLocal。

## 桥接 API

托管应用应使用浏览器安全的 SDK：

```ts
import { createBenchLocalClient } from "@benchlocal/web-sdk";

const benchlocal = createBenchLocalClient();
```

Web 应用可以快速检测自己是否运行在 BenchLocal 内。这有助于展示普通浏览器的落地页状态，而不是等待桥接调用超时：

```ts
const environment = await benchlocal.environment.detect({ timeoutMs: 500 });

if (!environment.isInsideBenchLocal) {
  // 渲染「请在 BenchLocal 中打开此基准包」的状态。
}
```

初始接口面：

```ts
const insideBenchLocal = await benchlocal.environment.isInsideBenchLocal({ timeoutMs: 500 });
await benchlocal.capabilities();
await benchlocal.models.list();
await benchlocal.models.getSelected();

const unsubscribeStop = benchlocal.runs.onStopRequested(() => {
  // 取消活动任务，然后调用 stopState()。
});

await benchlocal.runs.startState({ message: "Running the interactive benchmark." });

await benchlocal.inference.chat({
  modelId: "qwen-qwen3-5-9b",
  messages: [{ role: "user", content: "..." }],
  generation: { temperature: 0.2, top_p: 0.95 }
});

for await (const chunk of benchlocal.inference.streamChat({
  modelId: "qwen-qwen3-5-9b",
  messages: [{ role: "user", content: "..." }],
  generation: { temperature: 0.2 }
})) {
  // 在 Web 应用中渲染流式更新。
}

await benchlocal.runs.stopState({ message: "Interactive benchmark stopped." });
```

桥接层应构建在 BenchLocal 现有的提供商/模型执行服务之上，而不是第二套推理栈。

## 运行状态 API

交互式包拥有自己的 UI 运行时，但 BenchLocal 仍需要在桌面外壳中反映该运行时。使用运行状态 API 保持宿主标签页状态准确。

```ts
await benchlocal.runs.startState({
  message: "Started form-filling benchmark.",
  metadata: { modelId }
});

await benchlocal.runs.updateProgress({
  status: "running",
  progress: 0.35,
  message: "Filled applicant information."
});

const unsubscribe = benchlocal.runs.onStopRequested(async () => {
  // 停止计时器，尽可能中止活动任务，并持久化已取消的状态。
  await benchlocal.history.save({ status: "cancelled" });
  await benchlocal.runs.stopState({ message: "Stopped by BenchLocal." });
});

await benchlocal.runs.stopState({
  message: "Completed form-filling benchmark.",
  metadata: { status: "completed" }
});
```

`startState` 打开 BenchLocal 标签页的加载指示器并启用宿主的「停止」操作。`stopState` 清除加载指示器和任何待处理的停止状态。当用户在 BenchLocal 中点击「停止」时，宿主发出 `runs.stopRequested`；Web 应用必须实现该回调并停止自己的活动任务。

## 推理参数

暴露的推理 API 必须同时支持常见的 OpenAI 兼容参数和提供商特有扩展。

常见参数：

- `temperature`
- `top_p`
- `top_k`
- `min_p`
- `max_tokens`
- `seed`
- `stop`
- `presence_penalty`
- `frequency_penalty`
- `repetition_penalty`
- `request_timeout_seconds`

推理（reasoning）参数：

```ts
reasoning?: {
  effort?: "minimal" | "low" | "medium" | "high";
  budget_tokens?: number;
  enabled?: boolean;
  adaptive?: boolean;
  exclude?: boolean;
  summary?: "auto" | "concise" | "detailed";
  provider?: Record<string, unknown>;
}
```

提供商特有的逃生舱：

```ts
provider_options?: Record<string, unknown>;
extra_body?: Record<string, unknown>;
```

这让 BenchLocal 既能支持常规采样，又能容纳诸如 DeepSeek 推理设置或 Claude 自适应推理之类的场景，而无需把每家提供商的方言硬编码进顶层 API。

## 历史 API

交互式包应将自己的结构化历史载荷存储到 BenchLocal。BenchLocal 负责存储和索引这次运行；Web 应用负责回放。

最低历史能力：

```ts
await benchlocal.history.save({
  status: "completed",
  score: {
    totalScore: 87,
    categories: [{ id: "form_accuracy", label: "Form Accuracy", score: 90 }]
  },
  metadata: {
    taskCount: 12,
    difficulty: "mixed"
  },
  artifacts: [
    { kind: "json", label: "trace", contentType: "application/json", path: "artifacts/trace.json" }
  ]
});

const history = await benchlocal.history.load();
```

当用户打开已保存的 Web 运行时：

1. BenchLocal 尽可能加载同一已安装的 Web 包版本。
2. BenchLocal 把保存的运行 id 和保存的 Web 历史载荷传给 Web 应用。
3. Web 应用自己的 UI 渲染回放。
4. 如果精确版本不可用，BenchLocal 应给出警告，并使用最接近的兼容已安装版本，或阻止回放。

历史应支持：

- `metadata`：由包控制的 JSON 对象。
- `artifacts`：写入运行目录的文件。
- `events`：可选的时间线事件，用于实时 UI 和回放。
- `score`：可选的汇总得分，用于 BenchLocal 层面的列表视图和分享卡。
- `pack`：不可变的包身份，用于可追溯性。

## 应用集成

打开已安装的 Web 包应创建一个普通的 BenchLocal 标签页，只是标签页内容是沙箱化的 Web 界面，而不是表格结果视图。

既有控件应继续发挥作用：

- 所选模型
- 运行模式
- 每个测试的运行次数
- 采样设置
- 可用性刷新
- 在 Web 包支持时的停止/继续
- 历史列表

在第一个实现中，Web 标签页可以通过桥接暴露模型选择和推理，然后通过新的 Web 历史 API 存储历史。

## 实现阶段

1. 为 `web` 清单、Web 权限、更丰富的推理参数、Web 历史载荷和桥接消息添加协议类型。
2. 为托管 Web 应用添加浏览器安全的 `@benchlocal/web-sdk` 包。
3. 让注册表安装和 URL 安装接受 Web 包清单和托管入口。
4. 为 Web 包添加沙箱化的渲染界面。
5. 注入桥接层，并把调用路由到现有的 BenchLocal 模型/推理服务。
6. 把 Web 包的历史载荷和产物持久化到现有的运行目录布局中。
7. 添加从 BenchLocal 到 Web 应用的历史回放交接。
8. 在有用之处为 Web 包标签页和历史添加 Agent API/MCP 端点。

## 第一切片的非目标

- 托管 Web 包的完全离线执行。
- 没有清单的任意第三方 Web 源。
- 把提供商凭据发送给托管包服务器。
- 替代表格型 Bench Pack。
