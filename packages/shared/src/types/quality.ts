// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Quality Types (A11y, Performance, Chaos)
// ──────────────────────────────────────────────────────────────────────────────

import type { BoundingBox } from "./element.js";
import type { ViewportConfig } from "./browser-config.js";

/** Accessibility violation impact level */
export type A11yImpact = "critical" | "serious" | "moderate" | "minor";

/** A single check result within a violation node */
export interface A11yCheckResult {
  id: string;
  data?: unknown;
  relatedNodes?: { html: string; target: string[] }[];
  impact?: A11yImpact;
  message: string;
}

/** Accessibility violation node */
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

/** Accessibility violation */
export interface A11yViolation {
  id: string;
  impact: A11yImpact;
  description: string;
  help: string;
  helpUrl?: string;
  tags?: string[];
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

/** Performance metric rating */
export type MetricRating = "good" | "needs-improvement" | "poor";

/** Single performance metric */
export interface PerformanceMetric {
  value: number;
  rating: MetricRating;
  displayValue?: string;
}

/** Lighthouse category scores */
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
  estimatedSavingsMs?: number;
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
  device: "mobile" | "desktop";
  timestamp: number;
  url: string;
  stackPacks?: StackPackAdvice[];
}

/** Gremlin species for chaos testing */
export type GremlinSpecies = "clicker" | "formFiller" | "scroller" | "typer" | "toucher";

/** FPS drop event */
export interface FPSDrop {
  fps: number;
  timestamp: number;
  duration: number;
}

/** Chaos testing report */
export interface ChaosReport {
  interactions: number;
  errors: { message: string; stack?: string; timestamp: number }[];
  fpsDrops: FPSDrop[];
  consoleErrors: string[];
  duration: number;
  species: GremlinSpecies[];
  pageCrashed: boolean;
  unhandledRejections: string[];
}

/** Network fault injection types */
export type NetworkFault =
  | { type: "latency"; delay: number; jitter?: number }
  | { type: "bandwidth"; rate: number }
  | { type: "timeout"; timeout: number }
  | { type: "reset_peer"; timeout: number }
  | { type: "slow_close"; delay: number }
  | { type: "slicer"; avgSize: number; sizeVariation: number; delay: number }
  | { type: "limit_data"; bytes: number };

/** Network fault with metadata */
export interface NetworkFaultConfig {
  id: string;
  fault: NetworkFault;
  stream: "upstream" | "downstream";
  toxicity: number;
  enabled: boolean;
}

/** Visual diff result between two screenshots */
export interface VisualDiffResult {
  matched: boolean;
  mismatchPercentage: number;
  diffImage?: string;
  dimensions: { width: number; height: number };
  diffRegions?: BoundingBox[];
}

/** Visual regression scenario result */
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

/** Mock handler response */
export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  delay?: number;
}

/** Mock handler definition */
export interface MockHandlerConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  path: string;
  response: MockResponse;
  matcher?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  };
  times?: number;
}
