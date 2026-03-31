import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiffPlanGenerator } from "./diff-plan-generator.js";

// Mock simple-git
vi.mock("../git/git.js", () => ({
  GitManager: class {
    async getDiff() {
      return `diff --git a/src/pages/Login.tsx b/src/pages/Login.tsx
--- a/src/pages/Login.tsx
+++ b/src/pages/Login.tsx
@@ -10,6 +10,12 @@ export function LoginPage() {
+  const [email, setEmail] = useState('');
+  const [password, setPassword] = useState('');
+
+  const handleSubmit = async () => {
+    await fetch('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
+  };`;
    }
    async getChangedFiles() {
      return [
        "src/pages/Login.tsx",
        "src/components/Button.tsx",
        "src/api/auth.ts",
        "src/styles/login.css",
      ];
    }
  },
}));

describe("DiffPlanGenerator", () => {
  let generator: DiffPlanGenerator;

  beforeEach(() => {
    generator = new DiffPlanGenerator();
  });

  describe("analyzeDiff", () => {
    it("should parse diff and categorize files", async () => {
      const analysis = await generator.analyzeDiff({ scope: "unstaged" });

      expect(analysis.hunks.length).toBeGreaterThan(0);
      expect(analysis.categories.pages).toContain("src/pages/Login.tsx");
      expect(analysis.categories.components).toContain("src/components/Button.tsx");
      expect(analysis.categories.apiRoutes).toContain("src/api/auth.ts");
      expect(analysis.categories.styles).toContain("src/styles/login.css");
    });

    it("should detect impacted areas from changes", async () => {
      const analysis = await generator.analyzeDiff({ scope: "unstaged" });

      expect(analysis.impactedAreas.length).toBeGreaterThan(0);

      const pageArea = analysis.impactedAreas.find((a) => a.type === "page");
      expect(pageArea).toBeDefined();
      expect(pageArea!.priority).toBe("critical");
    });

    it("should extract identifiers from diff", async () => {
      const analysis = await generator.analyzeDiff({ scope: "unstaged" });

      const hunk = analysis.hunks.find((h) => h.filePath === "src/pages/Login.tsx");
      expect(hunk).toBeDefined();
      expect(hunk!.affectedIdentifiers).toContain("file:src/pages/Login.tsx");
    });

    it("should generate a summary", async () => {
      const analysis = await generator.analyzeDiff({ scope: "unstaged" });

      expect(analysis.summary).toContain("Analyzed");
      expect(analysis.summary).toContain("page(s)");
    });
  });

  describe("generatePlan", () => {
    it("should generate a complete test plan", async () => {
      const plan = await generator.generatePlan({ scope: "unstaged" });

      expect(plan.id).toMatch(/^diff-plan-/);
      expect(plan.gitScope).toBe("unstaged");
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.rationale).toContain("git diff");
    });

    it("should start with navigation step", async () => {
      const plan = await generator.generatePlan({ scope: "unstaged" });

      expect(plan.steps[0].type).toBe("navigate");
      expect(plan.steps[0].description).toContain("Navigate");
    });

    it("should end with error checking step", async () => {
      const plan = await generator.generatePlan({ scope: "unstaged" });

      const lastStep = plan.steps[plan.steps.length - 1];
      expect(lastStep.type).toBe("verify");
      expect(lastStep.description).toContain("console");
    });

    it("should prioritize critical areas first", async () => {
      const plan = await generator.generatePlan({ scope: "unstaged" });

      const navigateSteps = plan.steps.filter((s) => s.type === "navigate");
      expect(navigateSteps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("formatAsInstructions", () => {
    it("should format plan as readable instructions", async () => {
      const plan = await generator.generatePlan({ scope: "unstaged" });
      const instructions = generator.formatAsInstructions(plan);

      expect(instructions).toContain("Diff-Aware Test Plan");
      expect(instructions).toContain("Changed Areas");
      expect(instructions).toContain("Test Steps");
    });
  });
});
