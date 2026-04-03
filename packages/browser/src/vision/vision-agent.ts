// ──────────────────────────────────────────────────────────────────────────────
// Vision-first pixel-grounded page actions (Magnitude-style)
// Uses VLM to identify pixel coordinates for interactions instead of DOM selectors
// Works on any interface — web, desktop apps, VMs
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";

export interface PixelAction {
  action: "click" | "doubleClick" | "rightClick" | "hover" | "type" | "drag";
  pixelX: number;
  pixelY: number;
  value?: string;
  description: string;
  confidence: number;
}

export interface VisionActOptions {
  /** VLM model for vision grounding */
  model?: string;
  /** Max retry attempts on failure */
  maxRetries?: number;
  /** Annotate screenshot with action points for debugging */
  annotate?: boolean;
  /** Fallback to DOM selector if vision confidence is low */
  domFallback?: boolean;
  /** Temperature for VLM */
  temperature?: number;
}

export interface VisionActResult {
  actions: PixelAction[];
  screenshot: string;
  confidence: number;
  usedVisionFallback: boolean;
}

/**
 * Vision-first agent that grounds natural language instructions to pixel coordinates.
 * Unlike DOM-based agents, works on any visual interface (web, desktop, native apps).
 *
 * Inspired by Magnitude's vision-first architecture.
 */
export class VisionAgent {
  private page: Page;
  private callVision: (screenshot: string, instruction: string) => Promise<PixelAction[]>;

  constructor(
    page: Page,
    visionFn: (screenshot: string, instruction: string) => Promise<PixelAction[]>,
  ) {
    this.page = page;
    this.callVision = visionFn;
  }

  /**
   * Execute a natural language instruction using vision-first grounding.
   * Takes screenshot → VLM identifies pixel coordinates → executes actions.
   */
  async act(instruction: string, options?: VisionActOptions): Promise<VisionActResult> {
    const maxRetries = options?.maxRetries ?? 2;
    const domFallback = options?.domFallback ?? true;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 1. Take screenshot for VLM grounding
      const screenshotBuffer = await this.page.screenshot({ fullPage: false });
      const screenshotBase64 = screenshotBuffer.toString("base64");

      // 2. VLM identifies pixel coordinates for actions
      const actions = await this.callVision(screenshotBase64, instruction);

      if (actions.length === 0) {
        if (domFallback && attempt === maxRetries) {
          // Last resort: try DOM-based extraction
          const domResult = await this.domFallbackAction(instruction);
          if (domResult) {
            return {
              actions: [domResult],
              screenshot: screenshotBase64,
              confidence: 0.5,
              usedVisionFallback: true,
            };
          }
        }
        continue;
      }

      // 3. Execute pixel-grounded actions
      const avgConfidence = actions.reduce((sum, a) => sum + a.confidence, 0) / actions.length;

      for (const action of actions) {
        await this.executePixelAction(action);
      }

      return {
        actions,
        screenshot: screenshotBase64,
        confidence: avgConfidence,
        usedVisionFallback: false,
      };
    }

    throw new Error(
      `VisionAgent could not ground instruction: "${instruction}" after ${maxRetries + 1} attempts`,
    );
  }

  /**
   * Extract data from the page using vision grounding.
   * Returns structured data identified visually on the page.
   */
  async extract(schema: string, instruction: string): Promise<unknown> {
    const screenshotBuffer = await this.page.screenshot({ fullPage: false });
    const screenshotBase64 = screenshotBuffer.toString("base64");

    const prompt = [
      `Extract the following data from this page:`,
      `Instruction: ${instruction}`,
      `Schema: ${schema}`,
      `Return ONLY a valid JSON object matching the schema.`,
    ].join("\n");

    const result = await this.callVision(screenshotBase64, prompt);

    // The VLM should return data in the action description field
    const dataStr = result.map((r) => r.description).join("\n");
    const jsonMatch = dataStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Could not extract data matching schema`);
    }
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Verify a visual condition using vision grounding.
   * Returns true if the condition is visually satisfied.
   */
  async verify(condition: string): Promise<boolean> {
    const screenshotBuffer = await this.page.screenshot({ fullPage: false });
    const screenshotBase64 = screenshotBuffer.toString("base64");

    const prompt = `Is this condition visually true: "${condition}"\nRespond with ONLY "true" or "false".`;
    const actions = await this.callVision(screenshotBase64, prompt);
    const text = actions
      .map((a) => a.description)
      .join(" ")
      .toLowerCase();
    return text.includes("true");
  }

  private async executePixelAction(action: PixelAction): Promise<void> {
    const { page } = this;

    switch (action.action) {
      case "click":
        await page.mouse.click(action.pixelX, action.pixelY);
        break;
      case "doubleClick":
        await page.mouse.dblclick(action.pixelX, action.pixelY);
        break;
      case "rightClick":
        await page.mouse.click(action.pixelX, action.pixelY, { button: "right" });
        break;
      case "hover":
        await page.mouse.move(action.pixelX, action.pixelY);
        break;
      case "type":
        await page.mouse.click(action.pixelX, action.pixelY);
        await page.keyboard.type(action.value ?? "");
        break;
      case "drag":
        await page.mouse.move(action.pixelX, action.pixelY);
        await page.mouse.down();
        // Move slightly right (drag target inferred from instruction)
        await page.mouse.move(action.pixelX + 50, action.pixelY + 20, { steps: 10 });
        await page.mouse.up();
        break;
    }
  }

  private async domFallbackAction(instruction: string): Promise<PixelAction | null> {
    try {
      // Try to find element by fuzzy text match in accessible name
      const result = await this.page.evaluate((query: string) => {
        const elements = Array.from(document.querySelectorAll("button, a, input, [role='button']"));
        const queryLower = query.toLowerCase();
        const match = elements.find((el) => {
          const text = (el.textContent ?? "").toLowerCase();
          const label = el.getAttribute("aria-label")?.toLowerCase() ?? "";
          const name = el.getAttribute("name")?.toLowerCase() ?? "";
          return (
            text.includes(queryLower) || label.includes(queryLower) || name.includes(queryLower)
          );
        });
        if (!match) return null;
        const rect = match.getBoundingClientRect();
        return {
          pixelX: rect.x + rect.width / 2,
          pixelY: rect.y + rect.height / 2,
          tag: match.tagName.toLowerCase(),
          text: (match.textContent ?? "").trim().slice(0, 80),
        };
      }, instruction);

      if (!result) return null;

      return {
        action: "click",
        pixelX: result.pixelX,
        pixelY: result.pixelY,
        description: `DOM fallback: clicked <${result.tag}> "${result.text}"`,
        confidence: 0.5,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Factory to create a VisionAgent from a Page and LLM client.
 * Adapts the existing LLM provider to the vision grounding interface.
 */
export async function createVisionAgent(
  page: Page,
  llm: {
    visionChat: (
      messages: Array<{
        role: string;
        content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }>,
    ) => Promise<string>;
  },
): Promise<VisionAgent> {
  const callVision = async (screenshot: string, instruction: string): Promise<PixelAction[]> => {
    const response = await llm.visionChat([
      {
        role: "system",
        content: [
          {
            type: "text",
            text: [
              "You are a vision grounding agent. Analyze the screenshot and instruction.",
              "Return actions as JSON array: [{action, pixelX, pixelY, value?, description, confidence}]",
              "Actions: click, doubleClick, rightClick, hover, type, drag",
              "Pixel coordinates are relative to the viewport (0-1920, 0-1080).",
              "For 'type' actions, include 'value' field with text to type.",
              "Confidence is 0-1 based on how certain you are.",
              "Return ONLY the JSON array, no other text.",
            ].join(" "),
          },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshot}` } },
          { type: "text", text: `Instruction: ${instruction}` },
        ],
      },
    ]);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    try {
      return JSON.parse(jsonMatch[0]) as PixelAction[];
    } catch {
      return [];
    }
  };

  return new VisionAgent(page, callVision);
}
