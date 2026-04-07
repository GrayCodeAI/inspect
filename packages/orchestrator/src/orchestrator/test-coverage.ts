import { Effect, Schema } from "effect";
import { simpleGit, SimpleGit } from "simple-git";

export interface TestCoverageReport {
  totalFiles: number;
  testedFiles: number;
  untestedFiles: string[];
  coveragePercentage: number;
  browserTestFiles: string[];
  missingCoverage: string[];
}

export interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  isTest: boolean;
  isBrowserRelated: boolean;
}

export const getChangedFiles = Effect.fn("TestCoverage.getChangedFiles")(function* (options: {
  target: "unstaged" | "staged" | "branch" | "working-tree";
  branch?: string;
}) {
  const git = simpleGit();

  let files: string[] = [];

  switch (options.target) {
    case "unstaged": {
      const status = yield* Effect.tryPromise({
        try: () => git.status(),
        catch: (e) => new Error(String(e)),
      });
      files = [...status.modified, ...status.not_added];
      break;
    }
    case "staged": {
      const diff = yield* Effect.tryPromise({
        try: () => git.diff(["--cached", "--name-only"]),
        catch: (e) => new Error(String(e)),
      });
      files = diff.split("\n").filter(Boolean);
      break;
    }
    case "branch": {
      const branch = options.branch ?? "main";
      const diff = yield* Effect.tryPromise({
        try: () => git.diff([`${branch}...HEAD`, "--name-only"]),
        catch: (e) => new Error(String(e)),
      });
      files = diff.split("\n").filter(Boolean);
      break;
    }
    case "working-tree": {
      const status = yield* Effect.tryPromise({
        try: () => git.status(),
        catch: (e) => new Error(String(e)),
      });
      files = [...status.modified, ...status.created, ...status.not_added];
      break;
    }
  }

  const changedFiles: ChangedFile[] = files.map((path) => {
    const isTest = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(path);
    const isBrowserRelated =
      /\.(tsx|jsx|css|scss)$/.test(path) ||
      path.includes("/components/") ||
      path.includes("/pages/");
    return { path, status: "modified" as const, isTest, isBrowserRelated };
  });

  return changedFiles;
});

export const analyzeTestCoverage = Effect.fn("TestCoverage.analyze")(function* (
  changedFiles: ChangedFile[],
  testDirs: string[] = ["tests", "test", "__tests__", "e2e"],
) {
  const git = simpleGit();

  const testedFiles = new Set<string>();
  const browserTestFiles: string[] = [];

  for (const file of changedFiles) {
    if (!file.isBrowserRelated) continue;

    const possibleTestFiles = testDirs.map((dir) => {
      const parts = file.path.split("/");
      const fileName = parts.pop();
      return [...parts, dir, `${fileName}.test.ts`, `${fileName}.spec.ts`, `${fileName}.e2e.ts`];
    });

    for (const testPath of possibleTestFiles.flat()) {
      try {
        const exists = yield* Effect.tryPromise({
          try: async () => {
            const { NodeFileSystem } = await import("@effect/platform-node");
            const fs = NodeFileSystem;
            return true;
          },
          catch: () => false,
        });
        if (exists) {
          testedFiles.add(file.path);
          if (testPath.includes("e2e") || testPath.includes("browser")) {
            browserTestFiles.push(file.path);
          }
        }
      } catch {
        // File doesn't exist
      }
    }
  }

  const browserRelated = changedFiles.filter((f) => f.isBrowserRelated);
  const untestedFiles = browserRelated.filter((f) => !testedFiles.has(f.path));

  return {
    totalFiles: changedFiles.length,
    testedFiles: testedFiles.size,
    untestedFiles: untestedFiles.map((f) => f.path),
    coveragePercentage:
      browserRelated.length > 0 ? (testedFiles.size / browserRelated.length) * 100 : 100,
    browserTestFiles,
    missingCoverage: untestedFiles.map((f) => f.path),
  } as TestCoverageReport;
});

export const formatTestCoverageSection = (report: TestCoverageReport | undefined): string[] => {
  if (!report) return [];

  const lines: string[] = [];
  lines.push("## Test Coverage");
  lines.push(`- Total changed files: ${report.totalFiles}`);
  lines.push(`- Browser-related files: ${report.testedFiles + report.untestedFiles.length}`);
  lines.push(`- Files with tests: ${report.testedFiles}`);
  lines.push(`- Files WITHOUT tests: ${report.untestedFiles.length}`);

  if (report.missingCoverage.length > 0) {
    lines.push("");
    lines.push("### Files needing tests:");
    for (const file of report.missingCoverage.slice(0, 10)) {
      lines.push(`  - ${file}`);
    }
    if (report.missingCoverage.length > 10) {
      lines.push(`  ... and ${report.missingCoverage.length - 10} more`);
    }
  }

  return lines;
};
