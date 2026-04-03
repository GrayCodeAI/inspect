import { BaseDocumentLoader, type Document } from "./base.js";

export interface CSVLoaderOptions {
  delimiter?: string;
  quote?: string;
  headers?: boolean;
  contentColumn?: string;
  metadataColumns?: string[];
  skipEmpty?: boolean;
}

export class CsvDocumentLoader extends BaseDocumentLoader {
  private options: CSVLoaderOptions;

  constructor(options: CSVLoaderOptions = {}) {
    super();
    this.options = {
      delimiter: ",",
      quote: '"',
      headers: true,
      skipEmpty: true,
      ...options,
    };
  }

  async load(filePath: string): Promise<Document[]> {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    return this.parseCSV(content, filePath);
  }

  private parseCSV(content: string, source: string): Document[] {
    const rows = this.splitRows(content);
    const documents: Document[] = [];

    let headers: string[] = [];
    let startIndex = 0;

    if (this.options.headers && rows.length > 0) {
      headers = this.parseRow(rows[0]);
      startIndex = 1;
    }

    const contentColumn = this.options.contentColumn;
    const metadataColumns = this.options.metadataColumns;

    for (let index = startIndex; index < rows.length; index++) {
      const row = this.parseRow(rows[index]);

      if (this.options.skipEmpty && row.every((cell) => cell.trim() === "")) {
        continue;
      }

      const rowData: Record<string, string> = {};
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
        rowData[headers[columnIndex]] = row[columnIndex] ?? "";
      }

      const documentContent = contentColumn
        ? (rowData[contentColumn] ?? row.join(" "))
        : row.join(" ");

      const metadata: Record<string, unknown> = {
        rowIndex: index - startIndex,
        source,
      };

      if (metadataColumns) {
        for (const column of metadataColumns) {
          if (rowData[column] !== undefined) {
            metadata[column] = rowData[column];
          }
        }
      } else {
        for (const [key, value] of Object.entries(rowData)) {
          if (key !== contentColumn) {
            metadata[key] = value;
          }
        }
      }

      documents.push({
        id: this.generateId(source, index - startIndex),
        content: documentContent,
        metadata,
        source,
      });
    }

    return documents;
  }

  private splitRows(content: string): string[] {
    const rows: string[] = [];
    let currentRow = "";
    let insideQuotes = false;
    const quote = this.options.quote ?? '"';

    for (let index = 0; index < content.length; index++) {
      const char = content[index];
      const nextChar = content[index + 1];

      if (char === quote) {
        if (insideQuotes && nextChar === quote) {
          currentRow += char;
          index++;
        } else {
          insideQuotes = !insideQuotes;
          currentRow += char;
        }
      } else if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index++;
        }
        if (currentRow.trim() !== "") {
          rows.push(currentRow);
        }
        currentRow = "";
      } else {
        currentRow += char;
      }
    }

    if (currentRow.trim() !== "") {
      rows.push(currentRow);
    }

    return rows;
  }

  private parseRow(row: string): string[] {
    const cells: string[] = [];
    let currentCell = "";
    let insideQuotes = false;
    const delimiter = this.options.delimiter ?? ",";
    const quote = this.options.quote ?? '"';

    for (let index = 0; index < row.length; index++) {
      const char = row[index];
      const nextChar = row[index + 1];

      if (char === quote) {
        if (insideQuotes && nextChar === quote) {
          currentCell += char;
          index++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        cells.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }

    cells.push(currentCell.trim());
    return cells;
  }
}
