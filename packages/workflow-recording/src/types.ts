import { Schema } from "effect";

export const WorkflowEventType = Schema.Union([
  Schema.Literal("navigate"),
  Schema.Literal("click"),
  Schema.Literal("type"),
  Schema.Literal("select"),
  Schema.Literal("scroll"),
  Schema.Literal("hover"),
  Schema.Literal("focus"),
  Schema.Literal("blur"),
  Schema.Literal("keypress"),
  Schema.Literal("wait"),
  Schema.Literal("assertion"),
]);
export type WorkflowEventType = typeof WorkflowEventType.Type;

// Base event properties
export interface BaseWorkflowEvent {
  readonly id: string;
  readonly type: WorkflowEventType;
  readonly timestamp: number;
  readonly url: string;
  readonly title: string;
}

// Navigate event
export interface NavigateEvent extends BaseWorkflowEvent {
  readonly type: "navigate";
  readonly targetUrl: string;
}

// Click event
export interface ClickEvent extends BaseWorkflowEvent {
  readonly type: "click";
  readonly selector: string;
  readonly text?: string;
  readonly x: number;
  readonly y: number;
}

// Type event
export interface TypeEvent extends BaseWorkflowEvent {
  readonly type: "type";
  readonly selector: string;
  readonly value: string;
  readonly isPassword: boolean;
}

// Select event
export interface SelectEvent extends BaseWorkflowEvent {
  readonly type: "select";
  readonly selector: string;
  readonly value: string;
  readonly text: string;
}

// Scroll event
export interface ScrollEvent extends BaseWorkflowEvent {
  readonly type: "scroll";
  readonly x: number;
  readonly y: number;
}

// Hover event
export interface HoverEvent extends BaseWorkflowEvent {
  readonly type: "hover";
  readonly selector: string;
}

// Keypress event
export interface KeypressEvent extends BaseWorkflowEvent {
  readonly type: "keypress";
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

// Wait event
export interface WaitEvent extends BaseWorkflowEvent {
  readonly type: "wait";
  readonly durationMs: number;
  readonly condition?: string;
}

// Assertion event
export interface AssertionEvent extends BaseWorkflowEvent {
  readonly type: "assertion";
  readonly assertionType:
    | "text-present"
    | "text-absent"
    | "element-visible"
    | "element-hidden"
    | "url-matches"
    | "value-equals";
  readonly selector?: string;
  readonly expectedValue: string;
}

export type WorkflowEvent =
  | NavigateEvent
  | ClickEvent
  | TypeEvent
  | SelectEvent
  | ScrollEvent
  | HoverEvent
  | KeypressEvent
  | WaitEvent
  | AssertionEvent;

export const Workflow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  startUrl: Schema.String,
  createdAt: Schema.Number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: Schema.Array(Schema.Unknown as any),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Schema.optional(Schema.Unknown as any),
});
export type Workflow = typeof Workflow.Type;

export type ExportFormat = "json" | "yaml" | "typescript" | "playwright";

export interface WorkflowRecordingOptions {
  readonly captureSelectors: boolean;
  readonly captureTextContent: boolean;
  readonly maskPasswords: boolean;
  readonly maxEvents: number;
  readonly ignoreSelectors: string[];
}
