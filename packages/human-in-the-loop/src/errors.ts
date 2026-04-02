import { Data } from "effect";

export class CheckpointTimeoutError extends Data.TaggedError("CheckpointTimeoutError")<{
  readonly checkpointId: string;
  readonly timeoutMs: number;
}> {
  get message(): string {
    return `Checkpoint ${this.checkpointId} timed out after ${this.timeoutMs}ms`;
  }
}

export class CheckpointRejectedError extends Data.TaggedError("CheckpointRejectedError")<{
  readonly checkpointId: string;
  readonly reason: string;
}> {
  get message(): string {
    return `Checkpoint ${this.checkpointId} rejected: ${this.reason}`;
  }
}

export class CheckpointNotFoundError extends Data.TaggedError("CheckpointNotFoundError")<{
  readonly checkpointId: string;
}> {
  get message(): string {
    return `Checkpoint not found: ${this.checkpointId}`;
  }
}

export class InvalidResponseError extends Data.TaggedError("InvalidResponseError")<{
  readonly checkpointId: string;
  readonly response: string;
}> {
  get message(): string {
    return `Invalid response for checkpoint ${this.checkpointId}: ${this.response}`;
  }
}
