// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/story-testing.ts - Ladle/Histoire Story Testing
// ──────────────────────────────────────────────────────────────────────────────

/** Story framework type */
export type StoryFramework = "storybook" | "ladle" | "histoire";

/** Story definition */
export interface StoryDefinition {
  id: string;
  title: string;
  name: string;
  framework: StoryFramework;
  component: string;
  filePath: string;
  variants: StoryVariant[];
  decorators?: string[];
}

/** Story variant */
export interface StoryVariant {
  name: string;
  args: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

/** Story test result */
export interface StoryTestResult {
  storyId: string;
  framework: StoryFramework;
  url: string;
  screenshot?: string;
  width: number;
  height: number;
  passed: boolean;
  diff?: string;
  error?: string;
  durationMs: number;
}

/** Story testing configuration */
export interface StoryTestConfig {
  frameworks: StoryFramework[];
  viewports: Array<{ width: number; height: number; name: string }>;
  threshold: number;
  maskSelectors: string[];
  parallel: boolean;
}

/**
 * Multi-Framework Story Testing Service (Lost Pixel-inspired).
 * Supports Storybook, Ladle, and Histoire story testing.
 *
 * Usage:
 * ```ts
 * const tester = new StoryTestingService();
 * tester.discoverStories('http://localhost:6006', 'ladle');
 * const results = await tester.runTests();
 * ```
 */
export class StoryTestingService {
  private stories: Map<string, StoryDefinition> = new Map();
  private config: StoryTestConfig;

  constructor(config: Partial<StoryTestConfig> = {}) {
    this.config = {
      frameworks: config.frameworks ?? ["storybook", "ladle", "histoire"],
      viewports: config.viewports ?? [
        { width: 1280, height: 720, name: "desktop" },
        { width: 768, height: 1024, name: "tablet" },
        { width: 375, height: 812, name: "mobile" },
      ],
      threshold: config.threshold ?? 0.1,
      maskSelectors: config.maskSelectors ?? [".timestamp", ".dynamic-content"],
      parallel: config.parallel ?? true,
    };
  }

  /**
   * Discover stories from a running story server.
   */
  async discoverStories(baseUrl: string, framework: StoryFramework): Promise<StoryDefinition[]> {
    const stories: StoryDefinition[] = [];

    try {
      if (framework === "ladle") {
        const response = await fetch(`${baseUrl}/meta.json`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const meta = (await response.json()) as Record<string, unknown>;
          const storyEntries = (meta["stories"] as Record<string, Record<string, unknown>>) ?? {};
          for (const [key, story] of Object.entries(storyEntries)) {
            stories.push({
              id: key,
              title: (story["name"] as string) ?? key,
              name: key.split("-").pop() ?? key,
              framework: "ladle",
              component: key,
              filePath: (story["filePath"] as string) ?? "",
              variants: [{ name: "Default", args: {} }],
            });
          }
        }
      }

      if (framework === "histoire") {
        const response = await fetch(`${baseUrl}/_ uçu.json`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const data = (await response.json()) as Array<Record<string, unknown>>;
          for (const story of data) {
            stories.push({
              id: story["id"] as string,
              title: story["title"] as string,
              name: (story["variant"] as string) ?? "Default",
              framework: "histoire",
              component: story["title"] as string,
              filePath: (story["filePath"] as string) ?? "",
              variants: [
                { name: "Default", args: (story["slots"] as Record<string, unknown>) ?? {} },
              ],
            });
          }
        }
      }

      if (framework === "storybook") {
        const response = await fetch(`${baseUrl}/stories.json`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const data = (await response.json()) as Record<string, unknown>;
          const entries = (data["stories"] as Record<string, Record<string, unknown>>) ?? {};
          for (const [key, story] of Object.entries(entries)) {
            stories.push({
              id: key,
              title: story["title"] as string,
              name: story["name"] as string,
              framework: "storybook",
              component: (story["kind"] as string) ?? key,
              filePath:
                ((story["parameters"] as Record<string, unknown>)?.["fileName"] as string) ?? "",
              variants: [
                { name: "Default", args: (story["args"] as Record<string, unknown>) ?? {} },
              ],
            });
          }
        }
      }
    } catch {
      // Discovery failed
    }

    for (const story of stories) {
      this.stories.set(story.id, story);
    }

    return stories;
  }

  /**
   * Get story URL for a framework.
   */
  getStoryUrl(baseUrl: string, story: StoryDefinition): string {
    switch (story.framework) {
      case "ladle":
        return `${baseUrl}/?story=${story.id}`;
      case "histoire":
        return `${baseUrl}/story/${story.id}`;
      case "storybook":
        return `${baseUrl}/iframe.html?id=${story.id}`;
    }
  }

  /**
   * Get all discovered stories.
   */
  getStories(framework?: StoryFramework): StoryDefinition[] {
    const all = Array.from(this.stories.values());
    if (framework) return all.filter((s) => s.framework === framework);
    return all;
  }

  /**
   * Group stories by component.
   */
  getStoriesByComponent(): Map<string, StoryDefinition[]> {
    const grouped = new Map<string, StoryDefinition[]>();
    for (const story of this.stories.values()) {
      const existing = grouped.get(story.component) ?? [];
      existing.push(story);
      grouped.set(story.component, existing);
    }
    return grouped;
  }

  /**
   * Get framework-specific configuration.
   */
  static getFrameworkConfig(framework: StoryFramework): {
    port: number;
    command: string;
    storyPattern: string;
    metaEndpoint: string;
  } {
    switch (framework) {
      case "ladle":
        return {
          port: 61000,
          command: "ladle serve",
          storyPattern: "**/*.stories.{tsx,jsx}",
          metaEndpoint: "/meta.json",
        };
      case "histoire":
        return {
          port: 6006,
          command: "histoire dev",
          storyPattern: "**/*.story.{vue,tsx,jsx}",
          metaEndpoint: "/_ uçu.json",
        };
      case "storybook":
        return {
          port: 6006,
          command: "storybook dev",
          storyPattern: "**/*.stories.{tsx,jsx,mdx}",
          metaEndpoint: "/stories.json",
        };
    }
  }
}
