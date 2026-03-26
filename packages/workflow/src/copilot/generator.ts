// ============================================================================
// @inspect/workflow - Workflow Generator (AI Copilot)
// ============================================================================

import { generateId } from "@inspect/shared";
import type {
  WorkflowDefinition,
  WorkflowBlock,
  WorkflowBlockType,
  WorkflowParameter,
} from "@inspect/shared";

/** LLM interface for workflow generation */
export interface WorkflowLLM {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

/** Suggestion for the next block in a workflow */
export interface BlockSuggestion {
  type: WorkflowBlockType;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

/**
 * WorkflowGenerator uses an LLM to create workflow definitions from
 * natural language descriptions. It generates YAML-formatted workflows
 * and can suggest next blocks based on current workflow state.
 */
export class WorkflowGenerator {
  private llm?: WorkflowLLM;

  constructor(llm?: WorkflowLLM) {
    this.llm = llm;
  }

  /**
   * Set or update the LLM provider.
   */
  setLLM(llm: WorkflowLLM): void {
    this.llm = llm;
  }

  /**
   * Generate a complete workflow definition from a natural language description.
   *
   * @param description - Natural language description of what the workflow should do
   * @param llm - Optional LLM override
   * @returns Generated WorkflowDefinition
   */
  async generateFromDescription(
    description: string,
    llm?: WorkflowLLM,
  ): Promise<WorkflowDefinition> {
    const provider = llm ?? this.llm;
    if (!provider) {
      throw new Error(
        "WorkflowGenerator requires an LLM provider. Call setLLM() or pass one to generateFromDescription().",
      );
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildGenerationPrompt(description);

    const response = await provider.complete(userPrompt, systemPrompt);

    // Parse the LLM response into a workflow definition
    return this.parseWorkflowResponse(response, description);
  }

  /**
   * Suggest the next block to add based on the current workflow state.
   *
   * @param currentBlocks - Existing blocks in the workflow
   * @param description - Overall workflow description for context
   * @returns Array of block suggestions ranked by confidence
   */
  async suggestNextBlock(
    currentBlocks: WorkflowBlock[],
    description?: string,
  ): Promise<BlockSuggestion[]> {
    // If we have an LLM, use it for intelligent suggestions
    if (this.llm) {
      return this.llmSuggestNextBlock(currentBlocks, description);
    }

    // Rule-based fallback suggestions
    return this.ruleSuggestNextBlock(currentBlocks);
  }

  /**
   * Generate YAML representation of a workflow definition.
   */
  toYAML(definition: WorkflowDefinition): string {
    let yaml = "";
    yaml += `name: "${definition.name}"\n`;
    if (definition.description) {
      yaml += `description: "${definition.description}"\n`;
    }
    yaml += `version: ${definition.version}\n`;
    yaml += `status: ${definition.status}\n`;
    yaml += `templateEngine: ${definition.templateEngine}\n`;
    yaml += `strictMode: ${definition.strictMode}\n`;

    if (definition.parameters && Object.keys(definition.parameters).length > 0) {
      yaml += `\nparameters:\n`;
      for (const [key, param] of Object.entries(definition.parameters)) {
        yaml += `  ${key}:\n`;
        yaml += `    type: ${param.type}\n`;
        if (param.description) {
          yaml += `    description: "${param.description}"\n`;
        }
        if (param.required) {
          yaml += `    required: true\n`;
        }
        if (param.default !== undefined) {
          yaml += `    default: ${JSON.stringify(param.default)}\n`;
        }
      }
    }

    if (definition.cronSchedule) {
      yaml += `\ncronSchedule: "${definition.cronSchedule}"\n`;
    }

    yaml += `\nblocks:\n`;
    for (const block of definition.blocks) {
      yaml += `  - id: "${block.id}"\n`;
      yaml += `    type: ${block.type}\n`;
      yaml += `    label: "${block.label}"\n`;
      if (block.timeout) {
        yaml += `    timeout: ${block.timeout}\n`;
      }
      if (block.maxRetries) {
        yaml += `    maxRetries: ${block.maxRetries}\n`;
      }
      if (block.continueOnFailure) {
        yaml += `    continueOnFailure: true\n`;
      }
      if (block.nextBlockId) {
        yaml += `    nextBlockId: "${block.nextBlockId}"\n`;
      }
      yaml += `    parameters:\n`;
      for (const [key, value] of Object.entries(block.parameters)) {
        if (typeof value === "string") {
          yaml += `      ${key}: "${value.replace(/"/g, '\\"')}"\n`;
        } else if (typeof value === "object" && value !== null) {
          yaml += `      ${key}: ${JSON.stringify(value)}\n`;
        } else {
          yaml += `      ${key}: ${value}\n`;
        }
      }
    }

    return yaml;
  }

  /**
   * Build the system prompt for workflow generation.
   */
  private buildSystemPrompt(): string {
    return `You are a workflow generator for a browser automation platform called Inspect.
You create structured workflow definitions from natural language descriptions.

Available block types:
- task: Execute a browser automation task with a natural language prompt
  parameters: prompt (string), url (string, optional), maxSteps (number, default 25)
- for_loop: Iterate over an array of items
  parameters: items (string variable name or array), blocks (array of inner blocks)
- code: Execute sandboxed JavaScript code
  parameters: code (string), timeout (number ms, default 10000)
- data_extraction: Extract structured data using a schema
  parameters: instruction (string), schema (JSON Schema object), source (string variable name)
- validation: Validate conditions or page state
  parameters: condition (string expression), variable (string), expected (any), operator (string)
- http_request: Make HTTP requests
  parameters: method (string), url (string), headers (object), body (any)
- send_email: Send emails via SMTP
  parameters: to (string), from (string), subject (string), body (string), smtpHost (string)
- file_parser: Parse files (CSV, JSON, text)
  parameters: path (string), format (string), delimiter (string)
- wait: Wait for duration or condition
  parameters: duration (number ms), condition (string expression), pollInterval (number ms)
- human_interaction: Pause for human input
  parameters: prompt (string), fields (array of field definitions)
- conditional: Branch based on condition
  parameters: condition (string expression)
- text_prompt: Send prompt to LLM
  parameters: prompt (string), systemPrompt (string)
- file_download: Download a file
  parameters: url (string), savePath (string)
- file_upload: Upload a file
  parameters: filePath (string), selector (string)
- pdf_parser: Parse PDF files
  parameters: path (string)

Respond with a JSON object matching the WorkflowDefinition structure.
Use descriptive block labels and clear parameter values.
Use {{variable}} syntax for template variables.
Generate unique IDs for each block.`;
  }

  /**
   * Build the user prompt for workflow generation.
   */
  private buildGenerationPrompt(description: string): string {
    return `Generate a workflow definition for the following description:

"${description}"

Respond with ONLY a valid JSON object with this structure:
{
  "name": "workflow name",
  "description": "workflow description",
  "parameters": { "paramName": { "type": "string", "description": "...", "required": true } },
  "blocks": [
    {
      "id": "unique-id",
      "type": "block_type",
      "label": "Human readable label",
      "parameters": { ... },
      "timeout": 30000,
      "continueOnFailure": false
    }
  ]
}`;
  }

  /**
   * Parse the LLM response into a WorkflowDefinition.
   */
  private parseWorkflowResponse(
    response: string,
    description: string,
  ): WorkflowDefinition {
    // Try to extract JSON from the response
    let parsed: Record<string, unknown>;

    try {
      // Try direct JSON parse
      parsed = JSON.parse(response);
    } catch {
      // Try to find JSON block in the response
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find the first { to last } in the response
        const start = response.indexOf("{");
        const end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          parsed = JSON.parse(response.substring(start, end + 1));
        } else {
          // Create a minimal workflow from the description
          return this.createFallbackWorkflow(description);
        }
      }
    }

    const now = Date.now();
    const workflowId = generateId();

    // Parse parameters
    const parameters: Record<string, WorkflowParameter> = {};
    if (parsed.parameters && typeof parsed.parameters === "object") {
      for (const [key, value] of Object.entries(
        parsed.parameters as Record<string, Record<string, unknown>>,
      )) {
        parameters[key] = {
          type: (value.type as WorkflowParameter["type"]) ?? "string",
          description: value.description as string | undefined,
          required: value.required as boolean | undefined,
          default: value.default,
        };
      }
    }

    // Parse blocks
    const blocks: WorkflowBlock[] = [];
    if (Array.isArray(parsed.blocks)) {
      for (const rawBlock of parsed.blocks as Record<string, unknown>[]) {
        blocks.push({
          id: String(rawBlock.id ?? generateId()),
          type: (rawBlock.type as WorkflowBlockType) ?? "task",
          label: String(rawBlock.label ?? "Untitled Block"),
          parameters:
            (rawBlock.parameters as Record<string, unknown>) ?? {},
          nextBlockId: rawBlock.nextBlockId as string | undefined,
          errorBlockId: rawBlock.errorBlockId as string | undefined,
          maxRetries: rawBlock.maxRetries as number | undefined,
          timeout: rawBlock.timeout as number | undefined,
          continueOnFailure: rawBlock.continueOnFailure as
            | boolean
            | undefined,
        });
      }
    }

    return {
      id: workflowId,
      name: String(parsed.name ?? "Generated Workflow"),
      description: String(parsed.description ?? description),
      version: 1,
      status: "draft",
      blocks,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      cronSchedule: parsed.cronSchedule as string | undefined,
      templateEngine: "handlebars",
      strictMode: false,
      createdAt: now,
      updatedAt: now,
      tags: parsed.tags as string[] | undefined,
    };
  }

  /**
   * Create a minimal fallback workflow from description.
   */
  private createFallbackWorkflow(description: string): WorkflowDefinition {
    const now = Date.now();
    return {
      id: generateId(),
      name: "Generated Workflow",
      description,
      version: 1,
      status: "draft",
      blocks: [
        {
          id: generateId(),
          type: "task",
          label: "Main Task",
          parameters: {
            prompt: description,
          },
          timeout: 120_000,
        },
      ],
      templateEngine: "handlebars",
      strictMode: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Use LLM to suggest next blocks.
   */
  private async llmSuggestNextBlock(
    currentBlocks: WorkflowBlock[],
    description?: string,
  ): Promise<BlockSuggestion[]> {
    const prompt = `Given this workflow with blocks:
${currentBlocks.map((b) => `- ${b.type}: ${b.label}`).join("\n")}
${description ? `\nOverall goal: ${description}` : ""}

Suggest 3 possible next blocks. For each, provide:
- type (one of: task, for_loop, code, data_extraction, validation, http_request, send_email, file_parser, wait, human_interaction, conditional, text_prompt)
- label
- description (why this block should come next)
- parameters (key-value pairs)
- confidence (0-1)

Respond with a JSON array.`;

    try {
      const response = await this.llm!.complete(prompt);
      const parsed = JSON.parse(
        response.replace(/```(?:json)?\s*\n?/g, "").replace(/\n?```/g, ""),
      );

      if (Array.isArray(parsed)) {
        return parsed.map((s: Record<string, unknown>) => ({
          type: (s.type as WorkflowBlockType) ?? "task",
          label: String(s.label ?? "Suggested Block"),
          description: String(s.description ?? ""),
          parameters: (s.parameters as Record<string, unknown>) ?? {},
          confidence: Math.min(1, Math.max(0, Number(s.confidence ?? 0.5))),
        }));
      }
    } catch {
      // Fall through to rule-based suggestions
    }

    return this.ruleSuggestNextBlock(currentBlocks);
  }

  /**
   * Rule-based next block suggestions.
   */
  private ruleSuggestNextBlock(
    currentBlocks: WorkflowBlock[],
  ): BlockSuggestion[] {
    const lastBlock = currentBlocks[currentBlocks.length - 1];
    const suggestions: BlockSuggestion[] = [];

    if (!lastBlock) {
      suggestions.push({
        type: "task",
        label: "Navigate and Interact",
        description: "Start with a browser automation task",
        parameters: { prompt: "", url: "" },
        confidence: 0.9,
      });
      return suggestions;
    }

    // Suggest based on last block type
    switch (lastBlock.type) {
      case "task":
        suggestions.push(
          {
            type: "data_extraction",
            label: "Extract Data",
            description: "Extract structured data from the page",
            parameters: { instruction: "", schema: { type: "object" } },
            confidence: 0.8,
          },
          {
            type: "validation",
            label: "Validate Result",
            description: "Verify the task completed successfully",
            parameters: { variable: "lastOutput", operator: "exists" },
            confidence: 0.7,
          },
          {
            type: "wait",
            label: "Wait for Page Load",
            description: "Wait for dynamic content to load",
            parameters: { duration: 2000 },
            confidence: 0.5,
          },
        );
        break;

      case "data_extraction":
        suggestions.push(
          {
            type: "validation",
            label: "Validate Extracted Data",
            description: "Validate the extracted data meets requirements",
            parameters: { variable: "lastOutput", operator: "not_empty" },
            confidence: 0.8,
          },
          {
            type: "for_loop",
            label: "Process Each Item",
            description: "Iterate over extracted data items",
            parameters: { items: "lastOutput" },
            confidence: 0.7,
          },
          {
            type: "send_email",
            label: "Email Results",
            description: "Send extracted data via email",
            parameters: { subject: "Extraction Results" },
            confidence: 0.5,
          },
        );
        break;

      case "http_request":
        suggestions.push(
          {
            type: "data_extraction",
            label: "Parse Response",
            description: "Extract data from HTTP response",
            parameters: { source: "lastOutput" },
            confidence: 0.8,
          },
          {
            type: "validation",
            label: "Check Response Status",
            description: "Verify HTTP response was successful",
            parameters: {
              condition: "lastOutput && lastOutput.ok === true",
            },
            confidence: 0.7,
          },
        );
        break;

      case "for_loop":
        suggestions.push(
          {
            type: "send_email",
            label: "Send Summary Email",
            description: "Email the aggregated loop results",
            parameters: { subject: "Loop Results Summary" },
            confidence: 0.6,
          },
          {
            type: "code",
            label: "Aggregate Results",
            description: "Process and aggregate loop output",
            parameters: { code: "return params.loopResults;" },
            confidence: 0.7,
          },
        );
        break;

      default:
        suggestions.push(
          {
            type: "task",
            label: "Next Browser Task",
            description: "Continue with another browser action",
            parameters: { prompt: "" },
            confidence: 0.6,
          },
          {
            type: "validation",
            label: "Validate State",
            description: "Check current workflow state",
            parameters: { variable: "lastOutput", operator: "exists" },
            confidence: 0.5,
          },
        );
    }

    return suggestions;
  }
}
