export interface GuardrailCheck {
  name: string;
  passed: boolean;
  reason?: string;
  severity: "warn" | "block";
}

export interface GuardrailContext {
  input: string;
  output?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  sessionId?: string;
}

export interface GuardrailConfig {
  name: string;
  direction: "input" | "output" | "tool";
  checkFn: (context: GuardrailContext) => Promise<GuardrailCheck>;
}

export class GuardrailEngine {
  private guardrails: Map<string, GuardrailConfig> = new Map();

  register = (config: GuardrailConfig): void => {
    this.guardrails.set(config.name, config);
  };

  unregister = (name: string): void => {
    this.guardrails.delete(name);
  };

  checkInput = async (
    input: string,
    sessionId?: string,
  ): Promise<{ blocked: boolean; checks: GuardrailCheck[] }> => {
    const checks: GuardrailCheck[] = [];
    let blocked = false;

    for (const guardrail of this.guardrails.values()) {
      if (guardrail.direction === "input") {
        const check = await guardrail.checkFn({ input, sessionId });
        checks.push(check);
        if (check.severity === "block" && !check.passed) {
          blocked = true;
        }
      }
    }

    return { blocked, checks };
  };

  checkOutput = async (
    output: string,
    sessionId?: string,
  ): Promise<{ blocked: boolean; checks: GuardrailCheck[] }> => {
    const checks: GuardrailCheck[] = [];
    let blocked = false;

    for (const guardrail of this.guardrails.values()) {
      if (guardrail.direction === "output") {
        const check = await guardrail.checkFn({ input: output, output, sessionId });
        checks.push(check);
        if (check.severity === "block" && !check.passed) {
          blocked = true;
        }
      }
    }

    return { blocked, checks };
  };

  checkTool = async (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ blocked: boolean; checks: GuardrailCheck[] }> => {
    const checks: GuardrailCheck[] = [];
    let blocked = false;

    for (const guardrail of this.guardrails.values()) {
      if (guardrail.direction === "tool") {
        const check = await guardrail.checkFn({ input: toolName, toolName, toolArgs: args });
        checks.push(check);
        if (check.severity === "block" && !check.passed) {
          blocked = true;
        }
      }
    }

    return { blocked, checks };
  };

  list = (): GuardrailConfig[] => {
    return Array.from(this.guardrails.values());
  };
}

const DESTRUCTIVE_KEYWORDS = ["delete", "drop", "truncate", "remove", "destroy", "purge", "wipe"];

const destructiveActionGuardrail: GuardrailConfig = {
  name: "destructive-action-blocker",
  direction: "input",
  checkFn: async (context: GuardrailContext): Promise<GuardrailCheck> => {
    const lowerInput = context.input.toLowerCase();
    const foundKeyword = DESTRUCTIVE_KEYWORDS.find((keyword) => lowerInput.includes(keyword));
    return {
      name: "destructive-action-blocker",
      passed: !foundKeyword,
      reason: foundKeyword ? `Destructive keyword detected: ${foundKeyword}` : undefined,
      severity: "block",
    };
  },
};

const API_KEY_PATTERN = /[a-zA-Z0-9]{32,}/;
const PASSWORD_PATTERN = /password[:\s]*["'][^"']+["']/i;
const TOKEN_PATTERN = /token[:\s]*["'][^"']+["']/i;

const credentialLeakGuardrail: GuardrailConfig = {
  name: "credential-leak-detector",
  direction: "output",
  checkFn: async (context: GuardrailContext): Promise<GuardrailCheck> => {
    const output = context.output ?? "";
    const hasApiKey = API_KEY_PATTERN.test(output);
    const hasPassword = PASSWORD_PATTERN.test(output);
    const hasToken = TOKEN_PATTERN.test(output);
    const leaked = hasApiKey || hasPassword || hasToken;

    return {
      name: "credential-leak-detector",
      passed: !leaked,
      reason: leaked ? "Potential credential leak detected in output" : undefined,
      severity: "block",
    };
  },
};

const SUSPICIOUS_PROTOCOLS = ["data:", "javascript:", "file:", "vbscript:"];

const urlSafetyGuardrail: GuardrailConfig = {
  name: "url-safety-check",
  direction: "input",
  checkFn: async (context: GuardrailContext): Promise<GuardrailCheck> => {
    const lowerInput = context.input.toLowerCase();
    const foundProtocol = SUSPICIOUS_PROTOCOLS.find((protocol) => lowerInput.includes(protocol));

    return {
      name: "url-safety-check",
      passed: !foundProtocol,
      reason: foundProtocol ? `Suspicious URL protocol detected: ${foundProtocol}` : undefined,
      severity: "block",
    };
  },
};

const MAX_OUTPUT_LENGTH = 10000;

const outputLengthGuardrail: GuardrailConfig = {
  name: "output-length-limiter",
  direction: "output",
  checkFn: async (context: GuardrailContext): Promise<GuardrailCheck> => {
    const output = context.output ?? "";
    const isTooLong = output.length > MAX_OUTPUT_LENGTH;

    return {
      name: "output-length-limiter",
      passed: !isTooLong,
      reason: isTooLong
        ? `Output exceeds ${MAX_OUTPUT_LENGTH} characters (${output.length})`
        : undefined,
      severity: "warn",
    };
  },
};

const toolArgumentGuardrail: GuardrailConfig = {
  name: "tool-argument-validator",
  direction: "tool",
  checkFn: async (context: GuardrailContext): Promise<GuardrailCheck> => {
    const args = context.toolArgs ?? {};
    const emptyValues = Object.entries(args).filter(
      ([_, value]) => value === undefined || value === null || value === "",
    );

    return {
      name: "tool-argument-validator",
      passed: emptyValues.length === 0,
      reason:
        emptyValues.length > 0
          ? `Empty or null arguments: ${emptyValues.map(([key]) => key).join(", ")}`
          : undefined,
      severity: "warn",
    };
  },
};

export const BUILTIN_GUARDRAILS: GuardrailConfig[] = [
  destructiveActionGuardrail,
  credentialLeakGuardrail,
  urlSafetyGuardrail,
  outputLengthGuardrail,
  toolArgumentGuardrail,
];
