import { BaseDocumentLoader, type Document } from "./base.js";

export interface JSONLoaderOptions {
  contentPath?: string;
  metadataPaths?: string[];
  jqFilter?: string;
}

export class JsonDocumentLoader extends BaseDocumentLoader {
  private options: JSONLoaderOptions;

  constructor(options: JSONLoaderOptions = {}) {
    super();
    this.options = options;
  }

  async load(filePath: string): Promise<Document[]> {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    return this.parseJSON(content, filePath);
  }

  private parseJSON(content: string, source: string): Document[] {
    const parsed = JSON.parse(content);
    const documents: Document[] = [];

    if (Array.isArray(parsed)) {
      for (let index = 0; index < parsed.length; index++) {
        const item = parsed[index];
        documents.push(this.createDocument(item, index, source));
      }
    } else if (this.options.contentPath) {
      const items = this.extractByPath(parsed, this.options.contentPath);
      if (Array.isArray(items)) {
        for (let index = 0; index < items.length; index++) {
          documents.push(this.createDocument(items[index], index, source));
        }
      } else {
        documents.push(this.createDocument(items, 0, source));
      }
    } else {
      documents.push(this.createDocument(parsed, 0, source));
    }

    return documents;
  }

  private createDocument(item: unknown, index: number, source: string): Document {
    const content = this.extractContent(item);
    const metadata = this.extractMetadata(item);

    return {
      id: this.generateId(source, index),
      content,
      metadata: {
        ...metadata,
        index,
        source,
      },
      source,
    };
  }

  private extractContent(item: unknown): string {
    if (this.options.contentPath) {
      const content = this.extractByPath(item, this.options.contentPath);
      return typeof content === "string" ? content : JSON.stringify(content);
    }

    if (typeof item === "string") {
      return item;
    }

    if (item !== null && typeof item === "object") {
      const objectItem = item as Record<string, unknown>;

      if (typeof objectItem.text === "string") {
        return objectItem.text;
      }

      if (typeof objectItem.content === "string") {
        return objectItem.content;
      }

      if (typeof objectItem.body === "string") {
        return objectItem.body;
      }

      if (typeof objectItem.message === "string") {
        return objectItem.message;
      }

      return JSON.stringify(item);
    }

    return String(item);
  }

  private extractMetadata(item: unknown): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (this.options.metadataPaths && item !== null && typeof item === "object") {
      for (const path of this.options.metadataPaths) {
        const value = this.extractByPath(item, path);
        const key = path.split(".").pop() ?? path;
        metadata[key] = value;
      }
    } else if (item !== null && typeof item === "object") {
      const contentKeys = ["text", "content", "body", "message"];
      for (const [key, value] of Object.entries(item)) {
        if (!contentKeys.includes(key)) {
          metadata[key] = value;
        }
      }
    }

    return metadata;
  }

  private extractByPath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (part.includes("[")) {
        const arrayMatch = part.match(/(.+)\[(\d+)\]$/);
        if (arrayMatch) {
          const key = arrayMatch[1];
          const index = parseInt(arrayMatch[2], 10);
          const nextCurrent = (current as Record<string, unknown>)[key];
          if (Array.isArray(nextCurrent)) {
            current = nextCurrent[index];
          } else {
            return undefined;
          }
        } else {
          current = (current as Record<string, unknown>)[part];
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }
}

export class JsonlDocumentLoader extends BaseDocumentLoader {
  private options: JSONLoaderOptions;

  constructor(options: JSONLoaderOptions = {}) {
    super();
    this.options = options;
  }

  async load(filePath: string): Promise<Document[]> {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    return this.parseJSONL(content, filePath);
  }

  private parseJSONL(content: string, source: string): Document[] {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    const documents: Document[] = [];

    for (let index = 0; index < lines.length; index++) {
      try {
        const parsed = JSON.parse(lines[index]);
        documents.push(this.createDocument(parsed, index, source));
      } catch {
        documents.push({
          id: this.generateId(source, index),
          content: lines[index],
          metadata: { index, source, parseError: true },
          source,
        });
      }
    }

    return documents;
  }

  private createDocument(item: unknown, index: number, source: string): Document {
    const jsonLoader = new JsonDocumentLoader(this.options);
    return jsonLoader["createDocument"](item, index, source);
  }
}
