import { describe, it, expect, vi } from "vitest";
import { ActHandler } from "./act.js";
import type { LLMClient, PageInterface, ActionCacheInterface } from "./act.js";
import type { PageSnapshot } from "@inspect/shared";

/** Create a mock page with configurable behavior */
function createMockPage(overrides?: Partial<PageInterface>): PageInterface {
  const snapshot: PageSnapshot = {
    url: "https://example.com/login",
    title: "Login Page",
    elements: [
      { ref: "e1", role: "button", name: "Login", tagName: "button", interactable: true, visible: true, value: "" },
      { ref: "e2", role: "textbox", name: "Email", tagName: "input", interactable: true, visible: true, value: "" },
      { ref: "e3", role: "textbox", name: "Password", tagName: "input", interactable: true, visible: true, value: "" },
    ],
    timestamp: Date.now(),
  } as PageSnapshot;

  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    scrollTo: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    uncheck: vi.fn().mockResolvedValue(undefined),
    url: () => "https://example.com/login",
    ...overrides,
  };
}

/** Create a mock LLM that returns a specified action */
function createMockLLM(response: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
  };
}

describe("ActHandler.execute", () => {
  it("resolves and executes a click action via LLM", async () => {
    const llm = createMockLLM('{"type":"click","ref":"e1","description":"Click login button"}');
    const page = createMockPage();
    const handler = new ActHandler(llm);

    const result = await handler.execute(page, "Click the Login button");

    expect(result.success).toBe(true);
    expect(result.action?.type).toBe("click");
    expect(result.action?.target).toBe("e1");
    expect(result.cacheHit).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(page.click).toHaveBeenCalledWith("e1");
  });

  it("resolves and executes a fill action", async () => {
    const llm = createMockLLM('{"type":"fill","ref":"e2","value":"user@test.com","description":"Type email"}');
    const page = createMockPage();
    const handler = new ActHandler(llm);

    const result = await handler.execute(page, "Type email address");

    expect(result.success).toBe(true);
    expect(result.action?.type).toBe("fill");
    expect(page.fill).toHaveBeenCalledWith("e2", "user@test.com");
  });

  it("tracks token usage", async () => {
    const llm = createMockLLM('{"type":"click","ref":"e1"}');
    const page = createMockPage();
    const handler = new ActHandler(llm);

    const result = await handler.execute(page, "Click login");

    expect(result.tokenUsage.promptTokens).toBe(100);
    expect(result.tokenUsage.completionTokens).toBe(50);
  });

  it("returns failure when LLM returns invalid JSON", async () => {
    const llm = createMockLLM("I cannot determine what to click");
    const page = createMockPage();
    const handler = new ActHandler(llm, { defaultTimeout: 1000 });

    const result = await handler.execute(page, "Click something", { maxRetries: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("retries on action failure with self-healing", async () => {
    const llm = {
      chat: vi.fn()
        .mockResolvedValueOnce({
          content: '{"type":"click","ref":"e99"}',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValueOnce({
          content: '{"type":"click","ref":"e1"}',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
    };

    const page = createMockPage({
      click: vi.fn()
        .mockRejectedValueOnce(new Error("Element not found"))
        .mockResolvedValueOnce(undefined),
    });

    const handler = new ActHandler(llm);
    const result = await handler.execute(page, "Click login", { maxRetries: 1 });

    expect(result.success).toBe(true);
    expect(result.healed).toBe(true);
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it("substitutes variables in instruction", async () => {
    const llm = createMockLLM('{"type":"fill","ref":"e2","value":"alice@test.com"}');
    const page = createMockPage();
    const handler = new ActHandler(llm);

    await handler.execute(page, "Type {{email}} in the email field", {
      variables: { email: "alice@test.com" },
    });

    // The LLM should receive the resolved instruction
    const chatCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const prompt = chatCall[0][0].content;
    expect(prompt).toContain("alice@test.com");
    expect(prompt).not.toContain("{{email}}");
  });

  it("uses cache on second call with same instruction and URL", async () => {
    const llm = createMockLLM('{"type":"click","ref":"e1","description":"Click login"}');
    const cache: ActionCacheInterface = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };
    const page = createMockPage();
    const handler = new ActHandler(llm, { cache });

    // First call — LLM used, result cached
    const r1 = await handler.execute(page, "Click login");
    expect(r1.success).toBe(true);
    expect(r1.cacheHit).toBe(false);
    expect(cache.set).toHaveBeenCalled();

    // Simulate cache returning the stored action
    const storedAction = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0][1];
    (cache.get as ReturnType<typeof vi.fn>).mockReturnValue(storedAction);

    // Second call — cache hit, no LLM call
    const r2 = await handler.execute(page, "Click login");
    expect(r2.success).toBe(true);
    expect(r2.cacheHit).toBe(true);
    expect(llm.chat).toHaveBeenCalledTimes(1); // still just 1 call
  });

  it("falls through cache when cached action fails", async () => {
    const llm = createMockLLM('{"type":"click","ref":"e1"}');
    const cache: ActionCacheInterface = {
      get: vi.fn().mockReturnValue({
        action: { type: "click", target: "e_stale", description: "old", timestamp: 0 },
      }),
      set: vi.fn(),
    };

    const page = createMockPage({
      click: vi.fn()
        .mockRejectedValueOnce(new Error("Element not found")) // cache miss
        .mockResolvedValueOnce(undefined), // LLM resolution works
    });

    const handler = new ActHandler(llm, { cache });
    const result = await handler.execute(page, "Click login", { maxRetries: 0 });

    expect(result.success).toBe(true);
    expect(result.cacheHit).toBe(false);
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });

  it("returns failure after all retries exhausted", async () => {
    const llm: LLMClient = {
      chat: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    };
    const page = createMockPage();
    const handler = new ActHandler(llm);

    const result = await handler.execute(page, "Do something", { maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM unavailable");
  });
});
