// ============================================================================
// @inspect/visual - Storybook Capture
// ============================================================================

import { sleep } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("visual/storybook");

/** Page-like interface */
interface PageHandle {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  screenshot(options?: { fullPage?: boolean; type?: string }): Promise<Buffer>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<void>;
  waitForLoadState(state?: string): Promise<void>;
}

/** Storybook capture options */
export interface StorybookCaptureOptions {
  /** Timeout per story screenshot in ms */
  timeout?: number;
  /** Wait for this time after navigating to a story before capturing */
  stabilizeDelay?: number;
  /** CSS selector to wait for before capturing */
  waitForSelector?: string;
  /** Whether to capture full page or just the story preview */
  fullPage?: boolean;
  /** Filter stories by component name pattern */
  componentFilter?: RegExp;
  /** Filter stories by story name pattern */
  storyFilter?: RegExp;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
  /** Callback for progress reporting */
  onProgress?: (current: number, total: number, storyId: string) => void;
}

/** Storybook story info */
interface StoryInfo {
  id: string;
  title: string;
  name: string;
  kind: string;
  importPath?: string;
}

/**
 * StorybookCapture discovers all stories in a running Storybook instance
 * and captures a screenshot of each one.
 */
export class StorybookCapture {
  /**
   * Capture screenshots of all stories in a Storybook instance.
   *
   * @param storybookUrl - Base URL of the running Storybook (e.g., "http://localhost:6006")
   * @param page - A Playwright page instance
   * @param options - Capture options
   * @returns Map of story ID to screenshot buffer
   */
  async captureAll(
    storybookUrl: string,
    page: PageHandle,
    options: StorybookCaptureOptions = {},
  ): Promise<Map<string, Buffer>> {
    const timeout = options.timeout ?? 10_000;
    const stabilizeDelay = options.stabilizeDelay ?? 500;
    const fullPage = options.fullPage ?? false;
    const results = new Map<string, Buffer>();

    // Navigate to Storybook to get the story list
    const stories = await this.discoverStories(storybookUrl, page, timeout);

    // Apply filters
    let filteredStories = stories;
    if (options.componentFilter) {
      filteredStories = filteredStories.filter((s) => options.componentFilter!.test(s.kind));
    }
    if (options.storyFilter) {
      filteredStories = filteredStories.filter((s) => options.storyFilter!.test(s.name));
    }

    // Capture each story
    for (let i = 0; i < filteredStories.length; i++) {
      const story = filteredStories[i];
      options.onProgress?.(i + 1, filteredStories.length, story.id);

      try {
        const screenshot = await this.captureStory(storybookUrl, story.id, page, {
          timeout,
          stabilizeDelay,
          fullPage,
          waitForSelector: options.waitForSelector,
        });
        results.set(story.id, screenshot);
      } catch (error) {
        // Skip stories that fail to render
        logger.warn("Failed to capture story", {
          storyId: story.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Capture a single story by its ID.
   */
  async captureStory(
    storybookUrl: string,
    storyId: string,
    page: PageHandle,
    options: Pick<
      StorybookCaptureOptions,
      "timeout" | "stabilizeDelay" | "fullPage" | "waitForSelector"
    > = {},
  ): Promise<Buffer> {
    const timeout = options.timeout ?? 10_000;
    const stabilizeDelay = options.stabilizeDelay ?? 500;

    // Navigate to the story's iframe URL
    const iframeUrl = `${storybookUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
    await page.goto(iframeUrl, { waitUntil: "networkidle", timeout });

    // Wait for the story to render
    await page.waitForLoadState("networkidle");

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout }).catch((err) => {
        logger.debug("Selector not found, continuing", {
          selector: options.waitForSelector,
          error: err,
        });
      });
    }

    // Wait for the storybook root to be present
    await page
      .waitForSelector("#storybook-root, #root, [id*='story']", { timeout: 5000 })
      .catch((err) => {
        logger.debug("Storybook root selector not found, continuing", { error: err });
      });

    // Stabilize
    if (stabilizeDelay > 0) {
      await sleep(stabilizeDelay);
    }

    // Capture screenshot
    return page.screenshot({
      fullPage: options.fullPage ?? false,
      type: "png",
    });
  }

  /**
   * Discover all stories in a Storybook instance.
   * Uses the Storybook API to enumerate stories.
   */
  private async discoverStories(
    storybookUrl: string,
    page: PageHandle,
    timeout: number,
  ): Promise<StoryInfo[]> {
    // Try the Storybook API endpoint first
    try {
      await page.goto(`${storybookUrl}/index.json`, { waitUntil: "networkidle", timeout });
      const indexData = (await page.evaluate(`
        (function() {
          try {
            return JSON.parse(document.body.innerText);
          } catch(e) { return null; }
        })()
      `)) as StorybookIndex | null;

      if (indexData?.entries) {
        return Object.entries(indexData.entries)
          .filter(([_, entry]) => entry.type === "story")
          .map(([id, entry]) => ({
            id,
            title: entry.title,
            name: entry.name,
            kind: entry.title,
            importPath: entry.importPath,
          }));
      }
    } catch (error) {
      logger.debug("index.json not available, trying stories.json", { error });
    }

    // Try stories.json (older Storybook versions)
    try {
      await page.goto(`${storybookUrl}/stories.json`, { waitUntil: "networkidle", timeout });
      const storiesData = (await page.evaluate(`
        (function() {
          try {
            return JSON.parse(document.body.innerText);
          } catch(e) { return null; }
        })()
      `)) as StoriesJson | null;

      if (storiesData?.stories) {
        return Object.entries(storiesData.stories).map(([id, story]) => ({
          id,
          title: story.title ?? story.kind ?? "",
          name: story.name ?? "",
          kind: story.kind ?? story.title ?? "",
          importPath: story.importPath,
        }));
      }
    } catch (error) {
      logger.debug("stories.json not available", { error });
    }

    // Fallback: navigate to Storybook and use the client-side API
    await page.goto(storybookUrl, { waitUntil: "networkidle", timeout });

    const stories = (await page.evaluate(`
      (function() {
        // Wait for __STORYBOOK_CLIENT_API__ or __STORYBOOK_STORE__
        var api = window.__STORYBOOK_CLIENT_API__ || window.__STORYBOOK_STORE__;
        if (!api) return [];

        if (api.raw) {
          return api.raw().map(function(s) {
            return { id: s.id, title: s.title || s.kind, name: s.name, kind: s.kind || s.title };
          });
        }

        if (api.getStoryIndex) {
          var index = api.getStoryIndex();
          return Object.entries(index.entries || index.stories || {}).map(function(entry) {
            var id = entry[0];
            var s = entry[1];
            return { id: id, title: s.title, name: s.name, kind: s.title };
          });
        }

        return [];
      })()
    `)) as StoryInfo[];

    return stories;
  }
}

/** Storybook index.json format (Storybook 7+) */
interface StorybookIndex {
  v: number;
  entries: Record<
    string,
    {
      type: "story" | "docs";
      id: string;
      title: string;
      name: string;
      importPath?: string;
    }
  >;
}

/** Storybook stories.json format (Storybook 6) */
interface StoriesJson {
  v: number;
  stories: Record<
    string,
    {
      id: string;
      title?: string;
      kind?: string;
      name?: string;
      importPath?: string;
    }
  >;
}
