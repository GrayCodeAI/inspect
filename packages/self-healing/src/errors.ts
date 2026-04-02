import { Data } from "effect";

export class SelectorNotFoundError extends Data.TaggedError("SelectorNotFoundError")<{
  readonly selector: string;
  readonly url: string;
}> {
  get message(): string {
    return `Selector "${this.selector}" not found on ${this.url}`;
  }
}

export class HealingFailedError extends Data.TaggedError("HealingFailedError")<{
  readonly originalSelector: string;
  readonly attempts: number;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to heal selector "${this.originalSelector}" after ${this.attempts} attempts: ${this.cause}`;
  }
}

export class InvalidSelectorError extends Data.TaggedError("InvalidSelectorError")<{
  readonly selector: string;
  readonly reason: string;
}> {
  get message(): string {
    return `Invalid selector "${this.selector}": ${this.reason}`;
  }
}

export class ElementSnapshotError extends Data.TaggedError("ElementSnapshotError")<{
  readonly selector: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to create element snapshot for "${this.selector}": ${this.cause}`;
  }
}
