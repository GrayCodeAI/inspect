// ──────────────────────────────────────────────────────────────────────────────
// CSV Ingestor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { DocumentIngestionError } from "./errors.js";

export class CsvDocument extends Schema.Class<CsvDocument>("CsvDocument")({
  headers: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Record(Schema.String, Schema.String)),
  rowCount: Schema.Number,
}) {}

export interface CsvIngestorService {
  readonly parse: (filePath: string) => Effect.Effect<CsvDocument, DocumentIngestionError>;
  readonly parseContent: (
    content: string,
    delimiter?: string,
  ) => Effect.Effect<CsvDocument, DocumentIngestionError>;
}

export class CsvIngestor extends ServiceMap.Service<CsvIngestor, CsvIngestorService>()(
  "@inspect/CsvIngestor",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const parseContent = (content: string, delimiter = ",") =>
        Effect.sync(() => {
          const lines = content.split("\n").filter((line) => line.trim().length > 0);

          if (lines.length === 0) {
            return new CsvDocument({
              headers: [],
              rows: [],
              rowCount: 0,
            });
          }

          const parseLine = (line: string): string[] => {
            const result: string[] = [];
            let current = "";
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }

            result.push(current.trim());
            return result;
          };

          const headers = parseLine(lines[0]);
          const rows = lines.slice(1).map((line) => {
            const values = parseLine(line);
            const row: Record<string, string> = {};
            for (let i = 0; i < headers.length; i++) {
              row[headers[i]] = values[i] ?? "";
            }
            return row;
          });

          return new CsvDocument({
            headers,
            rows,
            rowCount: rows.length,
          });
        }).pipe(
          Effect.matchEffect({
            onSuccess: (doc) => Effect.succeed(doc),
            onFailure: (cause) =>
              Effect.fail(
                new DocumentIngestionError({
                  message: `Failed to parse CSV content: ${String(cause)}`,
                  documentType: "csv",
                  cause,
                }),
              ),
          }),
          Effect.withSpan("CsvIngestor.parseContent"),
        );

      const parse = (filePath: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ filePath });

          const exists = fsSync.existsSync(filePath);
          if (!exists) {
            return yield* new DocumentIngestionError({
              message: `CSV file not found: ${filePath}`,
              documentType: "csv",
            });
          }

          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(filePath, "utf-8"),
            catch: (cause) =>
              new DocumentIngestionError({
                message: `Failed to read file: ${filePath}`,
                documentType: "csv",
                cause,
              }),
          });

          yield* Effect.logInfo("CSV file loaded", { path: filePath });

          return yield* parseContent(content);
        }).pipe(
          Effect.catchTag("DocumentIngestionError", Effect.fail),
          Effect.withSpan("CsvIngestor.parse"),
        );

      return { parse, parseContent } as const;
    }),
  );
}
