import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/build/**",
      "firecrawl/",
      "lighthouse/",
      "msw/",
      "backstopjs/",
      "gremlins-js/",
      "coverage/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Effect-TS uses generator functions via Effect.fn even without yield
      "require-yield": "off",
    },
  },
  {
    files: ["apps/inspect-recorder/build.mjs"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["packages/document-ingest/src/pdf-ingestor.ts"],
    rules: {
      "no-control-regex": "off",
    },
  },
);
