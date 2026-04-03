import { BaseDocumentLoader, type Document } from "./base.js";

export interface WebLoaderOptions {
  selector?: string;
  excludeSelectors?: string[];
  timeout?: number;
  headers?: Record<string, string>;
}

export class WebDocumentLoader extends BaseDocumentLoader {
  private options: WebLoaderOptions;

  constructor(options: WebLoaderOptions = {}) {
    super();
    this.options = {
      timeout: 30000,
      excludeSelectors: ["script", "style", "nav", "footer", "header", "aside"],
      ...options,
    };
  }

  async load(url: string): Promise<Document[]> {
    const response = await fetch(url, {
      headers: this.options.headers,
      signal: AbortSignal.timeout(this.options.timeout ?? 30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const content = this.extractText(html);

    const document: Document = {
      id: this.generateId(url, 0),
      content,
      metadata: {
        url,
        title: this.extractTitle(html),
        fetchedAt: new Date().toISOString(),
        contentType: response.headers.get("content-type"),
      },
      source: url,
    };

    return [document];
  }

  private extractText(html: string): string {
    const excludeSelectors = this.options.excludeSelectors ?? ["script", "style"];

    let cleaned = html;

    for (const selector of excludeSelectors) {
      const regex = new RegExp(`<${selector}[^>]*>[\\s\\S]*?</${selector}>`, "gi");
      cleaned = cleaned.replace(regex, "");
    }

    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : cleaned;

    const textContent = bodyContent
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return textContent;
  }

  private extractTitle(html: string): string | undefined {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : undefined;
  }
}
