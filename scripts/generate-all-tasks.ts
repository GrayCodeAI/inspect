#!/usr/bin/env tsx
/**
 * Task Generator Script
 *
 * Generates implementation stubs for all 1,700 tasks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

interface Task {
  id: number;
  description: string;
  status: "completed" | "pending";
  part: number;
  partName: string;
}

interface TaskPart {
  number: number;
  name: string;
  tasks: Task[];
}

// Load task database
const tasksDb: TaskPart[] = JSON.parse(
  readFileSync("/home/lpatel/Code/LP-DEV/inspect/tasks_database.json", "utf8")
);

// Task implementation templates
const templates = {
  schema: (task: Task) => `
/**
 * Task ${task.id}: ${task.description}
 *
 * Part ${task.part}: ${task.partName}
 * Status: ${task.status}
 */

import { Schema } from "effect";

// TODO: Implement Task ${task.id}
// ${task.description}

export class Task${task.id}Schema extends Schema.Class<Task${task.id}Schema>("Task${task.id}")({
  // Define schema fields here
  id: Schema.String,
}) {}
`,

  service: (task: Task) => `
/**
 * Task ${task.id}: ${task.description}
 *
 * Part ${task.part}: ${task.partName}
 * Status: ${task.status}
 */

import { Effect, ServiceMap } from "effect";

// TODO: Implement Task ${task.id}
// ${task.description}

export class Task${task.id}Service extends ServiceMap.Service<Task${task.id}Service>()("@inspect/Task${task.id}") {
  // Define service interface here
  readonly execute: Effect.Effect<void>;
} {
  static live = Task${task.id}Service.of({
    execute: Effect.log("Task ${task.id} executed"),
  });
}
`,

  function: (task: Task) => `
/**
 * Task ${task.id}: ${task.description}
 *
 * Part ${task.part}: ${task.partName}
 * Status: ${task.status}
 */

import { Effect } from "effect";

// TODO: Implement Task ${task.id}
// ${task.description}

export function task${task.id}(): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    yield* Effect.log("Executing Task ${task.id}");
    // Implementation here
  });
}
`,

  class: (task: Task) => `
/**
 * Task ${task.id}: ${task.description}
 *
 * Part ${task.part}: ${task.partName}
 * Status: ${task.status}
 */

// TODO: Implement Task ${task.id}
// ${task.description}

export class Task${task.id}Class {
  constructor(private config: Record<string, unknown>) {}

  async execute(): Promise<void> {
    console.log("Executing Task ${task.id}");
    // Implementation here
  }
}
`,

  placeholder: (task: Task) => `
/**
 * Task ${task.id}: ${task.description}
 *
 * Part ${task.part}: ${task.partName}
 * Status: ${task.status}
 */

// TODO: Implement Task ${task.id}
// ${task.description}

export const TASK_${task.id}_IMPL = {
  id: ${task.id},
  description: "${task.description.replace(/"/g, '\\"')}",
  status: "${task.status}",
  execute: async () => {
    console.log("Task ${task.id}: ${task.description}");
  },
};
`,
};

// Determine template based on task description
function getTemplate(task: Task): string {
  const desc = task.description.toLowerCase();

  if (desc.includes("schema") || desc.includes("define `") || desc.includes("as `schema")) {
    return templates.schema(task);
  }
  if (desc.includes("service") || desc.includes("servicemap") || desc.includes("convert `")) {
    return templates.service(task);
  }
  if (desc.includes("implement") || desc.includes("create `")) {
    return templates.class(task);
  }
  return templates.placeholder(task);
}

// Generate file path for task
function getFilePath(task: Task): string {
  // Map parts to packages
  const packageMap: Record<number, string> = {
    1: "packages/shared/src", // Effect-TS Foundation
    2: "packages/agent/src/agent-loop", // Real Agent Loop
    3: "packages/browser/src", // Browser Understanding
    4: "packages/agent-memory/src", // Memory & State
    5: "packages/orchestrator/src/testing", // Diff-Aware Planning
    6: "packages/quality/src", // Evaluation & Quality
    7: "packages/a11y/src", // Accessibility
    8: "packages/agent-governance/src", // Safety & Reliability
    9: "packages/orchestrator/src", // CI Mode & Parallel
    10: "packages/session/src", // Session Recording
    11: "packages/agent/src/self-improvement", // Self-Improvement
    12: "apps/cli/src", // TUI State Flow
    13: "packages/mcp/src", // MCP Server
    14: "packages/testing", // Testing Infrastructure
    15: "docs", // Documentation
    16: "packages/enterprise/src", // Enterprise & Security
    17: "packages/performance/src", // Performance & Optimization
    18: "packages/monitoring/src", // Monitoring & Alerting
    19: "packages/deployment/src", // Deployment & Operations
    20: "packages/metrics/src", // Success Metrics
    21: "packages/browser/src/vision", // OSS - Vision-First
    22: "packages/agent/src/speculative", // OSS - Speculative
    23: "packages/agent-watchdogs/src", // OSS - Watchdog
    24: "packages/agent/src/natural-language", // OSS - Natural Language
    25: "packages/agent/src/multi-agent", // OSS - Multi-Agent
    26: "packages/agent/src/self-healing", // OSS - Self-Healing
  };

  const basePath = packageMap[task.part] || "packages/shared/src/tasks";
  return `${basePath}/task-${task.id}.ts`;
}

// Generate all task files
function generateAllTasks(): void {
  let generated = 0;
  let skipped = 0;

  for (const part of tasksDb) {
    for (const task of part.tasks) {
      // Skip completed tasks
      if (task.status === "completed") {
        skipped++;
        continue;
      }

      const filePath = `/home/lpatel/Code/LP-DEV/inspect/${getFilePath(task)}`;
      const content = getTemplate(task);

      // Create directory if needed
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write file only if it doesn't exist
      if (!existsSync(filePath)) {
        writeFileSync(filePath, content);
        generated++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`Generated: ${generated} files`);
  console.log(`Skipped: ${skipped} files (already exist or completed)`);
}

// Generate task index files
function generateIndexFiles(): void {
  for (const part of tasksDb) {
    const pendingTasks = part.tasks.filter((t) => t.status === "pending");

    if (pendingTasks.length === 0) continue;

    const indexPath = `/home/lpatel/Code/LP-DEV/inspect/packages/shared/src/tasks/part-${part.number}-index.ts`;
    const exports = pendingTasks
      .map((t) => `// Task ${t.id}: ${t.description}`)
      .join("\n");

    const content = `/**
 * Part ${part.number}: ${part.name}
 * Tasks: ${part.tasks[0]?.id}-${part.tasks[part.tasks.length - 1]?.id}
 * Pending: ${pendingTasks.length}
 */

${exports}
`;

    writeFileSync(indexPath, content);
  }

  console.log("Generated index files for all parts");
}

// Main execution
console.log("=== Task Generator ===");
console.log(`Total parts: ${tasksDb.length}`);
console.log(
  `Total tasks: ${tasksDb.reduce((sum, p) => sum + p.tasks.length, 0)}`
);
console.log("");

generateAllTasks();
generateIndexFiles();

console.log("\nDone!");
