import type { Page } from "playwright";
import { Schema } from "effect";

type LLMMessageContent = string | Array<{ type: string; image_url: { url: string } }>;

export class VisualAssertionTimeoutError extends Schema.ErrorClass<VisualAssertionTimeoutError>(
  "VisualAssertionTimeoutError",
)({
  _tag: Schema.tag("VisualAssertionTimeoutError"),
  description: Schema.String,
  timeout: Schema.Number,
}) {
  message = `Visual assertion timed out after ${this.timeout}ms: ${this.description}`;
}

export class VisualAssertionError extends Schema.ErrorClass<VisualAssertionError>(
  "VisualAssertionError",
)({
  _tag: Schema.tag("VisualAssertionError"),
  description: Schema.String,
  reasoning: Schema.String,
}) {
  message = `Visual assertion failed: ${this.description}. Reason: ${this.reasoning}`;
}

export interface VisualAssertionResult {
  passed: boolean;
  reasoning: string;
  screenshot?: string;
}

export interface VisualAssertionWaitResult {
  passed: boolean;
  reasoning: string;
  attempts: number;
}

export interface VisualAssertionOptions {
  timeout?: number;
  fullPage?: boolean;
}

export interface VisualAssertionWaitOptions {
  timeout?: number;
  interval?: number;
}

export class VisualAssertion {
  private readonly llmCall: (
    messages: Array<{ role: string; content: LLMMessageContent }>,
  ) => Promise<string>;

  constructor(
    llmCall: (messages: Array<{ role: string; content: LLMMessageContent }>) => Promise<string>,
  ) {
    this.llmCall = llmCall;
  }

  check = async (
    page: Page,
    description: string,
    options?: VisualAssertionOptions,
  ): Promise<VisualAssertionResult> => {
    const timeout = options?.timeout ?? 30000;
    const fullPage = options?.fullPage ?? false;

    const screenshotBuffer = await page.screenshot({
      fullPage,
      type: "jpeg",
      timeout,
    });

    const screenshotBase64 = screenshotBuffer.toString("base64");

    const messages: Array<{ role: string; content: LLMMessageContent }> = [
      {
        role: "user" as const,
        content: `Evaluate this visual assertion: ${description}\n\nRespond with JSON in this exact format:\n{"passed": true|false, "reasoning": "explanation"}`,
      },
      {
        role: "user" as const,
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${screenshotBase64}`,
            },
          },
        ],
      },
    ];

    const response = await this.llmCall(messages);

    const parsed = JSON.parse(response) as {
      passed: boolean;
      reasoning: string;
    };

    return {
      passed: parsed.passed,
      reasoning: parsed.reasoning,
      screenshot: screenshotBase64,
    };
  };

  waitFor = async (
    page: Page,
    description: string,
    options?: VisualAssertionWaitOptions,
  ): Promise<VisualAssertionWaitResult> => {
    const timeout = options?.timeout ?? 30000;
    const interval = options?.interval ?? 1000;
    const deadline = Date.now() + timeout;
    let attempts = 0;

    while (Date.now() < deadline) {
      attempts++;
      const result = await this.check(page, description, {
        fullPage: false,
        timeout: Math.min(5000, deadline - Date.now()),
      });

      if (result.passed) {
        return {
          passed: true,
          reasoning: result.reasoning,
          attempts,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new VisualAssertionTimeoutError({
      description,
      timeout,
    });
  };
}
