// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - File Upload Block
//
// Uploads a file to a browser input or via HTTP POST.
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock } from "@inspect/core";
import { readFile, stat } from "node:fs/promises";

export interface FileUploadResult {
  type: "file_upload";
  filePath: string;
  target?: string;
  size?: number;
  status: "completed" | "failed" | "delegated";
  error?: string;
  message?: string;
}

/**
 * File upload block reads a file and prepares it for upload.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: file_upload
 *     parameters:
 *       filePath: "./data/test.csv"
 *       target: "input[type=file]"
 * ```
 */
export class FileUploadBlock {
  private uploadHandler?: (filePath: string, target: string, content: Buffer) => Promise<void>;

  setUploadHandler(
    handler: (filePath: string, target: string, content: Buffer) => Promise<void>,
  ): void {
    this.uploadHandler = handler;
  }

  async execute(block: WorkflowBlock, context: Record<string, unknown>): Promise<FileUploadResult> {
    const params = block.parameters;
    const render = context.render as ((s: string) => string) | undefined;
    const filePath = render ? render(String(params.filePath ?? "")) : String(params.filePath ?? "");
    const target = params.target ? String(params.target) : "input[type=file]";

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        return {
          type: "file_upload",
          filePath,
          target,
          status: "failed",
          error: `Not a file: ${filePath}`,
        };
      }

      const content = await readFile(filePath);

      if (this.uploadHandler) {
        await this.uploadHandler(filePath, target, content);
        return {
          type: "file_upload",
          filePath,
          target,
          size: content.length,
          status: "completed",
        };
      }

      return {
        type: "file_upload",
        filePath,
        target,
        size: content.length,
        status: "delegated",
        message:
          "File read successfully. No upload handler registered. Call setUploadHandler() to enable.",
      };
    } catch (err) {
      return {
        type: "file_upload",
        filePath,
        target,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
