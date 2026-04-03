export interface Document {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  source: string;
}

export interface DocumentLoader {
  load(source: string): Promise<Document[]>;
  lazyLoad(source: string): AsyncGenerator<Document>;
}

export abstract class BaseDocumentLoader implements DocumentLoader {
  abstract load(source: string): Promise<Document[]>;

  async *lazyLoad(source: string): AsyncGenerator<Document> {
    const documents = await this.load(source);
    for (const document of documents) {
      yield document;
    }
  }

  protected generateId(source: string, index: number): string {
    return `doc_${Buffer.from(source).toString("base64url").slice(0, 16)}_${index}`;
  }
}
