import { describe, it, expect, vi } from "vitest";
import { ws, WsMockBuilder, WsMessageMatcher, MockWsConnection, WsRecorder } from "./ws.js";

describe("WsMockBuilder", () => {
  it("should create builder with fluent API", () => {
    const builder = ws();
    expect(builder).toBeInstanceOf(WsMockBuilder);
  });

  it("should build config with handlers", () => {
    const config = ws()
      .on("ws://localhost:8080")
      .onConnection(() => {})
      .onMessage(() => {})
      .done()
      .build();

    expect(config.handlers.length).toBe(1);
    expect(config.handlers[0].url).toBe("ws://localhost:8080");
  });

  it("should add multiple handlers", () => {
    const config = ws()
      .on("ws://localhost:8080/chat")
      .onConnection(() => {})
      .done()
      .on("ws://localhost:8080/notifications")
      .onMessage(() => {})
      .done()
      .build();

    expect(config.handlers.length).toBe(2);
  });

  it("should support regex URL patterns", () => {
    const config = ws()
      .on(/ws:\/\/localhost:\d+/)
      .onConnection(() => {})
      .done()
      .build();

    expect(config.handlers[0].url).toBeInstanceOf(RegExp);
  });

  it("should set unhandled behavior", () => {
    const config = ws().unhandled("reject").build();
    expect(config.onUnhandledConnection).toBe("reject");
  });

  it("should enable recording", () => {
    const config = ws().record().build();
    expect(config.recordMessages).toBe(true);
  });

  it("should add unhandled message callback", () => {
    const cb = () => {};
    const config = ws().onUnhandled(cb).build();
    expect(config.onUnhandledMessage).toBe(cb);
  });
});

describe("WsHandlerBuilder", () => {
  it("should chain connection, message, close, error handlers", () => {
    const config = ws()
      .on("ws://test")
      .onConnection(() => {})
      .onMessage(() => {})
      .onClose(() => {})
      .onError(() => {})
      .done()
      .build();

    const handler = config.handlers[0];
    expect(handler.onConnection).toBeDefined();
    expect(handler.onMessage).toBeDefined();
    expect(handler.onClose).toBeDefined();
    expect(handler.onError).toBeDefined();
  });
});

describe("WsMessageMatcher", () => {
  it("should match by type", () => {
    const matcher = WsMessageMatcher.byType("text");
    expect(matcher({ direction: "client", type: "text", data: "hello", timestamp: 0 })).toBe(true);
    expect(
      matcher({ direction: "client", type: "binary", data: Buffer.from("x"), timestamp: 0 }),
    ).toBe(false);
  });

  it("should match by content string", () => {
    const matcher = WsMessageMatcher.byContent("hello");
    expect(matcher({ direction: "client", type: "text", data: "hello world", timestamp: 0 })).toBe(
      true,
    );
    expect(matcher({ direction: "client", type: "text", data: "goodbye", timestamp: 0 })).toBe(
      false,
    );
  });

  it("should match by content regex", () => {
    const matcher = WsMessageMatcher.byContent(/hello/i);
    expect(matcher({ direction: "client", type: "text", data: "Hello World", timestamp: 0 })).toBe(
      true,
    );
    expect(matcher({ direction: "client", type: "text", data: "goodbye", timestamp: 0 })).toBe(
      false,
    );
  });

  it("should match by JSON field", () => {
    const matcher = WsMessageMatcher.byJsonField("type", "subscribe");
    const msg = {
      direction: "client" as const,
      type: "text" as const,
      data: JSON.stringify({ type: "subscribe", channel: "news" }),
      timestamp: 0,
    };
    expect(matcher(msg)).toBe(true);

    const msg2 = {
      direction: "client" as const,
      type: "text" as const,
      data: JSON.stringify({ type: "unsubscribe" }),
      timestamp: 0,
    };
    expect(matcher(msg2)).toBe(false);
  });

  it("should match by direction", () => {
    const matcher = WsMessageMatcher.byDirection("client");
    expect(matcher({ direction: "client", type: "text", data: "hi", timestamp: 0 })).toBe(true);
    expect(matcher({ direction: "server", type: "text", data: "hi", timestamp: 0 })).toBe(false);
  });
});

describe("MockWsConnection", () => {
  it("should create connection with url", () => {
    const conn = new MockWsConnection("ws://localhost:8080");
    expect(conn.url).toBe("ws://localhost:8080");
    expect(conn.state).toBe("open");
  });

  it("should send messages", () => {
    const conn = new MockWsConnection("ws://test");
    conn.send("hello");
    conn.send(Buffer.from("binary"));
    const messages = conn.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[0].direction).toBe("server");
    expect(messages[0].type).toBe("text");
    expect(messages[1].type).toBe("binary");
  });

  it("should simulate client messages", () => {
    const conn = new MockWsConnection("ws://test");
    conn.simulateMessage("hello from client");
    const messages = conn.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].direction).toBe("client");
  });

  it("should close connection", () => {
    const conn = new MockWsConnection("ws://test");
    conn.close(1000, "done");
    expect(conn.state).toBe("closed");
  });

  it("should broadcast messages", () => {
    const conn = new MockWsConnection("ws://test");
    conn.broadcast("hello everyone");
    const messages = conn.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].direction).toBe("server");
  });

  it("should set and call message handler", () => {
    const conn = new MockWsConnection("ws://test");
    const handler = vi.fn();
    conn.setMessageHandler(handler);
    conn.simulateMessage("test");
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("WsRecorder", () => {
  it("should start and stop recording", () => {
    const recorder = new WsRecorder();
    recorder.start();
    recorder.stop();
  });

  it("should record messages", () => {
    const recorder = new WsRecorder();
    recorder.start();
    recorder.record("ws://test", {
      direction: "client",
      type: "text",
      data: "hello",
      timestamp: Date.now(),
    });
    const recordings = recorder.getRecordings();
    expect(recordings.length).toBe(1);
    expect(recordings[0].messages.length).toBe(1);
  });

  it("should not record when stopped", () => {
    const recorder = new WsRecorder();
    recorder.record("ws://test", {
      direction: "client",
      type: "text",
      data: "hello",
      timestamp: Date.now(),
    });
    expect(recorder.getRecordings().length).toBe(0);
  });

  it("should export and import recordings", () => {
    const recorder = new WsRecorder();
    recorder.start();
    recorder.record("ws://test", {
      direction: "server",
      type: "text",
      data: "response",
      timestamp: Date.now(),
    });

    const exported = recorder.export();
    expect(() => JSON.parse(exported)).not.toThrow();

    const recorder2 = new WsRecorder();
    recorder2.import(exported);
    expect(recorder2.getRecording("ws://test")).toBeDefined();
  });

  it("should clear recordings", () => {
    const recorder = new WsRecorder();
    recorder.start();
    recorder.record("ws://test", {
      direction: "client",
      type: "text",
      data: "test",
      timestamp: Date.now(),
    });
    recorder.clear();
    expect(recorder.getRecordings().length).toBe(0);
  });
});
