import { describe, it, expect } from "vitest";
import { TestGenerator } from "./generator.js";
import type { PageAnalysis } from "./generator.js";

describe("TestGenerator", () => {
  const generator = new TestGenerator();

  const SAMPLE_ARIA = `
[e1] heading "Welcome" (level=1)
[e2] link "Home"
[e3] link "About"
[e4] link "Contact"
[e5] textbox "Email"
[e6] textbox "Password"
[e7] button "Sign In"
`.trim();

  describe("analyzePage", () => {
    it("extracts elements from ARIA tree", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login Page", SAMPLE_ARIA);
      expect(analysis.elements.length).toBeGreaterThan(0);
      expect(analysis.elements[0].ref).toBe("e1");
      expect(analysis.elements[0].role).toBe("heading");
    });

    it("detects login page type", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      expect(analysis.pageType).toBe("login");
    });

    it("detects forms with fields", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      expect(analysis.forms.length).toBeGreaterThan(0);
      expect(analysis.forms[0].fields.length).toBe(2);
    });

    it("detects navigation links", () => {
      const analysis = generator.analyzePage("https://example.com", "Home", SAMPLE_ARIA);
      expect(analysis.navLinks).toContain("Home");
      expect(analysis.navLinks).toContain("About");
    });

    it("detects sections from headings", () => {
      const analysis = generator.analyzePage("https://example.com", "Home", SAMPLE_ARIA);
      expect(analysis.sections).toContain("Welcome");
    });

    it("detects signup page type", () => {
      const signupAria = `[e1] heading "Create Account"\n[e2] textbox "Name"\n[e3] textbox "Email"\n[e4] button "Register"`;
      const analysis = generator.analyzePage("https://example.com/register", "Sign Up", signupAria);
      expect(analysis.pageType).toBe("signup");
    });

    it("detects search page type", () => {
      const searchAria = `[e1] searchbox "Search"\n[e2] button "Search"`;
      const analysis = generator.analyzePage("https://example.com/search", "Search", searchAria);
      expect(analysis.pageType).toBe("search");
    });

    it("returns unknown for ambiguous pages", () => {
      const analysis = generator.analyzePage("https://example.com/xyz", "Page", `[e1] heading "Content"`);
      expect(analysis.pageType).toBe("unknown");
    });
  });

  describe("generate", () => {
    it("generates tests for login page", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      expect(suite.tests.length).toBeGreaterThan(0);
      expect(suite.pageType).toBe("login");
      expect(suite.url).toBe("https://example.com/login");

      const testNames = suite.tests.map((t) => t.name);
      expect(testNames).toContain("Valid login succeeds");
      expect(testNames).toContain("Invalid password shows error");
      expect(testNames).toContain("Page loads successfully");
    });

    it("generates navigation tests for any page", () => {
      const analysis = generator.analyzePage("https://example.com", "Home", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      const navTests = suite.tests.filter((t) => t.category === "navigation");
      expect(navTests.length).toBeGreaterThan(0);
    });

    it("generates accessibility tests for any page", () => {
      const analysis = generator.analyzePage("https://example.com", "Home", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      const a11yTests = suite.tests.filter((t) => t.category === "accessibility");
      expect(a11yTests.length).toBeGreaterThan(0);
    });

    it("generates form validation tests when forms exist", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      const formTests = suite.tests.filter((t) => t.category === "form-validation");
      expect(formTests.length).toBeGreaterThan(0);
    });

    it("every test has steps and assertions", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      for (const test of suite.tests) {
        expect(test.steps.length).toBeGreaterThan(0);
        expect(test.assertions.length).toBeGreaterThan(0);
        expect(test.name).toBeTruthy();
        expect(test.category).toBeTruthy();
        expect(test.priority).toBeTruthy();
      }
    });
  });

  describe("toYAML", () => {
    it("produces valid YAML-like output", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);
      const yaml = generator.toYAML(suite);

      expect(yaml).toContain("name:");
      expect(yaml).toContain("url:");
      expect(yaml).toContain("tests:");
      expect(yaml).toContain("steps:");
      expect(yaml).toContain("assertions:");
    });
  });

  describe("toInstructions", () => {
    it("produces one instruction per test", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);
      const instructions = generator.toInstructions(suite);

      expect(instructions.length).toBe(suite.tests.length);
      for (const inst of instructions) {
        expect(inst.length).toBeGreaterThan(10);
      }
    });
  });
});
