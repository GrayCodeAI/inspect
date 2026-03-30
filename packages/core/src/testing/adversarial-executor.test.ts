import { describe, it, expect, beforeEach } from "vitest";
import { AdversarialExecutor } from "./adversarial-executor.js";

describe("AdversarialExecutor", () => {
  let executor: AdversarialExecutor;

  beforeEach(() => {
    executor = new AdversarialExecutor();
  });

  describe("generateAdversarialSteps", () => {
    it("should generate steps for basic intensity", () => {
      const steps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "basic",
        inputFields: [
          { ref: "e1", role: "textbox", name: "Email", type: "email" },
          { ref: "e2", role: "textbox", name: "Password", type: "password" },
        ],
      });

      expect(steps.length).toBeGreaterThan(0);
      // Should start with navigation
      expect(steps[0].type).toBe("navigate");
      // Should include boundary tests
      const boundarySteps = steps.filter(
        (s) => s.description.includes("empty") || s.description.includes("long input"),
      );
      expect(boundarySteps.length).toBeGreaterThan(0);
    });

    it("should generate more steps for standard intensity", () => {
      const basicSteps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "basic",
        inputFields: [{ ref: "e1", role: "textbox", name: "Username" }],
      });

      const standardSteps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "standard",
        inputFields: [{ ref: "e1", role: "textbox", name: "Username" }],
      });

      expect(standardSteps.length).toBeGreaterThan(basicSteps.length);
    });

    it("should generate the most steps for aggressive intensity", () => {
      const standardSteps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "standard",
        inputFields: [{ ref: "e1", role: "textbox", name: "Username" }],
      });

      const aggressiveSteps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "aggressive",
        inputFields: [{ ref: "e1", role: "textbox", name: "Username" }],
      });

      expect(aggressiveSteps.length).toBeGreaterThan(standardSteps.length);

      // Aggressive should include race condition tests
      const raceSteps = aggressiveSteps.filter(
        (s) => s.description.includes("Double-click") || s.description.includes("concurrent"),
      );
      expect(raceSteps.length).toBeGreaterThan(0);
    });

    it("should respect maxSteps limit", () => {
      const steps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "aggressive",
        maxSteps: 10,
        inputFields: [{ ref: "e1", role: "textbox", name: "Username" }],
      });

      expect(steps.length).toBeLessThanOrEqual(10);
    });

    it("should include assertions on steps", () => {
      const steps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "basic",
        inputFields: [{ ref: "e1", role: "textbox", name: "Email", type: "email" }],
      });

      const stepsWithAssertions = steps.filter((s) => s.assertion);
      expect(stepsWithAssertions.length).toBeGreaterThan(0);
    });

    it("should work without input fields", () => {
      const steps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "aggressive",
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].type).toBe("navigate");
    });

    it("should generate email-specific boundary tests", () => {
      const steps = executor.generateAdversarialSteps({
        url: "http://localhost:3000",
        intensity: "basic",
        inputFields: [{ ref: "e1", role: "textbox", name: "Email", type: "email" }],
      });

      const emailStep = steps.find((s) => s.description.includes("invalid email"));
      expect(emailStep).toBeDefined();
    });
  });

  describe("getAdversarialSystemPrompt", () => {
    it("should return a prompt with adversarial mindset", () => {
      const prompt = executor.getAdversarialSystemPrompt({
        url: "http://localhost:3000",
        intensity: "standard",
      });

      expect(prompt).toContain("adversarial");
      expect(prompt).toContain("STANDARD");
      expect(prompt).toContain("Boundary Testing");
      expect(prompt).toContain("Injection Testing");
    });

    it("should include intensity-specific instructions", () => {
      const basicPrompt = executor.getAdversarialSystemPrompt({
        url: "http://localhost:3000",
        intensity: "basic",
      });

      const aggressivePrompt = executor.getAdversarialSystemPrompt({
        url: "http://localhost:3000",
        intensity: "aggressive",
      });

      expect(basicPrompt).toContain("BASIC");
      expect(aggressivePrompt).toContain("AGGRESSIVE");
      expect(aggressivePrompt).toContain("Race Conditions");
    });
  });

  describe("formatFindings", () => {
    it("should return no-findings message for empty array", () => {
      const report = executor.formatFindings([]);
      expect(report).toContain("No adversarial findings");
    });

    it("should format findings grouped by severity", () => {
      const report = executor.formatFindings([
        {
          severity: "critical",
          category: "security",
          instruction: "Test XSS in search",
          finding: "Reflected XSS via search parameter",
          steps: ["Navigate to /search", "Enter <script>alert(1)</script>", "Submit"],
          expected: "Input escaped",
          actual: "Script executed",
        },
        {
          severity: "low",
          category: "ux",
          instruction: "Test empty form",
          finding: "No validation message for empty email",
          steps: ["Submit form with empty email"],
          expected: "Validation error shown",
          actual: "No error message",
        },
      ]);

      expect(report).toContain("CRITICAL");
      expect(report).toContain("LOW");
      expect(report).toContain("Reflected XSS");
      expect(report).toContain("Steps to reproduce");
    });
  });
});
