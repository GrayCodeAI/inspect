// Test Coverage Analyzer — import graph analysis for changed file coverage
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname, relative, resolve } from "node:path";
import { createLogger } from "@inspect/observability";

const _logger = createLogger("core/coverage-analyzer");

export interface CoverageReport {
  changedFiles: string[];
  coveredFiles: string[];
  uncoveredFiles: string[];
  testFiles: string[];
  importGraph: Map<string, string[]>;
  coveragePercentage: number;
}

export interface ImportNode {
  path: string;
  imports: string[];
  importedBy: string[];
  isTestFile: boolean;
}

export class TestCoverageAnalyzer {
  private graph: Map<string, ImportNode> = new Map();
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  analyze(changedFiles: string[]): CoverageReport {
    this.buildImportGraph();
    const testFiles = [...this.graph.keys()].filter((f) => this.isTestFile(f));
    const coveredFiles: string[] = [];
    const uncoveredFiles: string[] = [];

    for (const file of changedFiles) {
      if (this.hasTestCoverage(file)) {
        coveredFiles.push(file);
      } else {
        uncoveredFiles.push(file);
      }
    }

    const coveragePercentage =
      changedFiles.length > 0 ? Math.round((coveredFiles.length / changedFiles.length) * 100) : 100;

    return {
      changedFiles,
      coveredFiles,
      uncoveredFiles,
      testFiles,
      importGraph: this.buildDependencyMap(),
      coveragePercentage,
    };
  }

  private buildImportGraph(): void {
    this.graph.clear();
    this.scanDirectory(this.rootDir);
  }

  private scanDirectory(dir: string): void {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist")
            continue;
          this.scanDirectory(fullPath);
        } else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(entry.name))) {
          this.indexFile(fullPath);
        }
      }
    } catch {
      /* skip unreadable dirs */
    }
  }

  private indexFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const imports = this.extractImports(content, filePath);
      const relPath = relative(this.rootDir, filePath);
      this.graph.set(relPath, {
        path: relPath,
        imports,
        importedBy: [],
        isTestFile: this.isTestFile(relPath),
      });
    } catch {
      /* skip unreadable files */
    }
  }

  private extractImports(content: string, filePath: string): string[] {
    const imports: string[] = [];
    const importRegex =
      /(?:import|export)\s+(?:(?:\{[^}]*\}|[^'";\n]*)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = this.resolveImport(specifier, filePath);
        if (resolved) imports.push(resolved);
      }
    }
    return imports;
  }

  private resolveImport(specifier: string, fromFile: string): string | null {
    const dir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const resolved = resolve(dir, specifier);
    const rel = relative(this.rootDir, resolved);
    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
    for (const ext of extensions) {
      const candidate = rel + ext;
      if (this.graph.has(candidate) || existsSync(resolve(this.rootDir, candidate))) {
        return candidate;
      }
    }
    return rel;
  }

  private isTestFile(path: string): boolean {
    return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path) || path.includes("__tests__");
  }

  private hasTestCoverage(filePath: string): boolean {
    for (const [, node] of this.graph) {
      if (node.isTestFile && node.imports.includes(filePath)) return true;
      if (
        node.isTestFile &&
        node.imports.some((imp) => {
          const resolved = this.resolveImport(imp, resolve(this.rootDir, node.path));
          return resolved === filePath;
        })
      )
        return true;
    }
    const baseName = filePath.replace(/\.(ts|tsx|js|jsx)$/, "");
    const testVariants = [
      `${baseName}.test.ts`,
      `${baseName}.test.tsx`,
      `${baseName}.spec.ts`,
      `${baseName}.test.js`,
    ];
    return testVariants.some((v) => existsSync(resolve(this.rootDir, v)));
  }

  private buildDependencyMap(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const [path, node] of this.graph) {
      map.set(path, node.imports);
    }
    return map;
  }
}
