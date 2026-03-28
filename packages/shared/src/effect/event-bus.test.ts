import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./event-bus.js";

type TestEvent =
  | { type: "a"; data: string }
  | { type: "b"; data: number }
  | { type: "c"; data: boolean };

describe("EventBus", () => {
  it("emits events to matching listeners", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    bus.on("a", handler);

    bus.emit({ type: "a", data: "hello" });

    expect(handler).toHaveBeenCalledWith({ type: "a", data: "hello" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call listeners for other event types", () => {
    const bus = new EventBus<TestEvent>();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on("a", handlerA);
    bus.on("b", handlerB);

    bus.emit({ type: "a", data: "test" });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();
  });

  it("supports multiple listeners on the same type", () => {
    const bus = new EventBus<TestEvent>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("a", h1);
    bus.on("a", h2);

    bus.emit({ type: "a", data: "multi" });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe function", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    const unsub = bus.on("a", handler);

    bus.emit({ type: "a", data: "before" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    bus.emit({ type: "a", data: "after" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("once() fires only once then auto-unsubscribes", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    bus.once("b", handler);

    bus.emit({ type: "b", data: 1 });
    bus.emit({ type: "b", data: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "b", data: 1 });
  });

  it("onAny() receives all events", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit({ type: "a", data: "x" });
    bus.emit({ type: "b", data: 42 });
    bus.emit({ type: "c", data: true });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith({ type: "a", data: "x" });
    expect(handler).toHaveBeenCalledWith({ type: "b", data: 42 });
    expect(handler).toHaveBeenCalledWith({ type: "c", data: true });
  });

  it("onAny() unsubscribe works", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    const unsub = bus.onAny(handler);

    bus.emit({ type: "a", data: "1" });
    unsub();
    bus.emit({ type: "a", data: "2" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removeAllListeners() clears everything", () => {
    const bus = new EventBus<TestEvent>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("a", h1);
    bus.onAny(h2);

    bus.removeAllListeners();

    bus.emit({ type: "a", data: "gone" });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("listenerCount tracks all listeners", () => {
    const bus = new EventBus<TestEvent>();

    expect(bus.listenerCount).toBe(0);

    const unsub1 = bus.on("a", () => {});
    const unsub2 = bus.on("b", () => {});
    const unsub3 = bus.onAny(() => {});

    expect(bus.listenerCount).toBe(3);

    unsub1();
    expect(bus.listenerCount).toBe(2);

    unsub2();
    unsub3();
    expect(bus.listenerCount).toBe(0);
  });

  it("emitting an event with no listeners is a no-op", () => {
    const bus = new EventBus<TestEvent>();
    // Should not throw
    bus.emit({ type: "a", data: "orphan" });
  });

  it("double unsubscribe is safe", () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    const unsub = bus.on("a", handler);

    unsub();
    unsub(); // Should not throw

    bus.emit({ type: "a", data: "test" });
    expect(handler).not.toHaveBeenCalled();
  });
});
