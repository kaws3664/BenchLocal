import { app, BrowserWindow, dialog } from "electron";
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from "electron-updater";
import type { BenchLocalUpdateState } from "@/shared/desktop-api";

export const APP_UPDATE_STATE_CHANNEL = "benchlocal:updates:state";

const AUTO_CHECK_DELAY_MS = 12_000;
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const { autoUpdater } = electronUpdater;

type UpdateFeedSource = "github" | "generic";

type SupportedUpdateSupport = {
  supported: true;
  feedSource: UpdateFeedSource;
  feedLabel: string;
  feedUrl?: string;
  channel?: string;
};

type UnsupportedUpdateSupport = {
  supported: false;
  message: string;
  feedSource?: UpdateFeedSource;
  feedLabel?: string;
  feedUrl?: string;
};

let updaterInitialized = false;
let autoCheckTimeout: NodeJS.Timeout | null = null;
let autoCheckInterval: NodeJS.Timeout | null = null;
let updaterFeedConfigured = false;

let appUpdateState: BenchLocalUpdateState = createInitialUpdateState();

function createInitialUpdateState(): BenchLocalUpdateState {
  const support = resolveUpdateSupport();

  return {
    status: support.supported ? "idle" : "unsupported",
    currentVersion: app.getVersion(),
    feedSource: support.feedSource,
    feedLabel: support.feedLabel,
    feedUrl: support.feedUrl,
    message: support.supported
      ? support.feedSource === "generic"
        ? "BenchLocal 可以通过本地测试源检查更新。"
        : "BenchLocal 可以检查更新。"
      : support.message
  };
}

function resolveConfiguredUpdateFeed(): SupportedUpdateSupport | UnsupportedUpdateSupport {
  const overrideUrl = process.env.BENCHLOCAL_UPDATE_URL?.trim();

  if (!overrideUrl) {
    return {
      supported: true,
      feedSource: "github",
      feedLabel: "GitHub Releases"
    };
  }

  try {
    const parsed = new URL(overrideUrl);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("本地更新源必须使用 http:// 或 https://。");
    }

    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }

    const channel = process.env.BENCHLOCAL_UPDATE_CHANNEL?.trim() || undefined;

    return {
      supported: true,
      feedSource: "generic",
      feedLabel: "本地测试源",
      feedUrl: parsed.toString(),
      channel
    };
  } catch (error) {
    return {
      supported: false,
      message:
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "BENCHLOCAL_UPDATE_URL 必须是有效的 http:// 或 https:// URL。",
      feedSource: "generic",
      feedLabel: "本地测试源",
      feedUrl: overrideUrl
    };
  }
}

function resolveUpdateSupport(): SupportedUpdateSupport | UnsupportedUpdateSupport {
  if (!app.isPackaged) {
    return {
      supported: false,
      message: "自更新仅在打包后的 BenchLocal 构建中可用。",
      feedSource: "github",
      feedLabel: "GitHub Releases"
    };
  }

  if (process.platform === "linux" && !process.env.APPIMAGE) {
    return {
      supported: false,
      message: "Linux 上的自更新需要运行 AppImage 构建。",
      feedSource: "github",
      feedLabel: "GitHub Releases"
    };
  }

  return resolveConfiguredUpdateFeed();
}

function configureAutoUpdaterFeed(support: SupportedUpdateSupport): void {
  if (updaterFeedConfigured) {
    return;
  }

  const updater = getAutoUpdater();

  if (support.feedSource === "generic" && support.feedUrl) {
    updater.setFeedURL({
      provider: "generic",
      url: support.feedUrl,
      ...(support.channel ? { channel: support.channel } : {})
    });
  }

  updaterFeedConfigured = true;
}

function formatUpdateError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim() || "BenchLocal 无法完成更新请求。";
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "BenchLocal 无法完成更新请求。";
}

function serializeReleaseNotes(releaseNotes: unknown): string | undefined {
  if (typeof releaseNotes === "string") {
    const value = releaseNotes.trim();
    return value || undefined;
  }

  if (Array.isArray(releaseNotes)) {
    const parts = releaseNotes
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }

        if (entry && typeof entry === "object" && "note" in entry && typeof entry.note === "string") {
          return entry.note.trim();
        }

        return "";
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  return undefined;
}

function publishAppUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(APP_UPDATE_STATE_CHANNEL, appUpdateState);
    }
  }
}

function setAppUpdateState(next: Partial<BenchLocalUpdateState>): BenchLocalUpdateState {
  appUpdateState = {
    ...appUpdateState,
    ...next,
    currentVersion: app.getVersion()
  };
  publishAppUpdateState();
  return appUpdateState;
}

function setAppUpdateStateFromInfo(
  status: BenchLocalUpdateState["status"],
  info: Partial<UpdateInfo> | Partial<UpdateDownloadedEvent>,
  extra?: Partial<BenchLocalUpdateState>
): BenchLocalUpdateState {
  const version = typeof info.version === "string" && info.version.trim() ? info.version.trim() : undefined;
  return setAppUpdateState({
    status,
    availableVersion: version,
    downloadedVersion: status === "downloaded" ? version : appUpdateState.downloadedVersion,
    releaseName: typeof info.releaseName === "string" && info.releaseName.trim() ? info.releaseName.trim() : undefined,
    releaseNotes: serializeReleaseNotes(info.releaseNotes),
    ...extra
  });
}

function getAutoUpdater(): AppUpdater {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = console;
  return autoUpdater;
}

function registerUpdaterEventHandlers(): void {
  const updater = getAutoUpdater();

  updater.on("checking-for-update", () => {
    setAppUpdateState({
      status: "checking",
      checkedAt: new Date().toISOString(),
      progressPercent: undefined,
      bytesPerSecond: undefined,
      transferred: undefined,
      total: undefined,
      message: "正在检查 BenchLocal 更新。"
    });
  });

  updater.on("update-available", (info) => {
    setAppUpdateStateFromInfo("available", info, {
      checkedAt: new Date().toISOString(),
      downloadedVersion: undefined,
      progressPercent: 0,
      bytesPerSecond: undefined,
      transferred: undefined,
      total: undefined,
      message: info.version ? `BenchLocal ${info.version} 已发布，正在下载更新。` : "发现 BenchLocal 更新，正在下载。"
    });
  });

  updater.on("download-progress", (progress: ProgressInfo) => {
    const version = appUpdateState.availableVersion;
    setAppUpdateState({
      status: "downloading",
      progressPercent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
      message: version
        ? `正在下载 BenchLocal ${version}（${Math.round(progress.percent)}%）。`
        : `正在下载 BenchLocal 更新（${Math.round(progress.percent)}%）。`
    });
  });

  updater.on("update-downloaded", (info) => {
    setAppUpdateStateFromInfo("downloaded", info, {
      checkedAt: new Date().toISOString(),
      progressPercent: 100,
      bytesPerSecond: undefined,
      transferred: undefined,
      total: undefined,
      message: info.version
        ? `BenchLocal ${info.version} 已准备好安装。`
        : "BenchLocal 更新已准备好安装。"
    });
  });

  updater.on("update-not-available", () => {
    setAppUpdateState({
      status: "not_available",
      checkedAt: new Date().toISOString(),
      availableVersion: undefined,
      downloadedVersion: undefined,
      releaseName: undefined,
      releaseNotes: undefined,
      progressPercent: undefined,
      bytesPerSecond: undefined,
      transferred: undefined,
      total: undefined,
      message: "BenchLocal 已是最新版本。"
    });
  });

  updater.on("error", (error) => {
    setAppUpdateState({
      status: "error",
      checkedAt: new Date().toISOString(),
      progressPercent: undefined,
      bytesPerSecond: undefined,
      transferred: undefined,
      total: undefined,
      message: formatUpdateError(error)
    });
  });
}

function scheduleAutomaticUpdateChecks(): void {
  if (autoCheckTimeout) {
    clearTimeout(autoCheckTimeout);
  }

  if (autoCheckInterval) {
    clearInterval(autoCheckInterval);
  }

  autoCheckTimeout = setTimeout(() => {
    void checkForAppUpdates();
    autoCheckInterval = setInterval(() => {
      void checkForAppUpdates();
    }, AUTO_CHECK_INTERVAL_MS);
  }, AUTO_CHECK_DELAY_MS);
}

export function initializeAppUpdater(): void {
  if (updaterInitialized) {
    return;
  }

  updaterInitialized = true;
  appUpdateState = createInitialUpdateState();
  publishAppUpdateState();

  const support = resolveUpdateSupport();
  if (!support.supported) {
    return;
  }

  configureAutoUpdaterFeed(support);
  registerUpdaterEventHandlers();
  scheduleAutomaticUpdateChecks();
}

export function getAppUpdateState(): BenchLocalUpdateState {
  return appUpdateState;
}

export async function checkForAppUpdates(): Promise<BenchLocalUpdateState> {
  const support = resolveUpdateSupport();

  if (!support.supported) {
    return setAppUpdateState({
      status: "unsupported",
      feedSource: support.feedSource,
      feedLabel: support.feedLabel,
      feedUrl: support.feedUrl,
      message: support.message
    });
  }

  if (appUpdateState.status === "checking" || appUpdateState.status === "downloading") {
    return appUpdateState;
  }

  try {
    configureAutoUpdaterFeed(support);
    const result = await getAutoUpdater().checkForUpdates();
    const nextVersion = result?.updateInfo?.version?.trim();

    if (nextVersion && nextVersion !== app.getVersion() && result) {
      setAppUpdateStateFromInfo("available", result.updateInfo, {
        checkedAt: new Date().toISOString(),
        downloadedVersion: undefined,
        progressPercent: 0,
        bytesPerSecond: undefined,
        transferred: undefined,
        total: undefined,
        message: `BenchLocal ${nextVersion} 已发布，正在下载更新。`
      });
    }

    return appUpdateState;
  } catch (error) {
    throw new Error(formatUpdateError(error));
  }
}

export async function checkForAppUpdatesInteractively(): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const support = resolveUpdateSupport();

  if (!support.supported) {
    await dialog.showMessageBox(focusedWindow ?? undefined, {
      type: "info",
      buttons: ["确定"],
      message: "无法自更新",
      detail: support.message
    });
    return;
  }

  if (appUpdateState.status === "checking") {
    await dialog.showMessageBox(focusedWindow ?? undefined, {
      type: "info",
      buttons: ["确定"],
      message: "BenchLocal 已在检查更新。"
    });
    return;
  }

  if (appUpdateState.status === "downloading" || appUpdateState.status === "available") {
    await dialog.showMessageBox(focusedWindow ?? undefined, {
      type: "info",
      buttons: ["确定"],
      message: appUpdateState.availableVersion
        ? `BenchLocal ${appUpdateState.availableVersion} 正在下载中。`
        : "BenchLocal 已在下载更新。"
    });
    return;
  }

  if (appUpdateState.status === "downloaded") {
    const response = await dialog.showMessageBox(focusedWindow ?? undefined, {
      type: "info",
      buttons: ["重启以更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
      message: appUpdateState.downloadedVersion
        ? `BenchLocal ${appUpdateState.downloadedVersion} 已准备好安装。`
        : "BenchLocal 更新已准备好安装。",
      detail: "重启 BenchLocal 以应用已下载的更新。"
    });

    if (response.response === 0) {
      installDownloadedAppUpdate();
    }

    return;
  }

  try {
    const state = await checkForAppUpdates();

    if (state.status === "not_available") {
      await dialog.showMessageBox(focusedWindow ?? undefined, {
        type: "info",
        buttons: ["确定"],
        message: "BenchLocal 已是最新版本。",
        detail: `当前版本：${state.currentVersion}`
      });
      return;
    }

    if (state.status === "available" || state.status === "downloading") {
      await dialog.showMessageBox(focusedWindow ?? undefined, {
        type: "info",
        buttons: ["确定"],
        message: state.availableVersion
          ? `BenchLocal ${state.availableVersion} 正在后台下载。`
          : "BenchLocal 更新正在后台下载。"
      });
    }
  } catch (error) {
    dialog.showErrorBox("更新检查失败", formatUpdateError(error));
  }
}

export function installDownloadedAppUpdate(): { started: boolean } {
  if (appUpdateState.status !== "downloaded") {
    throw new Error("没有已下载且可安装的 BenchLocal 更新。");
  }

  getAutoUpdater().quitAndInstall(false, true);
  return { started: true };
}
