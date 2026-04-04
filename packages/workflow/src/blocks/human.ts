// ============================================================================
// @inspect/workflow - Human Interaction Block
// ============================================================================

import { EventEmitter } from "node:events";
import type { WorkflowBlock } from "@inspect/shared";
import { WorkflowContext } from "../engine/context.js";

/** Human interaction request */
export interface HumanInteractionRequest {
  runId: string;
  blockId: string;
  prompt: string;
  fields?: HumanInputField[];
  deadline?: number;
  createdAt: number;
}

/** Definition of an input field for human interaction */
export interface HumanInputField {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "textarea" | "file";
  required?: boolean;
  default?: unknown;
  options?: string[];
  placeholder?: string;
  validation?: string;
}

/** Human interaction response */
export interface HumanInteractionResponse {
  data: Record<string, unknown>;
  respondedAt: number;
  respondedBy?: string;
}

/** Result of human interaction block */
export interface HumanBlockResult {
  prompt: string;
  response: HumanInteractionResponse | null;
  timedOut: boolean;
  waitedMs: number;
}

/**
 * HumanInteractionBlock pauses workflow execution, emits an event
 * requesting human input, and waits for a resume signal with response data.
 * Supports configurable input fields and deadlines.
 */
export class HumanInteractionBlock {
  private emitter: EventEmitter;
  private pendingInteractions: Map<
    string,
    { resolve: (response: HumanInteractionResponse | null) => void }
  > = new Map();

  constructor() {
    this.emitter = new EventEmitter();
  }

  /**
   * Listen for human interaction requests.
   */
  onInteractionRequired(handler: (request: HumanInteractionRequest) => void): void {
    this.emitter.on("interaction:required", handler);
  }

  /**
   * Resume a paused interaction with response data.
   */
  resume(runId: string, data: Record<string, unknown>, respondedBy?: string): boolean {
    const key = runId;
    const pending = this.pendingInteractions.get(key);
    if (!pending) return false;

    pending.resolve({
      data,
      respondedAt: Date.now(),
      respondedBy,
    });
    this.pendingInteractions.delete(key);
    return true;
  }

  /**
   * Get all pending interactions.
   */
  getPendingInteractions(): string[] {
    return Array.from(this.pendingInteractions.keys());
  }

  /**
   * Execute the human interaction block.
   *
   * Parameters:
   * - prompt: message to display to the human
   * - fields: array of HumanInputField definitions
   * - deadline: timeout in ms before the block fails (optional)
   * - required: whether a response is required to continue (default: true)
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
    runId: string,
  ): Promise<HumanBlockResult> {
    const params = block.parameters;
    const prompt = context.render(String(params.prompt ?? "Human input required"));
    const fields = (params.fields as HumanInputField[]) ?? [];
    const deadline = params.deadline as number | undefined;
    const required = (params.required as boolean) ?? true;

    const startTime = Date.now();

    // Build the interaction request
    const request: HumanInteractionRequest = {
      runId,
      blockId: block.id,
      prompt,
      fields: fields.length > 0 ? fields : undefined,
      deadline: deadline ? Date.now() + deadline : undefined,
      createdAt: Date.now(),
    };

    // Emit the event
    this.emitter.emit("interaction:required", request);

    // Wait for response
    const responsePromise = new Promise<HumanInteractionResponse | null>((resolve) => {
      this.pendingInteractions.set(runId, { resolve });
    });

    let response: HumanInteractionResponse | null;

    if (deadline) {
      // Wait with timeout
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), deadline),
      );
      response = await Promise.race([responsePromise, timeoutPromise]);

      if (response === null) {
        this.pendingInteractions.delete(runId);
      }
    } else {
      // Wait indefinitely
      response = await responsePromise;
    }

    const waitedMs = Date.now() - startTime;
    const timedOut = response === null && deadline !== undefined;

    if (timedOut && required) {
      throw new Error(`Human interaction timed out after ${deadline}ms: ${prompt}`);
    }

    // Validate response fields
    if (response && fields.length > 0) {
      this.validateResponse(response.data, fields);
    }

    // Store response data in context
    if (response) {
      for (const [key, value] of Object.entries(response.data)) {
        context.set(`human_${key}`, value);
      }
      context.set("humanResponse", response.data);
    }

    return {
      prompt,
      response,
      timedOut,
      waitedMs,
    };
  }

  /**
   * Validate response data against field definitions.
   */
  private validateResponse(data: Record<string, unknown>, fields: HumanInputField[]): void {
    for (const field of fields) {
      if (
        field.required &&
        (!(field.name in data) || data[field.name] === undefined || data[field.name] === "")
      ) {
        throw new Error(`Required field '${field.label}' is missing`);
      }

      const value = data[field.name];
      if (value === undefined || value === null) continue;

      switch (field.type) {
        case "number":
          if (typeof value !== "number" && isNaN(Number(value))) {
            throw new Error(`Field '${field.label}' must be a number`);
          }
          break;
        case "boolean":
          if (typeof value !== "boolean" && value !== "true" && value !== "false") {
            throw new Error(`Field '${field.label}' must be a boolean`);
          }
          break;
        case "select":
          if (field.options && !field.options.includes(String(value))) {
            throw new Error(`Field '${field.label}' must be one of: ${field.options.join(", ")}`);
          }
          break;
      }

      // Custom regex validation
      if (field.validation && typeof value === "string") {
        const regex = new RegExp(field.validation);
        if (!regex.test(value)) {
          throw new Error(`Field '${field.label}' does not match validation pattern`);
        }
      }
    }
  }

  /**
   * Clean up event listeners.
   */
  destroy(): void {
    this.emitter.removeAllListeners();
    // Reject all pending interactions
    for (const [key, pending] of this.pendingInteractions) {
      pending.resolve(null);
      this.pendingInteractions.delete(key);
    }
  }
}
