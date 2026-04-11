// ──────────────────────────────────────────────────────────────────────────────
// Document Router Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { DocumentIngestionError } from "./errors.js";

export type DocumentType = "pdf" | "docx" | "csv" | "txt" | "unknown";

export class IngestedDocument extends Schema.Class<IngestedDocument>("IngestedDocument")({
  type: Schema.String,
  content: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  sourcePath: Schema.String,
}) {}

export interface DocumentRouterService {
  readonly detectType: (filePath: string) => Effect.Effect<DocumentType>;
  readonly ingest: (filePath: string) => Effect.Effect<IngestedDocument, DocumentIngestionError>;
}

export class DocumentRouter extends ServiceMap.Service<
  DocumentRouter,
  DocumentRouterService
>()("@inspect/DocumentRouter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const detectType = (filePath: string) =>
        Effect.sync(() => {
          const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
          const typeMap: Record<string, DocumentType> = {
            pdf: "pdf",
            docx: "docx",
            csv: "csv",
            txt: "txt",
          };
          return typeMap[extension] ?? "unknown";
        }).pipe(Effect.withSpan("DocumentRouter.detectType"));

      const ingest = (filePath: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ filePath });

          const exists = fsSync.existsSync(filePath);
          if (!exists) {
            return yield* new DocumentIngestionError({
              message: `File not found: ${filePath}`,
            });
          }

          const docType = yield* detectType(filePath);
          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(filePath, "utf-8"),
            catch: (cause) =>
              new DocumentIngestionError({
                message: `Failed to read file: ${filePath}`,
                cause,
              }),
          });

          yield* Effect.logInfo("Document ingested", {
            path: filePath,
            type: docType,
            size: content.length,
          });

          return new IngestedDocument({
            type: docType,
            content,
            metadata: {
              size: content.length,
              detectedType: docType,
            },
            sourcePath: filePath,
          });
        }).pipe(
          Effect.catchTag("DocumentIngestionError", Effect.fail),
          Effect.matchEffect({
            onSuccess: (doc) => Effect.succeed(doc),
            onFailure: (cause) =>
              Effect.fail(
                new DocumentIngestionError({
                  message: `Failed to ingest document: ${String(cause)}`,
                  cause,
                }),
              ),
          }),
          Effect.withSpan("DocumentRouter.ingest"),
        );

      return { detectType, ingest } as const;
    }),
  );
}
