/* eslint-disable require-yield */
import { Effect, Layer, ServiceMap, Schema, Option, Stream, Queue, Schedule } from "effect";
import * as Error from "./errors.js";

export const CheckpointType = Schema.Union([
  Schema.Literal("approval"),
  Schema.Literal("input"),
  Schema.Literal("choice"),
]);
export type CheckpointType = typeof CheckpointType.Type;

export const CheckpointStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("approved"),
  Schema.Literal("rejected"),
  Schema.Literal("timeout"),
]);
export type CheckpointStatus = typeof CheckpointStatus.Type;

export const CheckpointResponse = Schema.Struct({
  approved: Schema.Boolean,
  data: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.String),
});
export type CheckpointResponse = typeof CheckpointResponse.Type;

export interface Checkpoint {
  readonly id: string;
  readonly type: CheckpointType;
  readonly status: CheckpointStatus;
  readonly title: string;
  readonly description: string;
  readonly context: unknown;
  readonly timeoutMs: number;
  readonly createdAt: number;
  readonly respondedAt: Option.Option<number>;
  readonly response: Option.Option<CheckpointResponse>;
  readonly choices: Option.Option<string[]>; // For "choice" type
}

export interface CheckpointRequest {
  readonly type: CheckpointType;
  readonly title: string;
  readonly description: string;
  readonly context?: unknown;
  readonly timeoutMs?: number;
  readonly choices?: string[];
}

export class HumanCheckpointService extends ServiceMap.Service<HumanCheckpointService>()(
  "@inspect/human-in-the-loop/HumanCheckpointService",
  {
    make: Effect.gen(function* () {
      const checkpoints = new Map<string, Checkpoint>();
      const pendingQueues = new Map<string, Queue.Queue<CheckpointResponse>>();

      const create = (request: CheckpointRequest) =>
        Effect.gen(function* () {
          const id = `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const queue = yield* Queue.unbounded<CheckpointResponse>();

          const checkpoint: Checkpoint = {
            id,
            type: request.type,
            status: "pending",
            title: request.title,
            description: request.description,
            context: request.context,
            timeoutMs: request.timeoutMs ?? 300000, // 5 minutes default
            createdAt: Date.now(),
            respondedAt: Option.none(),
            response: Option.none(),
            choices: request.choices ? Option.some(request.choices) : Option.none(),
          };

          checkpoints.set(id, checkpoint);
          pendingQueues.set(id, queue);

          yield* Effect.logInfo("Checkpoint created", {
            id,
            type: request.type,
            title: request.title,
          });

          return checkpoint;
        }).pipe(Effect.withSpan("HumanCheckpointService.create"));

      const waitForResponse = (checkpointId: string) =>
        Effect.gen(function* () {
          const checkpoint = checkpoints.get(checkpointId);
          if (!checkpoint) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }

          const queue = pendingQueues.get(checkpointId);
          if (!queue) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }

          yield* Effect.logInfo("Waiting for human response", { checkpointId });

          // Race between response and timeout
          const response = yield* Effect.raceAll([
            Queue.take(queue),
            Effect.delay(
              Effect.succeed({
                approved: false,
                message: "Timeout waiting for human response",
              } as CheckpointResponse),
              checkpoint.timeoutMs,
            ),
          ]);

          // Update checkpoint with response
          const updatedCheckpoint: Checkpoint = {
            ...checkpoint,
            status: response.approved ? "approved" : "rejected",
            respondedAt: Option.some(Date.now()),
            response: Option.some(response),
          };
          checkpoints.set(checkpointId, updatedCheckpoint);
          pendingQueues.delete(checkpointId);

          yield* Effect.logInfo("Checkpoint resolved", {
            checkpointId,
            approved: response.approved,
          });

          if (!response.approved) {
            return yield* new Error.CheckpointRejectedError({
              checkpointId,
              reason: response.message ?? "Rejected by human",
            });
          }

          return updatedCheckpoint;
        }).pipe(Effect.withSpan("HumanCheckpointService.waitForResponse"));

      const respond = (checkpointId: string, response: CheckpointResponse) =>
        Effect.gen(function* () {
          const checkpoint = checkpoints.get(checkpointId);
          if (!checkpoint) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }

          if (checkpoint.status !== "pending") {
            return yield* new Error.InvalidResponseError({
              checkpointId,
              response: `Checkpoint already ${checkpoint.status}`,
            });
          }

          const queue = pendingQueues.get(checkpointId);
          if (!queue) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }

          yield* Queue.offer(queue, response);

          yield* Effect.logInfo("Human response received", {
            checkpointId,
            approved: response.approved,
          });

          return response;
        }).pipe(Effect.withSpan("HumanCheckpointService.respond"));

      const get = (checkpointId: string) =>
        Effect.gen(function* () {
          const checkpoint = checkpoints.get(checkpointId);
          if (!checkpoint) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }
          return checkpoint;
        }).pipe(Effect.withSpan("HumanCheckpointService.get"));

      const getAll = () => Effect.succeed(Array.from(checkpoints.values()));

      const getPending = () =>
        Effect.succeed(Array.from(checkpoints.values()).filter((c) => c.status === "pending"));

      const cancel = (checkpointId: string) =>
        Effect.gen(function* () {
          const checkpoint = checkpoints.get(checkpointId);
          if (!checkpoint) {
            return yield* new Error.CheckpointNotFoundError({ checkpointId });
          }

          const queue = pendingQueues.get(checkpointId);
          if (queue) {
            yield* Queue.offer(queue, {
              approved: false,
              message: "Cancelled",
            });
            pendingQueues.delete(checkpointId);
          }

          checkpoints.delete(checkpointId);

          yield* Effect.logInfo("Checkpoint cancelled", { checkpointId });
        }).pipe(Effect.withSpan("HumanCheckpointService.cancel"));

      const subscribeToPending = () =>
        Stream.fromEffect(getPending()).pipe(
          Stream.flatMap((checkpoints) => Stream.fromIterable(checkpoints)),
          Stream.schedule(Schedule.spaced("1 second")),
        );

      return {
        create,
        waitForResponse,
        respond,
        get,
        getAll,
        getPending,
        cancel,
        subscribeToPending,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
