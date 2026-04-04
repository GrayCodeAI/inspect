/**
 * Download Watchdog
 *
 * Monitors and handles file downloads.
 */

import type { Page, Download } from "playwright";
import { createHash } from "crypto";

export interface DownloadConfig {
  /** Download directory */
  downloadDir: string;
  /** Auto-accept downloads */
  autoAcceptDownloads: boolean;
  /** Max file size (bytes) */
  maxFileSize: number;
  /** Allowed file types */
  allowedExtensions: string[];
  /** Blocked file types */
  blockedExtensions: string[];
  /** Scan downloads for malware */
  scanDownloads: boolean;
  /** Callback on download started */
  onDownloadStarted?: (info: DownloadInfo) => void;
  /** Callback on download complete */
  onDownloadComplete?: (info: DownloadInfo) => void;
  /** Callback on download failed */
  onDownloadFailed?: (info: DownloadInfo, error: string) => void;
}

export interface DownloadInfo {
  id: string;
  url: string;
  filename: string;
  suggestedFilename: string;
  fileSize: number;
  mimeType: string;
  startTime: number;
  endTime?: number;
  state: "in-progress" | "completed" | "failed" | "cancelled";
  path?: string;
  hash?: string;
  error?: string;
}

export class DownloadWatchdog {
  private config: DownloadConfig;
  private activeDownloads = new Map<string, DownloadInfo>();
  private completedDownloads: DownloadInfo[] = [];
  private downloadHandler?: (download: Download) => void;

  constructor(config: Partial<DownloadConfig> = {}) {
    this.config = {
      downloadDir: "./downloads",
      autoAcceptDownloads: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedExtensions: [],
      blockedExtensions: [".exe", ".dll", ".bat", ".sh", ".cmd"],
      scanDownloads: false,
      ...config,
    };
  }

  /**
   * Start monitoring downloads
   */
  start(page: Page): void {
    this.downloadHandler = (download: Download) => {
      this.handleDownload(download);
    };
    page.on("download", this.downloadHandler);
  }

  /**
   * Stop monitoring
   */
  stop(page: Page): void {
    if (this.downloadHandler) {
      page.off("download", this.downloadHandler);
      this.downloadHandler = undefined;
    }
  }

  /**
   * Handle a download
   */
  private async handleDownload(download: Download): Promise<void> {
    const id = createHash("md5")
      .update(download.url() + Date.now())
      .digest("hex");
    const suggestedFilename = download.suggestedFilename();
    const extension = "." + suggestedFilename.split(".").pop()?.toLowerCase();

    // Check if file type is allowed
    if (this.config.blockedExtensions.includes(extension)) {
      await download.cancel();
      console.warn(`Download blocked: ${extension} files not allowed`);
      return;
    }

    // Check if file type is in allowed list (if specified)
    if (
      this.config.allowedExtensions.length > 0 &&
      !this.config.allowedExtensions.includes(extension)
    ) {
      await download.cancel();
      console.warn(`Download blocked: ${extension} not in allowed list`);
      return;
    }

    const downloadInfo: DownloadInfo = {
      id,
      url: download.url(),
      filename: suggestedFilename,
      suggestedFilename,
      fileSize: 0,
      mimeType: "",
      startTime: Date.now(),
      state: "in-progress",
    };

    this.activeDownloads.set(id, downloadInfo);
    this.config.onDownloadStarted?.(downloadInfo);

    try {
      // Wait for download to complete
      const path = await download.path();

      if (path) {
        downloadInfo.path = path;
        downloadInfo.state = "completed";
        downloadInfo.endTime = Date.now();

        // Get file stats
        const fs = await import("fs");
        const stats = fs.statSync(path);
        downloadInfo.fileSize = stats.size;

        // Check file size
        if (downloadInfo.fileSize > this.config.maxFileSize) {
          fs.unlinkSync(path);
          downloadInfo.state = "failed";
          downloadInfo.error = "File exceeds maximum size";
          this.config.onDownloadFailed?.(downloadInfo, downloadInfo.error);
          return;
        }

        this.completedDownloads.push(downloadInfo);
        this.config.onDownloadComplete?.(downloadInfo);
      }
    } catch (error) {
      downloadInfo.state = "failed";
      downloadInfo.error = error instanceof Error ? error.message : String(error);
      this.config.onDownloadFailed?.(downloadInfo, downloadInfo.error);
    } finally {
      this.activeDownloads.delete(id);
    }
  }

  /**
   * Get active downloads
   */
  getActiveDownloads(): DownloadInfo[] {
    return Array.from(this.activeDownloads.values());
  }

  /**
   * Get completed downloads
   */
  getCompletedDownloads(): DownloadInfo[] {
    return [...this.completedDownloads];
  }

  /**
   * Wait for all active downloads to complete
   */
  async waitForDownloads(timeoutMs = 60000): Promise<DownloadInfo[]> {
    const startTime = Date.now();

    while (this.activeDownloads.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error("Timeout waiting for downloads");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return this.completedDownloads;
  }

  /**
   * Clear completed downloads history
   */
  clearHistory(): void {
    this.completedDownloads = [];
  }

  /**
   * Get download statistics
   */
  getStats(): {
    activeCount: number;
    completedCount: number;
    totalSize: number;
  } {
    const totalSize = this.completedDownloads.reduce((sum, d) => sum + d.fileSize, 0);

    return {
      activeCount: this.activeDownloads.size,
      completedCount: this.completedDownloads.length,
      totalSize,
    };
  }
}
