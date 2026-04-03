// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Browser automation, ARIA snapshots, vision, cookies, MCP
// ──────────────────────────────────────────────────────────────────────────────

// Effect-TS browser service and session interface
export type { BrowserSession } from "./browser-service.js";
export { BrowserManager as BrowserManagerService } from "./browser-service.js";

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
export { PageToMarkdown } from "./dom/page-to-markdown.js";
export type { PageToMarkdownOptions } from "./dom/page-to-markdown.js";
export { DOMDiff } from "./dom/dom-diff.js";
export type { DOMDiffResult, DiffElement } from "./dom/dom-diff.js";
export { DOMSettler } from "./dom/dom-settler.js";
export type { DOMSettlerOptions } from "./dom/dom-settler.js";

// Vision / screenshot + annotated
export { ScreenshotCapture } from "./vision/screenshot.js";
export {
  VisionDetector,
  OpenAIVisionClient,
  GeminiVisionClient,
  type VisionLLMClient,
} from "./vision/detector.js";
export { AnnotatedScreenshot } from "./vision/annotated-screenshot.js";
export type {
  AnnotatedScreenshotOptions,
  AnnotatedScreenshotResult,
  AnnotatedElement,
} from "./vision/annotated-screenshot.js";
export {
  CoordinateTransformer,
  CUAActionExecutor,
  elementIndexToCoordinate,
  validateCoordinates,
} from "./vision/coordinate-interaction.js";
export type {
  CoordinateConfig,
  NormalizedCoordinate,
  CoordinateMapping,
  ElementInfo,
} from "./vision/coordinate-interaction.js";

// Multi-tree DOM collection
export {
  MultiTreeCollector,
  type MultiTreeCollection,
  type DOMTreeNode,
  type AXTreeNode,
  type DOMSnapshot,
  type EnhancedElement,
  type MultiTreeConfig,
  DEFAULT_MULTI_TREE_CONFIG,
} from "./dom/multi-tree.js";

// Two-phase stability detection
export {
  StabilityDetector,
  DEFAULT_STABILITY_CONFIG,
  type StabilityConfig,
  type StabilityMetrics,
  type NetworkStats,
  waitForStable,
} from "./stability/index.js";

// Tab activity tracking
export {
  TabActivityTracker,
  DEFAULT_TAB_ACTIVITY_CONFIG,
  type TabActivityConfig,
  type TabInfo,
  type TabStatus,
  type TabActivity,
  type ActivityType,
  type TabSnapshot,
  type TabGroup,
  createTabActivityTracker,
} from "./tabs/index.js";

// Hybrid DOM + Accessibility snapshot
export {
  HybridSnapshotBuilder,
  DEFAULT_HYBRID_CONFIG,
  type HybridSnapshotConfig,
  type HybridNode,
  type HybridSnapshot,
  type BoundingBox,
  captureHybridSnapshot,
} from "./accessibility/index.js";

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
export { VideoExporter } from "./session/video-export.js";
export type { VideoExportOptions, VideoExportResult } from "./session/video-export.js";

// MCP server
export { MCPServer } from "./mcp/server.js";
export { BROWSER_TOOLS, getToolDefinition, getToolNames } from "./mcp/tools.js";
export {
  createPageResources,
  createPagePrompts,
  type MCPResource,
  type MCPPrompt,
} from "./mcp/resources.js";

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

// Mobile gestures
export {
  GestureSimulator,
  type GestureOptions,
  type SwipeOptions,
  type GestureResult,
} from "./mobile/gestures.js";

// CDP auto-discovery
export {
  autoDiscoverCdp,
  probeCdpPort,
  listCdpTargets,
  getKnownBrowserProfiles,
  type CdpEndpoint,
} from "./discovery/cdp-discovery.js";

// iOS simulator support
export {
  IosSimulatorManager,
  IosWebDriverClient,
  type IosDevice,
  type IosSession,
} from "./mobile/ios.js";

// Watchdog system
export { BrowserWatchdog } from "./watchdog/index.js";
export type { WatchdogOptions, WatchdogEvent } from "./watchdog/index.js";

// Actions
export { FileUploadTester } from "./actions/file-upload.js";
export type { FileUploadResult } from "./actions/file-upload.js";
export { DragDrop } from "./actions/drag-drop.js";
export type { DragDropOptions, DragDropResult } from "./actions/drag-drop.js";

// Natural language page interactions (Stagehand-style)
export { createNLAct } from "./actions/nl-act.js";
export type { NLActionResult, NLSchema } from "./actions/nl-act.js";

// Playwright test code generation from recordings
export { generateTestCode } from "./actions/codegen.js";

// Vision-based coordinate grounding
export { VisionGrounding } from "./vision/grounding.js";
export type { GroundedElement, VisionGroundingOptions } from "./vision/grounding.js";

// Vision-first pixel coordinate actions (Magnitude-style)
export { VisionAgent, createVisionAgent } from "./vision/vision-agent.js";
export type { PixelAction, VisionActOptions, VisionActResult } from "./vision/vision-agent.js";

// Stealth mode — anti-detection browser configuration
export { getStealthOptions, getStealthLaunchArgs, stealthInitScript } from "./stealth/index.js";
export type { StealthOptions } from "./stealth/index.js";

// AI-augmented Playwright method params (prompt fallback)
export {
  clickWithPrompt,
  fillWithPrompt,
  selectOptionWithPrompt,
} from "./actions/prompt-params.js";

// Action replay cache
export { ActionReplayCache } from "./cache/action-replay-cache.js";
export type {
  ActionReplayCacheOptions,
  ActionReplayCacheStats,
} from "./cache/action-replay-cache.js";
export { replayAction, actionToReplayable } from "./cache/replayable-action.js";
export type { ReplayableAction, CachedAction } from "./cache/replayable-action.js";

// Network interception
export { NetworkInterceptor } from "./network/interceptor.js";
export type { MockRoute, BlockRule } from "./network/interceptor.js";

// Cloud browser provider
export {
  CloudBrowserProvider,
  CloudSessionPool,
  type CloudBrowserConfig,
  type CloudSession,
  type PoolConfig,
  type PoolHealth,
} from "./cloud/provider.js";

// Network interception and monitoring
export {
  NetworkMonitor,
  type RecordedRequest,
  type RecordedResponse,
  type HARFile,
  type MockRule,
} from "./network/monitor.js";

// Route mocking
export { RouteMocker } from "./network/route-mocker.js";
export type { RouteMock } from "./network/route-mocker.js";

// Visual assertions
export {
  VisualAssertion,
  VisualAssertionTimeoutError,
  VisualAssertionError,
} from "./vision/visual-assertion.js";
export type {
  VisualAssertionResult,
  VisualAssertionWaitResult,
  VisualAssertionOptions,
  VisualAssertionWaitOptions,
} from "./vision/visual-assertion.js";

// Re-export shared types for convenience
export type {
  BrowserConfig,
  ProxyConfig,
  GeolocationConfig,
  CookieParam,
  ScreenshotOptions,
  PDFOptions,
  ElementSnapshot,
  SnapshotStats,
  DOMNode,
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
  ConsoleMessage,
  NetworkRequest,
} from "@inspect/shared";
