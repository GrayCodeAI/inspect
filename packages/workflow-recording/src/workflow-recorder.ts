/* eslint-disable require-yield */
import { Effect, Layer, ServiceMap, Schema, Option } from "effect";
import * as Error from "./errors.js";
import * as Types from "./types.js";

export const defaultRecordingOptions: Types.WorkflowRecordingOptions = {
  captureSelectors: true,
  captureTextContent: true,
  maskPasswords: true,
  maxEvents: 1000,
  ignoreSelectors: ["script", "style", "noscript", ".rr-block", ".rr-ignore"],
};

export class WorkflowRecorder extends ServiceMap.Service<WorkflowRecorder>()(
  "@inspect/workflow-recording/WorkflowRecorder",
  {
    make: Effect.gen(function* () {
      const workflows = new Map<string, Types.Workflow>();
      const activeRecordings = new Map<string, boolean>();

      const create = (name: string, startUrl: string, description?: string) =>
        Effect.gen(function* () {
          const id = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          const workflow: Types.Workflow = {
            id,
            name,
            description,
            startUrl,
            createdAt: Date.now(),
            events: [],
            metadata: {},
          };

          workflows.set(id, workflow);

          yield* Effect.logInfo("Workflow created", { id, name, startUrl });

          return workflow;
        }).pipe(Effect.withSpan("WorkflowRecorder.create"));

      const startRecording = (workflowId: string) =>
        Effect.gen(function* () {
          if (activeRecordings.has(workflowId)) {
            return yield* new Error.WorkflowAlreadyRecordingError({ workflowId });
          }

          const workflow = workflows.get(workflowId);
          if (!workflow) {
            return yield* new Error.WorkflowNotFoundError({ workflowId });
          }

          activeRecordings.set(workflowId, true);

          yield* Effect.logInfo("Workflow recording started", { workflowId });

          return workflow;
        }).pipe(Effect.withSpan("WorkflowRecorder.startRecording"));

      const stopRecording = (workflowId: string) =>
        Effect.gen(function* () {
          if (!activeRecordings.has(workflowId)) {
            return yield* new Error.WorkflowRecordingError({
              workflowId,
              cause: "Not currently recording",
            });
          }

          activeRecordings.delete(workflowId);

          const workflow = workflows.get(workflowId);
          if (!workflow) {
            return yield* new Error.WorkflowNotFoundError({ workflowId });
          }

          yield* Effect.logInfo("Workflow recording stopped", {
            workflowId,
            eventCount: workflow.events.length,
          });

          return workflow;
        }).pipe(Effect.withSpan("WorkflowRecorder.stopRecording"));

      const addEvent = (workflowId: string, event: Types.WorkflowEvent) =>
        Effect.gen(function* () {
          if (!activeRecordings.has(workflowId)) {
            return yield* new Error.WorkflowRecordingError({
              workflowId,
              cause: "Not currently recording",
            });
          }

          const workflow = workflows.get(workflowId);
          if (!workflow) {
            return yield* new Error.WorkflowNotFoundError({ workflowId });
          }

          // Cast to mutable array for appending
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (workflow.events as any[]).push(event);

          yield* Effect.logDebug("Workflow event added", {
            workflowId,
            eventType: event.type,
          });

          return workflow;
        }).pipe(Effect.withSpan("WorkflowRecorder.addEvent"));

      const get = (workflowId: string) =>
        Effect.gen(function* () {
          const workflow = workflows.get(workflowId);
          if (!workflow) {
            return yield* new Error.WorkflowNotFoundError({ workflowId });
          }
          return workflow;
        }).pipe(Effect.withSpan("WorkflowRecorder.get"));

      const getAll = () => Effect.succeed(Array.from(workflows.values()));

      const isRecording = (workflowId: string) => activeRecordings.has(workflowId);

      const delete_ = (workflowId: string) =>
        Effect.gen(function* () {
          if (activeRecordings.has(workflowId)) {
            activeRecordings.delete(workflowId);
          }
          workflows.delete(workflowId);
          yield* Effect.logInfo("Workflow deleted", { workflowId });
        }).pipe(Effect.withSpan("WorkflowRecorder.delete"));

      return {
        create,
        startRecording,
        stopRecording,
        addEvent,
        get,
        getAll,
        isRecording,
        delete: delete_,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
