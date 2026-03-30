// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Generation Module
//
// Autonomous test generation from sitemaps, code analysis, and user flows.
// Re-exports TestGenerator with core-level orchestration.
// ──────────────────────────────────────────────────────────────────────────────

export {
  TestGenerator,
  type PageAnalysis,
  type GeneratedTest,
  type GeneratedTestSuite,
  type GeneratedStep,
  type TestCategory,
  type PageType,
  type AnalyzedElement,
  type FormInfo,
} from "./generator.js";
