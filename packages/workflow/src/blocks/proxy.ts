// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Proxy Block
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock, WorkflowBlockResult } from "@inspect/shared";
import type { WorkflowContext } from "../engine/context.js";

/**
 * Workflow block for network fault injection.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: proxy
 *     parameters:
 *       preset: slow-3g
 *       then:
 *         - type: task
 *           instruction: "verify page loads under poor network"
 * ```
 */
export async function executeProxyBlock(
  block: WorkflowBlock,
  _context: WorkflowContext,
): Promise<WorkflowBlockResult> {
  const params = block.parameters;
  const start = Date.now();

  try {
    const { ProxyServer } = await import("@inspect/resilience");

    const server = new ProxyServer({
      port: (params.port as number) ?? 8888,
      upstream: (params.upstream as string) ?? "localhost:80",
      name: "workflow-proxy",
    });

    if (params.preset) {
      server.applyPreset(params.preset as string);
    }

    if (params.latency) {
      server.addToxic({
        type: "latency",
        name: "workflow-latency",
        attributes: { latency: params.latency as number, jitter: (params.jitter as number) ?? 0 },
      });
    }

    if (params.timeout) {
      server.addToxic({
        type: "timeout",
        name: "workflow-timeout",
        attributes: { timeout: params.timeout as number },
      });
    }

    await server.start();
    const status = server.getStatus();
    await server.stop();
    const metrics = server.getMetrics();

    return {
      blockId: block.id,
      status: "completed",
      output: {
        proxy: status,
        metrics,
        toxicsApplied: status.toxics.length,
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
