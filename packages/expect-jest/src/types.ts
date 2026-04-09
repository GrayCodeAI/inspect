// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Browser, BrowserContext } from "playwright";

/** Inspect test context */
export interface InspectTestContext {
  page: Page;
  browser: Browser;
  context: BrowserContext;
  act: (instruction: string) => Promise<void>;
  assert: (instruction: string) => Promise<void>;
  extract: <T>(instruction: string, schema?: Record<string, unknown>) => Promise<T>;
  goto: (url: string) => Promise<void>;
  wait: (instruction: string, timeout?: number) => Promise<void>;
  screenshot: (name?: string) => Promise<string>;
  url: () => Promise<string>;
  title: () => Promise<string>;
}

/** Inspect configuration */
export interface InspectConfig {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  baseURL?: string;
  screenshotOnFailure?: boolean;
  screenshotDir?: string;
  video?: boolean;
  videoDir?: string;
  trace?: boolean;
  traceDir?: string;
  cache?: boolean;
  cacheConfig?: {
    maxSize?: number;
    ttl?: number;
    minSuccessRate?: number;
  };
  llm?: {
    provider?: "openai" | "anthropic" | "local";
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  selfHealing?: boolean;
  hitl?: boolean;
}

/** Custom Jest matchers */
export interface InspectMatchers<R> {
  toBeVisible(): Promise<R>;
  toBeHidden(): Promise<R>;
  toBeEnabled(): Promise<R>;
  toBeDisabled(): Promise<R>;
  toHaveText(text: string | RegExp): Promise<R>;
  toContainText(text: string | RegExp): Promise<R>;
  toHaveValue(value: string | RegExp): Promise<R>;
  toHaveURL(url: string | RegExp): Promise<R>;
  toHaveTitle(title: string | RegExp): Promise<R>;
  toHaveCount(count: number): Promise<R>;
  toHaveAttribute(name: string, value?: string | RegExp): Promise<R>;
  toHaveClass(className: string | string[]): Promise<R>;
  toBeChecked(): Promise<R>;
  toBeFocused(): Promise<R>;
  toSatisfy(instruction: string): Promise<R>;
}

declare global {
  // Extend Jest matchers
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Matchers<R> extends InspectMatchers<R> {}
  }

  var __inspectContext: InspectTestContext | undefined;
}
