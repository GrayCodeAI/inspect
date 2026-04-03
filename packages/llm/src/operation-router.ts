export interface LLMOperation {
  name: "act" | "extract" | "observe" | "plan" | "verify";
  requiredCapabilities: string[];
}

export interface LLMProviderConfig {
  name: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  capabilities: string[];
  costPer1kTokens: number;
}

export class LLMOperationRouter {
  private providers: Map<string, LLMProviderConfig> = new Map();
  private operationMappings: Map<string, string> = new Map();

  registerProvider = (config: LLMProviderConfig): void => {
    this.providers.set(config.name, config);
  };

  selectProvider = (operation: LLMOperation): LLMProviderConfig => {
    const pinnedProvider = this.operationMappings.get(operation.name);
    if (pinnedProvider) {
      const provider = this.providers.get(pinnedProvider);
      if (provider) {
        return provider;
      }
    }

    const eligibleProviders = Array.from(this.providers.values()).filter((provider) =>
      operation.requiredCapabilities.every((capability) =>
        provider.capabilities.includes(capability),
      ),
    );

    if (eligibleProviders.length === 0) {
      throw new Error(`No provider found for operation: ${operation.name}`);
    }

    return eligibleProviders.reduce((cheapest, current) =>
      current.costPer1kTokens < cheapest.costPer1kTokens ? current : cheapest,
    );
  };

  setOperationModel = (
    operation: "act" | "extract" | "observe" | "plan" | "verify",
    providerName: string,
  ): void => {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    this.operationMappings.set(operation, providerName);
  };

  getProviderForOperation = (operation: LLMOperation): LLMProviderConfig => {
    return this.selectProvider(operation);
  };

  getCostEstimate = (
    operation: LLMOperation,
    inputTokens: number,
    outputTokens: number,
  ): number => {
    const provider = this.selectProvider(operation);
    const totalTokens = inputTokens + outputTokens;
    return (totalTokens / 1000) * provider.costPer1kTokens;
  };

  listProviders = (): LLMProviderConfig[] => {
    return Array.from(this.providers.values());
  };

  getFallbackChain = (operation: LLMOperation): LLMProviderConfig[] => {
    const eligibleProviders = Array.from(this.providers.values()).filter((provider) =>
      operation.requiredCapabilities.every((capability) =>
        provider.capabilities.includes(capability),
      ),
    );

    return eligibleProviders.sort(
      (providerA, providerB) => providerA.costPer1kTokens - providerB.costPer1kTokens,
    );
  };
}

export const DEFAULT_ACT_OPERATION: LLMOperation = {
  name: "act",
  requiredCapabilities: ["vision"],
};

export const DEFAULT_EXTRACT_OPERATION: LLMOperation = {
  name: "extract",
  requiredCapabilities: ["structured-output"],
};

export const DEFAULT_OBSERVE_OPERATION: LLMOperation = {
  name: "observe",
  requiredCapabilities: ["vision"],
};

export const DEFAULT_PLAN_OPERATION: LLMOperation = {
  name: "plan",
  requiredCapabilities: ["reasoning"],
};

export const DEFAULT_VERIFY_OPERATION: LLMOperation = {
  name: "verify",
  requiredCapabilities: [],
};
