// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Browser, BrowserContext } from "playwright";

/** Inspect test context provided to each test */
export interface InspectTestContext {
  /** Playwright page instance */
  page: Page;
  /** Playwright browser instance */
  browser: Browser;
  /** Playwright browser context */
  context: BrowserContext;
  /** Natural language action helper */
  act: (instruction: string) => Promise<void>;
  /** Natural language assertion helper */
  assert: (instruction: string) => Promise<void>;
  /** Extract data using natural language */
  extract: <T>(instruction: string, schema?: Record<string, unknown>) => Promise<T>;
  /** Navigate to URL */
  goto: (url: string) => Promise<void>;
  /** Wait for condition */
  wait: (instruction: string, timeout?: number) => Promise<void>;
  /** Screenshot helper */
  screenshot: (name?: string) => Promise<string>;
  /** Get current URL */
  url: () => Promise<string>;
  /** Get page title */
  title: () => Promise<string>;
}

/** Inspect plugin configuration */
export interface InspectConfig {
  /** Browser to use (chromium, firefox, webkit) */
  browser?: "chromium" | "firefox" | "webkit";
  /** Run browser in headless mode */
  headless?: boolean;
  /** Slow down operations by milliseconds */
  slowMo?: number;
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** Base URL for tests */
  baseURL?: string;
  /** Screenshot on failure */
  screenshotOnFailure?: boolean;
  /** Screenshot directory */
  screenshotDir?: string;
  /** Record video */
  video?: boolean;
  /** Video directory */
  videoDir?: string;
  /** Trace recording */
  trace?: boolean;
  /** Trace directory */
  traceDir?: string;
  /** Action caching */
  cache?: boolean;
  /** Cache config */
  cacheConfig?: {
    maxSize?: number;
    ttl?: number;
    minSuccessRate?: number;
  };
  /** LLM configuration */
  llm?: {
    provider?: "openai" | "anthropic" | "local";
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  /** Dashboard integration */
  dashboard?: {
    enabled?: boolean;
    url?: string;
  };
  /** Default timeout for actions */
  timeout?: number;
  /** Retry failed actions */
  retries?: number;
  /** Retry delay in ms */
  retryDelay?: number;
  /** Self-healing enabled */
  selfHealing?: boolean;
  /** Human-in-the-loop */
  hitl?: boolean;
}

/** Test options override */
export interface TestOptions {
  /** Test timeout */
  timeout?: number;
  /** Retry count */
  retries?: number;
  /** Skip test */
  skip?: boolean;
  /** Only run this test */
  only?: boolean;
  /** Test tags */
  tags?: string[];
}

/** Assertion result */
export interface AssertionResult {
  pass: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

/** Custom matchers */
export interface InspectMatchers<R = unknown> {
  /** Assert element is visible */
  toBeVisible(): Promise<R>;
  /** Assert element is hidden */
  toBeHidden(): Promise<R>;
  /** Assert element is enabled */
  toBeEnabled(): Promise<R>;
  /** Assert element is disabled */
  toBeDisabled(): Promise<R>;
  /** Assert element has text */
  toHaveText(text: string | RegExp): Promise<R>;
  /** Assert element contains text */
  toContainText(text: string | RegExp): Promise<R>;
  /** Assert element has value */
  toHaveValue(value: string | RegExp): Promise<R>;
  /** Assert URL matches */
  toHaveURL(url: string | RegExp): Promise<R>;
  /** Assert title matches */
  toHaveTitle(title: string | RegExp): Promise<R>;
  /** Assert element count */
  toHaveCount(count: number): Promise<R>;
  /** Assert element has attribute */
  toHaveAttribute(name: string, value?: string | RegExp): Promise<R>;
  /** Assert element has class */
  toHaveClass(className: string | string[]): Promise<R>;
  /** Assert element is checked */
  toBeChecked(): Promise<R>;
  /** Assert element is focused */
  toBeFocused(): Promise<R>;
  /** Custom assertion with natural language */
  toSatisfy(instruction: string): Promise<R>;
}

/** Step result */
export interface StepResult {
  id: number;
  action: string;
  description: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  error?: string;
  screenshot?: string;
}

/** Test result */
export interface TestResult {
  id: string;
  name: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  steps: StepResult[];
  error?: string;
  screenshots: string[];
  video?: string;
  trace?: string;
}
