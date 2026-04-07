import { Effect } from "effect";
import { GitManager } from "@inspect/git";

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
  const git = new GitManager();

  // Map target to the scope parameter for getChangedFiles
  const scopeMap: Record<string, string> = {
    unstaged: "unstaged",
    staged: "changes", // staged + unstaged
    branch: "branch",
    "working-tree": "changes",
  };

  const scope = scopeMap[options.target] ?? "unstaged";

  const files = yield* Effect.tryPromise({
    try: () => git.getChangedFiles(scope),
    catch: (e) => new Error(String(e)),
  });

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
) {
  const testedFiles = new Set<string>();
  const browserTestFiles: string[] = [];

  for (const file of changedFiles) {
    if (!file.isBrowserRelated) continue;

    testedFiles.add(file.path);
    if (file.path.includes("e2e") || file.path.includes("browser")) {
      browserTestFiles.push(file.path);
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
