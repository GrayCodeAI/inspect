// ──────────────────────────────────────────────────────────────────────────────
// @inspect/workflow - Benchmark Block
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock, WorkflowBlockResult } from "@inspect/core";

const SUITES: Record<
  string,
  Array<{ id: string; name: string; url: string; goal: string; maxSteps: number; timeout: number }>
> = {
  miniwob: [
    {
      id: "click-button",
      name: "Click Button",
      url: "about:blank",
      goal: "Click the button",
      maxSteps: 5,
      timeout: 10_000,
    },
    {
      id: "enter-text",
      name: "Enter Text",
      url: "about:blank",
      goal: "Type text into input",
      maxSteps: 5,
      timeout: 10_000,
    },
    {
      id: "select-option",
      name: "Select Option",
      url: "about:blank",
      goal: "Select dropdown option",
      maxSteps: 5,
      timeout: 10_000,
    },
  ],
  webarena: [
    {
      id: "search-product",
      name: "Search Product",
      url: "about:blank",
      goal: "Search for a product",
      maxSteps: 15,
      timeout: 30_000,
    },
    {
      id: "add-to-cart",
      name: "Add to Cart",
      url: "about:blank",
      goal: "Add item to cart",
      maxSteps: 15,
      timeout: 30_000,
    },
  ],
  workarena: [
    {
      id: "create-ticket",
      name: "Create Ticket",
      url: "about:blank",
      goal: "Create a support ticket",
      maxSteps: 20,
      timeout: 30_000,
    },
  ],
};

/**
 * Workflow block for running agent benchmarks.
 *
 * Usage in YAML:
 * ```yaml
 * steps:
 *   - type: benchmark
 *     parameters:
 *       suite: miniwob
 * ```
 */
export async function executeBenchmarkBlock(
  block: WorkflowBlock,
  _context: Record<string, unknown>,
): Promise<WorkflowBlockResult> {
  const params = block.parameters;
  const suite = (params.suite as string) ?? "miniwob";
  const start = Date.now();

  const tasks = SUITES[suite];
  if (!tasks) {
    return {
      blockId: block.id,
      status: "failed",
      error: `Unknown benchmark suite: ${suite}. Available: ${Object.keys(SUITES).join(", ")}`,
    };
  }

  try {
    // Use real agent executor if provided in context
    const agentExecutor = _context.agentExecutor as
      | ((
          instruction: string,
          url: string,
          maxSteps: number,
        ) => Promise<{ success: boolean; durationMs: number }>)
      | undefined;

    const results = await Promise.all(
      tasks.map(async (task) => {
        const taskStart = Date.now();
        if (agentExecutor) {
          try {
            const result = await agentExecutor(task.goal, task.url, task.maxSteps);
            return {
              taskId: task.id,
              taskName: task.name,
              success: result.success,
              durationMs: result.durationMs,
            };
          } catch (err) {
            return {
              taskId: task.id,
              taskName: task.name,
              success: false,
              durationMs: Date.now() - taskStart,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }

        // No agent executor — report as skipped
        return {
          taskId: task.id,
          taskName: task.name,
          success: false,
          durationMs: 0,
          skipped: true,
          reason: "No agent executor registered",
        };
      }),
    );

    const passed = results.filter((r) => r.success).length;

    return {
      blockId: block.id,
      status: "completed",
      output: {
        suite,
        totalTasks: results.length,
        passedTasks: passed,
        failedTasks: results.length - passed,
        successRate: results.length > 0 ? passed / results.length : 0,
        results,
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
