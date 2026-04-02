import { Effect, Layer, PubSub, Schema, ServiceMap } from "effect";

export class LogEvent extends Schema.Class<LogEvent>("LogEvent")({
  level: Schema.Literals(["debug", "info", "warn", "error"] as const),
  message: Schema.String,
  annotations: Schema.Unknown,
  timestamp: Schema.Number,
  source: Schema.Literals(["Frontend", "Backend"] as const),
}) {}

export class MetricEvent extends Schema.Class<MetricEvent>("MetricEvent")({
  name: Schema.String,
  value: Schema.Number,
  unit: Schema.String,
  timestamp: Schema.Number,
  tags: Schema.Record(Schema.String, Schema.String),
}) {}

export class TraceEvent extends Schema.Class<TraceEvent>("TraceEvent")({
  traceId: Schema.String,
  spanId: Schema.String,
  name: Schema.String,
  duration: Schema.Number,
  status: Schema.Literals(["ok", "error"] as const),
  annotations: Schema.Unknown,
}) {}

export class CostEvent extends Schema.Class<CostEvent>("CostEvent")({
  provider: Schema.String,
  model: Schema.String,
  tokens: Schema.Number,
  cost: Schema.Number,
  timestamp: Schema.Number,
}) {}

export class Logger extends ServiceMap.Service<Logger>()("@inspect/Logger", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<LogEvent>();

    const log = (level: "debug" | "info" | "warn" | "error") =>
      (message: string, annotations?: unknown) =>
        Effect.gen(function* () {
          const event = new LogEvent({ level, message, annotations: annotations ?? {}, timestamp: Date.now(), source: "Backend" });
          yield* PubSub.publish(pubsub, event);
        });

    return {
      debug: log("debug"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
      stream: Effect.succeed(pubsub),
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class Tracer extends ServiceMap.Service<Tracer>()("@inspect/Tracer", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<TraceEvent>();
    let spanCounter = 0;

    const startSpan = Effect.fn("Tracer.startSpan")(function* (name: string) {
      spanCounter++;
      const spanId = `span-${spanCounter}`;
      yield* Effect.annotateCurrentSpan({ name, spanId });
      return spanId;
    });

    const endSpan = Effect.fn("Tracer.endSpan")(function* (spanId: string, status?: "ok" | "error") {
      const event = new TraceEvent({ traceId: "default", spanId, name: "", duration: 0, status: status ?? "ok", annotations: {} });
      yield* PubSub.publish(pubsub, event);
    });

    const annotate = Effect.fn("Tracer.annotate")(function* (_spanId: string, _key: string, _value: unknown) {});

    return { startSpan, endSpan, annotate, stream: Effect.succeed(pubsub) } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class MetricsCollector extends ServiceMap.Service<MetricsCollector>()("@inspect/MetricsCollector", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<MetricEvent>();
    const metrics: MetricEvent[] = [];

    const record = Effect.fn("MetricsCollector.record")(function* (name: string, value: number, unit = "", tags: Record<string, string> = {}) {
      const event = new MetricEvent({ name, value, unit, timestamp: Date.now(), tags });
      metrics.push(event);
      yield* PubSub.publish(pubsub, event);
    });

    const getMetrics = Effect.sync(() => [...metrics] as const);

    return { record, getMetrics, stream: Effect.succeed(pubsub) } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class CostTracker extends ServiceMap.Service<CostTracker>()("@inspect/CostTracker", {
  make: Effect.gen(function* () {
    const events: CostEvent[] = [];

    const record = Effect.fn("CostTracker.record")(function* (provider: string, model: string, tokens: number, cost: number) {
      events.push(new CostEvent({ provider, model, tokens, cost, timestamp: Date.now() }));
    });

    const getTotal = Effect.sync(() => events.reduce((sum, e) => sum + e.cost, 0));

    const getBreakdown = Effect.sync(() => {
      const breakdown: Record<string, number> = {};
      for (const e of events) {
        const key = `${e.provider}/${e.model}`;
        breakdown[key] = (breakdown[key] ?? 0) + e.cost;
      }
      return breakdown;
    });

    return { record, getTotal, getBreakdown } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class AnalyticsCollector extends ServiceMap.Service<AnalyticsCollector>()("@inspect/AnalyticsCollector", {
  make: Effect.gen(function* () {
    const events: unknown[] = [];
    const track = Effect.fn("AnalyticsCollector.track")(function* (event: string, properties?: unknown) {
      events.push({ event, properties, timestamp: Date.now() });
    });
    const getEvents = Effect.sync(() => [...events] as const);
    return { track, getEvents } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class NotificationManager extends ServiceMap.Service<NotificationManager>()("@inspect/NotificationManager", {
  make: Effect.gen(function* () {
    const send = Effect.fn("NotificationManager.send")(function* (title: string, body: string, _type?: "info" | "success" | "error") {
      yield* Effect.logInfo("Notification sent", { title, body });
    });
    return { send } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
