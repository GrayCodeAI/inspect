// ──────────────────────────────────────────────────────────────────────────────
// SessionRecorder - Record and replay browser sessions via rrweb
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SessionRecording, RRWebEvent } from "@inspect/shared";

/**
 * rrweb CDN URL for injection into pages.
 * rrweb captures all DOM mutations, mouse movements, scrolls, and inputs as a
 * replayable event stream.
 */
const RRWEB_CDN = "https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.18/dist/rrweb-all.min.js";

/**
 * rrweb-player CDN for replay viewer.
 */
const RRWEB_PLAYER_CDN = "https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js";
const RRWEB_PLAYER_CSS = "https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css";

/**
 * Records browser sessions using rrweb event capture and generates
 * standalone HTML replay viewers.
 */
export class SessionRecorder {
  private recording = false;
  private events: RRWebEvent[] = [];
  private startTime = 0;

  /**
   * Start recording a page session by injecting rrweb.
   * Captures: DOM snapshots, mutations, mouse movement, scrolls, inputs, resize, etc.
   */
  async startRecording(page: Page): Promise<void> {
    if (this.recording) {
      throw new Error("Recording already in progress. Stop the current recording first.");
    }

    this.events = [];
    this.startTime = Date.now();
    this.recording = true;

    // Inject rrweb and start recording
    await page.addScriptTag({ url: RRWEB_CDN });

    await page.evaluate(() => {
      const w = window as unknown as {
        rrweb: { record: (opts: unknown) => () => void };
        __inspect_rrweb_events: Array<{ type: number; data: unknown; timestamp: number }>;
        __inspect_rrweb_stop: (() => void) | null;
      };

      w.__inspect_rrweb_events = [];
      w.__inspect_rrweb_stop = null;

      if (!w.rrweb) {
        throw new Error("rrweb failed to load. Check network connectivity.");
      }

      w.__inspect_rrweb_stop = w.rrweb.record({
        emit(event: { type: number; data: unknown; timestamp: number }) {
          w.__inspect_rrweb_events.push(event);
        },
        // Capture mouse movements, scrolls, etc.
        sampling: {
          mousemove: true,
          mouseInteraction: true,
          scroll: 150,
          media: 800,
          input: "last",
        },
        // Mask sensitive inputs
        maskAllInputs: false,
        maskInputOptions: {
          password: true,
        },
        // Record cross-origin iframes
        recordCrossOriginIframes: true,
      });
    });
  }

  /**
   * Stop recording and return all captured events.
   */
  async stopRecording(page: Page): Promise<RRWebEvent[]> {
    if (!this.recording) {
      throw new Error("No recording in progress.");
    }

    // Stop rrweb and collect events
    const events = await page.evaluate(() => {
      const w = window as unknown as {
        __inspect_rrweb_events: Array<{ type: number; data: unknown; timestamp: number }>;
        __inspect_rrweb_stop: (() => void) | null;
      };

      if (w.__inspect_rrweb_stop) {
        w.__inspect_rrweb_stop();
        w.__inspect_rrweb_stop = null;
      }

      const events = w.__inspect_rrweb_events || [];
      w.__inspect_rrweb_events = [];
      return events;
    });

    this.events = events as RRWebEvent[];
    this.recording = false;
    return this.events;
  }

  /**
   * Save the recorded session to disk.
   *
   * @param planId - Test plan identifier for organizing recordings
   * @param events - Events to save (defaults to last recording)
   * @param outputDir - Directory to save recordings to
   * @returns Path to the saved recording file
   */
  saveReplay(
    planId: string,
    events?: RRWebEvent[],
    outputDir: string = ".inspect/recordings",
  ): string {
    const eventsToSave = events ?? this.events;
    if (eventsToSave.length === 0) {
      throw new Error("No events to save.");
    }

    const recording: SessionRecording = {
      planId,
      startTime: this.startTime,
      endTime: Date.now(),
      events: eventsToSave,
    };

    mkdirSync(outputDir, { recursive: true });
    const filename = `${planId}-${Date.now()}.json`;
    const filePath = join(outputDir, filename);
    writeFileSync(filePath, JSON.stringify(recording, null, 2));
    return filePath;
  }

  /**
   * Generate a self-contained HTML viewer for replaying the session.
   * The viewer loads rrweb-player from CDN and embeds the events.
   *
   * @param events - Events to embed (defaults to last recording)
   * @param outputPath - Path to write the HTML file
   * @returns The HTML string
   */
  generateHTMLViewer(events?: RRWebEvent[], outputPath?: string): string {
    const eventsToEmbed = events ?? this.events;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspect - Session Recording</title>
  <link rel="stylesheet" href="${RRWEB_PLAYER_CSS}">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    h1 {
      margin-bottom: 20px;
      font-size: 1.5rem;
      color: #00d4ff;
    }
    .info {
      margin-bottom: 16px;
      font-size: 0.9rem;
      opacity: 0.7;
    }
    #player-container {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <h1>Inspect Session Recording</h1>
  <div class="info">Events: ${eventsToEmbed.length} | Duration: ${this.calculateDuration(eventsToEmbed)}s</div>
  <div id="player-container"></div>

  <script src="${RRWEB_PLAYER_CDN}"></script>
  <script>
    const events = ${JSON.stringify(eventsToEmbed)};

    new rrwebPlayer({
      target: document.getElementById('player-container'),
      props: {
        events: events,
        width: 1280,
        height: 720,
        autoPlay: false,
        showController: true,
        speedOption: [1, 2, 4, 8],
      },
    });
  </script>
</body>
</html>`;

    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, html);
    }

    return html;
  }

  /**
   * Check whether a recording is in progress.
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get the number of events captured so far.
   */
  getEventCount(): number {
    return this.events.length;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private calculateDuration(events: RRWebEvent[]): number {
    if (events.length < 2) return 0;
    const first = events[0].timestamp;
    const last = events[events.length - 1].timestamp;
    return Math.round((last - first) / 1000);
  }
}
