# @inspect/expect-jest

Jest E2E adapter for Inspect - Browser automation testing with natural language.

## Installation

```bash
pnpm add -D @inspect/expect-jest
```

## Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: "@inspect/expect-jest",
  setupFilesAfterEnv: ["@inspect/expect-jest/setup"],
  testTimeout: 30000,
};
```

```javascript
// inspect.config.js
const { defineInspectConfig } = require("@inspect/expect-jest/setup");

defineInspectConfig({
  browser: "chromium",
  headless: process.env.CI === "true",
  baseURL: "https://example.com",
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
  },
});
```

## Usage

```javascript
const { inspect } = require("@inspect/expect-jest/setup");

describe("Login Flow", () => {
  it("should login successfully", async () => {
    const { page, act, assert, goto } = inspect();

    await goto("/login");
    await act('Type "user@example.com" in the email field');
    await act('Type "password123" in the password field');
    await act("Click the login button");

    await expect(page).toHaveURL("/dashboard");
    await assert("User is logged in");
  });
});
```

## API

Same as @inspect/expect-vitest - see that package for full documentation.

## License

MIT
