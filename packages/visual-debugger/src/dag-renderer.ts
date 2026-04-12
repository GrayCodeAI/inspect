import { Effect, Layer, ServiceMap } from "effect";
import { DagRenderError } from "./errors.js";
import type { DagGraph, StepId } from "./dag-builder.js";

export interface DagRenderOptions {
  readonly showDependencies: boolean;
  readonly showStepTypes: boolean;
  readonly showConfig: boolean;
  readonly maxWidth: number;
}

const DEFAULT_RENDER_OPTIONS: DagRenderOptions = {
  showDependencies: true,
  showStepTypes: true,
  showConfig: false,
  maxWidth: 80,
};

export class DagRenderer extends ServiceMap.Service<DagRenderer>()("@visual-debugger/DagRenderer", {
  make: Effect.gen(function* () {
    const renderAscii = Effect.fn("DagRenderer.renderAscii")(function* (
      dag: DagGraph,
      options?: Partial<DagRenderOptions>,
    ) {
      return yield* Effect.try({
        try: () => {
          const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
          return renderDagAscii(dag, opts);
        },
        catch: (cause) =>
          new DagRenderError({
            format: "ascii",
            cause,
          }),
      });
    });

    const renderMarkdown = Effect.fn("DagRenderer.renderMarkdown")(function* (dag: DagGraph) {
      return yield* Effect.try({
        try: () => renderDagMarkdown(dag),
        catch: (cause) =>
          new DagRenderError({
            format: "markdown",
            cause,
          }),
      });
    });

    const renderMermaid = Effect.fn("DagRenderer.renderMermaid")(function* (dag: DagGraph) {
      return yield* Effect.try({
        try: () => renderDagMermaid(dag),
        catch: (cause) =>
          new DagRenderError({
            format: "mermaid",
            cause,
          }),
      });
    });

    return { renderAscii, renderMarkdown, renderMermaid } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}

function renderDagAscii(dag: DagGraph, options: DagRenderOptions): string {
  const lines: string[] = [];
  const indent = "  ";

  lines.push(`DAG: ${dag.name} (${dag.id})`);
  lines.push("=".repeat(Math.min(dag.name.length + dag.id.length + 7, options.maxWidth)));
  lines.push("");

  const stepMap = new Map(dag.steps.map((s) => [s.id, s]));
  const visited = new Set<StepId>();

  const renderStep = (stepId: StepId, depth: number) => {
    if (visited.has(stepId)) return;
    visited.add(stepId);

    const step = stepMap.get(stepId);
    if (!step) return;

    const prefix = indent.repeat(Math.min(depth, 3));
    const connector = depth > 0 ? "+- " : "";

    let stepLine = `${prefix}${connector}[${step.id}] ${step.name}`;

    if (options.showStepTypes) {
      stepLine += ` (${step.type})`;
    }

    lines.push(stepLine);

    if (options.showConfig && Object.keys(step.config).length > 0) {
      for (const [key, value] of Object.entries(step.config)) {
        lines.push(`${prefix}    ${key}: ${value}`);
      }
    }

    if (options.showDependencies) {
      const dependents = dag.steps.filter((s) => s.dependencies.includes(stepId));

      for (const dependent of dependents) {
        renderStep(dependent.id, depth + 1);
      }
    }
  };

  const rootSteps = dag.steps.filter((s) => s.dependencies.length === 0);
  for (const root of rootSteps) {
    renderStep(root.id, 0);
  }

  const nonRootNoVisited = dag.steps.filter((s) => !visited.has(s.id));
  for (const step of nonRootNoVisited) {
    renderStep(step.id, 0);
  }

  return lines.join("\n");
}

function renderDagMarkdown(dag: DagGraph): string {
  const lines: string[] = [];

  lines.push(`# ${dag.name}`);
  lines.push("");
  lines.push(`**ID:** ${dag.id}`);
  lines.push(`**Steps:** ${dag.steps.length}`);
  lines.push("");

  lines.push("## Steps");
  lines.push("");

  for (const step of dag.steps) {
    lines.push(`### ${step.id}`);
    lines.push("");
    lines.push(`- **Name:** ${step.name}`);
    lines.push(`- **Type:** ${step.type}`);
    lines.push(
      `- **Dependencies:** ${step.dependencies.length > 0 ? step.dependencies.join(", ") : "none"}`,
    );

    if (Object.keys(step.config).length > 0) {
      lines.push("- **Config:**");
      for (const [key, value] of Object.entries(step.config)) {
        lines.push(`  - \`${key}\`: \`${value}\``);
      }
    }

    lines.push("");
  }

  lines.push("## Dependencies");
  lines.push("");
  lines.push("```");

  for (const edge of dag.edges) {
    lines.push(`${edge.from} --> ${edge.to}`);
  }

  lines.push("```");

  return lines.join("\n");
}

function renderDagMermaid(dag: DagGraph): string {
  const lines: string[] = [];

  lines.push("graph TD");
  lines.push(`    ${dag.id}["${dag.name}"]`);

  for (const step of dag.steps) {
    lines.push(`    ${step.id.replace(/[^a-zA-Z0-9_]/g, "_")}["${step.name}"]`);
  }

  for (const edge of dag.edges) {
    const fromId = edge.from.replace(/[^a-zA-Z0-9_]/g, "_");
    const toId = edge.to.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`    ${fromId} --> ${toId}`);
  }

  return lines.join("\n");
}
