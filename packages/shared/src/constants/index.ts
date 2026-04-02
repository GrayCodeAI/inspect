// ============================================================================
// @inspect/shared - Constants
// ============================================================================

import type {
  AgentConfig,
  DevicePreset,
  LLMProvider,
  ModelDefinition,
  ViewportConfig,
} from "../types/index.js";
import type { BrowserConfig } from "../models.js";

// ----------------------------------------------------------------------------
// Viewport & Timeout Defaults
// ----------------------------------------------------------------------------

/** Default viewport dimensions (desktop 1280x720) */
export const DEFAULT_VIEWPORT: ViewportConfig = {
  width: 1280,
  height: 720,
};

/** Default timeout for all operations in milliseconds (30 seconds) */
export const DEFAULT_TIMEOUT = 30_000;

/** Default navigation timeout in milliseconds (60 seconds) */
export const DEFAULT_NAVIGATION_TIMEOUT = 60_000;

/** Default action timeout in milliseconds (15 seconds) */
export const DEFAULT_ACTION_TIMEOUT = 15_000;

/** Default step timeout in milliseconds (2 minutes) */
export const DEFAULT_STEP_TIMEOUT = 120_000;

/** Maximum number of retries for operations */
export const MAX_RETRIES = 3;

/** Default delay between retries in milliseconds */
export const DEFAULT_RETRY_DELAY = 1_000;

// ----------------------------------------------------------------------------
// Element & Snapshot Constants
// ----------------------------------------------------------------------------

/** Prefix for element reference IDs */
export const ELEMENT_REF_PREFIX = "e";

/** Maximum depth for DOM/ARIA snapshot traversal */
export const MAX_SNAPSHOT_DEPTH = 50;

/** Maximum number of elements in a single snapshot */
export const MAX_SNAPSHOT_ELEMENTS = 10_000;

/** Default cache TTL in milliseconds (24 hours) */
export const CACHE_TTL = 86_400_000;

/** Maximum text length for clickable element descriptions */
export const MAX_CLICKABLE_TEXT_LENGTH = 200;

/** Maximum length for truncated text content in snapshots */
export const MAX_TEXT_CONTENT_LENGTH = 500;

// ----------------------------------------------------------------------------
// Agent Defaults
// ----------------------------------------------------------------------------

/** Default maximum steps per agent run */
export const DEFAULT_MAX_STEPS = 25;

/** Default maximum actions per step */
export const DEFAULT_MAX_ACTIONS_PER_STEP = 5;

/** Default maximum failures before aborting */
export const DEFAULT_MAX_FAILURES = 5;

/** Default exploration step limit */
export const DEFAULT_EXPLORATION_LIMIT = 50;

/** Default maximum iterations for task retry */
export const DEFAULT_MAX_ITERATIONS = 10;

/** Default LLM temperature */
export const DEFAULT_TEMPERATURE = 0.0;

/** Default LLM max tokens */
export const DEFAULT_MAX_TOKENS = 4096;

/** Default LLM request timeout in milliseconds (60 seconds) */
export const DEFAULT_LLM_TIMEOUT = 60_000;

/** Rolling window size for loop detection */
export const LOOP_DETECTION_WINDOW = 10;

/** Number of repeated actions to trigger loop detection */
export const LOOP_DETECTION_THRESHOLD = 3;

/** Maximum instruction history items */
export const MAX_INSTRUCTION_HISTORY = 20;

// ----------------------------------------------------------------------------
// File Size Limits
// ----------------------------------------------------------------------------

/** Maximum file download size in bytes (500 MB) */
export const MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024;

/** Maximum screenshot file size in bytes (10 MB) */
export const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;

/** Maximum flow description length */
export const MAX_FLOW_DESCRIPTION_LENGTH = 256;

// ----------------------------------------------------------------------------
// Network & Proxy
// ----------------------------------------------------------------------------

/** Default proxy rotation interval in milliseconds */
export const DEFAULT_PROXY_ROTATION_INTERVAL = 300_000;

/** Default network idle detection timeout in milliseconds */
export const DEFAULT_NETWORK_IDLE_TIMEOUT = 3_000;

/** Default DOM stability threshold in milliseconds */
export const DEFAULT_DOM_STABLE_THRESHOLD = 300;

/** Default loading indicator timeout in milliseconds */
export const DEFAULT_LOADING_TIMEOUT = 5_000;

// ----------------------------------------------------------------------------
// Recording
// ----------------------------------------------------------------------------

/** Default rrweb capture interval in milliseconds */
export const DEFAULT_RRWEB_INTERVAL = 100;

/** Default video FPS */
export const DEFAULT_VIDEO_FPS = 30;

/** Default GIF FPS */
export const DEFAULT_GIF_FPS = 10;

// ----------------------------------------------------------------------------
// Webhooks
// ----------------------------------------------------------------------------

/** Default webhook max retries */
export const DEFAULT_WEBHOOK_MAX_RETRIES = 3;

/** Presigned URL expiration in seconds (24 hours) */
export const PRESIGNED_URL_EXPIRY = 86_400;

// ----------------------------------------------------------------------------
// Database
// ----------------------------------------------------------------------------

/** Default database pool size */
export const DEFAULT_DB_POOL_SIZE = 5;

/** Default database max overflow */
export const DEFAULT_DB_MAX_OVERFLOW = 10;

/** Default database statement timeout in seconds */
export const DEFAULT_DB_STATEMENT_TIMEOUT = 60;

// ----------------------------------------------------------------------------
// Chaos Testing Defaults
// ----------------------------------------------------------------------------

/** Default gremlin interaction count */
export const DEFAULT_GREMLIN_COUNT = 1000;

/** Default gremlin delay between interactions in ms */
export const DEFAULT_GREMLIN_DELAY = 10;

/** Default max errors before stopping chaos test */
export const DEFAULT_CHAOS_MAX_ERRORS = 10;

// ----------------------------------------------------------------------------
// Security
// ----------------------------------------------------------------------------

/** Default active scan strength */
export const DEFAULT_SCAN_STRENGTH = "MEDIUM" as const;

/** Default active scan threshold */
export const DEFAULT_SCAN_THRESHOLD = "MEDIUM" as const;

/** Default nuclei rate limit (requests per second) */
export const DEFAULT_NUCLEI_RATE_LIMIT = 150;

// ----------------------------------------------------------------------------
// Version & Meta
// ----------------------------------------------------------------------------

/** Package version */
export const VERSION = "0.1.0";

/** Package name */
export const PACKAGE_NAME = "inspect";

/** Config file name */
export const CONFIG_FILE_NAME = "inspect.config.ts";

/** Data directory name */
export const DATA_DIR_NAME = ".inspect";

/** Default log level */
export const DEFAULT_LOG_LEVEL = "info" as const;

// ----------------------------------------------------------------------------
// Device Presets
// ----------------------------------------------------------------------------

const CHROME_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const SAFARI_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const SAFARI_TABLET_UA =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const CHROME_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SAMSUNG_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const FIREFOX_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

const EDGE_DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

/** 20+ device presets for responsive testing */
export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  // Apple iPhones
  "iphone-se": {
    name: "iPhone SE",
    width: 375,
    height: 667,
    dpr: 2,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-14": {
    name: "iPhone 14",
    width: 390,
    height: 844,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-15": {
    name: "iPhone 15",
    width: 393,
    height: 852,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-15-pro": {
    name: "iPhone 15 Pro",
    width: 393,
    height: 852,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-15-pro-max": {
    name: "iPhone 15 Pro Max",
    width: 430,
    height: 932,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-16": {
    name: "iPhone 16",
    width: 393,
    height: 852,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },
  "iphone-16-pro-max": {
    name: "iPhone 16 Pro Max",
    width: 440,
    height: 956,
    dpr: 3,
    userAgent: SAFARI_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "iPhone",
  },

  // Apple iPads
  "ipad-mini": {
    name: "iPad Mini",
    width: 768,
    height: 1024,
    dpr: 2,
    userAgent: SAFARI_TABLET_UA,
    touch: true,
    mobile: true,
    platform: "iPad",
  },
  "ipad-air": {
    name: "iPad Air",
    width: 820,
    height: 1180,
    dpr: 2,
    userAgent: SAFARI_TABLET_UA,
    touch: true,
    mobile: true,
    platform: "iPad",
  },
  "ipad-pro-11": {
    name: 'iPad Pro 11"',
    width: 834,
    height: 1194,
    dpr: 2,
    userAgent: SAFARI_TABLET_UA,
    touch: true,
    mobile: true,
    platform: "iPad",
  },
  "ipad-pro-12": {
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    dpr: 2,
    userAgent: SAFARI_TABLET_UA,
    touch: true,
    mobile: true,
    platform: "iPad",
  },

  // Android Phones
  "pixel-7": {
    name: "Pixel 7",
    width: 412,
    height: 915,
    dpr: 2.625,
    userAgent: CHROME_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "Android",
  },
  "pixel-8": {
    name: "Pixel 8",
    width: 412,
    height: 915,
    dpr: 2.625,
    userAgent: CHROME_MOBILE_UA.replace("Pixel 8", "Pixel 8"),
    touch: true,
    mobile: true,
    platform: "Android",
  },
  "pixel-8-pro": {
    name: "Pixel 8 Pro",
    width: 448,
    height: 998,
    dpr: 2.625,
    userAgent: CHROME_MOBILE_UA.replace("Pixel 8", "Pixel 8 Pro"),
    touch: true,
    mobile: true,
    platform: "Android",
  },
  "samsung-s24": {
    name: "Samsung Galaxy S24",
    width: 412,
    height: 915,
    dpr: 3,
    userAgent: SAMSUNG_MOBILE_UA,
    touch: true,
    mobile: true,
    platform: "Android",
  },
  "samsung-s24-ultra": {
    name: "Samsung Galaxy S24 Ultra",
    width: 412,
    height: 915,
    dpr: 3,
    userAgent: SAMSUNG_MOBILE_UA.replace("SM-S926B", "SM-S928B"),
    touch: true,
    mobile: true,
    platform: "Android",
  },

  // Android Tablets
  "samsung-tab-s9": {
    name: "Samsung Galaxy Tab S9",
    width: 800,
    height: 1280,
    dpr: 2,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    touch: true,
    mobile: true,
    platform: "Android",
  },

  // Desktop
  "desktop-1080": {
    name: "Desktop 1080p",
    width: 1920,
    height: 1080,
    dpr: 1,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-1440": {
    name: "Desktop 1440p",
    width: 2560,
    height: 1440,
    dpr: 1,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-4k": {
    name: "Desktop 4K",
    width: 3840,
    height: 2160,
    dpr: 1,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-720": {
    name: "Desktop 720p",
    width: 1280,
    height: 720,
    dpr: 1,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-macbook-air": {
    name: 'MacBook Air 13"',
    width: 1440,
    height: 900,
    dpr: 2,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-macbook-pro-16": {
    name: 'MacBook Pro 16"',
    width: 1728,
    height: 1117,
    dpr: 2,
    userAgent: CHROME_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "macOS",
  },
  "desktop-windows-firefox": {
    name: "Desktop Windows Firefox",
    width: 1920,
    height: 1080,
    dpr: 1,
    userAgent: FIREFOX_DESKTOP_UA.replace(
      "Macintosh; Intel Mac OS X 10.15",
      "Windows NT 10.0; Win64; x64",
    ),
    touch: false,
    mobile: false,
    platform: "Windows",
  },
  "desktop-windows-edge": {
    name: "Desktop Windows Edge",
    width: 1920,
    height: 1080,
    dpr: 1,
    userAgent: EDGE_DESKTOP_UA,
    touch: false,
    mobile: false,
    platform: "Windows",
  },
};

// ----------------------------------------------------------------------------
// Supported Models
// ----------------------------------------------------------------------------

/** Map of supported LLM models with their definitions */
export const SUPPORTED_MODELS: Record<string, ModelDefinition> = {
  // Anthropic
  "claude-sonnet-4-20250514": {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    name: "Claude Sonnet 4",
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  "claude-opus-4-20250514": {
    id: "claude-opus-4-20250514",
    provider: "anthropic",
    name: "Claude Opus 4",
    contextWindow: 200_000,
    maxOutput: 32_000,
    supportsVision: true,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  "claude-haiku-3-5-20241022": {
    id: "claude-3-5-haiku-20241022",
    provider: "anthropic",
    name: "Claude 3.5 Haiku",
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
  },

  // OpenAI
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    name: "GPT-4o Mini",
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  "o3-mini": {
    id: "o3-mini",
    provider: "openai",
    name: "o3-mini",
    contextWindow: 200_000,
    maxOutput: 100_000,
    supportsVision: false,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.0011,
    costPer1kOutput: 0.0044,
  },

  // Google
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro-preview-05-06",
    provider: "google",
    name: "Gemini 2.5 Pro",
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    supportsVision: true,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.01,
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash-preview-04-17",
    provider: "google",
    name: "Gemini 2.5 Flash",
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    supportsVision: true,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },

  // DeepSeek
  "deepseek-r1": {
    id: "deepseek-reasoner",
    provider: "deepseek",
    name: "DeepSeek R1",
    contextWindow: 64_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: true,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.0022,
  },
  "deepseek-v3": {
    id: "deepseek-chat",
    provider: "deepseek",
    name: "DeepSeek V3",
    contextWindow: 64_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00027,
    costPer1kOutput: 0.0011,
  },

  // Mistral
  "mistral-large": {
    id: "mistral-large-latest",
    provider: "mistral",
    name: "Mistral Large",
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.006,
  },

  // Groq
  "llama-3.3-70b-groq": {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    name: "Llama 3.3 70B (Groq)",
    contextWindow: 128_000,
    maxOutput: 32_768,
    supportsVision: false,
    supportsThinking: false,
    supportsFunctionCalling: true,
    costPer1kInput: 0.00059,
    costPer1kOutput: 0.00079,
  },
};

// ----------------------------------------------------------------------------
// Default Configurations
// ----------------------------------------------------------------------------

/** Default LLM provider (Claude Sonnet 4) */
export const DEFAULT_LLM_PROVIDER: LLMProvider = {
  name: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  timeout: DEFAULT_LLM_TIMEOUT,
  thinkingMode: false,
  promptCaching: true,
};

/** Default agent configuration */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  primary: DEFAULT_LLM_PROVIDER,
  fallback: undefined,
  specialists: undefined,
  mode: "hybrid",
  vision: "auto",
  visionDetail: "auto",
  maxSteps: DEFAULT_MAX_STEPS,
  maxActionsPerStep: DEFAULT_MAX_ACTIONS_PER_STEP,
  stepTimeout: DEFAULT_STEP_TIMEOUT,
  thinkingMode: false,
  flashMode: false,
  planningEnabled: true,
  replanOnStall: true,
  explorationLimit: DEFAULT_EXPLORATION_LIMIT,
  maxFailures: DEFAULT_MAX_FAILURES,
  finalRecoveryAttempt: true,
};

/** Default browser configuration */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  name: "chromium",
  headless: true,
  viewport: DEFAULT_VIEWPORT,
  stealth: false,
  locale: "en-US",
  timezone: "America/New_York",
  ignoreHTTPSErrors: false,
  navigationTimeout: DEFAULT_NAVIGATION_TIMEOUT,
  actionTimeout: DEFAULT_ACTION_TIMEOUT,
  defaultTimeout: DEFAULT_TIMEOUT,
  backend: "chromium",
  colorScheme: "light",
};

// ----------------------------------------------------------------------------
// API Routes (for reference)
// ----------------------------------------------------------------------------

/** API route definitions */
export const API_ROUTES = {
  // Tasks
  CREATE_TASK: "POST /api/tasks",
  GET_TASK: "GET /api/tasks/:id",
  CANCEL_TASK: "POST /api/tasks/:id/cancel",
  GET_TASK_ARTIFACTS: "GET /api/tasks/:id/artifacts",

  // Workflows
  CREATE_WORKFLOW: "POST /api/workflows",
  LIST_WORKFLOWS: "GET /api/workflows",
  UPDATE_WORKFLOW: "PUT /api/workflows/:id",
  DELETE_WORKFLOW: "DELETE /api/workflows/:id",
  RUN_WORKFLOW: "POST /api/workflows/:id/run",
  GET_WORKFLOW_RUN: "GET /api/workflows/runs/:id",

  // Credentials
  CREATE_CREDENTIAL: "POST /api/credentials",
  LIST_CREDENTIALS: "GET /api/credentials",
  UPDATE_CREDENTIAL: "PUT /api/credentials/:id",
  DELETE_CREDENTIAL: "DELETE /api/credentials/:id",
  TEST_CREDENTIAL: "POST /api/credentials/:id/test",

  // Sessions
  CREATE_SESSION: "POST /api/sessions",
  LIST_SESSIONS: "GET /api/sessions",
  DELETE_SESSION: "DELETE /api/sessions/:id",

  // System
  HEALTH: "GET /api/health",
  VERSION: "GET /api/version",
  MODELS: "GET /api/models",
} as const;

// ----------------------------------------------------------------------------
// Accessibility Standards
// ----------------------------------------------------------------------------

/** Supported WCAG standards */
export const A11Y_STANDARDS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21aa",
  "wcag22aa",
  "section508",
  "en-301-549",
] as const;

/** Default a11y audit standard */
export const DEFAULT_A11Y_STANDARD = "wcag2aa" as const;

// ----------------------------------------------------------------------------
// Lighthouse Defaults
// ----------------------------------------------------------------------------

/** Default Lighthouse categories */
export const DEFAULT_LIGHTHOUSE_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

/** Default Lighthouse throttling (Slow 4G) */
export const DEFAULT_LIGHTHOUSE_THROTTLING = {
  rttMs: 150,
  downloadKbps: 1600,
  uploadKbps: 750,
  cpuSlowdown: 4,
} as const;

// ----------------------------------------------------------------------------
// Network Fault Defaults (Toxiproxy)
// ----------------------------------------------------------------------------

/** Default toxicity percentage for network faults */
export const DEFAULT_TOXICITY = 100;

/** Default network fault stream direction */
export const DEFAULT_FAULT_STREAM = "downstream" as const;

// ----------------------------------------------------------------------------
// Gremlin Species
// ----------------------------------------------------------------------------

/** All available gremlin species for chaos testing */
export const ALL_GREMLIN_SPECIES = [
  "clicker",
  "formFiller",
  "scroller",
  "typer",
  "toucher",
] as const;

// ----------------------------------------------------------------------------
// Regex Patterns
// ----------------------------------------------------------------------------

/** Common regex patterns for sensitive data masking */
export const SENSITIVE_DATA_PATTERNS = {
  /** Social Security Number */
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  /** Credit card numbers (basic) */
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /** Email addresses */
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /** Phone numbers (US format) */
  PHONE_US: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /** API keys (generic patterns) */
  API_KEY: /\b(sk|pk|api|key|token|secret|password)[_-]?[A-Za-z0-9]{20,}\b/gi,
} as const;

// ----------------------------------------------------------------------------
// GitHub PR URL Pattern
// ----------------------------------------------------------------------------

/** Regex to parse GitHub PR URLs */
export const GITHUB_PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

// ----------------------------------------------------------------------------
// Browser Cookie Configs
// ----------------------------------------------------------------------------

/** Supported browsers for cookie extraction */
export const BROWSER_COOKIE_CONFIGS = {
  chrome: {
    name: "Chrome",
    paths: {
      darwin: ["~/Library/Application Support/Google/Chrome"],
      linux: ["~/.config/google-chrome"],
      win32: ["%LOCALAPPDATA%\\Google\\Chrome\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium" as const,
    profilePattern: "Default",
  },
  firefox: {
    name: "Firefox",
    paths: {
      darwin: ["~/Library/Application Support/Firefox/Profiles"],
      linux: ["~/.mozilla/firefox"],
      win32: ["%APPDATA%\\Mozilla\\Firefox\\Profiles"],
    },
    cookieFile: "cookies.sqlite",
    encryption: "firefox" as const,
  },
  safari: {
    name: "Safari",
    paths: {
      darwin: ["~/Library/Cookies"],
    },
    cookieFile: "Cookies.binarycookies",
    encryption: "safari" as const,
  },
  edge: {
    name: "Edge",
    paths: {
      darwin: ["~/Library/Application Support/Microsoft Edge"],
      linux: ["~/.config/microsoft-edge"],
      win32: ["%LOCALAPPDATA%\\Microsoft\\Edge\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium" as const,
    profilePattern: "Default",
  },
  brave: {
    name: "Brave",
    paths: {
      darwin: ["~/Library/Application Support/BraveSoftware/Brave-Browser"],
      linux: ["~/.config/BraveSoftware/Brave-Browser"],
      win32: ["%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium" as const,
    profilePattern: "Default",
  },
  arc: {
    name: "Arc",
    paths: {
      darwin: ["~/Library/Application Support/Arc/User Data"],
    },
    cookieFile: "Cookies",
    encryption: "chromium" as const,
    profilePattern: "Default",
  },
} as const;

// ----------------------------------------------------------------------------
// MCP Tool Categories
// ----------------------------------------------------------------------------

/** MCP tool category descriptions */
export const MCP_TOOL_CATEGORIES = {
  navigation: "Tools for navigating between pages and URLs",
  observation: "Tools for observing page state (screenshots, logs, etc.)",
  interaction: "Tools for interacting with page elements",
  state: "Tools for managing browser state (cookies, storage, etc.)",
  extraction: "Tools for extracting data from pages",
  testing: "Tools for running tests and assertions",
} as const;

// ----------------------------------------------------------------------------
// Environment Variable Names
// ----------------------------------------------------------------------------

/** Well-known environment variable names */
export const ENV_VARS = {
  // API Keys
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  GOOGLE_API_KEY: "GOOGLE_API_KEY",
  DEEPSEEK_API_KEY: "DEEPSEEK_API_KEY",

  // Configuration
  INSPECT_MODEL: "INSPECT_MODEL",
  INSPECT_MODE: "INSPECT_MODE",
  INSPECT_HEADLESS: "INSPECT_HEADLESS",
  INSPECT_BASE_URL: "INSPECT_BASE_URL",
  INSPECT_TELEMETRY: "INSPECT_TELEMETRY",
  INSPECT_LOG_LEVEL: "INSPECT_LOG_LEVEL",
  INSPECT_CONFIG: "INSPECT_CONFIG",

  // Infrastructure
  DATABASE_URL: "DATABASE_URL",
  REDIS_URL: "REDIS_URL",
  IN_DOCKER: "IN_DOCKER",

  // Credential providers
  BITWARDEN_API_KEY: "BITWARDEN_API_KEY",
  ONEPASSWORD_TOKEN: "ONEPASSWORD_TOKEN",
  AZURE_KEY_VAULT_URL: "AZURE_KEY_VAULT_URL",

  // Cloud browsers
  BROWSERBASE_API_KEY: "BROWSERBASE_API_KEY",
  BROWSERBASE_PROJECT_ID: "BROWSERBASE_PROJECT_ID",
} as const;
