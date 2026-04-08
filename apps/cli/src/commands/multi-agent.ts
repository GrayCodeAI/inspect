import type { Command } from "commander";
import chalk from "chalk";
import {
  MultiAgentOrchestrator,
  createMultiAgentOrchestrator,
  type Task,
  type AgentCapability,
} from "@inspect/core";

function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface AgentOptions {
  json?: boolean;
}

export function registerMultiAgentCommand(program: Command): void {
  const multiCmd = program
    .command("multi")
    .description("Multi-agent orchestration commands")
    .alias("ma");

  // Initialize orchestrator
  const orchestrator = createMultiAgentOrchestrator({
    maxConcurrentAgents: 5,
    maxQueueSize: 100,
    loadBalancing: true,
    distributionStrategy: "least-loaded",
    aggregateResults: true,
  });

  // List agents
  multiCmd
    .command("agents")
    .description("List all registered agents")
    .option("--json", "Output as JSON")
    .action(async (options: AgentOptions) => {
      console.log(chalk.blue("\n🤖 Multi-Agent Orchestrator\n"));

      const agents = orchestrator.getAgents();

      if (options.json) {
        console.log(JSON.stringify({ agents }, null, 2));
        return;
      }

      if (agents.length === 0) {
        console.log(
          chalk.yellow("No agents registered. Use 'inspect multi register' to add agents."),
        );
        return;
      }

      console.log(chalk.dim(`\n${agents.length} agent(s):\n`));
      for (const agent of agents) {
        const statusColor =
          agent.status === "idle"
            ? chalk.green
            : agent.status === "busy"
              ? chalk.yellow
              : chalk.red;
        console.log(`  ${chalk.cyan(agent.id)} ${statusColor(`[${agent.status}]`)}`);
        console.log(
          `  Capabilities: ${agent.capabilities.map((c: AgentCapability) => c.name).join(", ") || "none"}`,
        );
        console.log(
          `  Tasks: ${chalk.green(agent.completedTasks)} completed, ${chalk.red(agent.failedTasks)} failed`,
        );
        if (agent.currentTask) {
          console.log(`  Current: ${chalk.yellow(agent.currentTask)}`);
        }
        console.log();
      }
    });

  // Register agent
  multiCmd
    .command("register")
    .description("Register a new agent")
    .argument("<id>", "Agent ID")
    .argument("<name>", "Agent name")
    .option("-c, --capability <cap>", "Capability (can be repeated)", [])
    .action(async (id: string, name: string, options: { capability?: string[] }) => {
      console.log(chalk.blue(`\nRegistering agent: ${name}\n`));

      const capabilities: AgentCapability[] = (options.capability || ["ui-testing"]).map((c) => ({
        name: c,
        level: "basic" as const,
      }));

      orchestrator.registerAgent(id, capabilities, { name });

      console.log(chalk.green(`✓ Agent ${id} registered`));
    });

  // Execute task with multi-agent
  multiCmd
    .command("exec")
    .description("Execute a task using multi-agent orchestration")
    .argument("<instruction>", "Test instruction")
    .option("--priority <p>", "Priority (low, medium, high, critical)", "medium")
    .action(async (instruction: string, options: { priority?: string }) => {
      console.log(chalk.blue(`\n🎯 Executing: ${instruction}\n`));

      try {
        const result = await orchestrator.submitTask({
          type: "test",
          priority: (options.priority as Task["priority"]) || "medium",
          data: { instruction },
          requiredCapabilities: ["ui-testing"],
          maxRetries: 2,
          timeout: 60000,
        });

        console.log(chalk.green(`\n✓ Task completed: ${result.status}`));
        if (result.duration) {
          console.log(chalk.dim(`  Duration: ${result.duration}ms`));
        }
        if (result.error) {
          console.log(chalk.red(`  Error: ${result.error}`));
        }
      } catch (error) {
        console.log(chalk.red(`\n✗ Task failed: ${error}`));
      }
    });

  // Show orchestrator stats
  multiCmd
    .command("stats")
    .description("Show orchestrator statistics")
    .option("--json", "Output as JSON")
    .action(async (options: AgentOptions) => {
      const stats = orchestrator.getStats();

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(chalk.blue("\n📊 Orchestrator Statistics\n"));
      console.log(`  Total Agents: ${chalk.green(stats.totalAgents)}`);
      console.log(`  Active: ${stats.activeAgents}, Idle: ${chalk.yellow(stats.idleAgents)}`);
      console.log(`  Queue Size: ${stats.queueSize}`);
      console.log(`  Completed: ${chalk.green(stats.completedTasks)}`);
      console.log(`  Failed: ${chalk.red(stats.failedTasks)}`);
      console.log(`  Avg Duration: ${Math.round(stats.averageTaskDuration)}ms`);
      console.log(`  Throughput: ${stats.throughput.toFixed(1)} tasks/min`);
    });

  // Show queue
  multiCmd
    .command("queue")
    .description("Show task queue")
    .option("--json", "Output as JSON")
    .action(async (options: AgentOptions) => {
      const queue = orchestrator.getQueue();

      if (options.json) {
        console.log(JSON.stringify({ queue }, null, 2));
        return;
      }

      if (queue.length === 0) {
        console.log(chalk.yellow("\nTask queue is empty"));
        return;
      }

      console.log(chalk.blue(`\n📋 Task Queue (${queue.length} tasks)\n`));
      for (const task of queue) {
        const priorityColor =
          task.priority === "critical"
            ? chalk.red
            : task.priority === "high"
              ? chalk.yellow
              : task.priority === "medium"
                ? chalk.blue
                : chalk.dim;
        console.log(`  ${chalk.cyan(task.id)} ${priorityColor(`[${task.priority}]`)} ${task.type}`);
        console.log(chalk.dim(`  Data: ${JSON.stringify(task.data).slice(0, 50)}...`));
        console.log();
      }
    });
}
