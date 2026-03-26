// ============================================================================
// @inspect/shared - Browser-related type definitions
// ============================================================================

// ----------------------------------------------------------------------------
// Agent Modes
// ----------------------------------------------------------------------------

/** Tool/interaction mode for the agent */
export type AgentMode = 'dom' | 'hybrid' | 'cua';

/** Vision mode setting */
export type VisionMode = 'enabled' | 'disabled' | 'auto';

/** Vision detail level */
export type VisionDetail = 'auto' | 'low' | 'high';

/** Snapshot capture mode */
export type SnapshotMode = 'screenshot' | 'snapshot' | 'annotated';

// ----------------------------------------------------------------------------
// Element & Page Snapshots
// ----------------------------------------------------------------------------

/** Bounding rectangle for an element */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Combined ARIA + DOM snapshot of a single element.
 * Merges Expect-style ARIA refs, Stagehand XPath fallbacks,
 * and Skyvern vision IDs.
 */
export interface ElementSnapshot {
  /** Stable reference ID, e.g. "e1", "e2" (Expect style) */
  ref: string;
  /** ARIA role */
  role: string;
  /** Accessible name */
  name: string;
  /** Fallback XPath selector (Stagehand pattern) */
  xpath: string;
  /** CSS selector */
  cssSelector?: string;
  /** Vision fallback ID (Skyvern pattern) */
  skyvernId?: string;
  /** Bounding rect for coordinate-based clicking */
  bounds: BoundingBox;
  /** Whether the element is currently visible in viewport */
  visible: boolean;
  /** Whether the element can be interacted with */
  interactable: boolean;
  /** Element tag name */
  tagName?: string;
  /** Text content (truncated) */
  textContent?: string;
  /** Element value (for inputs) */
  value?: string;
  /** Element attributes subset */
  attributes?: Record<string, string>;
  /** ARIA properties */
  ariaProperties?: Record<string, string>;
  /** Child element snapshots */
  children?: ElementSnapshot[];
  /** Parent element ref */
  parentRef?: string;
  /** Frame ID if element is inside an iframe */
  frameId?: string;
  /** Whether the element is inside a shadow DOM */
  inShadowDom?: boolean;
}

/**
 * Vision-based action produced when DOM/ARIA snapshots fail.
 * The vision engine (GPT-4V / Gemini Vision) returns coordinate-based targets.
 */
export interface VisionAction {
  type: 'click' | 'type' | 'scroll' | 'drag' | 'hover' | 'doubleClick' | 'rightClick' | 'select';
  coordinates: { x: number; y: number };
  /** Optional end coordinates for drag operations */
  endCoordinates?: { x: number; y: number };
  /** Model confidence score 0-1 */
  confidence: number;
  /** Human-readable description of what was detected */
  description: string;
  /** Optional text to type */
  text?: string;
  /** Scroll direction and amount */
  scrollDelta?: { x: number; y: number };
  /** Element label in annotated screenshot */
  elementLabel?: string;
}

/** Request for vision-based element detection */
export interface VisionDetectionRequest {
  /** Base64-encoded screenshot */
  screenshot: string;
  /** Natural language instruction */
  instruction: string;
  /** Vision model provider */
  provider: 'openai' | 'google' | 'anthropic';
  /** Model ID */
  model?: string;
}

/**
 * Full page snapshot combining DOM, ARIA, and metadata.
 */
export interface PageSnapshot {
  /** Current page URL */
  url: string;
  /** Page title */
  title: string;
  /** All captured elements */
  elements: ElementSnapshot[];
  /** Timestamp of capture */
  timestamp: number;
  /** Page viewport dimensions */
  viewport?: { width: number; height: number };
  /** Screenshot buffer (base64 encoded) */
  screenshot?: string;
  /** Console messages since last snapshot */
  consoleMessages?: ConsoleMessage[];
  /** Network requests since last snapshot */
  networkRequests?: NetworkRequest[];
  /** Page fingerprint hash */
  fingerprint?: string;
  /** Frame tree information */
  frames?: FrameInfo[];
}

/** Console message captured from the page */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  timestamp: number;
  location?: { url: string; lineNumber: number; columnNumber?: number };
}

/** Network request captured from the page */
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  resourceType: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timing?: { startTime: number; endTime: number; duration: number };
  bodySize?: number;
  failed?: boolean;
  failureText?: string;
}

/** Information about a frame (iframe) on the page */
export interface FrameInfo {
  id: string;
  name: string;
  url: string;
  parentId?: string;
  /** Whether the frame is cross-origin (out-of-process) */
  isOOPIF?: boolean;
  /** Bounding rect of the iframe element */
  bounds?: BoundingBox;
  /** Child frames */
  children: FrameInfo[];
}

/** Stats about an ARIA snapshot */
export interface SnapshotStats {
  /** Total lines in the formatted tree */
  lineCount: number;
  /** Total character count */
  charCount: number;
  /** Estimated token count */
  tokenEstimate: number;
  /** Total element refs */
  refCount: number;
  /** Interactive element count */
  interactiveCount: number;
}

// ----------------------------------------------------------------------------
// DOM types
// ----------------------------------------------------------------------------

export interface DOMNode {
  /** Node type (element, text, etc.) */
  nodeType: number;
  /** Tag name (for elements) */
  tagName?: string;
  /** Attributes */
  attributes?: Record<string, string>;
  /** Text content */
  textContent?: string;
  /** Bounding box */
  bounds?: BoundingBox;
  /** Whether visible on screen */
  visible?: boolean;
  /** Child nodes */
  children?: DOMNode[];
}

export interface HybridNode {
  /** Reference ID */
  ref: string;
  /** ARIA role */
  role: string;
  /** Accessible name */
  name: string;
  /** Tag name from DOM */
  tagName: string;
  /** XPath */
  xpath: string;
  /** CSS selector */
  cssSelector: string;
  /** Bounding box */
  bounds?: BoundingBox;
  /** Whether interactive */
  interactive: boolean;
  /** Whether visible */
  visible: boolean;
  /** Text content */
  textContent?: string;
  /** Merged attributes */
  attributes?: Record<string, string>;
  /** ARIA properties */
  ariaProperties?: Record<string, string>;
  /** Children */
  children?: HybridNode[];
  /** Frame ID */
  frameId?: string;
}

// ----------------------------------------------------------------------------
// Browser Configuration
// ----------------------------------------------------------------------------

/** Proxy configuration */
export interface ProxyConfig {
  /** Proxy server URL (e.g. "http://proxy:8080") */
  server: string;
  /** Comma-separated list of hosts to bypass */
  bypass?: string;
  /** Proxy auth username */
  username?: string;
  /** Proxy auth password */
  password?: string;
  /** Proxy protocol type */
  type?: 'http' | 'https' | 'socks5';
}

/** Geolocation configuration */
export interface GeolocationConfig {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** Cookie parameter for injection */
export interface CookieParam {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** Browser cookie data (full extraction) */
export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Expiration timestamp (seconds since epoch) */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  /** Source browser */
  source?: string;
}

/** Viewport dimensions */
export interface ViewportConfig {
  width: number;
  height: number;
}

/** Full browser launch configuration */
export interface BrowserConfig {
  /** Run in headless mode */
  headless: boolean;
  /** Path to browser executable */
  executablePath?: string;
  /** Default viewport dimensions */
  viewport: ViewportConfig;
  /** Proxy configuration */
  proxy?: ProxyConfig;
  /** Browser locale (e.g. "en-US") */
  locale?: string;
  /** Browser timezone (e.g. "America/New_York") */
  timezone?: string;
  /** Enable stealth/anti-detection mode */
  stealth: boolean;
  /** Paths to browser extensions to load */
  extensions?: string[];
  /** User agent override */
  userAgent?: string;
  /** Device pixel ratio override */
  deviceScaleFactor?: number;
  /** Enable touch events */
  hasTouch?: boolean;
  /** Emulate mobile device */
  isMobile?: boolean;
  /** Browser channel selection */
  channel?: 'stable' | 'dev' | 'canary' | 'beta';
  /** Extra launch arguments */
  args?: string[];
  /** Geolocation override */
  geolocation?: GeolocationConfig;
  /** Permissions to grant */
  permissions?: string[];
  /** Disable CORS */
  disableCORS?: boolean;
  /** Disable CSP */
  disableCSP?: boolean;
  /** Enable deterministic rendering */
  deterministicRendering?: boolean;
  /** Disable Chrome sandbox */
  disableSandbox?: boolean;
  /** Default navigation timeout in ms */
  navigationTimeout?: number;
  /** Default action timeout in ms */
  actionTimeout?: number;
  /** User data directory for persistent profiles */
  userDataDir?: string;
  /** Connect to existing browser via CDP endpoint */
  cdpEndpoint?: string;
  /** Download directory path */
  downloadsPath?: string;
  /** Maximum download file size in bytes */
  maxDownloadSize?: number;
  /** Path to Chromium policies JSON */
  chromiumPoliciesPath?: string;
  /** Browser backend selection */
  backend?: 'chromium' | 'lightpanda';
  /** Extra HTTP headers to set */
  extraHTTPHeaders?: Record<string, string>;
  /** Init scripts to inject into every page */
  initScripts?: string[];
  /** Ignore HTTPS errors */
  ignoreHTTPSErrors?: boolean;
  /** Record video of browser session */
  recordVideo?: boolean;
  /** Record HAR file */
  recordHar?: boolean;
  /** Color scheme preference */
  colorScheme?: 'light' | 'dark' | 'no-preference';
  /** Reduced motion preference */
  reducedMotion?: 'reduce' | 'no-preference';
  /** Cookies to inject on context creation */
  cookies?: CookieParam[];
  /** Path to storage state JSON (cookies, localStorage, etc.) */
  storageStatePath?: string;
  /** Slow down operations by specified ms */
  slowMo?: number;
  /** Default timeout for all operations */
  defaultTimeout?: number;
  /** DOM attributes to include in snapshots */
  includedDomAttributes?: string[];
  /** Maximum text length for clickable element descriptions */
  clickableTextLengthLimit?: number;
}

/** Screenshot capture options */
export interface ScreenshotOptions {
  /** Full page or viewport only */
  fullPage?: boolean;
  /** File path to save (optional, returns buffer otherwise) */
  path?: string;
  /** Image type */
  type?: 'png' | 'jpeg';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Clip region */
  clip?: { x: number; y: number; width: number; height: number };
  /** Omit background */
  omitBackground?: boolean;
}

/** PDF save options */
export interface PDFOptions {
  path?: string;
  format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
  landscape?: boolean;
  printBackground?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  scale?: number;
  headerTemplate?: string;
  footerTemplate?: string;
  pageRanges?: string;
  width?: string | number;
  height?: string | number;
}

// ----------------------------------------------------------------------------
// Browser cookie extraction configs
// ----------------------------------------------------------------------------

export interface BrowserCookieConfig {
  name: string;
  /** Paths per platform */
  paths: {
    darwin?: string[];
    linux?: string[];
    win32?: string[];
  };
  /** Cookie database filename */
  cookieFile: string;
  /** Encryption method */
  encryption: 'chromium' | 'firefox' | 'safari' | 'none';
  /** Profile directory naming pattern */
  profilePattern?: string;
}

// ----------------------------------------------------------------------------
// Session & Recording types
// ----------------------------------------------------------------------------

export interface SessionRecording {
  planId: string;
  startTime: number;
  endTime?: number;
  events: RRWebEvent[];
}

export interface RRWebEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

export interface HARArchive {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HAREntry[];
  };
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
    bodySize: number;
  };
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}

/** Session recording format */
export type RecordingFormat = 'rrweb' | 'video' | 'gif' | 'har';

/** Recording session configuration */
export interface RecordingConfig {
  format: RecordingFormat;
  /** Capture interval in milliseconds (for rrweb) */
  interval?: number;
  /** Video FPS */
  fps?: number;
  /** Video codec */
  codec?: string;
  /** Enable recording */
  enabled: boolean;
}

// ----------------------------------------------------------------------------
// MCP (Model Context Protocol) Types
// ----------------------------------------------------------------------------

/** MCP tool definition */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/** MCP tool parameter definition */
export interface MCPToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** MCP tool definition (structured) */
export interface MCPTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input parameters schema */
  parameters: MCPToolParameter[];
  /** Whether the tool is read-only (safe for parallel calls) */
  readOnlyHint: boolean;
  /** Whether the tool can make destructive changes */
  destructiveHint: boolean;
  /** Tool category */
  category?: 'navigation' | 'observation' | 'interaction' | 'state' | 'extraction' | 'testing';
}

/** MCP tool call request */
export interface MCPToolCall {
  /** Tool name to invoke */
  tool: string;
  /** Arguments to pass */
  arguments: Record<string, unknown>;
  /** Call identifier for tracking */
  callId?: string;
}

/** MCP tool call result (structured content) */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** MCP server configuration */
export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Transport type */
  transport: 'stdio' | 'sse' | 'streamable-http';
  /** Command to start the server (for stdio) */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** URL for SSE/HTTP transport */
  url?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Available tools */
  tools?: MCPTool[];
}

// ----------------------------------------------------------------------------
// Test Results
// ----------------------------------------------------------------------------

/** Status of a test step */
export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';

/** Error information from a test step */
export interface TestError {
  message: string;
  stack?: string;
  type?: string;
  screenshot?: string;
  /** Page URL when the error occurred */
  pageUrl?: string;
  /** Element ref related to the error */
  elementRef?: string;
}

/** Single step within a test execution */
export interface TestStep {
  /** Unique step identifier */
  id: string;
  /** Natural language instruction for this step */
  instruction: string;
  /** Expected outcome description */
  expectedOutcome: string;
  /** Actual result description */
  result?: string;
  /** Step status */
  status: TestStepStatus;
  /** Duration in milliseconds */
  duration: number;
  /** Screenshot taken after this step (base64 or path) */
  screenshot?: string;
  /** Console errors captured during this step */
  consoleErrors?: string[];
  /** Element ref that was interacted with */
  targetRef?: string;
  /** Action that was performed */
  action?: string;
  /** Error details if step failed */
  error?: TestError;
  /** Timestamp when step started */
  startedAt: number;
  /** Timestamp when step completed */
  completedAt?: number;
}

/** Token usage metrics for an LLM call */
export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  inferenceTimeMs: number;
  /** Estimated cost in USD */
  cost: number;
}

/** Per-function token usage breakdown */
export interface FunctionMetrics {
  act: TokenMetrics;
  extract: TokenMetrics;
  observe: TokenMetrics;
  agent: TokenMetrics;
}

/** Aggregate result of a full test run */
export interface TestResult {
  /** Whether the test passed overall */
  passed: boolean;
  /** Individual test steps */
  steps: TestStep[];
  /** Total duration in milliseconds */
  duration: number;
  /** All errors encountered */
  errors: TestError[];
  /** Screenshots captured during the run */
  screenshots: string[];
  /** Test run metadata */
  metadata?: TestRunMetadata;
  /** Timestamp when the test started */
  startedAt: number;
  /** Timestamp when the test completed */
  completedAt: number;
  /** Summary generated by AI */
  summary?: string;
  /** Agent mode used */
  agentMode?: AgentMode;
  /** Device preset used */
  device?: string;
  /** Token usage during the run */
  tokenUsage?: TokenMetrics;
}

/** Metadata about a test run */
export interface TestRunMetadata {
  runId: string;
  planId?: string;
  flowSlug?: string;
  targetUrl?: string;
  gitScope?: GitScope;
  device?: string;
  model?: string;
  triggeredBy?: 'cli' | 'api' | 'schedule' | 'pr';
}

// ----------------------------------------------------------------------------
// Agent & LLM Configuration
// ----------------------------------------------------------------------------

/** Supported LLM provider names */
export type LLMProviderName =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'ollama'
  | 'azure-openai'
  | 'aws-bedrock'
  | 'fireworks'
  | 'perplexity'
  | 'cohere'
  | 'openrouter'
  | 'custom';

/** Configuration for a single LLM provider */
export interface LLMProvider {
  /** Provider name */
  name: LLMProviderName;
  /** Model identifier (e.g. "claude-sonnet-4-20250514") */
  model: string;
  /** API key for authentication */
  apiKey?: string;
  /** Base URL override for the API */
  baseUrl?: string;
  /** Temperature setting (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable thinking/reasoning mode */
  thinkingMode?: boolean;
  /** Maximum thinking tokens when thinking mode is enabled */
  thinkingBudget?: number;
  /** Enable prompt caching */
  promptCaching?: boolean;
  /** Custom headers to send with requests */
  headers?: Record<string, string>;
  /** Top-p sampling parameter */
  topP?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Presence penalty */
  presencePenalty?: number;
}

/** Primary agent configuration with fallback and specialists */
export interface AgentConfig {
  /** Primary model provider */
  primary: LLMProvider;
  /** Fallback provider (auto-switch on rate limits or errors) */
  fallback?: LLMProvider;
  /** Specialist providers for domain-specific tasks */
  specialists?: {
    ux?: LLMProvider;
    security?: LLMProvider;
    a11y?: LLMProvider;
    performance?: LLMProvider;
    vision?: LLMProvider;
    extraction?: LLMProvider;
  };
  /** Agent interaction mode */
  mode: AgentMode;
  /** Vision mode setting */
  vision: VisionMode;
  /** Vision detail level */
  visionDetail: VisionDetail;
  /** Maximum steps per agent run */
  maxSteps: number;
  /** Maximum actions per step */
  maxActionsPerStep: number;
  /** Per-step timeout in milliseconds */
  stepTimeout: number;
  /** Enable thinking/chain-of-thought mode */
  thinkingMode: boolean;
  /** Speed-optimized mode with reduced features */
  flashMode: boolean;
  /** Enable AI-driven planning */
  planningEnabled: boolean;
  /** Nudge replanning on detected loops */
  replanOnStall: boolean;
  /** Limit on exploration steps */
  explorationLimit: number;
  /** Maximum failures before aborting */
  maxFailures: number;
  /** Attempt final recovery before failing */
  finalRecoveryAttempt: boolean;
}

/** Agent execution settings (subset for runtime) */
export interface AgentSettings {
  toolMode: AgentMode;
  vision: VisionMode;
  visionDetail: VisionDetail;
  thinkingMode: boolean;
  flashMode: boolean;
  maxSteps: number;
  maxActionsPerStep: number;
  stepTimeout: number;
  planningEnabled: boolean;
  replanOnStall: boolean;
  explorationLimit: number;
  maxFailures: number;
  finalRecoveryAttempt: boolean;
}

// ----------------------------------------------------------------------------
// Device Presets
// ----------------------------------------------------------------------------

/** Device emulation preset */
export interface DevicePreset {
  /** Device name identifier */
  name: string;
  /** Viewport width in CSS pixels */
  width: number;
  /** Viewport height in CSS pixels */
  height: number;
  /** Device pixel ratio */
  dpr: number;
  /** User agent string */
  userAgent: string;
  /** Whether the device supports touch */
  touch: boolean;
  /** Whether the device is mobile */
  mobile: boolean;
  /** Device platform hint */
  platform?: string;
}

// ----------------------------------------------------------------------------
// Git Integration
// ----------------------------------------------------------------------------

/** Git commit information */
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
}

/** Git scope for change detection */
export interface GitScope {
  /** Target scope type */
  target: 'unstaged' | 'staged' | 'branch' | 'commit' | 'pr';
  /** List of changed files */
  changedFiles: string[];
  /** Unified diff content */
  diff: string;
  /** Recent commits */
  commits: GitCommit[];
  /** Base branch for comparison */
  baseBranch?: string;
  /** Current branch name */
  currentBranch?: string;
  /** Repository root path */
  repoRoot?: string;
}

/** Pull request information */
export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  branch?: string;
  baseBranch?: string;
  url?: string;
  previewUrl?: string;
}

// ----------------------------------------------------------------------------
// Workflow System
// ----------------------------------------------------------------------------

/** Types of workflow blocks */
export type WorkflowBlockType =
  | 'task'
  | 'for_loop'
  | 'code'
  | 'text_prompt'
  | 'data_extraction'
  | 'validation'
  | 'file_download'
  | 'file_upload'
  | 'file_parser'
  | 'send_email'
  | 'http_request'
  | 'wait'
  | 'human_interaction'
  | 'conditional'
  | 'pdf_parser';

/** Single block within a workflow */
export interface WorkflowBlock {
  /** Block identifier */
  id: string;
  /** Block type */
  type: WorkflowBlockType;
  /** Human-readable label */
  label: string;
  /** Block-specific parameters */
  parameters: Record<string, unknown>;
  /** ID of the next block to execute */
  nextBlockId?: string;
  /** Error handling block ID */
  errorBlockId?: string;
  /** Maximum retries for this block */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Continue workflow on block failure */
  continueOnFailure?: boolean;
}

/** Workflow status */
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

/** Workflow parameter definition */
export interface WorkflowParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  required?: boolean;
}

/** Complete workflow definition */
export interface WorkflowDefinition {
  /** Workflow identifier */
  id: string;
  /** Workflow name */
  name: string;
  /** Description of what the workflow does */
  description?: string;
  /** Version number */
  version: number;
  /** Workflow status */
  status: WorkflowStatus;
  /** Ordered list of workflow blocks */
  blocks: WorkflowBlock[];
  /** Input parameters schema */
  parameters?: Record<string, WorkflowParameter>;
  /** Cron schedule expression */
  cronSchedule?: string;
  /** Webhook trigger URL */
  webhookUrl?: string;
  /** Template engine for parameter interpolation */
  templateEngine: 'handlebars';
  /** Strict mode for template rendering */
  strictMode: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Tags for organization */
  tags?: string[];
}

/** Workflow run status */
export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused_for_input';

/** Result of a single block execution */
export interface WorkflowBlockResult {
  blockId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  duration?: number;
  retryCount?: number;
}

/** Single workflow run instance */
export interface WorkflowRun {
  /** Run identifier */
  id: string;
  /** Parent workflow ID */
  workflowId: string;
  /** Current run status */
  status: WorkflowRunStatus;
  /** Input parameters */
  parameters: Record<string, unknown>;
  /** Block execution results keyed by block ID */
  blockResults: Record<string, WorkflowBlockResult>;
  /** Run started timestamp */
  startedAt: number;
  /** Run completed timestamp */
  completedAt?: number;
  /** Total duration in milliseconds */
  duration?: number;
  /** Error if the run failed */
  error?: string;
  /** ID of the currently executing block */
  currentBlockId?: string;
  /** Output data from the workflow */
  output?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Security
// ----------------------------------------------------------------------------

/** Risk level classification */
export type SecurityRisk = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** Security alert from ZAP or Nuclei scanning */
export interface SecurityAlert {
  /** Risk level */
  risk: SecurityRisk;
  /** Alert name (e.g. "SQL Injection") */
  name: string;
  /** Detailed description */
  description: string;
  /** Remediation guidance */
  solution: string;
  /** Affected URL */
  url: string;
  /** Evidence found */
  evidence: string;
  /** CWE identifier */
  cweid: number;
  /** WASC identifier */
  wascid?: number;
  /** Affected parameter */
  param?: string;
  /** Attack string used */
  attack?: string;
  /** Confidence level */
  confidence?: 'confirmed' | 'high' | 'medium' | 'low' | 'false_positive';
  /** References and links */
  references?: string[];
  /** Scanner that found the issue */
  source?: 'zap' | 'nuclei' | 'custom';
  /** OWASP Top 10 category */
  owaspCategory?: string;
}

/** Security scan report */
export interface SecurityReport {
  alerts: SecurityAlert[];
  scannedUrls: string[];
  duration: number;
  timestamp: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

// ----------------------------------------------------------------------------
// Accessibility
// ----------------------------------------------------------------------------

/** Accessibility violation impact level */
export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/** A single check result within a violation node */
export interface A11yCheckResult {
  id: string;
  data?: unknown;
  relatedNodes?: { html: string; target: string[] }[];
  impact?: A11yImpact;
  message: string;
}

/** Accessibility violation node (a specific failing element) */
export interface A11yViolationNode {
  html: string;
  target: string[];
  xpath?: string;
  ancestry?: string[];
  failureSummary: string;
  any: A11yCheckResult[];
  all: A11yCheckResult[];
  none: A11yCheckResult[];
}

/** Accessibility violation (a failing rule with affected nodes) */
export interface A11yViolation {
  /** Rule identifier (e.g. "color-contrast") */
  id: string;
  /** Impact severity */
  impact: A11yImpact;
  /** Description of what failed */
  description: string;
  /** How to fix the issue */
  help: string;
  /** Link to detailed documentation */
  helpUrl?: string;
  /** WCAG criteria tags */
  tags?: string[];
  /** Affected elements */
  nodes: A11yViolationNode[];
}

/** Accessibility audit report */
export interface A11yReport {
  violations: A11yViolation[];
  passes: A11yViolation[];
  incomplete: A11yViolation[];
  inapplicable: A11yViolation[];
  score: number;
  standard: string;
  testEnvironment?: {
    userAgent: string;
    windowWidth: number;
    windowHeight: number;
    orientation?: string;
  };
  timestamp: number;
  url: string;
}

// ----------------------------------------------------------------------------
// Lighthouse / Performance
// ----------------------------------------------------------------------------

/** Performance metric rating */
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

/** Single performance metric */
export interface PerformanceMetric {
  value: number;
  rating: MetricRating;
  /** Display value (e.g. "1.2 s") */
  displayValue?: string;
}

/** Lighthouse category scores (0-100) */
export interface LighthouseScore {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa?: number;
}

/** Lighthouse improvement opportunity */
export interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  /** Estimated savings in milliseconds */
  estimatedSavingsMs?: number;
  /** Estimated savings in bytes */
  estimatedSavingsBytes?: number;
}

/** Lighthouse diagnostic detail */
export interface LighthouseDiagnostic {
  id: string;
  title: string;
  description: string;
  details?: unknown;
}

/** Framework-specific performance advice */
export interface StackPackAdvice {
  framework: string;
  advice: { title: string; description: string }[];
}

/** Full Lighthouse audit report */
export interface LighthouseReport {
  scores: LighthouseScore;
  metrics: {
    FCP: PerformanceMetric;
    LCP: PerformanceMetric;
    CLS: PerformanceMetric;
    TBT: PerformanceMetric;
    SI: PerformanceMetric;
    TTI: PerformanceMetric;
    INP?: PerformanceMetric;
    TTFB?: PerformanceMetric;
  };
  opportunities: LighthouseOpportunity[];
  diagnostics: LighthouseDiagnostic[];
  device: 'mobile' | 'desktop';
  timestamp: number;
  url: string;
  /** Framework-specific advice */
  stackPacks?: StackPackAdvice[];
}

// ----------------------------------------------------------------------------
// Chaos & Resilience Testing
// ----------------------------------------------------------------------------

/** Gremlin species for chaos testing */
export type GremlinSpecies = 'clicker' | 'formFiller' | 'scroller' | 'typer' | 'toucher';

/** FPS drop event during chaos testing */
export interface FPSDrop {
  fps: number;
  timestamp: number;
  duration: number;
}

/** Chaos testing report */
export interface ChaosReport {
  /** Total random interactions performed */
  interactions: number;
  /** Errors that occurred during chaos */
  errors: { message: string; stack?: string; timestamp: number }[];
  /** FPS drops detected */
  fpsDrops: FPSDrop[];
  /** Console errors captured */
  consoleErrors: string[];
  /** Total test duration in milliseconds */
  duration: number;
  /** Gremlin species used */
  species: GremlinSpecies[];
  /** Whether the page crashed */
  pageCrashed: boolean;
  /** Unhandled promise rejections */
  unhandledRejections: string[];
}

/** Network fault injection types (from Toxiproxy) */
export type NetworkFault =
  | { type: 'latency'; delay: number; jitter?: number }
  | { type: 'bandwidth'; rate: number }
  | { type: 'timeout'; timeout: number }
  | { type: 'reset_peer'; timeout: number }
  | { type: 'slow_close'; delay: number }
  | { type: 'slicer'; avgSize: number; sizeVariation: number; delay: number }
  | { type: 'limit_data'; bytes: number };

/** Network fault with metadata */
export interface NetworkFaultConfig {
  id: string;
  fault: NetworkFault;
  stream: 'upstream' | 'downstream';
  /** Percentage of connections affected (0-100) */
  toxicity: number;
  enabled: boolean;
}

// ----------------------------------------------------------------------------
// Credential Management
// ----------------------------------------------------------------------------

/** Supported credential provider types */
export type CredentialProviderType =
  | 'native'
  | 'bitwarden'
  | '1password'
  | 'azure-key-vault'
  | 'custom-http';

/** Credential type */
export type CredentialType = 'password' | 'api-key' | 'oauth' | 'totp' | 'certificate';

/** Credential configuration */
export interface CredentialConfig {
  /** Unique credential identifier */
  id: string;
  /** Credential provider */
  provider: CredentialProviderType;
  /** Type of credential */
  type: CredentialType;
  /** Credential data (provider-specific) */
  data: Record<string, unknown>;
  /** Human-readable label */
  label?: string;
  /** Associated domain */
  domain?: string;
  /** Associated browser profile ID */
  profileId?: string;
  /** TOTP secret for 2FA */
  totpSecret?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Last tested timestamp */
  lastTestedAt?: number;
  /** Whether last test passed */
  lastTestPassed?: boolean;
}

// ----------------------------------------------------------------------------
// Watchdog Events
// ----------------------------------------------------------------------------

/** Types of watchdog events */
export type WatchdogEventType =
  | 'captcha_detected'
  | 'captcha_solved'
  | 'download_started'
  | 'download_completed'
  | 'popup_detected'
  | 'popup_handled'
  | 'crash_detected'
  | 'crash_recovered'
  | 'permission_requested'
  | 'permission_handled'
  | 'dom_changed'
  | 'security_alert'
  | 'storage_saved'
  | 'about_blank_handled'
  | 'action_loop_detected'
  | 'screenshot_captured'
  | 'har_entry_recorded'
  | 'recording_started'
  | 'recording_stopped';

/** Watchdog event */
export interface WatchdogEvent {
  /** Event type */
  type: WatchdogEventType;
  /** Event timestamp */
  timestamp: number;
  /** Event-specific data */
  data: Record<string, unknown>;
  /** Watchdog that emitted the event */
  source?: string;
  /** Whether the event was handled automatically */
  autoHandled?: boolean;
}

// ----------------------------------------------------------------------------
// Task System
// ----------------------------------------------------------------------------

/** Task status */
export type TaskStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

/** Task definition for browser automation */
export interface TaskDefinition {
  /** Natural language prompt */
  prompt: string;
  /** Target URL */
  url: string;
  /** Maximum steps */
  maxSteps: number;
  /** Maximum retry iterations */
  maxIterations: number;
  /** Custom error codes */
  errorCodes?: Record<string, string>;
  /** Expected output schema (JSON Schema) */
  extractionSchema?: Record<string, unknown>;
  /** Navigation payload */
  navigationPayload?: Record<string, unknown>;
  /** Webhook callback URL */
  webhookCallbackUrl?: string;
  /** Proxy configuration */
  proxy?: ProxyConfig;
  /** TOTP credential ID */
  totpCredentialId?: string;
}

/** Task artifact (screenshot, recording, etc.) */
export interface TaskArtifact {
  id: string;
  type: 'screenshot' | 'recording' | 'har' | 'pdf' | 'json' | 'html';
  path: string;
  size: number;
  createdAt: number;
}

/** Task instance */
export interface Task {
  id: string;
  status: TaskStatus;
  definition: TaskDefinition;
  result?: TestResult;
  extractedData?: unknown;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  artifacts?: TaskArtifact[];
}

// ----------------------------------------------------------------------------
// Flow System (Reusable Test Flows)
// ----------------------------------------------------------------------------

/** Step within a reusable test flow */
export interface FlowStep {
  id: string;
  instruction: string;
  expectedOutcome: string;
  /** Optional preconditions */
  preconditions?: string[];
  /** Optional variables to substitute */
  variables?: Record<string, string>;
}

/** Reusable test flow */
export interface TestFlow {
  /** URL-safe slug identifier */
  slug: string;
  /** Human-readable title */
  title: string;
  /** Description (max 256 chars) */
  description: string;
  /** Version number */
  version: number;
  /** Git target scope */
  targetScope: 'unstaged' | 'branch' | 'changes';
  /** Environment requirements */
  environment: {
    baseUrl: string;
    cookiesRequired: boolean;
  };
  /** Flow steps */
  steps: FlowStep[];
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

// ----------------------------------------------------------------------------
// API Mocking
// ----------------------------------------------------------------------------

/** Mock handler response */
export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  delay?: number;
}

/** Mock handler definition */
export interface MockHandlerConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  response: MockResponse;
  /** Optional request matcher */
  matcher?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  };
  /** Number of times to respond before removing (0 = unlimited) */
  times?: number;
}

// ----------------------------------------------------------------------------
// Visual Regression
// ----------------------------------------------------------------------------

/** Visual diff result between two screenshots */
export interface VisualDiffResult {
  /** Whether the images match within threshold */
  matched: boolean;
  /** Percentage of pixels that differ */
  mismatchPercentage: number;
  /** Diff image buffer (base64) */
  diffImage?: string;
  /** Dimensions of the compared images */
  dimensions: { width: number; height: number };
  /** Regions where differences were detected */
  diffRegions?: BoundingBox[];
}

/** Result for a single visual regression scenario */
export interface VisualScenarioResult {
  label: string;
  viewport: ViewportConfig;
  matched: boolean;
  mismatchPercentage: number;
  referenceImage?: string;
  testImage?: string;
  diffImage?: string;
}

/** Visual regression report */
export interface VisualReport {
  scenarios: VisualScenarioResult[];
  totalMismatches: number;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Observability & Analytics
// ----------------------------------------------------------------------------

/** Analytics event categories */
export type AnalyticsEventCategory =
  | 'session'
  | 'plan'
  | 'run'
  | 'step'
  | 'browser'
  | 'agent'
  | 'flow'
  | 'error';

/** Analytics event */
export interface AnalyticsEvent {
  category: AnalyticsEventCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** OpenTelemetry span */
export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, unknown>;
  status?: 'ok' | 'error' | 'unset';
}

// ----------------------------------------------------------------------------
// Webhook & Events
// ----------------------------------------------------------------------------

/** Webhook configuration */
export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  maxRetries: number;
  retryBackoff: 'linear' | 'exponential';
  enabled: boolean;
}

/** SSE event */
export interface SSEEvent {
  id?: string;
  event: string;
  data: string;
  retry?: number;
}

// ----------------------------------------------------------------------------
// Agent Events & Messages
// ----------------------------------------------------------------------------

/** Agent event types emitted during execution */
export type AgentEventType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'action'
  | 'observation'
  | 'plan'
  | 'error'
  | 'complete'
  | 'screenshot'
  | 'loop_detected'
  | 'recovery'
  | 'model_switch';

/** Agent event emitted during execution */
export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
  timestamp: number;
  stepIndex?: number;
}

/** Agent action performed during execution */
export interface AgentAction {
  type: string;
  target?: string;
  value?: string;
  coordinates?: { x: number; y: number };
  description: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
}

/** Loop detection information */
export interface LoopInfo {
  /** Number of times the action was repeated */
  repeatCount: number;
  /** The repeated action */
  action: string;
  /** Suggested nudge message */
  nudge: string;
}

/** Recovery strategy types */
export type RecoveryStrategyType =
  | 'rescan'
  | 'use_vision'
  | 'heal_selector'
  | 'wait_and_retry'
  | 'switch_model'
  | 'restart_browser'
  | 'restore_snapshot'
  | 'extend_timeout'
  | 'skip'
  | 'fail';

/** Failure type classification */
export type FailureType =
  | 'element_not_found'
  | 'navigation_failed'
  | 'rate_limited'
  | 'page_crashed'
  | 'timeout'
  | 'authentication_failed'
  | 'captcha_blocked'
  | 'network_error'
  | 'unknown';

// ----------------------------------------------------------------------------
// Tool Annotations
// ----------------------------------------------------------------------------

/** Tool annotation for agent parallel execution */
export interface ToolAnnotation {
  /** Safe for parallel calls */
  readOnlyHint: boolean;
  /** Marks actions that change state */
  destructiveHint: boolean;
  /** Whether the tool opens a new page */
  opensNewPage?: boolean;
  /** Estimated execution time in ms */
  estimatedDuration?: number;
}

// ----------------------------------------------------------------------------
// CUA (Computer Use Agent) Types
// ----------------------------------------------------------------------------

/** CUA provider identifiers */
export type CUAProvider = 'anthropic' | 'google' | 'microsoft' | 'openai';

/** CUA environment types */
export type CUAEnvironment = 'mac' | 'windows' | 'ubuntu' | 'browser';

/** CUA action returned by vision analysis */
export interface CUAAction {
  type: 'click' | 'type' | 'scroll' | 'key' | 'screenshot' | 'wait' | 'drag';
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
  scrollDelta?: { x: number; y: number };
  endCoordinates?: { x: number; y: number };
  confidence: number;
  description: string;
}

// ----------------------------------------------------------------------------
// Safety & Domain Security
// ----------------------------------------------------------------------------

/** Safety handler configuration */
export interface SafetyConfig {
  /** Actions to never allow */
  excludeActions?: string[];
  /** Allowed domains (whitelist, supports wildcards) */
  allowedDomains?: string[];
  /** Blocked domains (blacklist) */
  blockedDomains?: string[];
  /** Require confirmation for destructive actions */
  requireConfirmation: boolean;
  /** Sensitive data masking rules */
  masking?: {
    patterns: string[];
    domains?: Record<string, string[]>;
    maskInScreenshots: boolean;
    maskInLogs: boolean;
  };
}

// ----------------------------------------------------------------------------
// Docker & Deployment
// ----------------------------------------------------------------------------

/** Docker environment configuration */
export interface DockerConfig {
  /** Whether running inside Docker */
  isDocker: boolean;
  /** GPU acceleration enabled */
  gpuEnabled: boolean;
  /** /dev/shm size */
  devShmSize: string;
  /** Container-optimized Chrome flags */
  chromeFlags: string[];
}

/** Database configuration */
export interface DatabaseConfig {
  connectionString: string;
  poolSize: number;
  maxOverflow: number;
  statementTimeout: number;
  replicaUrl?: string;
}

/** Cache configuration */
export interface CacheConfig {
  redisUrl?: string;
  defaultTTL: number;
  cacheTypes: {
    actions: boolean;
    llmResponses: boolean;
    pageContent: boolean;
    prompts: boolean;
  };
}

// ----------------------------------------------------------------------------
// Evaluation & Benchmarking
// ----------------------------------------------------------------------------

/** Benchmark task definition */
export interface EvalTask {
  id: string;
  name: string;
  description: string;
  url: string;
  instruction: string;
  expectedResult: unknown;
  maxSteps: number;
  timeout: number;
  benchmark: string;
}

/** Benchmark result */
export interface BenchmarkResult {
  taskId: string;
  passed: boolean;
  score: number;
  steps: number;
  duration: number;
  tokenUsage: TokenMetrics;
  model: string;
  error?: string;
}

// ----------------------------------------------------------------------------
// Config File Types
// ----------------------------------------------------------------------------

/** Root Inspect configuration (inspect.config.ts) */
export interface InspectConfig {
  /** Agent configuration */
  agent?: Partial<AgentConfig>;
  /** Browser configuration */
  browser?: Partial<BrowserConfig>;
  /** Default device preset */
  defaultDevice?: string;
  /** Base URL for testing */
  baseUrl?: string;
  /** Safety configuration */
  safety?: SafetyConfig;
  /** Recording configuration */
  recording?: RecordingConfig;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
  /** MCP servers */
  mcpServers?: MCPServerConfig[];
  /** Webhook configurations */
  webhooks?: WebhookConfig[];
  /** Telemetry opt-out */
  telemetryEnabled?: boolean;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** Custom environment variables */
  env?: Record<string, string>;
}

// ----------------------------------------------------------------------------
// Misc Shared Types
// ----------------------------------------------------------------------------

/** Generic paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Generic result type (success or error) */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Disposable resource */
export interface Disposable {
  dispose(): Promise<void>;
}

/** Health check response */
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    name: string;
    status: 'pass' | 'fail';
    message?: string;
  }[];
}

/** Supported model definition */
export interface ModelDefinition {
  id: string;
  provider: LLMProviderName;
  name: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsFunctionCalling: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}
