import { Effect, Layer, Schema, ServiceMap } from "effect";

export class HistoryEntry extends Schema.Class<HistoryEntry>("HistoryEntry")({
  timestamp: Schema.String,
  action: Schema.String,
  result: Schema.String,
  url: Schema.String,
  screenshot: Schema.optional(Schema.String),
}) {}

export class AgentHistory extends Schema.Class<AgentHistory>("AgentHistory")({
  entries: Schema.Array(HistoryEntry),
  sessionId: Schema.String,
  startedAt: Schema.String,
}) {}

export class AgentHistoryService extends ServiceMap.Service<AgentHistoryService>()(
  "@agent/AgentHistory",
  {
    make: Effect.gen(function* () {
      const record = Effect.fn("AgentHistory.record")(function* (
        history: AgentHistory,
        action: string,
        result: string,
        url: string,
        screenshot?: string,
      ) {
        yield* Effect.annotateCurrentSpan({ action, url });

        const entry = new HistoryEntry({
          timestamp: new Date().toISOString(),
          action,
          result,
          url,
          screenshot,
        });

        const updated = new AgentHistory({
          ...history,
          entries: [...history.entries, entry],
        });

        yield* Effect.logDebug("History entry recorded", { action, url });

        return updated;
      });

      const getEntries = Effect.fn("AgentHistory.getEntries")(function* (
        history: AgentHistory,
        limit?: number,
      ) {
        const entries = limit ? history.entries.slice(-limit) : history.entries;
        return entries;
      });

      const getLastAction = Effect.fn("AgentHistory.getLastAction")(function* (
        history: AgentHistory,
      ) {
        const last = history.entries[history.entries.length - 1];
        return last;
      });

      const create = Effect.fn("AgentHistory.create")(function* (sessionId: string) {
        return new AgentHistory({
          entries: [],
          sessionId,
          startedAt: new Date().toISOString(),
        });
      });

      return { record, getEntries, getLastAction, create } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
