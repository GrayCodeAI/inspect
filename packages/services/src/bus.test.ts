import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, type BusMessage } from "./bus.js";

describe("MessageBus", () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe("pub/sub", () => {
    it("should deliver a message to a subscribed handler", () => {
      const received: BusMessage[] = [];
      bus.subscribe("events.click", (msg) => received.push(msg));

      bus.publish({
        topic: "events.click",
        payload: { x: 10, y: 20 },
        source: "ui",
        priority: "normal",
      });

      expect(received).toHaveLength(1);
      expect(received[0].topic).toBe("events.click");
      expect(received[0].payload).toEqual({ x: 10, y: 20 });
    });

    it("should deliver to multiple subscribers on the same topic", () => {
      let countA = 0;
      let countB = 0;
      bus.subscribe("topic.multi", () => countA++);
      bus.subscribe("topic.multi", () => countB++);

      bus.publish({
        topic: "topic.multi",
        payload: null,
        source: "test",
        priority: "normal",
      });

      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    it("should return an unsubscribe function that removes the handler", () => {
      let callCount = 0;
      const unsub = bus.subscribe("topic.unsub", () => callCount++);

      bus.publish({ topic: "topic.unsub", payload: null, source: "test", priority: "normal" });
      expect(callCount).toBe(1);

      unsub();
      bus.publish({ topic: "topic.unsub", payload: null, source: "test", priority: "normal" });
      expect(callCount).toBe(1);
    });

    it("should not deliver messages to subscribers of different topics", () => {
      const received: BusMessage[] = [];
      bus.subscribe("topic.a", (msg) => received.push(msg));

      bus.publish({ topic: "topic.b", payload: "hello", source: "test", priority: "normal" });

      expect(received).toHaveLength(0);
    });
  });

  describe("filtered subscriptions", () => {
    it("should only deliver messages that pass the filter", () => {
      const received: BusMessage[] = [];
      bus.subscribeFiltered(
        "orders",
        (msg) => (msg.payload as { amount: number }).amount > 100,
        (msg) => received.push(msg),
      );

      bus.publish({ topic: "orders", payload: { amount: 50 }, source: "shop", priority: "normal" });
      bus.publish({
        topic: "orders",
        payload: { amount: 200 },
        source: "shop",
        priority: "normal",
      });

      expect(received).toHaveLength(1);
      expect((received[0].payload as { amount: number }).amount).toBe(200);
    });
  });

  describe("dead letter queue", () => {
    it("should send messages with no handlers to the dead letter queue", () => {
      bus.publish({ topic: "no.handlers", payload: "lost", source: "test", priority: "normal" });

      const dlq = bus.getDeadLetter();
      expect(dlq).toHaveLength(1);
      expect((dlq[0].payload as { reason: string }).reason).toBe("No handlers for topic");
    });

    it("should send messages with expired TTL to the dead letter queue", () => {
      bus.subscribe("ttl.topic", () => {});
      bus.publish({
        topic: "ttl.topic",
        payload: "expired",
        source: "test",
        priority: "normal",
        ttl: -1,
      });

      const dlq = bus.getDeadLetter();
      expect(dlq).toHaveLength(1);
      expect((dlq[0].payload as { reason: string }).reason).toBe("TTL expired");
    });

    it("should replay dead letter messages back onto the bus", () => {
      // First publish without handlers to populate DLQ
      bus.publish({
        topic: "replay.topic",
        payload: "retry-me",
        source: "test",
        priority: "normal",
      });
      expect(bus.getDeadLetter()).toHaveLength(1);

      // Now add a handler and replay
      const received: BusMessage[] = [];
      bus.subscribe("replay.topic", (msg) => received.push(msg));
      const replayed = bus.replayDeadLetter();
      expect(replayed).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should send messages to dead letter when handler throws and retries exhausted", () => {
      bus.subscribe("error.topic", () => {
        throw new Error("handler failure");
      });

      bus.publish({
        topic: "error.topic",
        payload: "data",
        source: "test",
        priority: "normal",
        // No retry config, so goes straight to DLQ
      });

      const dlq = bus.getDeadLetter();
      expect(dlq).toHaveLength(1);
      expect((dlq[0].payload as { reason: string }).reason).toContain("Handler error");
    });
  });

  describe("message history and metrics", () => {
    it("should track message history and allow filtering by topic", () => {
      bus.subscribe("hist.a", () => {});
      bus.subscribe("hist.b", () => {});

      bus.publish({ topic: "hist.a", payload: 1, source: "test", priority: "normal" });
      bus.publish({ topic: "hist.b", payload: 2, source: "test", priority: "normal" });
      bus.publish({ topic: "hist.a", payload: 3, source: "test", priority: "normal" });

      expect(bus.getHistory()).toHaveLength(3);
      expect(bus.getHistory("hist.a")).toHaveLength(2);
      expect(bus.getHistory("hist.b")).toHaveLength(1);
    });

    it("should report accurate metrics", () => {
      bus.subscribe("m.topic1", () => {});
      bus.subscribe("m.topic1", () => {});
      bus.subscribe("m.topic2", () => {});

      bus.publish({ topic: "orphan", payload: null, source: "test", priority: "normal" });

      const metrics = bus.getMetrics();
      expect(metrics.topics).toBe(2);
      expect(metrics.handlers).toBe(3);
      expect(metrics.deadLetter).toBe(1);
      expect(metrics.history).toBe(1);
    });
  });
});
