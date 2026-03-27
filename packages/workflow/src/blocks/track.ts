// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Track Block
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock, WorkflowBlockResult } from "@inspect/shared";

/**
 * Workflow block for change tracking.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: track
 *     parameters:
 *       urls:
 *         - https://example.com/pricing
 *       interval: 3600
 * ```
 */
export async function executeTrackBlock(
  block: WorkflowBlock,
  _context: Record<string, unknown>,
): Promise<WorkflowBlockResult> {
  const params = block.parameters;
  const urls = (params.urls as string[]) ?? [];

  if (urls.length === 0) {
    return { blockId: block.id, status: "failed", error: "track block requires 'urls' array" };
  }

  const start = Date.now();

  try {
    const { ChangeTracker } = await import("@inspect/data");
    const diffs: unknown[] = [];

    const tracker = new ChangeTracker({
      urls,
      interval: ((params.interval as number) ?? 60) * 1000,
      onDiff: (diff) => {
        diffs.push(diff);
      },
    });

    await tracker.snapshotAll();

    if (params.interval && (params.interval as number) > 0) {
      await new Promise<void>((resolve) => {
        tracker.startMonitoring();
        setTimeout(
          () => {
            tracker.stopMonitoring();
            resolve();
          },
          Math.min((params.interval as number) * 1000, 30_000),
        );
      });
    }

    return {
      blockId: block.id,
      status: "completed",
      output: {
        urlsMonitored: urls.length,
        changesDetected: diffs.length,
        diffs,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      blockId: block.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}
