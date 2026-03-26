// ============================================================================
// YAML Test Generator - Natural Language to YAML
// ============================================================================

import type { TestDefinition, YAMLStep, YAMLStepType } from "./parser.js";

/** LLM interface for generating YAML from natural language */
export interface LLMProvider {
  /** Send a prompt and get a response */
  complete(prompt: string): Promise<string>;
}

/** Generator options */
export interface GeneratorOptions {
  /** Base URL to use in generated tests */
  baseUrl?: string;
  /** Default viewport */
  viewport?: { width: number; height: number };
  /** Whether to include a11y checks */
  includeA11y?: boolean;
  /** Whether to include screenshot steps */
  includeScreenshots?: boolean;
  /** Maximum steps to generate */
  maxSteps?: number;
}

const SYSTEM_PROMPT = `You are an expert at writing browser test definitions in YAML format.
Given a natural language instruction, generate a YAML test definition with the following structure:

name: <test name>
description: <what the test does>
baseUrl: <base URL>
steps:
  - action: <action type>
    selector: <CSS selector>
    value: <value>
    description: <step description>

Supported actions:
- navigate: Go to a URL (value: URL)
- click: Click an element (selector: CSS selector)
- type: Type text into an input (selector: CSS selector, value: text to type)
- select: Select an option (selector: CSS selector, value: option value)
- hover: Hover over an element (selector: CSS selector)
- press: Press a keyboard key (key: key name)
- scroll: Scroll the page (direction: up/down/left/right, amount: pixels)
- wait: Wait for a duration (timeout: milliseconds)
- screenshot: Take a screenshot (path: file path, fullPage: true/false)
- assertVisible: Assert element is visible (selector: CSS selector)
- assertHidden: Assert element is hidden (selector: CSS selector)
- assertText: Assert text content (selector: CSS selector, text: expected text)
- assertUrl: Assert current URL (url: expected URL or pattern)
- assertTitle: Assert page title (text: expected title)
- assertValue: Assert input value (selector: CSS selector, value: expected value)
- a11y: Run accessibility audit (standard: wcag2aa)

Return ONLY the YAML content, no markdown fences or explanation.`;

/**
 * YAMLGenerator uses an LLM to convert natural language test
 * instructions into structured YAML test definitions.
 */
export class YAMLGenerator {
  /**
   * Generate a YAML test definition from a natural language instruction.
   */
  async generate(
    instruction: string,
    llm: LLMProvider,
    options: GeneratorOptions = {},
  ): Promise<TestDefinition> {
    const prompt = this.buildPrompt(instruction, options);
    const response = await llm.complete(prompt);

    // Parse the YAML response
    const yamlContent = this.cleanResponse(response);
    const definition = this.parseGeneratedYAML(yamlContent, options);

    // Validate and enhance
    return this.enhance(definition, options);
  }

  /**
   * Generate YAML text (string) without parsing.
   */
  async generateYAML(
    instruction: string,
    llm: LLMProvider,
    options: GeneratorOptions = {},
  ): Promise<string> {
    const prompt = this.buildPrompt(instruction, options);
    const response = await llm.complete(prompt);
    return this.cleanResponse(response);
  }

  /**
   * Generate a test from a structured scenario description.
   */
  generateFromScenario(scenario: {
    name: string;
    description?: string;
    url: string;
    steps: Array<{
      action: string;
      target?: string;
      value?: string;
      assertion?: string;
    }>;
  }): TestDefinition {
    const steps: YAMLStep[] = [];

    // Navigate to URL
    steps.push({
      action: "navigate",
      value: scenario.url,
      description: `Navigate to ${scenario.url}`,
    });

    for (const step of scenario.steps) {
      const yamlStep: YAMLStep = {
        action: this.mapAction(step.action),
        selector: step.target,
        value: step.value,
        description: `${step.action}${step.target ? ` on ${step.target}` : ""}${step.value ? ` with "${step.value}"` : ""}`,
      };

      steps.push(yamlStep);

      // Add assertion if provided
      if (step.assertion) {
        steps.push(this.parseAssertion(step.assertion));
      }
    }

    return {
      name: scenario.name,
      description: scenario.description,
      steps,
    };
  }

  /**
   * Build the LLM prompt.
   */
  private buildPrompt(instruction: string, options: GeneratorOptions): string {
    let prompt = SYSTEM_PROMPT + "\n\n";

    if (options.baseUrl) {
      prompt += `Base URL: ${options.baseUrl}\n`;
    }
    if (options.viewport) {
      prompt += `Viewport: ${options.viewport.width}x${options.viewport.height}\n`;
    }
    if (options.includeA11y) {
      prompt += `Include an a11y audit step after critical page loads.\n`;
    }
    if (options.includeScreenshots) {
      prompt += `Include screenshot steps after important actions.\n`;
    }
    if (options.maxSteps) {
      prompt += `Maximum ${options.maxSteps} steps.\n`;
    }

    prompt += `\nInstruction: ${instruction}\n\nGenerate the YAML:`;

    return prompt;
  }

  /**
   * Clean the LLM response to extract YAML content.
   */
  private cleanResponse(response: string): string {
    let cleaned = response.trim();

    // Remove markdown code fences
    if (cleaned.startsWith("```yaml")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  /**
   * Parse generated YAML into a TestDefinition.
   */
  private parseGeneratedYAML(yaml: string, options: GeneratorOptions): TestDefinition {
    // Simple YAML parsing for generated content
    const lines = yaml.split("\n");
    let name = "Generated Test";
    let description: string | undefined;
    let baseUrl = options.baseUrl;
    const steps: YAMLStep[] = [];
    let currentStep: Partial<YAMLStep> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (trimmed.startsWith("name:")) {
        name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("description:")) {
        description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("baseUrl:") || trimmed.startsWith("base_url:")) {
        baseUrl = trimmed.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("- action:") || trimmed.startsWith("- type:")) {
        if (currentStep?.action) {
          steps.push(currentStep as YAMLStep);
        }
        const actionValue = trimmed.replace(/^- (action|type):/, "").trim().replace(/^["']|["']$/g, "");
        currentStep = { action: actionValue as YAMLStepType };
      } else if (currentStep && trimmed.startsWith("selector:")) {
        currentStep.selector = trimmed.slice(9).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("value:")) {
        currentStep.value = trimmed.slice(6).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("text:")) {
        currentStep.text = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("url:")) {
        currentStep.url = trimmed.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("description:")) {
        currentStep.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("key:")) {
        currentStep.key = trimmed.slice(4).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("timeout:")) {
        currentStep.timeout = parseInt(trimmed.slice(8).trim(), 10);
      } else if (currentStep && trimmed.startsWith("fullPage:")) {
        currentStep.fullPage = trimmed.slice(9).trim() === "true";
      } else if (currentStep && trimmed.startsWith("standard:")) {
        currentStep.standard = trimmed.slice(9).trim().replace(/^["']|["']$/g, "");
      } else if (currentStep && trimmed.startsWith("path:")) {
        currentStep.path = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      }
    }

    if (currentStep?.action) {
      steps.push(currentStep as YAMLStep);
    }

    return { name, description, baseUrl, steps };
  }

  /**
   * Enhance the generated test definition with defaults and best practices.
   */
  private enhance(definition: TestDefinition, options: GeneratorOptions): TestDefinition {
    const enhanced = { ...definition };

    // Add viewport if specified
    if (options.viewport) {
      enhanced.viewport = options.viewport;
    }

    // Add a11y check after page loads if requested
    if (options.includeA11y) {
      const enhancedSteps: YAMLStep[] = [];
      for (const step of enhanced.steps) {
        enhancedSteps.push(step);
        if (step.action === "navigate") {
          enhancedSteps.push({
            action: "a11y",
            standard: "wcag2aa",
            description: "Run accessibility audit",
          });
        }
      }
      enhanced.steps = enhancedSteps;
    }

    // Add screenshots if requested
    if (options.includeScreenshots) {
      const enhancedSteps: YAMLStep[] = [];
      for (const step of enhanced.steps) {
        enhancedSteps.push(step);
        if (["navigate", "click", "type"].includes(step.action)) {
          enhancedSteps.push({
            action: "screenshot",
            description: `Screenshot after ${step.action}`,
          });
        }
      }
      enhanced.steps = enhancedSteps;
    }

    return enhanced;
  }

  /**
   * Map natural language action to YAML step type.
   */
  private mapAction(action: string): YAMLStepType {
    const lower = action.toLowerCase();
    const actionMap: Record<string, YAMLStepType> = {
      click: "click",
      tap: "click",
      type: "type",
      enter: "type",
      fill: "type",
      input: "type",
      select: "select",
      choose: "select",
      hover: "hover",
      scroll: "scroll",
      wait: "wait",
      navigate: "navigate",
      goto: "navigate",
      go: "navigate",
      visit: "navigate",
      screenshot: "screenshot",
      capture: "screenshot",
      press: "press",
      assert: "assertVisible",
      check: "assertVisible",
      verify: "assertVisible",
    };

    return actionMap[lower] ?? "click";
  }

  /**
   * Parse a natural language assertion into a YAML step.
   */
  private parseAssertion(assertion: string): YAMLStep {
    const lower = assertion.toLowerCase();

    if (lower.includes("visible") || lower.includes("see") || lower.includes("exists")) {
      return {
        action: "assertVisible",
        selector: this.extractSelector(assertion),
        description: assertion,
      };
    }

    if (lower.includes("hidden") || lower.includes("not visible") || lower.includes("disappear")) {
      return {
        action: "assertHidden",
        selector: this.extractSelector(assertion),
        description: assertion,
      };
    }

    if (lower.includes("text") || lower.includes("contain") || lower.includes("says")) {
      return {
        action: "assertText",
        selector: this.extractSelector(assertion),
        text: this.extractQuoted(assertion),
        description: assertion,
      };
    }

    if (lower.includes("url") || lower.includes("page") || lower.includes("redirect")) {
      return {
        action: "assertUrl",
        url: this.extractQuoted(assertion) ?? "",
        description: assertion,
      };
    }

    return {
      action: "assertVisible",
      description: assertion,
    };
  }

  private extractSelector(text: string): string {
    const match = text.match(/"([^"]+)"|'([^']+)'|`([^`]+)`/);
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  }

  private extractQuoted(text: string): string {
    const match = text.match(/"([^"]+)"|'([^']+)'/);
    return match?.[1] ?? match?.[2] ?? "";
  }
}
