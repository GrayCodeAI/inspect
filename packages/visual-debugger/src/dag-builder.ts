import { Effect, Layer, Schema, ServiceMap } from "effect";
import { DagParseError } from "./errors.js";

export type StepId = string & { readonly __brand: "StepId" };

export interface DagStep {
  readonly id: StepId;
  readonly name: string;
  readonly type: string;
  readonly dependencies: readonly StepId[];
  readonly config: Record<string, string>;
}

export interface DagGraph {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly DagStep[];
  readonly edges: readonly { readonly from: StepId; readonly to: StepId }[];
}

export class DagBuilder extends ServiceMap.Service<DagBuilder>()(
  "@visual-debugger/DagBuilder",
  {
    make: Effect.gen(function* () {
      const buildFromYaml = Effect.fn("DagBuilder.buildFromYaml")(
        function* (yamlContent: string) {
          return yield* Effect.try({
            try: () => parseYamlToDag(yamlContent),
            catch: (cause) =>
              new DagParseError({
                source: "yaml",
                cause,
              }),
          });
        },
      );

      const buildFromJson = Effect.fn("DagBuilder.buildFromJson")(
        function* (jsonContent: string) {
          return yield* Effect.try({
            try: () => {
              const parsed = JSON.parse(jsonContent) as {
                id: string;
                name: string;
                steps: Array<{
                  id: string;
                  name: string;
                  type: string;
                  dependencies?: string[];
                  config?: Record<string, string>;
                }>;
              };

              const steps: DagStep[] = parsed.steps.map((step) => ({
                id: step.id as StepId,
                name: step.name,
                type: step.type,
                dependencies: (step.dependencies ?? []) as StepId[],
                config: step.config ?? {},
              }));

              const edges: Array<{ from: StepId; to: StepId }> = [];
              for (const step of steps) {
                for (const dep of step.dependencies) {
                  edges.push({ from: dep, to: step.id });
                }
              }

              return {
                id: parsed.id,
                name: parsed.name,
                steps,
                edges,
              } satisfies DagGraph;
            },
            catch: (cause) =>
              new DagParseError({
                source: "json",
                cause,
              }),
          });
        },
      );

      const validate = Effect.fn("DagBuilder.validate")(
        function* (dag: DagGraph) {
          const errors: string[] = [];

          const stepIds = new Set(dag.steps.map((s) => s.id));
          for (const step of dag.steps) {
            for (const dep of step.dependencies) {
              if (!stepIds.has(dep)) {
                errors.push(`Step "${step.id}" depends on non-existent step "${dep}"`);
              }
            }
          }

          if (hasCycle(dag)) {
            errors.push("DAG contains cycles, which is not allowed");
          }

          if (errors.length > 0) {
            return yield* new DagParseError({
              source: "validation",
              cause: errors.join("; "),
            });
          }

          return yield* Effect.succeed(dag);
        },
      );

      const getExecutionOrder = Effect.fn("DagBuilder.getExecutionOrder")(
        function* (dag: DagGraph) {
          const order: StepId[] = [];
          const visited = new Set<StepId>();
          const tempVisited = new Set<StepId>();

          const visit = (stepId: StepId) => {
            if (tempVisited.has(stepId)) return;
            if (visited.has(stepId)) return;

            tempVisited.add(stepId);

            const step = dag.steps.find((s) => s.id === stepId);
            if (step) {
              for (const dep of step.dependencies) {
                visit(dep);
              }
            }

            tempVisited.delete(stepId);
            visited.add(stepId);
            order.push(stepId);
          };

          for (const step of dag.steps) {
            visit(step.id);
          }

          return order;
        },
      );

      const getRootSteps = Effect.fn("DagBuilder.getRootSteps")(function* (dag: DagGraph) {
        return dag.steps.filter((step) => step.dependencies.length === 0);
      });

      const getLeafSteps = Effect.fn("DagBuilder.getLeafSteps")(function* (dag: DagGraph) {
        const stepIds = new Set(dag.steps.map((s) => s.id));
        const hasDependents = new Set<StepId>();

        for (const step of dag.steps) {
          for (const dep of step.dependencies) {
            hasDependents.add(dep);
          }
        }

        return dag.steps.filter((step) => !hasDependents.has(step.id));
      });

      return {
        buildFromYaml,
        buildFromJson,
        validate,
        getExecutionOrder,
        getRootSteps,
        getLeafSteps,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}

function parseYamlToDag(yamlContent: string): DagGraph {
  const lines = yamlContent.split("\n").filter((line) => line.trim());

  let id = "workflow";
  let name = "Workflow";
  const steps: DagStep[] = [];

  let currentStep: { id?: StepId; name?: string; type?: string; dependencies?: StepId[]; config?: Record<string, string> } = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("id:")) {
      id = trimmed.replace("id:", "").trim();
    } else if (trimmed.startsWith("name:")) {
      name = trimmed.replace("name:", "").trim();
    } else if (trimmed.startsWith("- id:")) {
      if (currentStep.id) {
        steps.push({
          id: currentStep.id,
          name: currentStep.name ?? currentStep.id,
          type: currentStep.type ?? "unknown",
          dependencies: currentStep.dependencies ?? [],
          config: currentStep.config ?? {},
        });
      }
      currentStep = { id: trimmed.replace("- id:", "").trim() as StepId };
    } else if (trimmed.startsWith("name:") && currentStep.id) {
      currentStep.name = trimmed.replace("name:", "").trim();
    } else if (trimmed.startsWith("type:") && currentStep.id) {
      currentStep.type = trimmed.replace("type:", "").trim();
    } else if (trimmed.startsWith("dependencies:") && currentStep.id) {
      const deps = trimmed
        .replace("dependencies:", "")
        .trim()
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean) as StepId[];
      currentStep.dependencies = deps;
    }
  }

  if (currentStep.id) {
    steps.push({
      id: currentStep.id,
      name: currentStep.name ?? currentStep.id,
      type: currentStep.type ?? "unknown",
      dependencies: currentStep.dependencies ?? [],
      config: currentStep.config ?? {},
    });
  }

  const edges: Array<{ from: StepId; to: StepId }> = [];
  for (const step of steps) {
    for (const dep of step.dependencies) {
      edges.push({ from: dep, to: step.id });
    }
  }

  return { id, name, steps, edges };
}

function hasCycle(dag: DagGraph): boolean {
  const visited = new Set<StepId>();
  const recursionStack = new Set<StepId>();

  const dfs = (stepId: StepId): boolean => {
    if (recursionStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    recursionStack.add(stepId);

    const step = dag.steps.find((s) => s.id === stepId);
    if (step) {
      for (const dep of step.dependencies) {
        if (dfs(dep)) return true;
      }
    }

    recursionStack.delete(stepId);
    return false;
  };

  for (const step of dag.steps) {
    if (dfs(step.id)) return true;
  }

  return false;
}
