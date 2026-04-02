import { Effect, Layer, Schema, ServiceMap } from "effect";

export class Observation extends Schema.Class<Observation>("Observation")({
  type: Schema.String,
  content: Schema.String,
  timestamp: Schema.Number,
  frozen: Schema.Boolean,
}) {}

export class TodoItem extends Schema.Class<TodoItem>("TodoItem")({
  id: Schema.String,
  description: Schema.String,
  status: Schema.Literals(["pending", "inProgress", "completed", "failed"] as const),
}) {}

export class MessageManager extends ServiceMap.Service<MessageManager>()("@inspect/MessageManager", {
  make: Effect.gen(function* () {
    const messages: Observation[] = [];
    let frozen = false;

    const add = Effect.fn("MessageManager.add")(function* (observation: Observation) {
      if (frozen) return;
      messages.push(observation);
    });

    const getAll = Effect.sync(() => [...messages]);

    const compact = Effect.fn("MessageManager.compact")(function* () {
      const last10 = messages.slice(-10);
      return last10;
    });

    const freeze = Effect.sync(() => { frozen = true; });
    const unfreeze = Effect.sync(() => { frozen = false; });
    const count = Effect.sync(() => messages.length);

    return { add, getAll, compact, freeze, unfreeze, count } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class TodoTracker extends ServiceMap.Service<TodoTracker>()("@inspect/TodoTracker", {
  make: Effect.gen(function* () {
    const todos: TodoItem[] = [];
    let nextId = 0;

    const create = Effect.fn("TodoTracker.create")(function* (description: string) {
      const item = new TodoItem({ id: `todo-${nextId++}`, description, status: "pending" });
      todos.push(item);
      return item;
    });

    const update = Effect.fn("TodoTracker.update")(function* (id: string, status: TodoItem["status"]) {
      const todo = todos.find((t) => t.id === id);
      if (todo) (todo as { status: TodoItem["status"] }).status = status;
    });

    const getAll = Effect.sync(() => [...todos]);

    const getProgress = Effect.sync(() => {
      if (todos.length === 0) return 0;
      return todos.filter((t) => t.status === "completed").length / todos.length;
    });

    const isComplete = Effect.sync(() => todos.length > 0 && todos.every((t) => t.status === "completed"));

    return { create, update, getAll, getProgress, isComplete } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class ActionCache extends ServiceMap.Service<ActionCache>()("@inspect/ActionCache", {
  make: Effect.gen(function* () {
    const cache = new Map<string, unknown>();

    const get = Effect.fn("ActionCache.get")(function* (key: string) {
      return cache.get(key);
    });
    const set = Effect.fn("ActionCache.set")(function* (key: string, value: unknown) {
      cache.set(key, value);
    });
    const has = Effect.fn("ActionCache.has")(function* (key: string) {
      return cache.has(key);
    });
    const clear = Effect.sync(() => { cache.clear(); });

    return { get, set, has, clear } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

export class PatternStore extends ServiceMap.Service<PatternStore>()("@inspect/PatternStore", {
  make: Effect.gen(function* () {
    const patterns: unknown[] = [];

    const store = Effect.fn("PatternStore.store")(function* (pattern: unknown) {
      patterns.push(pattern);
    });
    const find = Effect.fn("PatternStore.find")(function* (_context: unknown) {
      return patterns.slice(-5);
    });
    const expire = Effect.fn("PatternStore.expire")(function* () {
      patterns.splice(0, Math.floor(patterns.length / 2));
    });

    return { store, find, expire } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
