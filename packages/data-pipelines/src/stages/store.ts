// ──────────────────────────────────────────────────────────────────────────────
// Storage Stage
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import * as fs from "node:fs/promises";
import { PipelineError } from "../errors.js";

export type StorageTarget = "json" | "csv" | "memory";

export class StorageConfig extends Schema.Class<StorageConfig>("StorageConfig")({
  target: Schema.Literals(["json", "csv", "memory"] as const),
  path: Schema.optional(Schema.String),
  tableName: Schema.optional(Schema.String),
}) {}

export class StorageResult extends Schema.Class<StorageResult>("StorageResult")({
  target: Schema.String,
  path: Schema.optional(Schema.String),
  recordCount: Schema.Number,
  duration: Schema.Number,
}) {}

export const storeToJson = (filePath: string) => {
  return <T>(data: T[]) =>
    Effect.gen(function* () {
      const startTime = Date.now();

      const jsonContent = JSON.stringify(data, undefined, 2);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(filePath, jsonContent, "utf-8"),
        catch: (cause) =>
          new PipelineError({
            message: `Failed to write JSON file: ${String(cause)}`,
            stage: "store",
            cause,
          }),
      });

      const duration = Date.now() - startTime;

      yield* Effect.logInfo("Data stored to JSON", {
        stage: "store",
        path: filePath,
        recordCount: data.length,
        duration,
      });

      return new StorageResult({
        target: "json",
        path: filePath,
        recordCount: data.length,
        duration,
      });
    }).pipe(Effect.withSpan("stages.storeToJson"));
};

export const storeToCsv = (filePath: string, headers?: string[]) => {
  return <T extends Record<string, unknown>>(data: T[]) =>
    Effect.gen(function* () {
      const startTime = Date.now();

      const resolvedHeaders =
        headers ?? (data.length > 0 ? Object.keys(data[0]) : []);

      const rows = [resolvedHeaders.join(",")];
      for (const record of data) {
        const values = resolvedHeaders.map((header) => {
          const value = record[header];
          const stringValue = value === undefined || value === null ? "" : String(value);
          return stringValue.includes(",") || stringValue.includes('"')
            ? `"${stringValue.replace(/"/g, '""')}"`
            : stringValue;
        });
        rows.push(values.join(","));
      }

      const csvContent = rows.join("\n");

      yield* Effect.tryPromise({
        try: () => fs.writeFile(filePath, csvContent, "utf-8"),
        catch: (cause) =>
          new PipelineError({
            message: `Failed to write CSV file: ${String(cause)}`,
            stage: "store",
            cause,
          }),
      });

      const duration = Date.now() - startTime;

      yield* Effect.logInfo("Data stored to CSV", {
        stage: "store",
        path: filePath,
        recordCount: data.length,
        duration,
      });

      return new StorageResult({
        target: "csv",
        path: filePath,
        recordCount: data.length,
        duration,
      });
    }).pipe(Effect.withSpan("stages.storeToCsv"));
};

export const storeToMemory = <T>(data: T[]) =>
  Effect.gen(function* () {
    const startTime = Date.now();

    yield* Effect.logDebug("Data stored to memory", {
      stage: "store",
      recordCount: data.length,
    });

    const duration = Date.now() - startTime;

    return new StorageResult({
      target: "memory",
      recordCount: data.length,
      duration,
    });
  }).pipe(Effect.withSpan("stages.storeToMemory"));

export const store = (config: StorageConfig) => {
  return <T>(data: T[]) => {
    switch (config.target) {
      case "json": {
        const path = config.path ?? "output.json";
        return storeToJson(path)(data as Record<string, unknown>[]) as Effect.Effect<
          StorageResult,
          PipelineError
        >;
      }
      case "csv": {
        const path = config.path ?? "output.csv";
        return storeToCsv(path)(data as Record<string, unknown>[]);
      }
      case "memory": {
        return storeToMemory(data);
      }
    }
  };
};
