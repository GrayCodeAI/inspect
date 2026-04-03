import type { DocumentLoader } from "./base.js";
import { WebDocumentLoader, type WebLoaderOptions } from "./web-loader.js";
import { CsvDocumentLoader, type CSVLoaderOptions } from "./csv-loader.js";
import { JsonDocumentLoader, JsonlDocumentLoader, type JSONLoaderOptions } from "./json-loader.js";
import { PdfDocumentLoader, type PDFLoaderOptions } from "./pdf-loader.js";

export { BaseDocumentLoader, type Document, type DocumentLoader } from "./base.js";
export { WebDocumentLoader, type WebLoaderOptions } from "./web-loader.js";
export { CsvDocumentLoader, type CSVLoaderOptions } from "./csv-loader.js";
export { JsonDocumentLoader, JsonlDocumentLoader, type JSONLoaderOptions } from "./json-loader.js";
export { PdfDocumentLoader, type PDFLoaderOptions } from "./pdf-loader.js";

export type LoaderType = "web" | "csv" | "json" | "jsonl" | "pdf";

export interface LoaderOptions {
  web?: WebLoaderOptions;
  csv?: CSVLoaderOptions;
  json?: JSONLoaderOptions;
  jsonl?: JSONLoaderOptions;
  pdf?: PDFLoaderOptions;
}

export function createLoader(type: LoaderType, options: LoaderOptions = {}): DocumentLoader {
  switch (type) {
    case "web":
      return new WebDocumentLoader(options.web);
    case "csv":
      return new CsvDocumentLoader(options.csv);
    case "json":
      return new JsonDocumentLoader(options.json);
    case "jsonl":
      return new JsonlDocumentLoader(options.jsonl);
    case "pdf":
      return new PdfDocumentLoader(options.pdf);
    default:
      throw new Error(`Unknown loader type: ${type}`);
  }
}
