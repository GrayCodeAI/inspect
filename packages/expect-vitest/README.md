# @inspect/expect-vitest

Vitest E2E plugin for Inspect - Browser automation testing with natural language.

## Features

- 🚀 **Natural Language Tests** - Write tests in plain English
- 🎭 **Playwright Integration** - Built on top of Playwright
- 🔍 **Custom Matchers** - Vitest-style assertions for browser testing
- 📸 **Automatic Screenshots** - Capture on failure
- 🎥 **Video Recording** - Record test sessions
- 📊 **Trace Collection** - Debug with detailed traces
- 🧠 **AI-Powered** - LLM-driven test execution
- 🔄 **Self-Healing** - Automatic recovery from failures
- 💾 **Action Caching** - Speed up repeated tests

## Installation

```bash
pnpm add -D @inspect/expect-vitest
```

## Quick Start

### 1. Configure Vitest

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { inspectPlugin, defineInspectConfig } from "@inspect/expect-vitest";

// Define Inspect configuration
defineInspectConfig({
  browser: "chromium",
  headless: false,
  baseURL: "https://example.com",
  screenshotOnFailure: true,
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
  },
});

export default defineConfig({
  plugins: [inspectPlugin()],
  test: {
    globals: true,
    environment: "node",
  },
});
```

### 2. Write Tests

```typescript
// example.test.ts
import { describe, it, expect } from "vitest";
import { inspect } from "@inspect/expect-vitest/setup";

describe("Login Flow", () => {
  it("should login successfully", async () => {
    const { page, act, assert, goto } = inspect();

    // Navigate
    await goto("/login");

    // Natural language actions
    await act("Click the email input");
    await act('Type "user@example.com" in the email field');
    await act('Type "password123" in the password field');
    await act("Click the login button");

    // Assertions
    await assert("User is logged in");
    await expect(page).toHaveURL("/dashboard");
    await expect(page).toContainText("Welcome, User");
  });

  it("should show error for invalid credentials", async () => {
    const { goto, act, assert } = inspect();

    await goto("/login");
    await act('Type "wrong@example.com" in the email field');
    await act('Type "wrongpassword" in the password field');
    await act("Click the login button");

    await assert("Error message is displayed");
    await assert('Error says "Invalid credentials"');
  });
});
```

## API Reference

### Test Context

The `inspect()` function provides access to the test context:

```typescript
const {
  page, // Playwright Page instance
  browser, // Playwright Browser instance
  context, // Playwright BrowserContext
  act, // Natural language action
  assert, // Natural language assertion
  extract, // Extract data from page
  goto, // Navigate to URL
  wait, // Wait for condition
  screenshot, // Take screenshot
  url, // Get current URL
  title, // Get page title
} = inspect();
```

### Natural Language Actions

```typescript
// Click elements
await act("Click the submit button");
await act("Click on the menu icon");
await act("Double-click the file");

// Type text
await act('Type "hello world" in the search box');
await act("Fill the email field with test@example.com");

// Select options
await act("Select 'Large' from the size dropdown");
await act("Check the terms checkbox");

// Navigate
await act("Go back");
await act("Refresh the page");

// Scroll
await act("Scroll down by 500 pixels");
await act("Scroll to the footer");

// Wait
await act("Wait 3 seconds");
await act("Wait for the modal to appear");

// Press keys
await act("Press Enter");
await act("Press Ctrl+S");
```

### Custom Matchers

```typescript
import { expect } from "vitest";
import { inspect } from "@inspect/expect-vitest/setup";

const { page } = inspect();

// Visibility
await expect(page).toBeVisible("[data-testid='submit']");
await expect(page).toBeHidden(".loading-spinner");

// State
await expect(page).toBeEnabled("button[type='submit']");
await expect(page).toBeDisabled("button[type='submit']");

// Text content
await expect(page).toHaveText("h1", "Welcome");
await expect(page).toContainText(".message", "success");

// Input value
await expect(page).toHaveValue("#email", "test@example.com");

// URL and title
await expect(page).toHaveURL("/dashboard");
await expect(page).toHaveTitle(/Dashboard/);

// Element count
await expect(page).toHaveCount(".item", 5);

// Attributes
await expect(page).toHaveAttribute("#link", "href", "/home");
await expect(page).toHaveClass(".button", ["btn", "btn-primary"]);

// Form state
await expect(page).toBeChecked("#terms");
await expect(page).toBeFocused("#search");

// Natural language assertion
await expect(page).toSatisfy("User is logged in");
```

### Data Extraction

```typescript
const { extract } = inspect();

// Extract simple values
const productName = await extract<string>("Get the product name");
const price = await extract<string>("Get the price");

// Extract structured data
const product = await extract("Get product details", {
  type: "object",
  properties: {
    name: { type: "string" },
    price: { type: "string" },
    description: { type: "string" },
  },
});

// Extract lists
const items = await extract("List all cart items", {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      quantity: { type: "number" },
      price: { type: "string" },
    },
  },
});
```

## Configuration

```typescript
import { defineInspectConfig } from "@inspect/expect-vitest";

defineInspectConfig({
  // Browser settings
  browser: "chromium", // or "firefox", "webkit"
  headless: true,
  slowMo: 100, // Slow down by 100ms
  viewport: { width: 1280, height: 720 },

  // Base URL
  baseURL: "https://example.com",

  // Screenshots
  screenshotOnFailure: true,
  screenshotDir: "./test-results/screenshots",

  // Video recording
  video: false,
  videoDir: "./test-results/videos",

  // Trace collection
  trace: false,
  traceDir: "./test-results/traces",

  // Action caching
  cache: true,
  cacheConfig: {
    maxSize: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    minSuccessRate: 0.7,
  },

  // LLM configuration
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: "https://api.openai.com/v1",
  },

  // Timeouts
  timeout: 30000,

  // Retries
  retries: 2,
  retryDelay: 1000,

  // Features
  selfHealing: true,
  hitl: false,
});
```

## Test Options

```typescript
import { it } from "vitest";

// Per-test configuration
it("slow test", { timeout: 60000 }, async () => {
  // Test with 60 second timeout
});

// Retry specific test
it("flaky test", { retry: 3 }, async () => {
  // Test with 3 retries
});

// Skip test
it.skip("skipped test", async () => {
  // This test will be skipped
});

// Only run this test
it.only("focus test", async () => {
  // Only this test will run
});
```

## Advanced Usage

### Custom Test Helper

```typescript
// test-utils.ts
import { inspectTest } from "@inspect/expect-vitest";

export const e2eTest = (
  name: string,
  testFn: (ctx: ReturnType<typeof inspect>) => Promise<void>,
) => {
  return inspectTest(name, testFn, {
    headless: process.env.CI ? true : false,
    screenshotOnFailure: true,
  });
};
```

### Page Object Pattern

```typescript
// pages/LoginPage.ts
import { inspect } from "@inspect/expect-vitest/setup";

export class LoginPage {
  async login(email: string, password: string) {
    const { goto, act } = inspect();

    await goto("/login");
    await act(`Type "${email}" in the email field`);
    await act(`Type "${password}" in the password field`);
    await act("Click the login button");
  }

  async expectError(message: string) {
    const { assert } = inspect();
    await assert(`Error says "${message}"`);
  }
}

// Usage in test
import { it } from "vitest";
import { LoginPage } from "./pages/LoginPage";

it("should login", async () => {
  const loginPage = new LoginPage();
  await loginPage.login("user@example.com", "password");
});
```

### Fixtures

```typescript
// fixtures.ts
import { test as base } from "vitest";
import { inspectTest } from "@inspect/expect-vitest";

export const test = base.extend({
  authPage: async ({ task }, use) => {
    const ctx = await inspectTest("setup", async ({ goto, act }) => {
      await goto("/login");
      await act('Type "admin@example.com" in the email field');
      await act('Type "password" in the password field');
      await act("Click login");
    });

    await use(ctx);
  },
});
```

## Best Practices

### 1. Use Natural Language for Complex Actions

```typescript
// Good - Clear intent
await act("Fill the checkout form with test data");

// Avoid - Too many small steps
await act("Click the name field");
await act("Type John");
await act("Click the email field");
await act("Type john@example.com");
// ...
```

### 2. Write Descriptive Test Names

```typescript
// Good
it("should allow users to add items to cart", async () => {
  // ...
});

// Avoid
it("test cart", async () => {
  // ...
});
```

### 3. Use Assertions Liberally

```typescript
// Good - Multiple checkpoints
await act("Click the add to cart button");
await assert("Cart count shows 1");
await assert("Success message is displayed");

// Avoid - No verification
await act("Click the add to cart button");
// No assertion!
```

### 4. Handle Dynamic Content

```typescript
// Wait for dynamic content
await act("Wait for the products to load");
await assert("At least 3 products are displayed");
```

## Debugging

### Enable Tracing

```typescript
defineInspectConfig({
  trace: true,
  traceDir: "./test-results/traces",
});
```

View traces:

```bash
npx playwright show-trace test-results/traces/trace.zip
```

### Screenshot on Failure

```typescript
defineInspectConfig({
  screenshotOnFailure: true,
  screenshotDir: "./test-results/screenshots",
});
```

### Slow Motion

```typescript
defineInspectConfig({
  headless: false,
  slowMo: 500, // 500ms between actions
});
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: pnpm install
      - run: pnpm exec playwright install chromium
      - run: pnpm test:e2e
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: test-results/
```

## License

MIT
