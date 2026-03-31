// ============================================================================
// @inspect/browser - Video Export from rrweb Recordings
//
// Replays an rrweb session recording in a headless browser and captures
// the replay as a video file (WebM). Uses Playwright's built-in video
// recording to capture the rrweb-player replay.
// ============================================================================

import { chromium, type Browser } from "playwright";
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { RRWebEvent } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/video-export");

export interface VideoExportOptions {
  /** Output file path. Extension determines format (.webm). */
  outputPath: string;
  /** Video width in pixels. Default: 1280 */
  width?: number;
  /** Video height in pixels. Default: 720 */
  height?: number;
  /** Playback speed multiplier. Default: 1 */
  speed?: number;
}

export interface VideoExportResult {
  /** Path to the exported video file */
  path: string;
  /** Video duration in seconds */
  duration: number;
  /** File size in bytes */
  size: number;
}

/** rrweb CDNs for the replay page */
const RRWEB_PLAYER_CDN = "https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js";
const RRWEB_PLAYER_CSS = "https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css";

/**
 * VideoExporter replays rrweb recordings in a headless browser and
 * captures the output as a video file using Playwright's video recording.
 */
export class VideoExporter {
  /**
   * Export rrweb events as a video file.
   *
   * Process:
   * 1. Generate an HTML page with rrweb-player and embedded events
   * 2. Launch a headless browser with video recording enabled
   * 3. Navigate to the replay page and let it play
   * 4. Close the browser to finalize the video
   * 5. Move the video to the desired output path
   */
  async export(events: RRWebEvent[], options: VideoExportOptions): Promise<VideoExportResult> {
    if (events.length === 0) {
      throw new Error("No events to export");
    }

    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    const speed = options.speed ?? 1;
    const outputPath = resolve(options.outputPath);

    // Calculate replay duration
    const duration = this.calculateDuration(events);
    const replayDurationMs = Math.ceil((duration * 1000) / speed) + 2000; // +2s buffer

    // Generate temporary replay HTML
    const tmpDir = join(tmpdir(), `inspect-video-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const htmlPath = join(tmpDir, "replay.html");
    const replayHTML = this.generateReplayPage(events, width, height, speed);
    writeFileSync(htmlPath, replayHTML);

    // Launch browser with video recording
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });

      const context = await browser.newContext({
        viewport: { width, height },
        recordVideo: {
          dir: tmpDir,
          size: { width, height },
        },
      });

      const page = await context.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

      // Wait for rrweb-player to initialize, then start playback
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // Wait for player to be ready
          const check = () => {
            const player = document.querySelector(".rr-player");
            if (player) {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
      });

      // Click play button
      await page.click(".rr-controller__btn", { timeout: 5000 }).catch(() => {
        // Player might auto-play
      });

      // Wait for the replay to complete
      await page.waitForTimeout(replayDurationMs);

      // Close page to finalize video
      const videoPath = await page.video()?.path();
      await context.close();

      // Move video to output path
      if (videoPath && existsSync(videoPath)) {
        mkdirSync(dirname(outputPath), { recursive: true });
        const videoData = readFileSync(videoPath);
        writeFileSync(outputPath, videoData);
        unlinkSync(videoPath);

        return {
          path: outputPath,
          duration,
          size: videoData.length,
        };
      }

      throw new Error("Video file was not created by Playwright");
    } finally {
      if (browser) {
        await browser.close().catch((err) => {
          logger.warn("Failed to close browser during video export", { err: err?.message });
        });
      }

      // Cleanup temp files
      try {
        unlinkSync(htmlPath);
      } catch (error) {
        logger.debug("Failed to clean up temp HTML file", { htmlPath, error });
      }
    }
  }

  /**
   * Export from a saved recording JSON file.
   */
  async exportFromFile(
    recordingPath: string,
    options: VideoExportOptions,
  ): Promise<VideoExportResult> {
    const content = readFileSync(recordingPath, "utf-8");
    const recording = JSON.parse(content) as { events: RRWebEvent[] };
    return this.export(recording.events, options);
  }

  private generateReplayPage(
    events: RRWebEvent[],
    width: number,
    height: number,
    speed: number,
  ): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${RRWEB_PLAYER_CSS}">
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; overflow: hidden; }
    #player { width: ${width}px; height: ${height}px; }
  </style>
</head>
<body>
  <div id="player"></div>
  <script src="${RRWEB_PLAYER_CDN}"></script>
  <script>
    const events = ${JSON.stringify(events)};
    new rrwebPlayer({
      target: document.getElementById('player'),
      props: {
        events: events,
        width: ${width},
        height: ${height},
        autoPlay: true,
        showController: false,
        speed: ${speed},
      },
    });
  </script>
</body>
</html>`;
  }

  private calculateDuration(events: RRWebEvent[]): number {
    if (events.length < 2) return 0;
    const first = events[0].timestamp;
    const last = events[events.length - 1].timestamp;
    return Math.round((last - first) / 1000);
  }
}
