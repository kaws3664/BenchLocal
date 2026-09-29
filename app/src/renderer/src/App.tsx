import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import benchlocalIcon from "../../../assets/benchlocal-icon.png";
import benchlocalIconOutline from "../../../assets/benchlocal-icon-outline.png";
import shareCardDisplayFontUrl from "./assets/fonts/InterVariable.woff2";
import shareCardMonoFontUrl from "./assets/fonts/JetBrainsMonoVariable.woff2";
import type { ShareResultsData } from "./features/share-results/share-results";
import {
  ArrowRight,
  ArrowUp,
  CircleAlert,
  Check,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cog,
  Copy,
  FolderOpen,
  GripVertical,
  LayoutList,
  Logs,
  Pencil,
  Palette,
  Play,
  PlugZap,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Square,
  Server,
  Sidebar,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X
} from "lucide-react";
import type {
  ArtifactRef,
  BenchLocalChatRequest,
  BenchLocalChatStreamEvent,
  BenchPackRegistryEntry,
  BenchLocalAgentAccess,
  BenchLocalConfig,
  BenchLocalExecutionMode,
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchLocalProviderKind,
  BenchLocalThemeDefinition,
  BenchLocalThemeDescriptor,
  BenchLocalVerifierConfig,
  BenchLocalWorkspace,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  BenchLocalWorkspaceTabModelSelection,
  GenerationRequest,
  ModelAvailability,
  ProgressEvent,
  ScenarioResult,
  WebBenchPackHistoryPayload,
  BenchPackInspection,
  BenchPackManifest,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary,
  ScenarioMeta
} from "@core";
import type {
  BenchLocalAppMetadata,
  BenchLocalAgentAccessState,
  BenchLocalUpdateState,
  BenchPackMutationProgress,
  BenchLocalDiscoveredModel,
  DetachedLogsState,
  BenchPackVerifierStatus
} from "@/shared/desktop-api";

const DETACHED_LOGS_VIEW =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "logs";

const ShareResultsStudio = lazy(async () => {
  const module = await import("./features/share-results/ShareResultsStudio");
  return { default: module.ShareResultsStudio };
});

function describeAppUpdateState(state: BenchLocalUpdateState | null): string {
  if (!state) {
    return "更新器正在初始化。";
  }

  if (state.message?.trim()) {
    return state.message.trim();
  }

  switch (state.status) {
    case "unsupported":
      return "当前 BenchLocal 构建不支持自更新。";
    case "checking":
      return "正在检查 BenchLocal 更新。";
    case "available":
      return state.availableVersion
        ? `BenchLocal ${state.availableVersion} 已发布，正在下载更新。`
        : "发现 BenchLocal 更新，正在下载。";
    case "downloading":
      return state.availableVersion
        ? `正在下载 BenchLocal ${state.availableVersion}。`
        : "正在下载 BenchLocal 更新。";
    case "downloaded":
      return state.downloadedVersion
        ? `BenchLocal ${state.downloadedVersion} 已准备好安装。`
        : "BenchLocal 更新已准备好安装。";
    case "not_available":
      return "BenchLocal 已是最新版本。";
    case "error":
      return "BenchLocal 无法完成更新请求。";
    default:
      return "BenchLocal 可以检查更新。";
  }
}

function formatAppUpdateCheckedAt(checkedAt?: string): string | null {
  if (!checkedAt) {
    return null;
  }

  const date = new Date(checkedAt);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return date.toLocaleString();
}

function formatDurationMs(durationMs?: number): string | null {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))} 毫秒`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatStructuredDetail(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type SettingsTab = "providers" | "models" | "benchPacks" | "verification" | "agent" | "advanced";

type ToastTone = "success" | "danger" | "neutral" | "warning";

type ToastMessage = {
  id: string;
  tone: ToastTone;
  message: string;
  dedupeKey: string;
};

type LoadState = {
  path: string;
  created: boolean;
  config: BenchLocalConfig;
};

type ProviderFormState = {
  id: string;
  kind: BenchLocalProviderKind;
  name: string;
  enabled: boolean;
  base_url: string;
  api_key: string;
};

type ProviderModalState =
  | {
      mode: "create";
      initialId?: undefined;
      form: ProviderFormState;
    }
  | {
      mode: "edit";
      initialId: string;
      form: ProviderFormState;
    };

type ModelFormState = {
  id: string;
  provider: string;
  model: string;
  label: string;
  group: string;
  enabled: boolean;
};

type ModelModalState =
  | {
      mode: "create";
      index?: undefined;
      form: ModelFormState;
    }
  | {
      mode: "edit";
      index: number;
      form: ModelFormState;
    };

type ModelBrowserModalState = {
  providerId: string;
  providerName: string;
  entries: BenchLocalDiscoveredModel[];
  query: string;
  selectedModelId: string | null;
  loading: boolean;
  error: string | null;
};

type DetailModalState = {
  tabId: string;
  runId: string | null;
  benchPackId: string;
  modelId: string;
  modelLabel?: string;
  scenarioId: string;
  summary: string;
  rawLog: string;
  status: "pass" | "partial" | "fail";
  errorType?: ScenarioResult["errorType"];
  retryable?: boolean;
  timings?: ScenarioResult["timings"];
  note?: ScenarioResult["note"];
  score?: ScenarioResult["score"];
  points?: ScenarioResult["points"];
  output?: ScenarioResult["output"];
  verifier?: ScenarioResult["verifier"];
  artifacts?: ScenarioResult["artifacts"];
};

type TabModelsModalState = {
  tabId: string;
  selections: BenchLocalWorkspaceTabModelSelection[];
};

type SamplingFormState = {
  temperature: string;
  top_p: string;
  top_k: string;
  min_p: string;
  repetition_penalty: string;
  presence_penalty: string;
  request_timeout_seconds: string;
};

type NumericGenerationRequestKey = {
  [Key in keyof GenerationRequest]: GenerationRequest[Key] extends number | undefined ? Key : never;
}[keyof GenerationRequest];
type SamplingFieldKey = Extract<keyof SamplingFormState, NumericGenerationRequestKey>;

type SamplingModalState = {
  tabId: string;
  benchPackId: string;
  benchPackName: string;
  defaults: GenerationRequest;
  form: SamplingFormState;
};

type ModelAliasModalState = {
  tabId: string;
  modelId: string;
  baseLabel: string;
  alias: string;
};

type HistoryModalState = {
  benchPackId: string;
  benchPackName: string;
  entries: BenchPackRunHistoryEntry[];
};

type WorkspaceModalState =
  | {
      mode: "rename";
      workspaceId: string;
      name: string;
    }
  | null;

type WorkspaceContextMenuState = {
  workspaceId: string;
  workspaceName: string;
  x: number;
  y: number;
} | null;

type TabContextMenuState = {
  tabId: string;
  tabTitle: string;
  x: number;
  y: number;
} | null;

type ConfirmDialogState =
  | {
      title: string;
      subtitle: string;
      confirmLabel: string;
      tone?: "danger" | "neutral";
      onConfirm: () => void;
    }
  | null;

type ResolvedTabModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

type ModelAvailabilityView = ModelAvailability | {
  modelId: string;
  providerId: string;
  status: "checking" | "unknown";
  reason?: ModelAvailability["reason"];
  details?: string;
  checkedAt?: string;
};

type LiveRunState = {
  runId?: string;
  events: ProgressEvent[];
  resultsByModel: Record<string, ScenarioResult[]>;
  activeCellKeys: string[];
};

type ActiveRunEntry = {
  benchPackId: string;
  mode?: "host" | "replay";
};

type LoadedHistoryEntry = {
  runId: string;
  startedAt: string;
  mode?: "history" | "replay";
};

type LiveScenarioFocusState = {
  liveScenarioId: string | null;
  autoFollow: boolean;
};

type VerifierPreparingProgress = Extract<ProgressEvent, { type: "verifier_preparing" }>;

type VerifierPreparationModalState = {
  tabId: string;
  progress: VerifierPreparingProgress;
};

type SettingsVerifierPreparationModalState = {
  benchPackId: string;
  progress: VerifierPreparingProgress;
};

type BenchPackRunBlocker = {
  title: string;
  message: string;
  actionLabel: string;
};

type ShareCardStatusCounts = {
  pass: number;
  partial: number;
  fail: number;
};

type ResultShareCardData = {
  benchPackName: string;
  modelLabel: string;
  providerName: string;
  modelIdentifier: string;
  scoreValue: string;
  scenarioCount: number;
  completedCount: number;
  statusCounts: ShareCardStatusCounts;
  categories: Array<{ id: string; label: string; score: string }>;
  runModeLabel: string;
  runsPerTest: number;
  runDateLabel: string;
  durationLabel: string | null;
  footerLabel: string;
  outcomeLabel: string;
  fileName: string;
};

type BenchPackMutationState = BenchPackMutationProgress;
const THIRD_PARTY_INSTALL_MUTATION_ID = "__third_party_install__";
const DEFAULT_BENCHLOCAL_GENERATION: GenerationRequest = { request_timeout_seconds: 300 };
const BENCHLOCAL_WEB_BRIDGE_VERSION = 1 as const;
const BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE = "benchlocal-web-pack" as const;
const BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE = "benchlocal-host" as const;
const SHARE_CARD_WIDTH = 1200;
const SHARE_CARD_HEIGHT = 630;
const SHARE_CARD_EXPORT_SCALE = 2;
const SHARE_CARD_PIXEL_WIDTH = SHARE_CARD_WIDTH * SHARE_CARD_EXPORT_SCALE;
const SHARE_CARD_PIXEL_HEIGHT = SHARE_CARD_HEIGHT * SHARE_CARD_EXPORT_SCALE;
const SHARE_CARD_DISPLAY_FONT_FAMILY = "BenchLocal Share Inter";
const SHARE_CARD_MONO_FONT_FAMILY = "BenchLocal Share JetBrains Mono";

type WebBridgeMethod =
  | "capabilities"
  | "models.list"
  | "models.getSelected"
  | "inference.chat"
  | "inference.streamChat"
  | "runs.startState"
  | "runs.stopState"
  | "runs.updateProgress"
  | "history.load"
  | "history.save"
  | "history.writeArtifact";

type WebPackBridgeRequest = {
  source: typeof BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE;
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  requestId: string;
  streamId?: string;
  method: WebBridgeMethod;
  payload?: unknown;
};

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && /abort|cancel/i.test(error.name + " " + error.message);
}

function resolveThemeLabel(themeId: string, themes: BenchLocalThemeDescriptor[], prefersDark: boolean): string {
  if (themeId === "system") {
    return `系统（${prefersDark ? "深色" : "浅色"}）`;
  }

  return themes.find((theme) => theme.id === themeId)?.name ?? themeId;
}

const EXECUTION_MODE_OPTIONS: Array<{ value: BenchLocalExecutionMode; label: string }> = [
  { value: "serial", label: "按用例串行" },
  { value: "serial_by_model", label: "按模型串行" },
  { value: "parallel_by_model", label: "按模型并行" },
  { value: "parallel_by_test_case", label: "按用例并行" },
  { value: "full_parallel", label: "全部并行" }
];

const RUNS_PER_TEST_OPTIONS = [1, 3, 5, 7, 9] as const;

function supportsLiveScenarioColumnFocus(executionMode: BenchLocalExecutionMode): boolean {
  return executionMode !== "parallel_by_model" && executionMode !== "full_parallel";
}

function normalizeRunsPerTest(value: unknown): number {
  return RUNS_PER_TEST_OPTIONS.includes(value as (typeof RUNS_PER_TEST_OPTIONS)[number])
    ? (value as number)
    : 1;
}

const SIDEBAR_OPEN_STORAGE_KEY = "benchlocal.sidebar-open";

const PROVIDER_KIND_OPTIONS: Array<{ value: BenchLocalProviderKind; label: string }> = [
  { value: "openai_compatible", label: "OpenAI 兼容" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "ollama", label: "Ollama" },
  { value: "llamacpp", label: "llama.cpp" },
  { value: "mlx", label: "MLX" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "pico", label: "Pico" }
];

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; blurb: string; icon: ReactNode }> = [
  { id: "providers", label: "提供商", blurb: "提供商端点与凭据。", icon: <Server size={16} /> },
  { id: "models", label: "模型", blurb: "跨基准包共享的模型注册表。", icon: <Bot size={16} /> },
  { id: "benchPacks", label: "基准包", blurb: "浏览、安装、更新和移除官方基准包。", icon: <PlugZap size={16} /> },
  { id: "verification", label: "验证", blurb: "受管验证器与依赖模式。", icon: <Wrench size={16} /> },
  { id: "agent", label: "Agent 访问", blurb: "面向 AI 智能体的本地 API 与实时事件流。", icon: <Server size={16} /> },
  { id: "advanced", label: "高级", blurb: "存储路径与底层应用配置。", icon: <Cog size={16} /> }
];

const SAMPLING_FIELDS: Array<{
  key: SamplingFieldKey;
  label: string;
  placeholder: string;
  integer?: boolean;
}> = [
  { key: "temperature", label: "温度", placeholder: "留空" },
  { key: "top_p", label: "Top P", placeholder: "留空" },
  { key: "top_k", label: "Top K", placeholder: "留空", integer: true },
  { key: "min_p", label: "Min P", placeholder: "留空" },
  { key: "repetition_penalty", label: "重复惩罚", placeholder: "留空" },
  { key: "presence_penalty", label: "存在惩罚", placeholder: "留空" },
  { key: "request_timeout_seconds", label: "请求超时（秒）", placeholder: "留空", integer: true }
];

function cloneConfig(config: BenchLocalConfig): BenchLocalConfig {
  return structuredClone(config);
}

const FILESYSTEM_CONFIG_KEYS = [
  "run_storage_dir",
  "benchpack_storage_dir",
  "log_storage_dir",
  "cache_dir"
] as const satisfies Array<keyof BenchLocalConfig>;

function reapplyPendingFilesystemDraft(
  baseConfig: BenchLocalConfig,
  currentDraft: BenchLocalConfig,
  persistedConfig: BenchLocalConfig
): BenchLocalConfig {
  const nextConfig = cloneConfig(baseConfig);

  for (const key of FILESYSTEM_CONFIG_KEYS) {
    if (currentDraft[key] !== persistedConfig[key]) {
      nextConfig[key] = currentDraft[key];
    }
  }

  return nextConfig;
}

function providerKindLabel(kind: BenchLocalProviderKind): string {
  return PROVIDER_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function defaultProviderName(kind: BenchLocalProviderKind): string {
  return providerKindLabel(kind);
}

function fallbackProviderDisplayName(providerId: string): string {
  const trimmed = providerId.trim();

  if (/^openai[_-]compatible-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "OpenAI 兼容";
  }

  switch (trimmed) {
    case "openrouter":
      return "OpenRouter";
    case "huggingface":
      return "Hugging Face";
    case "ollama":
      return "Ollama";
    case "llamacpp":
      return "llama.cpp";
    case "mlx":
      return "MLX";
    case "lmstudio":
      return "LM Studio";
    case "pico":
      return "Pico";
    default:
      return trimmed || "未知提供商";
  }
}

function getProviderDisplayName(
  providers: Record<string, BenchLocalProviderConfig>,
  providerId: string
): string {
  return providers[providerId]?.name?.trim() || fallbackProviderDisplayName(providerId);
}

function getModelDisplayIdentifier(model: Pick<BenchLocalModelConfig, "id" | "model">): string {
  return model.model.trim() || model.id.split(":").slice(1).join(":").trim() || model.id;
}

function getModelLabelForMessage(modelId: string, models: ResolvedTabModel[]): string {
  const model = models.find((candidate) => candidate.id === modelId);
  return model?.displayLabel ?? model?.label ?? (modelId.split(":").slice(1).join(":").trim() || modelId);
}

function formatShareScore(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function formatShareDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "未知日期";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatCompactHistoryDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "已保存的运行";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function sanitizeShareFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "benchlocal-result";
}

function countShareStatuses(results: ScenarioResult[], scenarioCount: number): ShareCardStatusCounts {
  const counts: ShareCardStatusCounts = {
    pass: 0,
    partial: 0,
    fail: 0
  };

  for (const result of results) {
    if (isProviderErrorResult(result)) {
      counts.fail += 1;
    } else if (result.status === "pass") {
      counts.pass += 1;
    } else if (result.status === "partial") {
      counts.partial += 1;
    } else {
      counts.fail += 1;
    }
  }

  counts.fail += Math.max(0, scenarioCount - results.length);
  return counts;
}

function describeShareOutcome(counts: ShareCardStatusCounts, scenarioCount: number): string {
  if (scenarioCount > 0 && counts.pass === scenarioCount) {
    return "全部通过";
  }

  if (counts.fail > 0) {
    return `${counts.fail} 项失败`;
  }

  if (counts.partial > 0) {
    return `${counts.partial} 项部分通过`;
  }

  return "已完成";
}

function buildResultShareCardData({
  runSummary,
  model,
  providers,
  score,
  runModeLabel
}: {
  runSummary: BenchPackRunSummary;
  model: ResolvedTabModel | undefined;
  providers: Record<string, BenchLocalProviderConfig>;
  score: BenchPackRunSummary["scores"][string];
  runModeLabel: string;
}): ResultShareCardData {
  const modelId = model?.id ?? "model";
  const results = runSummary.resultsByModel[modelId] ?? [];
  const scenarioCount = runSummary.scenarioCount;
  const statusCounts = countShareStatuses(results, scenarioCount);
  const providerName = model ? getProviderDisplayName(providers, model.provider) : "未知提供商";
  const modelIdentifier = model ? getModelDisplayIdentifier(model) : modelId;
  const startedAt = new Date(runSummary.startedAt);
  const completedAt = new Date(runSummary.completedAt);
  const durationLabel =
    Number.isNaN(startedAt.valueOf()) || Number.isNaN(completedAt.valueOf())
      ? null
      : formatDurationMs(Math.max(0, completedAt.valueOf() - startedAt.valueOf()));
  const benchPackName = runSummary.benchPackName || runSummary.benchPackId;
  const modelLabel = model?.displayLabel ?? model?.label ?? modelIdentifier;

  return {
    benchPackName,
    modelLabel,
    providerName,
    modelIdentifier,
    scoreValue: formatShareScore(score.totalScore),
    scenarioCount,
    completedCount: results.length,
    statusCounts,
    categories: score.categories.map((category) => ({
      id: category.id,
      label: category.label,
      score: formatShareScore(category.score)
    })),
    runModeLabel,
    runsPerTest: normalizeRunsPerTest(runSummary.runsPerTest),
    runDateLabel: formatShareDate(runSummary.startedAt),
    durationLabel,
    footerLabel: "benchlocal.com",
    outcomeLabel: describeShareOutcome(statusCounts, scenarioCount),
    fileName: `${sanitizeShareFileName(`benchlocal-${benchPackName}-${modelLabel}`)}.png`
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string
): void {
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  lineWidth = 1
): void {
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

let shareCardLogoImagePromise: Promise<HTMLImageElement | null> | null = null;
let shareCardFontsPromise: Promise<void> | null = null;

function loadShareCardLogoImage(): Promise<HTMLImageElement | null> {
  shareCardLogoImagePromise ??= new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = benchlocalIconOutline;

    if (image.complete && image.naturalWidth > 0) {
      finish(image);
    }
  });

  return shareCardLogoImagePromise;
}

function loadShareCardFonts(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve();
  }

  shareCardFontsPromise ??= Promise.all([
    {
      family: SHARE_CARD_DISPLAY_FONT_FAMILY,
      url: shareCardDisplayFontUrl
    },
    {
      family: SHARE_CARD_MONO_FONT_FAMILY,
      url: shareCardMonoFontUrl
    }
  ].map(async ({ family, url }) => {
    if (document.fonts.check(`16px "${family}"`)) {
      return;
    }

    const font = new FontFace(family, `url("${url}") format("woff2")`, {
      display: "block",
      style: "normal",
      weight: "100 900"
    });
    (document.fonts as FontFaceSet & { add(font: FontFace): void }).add(await font.load());
  })).then(() => document.fonts.ready).then(() => undefined);

  return shareCardFontsPromise;
}

function drawShareCardLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  logoImage?: HTMLImageElement | null
): void {
  fillRoundedRect(ctx, x, y, size, size, 12, "#0f2a3d");

  if (logoImage) {
    ctx.save();
    drawRoundedRect(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.drawImage(logoImage, x, y, size, size);
    ctx.restore();
  } else {
    strokeRoundedRect(ctx, x + 13, y + 13, size - 26, 7, 3, "#40a9ff", 2.5);
    strokeRoundedRect(ctx, x + 13, y + 27, size - 26, 7, 3, "#40a9ff", 2.5);
  }

  strokeRoundedRect(ctx, x, y, size, size, 12, "rgba(255, 211, 106, 0.22)", 1);
}

function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const suffix = "...";
  let next = text;

  while (next.length > 0 && ctx.measureText(`${next}${suffix}`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return next ? `${next}${suffix}` : suffix;
}

function getWrappedCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let remaining = text.trim().replace(/\s+/gu, " ");

  while (remaining && lines.length < maxLines) {
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining);
      break;
    }

    if (lines.length === maxLines - 1) {
      lines.push(truncateCanvasText(ctx, remaining, maxWidth));
      break;
    }

    let low = 1;
    let high = remaining.length;
    let fit = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = remaining.slice(0, mid);

      if (ctx.measureText(candidate).width <= maxWidth) {
        fit = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const slice = remaining.slice(0, fit);
    const breakMatches = [...slice.matchAll(/[ /_\-:.]/gu)];
    const lastBreak = breakMatches.at(-1)?.index;
    const breakIndex = lastBreak !== undefined && lastBreak > fit * 0.42 ? lastBreak + 1 : fit;
    lines.push(remaining.slice(0, breakIndex).trimEnd());
    remaining = remaining.slice(breakIndex).trimStart();
  }

  return lines;
}

function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const visibleLines = getWrappedCanvasTextLines(ctx, text, maxWidth, maxLines);

  visibleLines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return y + visibleLines.length * lineHeight;
}

function drawShareCardCanvas(
  canvas: HTMLCanvasElement,
  data: ResultShareCardData,
  logoImage?: HTMLImageElement | null
): void {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  canvas.width = SHARE_CARD_PIXEL_WIDTH;
  canvas.height = SHARE_CARD_PIXEL_HEIGHT;
  ctx.setTransform(SHARE_CARD_EXPORT_SCALE, 0, 0, SHARE_CARD_EXPORT_SCALE, 0, 0);

  const displayFont = `"${SHARE_CARD_DISPLAY_FONT_FAMILY}", sans-serif`;
  const monoFont = `"${SHARE_CARD_MONO_FONT_FAMILY}", monospace`;
  const palette = {
    bg: "#030303",
    panel: "#101010",
    panelStrong: "#171717",
    border: "#333333",
    text: "#f7f7f3",
    muted: "#b8b8ae",
    faint: "#77776f",
    accent: "#f4f4ec",
    accentStrong: "#ffffff",
    pass: "#47d16c",
    partial: "#cfcfc7",
    fail: "#ef6262"
  };

  const backgroundGradient = ctx.createRadialGradient(940, 70, 18, 610, 280, 820);
  backgroundGradient.addColorStop(0, "#6a6a6a");
  backgroundGradient.addColorStop(0.16, "#343434");
  backgroundGradient.addColorStop(0.42, "#111111");
  backgroundGradient.addColorStop(1, palette.bg);
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  const upperGlow = ctx.createRadialGradient(846, 88, 8, 846, 88, 410);
  upperGlow.addColorStop(0, "rgba(255, 255, 255, 0.18)");
  upperGlow.addColorStop(0.36, "rgba(255, 255, 255, 0.055)");
  upperGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = upperGlow;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  const lowerGlow = ctx.createRadialGradient(278, 542, 18, 278, 542, 540);
  lowerGlow.addColorStop(0, "rgba(255, 255, 255, 0.10)");
  lowerGlow.addColorStop(0.46, "rgba(255, 255, 255, 0.024)");
  lowerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  const panelX = 36;
  const panelY = 36;
  const panelWidth = SHARE_CARD_WIDTH - 72;
  const panelHeight = SHARE_CARD_HEIGHT - 72;
  ctx.save();
  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
  ctx.clip();
  const panelGradient = ctx.createRadialGradient(880, 76, 80, 540, 324, 760);
  panelGradient.addColorStop(0, "#3a3a3a");
  panelGradient.addColorStop(0.22, "#1f1f1f");
  panelGradient.addColorStop(0.52, palette.panel);
  panelGradient.addColorStop(1, "#070707");
  ctx.fillStyle = panelGradient;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;
  for (let x = panelX + 58; x < panelX + panelWidth; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, panelY);
    ctx.lineTo(x, panelY + panelHeight);
    ctx.stroke();
  }
  for (let y = panelY + 58; y < panelY + panelHeight; y += 64) {
    ctx.beginPath();
    ctx.moveTo(panelX, y);
    ctx.lineTo(panelX + panelWidth, y);
    ctx.stroke();
  }
  ctx.restore();
  strokeRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 34, "rgba(255, 255, 255, 0.26)", 1.5);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(36, 146, 7, 400);
  ctx.beginPath();
  ctx.moveTo(36, 546);
  ctx.lineTo(SHARE_CARD_WIDTH - 36, 546);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 0.55;
  ctx.stroke();

  drawShareCardLogo(ctx, 78, 65, 44, logoImage);

  ctx.font = `800 34px ${displayFont}`;
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "middle";
  ctx.fillText("BenchLocal", 136, 87);
  ctx.textBaseline = "alphabetic";

  ctx.font = `900 22px ${monoFont}`;
  const packLabel = truncateCanvasText(ctx, data.benchPackName.toUpperCase(), 360);
  const packWidth = Math.max(190, ctx.measureText(packLabel).width + 58);
  const packX = SHARE_CARD_WIDTH - 78 - packWidth;
  fillRoundedRect(ctx, packX, 62, packWidth, 48, 24, palette.panelStrong);
  strokeRoundedRect(ctx, packX, 62, packWidth, 48, 24, palette.border, 1);
  ctx.fillStyle = palette.accentStrong;
  ctx.textAlign = "center";
  ctx.fillText(packLabel, packX + packWidth / 2, 94);
  ctx.textAlign = "left";

  ctx.font = `900 70px ${displayFont}`;
  ctx.fillStyle = palette.text;
  drawWrappedCanvasText(ctx, data.modelLabel, 78, 205, 970, 76, 2);

  fillRoundedRect(ctx, 78, 356, 350, 164, 26, palette.panelStrong);
  strokeRoundedRect(ctx, 78, 356, 350, 164, 26, "rgba(255, 255, 255, 0.18)", 1.5);
  ctx.font = `800 18px ${monoFont}`;
  ctx.fillStyle = palette.accentStrong;
  ctx.fillText("SCORE", 110, 394);
  ctx.font = `760 24px ${displayFont}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(`${data.completedCount}/${data.scenarioCount}`, 110, 430);
  const scorePanelTop = 356;
  const scorePanelHeight = 164;
  const scoreTextMaxWidth = 188;
  let scoreFontSize = 142;
  let scoreMetrics: TextMetrics;
  let scoreTextAscent = 0;
  let scoreTextDescent = 0;
  do {
    ctx.font = `900 ${scoreFontSize}px ${displayFont}`;
    scoreMetrics = ctx.measureText(data.scoreValue);
    scoreTextAscent = scoreMetrics.actualBoundingBoxAscent || scoreFontSize * 0.72;
    scoreTextDescent = scoreMetrics.actualBoundingBoxDescent || scoreFontSize * 0.22;
    if (scoreMetrics.width <= scoreTextMaxWidth && scoreTextAscent + scoreTextDescent <= scorePanelHeight - 26) {
      break;
    }
    scoreFontSize -= 2;
  } while (scoreFontSize > 90);
  const scoreTextCenterY = scorePanelTop + scorePanelHeight / 2;
  const scoreBaselineY = scoreTextCenterY + (scoreTextAscent - scoreTextDescent) / 2;
  ctx.fillStyle = palette.text;
  ctx.textAlign = "right";
  ctx.fillText(data.scoreValue, 396, scoreBaselineY);
  ctx.textAlign = "left";

  const segments = [
    { label: "通过", count: data.statusCounts.pass, color: palette.pass },
    { label: "部分", count: data.statusCounts.partial, color: palette.partial },
    { label: "失败", count: data.statusCounts.fail, color: palette.fail }
  ];
  const barX = 480;
  const barY = 356;
  const barWidth = 636;
  const barHeight = 20;
  fillRoundedRect(ctx, barX, barY, barWidth, barHeight, 10, "#242424");

  let offset = 0;
  const total = Math.max(1, data.scenarioCount);
  for (const segment of segments) {
    if (segment.count <= 0) {
      continue;
    }

    const segmentWidth = Math.max(segment.count > 0 ? 5 : 0, Math.round((segment.count / total) * barWidth));
    const visibleWidth = Math.max(0, Math.min(segmentWidth, barWidth - offset));
    ctx.fillStyle = segment.color;
    ctx.fillRect(barX + offset, barY, visibleWidth, barHeight);
    offset += segmentWidth;
  }

  strokeRoundedRect(ctx, barX, barY, barWidth, barHeight, 10, "rgba(255, 255, 255, 0.12)", 1);

  ctx.font = `760 18px ${displayFont}`;
  let legendX = barX;
  for (const segment of segments) {
    const label = `${segment.label} ${segment.count}`;
    const labelWidth = ctx.measureText(label).width;
    fillRoundedRect(ctx, legendX, 394, 14, 14, 4, segment.color);
    ctx.fillStyle = palette.muted;
    ctx.fillText(label, legendX + 22, 408);
    legendX += labelWidth + 52;
  }

  ctx.font = `800 17px ${monoFont}`;
  ctx.fillStyle = palette.faint;
  ctx.fillText("分类得分明细", 480, 462);

  ctx.font = `760 20px ${displayFont}`;
  const chipStartX = 480;
  const chipAreaWidth = 636;
  const chipRows = [472, 508];
  const chipGap = 9;
  const chipHeight = 30;
  const chipPaddingX = 28;
  const chipMinWidth = 78;
  const chipMaxWidth = 220;
  const measureCategoryChipWidth = (label: string) =>
    Math.min(chipMaxWidth, Math.max(chipMinWidth, Math.ceil(ctx.measureText(label).width) + chipPaddingX));
  const layoutCategoryChips = (chips: Array<{ label: string; overflow: boolean }>) => {
    const layouts: Array<{ label: string; overflow: boolean; x: number; y: number; width: number }> = [];
    let row = 0;
    let x = chipStartX;

    for (const chip of chips) {
      const width = measureCategoryChipWidth(chip.label);

      if (x > chipStartX && x + width > chipStartX + chipAreaWidth) {
        row += 1;
        x = chipStartX;
      }

      if (row >= chipRows.length) {
        return null;
      }

      layouts.push({
        ...chip,
        x,
        y: chipRows[row],
        width
      });
      x += width + chipGap;
    }

    return layouts;
  };

  let visibleCategoryCount = data.categories.length;
  let categoryChipLayouts: ReturnType<typeof layoutCategoryChips> = null;

  while (visibleCategoryCount >= 0 && !categoryChipLayouts) {
    const categoryChips = data.categories.slice(0, visibleCategoryCount).map((category) => ({
      label: `${category.id}: ${category.score}`,
      overflow: false
    }));

    if (visibleCategoryCount < data.categories.length) {
      categoryChips.push({
        label: `+${data.categories.length - visibleCategoryCount} 更多`,
        overflow: true
      });
    }

    categoryChipLayouts = layoutCategoryChips(categoryChips);
    visibleCategoryCount -= 1;
  }

  const drawCategoryChip = (label: string, x: number, y: number, width: number, overflow = false) => {
    fillRoundedRect(ctx, x, y, width, chipHeight, 15, overflow ? "#202020" : "#181818");
    strokeRoundedRect(ctx, x, y, width, chipHeight, 15, "rgba(255, 255, 255, 0.14)", 1);
    ctx.fillStyle = overflow ? palette.accentStrong : palette.text;
    ctx.fillText(label, x + 14, y + 21);
  };

  categoryChipLayouts?.forEach((chip) => {
    const label = truncateCanvasText(ctx, chip.label, chip.width - chipPaddingX);
    drawCategoryChip(label, chip.x, chip.y, chip.width, chip.overflow);
  });

  ctx.font = `700 18px ${displayFont}`;
  ctx.fillStyle = palette.muted;
  const meta = [
    data.runModeLabel,
    `${data.runsPerTest} 次运行`,
    data.runDateLabel,
    data.durationLabel ? `共 ${data.durationLabel}` : null
  ].filter(Boolean).join(" · ");
  ctx.textBaseline = "middle";
  ctx.fillText(truncateCanvasText(ctx, meta, 760), 78, 570);

  ctx.font = `800 18px ${monoFont}`;
  ctx.fillStyle = palette.accentStrong;
  ctx.textAlign = "right";
  ctx.fillText(data.footerLabel, SHARE_CARD_WIDTH - 78, 570);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

async function createShareCardBlob(data: ResultShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const [, logoImage] = await Promise.all([loadShareCardFonts(), loadShareCardLogoImage()]);
  drawShareCardCanvas(canvas, data, logoImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法渲染分享卡片。"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function defaultProviderApiKeyPlaceholder(kind: BenchLocalProviderKind): string {
  switch (kind) {
    case "huggingface":
      return "hf_...";
    default:
      return "sk-or-v1-...";
  }
}

function benchPackMutationLabel(mutation: BenchPackMutationState): string {
  switch (mutation.action) {
    case "install":
      return mutation.phase === "complete" ? "已安装" : "安装中...";
    case "update":
      return mutation.phase === "complete" ? "已更新" : "更新中...";
    case "uninstall":
      return mutation.phase === "complete" ? "已移除" : "移除中...";
    default:
      return mutation.message;
  }
}

function defaultProviderBaseUrl(kind: BenchLocalProviderKind): string {
  switch (kind) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "huggingface":
      return "https://router.huggingface.co/v1";
    case "ollama":
      return "http://127.0.0.1:11434/v1";
    case "llamacpp":
      return "http://127.0.0.1:8080/v1";
    case "mlx":
      return "http://127.0.0.1:8082/v1";
    case "lmstudio":
      return "http://127.0.0.1:1234/v1";
    case "pico":
      return "http://127.0.0.1:7426/v1";
    case "openai_compatible":
    default:
      return "https://api.example.com/v1";
  }
}

function createEmptyProvider(): ProviderFormState {
  return {
    id: `openai_compatible-${crypto.randomUUID()}`,
    kind: "openai_compatible",
    name: "",
    enabled: true,
    base_url: "https://api.example.com/v1",
    api_key: ""
  };
}

function createEmptyModel(providerId = "openrouter"): ModelFormState {
  return {
    id: "",
    provider: providerId,
    model: "",
    label: "",
    group: "primary",
    enabled: true
  };
}

function providerSupportsModelDiscovery(provider?: BenchLocalProviderConfig | null): boolean {
  return provider?.kind === "openrouter" || provider?.kind === "huggingface" || provider?.kind === "openai_compatible";
}

function defaultModelLabel(
  providerName: string,
  modelId: string,
  discoveredName?: string
): string {
  const trimmedDiscoveredName = discoveredName?.trim();

  if (trimmedDiscoveredName) {
    return trimmedDiscoveredName;
  }

  return `${modelId.trim()}（${providerName}）`.trim();
}

function createSamplingForm(input?: GenerationRequest): SamplingFormState {
  return {
    temperature: input?.temperature?.toString() ?? "",
    top_p: input?.top_p?.toString() ?? "",
    top_k: input?.top_k?.toString() ?? "",
    min_p: input?.min_p?.toString() ?? "",
    repetition_penalty: input?.repetition_penalty?.toString() ?? "",
    presence_penalty: input?.presence_penalty?.toString() ?? "",
    request_timeout_seconds: input?.request_timeout_seconds?.toString() ?? ""
  };
}

function parseSamplingForm(form: SamplingFormState): { value?: GenerationRequest; error?: string } {
  const result: GenerationRequest = {};

  for (const field of SAMPLING_FIELDS) {
    const rawValue = form[field.key].trim();

    if (!rawValue) {
      continue;
    }

    const parsed = field.integer ? Number.parseInt(rawValue, 10) : Number(rawValue);

    if (!Number.isFinite(parsed)) {
      return { error: `${field.label} 必须是有效数字。` };
    }

    if (field.integer && parsed <= 0) {
      return { error: `${field.label} 必须大于零。` };
    }

    result[field.key] = parsed;
  }

  return { value: result };
}

function isWebPackBridgeRequest(value: unknown): value is WebPackBridgeRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WebPackBridgeRequest>;
  return (
    candidate.source === BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE &&
    candidate.bridgeVersion === BENCHLOCAL_WEB_BRIDGE_VERSION &&
    typeof candidate.requestId === "string" &&
    typeof candidate.method === "string"
  );
}

function getOriginFromUrl(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderForm(id: string, provider: BenchLocalProviderConfig): ProviderFormState {
  return {
    id,
    kind: provider.kind,
    name: provider.name,
    enabled: provider.enabled,
    base_url: provider.base_url,
    api_key: provider.api_key ?? ""
  };
}

function toModelForm(model: BenchLocalModelConfig): ModelFormState {
  return {
    id: model.id,
    provider: model.provider,
    model: model.model,
    label: model.label,
    group: model.group,
    enabled: model.enabled
  };
}

function buildModelConfig(
  form: ModelFormState,
  providers: Record<string, BenchLocalProviderConfig>
): BenchLocalModelConfig {
  const providerLabel = getProviderDisplayName(providers, form.provider.trim());

  return {
    id: form.id.trim() || `${form.provider}:${form.model}`.trim(),
    provider: form.provider.trim(),
    model: form.model.trim(),
    label: form.label.trim() || `${form.model.trim()}（${providerLabel}）`,
    group: form.group.trim() || "primary",
    enabled: form.enabled
  };
}

function createCopyLabel(label: string, existingLabels: string[]): string {
  const base = `${label.trim() || "未命名"} 副本`;
  const existing = new Set(existingLabels.map((candidate) => candidate.trim()));

  if (!existing.has(base)) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

function createUniqueProviderId(
  kind: BenchLocalProviderKind,
  providers: Record<string, BenchLocalProviderConfig>
): string {
  let id = "";

  do {
    id = `${kind}-${crypto.randomUUID()}`;
  } while (providers[id]);

  return id;
}

function createUniqueModelId(model: BenchLocalModelConfig, models: BenchLocalModelConfig[]): string {
  const existing = new Set(models.map((candidate) => candidate.id));
  const modelPart = model.model.trim() || model.id.split(":").slice(1).join(":").trim() || "model";
  let id = "";

  do {
    id = `${model.provider}:${modelPart}:copy-${crypto.randomUUID()}`;
  } while (existing.has(id));

  return id;
}

function createWorkspaceName(existingCount: number): string {
  return existingCount === 0 ? "我的工作区" : `工作区 ${existingCount + 1}`;
}

function createTabTitle(benchPackId: string, inspections: BenchPackInspection[]): string {
  return inspections.find((inspection) => inspection.id === benchPackId)?.manifest?.name ?? benchPackId;
}

function normalizeTabModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[]
): BenchLocalWorkspaceTabModelSelection[] {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const modelId = selection.modelId.trim();

      if (!modelId || seen.has(modelId)) {
        return false;
      }

      seen.add(modelId);
      return true;
    })
    .map((selection) => ({
      modelId: selection.modelId.trim(),
      alias: selection.alias?.trim() || undefined
    }));
}

function normalizeEditableTabModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[]
): BenchLocalWorkspaceTabModelSelection[] {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const modelId = selection.modelId.trim();

      if (!modelId || seen.has(modelId)) {
        return false;
      }

      seen.add(modelId);
      return true;
    })
    .map((selection) => ({
      modelId: selection.modelId.trim(),
      alias: selection.alias
    }));
}

function getTableScrollbarThumbWidth(metrics: {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}): number {
  if (metrics.scrollWidth <= 0 || metrics.clientWidth <= 0) {
    return 0;
  }

  const ratio = metrics.clientWidth / metrics.scrollWidth;
  return Math.max(56, Math.round(metrics.clientWidth * ratio));
}

function SettingsTableShell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const scrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0
  });

  const hasHorizontalOverflow = scrollMetrics.scrollWidth > scrollMetrics.clientWidth + 1;
  const scrollbarThumbWidth = hasHorizontalOverflow ? getTableScrollbarThumbWidth(scrollMetrics) : 0;
  const scrollbarThumbOffset =
    hasHorizontalOverflow && scrollbarTrackRef.current
      ? ((scrollMetrics.scrollLeft / Math.max(1, scrollMetrics.scrollWidth - scrollMetrics.clientWidth)) *
          Math.max(0, scrollbarTrackRef.current.clientWidth - scrollbarThumbWidth))
      : 0;
  const wrapClassName = [
    "settings-list-table-wrap",
    className,
    hasHorizontalOverflow ? "has-sticky-last-column-shadow" : ""
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const updateMetrics = () => {
      setScrollMetrics({
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        scrollLeft: viewport.scrollLeft
      });
    };

    const syncFromViewport = () => {
      updateMetrics();
    };

    updateMetrics();
    viewport.addEventListener("scroll", syncFromViewport);
    window.addEventListener("resize", updateMetrics);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateMetrics();
          })
        : null;

    resizeObserver?.observe(viewport);

    if (viewport.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", syncFromViewport);
      window.removeEventListener("resize", updateMetrics);
      resizeObserver?.disconnect();
    };
  }, [children]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const viewport = viewportRef.current;
      const track = scrollbarTrackRef.current;
      const drag = scrollbarDragRef.current;

      if (!viewport || !track || !drag) {
        return;
      }

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxThumbOffset = Math.max(1, track.clientWidth - getTableScrollbarThumbWidth(scrollMetrics));
      const deltaX = event.clientX - drag.startX;
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, drag.startScrollLeft + (deltaX / maxThumbOffset) * maxScrollLeft)
      );
      viewport.scrollLeft = nextScrollLeft;
    };

    const handleUp = () => {
      scrollbarDragRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [scrollMetrics]);

  return (
    <div className={wrapClassName}>
      <div ref={viewportRef} className="settings-table-scroll" role="region" aria-label="可滚动的设置表格" tabIndex={0}>
        {children}
      </div>
      {hasHorizontalOverflow ? (
        <div
          ref={scrollbarTrackRef}
          className="table-scrollbar"
          aria-hidden="true"
          onMouseDown={(event) => {
            const viewport = viewportRef.current;
            const track = scrollbarTrackRef.current;

            if (!viewport || !track) {
              return;
            }

            const rect = track.getBoundingClientRect();
            const clickX = event.clientX - rect.left;

            if (clickX >= scrollbarThumbOffset && clickX <= scrollbarThumbOffset + scrollbarThumbWidth) {
              return;
            }

            const nextOffset = Math.max(
              0,
              Math.min(track.clientWidth - scrollbarThumbWidth, clickX - scrollbarThumbWidth / 2)
            );
            const nextScrollLeft =
              (nextOffset / Math.max(1, track.clientWidth - scrollbarThumbWidth)) *
              Math.max(0, viewport.scrollWidth - viewport.clientWidth);
            viewport.scrollLeft = nextScrollLeft;
          }}
        >
          <div
            className="table-scrollbar-thumb"
            style={{
              width: `${scrollbarThumbWidth}px`,
              transform: `translateX(${scrollbarThumbOffset}px)`
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              const viewport = viewportRef.current;

              if (!viewport) {
                return;
              }

              scrollbarDragRef.current = {
                startX: event.clientX,
                startScrollLeft: viewport.scrollLeft
              };
              document.body.style.userSelect = "none";
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function resolveTabModels(tab: BenchLocalWorkspaceTab | null, models: BenchLocalModelConfig[]): ResolvedTabModel[] {
  const enabledModels = models.filter((model) => model.enabled);
  const modelMap = new Map(enabledModels.map((model) => [model.id, model]));

  return normalizeTabModelSelections(tab?.modelSelections ?? []).reduce<ResolvedTabModel[]>((resolved, selection) => {
      const model = modelMap.get(selection.modelId);

      if (!model) {
        return resolved;
      }

      resolved.push({
        ...model,
        alias: selection.alias,
        displayLabel: selection.alias || model.label
      });

      return resolved;
    }, []);
}

function resolveHistoryModels(
  runSummary: BenchPackRunSummary | null,
  models: BenchLocalModelConfig[]
): ResolvedTabModel[] {
  if (!runSummary) {
    return [];
  }

  const modelMap = new Map(models.map((model) => [model.id, model]));
  const runStartedEvent = runSummary.events.find(
    (event): event is Extract<ProgressEvent, { type: "run_started" }> => event.type === "run_started"
  );
  const orderedModelIds = [
    ...(runStartedEvent?.models.map((model) => model.id) ?? []),
    ...Object.keys(runSummary.resultsByModel)
  ].filter((modelId, index, all) => modelId && all.indexOf(modelId) === index);

  return orderedModelIds.map((modelId) => {
    const currentModel = modelMap.get(modelId);
    const historicalLabel = runStartedEvent?.models.find((model) => model.id === modelId)?.label;
    const label = currentModel?.label ?? historicalLabel ?? modelId;

    return {
      id: modelId,
      provider: currentModel?.provider ?? "history",
      model: currentModel?.model ?? modelId,
      label,
      group: currentModel?.group ?? "history",
      enabled: currentModel?.enabled ?? false,
      displayLabel: label
    };
  });
}

function countStoredRunResults(summary: BenchPackRunSummary | null): number {
  if (!summary) {
    return 0;
  }

  return Object.values(summary.resultsByModel).reduce((total, results) => total + results.length, 0);
}

function isRunSummaryComplete(summary: BenchPackRunSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return countStoredRunResults(summary) >= summary.modelCount * summary.scenarioCount;
}

function buildHistoryModelSelections(
  runSummary: BenchPackRunSummary | null,
  models: BenchLocalModelConfig[]
): BenchLocalWorkspaceTabModelSelection[] {
  return resolveHistoryModels(runSummary, models).map((model) => ({
    modelId: model.id,
    alias: model.displayLabel !== model.label ? model.displayLabel : undefined
  }));
}

type ReplayCell = {
  modelId: string;
  scenarioId: string;
  result: ScenarioResult;
};

type RetryScenarioCell = {
  modelId: string;
  scenarioId: string;
};

function buildReplayGroups(
  summary: BenchPackRunSummary,
  scenarios: ScenarioMeta[],
  modelIds: string[]
): ReplayCell[][] {
  const scenarioOrder = scenarios.map((scenario) => scenario.id);
  const resultMap = new Map<string, ScenarioResult>();

  for (const [modelId, results] of Object.entries(summary.resultsByModel)) {
    for (const result of results) {
      resultMap.set(`${modelId}::${result.scenarioId}`, result);
    }
  }

  const singletonCellsByScenarioThenModel = scenarioOrder.flatMap((scenarioId) =>
    modelIds.flatMap((modelId) => {
      const result = resultMap.get(`${modelId}::${scenarioId}`);
      return result ? [[{ modelId, scenarioId, result } satisfies ReplayCell]] : [];
    })
  );

  switch (summary.executionMode ?? "parallel_by_test_case") {
    case "serial":
      return singletonCellsByScenarioThenModel;
    case "serial_by_model":
      return modelIds.flatMap((modelId) =>
        scenarioOrder.flatMap((scenarioId) => {
          const result = resultMap.get(`${modelId}::${scenarioId}`);
          return result ? [[{ modelId, scenarioId, result } satisfies ReplayCell]] : [];
        })
      );
    case "parallel_by_test_case":
      return scenarioOrder
        .map((scenarioId) =>
          modelIds.flatMap((modelId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
        .filter((group) => group.length > 0);
    case "parallel_by_model":
      return modelIds
        .map((modelId) =>
          scenarioOrder.flatMap((scenarioId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
        .filter((group) => group.length > 0);
    case "full_parallel":
      return [
        scenarioOrder.flatMap((scenarioId) =>
          modelIds.flatMap((modelId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
      ].filter((group) => group.length > 0);
    default:
      return singletonCellsByScenarioThenModel;
  }
}

function groupRetryCellsForExecutionMode(
  cells: RetryScenarioCell[],
  executionMode: BenchLocalExecutionMode,
  scenarios: ScenarioMeta[],
  models: ResolvedTabModel[]
): RetryScenarioCell[][] {
  const cellSet = new Set(cells.map((cell) => getCellKey(cell.modelId, cell.scenarioId)));
  const scenarioOrder = scenarios.map((scenario) => scenario.id);
  const modelOrder = models.map((model) => model.id);
  const cellFor = (modelId: string, scenarioId: string): RetryScenarioCell | null =>
    cellSet.has(getCellKey(modelId, scenarioId)) ? { modelId, scenarioId } : null;
  const singletonByScenarioThenModel = scenarioOrder.flatMap((scenarioId) =>
    modelOrder.flatMap((modelId) => {
      const cell = cellFor(modelId, scenarioId);
      return cell ? [[cell]] : [];
    })
  );

  switch (executionMode) {
    case "serial":
      return singletonByScenarioThenModel;
    case "serial_by_model":
      return modelOrder.flatMap((modelId) =>
        scenarioOrder.flatMap((scenarioId) => {
          const cell = cellFor(modelId, scenarioId);
          return cell ? [[cell]] : [];
        })
      );
    case "parallel_by_test_case":
      return scenarioOrder
        .map((scenarioId) => modelOrder.flatMap((modelId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "parallel_by_model":
      return modelOrder
        .map((modelId) => scenarioOrder.flatMap((scenarioId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "full_parallel":
      return [singletonByScenarioThenModel.flat()].filter((group) => group.length > 0);
    default:
      return singletonByScenarioThenModel;
  }
}

function upsertTabModelAlias(
  tab: BenchLocalWorkspaceTab,
  models: BenchLocalModelConfig[],
  modelId: string,
  alias: string
): BenchLocalWorkspaceTabModelSelection[] {
  const normalized = normalizeTabModelSelections(tab.modelSelections);
  const nextAlias = alias.trim() || undefined;
  let found = false;

  const next = normalized.map((selection) => {
    if (selection.modelId !== modelId) {
      return selection;
    }

    found = true;
    return {
      ...selection,
      alias: nextAlias
    };
  });

  if (!found) {
    next.push({
      modelId,
      alias: nextAlias
    });
  }

  return next;
}

function pushScenarioResult(
  current: Record<string, ScenarioResult[]>,
  modelId: string,
  result: ScenarioResult
): Record<string, ScenarioResult[]> {
  return {
    ...current,
    [modelId]: [...(current[modelId] ?? []).filter((candidate) => candidate.scenarioId !== result.scenarioId), result]
  };
}

function updateLiveRunState(
  current: LiveRunState | undefined,
  event: ProgressEvent
): LiveRunState {
  const next: LiveRunState = current ?? {
    events: [],
    resultsByModel: {},
    activeCellKeys: []
  };

  const eventKey =
    "modelId" in event && "scenarioId" in event ? `${event.modelId}::${event.scenarioId}` : null;

  next.events = [...next.events, event];

  if (event.type === "run_started") {
    next.runId = event.runId;
  }

  if (event.type === "model_progress" && eventKey && !next.activeCellKeys.includes(eventKey)) {
    next.activeCellKeys = [...next.activeCellKeys, eventKey];
  }

  if (event.type === "scenario_result" && eventKey) {
    next.resultsByModel = pushScenarioResult(next.resultsByModel, event.modelId, event.result);
    next.activeCellKeys = next.activeCellKeys.filter((key) => key !== eventKey);
  }

  if (event.type === "run_finished" || event.type === "run_error") {
    next.activeCellKeys = [];
  }

  return next;
}

function detailModalKey(detail: Pick<DetailModalState, "tabId" | "modelId" | "scenarioId">): string {
  return `${detail.tabId}::${detail.modelId}::${detail.scenarioId}`;
}

function getCellKey(modelId: string, scenarioId: string): string {
  return `${modelId}::${scenarioId}`;
}

function isProviderErrorResult(result: ScenarioResult | undefined): boolean {
  return result?.errorType === "provider_error";
}

function isRunCancellationMessage(message: string | undefined): boolean {
  return /run cancelled/i.test(message ?? "");
}

const REGISTRY_UNAVAILABLE_MESSAGE =
  "官方基准包注册表当前不可用。已安装的基准包仍可使用。";

function formatDesktopErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message.replace(/^Error invoking remote method '[^']+':\s*/u, "").trim();
}

function isRegistryConnectivityError(error: unknown): boolean {
  const message = formatDesktopErrorMessage(error);
  return /fetch failed/i.test(message);
}

function formatRegistryWarning(error: unknown): string {
  const message = formatDesktopErrorMessage(error);

  if (!message) {
    return REGISTRY_UNAVAILABLE_MESSAGE;
  }

  if (!message || /fetch failed/i.test(message)) {
    return REGISTRY_UNAVAILABLE_MESSAGE;
  }

  return `${REGISTRY_UNAVAILABLE_MESSAGE} ${message}`;
}

function formatRegistryMutationError(
  action: "install" | "update",
  benchPackId: string,
  error: unknown
): string {
  if (isRegistryConnectivityError(error)) {
    return `无法${action === "install" ? "安装" : "更新"} ${benchPackId}。官方基准包注册表当前不可用。`;
  }

  return formatDesktopErrorMessage(error) || `无法${action === "install" ? "安装" : "更新"} ${benchPackId}。`;
}

function getRequiredVerifierRunBlocker(
  manifest: BenchPackManifest | undefined,
  benchPackConfig: BenchLocalConfig["benchpacks"][string] | undefined,
  verifierStatus: BenchPackVerifierStatus | undefined
): BenchPackRunBlocker | null {
  const requiredVerifierSpecs = (manifest?.verifiers ?? manifest?.sidecars ?? []).filter((spec) => spec.required);

  if (requiredVerifierSpecs.length === 0) {
    return null;
  }

  if (verifierStatus?.docker.state === "not_installed") {
    return {
      title: "需要 Docker",
      message: "该基准包需要本地验证器运行时。请先安装 Docker Desktop 再开始测试运行。",
      actionLabel: "打开验证设置"
    };
  }

  if (verifierStatus?.docker.state === "not_running") {
    return {
      title: "Docker 未运行",
      message: "该基准包需要本地验证器运行时。请启动 Docker Desktop 后重新运行。",
      actionLabel: "打开验证设置"
    };
  }

  for (const spec of requiredVerifierSpecs) {
    const runtimeConfig = benchPackConfig?.verifiers?.[spec.id] ?? benchPackConfig?.sidecars?.[spec.id];
    const runtimeStatus = verifierStatus?.verifiers.find((entry) => entry.id === spec.id);

    if ((runtimeConfig?.mode ?? spec.defaultMode) === "docker" && runtimeConfig?.auto_start === false && runtimeStatus?.status !== "running") {
      return {
        title: "验证器未启动",
        message: "该必需验证器的自动启动已禁用。请先在验证设置中启动它，再运行基准包。",
        actionLabel: "打开验证设置"
      };
    }

    if (runtimeStatus?.status === "missing_dependency") {
      return {
        title: "需要 Docker",
        message: runtimeStatus.details ?? "该基准包需要本地 Docker 才能运行。",
        actionLabel: "打开验证设置"
      };
    }

    if (runtimeStatus?.status === "dependency_not_running") {
      return {
        title: "Docker 未运行",
        message: runtimeStatus.details ?? "该基准包需要本地 Docker 处于运行状态才能运行。",
        actionLabel: "打开验证设置"
      };
    }
  }

  return null;
}

function getVerifierStatusTone(status: BenchPackVerifierStatus["verifiers"][number]["status"] | undefined): string {
  switch (status) {
    case "running":
      return "status-ready";
    case "missing_dependency":
      return "status-not-installed";
    case "dependency_not_running":
    case "failed":
      return "status-danger";
    default:
      return "status-idle";
  }
}

function formatVerifierRuntimeStatus(status: BenchPackVerifierStatus["verifiers"][number]["status"] | undefined): string {
  switch (status) {
    case "missing_dependency":
      return "需要 Docker";
    case "dependency_not_running":
      return "Docker 未运行";
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    case "stopped":
    default:
      return "已停止";
  }
}

function resultStatusLabel(status: string): string {
  switch (status) {
    case "pass":
      return "通过";
    case "partial":
      return "部分";
    case "fail":
      return "失败";
    case "error":
      return "错误";
    case "missing":
      return "缺失";
    default:
      return status;
  }
}

function getModelAvailabilityView(
  model: ResolvedTabModel,
  availabilityByModelId: Record<string, ModelAvailability>,
  checkingModelIds: Record<string, true>
): ModelAvailabilityView {
  if (checkingModelIds[model.id]) {
    return {
      modelId: model.id,
      providerId: model.provider,
      status: "checking"
    };
  }

  return availabilityByModelId[model.id] ?? {
    modelId: model.id,
    providerId: model.provider,
    status: "unknown",
    details: "尚未检查可用性。"
  };
}

function modelAvailabilityChipClass(availability: ModelAvailabilityView): string {
  switch (availability.status) {
    case "online":
      return "is-online";
    case "offline":
      return "is-offline";
    case "checking":
      return "is-checking";
    case "unknown":
    default:
      return "is-unknown";
  }
}

function modelAvailabilityLabel(availability: ModelAvailabilityView): string {
  switch (availability.status) {
    case "online":
      return "在线";
    case "offline":
      return "离线";
    case "checking":
      return "检查中";
    case "unknown":
    default:
      return "未知";
  }
}

function modelAvailabilityTitle(availability: ModelAvailabilityView): string {
  const label = modelAvailabilityLabel(availability);
  return availability.details ? `${label}: ${availability.details}` : label;
}

export function App() {
  if (DETACHED_LOGS_VIEW) {
    return <DetachedLogsWindow />;
  }

  const isMacPlatform = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [draft, setDraft] = useState<BenchLocalConfig | null>(null);
  const [workspaceState, setWorkspaceState] = useState<BenchLocalWorkspaceState | null>(null);
  const [benchPackInspections, setBenchPackInspections] = useState<BenchPackInspection[]>([]);
  const [registryEntries, setRegistryEntries] = useState<BenchPackRegistryEntry[]>([]);
  const [registryWarning, setRegistryWarning] = useState<string | null>(null);
  const [availableThemes, setAvailableThemes] = useState<BenchLocalThemeDescriptor[]>([]);
  const [activeThemeDefinition, setActiveThemeDefinition] = useState<BenchLocalThemeDefinition | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const [verifierStatuses, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) !== "false";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("providers");
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [appMetadata, setAppMetadata] = useState<BenchLocalAppMetadata | null>(null);
  const [appUpdateState, setAppUpdateState] = useState<BenchLocalUpdateState | null>(null);
  const [agentAccessState, setAgentAccessState] = useState<BenchLocalAgentAccessState | null>(null);
  const [dismissedDownloadedUpdateVersion, setDismissedDownloadedUpdateVersion] = useState<string | null>(null);
  const [providerModal, setProviderModal] = useState<ProviderModalState | null>(null);
  const [modelModal, setModelModal] = useState<ModelModalState | null>(null);
  const [modelBrowserModal, setModelBrowserModal] = useState<ModelBrowserModalState | null>(null);
  const [tabModelsModal, setTabModelsModal] = useState<TabModelsModalState | null>(null);
  const [samplingModal, setSamplingModal] = useState<SamplingModalState | null>(null);
  const [modelAliasModal, setModelAliasModal] = useState<ModelAliasModalState | null>(null);
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModalState>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<WorkspaceContextMenuState>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState>(null);
  const [historyModal, setHistoryModal] = useState<HistoryModalState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [verifierPreparationModal, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
  const [settingsVerifierPreparationModal, setSettingsVerifierPreparationModal] = useState<SettingsVerifierPreparationModalState | null>(null);
  const [stoppingVerifierStarts, setStoppingVerifierStarts] = useState<Record<string, true>>({});
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<{ tabId: string; value: string; width: number } | null>(null);
  const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
  const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
  const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
  const [runHistories, setRunHistories] = useState<Record<string, BenchPackRunHistoryEntry[]>>({});
  const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
  const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
  const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
  const [modelAvailabilityById, setModelAvailabilityById] = useState<Record<string, ModelAvailability>>({});
  const [checkingModelAvailability, setCheckingModelAvailability] = useState<Record<string, true>>({});
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const [logsDetached, setLogsDetached] = useState(false);
  const [logDrawerHeight, setLogDrawerHeight] = useState(240);
  const [detailModal, setDetailModal] = useState<DetailModalState | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [benchPackMutations, setBenchPackMutations] = useState<Record<string, BenchPackMutationState>>({});
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsOpenRef = useRef(false);
  const workspaceStateRef = useRef<BenchLocalWorkspaceState | null>(null);
  const benchPackInspectionsRef = useRef<BenchPackInspection[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map<string, number>());
  const activeToastKeysRef = useRef(new Set<string>());
  const toastKeysByIdRef = useRef(new Map<string, string>());

  const providerIds = useMemo(() => Object.keys(draft?.providers ?? {}), [draft]);
  const themeOptions = useMemo(() => ["system", ...availableThemes.map((theme) => theme.id)], [availableThemes]);
  const currentThemeLabel = useMemo(
    () => resolveThemeLabel(draft?.ui.theme ?? "system", availableThemes, systemPrefersDark),
    [draft?.ui.theme, availableThemes, systemPrefersDark]
  );
  const readyInspections = useMemo(() => benchPackInspections.filter((inspection) => inspection.status === "ready"), [benchPackInspections]);
  const activeWorkspace = useMemo<BenchLocalWorkspace | null>(
    () => (workspaceState?.activeWorkspaceId ? workspaceState.workspaces[workspaceState.activeWorkspaceId] ?? null : null),
    [workspaceState]
  );
  const workspaceTabs = useMemo<BenchLocalWorkspaceTab[]>(
    () =>
      activeWorkspace?.tabIds
        .map((tabId) => workspaceState?.tabs[tabId])
        .filter((tab): tab is BenchLocalWorkspaceTab => Boolean(tab)) ?? [],
    [activeWorkspace, workspaceState]
  );
  const activeTab = useMemo<BenchLocalWorkspaceTab | null>(
    () => (activeWorkspace?.activeTabId ? workspaceState?.tabs[activeWorkspace.activeTabId] ?? null : workspaceTabs[0] ?? null),
    [activeWorkspace, workspaceState, workspaceTabs]
  );
  const activeInspection = useMemo(
    () => benchPackInspections.find((inspection) => inspection.id === activeTab?.benchPackId) ?? null,
    [benchPackInspections, activeTab]
  );
  const activeVerifierStatus = useMemo(
    () => (activeInspection ? verifierStatuses[activeInspection.id] ?? null : null),
    [activeInspection, verifierStatuses]
  );
  const activeTabModels = useMemo(() => (draft ? resolveTabModels(activeTab, draft.models) : []), [draft, activeTab]);
  const activeRunSummary = useMemo(() => (activeTab ? runSummaries[activeTab.id] ?? null : null), [runSummaries, activeTab]);
  const activeLiveRun = useMemo(() => (activeTab ? liveRuns[activeTab.id] ?? null : null), [liveRuns, activeTab]);
  const activeLiveScenarioFocus = useMemo(
    () => (activeTab ? liveScenarioFocus[activeTab.id] ?? null : null),
    [liveScenarioFocus, activeTab]
  );
  const activeRunBlocker = useMemo(
    () =>
      activeInspection && draft
        ? getRequiredVerifierRunBlocker(activeInspection.manifest, draft.benchpacks[activeInspection.id], activeVerifierStatus ?? undefined)
        : null,
    [activeInspection, activeVerifierStatus, draft]
  );
  const activeLoadedHistory = useMemo(
    () => (activeTab ? loadedHistoryRuns[activeTab.id] ?? null : null),
    [loadedHistoryRuns, activeTab]
  );
  const activeDisplayModels = useMemo(() => {
    if (!draft) {
      return [];
    }

    if (activeLoadedHistory) {
      return resolveHistoryModels(activeRunSummary, draft.models);
    }

    return activeTabModels;
  }, [draft, activeLoadedHistory, activeRunSummary, activeTabModels]);
  const activeDisplayModelIds = useMemo(
    () => activeDisplayModels.map((model) => model.id).join("\0"),
    [activeDisplayModels]
  );
  const downloadedUpdateVersion = appUpdateState?.downloadedVersion ?? appUpdateState?.availableVersion ?? null;
  const showDownloadedUpdateBanner =
    appUpdateState?.status === "downloaded" && downloadedUpdateVersion !== dismissedDownloadedUpdateVersion;
  const activeLogEvents = activeLiveRun?.events ?? activeRunSummary?.events ?? [];
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const tabStripShellRef = useRef<HTMLDivElement | null>(null);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabChipRefs = useRef(new Map<string, HTMLElement>());
  const modelDiscoveryCacheRef = useRef<Record<string, BenchLocalDiscoveredModel[]>>({});
  const modelAvailabilityRequestRef = useRef(0);
  const modelAvailabilityPendingRef = useRef<Record<string, number>>({});
  const replayRunTokensRef = useRef(new Map<string, symbol>());
  const appliedThemeKeysRef = useRef<string[]>([]);
  const [tabStripOverflow, setTabStripOverflow] = useState(false);
  const [activeTabMask, setActiveTabMask] = useState<{ left: number; width: number } | null>(null);

  const hasUnsavedChanges =
    loadState && draft ? JSON.stringify(loadState.config) !== JSON.stringify(draft) : false;

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    const dedupeKey = toastKeysByIdRef.current.get(id);

    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }

    if (dedupeKey) {
      activeToastKeysRef.current.delete(dedupeKey);
      toastKeysByIdRef.current.delete(id);
    }

    setToastMessages((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, tone: ToastTone = "success") => {
    const normalizedMessage = message.trim();

    if (!normalizedMessage) {
      return;
    }

    const dedupeKey = `${tone}:${normalizedMessage}`;

    if (activeToastKeysRef.current.has(dedupeKey)) {
      return;
    }

    const id = `toast-${Date.now()}-${toastIdRef.current}`;
    toastIdRef.current += 1;
    activeToastKeysRef.current.add(dedupeKey);
    toastKeysByIdRef.current.set(id, dedupeKey);
    setToastMessages((current) => [...current, { id, tone, message: normalizedMessage, dedupeKey }]);

    const timeoutMs = tone === "danger" ? 8000 : 4500;
    const timer = window.setTimeout(() => dismissToast(id), timeoutMs);
    toastTimersRef.current.set(id, timer);
  }, [dismissToast]);

  const effectiveThemeId = useMemo(() => {
    const requested = draft?.ui.theme ?? "system";

    if (requested === "system") {
      return systemPrefersDark ? "dark" : "light";
    }

    return requested;
  }, [draft?.ui.theme, systemPrefersDark]);

  const updateDraft = (updater: (current: BenchLocalConfig) => BenchLocalConfig) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(cloneConfig(current));
    });
  };

  const persistWorkspaceState = async (nextState: BenchLocalWorkspaceState) => {
    setWorkspaceState(nextState);

    try {
      const saved = await window.benchlocal.workspaces.save(nextState);
      setWorkspaceState(saved.state);
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "保存工作区状态失败。");
    }
  };

  const updateWorkspaceState = (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => {
    setWorkspaceState((current) => {
      if (!current) {
        return current;
      }

      const next = updater(structuredClone(current));
      void persistWorkspaceState(next);
      return next;
    });
  };

  const loadBenchPackInspections = async () => {
    try {
      const inspections = await window.benchlocal.benchPacks.list();
      setBenchPackInspections(inspections);
    } catch (pluginError) {
      setError(pluginError instanceof Error ? pluginError.message : "检查已配置的基准包失败。");
    }
  };

  const loadRegistryEntries = async () => {
    try {
      const entries = await window.benchlocal.benchPacks.registry();
      setRegistryEntries(entries);
      setRegistryWarning(null);
    } catch (registryError) {
      setRegistryWarning(formatRegistryWarning(registryError));
    }
  };

  const loadVerifierStatuses = async () => {
    try {
      const statuses = await window.benchlocal.verifiers.list();
      setVerifierStatuses(Object.fromEntries(statuses.map((status) => [status.benchPackId, status])));
    } catch (verifierError) {
      setError(verifierError instanceof Error ? verifierError.message : "加载验证器状态失败。");
    }
  };

  const loadThemes = async () => {
    try {
      const themes = await window.benchlocal.themes.list();
      setAvailableThemes(themes);
    } catch (themeError) {
      setError(themeError instanceof Error ? themeError.message : "加载可用主题失败。");
    }
  };

  const checkForAppUpdates = async () => {
    try {
      const nextState = await window.benchlocal.updates.check();
      setAppUpdateState(nextState);
    } catch (updateError) {
      setError(formatDesktopErrorMessage(updateError) || "检查 BenchLocal 更新失败。");
    }
  };

  const installDownloadedAppUpdate = async () => {
    try {
      await window.benchlocal.updates.install();
    } catch (updateError) {
      setError(formatDesktopErrorMessage(updateError) || "安装已下载的 BenchLocal 更新失败。");
    }
  };

  const loadHistoryForBenchPack = async (benchPackId: string) => {
    try {
      const history = await window.benchlocal.benchPacks.history({ benchPackId });
      setRunHistories((current) => ({
        ...current,
        [benchPackId]: history
      }));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "加载基准包历史失败。");
    }
  };

  const refreshModelAvailability = async (models: ResolvedTabModel[] = activeDisplayModels) => {
    if (!draft || models.length === 0) {
      return;
    }

    const modelIds = models.map((model) => model.id);
    const requestId = modelAvailabilityRequestRef.current + 1;
    modelAvailabilityRequestRef.current = requestId;
    for (const modelId of modelIds) {
      modelAvailabilityPendingRef.current[modelId] = requestId;
    }
    setCheckingModelAvailability((current) => ({
      ...current,
      ...Object.fromEntries(modelIds.map((modelId) => [modelId, true]))
    }));

    try {
      const availability = await window.benchlocal.models.availability({
        config: draft,
        modelIds
      });

      setModelAvailabilityById((current) => ({
        ...current,
        ...Object.fromEntries(
          availability
            .filter((entry) => modelAvailabilityPendingRef.current[entry.modelId] === requestId)
            .map((entry) => [entry.modelId, entry])
        )
      }));
    } catch (availabilityError) {
      if (modelIds.some((modelId) => modelAvailabilityPendingRef.current[modelId] === requestId)) {
        setError(availabilityError instanceof Error ? availabilityError.message : "检查模型可用性失败。");
      }
    } finally {
      setCheckingModelAvailability((current) => {
        const next = { ...current };

        for (const modelId of modelIds) {
          if (modelAvailabilityPendingRef.current[modelId] === requestId) {
            delete next[modelId];
            delete modelAvailabilityPendingRef.current[modelId];
          }
        }

        return next;
      });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsBusy(true);
      setError(null);
      setRegistryWarning(null);

      try {
        const [
          result,
          workspaceResult,
          inspections,
          themes,
          verifierStatusList,
          activeRunsResult,
          agentState
        ] = await Promise.all([
          window.benchlocal.config.load(),
          window.benchlocal.workspaces.load(),
          window.benchlocal.benchPacks.list(),
          window.benchlocal.themes.list(),
          window.benchlocal.verifiers.list(),
          window.benchlocal.benchPacks.activeRuns(),
          window.benchlocal.agent.state()
        ]);

        let registry: BenchPackRegistryEntry[] = [];
        let nextRegistryWarning: string | null = null;

        try {
          registry = await window.benchlocal.benchPacks.registry();
        } catch (registryError) {
          nextRegistryWarning = formatRegistryWarning(registryError);
        }

        if (cancelled) {
          return;
        }

        const persistedRunEntries = await Promise.all(
          Object.values(workspaceResult.state.tabs)
            .filter((tab) => tab.benchPackId && tab.loadedRunId)
            .map(async (tab) => {
              try {
                const summary = await window.benchlocal.benchPacks.loadHistory({
                  benchPackId: tab.benchPackId as string,
                  runId: tab.loadedRunId as string
                });
                return [tab.id, summary] as const;
              } catch {
                return null;
              }
            })
        );

        setLoadState(result);
        setDraft(cloneConfig(result.config));
        setWorkspaceState(workspaceResult.state);
        setRunSummaries(
          Object.fromEntries(
            persistedRunEntries.filter(
              (entry): entry is readonly [string, BenchPackRunSummary] => entry !== null
            )
          )
        );
        setLoadedHistoryRuns(
          Object.fromEntries(
            persistedRunEntries
              .filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
              .map(([tabId, summary]) => [
                tabId,
                {
                  runId: summary.runId,
                  startedAt: summary.startedAt,
                  mode: "history"
                }
              ])
          )
        );
        setBenchPackInspections(inspections);
        setRegistryEntries(registry);
        setRegistryWarning(nextRegistryWarning);
        setAvailableThemes(themes);
        setAgentAccessState(agentState);
        setVerifierStatuses(Object.fromEntries(verifierStatusList.map((status) => [status.benchPackId, status])));
        setActiveRuns(
          Object.fromEntries(activeRunsResult.map((run) => [run.tabId, { benchPackId: run.benchPackId }]))
        );
        setAppNotice(result.created ? "已创建全新的 ~/.benchlocal/config.toml 初始配置。" : null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载 BenchLocal 配置失败。");
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      toastTimersRef.current.clear();
      activeToastKeysRef.current.clear();
      toastKeysByIdRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!appNotice) {
      return;
    }

    pushToast(appNotice, "success");
    setAppNotice(null);
  }, [appNotice, pushToast]);

  useEffect(() => {
    if (!settingsNotice) {
      return;
    }

    pushToast(settingsNotice, "success");
    setSettingsNotice(null);
  }, [settingsNotice, pushToast]);

  useEffect(() => {
    if (!error) {
      return;
    }

    pushToast(error, "danger");
    setError(null);
  }, [error, pushToast]);

  useEffect(() => {
    if (!showDownloadedUpdateBanner || !downloadedUpdateVersion) {
      return;
    }

    pushToast(describeAppUpdateState(appUpdateState), "success");
    setDismissedDownloadedUpdateVersion(downloadedUpdateVersion);
  }, [appUpdateState, downloadedUpdateVersion, pushToast, showDownloadedUpdateBanner]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemPrefersDark(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.benchlocal.updates
      .state()
      .then((state) => {
        if (!cancelled) {
          setAppUpdateState(state);
        }
      })
      .catch(() => undefined);

    const unsubscribe = window.benchlocal.updates.onState((state) => {
      setAppUpdateState(state);

      if (state.status !== "downloaded") {
        setDismissedDownloadedUpdateVersion(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      const theme = await window.benchlocal.themes.load({ themeId: effectiveThemeId });

      if (!cancelled) {
        setActiveThemeDefinition(theme);
      }
    };

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [effectiveThemeId]);

  useEffect(() => {
    if (!activeThemeDefinition || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    for (const key of appliedThemeKeysRef.current) {
      root.style.removeProperty(key);
    }

    for (const [key, value] of Object.entries(activeThemeDefinition.variables)) {
      root.style.setProperty(key, value);
    }

    appliedThemeKeysRef.current = Object.keys(activeThemeDefinition.variables);
    root.style.setProperty("color-scheme", activeThemeDefinition.colorScheme);
    root.dataset.theme = activeThemeDefinition.id;
  }, [activeThemeDefinition]);

  useEffect(() => {
    return window.benchlocal.benchPacks.onRunEvent(({ tabId, benchPackId, event }) => {
      if (event.type === "verifier_preparing") {
        setVerifierPreparationModal({
          tabId,
          progress: event
        });
      } else {
        setVerifierPreparationModal((current) => (current?.tabId === tabId ? null : current));
      }

      if (event.type === "run_finished" || event.type === "run_error") {
        if (event.type === "run_error" && isRunCancellationMessage(event.message)) {
          const resolvedBenchPackId = benchPackId ?? workspaceStateRef.current?.tabs[tabId]?.benchPackId ?? "";
          const benchPackName = resolvedBenchPackId
            ? createTabTitle(resolvedBenchPackId, benchPackInspectionsRef.current)
            : "基准包运行";
          setAppNotice(`已停止 ${benchPackName}。`);
        }

        setActiveRuns((current) => {
          if (!current[tabId]) {
            return current;
          }

          const next = { ...current };
          delete next[tabId];
          return next;
        });
        setStoppingRuns((current) => {
          if (!current[tabId]) {
            return current;
          }

          const next = { ...current };
          delete next[tabId];
          return next;
        });
      }

      if (event.type === "run_started") {
        setActiveRuns((current) => {
          if (current[tabId]) {
            return current;
          }

          const tabBenchPackId = workspaceStateRef.current?.tabs[tabId]?.benchPackId;

          if (!tabBenchPackId) {
            return current;
          }

          return {
            ...current,
            [tabId]: { benchPackId: tabBenchPackId, mode: "host" }
          };
        });
      }

      setLiveRuns((current) => ({
        ...current,
        [tabId]: updateLiveRunState(current[tabId], event)
      }));

      if (event.type === "run_started") {
        setLiveScenarioFocus((current) => ({
          ...current,
          [tabId]: {
            liveScenarioId: null,
            autoFollow: true
          }
        }));
      } else if (
        event.type === "scenario_started" ||
        event.type === "model_progress" ||
        event.type === "scenario_result" ||
        event.type === "scenario_finished"
      ) {
        setLiveScenarioFocus((current) => {
          const existing = current[tabId];
          return {
            ...current,
            [tabId]: {
              liveScenarioId: event.scenarioId,
              autoFollow: existing?.autoFollow ?? true
            }
          };
        });
      }
    });
  }, []);

  useEffect(() => {
    workspaceStateRef.current = workspaceState;
  }, [workspaceState]);

  useEffect(() => {
    benchPackInspectionsRef.current = benchPackInspections;
  }, [benchPackInspections]);

  useEffect(() => {
    const loadUpdatedConfig = async () => {
      try {
        const result = await window.benchlocal.config.load();
        setLoadState(result);
        setDraft(cloneConfig(result.config));
        await loadBenchPackInspections();
        await loadRegistryEntries();
      } catch (configError) {
        setError(configError instanceof Error ? configError.message : "重新加载 BenchLocal 配置失败。");
      }
    };

    return window.benchlocal.config.onUpdated(() => {
      void loadUpdatedConfig();
    });
  }, []);

  useEffect(() => {
    const loadUpdatedWorkspace = async (state: BenchLocalWorkspaceState) => {
      setWorkspaceState(state);
      const persistedRunEntries = await Promise.all(
        Object.values(state.tabs)
          .filter((tab) => tab.benchPackId && tab.loadedRunId)
          .map(async (tab) => {
            try {
              const summary = await window.benchlocal.benchPacks.loadHistory({
                benchPackId: tab.benchPackId as string,
                runId: tab.loadedRunId as string
              });
              return [tab.id, summary] as const;
            } catch {
              return null;
            }
          })
      );

      setRunSummaries((current) => ({
        ...current,
        ...Object.fromEntries(
          persistedRunEntries.filter(
            (entry): entry is readonly [string, BenchPackRunSummary] => entry !== null
          )
        )
      }));
      setLoadedHistoryRuns((current) => ({
        ...current,
        ...Object.fromEntries(
          persistedRunEntries
            .filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
            .map(([tabId, summary]) => [
              tabId,
              {
                runId: summary.runId,
                startedAt: summary.startedAt,
                mode: "history" as const
              }
            ])
        )
      }));
    };

    return window.benchlocal.workspaces.onUpdated(({ state }) => {
      void loadUpdatedWorkspace(state);
    });
  }, []);

  useEffect(() => {
    void window.benchlocal.agent.state().then(setAgentAccessState).catch(() => undefined);

    return window.benchlocal.agent.onState((state) => {
      void window.benchlocal.agent.state().then(setAgentAccessState).catch(() => {
        setAgentAccessState(state);
      });
    });
  }, []);

  useEffect(() => {
    return window.benchlocal.benchPacks.onMutationProgress((payload) => {
      setBenchPackMutations((current) => ({
        ...current,
        [payload.benchPackId]: payload
      }));
    });
  }, []);

  useEffect(() => {
    return window.benchlocal.verifiers.onProgress(({ benchPackId, event }) => {
      setSettingsVerifierPreparationModal((current) =>
        current?.benchPackId === benchPackId || current === null
          ? {
              benchPackId,
              progress: event
            }
          : current
      );
    });
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "verification") {
      return;
    }

    void loadVerifierStatuses();
  }, [settingsOpen, settingsTab]);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "advanced") {
      return;
    }

    setSettingsTab("providers");
  }, [settingsOpen, settingsTab]);

  useEffect(() => {
    if (!logsOpen || !logsAutoScroll || !logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [activeLogEvents, logsOpen, logsAutoScroll]);

  useEffect(() => {
    if (!activeInspection?.id || activeInspection.status !== "ready") {
      return;
    }

    void loadHistoryForBenchPack(activeInspection.id);
  }, [activeInspection?.id, activeInspection?.status]);

  useEffect(() => {
    if (!draft || !activeInspection?.id || activeDisplayModels.length === 0) {
      return;
    }

    if (activeTab && activeRuns[activeTab.id]) {
      return;
    }

    void refreshModelAvailability(activeDisplayModels);
  }, [draft, activeInspection?.id, activeDisplayModelIds, activeTab?.id]);

  useEffect(() => {
    const dispose = window.benchlocal.logs.onDetachedWindowClosed(() => {
      setLogsDetached(false);
    });

    return dispose;
  }, []);

  useEffect(() => {
    void window.benchlocal.logs.publishDetachedState({
      workspaceName: activeWorkspace?.name ?? "暂无工作区",
      tabTitle: activeTab?.title ?? "暂无活动标签页",
      eventCount: activeLogEvents.length,
      events: activeLogEvents
    });
  }, [activeWorkspace?.name, activeTab?.title, activeLogEvents]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const shell = document.querySelector<HTMLElement>(".desktop-shell");

      if (!shell || !document.body.dataset.logResizeActive) {
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const nextHeight = Math.min(420, Math.max(160, shellRect.bottom - event.clientY - 30));
      setLogDrawerHeight(nextHeight);
    };

    const handleUp = () => {
      delete document.body.dataset.logResizeActive;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  useEffect(() => {
    if (!workspaceContextMenu && !tabContextMenu) {
      return;
    }

    const closeMenu = () => {
      setWorkspaceContextMenu(null);
      setTabContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceContextMenu, tabContextMenu]);

  useEffect(() => {
    if (!themeMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!themeMenuRef.current?.contains(target)) {
        setThemeMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    return window.benchlocal.app.onOpenAbout(() => {
      setAboutDialogOpen(true);

      if (!appMetadata) {
        void window.benchlocal.app
          .metadata()
          .then((metadata) => {
            setAppMetadata(metadata);
          })
          .catch(() => undefined);
      }
    });
  }, [appMetadata]);

  useEffect(() => {
    return window.benchlocal.app.onOpenSettings(() => {
      setSettingsOpen(true);
    });
  }, []);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;

    if (!settingsOpen) {
      setSettingsNotice(null);
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const updateOverflow = () => {
      const element = tabStripRef.current;

      if (!element) {
        setTabStripOverflow(false);
        return;
      }

      setTabStripOverflow(element.scrollWidth > element.clientWidth + 4);
    };

    updateOverflow();
    window.addEventListener("resize", updateOverflow);

    return () => {
      window.removeEventListener("resize", updateOverflow);
    };
  }, [workspaceTabs.length, activeWorkspace?.id, sidebarOpen]);

  useEffect(() => {
    const shell = tabStripShellRef.current;
    const strip = tabStripRef.current;
    const activeTabId = activeTab?.id;

    if (!shell || !strip || !activeTabId) {
      setActiveTabMask(null);
      return;
    }

    const updateMask = () => {
      const activeElement = tabChipRefs.current.get(activeTabId);

      if (!activeElement) {
        setActiveTabMask(null);
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();

      setActiveTabMask({
        left: Math.round(tabRect.left - shellRect.left),
        width: Math.round(tabRect.width)
      });
    };

    const frameId = window.requestAnimationFrame(updateMask);
    window.addEventListener("resize", updateMask);
    strip.addEventListener("scroll", updateMask, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMask);
      strip.removeEventListener("scroll", updateMask);
    };
  }, [activeTab?.id, workspaceTabs, sidebarOpen, tabStripOverflow]);

  const persistConfig = async (
    nextConfig: BenchLocalConfig,
    options?: {
      notice?: string | null;
      preserveFilesystemDraft?: boolean;
      previousDraft?: BenchLocalConfig | null;
      previousLoadConfig?: BenchLocalConfig | null;
    }
  ): Promise<boolean> => {
    if (!nextConfig) {
      return false;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await window.benchlocal.config.save(nextConfig);
      setLoadState(result);
      setDraft(
        options?.preserveFilesystemDraft && options.previousDraft && options.previousLoadConfig
          ? reapplyPendingFilesystemDraft(result.config, options.previousDraft, options.previousLoadConfig)
          : cloneConfig(result.config)
      );
      await loadBenchPackInspections();
      await loadRegistryEntries();
      if (settingsOpenRef.current && options?.notice) {
        setSettingsNotice(options.notice);
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 BenchLocal 配置失败。");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!draft) {
      return false;
    }

    return persistConfig(draft, { notice: "已保存 ~/.benchlocal/config.toml" });
  };

  const configureAgentAccess = async (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }): Promise<void> => {
    setError(null);

    try {
      const state = await window.benchlocal.agent.configure(input);
      setAgentAccessState(state);
      setSettingsNotice(state.enabled ? "已启用本地 Agent 访问。" : "已禁用本地 Agent 访问。");
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "更新 Agent 访问失败。");
    }
  };

  const regenerateAgentToken = async (): Promise<void> => {
    setError(null);

    try {
      const state = await window.benchlocal.agent.regenerateToken();
      setAgentAccessState(state);
      setSettingsNotice("已重新生成 Agent 访问令牌。");
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "重新生成 Agent 访问令牌失败。");
    }
  };

  const refreshBenchPackState = async (result?: LoadState) => {
    const nextLoadState = result ?? (await window.benchlocal.config.load());
    const inspections = await window.benchlocal.benchPacks.list();
    const verifierStatusList = await window.benchlocal.verifiers.list();
    let registry = registryEntries;

    try {
      registry = await window.benchlocal.benchPacks.registry();
      setRegistryWarning(null);
    } catch (registryError) {
      setRegistryWarning(formatRegistryWarning(registryError));
    }

    setLoadState(nextLoadState);
    setDraft(cloneConfig(nextLoadState.config));
    setBenchPackInspections(inspections);
    setRegistryEntries(registry);
    setVerifierStatuses(Object.fromEntries(verifierStatusList.map((status) => [status.benchPackId, status])));
  };

  const ensureBenchPackMutationReady = async (): Promise<boolean> => {
    if (!hasUnsavedChanges) {
      return true;
    }

    return save();
  };

  const installBenchPack = async (benchPackId: string) => {
    if (!(await ensureBenchPackMutationReady())) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setBenchPackMutations((current) => ({
      ...current,
      [benchPackId]: {
        benchPackId,
        action: "install",
        phase: "resolving",
        message: "正在从注册表解析基准包。"
      }
    }));

    try {
      const result = await window.benchlocal.benchPacks.install({ benchPackId });
      await refreshBenchPackState(result);
      if (settingsOpenRef.current) {
        setSettingsNotice(`已安装 ${benchPackId}。`);
      }
    } catch (installError) {
      setError(formatRegistryMutationError("install", benchPackId, installError));
    } finally {
      setIsBusy(false);
      setBenchPackMutations((current) => {
        const next = { ...current };
        delete next[benchPackId];
        return next;
      });
    }
  };

  const installBenchPackFromUrl = async (url: string) => {
    if (!(await ensureBenchPackMutationReady())) {
      return;
    }

    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      setError("必须填写基准包 URL。");
      return;
    }

    setIsBusy(true);
    setError(null);
    let installedBenchPackId: string | null = null;
    setBenchPackMutations((current) => ({
      ...current,
      [THIRD_PARTY_INSTALL_MUTATION_ID]: {
        benchPackId: THIRD_PARTY_INSTALL_MUTATION_ID,
        action: "install",
        phase: "resolving",
        message: "正在从 URL 解析基准包。"
      }
    }));

    try {
      const result = await window.benchlocal.benchPacks.installFromUrl({ url: normalizedUrl });
      await refreshBenchPackState(result);
      installedBenchPackId =
        Object.entries(result.config.benchpacks).find(([, benchPack]) => benchPack.source === "archive" && benchPack.url === normalizedUrl)?.[0] ??
        null;
      if (settingsOpenRef.current) {
        setSettingsNotice(installedBenchPackId ? `已安装 ${installedBenchPackId}。` : "已安装第三方基准包。");
      }
      return true;
    } catch (installError) {
      setError(formatDesktopErrorMessage(installError) || "从 URL 安装基准包失败。");
      return false;
    } finally {
      setIsBusy(false);
      setBenchPackMutations((current) => {
        const next = { ...current };
        delete next[THIRD_PARTY_INSTALL_MUTATION_ID];
        delete next["third-party"];
        if (installedBenchPackId) {
          delete next[installedBenchPackId];
        }
        return next;
      });
    }
  };

  const updateBenchPack = async (benchPackId: string) => {
    if (!(await ensureBenchPackMutationReady())) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setBenchPackMutations((current) => ({
      ...current,
      [benchPackId]: {
        benchPackId,
        action: "update",
        phase: "resolving",
        message: "正在解析基准包更新。"
      }
    }));

    try {
      const result = await window.benchlocal.benchPacks.update({ benchPackId });
      await refreshBenchPackState(result);
      if (settingsOpenRef.current) {
        setSettingsNotice(`已更新 ${benchPackId}。`);
      }
    } catch (updateError) {
      setError(formatRegistryMutationError("update", benchPackId, updateError));
    } finally {
      setIsBusy(false);
      setBenchPackMutations((current) => {
        const next = { ...current };
        delete next[benchPackId];
        return next;
      });
    }
  };

  const uninstallInstalledBenchPack = async (benchPackId: string) => {
    if (!(await ensureBenchPackMutationReady())) {
      return;
    }

    if (Object.values(activeRuns).some((run) => run.benchPackId === benchPackId)) {
      setError("请先停止活动的基准包运行，再卸载该基准包。");
      return;
    }

    setIsBusy(true);
    setError(null);
    setBenchPackMutations((current) => ({
      ...current,
      [benchPackId]: {
        benchPackId,
        action: "uninstall",
        phase: "removing",
        message: "正在移除基准包。"
      }
    }));

    try {
      const result = await window.benchlocal.benchPacks.uninstall({ benchPackId });
      await refreshBenchPackState(result);
      if (settingsOpenRef.current) {
        setSettingsNotice(`已卸载 ${benchPackId}。`);
      }
    } catch (uninstallError) {
      setError(uninstallError instanceof Error ? uninstallError.message : `卸载 ${benchPackId} 失败。`);
    } finally {
      setIsBusy(false);
      setBenchPackMutations((current) => {
        const next = { ...current };
        delete next[benchPackId];
        return next;
      });
    }
  };

  const reset = () => {
    if (!loadState) {
      return;
    }

    setDraft(cloneConfig(loadState.config));
    setProviderModal(null);
    setModelModal(null);
    if (settingsOpenRef.current) {
      setSettingsNotice("已还原未保存的更改。");
    }
    setError(null);
  };

  const saveThemeSelection = async (themeId: string) => {
    if (!draft) {
      return;
    }

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.ui.theme = themeId;
    setDraft(nextConfig);

    const saved = await persistConfig(nextConfig, {
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
    if (!saved) {
      setDraft(previousDraft);
    }
  };

  const saveVerifierConfig = async (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => {
    if (!draft) {
      return;
    }

    const currentVerifier = draft.benchpacks[benchPackId]?.verifiers?.[verifierId];
    if (!currentVerifier) {
      return;
    }

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.benchpacks[benchPackId].verifiers![verifierId] = updater(currentVerifier);
    setDraft(nextConfig);

    const saved = await persistConfig(nextConfig, {
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
    if (!saved) {
      setDraft(previousDraft);
    }
  };

  const scrollTabStrip = (delta: number) => {
    tabStripRef.current?.scrollBy({
      left: delta,
      behavior: "smooth"
    });
  };

  const handleTabStripWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const strip = tabStripRef.current;

    if (!strip || !tabStripOverflow) {
      return;
    }

    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (Math.abs(horizontalDelta) < 1) {
      return;
    }

    event.preventDefault();
    strip.scrollBy({
      left: horizontalDelta,
      behavior: "auto"
    });
  };

  const runTab = async (tab: BenchLocalWorkspaceTab) => {
    setError(null);
    setAppNotice(null);

    if (!tab.benchPackId || !draft) {
      setError("请先为该标签页选择基准包。");
      return;
    }

    const benchPackId = tab.benchPackId;
    const selectedModels = resolveTabModels(tab, draft.models);
    const inspection = benchPackInspections.find((candidate) => candidate.id === benchPackId);

    if (inspection?.manifest) {
      try {
        const verifierStatusList = await window.benchlocal.verifiers.list();
        const nextVerifierStatuses = Object.fromEntries(verifierStatusList.map((status) => [status.benchPackId, status]));
        setVerifierStatuses(nextVerifierStatuses);

        const runBlocker = getRequiredVerifierRunBlocker(
          inspection.manifest,
          draft.benchpacks[benchPackId],
          nextVerifierStatuses[benchPackId]
        );

        if (runBlocker) {
          setConfirmDialog({
            title: runBlocker.title,
            subtitle: runBlocker.message,
            confirmLabel: runBlocker.actionLabel,
            onConfirm: () => {
              setSettingsTab("verification");
              setSettingsOpen(true);
            }
          });
          return;
        }
      } catch (verifierError) {
        setError(verifierError instanceof Error ? verifierError.message : "刷新验证器状态失败。");
        return;
      }
    }

    if (selectedModels.length === 0) {
      setError("运行基准包前，请为该标签页至少选择一个已启用的模型。");
      return;
    }

    if (hasUnsavedChanges) {
      const saved = await save();

      if (!saved) {
        return;
      }
    }

    setActiveRuns((current) => ({
      ...current,
      [tab.id]: { benchPackId, mode: "host" }
    }));
    setStoppingRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: {
        events: [],
        resultsByModel: {},
        activeCellKeys: []
      }
    }));
    setRunSummaries((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLoadedHistoryRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });

    try {
      const result = await window.benchlocal.benchPacks.run({
        tabId: tab.id,
        benchPackId,
        modelIds: selectedModels.map((model) => model.id),
        executionMode: tab.executionMode,
        runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
        generation: tab.samplingOverrides
      });
      setRunSummaries((current) => ({
        ...current,
        [tab.id]: result
      }));
      updateWorkspaceState((current) => {
        const nextTab = current.tabs[tab.id];

        if (!nextTab) {
          return current;
        }

        nextTab.loadedRunId = result.runId;
        nextTab.updatedAt = new Date().toISOString();
        return current;
      });
      if (!result.cancelled && !isRunSummaryComplete(result)) {
        const completedCells = countStoredRunResults(result);
        setAppNotice(
          completedCells > 0
            ? `已运行 ${result.benchPackName} 的可用模型。启动其余模型服务器后可继续运行。`
            : `${result.benchPackName} 没有在线的所选模型。请先启动模型服务器，然后继续该测试。`
        );
      } else if (!result.cancelled) {
        setAppNotice(`已完成 ${result.benchPackName}：${result.scenarioCount} 个场景、${result.modelCount} 个模型。`);
      }
      await loadBenchPackInspections();
      await loadHistoryForBenchPack(benchPackId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : `运行基准包 ${benchPackId} 失败。`);
    } finally {
      setVerifierPreparationModal((current) => (current?.tabId === tab.id ? null : current));
      setActiveRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setStoppingRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setLiveRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setLoadedHistoryRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
    }
  };

  const resetTabRunState = (tab: BenchLocalWorkspaceTab) => {
    setError(null);
    setAppNotice(null);
    setRunSummaries((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLiveRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLoadedHistoryRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    updateWorkspaceState((current) => {
      const nextTab = current.tabs[tab.id];

      if (!nextTab) {
        return current;
      }

      nextTab.loadedRunId = null;
      nextTab.updatedAt = new Date().toISOString();
      return current;
    });
    setAppNotice(`已将 "${tab.title}" 重置为全新运行状态。`);
  };

  const resumeTabRun = async (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => {
    setError(null);
    setAppNotice(null);

    if (!tab.benchPackId || !draft) {
      setError("请先为该标签页选择基准包。");
      return;
    }

    if (isRunSummaryComplete(runSummary)) {
      setError("该保存的运行已完成。");
      return;
    }

    const benchPackId = tab.benchPackId;
    const previousLoadedHistory = loadedHistoryRuns[tab.id] ?? null;
    const previousTabModelSelections = structuredClone(tab.modelSelections);
    const previousExecutionMode = tab.executionMode;

    if (hasUnsavedChanges) {
      const saved = await save();

      if (!saved) {
        return;
      }
    }

    const historicalSelections = buildHistoryModelSelections(runSummary, draft.models);
    updateWorkspaceState((current) => {
      const nextTab = current.tabs[tab.id];

      if (!nextTab) {
        return current;
      }

      nextTab.modelSelections = normalizeTabModelSelections(historicalSelections);
      nextTab.executionMode = runSummary.executionMode ?? nextTab.executionMode;
      nextTab.updatedAt = new Date().toISOString();
      return current;
    });

    setLoadedHistoryRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setActiveRuns((current) => ({
      ...current,
      [tab.id]: { benchPackId, mode: "host" }
    }));
    setStoppingRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: {
        runId: runSummary.runId,
        events: [],
        resultsByModel: {},
        activeCellKeys: []
      }
    }));

    try {
      const result = await window.benchlocal.benchPacks.resumeRun({
        tabId: tab.id,
        benchPackId,
        runId: runSummary.runId,
        executionMode: runSummary.executionMode ?? tab.executionMode,
        runsPerTest: normalizeRunsPerTest(runSummary.runsPerTest ?? tab.runsPerTest),
        generation: tab.samplingOverrides
      });
      setRunSummaries((current) => ({
        ...current,
        [tab.id]: result
      }));
      updateWorkspaceState((current) => {
        const nextTab = current.tabs[tab.id];

        if (!nextTab) {
          return current;
        }

        nextTab.loadedRunId = result.runId;
        nextTab.updatedAt = new Date().toISOString();
        return current;
      });
      if (!result.cancelled) {
        setAppNotice(
          isRunSummaryComplete(result)
            ? `已完成 ${result.benchPackName}：${result.scenarioCount} 个场景、${result.modelCount} 个模型。`
            : `已继续 ${result.benchPackName}，但运行尚未完成。`
        );
      }
      await loadBenchPackInspections();
      await loadHistoryForBenchPack(benchPackId);
    } catch (runError) {
      updateWorkspaceState((current) => {
        const nextTab = current.tabs[tab.id];

        if (!nextTab) {
          return current;
        }

        nextTab.modelSelections = structuredClone(previousTabModelSelections);
        nextTab.executionMode = previousExecutionMode;
        nextTab.updatedAt = new Date().toISOString();
        return current;
      });
      if (previousLoadedHistory) {
        setLoadedHistoryRuns((current) => ({
          ...current,
          [tab.id]: previousLoadedHistory
        }));
      }
      setError(runError instanceof Error ? runError.message : `继续基准包 ${benchPackId} 失败。`);
    } finally {
      setVerifierPreparationModal((current) => (current?.tabId === tab.id ? null : current));
      setActiveRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setStoppingRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setLiveRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
    }
  };

  const replayTabRun = async (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => {
    if (!tab.benchPackId) {
      setError("请先为该标签页选择基准包。");
      return;
    }

    if (!isRunSummaryComplete(runSummary)) {
      setError("只有已完成的测试运行才能回放。");
      return;
    }

    const inspection = benchPackInspections.find((candidate) => candidate.id === tab.benchPackId);
    const scenarios = inspection?.scenarios ?? [];
    const modelIds = resolveHistoryModels(runSummary, draft?.models ?? []).map((model) => model.id);
    const replayGroups = buildReplayGroups(runSummary, scenarios, modelIds);
    const token = Symbol(`replay:${tab.id}`);
    replayRunTokensRef.current.set(tab.id, token);

    setError(null);
    setAppNotice(null);
    setActiveRuns((current) => ({
      ...current,
      [tab.id]: { benchPackId: tab.benchPackId as string, mode: "replay" }
    }));
    setStoppingRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: {
        runId: runSummary.runId,
        events: [],
        resultsByModel: {},
        activeCellKeys: []
      }
    }));
    setLiveScenarioFocus((current) => ({
      ...current,
      [tab.id]: {
        liveScenarioId: null,
        autoFollow: supportsLiveScenarioColumnFocus(runSummary.executionMode ?? tab.executionMode)
      }
    }));

    const wait = async (ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    };

    try {
      for (const group of replayGroups) {
        if (replayRunTokensRef.current.get(tab.id) !== token) {
          return;
        }

        const nextActiveCellKeys = group.map((cell) => getCellKey(cell.modelId, cell.scenarioId));
        const leadScenarioId = group[0]?.scenarioId ?? null;

        setLiveRuns((current) => {
          const existing = current[tab.id];
          return {
            ...current,
            [tab.id]: {
              runId: runSummary.runId,
              events: existing?.events ?? [],
              resultsByModel: existing?.resultsByModel ?? {},
              activeCellKeys: nextActiveCellKeys
            }
          };
        });
        if (leadScenarioId && supportsLiveScenarioColumnFocus(runSummary.executionMode ?? tab.executionMode)) {
          setLiveScenarioFocus((current) => ({
            ...current,
            [tab.id]: {
              liveScenarioId: leadScenarioId,
              autoFollow: true
            }
          }));
        }

        await wait(1000);

        if (replayRunTokensRef.current.get(tab.id) !== token) {
          return;
        }

        setLiveRuns((current) => {
          const existing = current[tab.id];
          const nextResultsByModel = { ...(existing?.resultsByModel ?? {}) };

          for (const cell of group) {
            nextResultsByModel[cell.modelId] = [
              ...(nextResultsByModel[cell.modelId] ?? []).filter((candidate) => candidate.scenarioId !== cell.scenarioId),
              cell.result
            ];
          }

          return {
            ...current,
            [tab.id]: {
              runId: runSummary.runId,
              events: existing?.events ?? [],
              resultsByModel: nextResultsByModel,
              activeCellKeys: []
            }
          };
        });
      }

      setAppNotice(`已回放 ${runSummary.benchPackName}。`);
    } finally {
      if (replayRunTokensRef.current.get(tab.id) === token) {
        replayRunTokensRef.current.delete(tab.id);
      }

      setActiveRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setStoppingRuns((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
    }
  };

  const stopTabRun = async (tabId: string) => {
    const activeRun = activeRuns[tabId];

    if (activeRun?.mode === "replay") {
      replayRunTokensRef.current.delete(tabId);
      setActiveRuns((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setStoppingRuns((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setLiveRuns((current) => ({
        ...current,
        [tabId]: {
          ...(current[tabId] ?? {
            events: [],
            resultsByModel: {},
            activeCellKeys: []
          }),
          activeCellKeys: []
        }
      }));
      setAppNotice("已停止回放。");
      return;
    }

    setStoppingRuns((current) => ({
      ...current,
      [tabId]: true
    }));

    try {
      const result = await window.benchlocal.benchPacks.stop({ tabId });

      if (!result.stopped) {
        setAppNotice("该基准包运行已不再活动。");
        setActiveRuns((current) => {
          const next = { ...current };
          delete next[tabId];
          return next;
        });
        setStoppingRuns((current) => {
          const next = { ...current };
          delete next[tabId];
          return next;
        });
        return;
      }

      // The host emits the final cancellation event; use that as the single stop notification.
    } catch (stopError) {
      setStoppingRuns((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setError(stopError instanceof Error ? stopError.message : "停止基准包运行失败。");
    }
  };

  const cancelSettingsVerifierStart = async (benchPackId: string) => {
    setStoppingVerifierStarts((current) => ({
      ...current,
      [benchPackId]: true
    }));

    try {
      const result = await window.benchlocal.verifiers.cancelStart({ benchPackId });

      if (!result.cancelled) {
        setSettingsVerifierPreparationModal((current) => (current?.benchPackId === benchPackId ? null : current));
        setStoppingVerifierStarts((current) => {
          if (!current[benchPackId]) {
            return current;
          }

          const next = { ...current };
          delete next[benchPackId];
          return next;
        });
      }
    } catch (cancelError) {
      setStoppingVerifierStarts((current) => {
        if (!current[benchPackId]) {
          return current;
        }

        const next = { ...current };
        delete next[benchPackId];
        return next;
      });
      setError(cancelError instanceof Error ? cancelError.message : "取消验证器启动失败。");
    }
  };

  const createWorkspace = () => {
    updateWorkspaceState((current) => {
      const now = new Date().toISOString();
      const workspaceId = `workspace-${crypto.randomUUID()}`;
      const tabId = `tab-${crypto.randomUUID()}`;

      current.workspaceOrder.push(workspaceId);
      current.activeWorkspaceId = workspaceId;
      current.workspaces[workspaceId] = {
        id: workspaceId,
        name: createWorkspaceName(current.workspaceOrder.length - 1),
        tabIds: [tabId],
        activeTabId: tabId,
        createdAt: now,
        updatedAt: now
      };
        current.tabs[tabId] = {
          id: tabId,
          title: "新建标签页",
          benchPackId: null,
          loadedRunId: null,
          focusedScenarioId: null,
          modelSelections: [],
        samplingOverrides: {},
        executionMode: "parallel_by_test_case",
        runsPerTest: 1,
        createdAt: now,
        updatedAt: now
      };

      return current;
    });
  };

  const renameWorkspace = (workspaceId: string, name: string) => {
    updateWorkspaceState((current) => {
      const workspace = current.workspaces[workspaceId];

      if (!workspace) {
        return current;
      }

      workspace.name = name.trim();
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const deleteWorkspace = (workspaceId: string) => {
    const removedTabIds = new Set(workspaceState?.workspaces[workspaceId]?.tabIds ?? []);

    if (Array.from(removedTabIds).some((tabId) => activeRuns[tabId])) {
      setError("请先停止活动的基准包运行，再删除该工作区。");
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[workspaceId];

      if (!workspace) {
        return current;
      }

      for (const tabId of workspace.tabIds) {
        delete current.tabs[tabId];
      }

      delete current.workspaces[workspaceId];
      current.workspaceOrder = current.workspaceOrder.filter((id) => id !== workspaceId);

      if (current.workspaceOrder.length === 0) {
        const now = new Date().toISOString();
        const nextWorkspaceId = `workspace-${crypto.randomUUID()}`;
        const nextTabId = `tab-${crypto.randomUUID()}`;

        current.workspaceOrder = [nextWorkspaceId];
        current.activeWorkspaceId = nextWorkspaceId;
        current.workspaces[nextWorkspaceId] = {
          id: nextWorkspaceId,
          name: "我的工作区",
          tabIds: [nextTabId],
          activeTabId: nextTabId,
          createdAt: now,
          updatedAt: now
        };
        current.tabs[nextTabId] = {
          id: nextTabId,
          title: "新建标签页",
          benchPackId: null,
          loadedRunId: null,
          focusedScenarioId: null,
          modelSelections: [],
          samplingOverrides: {},
          executionMode: "parallel_by_test_case",
          runsPerTest: 1,
          createdAt: now,
          updatedAt: now
        };
      } else if (current.activeWorkspaceId === workspaceId) {
        current.activeWorkspaceId = current.workspaceOrder[0] ?? null;
      }

      return current;
    });

    if (removedTabIds.size > 0) {
      setRunSummaries((current) =>
        Object.fromEntries(Object.entries(current).filter(([tabId]) => !removedTabIds.has(tabId)))
      );
      setLiveRuns((current) =>
        Object.fromEntries(Object.entries(current).filter(([tabId]) => !removedTabIds.has(tabId)))
      );
      setActiveRuns((current) =>
        Object.fromEntries(Object.entries(current).filter(([tabId]) => !removedTabIds.has(tabId)))
      );
      setStoppingRuns((current) =>
        Object.fromEntries(Object.entries(current).filter(([tabId]) => !removedTabIds.has(tabId))) as Record<string, true>
      );
    }
  };

  const exportWorkspace = async (workspaceId: string) => {
    if (!workspaceState) {
      return;
    }

    try {
      const result = await window.benchlocal.workspaces.export({
        workspaceId,
        state: workspaceState
      });

      if (result.exported) {
        setAppNotice(`已导出工作区到 ${result.filePath}。`);
      }
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "导出工作区失败。");
    }
  };

  const importWorkspace = async () => {
    try {
      const result = await window.benchlocal.workspaces.import();

      if (!result.imported || !result.workspace || !result.tabs) {
        return;
      }

      const importedWorkspace = result.workspace;
      const importedTabs = result.tabs;
      const workspaceIdMap = new Map<string, string>();
      const tabIdMap = new Map<string, string>();
      const newWorkspaceId = `workspace-${crypto.randomUUID()}`;
      workspaceIdMap.set(importedWorkspace.id, newWorkspaceId);

      updateWorkspaceState((current) => {
        const now = new Date().toISOString();
        const nextTabIds = importedWorkspace.tabIds.map((tabId) => {
          const nextTabId = `tab-${crypto.randomUUID()}`;
          tabIdMap.set(tabId, nextTabId);
          const importedTab = importedTabs[tabId];

          if (importedTab) {
            const importedTabRecord = importedTab as typeof importedTab & {
              pluginId?: string | null;
            };
            current.tabs[nextTabId] = {
              ...importedTabRecord,
              id: nextTabId,
              benchPackId: importedTabRecord.benchPackId ?? importedTabRecord.pluginId ?? null,
              samplingOverrides: importedTab.samplingOverrides ?? {},
              executionMode: importedTab.executionMode ?? "parallel_by_test_case",
              runsPerTest: normalizeRunsPerTest(importedTab.runsPerTest),
              createdAt: importedTab.createdAt ?? now,
              updatedAt: now
            };
          }

          return nextTabId;
        });

        current.workspaceOrder.push(newWorkspaceId);
        current.activeWorkspaceId = newWorkspaceId;
        current.workspaces[newWorkspaceId] = {
          ...importedWorkspace,
          id: newWorkspaceId,
          name:
            Object.values(current.workspaces).some((workspace) => workspace.name === importedWorkspace.name)
              ? `${importedWorkspace.name} 已导入`
              : importedWorkspace.name,
          tabIds: nextTabIds,
          activeTabId: importedWorkspace.activeTabId ? tabIdMap.get(importedWorkspace.activeTabId) ?? nextTabIds[0] ?? null : nextTabIds[0] ?? null,
          createdAt: importedWorkspace.createdAt ?? now,
          updatedAt: now
        };

        return current;
      });

      setAppNotice(`已导入工作区 "${importedWorkspace.name}"。`);
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "导入工作区失败。");
    }
  };

  const activateWorkspace = (workspaceId: string) => {
    setWorkspaceContextMenu(null);
    updateWorkspaceState((current) => {
      current.activeWorkspaceId = workspaceId;
      return current;
    });
  };

  const createTab = (benchPackId: string) => {
    if (!activeWorkspace) {
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];

      if (!workspace) {
        return current;
      }

      const now = new Date().toISOString();
      const tabId = `tab-${crypto.randomUUID()}`;
      current.tabs[tabId] = {
        id: tabId,
        title: createTabTitle(benchPackId, benchPackInspections),
        benchPackId,
        loadedRunId: null,
        focusedScenarioId: null,
        modelSelections: [],
        samplingOverrides: {},
        executionMode: "parallel_by_test_case",
        runsPerTest: 1,
        createdAt: now,
        updatedAt: now
      };
      workspace.tabIds.push(tabId);
      workspace.activeTabId = tabId;
      workspace.updatedAt = now;
      return current;
    });
    setTabMenuOpen(false);
  };

  const duplicateTab = (tabId: string) => {
    if (!activeWorkspace) {
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      const tab = current.tabs[tabId];

      if (!workspace || !tab) {
        return current;
      }

      const now = new Date().toISOString();
      const duplicateTabId = `tab-${crypto.randomUUID()}`;
      current.tabs[duplicateTabId] = {
        id: duplicateTabId,
        title: `${tab.title} 副本`,
        benchPackId: tab.benchPackId,
        loadedRunId: null,
        focusedScenarioId: tab.focusedScenarioId,
        modelSelections: structuredClone(tab.modelSelections),
        samplingOverrides: structuredClone(tab.samplingOverrides ?? {}),
        executionMode: tab.executionMode,
        runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
        createdAt: now,
        updatedAt: now
      };

      const tabIndex = workspace.tabIds.indexOf(tabId);
      workspace.tabIds.splice(tabIndex >= 0 ? tabIndex + 1 : workspace.tabIds.length, 0, duplicateTabId);
      workspace.activeTabId = duplicateTabId;
      workspace.updatedAt = now;
      return current;
    });
    setTabContextMenu(null);
  };

  const assignBenchPackToTab = (tabId: string, benchPackId: string) => {
    updateWorkspaceState((current) => {
      const tab = current.tabs[tabId];

      if (!tab) {
        return current;
      }

      tab.title = createTabTitle(benchPackId, benchPackInspections);
      tab.benchPackId = benchPackId;
      tab.loadedRunId = null;
      tab.focusedScenarioId = null;
      tab.samplingOverrides = {};
      tab.updatedAt = new Date().toISOString();

      return current;
    });
    setTabMenuOpen(false);
  };

  const activateTab = (tabId: string) => {
    if (!activeWorkspace) {
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];

      if (!workspace) {
        return current;
      }

      workspace.activeTabId = tabId;
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const startEditingTab = (tabId: string, currentTitle: string) => {
    const width = tabChipRefs.current.get(tabId)?.offsetWidth ?? 180;
    setEditingTab({
      tabId,
      value: currentTitle,
      width
    });
  };

  const commitEditingTab = () => {
    if (!editingTab) {
      return;
    }

    const nextTitle = editingTab.value.trim() || "新建标签页";

    updateWorkspaceState((current) => {
      const tab = current.tabs[editingTab.tabId];

      if (!tab) {
        return current;
      }

      tab.title = nextTitle;
      tab.updatedAt = new Date().toISOString();
      return current;
    });

    setEditingTab(null);
  };

  const cancelEditingTab = () => {
    setEditingTab(null);
  };

  const reorderTab = (draggedId: string, targetId: string) => {
    if (!activeWorkspace || draggedId === targetId) {
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];

      if (!workspace) {
        return current;
      }

      const nextTabIds = [...workspace.tabIds];
      const fromIndex = nextTabIds.indexOf(draggedId);
      const toIndex = nextTabIds.indexOf(targetId);

      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }

      const [moved] = nextTabIds.splice(fromIndex, 1);
      nextTabIds.splice(toIndex, 0, moved);
      workspace.tabIds = nextTabIds;
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const closeTab = (tabId: string) => {
    if (!activeWorkspace) {
      return;
    }

    if (activeRuns[tabId]) {
      setError("关闭该标签页前请先停止基准包运行。");
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];

      if (!workspace) {
        return current;
      }

      workspace.tabIds = workspace.tabIds.filter((id) => id !== tabId);
      delete current.tabs[tabId];

      workspace.activeTabId =
        workspace.activeTabId === tabId ? workspace.tabIds[workspace.tabIds.length - 1] ?? null : workspace.activeTabId;
      workspace.updatedAt = new Date().toISOString();

      if (workspace.tabIds.length === 0) {
        const replacementTabId = `tab-${crypto.randomUUID()}`;
        current.tabs[replacementTabId] = {
          id: replacementTabId,
          title: "新建标签页",
          benchPackId: null,
          loadedRunId: null,
          focusedScenarioId: null,
          modelSelections: [],
          samplingOverrides: {},
          executionMode: "parallel_by_test_case",
          runsPerTest: 1,
          createdAt: workspace.updatedAt,
          updatedAt: workspace.updatedAt
        };
        workspace.tabIds = [replacementTabId];
        workspace.activeTabId = replacementTabId;
      }

      return current;
    });
    setRunSummaries((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setLiveRuns((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setActiveRuns((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const restoreHistoryRun = async (benchPackId: string, runId: string, mode: "history" | "replay" = "history") => {
    if (!activeTab) {
      return;
    }

    try {
      const summary = await window.benchlocal.benchPacks.loadHistory({ benchPackId, runId });
      setRunSummaries((current) => ({
        ...current,
        [activeTab.id]: summary
      }));
      updateWorkspaceState((current) => {
        const tab = current.tabs[activeTab.id];

        if (!tab) {
          return current;
        }

        tab.loadedRunId = summary.runId;
        tab.updatedAt = new Date().toISOString();
        return current;
      });
      setLiveRuns((current) => {
        const next = { ...current };
        delete next[activeTab.id];
        return next;
      });
      setLoadedHistoryRuns((current) => ({
        ...current,
        [activeTab.id]: {
          runId,
          startedAt: summary.startedAt,
          mode
        }
      }));
      if (summary.executionMode) {
        updateWorkspaceState((current) => {
          const tab = current.tabs[activeTab.id];

          if (!tab) {
            return current;
          }

          tab.executionMode = summary.executionMode ?? tab.executionMode;
          tab.updatedAt = new Date().toISOString();
          return current;
        });
      }
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "加载基准包历史失败。");
    }
  };

  const retryScenarioFromDetail = async (detail: DetailModalState) => {
    if (!workspaceState) {
      return;
    }

    if (!detail.runId) {
      setError("该场景尚不属于已保存的测试运行。");
      return;
    }

    const tab = workspaceState.tabs[detail.tabId];

    if (!tab || tab.benchPackId !== detail.benchPackId) {
      setError("该测试的原始标签页已不可用。");
      return;
    }

    if (hasUnsavedChanges) {
      const saved = await save();

      if (!saved) {
        return;
      }
    }

    const retryKey = detailModalKey(detail);
    const retryCellKey = getCellKey(detail.modelId, detail.scenarioId);
    setDetailModal((current) => (current && detailModalKey(current) === retryKey ? null : current));
    setLiveRuns((current) => {
      const existing = current[detail.tabId];

      if (existing) {
        return {
          ...current,
          [detail.tabId]: {
            ...existing,
            runId: existing.runId ?? detail.runId ?? undefined,
            activeCellKeys: existing.activeCellKeys.includes(retryCellKey)
              ? existing.activeCellKeys
              : [...existing.activeCellKeys, retryCellKey]
          }
        };
      }

      return {
        ...current,
        [detail.tabId]: {
          runId: detail.runId ?? undefined,
          events: [],
          resultsByModel: {},
          activeCellKeys: [retryCellKey]
        }
      };
    });

    try {
      await window.benchlocal.benchPacks.retryScenario({
        tabId: detail.tabId,
        benchPackId: detail.benchPackId,
        runId: detail.runId,
        scenarioId: detail.scenarioId,
        modelId: detail.modelId,
        generation: tab.samplingOverrides
      });
      const refreshedSummary = await window.benchlocal.benchPacks.loadHistory({
        benchPackId: detail.benchPackId,
        runId: detail.runId
      });

      if (!activeRuns[detail.tabId]) {
        setRunSummaries((current) => ({
          ...current,
          [detail.tabId]: refreshedSummary
        }));
      }
      await loadHistoryForBenchPack(detail.benchPackId);
      setAppNotice(`已对 ${detail.modelLabel ?? detail.modelId} 重新测试 ${detail.scenarioId}。`);
    } catch (retryError) {
      setLiveRuns((current) => {
        const existing = current[detail.tabId];

        if (!existing || !existing.activeCellKeys.includes(retryCellKey)) {
          return current;
        }

        return {
          ...current,
          [detail.tabId]: {
            ...existing,
            activeCellKeys: existing.activeCellKeys.filter((key) => key !== retryCellKey)
          }
        };
      });
      setError(retryError instanceof Error ? retryError.message : "重试所选测试失败。");
    }
  };

  const retryScenarioCells = async (
    tab: BenchLocalWorkspaceTab,
    inspection: BenchPackInspection,
    models: ResolvedTabModel[],
    cells: RetryScenarioCell[],
    label: string
  ) => {
    if (cells.length === 0) {
      return;
    }

    if (!workspaceState) {
      return;
    }

    if (!tab.benchPackId) {
      setError("该标签页尚未选择基准包。");
      return;
    }

    const summary = runSummaries[tab.id];

    if (!summary?.runId) {
      setError("请先运行该基准包，再重试单个结果。");
      return;
    }

    if (hasUnsavedChanges) {
      const saved = await save();

      if (!saved) {
        return;
      }
    }

    const activeCellKeys = cells.map((cell) => getCellKey(cell.modelId, cell.scenarioId));
    setLiveRuns((current) => {
      const existing = current[tab.id];
      const mergedActiveKeys = Array.from(new Set([...(existing?.activeCellKeys ?? []), ...activeCellKeys]));

      return {
        ...current,
        [tab.id]: {
          runId: existing?.runId ?? summary.runId,
          events: existing?.events ?? [],
          resultsByModel: existing?.resultsByModel ?? {},
          activeCellKeys: mergedActiveKeys
        }
      };
    });

    const retryGroups = groupRetryCellsForExecutionMode(cells, tab.executionMode, inspection.scenarios ?? [], models);
    const failures: string[] = [];

    const retryCell = async (cell: RetryScenarioCell) => {
      try {
        await window.benchlocal.benchPacks.retryScenario({
          tabId: tab.id,
          benchPackId: tab.benchPackId!,
          runId: summary.runId,
          scenarioId: cell.scenarioId,
          modelId: cell.modelId,
          runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
          generation: tab.samplingOverrides
        });
      } catch (retryError) {
        failures.push(`${getModelLabelForMessage(cell.modelId, models)} / ${cell.scenarioId}`);
      }
    };

    try {
      for (const group of retryGroups) {
        await Promise.all(group.map((cell) => retryCell(cell)));
      }

      const refreshedSummary = await window.benchlocal.benchPacks.loadHistory({
        benchPackId: tab.benchPackId,
        runId: summary.runId
      });

      if (!activeRuns[tab.id]) {
        setRunSummaries((current) => ({
          ...current,
          [tab.id]: refreshedSummary
        }));
      }

      await loadHistoryForBenchPack(tab.benchPackId);
      setAppNotice(`已重试 ${label}：${cells.length - failures.length}/${cells.length}。`);

      if (failures.length > 0) {
        setError(`部分重试未完成：${failures.slice(0, 3).join("、")}${failures.length > 3 ? "…" : ""}`);
      }
    } finally {
      setLiveRuns((current) => {
        const existing = current[tab.id];

        if (!existing) {
          return current;
        }

        return {
          ...current,
          [tab.id]: {
            ...existing,
            activeCellKeys: existing.activeCellKeys.filter((key) => !activeCellKeys.includes(key))
          }
        };
      });
    }
  };

  const clearLoadedHistoryRun = (tabId: string) => {
    updateWorkspaceState((current) => {
      const tab = current.tabs[tabId];

      if (!tab) {
        return current;
      }

      tab.loadedRunId = null;
      tab.updatedAt = new Date().toISOString();
      return current;
    });
    setLoadedHistoryRuns((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setRunSummaries((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setLiveRuns((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const clearLoadedHistoryForBenchPack = (benchPackId: string, runIds?: Set<string>) => {
    const affectedTabIds =
      workspaceState
        ? Object.values(workspaceState.tabs)
            .filter((tab) => {
              const loadedRun = loadedHistoryRuns[tab.id];
              if (tab.benchPackId !== benchPackId || !loadedRun) {
                return false;
              }

              return !runIds || runIds.has(loadedRun.runId);
            })
            .map((tab) => tab.id)
        : [];

    if (affectedTabIds.length === 0) {
      return;
    }

    updateWorkspaceState((current) => {
      for (const tabId of affectedTabIds) {
        const tab = current.tabs[tabId];

        if (!tab) {
          continue;
        }

        tab.loadedRunId = null;
        tab.updatedAt = new Date().toISOString();
      }

      return current;
    });

    setLoadedHistoryRuns((current) => {
      const next = { ...current };
      for (const tabId of affectedTabIds) {
        delete next[tabId];
      }
      return next;
    });

    setRunSummaries((current) => {
      const next = { ...current };
      for (const tabId of affectedTabIds) {
        delete next[tabId];
      }
      return next;
    });

    setLiveRuns((current) => {
      const next = { ...current };
      for (const tabId of affectedTabIds) {
        delete next[tabId];
      }
      return next;
    });
  };

  const handleWebPackRunSummarySaved = async (tabId: string, summary: BenchPackRunSummary) => {
    setRunSummaries((current) => ({
      ...current,
      [tabId]: summary
    }));

    if (loadedHistoryRuns[tabId]) {
      updateWorkspaceState((current) => {
        const tab = current.tabs[tabId];

        if (!tab) {
          return current;
        }

        tab.loadedRunId = summary.runId;
        tab.updatedAt = new Date().toISOString();
        return current;
      });
    }

    setLoadedHistoryRuns((current) => {
      const existing = current[tabId];

      if (!existing) {
        return current;
      }

      return {
        ...current,
        [tabId]: {
          ...existing,
          runId: summary.runId,
          startedAt: summary.startedAt
        }
      };
    });
    await loadHistoryForBenchPack(summary.benchPackId);
  };

  const deleteSelectedHistoryForBenchPack = async (benchPackId: string, benchPackName: string, runIds: string[]) => {
    try {
      const result = await window.benchlocal.benchPacks.deleteHistory({ benchPackId, runIds });
      const removedRunIds = new Set(result.removedRunIds);

      if (removedRunIds.size === 0) {
        setAppNotice("未找到所选的测试历史。");
        return;
      }

      setRunHistories((current) => ({
        ...current,
        [benchPackId]: (current[benchPackId] ?? []).filter((entry) => !removedRunIds.has(entry.runId))
      }));

      setHistoryModal((current) =>
        current?.benchPackId === benchPackId
          ? { ...current, entries: current.entries.filter((entry) => !removedRunIds.has(entry.runId)) }
          : current
      );
      clearLoadedHistoryForBenchPack(benchPackId, removedRunIds);
      setAppNotice(
        `已删除 ${benchPackName} 的 ${removedRunIds.size} 条所选历史记录。`
      );
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "删除基准包历史失败。");
    }
  };

  const saveProviderModal = async () => {
    if (!providerModal || !draft) {
      return;
    }

    const providerId = providerModal.form.id.trim();
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);

    nextConfig.providers[providerId] = {
      kind: providerModal.form.kind,
      name: providerModal.form.name.trim() || defaultProviderName(providerModal.form.kind),
      enabled: providerModal.form.enabled,
      base_url: providerModal.form.base_url.trim(),
      api_key: providerModal.form.api_key.trim() || undefined
    };

    const saved = await persistConfig(nextConfig, {
      notice: providerModal.mode === "create" ? "已添加提供商。" : "已更新提供商。",
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });

    if (!saved) {
      return;
    }

    setProviderModal(null);
  };

  const deleteProvider = async (providerId: string): Promise<boolean> => {
    if (!draft) {
      return false;
    }

    const providerName = getProviderDisplayName(draft.providers, providerId);
    const removedModelIds = new Set((draft?.models ?? []).filter((model) => model.provider === providerId).map((model) => model.id));
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);

    delete nextConfig.providers[providerId];
    nextConfig.models = nextConfig.models.filter((model) => model.provider !== providerId);

    const saved = await persistConfig(nextConfig, {
      notice: `已删除提供商 "${providerName}"。`,
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });

    if (!saved) {
      return false;
    }

    if (removedModelIds.size > 0) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.filter((selection) => !removedModelIds.has(selection.modelId));
        }
        return current;
      });
    }

    return true;
  };

  const duplicateProvider = async (providerId: string): Promise<void> => {
    if (!draft) {
      return;
    }

    const provider = draft.providers[providerId];
    if (!provider) {
      return;
    }

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    const nextProviderId = createUniqueProviderId(provider.kind, nextConfig.providers);
    const nextProviderName = createCopyLabel(
      getProviderDisplayName(draft.providers, providerId),
      Object.values(nextConfig.providers).map((candidate) => candidate.name)
    );

    nextConfig.providers[nextProviderId] = {
      ...provider,
      name: nextProviderName
    };

    await persistConfig(nextConfig, {
      notice: `已复制提供商 "${nextProviderName}"。`,
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
  };

  const confirmDeleteProvider = (providerId: string) => {
    const provider = draft?.providers[providerId];
    const linkedModelCount = (draft?.models ?? []).filter((model) => model.provider === providerId).length;

    setConfirmDialog({
      title: "删除提供商",
      subtitle:
        linkedModelCount > 0
          ? `删除 ${provider?.name ?? "该提供商"}？这将同时删除 ${linkedModelCount} 个关联模型，并从所有标签页选择中移除。`
          : `删除 ${provider?.name ?? "该提供商"}？`,
      confirmLabel: "删除提供商",
      tone: "danger",
      onConfirm: () => {
        void deleteProvider(providerId).then((deleted) => {
          if (deleted) {
            setProviderModal(null);
          }
        });
      }
    });
  };

  const openModelBrowser = async () => {
    if (!modelModal || !draft) {
      return;
    }

    const provider = draft.providers[modelModal.form.provider];
    const providerName = getProviderDisplayName(draft.providers, modelModal.form.provider);

    if (!provider) {
      setError("请先选择提供商。");
      return;
    }

    if (!providerSupportsModelDiscovery(provider)) {
      setError(`${providerName} 暂不支持浏览模型。`);
      return;
    }

    const cacheKey = `${provider.kind}::${provider.base_url}`;
    const cachedEntries = modelDiscoveryCacheRef.current[cacheKey];

    setModelBrowserModal({
      providerId: modelModal.form.provider,
      providerName,
      entries: cachedEntries ?? [],
      query: "",
      selectedModelId: modelModal.form.model.trim() || cachedEntries?.[0]?.id || null,
      loading: !cachedEntries,
      error: null
    });

    if (cachedEntries) {
      return;
    }

    try {
      const entries = await window.benchlocal.models.discover({ provider });
      modelDiscoveryCacheRef.current[cacheKey] = entries;
      setModelBrowserModal((current) =>
        current && current.providerId === modelModal.form.provider
          ? {
              ...current,
              entries,
              selectedModelId: current.selectedModelId ?? entries[0]?.id ?? null,
              loading: false
            }
          : current
      );
    } catch (discoverError) {
      setModelBrowserModal((current) =>
        current && current.providerId === modelModal.form.provider
          ? {
              ...current,
              loading: false,
              error:
                discoverError instanceof Error
                  ? discoverError.message
                  : `无法从 ${providerName} 加载模型。`
            }
          : current
      );
    }
  };

  const saveModelModal = async () => {
    if (!modelModal || !draft) {
      return;
    }

    const modelConfig = buildModelConfig(modelModal.form, draft?.providers ?? {});

    if (!modelConfig.provider || !modelConfig.model) {
      setError("必须填写模型提供商和模型标识。");
      return;
    }

    if (!draft?.providers[modelConfig.provider]) {
      setError(`模型提供商 "${getProviderDisplayName(draft.providers, modelConfig.provider)}" 尚不存在。`);
      return;
    }

    const previousModelId = modelModal.mode === "edit" ? draft?.models[modelModal.index]?.id ?? null : null;
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);

    if (modelModal.mode === "create") {
      nextConfig.models.push(modelConfig);
    } else {
      nextConfig.models[modelModal.index] = modelConfig;
    }

    const saved = await persistConfig(nextConfig, {
      notice: modelModal.mode === "create" ? "已添加模型。" : "已更新模型。",
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });

    if (!saved) {
      return;
    }

    if (previousModelId && previousModelId !== modelConfig.id) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.map((selection) =>
            selection.modelId === previousModelId ? { ...selection, modelId: modelConfig.id } : selection
          );
        }
        return current;
      });
    }

    setModelModal(null);
  };

  const deleteModel = async (index: number): Promise<boolean> => {
    if (!draft) {
      return false;
    }

    const removedModelId = draft?.models[index]?.id ?? null;
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.models.splice(index, 1);

    const saved = await persistConfig(nextConfig, {
      notice: "已删除模型。",
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });

    if (!saved) {
      return false;
    }

    if (removedModelId) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.filter((selection) => selection.modelId !== removedModelId);
        }
        return current;
      });
    }

    return true;
  };

  const duplicateModel = async (index: number): Promise<void> => {
    if (!draft) {
      return;
    }

    const model = draft.models[index];
    if (!model) {
      return;
    }

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    const nextModelLabel = createCopyLabel(
      model.label || model.model || model.id,
      nextConfig.models.map((candidate) => candidate.label)
    );
    const nextModel: BenchLocalModelConfig = {
      ...model,
      id: createUniqueModelId(model, nextConfig.models),
      label: nextModelLabel
    };

    nextConfig.models.push(nextModel);

    await persistConfig(nextConfig, {
      notice: `已复制模型 "${nextModelLabel}"。`,
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
  };

  const confirmDeleteModel = (index: number) => {
    const model = draft?.models[index];
    if (!model) {
      return;
    }

    const linkedTabCount = workspaceState
      ? Object.values(workspaceState.tabs).filter((tab) =>
          tab.modelSelections.some((selection) => selection.modelId === model.id)
        ).length
      : 0;

    setConfirmDialog({
      title: "删除模型",
      subtitle:
        linkedTabCount > 0
          ? `删除 ${model.label}？这将同时从 ${linkedTabCount} 个标签页选择中移除。`
          : `删除 ${model.label}？`,
      confirmLabel: "删除模型",
      tone: "danger",
      onConfirm: () => {
        void deleteModel(index).then((deleted) => {
          if (deleted) {
            setModelModal(null);
          }
        });
      }
    });
  };

  const startWebBenchPackState = (tab: BenchLocalWorkspaceTab, inspection: BenchPackInspection) => {
    setActiveRuns((current) => ({
      ...current,
      [tab.id]: { benchPackId: inspection.id, mode: "host" }
    }));
    setStoppingRuns((current) => {
      if (!current[tab.id]) {
        return current;
      }

      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: current[tab.id] ?? {
        events: [],
        resultsByModel: {},
        activeCellKeys: []
      }
    }));
  };

  const stopWebBenchPackState = (tabId: string) => {
    setActiveRuns((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setStoppingRuns((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setLiveRuns((current) => {
      if (!current[tabId]) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const requestWebBenchPackStop = (tabId: string) => {
    setStoppingRuns((current) => ({
      ...current,
      [tabId]: true
    }));
  };

  const renderWebBenchPackPane = (tab: BenchLocalWorkspaceTab) => {
    if (!draft || !tab.benchPackId) {
      return null;
    }

    const inspection = benchPackInspections.find((candidate) => candidate.id === tab.benchPackId);

    if (!inspection || (inspection.manifest?.type ?? "table") !== "web") {
      return null;
    }

    const isActive = tab.id === activeTab?.id;
    const tabRunSummary = runSummaries[tab.id] ?? null;
    const tabLoadedHistory = loadedHistoryRuns[tab.id] ?? null;
    const isTabRunning = Boolean(activeRuns[tab.id]);
    const isTabStopping = Boolean(stoppingRuns[tab.id]);

    return (
      <div
        key={tab.id}
        className={`tabbed-workspace-pane web-benchpack-pane${isActive ? " is-active" : " is-inactive"}`}
        aria-hidden={!isActive}
      >
        <WebBenchPackSection
          tab={tab}
          inspection={inspection}
          selectedModels={resolveTabModels(tab, draft.models)}
          providers={draft.providers}
          modelAvailabilityById={modelAvailabilityById}
          checkingModelAvailability={checkingModelAvailability}
          runSummary={tabRunSummary}
          loadedHistory={tabLoadedHistory}
          isRunning={isTabRunning}
          isStopping={isTabStopping}
          onStartState={() => startWebBenchPackState(tab, inspection)}
          onStopState={() => stopWebBenchPackState(tab.id)}
          onRequestStop={() => requestWebBenchPackStop(tab.id)}
          onEditModels={() =>
            setTabModelsModal({
              tabId: tab.id,
              selections: structuredClone(tab.modelSelections)
            })
          }
          onEditSampling={() =>
            setSamplingModal({
              tabId: tab.id,
              benchPackId: inspection.id,
              benchPackName: inspection.manifest?.name ?? inspection.id,
              defaults: {
                ...DEFAULT_BENCHLOCAL_GENERATION,
                ...(inspection.manifest?.samplingDefaults ?? {})
              },
              form: createSamplingForm(tab.samplingOverrides)
            })
          }
          onHistorySaved={(summary) => void handleWebPackRunSummarySaved(tab.id, summary)}
          onClearHistory={() => clearLoadedHistoryRun(tab.id)}
        />
      </div>
    );
  };

  return (
    <div>
      <main className="page-shell">
        <section className="desktop-shell">
          <header className={`topbar${isMacPlatform ? "" : " topbar-nonmac"}`}>
            <div className="topbar-leading">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="toolbar-icon-button"
                aria-label={sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
                title={sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
              >
                <Sidebar size={16} />
              </button>
              {!isMacPlatform ? (
                <div className="app-brand">
                  <h1>BenchLocal</h1>
                </div>
              ) : null}
            </div>

            <div className="topbar-main">
              {isMacPlatform ? (
                <div className="app-brand">
                  <h1>BenchLocal</h1>
                </div>
              ) : null}

              {!settingsOpen ? (
                <div className="toolbar-cluster">
                  {agentAccessState?.running ? (
                    <span className="status-chip status-ready">Agent API</span>
                  ) : null}
                  <BenchPackPickerTrigger
                    inspections={readyInspections}
                    open={tabMenuOpen}
                    setOpen={setTabMenuOpen}
                    onCreateTab={(benchPackId) => {
                      if (activeTab && !activeTab.benchPackId) {
                        assignBenchPackToTab(activeTab.id, benchPackId);
                        return;
                      }

                      createTab(benchPackId);
                    }}
                    disabled={!activeWorkspace}
                  />
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="ghost-button"
                    aria-label="打开设置"
                    title="设置"
                  >
                    <Cog size={16} />
                    设置
                  </button>
                  {appUpdateState?.status === "downloaded" ? (
                    <button
                      type="button"
                      onClick={() => void installDownloadedAppUpdate()}
                      className="button-warn header-update-button"
                      aria-label="重启 BenchLocal 以安装更新"
                      title={downloadedUpdateVersion ? `安装 BenchLocal ${downloadedUpdateVersion}` : "安装 BenchLocal 更新"}
                    >
                      <ArrowUp size={16} />
                      重启以更新
                    </button>
                  ) : null}
                </div>
              ) : draft ? (
                <div className="toolbar-cluster">
                  <div ref={themeMenuRef} className="settings-theme-dropdown">
                    <button
                      type="button"
                      className="ghost-button run-mode-button settings-theme-button"
                      onClick={() => setThemeMenuOpen((current) => !current)}
                      aria-haspopup="menu"
                      aria-expanded={themeMenuOpen}
                    >
                      <Palette size={15} />
                      <span className="settings-theme-button-label">Theme: {currentThemeLabel}</span>
                      <ChevronDown size={14} />
                    </button>
                    {themeMenuOpen ? (
                      <div className="run-mode-menu settings-theme-menu" role="menu">
                        {themeOptions.map((themeId) => (
                          <button
                            key={themeId}
                            type="button"
                            role="menuitemradio"
                            aria-checked={draft.ui.theme === themeId}
                            className={`run-mode-menu-item${draft.ui.theme === themeId ? " is-active" : ""}`}
                            onClick={() => {
                              setThemeMenuOpen(false);
                              void saveThemeSelection(themeId);
                            }}
                          >
                            {resolveThemeLabel(themeId, availableThemes, systemPrefersDark)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </header>

          {settingsOpen && draft ? (
            <SettingsScene
              settingsTab={settingsTab}
              setSettingsTab={setSettingsTab}
              draft={draft}
              loadState={loadState}
              hasUnsavedChanges={hasUnsavedChanges}
              isBusy={isBusy}
              providerIds={providerIds}
              benchPackInspections={benchPackInspections}
              registryEntries={registryEntries}
              registryWarning={registryWarning}
              benchPackMutations={benchPackMutations}
              verifierStatuses={verifierStatuses}
              agentAccessState={agentAccessState}
              onBack={() => {
                setSettingsNotice(null);
                setSettingsOpen(false);
              }}
              onSaveAdvanced={() => void save()}
              onResetAdvanced={reset}
              onCreateProvider={() => setProviderModal({ mode: "create", form: createEmptyProvider() })}
              onEditProvider={(providerId) =>
                setProviderModal({
                  mode: "edit",
                  initialId: providerId,
                  form: toProviderForm(providerId, draft.providers[providerId])
                })
              }
              onDuplicateProvider={(providerId) => void duplicateProvider(providerId)}
              onCreateModel={() => setModelModal({ mode: "create", form: createEmptyModel(providerIds[0] ?? "openrouter") })}
              onEditModel={(index) => setModelModal({ mode: "edit", index, form: toModelForm(draft.models[index]) })}
              onDuplicateModel={(index) => void duplicateModel(index)}
              onStartVerifier={async (benchPackId, benchPackName, verifierId) => {
                setError(null);
                setStoppingVerifierStarts((current) => {
                  if (!current[benchPackId]) {
                    return current;
                  }

                  const next = { ...current };
                  delete next[benchPackId];
                  return next;
                });
                setSettingsVerifierPreparationModal({
                  benchPackId,
                  progress: {
                    type: "verifier_preparing",
                    benchPackId,
                    benchPackName,
                    verifierId,
                    phase: "checking_docker",
                    message: "正在检查本地 Docker 可用性。"
                  }
                });

                try {
                  const status = await window.benchlocal.verifiers.start({ benchPackId });
                  setVerifierStatuses((current) => ({ ...current, [benchPackId]: status }));
                } catch (verifierError) {
                  if (isAbortLikeError(verifierError)) {
                    if (settingsOpenRef.current) {
                      setSettingsNotice(`已取消准备 ${verifierId}。`);
                    }
                  } else {
                    setError(verifierError instanceof Error ? verifierError.message : "启动验证器失败。");
                  }
                } finally {
                  setSettingsVerifierPreparationModal((current) => (current?.benchPackId === benchPackId ? null : current));
                  setStoppingVerifierStarts((current) => {
                    if (!current[benchPackId]) {
                      return current;
                    }

                    const next = { ...current };
                    delete next[benchPackId];
                    return next;
                  });
                }
              }}
              onStopVerifier={async (benchPackId) => {
                try {
                  const status = await window.benchlocal.verifiers.stop({ benchPackId });
                  setVerifierStatuses((current) => ({ ...current, [benchPackId]: status }));
                } catch (verifierError) {
                  setError(verifierError instanceof Error ? verifierError.message : "停止验证器失败。");
                }
              }}
              onDeleteVerifierImage={(benchPackId, benchPackName, verifierId) => {
                setConfirmDialog({
                  title: "删除验证器镜像",
                  subtitle: `删除 ${benchPackName} 中验证器 "${verifierId}" 的本地 Docker 镜像？下次启动该验证器时，BenchLocal 会重新拉取或构建。`,
                  confirmLabel: "删除镜像",
                  tone: "danger",
                  onConfirm: () => {
                    void (async () => {
                      setIsBusy(true);
                      setError(null);

                      try {
                        const result = await window.benchlocal.verifiers.deleteImage({ benchPackId, verifierId });
                        setVerifierStatuses((current) => ({ ...current, [benchPackId]: result.status }));
                        if (settingsOpenRef.current) {
                          setSettingsNotice(
                            result.removed
                              ? `已删除 Docker 镜像 ${result.image}。`
                              : `Docker 镜像 ${result.image} 本就不存在。`
                          );
                        }
                      } catch (verifierError) {
                        setError(verifierError instanceof Error ? verifierError.message : "删除验证器镜像失败。");
                      } finally {
                        setIsBusy(false);
                      }
                    })();
                  }
                });
              }}
              onRefreshRegistry={() => void loadRegistryEntries()}
              onInstallBenchPack={(benchPackId) => void installBenchPack(benchPackId)}
              onInstallBenchPackFromUrl={(url) => installBenchPackFromUrl(url)}
              onUpdateBenchPack={(benchPackId) => void updateBenchPack(benchPackId)}
              onUninstallBenchPack={(benchPackId) => void uninstallInstalledBenchPack(benchPackId)}
              onConfigureAgentAccess={(input) => void configureAgentAccess(input)}
              onRegenerateAgentToken={() => void regenerateAgentToken()}
              updateDraft={updateDraft}
              onUpdateVerifier={(benchPackId, verifierId, updater) => {
                void saveVerifierConfig(benchPackId, verifierId, updater);
              }}
            />
          ) : (
            <div className={`desktop-layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
	            <aside className={`desktop-sidebar${sidebarOpen ? "" : " is-hidden"}`}>
	              <div className="sidebar-section">
                  <div className="sidebar-section-header">
	                <p className="sidebar-label">工作区</p>
                    <button
                      type="button"
                      onClick={createWorkspace}
                      className="sidebar-section-action"
                      aria-label="新建工作区"
                      title="新建工作区"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
	              </div>

	              <div className="sidebar-section">
	                {workspaceState?.workspaceOrder.length ? (
	                  workspaceState.workspaceOrder.map((workspaceId) => {
	                    const workspace = workspaceState.workspaces[workspaceId];

	                    if (!workspace) {
	                      return null;
	                    }

	                    return (
	                      <div
	                        key={workspace.id}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            activateWorkspace(workspace.id);
                            setWorkspaceContextMenu({
                              workspaceId: workspace.id,
                              workspaceName: workspace.name,
                              x: event.clientX,
                              y: event.clientY
                            });
                          }}
	                        className={`sidebar-item${activeWorkspace?.id === workspace.id ? " is-active" : ""}`}
		                      >
		                        <button
                              type="button"
                              className="sidebar-item-main sidebar-item-select"
                              onClick={() => activateWorkspace(workspace.id)}
                              aria-current={activeWorkspace?.id === workspace.id ? "page" : undefined}
                            >
		                          <div className="sidebar-item-title">{workspace.name}</div>
		                          <div className="sidebar-item-meta">{workspace.tabIds.length} tab{workspace.tabIds.length === 1 ? "" : "s"}</div>
		                        </button>
	                          <div className="sidebar-item-actions">
	                            <button
	                              type="button"
                                className="sidebar-item-action"
                                title="重命名工作区"
                                aria-label={`重命名 ${workspace.name}`}
                                onClick={() => {
                                  setWorkspaceModal({
                                    mode: "rename",
                                    workspaceId: workspace.id,
                                    name: workspace.name
                                  });
                                }}
                              >
                                <Pencil size={13} />
                              </button>
	                          </div>
		                      </div>
	                    );
	                  })
	                ) : (
	                  <div className="sidebar-empty">暂无工作区。</div>
	                )}
	              </div>

                <div className="sidebar-footer">
                  <button type="button" onClick={() => void importWorkspace()} className="ghost-button sidebar-footer-button">
                    <FolderOpen size={14} />
                    导入工作区
                  </button>
                </div>

	            </aside>

	            <section className="desktop-main">
	              {isBusy && !draft ? <Banner tone="neutral">正在加载 BenchLocal 配置...</Banner> : null}

	              <div className="workspace-scroll">
	                {draft ? (
	                  activeWorkspace ? (
	                    <div className="tabbed-workspace">
	                      <div ref={tabStripShellRef} className="tab-strip-shell" onWheel={handleTabStripWheel}>
                          {activeTabMask ? (
                            <span
                              className="tab-strip-active-mask"
                              style={{
                                left: `${activeTabMask.left}px`,
                                width: `${activeTabMask.width}px`
                              }}
                            />
                          ) : null}
                          <div ref={tabStripRef} className="tab-strip" role="tablist" aria-label="打开基准包列表">
	                          {workspaceTabs.map((tab) => {
	                            const inspection = benchPackInspections.find((candidate) => candidate.id === tab.benchPackId);
                              const isTabRunning = Boolean(activeRuns[tab.id]);
                              const hasTabRetryActivity = (liveRuns[tab.id]?.activeCellKeys.length ?? 0) > 0;
                              const showTabSpinner = isTabRunning || hasTabRetryActivity;
                              const showWarning = !isTabRunning && inspection && inspection.status !== "ready";
                              const isEditingTab = editingTab?.tabId === tab.id;

		                            return (
		                              <div
		                                key={tab.id}
                                      role="tab"
                                      tabIndex={activeTab?.id === tab.id ? 0 : -1}
                                      aria-selected={activeTab?.id === tab.id}
                                      ref={(element) => {
                                        if (element) {
                                          tabChipRefs.current.set(tab.id, element);
                                        } else {
                                          tabChipRefs.current.delete(tab.id);
                                        }
                                      }}
                                      draggable={!isEditingTab}
                                      onDragStart={(event) => {
                                        event.dataTransfer.setData("text/plain", tab.id);
                                        event.dataTransfer.effectAllowed = "move";
                                        setDraggedTabId(tab.id);
                                      }}
                                      onDragEnd={() => setDraggedTabId(null)}
                                      onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        const sourceTabId = event.dataTransfer.getData("text/plain");
                                        reorderTab(sourceTabId, tab.id);
                                        setDraggedTabId(null);
                                      }}
                                      onDoubleClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        startEditingTab(tab.id, tab.title);
                                      }}
                                      onContextMenu={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (isEditingTab) {
                                          return;
                                        }
                                        activateTab(tab.id);
                                        setWorkspaceContextMenu(null);
                                        setTabContextMenu({
                                          tabId: tab.id,
                                          tabTitle: tab.title,
                                          x: event.clientX,
                                          y: event.clientY
                                        });
                                      }}
		                                onClick={() => {
                                        if (isEditingTab) {
                                          return;
                                        }

                                        activateTab(tab.id);
                                      }}
		                                onKeyDown={(event) => {
                                        if (isEditingTab) {
                                          return;
                                        }

                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          activateTab(tab.id);
                                          return;
                                        }

                                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                          event.preventDefault();
                                          const currentIndex = workspaceTabs.findIndex((candidate) => candidate.id === tab.id);
                                          const direction = event.key === "ArrowRight" ? 1 : -1;
                                          const nextTab = workspaceTabs[(currentIndex + direction + workspaceTabs.length) % workspaceTabs.length];

                                          if (nextTab) {
                                            activateTab(nextTab.id);
                                            window.requestAnimationFrame(() => tabChipRefs.current.get(nextTab.id)?.focus());
                                          }
                                        }
                                      }}
		                                className={`tab-chip${activeTab?.id === tab.id ? " is-active" : ""}${draggedTabId === tab.id ? " is-dragging" : ""}`}
                                      style={isEditingTab ? { width: `${editingTab.width}px` } : undefined}
		                              >
                                  {isEditingTab ? (
                                    <input
                                      type="text"
                                      value={editingTab.value}
                                      onChange={(event) =>
                                        setEditingTab((current) =>
                                          current && current.tabId === tab.id
                                            ? { ...current, value: event.target.value }
                                            : current
                                        )
                                      }
                                      onClick={(event) => event.stopPropagation()}
                                      onDoubleClick={(event) => event.stopPropagation()}
                                      onBlur={commitEditingTab}
                                      onFocus={(event) => event.currentTarget.select()}
                                      onKeyDown={(event) => {
                                        event.stopPropagation();

                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          commitEditingTab();
                                        } else if (event.key === "Escape") {
                                          event.preventDefault();
                                          cancelEditingTab();
                                        }
                                      }}
                                      autoFocus
                                      className="tab-chip-title-input"
                                    />
                                  ) : (
	                                  <span className="tab-chip-title">{tab.title}</span>
                                  )}
                                    {showTabSpinner ? (
                                      <span className="tab-chip-spinner" title="基准包正在运行">
                                        <span className="spinner" />
                                      </span>
                                    ) : null}
                                    {showWarning ? (
                                      <span className="tab-chip-warning" title={inspection.status.replaceAll("_", " ")}>
                                        <CircleAlert size={14} />
                                      </span>
                                    ) : null}
	                                <button
	                                  type="button"
	                                  className="tab-chip-close"
	                                  aria-label={`关闭 ${tab.title}`}
	                                  onClick={(event) => {
	                                    event.stopPropagation();
                                      if (isEditingTab) {
                                        cancelEditingTab();
                                      }
                                      setConfirmDialog({
                                        title: "关闭标签页",
                                        subtitle: `关闭 "${tab.title}"？该基准包标签页将从此工作区移除。`,
                                        confirmLabel: "关闭标签页",
                                        onConfirm: () => closeTab(tab.id)
                                      });
	                                  }}
	                                >
	                                  <X size={12} />
	                                </button>
	                              </div>
	                            );
	                          })}
                              <button
                                type="button"
                                onClick={() => setTabMenuOpen(true)}
                                className={`tab-chip-add-button${tabStripOverflow ? " is-sticky" : ""}`}
                                aria-label="新建标签页"
                                title="新建标签页"
                              >
                                <Plus size={14} />
                              </button>
                          </div>
                          <div className="tab-strip-controls">
                            <button
                              type="button"
                              onClick={() => scrollTabStrip(-240)}
                              className="tab-strip-nav-button"
                              aria-label="向左滚动标签页"
                              title="向左滚动标签页"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => scrollTabStrip(240)}
                              className="tab-strip-nav-button"
                              aria-label="向右滚动标签页"
                              title="向右滚动标签页"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
	                      <div className="tabbed-workspace-content">
                          {workspaceTabs.map(renderWebBenchPackPane)}
	                        {activeInspection && activeTab ? (
                            (activeInspection.manifest?.type ?? "table") === "web" ? null : (
                              <div className="tabbed-workspace-pane table-benchpack-pane is-active">
	                            <BenchmarkSection
                            tabId={activeTab.id}
	                            inspection={activeInspection}
                            verifierStatus={activeVerifierStatus}
                            runBlocker={activeRunBlocker}
	                            selectedModels={activeDisplayModels}
                            modelAvailabilityById={modelAvailabilityById}
                            checkingModelAvailability={checkingModelAvailability}
                            providers={draft.providers}
	                            runSummary={activeRunSummary}
                              historyEntries={runHistories[activeInspection.id] ?? []}
	                            liveRun={activeLiveRun}
                              loadedHistory={activeLoadedHistory}
	                            focusedScenarioId={
                                activeRuns[activeTab.id] &&
                                supportsLiveScenarioColumnFocus(activeTab.executionMode) &&
                                activeLiveScenarioFocus?.autoFollow &&
                                activeLiveScenarioFocus.liveScenarioId
                                  ? activeLiveScenarioFocus.liveScenarioId
                                  : activeTab.focusedScenarioId
                              }
	                            onFocusScenario={(scenarioId) => {
                                  if (activeRuns[activeTab.id] && supportsLiveScenarioColumnFocus(activeTab.executionMode)) {
                                    setLiveScenarioFocus((current) => {
                                      const existing = current[activeTab.id];
                                      const liveScenarioId = existing?.liveScenarioId ?? null;

                                      return {
                                        ...current,
                                        [activeTab.id]: {
                                          liveScenarioId,
                                          autoFollow: liveScenarioId === scenarioId
                                        }
                                      };
                                    });
                                  }

	                                updateWorkspaceState((current) => {
	                                  const tab = activeTab ? current.tabs[activeTab.id] : null;
	                                  if (!tab) {
	                                    return current;
	                                  }
	                                  tab.focusedScenarioId = scenarioId;
	                                  tab.updatedAt = new Date().toISOString();
	                                  return current;
	                                });
                                }}
	                            onEditModels={() =>
	                              setTabModelsModal({
	                                tabId: activeTab.id,
	                                selections: structuredClone(activeTab.modelSelections)
	                              })
	                            }
                              onEditSampling={() =>
                                setSamplingModal({
                                  tabId: activeTab.id,
                                  benchPackId: activeInspection.id,
                                  benchPackName: activeInspection.manifest?.name ?? activeInspection.id,
                                  defaults: {
                                    ...DEFAULT_BENCHLOCAL_GENERATION,
                                    ...(activeInspection.manifest?.samplingDefaults ?? {})
                                  },
                                  form: createSamplingForm(activeTab.samplingOverrides)
                                })
	                            }
	                            executionMode={activeTab.executionMode}
	                            runsPerTest={normalizeRunsPerTest(activeTab.runsPerTest)}
                              isViewingHistory={Boolean(activeLoadedHistory)}
                              onOpenHistory={() =>
                                setHistoryModal({
                                  benchPackId: activeInspection.id,
                                  benchPackName: activeInspection.manifest?.name ?? activeInspection.id,
                                  entries: runHistories[activeInspection.id] ?? []
                                })
                              }
                            onEditModelAlias={(model) =>
                              setModelAliasModal({
                                tabId: activeTab.id,
                                modelId: model.id,
                                baseLabel: model.label,
                                alias: model.alias ?? ""
                              })
                            }
	                            onChangeExecutionMode={(executionMode) =>
	                              updateWorkspaceState((current) => {
	                                const tab = activeTab ? current.tabs[activeTab.id] : null;
	                                if (!tab) {
	                                  return current;
	                                }
	                                tab.executionMode = executionMode;
	                                tab.updatedAt = new Date().toISOString();
	                                return current;
	                              })
                            }
                            onChangeRunsPerTest={(runsPerTest) =>
                              updateWorkspaceState((current) => {
                                const tab = activeTab ? current.tabs[activeTab.id] : null;
                                if (!tab) {
                                  return current;
                                }
                                tab.runsPerTest = runsPerTest;
                                tab.updatedAt = new Date().toISOString();
                                return current;
                              })
                            }
	                            isRunning={Boolean(activeRuns[activeTab.id])}
	                            isStopping={Boolean(stoppingRuns[activeTab.id])}
                              onOpenVerification={() => {
                                setSettingsTab("verification");
                                setSettingsOpen(true);
                              }}
                              onRefreshVerification={() => void loadVerifierStatuses()}
                              onRefreshModelAvailability={() => void refreshModelAvailability(activeDisplayModels)}
                              onClearHistory={() => clearLoadedHistoryRun(activeTab.id)}
                              onStartOver={() => resetTabRunState(activeTab)}
	                            onRun={() =>
                                void (
                                  activeLoadedHistory?.mode === "replay" && activeRunSummary
                                    ? replayTabRun(activeTab, activeRunSummary)
                                    : activeRunSummary && !isRunSummaryComplete(activeRunSummary)
                                    ? resumeTabRun(activeTab, activeRunSummary)
                                    : runTab(activeTab)
                                )
                              }
	                            onStop={() => void stopTabRun(activeTab.id)}
                              onRetryCells={(cells, label) =>
                                void retryScenarioCells(activeTab, activeInspection, activeDisplayModels, cells, label)
                              }
	                            onOpenDetail={setDetailModal}
	                          />
                              </div>
                            )
	                        ) : (
                            <div className="tabbed-workspace-pane is-active">
	                          <EmptyWorkspace
                              providerCount={Object.keys(draft?.providers ?? {}).length}
                              modelCount={draft?.models.length ?? 0}
                              installedBenchPackCount={readyInspections.length}
                              onOpenProviders={() => {
                                setSettingsTab("providers");
                                setSettingsOpen(true);
                              }}
                              onOpenModels={() => {
                                setSettingsTab("models");
                                setSettingsOpen(true);
                              }}
                              onOpenBenchPacks={() => {
                                setSettingsTab("benchPacks");
                                setSettingsOpen(true);
                              }}
                              onSelectBenchPack={
                                activeTab ? () => setTabMenuOpen(true) : undefined
                              }
                            />
                            </div>
	                        )}
	                      </div>
	                    </div>
	                  ) : (
	                    <EmptyWorkspace
                        providerCount={Object.keys(draft?.providers ?? {}).length}
                        modelCount={draft?.models.length ?? 0}
                        installedBenchPackCount={readyInspections.length}
                        onOpenProviders={() => {
                          setSettingsTab("providers");
                          setSettingsOpen(true);
                        }}
                        onOpenModels={() => {
                          setSettingsTab("models");
                          setSettingsOpen(true);
                        }}
                        onOpenBenchPacks={() => {
                          setSettingsTab("benchPacks");
                          setSettingsOpen(true);
                        }}
                      />
	                  )
	                ) : null}
	              </div>
                {logsOpen && !logsDetached ? (
                  <section className="bottom-drawer" style={{ flexBasis: `${logDrawerHeight}px` }}>
                    <div
                      className="bottom-drawer-resizer"
                      onMouseDown={() => {
                        document.body.dataset.logResizeActive = "true";
                      }}
                    />
                    <div className="bottom-drawer-header">
                      <div>
                        <p className="eyebrow">运行日志</p>
                        <div className="bottom-drawer-title">
                          {activeTab ? activeTab.title : "暂无活动标签页"}
                        </div>
                      </div>
                      <div className="section-actions">
                        <label className="drawer-toggle">
                          <input
                            type="checkbox"
                            checked={logsAutoScroll}
                            onChange={(event) => setLogsAutoScroll(event.target.checked)}
                          />
                          <span>自动滚动</span>
                        </label>
                        <span className="status-chip status-idle">{activeLogEvents.length} 条事件</span>
                        <button
                          type="button"
                          onClick={() => setLogsOpen(false)}
                          className="toolbar-icon-button"
                          aria-label="隐藏日志"
                          title="隐藏日志"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {activeLogEvents.length > 0 ? (
                      <div ref={logContainerRef} className="event-trail bottom-drawer-log">
                        {activeLogEvents.map((event, index) => (
                          <div key={`${event.type}-${index}`} className="event-row">
                            <span className="event-type">{event.type}</span>
                            <span className="event-payload"> {JSON.stringify(event)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bottom-drawer-empty">活动标签页暂无运行日志。</div>
                    )}
                  </section>
                ) : null}
	            </section>
            </div>
          )}
          {!settingsOpen ? (
            <footer className="status-footer">
              <div className="status-footer-group">
                <span className="status-footer-item">
                  {activeWorkspace?.name ?? "暂无工作区"}
                </span>
                <span className="status-footer-divider" />
                <span className="status-footer-item">
                  {activeTab?.title ?? "暂无标签页"}
                </span>
              </div>
              <div className="status-footer-group">
                <button
                  type="button"
                  onClick={() => setLogsOpen((current) => !current)}
                  className={`status-footer-button${logsOpen ? " is-active" : ""}`}
                >
                  <Logs size={13} />
                  {logsOpen ? "隐藏日志" : "显示日志"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (logsDetached) {
                      await window.benchlocal.logs.closeDetachedWindow();
                      setLogsDetached(false);
                      return;
                    }

                    await window.benchlocal.logs.openDetachedWindow();
                    setLogsDetached(true);
                    setLogsOpen(false);
                  }}
                  className={`status-footer-button${logsDetached ? " is-active" : ""}`}
                >
                  <Sidebar size={13} />
                  {logsDetached ? "关闭日志窗口" : "分离日志"}
                </button>
                <span className="status-footer-item">{activeLogEvents.length} 条事件</span>
              </div>
            </footer>
          ) : null}
        </section>

      </main>

      <ToastViewport messages={toastMessages} onDismiss={dismissToast} />

      {providerModal ? (
        <Modal
          title={providerModal.mode === "create" ? "添加提供商" : "编辑提供商"}
          subtitle="创建或更新共享提供商条目。"
          onClose={() => setProviderModal(null)}
          onSubmit={saveProviderModal}
          submitLabel={providerModal.mode === "create" ? "创建提供商" : "保存提供商"}
          leadingActions={
            providerModal.mode === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  confirmDeleteProvider(providerModal.initialId);
                }}
                className="button-danger"
              >
                <Trash2 size={14} />
                删除提供商
              </button>
            ) : undefined
          }
        >
          <div className="entry-grid two-col">
            <InlineSelectField
              label="提供商类型"
              value={providerModal.form.kind}
              options={PROVIDER_KIND_OPTIONS.map((option) => option.value)}
              getOptionLabel={(value) => providerKindLabel(value as BenchLocalProviderKind)}
              onChange={(value) =>
                setProviderModal((current) =>
                  current
                    ? {
                        ...current,
                        form: {
                          ...current.form,
                          id:
                            current.mode === "create"
                              ? `${value as BenchLocalProviderKind}-${crypto.randomUUID()}`
                              : current.form.id,
                          kind: value as BenchLocalProviderKind,
                          name:
                            current.form.name.trim() === "" || current.form.name === defaultProviderName(current.form.kind)
                              ? defaultProviderName(value as BenchLocalProviderKind)
                              : current.form.name,
                          base_url:
                            current.form.base_url === defaultProviderBaseUrl(current.form.kind)
                              ? defaultProviderBaseUrl(value as BenchLocalProviderKind)
                              : current.form.base_url
                        }
                      }
                    : current
                )
              }
            />
            <Field
              label="显示名称"
              value={providerModal.form.name}
              placeholder={defaultProviderName(providerModal.form.kind)}
              onChange={(value) =>
                setProviderModal((current) => current ? { ...current, form: { ...current.form, name: value } } : current)
              }
            />
            <Field
              label="API 密钥"
              type="password"
              value={providerModal.form.api_key}
              placeholder={defaultProviderApiKeyPlaceholder(providerModal.form.kind)}
              onChange={(value) => setProviderModal((current) => current ? { ...current, form: { ...current.form, api_key: value } } : current)}
            />
            <FieldToggle
              label="启用"
              checked={providerModal.form.enabled}
              onChange={(checked) => setProviderModal((current) => current ? { ...current, form: { ...current.form, enabled: checked } } : current)}
            />
          </div>
          <Field label="基础 URL" value={providerModal.form.base_url} onChange={(value) => setProviderModal((current) => current ? { ...current, form: { ...current.form, base_url: value } } : current)} />
        </Modal>
      ) : null}

      {modelModal ? (
        (() => {
          const selectedProvider = draft?.providers[modelModal.form.provider];
          const canBrowseModels = providerSupportsModelDiscovery(selectedProvider);

          return (
            <Modal
              title={modelModal.mode === "create" ? "添加模型" : "编辑模型"}
              subtitle="模型在所有已安装的基准包之间共享。"
              onClose={() => setModelModal(null)}
              onSubmit={saveModelModal}
              submitLabel={modelModal.mode === "create" ? "创建模型" : "保存模型"}
              leadingActions={
                modelModal.mode === "edit" ? (
                  <button
                    type="button"
                    onClick={() => {
                      confirmDeleteModel(modelModal.index);
                    }}
                    className="button-danger"
                  >
                    <Trash2 size={14} />
                    删除模型
                  </button>
                ) : undefined
              }
            >
              <div className="entry-grid two-col">
                <InlineSelectField
                  label="提供商"
                  value={modelModal.form.provider}
                  options={providerIds.length > 0 ? providerIds : ["openrouter"]}
                  getOptionLabel={(value) => getProviderDisplayName(draft?.providers ?? {}, value)}
                  onChange={(value) => setModelModal((current) => current ? { ...current, form: { ...current.form, provider: value } } : current)}
                />
                <Field label="分组" value={modelModal.form.group} placeholder="primary" onChange={(value) => setModelModal((current) => current ? { ...current, form: { ...current.form, group: value } } : current)} />
                <label className="field-block model-field-with-action">
                  <span className="field-label">模型标识</span>
                  <div className="model-field-with-action-row">
                    <input
                      type="text"
                      value={modelModal.form.model}
                      placeholder="openai/gpt-4.1"
                      onChange={(event) =>
                        setModelModal((current) => current ? { ...current, form: { ...current.form, model: event.target.value } } : current)
                      }
                      className="config-input"
                    />
                    <button
                      type="button"
                      onClick={() => void openModelBrowser()}
                      className="ghost-button ghost-button-compact"
                      disabled={!canBrowseModels}
                      title={
                        canBrowseModels
                          ? "浏览模型"
                          : "目前仅 OpenRouter 和 OpenAI 兼容提供商支持浏览模型。"
                      }
                    >
                      <LayoutList size={14} />
                      浏览模型
                    </button>
                  </div>
                </label>
                <Field label="显示名称" value={modelModal.form.label} placeholder="GPT-4.1（OpenRouter）" onChange={(value) => setModelModal((current) => current ? { ...current, form: { ...current.form, label: value } } : current)} />
                <Field
                  label="显示引用"
                  value={`${getProviderDisplayName(draft?.providers ?? {}, modelModal.form.provider)}：${modelModal.form.model}`.replace(/：$/, "")}
                  readOnly
                  onChange={() => undefined}
                />
                <FieldToggle
                  label="启用"
                  checked={modelModal.form.enabled}
                  onChange={(checked) => setModelModal((current) => current ? { ...current, form: { ...current.form, enabled: checked } } : current)}
                />
              </div>
            </Modal>
          );
        })()
      ) : null}

      {modelBrowserModal ? (
        <ModelBrowserModal
          state={modelBrowserModal}
          onClose={() => setModelBrowserModal(null)}
          onQueryChange={(query) =>
            setModelBrowserModal((current) => (current ? { ...current, query } : current))
          }
          onSelect={(modelId) =>
            setModelBrowserModal((current) => (current ? { ...current, selectedModelId: modelId } : current))
          }
          onSubmit={() => {
            if (!modelBrowserModal.selectedModelId) {
              return;
            }

            const selectedEntry = modelBrowserModal.entries.find(
              (entry) => entry.id === modelBrowserModal.selectedModelId
            );

            if (!selectedEntry) {
              return;
            }

            setModelModal((current) => {
              if (!current) {
                return current;
              }

              const providerName = getProviderDisplayName(draft?.providers ?? {}, current.form.provider);
              const currentDefaultLabel = current.form.model.trim()
                ? defaultModelLabel(providerName, current.form.model, undefined)
                : "";
              const nextLabel = defaultModelLabel(providerName, selectedEntry.id, selectedEntry.name);
              const shouldAutofillLabel =
                current.form.label.trim() === "" || current.form.label.trim() === currentDefaultLabel;

              return {
                ...current,
                form: {
                  ...current.form,
                  model: selectedEntry.id,
                  label: shouldAutofillLabel ? nextLabel : current.form.label
                }
              };
            });
            setModelBrowserModal(null);
          }}
        />
      ) : null}

      {tabModelsModal && draft ? (
        <TabModelsModal
          providers={draft.providers}
          models={draft.models}
          selections={tabModelsModal.selections}
          onClose={() => setTabModelsModal(null)}
          onChange={(selections) => setTabModelsModal((current) => (current ? { ...current, selections } : current))}
          onSubmit={() => {
            const nextSelections = normalizeTabModelSelections(tabModelsModal.selections);

            updateWorkspaceState((current) => {
              const tab = current.tabs[tabModelsModal.tabId];

              if (!tab) {
                return current;
              }

              tab.modelSelections = nextSelections;
              tab.updatedAt = new Date().toISOString();
              return current;
            });

            setTabModelsModal(null);
          }}
        />
      ) : null}

      {samplingModal ? (
        <SamplingModal
          benchPackName={samplingModal.benchPackName}
          defaults={samplingModal.defaults}
          form={samplingModal.form}
          onClose={() => setSamplingModal(null)}
          onChange={(form) => setSamplingModal((current) => (current ? { ...current, form } : current))}
          onSubmit={() => {
            const parsed = parseSamplingForm(samplingModal.form);

            if (parsed.error) {
              setError(parsed.error);
              return;
            }

            updateWorkspaceState((current) => {
              const tab = current.tabs[samplingModal.tabId];

              if (!tab) {
                return current;
              }

              tab.samplingOverrides = parsed.value ?? {};
              tab.updatedAt = new Date().toISOString();
              return current;
            });

            setSamplingModal(null);
          }}
        />
      ) : null}

      {modelAliasModal && draft ? (
        <Modal
          title="编辑模型别名"
          subtitle={`仅在当前标签页中覆盖该模型的显示名称。默认标签：${modelAliasModal.baseLabel}`}
          onClose={() => setModelAliasModal(null)}
          onSubmit={() => {
            updateWorkspaceState((current) => {
              const tab = current.tabs[modelAliasModal.tabId];

              if (!tab) {
                return current;
              }

              tab.modelSelections = upsertTabModelAlias(
                tab,
                draft.models,
                modelAliasModal.modelId,
                modelAliasModal.alias
              );
              tab.updatedAt = new Date().toISOString();
              return current;
            });

            setModelAliasModal(null);
          }}
          submitLabel="保存别名"
        >
          <Field
            label="别名"
            value={modelAliasModal.alias}
            placeholder={modelAliasModal.baseLabel}
            onChange={(value) =>
              setModelAliasModal((current) => (current ? { ...current, alias: value } : current))
            }
          />
        </Modal>
      ) : null}

      {aboutDialogOpen ? (
        <AboutDialog
          metadata={appMetadata}
          updateState={appUpdateState}
          onCheckForUpdates={() => void checkForAppUpdates()}
          onInstallUpdate={() => void installDownloadedAppUpdate()}
          onClose={() => setAboutDialogOpen(false)}
        />
      ) : null}

      {workspaceModal ? (
        <Modal
          title="重命名工作区"
          subtitle="修改该工作区的显示名称。"
          onClose={() => setWorkspaceModal(null)}
          onSubmit={() => {
            if (!workspaceModal.name.trim()) {
              setError("工作区名称为必填项。");
              return;
            }

            renameWorkspace(workspaceModal.workspaceId, workspaceModal.name);
            setWorkspaceModal(null);
          }}
          submitLabel="保存工作区"
        >
          <Field
            label="工作区名称"
            value={workspaceModal.name}
            onChange={(value) => setWorkspaceModal((current) => (current ? { ...current, name: value } : current))}
          />
        </Modal>
      ) : null}

      {historyModal ? (
        <HistoryModal
          benchPackName={historyModal.benchPackName}
          entries={historyModal.entries}
          onClose={() => setHistoryModal(null)}
          onOpenRun={(runId, mode) => {
            void restoreHistoryRun(historyModal.benchPackId, runId, mode);
            setHistoryModal(null);
          }}
          onDeleteSelected={(runIds) =>
            setConfirmDialog({
              title: `Delete ${runIds.length} selected ${
                runIds.length === 1 ? "history" : "histories"
              } for ${historyModal.benchPackName}?`,
              subtitle: "这将永久删除所选的已保存测试运行。",
              confirmLabel: "删除所选",
              tone: "danger",
              onConfirm: () => {
                void deleteSelectedHistoryForBenchPack(historyModal.benchPackId, historyModal.benchPackName, runIds);
              }
            })
          }
        />
      ) : null}

      {confirmDialog ? (
        <Modal
          title={confirmDialog.title}
          subtitle={confirmDialog.subtitle}
          onClose={() => setConfirmDialog(null)}
          onSubmit={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
          submitLabel={confirmDialog.confirmLabel}
          submitTone={confirmDialog.tone === "danger" ? "danger" : "primary"}
        />
      ) : null}

      {settingsVerifierPreparationModal ? (
        <VerifierPreparationModal
          benchPackName={settingsVerifierPreparationModal.progress.benchPackName}
          verifierId={settingsVerifierPreparationModal.progress.verifierId}
          message={settingsVerifierPreparationModal.progress.message}
          isCancelling={Boolean(stoppingVerifierStarts[settingsVerifierPreparationModal.benchPackId])}
          onCancel={() => void cancelSettingsVerifierStart(settingsVerifierPreparationModal.benchPackId)}
        />
      ) : verifierPreparationModal ? (
        <VerifierPreparationModal
          benchPackName={verifierPreparationModal.progress.benchPackName}
          verifierId={verifierPreparationModal.progress.verifierId}
          message={verifierPreparationModal.progress.message}
          isCancelling={Boolean(stoppingRuns[verifierPreparationModal.tabId])}
          onCancel={() => void stopTabRun(verifierPreparationModal.tabId)}
        />
      ) : null}

      {workspaceContextMenu ? (
        <div
          className="workspace-context-menu"
          style={{
            left: Math.min(workspaceContextMenu.x, window.innerWidth - 196),
            top: Math.min(workspaceContextMenu.y, window.innerHeight - 116)
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => {
              setWorkspaceContextMenu(null);
              void exportWorkspace(workspaceContextMenu.workspaceId);
            }}
          >
            <Save size={14} />
            <span>导出工作区</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item is-danger"
            onClick={() => {
              setWorkspaceContextMenu(null);
              setConfirmDialog({
                title: "删除工作区",
                subtitle: `删除 "${workspaceContextMenu.workspaceName}" 及其所有标签页？此操作无法撤销。`,
                confirmLabel: "删除工作区",
                tone: "danger",
                onConfirm: () => deleteWorkspace(workspaceContextMenu.workspaceId)
              });
            }}
          >
            <Trash2 size={14} />
            <span>删除工作区</span>
          </button>
        </div>
      ) : null}

      {tabContextMenu ? (
        <div
          className="workspace-context-menu"
          style={{
            left: Math.min(tabContextMenu.x, window.innerWidth - 196),
            top: Math.min(tabContextMenu.y, window.innerHeight - 156)
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => duplicateTab(tabContextMenu.tabId)}
          >
            <Copy size={14} />
            <span>复制标签页</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => {
              setTabContextMenu(null);
              startEditingTab(tabContextMenu.tabId, tabContextMenu.tabTitle);
            }}
          >
            <Pencil size={14} />
            <span>重命名标签页</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item is-danger"
            onClick={() => {
              setTabContextMenu(null);
              setConfirmDialog({
                title: "关闭标签页",
                subtitle: `关闭 "${tabContextMenu.tabTitle}"？该基准包标签页将从此工作区移除。`,
                confirmLabel: "关闭标签页",
                onConfirm: () => closeTab(tabContextMenu.tabId)
              });
            }}
          >
            <X size={14} />
            <span>关闭标签页</span>
          </button>
        </div>
      ) : null}

      {detailModal ? (
        <Modal
          title={`${detailModal.benchPackId} · ${detailModal.scenarioId}`}
          subtitle={`${detailModal.modelLabel ?? detailModal.modelId} · ${detailModal.summary}`}
          onClose={() => setDetailModal(null)}
          onSubmit={() => setDetailModal(null)}
          submitLabel="关闭"
          leadingActions={
            <button
              type="button"
              className="ghost-button"
              onClick={() => void retryScenarioFromDetail(detailModal)}
              disabled={!detailModal.runId}
            >
              <RotateCcw size={14} />
              重试
            </button>
          }
        >
          <div className="dialog-summary">
            <div className="dialog-summary-copy">
              <span className="dialog-summary-label">状态</span>
              <span className="dialog-summary-value">
                {detailModal.errorType === "provider_error" ? "提供商 HTTP 错误" : "校验结果"}
              </span>
            </div>
            <span
              className={`status-chip ${
                detailModal.errorType === "provider_error"
                  ? "status-idle"
                  : detailModal.status === "pass"
                  ? "status-done"
                  : detailModal.status === "partial"
                    ? "status-not-installed"
                    : "status-danger"
              }`}
            >
              {detailModal.errorType === "provider_error" ? "提供商错误" : resultStatusLabel(detailModal.status)}
            </span>
          </div>
          {detailModal.timings?.durationMs !== undefined ? (
            <div className="dialog-summary">
              <div className="dialog-summary-copy">
                <span className="dialog-summary-label">实际耗时</span>
                <span className="dialog-summary-value">
                  {formatDurationMs(detailModal.timings.durationMs)}
                </span>
              </div>
              {detailModal.timings.completedAt ? (
                <span className="status-chip status-idle">
                  {new Date(detailModal.timings.completedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          ) : null}
          {detailModal.score !== undefined || detailModal.points !== undefined ? (
            <div className="dialog-summary">
              <div className="dialog-summary-copy">
                <span className="dialog-summary-label">场景得分</span>
                <span className="dialog-summary-value">
                  {detailModal.score ?? "—"}{detailModal.points !== undefined ? ` / ${detailModal.points}` : ""}
                </span>
              </div>
            </div>
          ) : null}
          {detailModal.note ? (
            <div className="result-detail-note">
              <span className="dialog-summary-label">备注</span>
              <p>{detailModal.note}</p>
            </div>
          ) : null}
          {detailModal.output ? (
            <details className="result-detail-section" open>
              <summary>模型输出</summary>
              <pre className="dialog-log">{formatStructuredDetail(detailModal.output)}</pre>
            </details>
          ) : null}
          {detailModal.verifier ? (
            <details className="result-detail-section">
              <summary>验证证据</summary>
              <pre className="dialog-log">{formatStructuredDetail(detailModal.verifier)}</pre>
            </details>
          ) : null}
          {detailModal.artifacts?.length ? (
            <details className="result-detail-section">
              <summary>Artifacts ({detailModal.artifacts.length})</summary>
              <pre className="dialog-log">{formatStructuredDetail(detailModal.artifacts)}</pre>
            </details>
          ) : null}
          <details className="result-detail-section" open={!detailModal.output}>
            <summary>原始轨迹</summary>
            <pre className="dialog-log">{detailModal.rawLog}</pre>
          </details>
        </Modal>
      ) : null}
    </div>
  );
}

function BenchPackPickerDialog({
  inspections,
  open,
  setOpen,
  onSelectBenchPack,
  title = "新建标签页",
  subtitle = "选择要在此工作区打开的基准包。",
  actionLabel = "打开基准包"
}: {
  inspections: BenchPackInspection[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelectBenchPack: (benchPackId: string) => void;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const filteredInspections = inspections.filter((inspection) => {
    const haystack = [
      inspection.manifest?.name,
      inspection.id,
      inspection.manifest?.description,
      inspection.manifest?.author
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.trim().toLowerCase());
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedInspection =
    filteredInspections.find((inspection) => inspection.id === selectedId) ??
    filteredInspections[0] ??
    null;
  const openBenchPack = (inspection: BenchPackInspection) => {
    if (inspection.status !== "ready") {
      return;
    }

    onSelectBenchPack(inspection.id);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedId((current) => {
      if (current && filteredInspections.some((inspection) => inspection.id === current)) {
        return current;
      }

      return filteredInspections[0]?.id ?? null;
    });
  }, [open, filteredInspections]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell dialog-shell-wide benchpack-picker-shell" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-header">
          <div>
            <h3 className="dialog-title">{title}</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>{subtitle}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="dialog-close-button" aria-label="关闭对话框">
            <X size={16} />
          </button>
        </div>

        <div className="benchpack-picker-body">
          <div className="benchpack-picker-list">
            <label className="field-block">
              <span className="field-label">搜索</span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索基准包"
                className="config-input"
              />
            </label>

            <div className="benchpack-picker-options">
              {filteredInspections.map((inspection) => (
                <button
                  key={inspection.id}
                  type="button"
                  className={`benchpack-option${selectedInspection?.id === inspection.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(inspection.id)}
                  onDoubleClick={() => openBenchPack(inspection)}
                >
                  <div className="benchpack-option-main">
                    <div className="settings-row-primary">{inspection.manifest?.name ?? inspection.id}</div>
                    <div className="settings-row-secondary settings-mono-cell">{inspection.id}</div>
                  </div>
                  <span className={`status-chip ${statusClasses(inspection.status)}`}>
                    {inspection.status.replaceAll("_", " ")}
                  </span>
                </button>
              ))}
              {filteredInspections.length === 0 ? (
                <div className="sidebar-empty">没有匹配搜索的基准包。</div>
              ) : null}
            </div>
          </div>

          <div className="benchpack-picker-detail">
            {selectedInspection ? (
              <>
                <div>
                  <p className="eyebrow">基准包</p>
                  <h3 className="panel-title" style={{ marginTop: "8px" }}>
                    {selectedInspection.manifest?.name ?? selectedInspection.id}
                  </h3>
                  <p className="section-copy" style={{ marginTop: "10px" }}>
                    {selectedInspection.manifest?.description ?? "暂无描述。"}
                  </p>
                </div>

                <div className="benchpack-picker-meta">
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">作者</span>
                    <span className="benchpack-stat-value benchpack-meta-value">
                      {selectedInspection.manifest?.author ?? "未知"}
                    </span>
                  </div>
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">测试数</span>
                    <span className="benchpack-stat-value">{selectedInspection.scenarioCount ?? 0}</span>
                  </div>
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">版本</span>
                    <span className="benchpack-stat-value benchpack-meta-value">
                      {selectedInspection.manifest?.version ?? "n/a"}
                    </span>
                  </div>
                </div>

                <div className="benchpack-picker-badges">
                  <span className={`status-chip ${statusClasses(selectedInspection.status)}`}>
                    {selectedInspection.status.replaceAll("_", " ")}
                  </span>
                  <span className="status-chip status-idle">
                    {selectedInspection.manifest?.capabilities.tools ? "支持工具" : "不支持工具"}
                  </span>
                  <span className="status-chip status-idle">
                    {selectedInspection.manifest?.capabilities.verification ? "需要验证器" : "无额外依赖"}
                  </span>
                </div>

                <div className="benchpack-picker-footer">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openBenchPack(selectedInspection)}
                    disabled={selectedInspection.status !== "ready"}
                  >
                    <Plus size={14} />
                    {actionLabel}
                  </button>
                </div>
              </>
            ) : (
              <div className="entry-card" style={{ marginTop: "40px" }}>
                <p className="eyebrow">未安装任何基准包</p>
                <h3 className="panel-title" style={{ marginTop: "8px" }}>从设置安装基准包</h3>
                <p className="section-copy" style={{ marginTop: "10px" }}>
                  BenchLocal now starts with zero installed Bench Packs. Open Settings, go to Bench Packs, and install one from the official registry.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchPackPickerTrigger({
  inspections,
  open,
  setOpen,
  onCreateTab,
  disabled
}: {
  inspections: BenchPackInspection[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreateTab: (benchPackId: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ghost-button dropdown-trigger"
        disabled={disabled}
      >
        <Plus size={14} />
        <span>新建标签页</span>
      </button>

      <BenchPackPickerDialog
        inspections={inspections}
        open={open}
        setOpen={setOpen}
        onSelectBenchPack={onCreateTab}
      />
    </>
  );
}

function WebBenchPackSection({
  tab,
  inspection,
  selectedModels,
  providers,
  modelAvailabilityById,
  checkingModelAvailability,
  runSummary,
  loadedHistory,
  isRunning,
  isStopping,
  onStartState,
  onStopState,
  onRequestStop,
  onEditModels,
  onEditSampling,
  onHistorySaved,
  onClearHistory
}: {
  tab: BenchLocalWorkspaceTab;
  inspection: BenchPackInspection;
  selectedModels: ResolvedTabModel[];
  providers: Record<string, BenchLocalProviderConfig>;
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  runSummary: BenchPackRunSummary | null;
  loadedHistory: LoadedHistoryEntry | null;
  isRunning: boolean;
  isStopping: boolean;
  onStartState: () => void;
  onStopState: () => void;
  onRequestStop: () => void;
  onEditModels: () => void;
  onEditSampling: () => void;
  onHistorySaved: (summary: BenchPackRunSummary) => void;
  onClearHistory: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const liveRunIdRef = useRef<string | null>(null);
  const [bridgeTargetOrigin, setBridgeTargetOrigin] = useState<string | null>(null);
  const manifest = inspection.manifest;
  const entryUrl = manifest?.entry ?? "";
  const frameKey = `${inspection.id}-${loadedHistory?.runId ?? "live"}-${entryUrl}`;
  const entryOrigin = getOriginFromUrl(entryUrl);
  const allowedOrigins = useMemo(
    () => new Set([entryOrigin, ...(manifest?.web?.allowedOrigins ?? [])].filter((origin): origin is string => Boolean(origin))),
    [entryOrigin, manifest?.web?.allowedOrigins]
  );
  const permissions = useMemo(() => new Set<string>(manifest?.web?.permissions ?? []), [manifest?.web?.permissions]);
  const selectedModelIds = useMemo(() => selectedModels.map((model) => model.id), [selectedModels]);
  const bridgeModels = useMemo(
    () =>
      selectedModels.map(({ displayLabel, alias: _alias, ...model }) => ({
        ...model,
        providerId: model.provider,
        provider: getProviderDisplayName(providers, model.provider),
        label: displayLabel
      })),
    [providers, selectedModels]
  );
  const selectedModelAvailability = useMemo(
    () => selectedModels.map((model) => getModelAvailabilityView(model, modelAvailabilityById, checkingModelAvailability)),
    [checkingModelAvailability, modelAvailabilityById, selectedModels]
  );

  const postHostEvent = useCallback((event: string, payload?: unknown): boolean => {
    const iframeWindow = iframeRef.current?.contentWindow;

    if (!iframeWindow || !bridgeTargetOrigin) {
      return false;
    }

    try {
      iframeWindow.postMessage(
        {
          source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
          bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
          event,
          payload
        },
        bridgeTargetOrigin
      );
      return true;
    } catch (error) {
      console.warn(`框架就绪前已跳过 Web 基准包宿主事件 "${event}"。`, error);
      return false;
    }
  }, [bridgeTargetOrigin]);

  useEffect(() => {
    setBridgeTargetOrigin(null);
    liveRunIdRef.current = null;
  }, [frameKey]);

  useEffect(() => {
    if (!loadedHistory && runSummary?.runId) {
      liveRunIdRef.current = runSummary.runId;
    }
  }, [loadedHistory, runSummary?.runId]);

  useEffect(() => {
    if (!bridgeTargetOrigin) {
      return;
    }

    postHostEvent("models.changed", {
      models: bridgeModels,
      availability: selectedModelAvailability
    });
  }, [bridgeModels, bridgeTargetOrigin, postHostEvent, selectedModelAvailability]);

  const requestStop = () => {
    onRequestStop();
    postHostEvent("runs.stopRequested", {
      requestedAt: new Date().toISOString(),
      reason: "user"
    });
  };

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;

    if (!iframeWindow || !manifest || !entryUrl) {
      return;
    }

    const postResponse = (targetWindow: Window, targetOrigin: string, requestId: string, result: unknown, ok = true) => {
      targetWindow.postMessage(
        ok
          ? {
              source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              requestId,
              ok: true,
              result
            }
          : {
              source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              requestId,
              ok: false,
              error: {
                message: result instanceof Error ? result.message : String(result)
              }
            },
        targetOrigin
      );
    };

    const postStreamEvent = (
      targetWindow: Window,
      targetOrigin: string,
      streamId: string,
      event: BenchLocalChatStreamEvent,
      done?: boolean
    ) => {
      targetWindow.postMessage(
        {
          source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
          bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
          streamId,
          event,
          done
        },
        targetOrigin
      );
    };

    const requirePermission = (permission: string) => {
      if (!permissions.has(permission)) {
        throw new Error(`Web 基准包权限被拒绝：${permission}。`);
      }
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeWindow || !isWebPackBridgeRequest(event.data)) {
        return;
      }

      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const request = event.data;
      const targetWindow = event.source as Window;
      const targetOrigin = event.origin;
      setBridgeTargetOrigin((current) => (current === targetOrigin ? current : targetOrigin));

      void (async () => {
        switch (request.method) {
          case "capabilities":
            postResponse(targetWindow, targetOrigin, request.requestId, {
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              permissions: Array.from(permissions),
              pack: {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                entry: manifest.entry,
                buildId: manifest.web?.buildId
              },
              history: {
                runId: runSummary?.runId,
                mode: loadedHistory ? "history" : "live",
                playback: manifest.web?.historyPlayback === true
              }
            });
            break;
          case "models.list":
            requirePermission("models:list");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              models: bridgeModels,
              availability: selectedModelAvailability
            });
            break;
          case "models.getSelected":
            requirePermission("models:read");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              models: bridgeModels,
              availability: selectedModelAvailability
            });
            break;
          case "inference.chat":
            requirePermission("inference:chat");
            postResponse(
              targetWindow,
              targetOrigin,
              request.requestId,
              await window.benchlocal.webPacks.chat(request.payload as BenchLocalChatRequest)
            );
            break;
          case "inference.streamChat": {
            requirePermission("inference:stream");
            if (!request.streamId) {
              throw new Error("流式推理需要流 ID。");
            }

            let unsubscribe: () => void = () => undefined;
            unsubscribe = window.benchlocal.webPacks.streamChat(
              {
                streamId: request.streamId,
                request: request.payload as BenchLocalChatRequest
              },
              (payload) => {
                postStreamEvent(targetWindow, targetOrigin, payload.streamId, payload.event, payload.done);

                if (payload.done) {
                  unsubscribe();
                }
              }
            );
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          }
          case "runs.startState":
            requirePermission("runs:write");
            onStartState();
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          case "runs.stopState":
            requirePermission("runs:write");
            onStopState();
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          case "runs.updateProgress": {
            requirePermission("runs:write");
            const payload = isRecord(request.payload) ? request.payload : {};
            const status = typeof payload.status === "string" ? payload.status as WebBenchPackHistoryPayload["status"] : "running";
            const summary = await window.benchlocal.webPacks.saveHistory({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              payload: {
                status,
                metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
                events: [{
                  type: "progress",
                  createdAt: new Date().toISOString(),
                  payload
                }]
              }
            });
            liveRunIdRef.current = summary.runId;
            onHistorySaved(summary);
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true, runId: summary.runId });
            break;
          }
          case "history.load":
            requirePermission("history:read");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              runId: runSummary?.runId,
              payload: runSummary?.webHistory
            });
            break;
          case "history.save": {
            requirePermission("history:write");
            const summary = await window.benchlocal.webPacks.saveHistory({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              payload: request.payload as WebBenchPackHistoryPayload
            });
            liveRunIdRef.current = summary.runId;
            onHistorySaved(summary);
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true, runId: summary.runId, summary });
            break;
          }
          case "history.writeArtifact": {
            requirePermission("artifacts:write");
            const artifactPayload = request.payload as {
              kind: string;
              label: string;
              path?: string;
              contentType?: string;
              content: unknown;
            };
            const result = await window.benchlocal.webPacks.writeArtifact({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              artifact: artifactPayload
            });
            liveRunIdRef.current = result.summary.runId;
            onHistorySaved(result.summary);
            postResponse(targetWindow, targetOrigin, request.requestId, result.artifact satisfies ArtifactRef);
            break;
          }
          default:
            throw new Error(`不支持的 Web 基准包桥接方法：${request.method}。`);
        }
      })().catch((error) => {
        postResponse(targetWindow, targetOrigin, request.requestId, error, false);
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    allowedOrigins,
    bridgeModels,
    entryUrl,
    inspection.id,
    loadedHistory,
    manifest,
    onHistorySaved,
    onStartState,
    onStopState,
    permissions,
    runSummary,
    selectedModelAvailability,
    selectedModelIds,
    tab.loadedRunId
  ]);

  if (!manifest || !entryUrl) {
    return (
      <section className="web-benchpack-shell">
        <div className="empty-workspace benchmark-empty-state">
          <div className="empty-workspace-card benchmark-empty-card">
            <div className="benchmark-empty-icon"><CircleAlert size={18} /></div>
            <p className="eyebrow">Web 基准包</p>
            <h3 className="panel-title">该 Web 基准包缺少其托管入口。</h3>
            <p className="section-copy">请从注册表更新或重新安装该基准包。</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="web-benchpack-shell">
      <div className="web-benchpack-toolbar">
        <div>
          <p className="eyebrow">交互式基准包</p>
          <h2>{manifest.name}</h2>
        </div>
        <div className="section-actions">
          {isRunning ? (
            <button type="button" className="button-warn" onClick={requestStop} disabled={isStopping}>
              <Square size={14} />
              {isStopping ? "停止中..." : "停止"}
            </button>
          ) : null}
          {loadedHistory ? (
            <button type="button" className="ghost-button" onClick={onClearHistory}>
              <RotateCcw size={14} />
              返回实时
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onEditSampling}>
            <SlidersHorizontal size={14} />
            采样参数
          </button>
          <button type="button" className="ghost-button" onClick={onEditModels}>
            <Bot size={14} />
            编辑模型
          </button>
        </div>
      </div>
      <div className="web-benchpack-status-row">
        <span className="status-chip status-idle">{manifest.version}</span>
        <span className="status-chip status-idle">{selectedModels.length} 个已选模型</span>
        {runSummary?.runId ? <span className="status-chip status-idle">{runSummary.runId}</span> : null}
      </div>
      <iframe
        key={frameKey}
        ref={iframeRef}
        title={manifest.name}
        src={entryUrl}
        className="web-benchpack-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        referrerPolicy="no-referrer"
      />
    </section>
  );
}

function BenchmarkSection({
  tabId,
  inspection,
  verifierStatus,
  runBlocker,
  selectedModels,
  modelAvailabilityById,
  checkingModelAvailability,
  providers,
  runSummary,
  historyEntries,
  liveRun,
  loadedHistory,
  focusedScenarioId,
  onFocusScenario,
  onEditModels,
  onEditSampling,
  onEditModelAlias,
  executionMode,
  runsPerTest,
  isViewingHistory,
  onChangeExecutionMode,
  onChangeRunsPerTest,
  onOpenHistory,
  isRunning,
  isStopping,
  onOpenVerification,
  onRefreshVerification,
  onRefreshModelAvailability,
  onClearHistory,
  onStartOver,
  onRun,
  onStop,
  onRetryCells,
  onOpenDetail
}: {
  tabId: string;
  inspection: BenchPackInspection;
  verifierStatus: BenchPackVerifierStatus | null;
  runBlocker: BenchPackRunBlocker | null;
  selectedModels: ResolvedTabModel[];
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  providers: Record<string, BenchLocalProviderConfig>;
  runSummary: BenchPackRunSummary | null;
  historyEntries: BenchPackRunHistoryEntry[];
  liveRun: LiveRunState | null;
  loadedHistory: LoadedHistoryEntry | null;
  focusedScenarioId: string | null;
  onFocusScenario: (scenarioId: string) => void;
  onEditModels: () => void;
  onEditSampling: () => void;
  onEditModelAlias: (model: ResolvedTabModel) => void;
  executionMode: BenchLocalExecutionMode;
  runsPerTest: number;
  isViewingHistory: boolean;
  onChangeExecutionMode: (executionMode: BenchLocalExecutionMode) => void;
  onChangeRunsPerTest: (runsPerTest: number) => void;
  onOpenHistory: () => void;
  isRunning: boolean;
  isStopping: boolean;
  onOpenVerification: () => void;
  onRefreshVerification: () => void;
  onRefreshModelAvailability: () => void;
  onClearHistory: () => void;
  onStartOver: () => void;
  onRun: () => void;
  onStop: () => void;
  onRetryCells: (cells: RetryScenarioCell[], label: string) => void;
  onOpenDetail: (detail: DetailModalState) => void;
}) {
  const [runModeOpen, setRunModeOpen] = useState(false);
  const [runsPerTestOpen, setRunsPerTestOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [sortByScore, setSortByScore] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [shareCardData, setShareCardData] = useState<ResultShareCardData | null>(null);
  const [shareResultsData, setShareResultsData] = useState<ShareResultsData | null>(null);
  const runModeRef = useRef<HTMLDivElement | null>(null);
  const runsPerTestRef = useRef<HTMLDivElement | null>(null);
  const tableScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const tableScrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const tableScrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [tableScrollMetrics, setTableScrollMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0
  });
  const scenarios = inspection.scenarios ?? [];
  const currentScenario = scenarios.find((scenario) => scenario.id === focusedScenarioId) ?? scenarios[0] ?? null;
  const highlightedScenarioId = supportsLiveScenarioColumnFocus(executionMode)
    ? currentScenario?.id ?? null
    : focusedScenarioId;
  const hasRetryActivity = (liveRun?.activeCellKeys.length ?? 0) > 0;
  const isReplayMode = loadedHistory?.mode === "replay";
  const isResumableRun = Boolean(runSummary) && !isRunSummaryComplete(runSummary) && !isRunning;
  const canStartOver = isResumableRun && !isViewingHistory && !hasRetryActivity && !isStopping;
  const replayRevealedCellCount = Object.values(liveRun?.resultsByModel ?? {}).reduce(
    (total, results) => total + results.length,
    0
  );
  const replayTotalCellCount = Object.values(runSummary?.resultsByModel ?? {}).reduce(
    (total, results) => total + results.length,
    0
  );
  const currentExecutionModeLabel =
    EXECUTION_MODE_OPTIONS.find((option) => option.value === executionMode)?.label ?? "运行模式";
  const currentRunsPerTest = normalizeRunsPerTest(runsPerTest);
  const canReplayRun = isReplayMode && Boolean(runSummary) && isRunSummaryComplete(runSummary);
  const runButtonLabel = isRunning ? "停止" : canReplayRun ? "回放" : isResumableRun ? "继续测试" : "运行";
  const hasLiveActivity = isRunning || hasRetryActivity;
  const hasCompletedReplay =
    isReplayMode &&
    !hasLiveActivity &&
    replayTotalCellCount > 0 &&
    replayRevealedCellCount >= replayTotalCellCount;
  const canStartFreshRun = inspection.status === "ready" && selectedModels.length > 0;
  const canResumeRun = Boolean(runSummary) && isResumableRun;
  const isRunButtonDisabled = isRunning
    ? false
    : hasRetryActivity || isStopping || !(canReplayRun || canResumeRun || (!isViewingHistory && canStartFreshRun));
  const hasHorizontalOverflow = tableScrollMetrics.scrollWidth > tableScrollMetrics.clientWidth + 1;
  const stickyColumnShadow = tableScrollMetrics.scrollLeft > 2;

  const openShareResults = async () => {
    if (!runSummary) {
      return;
    }

    const { buildShareResultsData } = await import("./features/share-results/share-results");
    setShareResultsData(buildShareResultsData({
      runSummary,
      models: selectedModels,
      providers,
      scenarios
    }));
  };
  const scrollbarThumbWidth = hasHorizontalOverflow ? getTableScrollbarThumbWidth(tableScrollMetrics) : 0;
  const scrollbarThumbOffset =
    hasHorizontalOverflow && tableScrollbarTrackRef.current
      ? ((tableScrollMetrics.scrollLeft / Math.max(1, tableScrollMetrics.scrollWidth - tableScrollMetrics.clientWidth)) *
          Math.max(0, tableScrollbarTrackRef.current.clientWidth - scrollbarThumbWidth))
      : 0;
  const completedResultCells = selectedModels.flatMap((model) =>
    scenarios.flatMap((scenario) => {
      const result = runSummary?.resultsByModel[model.id]?.find((candidate) => candidate.scenarioId === scenario.id);
      return result ? [{ modelId: model.id, scenarioId: scenario.id, result }] : [];
    })
  );
  const providerErrorRetryCells = completedResultCells
    .filter(({ result }) => isProviderErrorResult(result))
    .map(({ modelId, scenarioId }) => ({ modelId, scenarioId }));
  const failedRetryCells = completedResultCells
    .filter(({ result }) => result.status === "fail" && !isProviderErrorResult(result))
    .map(({ modelId, scenarioId }) => ({ modelId, scenarioId }));
  const canRetryResultCells =
    Boolean(runSummary?.runId) && !isReplayMode && !hasLiveActivity && !isStopping && inspection.status === "ready";
  const selectedModelAvailability = selectedModels.map((model) =>
    getModelAvailabilityView(model, modelAvailabilityById, checkingModelAvailability)
  );
  const checkingAvailability = selectedModelAvailability.some((availability) => availability.status === "checking");
  const runSummaryComplete = isRunSummaryComplete(runSummary);
  const runStateClass = isRunning ? "status-live" : runSummary ? runSummaryComplete ? "status-done" : "status-preview" : "status-idle";
  const runStateLabel = hasLiveActivity ? "进行中" : runSummary && !runSummaryComplete ? "未完成" : runSummary ? "已完成" : "空闲";
  const getDisplayedResult = (modelId: string, scenarioId: string) => {
    const liveResult = liveRun?.resultsByModel[modelId]?.find((candidate) => candidate.scenarioId === scenarioId);
    const persistedResult = isReplayMode
      ? undefined
      : runSummary?.resultsByModel[modelId]?.find((candidate) => candidate.scenarioId === scenarioId);

    return liveResult ?? persistedResult;
  };
  const totalResultCount = selectedModels.length * scenarios.length;
  const completedResultCount = selectedModels.reduce(
    (total, model) => total + scenarios.filter((scenario) => Boolean(getDisplayedResult(model.id, scenario.id))).length,
    0
  );
  const runProgressPercent = totalResultCount > 0 ? Math.min(100, (completedResultCount / totalResultCount) * 100) : 0;
  const displayedScenarios = issuesOnly
    ? scenarios.filter((scenario) =>
        selectedModels.some((model) => {
          const result = getDisplayedResult(model.id, scenario.id);
          return result && (result.status !== "pass" || isProviderErrorResult(result));
        })
      )
    : scenarios;
  const displayedModels = sortByScore && runSummary
    ? [...selectedModels].sort(
        (left, right) =>
          (runSummary.scores[right.id]?.totalScore ?? Number.NEGATIVE_INFINITY) -
          (runSummary.scores[left.id]?.totalScore ?? Number.NEGATIVE_INFINITY)
      )
    : selectedModels;

  useEffect(() => {
    if (!runSummary) {
      setSortByScore(false);
    }

    if (!runSummary && completedResultCount === 0) {
      setIssuesOnly(false);
    }
  }, [completedResultCount, runSummary]);

  useEffect(() => {
    if (!runModeOpen && !runsPerTestOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideRunMode = runModeRef.current?.contains(target);
      const insideRunsPerTest = runsPerTestRef.current?.contains(target);

      if (!insideRunMode) {
        setRunModeOpen(false);
      }

      if (!insideRunsPerTest) {
        setRunsPerTestOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRunModeOpen(false);
        setRunsPerTestOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [runModeOpen, runsPerTestOpen]);

  useEffect(() => {
    const viewport = tableScrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateMetrics = () => {
      setTableScrollMetrics({
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        scrollLeft: viewport.scrollLeft
      });
    };

    const syncFromViewport = () => {
      updateMetrics();
    };

    updateMetrics();
    viewport.addEventListener("scroll", syncFromViewport);
    window.addEventListener("resize", updateMetrics);

    return () => {
      viewport.removeEventListener("scroll", syncFromViewport);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [selectedModels.length, scenarios.length, runSummary, liveRun]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const viewport = tableScrollViewportRef.current;
      const track = tableScrollbarTrackRef.current;
      const drag = tableScrollbarDragRef.current;

      if (!viewport || !track || !drag) {
        return;
      }

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxThumbOffset = Math.max(1, track.clientWidth - getTableScrollbarThumbWidth(tableScrollMetrics));
      const deltaX = event.clientX - drag.startX;
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, drag.startScrollLeft + (deltaX / maxThumbOffset) * maxScrollLeft)
      );
      viewport.scrollLeft = nextScrollLeft;
    };

    const handleUp = () => {
      tableScrollbarDragRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [tableScrollMetrics]);

  if (inspection.status !== "ready") {
    return (
      <section className="workspace-panel">
        <div className="workspace-toolbar">
          <div className="workspace-toolbar-copy">
            <div className="workspace-toolbar-heading">
              <div className="workspace-toolbar-title">{inspection.manifest?.name ?? inspection.id}</div>
              <div className="workspace-stat-chips">
                <span className="status-chip status-preview">{inspection.scenarioCount ?? 0} 个场景</span>
                <span className="status-chip status-idle">{selectedModels.length} 个模型</span>
                <span className="status-chip status-idle">空闲</span>
              </div>
            </div>
          </div>
          <div className="section-actions">
            <button type="button" onClick={onEditModels} className="ghost-button" disabled={isRunning}>
              <Bot size={14} />
              编辑模型
            </button>
            <span className={`status-chip ${statusClasses(inspection.status)}`}>
              {inspection.status.replaceAll("_", " ")}
            </span>
          </div>
        </div>

        <div className="empty-workspace benchmark-empty-state">
          <div className="empty-workspace-card benchmark-empty-card">
            <div className="benchmark-empty-icon">
              <CircleAlert size={22} />
            </div>
            <p className="eyebrow">基准包不可用</p>
            <h3 className="panel-title" style={{ marginTop: "8px" }}>
              {inspection.manifest?.name ?? inspection.id} 尚无法运行
            </h3>
            <p className="muted-copy" style={{ marginTop: "10px", maxWidth: "56ch" }}>
              {inspection.error ?? "该基准包未安装或缺少其 BenchLocal 运行时入口。"}
            </p>
            <div className="category-chip-row" style={{ marginTop: "14px" }}>
              <span className={`status-chip ${statusClasses(inspection.status)}`}>
                {inspection.status.replaceAll("_", " ")}
              </span>
              <span className="status-chip status-idle">{selectedModels.length} 个已选模型</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderResultCell(modelId: string, scenarioId: string) {
    const result = getDisplayedResult(modelId, scenarioId);
    const model = selectedModels.find((candidate) => candidate.id === modelId);
    const isActive = liveRun?.activeCellKeys.includes(`${modelId}::${scenarioId}`) ?? false;

    if (isActive) {
      return (
        <div className="result-icon-shell result-loading">
          <span className="spinner" />
        </div>
      );
    }

    if (!result) {
      return (
        <div className={`result-icon-shell ${isActive ? "result-loading" : "result-idle"}`}>
          {isActive ? <span className="spinner" /> : <span style={{ fontSize: "0.75rem" }}>-</span>}
        </div>
      );
    }

    const isProviderError = isProviderErrorResult(result);
    const tone = isProviderError
      ? "result-provider-error"
      : result.status === "pass" ? "result-pass" : result.status === "partial" ? "result-partial" : "result-fail";
    const durationLabel = formatDurationMs(result.timings?.durationMs);
    const resultLabel = isProviderError ? "提供商错误" : resultStatusLabel(result.status);

    return (
      <button
        type="button"
        onClick={() =>
          onOpenDetail({
            tabId,
            runId: liveRun?.runId ?? runSummary?.runId ?? null,
            benchPackId: inspection.id,
            modelId,
            modelLabel: model?.displayLabel ?? model?.label,
            scenarioId,
            summary: result.summary,
            rawLog: result.rawLog,
            status: result.status,
            errorType: result.errorType,
            retryable: result.retryable,
            timings: result.timings,
            note: result.note,
            score: result.score,
            points: result.points,
            output: result.output,
            verifier: result.verifier,
            artifacts: result.artifacts
          })
        }
        className={`result-icon-button ${tone}${durationLabel ? " has-duration" : ""}`}
        title={durationLabel ? `${resultLabel} · ${durationLabel}` : resultLabel}
        aria-label={`${model?.displayLabel ?? modelId}, ${scenarios.find((scenario) => scenario.id === scenarioId)?.title ?? scenarioId}：${resultLabel}${durationLabel ? `，${durationLabel}` : ""}`}
      >
        <span className="result-icon-mark">
          {isProviderError ? <CircleAlert size={14} strokeWidth={2.4} /> : result.status === "pass" ? "✓" : result.status === "partial" ? "!" : "×"}
        </span>
        {durationLabel ? <span className="result-duration">{durationLabel}</span> : null}
      </button>
    );
  }

  return (
    <section className="workspace-panel">
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-copy">
          <div className="workspace-toolbar-heading">
            <div className="workspace-toolbar-title">{inspection.manifest?.name ?? inspection.id}</div>
            <div className="workspace-stat-chips">
              <span className="status-chip status-preview">{inspection.scenarioCount ?? 0} 个场景</span>
              <span className="status-chip status-idle">{selectedModels.length} 个模型</span>
              <span className={`status-chip ${runStateClass}`}>
                {runStateLabel}
              </span>
              {totalResultCount > 0 && (hasLiveActivity || runSummary) ? (
                <span className="run-progress-label">
                  {completedResultCount} / {totalResultCount} 个结果
                </span>
              ) : null}
              {loadedHistory && loadedHistory.mode !== "replay" ? (
                <span className="history-context">
                  正在查看 {formatCompactHistoryDate(loadedHistory.startedAt)}
                  <button type="button" onClick={onClearHistory}>退出</button>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="section-actions">
          <button type="button" className="ghost-button" onClick={onOpenHistory} disabled={historyEntries.length === 0}>
            <RotateCcw size={14} />
            历史记录
          </button>
          {canStartOver ? (
            <button type="button" className="ghost-button" onClick={onStartOver}>
              <RotateCcw size={14} />
              重新开始
            </button>
          ) : null}
          <button
            type="button"
            onClick={isRunning ? onStop : onRun}
            disabled={isRunButtonDisabled}
            className={isRunning ? "button-warn" : "primary-button"}
          >
            {isRunning ? <Square size={15} /> : <Play size={15} />}
            {isStopping ? "停止中..." : runButtonLabel}
          </button>
        </div>
      </div>

      {hasLiveActivity && totalResultCount > 0 ? (
        <div
          className="run-progress-track"
          role="progressbar"
          aria-label="基准运行进度"
          aria-valuemin={0}
          aria-valuemax={totalResultCount}
          aria-valuenow={completedResultCount}
        >
          <span className="run-progress-fill" style={{ width: `${runProgressPercent}%` }} />
        </div>
      ) : null}

      {runBlocker ? (
        <div className="workspace-verifier-warning">
          <div className="workspace-verifier-warning-copy">
            <span className={`status-chip ${getVerifierStatusTone(verifierStatus?.verifiers.find((entry) => entry.required)?.status)}`}>
              验证器阻塞
            </span>
            <div>
              <div className="workspace-verifier-warning-title">{runBlocker.title}</div>
              <div className="settings-row-secondary">{runBlocker.message}</div>
            </div>
          </div>
          <div className="workspace-verifier-warning-actions">
            <button type="button" className="ghost-button ghost-button-compact" onClick={onRefreshVerification}>
              <RotateCcw size={14} />
              刷新
            </button>
            <button type="button" className="ghost-button ghost-button-compact" onClick={onOpenVerification}>
              <Wrench size={14} />
              验证
            </button>
          </div>
        </div>
      ) : null}

      <div className="workspace-grid">
        <div className="workspace-document">
          <div className="table-controls">
            <div className="table-controls-heading">
              <LayoutList size={16} />
              <div className="workspace-toolbar-title">测试结果</div>
              <div className="table-filter-group" aria-label="结果视图控制">
                <button
                  type="button"
                  className={`ghost-button workspace-filter-button${issuesOnly ? " is-active" : ""}`}
                  onClick={() => setIssuesOnly((current) => !current)}
                  disabled={completedResultCount === 0}
                  aria-pressed={issuesOnly}
                  aria-label="仅显示有问题的场景"
                >
                  <CircleAlert size={13} />
                  问题
                </button>
                <button
                  type="button"
                  className={`ghost-button workspace-filter-button${sortByScore ? " is-active" : ""}`}
                  onClick={() => setSortByScore((current) => !current)}
                  disabled={!runSummary}
                  aria-pressed={sortByScore}
                  aria-label="按得分对模型排序"
                >
                  <ArrowUp size={13} />
                  得分
                </button>
                <button
                  type="button"
                  className={`ghost-button workspace-filter-button${inspectorOpen ? " is-active" : ""}`}
                  onClick={() => setInspectorOpen((current) => !current)}
                  aria-pressed={inspectorOpen}
                  aria-label="显示/隐藏所选场景详情"
                >
                  <Sidebar size={13} />
                  详情
                </button>
              </div>
            </div>
            <div className="table-controls-actions">
              <div ref={runModeRef} className="run-mode-dropdown">
                <button
                  type="button"
                  className="ghost-button run-mode-button"
                  onClick={() => {
                    setRunModeOpen((current) => !current);
                    setRunsPerTestOpen(false);
                  }}
                  disabled={hasLiveActivity}
                  aria-haspopup="menu"
                  aria-expanded={runModeOpen}
                  title="运行模式"
                >
                  <SlidersHorizontal size={14} />
                  <span className="run-mode-button-label">运行模式：</span>
                  <span className="run-mode-button-value">{currentExecutionModeLabel}</span>
                  <ChevronDown size={15} />
                </button>
                {runModeOpen ? (
                  <div className="run-mode-menu" role="menu">
                    {EXECUTION_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={executionMode === option.value}
                        className={`run-mode-menu-item${executionMode === option.value ? " is-active" : ""}`}
                        onClick={() => {
                          onChangeExecutionMode(option.value);
                          setRunModeOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div ref={runsPerTestRef} className="run-mode-dropdown">
                <button
                  type="button"
                  className="ghost-button run-mode-button"
                  onClick={() => {
                    setRunsPerTestOpen((current) => !current);
                    setRunModeOpen(false);
                  }}
                  disabled={hasLiveActivity}
                  aria-haspopup="menu"
                  aria-expanded={runsPerTestOpen}
                  title="每个测试的运行次数"
                >
                  <RotateCcw size={14} />
                  <span className="run-mode-button-label">Runs:</span>
                  <span className="run-mode-button-value">{currentRunsPerTest}x</span>
                  <ChevronDown size={15} />
                </button>
                {runsPerTestOpen ? (
                  <div className="run-mode-menu" role="menu">
                    {RUNS_PER_TEST_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="menuitemradio"
                        aria-checked={currentRunsPerTest === option}
                        className={`run-mode-menu-item${currentRunsPerTest === option ? " is-active" : ""}`}
                        onClick={() => {
                          onChangeRunsPerTest(option);
                          setRunsPerTestOpen(false);
                        }}
                      >
                        <span>每个测试 {option} 次</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={onEditSampling} className="ghost-button" disabled={hasLiveActivity}>
                <SlidersHorizontal size={14} />
                采样参数
              </button>
              <button type="button" onClick={onEditModels} className="ghost-button" disabled={hasLiveActivity}>
                <Bot size={14} />
                编辑模型
              </button>
            </div>
          </div>

          <section className="table-card table-card-document">
            {selectedModels.length === 0 ? (
              <div className="table-empty-callout">
                <div className="table-empty-callout-icon">
                  <Bot size={22} />
                </div>
                <div className="table-empty-callout-copy">
                  <h3 className="table-empty-callout-title">未选择模型</h3>
                  <p className="muted-copy">请添加一个或多个模型以开始运行该基准包。</p>
                </div>
                <div className="table-empty-callout-actions">
                  <button type="button" className="ghost-button" onClick={onOpenHistory} disabled={historyEntries.length === 0}>
                    <RotateCcw size={14} />
                    历史记录
                  </button>
                  <button type="button" onClick={onEditModels} className="ghost-button" disabled={hasLiveActivity}>
                    <Bot size={14} />
                    添加模型
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div ref={tableScrollViewportRef} className="table-scroll" role="region" aria-label="基准对比结果" tabIndex={0}>
                  <table className="result-table">
                  <caption className="sr-only">
                    正在查看 {inspection.manifest?.name ?? inspection.id} 的结果，对比 {selectedModels.length} 个模型、{scenarios.length} 个场景。
                  </caption>
                  <colgroup>
                    <col className="model-column" />
                    <col className="score-column" />
                    {displayedScenarios.map((scenario) => (
                      <col key={scenario.id} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={`scenario-row-label${stickyColumnShadow ? " has-scroll-shadow" : ""}`}>
                        <span>模型</span>
                      </th>
                      <th className="score-column-header">
                        <span>得分</span>
                      </th>
                      {displayedScenarios.map((scenario) => (
                        <th
                          key={scenario.id}
                          className={`${scenario.id === highlightedScenarioId ? "active-column selected-column" : ""}`}
                        >
                          <div className="column-heading">
                            <button
                              type="button"
                              onClick={() => {
                                onFocusScenario(scenario.id);
                                setInspectorOpen(true);
                              }}
                              className="column-button"
                              title={`${scenario.id} · ${scenario.title}`}
                            >
                              <span className="scenario-id">{scenario.id}</span>
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedModels.map((model) => {
                      const availability = getModelAvailabilityView(model, modelAvailabilityById, checkingModelAvailability);

                      return (
                        <tr key={model.id}>
                          <td className={`scenario-row-label${stickyColumnShadow ? " has-scroll-shadow" : ""}`}>
                            <div className="model-cell">
                              {isViewingHistory ? (
                                <div className="model-badge-wrap">
                                  <span
                                    className={`model-availability-dot ${modelAvailabilityChipClass(availability)}`}
                                    title={modelAvailabilityTitle(availability)}
                                    role="img"
                                    aria-label={`模型状态：${modelAvailabilityLabel(availability)}`}
                                  />
                                  <div
                                    className={`model-badge${isReplayMode ? "" : " model-badge-history"}`}
                                    title={
                                      isReplayMode
                                        ? "回放模式使用保存的运行中的模型。"
                                        : "该历史视图使用保存的运行中的模型。"
                                    }
                                  >
                                    {model.displayLabel}
                                  </div>
                                </div>
                              ) : (
                                <div className="model-badge-wrap">
                                  <span
                                    className={`model-availability-dot ${modelAvailabilityChipClass(availability)}`}
                                    title={modelAvailabilityTitle(availability)}
                                    role="img"
                                    aria-label={`模型状态：${modelAvailabilityLabel(availability)}`}
                                  />
                                  <button
                                    type="button"
                                    className="model-badge model-badge-button"
                                    onClick={() => onEditModelAlias(model)}
                                    title="编辑模型别名"
                                  >
                                    {model.displayLabel}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="score-column-cell">
                            {runSummary?.scores[model.id] ? runSummary.scores[model.id].totalScore : "—"}
                          </td>
                          {displayedScenarios.map((scenario) => (
                            <td
                              key={`${model.id}-${scenario.id}`}
                              className={`result-icon-cell ${scenario.id === highlightedScenarioId ? "active-column" : ""}`}
                            >
                              {renderResultCell(model.id, scenario.id)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
                {issuesOnly && displayedScenarios.length === 0 ? (
                  <div className="table-filter-empty">本次运行中没有部分通过、失败或提供商错误的结果。</div>
                ) : null}
                {hasHorizontalOverflow ? (
                  <div
                    ref={tableScrollbarTrackRef}
                    className="table-scrollbar"
                    aria-hidden="true"
                    onMouseDown={(event) => {
                      const viewport = tableScrollViewportRef.current;
                      const track = tableScrollbarTrackRef.current;

                      if (!viewport || !track) {
                        return;
                      }

                      const rect = track.getBoundingClientRect();
                      const clickX = event.clientX - rect.left;

                      if (clickX >= scrollbarThumbOffset && clickX <= scrollbarThumbOffset + scrollbarThumbWidth) {
                        return;
                      }

                      const nextOffset = Math.max(
                        0,
                        Math.min(track.clientWidth - scrollbarThumbWidth, clickX - scrollbarThumbWidth / 2)
                      );
                      const nextScrollLeft =
                        (nextOffset / Math.max(1, track.clientWidth - scrollbarThumbWidth)) *
                        Math.max(0, viewport.scrollWidth - viewport.clientWidth);
                      viewport.scrollLeft = nextScrollLeft;
                    }}
                  >
                    <div
                      className="table-scrollbar-thumb"
                      style={{
                        width: `${scrollbarThumbWidth}px`,
                        transform: `translateX(${scrollbarThumbOffset}px)`
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const viewport = tableScrollViewportRef.current;

                        if (!viewport) {
                          return;
                        }

                        tableScrollbarDragRef.current = {
                          startX: event.clientX,
                          startScrollLeft: viewport.scrollLeft
                        };
                        document.body.style.userSelect = "none";
                      }}
                    />
                  </div>
                ) : null}
                <div className="table-retry-actions">
                  <div className="table-retry-actions-left">
                    <button
                      type="button"
                      className="ghost-button ghost-button-compact"
                      disabled={hasLiveActivity || selectedModels.length === 0}
                      onClick={onRefreshModelAvailability}
                    >
                      <RotateCcw size={14} />
                      {checkingAvailability ? "检查中..." : "刷新状态"}
                    </button>
                  </div>
                  <div className="table-retry-actions-right">
                    {runSummary ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button ghost-button-compact"
                          disabled={!canRetryResultCells || providerErrorRetryCells.length === 0}
                          onClick={() => onRetryCells(providerErrorRetryCells, "提供商错误")}
                        >
                          <CircleAlert size={14} />
                          重试提供商错误
                        </button>
                        <button
                          type="button"
                          className="ghost-button ghost-button-compact"
                          disabled={!canRetryResultCells || failedRetryCells.length === 0}
                          onClick={() => onRetryCells(failedRetryCells, "失败结果")}
                        >
                          <RotateCcw size={14} />
                          重试失败结果
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </section>

          {runSummary && !hasLiveActivity && (!isReplayMode || hasCompletedReplay) ? (
            <section className="leaderboard" aria-labelledby={`leaderboard-${tabId}`}>
              <div className="leaderboard-header">
                <div>
                  <p className="eyebrow">运行摘要</p>
                  <h3 id={`leaderboard-${tabId}`}>模型排名</h3>
                </div>
                <div className="leaderboard-header-actions">
                  <span className="muted-copy">按总分排序</span>
                  <button
                    type="button"
                    className="ghost-button ghost-button-compact"
                    onClick={() => void openShareResults().catch((shareError) => console.error(shareError))}
                  >
                    <Share2 size={14} />
                    分享运行
                  </button>
                </div>
              </div>
              <div className="leaderboard-rows">
              {Object.entries(runSummary.scores)
                .sort(([, left], [, right]) => right.totalScore - left.totalScore)
                .map(([modelId, score], index) => {
                const model = selectedModels.find((candidate) => candidate.id === modelId);
                const hasScoreData = (runSummary.resultsByModel[modelId]?.length ?? 0) > 0;
                const shareRunModeLabel =
                  EXECUTION_MODE_OPTIONS.find((option) => option.value === (runSummary.executionMode ?? executionMode))?.label ??
                  currentExecutionModeLabel;
                const shareData = buildResultShareCardData({
                  runSummary,
                  model,
                  providers,
                  score,
                  runModeLabel: shareRunModeLabel
                });
                const providerName = model ? getProviderDisplayName(providers, model.provider) : "";
                const modelName = model?.model?.trim();
                const modelSubtitle =
                  providerName && modelName
                    ? `${providerName} · ${modelName}`
                    : providerName || modelName || modelId;

                return (
                  <article key={modelId} className="leaderboard-row">
                    <span className="leaderboard-rank" aria-label={`第 ${index + 1} 名`}>{index + 1}</span>
                    <div className="leaderboard-model">
                      <h4>{model?.displayLabel ?? modelId}</h4>
                      <p>{modelSubtitle}</p>
                      {score.summary ? <p className="leaderboard-summary">{score.summary}</p> : null}
                    </div>
                    <div className="leaderboard-categories" aria-label="分类得分">
                      {score.categories.map((category) => (
                        <span key={category.id} className="leaderboard-category" title={category.id}>
                          <span>{category.label}</span>
                          <strong>{hasScoreData ? category.score : "—"}</strong>
                        </span>
                      ))}
                    </div>
                    <div className="leaderboard-score">
                      <span>得分</span>
                      <strong>{hasScoreData ? score.totalScore : "—"}</strong>
                    </div>
                    <button
                      type="button"
                      className="ghost-button ghost-button-compact score-share-button"
                      disabled={!hasScoreData}
                      title={hasScoreData ? "预览分享卡片" : "暂无可分享的结果"}
                      onClick={() => setShareCardData(shareData)}
                    >
                      <Share2 size={14} />
                      分享
                    </button>
                  </article>
                );
              })}
              </div>
            </section>
          ) : null}
        </div>

        {inspectorOpen ? <aside className="workspace-inspector" aria-label="所选场景">
          <details className="scenario-focus scenario-focus-inspector" open>
            <summary className="scenario-focus-header">
              <div>
                <p className="eyebrow">所选场景</p>
                <h3>
                  {currentScenario ? `${currentScenario.id} · ${currentScenario.title}` : "未选择场景"}
                </h3>
              </div>
              <div className="scenario-focus-summary-actions">
                <button
                  type="button"
                  className="inspector-close-button"
                  aria-label="关闭场景详情"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setInspectorOpen(false);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </summary>

            <div className="scenario-detail-grid scenario-detail-grid-stack">
              {(currentScenario?.detailCards?.length
                ? currentScenario.detailCards
                : [
                    {
                      title: "测试内容",
                      content:
                        currentScenario?.description ??
                        "选择场景列以查看其测试目的与结果证据。"
                    },
                    {
                      title: "提示词约定",
                      content:
                        currentScenario?.description ??
                        "当基准包提供时，场景相关的提示词与方法说明将显示在此处。"
                    },
                    {
                      title: "运行备注",
                      content: runSummary
                        ? "选择结果单元格以查看模型输出、验证证据、产物、耗时与原始轨迹。"
                        : "先运行该基准包，然后选择结果单元格查看其证据。"
                    }
                  ]
              ).map((card) => (
                <DetailCard key={card.title} title={card.title} content={card.content} />
              ))}
            </div>
          </details>
        </aside> : null}
      </div>
      {shareCardData ? <ResultShareCardModal data={shareCardData} onClose={() => setShareCardData(null)} /> : null}
      {shareResultsData ? (
        <Suspense fallback={null}>
          <ShareResultsStudio data={shareResultsData} onClose={() => setShareResultsData(null)} />
        </Suspense>
      ) : null}
    </section>
  );
}

function ResultShareCardModal({
  data,
  onClose
}: {
  data: ResultShareCardData;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;

    if (!canvas) {
      return;
    }

    void Promise.all([loadShareCardFonts(), loadShareCardLogoImage()]).then(([, logoImage]) => {
      if (!cancelled && canvasRef.current) {
        drawShareCardCanvas(canvasRef.current, data, logoImage);
      }
    }).catch((error) => {
      console.error(error);

      if (!cancelled && canvasRef.current) {
        drawShareCardCanvas(canvasRef.current, data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  const savePng = async () => {
    const blob = await createShareCardBlob(data);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = data.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyImage = async () => {
    type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
    const clipboardItem = (window as typeof window & { ClipboardItem?: ClipboardItemConstructor }).ClipboardItem;

    if (!navigator.clipboard?.write || !clipboardItem) {
      return;
    }

    const blob = await createShareCardBlob(data);
    await navigator.clipboard.write([new clipboardItem({ "image/png": blob })]);
  };

  return (
    <Modal
      title="分享结果卡片"
      subtitle="为该模型结果生成一张适合社交分享的 PNG 预览。"
      onClose={onClose}
      onSubmit={() => void savePng().catch((error) => console.error(error))}
      submitLabel="保存 PNG"
      size="wide"
      leadingActions={
        <button
          type="button"
          className="ghost-button"
          onClick={() => void copyImage().catch((error) => console.error(error))}
        >
          <Copy size={14} />
          复制图片
        </button>
      }
    >
      <div className="share-card-modal-body">
        <div className="share-card-preview-shell">
          <canvas
            ref={canvasRef}
            width={SHARE_CARD_PIXEL_WIDTH}
            height={SHARE_CARD_PIXEL_HEIGHT}
            className="share-card-canvas"
            aria-label={`${data.modelLabel} 的分享卡片预览`}
          />
        </div>
        <div className="share-card-meta-grid">
          <div>
            <span className="share-card-meta-label">尺寸</span>
            <span className="share-card-meta-value">
              {SHARE_CARD_PIXEL_WIDTH}x{SHARE_CARD_PIXEL_HEIGHT} PNG
            </span>
          </div>
          <div>
            <span className="share-card-meta-label">结果</span>
            <span className="share-card-meta-value">{data.scoreValue} 分 / {data.completedCount} 个结果</span>
          </div>
          <div>
            <span className="share-card-meta-label">文件名</span>
            <span className="share-card-meta-value">{data.fileName}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TabModelsModal({
  providers,
  models,
  selections,
  onClose,
  onChange,
  onSubmit
}: {
  providers: Record<string, BenchLocalProviderConfig>;
  models: BenchLocalModelConfig[];
  selections: BenchLocalWorkspaceTabModelSelection[];
  onClose: () => void;
  onChange: (selections: BenchLocalWorkspaceTabModelSelection[]) => void;
  onSubmit: () => void;
}) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const enabledModels = models.filter((model) => model.enabled);
  const editableSelections = normalizeEditableTabModelSelections(selections);
  const selectionMap = new Map(editableSelections.map((selection) => [selection.modelId, selection]));
  const availableIds = new Set(enabledModels.map((model) => model.id));
  const orderedSelectedIds = editableSelections.map((selection) => selection.modelId).filter((modelId) => availableIds.has(modelId));
  const selectedIdSet = new Set(orderedSelectedIds);
  const providerOptions = [
    { value: "all", label: "全部提供商" },
    ...Array.from(new Set(enabledModels.map((model) => model.provider)))
      .sort((left, right) => getProviderDisplayName(providers, left).localeCompare(getProviderDisplayName(providers, right)))
      .map((providerId) => ({
        value: providerId,
        label: getProviderDisplayName(providers, providerId)
      }))
  ];
  const groupOptions = [
    { value: "all", label: "全部分组" },
    ...Array.from(new Set(enabledModels.map((model) => model.group.trim() || "__ungrouped__")))
      .sort((left, right) => left.localeCompare(right))
      .map((group) => ({
        value: group,
        label: group === "__ungrouped__" ? "未分组" : group
      }))
  ];
  const filteredAvailableModels = enabledModels.filter((model) => {
    const normalizedGroup = model.group.trim() || "__ungrouped__";
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const haystack = [
      model.label,
      model.id,
      model.model,
      model.group,
      getProviderDisplayName(providers, model.provider)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (providerFilter === "all" || model.provider === providerFilter) &&
      (groupFilter === "all" || normalizedGroup === groupFilter) &&
      (!normalizedQuery || haystack.includes(normalizedQuery))
    );
  });
  const selectedModels = orderedSelectedIds
    .map((modelId) => enabledModels.find((model) => model.id === modelId))
    .filter((model): model is BenchLocalModelConfig => Boolean(model));

  const toggleModel = (modelId: string, enabled: boolean) => {
    if (enabled) {
      const existing = selectionMap.get(modelId);
      onChange([...editableSelections, { modelId, alias: existing?.alias }]);
      return;
    }

    onChange(editableSelections.filter((selection) => selection.modelId !== modelId));
  };

  const updateAlias = (modelId: string, alias: string) => {
    const next = editableSelections.map((selection) =>
      selection.modelId === modelId ? { ...selection, alias: alias || undefined } : selection
    );
    onChange(next);
  };

  const moveSelection = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) {
      return;
    }

    const next = [...editableSelections];
    const fromIndex = next.findIndex((selection) => selection.modelId === draggedId);
    const toIndex = next.findIndex((selection) => selection.modelId === targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  useEffect(() => {
    if (providerFilter !== "all" && !providerOptions.some((option) => option.value === providerFilter)) {
      setProviderFilter("all");
    }
  }, [providerFilter, providerOptions]);

  useEffect(() => {
    if (groupFilter !== "all" && !groupOptions.some((option) => option.value === groupFilter)) {
      setGroupFilter("all");
    }
  }, [groupFilter, groupOptions]);

  return (
    <Modal
      title="编辑标签页模型"
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="保存模型"
      size="wide"
    >
      <div className="tab-models-layout">
        <section className="tab-models-column">
          <div className="tab-models-column-header">
            <h4 className="tab-models-column-title">可用模型</h4>
            <span className="status-chip status-idle">{filteredAvailableModels.length}</span>
          </div>
          <div className="entry-grid two-col tab-models-filters">
            <InlineSelectField
              label="提供商筛选"
              value={providerFilter}
              options={providerOptions}
              onChange={setProviderFilter}
            />
            <InlineSelectField
              label="分组筛选"
              value={groupFilter}
              options={groupOptions}
              onChange={setGroupFilter}
            />
            <Field
              label=""
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索模型"
              className="tab-models-search"
            />
          </div>
          <div className="tab-models-list">
            {filteredAvailableModels.length === 0 ? (
              <div className="tab-models-empty">
                <p className="muted-copy">没有符合当前筛选条件的模型。</p>
              </div>
            ) : filteredAvailableModels.map((model) => {
              const isSelected = selectedIdSet.has(model.id);
              const providerName = getProviderDisplayName(providers, model.provider);

              return (
                <div key={model.id} className="tab-model-row">
                  <label className="tab-model-toggle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => toggleModel(model.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="tab-model-toggle-copy">
                      <span className="settings-row-primary">{model.label}</span>
                      <span className="settings-row-secondary">{providerName}</span>
                      <span className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</span>
                    </span>
                  </label>

                  <div className="tab-model-row-meta">
                    <span className="status-chip status-idle">{model.group.trim() || "未分组"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="tab-models-column">
          <div className="tab-models-column-header">
            <h4 className="tab-models-column-title">已选模型</h4>
            <span className="status-chip status-preview">{selectedModels.length}</span>
          </div>
          <div className="tab-models-list">
            {selectedModels.length === 0 ? (
              <div className="tab-models-empty">
                <p className="muted-copy">从左侧选择模型以添加到该标签页。</p>
              </div>
            ) : selectedModels.map((model) => {
              const selection = selectionMap.get(model.id);
              const providerName = getProviderDisplayName(providers, model.provider);

              return (
                <div
                  key={model.id}
                  className="tab-model-row is-selected"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", model.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveSelection(event.dataTransfer.getData("text/plain"), model.id);
                  }}
                >
                  <label className="tab-model-toggle">
                    <input
                      type="checkbox"
                      checked
                      onChange={(event) => toggleModel(model.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="tab-model-toggle-copy">
                      <span className="settings-row-primary">{model.label}</span>
                      <span className="settings-row-secondary">{providerName}</span>
                      <span className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</span>
                    </span>
                  </label>

                  <div className="tab-model-row-meta">
                    <input
                      type="text"
                      value={selection?.alias ?? ""}
                      placeholder="可选别名"
                      onChange={(event) => updateAlias(model.id, event.target.value)}
                      className="config-input tab-model-alias-input"
                    />
                    <div className="tab-model-drag-handle" title="拖动以重新排序所选模型">
                      <GripVertical size={16} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function ModelBrowserModal({
  state,
  onClose,
  onQueryChange,
  onSelect,
  onSubmit
}: {
  state: ModelBrowserModalState;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (modelId: string) => void;
  onSubmit: () => void;
}) {
  const normalizedQuery = state.query.trim().toLowerCase();
  const filteredEntries = state.entries.filter((entry) => {
    const haystack = [entry.id, entry.name, entry.ownedBy, entry.modality, entry.pricing]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  return (
    <Modal
      title="浏览模型"
      subtitle={`从 ${state.providerName} 发现可用模型。`}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="使用该模型"
      size="wide"
    >
      <Field
        label=""
        value={state.query}
        onChange={onQueryChange}
        placeholder="搜索模型"
        className="model-browser-search"
      />

      <div className="model-browser-list">
        {state.loading ? (
          <div className="tab-models-empty">
            <span className="spinner" />
            <p className="muted-copy">Loading models from {state.providerName}...</p>
          </div>
        ) : state.error ? (
          <div className="tab-models-empty">
            <p className="muted-copy">{state.error}</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="tab-models-empty">
            <p className="muted-copy">没有符合当前搜索的模型。</p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`model-browser-row${state.selectedModelId === entry.id ? " is-selected" : ""}`}
              onClick={() => onSelect(entry.id)}
            >
              <div className="model-browser-main">
                <div className="settings-row-primary">{entry.name ?? entry.id}</div>
                <div className="settings-row-secondary settings-mono-cell">{entry.id}</div>
              </div>
              <div className="model-browser-meta">
                {entry.contextLength ? (
                  <span className="status-chip status-idle">{entry.contextLength.toLocaleString()} 上下文</span>
                ) : null}
                {entry.modality ? <span className="status-chip status-idle">{entry.modality}</span> : null}
                {entry.pricing ? <span className="status-chip status-idle">{entry.pricing}</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

function SamplingModal({
  benchPackName,
  defaults,
  form,
  onChange,
  onClose,
  onSubmit
}: {
  benchPackName: string;
  defaults: GenerationRequest;
  form: SamplingFormState;
  onChange: (form: SamplingFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const hasEffectiveDefaults = Object.values(defaults).some((value) => value !== undefined);

  return (
    <Modal
      title="采样参数"
      subtitle={`为 ${benchPackName} 配置请求采样参数覆盖。留空的字段将使用基准包定义的默认值；未定义时 BenchLocal 会省略该参数，由推理后端使用其自身默认值。`}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="保存采样参数"
      size="wide"
      leadingActions={
        <button
          type="button"
          onClick={() => onChange(createSamplingForm())}
          className="ghost-button"
        >
          <RotateCcw size={14} />
          重置覆盖
        </button>
      }
    >
      {hasEffectiveDefaults ? (
        <div className="helper-copy">
          <p>
            Effective defaults:
            {" "}
            {SAMPLING_FIELDS.map((field) => {
              const value = defaults[field.key];
              return value === undefined ? null : (
                <span key={field.key} className="settings-inline-meta">
                  <strong>{field.label}:</strong> {value}
                </span>
              );
            }).filter(Boolean).reduce<ReactNode[]>((items, item, index) => {
              if (index > 0) {
                items.push(<span key={`sep-${index}`}> · </span>);
              }
              items.push(item);
              return items;
            }, [])}
          </p>
        </div>
      ) : (
        <div className="helper-copy">
          <p>This Bench Pack does not define recommended defaults yet. Blank sampling fields are not sent by BenchLocal, except for BenchLocal's request timeout default.</p>
        </div>
      )}
      <div className="entry-grid two-col">
        {SAMPLING_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            value={form[field.key]}
            placeholder={defaults[field.key] === undefined ? field.placeholder : `默认值：${defaults[field.key]}`}
            onChange={(value) => onChange({
              ...form,
              [field.key]: value
            })}
          />
        ))}
      </div>
    </Modal>
  );
}

function EmptyWorkspace({
  providerCount,
  modelCount,
  installedBenchPackCount,
  onOpenProviders,
  onOpenModels,
  onOpenBenchPacks,
  onSelectBenchPack
}: {
  providerCount: number;
  modelCount: number;
  installedBenchPackCount: number;
  onOpenProviders: () => void;
  onOpenModels: () => void;
  onOpenBenchPacks: () => void;
  onSelectBenchPack?: () => void;
}) {
  const hasProviders = providerCount > 0;
  const hasModels = modelCount > 0;
  const hasInstalledBenchPacks = installedBenchPackCount > 0;
  const checklist = [
    {
      key: "providers",
      complete: hasProviders,
      title: "配置提供商",
      detail: hasProviders ? `已配置 ${providerCount} 个` : "至少添加一个提供商端点。",
      actionLabel: "提供商",
      onAction: onOpenProviders
    },
    {
      key: "models",
      complete: hasModels,
      title: "添加模型",
      detail: hasModels ? `已配置 ${modelCount} 个` : "创建指向你的提供商的共享模型。",
      actionLabel: "模型",
      onAction: onOpenModels
    },
    {
      key: "benchpacks",
      complete: hasInstalledBenchPacks,
      title: "安装基准包",
      detail: hasInstalledBenchPacks ? `已安装 ${installedBenchPackCount} 个` : "从官方注册表至少安装一个基准包。",
      actionLabel: "基准包",
      onAction: onOpenBenchPacks
    }
  ];

  return (
    <section className="empty-workspace">
      <div className="empty-workspace-card benchmark-empty-card">
        <div className="benchmark-empty-icon">
          <FolderOpen size={22} />
        </div>
        <p className="eyebrow">暂无活动基准包</p>
        <h3 className="panel-title">选择一个基准包以打开其工作区</h3>
        <p className="section-copy" style={{ marginTop: "12px", maxWidth: "52ch" }}>
          Complete the setup checklist below. BenchLocal keeps providers and models shared across the app, while each Bench Pack owns its own scenarios, sampling defaults, and scoring.
        </p>

        <div className="welcome-checklist">
          {checklist.map((item) => (
            <div key={item.key} className={`welcome-checklist-item${item.complete ? " is-complete" : ""}`}>
              <div className="welcome-checklist-icon" aria-hidden="true">
                {item.complete ? <Check size={14} /> : <span className="welcome-checklist-dot" />}
              </div>
              <div className="welcome-checklist-copy">
                <div className="welcome-checklist-title">{item.title}</div>
                <div className="settings-row-secondary">{item.detail}</div>
              </div>
              {item.complete ? (
                <span className="status-chip status-done">已完成</span>
              ) : (
                <button type="button" onClick={item.onAction} className="ghost-button ghost-button-compact">
                  {item.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        {hasInstalledBenchPacks && onSelectBenchPack ? (
          <button type="button" onClick={onSelectBenchPack} className="primary-button" style={{ marginTop: "20px" }}>
            <FolderOpen size={16} />
            选择基准包
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DetachedLogsWindow() {
  const [state, setState] = useState<DetachedLogsState>({
    workspaceName: "暂无工作区",
    tabTitle: "暂无活动标签页",
    eventCount: 0,
    events: []
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const [themeDefinition, setThemeDefinition] = useState<BenchLocalThemeDefinition | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const appliedThemeKeysRef = useRef<string[]>([]);

  useEffect(() => {
    return window.benchlocal.logs.onDetachedState((nextState) => {
      setState(nextState);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemPrefersDark(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      const configResult = await window.benchlocal.config.load();
      const requestedThemeId = configResult.config.ui.theme === "system"
        ? systemPrefersDark
          ? "dark"
          : "light"
        : configResult.config.ui.theme;
      const nextTheme = await window.benchlocal.themes.load({ themeId: requestedThemeId });

      if (!cancelled) {
        setThemeDefinition(nextTheme);
      }
    };

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [systemPrefersDark]);

  useEffect(() => {
    if (!themeDefinition || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    for (const key of appliedThemeKeysRef.current) {
      root.style.removeProperty(key);
    }

    for (const [key, value] of Object.entries(themeDefinition.variables)) {
      root.style.setProperty(key, value);
    }

    appliedThemeKeysRef.current = Object.keys(themeDefinition.variables);
    root.style.setProperty("color-scheme", themeDefinition.colorScheme);
    root.dataset.theme = themeDefinition.id;
  }, [themeDefinition]);

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [state, autoScroll]);

  useEffect(() => {
    document.title = `运行日志 - ${state.workspaceName} - ${state.tabTitle}`;
  }, [state.workspaceName, state.tabTitle]);

  return (
    <div className="detached-logs-shell">
      <header className="detached-logs-header">
        <div>
          <h2 className="detached-logs-title">{state.workspaceName} · {state.tabTitle}</h2>
        </div>
        <div className="section-actions">
          <label className="drawer-toggle">
            <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
            <span>自动滚动</span>
          </label>
          <span className="status-chip status-idle">{state.eventCount} 条事件</span>
          <button
            type="button"
            className="toolbar-icon-button"
            aria-label="关闭窗口"
            title="关闭窗口"
            onClick={() => void window.benchlocal.logs.closeDetachedWindow()}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {state.events.length > 0 ? (
        <div ref={logContainerRef} className="detached-logs-trail">
          {state.events.map((event, index) => (
            <div key={`${event.type}-${index}`} className="event-row">
              <span className="event-type">{event.type}</span>
              <span className="event-payload"> {JSON.stringify(event)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="detached-logs-empty">暂无正在流式传输的运行日志。</div>
      )}
    </div>
  );
}

function SettingsScene({
  settingsTab,
  setSettingsTab,
  draft,
  loadState,
  hasUnsavedChanges,
  isBusy,
  providerIds,
  benchPackInspections,
  registryEntries,
  registryWarning,
  benchPackMutations,
  verifierStatuses,
  agentAccessState,
  onBack,
  onSaveAdvanced,
  onResetAdvanced,
  onCreateProvider,
  onEditProvider,
  onDuplicateProvider,
  onCreateModel,
  onEditModel,
  onDuplicateModel,
  onStartVerifier,
  onStopVerifier,
  onDeleteVerifierImage,
  onRefreshRegistry,
  onInstallBenchPack,
  onInstallBenchPackFromUrl,
  onUpdateBenchPack,
  onUninstallBenchPack,
  onConfigureAgentAccess,
  onRegenerateAgentToken,
  updateDraft,
  onUpdateVerifier
}: {
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  draft: BenchLocalConfig;
  loadState: LoadState | null;
  hasUnsavedChanges: boolean;
  isBusy: boolean;
  providerIds: string[];
  benchPackInspections: BenchPackInspection[];
  registryEntries: BenchPackRegistryEntry[];
  registryWarning: string | null;
  benchPackMutations: Record<string, BenchPackMutationState>;
  verifierStatuses: Record<string, BenchPackVerifierStatus>;
  agentAccessState: BenchLocalAgentAccessState | null;
  onBack: () => void;
  onSaveAdvanced: () => void;
  onResetAdvanced: () => void;
  onCreateProvider: () => void;
  onEditProvider: (providerId: string) => void;
  onDuplicateProvider: (providerId: string) => void;
  onCreateModel: () => void;
  onEditModel: (index: number) => void;
  onDuplicateModel: (index: number) => void;
  onStartVerifier: (benchPackId: string, benchPackName: string, verifierId: string) => Promise<void>;
  onStopVerifier: (benchPackId: string) => Promise<void>;
  onDeleteVerifierImage: (benchPackId: string, benchPackName: string, verifierId: string) => void;
  onRefreshRegistry: () => void;
  onInstallBenchPack: (benchPackId: string) => void;
  onInstallBenchPackFromUrl: (url: string) => Promise<boolean | void>;
  onUpdateBenchPack: (benchPackId: string) => void;
  onUninstallBenchPack: (benchPackId: string) => void;
  onConfigureAgentAccess: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => void;
  onRegenerateAgentToken: () => void;
  updateDraft: (updater: (current: BenchLocalConfig) => BenchLocalConfig) => void;
  onUpdateVerifier: (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => void;
}) {
  return (
    <section className="settings-scene">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <button type="button" onClick={onBack} className="settings-back-button">
            <ChevronLeft size={16} />
            返回
          </button>
          <div className="settings-sidebar-title-block">
            <p className="eyebrow">设置</p>
            <h2 className="settings-sidebar-title">偏好设置</h2>
          </div>
        </div>

        <div className="settings-sidebar-group">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`settings-sidebar-item${settingsTab === tab.id ? " is-active" : ""}`}
              title={tab.blurb}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="settings-scene-content">
        <div className="settings-body settings-body-scene">
            {settingsTab === "providers" ? (
              <ProvidersView
                providers={draft.providers}
                models={draft.models}
                onCreate={onCreateProvider}
                onEdit={onEditProvider}
                onDuplicate={onDuplicateProvider}
              />
            ) : null}

            {settingsTab === "models" ? (
              <ModelsView
                models={draft.models}
                providers={draft.providers}
                providerIds={providerIds}
                onCreate={onCreateModel}
                onEdit={onEditModel}
                onDuplicate={onDuplicateModel}
              />
            ) : null}

            {settingsTab === "benchPacks" ? (
              <BenchPackRegistryView
                draft={draft}
                inspections={benchPackInspections}
                registryEntries={registryEntries}
                registryWarning={registryWarning}
                benchPackMutations={benchPackMutations}
                onRefresh={onRefreshRegistry}
                onInstall={onInstallBenchPack}
                onInstallFromUrl={onInstallBenchPackFromUrl}
                onUpdate={onUpdateBenchPack}
                onUninstall={onUninstallBenchPack}
              />
            ) : null}

            {settingsTab === "verification" ? (
              <VerificationView
                draft={draft}
                statuses={verifierStatuses}
                onUpdate={onUpdateVerifier}
                onStart={async (benchPackId, benchPackName, verifierId) => {
                  await onStartVerifier(benchPackId, benchPackName, verifierId);
                }}
                onStop={async (benchPackId) => {
                  await onStopVerifier(benchPackId);
                }}
                onDeleteImage={(benchPackId, benchPackName, verifierId) => {
                  onDeleteVerifierImage(benchPackId, benchPackName, verifierId);
                }}
              />
            ) : null}

            {settingsTab === "agent" ? (
              <AgentAccessView
                state={agentAccessState}
                onConfigure={onConfigureAgentAccess}
                onRegenerateToken={onRegenerateAgentToken}
              />
            ) : null}

            {settingsTab === "advanced" ? (
              <section className="advanced-grid">
                <Panel title="文件系统" subtitle="BenchLocal 自有的存储路径与配置位置。" tone="sky" icon={<FolderOpen size={16} />}>
                  <Field label="配置文件" value={loadState?.path ?? ""} readOnly onChange={() => undefined} />
                  <Field label="运行存储" value={draft.run_storage_dir} onChange={(value) => updateDraft((current) => {
                    current.run_storage_dir = value;
                    return current;
                  })} />
                  <Field label="基准包存储" value={draft.benchpack_storage_dir} onChange={(value) => updateDraft((current) => {
                    current.benchpack_storage_dir = value;
                    return current;
                  })} />
                  <Field label="日志存储" value={draft.log_storage_dir} onChange={(value) => updateDraft((current) => {
                    current.log_storage_dir = value;
                    return current;
                  })} />
                  <Field label="缓存存储" value={draft.cache_dir} onChange={(value) => updateDraft((current) => {
                    current.cache_dir = value;
                    return current;
                  })} />
                  <div className="helper-copy helper-copy-compact">
                    <p>这些路径保存在<strong>~/.benchlocal/config.toml</strong>.</p>
                  </div>
                  <div className="settings-actions advanced-filesystem-actions">
                    <button
                      type="button"
                      onClick={onResetAdvanced}
                      disabled={isBusy || !hasUnsavedChanges}
                      className="ghost-button"
                    >
                      <RotateCcw size={14} />
                      重置
                    </button>
                    <button
                      type="button"
                      onClick={onSaveAdvanced}
                      disabled={isBusy || !hasUnsavedChanges}
                      className="primary-button"
                    >
                      <Save size={14} />
                      保存
                    </button>
                  </div>
                </Panel>
              </section>
            ) : null}
        </div>
      </div>
    </section>
  );
}

function ProvidersView({
  providers,
  models,
  onCreate,
  onEdit,
  onDuplicate
}: {
  providers: Record<string, BenchLocalProviderConfig>;
  models: BenchLocalModelConfig[];
  onCreate: () => void;
  onEdit: (providerId: string) => void;
  onDuplicate: (providerId: string) => void;
}) {
  const providerIds = Object.keys(providers);

  return (
    <Panel
      title="提供商注册表"
      subtitle="跨所有基准包共享的提供商端点、凭据与启用状态。"
      tone="sky"
      icon={<Server size={16} />}
      actions={
        <button type="button" onClick={onCreate} className="primary-button"><Plus size={14} />添加提供商</button>
      }
    >
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>提供商</th>
              <th>类型</th>
              <th>状态</th>
              <th>基础 URL</th>
              <th>模型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {providerIds.map((providerId) => {
              const provider = providers[providerId];
              const linkedModels = models.filter((model) => model.provider === providerId).length;

              return (
                <tr key={providerId}>
                  <td>
                    <div className="settings-row-primary">{provider.name}</div>
                  </td>
                  <td>
                    <div className="settings-row-secondary">{providerKindLabel(provider.kind)}</div>
                  </td>
                  <td>
                    <span className={`status-chip ${provider.enabled ? "status-ready" : "status-inactive"}`}>
                      {provider.enabled ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="settings-mono-cell">{provider.base_url}</td>
                  <td>{linkedModels}</td>
                  <td>
                    <div className="settings-table-actions">
                      <button type="button" onClick={() => onEdit(providerId)} className="ghost-button ghost-button-compact"><Pencil size={14} />编辑</button>
                      <button type="button" onClick={() => onDuplicate(providerId)} className="ghost-button ghost-button-compact"><Copy size={14} />复制</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}

function ModelsView({
  models,
  providers,
  providerIds,
  onCreate,
  onEdit,
  onDuplicate
}: {
  models: BenchLocalModelConfig[];
  providers: Record<string, BenchLocalProviderConfig>;
  providerIds: string[];
  onCreate: () => void;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
}) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const providerOptions = [
    { value: "all", label: "全部提供商" },
    ...Array.from(new Set(models.map((model) => model.provider)))
      .sort((left, right) => getProviderDisplayName(providers, left).localeCompare(getProviderDisplayName(providers, right)))
      .map((providerId) => ({
        value: providerId,
        label: getProviderDisplayName(providers, providerId)
      }))
  ];
  const groupOptions = [
    { value: "all", label: "全部分组" },
    ...Array.from(new Set(models.map((model) => model.group.trim() || "__ungrouped__")))
      .sort((left, right) => left.localeCompare(right))
      .map((group) => ({
        value: group,
        label: group === "__ungrouped__" ? "未分组" : group
      }))
  ];
  const filteredModels = models
    .map((model, index) => ({ model, index }))
    .filter(({ model }) => {
      const normalizedGroup = model.group.trim() || "__ungrouped__";
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const providerName = getProviderDisplayName(providers, model.provider);
      const haystack = [model.label, model.id, model.model, model.group, providerName, model.provider]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (providerFilter === "all" || model.provider === providerFilter) &&
        (groupFilter === "all" || normalizedGroup === groupFilter) &&
        (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });

  useEffect(() => {
    if (providerFilter !== "all" && !providerOptions.some((option) => option.value === providerFilter)) {
      setProviderFilter("all");
    }
  }, [providerFilter, providerOptions]);

  useEffect(() => {
    if (groupFilter !== "all" && !groupOptions.some((option) => option.value === groupFilter)) {
      setGroupFilter("all");
    }
  }, [groupFilter, groupOptions]);

  return (
    <Panel
      title="共享模型注册表"
      subtitle="跨所有基准包可用的模型标签、提供商映射与启用状态。"
      tone="orange"
      icon={<Bot size={16} />}
      actions={
        <button
          type="button"
          onClick={onCreate}
          disabled={providerIds.length === 0}
          className="primary-button"
        >
          <Plus size={14} />
          添加模型
        </button>
      }
    >
      <div className="settings-models-filter-row">
        <InlineSelectField
          label="提供商筛选"
          value={providerFilter}
          options={providerOptions}
          onChange={setProviderFilter}
        />
        <InlineSelectField
          label="分组筛选"
          value={groupFilter}
          options={groupOptions}
          onChange={setGroupFilter}
        />
        <Field
          label="搜索"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索名称、模型、ID、提供商或分组"
        />
      </div>
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>标签</th>
              <th>状态</th>
              <th>提供商</th>
              <th>模型</th>
              <th>分组</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="settings-row-secondary">没有符合当前筛选条件的模型。</div>
                </td>
              </tr>
            ) : (
              filteredModels.map(({ model, index }) => (
                <tr key={`${model.id}-${index}`}>
                  <td>
                    <div className="settings-row-primary">{model.label}</div>
                    <div className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</div>
                  </td>
                  <td>
                    <span className={`status-chip ${model.enabled ? "status-ready" : "status-inactive"}`}>
                      {model.enabled ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>{getProviderDisplayName(providers, model.provider)}</td>
                  <td className="settings-mono-cell">{model.model}</td>
                  <td>{model.group}</td>
                  <td>
                    <div className="settings-table-actions">
                      <button type="button" onClick={() => onEdit(index)} className="ghost-button ghost-button-compact"><Pencil size={14} />编辑</button>
                      <button type="button" onClick={() => onDuplicate(index)} className="ghost-button ghost-button-compact"><Copy size={14} />复制</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}

function BenchPackRegistryView({
  draft,
  inspections,
  registryEntries,
  registryWarning,
  benchPackMutations,
  onRefresh,
  onInstall,
  onInstallFromUrl,
  onUpdate,
  onUninstall
}: {
  draft: BenchLocalConfig;
  inspections: BenchPackInspection[];
  registryEntries: BenchPackRegistryEntry[];
  registryWarning: string | null;
  benchPackMutations: Record<string, BenchPackMutationState>;
  onRefresh: () => void;
  onInstall: (benchPackId: string) => void;
  onInstallFromUrl: (url: string) => Promise<boolean | void>;
  onUpdate: (benchPackId: string) => void;
  onUninstall: (benchPackId: string) => void;
}) {
  const [manualUrl, setManualUrl] = useState("");
  const inspectionsById = Object.fromEntries(inspections.map((inspection) => [inspection.id, inspection]));
  const hasActiveMutation = Object.keys(benchPackMutations).length > 0;
  const officialRows = registryEntries.map((entry) => {
      const installed = draft.benchpacks[entry.id];
      const inspection = inspectionsById[entry.id];
      const mutation = benchPackMutations[entry.id];
      const updateAvailable =
        Boolean(installed) &&
        (installed?.version !== entry.version ||
          (entry.source.type === "github" ? installed?.ref !== entry.source.tag : false));

      return {
        id: entry.id,
        name: entry.name,
        description: entry.description ?? "暂无描述。",
        version: entry.version,
        installedVersion: installed?.version,
        installed: Boolean(installed),
        status: installed ? inspection?.status ?? "not_installed" : "not_installed",
        mutation,
        updateAvailable,
        isRegistryEntry: true
      } as const;
    });
  const thirdPartyRows = Object.entries(draft.benchpacks)
    .filter(([, benchPack]) => benchPack.source !== "registry")
    .map(([benchPackId, benchPack]) => {
      const inspection = inspectionsById[benchPackId];
      const mutation = benchPackMutations[benchPackId];

      return {
        id: benchPackId,
        name: inspection?.manifest?.name ?? benchPackId,
        description: inspection?.manifest?.description ?? "安装自 BenchLocal 之外维护的第三方来源。",
        version: benchPack.version ?? inspection?.manifest?.version ?? "unknown",
        status: inspection?.status ?? "not_installed",
        sourceLabel:
          benchPack.source === "archive"
            ? benchPack.url ?? "存档 URL"
            : benchPack.source === "github"
              ? benchPack.repo ?? "GitHub"
              : benchPack.source === "local"
                ? benchPack.path ?? "本地路径"
                : benchPack.source,
        mutation
      } as const;
    });

  return (
    <section className="settings-section-stack">
      <Panel
        title="官方基准包"
        subtitle="从 BenchLocal 注册表安装和更新官方基准包。"
        tone="sky"
        icon={<PlugZap size={16} />}
        actions={<button type="button" onClick={onRefresh} className="ghost-button" disabled={hasActiveMutation}><RotateCcw size={14} />刷新注册表</button>}
      >
        {registryWarning ? <Banner tone="warning">{registryWarning}</Banner> : null}
        <SettingsTableShell>
          <table className="settings-list-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>描述</th>
                <th>版本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {officialRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="settings-row-secondary">
                      {registryWarning
                        ? "官方注册表当前不可用。"
                        : "官方注册表中暂无可用的基准包。"}
                    </div>
                  </td>
                </tr>
              ) : (
                officialRows.map((row) => {
                  const isMutating = Boolean(row.mutation);
                  const disableRowAction = hasActiveMutation && !isMutating;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="settings-row-primary settings-nowrap-cell">{row.name}</div>
                      </td>
                      <td>{row.description}</td>
                      <td>
                        <div className="benchpack-version-cell">
                          <div className="settings-table-actions settings-table-actions-inline benchpack-version-line">
                            {row.installed && row.updateAvailable && row.installedVersion ? (
                              <>
                                <span>v{row.installedVersion}</span>
                                <ArrowRight size={14} />
                                <span>v{row.version}</span>
                              </>
                            ) : (
                              <span>v{row.version}</span>
                            )}
                          </div>
                          {row.installed && row.isRegistryEntry && row.updateAvailable ? (
                            <button
                              type="button"
                              onClick={() => onUpdate(row.id)}
                              className="button-warn ghost-button-compact benchpack-upgrade-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "update" ? <span className="spinner" /> : <ArrowUp size={14} />}
                              {row.mutation?.action === "update" ? benchPackMutationLabel(row.mutation) : "升级"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className={`status-chip ${row.installed ? statusClasses(row.status as BenchPackInspection["status"]) : "status-idle"}`}>
                          {row.mutation ? benchPackMutationLabel(row.mutation) : row.installed ? row.status.replaceAll("_", " ") : "available"}
                        </span>
                      </td>
                      <td>
                        <div className="settings-table-actions">
                          {row.installed ? (
                            <button
                              type="button"
                              onClick={() => onUninstall(row.id)}
                              className="ghost-button ghost-button-compact benchpack-action-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "uninstall" ? <span className="spinner" /> : <Trash2 size={14} />}
                              {row.mutation?.action === "uninstall" ? benchPackMutationLabel(row.mutation) : "卸载"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInstall(row.id)}
                              className="primary-button benchpack-action-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "install" ? <span className="spinner" /> : <Plus size={14} />}
                              {row.mutation?.action === "install" ? benchPackMutationLabel(row.mutation) : "安装"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SettingsTableShell>
      </Panel>

      <Panel
        title="第三方基准包"
        subtitle="使用直接的产物 URL 从第三方来源安装基准包。"
        tone="orange"
        icon={<FolderOpen size={16} />}
      >
        <div className="helper-copy">
          <p>Third-party Bench Packs are maintained by their authors, not by BenchLocal. Only install packages from sources you trust.</p>
        </div>
        <div className="benchpack-url-install-row">
          <Field
            label="基准包 URL"
            value={manualUrl}
            placeholder="https://example.com/my-benchpack.tar.gz"
            onChange={setManualUrl}
            className="benchpack-url-field"
          />
          <button
            type="button"
            className="primary-button benchpack-action-button"
            disabled={hasActiveMutation || !manualUrl.trim()}
            onClick={async () => {
              const installed = await onInstallFromUrl(manualUrl);

              if (installed !== false) {
                setManualUrl("");
              }
            }}
          >
            {benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID] || benchPackMutations["third-party"] ? <span className="spinner" /> : <Plus size={14} />}
            {benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID] || benchPackMutations["third-party"]
              ? benchPackMutationLabel(benchPackMutations["third-party"] ?? benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID])
              : "从 URL 安装"}
          </button>
        </div>

        <SettingsTableShell>
          <table className="settings-list-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>描述</th>
                <th>版本</th>
                <th>来源</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {thirdPartyRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="settings-row-secondary">未安装第三方基准包。</div>
                  </td>
                </tr>
              ) : (
                thirdPartyRows.map((row) => {
                  const isMutating = Boolean(row.mutation);
                  const disableRowAction = hasActiveMutation && !isMutating;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="settings-row-primary settings-nowrap-cell">{row.name}</div>
                      </td>
                      <td>{row.description}</td>
                      <td>v{row.version}</td>
                      <td className="settings-mono-cell">{row.sourceLabel}</td>
                      <td>
                        <span className={`status-chip ${statusClasses(row.status as BenchPackInspection["status"])}`}>
                          {row.mutation ? benchPackMutationLabel(row.mutation) : row.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <div className="settings-table-actions">
                          <button
                            type="button"
                            onClick={() => onUninstall(row.id)}
                            className="ghost-button ghost-button-compact benchpack-action-button"
                            disabled={disableRowAction || isMutating}
                          >
                            {row.mutation?.action === "uninstall" ? <span className="spinner" /> : <Trash2 size={14} />}
                            {row.mutation?.action === "uninstall" ? benchPackMutationLabel(row.mutation) : "卸载"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SettingsTableShell>
      </Panel>
    </section>
  );
}

function verifierModeLabel(mode: BenchLocalVerifierConfig["mode"]): string {
  switch (mode) {
    case "cloud":
      return "BenchLocal 云";
    case "custom_url":
      return "自定义 URL";
    case "docker":
    default:
      return "本地 Docker";
  }
}

function VerificationView({
  draft,
  statuses,
  onUpdate,
  onStart,
  onStop,
  onDeleteImage
}: {
  draft: BenchLocalConfig;
  statuses: Record<string, BenchPackVerifierStatus>;
  onUpdate: (benchPackId: string, verifierId: string, updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig) => void;
  onStart: (benchPackId: string, benchPackName: string, verifierId: string) => Promise<void>;
  onStop: (benchPackId: string) => Promise<void>;
  onDeleteImage: (benchPackId: string, benchPackName: string, verifierId: string) => void;
}) {
  const verificationEntries = Object.entries(draft.benchpacks).filter(([benchPackId]) => {
    const status = statuses[benchPackId];
    return Boolean(status && status.verifiers.length > 0);
  });

  const rows = verificationEntries.flatMap(([benchPackId, benchPack]) => {
    const status = statuses[benchPackId];
    const inspectionName = status?.benchPackName ?? benchPackId;

    return Object.entries(benchPack.verifiers ?? {}).map(([verifierId, verifier]) => {
      const runtime = status?.verifiers.find((entry) => entry.id === verifierId);
      return {
        benchPackId,
        benchPackName: inspectionName,
        verifierId,
        verifier,
        runtime,
        docker: status?.docker
      };
    });
  });

  return (
    <Panel
      title="验证运行时"
      subtitle="BenchLocal 通过本地 Docker 自动管理所需的验证器运行时。"
      tone="orange"
      icon={<Wrench size={16} />}
    >
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>基准包</th>
              <th>模式</th>
              <th>状态</th>
              <th>端点</th>
              <th>自动启动</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="settings-row-secondary">当前没有已安装的基准包需要验证器。</div>
                </td>
              </tr>
            ) : (
              rows.map(({ benchPackId, benchPackName, verifierId, verifier, runtime, docker }) => (
                <tr key={`${benchPackId}:${verifierId}`}>
                  <td>
                    <div className="settings-row-primary settings-nowrap-cell">{benchPackName}</div>
                  </td>
                  <td>
                    <InlineSelectField
                      label=""
                      value={verifier.mode === "docker" ? verifier.mode : "docker"}
                      options={[
                        { value: "docker", label: verifierModeLabel("docker") },
                        { value: "cloud", label: `${verifierModeLabel("cloud")}（即将支持）`, disabled: true },
                        { value: "custom_url", label: `${verifierModeLabel("custom_url")}（即将支持）`, disabled: true }
                      ]}
                      onChange={(value) =>
                        onUpdate(benchPackId, verifierId, (current) => ({
                          ...current,
                          mode: value as BenchLocalVerifierConfig["mode"]
                        }))
                      }
                    />
                  </td>
                  <td>
                    <span className={`status-chip ${getVerifierStatusTone(runtime?.status)}`}>
                      {formatVerifierRuntimeStatus(runtime?.status)}
                    </span>
                  </td>
                  <td>
                    <div className="settings-row-secondary">
                      {runtime?.url ?? "由 BenchLocal 管理"}
                    </div>
                    <div className="settings-row-secondary">
                      Docker：{docker?.state === "ready"
                        ? docker.details ?? "就绪"
                        : docker?.state === "not_running"
                          ? docker.details ?? "未运行"
                          : docker?.details ?? "未安装"}
                    </div>
                  </td>
                  <td>
                    <div className="settings-table-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={verifier.auto_start}
                        onChange={(event) =>
                          onUpdate(benchPackId, verifierId, (current) => ({
                            ...current,
                            auto_start: event.target.checked
                          }))
                        }
                      />
                    </div>
                  </td>
                  <td>
                    <div className="settings-table-actions">
                      {runtime?.status === "running" ? (
                        <button type="button" onClick={() => onStop(benchPackId)} className="ghost-button ghost-button-compact">
                          <Square size={14} />
                          停止
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStart(benchPackId, benchPackName, verifierId)}
                          className="ghost-button ghost-button-compact"
                          disabled={docker?.state !== "ready"}
                        >
                          <Play size={14} />
                          启动
                        </button>
                      )}
                      {runtime?.dockerImagePresent ? (
                        <button
                          type="button"
                          onClick={() => onDeleteImage(benchPackId, benchPackName, verifierId)}
                          className="button-danger ghost-button-compact"
                          disabled={verifier.mode !== "docker" || docker?.state !== "ready" || runtime?.status === "running"}
                        >
                          <Trash2 size={14} />
                          删除镜像
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}

function AgentAccessView({
  state,
  onConfigure,
  onRegenerateToken
}: {
  state: BenchLocalAgentAccessState | null;
  onConfigure: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => void;
  onRegenerateToken: () => void;
}) {
  const [enabledDraft, setEnabledDraft] = useState(state?.enabled ?? false);
  const [accessDraft, setAccessDraft] = useState<BenchLocalAgentAccess>(state?.access ?? "localhost");
  const [portDraft, setPortDraft] = useState(state?.configuredPort ? String(state.configuredPort) : "");

  useEffect(() => {
    setEnabledDraft(state?.enabled ?? false);
    setAccessDraft(state?.access ?? "localhost");
    setPortDraft(state?.configuredPort ? String(state.configuredPort) : "");
  }, [state?.enabled, state?.access, state?.configuredPort]);

  const apply = () => {
    const normalizedPort = portDraft.trim() ? Number(portDraft.trim()) : undefined;
    onConfigure({
      enabled: enabledDraft,
      access: accessDraft,
      ...(Number.isFinite(normalizedPort) && normalizedPort ? { port: normalizedPort } : {})
    });
  };

  const copyText = (value?: string) => {
    if (!value || typeof navigator === "undefined") {
      return;
    }

    void navigator.clipboard?.writeText(value);
  };
  const agentGuideUrl = state?.baseUrl ? `${state.baseUrl}/v1/agent-guide` : "";
  const openApiUrl = state?.baseUrl ? `${state.baseUrl}/v1/openapi.json` : "";
  const mcpUrl = state?.baseUrl ? `${state.baseUrl}/mcp` : "";
  const httpEndpoints = [
    ["POST", "/mcp"],
    ["GET", "/v1/health"],
    ["GET", "/v1/agent-guide"],
    ["GET", "/v1/openapi.json"],
    ["GET", "/v1/events"],
    ["GET", "/v1/benchpacks"],
    ["GET", "/v1/providers"],
    ["POST", "/v1/providers"],
    ["PATCH", "/v1/providers/:providerId"],
    ["DELETE", "/v1/providers/:providerId"],
    ["GET", "/v1/models"],
    ["POST", "/v1/models"],
    ["PATCH", "/v1/models/:modelId"],
    ["DELETE", "/v1/models/:modelId"],
    ["POST", "/v1/tabs/:tabId/models/availability/refresh"],
    ["POST", "/v1/tabs/:tabId/sampling"],
    ["POST", "/v1/tabs/:tabId/execution-mode"],
    ["POST", "/v1/tabs/:tabId/runs"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/resume"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/retry-provider-errors"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/retry-failed-results"]
  ] as const;

  return (
    <section className="advanced-grid">
      <Panel title="Agent 访问" subtitle="面向 AI 智能体的本地 API 与事件流。" tone="sky" icon={<Server size={16} />}>
        <div className="agent-experimental-message">
          <CircleAlert size={15} />
          <span>
            该功能目前处于实验/预览阶段，欢迎反馈问题。
          </span>
        </div>

        <div className="agent-access-status-row">
          <span className={`status-chip ${state?.running ? "status-ready" : "status-inactive"}`}>
            {state?.running ? "运行中" : state?.enabled ? "已停止" : "已禁用"}
          </span>
          {state?.baseUrl ? <span className="settings-row-secondary settings-mono-cell">{state.baseUrl}</span> : null}
          {state ? <span className="status-chip status-idle">{state.access === "local_network" ? "局域网" : "仅本机"}</span> : null}
          {state ? <span className="status-chip status-idle">{state.connectedClients} 个客户端</span> : null}
        </div>

        <div className="entry-grid two-col">
          <label className="field-block">
            <span className="field-label">访问范围</span>
            <select
              className="config-input"
              value={accessDraft}
              onChange={(event) => setAccessDraft(event.target.value as BenchLocalAgentAccess)}
            >
              <option value="localhost">仅本机</option>
              <option value="local_network">局域网</option>
            </select>
          </label>
          <FieldToggle label="本地 Agent API" checked={enabledDraft} onChange={setEnabledDraft} />
        </div>

        <div className="entry-grid two-col">
          <Field
            label="端口"
            value={portDraft}
            placeholder="自动"
            type="number"
            onChange={setPortDraft}
          />
        </div>

        <div className="agent-field-row agent-field-row-token">
          <Field label="Bearer 令牌" value={state?.token ?? ""} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(state?.token)} disabled={!state?.token}>
            <Copy size={14} />
            复制
          </button>
          <button type="button" className="ghost-button ghost-button-compact" onClick={onRegenerateToken}>
            <RotateCcw size={14} />
            重新生成
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="Agent 指南 URL" value={agentGuideUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(agentGuideUrl)} disabled={!agentGuideUrl}>
            <Copy size={14} />
            复制
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="OpenAPI URL" value={openApiUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(openApiUrl)} disabled={!openApiUrl}>
            <Copy size={14} />
            复制
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="MCP URL" value={mcpUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(mcpUrl)} disabled={!mcpUrl}>
            <Copy size={14} />
            复制
          </button>
        </div>

        {state?.message ? (
          <div className="helper-copy helper-copy-compact">
            <p>{state.message}</p>
          </div>
        ) : null}

        <div className="settings-actions">
          <button type="button" className="primary-button" onClick={apply}>
            <Save size={14} />
            保存设置
          </button>
        </div>
      </Panel>

      <Panel title="HTTP 接口" subtitle="命令使用 JSON 或 MCP；实时进度通过 Server-Sent Events 推送。" tone="slate" icon={<Logs size={16} />}>
        <div className="agent-endpoint-list">
          {httpEndpoints.map(([method, path]) => (
            <div key={`${method}-${path}`} className="agent-endpoint-row">
              <span className={`agent-endpoint-method method-${method.toLowerCase()}`}>{method}</span>
              <span className="agent-endpoint-path">{path}</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Panel({
  title,
  subtitle,
  tone,
  icon,
  actions,
  children
}: {
  title: string;
  subtitle: string;
  tone: "sky" | "orange" | "slate";
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`panel-shell settings-panel settings-panel-${tone}`}>
      <div className="panel-header">
        <div className="panel-header-main">
          <div className={`panel-icon panel-icon-${tone}`}>{icon}</div>
          <div>
            <h3 className="settings-panel-title">{title}</h3>
            <p className="section-copy settings-panel-subtitle">{subtitle}</p>
          </div>
        </div>
        {actions ? <div className="panel-header-actions">{actions}</div> : null}
      </div>
      <div className="settings-panel-body">{children}</div>
    </section>
  );
}

function DetailCard({ title, content }: { title: string; content: string }) {
  const toneClass =
    title === "测试内容"
      ? "is-blue"
      : title === "提示词约定"
        ? "is-amber"
        : "is-slate";

  const lines = content.split("\n");

  return (
    <article className={`detail-card ${toneClass}`}>
      <div className="detail-card-summary">
        <h4>{title}</h4>
      </div>
      <p className="detail-copy">
        {lines.map((line, lineIndex) => (
          <span key={`${title}-${lineIndex}`}>
            {line.split(/(`[^`]+`)/g).map((part, partIndex) => {
              if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
                return (
                  <code key={`${title}-${lineIndex}-${partIndex}`} className="detail-inline-code">
                    {part.slice(1, -1)}
                  </code>
                );
              }

              return <span key={`${title}-${lineIndex}-${partIndex}`}>{part}</span>;
            })}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    </article>
  );
}

function HistoryModal({
  benchPackName,
  entries,
  onClose,
  onOpenRun,
  onDeleteSelected
}: {
  benchPackName: string;
  entries: BenchPackRunHistoryEntry[];
  onClose: () => void;
  onOpenRun: (runId: string, mode: "history" | "replay") => void;
  onDeleteSelected: (runIds: string[]) => void;
}) {
  const entryRunIds = useMemo(() => entries.map((entry) => entry.runId), [entries]);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(() => new Set());
  const selectedCount = selectedRunIds.size;
  const allSelected = entries.length > 0 && selectedCount === entryRunIds.length;

  useEffect(() => {
    setSelectedRunIds((current) => {
      const validRunIds = new Set(entryRunIds);
      let changed = false;
      const next = new Set<string>();

      for (const runId of current) {
        if (validRunIds.has(runId)) {
          next.add(runId);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [entryRunIds]);

  const toggleRunSelection = (runId: string, selected: boolean) => {
    setSelectedRunIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(runId);
      } else {
        next.delete(runId);
      }

      return next;
    });
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell history-dialog-shell" role="dialog" aria-modal="true" aria-label={`${benchPackName} 运行历史`}>
        <div className="dialog-header">
          <div>
            <h3 className="dialog-title">运行历史</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>{benchPackName}</p>
          </div>
          <button type="button" onClick={onClose} className="dialog-close-button" aria-label="关闭对话框">
            <X size={16} />
          </button>
        </div>

        <div className="history-modal-body">
          <SettingsTableShell className="history-table-wrap">
            <table className="settings-list-table">
              <thead>
                <tr>
                  <th className="history-select-column">
                    <input
                      type="checkbox"
                      aria-label="全选历史记录"
                      checked={allSelected}
                      disabled={entries.length === 0}
                      onChange={(event) => setSelectedRunIds(event.target.checked ? new Set(entryRunIds) : new Set())}
                    />
                  </th>
                  <th>日期时间</th>
                  <th>模式</th>
                  <th>模型</th>
                  <th>用例</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const executionModeLabel =
                    EXECUTION_MODE_OPTIONS.find((option) => option.value === entry.executionMode)?.label ?? "未知";
                  const checkboxId = `history-select-${index}-${entry.runId.replace(/[^a-z0-9_-]/gi, "-")}`;

                  return (
                    <tr key={entry.runId}>
                      <td className="history-select-column">
                        <input
                          id={checkboxId}
                          type="checkbox"
                          aria-label={`选择历史 ${new Date(entry.startedAt).toLocaleString()}`}
                          checked={selectedRunIds.has(entry.runId)}
                          onChange={(event) => toggleRunSelection(entry.runId, event.target.checked)}
                        />
                      </td>
                      <td>
                        <label className="settings-row-primary history-time-toggle" htmlFor={checkboxId}>
                          {new Date(entry.startedAt).toLocaleString()}
                        </label>
                      </td>
                      <td>
                        <span className="status-chip status-idle">{executionModeLabel}</span>
                      </td>
                      <td>
                        <span className="history-table-metric">{entry.modelCount}</span>
                      </td>
                      <td>
                        <span className="history-table-metric">{entry.scenarioCount}</span>
                      </td>
                      <td>
                        <span
                          className={`status-chip ${
                            entry.error ? "status-danger" : entry.cancelled ? "status-not-installed" : "status-done"
                          }`}
                        >
                          {entry.error ? "error" : entry.cancelled ? "stopped" : "completed"}
                        </span>
                      </td>
                      <td>
                        <div className="settings-table-actions settings-table-actions-inline">
                          <button
                            type="button"
                            className="ghost-button ghost-button-compact"
                            onClick={() => onOpenRun(entry.runId, "history")}
                          >
                            <FolderOpen size={14} />
                            视图
                          </button>
                          <button
                            type="button"
                            className="ghost-button ghost-button-compact"
                            disabled={Boolean(entry.error || entry.cancelled)}
                            title={entry.error || entry.cancelled ? "只有已完成的运行才能回放" : "回放该保存的运行"}
                            onClick={() => onOpenRun(entry.runId, "replay")}
                          >
                            <Play size={14} />
                            回放
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SettingsTableShell>
        </div>

        <div className="dialog-footer">
          <button
            type="button"
            className="ghost-button history-delete-selected-button"
            onClick={() => onDeleteSelected(Array.from(selectedRunIds))}
            disabled={selectedCount === 0}
          >
            <Trash2 size={14} />
            删除所选
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifierPreparationModal({
  benchPackName,
  verifierId,
  message,
  isCancelling,
  onCancel
}: {
  benchPackName: string;
  verifierId: string;
  message: string;
  isCancelling?: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell verifier-preparation-shell" role="dialog" aria-modal="true" aria-label={`正在准备 ${benchPackName} 的验证器`}>
        <div className="verifier-preparation-header">
          <div className="verifier-preparation-spinner">
            <span className="spinner" />
          </div>
          <div className="verifier-preparation-copy">
            <p className="eyebrow">正在准备验证器</p>
            <h3 className="dialog-title">{benchPackName}</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>
              BenchLocal 正在准备 <code className="detail-inline-code">{verifierId}</code>，完成后即可开始运行。
            </p>
          </div>
        </div>

        <p className="settings-row-secondary verifier-preparation-message">{message}</p>

        {onCancel ? (
          <div className="dialog-footer verifier-preparation-footer">
            <button type="button" className="button-warn" onClick={onCancel} disabled={isCancelling}>
              {isCancelling ? <span className="spinner" /> : null}
              {isCancelling ? "取消中..." : "取消运行"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToastViewport({
  messages,
  onDismiss
}: {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {messages.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"}>
          <span className="toast-icon" aria-hidden="true">
            {toast.tone === "danger" || toast.tone === "warning" ? <CircleAlert size={15} /> : <Check size={15} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            aria-label="关闭通知"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Banner({ tone, children }: { tone: ToastTone; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "banner-success"
      : tone === "danger"
        ? "banner-danger"
        : tone === "warning"
          ? "banner-warning"
          : "banner-neutral";
  return <div className={`banner ${toneClass}`}>{children}</div>;
}

function AboutDialog({
  metadata,
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
  onClose
}: {
  metadata: BenchLocalAppMetadata | null;
  updateState: BenchLocalUpdateState | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const productName = metadata?.productName ?? "BenchLocal";
  const version = metadata?.version?.trim();
  const updateMessage = describeAppUpdateState(updateState);
  const checkedAtLabel = formatAppUpdateCheckedAt(updateState?.checkedAt);
  const updateFeedLabel = updateState?.feedLabel?.trim() || "GitHub Releases";
  const updateFeedUrl = updateState?.feedUrl?.trim();
  const progressPercent =
    typeof updateState?.progressPercent === "number" ? Math.max(0, Math.min(100, updateState.progressPercent)) : null;
  const canCheckForUpdates =
    updateState?.status !== "checking" &&
    updateState?.status !== "downloading" &&
    updateState?.status !== "available" &&
    updateState?.status !== "unsupported";
  const updateActionLabel =
    updateState?.status === "downloaded"
      ? "重启以更新"
      : updateState?.status === "checking"
        ? "检查中..."
        : updateState?.status === "downloading" || updateState?.status === "available"
          ? progressPercent !== null
            ? `下载中 ${Math.round(progressPercent)}%`
            : "下载中..."
          : "检查更新";

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <div ref={dialogRef} className="about-dialog-shell" role="dialog" aria-modal="true" aria-label={`关于 ${productName}`} tabIndex={-1}>
        <button type="button" onClick={onClose} className="dialog-close-button about-dialog-close" aria-label="关闭对话框">
          <X size={16} />
        </button>
        <div className="about-dialog-body">
          <img src={benchlocalIcon} alt="" className="about-dialog-icon" />
          <h3 className="about-dialog-app-name">{productName}</h3>
          {version ? <p className="about-dialog-version">版本 {version}</p> : null}
          {metadata?.copyright ? <p className="about-dialog-copyright">{metadata.copyright}</p> : null}
          <div className="about-dialog-update-card">
            <div className="about-dialog-update-header">
              <span className="eyebrow">自我更新</span>
              {updateState?.availableVersion ? <span className="status-chip status-idle">v{updateState.availableVersion}</span> : null}
            </div>
            <p className="about-dialog-update-message">{updateMessage}</p>
            <p className="about-dialog-update-meta">
              更新源：{updateFeedUrl ? `${updateFeedLabel} (${updateFeedUrl})` : updateFeedLabel}
            </p>
            {progressPercent !== null ? (
              <div className="about-dialog-update-progress">
                <div className="about-dialog-update-progress-track">
                  <span className="about-dialog-update-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="about-dialog-update-progress-label">{Math.round(progressPercent)}%</span>
              </div>
            ) : null}
            {checkedAtLabel ? <p className="about-dialog-update-meta">上次检查：{checkedAtLabel}</p> : null}
            {updateState?.releaseNotes ? <pre className="about-dialog-update-notes">{updateState.releaseNotes}</pre> : null}
            <div className="about-dialog-update-actions">
              <button
                type="button"
                className="primary-button"
                onClick={updateState?.status === "downloaded" ? onInstallUpdate : onCheckForUpdates}
                disabled={!canCheckForUpdates && updateState?.status !== "downloaded"}
              >
                {updateActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  submitTone = "primary",
  size = "default",
  leadingActions,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitTone?: "primary" | "danger";
  size?: "default" | "wide";
  leadingActions?: ReactNode;
  children?: ReactNode;
}) {
  const hasBody = Boolean(children);
  const hasSubtitle = Boolean(subtitle?.trim());
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const dialog = dialogRef.current;

      if (!dialog) {
        return;
      }

      if (activeElement instanceof HTMLElement && dialog.contains(activeElement)) {
        return;
      }

      submitButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      returnFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const dialog = dialogRef.current;

        if (!dialog) {
          return;
        }

        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hasAttribute("hidden"));

        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) {
        return;
      }

      const target = event.target;

      if (target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      onSubmit();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onSubmit]);

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className={`dialog-shell${size === "wide" ? " dialog-shell-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hasSubtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div className={`dialog-header${hasBody ? "" : " dialog-header-compact"}`}>
          <div>
            <h3 id={titleId} className="dialog-title">{title}</h3>
            {hasSubtitle ? <p id={subtitleId} className="section-copy" style={{ marginTop: "12px" }}>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="dialog-close-button" aria-label="关闭对话框">
            <X size={16} />
          </button>
        </div>

        {hasBody ? <div className="dialog-body">{children}</div> : null}

        <div className={`modal-actions${hasBody ? "" : " modal-actions-compact"}`}>
          <div className="modal-actions-leading">{leadingActions}</div>
          <button
            ref={submitButtonRef}
            type="button"
            onClick={onSubmit}
            className={submitTone === "danger" ? "button-danger" : "primary-button"}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
  className = ""
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <label className={`field-block${label ? "" : " field-block-no-label"}${className ? ` ${className}` : ""}`}>
      {label ? <span className="field-label">{label}</span> : null}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="config-input"
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
    </label>
  );
}

function FieldToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <span className="field-toggle">
        <span className="toggle-label">{checked ? "启用" : "禁用"}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      </span>
    </label>
  );
}

function InlineSelectField({
  label,
  value,
  options,
  getOptionLabel,
  onChange
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label?: string; disabled?: boolean }>;
  getOptionLabel?: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field-block${label ? "" : " field-block-no-label"}`}>
      {label ? <span className="field-label">{label}</span> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="config-input"
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? (getOptionLabel ? getOptionLabel(option) : option) : option.label ?? option.value;
          const disabled = typeof option === "string" ? false : Boolean(option.disabled);

          return (
            <option key={value} value={value} disabled={disabled}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function statusClasses(status: BenchPackInspection["status"]): string {
  switch (status) {
    case "ready":
      return "status-ready";
    case "not_installed":
      return "status-not-installed";
    case "incompatible":
      return "status-load-error";
    case "manifest_missing":
    case "entry_missing":
      return "status-entry-missing";
    case "invalid_manifest":
    case "load_error":
      return "status-load-error";
  }
}
