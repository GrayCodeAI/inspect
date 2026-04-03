import { BaseDocumentLoader, type Document } from "./base.js";

export interface PDFLoaderOptions {
  splitPages?: boolean;
  extractImages?: boolean;
  password?: string;
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
    console.warn(`PDF loading not fully implemented. File: ${filePath}`);

    return [
      {
        id: this.generateId(filePath, 0),
        content: "",
        metadata: {
          source: filePath,
          warning: "PDF parsing is not implemented. This is a placeholder.",
          splitPages: this.options.splitPages,
          extractImages: this.options.extractImages,
        },
        source: filePath,
      },
    ];
  }
}
