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
      const analysis = generator.analyzePage(
        "https://example.com/login",
        "Login Page",
        SAMPLE_ARIA,
      );
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
      const analysis = generator.analyzePage(
        "https://example.com/xyz",
        "Page",
        `[e1] heading "Content"`,
      );
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

  describe("generateFromSitemap", () => {
    it("generates tests from URL list", async () => {
      const urls = [
        "https://example.com/login",
        "https://example.com/signup",
        "https://example.com/dashboard",
      ].join("\n");

      const result = await generator.generateFromSitemap(urls, { maxPages: 10 });
      expect(result.pagesAnalyzed).toBe(3);
      expect(result.suite.tests.length).toBeGreaterThan(0);
    });

    it("generates tests from XML sitemap", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/login</loc></url>
  <url><loc>https://example.com/signup</loc></url>
</urlset>`;

      const result = await generator.generateFromSitemap(xml, { maxPages: 10 });
      expect(result.pagesAnalyzed).toBe(2);
    });

    it("respects maxPages limit", async () => {
      const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/page${i}`).join("\n");
      const result = await generator.generateFromSitemap(urls, { maxPages: 5 });
      expect(result.pagesAnalyzed).toBe(5);
    });

    it("deduplicates URLs", async () => {
      const urls = ["https://example.com/login", "https://example.com/login"].join("\n");
      const result = await generator.generateFromSitemap(urls);
      expect(result.pagesAnalyzed).toBe(1);
    });

    it("skips invalid URLs", async () => {
      const urls = ["https://example.com/login", "not-a-url", "ftp://old.com"].join("\n");
      const result = await generator.generateFromSitemap(urls);
      expect(result.pagesAnalyzed).toBe(1);
    });

    it("filters by category when specified", async () => {
      const urls = ["https://example.com/login", "https://example.com/dashboard"].join("\n");

      const result = await generator.generateFromSitemap(urls, { categories: ["login"] });
      expect(result.pagesAnalyzed).toBe(1);
    });
  });

  describe("page type detection", () => {
    it("detects checkout page type", () => {
      const aria = `[e1] heading "Checkout"\n[e2] textbox "Card Number"\n[e3] button "Pay"`;
      const analysis = generator.analyzePage("https://example.com/checkout", "Checkout", aria);
      expect(analysis.pageType).toBe("checkout");
    });

    it("detects settings page type", () => {
      const aria = `[e1] heading "Settings"\n[e2] textbox "Name"\n[e3] button "Save"`;
      const analysis = generator.analyzePage("https://example.com/settings", "Settings", aria);
      expect(analysis.pageType).toBe("settings");
    });

    it("detects dashboard page type from URL", () => {
      const aria = `[e1] heading "Overview"\n[e2] link "Reports"`;
      const analysis = generator.analyzePage("https://example.com/dashboard", "Dashboard", aria);
      expect(analysis.pageType).toBe("dashboard");
    });

    it("detects listing page type from URL", () => {
      const aria = `[e1] heading "Products"\n[e2] link "Product 1"`;
      const analysis = generator.analyzePage("https://example.com/products", "Products", aria);
      expect(analysis.pageType).toBe("listing");
    });

    it("detects article page type from URL", () => {
      const aria = `[e1] heading "Blog Post"\n[e2] link "Read More"`;
      const analysis = generator.analyzePage("https://example.com/blog/post", "Blog", aria);
      expect(analysis.pageType).toBe("article");
    });
  });

  describe("YAML export", () => {
    it("includes all test metadata in YAML", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);
      const yaml = generator.toYAML(suite);

      expect(yaml).toContain("category:");
      expect(yaml).toContain("priority:");
      expect(yaml).toContain("action:");
      expect(yaml).toContain("description:");
    });

    it("includes URL and title in YAML header", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);
      const yaml = generator.toYAML(suite);

      expect(yaml).toContain("https://example.com/login");
      expect(yaml).toContain("Login Tests");
    });
  });

  describe("edge cases", () => {
    it("handles empty ARIA tree", () => {
      const analysis = generator.analyzePage("https://example.com", "Page", "");
      expect(analysis.elements).toHaveLength(0);
      expect(analysis.forms).toHaveLength(0);
      expect(analysis.navLinks).toHaveLength(0);
    });

    it("handles page with no interactive elements", () => {
      const aria = `[e1] heading "About Us"\n[e2] paragraph "We are awesome"`;
      const analysis = generator.analyzePage("https://example.com/about", "About", aria);
      const suite = generator.generate(analysis);
      expect(suite.tests.length).toBeGreaterThan(0);
    });

    it("generates tests with proper priority levels", () => {
      const analysis = generator.analyzePage("https://example.com/login", "Login", SAMPLE_ARIA);
      const suite = generator.generate(analysis);

      const priorities = new Set(suite.tests.map((t) => t.priority));
      expect(priorities.has("critical")).toBe(true);
    });
  });
});
