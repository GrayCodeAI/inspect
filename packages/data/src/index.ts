// ============================================================================
// @inspect/data - Data Extraction, Parsing, and Storage Package
// ============================================================================

// Extractors
export { ZodExtractor } from "./extractors/zod.js";
export type { ExtractorLLM, PageContent, ZodExtractionResult } from "./extractors/zod.js";
export { JSONSchemaExtractor } from "./extractors/json-schema.js";
export type {
  JSONSchemaDefinition,
  SchemaExtractorLLM,
  SchemaPageContent,
  JSONSchemaExtractionResult,
} from "./extractors/json-schema.js";
export { MarkdownExtractor } from "./extractors/markdown.js";
export { LLMExtractor } from "./extractors/llm.js";
export type {
  LLMProvider,
  LLMPageContent,
  LLMExtractOptions,
  LLMExtractionResult,
} from "./extractors/llm.js";

// Parsers
export { CSVParser } from "./parsers/csv.js";
export type { CSVParseOptions, CSVParseResult } from "./parsers/csv.js";
export { ExcelParser } from "./parsers/excel.js";
export type { ExcelParseResult, ExcelSheet } from "./parsers/excel.js";
export { PDFParser } from "./parsers/pdf.js";
export type { PDFParseResult, PDFPage, PDFMetadata } from "./parsers/pdf.js";
export { WordParser } from "./parsers/word.js";
export type { WordParseResult, WordMetadata } from "./parsers/word.js";
export { JSONParser } from "./parsers/json.js";
export type { JSONParseOptions, JSONParseResult } from "./parsers/json.js";

// Storage
export { S3Storage } from "./storage/s3.js";
export type { S3Config, S3UploadResult } from "./storage/s3.js";
export { AzureBlobStorage } from "./storage/azure-blob.js";
export type { AzureBlobConfig, AzureBlobUploadResult } from "./storage/azure-blob.js";
export { LocalStorage } from "./storage/local.js";
export type { LocalFileMetadata } from "./storage/local.js";

// Crawler
export { WebCrawler, type CrawlProgressCallback } from "./crawler/crawler.js";
export { SitemapParser, type SitemapEntry } from "./crawler/sitemap.js";
export { RobotsParser, type RobotsRule } from "./crawler/robots.js";
export { LinkExtractor, type ExtractedLink } from "./crawler/link-extractor.js";

// Change Tracking
export { Snapshotter, Differ, ChangeTracker } from "./tracking/tracker.js";

// Document Loaders
export {
  BaseDocumentLoader,
  type Document,
  type DocumentLoader,
  WebDocumentLoader,
  CsvDocumentLoader,
  JsonDocumentLoader,
  JsonlDocumentLoader,
  PdfDocumentLoader,
  createLoader,
  type LoaderType,
  type LoaderOptions,
} from "./document-loaders/index.js";
export type {
  WebLoaderOptions,
  CSVLoaderOptions,
  JSONLoaderOptions,
  PDFLoaderOptions,
} from "./document-loaders/index.js";

// Artifacts — LLM-generated code/UI artifacts (LibreChat-style)
export { ArtifactStore } from "./artifacts.js";
export type { Artifact, ArtifactType } from "./artifacts.js";

// Web Search — real-time internet research (LibreChat-style)
export { WebSearchEngine } from "./web-search.js";
export type { SearchResult, WebSearchConfig, SearchProvider } from "./web-search.js";
