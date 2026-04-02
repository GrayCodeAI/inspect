import { Data } from "effect";

export class WorkflowRecordingError extends Data.TaggedError("WorkflowRecordingError")<{
  readonly workflowId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Workflow recording error for ${this.workflowId}: ${this.cause}`;
  }
}

export class WorkflowNotFoundError extends Data.TaggedError("WorkflowNotFoundError")<{
  readonly workflowId: string;
}> {
  get message(): string {
    return `Workflow not found: ${this.workflowId}`;
  }
}

export class WorkflowAlreadyRecordingError extends Data.TaggedError(
  "WorkflowAlreadyRecordingError",
)<{
  readonly workflowId: string;
}> {
  get message(): string {
    return `Workflow already recording: ${this.workflowId}`;
  }
}

export class WorkflowExportError extends Data.TaggedError("WorkflowExportError")<{
  readonly workflowId: string;
  readonly format: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to export workflow ${this.workflowId} to ${this.format}: ${this.cause}`;
  }
}

export class InvalidWorkflowEventError extends Data.TaggedError("InvalidWorkflowEventError")<{
  readonly eventType: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Invalid workflow event type ${this.eventType}: ${this.cause}`;
  }
}
