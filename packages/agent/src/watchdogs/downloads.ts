// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Download Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";

/** A tracked download */
export interface TrackedDownload {
  /** Suggested filename */
  suggestedFilename: string;
  /** Download URL */
  url: string;
  /** When the download started */
  startedAt: number;
  /** When the download completed (if done) */
  completedAt?: number;
  /** Saved file path (if completed) */
  path?: string;
  /** Whether the download failed */
  failed: boolean;
  /** Error message if failed */
  error?: string;
  /** File size in bytes (if known) */
  size?: number;
}

/**
 * Watchdog that monitors and manages file downloads triggered during testing.
 *
 * Tracks download starts, completions, and failures. Can verify expected
 * downloads and report unexpected ones.
 */
export class DownloadWatchdog implements Watchdog {
  readonly type = "download" as const;
  private downloads: TrackedDownload[] = [];
  private pendingEvents: WatchdogEvent[] = [];
  private expectedDownloads: Set<string> = new Set();
  private maxWaitTime = 30_000; // 30 seconds max wait for a download

  start(): void {
    this.downloads = [];
    this.pendingEvents = [];
  }

  stop(): void {
    // Check for still-pending downloads
    for (const dl of this.downloads) {
      if (!dl.completedAt && !dl.failed) {
        dl.failed = true;
        dl.error = "Download still pending when watchdog stopped";
      }
    }
  }

  check(): WatchdogEvent | null {
    // Return pending events one at a time
    if (this.pendingEvents.length > 0) {
      return this.pendingEvents.shift()!;
    }

    // Check for timed-out downloads
    const now = Date.now();
    for (const dl of this.downloads) {
      if (!dl.completedAt && !dl.failed && now - dl.startedAt > this.maxWaitTime) {
        dl.failed = true;
        dl.error = "Download timed out";

        return {
          type: "download",
          timestamp: now,
          message: `Download timed out: ${dl.suggestedFilename} from ${dl.url}`,
          severity: "warning",
          blocking: false,
          data: { download: dl },
        };
      }
    }

    return null;
  }

  /**
   * Call this when a download starts (hook into Playwright's download event).
   */
  onDownloadStarted(filename: string, url: string): void {
    const download: TrackedDownload = {
      suggestedFilename: filename,
      url,
      startedAt: Date.now(),
      failed: false,
    };

    this.downloads.push(download);

    const isExpected = this.expectedDownloads.has(filename) ||
      this.expectedDownloads.has(url);

    this.pendingEvents.push({
      type: "download",
      timestamp: Date.now(),
      message: `Download started: ${filename}${isExpected ? " (expected)" : " (unexpected)"}`,
      severity: isExpected ? "info" : "warning",
      blocking: !isExpected,
      data: { download, expected: isExpected },
      suggestedAction: isExpected ? undefined : "verify_download_is_intentional",
    });
  }

  /**
   * Call this when a download completes.
   */
  onDownloadCompleted(filename: string, path: string, size?: number): void {
    const download = this.downloads.find(
      (d) => d.suggestedFilename === filename && !d.completedAt,
    );

    if (download) {
      download.completedAt = Date.now();
      download.path = path;
      download.size = size;
    }

    this.pendingEvents.push({
      type: "download",
      timestamp: Date.now(),
      message: `Download completed: ${filename} (${size ? formatBytes(size) : "unknown size"})`,
      severity: "info",
      blocking: false,
      data: { download, path, size },
    });
  }

  /**
   * Call this when a download fails.
   */
  onDownloadFailed(filename: string, error: string): void {
    const download = this.downloads.find(
      (d) => d.suggestedFilename === filename && !d.completedAt,
    );

    if (download) {
      download.failed = true;
      download.error = error;
    }

    this.pendingEvents.push({
      type: "download",
      timestamp: Date.now(),
      message: `Download failed: ${filename} - ${error}`,
      severity: "warning",
      blocking: false,
      data: { download, error },
    });
  }

  /**
   * Mark a download as expected (won't trigger a blocking event).
   */
  expectDownload(filenameOrUrl: string): void {
    this.expectedDownloads.add(filenameOrUrl);
  }

  /**
   * Get all tracked downloads.
   */
  getDownloads(): TrackedDownload[] {
    return [...this.downloads];
  }

  /**
   * Wait for a download to complete with the given filename.
   */
  async waitForDownload(filename: string, timeout?: number): Promise<TrackedDownload | null> {
    const maxWait = timeout ?? this.maxWaitTime;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const completed = this.downloads.find(
        (d) => d.suggestedFilename === filename && (d.completedAt || d.failed),
      );
      if (completed) return completed;
      await new Promise((r) => setTimeout(r, 500));
    }

    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
