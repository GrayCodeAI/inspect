// ============================================================================
// Agent Types — Shared types for the 12-agent testing system
// ============================================================================

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/** Message callback for streaming progress to the REPL */
export type ProgressCallback = (kind: "info" | "step" | "pass" | "fail" | "warn" | "done", message: string) => void;

/** LLM call function — abstracts the provider */
export type LLMCall = (messages: Array<{ role: string; content: string }>) => Promise<string>;

// ---------------------------------------------------------------------------
// Test steps & plan
// ---------------------------------------------------------------------------

export type StepAction =
  | "navigate" | "click" | "fill" | "select" | "scroll" | "hover"
  | "press" | "assert" | "screenshot" | "upload" | "drag" | "wait"
  | "check" | "uncheck" | "rightclick" | "dblclick" | "tab";

export type StepStatus = "pending" | "running" | "pass" | "fail" | "skip";

/** A single test step in the plan */
export interface TestStep {
  id: number;
  action: string;
  description: string;
  target?: string;
  value?: string;
  assertion?: string;
  status: StepStatus;
  error?: string;
  screenshot?: string;
  duration?: number;
  /** Which flow this step belongs to */
  flow?: string;
  /** Priority: 1 = critical, 2 = high, 3 = medium, 4 = low */
  priority?: number;
  /** Retry count if step failed and was retried */
  retries?: number;
}

/** The complete test plan produced by the Planner */
export interface TestPlan {
  url: string;
  title: string;
  steps: TestStep[];
  createdAt: number;
  /** Page type detected by the analyzer */
  pageType?: PageType;
  /** Flows discovered */
  flows?: TestFlow[];
  /** Estimated duration in ms */
  estimatedDuration?: number;
  /** Test data generated for forms */
  testData?: TestDataSet;
}

/** A multi-step user flow */
export interface TestFlow {
  name: string;
  description: string;
  steps: number[]; // step IDs
  type: "auth" | "navigation" | "form" | "content" | "checkout" | "search" | "custom";
}

// ---------------------------------------------------------------------------
// Crawler types (Agent 1)
// ---------------------------------------------------------------------------

export type PageType =
  | "landing" | "auth" | "dashboard" | "form" | "list" | "detail"
  | "checkout" | "settings" | "error" | "search" | "blog" | "docs"
  | "pricing" | "contact" | "profile" | "admin" | "unknown";

export interface PageInfo {
  url: string;
  title: string;
  type: PageType;
  status: number;
  links: string[];
  forms: FormInfo[];
  interactive: InteractiveElement[];
  headings: string[];
  meta: Record<string, string>;
  depth: number;
  /** Time to load in ms */
  loadTime: number;
}

export interface SiteMap {
  baseUrl: string;
  pages: PageInfo[];
  totalLinks: number;
  brokenLinks: BrokenLink[];
  externalLinks: string[];
  crawlDuration: number;
  robotsTxt?: string;
  sitemapUrls?: string[];
}

export interface BrokenLink {
  url: string;
  status: number;
  foundOn: string;
  linkText: string;
}

// ---------------------------------------------------------------------------
// Analyzer types (Agent 2)
// ---------------------------------------------------------------------------

export interface InteractiveElement {
  type: "link" | "button" | "input" | "select" | "textarea" | "checkbox" | "radio" | "file" | "modal-trigger" | "tab" | "accordion" | "carousel" | "dropdown" | "toggle";
  text: string;
  selector?: string;
  ref?: string;
}

export interface FormInfo {
  action?: string;
  method: string;
  fields: FormField[];
  hasSubmitButton: boolean;
  formType: "login" | "signup" | "search" | "contact" | "checkout" | "filter" | "settings" | "newsletter" | "unknown";
}

export interface FormField {
  name: string;
  type: string;
  label?: string;
  placeholder?: string;
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  options?: string[]; // for select/radio
  autocomplete?: string;
}

export interface SiteAnalysis {
  siteMap: SiteMap;
  pageAnalyses: PageAnalysis[];
  features: FeatureInventory;
  techStack: string[];
}

export interface PageAnalysis {
  url: string;
  type: PageType;
  forms: FormInfo[];
  interactive: InteractiveElement[];
  hasAuth: boolean;
  hasSearch: boolean;
  hasPagination: boolean;
  hasModals: boolean;
  hasTabs: boolean;
  hasCarousel: boolean;
  hasInfiniteScroll: boolean;
  hasFileUpload: boolean;
  hasCookieConsent: boolean;
  hasCaptcha: boolean;
}

export interface FeatureInventory {
  authFlows: string[]; // URLs with auth forms
  searchPages: string[];
  formPages: string[];
  paginatedPages: string[];
  protectedRoutes: string[];
  oauthProviders: string[]; // "google", "github", "facebook"
  paymentForms: string[];
  fileUploads: string[];
}

// ---------------------------------------------------------------------------
// Form filler types (Agent 6)
// ---------------------------------------------------------------------------

export interface TestDataSet {
  name: { first: string; last: string; full: string };
  email: string;
  password: string;
  phone: string;
  address: { street: string; city: string; state: string; zip: string; country: string };
  creditCard: { number: string; expiry: string; cvv: string; name: string };
  date: string;
  url: string;
  company: string;
  username: string;
}

export interface FormTestResult {
  formUrl: string;
  formType: string;
  fieldsFound: number;
  fieldsFilled: number;
  submitted: boolean;
  validationErrors: string[];
  passed: boolean;
  duration: number;
  /** What we tested: empty submit, invalid data, valid data */
  testType: "empty" | "invalid" | "valid" | "boundary";
}

// ---------------------------------------------------------------------------
// Navigation types (Agent 4)
// ---------------------------------------------------------------------------

export interface NavigationResult {
  url: string;
  finalUrl: string;
  title: string;
  redirectChain: string[];
  loadTime: number;
  consoleErrors: string[];
  popupsHandled: string[];
  cookieConsentDismissed: boolean;
  status: number;
}

// ---------------------------------------------------------------------------
// Validation types (Agent 7)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  details: string;
  evidence: ValidationEvidence;
  confidence: number;
}

export interface ValidationEvidence {
  urlChanged: boolean;
  contentChanged: boolean;
  errorsDetected: string[];
  networkFailures: NetworkFailure[];
  consoleErrors: string[];
  visualChanges: boolean;
}

export interface NetworkFailure {
  url: string;
  status: number;
  method: string;
}

// ---------------------------------------------------------------------------
// Accessibility types (Agent 8)
// ---------------------------------------------------------------------------

export type A11ySeverity = "critical" | "serious" | "moderate" | "minor";

/** A single accessibility issue */
export interface A11yIssue {
  severity: A11ySeverity;
  rule: string;
  description: string;
  element?: string;
  page: string;
  /** WCAG criterion e.g. "1.1.1" */
  wcag?: string;
  /** How to fix */
  fix?: string;
}

/** Accessibility report for a page */
export interface A11yReport {
  url: string;
  issues: A11yIssue[];
  score: number;
  /** Keyboard navigation results */
  keyboardNav?: KeyboardNavResult;
  /** ARIA validation results */
  ariaValid?: boolean;
  /** Skip navigation present */
  hasSkipNav?: boolean;
  /** Focus indicators present */
  hasFocusIndicators?: boolean;
}

export interface KeyboardNavResult {
  totalFocusable: number;
  reachable: number;
  focusOrder: string[];
  traps: string[]; // elements that trap focus
  missingIndicators: string[];
}

// ---------------------------------------------------------------------------
// Performance types (Agent 9)
// ---------------------------------------------------------------------------

export interface PerformanceReport {
  url: string;
  metrics: CoreWebVitals;
  resources: ResourceAnalysis;
  jsErrors: string[];
  slowApis: SlowApiCall[];
  redirectChains: RedirectChain[];
  mixedContent: string[];
  score: number;
}

export interface CoreWebVitals {
  lcp: number; // Largest Contentful Paint (ms)
  cls: number; // Cumulative Layout Shift
  fid: number; // First Input Delay (ms) / INP
  fcp: number; // First Contentful Paint (ms)
  ttfb: number; // Time to First Byte (ms)
  domContentLoaded: number;
  fullLoad: number;
}

export interface ResourceAnalysis {
  totalRequests: number;
  totalSize: number; // bytes
  jsSize: number;
  cssSize: number;
  imageSize: number;
  fontSize: number;
  unoptimizedImages: UnoptimizedImage[];
  renderBlocking: string[];
}

export interface UnoptimizedImage {
  url: string;
  size: number;
  format: string;
  suggestion: string; // e.g. "Convert to WebP"
}

export interface SlowApiCall {
  url: string;
  method: string;
  duration: number;
  status: number;
}

export interface RedirectChain {
  startUrl: string;
  hops: string[];
  finalUrl: string;
}

// ---------------------------------------------------------------------------
// Security types (Agent 10)
// ---------------------------------------------------------------------------

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityReport {
  url: string;
  issues: SecurityIssue[];
  headers: SecurityHeaders;
  https: HttpsStatus;
  cookies: CookieAudit[];
  xssResults: XssTestResult[];
  exposedData: ExposedData[];
  score: number;
}

export interface SecurityIssue {
  severity: SecuritySeverity;
  category: "xss" | "headers" | "https" | "cookies" | "exposure" | "redirect" | "mixed-content";
  title: string;
  description: string;
  url: string;
  fix?: string;
}

export interface SecurityHeaders {
  hsts: boolean;
  csp: string | null;
  xFrameOptions: string | null;
  xContentTypeOptions: boolean;
  referrerPolicy: string | null;
  permissionsPolicy: string | null;
}

export interface HttpsStatus {
  enforced: boolean;
  httpRedirects: boolean;
  mixedContent: string[];
  certificate?: { valid: boolean; issuer: string; expires: string };
}

export interface CookieAudit {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  domain: string;
  issues: string[];
}

export interface XssTestResult {
  url: string;
  field: string;
  payload: string;
  reflected: boolean;
  executed: boolean;
}

export interface ExposedData {
  type: "api-key" | "password" | "token" | "email" | "internal-url" | "debug-info";
  value: string;
  location: string;
}

// ---------------------------------------------------------------------------
// Responsive types (Agent 11)
// ---------------------------------------------------------------------------

export interface ResponsiveReport {
  viewports: ViewportResult[];
  score: number;
}

export interface ViewportResult {
  width: number;
  height: number;
  label: string; // e.g. "iPhone SE", "iPad Air", "Desktop 1440"
  screenshot?: string;
  issues: ResponsiveIssue[];
  mobileMenuWorks?: boolean;
  orientation?: "portrait" | "landscape";
}

export interface ResponsiveIssue {
  type: "overflow" | "touch-target" | "font-size" | "image-scale" | "sticky" | "layout" | "tap-target";
  description: string;
  element?: string;
  severity: "critical" | "serious" | "moderate" | "minor";
}

// ---------------------------------------------------------------------------
// SEO types (Agent 12 — SEO portion of Reporter)
// ---------------------------------------------------------------------------

export interface SEOReport {
  url: string;
  issues: SEOIssue[];
  meta: MetaTagAudit;
  robotsTxt: RobotsTxtAudit;
  sitemap: SitemapAudit;
  structuredData: StructuredDataAudit;
  canonicals: CanonicalAudit;
  score: number;
}

export interface SEOIssue {
  severity: "critical" | "serious" | "moderate" | "minor";
  rule: string;
  description: string;
  url: string;
  fix?: string;
}

export interface MetaTagAudit {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  viewport: string | null;
  charset: string | null;
}

export interface RobotsTxtAudit {
  exists: boolean;
  valid: boolean;
  disallowed: string[];
  sitemapUrl?: string;
}

export interface SitemapAudit {
  exists: boolean;
  valid: boolean;
  urlCount: number;
  invalidUrls: string[];
}

export interface StructuredDataAudit {
  hasJsonLd: boolean;
  hasSchemaOrg: boolean;
  types: string[]; // e.g. ["Organization", "WebSite", "Product"]
  errors: string[];
}

export interface CanonicalAudit {
  pages: Array<{ url: string; canonical: string | null; issue?: string }>;
}

// ---------------------------------------------------------------------------
// Final test report (combines all agents)
// ---------------------------------------------------------------------------

/** The final test report */
export interface TestReport {
  url: string;
  title: string;
  plan: TestPlan;
  results: TestStep[];
  a11y: A11yReport[];
  security?: SecurityReport;
  performance?: PerformanceReport[];
  responsive?: ResponsiveReport;
  seo?: SEOReport;
  siteMap?: SiteMap;
  formResults?: FormTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    overallScore: number;
  };
  screenshots: string[];
  timestamp: string;
  /** Token usage and cost */
  cost?: { tokens: number; estimatedCost: number };
}
