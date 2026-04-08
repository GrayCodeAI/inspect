// ──────────────────────────────────────────────────────────────────────────────
// Natural Language Actions Integration Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chromium, type Page, type Browser } from "playwright";
import { createNLAct } from "./nl-act.js";
import { AriaSnapshotBuilder } from "../aria/aria-snapshot.js";

describe("createNLAct", () => {
  let browser: Browser;
  let page: Page;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterEach(async () => {
    await browser.close();
  });

  // Mock LLM for testing
  const createMockLLM = (responses: string[]) => {
    let index = 0;
    return async (): Promise<string> => {
      const response = responses[index % responses.length];
      index++;
      return response;
    };
  };

  const createSnapshot = async (p: Page) => {
    const builder = new AriaSnapshotBuilder();
    await builder.buildTree(p);
    return {
      text: builder.getFormattedTree(),
      url: p.url(),
      title: await p.title(),
    };
  };

  describe("act()", () => {
    it("should execute click action", async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "click",
          target: "#btn",
          reasoning: "Button found",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("click the button");

      expect(result.success).toBe(true);

      // Verify click happened
      const resultText = await page.textContent("#result");
      expect(resultText).toBe("Clicked!");
    });

    it("should execute fill action", async () => {
      await page.setContent(`
        <html>
          <body>
            <input type="text" id="name" placeholder="Enter name" />
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "fill",
          target: "#name",
          value: "John Doe",
          reasoning: "Input field found",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("type John Doe in the name field");

      expect(result.success).toBe(true);

      // Verify fill happened
      const inputValue = await page.inputValue("#name");
      expect(inputValue).toBe("John Doe");
    });

    it("should execute goto action", async () => {
      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "goto",
          value: "https://example.com",
          reasoning: "Navigate to example.com",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("go to example.com");

      expect(result.success).toBe(true);
      expect(page.url()).toBe("https://example.com/");
    });

    it("should handle navigation to different URL", async () => {
      await page.goto("https://example.com");

      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "goto",
          value: "https://httpbin.org/html",
          reasoning: "Navigate to httpbin",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("navigate to httpbin");

      expect(result.success).toBe(true);
      expect(page.url()).toBe("https://httpbin.org/html");
    });

    it("should return error for unknown actions", async () => {
      await page.setContent(`<html><body></body></html>`);

      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "unknown_action",
          reasoning: "Unknown action",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("do something weird");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown action");
    });

    it("should handle LLM errors gracefully", async () => {
      const failingLLM = async (): Promise<string> => {
        throw new Error("LLM API error");
      };

      const nl = createNLAct(page, {
        llm: failingLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("click something");

      expect(result.success).toBe(false);
      expect(result.error).toContain("LLM API error");
    });
  });

  describe("extract()", () => {
    it("should extract data from page", async () => {
      await page.setContent(`
        <html>
          <body>
            <h1>Product Name</h1>
            <p class="price">$99.99</p>
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([
        JSON.stringify({
          productName: "Product Name",
          price: "$99.99",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.extract("get product name and price");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        productName: "Product Name",
        price: "$99.99",
      });
    });

    it("should handle extraction with schema", async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="user">
              <span class="name">Alice</span>
              <span class="age">30</span>
            </div>
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([
        JSON.stringify({
          name: "Alice",
          age: 30,
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.extract("get user info", {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("name");
      expect(result.data).toHaveProperty("age");
    });

    it("should handle invalid JSON response", async () => {
      await page.setContent(`<html><body></body></html>`);

      const mockLLM = createMockLLM(["not valid json"]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.extract("get data");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse");
    });
  });

  describe("validate()", () => {
    it("should return true for valid conditions", async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="success">Success!</div>
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([JSON.stringify({ valid: true })]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.validate("is success message visible");

      expect(result).toBe(true);
    });

    it("should return false for invalid conditions", async () => {
      await page.setContent(`<html><body></body></html>`);

      const mockLLM = createMockLLM([JSON.stringify({ valid: false })]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.validate("is error visible");

      expect(result).toBe(false);
    });

    it("should handle malformed validation responses", async () => {
      await page.setContent(`<html><body></body></html>`);

      const mockLLM = createMockLLM(["invalid response"]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.validate("check something");

      // Should default to false on error
      expect(result).toBe(false);
    });
  });

  describe("integration with real page", () => {
    it("should work with dynamic content", async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="add">Add Item</button>
            <ul id="list"></ul>
            <script>
              let count = 0;
              document.getElementById('add').addEventListener('click', () => {
                count++;
                const li = document.createElement('li');
                li.textContent = 'Item ' + count;
                document.getElementById('list').appendChild(li);
              });
            </script>
          </body>
        </html>
      `);

      const mockLLM = createMockLLM([
        JSON.stringify({
          action: "click",
          target: "#add",
          reasoning: "Add button found",
        }),
      ]);

      const nl = createNLAct(page, {
        llm: mockLLM,
        snapshot: () => createSnapshot(page),
      });

      const result = await nl.act("click add button");

      expect(result.success).toBe(true);

      // Verify item was added
      const items = await page.locator("#list li").count();
      expect(items).toBe(1);
    });
  });
});
