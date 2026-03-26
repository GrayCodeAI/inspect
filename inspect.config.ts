import { defineConfig } from "@inspect/sdk";

export default defineConfig({
  // Target URL — auto-detected from package.json scripts if omitted
  // url: "http://localhost:3000",

  // AI agent configuration
  agent: {
    primary: "claude",
    mode: "hybrid", // dom | hybrid | cua
    // fallback: "gpt",
  },

  // Devices to test on
  devices: ["desktop-chrome"],

  // Browser configuration
  browser: {
    type: "chromium",
    headless: true,
    // slowMo: 100,
  },

  // Git integration
  git: {
    scope: "unstaged", // unstaged | branch | commit:<sha>
    maxFiles: 12,
    maxDiffChars: 12000,
  },

  // Accessibility
  a11y: {
    enabled: false,
    standard: "2.1-AA",
  },

  // Visual regression
  visual: {
    enabled: false,
    threshold: 0.1,
    viewports: ["mobile", "tablet", "desktop"],
  },

  // Timeouts
  timeouts: {
    test: 120_000,     // 2 minutes per test
    step: 30_000,      // 30 seconds per step
    navigation: 15_000, // 15 seconds for page loads
  },

  // Maximum steps per test run
  maxSteps: 50,
});
