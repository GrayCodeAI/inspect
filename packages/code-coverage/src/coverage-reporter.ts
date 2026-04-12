import fs from "node:fs/promises";
import path from "node:path";
import { Effect, Layer, ServiceMap } from "effect";
import { CoverageProcessingError } from "./errors.js";
import type { CoverageSummary, FileCoverage } from "./coverage-processor.js";

export type ReportFormat = "lcov" | "json" | "summary";

export interface CoverageReporterOptions {
  readonly format: ReportFormat;
  readonly outputDir: string;
  readonly watermarkConfig: WatermarkConfig;
}

export interface WatermarkConfig {
  readonly lines: [number, number];
  readonly functions: [number, number];
  readonly branches: [number, number];
}

const DEFAULT_WATERMARKS: WatermarkConfig = {
  lines: [50, 80],
  functions: [50, 80],
  branches: [50, 80],
};

export class CoverageReporter extends ServiceMap.Service<CoverageReporter>()(
  "@code-coverage/CoverageReporter",
  {
    make: Effect.gen(function* () {
      const writeReport = (
        content: string,
        fileName: string,
        outputDir: string,
      ): Effect.Effect<void, CoverageProcessingError> =>
        Effect.tryPromise({
          try: async () => {
            const filePath = path.join(outputDir, fileName);
            await fs.writeFile(filePath, content, "utf-8");
            return filePath;
          },
          catch: (cause) =>
            new CoverageProcessingError({
              reason: `Failed to write ${fileName}`,
              cause: String(cause),
            }),
        }).pipe(
          Effect.flatMap((filePath) => Effect.logInfo(`Report generated`, { path: filePath })),
        );

      const generateReport = (
        summary: CoverageSummary,
        options: CoverageReporterOptions,
      ): Effect.Effect<void, CoverageProcessingError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            format: options.format,
            outputDir: options.outputDir,
          });

          const outputDir = path.resolve(options.outputDir);
          yield* Effect.tryPromise({
            try: () => fs.mkdir(outputDir, { recursive: true }),
            catch: (cause) =>
              new CoverageProcessingError({
                reason: "Failed to create output directory",
                cause: String(cause),
              }),
          });

          switch (options.format) {
            case "lcov": {
              const content = generateLcov(summary);
              yield* writeReport(content, "lcov.info", outputDir);
              break;
            }
            case "json": {
              const content = generateJson(summary);
              yield* writeReport(content, "coverage.json", outputDir);
              break;
            }
            case "summary": {
              const content = generateSummary(summary, options.watermarkConfig);
              yield* writeReport(content, "coverage-summary.txt", outputDir);
              break;
            }
          }
        }).pipe(Effect.withSpan("CoverageReporter.generateReport"));

      return {
        generateReport,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

const generateLcov = (summary: CoverageSummary): string => {
  const lines: Array<string> = [];

  for (const file of summary.files) {
    lines.push("TN:");
    lines.push(`SF:${file.path}`);

    for (const detail of file.details) {
      lines.push(`DA:${detail.line},${detail.hits}`);
      if (detail.branch) {
        lines.push(`BRDA:${detail.line},0,0,${detail.taken > 0 ? "1" : "0"}`);
      }
    }

    lines.push(`LF:${file.lines.total}`);
    lines.push(`LH:${file.lines.covered}`);
    lines.push(`FNDA:${file.functions.covered},${file.functions.total}`);
    lines.push(`FNF:${file.functions.total}`);
    lines.push(`FNH:${file.functions.covered}`);
    lines.push(`BRF:${file.branches.total}`);
    lines.push(`BRH:${file.branches.covered}`);
    lines.push("end_of_record");
  }

  return lines.join("\n");
};

const generateJson = (summary: CoverageSummary): string => {
  return JSON.stringify(
    {
      lines: summary.lines,
      functions: summary.functions,
      branches: summary.branches,
      files: summary.files,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );
};

const generateSummary = (
  summary: CoverageSummary,
  watermarks: WatermarkConfig = DEFAULT_WATERMARKS,
): string => {
  const lines: Array<string> = [];

  lines.push("=".repeat(60));
  lines.push("Coverage Summary");
  lines.push("=".repeat(60));
  lines.push("");

  lines.push(formatSection("Lines", summary.lines, watermarks.lines));
  lines.push(formatSection("Functions", summary.functions, watermarks.functions));
  lines.push(formatSection("Branches", summary.branches, watermarks.branches));

  lines.push("-".repeat(60));
  lines.push("");

  for (const file of summary.files) {
    lines.push(formatFileSection(file, watermarks));
    lines.push("");
  }

  lines.push("=".repeat(60));

  return lines.join("\n");
};

const formatSection = (
  title: string,
  metrics: { total: number; covered: number; pct: number },
  watermarks: [number, number],
): string => {
  const status = getStatus(metrics.pct, watermarks);
  return `${title.padEnd(12)} ${metrics.covered.toString().padStart(6)} / ${metrics.total.toString().padStart(6)} ${status.padEnd(8)} ${metrics.pct.toFixed(2)}%`;
};

const formatFileSection = (file: FileCoverage, watermarks: WatermarkConfig): string => {
  const fileLines: Array<string> = [];
  const fileName = file.path.split("/").pop() ?? file.path;

  fileLines.push(`File: ${fileName}`);
  fileLines.push(
    `  Lines:     ${file.lines.covered}/${file.lines.total} (${file.lines.pct.toFixed(2)}%) ${getStatus(file.lines.pct, watermarks.lines)}`,
  );
  fileLines.push(
    `  Functions: ${file.functions.covered}/${file.functions.total} (${file.functions.pct.toFixed(2)}%) ${getStatus(file.functions.pct, watermarks.functions)}`,
  );
  fileLines.push(
    `  Branches:  ${file.branches.covered}/${file.branches.total} (${file.branches.pct.toFixed(2)}%) ${getStatus(file.branches.pct, watermarks.branches)}`,
  );

  return fileLines.join("\n");
};

const getStatus = (pct: number, watermarks: [number, number]): string => {
  if (pct >= watermarks[1]) return "[HIGH]";
  if (pct >= watermarks[0]) return "[MED]";
  return "[LOW]";
};
