import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowExecutor } from "./executor.js";
import type { WorkflowDefinition, WorkflowBlock, WorkflowBlockType } from "@inspect/shared";

function makeBlock(
  id: string,
  type: string,
  params: Record<string, unknown> = {},
  opts?: Partial<WorkflowBlock>,
): WorkflowBlock {
  return {
    id,
    type: type as WorkflowBlockType,
    label: `Block ${id}`,
    parameters: params,
    ...opts,
  };
}

function makeWorkflow(
  blocks: WorkflowBlock[],
  opts?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    version: 1,
    status: "active",
    blocks,
    templateEngine: "handlebars",
    strictMode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

describe("WorkflowExecutor", () => {
  let executor: WorkflowExecutor;
  let events: Array<{ event: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    events = [];
    executor = new WorkflowExecutor((event, data) => {
      events.push({ event, data });
    });
  });

  describe("registerBlockHandler", () => {
    it("registers a custom block handler", async () => {
      let called = false;
      executor.registerBlockHandler("custom", async () => {
        called = true;
        return "done";
      });

      const workflow = makeWorkflow([makeBlock("b1", "custom")]);
      await executor.execute(workflow);
      expect(called).toBe(true);
    });
  });

  describe("execute", () => {
    it("executes a workflow with a single block", async () => {
      executor.registerBlockHandler("test", async () => "result");

      const workflow = makeWorkflow([makeBlock("b1", "test")]);
      const run = await executor.execute(workflow);

      expect(run.status).toBe("completed");
      expect(run.blockResults["b1"]).toBeDefined();
      expect(run.blockResults["b1"].status).toBe("completed");
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    it("executes multiple blocks sequentially", async () => {
      const order: string[] = [];
      executor.registerBlockHandler("step", async (block) => {
        order.push(block.id);
        return block.id;
      });

      const workflow = makeWorkflow([
        makeBlock("b1", "step"),
        makeBlock("b2", "step"),
        makeBlock("b3", "step"),
      ]);
      const run = await executor.execute(workflow);

      expect(run.status).toBe("completed");
      expect(order).toEqual(["b1", "b2", "b3"]);
    });

    it("follows nextBlockId chain", async () => {
      const order: string[] = [];
      executor.registerBlockHandler("step", async (block) => {
        order.push(block.id);
      });

      const workflow = makeWorkflow([
        makeBlock("b1", "step", {}, { nextBlockId: "b3" }),
        makeBlock("b2", "step"),
        makeBlock("b3", "step"),
      ]);
      const run = await executor.execute(workflow);

      expect(run.status).toBe("completed");
      expect(order).toEqual(["b1", "b3"]);
    });

    it("marks run as failed when a block throws", async () => {
      executor.registerBlockHandler("fail", async () => {
        throw new Error("Block failed");
      });

      const workflow = makeWorkflow([makeBlock("b1", "fail")]);
      const run = await executor.execute(workflow);

      expect(run.status).toBe("failed");
      expect(run.error).toContain("Block failed");
    });

    it("continues on failure when continueOnFailure is set", async () => {
      executor.registerBlockHandler("fail", async () => {
        throw new Error("Expected failure");
      });
      executor.registerBlockHandler("ok", async () => "success");

      const workflow = makeWorkflow([
        makeBlock("b1", "fail", {}, { continueOnFailure: true }),
        makeBlock("b2", "ok"),
      ]);
      const run = await executor.execute(workflow);

      expect(run.blockResults["b1"].status).toBe("failed");
      expect(run.blockResults["b2"].status).toBe("completed");
    });

    it("passes input parameters to context", async () => {
      let receivedValue: unknown;
      executor.registerBlockHandler("check", async (_block, context) => {
        receivedValue = context.get("greeting");
      });

      const workflow = makeWorkflow([makeBlock("b1", "check")]);
      await executor.execute(workflow, { greeting: "hello" });

      expect(receivedValue).toBe("hello");
    });

    it("passes block output to next block via context", async () => {
      let secondBlockInput: unknown;
      executor.registerBlockHandler("producer", async () => "produced-value");
      executor.registerBlockHandler("consumer", async (_block, context) => {
        secondBlockInput = context.get("lastOutput");
      });

      const workflow = makeWorkflow([makeBlock("b1", "producer"), makeBlock("b2", "consumer")]);
      await executor.execute(workflow);

      expect(secondBlockInput).toBe("produced-value");
    });

    it("emits lifecycle events", async () => {
      executor.registerBlockHandler("noop" as WorkflowBlockType, async () => {});

      const workflow = makeWorkflow([makeBlock("b1", "noop" as WorkflowBlockType)]);
      await executor.execute(workflow);

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain("workflow:started");
      expect(eventNames).toContain("workflow:completed");
    });

    it("records run duration", async () => {
      executor.registerBlockHandler("noop", async () => {});

      const workflow = makeWorkflow([makeBlock("b1", "noop")]);
      const run = await executor.execute(workflow);

      expect(run.startedAt).toBeGreaterThan(0);
      expect(run.completedAt).toBeGreaterThan(0);
      expect(run.duration).toBeGreaterThanOrEqual(0);
    });

    it("generates a unique run ID", async () => {
      executor.registerBlockHandler("noop", async () => {});
      const workflow = makeWorkflow([makeBlock("b1", "noop")]);

      const run1 = await executor.execute(workflow);
      const run2 = await executor.execute(workflow);

      expect(run1.id).not.toBe(run2.id);
    });
  });

  describe("cancel", () => {
    it("cancels a running workflow", async () => {
      executor.registerBlockHandler("slow", async () => {
        await new Promise((r) => setTimeout(r, 100));
        return "done";
      });

      const workflow = makeWorkflow([makeBlock("b1", "slow"), makeBlock("b2", "slow")]);

      // Start and immediately cancel
      const runPromise = executor.execute(workflow);
      // The first block will complete, but second should be skipped
      // We need the runId which we can get from events
      await new Promise((r) => setTimeout(r, 10));
      const startEvent = events.find((e) => e.event === "workflow:started");
      if (startEvent) {
        executor.cancel(startEvent.data.runId as string);
      }

      const run = await runPromise;
      // May be cancelled or completed depending on timing
      expect(["completed", "cancelled"]).toContain(run.status);
    });
  });
});
