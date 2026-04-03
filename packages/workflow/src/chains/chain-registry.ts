import type { Chain, ChainInput, ChainOutput } from "./chain-types";

interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

export class ChainRegistry {
  private chains: Map<string, Chain> = new Map();
  private persistencePath?: string;

  constructor(options?: { persistencePath?: string }) {
    this.persistencePath = options?.persistencePath;
  }

  register = (chain: Chain): void => {
    const validation = this.validate(chain);
    if (!validation.valid) {
      throw new Error(`Invalid chain: ${validation.errors.join(", ")}`);
    }
    this.chains.set(chain.id, chain);
  };

  unregister = (chainId: string): void => {
    this.chains.delete(chainId);
  };

  get = (chainId: string): Chain | null => {
    return this.chains.get(chainId) ?? null;
  };

  list = (): Chain[] => {
    return Array.from(this.chains.values());
  };

  validate = (chain: Chain): ValidationResult => {
    const errors: string[] = [];

    if (!chain.id || chain.id.trim() === "") {
      errors.push("Chain must have a non-empty id");
    }

    if (!chain.name || chain.name.trim() === "") {
      errors.push("Chain must have a non-empty name");
    }

    if (!Array.isArray(chain.steps)) {
      errors.push("Chain steps must be an array");
    }

    if (!Array.isArray(chain.inputs)) {
      errors.push("Chain inputs must be an array");
    }

    if (!Array.isArray(chain.outputs)) {
      errors.push("Chain outputs must be an array");
    }

    const stepIds = new Set<string>();
    for (const step of chain.steps) {
      if (!step.id || step.id.trim() === "") {
        errors.push("All steps must have a non-empty id");
      } else if (stepIds.has(step.id)) {
        errors.push(`Duplicate step id: ${step.id}`);
      } else {
        stepIds.add(step.id);
      }

      if (!step.name || step.name.trim() === "") {
        errors.push(`Step ${step.id} must have a non-empty name`);
      }

      const validTypes = ["action", "conditional", "loop", "subchain", "parallel"];
      if (!validTypes.includes(step.type)) {
        errors.push(`Step ${step.id} has invalid type: ${step.type}`);
      }
    }

    for (const input of chain.inputs) {
      if (!input.name || input.name.trim() === "") {
        errors.push("All inputs must have a non-empty name");
      }

      const validTypes = ["string", "number", "boolean", "array"];
      if (!validTypes.includes(input.type)) {
        errors.push(`Input ${input.name} has invalid type: ${input.type}`);
      }
    }

    for (const output of chain.outputs) {
      if (!output.name || output.name.trim() === "") {
        errors.push("All outputs must have a non-empty name");
      }

      const validTypes = ["string", "number", "boolean", "array", "object"];
      if (!validTypes.includes(output.type)) {
        errors.push(`Output ${output.name} has invalid type: ${output.type}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  getInputs = (chainId: string): ChainInput[] => {
    const chain = this.chains.get(chainId);
    return chain?.inputs ?? [];
  };

  getOutputs = (chainId: string): ChainOutput[] => {
    const chain = this.chains.get(chainId);
    return chain?.outputs ?? [];
  };

  clear = (): void => {
    this.chains.clear();
  };

  size = (): number => {
    return this.chains.size;
  };
}
