// ============================================================================
// @inspect/data - LLM Extractor (Free-form Extraction)
// ============================================================================

/** LLM interface */
export interface LLMProvider {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

/** Page content interface */
export interface LLMPageContent {
  url: string;
  html?: string;
  text?: string;
  markdown?: string;
}

/** Extraction options */
export interface LLMExtractOptions {
  /** Output format preference */
  format?: "json" | "text" | "markdown" | "csv";
  /** Maximum content length to send to LLM */
  maxContentLength?: number;
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Temperature for LLM completion */
  temperature?: number;
  /** Additional context/examples */
  examples?: Array<{ input: string; output: string }>;
}

/** LLM extraction result */
export interface LLMExtractionResult {
  data: unknown;
  rawResponse: string;
  format: string;
  source: string;
}

/**
 * LLMExtractor performs free-form data extraction using a dedicated LLM call.
 * Unlike schema-based extractors, this allows natural language instructions
 * to guide the extraction without a strict output format.
 */
export class LLMExtractor {
  private defaultMaxLength: number;

  constructor(options?: { defaultMaxLength?: number }) {
    this.defaultMaxLength = options?.defaultMaxLength ?? 12_000;
  }

  /**
   * Extract data from page content using free-form LLM extraction.
   *
   * @param instruction - What to extract (natural language)
   * @param page - Page content
   * @param llm - LLM provider
   * @param options - Extraction options
   */
  async extractWithLLM(
    instruction: string,
    page: LLMPageContent,
    llm: LLMProvider,
    options?: LLMExtractOptions,
  ): Promise<LLMExtractionResult> {
    const format = options?.format ?? "json";
    const maxLength =
      options?.maxContentLength ?? this.defaultMaxLength;
    const content = this.getContent(page, maxLength);

    const systemPrompt =
      options?.systemPrompt ?? this.buildSystemPrompt(format);
    const userPrompt = this.buildUserPrompt(
      instruction,
      content,
      page.url,
      format,
      options?.examples,
    );

    const rawResponse = await llm.complete(userPrompt, systemPrompt);

    // Parse based on format
    const data = this.parseResponse(rawResponse, format);

    return {
      data,
      rawResponse,
      format,
      source: page.url,
    };
  }

  /**
   * Extract multiple items from a page (e.g., list of products, articles).
   */
  async extractList(
    instruction: string,
    page: LLMPageContent,
    llm: LLMProvider,
    options?: LLMExtractOptions,
  ): Promise<LLMExtractionResult> {
    const enhanced = {
      ...options,
      format: "json" as const,
    };

    const result = await this.extractWithLLM(
      `${instruction}\n\nReturn the results as a JSON array. Each item should be a complete object.`,
      page,
      llm,
      enhanced,
    );

    // Ensure result is an array
    if (!Array.isArray(result.data)) {
      if (
        result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
      ) {
        // Try common wrapper keys
        const obj = result.data as Record<string, unknown>;
        for (const key of ["items", "results", "data", "list", "entries"]) {
          if (Array.isArray(obj[key])) {
            result.data = obj[key];
            break;
          }
        }
      }
      if (!Array.isArray(result.data)) {
        result.data = result.data ? [result.data] : [];
      }
    }

    return result;
  }

  /**
   * Summarize page content.
   */
  async summarize(
    page: LLMPageContent,
    llm: LLMProvider,
    options?: { maxLength?: number; style?: "brief" | "detailed" | "bullets" },
  ): Promise<string> {
    const style = options?.style ?? "brief";
    const styleInstruction = {
      brief: "Provide a brief 2-3 sentence summary.",
      detailed:
        "Provide a detailed summary covering all key points.",
      bullets:
        "Provide a bullet-point summary of the key information.",
    }[style];

    const result = await this.extractWithLLM(
      `Summarize the following page content. ${styleInstruction}`,
      page,
      llm,
      { format: "text", maxContentLength: options?.maxLength },
    );

    return String(result.data ?? result.rawResponse);
  }

  /**
   * Answer a question about page content.
   */
  async answer(
    question: string,
    page: LLMPageContent,
    llm: LLMProvider,
  ): Promise<string> {
    const result = await this.extractWithLLM(
      `Based on the page content, answer this question: ${question}`,
      page,
      llm,
      { format: "text" },
    );

    return String(result.data ?? result.rawResponse);
  }

  /**
   * Build system prompt based on output format.
   */
  private buildSystemPrompt(format: string): string {
    const base =
      "You are a data extraction assistant. Extract the requested information from the provided page content accurately and completely.";

    switch (format) {
      case "json":
        return `${base} Respond with ONLY valid JSON. No markdown, no explanation.`;
      case "csv":
        return `${base} Respond with CSV-formatted data (with header row). No explanation.`;
      case "markdown":
        return `${base} Respond with well-formatted Markdown.`;
      case "text":
      default:
        return `${base} Respond with plain text.`;
    }
  }

  /**
   * Build the user prompt.
   */
  private buildUserPrompt(
    instruction: string,
    content: string,
    url: string,
    format: string,
    examples?: Array<{ input: string; output: string }>,
  ): string {
    let prompt = `Instruction: ${instruction}\n\nPage URL: ${url}\n`;

    if (examples && examples.length > 0) {
      prompt += "\nExamples:\n";
      for (const example of examples) {
        prompt += `Input: ${example.input}\nOutput: ${example.output}\n\n`;
      }
    }

    prompt += `\nPage content:\n${content}\n`;

    if (format === "json") {
      prompt += "\nRespond with ONLY valid JSON.";
    }

    return prompt;
  }

  /**
   * Get the best available content from the page.
   */
  private getContent(page: LLMPageContent, maxLength: number): string {
    // Prefer markdown > text > html
    const content = page.markdown ?? page.text ?? page.html ?? "";
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "\n...[content truncated]";
  }

  /**
   * Parse LLM response based on expected format.
   */
  private parseResponse(response: string, format: string): unknown {
    switch (format) {
      case "json": {
        // Try to parse JSON
        try {
          return JSON.parse(response);
        } catch {
          // Try extracting from code fences
          const fenceMatch = response.match(
            /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
          );
          if (fenceMatch) {
            try {
              return JSON.parse(fenceMatch[1]);
            } catch {
              // Fall through
            }
          }
          // Try finding JSON in the response
          const jsonMatch = response.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[1]);
            } catch {
              // Fall through
            }
          }
          return response;
        }
      }
      case "csv":
        return this.parseCSVResponse(response);
      default:
        return response.trim();
    }
  }

  /**
   * Parse a CSV response into structured data.
   */
  private parseCSVResponse(
    text: string,
  ): Record<string, string>[] {
    // Strip code fences if present
    const cleaned = text
      .replace(/```(?:csv)?\s*\n?/g, "")
      .replace(/\n?```/g, "")
      .trim();

    const lines = cleaned.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j].trim()] = (values[j] ?? "").trim();
      }
      rows.push(row);
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          fields.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }
    fields.push(current);
    return fields;
  }
}
