/**
 * Session Recording with rrweb
 *
 * Records browser sessions for replay and analysis.
 * Integrates rrweb for DOM-based session recording.
 */

import { EventEmitter } from "events";

// RRWeb Event type definition
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RRWebEvent = any;

// Playwright Page interface stub to avoid DOM type dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

export interface SessionRecorderConfig {
  /** Enable recording */
  enabled: boolean;
  /** Record every Nth session (1 = all) */
  sampleRate: number;
  /** Mask sensitive inputs */
  maskInputs: boolean;
  /** Block specific URLs from recording */
  blockUrls: string[];
  /** Inline stylesheets */
  inlineStylesheet: boolean;
  /** Collect fonts */
  collectFonts: boolean;
  /** Storage key for rrweb events */
  storageKey: string;
  /** Max recording duration (ms) */
  maxDuration: number;
  /** Max events before snapshot */
  maxEvents: number;
  /** Callback on recording complete */
  onRecordingComplete?: (recording: SessionRecording) => void;
  /** Callback on replay ready */
  onReplayReady?: (replay: ReplaySession) => void;
}

export interface SessionRecording {
  id: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  events: RRWebEvent[];
  metadata: RecordingMetadata;
  stats: RecordingStats;
}

export interface RecordingMetadata {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  userAgent: string;
  testName?: string;
  testId?: string;
}

export interface RecordingStats {
  totalEvents: number;
  domMutations: number;
  mouseMoves: number;
  clicks: number;
  scrolls: number;
  inputChanges: number;
  sizeBytes: number;
}

export interface ReplaySession {
  recording: SessionRecording;
  currentTime: number;
  isPlaying: boolean;
  speed: number;
  eventsByTime: Map<number, RRWebEvent[]>;
}

export interface RecordingAnalysis {
  /** Interaction heatmap data */
  heatmap: HeatmapData;
  /** Dead click areas */
  deadClicks: ClickArea[];
  /** Rage click detection */
  rageClicks: RageClick[];
  /** Performance metrics during recording */
  performance: PerformanceMetrics;
  /** Error events */
  errors: ErrorEvent[];
}

export interface HeatmapData {
  clicks: Array<{ x: number; y: number; count: number }>;
  scrolls: Array<{ x: number; y: number; depth: number }>;
  moves: Array<{ x: number; y: number; intensity: number }>;
}

export interface ClickArea {
  x: number;
  y: number;
  selector?: string;
  timestamp: number;
  noEffect: boolean;
}

export interface RageClick {
  selector: string;
  clicks: number;
  timeWindow: number;
  startTime: number;
}

export interface PerformanceMetrics {
  fps: number[];
  memoryUsage: number[];
  longTasks: number;
  layoutShifts: number;
}

export interface ErrorEvent {
  timestamp: number;
  message: string;
  stack?: string;
  type: "js" | "network" | "console";
}

export const DEFAULT_RECORDER_CONFIG: SessionRecorderConfig = {
  enabled: true,
  sampleRate: 1,
  maskInputs: true,
  blockUrls: [],
  inlineStylesheet: true,
  collectFonts: false,
  storageKey: "inspect_rrweb_events",
  maxDuration: 600000, // 10 minutes
  maxEvents: 10000,
};

// rrweb event types
const EventType = {
  DomContentLoaded: 0,
  Load: 1,
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Custom: 5,
  Plugin: 6,
};

const IncrementalSource = {
  Mutation: 0,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  ViewportResize: 4,
  Input: 5,
  TouchMove: 6,
  MediaInteraction: 7,
  StyleSheetRule: 8,
  CanvasMutation: 9,
  Font: 10,
  Log: 11,
  Drag: 12,
  StyleDeclaration: 13,
};

/**
 * Session Recorder
 *
 * Records browser sessions using rrweb for later replay and analysis.
 */
export class SessionRecorder extends EventEmitter {
  private config: SessionRecorderConfig;
  private recordings = new Map<string, SessionRecording>();
  private activeRecordings = new Map<
    string,
    { page: Page; startTime: number; events: RRWebEvent[] }
  >();
  private recordingCounter = 0;

  constructor(config: Partial<SessionRecorderConfig> = {}) {
    super();
    this.config = { ...DEFAULT_RECORDER_CONFIG, ...config };
  }

  /**
   * Start recording a session
   */
  async startRecording(page: Page, _metadata?: Partial<RecordingMetadata>): Promise<string> {
    // Check sampling
    this.recordingCounter++;
    if (this.recordingCounter % this.config.sampleRate !== 0) {
      return "skipped";
    }

    const recordingId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Inject rrweb recorder
    await this.injectRRWeb(page);

    // Start recording
    await page.evaluate(
      (evalConfig: {
        maxEvents: number;
        maskInputs: boolean;
        inlineStylesheet: boolean;
        collectFonts: boolean;
      }) => {
        // Access global window object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        // Initialize recording array
        w["__inspect_rrweb_events"] = [];

        // Configure rrweb
        const rrwebConfig = {
          emit(event: RRWebEvent) {
            const events = w["__inspect_rrweb_events"] as RRWebEvent[] | undefined;
            if (events && events.length < evalConfig.maxEvents) {
              events.push(event);
            }
          },
          maskAllInputs: evalConfig.maskInputs,
          blockClass: "rr-block",
          ignoreClass: "rr-ignore",
          inlineStylesheet: evalConfig.inlineStylesheet,
          collectFonts: evalConfig.collectFonts,
        };

        // Start rrweb
        if (w["rrweb"]) {
          w["rrwebRecord"] = w["rrweb"].record(rrwebConfig);
        }
      },
      {
        maxEvents: this.config.maxEvents,
        maskInputs: this.config.maskInputs,
        inlineStylesheet: this.config.inlineStylesheet,
        collectFonts: this.config.collectFonts,
      },
    );

    // Get initial metadata

    const pageMetadata = await page.evaluate(
      (): {
        url: string;
        title: string;
        viewport: { width: number; height: number };
        userAgent: string;
      } => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        return {
          url: w.location?.href ?? "",
          title: w.document?.title ?? "",
          viewport: {
            width: w.innerWidth ?? 1280,
            height: w.innerHeight ?? 720,
          },
          userAgent: w.navigator?.userAgent ?? "",
        };
      },
    );

    this.activeRecordings.set(recordingId, {
      page,
      startTime: Date.now(),
      events: [],
    });

    // Set up event collection interval
    const collectionInterval = setInterval(async () => {
      const recording = this.activeRecordings.get(recordingId);
      if (!recording) {
        clearInterval(collectionInterval);
        return;
      }

      // Check max duration
      if (Date.now() - recording.startTime > this.config.maxDuration) {
        await this.stopRecording(recordingId);
        clearInterval(collectionInterval);
        return;
      }

      // Collect events

      const events = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        const collected = w["__inspect_rrweb_events"] || [];
        w["__inspect_rrweb_events"] = [];
        return collected;
      });

      recording.events.push(...events);
    }, 1000);

    this.emit("recording:started", { recordingId, metadata: pageMetadata });

    return recordingId;
  }

  /**
   * Stop recording and save
   */
  async stopRecording(recordingId: string): Promise<SessionRecording | null> {
    const active = this.activeRecordings.get(recordingId);
    if (!active) return null;

    const { page, startTime, events } = active;

    // Stop rrweb
    try {
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        if (w["rrwebRecord"]) {
          w["rrwebRecord"]();
        }
      });
    } catch {
      // Page might be closed
    }

    // Collect final events
    try {
      const finalEvents = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        const collected = w["__inspect_rrweb_events"] || [];
        delete w["__inspect_rrweb_events"];
        delete w["rrwebRecord"];
        return collected;
      });
      events.push(...finalEvents);
    } catch {
      // Page might be closed
    }

    const endTime = Date.now();

    // Create recording
    let url: string;
    const pageUrl = page.url();
    if (typeof pageUrl === "string") {
      url = pageUrl;
    } else {
      url = await pageUrl;
    }
    const title = await page.title().catch(() => "");

    const metadata: RecordingMetadata = {
      url,
      title,
      viewport: { width: 1280, height: 720 },
      userAgent: "",
    };

    const stats = this.calculateStats(events);

    const recording: SessionRecording = {
      id: recordingId,
      sessionId: recordingId,
      startTime,
      endTime,
      duration: endTime - startTime,
      events,
      metadata,
      stats,
    };

    this.recordings.set(recordingId, recording);
    this.activeRecordings.delete(recordingId);

    this.emit("recording:complete", recording);
    this.config.onRecordingComplete?.(recording);

    return recording;
  }

  /**
   * Inject rrweb library into page
   */
  private async injectRRWeb(page: Page): Promise<void> {
    // Check if already injected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasRRWeb = await page.evaluate(() => !!(globalThis as any)["rrweb"]);
    if (hasRRWeb) return;

    // Inject rrweb from CDN or bundle
    await page.addScriptTag({
      url: "https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js",
    });

    // Wait for load
    await page.waitForFunction(() => !!(globalThis as { [key: string]: unknown })["rrweb"], {
      timeout: 5000,
    });
  }

  /**
   * Calculate recording statistics
   */
  private calculateStats(events: RRWebEvent[]): RecordingStats {
    let domMutations = 0;
    let mouseMoves = 0;
    let clicks = 0;
    let scrolls = 0;
    let inputChanges = 0;

    for (const event of events) {
      if (event.type === EventType.IncrementalSnapshot) {
        const source = (event.data as { source?: number })?.source;
        switch (source) {
          case IncrementalSource.Mutation:
            domMutations++;
            break;
          case IncrementalSource.MouseMove:
            mouseMoves++;
            break;
          case IncrementalSource.MouseInteraction:
            if ((event.data as { type?: number })?.type === 2) clicks++;
            break;
          case IncrementalSource.Scroll:
            scrolls++;
            break;
          case IncrementalSource.Input:
            inputChanges++;
            break;
        }
      }
    }

    const sizeBytes = new Blob([JSON.stringify(events)]).size;

    return {
      totalEvents: events.length,
      domMutations,
      mouseMoves,
      clicks,
      scrolls,
      inputChanges,
      sizeBytes,
    };
  }

  /**
   * Get recording for replay
   */
  getReplay(recordingId: string): ReplaySession | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;

    // Index events by time for efficient seeking
    const eventsByTime = new Map<number, RRWebEvent[]>();
    for (const event of recording.events) {
      const timeSlot = Math.floor((event.timestamp as number) / 1000) * 1000;
      if (!eventsByTime.has(timeSlot)) {
        eventsByTime.set(timeSlot, []);
      }
      eventsByTime.get(timeSlot)!.push(event);
    }

    const replay: ReplaySession = {
      recording,
      currentTime: 0,
      isPlaying: false,
      speed: 1,
      eventsByTime,
    };

    this.config.onReplayReady?.(replay);

    return replay;
  }

  /**
   * Analyze recording for insights
   */
  analyzeRecording(recordingId: string): RecordingAnalysis {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const heatmap: HeatmapData = {
      clicks: [],
      scrolls: [],
      moves: [],
    };

    const deadClicks: ClickArea[] = [];
    const rageClicks: RageClick[] = [];
    const errors: ErrorEvent[] = [];
    const clickSequence: Array<{ x: number; y: number; time: number; selector?: string }> = [];

    let lastMutationTime = 0;

    for (const event of recording.events) {
      if (event.type === EventType.IncrementalSnapshot) {
        const data = event.data as {
          source?: number;
          positions?: Array<{ x: number; y: number }>;
          type?: number;
          x?: number;
          y?: number;
          id?: string | number;
        };

        // Track mouse moves
        if (data.source === IncrementalSource.MouseMove && data.positions) {
          for (const pos of data.positions) {
            heatmap.moves.push({
              x: pos.x,
              y: pos.y,
              intensity: 1,
            });
          }
        }

        // Track clicks
        if (data.source === IncrementalSource.MouseInteraction && data.type === 2) {
          heatmap.clicks.push({
            x: data.x ?? 0,
            y: data.y ?? 0,
            count: 1,
          });

          clickSequence.push({
            x: data.x ?? 0,
            y: data.y ?? 0,
            time: event.timestamp as number,
            selector: data.id?.toString(),
          });

          // Check for dead clicks (no mutation within 1 second)
          const clickTime = event.timestamp as number;
          setTimeout(() => {
            if (lastMutationTime < clickTime) {
              deadClicks.push({
                x: data.x ?? 0,
                y: data.y ?? 0,
                timestamp: clickTime,
                noEffect: true,
              });
            }
          }, 1000);
        }

        // Track scrolls
        if (data.source === IncrementalSource.Scroll) {
          heatmap.scrolls.push({
            x: data.x ?? 0,
            y: data.y ?? 0,
            depth: data.y ?? 0,
          });
        }

        // Track mutations
        if (data.source === IncrementalSource.Mutation) {
          lastMutationTime = event.timestamp as number;
        }
      }

      // Track errors from console logs
      if (event.type === EventType.IncrementalSnapshot) {
        const data = event.data as { source?: number; level?: string; args?: string[] };
        if (data.source === IncrementalSource.Log && data.level === "error") {
          errors.push({
            timestamp: event.timestamp as number,
            message: data.args?.[0] || "Unknown error",
            type: "console",
          });
        }
      }
    }

    // Detect rage clicks (3+ clicks on same element within 1 second)
    const clickGroups = new Map<string, Array<{ x: number; y: number; time: number }>>();
    for (const click of clickSequence) {
      const key = click.selector || `${click.x},${click.y}`;
      if (!clickGroups.has(key)) {
        clickGroups.set(key, []);
      }
      clickGroups.get(key)!.push(click);
    }

    for (const [selector, clicks] of clickGroups) {
      for (let i = 0; i < clicks.length - 2; i++) {
        const clickWindow = clicks.slice(i, i + 3);
        const timeSpan = clickWindow[2].time - clickWindow[0].time;
        if (timeSpan < 1000) {
          rageClicks.push({
            selector,
            clicks: clickWindow.length,
            timeWindow: timeSpan,
            startTime: clickWindow[0].time,
          });
        }
      }
    }

    return {
      heatmap,
      deadClicks,
      rageClicks,
      performance: {
        fps: [],
        memoryUsage: [],
        longTasks: 0,
        layoutShifts: 0,
      },
      errors,
    };
  }

  /**
   * Export recording to file
   */
  exportRecording(recordingId: string, format: "json" | "html"): string {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (format === "json") {
      return JSON.stringify(recording, null, 2);
    }

    // HTML player format
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Session Replay - ${recording.metadata.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css" />
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; }
    #player { width: 100%; max-width: 1200px; margin: 0 auto; }
    .info { margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="info">
    <h2>${recording.metadata.title}</h2>
    <p>URL: ${recording.metadata.url}</p>
    <p>Duration: ${(recording.duration / 1000).toFixed(1)}s</p>
    <p>Events: ${recording.stats.totalEvents}</p>
  </div>
  <div id="player"></div>
  <script>
    const events = ${JSON.stringify(recording.events)};
    new rrwebPlayer({
      target: document.getElementById('player'),
      props: { events, width: ${recording.metadata.viewport.width}, height: ${recording.metadata.viewport.height} }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Get all recordings
   */
  getRecordings(): SessionRecording[] {
    return Array.from(this.recordings.values());
  }

  /**
   * Delete recording
   */
  deleteRecording(recordingId: string): boolean {
    return this.recordings.delete(recordingId);
  }

  /**
   * Clean up old recordings
   */
  cleanup(maxAge: number): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [id, recording] of this.recordings) {
      if (recording.endTime < cutoff) {
        this.recordings.delete(id);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Convenience function
 */
export function createSessionRecorder(config?: Partial<SessionRecorderConfig>): SessionRecorder {
  return new SessionRecorder(config);
}
