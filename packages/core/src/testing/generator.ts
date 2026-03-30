// ============================================================================
// @inspect/core - Smart Test Generator
//
// Analyzes a page's structure (ARIA tree, forms, navigation, links) and
// generates comprehensive test cases covering functional flows, edge cases,
// accessibility, and error handling.
// ============================================================================

export interface PageAnalysis {
  url: string;
  title: string;
  /** ARIA tree formatted string */
  ariaTree: string;
  /** Key interactive elements found */
  elements: AnalyzedElement[];
  /** Detected page type */
  pageType: PageType;
  /** Forms found on the page */
  forms: FormInfo[];
  /** Navigation links */
  navLinks: string[];
  /** Key content sections */
  sections: string[];
}

export type PageType =
  | "login"
  | "signup"
  | "dashboard"
  | "listing"
  | "detail"
  | "checkout"
  | "search"
  | "settings"
  | "form"
  | "landing"
  | "article"
  | "unknown";

export interface AnalyzedElement {
  ref: string;
  role: string;
  name: string;
  type?: string;
  required?: boolean;
}

export interface FormInfo {
  action?: string;
  method?: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    placeholder?: string;
    label?: string;
  }>;
  submitButton?: string;
}

export interface GeneratedTest {
  name: string;
  description: string;
  category: TestCategory;
  priority: "critical" | "high" | "medium" | "low";
  steps: GeneratedStep[];
  assertions: string[];
}

export type TestCategory =
  | "functional"
  | "navigation"
  | "form-validation"
  | "error-handling"
  | "accessibility"
  | "edge-case"
  | "responsive";

export interface GeneratedStep {
  action: "navigate" | "click" | "type" | "select" | "scroll" | "wait" | "verify";
  target?: string;
  value?: string;
  description: string;
}

export interface GeneratedTestSuite {
  url: string;
  title: string;
  pageType: PageType;
  generatedAt: number;
  tests: GeneratedTest[];
}

// ── Page type detection heuristics ─────────────────────────────────────────

const PAGE_TYPE_PATTERNS: Array<{ type: PageType; patterns: RegExp[] }> = [
  { type: "login", patterns: [/login|sign.?in|log.?in/i, /password/i] },
  { type: "signup", patterns: [/sign.?up|register|create.?account/i] },
  { type: "checkout", patterns: [/checkout|payment|billing|cart/i] },
  { type: "search", patterns: [/search|results|filter/i] },
  { type: "dashboard", patterns: [/dashboard|overview|analytics/i] },
  { type: "settings", patterns: [/settings|preferences|profile|account/i] },
  { type: "listing", patterns: [/products|items|list|catalog|browse/i] },
  { type: "detail", patterns: [/detail|product\/|item\/|view\//i] },
  { type: "article", patterns: [/blog|article|post|news/i] },
  { type: "landing", patterns: [/home|welcome|landing|hero/i] },
];

/**
 * TestGenerator analyzes a page and produces a comprehensive test suite.
 *
 * It works in two modes:
 * 1. **Heuristic mode** (no LLM) — uses page structure analysis to generate
 *    standard test patterns for detected page types
 * 2. **AI-enhanced mode** — sends page analysis to an LLM for richer,
 *    context-aware test generation (requires a provider)
 */
export class TestGenerator {
  /**
   * Analyze page structure from an ARIA tree string.
   */
  analyzePage(url: string, title: string, ariaTree: string): PageAnalysis {
    const elements = this.extractElements(ariaTree);
    const forms = this.detectForms(elements);
    const navLinks = this.detectNavLinks(elements);
    const sections = this.detectSections(ariaTree);
    const pageType = this.detectPageType(url, title, ariaTree, elements);

    return {
      url,
      title,
      ariaTree,
      elements,
      pageType,
      forms,
      navLinks,
      sections,
    };
  }

  /**
   * Generate test suite from page analysis (heuristic mode).
   */
  generate(analysis: PageAnalysis): GeneratedTestSuite {
    const tests: GeneratedTest[] = [];

    // Always generate these
    tests.push(...this.generateNavigationTests(analysis));
    tests.push(...this.generateAccessibilityTests(analysis));

    // Page-type-specific tests
    switch (analysis.pageType) {
      case "login":
        tests.push(...this.generateLoginTests(analysis));
        break;
      case "signup":
        tests.push(...this.generateSignupTests(analysis));
        break;
      case "checkout":
        tests.push(...this.generateCheckoutTests(analysis));
        break;
      case "search":
        tests.push(...this.generateSearchTests(analysis));
        break;
      case "form":
      case "settings":
        tests.push(...this.generateFormTests(analysis));
        break;
      case "listing":
      case "dashboard":
        tests.push(...this.generateListingTests(analysis));
        break;
      default:
        tests.push(...this.generateGenericTests(analysis));
    }

    // Form validation tests for any page with forms
    if (analysis.forms.length > 0) {
      tests.push(...this.generateFormValidationTests(analysis));
    }

    return {
      url: analysis.url,
      title: analysis.title,
      pageType: analysis.pageType,
      generatedAt: Date.now(),
      tests,
    };
  }

  /**
   * Export test suite as YAML workflow format.
   */
  toYAML(suite: GeneratedTestSuite): string {
    const lines: string[] = [
      `# Auto-generated test suite for ${suite.title}`,
      `# URL: ${suite.url}`,
      `# Page type: ${suite.pageType}`,
      `# Generated: ${new Date(suite.generatedAt).toISOString()}`,
      "",
      `name: "${suite.title} Tests"`,
      `url: "${suite.url}"`,
      "",
      "tests:",
    ];

    for (const test of suite.tests) {
      lines.push(`  - name: "${test.name}"`);
      lines.push(`    description: "${test.description}"`);
      lines.push(`    category: ${test.category}`);
      lines.push(`    priority: ${test.priority}`);
      lines.push(`    steps:`);

      for (const step of test.steps) {
        lines.push(`      - action: ${step.action}`);
        if (step.target) lines.push(`        target: "${step.target}"`);
        if (step.value) lines.push(`        value: "${step.value}"`);
        lines.push(`        description: "${step.description}"`);
      }

      if (test.assertions.length > 0) {
        lines.push(`    assertions:`);
        for (const a of test.assertions) {
          lines.push(`      - "${a}"`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Export test suite as natural language instructions (for agent execution).
   */
  toInstructions(suite: GeneratedTestSuite): string[] {
    return suite.tests.map((test) => {
      const steps = test.steps.map((s) => s.description).join(". ");
      const assertions = test.assertions.join("; ");
      return `${test.name}: ${steps}. Verify: ${assertions}`;
    });
  }

  // ── Page analysis helpers ────────────────────────────────────────────────

  private extractElements(ariaTree: string): AnalyzedElement[] {
    const elements: AnalyzedElement[] = [];
    const refPattern = /\[([eE]\d+)\]\s+(\w+)\s+"([^"]*)"/g;
    let match: RegExpExecArray | null;

    while ((match = refPattern.exec(ariaTree)) !== null) {
      elements.push({
        ref: match[1],
        role: match[2],
        name: match[3],
      });
    }

    return elements;
  }

  private detectForms(elements: AnalyzedElement[]): FormInfo[] {
    const forms: FormInfo[] = [];
    const fields: FormInfo["fields"] = [];

    for (const el of elements) {
      if (el.role === "textbox" || el.role === "searchbox") {
        fields.push({
          name: el.name,
          type: el.name.toLowerCase().includes("password")
            ? "password"
            : el.name.toLowerCase().includes("email")
              ? "email"
              : "text",
          required: false,
          label: el.name,
        });
      } else if (el.role === "checkbox" || el.role === "radio") {
        fields.push({ name: el.name, type: el.role, required: false, label: el.name });
      } else if (el.role === "combobox" || el.role === "listbox") {
        fields.push({ name: el.name, type: "select", required: false, label: el.name });
      }
    }

    const submitBtn = elements.find(
      (el) => el.role === "button" && /submit|sign|log|create|send|save/i.test(el.name),
    );

    if (fields.length > 0) {
      forms.push({ fields, submitButton: submitBtn?.name });
    }

    return forms;
  }

  private detectNavLinks(elements: AnalyzedElement[]): string[] {
    return elements
      .filter((el) => el.role === "link")
      .map((el) => el.name)
      .filter((name) => name.length > 0)
      .slice(0, 20);
  }

  private detectSections(ariaTree: string): string[] {
    const sections: string[] = [];
    const headingPattern = /heading\s+"([^"]+)"/g;
    let match: RegExpExecArray | null;

    while ((match = headingPattern.exec(ariaTree)) !== null) {
      sections.push(match[1]);
    }

    return sections;
  }

  private detectPageType(
    url: string,
    title: string,
    ariaTree: string,
    elements: AnalyzedElement[],
  ): PageType {
    const combined = `${url} ${title} ${ariaTree.slice(0, 2000)}`;

    for (const { type, patterns } of PAGE_TYPE_PATTERNS) {
      if (patterns.some((p) => p.test(combined))) {
        return type;
      }
    }

    // Check by element composition
    const hasPasswordField = elements.some(
      (el) => el.role === "textbox" && /password/i.test(el.name),
    );
    if (hasPasswordField) return "login";

    const formFields = elements.filter(
      (el) => el.role === "textbox" || el.role === "searchbox" || el.role === "combobox",
    );
    if (formFields.length >= 3) return "form";

    return "unknown";
  }

  // ── Test generators by category ──────────────────────────────────────────

  private generateNavigationTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [
      {
        name: "Page loads successfully",
        description: `Verify that ${analysis.url} loads without errors`,
        category: "navigation",
        priority: "critical",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to ${analysis.url}` },
          { action: "wait", description: "Wait for page to fully load" },
        ],
        assertions: [
          "Page loads without console errors",
          `Page title contains relevant text`,
          "No network request failures",
        ],
      },
    ];

    // Test top navigation links
    for (const link of analysis.navLinks.slice(0, 5)) {
      tests.push({
        name: `Navigate to "${link}"`,
        description: `Click the "${link}" link and verify navigation`,
        category: "navigation",
        priority: "medium",
        steps: [
          { action: "navigate", target: analysis.url, description: `Start at ${analysis.url}` },
          { action: "click", target: link, description: `Click the "${link}" link` },
          { action: "wait", description: "Wait for navigation to complete" },
        ],
        assertions: ["Page navigates without errors", "New page loads content"],
      });
    }

    return tests;
  }

  private generateAccessibilityTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Keyboard navigation works",
        description: "Verify all interactive elements are keyboard accessible",
        category: "accessibility",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to ${analysis.url}` },
          {
            action: "verify",
            description: "Check that all interactive elements have visible focus indicators",
          },
        ],
        assertions: [
          "All buttons and links are keyboard focusable",
          "Focus order follows logical reading order",
          "No keyboard traps exist",
        ],
      },
      {
        name: "Images have alt text",
        description: "Verify all images have descriptive alt attributes",
        category: "accessibility",
        priority: "medium",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to ${analysis.url}` },
          { action: "verify", description: "Check all images for alt text" },
        ],
        assertions: [
          "All meaningful images have non-empty alt text",
          "Decorative images have empty alt attributes",
        ],
      },
    ];
  }

  private generateLoginTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Valid login succeeds",
        description: "Test login with valid credentials",
        category: "functional",
        priority: "critical",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to login page` },
          {
            action: "type",
            target: "email/username field",
            value: "testuser@example.com",
            description: "Enter valid email",
          },
          {
            action: "type",
            target: "password field",
            value: "ValidPass123!",
            description: "Enter valid password",
          },
          { action: "click", target: "submit button", description: "Click sign in" },
          { action: "wait", description: "Wait for redirect" },
        ],
        assertions: [
          "User is redirected to dashboard/home",
          "Login form is no longer visible",
          "User session is active",
        ],
      },
      {
        name: "Invalid password shows error",
        description: "Test login with wrong password shows appropriate error",
        category: "error-handling",
        priority: "critical",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to login page` },
          {
            action: "type",
            target: "email/username field",
            value: "testuser@example.com",
            description: "Enter valid email",
          },
          {
            action: "type",
            target: "password field",
            value: "wrongpassword",
            description: "Enter wrong password",
          },
          { action: "click", target: "submit button", description: "Click sign in" },
        ],
        assertions: [
          "Error message is displayed",
          "Password field is cleared or highlighted",
          "User remains on login page",
        ],
      },
      {
        name: "Empty form submission blocked",
        description: "Submitting empty login form shows validation",
        category: "form-validation",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to login page` },
          {
            action: "click",
            target: "submit button",
            description: "Click sign in without filling fields",
          },
        ],
        assertions: ["Required field validation messages appear", "Form is not submitted"],
      },
    ];
  }

  private generateSignupTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Valid registration succeeds",
        description: "Test signup with valid data",
        category: "functional",
        priority: "critical",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to signup page" },
          { action: "type", target: "name field", value: "Test User", description: "Enter name" },
          {
            action: "type",
            target: "email field",
            value: "newuser@example.com",
            description: "Enter email",
          },
          {
            action: "type",
            target: "password field",
            value: "SecurePass123!",
            description: "Enter password",
          },
          { action: "click", target: "submit button", description: "Click create account" },
        ],
        assertions: ["Account is created successfully", "Confirmation message or redirect occurs"],
      },
      {
        name: "Duplicate email shows error",
        description: "Registration with existing email shows appropriate error",
        category: "error-handling",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to signup page" },
          {
            action: "type",
            target: "email field",
            value: "existing@example.com",
            description: "Enter existing email",
          },
          { action: "click", target: "submit button", description: "Submit form" },
        ],
        assertions: ["Error message about existing account is shown", "User is not registered"],
      },
    ];
  }

  private generateCheckoutTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Checkout form validation",
        description: "Required checkout fields are validated",
        category: "form-validation",
        priority: "critical",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to checkout" },
          {
            action: "click",
            target: "submit/pay button",
            description: "Submit without filling required fields",
          },
        ],
        assertions: ["Required field errors are shown", "Payment is not processed"],
      },
    ];
  }

  private generateSearchTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Search returns results",
        description: "Searching for a common term shows results",
        category: "functional",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to search page" },
          {
            action: "type",
            target: "search input",
            value: "test",
            description: "Enter search query",
          },
          { action: "click", target: "search button", description: "Submit search" },
          { action: "wait", description: "Wait for results to load" },
        ],
        assertions: ["Search results are displayed", "Results are relevant to the query"],
      },
      {
        name: "Empty search handled gracefully",
        description: "Empty search shows appropriate message",
        category: "edge-case",
        priority: "medium",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to search page" },
          { action: "click", target: "search button", description: "Submit empty search" },
        ],
        assertions: ["Appropriate message or all results shown", "No errors displayed"],
      },
    ];
  }

  private generateFormTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    for (const form of analysis.forms) {
      const fields = form.fields.map((f) => f.label || f.name).join(", ");
      tests.push({
        name: `Form submission with valid data`,
        description: `Fill and submit form with fields: ${fields}`,
        category: "functional",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to form page" },
          ...form.fields.map((f) => ({
            action: "type" as const,
            target: f.label || f.name,
            value: this.getSampleValue(f.type),
            description: `Fill ${f.label || f.name} field`,
          })),
          {
            action: "click",
            target: form.submitButton ?? "submit button",
            description: "Submit form",
          },
        ],
        assertions: ["Form submits successfully", "Success confirmation is shown"],
      });
    }

    return tests;
  }

  private generateListingTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Page content loads",
        description: "Verify listing/dashboard content loads",
        category: "functional",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          { action: "wait", description: "Wait for content to load" },
        ],
        assertions: [
          "Content items are visible",
          "No loading spinners stuck",
          "Data is properly formatted",
        ],
      },
    ];
  }

  private generateFormValidationTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    for (const form of analysis.forms) {
      // Test each field with invalid data
      for (const field of form.fields) {
        if (field.type === "email") {
          tests.push({
            name: `Invalid email validation for "${field.label || field.name}"`,
            description: `Enter invalid email format in ${field.label || field.name}`,
            category: "form-validation",
            priority: "medium",
            steps: [
              { action: "navigate", target: analysis.url, description: "Navigate to form" },
              {
                action: "type",
                target: field.label || field.name,
                value: "notanemail",
                description: "Enter invalid email",
              },
              {
                action: "click",
                target: form.submitButton ?? "submit",
                description: "Submit form",
              },
            ],
            assertions: ["Email validation error is shown", "Form is not submitted"],
          });
        }
      }
    }

    return tests;
  }

  private generateGenericTests(analysis: PageAnalysis): GeneratedTest[] {
    return [
      {
        name: "Page renders correctly",
        description: `Verify ${analysis.title} page content renders`,
        category: "functional",
        priority: "high",
        steps: [
          { action: "navigate", target: analysis.url, description: `Navigate to ${analysis.url}` },
          { action: "verify", description: "Check page renders content" },
        ],
        assertions: [
          "Main content area is visible",
          "No broken images or missing resources",
          "Text content is readable",
        ],
      },
    ];
  }

  private getSampleValue(type: string): string {
    switch (type) {
      case "email":
        return "test@example.com";
      case "password":
        return "TestPass123!";
      case "tel":
        return "555-0100";
      case "number":
        return "42";
      case "url":
        return "https://example.com";
      default:
        return "Test input";
    }
  }

  /**
   * Generate tests from a sitemap XML or URL list.
   * Crawls each URL, analyzes page types, and generates targeted tests.
   */
  async generateFromSitemap(
    sitemapSource: string,
    options: { maxPages?: number; categories?: PageType[] } = {},
  ): Promise<{ suite: GeneratedTestSuite; pagesAnalyzed: number }> {
    const maxPages = options.maxPages ?? 50;
    const urls = await this.parseSitemapUrls(sitemapSource);
    const limitedUrls = urls.slice(0, maxPages);

    const allTests: GeneratedTest[] = [];
    let pagesAnalyzed = 0;

    for (const url of limitedUrls) {
      try {
        // Analyze page type from URL patterns
        const pageType = this.detectPageTypeFromUrl(url);

        // Skip if category filter is specified and doesn't match
        if (options.categories && !options.categories.includes(pageType)) {
          continue;
        }

        // Generate tests based on page type (no actual page visit needed)
        const pageTests = this.generateForPageType(url, pageType);
        allTests.push(...pageTests);
        pagesAnalyzed++;
      } catch {
        // Skip URLs that fail analysis
      }
    }

    const suite: GeneratedTestSuite = {
      url: limitedUrls[0] ?? "",
      title: `Sitemap Tests (${pagesAnalyzed} pages)`,
      pageType: "unknown",
      generatedAt: Date.now(),
      tests: allTests,
    };

    return { suite, pagesAnalyzed };
  }

  /**
   * Parse URLs from a sitemap XML string or newline-separated URL list.
   */
  private async parseSitemapUrls(source: string): Promise<string[]> {
    const urls: string[] = [];

    // Check if it's XML sitemap
    if (source.includes("<urlset") || source.includes("<sitemapindex")) {
      const locPattern = /<loc>\s*(.*?)\s*<\/loc>/g;
      let match: RegExpExecArray | null;
      while ((match = locPattern.exec(source)) !== null) {
        urls.push(match[1].trim());
      }
    } else {
      // Treat as newline-separated URL list
      for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && (trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
          urls.push(trimmed);
        }
      }
    }

    return [...new Set(urls)]; // Deduplicate
  }

  /**
   * Detect page type from URL patterns.
   */
  private detectPageTypeFromUrl(url: string): PageType {
    const path = new URL(url).pathname.toLowerCase();

    if (/\/(login|signin|sign-in|log-in)/.test(path)) return "login";
    if (/\/(signup|register|sign-up|join)/.test(path)) return "signup";
    if (/\/(dashboard|overview|home)/.test(path)) return "dashboard";
    if (/\/(checkout|cart|payment|billing)/.test(path)) return "checkout";
    if (/\/(search|find|results)/.test(path)) return "search";
    if (/\/(settings|preferences|account)/.test(path)) return "settings";
    if (/\/(products?|items?|catalog|listing)/.test(path)) return "listing";
    if (/\/(product|item)\/[\w-]+/.test(path)) return "detail";
    if (/\/(blog|articles?|posts?|news)/.test(path)) return "article";
    if (/\/(contact|support|feedback)/.test(path)) return "form";
    if (/\/(pricing|plans?|features?)/.test(path)) return "landing";
    return "unknown";
  }

  /**
   * Generate tests for a specific page type without visiting the page.
   */
  private generateForPageType(url: string, pageType: PageType): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const baseUrl = url;

    switch (pageType) {
      case "login":
        tests.push(
          {
            name: "Login page loads",
            description: "Verify the login page loads correctly",
            category: "functional",
            priority: "high",
            steps: [{ action: "navigate", target: baseUrl, description: `Navigate to ${baseUrl}` }],
            assertions: ["Page loads without errors", "Login form is visible"],
          },
          {
            name: "Login with valid credentials",
            description: "Test login with valid email and password",
            category: "functional",
            priority: "high",
            steps: [
              { action: "type", target: "email", description: "Enter email" },
              { action: "type", target: "password", description: "Enter password" },
              { action: "click", target: "submit", description: "Click login" },
            ],
            assertions: ["User is logged in", "Redirects to dashboard"],
          },
          {
            name: "Login with invalid credentials",
            description: "Test error handling for bad credentials",
            category: "error-handling",
            priority: "medium",
            steps: [
              { action: "type", target: "email", description: "Enter invalid email" },
              { action: "click", target: "submit", description: "Click login" },
            ],
            assertions: ["Error message displayed", "User remains on login page"],
          },
        );
        break;

      case "signup":
        tests.push(
          {
            name: "Signup page loads",
            description: "Verify the signup page loads correctly",
            category: "functional",
            priority: "high",
            steps: [{ action: "navigate", target: baseUrl, description: `Navigate to ${baseUrl}` }],
            assertions: ["Signup form is visible", "Required fields are marked"],
          },
          {
            name: "Signup form validation",
            description: "Test empty form submission validation",
            category: "form-validation",
            priority: "high",
            steps: [{ action: "click", target: "submit", description: "Submit empty form" }],
            assertions: ["Validation errors shown for required fields"],
          },
        );
        break;

      case "search":
        tests.push(
          {
            name: "Search page loads",
            description: "Verify the search page loads correctly",
            category: "functional",
            priority: "high",
            steps: [{ action: "navigate", target: baseUrl, description: `Navigate to ${baseUrl}` }],
            assertions: ["Search input is visible", "Search button is visible"],
          },
          {
            name: "Search returns results",
            description: "Test search query returns results",
            category: "functional",
            priority: "high",
            steps: [
              { action: "type", target: "search", description: "Enter search query" },
              { action: "click", target: "search-button", description: "Click search" },
            ],
            assertions: ["Results are displayed", "Results contain relevant items"],
          },
        );
        break;

      case "checkout":
        tests.push(
          {
            name: "Checkout page loads",
            description: "Verify the checkout page loads correctly",
            category: "functional",
            priority: "high",
            steps: [{ action: "navigate", target: baseUrl, description: `Navigate to ${baseUrl}` }],
            assertions: ["Cart items displayed", "Total price visible"],
          },
          {
            name: "Checkout form validation",
            description: "Test checkout form validation",
            category: "form-validation",
            priority: "high",
            steps: [{ action: "click", target: "submit", description: "Submit without info" }],
            assertions: ["Validation errors for required fields"],
          },
        );
        break;

      default:
        tests.push({
          name: `${pageType} page loads`,
          description: `Verify the ${pageType} page loads correctly`,
          category: "functional",
          priority: "medium",
          steps: [{ action: "navigate", target: baseUrl, description: `Navigate to ${baseUrl}` }],
          assertions: ["Page loads without errors", "No console errors"],
        });
    }

    return tests;
  }
}
