import { describe, it, expect} from "vitest";
import { AgentMessageBusAdapter } from "./bus-adapter.js";

describe("AgentMessageBusAdapter", () => {
  it("publishes and receives messages", () => {
    const bus = new AgentMessageBusAdapter();
    const received: unknown[] = [];

    bus.subscribe("test.topic", (msg) => {
      received.push(msg.payload);
    });

    bus.publish({
      type: "broadcast",
      source: "agent-1",
      topic: "test.topic",
      payload: { data: "hello" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ data: "hello" });
  });

  it("handles multiple subscribers on same topic", () => {
    const bus = new AgentMessageBusAdapter();
    const count = { a: 0, b: 0 };

    bus.subscribe("topic", () => {
      count.a++;
    });
    bus.subscribe("topic", () => {
      count.b++;
    });

    bus.publish({ type: "broadcast", source: "s", topic: "topic", payload: null });

    expect(count.a).toBe(1);
    expect(count.b).toBe(1);
  });

  it("unsubscribes correctly", () => {
    const bus = new AgentMessageBusAdapter();
    let count = 0;

    const unsub = bus.subscribe("topic", () => {
      count++;
    });
    bus.publish({ type: "broadcast", source: "s", topic: "topic", payload: null });
    expect(count).toBe(1);

    unsub();
    bus.publish({ type: "broadcast", source: "s", topic: "topic", payload: null });
    expect(count).toBe(1); // not incremented
  });

  it("wildcard subscriber receives all messages", () => {
    const bus = new AgentMessageBusAdapter();
    const topics: string[] = [];

    bus.subscribe("*", (msg) => {
      topics.push(msg.topic);
    });

    bus.publish({ type: "broadcast", source: "s", topic: "topic.a", payload: null });
    bus.publish({ type: "broadcast", source: "s", topic: "topic.b", payload: null });

    expect(topics).toEqual(["topic.a", "topic.b"]);
  });

  it("request/reply flow works", async () => {
    const bus = new AgentMessageBusAdapter();

    // Handler that replies to requests
    bus.subscribe("ping", (msg) => {
      if (msg.type === "request") {
        bus.reply(msg, { pong: true }, "responder");
      }
    });

    const result = await bus.request("ping", { ping: true }, "requester", 5000);
    expect(result).toEqual({ pong: true });
  });

  it("request times out on no reply", async () => {
    const bus = new AgentMessageBusAdapter();

    await expect(bus.request("no-handler", {}, "requester", 50)).rejects.toThrow("timed out");
  });

  it("maintains message history", () => {
    const bus = new AgentMessageBusAdapter();

    bus.publish({ type: "broadcast", source: "a", topic: "t1", payload: null });
    bus.publish({ type: "broadcast", source: "b", topic: "t2", payload: null });

    expect(bus.getHistory()).toHaveLength(2);
    expect(bus.getHistory("t1")).toHaveLength(1);
    expect(bus.getHistory("t2")).toHaveLength(1);
    expect(bus.getHistory("t3")).toHaveLength(0);
  });

  it("provides metrics", () => {
    const bus = new AgentMessageBusAdapter();
    bus.subscribe("t1", () => {});
    bus.subscribe("t2", () => {});
    bus.subscribe("t2", () => {});

    bus.publish({ type: "request", source: "a", topic: "t1", payload: null });
    bus.publish({ type: "broadcast", source: "a", topic: "t2", payload: null });

    const metrics = bus.getMetrics();
    expect(metrics.topics).toBe(2);
    expect(metrics.subscribers).toBe(3);
    expect(metrics.historySize).toBe(2);
    expect(metrics.byType["request"]).toBe(1);
    expect(metrics.byType["broadcast"]).toBe(1);
  });

  it("clears all state", () => {
    const bus = new AgentMessageBusAdapter();
    bus.subscribe("t", () => {});
    bus.publish({ type: "broadcast", source: "a", topic: "t", payload: null });

    bus.clear();

    expect(bus.getHistory()).toHaveLength(0);
    expect(bus.getMetrics().topics).toBe(0);
    expect(bus.getMetrics().subscribers).toBe(0);
  });
});
