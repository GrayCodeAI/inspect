// ──────────────────────────────────────────────────────────────────────────────
// PDF Ingestor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { DocumentIngestionError } from "./errors.js";

export class PdfMetadata extends Schema.Class<PdfMetadata>("PdfMetadata")({
  title: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  pageCount: Schema.Number,
  fileSize: Schema.Number,
}) {}

export class PdfDocument extends Schema.Class<PdfDocument>("PdfDocument")({
  content: Schema.String,
  metadata: PdfMetadata,
  pages: Schema.Array(
    Schema.Struct({
      pageNumber: Schema.Number,
      text: Schema.String,
    }),
  ),
}) {}

export interface PdfIngestorService {
  readonly extract: (filePath: string) => Effect.Effect<PdfDocument, DocumentIngestionError>;
  readonly getMetadata: (filePath: string) => Effect.Effect<PdfMetadata, DocumentIngestionError>;
}

export class PdfIngestor extends ServiceMap.Service<PdfIngestor, PdfIngestorService>()(
  "@inspect/PdfIngestor",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const extract = (filePath: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ filePath });

          const exists = fsSync.existsSync(filePath);
          if (!exists) {
            return yield* new DocumentIngestionError({
              message: `PDF file not found: ${filePath}`,
              documentType: "pdf",
            });
          }

          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(filePath, "utf-8"),
            catch: (cause) =>
              new DocumentIngestionError({
                message: `Failed to read file: ${filePath}`,
                documentType: "pdf",
                cause,
              }),
          });
          const fileSize = content.length;

          yield* Effect.logInfo("PDF file loaded", {
            path: filePath,
            size: fileSize,
          });

          const textContent = content
            .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const document = new PdfDocument({
            content: textContent,
            metadata: new PdfMetadata({
              pageCount: 1,
              fileSize,
            }),
            pages: [
              {
                pageNumber: 1,
                text: textContent.substring(0, 5000),
              },
            ],
          });

          yield* Effect.logInfo("PDF extracted successfully", {
            path: filePath,
            contentLength: textContent.length,
          });

          return document;
        }).pipe(
          Effect.catchTag("DocumentIngestionError", Effect.fail),
          Effect.matchEffect({
            onSuccess: (doc) => Effect.succeed(doc),
            onFailure: (cause) =>
              Effect.fail(
                new DocumentIngestionError({
                  message: `Failed to extract PDF: ${String(cause)}`,
                  documentType: "pdf",
                  cause,
                }),
              ),
          }),
          Effect.withSpan("PdfIngestor.extract"),
        );

      const getMetadata = (filePath: string) =>
        Effect.gen(function* () {
          const exists = fsSync.existsSync(filePath);
          if (!exists) {
            return yield* new DocumentIngestionError({
              message: `PDF file not found: ${filePath}`,
              documentType: "pdf",
            });
          }

          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(filePath, "utf-8"),
            catch: (cause) =>
              new DocumentIngestionError({
                message: `Failed to read file: ${filePath}`,
                documentType: "pdf",
                cause,
              }),
          });

          return new PdfMetadata({
            pageCount: 1,
            fileSize: content.length,
          });
        }).pipe(Effect.withSpan("PdfIngestor.getMetadata"));

      return { extract, getMetadata } as const;
    }),
  );
}
