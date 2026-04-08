import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import * as child_process from "child_process";
import * as InspectAgent from "@inspect/agent";
import { DiffPlanner, DiffPlannerConfig, ImpactedArea } from "./diff-planner.js";

describe("DiffPlanner", () => {
  let planner: DiffPlanner;

  beforeEach(() => {
    planner = new DiffPlanner();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(planner.config.scope).toEqual("working");
      expect(planner.config.includeUntracked).toBe(true);
      expect(planner.config.maxFiles).toEqual(100);
      expect(planner.config.useLLM).toBe(false);
    });

    it("should accept custom config", () => {
      const customConfig: DiffPlannerConfig = {
        scope: "branch",
        baseBranch: "main",
        includeUntracked: false,
        maxFiles: 50,
        useLLM: true,
        llmProvider: null,
        onPlanGenerated: null,
      };
      const planner2 = new DiffPlanner({ config: customConfig });
      expect(planner2.config.scope).toEqual("branch");
      expect(planner2.config.includeUntracked).toBe(false);
      expect(planner2.config.maxFiles).toEqual(50);
      expect(planner2.config.useLLM).toBe(true);
    });
  });

  describe("generatePlan", () => {
    it("should generate a diff test plan", async () => {
      const plan = await Effect.runPromise(
        planner.generatePlan({
          scope: "working",
          includeUntracked: true,
          maxFiles: 10,
          useLLM: false,
        }),
      );
      expect(plan).toBeInstanceOf(Object);
      expect(plan).toHaveProperty("impactedAreas");
      expect(plan.impactedAreas).toBeInstanceOf(Array);
      expect(plan).toHaveProperty("testSteps");
      expect(plan.testSteps).toBeInstanceOf(Array);
      expect(plan).toHaveProperty("confidence");
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(1);
      expect(plan).toHaveProperty("source");
      expect(plan.source).toHaveProperty("filesChanged");
      expect(plan.source).toHaveProperty("linesAdded");
      expect(plan.source).toHaveProperty("linesRemoved");
      expect(plan.source).toHaveProperty("commits");
      expect(plan).toHaveProperty("generatedAt");
    });

    it("should analyze git diff and identify impacted areas", async () => {
      // Mock git diff output
      const mockDiff = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1234567..89abcde 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,5 +1,5 @@
-<button>Old</button>
+<button>New</button>

diff --git a/src/pages/index.tsx b/src/pages/index.tsx
index abcdef0..1234567 100644
--- a/src/pages/index.tsx
+++ b/src/pages/index.tsx
@@ -1,3 +1,10 @@
 export default function Home() {
   return <div>Home</div>;
 }

diff --git a/package.json b/package.json
index 0987654..a1b2c3d 100644
--- a/package.json
+++ b/package.json
@@ -1,5 +1,5 @@
 {
   "name": "test-app",
-  "version": "1.0.0",
+  "version": "1.1.0",
   "dependencies": {}
 }`;

      // Mock git commands to return this diff
      const originalExecSync = child_process.execSync;
      child_process.execSync = (command: string) => {
        if (command.includes("git diff")) {
          return mockDiff;
        }
        throw new Error("Unexpected command");
      };

      const plan = await Effect.runPromise(
        planner.generatePlan({
          scope: "working",
          includeUntracked: true,
          maxFiles: 10,
          useLLM: false,
        }),
      );

      // Restore original
      child_process.execSync = originalExecSync;

      expect(plan.impactedAreas).toHaveLength(3);
      expect(plan.impactedAreas[0].type).toEqual("component");
      expect(plan.impactedAreas[0].name).toContain("Button");
      expect(plan.impactedAreas[1].type).toEqual("page");
      expect(plan.impactedAreas[1].name).toContain("index");
      expect(plan.impactedAreas[2].type).toEqual("config");
      expect(plan.impactedAreas[2].name).toContain("package.json");
    });

    it("should generate test steps based on impacted areas", async () => {
      const plan = await Effect.runPromise(
        planner.generatePlan({
          scope: "working",
          includeUntracked: true,
          maxFiles: 10,
          useLLM: false,
        }),
      );

      expect(plan.testSteps).toHaveLength(3); // One for each impacted area
      plan.testSteps.forEach((step, index) => {
        expect(step).toHaveProperty("index", index);
        expect(step).toHaveProperty("description");
        expect(step).toHaveProperty("type", "navigate");
        expect(step).toHaveProperty("targetArea");
      });
    });

    it("should handle empty git diffs gracefully", async () => {
      // Mock empty diff
      const originalExecSync = child_process.execSync;
      child_process.execSync = () => "";
      const planner = new DiffPlanner();
      const plan = await Effect.runPromise(
        planner.generatePlan({
          scope: "working",
          includeUntracked: true,
          maxFiles: 10,
          useLLM: false,
        }),
      );
      // Restore
      child_process.execSync = originalExecSync;

      expect(plan).toBeInstanceOf(Object);
      expect(plan.impactedAreas).toHaveLength(0);
      expect(plan.testSteps).toHaveLength(0);
      expect(plan.confidence).toEqual(0);
    });

    it("should respect maxFiles limit", async () => {
      // Mock a diff with many files
      let mockDiff = "";
      for (let i = 0; i < 20; i++) {
        mockDiff += `diff --git a/file${i}.ts b/file${i}.ts\n`;
      }

      const originalExecSync = child_process.execSync;
      child_process.execSync = () => mockDiff;

      const planner = new DiffPlanner({ config: { maxFiles: 5 } });
      const plan = await Effect.runPromise(
        planner.generatePlan({ scope: "working", includeUntracked: true, useLLM: false }),
      );

      // Restore
      child_process.execSync = originalExecSync;

      expect(plan.impactedAreas).toHaveLength(5); // Should be limited to 5
    });

    it("should use LLM for analysis when enabled", async () => {
      const mockLlmResponse = JSON.stringify({
        impactedAreas: [{ type: "component", name: "Button", risk: "medium" }],
        testSteps: [{ index: 0, description: "Navigate to button page", type: "navigate" }],
        confidence: 0.9,
      });

      // Mock LLM provider
      const originalLlmProvider = InspectAgent.LLMProvider;
      InspectAgent.LLMProvider = class {
        async complete(
          _prompt: string,
          _options: { model: string; temperature: number },
        ): Promise<string> {
          return mockLlmResponse;
        }
      };

      const planner = new DiffPlanner({ config: { useLLM: true, llmProvider: new LLMProvider() } });
      const plan = await Effect.runPromise(
        planner.generatePlan({ scope: "working", includeUntracked: true, maxFiles: 10 }),
      );

      // Restore
      InspectAgent.LLMProvider = originalLlmProvider;

      expect(plan.impactedAreas).toHaveLength(1);
      expect(plan.impactedAreas[0].type).toEqual("component");
      expect(plan.testSteps).toHaveLength(1);
      expect(plan.testSteps[0].description).toContain("Navigate");
      expect(plan.confidence).toBeCloseTo(0.9);
    });
  });

  describe("analyzeDiff", () => {
    it("should parse git diff and extract changed files", async () => {
      const diff = `diff --git a/src/Button.tsx b/src/Button.tsx
index 1234567..89abcde 100644
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,5 +1,5 @@
-<button>Old</button>
+<button>New</button>

diff --git a/src/Form.tsx b/src/Form.tsx
index abcdef0..1234567 100644
--- a/src/Form.tsx
+++ b/src/Form.tsx
@@ -1,10 +1,10 @@
 export function Form() {
   return <form>Form</form>;
 }`;

      const result = await Effect.runPromise(DiffPlanner.analyzeDiff(diff));
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual("src/Button.tsx");
      expect(result[1]).toEqual("src/Form.tsx");
    });

    it("should handle binary files and symlinks", async () => {
      const diff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abcdef0
Binary files a/image.png and /dev/null differ

diff --git a/script.sh b/script.sh
new file mode 100755
index 0000000..1234567`;

      const result = await Effect.runPromise(DiffPlanner.analyzeDiff(diff));
      expect(result).toHaveLength(2);
      expect(result).toContain("image.png");
      expect(result).toContain("script.sh");
    });

    it("should return empty array for empty diff", async () => {
      const result = await Effect.runPromise(DiffPlanner.analyzeDiff(""));
      expect(result).toEqual([]);
    });
  });

  describe("identifyImpactedAreas", () => {
    it("should categorize files into impacted areas", async () => {
      const files = [
        "src/components/Button.tsx",
        "src/components/Form.tsx",
        "src/pages/index.tsx",
        "src/api/users.ts",
        "package.json",
        "src/styles/main.css",
      ];

      const areas = await Effect.runPromise(DiffPlanner.identifyImpactedAreas(files));

      expect(areas).toBeInstanceOf(Array);
      expect(areas).toHaveLength(5); // Button, Form, Page, API, Config

      const buttonArea = areas.find((a) => a.name === "Button");
      expect(buttonArea).toBeDefined();
      expect(buttonArea?.type).toEqual("component");
      expect(buttonArea?.risk).toEqual("medium");

      const pageArea = areas.find((a) => a.name === "index");
      expect(pageArea).toBeDefined();
      expect(pageArea?.type).toEqual("page");
      expect(pageArea?.risk).toEqual("high");

      const apiArea = areas.find((a) => a.name === "users");
      expect(apiArea).toBeDefined();
      expect(apiArea?.type).toEqual("api");
      expect(apiArea?.risk).toEqual("high");

      const configArea = areas.find((a) => a.name === "package.json");
      expect(configArea).toBeDefined();
      expect(configArea?.type).toEqual("config");
      expect(configArea?.risk).toEqual("low");
    });

    it("should handle unknown file types gracefully", async () => {
      const files = ["unknown/file.xyz"];
      const areas = await Effect.runPromise(DiffPlanner.identifyImpactedAreas(files));
      expect(areas).toHaveLength(1);
      expect(areas[0].type).toEqual("unknown");
      expect(areas[0].name).toEqual("file.xyz");
      expect(areas[0].risk).toEqual("low");
    });
  });

  describe("generateTestSteps", () => {
    it("should generate test steps for each impacted area", async () => {
      const areas: ImpactedArea[] = [
        { type: "component", name: "Button", risk: "medium" },
        { type: "page", name: "Login", risk: "high" },
        { type: "api", name: "users", risk: "high" },
      ];

      const steps = await Effect.runPromise(
        DiffPlanner.generateTestSteps(areas, { useLLM: false }),
      );

      expect(steps).toBeInstanceOf(Array);
      expect(steps).toHaveLength(3);
      steps.forEach((step, index) => {
        expect(step).toHaveProperty("index", index);
        expect(step).toHaveProperty("description");
        expect(step.description).toContain(areas[index].name);
        expect(step).toHaveProperty("type", "navigate");
        expect(step).toHaveProperty("targetArea", areas[index].name);
      });
    });

    it("should include LLM-generated steps when enabled", async () => {
      // Mock LLM response
      const originalLlmProvider = InspectAgent.LLMProvider;
      InspectAgent.LLMProvider = class {
        async complete(
          _prompt: string,
          _options: { model: string; temperature: number },
        ): Promise<string> {
          return JSON.stringify({
            steps: [
              { index: 0, description: "Custom step 1", type: "navigate" },
              { index: 1, description: "Custom step 2", type: "interact" },
            ],
            confidence: 0.95,
          });
        }
      };

      const areas: ImpactedArea[] = [{ type: "component", name: "Button", risk: "medium" }];

      const planner = new DiffPlanner({ config: { useLLM: true, llmProvider: new LLMProvider() } });
      const steps = await Effect.runPromise(planner.generateTestSteps(areas, { useLLM: true }));

      // Restore
      InspectAgent.LLMProvider = originalLlmProvider;

      expect(steps).toHaveLength(2);
      expect(steps[0].description).toEqual("Custom step 1");
      expect(steps[1].description).toEqual("Custom step 2");
      expect(steps[0].type).toEqual("navigate");
    });
  });

  describe("calculateConfidence", () => {
    it("should calculate confidence score based on impacted areas and test steps", async () => {
      const areas = [
        { type: "component", name: "Button", risk: "medium" },
        { type: "page", name: "Login", risk: "high" },
      ];

      const steps = [
        { index: 0, description: "Navigate to login", type: "navigate", targetArea: "Login" },
        { index: 1, description: "Click submit", type: "interact", targetArea: "Button" },
      ];

      const confidence = await Effect.runPromise(DiffPlanner.calculateConfidence(areas, steps));
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
      expect(confidence).toBeCloseTo(0.9); // Example value
    });

    it("should return 0 if no areas or steps", async () => {
      const confidence1 = await Effect.runPromise(DiffPlanner.calculateConfidence([], []));
      expect(confidence1).toEqual(0);

      const confidence2 = await Effect.runPromise(
        DiffPlanner.calculateConfidence(
          [],
          [{ index: 0, description: "Step", type: "navigate", targetArea: "Test" }],
        ),
      );
      expect(confidence2).toEqual(0);
    });
  });
});
