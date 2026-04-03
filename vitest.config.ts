import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**", "**/dist/**", "**/index.ts"],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 35,
        lines: 40,
      },
    },
  },
  resolve: {
    alias: {
      "@inspect/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@inspect/browser": resolve(__dirname, "packages/browser/src/index.ts"),
      "@inspect/agent": resolve(__dirname, "packages/agent/src/index.ts"),
      "@inspect/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@inspect/reporter": resolve(__dirname, "packages/reporter/src/index.ts"),
      "@inspect/workflow": resolve(__dirname, "packages/workflow/src/index.ts"),
      "@inspect/credentials": resolve(__dirname, "packages/credentials/src/index.ts"),
      "@inspect/data": resolve(__dirname, "packages/data/src/index.ts"),
      "@inspect/api": resolve(__dirname, "packages/api/src/index.ts"),
      "@inspect/network": resolve(__dirname, "packages/network/src/index.ts"),
      "@inspect/observability": resolve(__dirname, "packages/observability/src/index.ts"),
      "@inspect/quality": resolve(__dirname, "packages/quality/src/index.ts"),
      "@inspect/visual": resolve(__dirname, "packages/visual/src/index.ts"),
      "@inspect/sdk": resolve(__dirname, "packages/sdk/src/index.ts"),
    },
  },
});
