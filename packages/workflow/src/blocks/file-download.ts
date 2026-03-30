// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - File Download Block
//
// Downloads a file from a URL to a local path.
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock } from "@inspect/shared";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface FileDownloadResult {
  type: "file_download";
  url: string;
  savePath: string;
  size?: number;
  status: "completed" | "failed";
  error?: string;
}

/**
 * File download block downloads a file from a URL.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: file_download
 *     parameters:
 *       url: "https://example.com/report.pdf"
 *       savePath: "./downloads/report.pdf"
 * ```
 */
export class FileDownloadBlock {
  async execute(
    block: WorkflowBlock,
    context: Record<string, unknown>,
  ): Promise<FileDownloadResult> {
    const params = block.parameters;
    const render = context.render as ((s: string) => string) | undefined;
    const url = render ? render(String(params.url ?? "")) : String(params.url ?? "");
    const savePath = render ? render(String(params.savePath ?? "")) : String(params.savePath ?? "");

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return {
          type: "file_download",
          url,
          savePath,
          status: "failed",
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Ensure directory exists
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, buffer);

      return {
        type: "file_download",
        url,
        savePath,
        size: buffer.length,
        status: "completed",
      };
    } catch (err) {
      return {
        type: "file_download",
        url,
        savePath,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
