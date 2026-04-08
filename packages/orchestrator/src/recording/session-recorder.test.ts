import { describe, it, expect, beforeEach } from "vitest";
import { SessionRecorder, SessionRecording, ReplaySession } from "./session-recorder.js";

// Mock Playwright Page to avoid actual browser dependencies
class MockPage {
  urlValue: string;
  titleValue: string;
  viewport: { width: number; height: number };
  userAgentValue: string;
  private events: unknown[] = [];
  private evaluateCalls: Array<{ script: string; arg: unknown }> = [];

  constructor(
    url: string,
    title: string = "Test Page",
    viewport: { width: number; height: number } = { width: 1280, height: 720 },
  ) {
    this.urlValue = url;
    this.titleValue = title;
    this.viewport = viewport;
    this.userAgentValue = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  }

  async url(): Promise<string> {
    return this.urlValue;
  }

  async title(): Promise<string> {
    return this.titleValue;
  }

  async evaluate<R>(
    expression: string | ((...args: unknown[]) => R),
    ...args: unknown[]
  ): Promise<R> {
    this.evaluateCalls.push({
      script: typeof expression === "string" ? expression : expression.toString(),
      arg: args,
    });

    // Mock responses based on the script
    if (typeof expression === "string" && expression.includes("__inspect_rrweb_events")) {
      const events = this.events;
      this.events = [];
      return events as R;
    }

    if (typeof expression === "string" && expression.includes("rrwebRecord")) {
      return true as R;
    }

    if (typeof expression === "string" && expression.includes("globalThis")) {
      return {
        location: { href: this.urlValue },
        document: { title: this.titleValue },
        innerWidth: this.viewport.width,
        innerHeight: this.viewport.height,
        navigator: { userAgent: this.userAgentValue },
      } as R;
    }

    return null as R;
  }

  async addScriptTag(_options: { url: string }): Promise<void> {
    // Mock script injection
  }

  async waitForFunction(
    _expression?: string | ((...args: unknown[]) => unknown),
    _options?: unknown,
  ): Promise<void> {
    // Mock wait
  }

  // Helper to simulate events from the page
  addEvent(event: unknown) {
    this.events.push(event);
  }
}

describe("SessionRecorder", () => {
  let recorder: SessionRecorder;
  let page: MockPage;

  beforeEach(() => {
    recorder = new SessionRecorder();
    page = new MockPage("https://example.com/test", "Test Page", { width: 1920, height: 1080 });
  });

  describe("startRecording", () => {
    it("should start recording and return a recording ID", async () => {
      const recordingId = await recorder.startRecording(page);
      expect(recordingId).toMatch(/^rec-/);
    });

    it("should respect sample rate (skip recording when counter doesn't align)", async () => {
      recorder = new SessionRecorder({ sampleRate: 2 });
      recorder["recordingCounter"] = 1; // Counter starts at 1, sampleRate 2 means every other call

      const id1 = await recorder.startRecording(page);
      expect(id1).toBe("skipped");

      const id2 = await recorder.startRecording(page);
      expect(id2).toMatch(/^rec-/);
    });

    it("should inject rrweb into the page", async () => {
      const recordingId = await recorder.startRecording(page);
      // We can't directly verify injection, but we can check that recording started
      expect(recordingId).toMatch(/^rec-/);
    });

    it("should set up event collection interval", async () => {
      const recordingId = await recorder.startRecording(page);
      expect(recorder["activeRecordings"].has(recordingId)).toBe(true);
    });

    it("should emit recording:started event", async () => {
      const eventHandler = jest.fn();
      recorder.on("recording:started", eventHandler);

      await recorder.startRecording(page);

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe("stopRecording", () => {
    it("should stop recording and return the recording", async () => {
      // Start recording
      const recordingId = await recorder.startRecording(page);

      // Simulate some events
      page.addEvent({ type: 2, timestamp: Date.now() });
      page.addEvent({ type: 3, timestamp: Date.now() + 10 });

      // Stop recording
      const recording = await recorder.stopRecording(recordingId);

      expect(recording).toBeDefined();
      expect(recording?.id).toBe(recordingId);
      expect(recording?.events.length).toBeGreaterThan(0);
      expect(recording?.duration).toBeGreaterThan(0);
    });

    it("should handle missing recording gracefully", async () => {
      const result = await recorder.stopRecording("non-existent-id");
      expect(result).toBeNull();
    });

    it("should stop rrweb and collect final events", async () => {
      const recordingId = await recorder.startRecording(page);

      // Simulate some events
      page.addEvent({ type: 2, timestamp: Date.now() });

      const recording = await recorder.stopRecording(recordingId);

      expect(recording).toBeDefined();
      expect(recording?.events.length).toBeGreaterThan(0);
    });

    it("should emit recording:complete event", async () => {
      const eventHandler = jest.fn();
      recorder.on("recording:complete", eventHandler);

      const recordingId = await recorder.startRecording(page);
      await recorder.stopRecording(recordingId);

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe("getReplay", () => {
    it("should return a replay session for a valid recording", () => {
      const recordingId = "test-rec-123";
      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const replay = recorder.getReplay(recordingId);

      expect(replay).toBeDefined();
      expect(replay?.recording).toBe(recording);
    });

    it("should return null for non-existent recording", () => {
      const replay = recorder.getReplay("non-existent");
      expect(replay).toBeNull();
    });

    it("should index events by time for efficient seeking", () => {
      const recordingId = "test-rec-123";
      const events = [
        { type: 2, timestamp: 1000 },
        { type: 3, timestamp: 1000 },
        { type: 2, timestamp: 2000 },
      ] as unknown;

      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events,
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 3,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const replay = recorder.getReplay(recordingId) as ReplaySession;

      expect(replay.eventsByTime.size).toBe(2); // Two time slots: 1000ms and 2000ms
      expect(replay.eventsByTime.get(1000)?.length).toBe(2);
      expect(replay.eventsByTime.get(2000)?.length).toBe(1);
    });
  });

  describe("analyzeRecording", () => {
    it("should analyze recording and return heatmap data", () => {
      const recordingId = "test-rec-123";
      const events = [
        // Mouse move event
        {
          type: 3, // IncrementalSnapshot
          data: { source: 1 }, // MouseMove
          timestamp: 1000,
          data: {
            positions: [
              { x: 100, y: 200 },
              { x: 150, y: 250 },
            ],
          },
        },
        // Click event
        {
          type: 3,
          data: {
            source: 2, // MouseInteraction
            type: 2, // Click
            x: 300,
            y: 400,
          },
          timestamp: 1500,
        },
        // Mutation event
        {
          type: 3,
          data: { source: 0 }, // Mutation
          timestamp: 2000,
        },
        // Scroll event
        {
          type: 3,
          data: { source: 3 }, // Scroll
          timestamp: 2500,
          data: { x: 0, y: 300 },
        },
      ] as unknown;

      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events,
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 4,
          domMutations: 1,
          mouseMoves: 1,
          clicks: 1,
          scrolls: 1,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const analysis = recorder.analyzeRecording(recordingId);

      expect(analysis.heatmap.moves).toHaveLength(2); // Two mouse positions
      expect(analysis.heatmap.clicks).toHaveLength(1); // One click
      expect(analysis.heatmap.scrolls).toHaveLength(1); // One scroll
      expect(analysis.deadClicks).toHaveLength(0); // No dead clicks (mutation after click)
      expect(analysis.rageClicks).toHaveLength(0); // No rage clicks
    });

    it("should detect dead clicks", () => {
      const recordingId = "test-rec-123";
      const events = [
        // Click event
        {
          type: 3,
          data: {
            source: 2, // MouseInteraction
            type: 2, // Click
            x: 300,
            y: 400,
          },
          timestamp: 1000,
        },
      ] as unknown;

      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events,
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 1,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 1,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      // Wait for the 1 second timeout to pass
      jest.advanceTimersByTime(1100);

      const analysis = recorder.analyzeRecording(recordingId);

      expect(analysis.deadClicks).toHaveLength(1);
    });

    it("should detect rage clicks", () => {
      const recordingId = "test-rec-123";
      const events = [] as unknown;

      // Create multiple rapid clicks on same position
      for (let i = 0; i < 4; i++) {
        events.push({
          type: 3,
          data: {
            source: 2,
            type: 2,
            x: 300,
            y: 400,
          },
          timestamp: 1000 + i * 200, // 4 clicks within 600ms
        });
      }

      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events,
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 4,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 4,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const analysis = recorder.analyzeRecording(recordingId);

      expect(analysis.rageClicks).toHaveLength(1);
      expect(analysis.rageClicks[0].clicks).toBe(4);
      expect(analysis.rageClicks[0].timeWindow).toBeLessThan(1000);
    });

    it("should capture console errors", () => {
      const recordingId = "test-rec-123";
      const events = [
        {
          type: 3,
          data: {
            source: 11, // Log
            level: "error",
            args: ["Something went wrong"],
          },
          timestamp: 1000,
        },
      ] as unknown;

      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events,
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 1,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const analysis = recorder.analyzeRecording(recordingId);

      expect(analysis.errors).toHaveLength(1);
      expect(analysis.errors[0].message).toBe("Something went wrong");
      expect(analysis.errors[0].type).toBe("console");
    });
  });

  describe("exportRecording", () => {
    it("should export recording as JSON", () => {
      const recordingId = "test-rec-123";
      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const json = recorder.exportRecording(recordingId, "json");
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(recording);
    });

    it("should export recording as HTML player", () => {
      const recordingId = "test-rec-123";
      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const html = recorder.exportRecording(recordingId, "html");

      expect(html).toContain("Test Page");
      expect(html).toContain("https://example.com/test");
      expect(html).toContain("rrwebPlayer");
    });

    it("should throw for non-existent recording", () => {
      expect(() => recorder.exportRecording("non-existent", "json")).toThrow("Recording not found");
    });
  });

  describe("getRecordings", () => {
    it("should return all recordings", () => {
      const recordingId = "test-rec-123";
      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const recordings = recorder.getRecordings();

      expect(recordings).toHaveLength(1);
      expect(recordings[0].id).toBe(recordingId);
    });
  });

  describe("deleteRecording", () => {
    it("should delete a recording", () => {
      const recordingId = "test-rec-123";
      const recording: SessionRecording = {
        id: recordingId,
        sessionId: recordingId,
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Test",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };
      recorder["recordings"].set(recordingId, recording);

      const result = recorder.deleteRecording(recordingId);

      expect(result).toBe(true);
      expect(recorder["recordings"].has(recordingId)).toBe(false);
    });

    it("should return false for non-existent recording", () => {
      const result = recorder.deleteRecording("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should remove old recordings based on maxAge", () => {
      const oldRecordingId = "old-rec";
      const recentRecordingId = "recent-rec";

      const oldRecording: SessionRecording = {
        id: oldRecordingId,
        sessionId: oldRecordingId,
        startTime: Date.now() - 100000,
        endTime: Date.now() - 99000,
        duration: 1000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Old",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };

      const recentRecording: SessionRecording = {
        id: recentRecordingId,
        sessionId: recentRecordingId,
        startTime: Date.now() - 5000,
        endTime: Date.now() - 4000,
        duration: 1000,
        events: [],
        metadata: {
          url: "https://example.com",
          title: "Recent",
          viewport: { width: 1920, height: 1080 },
          userAgent: "test",
        },
        stats: {
          totalEvents: 0,
          domMutations: 0,
          mouseMoves: 0,
          clicks: 0,
          scrolls: 0,
          inputChanges: 0,
          sizeBytes: 0,
        },
      };

      recorder["recordings"].set(oldRecordingId, oldRecording);
      recorder["recordings"].set(recentRecordingId, recentRecording);

      const removed = recorder.cleanup(60000); // 1 minute

      expect(removed).toBe(1);
      expect(recorder["recordings"].has(oldRecordingId)).toBe(false);
      expect(recorder["recordings"].has(recentRecordingId)).toBe(true);
    });
  });
});
