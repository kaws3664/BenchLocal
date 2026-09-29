# Agent API 与 MCP 开发者参考

本文档是 BenchLocal 本地 Agent 接口的长期参考：

- 通过 HTTP JSON 命令读取与变更状态
- 通过 Server-Sent Events 获取实时进度与状态变化
- 通过 MCP Streamable HTTP 进行标准 Agent 工具调用

每当 UI 功能变为 Agent 可控时，请同步更新本文件。

## 设计契约

BenchLocal 首先是一个桌面基准测试应用。Agent 接口必须暴露与 UI 相同的操作，且不得创建第二条执行路径。

核心规则：

- Electron 渲染进程继续通过 `window.benchlocal` 使用 IPC。
- Agent API 与 MCP 调用与 IPC 相同的主进程控制器。
- 命令使用 HTTP JSON 或 MCP 工具。
- 实时进度通过 SSE 事件或 MCP 近期事件轮询获取。
- 耗时较长的基准测试命令快速返回，并在 UI 中继续执行。
- 提供商密钥绝不会通过 HTTP、SSE、MCP 资源或 MCP 工具结果返回。
- Agent 访问是显式的、受令牌保护的、本地优先的。
- BenchLocal 不为 Agent 执行任意 shell 命令。

实现文件：

```text
app/src/main/controller.ts
  Shared main-process operations used by IPC, HTTP, and MCP.

app/src/main/agent-server.ts
  Local HTTP server, auth, SSE, OpenAPI, agent guide, and route adapters.

app/src/main/agent-mcp.ts
  MCP Streamable HTTP server, resources, prompt, and benchlocal_* tools.

packages/benchlocal-core/src/agent-protocol.ts
  Shared Agent API event and request/response types.

packages/benchlocal-core/src/config.ts
  Provider, model, and Agent Access config types.

packages/benchlocal-core/src/workspaces.ts
  Workspace, tab, model selection, execution mode, and sampling state.
```

## 运行时模型

可以在「设置 > Agent 访问」中启用 Agent 访问。

服务器监听在：

- 当 access 为 `localhost` 时监听 `127.0.0.1`
- 当 access 为 `local_network` 时监听 `0.0.0.0`

UI 始终显示形如以下的本地客户端 URL：

```text
http://127.0.0.1:<port>
```

启用 `local_network` 后，其他设备上的 Agent 必须使用宿主机的局域网 IP。

端口要么是：

- 已配置的端口
- 未配置端口时自动分配的端口

环境变量覆盖：

```bash
BENCHLOCAL_AGENT_API=1
BENCHLOCAL_AGENT_PORT=50060
BENCHLOCAL_AGENT_ACCESS=localhost
BENCHLOCAL_AGENT_ACCESS=local_network
```

令牌存储：

```text
~/.benchlocal/agent-session.json
```

会话文件包含 Bearer 令牌，由 BenchLocal 创建时以仅所有者可读写的权限写入。

## 认证

除 `GET /v1/health` 外，所有端点都要求：

```http
Authorization: Bearer <token>
```

令牌显示在「设置 > Agent 访问」中，可以在那里重新生成。

未认证的请求返回：

```json
{
  "error": {
    "message": "Unauthorized.",
    "statusCode": 401
  }
}
```

MCP 请求还强制执行 Origin 检查。如果存在 `Origin` 头，它必须是 localhost：

- `localhost`
- `127.0.0.1`
- `::1`
- `[::1]`

这有意比普通 HTTP 路由更严格，因为 MCP 客户端可能与浏览器相邻。

## URL 与 JSON 规则

路径中的 ID 必须进行 URL 编码。包含 `:`、`/`、空格或 UUID 形式提供商前缀的模型 ID 与提供商 ID 都需要这样处理。

示例：

```bash
MODEL_ID='huggingface:Qwen/Qwen3.5-9B'
curl "$BENCHLOCAL_AGENT_BASE_URL/v1/models/$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$MODEL_ID")" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN"
```

JSON 写入端点拒绝未知字段。这是有意为之：

- Agent 偏离契约时能得到快速反馈
- 意外的写入不会静默改动未来的配置
- UI 与 API 的载荷保持一致

请求体上限为 1 MB。

错误使用如下格式：

```json
{
  "error": {
    "message": "Human-readable error.",
    "statusCode": 400
  }
}
```

## 发现端点

### `GET /v1/health`

无需认证。

返回运行时状态与文档链接。

示例响应：

```json
{
  "ok": true,
  "benchLocalVersion": "0.2.6",
  "agent": {
    "enabled": true,
    "running": true,
    "access": "localhost",
    "host": "127.0.0.1",
    "port": 50060,
    "baseUrl": "http://127.0.0.1:50060",
    "connectedClients": 0,
    "message": "Agent API is listening on http://127.0.0.1:50060.",
    "startedAt": "2026-05-18T00:00:00.000Z"
  },
  "docs": {
    "agentGuide": "/v1/agent-guide",
    "openapi": "/v1/openapi.json",
    "mcp": "/mcp"
  }
}
```

### `GET /v1/agent-guide`

需要认证。

返回由运行中的应用生成的 Agent 可读 Markdown。它有意比这份开发者参考更短，用于运行时的 Agent 引导。

### `GET /v1/openapi.json`

需要认证。

返回由运行中的应用生成的 OpenAPI 文档。

OpenAPI 文档有助于端点发现，但目前其 schema 有意保持轻量。本档仍是实现指引的权威来源。

### `POST /mcp`

需要认证。

标准的 MCP Streamable HTTP 端点。参见 [MCP 接口](#mcp-接口)。

`POST /v1/mcp` 也被接受。

## SSE 事件流

### `GET /v1/events`

需要认证。

打开一条 Server-Sent Events 流。

```bash
curl -N \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  "$BENCHLOCAL_AGENT_BASE_URL/v1/events"
```

初始响应包含一条注释：

```text
: BenchLocal agent event stream
```

每个事件的发送格式：

```text
id: evt-...
event: benchpack.run.event
data: {"eventId":"evt-...","createdAt":"...","type":"benchpack.run.event","payload":{}}
```

事件信封：

```ts
type BenchLocalAgentEvent<TPayload = unknown> = {
  eventId: string;
  createdAt: string;
  type: BenchLocalAgentEventType;
  payload: TPayload;
};
```

当前事件类型：

```text
agent.state.updated
config.updated
workspace.updated
models.availability.updated
benchpack.run.started
benchpack.run.event
benchpack.run.finished
benchpack.run.error
verifier.event
```

重要载荷：

```ts
type BenchLocalAgentWorkspaceUpdatedPayload = {
  state: BenchLocalWorkspaceState;
};

type BenchLocalAgentConfigUpdatedPayload = {
  config: BenchLocalAgentSafeConfig;
};

type BenchLocalAgentModelAvailabilityPayload = {
  availability: ModelAvailability[];
};

type BenchLocalAgentRunEventPayload = {
  tabId: string;
  benchPackId: string;
  event: ProgressEvent;
};
```

`benchpack.run.event` 包装 Bench Pack 宿主进度事件。嵌套的 `event` 可能包含场景开始、模型进度、场景结果、运行完成、运行错误及其他 Bench Pack 进度消息。

SSE 是只读的。不要向 SSE 添加命令语义。

## 共享类型

### 提供商（Provider）

```ts
type BenchLocalProviderKind =
  | "openrouter"
  | "huggingface"
  | "ollama"
  | "llamacpp"
  | "mlx"
  | "lmstudio"
  | "pico"
  | "openai_compatible";

type BenchLocalProviderConfig = {
  kind: BenchLocalProviderKind;
  name: string;
  enabled: boolean;
  base_url: string;
  api_key?: string;
  api_key_env?: string;
};
```

API 与 MCP 的提供商读取会脱敏 `api_key` 并暴露：

```ts
type SafeProvider = Omit<BenchLocalProviderConfig, "api_key"> & {
  has_api_key: boolean;
  has_api_key_env: boolean;
};
```

### 模型（Model）

```ts
type BenchLocalModelConfig = {
  id: string;
  provider: string;
  model: string;
  label: string;
  group: string;
  enabled: boolean;
};
```

`provider` 是提供商 ID，而不是提供商显示名。

### 工作区标签页

```ts
type BenchLocalExecutionMode =
  | "serial"
  | "serial_by_model"
  | "parallel_by_model"
  | "parallel_by_test_case"
  | "full_parallel";

type BenchLocalWorkspaceTabModelSelection = {
  modelId: string;
  alias?: string;
};

type BenchLocalWorkspaceTab = {
  id: string;
  title: string;
  benchPackId: string | null;
  loadedRunId?: string | null;
  focusedScenarioId: string | null;
  modelSelections: BenchLocalWorkspaceTabModelSelection[];
  samplingOverrides?: GenerationRequest;
  executionMode: BenchLocalExecutionMode;
  runsPerTest: number;
  createdAt: string;
  updatedAt: string;
};
```

### 生成参数

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

默认请求超时在 core 中定义为 `DEFAULT_BENCHLOCAL_REQUEST_TIMEOUT_SECONDS`。

## HTTP API 参考

所有示例假定：

```bash
export BENCHLOCAL_AGENT_BASE_URL="http://127.0.0.1:50060"
export BENCHLOCAL_AGENT_TOKEN="<token from Settings > Agent Access>"
```

### 读取状态

#### `GET /v1/config`

返回脱敏后的 BenchLocal 配置。

响应：

```json
{
  "config": {
    "schema_version": 1,
    "ui": { "theme": "system" },
    "agent": { "enabled": true, "access": "localhost", "port": 50060 },
    "providers": {
      "huggingface": {
        "kind": "huggingface",
        "name": "Hugging Face",
        "enabled": true,
        "base_url": "https://router.huggingface.co/v1",
        "api_key_env": "HF_TOKEN",
        "has_api_key": false,
        "has_api_key_env": true
      }
    },
    "models": []
  }
}
```

#### `GET /v1/workspaces`

返回完整的工作区状态：

```json
{
  "path": "/Users/me/.benchlocal/state.json",
  "created": false,
  "state": {
    "schema_version": 1,
    "activeWorkspaceId": "workspace-main",
    "workspaceOrder": ["workspace-main"],
    "workspaces": {},
    "tabs": {}
  }
}
```

#### `GET /v1/benchpacks`

返回已安装的 Bench Pack 与场景元数据：

```json
{
  "benchPacks": []
}
```

#### `GET /v1/benchpacks/registry`

返回可安装 Bench Pack 的注册表条目：

```json
{
  "registry": []
}
```

#### `GET /v1/providers`

返回已配置的提供商（密钥已脱敏）：

```json
{
  "providers": {
    "huggingface": {
      "kind": "huggingface",
      "name": "Hugging Face",
      "enabled": true,
      "base_url": "https://router.huggingface.co/v1",
      "api_key_env": "HF_TOKEN",
      "has_api_key": false,
      "has_api_key_env": true
    }
  }
}
```

#### `GET /v1/providers/:providerId`

返回单个脱敏后的提供商：

```json
{
  "providerId": "huggingface",
  "provider": {
    "kind": "huggingface",
    "name": "Hugging Face",
    "enabled": true,
    "base_url": "https://router.huggingface.co/v1",
    "api_key_env": "HF_TOKEN",
    "has_api_key": false,
    "has_api_key_env": true
  }
}
```

#### `GET /v1/providers/:providerId/models/discover`

当提供商支持浏览时，发现提供商的模型。

响应：

```json
{
  "models": []
}
```

这可能会调用外部提供商 API，在凭据或网络不可用时可能失败。

#### `GET /v1/models`

返回已配置的模型：

```json
{
  "models": [
    {
      "id": "huggingface:Qwen/Qwen3.5-9B",
      "provider": "huggingface",
      "model": "Qwen/Qwen3.5-9B",
      "label": "Qwen3.5-9B",
      "group": "primary",
      "enabled": true
    }
  ]
}
```

#### `GET /v1/models/:modelId`

返回单个已配置的模型：

```json
{
  "model": {
    "id": "huggingface:Qwen/Qwen3.5-9B",
    "provider": "huggingface",
    "model": "Qwen/Qwen3.5-9B",
    "label": "Qwen3.5-9B",
    "group": "primary",
    "enabled": true
  }
}
```

#### `GET /v1/models/availability`

检查所有已配置模型的可用性。

响应：

```json
{
  "availability": [
    {
      "modelId": "huggingface:Qwen/Qwen3.5-9B",
      "available": true,
      "checkedAt": "2026-05-18T00:00:00.000Z"
    }
  ]
}
```

确切的可用性字段由 `packages/benchlocal-core/src/protocol.ts` 中的 `ModelAvailability` 定义。

#### `GET /v1/runs/active`

返回活动的基准测试运行：

```json
{
  "activeRuns": []
}
```

#### `GET /v1/verifiers`

返回验证器运行时状态：

```json
{
  "verifiers": []
}
```

#### `GET /v1/benchpacks/:benchPackId/history`

返回某个 Bench Pack 的运行历史条目：

```json
{
  "history": []
}
```

#### `GET /v1/benchpacks/:benchPackId/history/:runId`

返回已保存的运行摘要：

```json
{
  "run": {}
}
```

### 提供商

#### `POST /v1/providers`

创建提供商。

允许的字段：

```ts
{
  id?: string;
  kind: BenchLocalProviderKind;
  name?: string;
  enabled?: boolean;
  base_url: string;
  api_key?: string;
  api_key_env?: string;
}
```

示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/providers" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "id": "huggingface",
    "kind": "huggingface",
    "name": "Hugging Face",
    "enabled": true,
    "base_url": "https://router.huggingface.co/v1",
    "api_key_env": "HF_TOKEN"
  }'
```

返回 `201`。

#### `PATCH /v1/providers/:providerId`

修补提供商。

允许的字段：

```ts
{
  kind?: BenchLocalProviderKind;
  name?: string;
  enabled?: boolean;
  base_url?: string;
  api_key?: string | null;
  api_key_env?: string | null;
}
```

当控制器支持时，对 `api_key` 或 `api_key_env` 使用 `null` 可清除已存储的值。

#### `DELETE /v1/providers/:providerId`

删除提供商。

重要行为：

- 删除关联的模型
- 从标签页选择中移除关联的模型
- 通过控制器广播配置/工作区更新

#### `POST /v1/providers/:providerId/duplicate`

复制一条提供商记录。

重要行为：

- 只复制提供商本身
- 不复制关联的模型

### 模型

#### `POST /v1/models`

创建模型。

允许的字段：

```ts
{
  id?: string;
  provider: string;
  model: string;
  label?: string;
  group?: string;
  enabled?: boolean;
}
```

示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/models" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "id": "huggingface:Qwen/Qwen3.5-9B",
    "provider": "huggingface",
    "model": "Qwen/Qwen3.5-9B",
    "label": "Qwen3.5-9B",
    "group": "primary",
    "enabled": true
  }'
```

返回 `201`。

#### `PATCH /v1/models/:modelId`

修补模型。

允许的字段：

```ts
{
  id?: string;
  provider?: string;
  model?: string;
  label?: string;
  group?: string;
  enabled?: boolean;
}
```

如果 ID 发生变化，控制器必须保持与标签页选择的一致性。

#### `DELETE /v1/models/:modelId`

删除一个模型并从标签页选择中移除它。

#### `POST /v1/models/:modelId/duplicate`

复制一条模型记录。

#### `POST /v1/models/availability/refresh`

全局刷新或针对所选模型 ID 刷新模型可用性。

允许的字段：

```ts
{
  modelIds?: string[];
}
```

示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/models/availability/refresh" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"modelIds":["huggingface:Qwen/Qwen3.5-9B"]}'
```

响应：

```json
{
  "availability": []
}
```

当控制器广播可用性变化时，还会发出 `models.availability.updated`。

### 工作区与标签页

#### `POST /v1/workspaces/:workspaceId/tabs`

创建工作区标签页。

允许的字段：

```ts
{
  benchPackId?: string | null;
  title?: string;
  modelSelections?: Array<{ modelId: string; alias?: string }>;
}
```

示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/workspaces/$WORKSPACE_ID/tabs" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "benchPackId": "toolcall-15",
    "title": "ToolCall-15",
    "modelSelections": [
      { "modelId": "huggingface:Qwen/Qwen3.5-9B" }
    ]
  }'
```

返回 `201` 和更新后的工作区状态。

#### `PATCH /v1/tabs/:tabId`

修补标签页。

允许的字段：

```ts
{
  title?: string;
  focusedScenarioId?: string | null;
  modelSelections?: Array<{ modelId: string; alias?: string }>;
  samplingOverrides?: GenerationRequest;
  executionMode?: BenchLocalExecutionMode;
  runsPerTest?: number;
}
```

用于复合更新。对于常见 UI 操作，优先使用下面更具体的端点，因为它们能更好地表达意图。

#### `POST /v1/tabs/:tabId/select-benchpack`

为标签页选择或清除 Bench Pack。

允许的字段：

```ts
{
  benchPackId: string | null;
  title?: string;
}
```

#### `POST /v1/tabs/:tabId/select-models`

为标签页选择模型。

允许的字段：

```ts
{
  modelIds?: string[];
  selections?: Array<{ modelId: string; alias?: string }>;
}
```

`modelIds` 是简洁形式。`selections` 是显式形式，支持别名。

示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/tabs/$TAB_ID/select-models" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "modelIds": [
      "huggingface:Qwen/Qwen3.5-9B",
      "huggingface:qwen3.6:35b-a3b"
    ]
  }'
```

#### `POST /v1/tabs/:tabId/sampling`

设置标签页采样参数覆盖。

允许的字段：

```ts
{
  samplingOverrides: GenerationRequest;
}
```

示例：

```json
{
  "samplingOverrides": {
    "temperature": 0,
    "top_p": 1,
    "request_timeout_seconds": 500
  }
}
```

#### `POST /v1/tabs/:tabId/execution-mode`

设置标签页执行模式，以及可选的每测试运行次数。

允许的字段：

```ts
{
  executionMode: BenchLocalExecutionMode;
  runsPerTest?: number;
}
```

执行模式取值：

```text
serial
serial_by_model
parallel_by_model
parallel_by_test_case
full_parallel
```

#### `POST /v1/tabs/:tabId/runs-per-test`

设置标签页每测试运行次数。

允许的字段：

```ts
{
  runsPerTest: number;
}
```

#### `POST /v1/tabs/:tabId/models/availability/refresh`

刷新标签页的可用性。

允许的字段：

```ts
{
  modelIds?: string[];
}
```

如果省略 `modelIds`，则使用该标签页所选的模型 ID。

### 运行

除非另有说明，运行命令是异步的。它们快速返回，详细进度通过 `GET /v1/events` 发出，并可在桌面 UI 中看到。

#### `POST /v1/tabs/:tabId/runs`

为标签页启动一次运行。

允许的字段：

```ts
{
  benchPackId?: string;
  modelIds?: string[];
  executionMode?: BenchLocalExecutionMode;
  runsPerTest?: number;
  generation?: GenerationRequest;
}
```

解析行为：

- `benchPackId` 默认取标签页所选的 Bench Pack
- `modelIds` 默认取标签页所选的模型
- `executionMode` 默认取标签页的执行模式
- `runsPerTest` 默认取标签页的每测试运行次数
- `generation` 默认取标签页的采样参数覆盖

响应：

```json
{
  "accepted": true,
  "tabId": "tab-..."
}
```

状态码：`202`。

生成摘要后，运行会在标签页上设置 `loadedRunId`。

#### `POST /v1/tabs/:tabId/runs/stop`

停止标签页的活动运行。

响应取决于控制器状态，但通常包含是否停止了某次运行。

与启动/继续/重试不同，这是同步的。

#### `POST /v1/tabs/:tabId/runs/:runId/resume`

继续一次历史运行。

允许的字段：

```ts
{
  executionMode?: BenchLocalExecutionMode;
  runsPerTest?: number;
  generation?: GenerationRequest;
}
```

响应：

```json
{
  "accepted": true,
  "tabId": "tab-...",
  "runId": "run-..."
}
```

状态码：`202`。

#### `POST /v1/tabs/:tabId/runs/:runId/retry-scenario`

从已保存的运行中重试一个场景/模型单元格。

允许的字段：

```ts
{
  scenarioId: string;
  modelId: string;
  runsPerTest?: number;
  generation?: GenerationRequest;
}
```

响应：

```json
{
  "accepted": true,
  "tabId": "tab-...",
  "runId": "run-..."
}
```

状态码：`202`。

#### `POST /v1/tabs/:tabId/runs/:runId/retry-provider-errors`

从已保存的运行中重试提供商错误的单元格。

允许的字段：

```ts
{
  runsPerTest?: number;
  generation?: GenerationRequest;
}
```

有待处理工作时的响应：

```json
{
  "accepted": true,
  "tabId": "tab-...",
  "runId": "run-...",
  "kind": "provider_errors",
  "cellCount": 2,
  "groupCount": 1
}
```

状态码：`202`。

没有符合条件的工作时的响应：

```json
{
  "accepted": false,
  "tabId": "tab-...",
  "runId": "run-...",
  "kind": "provider_errors",
  "cellCount": 0,
  "groupCount": 0
}
```

状态码：`200`。

提供商错误的归类必须来自提供商失败元数据与 HTTP 响应状态处理，而不是扫描验证器失败摘要。

#### `POST /v1/tabs/:tabId/runs/:runId/retry-failed-results`

从已保存的运行中重试非提供商原因失败的单元格。

允许的字段：

```ts
{
  runsPerTest?: number;
  generation?: GenerationRequest;
}
```

响应结构与 retry-provider-errors 一致，其中：

```json
{
  "kind": "failed_results"
}
```

## 推荐的 HTTP 工作流

这是 Agent 进行实时基准测试运行时应使用的工作流：

1. `GET /v1/health`
2. `GET /v1/workspaces`
3. `GET /v1/benchpacks`
4. `GET /v1/providers`
5. `GET /v1/models`
6. 打开 `GET /v1/events` 并保持连接。
7. 创建或修补标签页。
8. 选择 Bench Pack 与模型。
9. 刷新模型可用性。
10. 按需设置采样参数、执行模式与每测试运行次数。
11. 启动运行。
12. 观察 `benchpack.run.event`，直到出现完成、取消或错误事件。

示例：

```bash
curl "$BENCHLOCAL_AGENT_BASE_URL/v1/benchpacks" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN"

curl "$BENCHLOCAL_AGENT_BASE_URL/v1/workspaces" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN"

curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/workspaces/$WORKSPACE_ID/tabs" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"benchPackId":"toolcall-15","title":"ToolCall-15"}'

curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/tabs/$TAB_ID/select-models" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"modelIds":["huggingface:Qwen/Qwen3.5-9B"]}'

curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/tabs/$TAB_ID/models/availability/refresh" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{}'

curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/tabs/$TAB_ID/runs" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"executionMode":"serial_by_model","runsPerTest":1}'
```

## MCP 接口

BenchLocal 通过以下方式暴露 MCP：

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

`POST /v1/mcp` 作为别名被接受。

实现细节：

- 使用 `@modelcontextprotocol/sdk`。
- 使用 `StreamableHTTPServerTransport`。
- `sessionIdGenerator` 被禁用，因此服务器按请求无状态。
- `GET`、`DELETE` 与非 `POST` 请求返回 MCP method-not-allowed 的 JSON-RPC 错误。
- 耗时较长的工具返回 `accepted: true`；进度从 UI、近期事件或 SSE 流获取。

### MCP 客户端配置

把 Bearer 令牌用作 Authorization 头。

通用 MCP 客户端结构：

```json
{
  "mcpServers": {
    "benchlocal": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:50060/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

确切的配置键因 MCP 客户端而异。

### MCP 资源

| 资源 URI | 描述 |
| --- | --- |
| `benchlocal://agent/guide` | 运行时 Agent 指南 Markdown。 |
| `benchlocal://agent/openapi` | 运行时 OpenAPI JSON 文档。 |
| `benchlocal://state/config` | 脱敏后的 BenchLocal 配置。 |
| `benchlocal://state/workspaces` | 工作区与标签页状态。 |
| `benchlocal://state/benchpacks` | 已安装的 Bench Pack 与场景元数据。 |
| `benchlocal://state/providers` | 已配置的提供商（密钥已脱敏）。 |
| `benchlocal://state/models` | 已配置的模型。 |
| `benchlocal://state/runs/active` | 活动的基准测试运行。 |
| `benchlocal://state/events/recent` | 近期的 Agent API 事件。 |

### MCP 提示词

#### `benchlocal-run-benchpack`

参数：

```ts
{
  benchPackId: string;
  modelIds: string; // comma-separated model IDs
  workspaceId?: string;
}
```

用这个提示词教会支持 MCP 的 Agent 推荐的运行工作流：

- 检查工作区
- 选择或创建标签页
- 选择 Bench Pack
- 选择模型
- 刷新可用性
- 启动运行
- 在 UI 实时更新的同时轮询近期事件

### MCP 工具

所有 MCP 工具都以文本内容形式返回 JSON，并在可能时提供结构化内容。

#### 健康与状态

| 工具 | 只读 | 输入 | 结果 |
| --- | --- | --- | --- |
| `benchlocal_get_health` | 是 | `{}` | 运行时兼容性与健康状态。 |
| `benchlocal_get_config` | 是 | `{}` | 脱敏后的配置。 |
| `benchlocal_list_workspaces` | 是 | `{}` | 工作区与标签页状态。 |
| `benchlocal_list_benchpacks` | 是 | `{}` | 已安装的 Bench Pack。 |
| `benchlocal_list_benchpack_registry` | 是 | `{}` | 注册表条目。 |
| `benchlocal_list_active_runs` | 是 | `{}` | 活动运行。 |
| `benchlocal_list_verifiers` | 是 | `{}` | 验证器运行时状态。 |
| `benchlocal_get_recent_events` | 是 | `{ limit?: number }` | 近期事件，提供 `limit` 时返回最新 `limit` 条。 |

#### 提供商

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `benchlocal_list_providers` | `{}` | 脱敏后的提供商。 |
| `benchlocal_get_provider` | `{ providerId: string }` | 单个脱敏后的提供商。 |
| `benchlocal_create_provider` | `{ id?, kind, name?, enabled?, base_url, api_key?, api_key_env? }` | 创建提供商的结果。 |
| `benchlocal_update_provider` | `{ providerId, kind?, name?, enabled?, base_url?, api_key?, api_key_env? }` | 更新提供商的结果。 |
| `benchlocal_delete_provider` | `{ providerId }` | 删除结果。破坏性操作。 |
| `benchlocal_duplicate_provider` | `{ providerId }` | 复制提供商的结果。 |
| `benchlocal_discover_provider_models` | `{ providerId }` | 提供商模型发现结果。 |

`kind` 必须是以下之一：

```text
openrouter
huggingface
ollama
llamacpp
mlx
lmstudio
pico
openai_compatible
```

#### 模型

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `benchlocal_list_models` | `{}` | 已配置的模型。 |
| `benchlocal_get_model` | `{ modelId: string }` | 单个模型。 |
| `benchlocal_create_model` | `{ id?, provider, model, label?, group?, enabled? }` | 创建模型的结果。 |
| `benchlocal_update_model` | `{ modelId, id?, provider?, model?, label?, group?, enabled? }` | 更新模型的结果。 |
| `benchlocal_delete_model` | `{ modelId }` | 删除结果。破坏性操作。 |
| `benchlocal_duplicate_model` | `{ modelId }` | 复制模型的结果。 |
| `benchlocal_check_model_availability` | `{ modelIds?: string[] }` | 可用性结果。 |
| `benchlocal_refresh_model_availability` | `{ tabId?: string, modelIds?: string[] }` | 可用性结果。 |

当提供 `tabId` 且省略 `modelIds` 时，`benchlocal_refresh_model_availability` 使用标签页所选的模型。

#### 标签页

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `benchlocal_create_tab` | `{ workspaceId, benchPackId?, title?, modelSelections? }` | 更新后的工作区状态。 |
| `benchlocal_patch_tab` | `{ tabId, title?, focusedScenarioId?, modelSelections?, samplingOverrides?, executionMode?, runsPerTest? }` | 更新后的工作区状态。 |
| `benchlocal_select_benchpack` | `{ tabId, benchPackId, title? }` | 更新后的工作区状态。 |
| `benchlocal_select_models` | `{ tabId, modelIds?, selections? }` | 更新后的工作区状态。 |
| `benchlocal_set_sampling` | `{ tabId, samplingOverrides }` | 更新后的工作区状态。 |
| `benchlocal_set_execution_mode` | `{ tabId, executionMode, runsPerTest? }` | 更新后的工作区状态。 |
| `benchlocal_set_runs_per_test` | `{ tabId, runsPerTest }` | 更新后的工作区状态。 |

`modelSelections` 与 `selections` 使用：

```ts
Array<{ modelId: string; alias?: string }>
```

#### 运行

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `benchlocal_start_run` | `{ tabId, benchPackId?, modelIds?, executionMode?, runsPerTest?, generation? }` | `{ accepted: true, tabId }` |
| `benchlocal_resume_run` | `{ tabId, runId, executionMode?, runsPerTest?, generation? }` | `{ accepted: true, tabId, runId }` |
| `benchlocal_retry_scenario` | `{ tabId, runId, scenarioId, modelId, runsPerTest?, generation? }` | `{ accepted: true, tabId, runId }` |
| `benchlocal_retry_provider_errors` | `{ tabId, runId, runsPerTest?, generation? }` | 重试批次计划与已接受状态。 |
| `benchlocal_retry_failed_results` | `{ tabId, runId, runsPerTest?, generation? }` | 重试批次计划与已接受状态。 |
| `benchlocal_stop_run` | `{ tabId }` | 停止结果。 |
| `benchlocal_list_run_history` | `{ benchPackId }` | 运行历史。 |
| `benchlocal_get_run_summary` | `{ benchPackId, runId }` | 已保存的运行摘要。 |

启动工作的运行类工具在基准测试完成前就返回。轮询方式：

```text
benchlocal_get_recent_events
benchlocal://state/events/recent
GET /v1/events
```

## MCP 推荐工作流

对于控制本地模型基准测试的 Agent：

1. 读取 `benchlocal://state/workspaces`。
2. 读取 `benchlocal://state/benchpacks`。
3. 调用 `benchlocal_list_providers`。
4. 调用 `benchlocal_list_models`。
5. 用 `benchlocal_create_tab` 或 `benchlocal_patch_tab` 创建或修补标签页。
6. 用 `benchlocal_select_benchpack` 选择 Bench Pack。
7. 用 `benchlocal_select_models` 选择模型。
8. 请用户启动外部的本地模型服务器；如果 Agent 有自己安全的启动工具，也可以在 BenchLocal 之外启动它。
9. 调用 `benchlocal_refresh_model_availability`。
10. 调用 `benchlocal_start_run`。
11. 在 BenchLocal UI 展示运行的同时轮询 `benchlocal_get_recent_events`。
12. 模型服务器发生变化时，刷新可用性并对符合条件的结果继续或重试。

## 安全与保障

必须保持的不变式：

- `GET /v1/health` 是唯一无需认证的路由。
- 其他所有 HTTP 路由都要求 Bearer 令牌。
- MCP 要求 Bearer 令牌和本地 Origin。
- 配置读取使用 `getSafeConfig`。
- 提供商读取使用脱敏的提供商辅助函数。
- 没有任何路由返回 `api_key`。
- 路由拒绝未知的 JSON 字段。
- 路由不允许任意的文件读写。
- 路由不允许任意的 shell 执行。
- 破坏性 MCP 工具标注有 `destructiveHint`。

局域网模式：

- 仅面向受信任的网络
- 将服务器暴露在 `0.0.0.0`
- 仍然要求 Bearer 令牌
- 应像任何对基准测试状态有写权限的本地自动化端点一样对待

## 如何扩展 Agent 接口

当新的 UI 功能需要 Agent 可控时，应同时更新 HTTP 与 MCP。

完成的定义：

1. 在 `app/src/main/controller.ts` 中添加或复用控制器方法。
2. 当载荷不是平凡结构时，在 `packages/benchlocal-core/src/agent-protocol.ts` 中添加共享的请求/响应/事件类型。
3. 仅当渲染进程需要新的直接操作时，才添加 IPC 适配器。
4. 在 `app/src/main/agent-server.ts` 中添加 HTTP 路由。
5. 用 `assertOnlyKeys` 添加严格的 JSON 键校验。
6. 在返回数据前添加认证与脱敏规则。
7. 在 `createOpenApiDocument` 中添加或更新 OpenAPI 输出。
8. 如果 Agent 需要了解该功能，在 `createAgentGuide` 中添加或更新运行时指南。
9. 当功能暴露持久可读状态时，添加 MCP 资源。
10. 当功能是一个动作时，添加 MCP 工具。
11. 添加 MCP 注解：
    - `readOnlyHint: true` 用于纯读取
    - `destructiveHint: true` 用于删除或不可逆的更改
    - `openWorldHint: true` 当工具可能调用外部提供商或启动长时间的基准测试工作时
12. 发出或复用控制器事件，让渲染进程、SSE 客户端和 MCP 近期事件轮询都看到相同的变更。
13. 更新本文档。
14. 运行 typecheck 并手动进行本地 API 冒烟测试。

不要添加一个本应可自动化、却仅存在于 UI 的功能而不同时决定以下之一：

- 现在就通过 HTTP 与 MCP 暴露它
- 在本文档中明确标记它为 UI 专属并说明原因

## 事件扩展规则

仅当现有事件无法表达该变更时，才添加新的事件类型。

优先使用：

- `workspace.updated` 当标签页/工作区状态变化时
- `config.updated` 当配置变化时
- `models.availability.updated` 当可用性变化时
- `benchpack.run.event` 用于基准测试进度
- `verifier.event` 用于验证器生命周期

添加新事件类型时：

1. 将其加入 `BenchLocalAgentEventType`。
2. 定义载荷类型。
3. 从控制器发出它。
4. 通过既有事件总线广播它。
5. 将其加入本文档。
6. 如果 Agent 需要对它作出反应，把它写入运行时指南文本。

## HTTP 路由扩展模式

在 `agent-server.ts` 中使用如下形式：

```ts
if (request.method === "POST" && segments.length === 3 && segments[0] === "example") {
  const body = await readJsonRequest(request);
  assertOnlyKeys(body, ["allowedField"]);
  sendJson(response, 200, await this.controller.example(body as BenchLocalAgentExampleRequest));
  return;
}
```

对于耗时较长的命令：

```ts
void this.controller.longRunningOperation(input).catch((error) => {
  console.error("[benchlocal] agent-started operation failed", error);
});

sendJson(response, 202, { accepted: true, ...handle });
```

工作已被接受但未完成时使用 `202`。

命令同步完成或没有符合条件的工作时使用 `200`。

## MCP 工具扩展模式

在 `agent-mcp.ts` 中使用如下形式：

```ts
server.registerTool(
  "benchlocal_example_action",
  {
    title: "Example Action",
    description: "Do the same operation exposed by the UI and HTTP API.",
    inputSchema: {
      id: z.string()
    },
    annotations: { readOnlyHint: false, openWorldHint: false }
  },
  async ({ id }) => jsonToolResult(await controller.example(id))
);
```

对于耗时较长的工具，返回已接受的结果并依赖近期事件：

```ts
void controller.longRunningOperation(input).catch((error) => {
  console.error("[benchlocal] mcp-started operation failed", error);
});

return jsonToolResult({ accepted: true, id });
```

## 手动冒烟测试

修改 HTTP 或 MCP 后使用这些测试。

健康检查：

```bash
curl "$BENCHLOCAL_AGENT_BASE_URL/v1/health"
```

认证失败：

```bash
curl "$BENCHLOCAL_AGENT_BASE_URL/v1/models"
```

预期：`401`。

列出模型：

```bash
curl "$BENCHLOCAL_AGENT_BASE_URL/v1/models" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN"
```

SSE：

```bash
curl -N "$BENCHLOCAL_AGENT_BASE_URL/v1/events" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN"
```

创建标签页：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/v1/workspaces/$WORKSPACE_ID/tabs" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"benchPackId":"toolcall-15","title":"ToolCall-15"}'
```

MCP initialize 示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/mcp" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "curl-smoke",
        "version": "0.0.0"
      }
    }
  }'
```

MCP 列出工具示例：

```bash
curl -X POST "$BENCHLOCAL_AGENT_BASE_URL/mcp" \
  -H "Authorization: Bearer $BENCHLOCAL_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

## 当前的非目标

BenchLocal Agent API 与 MCP 目前不：

- 安装或卸载 Bench Pack
- 启动任意本地模型服务器
- 监管 Ollama、llama.cpp、MLX、LM Studio、Docker 或自定义脚本
- 暴露通用文件系统访问
- 暴露任意 shell 执行
- 取代桌面 UI

对于本地模型编排，Agent 应使用自己的环境管理外部模型服务器，或请用户启动/停止它们。BenchLocal 应暴露可用性、运行、继续、重试和停止控制，使协作过程在 UI 中保持可见。
