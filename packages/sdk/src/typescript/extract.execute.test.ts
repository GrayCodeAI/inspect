import { describe, it, expect, vi } from "vitest";
import { ExtractHandler } from "./extract.js";
import type { LLMClient, PageInterface } from "./act.js";
import type { SchemaLike } from "./extract.js";
import type { PageSnapshot } from "@inspect/shared";

function createMockPage(): PageInterface {
  const snapshot: PageSnapshot = {
    url: "https://example.com/products",
    title: "Products Page",
    elements: [
      { ref: "e1", role: "heading", name: "Product List", tagName: "h1", interactable: false, visible: true, value: "" },
      { ref: "e2", role: "listitem", name: "Widget A - $10", tagName: "li", interactable: false, visible: true, value: "" },
      { ref: "e3", role: "listitem", name: "Widget B - $20", tagName: "li", interactable: false, visible: true, value: "" },
    ],
    timestamp: Date.now(),
  } as PageSnapshot;

  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    click: vi.fn(),
    fill: vi.fn(),
    selectOption: vi.fn(),
    hover: vi.fn(),
    press: vi.fn(),
    scrollTo: vi.fn(),
    check: vi.fn(),
    uncheck: vi.fn(),
    url: () => "https://example.com/products",
  };
}

function createMockLLM(response: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    }),
  };
}

describe("ExtractHandler.execute", () => {
  it("extracts structured JSON data from page", async () => {
    const llm = createMockLLM('{"products":[{"name":"Widget A","price":10},{"name":"Widget B","price":20}]}');
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Extract product names and prices");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      products: [
        { name: "Widget A", price: 10 },
        { name: "Widget B", price: 20 },
      ],
    });
    expect(result.attempts).toBe(1);
  });

  it("tracks token usage across attempts", async () => {
    const llm = createMockLLM('{"count": 2}');
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Count products");

    expect(result.tokenUsage.promptTokens).toBe(200);
    expect(result.tokenUsage.completionTokens).toBe(100);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("validates against schema when provided", async () => {
    const llm = createMockLLM('{"name":"Widget A","price":10}');
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const schema: SchemaLike = {
      parse: (data: unknown) => data,
      safeParse: (data: unknown) => {
        const d = data as Record<string, unknown>;
        if (typeof d.name === "string" && typeof d.price === "number") {
          return { success: true, data };
        }
        return { success: false, error: { message: "Invalid shape" } };
      },
    };

    const result = await handler.execute(page, "Extract first product", { schema });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Widget A", price: 10 });
  });

  it("retries when schema validation fails", async () => {
    const llm = {
      chat: vi.fn()
        .mockResolvedValueOnce({
          content: '{"wrong":"format"}',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValueOnce({
          content: '{"name":"Widget A","price":10}',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
    };

    const schema: SchemaLike = {
      parse: (data: unknown) => data,
      safeParse: (data: unknown) => {
        const d = data as Record<string, unknown>;
        if (typeof d.name === "string" && typeof d.price === "number") {
          return { success: true, data };
        }
        return { success: false, error: { message: "Missing name/price" } };
      },
    };

    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Extract product", { schema, maxRetries: 2 });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it("extracts JSON from markdown code blocks", async () => {
    const llm = createMockLLM('```json\n{"items": ["a", "b"]}\n```');
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Extract items");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ items: ["a", "b"] });
  });

  it("returns failure when LLM returns no JSON after all retries", async () => {
    const llm = createMockLLM("I could not extract the data you requested.");
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Extract data", { maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("returns failure when LLM throws", async () => {
    const llm: LLMClient = {
      chat: vi.fn().mockRejectedValue(new Error("API rate limited")),
    };
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Extract data", { maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API rate limited");
  });

  it("accumulates tokens across retries", async () => {
    const llm = {
      chat: vi.fn()
        .mockResolvedValueOnce({
          content: "not json",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValueOnce({
          content: '{"ok": true}',
          usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
        }),
    };
    const page = createMockPage();
    const handler = new ExtractHandler(llm);

    const result = await handler.execute(page, "Check", { maxRetries: 2 });

    expect(result.success).toBe(true);
    expect(result.tokenUsage.promptTokens).toBe(220);
    expect(result.tokenUsage.completionTokens).toBe(110);
  });
});
