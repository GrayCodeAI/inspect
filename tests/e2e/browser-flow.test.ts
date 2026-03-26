import { describe, it, expect, afterAll } from "vitest";
import { BrowserManager } from "@inspect/browser";
import { AriaSnapshotBuilder } from "@inspect/browser";
import type { Page } from "playwright";

describe("E2E: Browser Flow", () => {
  let browserMgr: BrowserManager;
  let page: Page;

  afterAll(async () => {
    try {
      await browserMgr?.closeBrowser();
    } catch {
      // ignore cleanup errors
    }
  });

  it("should launch browser and navigate to a page", async () => {
    browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({
      headless: true,
      viewport: { width: 1280, height: 720 },
    } as any);

    page = await browserMgr.newPage();
    expect(page).toBeDefined();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const title = await page.title();
    expect(title).toContain("Example");
  });

  it("should take an ARIA snapshot with element refs", async () => {
    const builder = new AriaSnapshotBuilder();
    const elements = await builder.buildTree(page);

    expect(elements).toBeDefined();
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);

    // Check that elements have refs
    const withRefs = elements.filter((e) => e.ref);
    expect(withRefs.length).toBeGreaterThan(0);

    // Check stats
    const stats = builder.getStats();
    expect(stats.refCount).toBeGreaterThan(0);
    expect(stats.lineCount).toBeGreaterThan(0);
  });

  it("should get formatted tree output", async () => {
    const builder = new AriaSnapshotBuilder();
    await builder.buildTree(page);
    const formatted = builder.getFormattedTree();

    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
    // Should contain ref markers like [e1]
    expect(formatted).toMatch(/\[e\d+\]/);
  });

  it("should take a screenshot", async () => {
    const screenshot = await page.screenshot({ type: "png" });
    expect(screenshot).toBeDefined();
    expect(screenshot instanceof Buffer).toBe(true);
    expect(screenshot.length).toBeGreaterThan(1000); // PNG should be > 1KB
  });

  it("should evaluate JavaScript in page context", async () => {
    const result = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasH1: !!document.querySelector("h1"),
      };
    });

    expect(result.url).toContain("example.com");
    expect(result.title).toContain("Example");
    expect(result.hasH1).toBe(true);
  });

  it("should find elements by selector", async () => {
    const h1 = await page.$("h1");
    expect(h1).not.toBeNull();

    const text = await h1!.textContent();
    expect(text).toContain("Example");
  });

  it("should capture console messages", async () => {
    const messages: string[] = [];
    page.on("console", (msg) => messages.push(msg.text()));

    await page.evaluate(() => {
      console.log("inspect-test-marker");
    });

    // Give a tick for the event to fire
    await new Promise((r) => setTimeout(r, 100));
    expect(messages).toContain("inspect-test-marker");
  });
});
