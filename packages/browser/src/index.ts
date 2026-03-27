// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Browser automation, ARIA snapshots, vision, cookies, MCP
// ──────────────────────────────────────────────────────────────────────────────

// Playwright browser/page management
export { BrowserManager } from "./playwright/browser.js";
export { PageManager } from "./playwright/page.js";
export {
  CrossBrowserManager,
  type BrowserEngine,
  type CrossBrowserResult,
} from "./playwright/cross-browser.js";
export type { Page } from "playwright";

// ARIA accessibility snapshots
export { AriaSnapshotBuilder } from "./aria/snapshot.js";
export { AriaTree } from "./aria/tree.js";
export { RefManager } from "./aria/refs.js";

// DOM capture and hybrid trees
export { DOMCapture } from "./dom/capture.js";
export { HybridTree } from "./dom/hybrid.js";
export { FrameRegistry } from "./dom/frames.js";

// Vision / screenshot
export { ScreenshotCapture } from "./vision/screenshot.js";
export {
  VisionDetector,
  OpenAIVisionClient,
  GeminiVisionClient,
  type VisionLLMClient,
} from "./vision/detector.js";

// Cookie extraction
export {
  BROWSER_CONFIGS,
  findBrowserConfig,
  getAvailableBrowsers,
  resolveBrowserPath,
} from "./cookies/browsers.js";
export { CookieExtractor } from "./cookies/extract.js";

// Session recording
export { SessionRecorder } from "./session/recorder.js";
export { HARRecorder } from "./session/har.js";

// MCP server
export { MCPServer } from "./mcp/server.js";
export { BROWSER_TOOLS, getToolDefinition, getToolNames } from "./mcp/tools.js";

// DOM traversal (iFrame and Shadow DOM)
export {
  FrameTraverser,
  type FrameTraversalOptions,
  type FrameTraversalResult,
} from "./dom/frame-traverser.js";
export {
  ShadowDomResolver,
  type ShadowRootInfo,
  type ShadowDomResult,
} from "./dom/shadow-resolver.js";

// Browser profiles
export {
  ProfileManager,
  type BrowserProfile,
  type ProfileManagerConfig,
} from "./profiles/manager.js";

// Browser backends
export {
  LightpandaBackend,
  ChromiumBackend,
  BackendFactory,
  type LightpandaConfig,
  type BrowserBackend,
} from "./backends/lightpanda.js";

// Re-export shared types for convenience
export type {
  BrowserConfig,
  ProxyConfig,
  GeolocationConfig,
  CookieParam,
  ScreenshotOptions,
  PDFOptions,
  ElementSnapshot,
  BoundingBox,
  SnapshotStats,
  DOMNode,
  HybridNode,
  FrameInfo,
  VisionAction,
  VisionDetectionRequest,
  BrowserCookieConfig,
  CookieData,
  SessionRecording,
  RRWebEvent,
  HARArchive,
  HAREntry,
  MCPToolDefinition,
  MCPToolResult,
  ConsoleMessage,
  NetworkRequest,
} from "@inspect/shared";
