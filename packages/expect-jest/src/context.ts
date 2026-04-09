// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Test Context
// ──────────────────────────────────────────────────────────────────────────────

import type { InspectConfig, InspectTestContext } from "./types.js";

const DEFAULT_CONFIG: InspectConfig = {
  browser: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  screenshotOnFailure: true,
  screenshotDir: "./test-results/screenshots",
  video: false,
  videoDir: "./test-results/videos",
  trace: false,
  traceDir: "./test-results/traces",
  cache: true,
  timeout: 30000,
  retries: 0,
  selfHealing: true,
};

let globalConfig: InspectConfig = { ...DEFAULT_CONFIG };

export function defineInspectConfig(config: InspectConfig): InspectConfig {
  globalConfig = { ...DEFAULT_CONFIG, ...config };
  return globalConfig;
}

export function getInspectConfig(): InspectConfig {
  return globalConfig;
}

export async function createTestContext(config?: InspectConfig): Promise<InspectTestContext> {
  const mergedConfig = { ...globalConfig, ...config };

  const { chromium, firefox, webkit } = await import("playwright");

  const browserLauncher =
    mergedConfig.browser === "firefox"
      ? firefox
      : mergedConfig.browser === "webkit"
        ? webkit
        : chromium;

  const browser = await browserLauncher.launch({
    headless: mergedConfig.headless,
    slowMo: mergedConfig.slowMo,
  });

  const context = await browser.newContext({
    viewport: mergedConfig.viewport,
    recordVideo: mergedConfig.video
      ? {
          dir: mergedConfig.videoDir ?? "./test-results/videos",
        }
      : undefined,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(mergedConfig.timeout ?? 30000);

  const { createNLAct } = await import("@inspect/browser");

  const nlAct = createNLAct(page, {
    llm: async (messages) => {
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

  return {
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
      await this.page.goto(fullUrl, { waitUntil: "domcontentloaded" });
    },

    async wait(instruction: string, timeout?: number): Promise<void> {
      if (instruction.match(/^\d+$/)) {
        await page.waitForTimeout(parseInt(instruction, 10));
      } else {
        await page.waitForTimeout(timeout ?? 1000);
      }
    },

    async screenshot(name?: string): Promise<string> {
      const dir = mergedConfig.screenshotDir ?? "./test-results/screenshots";
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });

      const filename = name ?? `screenshot-${Date.now()}.png`;
      const path = `${dir}/${filename}`;
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
}

export async function cleanupTestContext(ctx: InspectTestContext): Promise<void> {
  await ctx.context.close();
  await ctx.browser.close();
}

/** Get global inspect context */
export function inspect(): InspectTestContext {
  if (!globalThis.__inspectContext) {
    throw new Error(
      "Inspect context not available. Make sure you're using the Inspect environment.",
    );
  }
  return globalThis.__inspectContext;
}
