/**
 * Natural Language Test API
 *
 * Simple API like inspect.natural("Login") for natural language testing.
 * Inspired by Shortest's approach.
 */

import type { Page, Browser } from "playwright";

export interface NaturalTestConfig {
  /** LLM provider */
  llmProvider: LLMProvider;
  /** Model to use */
  model: string;
  /** Maximum steps */
  maxSteps: number;
  /** Timeout per step */
  stepTimeout: number;
  /** Enable auto-healing */
  autoHeal: boolean;
  /** Enable caching */
  enableCache: boolean;
  /** Callback on step complete */
  onStep?: (step: StepResult) => void;
  /** Callback on assertion fail */
  onAssertionFail?: (assertion: string, reason: string) => void;
}

export interface LLMProvider {
  complete(prompt: string, options: { model: string; temperature: number }): Promise<string>;
}

export interface StepResult {
  step: number;
  action: string;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
  screenshot?: string;
}

export interface NaturalTestResult {
  success: boolean;
  steps: StepResult[];
  duration: number;
  extractedContent: string;
  finalUrl: string;
}

/**
 * Natural Language Test Runner
 *
 * Usage:
 * ```typescript
 * const inspect = new NaturalTestRunner(config);
 * await inspect.natural("Login with username 'admin' and password 'secret'");
 * await inspect.natural("Verify the dashboard is visible");
 * ```
 */
export class NaturalTestRunner {
  private config: NaturalTestConfig;
  private stepHistory: StepResult[] = [];

  constructor(config: Partial<NaturalTestConfig> = {}) {
    this.config = {
      llmProvider: config.llmProvider || this.createDefaultProvider(),
      model: config.model || "claude-sonnet-4-6",
      maxSteps: config.maxSteps || 20,
      stepTimeout: config.stepTimeout || 30000,
      autoHeal: config.autoHeal ?? true,
      enableCache: config.enableCache ?? true,
      onStep: config.onStep,
      onAssertionFail: config.onAssertionFail,
    };
  }

  /**
   * Execute natural language instruction
   */
  async natural(
    page: Page,
    instruction: string,
    options: {
      variables?: Record<string, string>;
      assertions?: string[];
    } = {}
  ): Promise<NaturalTestResult> {
    const startTime = Date.now();
    console.log(`📝 ${instruction}`);

    // Substitute variables
    const processedInstruction = this.substituteVariables(
      instruction,
      options.variables || {}
    );

    // Generate plan from instruction
    const plan = await this.generatePlan(processedInstruction);

    // Execute plan
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const result = await this.executeStep(page, step);
      this.stepHistory.push(result);
      this.config.onStep?.(result);

      if (!result.success && this.config.autoHeal) {
        // Try to heal
        const healed = await this.healStep(page, step, result.error);
        if (healed) {
          result.success = true;
          result.error = undefined;
        }
      }

      if (!result.success) {
        return {
          success: false,
          steps: this.stepHistory,
          duration: Date.now() - startTime,
          extractedContent: "",
          finalUrl: page.url(),
        };
      }

      // Check assertions
      if (options.assertions) {
        for (const assertion of options.assertions) {
          const passed = await this.checkAssertion(page, assertion);
          if (!passed) {
            this.config.onAssertionFail?.(assertion, "Assertion failed");
            return {
              success: false,
              steps: this.stepHistory,
              duration: Date.now() - startTime,
              extractedContent: "",
              finalUrl: page.url(),
            };
          }
        }
      }
    }

    // Extract final content if needed
    const extractedContent = await this.extractContent(page, processedInstruction);

    return {
      success: true,
      steps: this.stepHistory,
      duration: Date.now() - startTime,
      extractedContent,
      finalUrl: page.url(),
    };
  }

  /**
   * Substitute variables in instruction
   */
  private substituteVariables(
    instruction: string,
    variables: Record<string, string>
  ): string {
    let result = instruction;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
      result = result.replace(new RegExp(`\\$${key}`, "g"), value);
    }
    return result;
  }

  /**
   * Generate plan from natural language instruction
   */
  private async generatePlan(
    instruction: string
  ): Promise<Array<{ action: string; params: Record<string, unknown> }>> {
    const prompt = `
Convert the following instruction into a list of browser automation steps.

Instruction: "${instruction}"

Available actions:
- navigate(url): Navigate to URL
- click(selector): Click element (use text content, aria-label, or test id)
- type(selector, text): Type text into input
- select(selector, value): Select dropdown option
- scroll(direction): Scroll up/down/left/right
- wait(ms): Wait for milliseconds
- extract(selector): Extract text from element
- assert(condition): Assert condition is true

Respond in JSON format:
[
  {"action": "action_name", "params": {"param1": "value1"}},
  ...
]

Steps:
`;

    const response = await this.config.llmProvider.complete(prompt, {
      model: this.config.model,
      temperature: 0.1,
    });

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback to simple parsing
      console.warn("Failed to parse LLM response as JSON");
    }

    // Simple fallback parsing
    return this.parseInstructionFallback(instruction);
  }

  /**
   * Fallback parsing for simple instructions
   */
  private parseInstructionFallback(
    instruction: string
  ): Array<{ action: string; params: Record<string, unknown> }> {
    const steps: Array<{ action: string; params: Record<string, unknown> }> = [];
    const lower = instruction.toLowerCase();

    // Navigate patterns
    if (lower.includes("go to ") || lower.includes("navigate to ")) {
      const urlMatch = instruction.match(/(?:go to|navigate to)\s+(.+)/i);
      if (urlMatch) {
        steps.push({ action: "navigate", params: { url: urlMatch[1].trim() } });
      }
    }

    // Click patterns
    if (lower.includes("click ")) {
      const clickMatch = instruction.match(/click\s+(?:on\s+)?(?:the\s+)?(.+)/i);
      if (clickMatch) {
        steps.push({ action: "click", params: { selector: clickMatch[1].trim() } });
      }
    }

    // Type patterns
    if (lower.includes("type ") || lower.includes("enter ")) {
      const typeMatch = instruction.match(/(?:type|enter)\s+["']?([^"']+)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+))?/i);
      if (typeMatch) {
        steps.push({
          action: "type",
          params: {
            text: typeMatch[1],
            selector: typeMatch[2] || "input",
          },
        });
      }
    }

    // Wait patterns
    if (lower.includes("wait ")) {
      const waitMatch = instruction.match(/wait\s+(?:for\s+)?(\d+)\s*(?:ms|seconds?)?/i);
      if (waitMatch) {
        const ms = parseInt(waitMatch[1]) * (lower.includes("second") ? 1000 : 1);
        steps.push({ action: "wait", params: { ms } });
      }
    }

    return steps;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    page: Page,
    step: { action: string; params: Record<string, unknown> }
  ): Promise<StepResult> {
    const stepNum = this.stepHistory.length + 1;

    try {
      switch (step.action) {
        case "navigate":
          await page.goto(step.params.url as string, { waitUntil: "networkidle" });
          break;

        case "click":
          const clickSelector = this.buildSelector(step.params.selector as string);
          await page.click(clickSelector);
          break;

        case "type":
          const typeSelector = this.buildSelector(step.params.selector as string);
          await page.fill(typeSelector, step.params.text as string);
          break;

        case "select":
          const selectSelector = this.buildSelector(step.params.selector as string);
          await page.selectOption(selectSelector, step.params.value as string);
          break;

        case "scroll":
          const direction = step.params.direction as string;
          const y = direction === "up" ? -500 : direction === "down" ? 500 : 0;
          await page.evaluate((y) => window.scrollBy(0, y), y);
          break;

        case "wait":
          await page.waitForTimeout(step.params.ms as number);
          break;

        case "extract":
          // Extraction happens at end
          break;

        case "assert":
          // Handled separately
          break;

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      return {
        step: stepNum,
        action: step.action,
        params: step.params,
        success: true,
      };
    } catch (error) {
      return {
        step: stepNum,
        action: step.action,
        params: step.params,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build Playwright selector from description
   */
  private buildSelector(description: string): string {
    // Check if already a valid selector
    if (
      description.startsWith("#") ||
      description.startsWith(".") ||
      description.startsWith("[") ||
      description.startsWith("//")
    ) {
      return description;
    }

    // Try text-based selectors
    return `text=${description}`;
  }

  /**
   * Heal a failed step
   */
  private async healStep(
    page: Page,
    step: { action: string; params: Record<string, unknown> },
    error?: string
  ): Promise<boolean> {
    console.log(`Healing step: ${step.action}`, error);

    // Simple healing strategies
    try {
      // Wait a bit
      await page.waitForTimeout(1000);

      // Retry
      await this.executeStep(page, step);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check assertion
   */
  private async checkAssertion(page: Page, assertion: string): Promise<boolean> {
    const lower = assertion.toLowerCase();

    if (lower.includes("url contains")) {
      const match = assertion.match(/url contains["']?([^"']+)["']?/i);
      if (match) {
        const url = page.url();
        return url.includes(match[1]);
      }
    }

    if (lower.includes("visible") || lower.includes("exists")) {
      const selector = this.extractSelector(assertion);
      if (selector) {
        return page.isVisible(selector).catch(() => false);
      }
    }

    if (lower.includes("text contains")) {
      const match = assertion.match(/text contains["']?([^"']+)["']?/i);
      if (match) {
        const content = await page.content();
        return content.includes(match[1]);
      }
    }

    return false;
  }

  /**
   * Extract selector from text
   */
  private extractSelector(text: string): string | null {
    const patterns = [
      /["']([^"']+)["']\s+(?:is\s+)?visible/i,
      /(?:element|selector)\s+["']([^"']+)["']/i,
      /see\s+["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract content based on instruction
   */
  private async extractContent(
    page: Page,
    instruction: string
  ): Promise<string> {
    if (instruction.toLowerCase().includes("extract")) {
      // Extract all visible text
      return page.evaluate(() => document.body.innerText.slice(0, 5000));
    }
    return "";
  }

  /**
   * Create default LLM provider
   */
  private createDefaultProvider(): LLMProvider {
    return {
      complete: async () => "[]",
    };
  }
}

/**
 * Quick test function
 */
export async function natural(
  page: Page,
  instruction: string,
  config?: Partial<NaturalTestConfig>
): Promise<NaturalTestResult> {
  const runner = new NaturalTestRunner(config);
  return runner.natural(page, instruction);
}
