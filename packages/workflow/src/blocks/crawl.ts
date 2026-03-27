// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Crawl Block
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock, WorkflowBlockResult } from "@inspect/shared";

/**
 * Workflow block for web crawling.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: crawl
 *     parameters:
 *       url: https://example.com
 *       depth: 3
 *       maxPages: 100
 * ```
 */
export async function executeCrawlBlock(
  block: WorkflowBlock,
  context: Record<string, unknown>,
): Promise<WorkflowBlockResult> {
  const params = block.parameters;
  const url = (params.url as string) ?? (context.url as string);

  if (!url) {
    return { blockId: block.id, status: "failed", error: "crawl block requires 'url'" };
  }

  const start = Date.now();

  try {
    const { WebCrawler } = await import("@inspect/data");

    const crawler = new WebCrawler({
      startUrl: url,
      maxDepth: (params.depth as number) ?? 3,
      maxPages: (params.maxPages as number) ?? 100,
      extractContent: (params.extractContent as boolean) ?? false,
      sameDomain: params.sameDomain !== false,
      excludePatterns: (params.exclude as string[]) ?? [],
      includePatterns: (params.include as string[]) ?? [],
    });

    const job = await crawler.crawl();
    const output = crawler.export((params.format as "json" | "csv" | "jsonl") ?? "json");

    return {
      blockId: block.id,
      status: "completed",
      output: {
        pagesCrawled: job.pagesCrawled,
        errorCount: job.errorCount,
        durationMs: (job.endTime ?? 0) - (job.startTime ?? 0),
        results: JSON.parse(output),
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
