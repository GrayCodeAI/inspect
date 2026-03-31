import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join} from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/git");

const FINGERPRINT_DIR = ".inspect";
const FINGERPRINT_FILE = "fingerprint.json";

interface FingerprintData {
  hash: string;
  files: string[];
  diffLength: number;
  timestamp: string;
  branch: string;
}

/**
 * Fingerprint generates and manages SHA256 hashes of git state.
 * Used to detect whether code has changed since the last test run,
 * enabling caching and skip-if-unchanged optimizations.
 */
export class Fingerprint {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.cwd();
  }

  /**
   * Generate a fingerprint from a list of files and their diff content.
   * The hash includes:
   * - Sorted list of changed file paths
   * - Diff content
   * - An optional salt (e.g., branch name)
   */
  generate(
    files: string[],
    diff: string,
    salt?: string
  ): string {
    const hasher = createHash("sha256");

    // Include sorted file paths
    const sortedFiles = [...files].sort();
    hasher.update(sortedFiles.join("\n"));
    hasher.update("\n---FILES_END---\n");

    // Include diff content
    hasher.update(diff);
    hasher.update("\n---DIFF_END---\n");

    // Include optional salt
    if (salt) {
      hasher.update(salt);
    }

    return hasher.digest("hex");
  }

  /**
   * Save a fingerprint to disk at .inspect/fingerprint.json.
   */
  save(
    hash: string,
    files: string[],
    diff: string,
    branch: string
  ): void {
    const dir = join(this.baseDir, FINGERPRINT_DIR);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: FingerprintData = {
      hash,
      files,
      diffLength: diff.length,
      timestamp: new Date().toISOString(),
      branch,
    };

    const filepath = join(dir, FINGERPRINT_FILE);
    writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Load the previously saved fingerprint.
   */
  load(): FingerprintData | null {
    const filepath = join(
      this.baseDir,
      FINGERPRINT_DIR,
      FINGERPRINT_FILE
    );

    if (!existsSync(filepath)) {
      return null;
    }

    try {
      const content = readFileSync(filepath, "utf-8");
      return JSON.parse(content) as FingerprintData;
    } catch (error) {
      logger.warn("Failed to load fingerprint", { filepath, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Check if the current state has changed from the saved fingerprint.
   */
  hasChanged(currentHash: string): boolean {
    const saved = this.load();
    if (!saved) {
      // No saved fingerprint means "changed" (never tested)
      return true;
    }
    return saved.hash !== currentHash;
  }

  /**
   * Generate and check in one call: returns true if code changed since last save.
   */
  async checkForChanges(
    files: string[],
    diff: string,
    branch: string
  ): Promise<{ changed: boolean; hash: string; previousHash?: string }> {
    const currentHash = this.generate(files, diff, branch);
    const saved = this.load();

    return {
      changed: !saved || saved.hash !== currentHash,
      hash: currentHash,
      previousHash: saved?.hash,
    };
  }

  /**
   * Generate a fingerprint for specific file contents (not git diff).
   * Useful for fingerprinting config files or test flow files.
   */
  generateFromFileContents(filePaths: string[]): string {
    const hasher = createHash("sha256");

    for (const filePath of filePaths.sort()) {
      const fullPath = join(this.baseDir, filePath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf-8");
        hasher.update(`${filePath}:${content}\n`);
      } else {
        hasher.update(`${filePath}:MISSING\n`);
      }
    }

    return hasher.digest("hex");
  }
}
