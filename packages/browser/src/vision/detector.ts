// ──────────────────────────────────────────────────────────────────────────────
// VisionDetector - Send screenshots to vision LLMs for action detection
// ──────────────────────────────────────────────────────────────────────────────

import type { VisionAction, VisionDetectionRequest } from "@inspect/shared";

/**
 * LLM client interface for vision-based action detection.
 * Implementations should wrap the actual API calls (OpenAI, Google, Anthropic).
 */
export interface VisionLLMClient {
  /**
   * Send a vision request and get structured actions back.
   */
  detectActions(
    screenshot: string,
    instruction: string,
    model?: string,
  ): Promise<VisionAction[]>;
}

/**
 * OpenAI GPT-4V / GPT-4o vision client.
 */
export class OpenAIVisionClient implements VisionLLMClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.openai.com/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async detectActions(screenshot: string, instruction: string, model?: string): Promise<VisionAction[]> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: model ?? "gpt-4o",
        messages: [
          {
            role: "system",
            content: VISION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: instruction,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${screenshot}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1024,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Vision API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return this.parseActions(data.choices[0]?.message?.content ?? "{}");
  }

  private parseActions(content: string): VisionAction[] {
    try {
      const parsed = JSON.parse(content) as { actions?: VisionAction[] };
      return (parsed.actions ?? []).map((a) => ({
        type: a.type,
        coordinates: a.coordinates,
        confidence: a.confidence ?? 0.5,
        text: a.text,
        description: a.description,
        elementLabel: a.elementLabel,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Google Gemini Vision client.
 */
export class GeminiVisionClient implements VisionLLMClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async detectActions(screenshot: string, instruction: string, model?: string): Promise<VisionAction[]> {
    const modelId = model ?? "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${VISION_SYSTEM_PROMPT}\n\n${instruction}` },
              {
                inline_data: {
                  mime_type: "image/png",
                  data: screenshot,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini Vision API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return this.parseActions(text);
  }

  private parseActions(content: string): VisionAction[] {
    try {
      const parsed = JSON.parse(content) as { actions?: VisionAction[] };
      return (parsed.actions ?? []).map((a) => ({
        type: a.type,
        coordinates: a.coordinates,
        confidence: a.confidence ?? 0.5,
        text: a.text,
        description: a.description,
        elementLabel: a.elementLabel,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Detect UI actions from a screenshot using a vision LLM.
 * Provider-agnostic: pass any VisionLLMClient implementation.
 */
export class VisionDetector {
  /**
   * Send a screenshot to a vision model and detect actionable elements/actions.
   *
   * @param screenshot - Base64-encoded PNG screenshot
   * @param instruction - Natural language instruction (e.g., "Click the login button")
   * @param llm - Vision LLM client to use
   * @returns Array of detected actions with coordinates and confidence scores
   */
  async detect(screenshot: string, instruction: string, llm: VisionLLMClient): Promise<VisionAction[]> {
    const actions = await llm.detectActions(screenshot, instruction);

    // Sort by confidence descending
    return actions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Create a VisionLLMClient from a detection request.
   */
  static createClient(request: VisionDetectionRequest): VisionLLMClient {
    switch (request.provider) {
      case "openai": {
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) throw new Error("OPENAI_API_KEY environment variable not set");
        return new OpenAIVisionClient(apiKey);
      }
      case "google": {
        const apiKey = process.env["GOOGLE_API_KEY"] ?? process.env["GEMINI_API_KEY"];
        if (!apiKey) throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY environment variable not set");
        return new GeminiVisionClient(apiKey);
      }
      case "anthropic":
        throw new Error("Anthropic vision client should be implemented via the agent package with native CUA support.");
      default:
        throw new Error(`Unsupported vision provider: ${request.provider}`);
    }
  }
}

// ── Shared system prompt for vision detection ────────────────────────────────

const VISION_SYSTEM_PROMPT = `You are a browser automation vision system. Analyze the screenshot and determine what actions to take based on the user's instruction.

Return a JSON object with an "actions" array. Each action has:
- type: "click" | "type" | "scroll" | "hover" | "select" | "drag"
- coordinates: { x: number, y: number } - pixel coordinates on the screenshot
- confidence: number (0 to 1) - how confident you are this is correct
- text: string (optional) - text to type if type action
- description: string - brief description of what this action does
- elementLabel: string (optional) - label of the annotated element if visible

Rules:
1. Coordinates should be the CENTER of the target element
2. For type actions, include the text to type
3. For scroll, coordinates indicate scroll origin, text can be "up"/"down"/"left"/"right"
4. Only include actions you're confident about (confidence > 0.3)
5. Order actions by execution sequence

Example response:
{
  "actions": [
    {
      "type": "click",
      "coordinates": { "x": 450, "y": 320 },
      "confidence": 0.95,
      "description": "Click the 'Sign In' button",
      "elementLabel": "e3"
    }
  ]
}`;
