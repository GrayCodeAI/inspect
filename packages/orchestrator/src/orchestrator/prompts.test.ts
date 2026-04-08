import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Prompts } from "./prompts.js";

describe("Prompts", () => {
  let prompts: Prompts;

  beforeEach(() => {
    prompts = new Prompts();
  });

  describe("getSystemPrompt", () => {
    it("should return the system prompt for a given context", async () => {
      const prompt = await Effect.runPromise(
        prompts.getSystemPrompt({
          context: "test",
          agent: "claude",
          mode: "dom",
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("test");
      expect(prompt).toContain("claude");
      expect(prompt).toContain("dom");
    });

    it("should return different prompts based on agent", async () => {
      const claudePrompt = await Effect.runPromise(
        prompts.getSystemPrompt({
          context: "test",
          agent: "claude",
          mode: "dom",
        }),
      );
      const geminiPrompt = await Effect.runPromise(
        prompts.getSystemPrompt({
          context: "test",
          agent: "gemini",
          mode: "dom",
        }),
      );
      expect(claudePrompt).not.toEqual(geminiPrompt);
    });

    it("should handle unknown agents gracefully", async () => {
      const prompt = await Effect.runPromise(
        prompts.getSystemPrompt({
          context: "test",
          agent: "unknown",
          mode: "dom",
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("test");
    });
  });

  describe("getTestPlanPrompt", () => {
    it("should generate a test plan prompt based on execution config", async () => {
      const prompt = await Effect.runPromise(
        prompts.getTestPlanPrompt({
          instruction: "Test the login functionality",
          prompt: "Generate test steps for login",
          url: "http://example.com",
          browser: "chromium",
          mode: "dom",
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("Test the login functionality");
      expect(prompt).toContain("http://example.com");
    });

    it("should include accessibility and security settings if enabled", async () => {
      const prompt = await Effect.runPromise(
        prompts.getTestPlanPrompt({
          instruction: "Test the checkout flow",
          prompt: "Generate test steps for checkout",
          url: "http://example.com",
          browser: "chromium",
          mode: "dom",
          a11y: true,
          security: true,
          lighthouse: true,
        }),
      );
      expect(prompt).toContain("accessibility");
      expect(prompt).toContain("security");
      expect(prompt).toContain("performance");
    });
  });

  describe("getAgentPrompt", () => {
    it("should return an agent-specific prompt", async () => {
      const prompt = await Effect.runPromise(
        prompts.getAgentPrompt({
          agent: "claude",
          context: "Test the search functionality",
          mode: "dom",
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("claude");
      expect(prompt).toContain("Test the search functionality");
    });

    it("should include mode-specific instructions", async () => {
      const domPrompt = await Effect.runPromise(
        prompts.getAgentPrompt({
          agent: "claude",
          context: "Test the DOM interactions",
          mode: "dom",
        }),
      );
      expect(domPrompt).toContain("DOM mode");

      const hybridPrompt = await Effect.runPromise(
        prompts.getAgentPrompt({
          agent: "claude",
          context: "Test the hybrid flow",
          mode: "hybrid",
        }),
      );
      expect(hybridPrompt).toContain("hybrid mode");
    });
  });

  describe("getExecutionPrompt", () => {
    it("should generate a prompt for step execution", async () => {
      const prompt = await Effect.runPromise(
        prompts.getExecutionPrompt({
          step: {
            index: 0,
            description: "Navigate to URL",
            type: "navigate",
            targetArea: "header",
          },
          config: {
            instruction: "Test the navigation",
            prompt: "Generate navigation steps",
            url: "http://example.com",
            browser: "chromium",
            mode: "dom",
          },
          context: { currentUrl: "http://example.com", domSnapshot: "snapshot-data" },
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("Navigate to URL");
      expect(prompt).toContain("http://example.com");
    });

    it("should include context-specific instructions", async () => {
      const prompt = await Effect.runPromise(
        prompts.getExecutionPrompt({
          step: {
            index: 1,
            description: "Click submit button",
            type: "interact",
            targetArea: "form",
          },
          config: {
            instruction: "Test form submission",
            prompt: "Generate steps for form submission",
            url: "http://example.com",
            browser: "chromium",
            mode: "dom",
            a11y: true,
          },
          context: { currentUrl: "http://example.com/login", domSnapshot: "snapshot-data" },
        }),
      );
      expect(prompt).toContain("form submission");
      expect(prompt).toContain("accessibility");
    });
  });

  describe("getFlakinessPrompt", () => {
    it("should generate a prompt for handling flaky tests", async () => {
      const prompt = await Effect.runPromise(
        prompts.getFlakinessPrompt({
          testId: "login_test",
          failureType: "element_not_found",
          context: { url: "http://example.com", screenshot: "base64..." },
        }),
      );
      expect(prompt).toBeString();
      expect(prompt).toContain("login_test");
      expect(prompt).toContain("element_not_found");
    });

    it("should include recovery strategies", async () => {
      const prompt = await Effect.runPromise(
        prompts.getFlakinessPrompt({
          testId: "checkout_test",
          failureType: "timeout",
          context: { url: "http://example.com", screenshot: "base64..." },
        }),
      );
      expect(prompt).toContain("retry");
      expect(prompt).toContain("waitForLoad");
    });
  });
});
