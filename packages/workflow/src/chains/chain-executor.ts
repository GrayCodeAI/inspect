import type {
  Chain,
  ChainActionStep,
  ChainConditionalStep,
  ChainExecutionResult,
  ChainLoopStep,
  ChainParallelStep,
  ChainStep,
  ChainSubchainStep,
} from "./chain-types.js";

interface MutableChainExecutionContext {
  variables: Record<string, unknown>;
  stepResults: Map<string, unknown>;
  currentStep: number;
}

const createExecutionContext = (inputs: Record<string, unknown>): MutableChainExecutionContext => ({
  variables: { ...inputs },
  stepResults: new Map(),
  currentStep: 0,
});

const resolveVariablePath = (path: string, context: MutableChainExecutionContext): unknown => {
  const parts = path.split(".");
  let current: unknown = context.variables;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
};

export class ChainExecutor {
  execute = async (
    chain: Chain,
    inputs: Record<string, unknown>,
  ): Promise<ChainExecutionResult> => {
    const startTime = performance.now();
    const context = createExecutionContext(inputs);
    const errors: string[] = [];

    try {
      for (let index = 0; index < chain.steps.length; index++) {
        const step = chain.steps[index];
        if (!step) continue;

        const result = await this.executeStep(step, context);
        context.stepResults.set(step.id, result);
        context.currentStep = index + 1;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const outputs: Record<string, unknown> = {};
    for (const output of chain.outputs) {
      outputs[output.name] = resolveVariablePath(output.name, context);
    }

    const executionTime = performance.now() - startTime;

    return {
      success: errors.length === 0,
      outputs,
      executionTime,
      stepCount: context.currentStep,
      errors,
    };
  };

  executeStep = async (
    step: ChainStep,
    context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    switch (step.type) {
      case "action":
        return this.executeActionStep(step as ChainActionStep, context);
      case "conditional":
        return this.executeConditionalStep(step as ChainConditionalStep, context);
      case "loop":
        return this.executeLoopStep(step as ChainLoopStep, context);
      case "subchain":
        return this.executeSubchainStep(step as ChainSubchainStep, context);
      case "parallel":
        return this.executeParallelStep(step as ChainParallelStep, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  };

  executeActionStep = async (
    step: ChainActionStep,
    _context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    return { status: "executed", action: step.action };
  };

  executeConditionalStep = async (
    step: ChainConditionalStep,
    context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    const conditionResult = this.evaluateCondition(step.condition, context);
    const branchToExecute = conditionResult ? step.then : step.else;

    const results: unknown[] = [];
    for (const subStep of branchToExecute) {
      const result = await this.executeStep(subStep, context);
      results.push(result);
    }

    return { conditionResult, results };
  };

  executeLoopStep = async (
    step: ChainLoopStep,
    context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    const results: unknown[] = [];

    if (step.loopType === "while") {
      while (this.evaluateCondition(step.condition, context)) {
        const iterationResults: unknown[] = [];
        for (const subStep of step.body) {
          const result = await this.executeStep(subStep, context);
          iterationResults.push(result);
        }
        results.push(iterationResults);
      }
    } else if (step.loopType === "for-each" && step.items) {
      const itemsValue = resolveVariablePath(step.items, context);
      if (Array.isArray(itemsValue)) {
        for (const item of itemsValue) {
          context.variables["item"] = item;
          const iterationResults: unknown[] = [];
          for (const subStep of step.body) {
            const result = await this.executeStep(subStep, context);
            iterationResults.push(result);
          }
          results.push(iterationResults);
        }
      }
    }

    return { loopType: step.loopType, iterations: results.length, results };
  };

  executeSubchainStep = async (
    _step: ChainSubchainStep,
    _context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    return { status: "subchain-executed" };
  };

  executeParallelStep = async (
    step: ChainParallelStep,
    context: MutableChainExecutionContext,
  ): Promise<unknown> => {
    const branchPromises = step.branches.map(async (branch) => {
      const results: unknown[] = [];
      for (const subStep of branch) {
        const result = await this.executeStep(subStep, context);
        results.push(result);
      }
      return results;
    });

    const branchResults = await Promise.all(branchPromises);
    return { branches: branchResults.length, results: branchResults };
  };

  evaluateCondition = (condition: string, context: MutableChainExecutionContext): boolean => {
    const resolvedCondition = this.resolveVariables(condition, context);

    try {
      const result = Function(`"use strict"; return (${resolvedCondition})`)();
      return Boolean(result);
    } catch {
      return false;
    }
  };

  resolveVariables = (text: string, context: MutableChainExecutionContext): string => {
    const variablePattern = /\{\{(\s*[^}]+\s*)\}\}/g;

    return text.replace(variablePattern, (match, path) => {
      const trimmedPath = path.trim();
      const value = resolveVariablePath(trimmedPath, context);

      if (value === undefined) {
        return match;
      }

      if (typeof value === "string") {
        return value;
      }

      return JSON.stringify(value);
    });
  };
}
