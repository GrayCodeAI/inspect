import { describe, it, expect, beforeEach } from "vitest";
import { MessageManager } from "./short-term.js";

describe("MessageManager", () => {
  let manager: MessageManager;

  beforeEach(() => {
    manager = new MessageManager({ charsPerToken: 4 });
  });

  describe("add and getHistory", () => {
    it("roundtrips a user message", () => {
      manager.add({ role: "user", content: "hello" });
      const history = manager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("hello");
    });

    it("preserves message order", () => {
      manager.addUser("question");
      manager.addAssistant("answer");
      manager.addUser("follow-up");

      const history = manager.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("assistant");
      expect(history[2].role).toBe("user");
    });

    it("returns a copy that does not affect internal state", () => {
      manager.addUser("test");
      const history = manager.getHistory();
      history.push({ role: "assistant", content: "injected" });
      expect(manager.getHistory().length).toBe(1);
    });
  });

  describe("addUser / addAssistant / addSystem", () => {
    it("adds user messages with correct role", () => {
      manager.addUser("user message");
      expect(manager.getHistory()[0].role).toBe("user");
    });

    it("adds assistant messages with correct role", () => {
      manager.addAssistant("assistant response");
      expect(manager.getHistory()[0].role).toBe("assistant");
    });

    it("adds system messages with correct role", () => {
      manager.addSystem("system prompt");
      expect(manager.getHistory()[0].role).toBe("system");
    });
  });

  describe("addToolResult", () => {
    it("adds a tool message", () => {
      manager.addToolResult("result data");
      const msg = manager.getHistory()[0];
      expect(msg.role).toBe("tool");
      expect(msg.content).toBe("result data");
    });
  });

  describe("estimateTokens", () => {
    it("returns a reasonable positive number for non-empty messages", () => {
      manager.addUser("This is a test message with some content.");
      const tokens = manager.estimateTokens();
      expect(tokens).toBeGreaterThan(0);
    });

    it("returns 0 for empty conversation", () => {
      expect(manager.estimateTokens()).toBe(0);
    });

    it("increases with more messages", () => {
      manager.addUser("first");
      const t1 = manager.estimateTokens();
      manager.addUser("second message that is a bit longer");
      const t2 = manager.estimateTokens();
      expect(t2).toBeGreaterThan(t1);
    });
  });

  describe("clear", () => {
    it("empties all messages", () => {
      manager.addUser("one");
      manager.addAssistant("two");
      manager.addUser("three");
      expect(manager.length).toBe(3);

      manager.clear();
      expect(manager.length).toBe(0);
      expect(manager.getHistory()).toEqual([]);
    });
  });

  describe("length", () => {
    it("returns the correct message count", () => {
      expect(manager.length).toBe(0);
      manager.addUser("a");
      expect(manager.length).toBe(1);
      manager.addAssistant("b");
      expect(manager.length).toBe(2);
    });
  });

  describe("getRecent", () => {
    it("returns only the most recent N messages", () => {
      manager.addUser("1");
      manager.addAssistant("2");
      manager.addUser("3");
      manager.addAssistant("4");

      const recent = manager.getRecent(2);
      expect(recent.length).toBe(2);
      expect(recent[0].content).toBe("3");
      expect(recent[1].content).toBe("4");
    });
  });

  describe("removeLast", () => {
    it("removes and returns the last message", () => {
      manager.addUser("first");
      manager.addAssistant("second");

      const removed = manager.removeLast();
      expect(removed!.content).toBe("second");
      expect(manager.length).toBe(1);
    });

    it("returns undefined when history is empty", () => {
      expect(manager.removeLast()).toBeUndefined();
    });
  });

  describe("findByRole", () => {
    it("returns only messages matching the role", () => {
      manager.addUser("q1");
      manager.addAssistant("a1");
      manager.addUser("q2");
      manager.addAssistant("a2");

      const userMsgs = manager.findByRole("user");
      expect(userMsgs.length).toBe(2);
      expect(userMsgs.every((m) => m.role === "user")).toBe(true);
    });
  });

  describe("compact", () => {
    it("replaces old messages with a summary", () => {
      const mgr = new MessageManager({ preserveRecent: 2 });
      mgr.addUser("old1");
      mgr.addAssistant("old2");
      mgr.addUser("old3");
      mgr.addAssistant("recent1");
      mgr.addUser("recent2");

      mgr.compact("Summary of first 3 messages");

      const history = mgr.getHistory();
      // Should be: summary message + 2 recent messages
      expect(history.length).toBe(3);
      expect(history[0].role).toBe("system");
      expect(history[0].content).toContain("Summary");
      expect(history[1].content).toBe("recent1");
      expect(history[2].content).toBe("recent2");
    });

    it("does nothing when message count is within preserveRecent", () => {
      const mgr = new MessageManager({ preserveRecent: 10 });
      mgr.addUser("one");
      mgr.addAssistant("two");
      mgr.compact("unused summary");
      expect(mgr.length).toBe(2);
    });
  });

  describe("needsCompaction", () => {
    it("returns false for small conversations", () => {
      manager.addUser("short");
      expect(manager.needsCompaction()).toBe(false);
    });
  });
});
