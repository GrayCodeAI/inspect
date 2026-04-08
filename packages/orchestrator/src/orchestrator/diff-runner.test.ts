import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { DiffRunner, DiffHunk, ImpactedArea } from "./diff-runner.js";

describe("DiffRunner", () => {
  describe("analyze", () => {
    it("should parse a simple diff and return hunks and impacted areas", async () => {
      // Example diff: two files changed
      const diff = `diff --git a/src/file1.ts b/src/file1.ts
index 1234567..89abcde 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,5 +1,5 @@
- const a = 1;
+ const a = 2;
diff --git a/src/file2.css b/src/file2.css
index abcdef0..1234567 100644
--- a/src/file2.css
+++ b/src/file2.css
@@ -10,3 +10,10 @@
  .class {
    display: none;
  }
+ .new-class {
+   color: red;
+ }
+ .another {
+   font-size: 14px;
+ }`;

      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      expect(result.hunks).toBeInstanceOf(Array);
      expect(result.areas).toBeInstanceOf(Array);

      // Should have 2 hunks (one for each file)
      expect(result.hunks).toHaveLength(2);
      expect(result.hunks[0].file).toEqual("src/file1.ts");
      expect(result.hunks[1].file).toEqual("src/file2.css");

      // Should have 2 impacted areas (one for each file)
      expect(result.areas).toHaveLength(2);
      expect(result.areas[0].type).toEqual("component"); // Assuming file1.ts is a component
      expect(result.areas[0].name).toEqual("src/file1.ts");
      expect(result.areas[0].risk).toEqual("medium");

      expect(result.areas[1].type).toEqual("style"); // file2.css is style
      expect(result.areas[1].name).toEqual("src/file2.css");
      expect(result.areas[1].risk).toEqual("medium");
    });

    it("should identify high-risk areas for pages/ and api/ files", async () => {
      const diff = `diff --git a/pages/about.tsx b/pages/about.tsx
index 1234567..89abcde 100644
--- a/pages/about.tsx
+++ b/pages/about.tsx
@@ -1,10 +1,15 @@
 export default function About() {
   return <div>About page</div>;
 }

diff --git a/api/users.ts b/api/users.ts
index abcdef0..1234567 100644
--- a/api/users.ts
+++ b/api/users.ts
@@ -5,10 +5,5 @@
 export const getUsers = () => {};
-export const postUser = () => {};
`;

      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      expect(result.areas).toHaveLength(2);
      // pages/about.tsx should be high risk
      expect(result.areas[0].type).toEqual("page");
      expect(result.areas[0].risk).toEqual("high");
      // api/users.ts should be high risk
      expect(result.areas[1].type).toEqual("api");
      expect(result.areas[1].risk).toEqual("high");
    });

    it("should handle empty diff", async () => {
      const diff = "";
      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      expect(result.hunks).toEqual([]);
      expect(result.areas).toEqual([]);
    });

    it("should handle diff with no file changes", async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..1234567 100644
--- a/src/file.ts
+++ b/src/file.ts
`;
      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      expect(result.hunks).toEqual([]);
      expect(result.areas).toEqual([]);
    });

    it("should extract added and removed line counts correctly", async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..89abcde 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,5 @@
+const a = 1;
+const b = 2;
 const c = 3;
-const d = 4;
+const e = 5;
`;

      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      const fileHunk = result.hunks.find((h) => h.file === "src/file.ts");
      expect(fileHunk).toBeDefined();
      if (fileHunk) {
        expect(fileHunk.addedLines).toEqual(3); // +a, +b, +e
        expect(fileHunk.removedLines).toEqual(1); // -d
      }
    });

    it("should categorize files correctly based on path", async () => {
      const diff = `diff --git a/components/Button.tsx b/components/Button.tsx
index 1234567..89abcde 100644
--- a/components/Button.tsx
+++ b/components/Button.tsx
@@ -1,5 +1,5 @@
-<button>Old</button>
+<button>New</button>

diff --git a/pages/index.tsx b/pages/index.tsx
index abcdef0..1234567 100644
--- a/pages/index.tsx
+++ b/pages/index.tsx
@@ -1,3 +1,10 @@
 export default function Home() {
   return <div>Home</div>;
 }

diff --git a/api/users.ts b/api/users.ts
index 0987654..abcdef0 100644
--- a/api/users.ts
+++ b/api/users.ts
@@ -5,10 +5,5 @@
 export const getUsers = () => {};
-export const postUser = () => {};
`;

      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      const component = result.areas.find((a) => a.name === "components/Button.tsx");
      expect(component).toBeDefined();
      if (component) {
        expect(component.type).toEqual("component");
        expect(component.risk).toEqual("medium");
      }

      const page = result.areas.find((a) => a.name === "pages/index.tsx");
      expect(page).toBeDefined();
      if (page) {
        expect(page.type).toEqual("page");
        expect(page.risk).toEqual("high");
      }

      const api = result.areas.find((a) => a.name === "api/users.ts");
      expect(api).toBeDefined();
      if (api) {
        expect(api.type).toEqual("api");
        expect(api.risk).toEqual("high");
      }
    });

    it("should handle multiple hunks in a single file", async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..89abcde 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,2 @@
 const a = 1;
 const b = 2;
@@ -10,5 +9,7 @@
 const x = 10;
 const y = 11;
+const z = 12;
+const w = 13;

@@ -20,2 +23,4 @@
 const p = 20;
 const q = 21;
+const r = 22;
+const s = 23;
`;

      const runner = new DiffRunner();
      const result = await Effect.runPromise(runner.analyze(diff));

      expect(result.hunks).toHaveLength(3); // Three hunks
      const fileHunk = result.hunks.find((h) => h.file === "src/file.ts");
      expect(fileHunk).toBeDefined();
      // The total added/removed lines should be aggregated across hunks
      if (fileHunk) {
        expect(fileHunk.addedLines).toBeGreaterThan(0);
        expect(fileHunk.removedLines).toBeGreaterThan(0);
      }
    });
  });
});
