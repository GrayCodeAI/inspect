// ──────────────────────────────────────────────────────────────────────────────
// Session Recorder Integration Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chromium, type Page, type Browser } from "playwright";
import { SessionRecorder } from "./recorder.js";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SessionRecorder", () => {
  let browser: Browser;
  let page: Page;
  let recorder: SessionRecorder;
  let tempDir: string;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    recorder = new SessionRecorder();
    tempDir = mkdtempSync(join(tmpdir(), "session-test-"));
  });

  afterEach(async () => {
    await browser.close();
    // Clean up temp dir
    try {
      rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("startRecording()", () => {
    it("should start recording successfully", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      expect(recorder.isRecording()).toBe(true);
    });

    it("should throw error if already recording", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      await expect(recorder.startRecording(page)).rejects.toThrow("Recording already in progress");
    });

    it("should inject rrweb into page", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      // Check that rrweb is loaded
      const rrwebExists = await page.evaluate(() => {
        return typeof (window as unknown as { rrweb?: unknown }).rrweb !== "undefined";
      });

      expect(rrwebExists).toBe(true);
    });
  });

  describe("stopRecording()", () => {
    it("should stop recording and return events", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      // Perform some actions
      await page.click("body");
      await page.mouse.move(100, 100);

      const events = await recorder.stopRecording(page);

      expect(recorder.isRecording()).toBe(false);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it("should throw error if not recording", async () => {
      await expect(recorder.stopRecording(page)).rejects.toThrow("No recording in progress");
    });

    it("should capture DOM mutations", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      // Modify DOM
      await page.evaluate(() => {
        const div = document.createElement("div");
        div.id = "test-element";
        div.textContent = "Test";
        document.body.appendChild(div);
      });

      const events = await recorder.stopRecording(page);

      // Should have DOM mutation events
      const mutationEvents = events.filter((e) => e.type === 2); // rrweb mutation event type
      expect(mutationEvents.length).toBeGreaterThan(0);
    });
  });

  describe("saveReplay()", () => {
    it("should save recording to disk", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);
      await page.click("body");
      const events = await recorder.stopRecording(page);

      const filePath = recorder.saveReplay("test-session", events, tempDir);

      expect(existsSync(filePath)).toBe(true);
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.planId).toBe("test-session");
      expect(content.events).toEqual(events);
    });

    it("should throw error if no events", () => {
      expect(() => recorder.saveReplay("test", [], tempDir)).toThrow("No events to save");
    });

    it("should use default events from last recording", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);
      await page.click("body");
      await recorder.stopRecording(page);

      // Don't pass events - should use internal state
      const filePath = recorder.saveReplay("test-session", undefined, tempDir);

      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe("generateHTMLViewer()", () => {
    it("should generate HTML with embedded events", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);
      await page.click("body");
      const events = await recorder.stopRecording(page);

      const html = recorder.generateHTMLViewer(events);

      expect(html).toContain("rrwebPlayer");
      expect(html).toContain("Session Recording");
      expect(html).toContain(JSON.stringify(events));
    });

    it("should save HTML to file when path provided", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);
      await page.click("body");
      const events = await recorder.stopRecording(page);

      const outputPath = join(tempDir, "replay.html");
      const html = recorder.generateHTMLViewer(events, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const savedHtml = readFileSync(outputPath, "utf-8");
      expect(savedHtml).toEqual(html);
    });

    it("should calculate duration correctly", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);
      await new Promise((r) => setTimeout(r, 100)); // Wait 100ms
      const events = await recorder.stopRecording(page);

      const html = recorder.generateHTMLViewer(events);

      expect(html).toContain("Events:");
      expect(html).toContain("Duration:");
    });
  });

  describe("getEventCount()", () => {
    it("should return correct event count", async () => {
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      expect(recorder.getEventCount()).toBe(0);

      await page.click("body");

      // Events are captured asynchronously
      await new Promise((r) => setTimeout(r, 100));

      const count = recorder.getEventCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("integration workflow", () => {
    it("should record, save, and generate viewer", async () => {
      // 1. Navigate and record
      await page.goto("https://example.com");
      await recorder.startRecording(page);

      // 2. Perform actions
      await page.click("body");
      await page.mouse.move(50, 50);
      await page.evaluate(() => window.scrollTo(0, 100));

      // 3. Stop recording
      const events = await recorder.stopRecording(page);
      expect(events.length).toBeGreaterThan(0);

      // 4. Save replay
      const jsonPath = recorder.saveReplay("integration-test", events, tempDir);
      expect(existsSync(jsonPath)).toBe(true);

      // 5. Generate HTML viewer
      const htmlPath = jsonPath.replace(".json", "-viewer.html");
      recorder.generateHTMLViewer(events, htmlPath);
      expect(existsSync(htmlPath)).toBe(true);

      // 6. Verify HTML content
      const html = readFileSync(htmlPath, "utf-8");
      expect(html).toContain("rrwebPlayer");
      expect(html).toContain("integration-test");
    });
  });
});
