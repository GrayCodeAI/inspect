// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Autonomous Test Generation
//
// Re-exports TestGenerator and adds generation-from-sitemap, code analysis,
// and edge case generation capabilities.
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
} from "../testing/generator.js";
