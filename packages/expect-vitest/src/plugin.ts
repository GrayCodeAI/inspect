// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Vitest Plugin
// ──────────────────────────────────────────────────────────────────────────────

import type { Plugin } from "vitest/config";
import type { InspectConfig, InspectTestContext } from "./types.js";

const DEFAULT_CONFIG: InspectConfig = {
  browser: "chromium",
  headless: true,
  slowMo: 0,
  viewport: { width: 1280, height: 720 },
  screenshotOnFailure: true,
  screenshotDir: "./test-results/screenshots",
  video: false,
  videoDir: "./test-results/videos",
  trace: false,
  traceDir: "./test-results/traces",
  cache: true,
  cacheConfig: {
    maxSize: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    minSuccessRate: 0.7,
  },
  timeout: 30000,
  retries: 0,
  retryDelay: 1000,
  selfHealing: true,
  hitl: false,
};

/** Global configuration storage */
let globalConfig: InspectConfig = { ...DEFAULT_CONFIG };

/** Set global Inspect configuration */
export function defineInspectConfig(config: InspectConfig): InspectConfig {
  globalConfig = { ...DEFAULT_CONFIG, ...config };
  return globalConfig;
}

/** Get current Inspect configuration */
export function getInspectConfig(): InspectConfig {
  return globalConfig;
}

/** Create Inspect Vitest plugin */
export function inspectPlugin(userConfig: InspectConfig = {}): Plugin {
  globalConfig = { ...DEFAULT_CONFIG, ...userConfig };

  return {
    name: "vitest-plugin-inspect",
    enforce: "pre",
    config() {
      return {
        test: {
          // Set longer timeout for browser tests
          testTimeout: globalConfig.timeout ?? 30000,
          // Setup files
          setupFiles: ["@inspect/expect-vitest/setup"],
          // Global test environment
          globalSetup: "@inspect/expect-vitest/global-setup",
          // Environment
          environment: "node",
          // Browser config
          browser: {
            enabled: false, // We manage browser ourselves
          },
        },
      };
    },
    async buildStart() {
      // Validate config
      if (globalConfig.llm?.provider && !globalConfig.llm?.apiKey) {
        console.warn("[Inspect] LLM provider configured but no API key provided");
      }
    },
  };
}

/** Test context factory */
export async function createTestContext(config: InspectConfig = {}): Promise<InspectTestContext> {
  const mergedConfig = { ...globalConfig, ...config };

  // Lazy import Playwright
  const { chromium, firefox, webkit } = await import("playwright");

  // Select browser
  const browserLauncher =
    mergedConfig.browser === "firefox"
      ? firefox
      : mergedConfig.browser === "webkit"
        ? webkit
        : chromium;

  // Launch browser
  const browser = await browserLauncher.launch({
    headless: mergedConfig.headless,
    slowMo: mergedConfig.slowMo,
  });

  // Create context
  const context = await browser.newContext({
    viewport: mergedConfig.viewport,
    recordVideo: mergedConfig.video
      ? {
          dir: mergedConfig.videoDir ?? "./test-results/videos",
        }
      : undefined,
  });

  // Create page
  const page = await context.newPage();

  // Set default timeout
  page.setDefaultTimeout(mergedConfig.timeout ?? 30000);

  // Import Inspect helpers
  const { createNLAct } = await import("@inspect/browser");

  // Create NL act helper
  const nlAct = createNLAct(page, {
    llm: async (messages) => {
      // Use configured LLM
      const response = await fetch(
        mergedConfig.llm?.baseUrl ?? "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mergedConfig.llm?.apiKey ?? process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: mergedConfig.llm?.model ?? "gpt-4o-mini",
            messages,
            temperature: 0.1,
          }),
        },
      );
      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? "";
    },
    snapshot: async () => {
      const { AriaSnapshotBuilder } = await import("@inspect/browser");
      const builder = new AriaSnapshotBuilder();
      await builder.buildTree(page);
      return {
        text: builder.getFormattedTree(),
        url: page.url(),
        title: await page.title(),
      };
    },
  });

  // Build context
  const testContext: InspectTestContext = {
    page,
    browser,
    context,

    async act(instruction: string): Promise<void> {
      const result = await nlAct.act(instruction);
      if (!result.success) {
        throw new Error(`Action failed: ${result.error}`);
      }
    },

    async assert(instruction: string): Promise<void> {
      const result = await nlAct.validate(instruction);
      if (!result) {
        throw new Error(`Assertion failed: ${instruction}`);
      }
    },

    async extract<T>(instruction: string, schema?: Record<string, unknown>): Promise<T> {
      const result = await nlAct.extract(instruction, schema);
      if (!result.success) {
        throw new Error(`Extraction failed: ${result.error}`);
      }
      return result.data as T;
    },

    async goto(url: string): Promise<void> {
      const baseUrl = mergedConfig.baseURL;
      const fullUrl = baseUrl && !url.startsWith("http") ? `${baseUrl}${url}` : url;
      await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
    },

    async wait(instruction: string, timeout?: number): Promise<void> {
      // Parse wait instruction
      if (instruction.match(/^\d+$/)) {
        await page.waitForTimeout(parseInt(instruction, 10));
      } else if (instruction.includes("selector")) {
        const selector = instruction.match(/["']([^"']+)["']/)?.[1];
        if (selector) {
          await page.waitForSelector(selector, { timeout: timeout ?? mergedConfig.timeout });
        }
      } else {
        // Natural language wait
        await page.waitForTimeout(1000);
      }
    },

    async screenshot(name?: string): Promise<string> {
      const screenshotDir = mergedConfig.screenshotDir ?? "./test-results/screenshots";
      const { mkdir } = await import("node:fs/promises");
      await mkdir(screenshotDir, { recursive: true });

      const filename = name ?? `screenshot-${Date.now()}.png`;
      const path = `${screenshotDir}/${filename}`;
      await page.screenshot({ path });
      return path;
    },

    async url(): Promise<string> {
      return page.url();
    },

    async title(): Promise<string> {
      return page.title();
    },
  };

  return testContext;
}

/** Cleanup test context */
export async function cleanupTestContext(context: InspectTestContext): Promise<void> {
  await context.context.close();
  await context.browser.close();
}

/** Test decorator with Inspect */
export function inspectTest(
  name: string,
  testFn: (ctx: InspectTestContext) => Promise<void>,
  config?: InspectConfig,
) {
  return async () => {
    const ctx = await createTestContext(config);
    try {
      await testFn(ctx);
    } finally {
      await cleanupTestContext(ctx);
    }
  };
}
