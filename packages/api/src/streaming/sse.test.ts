import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SSEManager } from "./sse.js";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";

/**
 * Create a mock ServerResponse that captures written data.
 * Inherits from EventEmitter so .on("close", ...) works.
 */
function mockServerResponse(): ServerResponse & {
  _written: string[];
  _headers: Record<string, string | number>;
  _ended: boolean;
} {
  const emitter = new EventEmitter();
  const mock: any = Object.assign(emitter, {
    _written: [] as string[],
    _headers: {} as Record<string, string | number>,
    _ended: false,
    writableEnded: false,
    writeHead(statusCode: number, headers: Record<string, string>) {
      mock._headers = { ...mock._headers, statusCode, ...headers };
    },
    write(chunk: string) {
      mock._written.push(chunk);
      return true;
    },
    end() {
      mock._ended = true;
      mock.writableEnded = true;
    },
  });
  return mock;
}

describe("SSEManager", () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager({ autoStart: false });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe("client management", () => {
    it("adds a client and returns a unique ID", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res);

      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe("string");
      expect(clientId.length).toBeGreaterThan(0);
      expect(manager.getClientCount()).toBe(1);
    });

    it("sets SSE headers on the response", () => {
      const res = mockServerResponse();
      manager.addClient(res);

      expect(res._headers["Content-Type"]).toBe("text/event-stream");
      expect(res._headers["Cache-Control"]).toBe("no-cache");
      expect(res._headers["Connection"]).toBe("keep-alive");
    });

    it("sends a connected event on add", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res);

      // The first write should be the connected event
      expect(res._written.length).toBeGreaterThanOrEqual(1);
      const connectedMsg = res._written[0];
      expect(connectedMsg).toContain("event: connected");
      expect(connectedMsg).toContain(clientId);
    });

    it("removes a client", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res);
      expect(manager.getClientCount()).toBe(1);

      const removed = manager.removeClient(clientId);
      expect(removed).toBe(true);
      expect(manager.getClientCount()).toBe(0);
      expect(res._ended).toBe(true);
    });

    it("returns false when removing a non-existent client", () => {
      expect(manager.removeClient("nonexistent-id")).toBe(false);
    });

    it("tracks multiple clients independently", () => {
      const res1 = mockServerResponse();
      const res2 = mockServerResponse();
      const id1 = manager.addClient(res1);
      const id2 = manager.addClient(res2);

      expect(id1).not.toBe(id2);
      expect(manager.getClientCount()).toBe(2);
      expect(manager.getClientIds()).toContain(id1);
      expect(manager.getClientIds()).toContain(id2);
    });

    it("cleans up when a client connection closes", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res);
      expect(manager.getClientCount()).toBe(1);

      // Simulate the connection closing
      (res as EventEmitter).emit("close");
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("event broadcasting", () => {
    it("broadcasts an event to all clients", () => {
      const res1 = mockServerResponse();
      const res2 = mockServerResponse();
      manager.addClient(res1);
      manager.addClient(res2);

      const sentCount = manager.broadcast("update", { version: 2 });

      expect(sentCount).toBe(2);
      // Both responses should have received the broadcast (beyond the initial connected event)
      expect(res1._written.length).toBeGreaterThan(1);
      expect(res2._written.length).toBeGreaterThan(1);

      const lastWrite1 = res1._written[res1._written.length - 1];
      expect(lastWrite1).toContain("event: update");
      expect(lastWrite1).toContain('"version":2');
    });

    it("sends to a specific client by ID", () => {
      const res1 = mockServerResponse();
      const res2 = mockServerResponse();
      const id1 = manager.addClient(res1);
      manager.addClient(res2);

      const success = manager.sendToClient(id1, "private", { msg: "hello" });

      expect(success).toBe(true);
      // res1 should have 2 writes (connected + private), res2 only 1 (connected)
      expect(res1._written.length).toBe(2);
      expect(res2._written.length).toBe(1);
    });

    it("returns false when sending to a non-existent client", () => {
      expect(manager.sendToClient("nonexistent", "test", {})).toBe(false);
    });

    it("returns 0 when broadcasting with no clients", () => {
      expect(manager.broadcast("test", {})).toBe(0);
    });
  });

  describe("channel filtering", () => {
    it("only sends to clients subscribed to the channel", () => {
      const res1 = mockServerResponse();
      const res2 = mockServerResponse();
      manager.addClient(res1, ["logs"]);
      manager.addClient(res2, ["metrics"]);

      const sent = manager.broadcast("data", { value: 1 }, "logs");

      expect(sent).toBe(1);
      // res1 is on "logs" channel - should receive
      expect(res1._written.length).toBe(2);
      // res2 is on "metrics" channel - should not receive
      expect(res2._written.length).toBe(1);
    });

    it("sends to wildcard clients regardless of channel", () => {
      const resWild = mockServerResponse();
      const resSpecific = mockServerResponse();
      manager.addClient(resWild); // defaults to "*" channel
      manager.addClient(resSpecific, ["alerts"]);

      const sent = manager.broadcast("event", {}, "alerts");

      expect(sent).toBe(2);
    });

    it("subscribes and unsubscribes clients from channels", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res, ["initial"]);

      // Subscribe to a new channel
      expect(manager.subscribe(clientId, "new-channel")).toBe(true);

      // Verify via getClientInfo
      const info = manager.getClientInfo(clientId);
      expect(info).toBeDefined();
      expect(info!.channels.has("new-channel")).toBe(true);
      expect(info!.channels.has("initial")).toBe(true);

      // Unsubscribe
      expect(manager.unsubscribe(clientId, "initial")).toBe(true);
      const infoAfter = manager.getClientInfo(clientId);
      expect(infoAfter!.channels.has("initial")).toBe(false);
    });

    it("returns false when subscribing/unsubscribing non-existent client", () => {
      expect(manager.subscribe("bad-id", "ch")).toBe(false);
      expect(manager.unsubscribe("bad-id", "ch")).toBe(false);
    });
  });

  describe("client info", () => {
    it("returns detailed client info", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res, ["ch1"]);

      const info = manager.getClientInfo(clientId);
      expect(info).toBeDefined();
      expect(info!.id).toBe(clientId);
      expect(info!.connectedAt).toBeLessThanOrEqual(Date.now());
      expect(info!.eventCount).toBe(0);
      expect(info!.channels.has("ch1")).toBe(true);
    });

    it("returns undefined for non-existent client", () => {
      expect(manager.getClientInfo("nope")).toBeUndefined();
    });

    it("increments eventCount on broadcasts", () => {
      const res = mockServerResponse();
      const clientId = manager.addClient(res);

      manager.broadcast("a", {});
      manager.broadcast("b", {});
      manager.sendToClient(clientId, "c", {});

      const info = manager.getClientInfo(clientId);
      expect(info!.eventCount).toBe(3);
    });
  });

  describe("destroy", () => {
    it("removes all clients and stops keep-alive", () => {
      const res1 = mockServerResponse();
      const res2 = mockServerResponse();
      manager.addClient(res1);
      manager.addClient(res2);

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(res1._ended).toBe(true);
      expect(res2._ended).toBe(true);
    });
  });
});
