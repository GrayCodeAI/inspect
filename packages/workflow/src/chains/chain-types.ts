export interface TestAction {
  readonly type: string;
  readonly selector?: string;
  readonly value?: string;
  readonly options?: Record<string, unknown>;
}

export interface ChainStep {
  readonly id: string;
  readonly name: string;
  readonly type: "action" | "conditional" | "loop" | "subchain" | "parallel";
  readonly config: Record<string, unknown>;
}

export interface ChainActionStep extends ChainStep {
  readonly type: "action";
  readonly action: TestAction;
}

export interface ChainConditionalStep extends ChainStep {
  readonly type: "conditional";
  readonly condition: string;
  readonly then: ChainStep[];
  readonly else: ChainStep[];
}

export interface ChainLoopStep extends ChainStep {
  readonly type: "loop";
  readonly loopType: "while" | "for-each";
  readonly condition: string;
  readonly items?: string;
  readonly body: ChainStep[];
}

export interface ChainSubchainStep extends ChainStep {
  readonly type: "subchain";
  readonly chainId: string;
  readonly inputs: Record<string, unknown>;
}

export interface ChainParallelStep extends ChainStep {
  readonly type: "parallel";
  readonly branches: ChainStep[][];
}

export interface ChainInput {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "array";
  readonly required: boolean;
  readonly default?: unknown;
}

export interface ChainOutput {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "array" | "object";
}

export interface Chain {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: ChainStep[];
  readonly inputs: ChainInput[];
  readonly outputs: ChainOutput[];
}

export interface ChainExecutionContext {
  readonly variables: Record<string, unknown>;
  readonly stepResults: Map<string, unknown>;
  readonly currentStep: number;
}

export interface ChainExecutionResult {
  readonly success: boolean;
  readonly outputs: Record<string, unknown>;
  readonly executionTime: number;
  readonly stepCount: number;
  readonly errors: string[];
}
