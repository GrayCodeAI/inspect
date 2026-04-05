import { BaseDocumentLoader, type Document } from "./base.js";

export interface PDFLoaderOptions {
  splitPages?: boolean;
  extractImages?: boolean;
  password?: string;
}

export class PdfNotImplementedError extends Error {
  readonly _tag = "PdfNotImplementedError";
  constructor(readonly filePath: string) {
    super(
      `PDF parsing requires a native PDF parsing library. Install 'pdf-parse' or 'pdfjs-dist' and re-run. File: ${filePath}`,
    );
  }
}

export class PdfDocumentLoader extends BaseDocumentLoader {
  private options: PDFLoaderOptions;

  constructor(options: PDFLoaderOptions = {}) {
    super();
    this.options = {
      splitPages: true,
      ...options,
    };
  }

  async load(filePath: string): Promise<Document[]> {
    let pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
    try {
      const module = await import("pdf-parse" as string);
      pdfParse = module.default;
    } catch {
      throw new PdfNotImplementedError(filePath);
    }

    const fs = await import("node:fs/promises");
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);

    if (this.options.splitPages && data.numpages > 1) {
      const pages = data.text.split(/\f/);
      return pages.map((pageContent: string, index: number) => ({
        id: this.generateId(filePath, index),
        content: pageContent.trim(),
        metadata: {
          source: filePath,
          page: index + 1,
          totalPages: data.numpages,
        },
        source: filePath,
      }));
    }

    return [
      {
        id: this.generateId(filePath, 0),
        content: data.text.trim(),
        metadata: {
          source: filePath,
          totalPages: data.numpages,
        },
        source: filePath,
      },
    ];
  }
}
