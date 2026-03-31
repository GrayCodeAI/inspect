import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { stat, readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const WATCH_POLL_INTERVAL_MS = 2000;
const WATCH_SETTLE_DELAY_MS = 3000;
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", ".turbo"]);
const IGNORED_EXTS = new Set([".log", ".tmp", ".swp", ".swo", ".DS_Store"]);

export type WatchEvent =
  | { type: "polling" }
  | { type: "change-detected"; fingerprint: string }
  | { type: "settling" }
  | { type: "assessing" }
  | { type: "run-starting"; fingerprint: string }
  | { type: "run-skipped"; fingerprint: string }
  | { type: "run-completed"; fingerprint: string; result: "pass" | "fail" }
  | { type: "error"; error: string };

export type WatchDecision = "run" | "skip";

export interface WatchConfig {
  readonly cwd: string;
  readonly pollInterval?: number;
  readonly settleDelay?: number;
  readonly include?: string[];
  readonly exclude?: string[];
}

interface FileEntry {
  path: string;
  hash: string;
  mtime: number;
  size: number;
}

export class WatchManager extends EventEmitter {
  private config: WatchConfig;
  private running = false;
  private fileMap = new Map<string, FileEntry>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WatchConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.fileMap = await this.scanFiles();
    this.emit("start" as string, { fileCount: this.fileMap.size });
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.emit("stop" as string);
  }

  private poll(): void {
    if (!this.running) return;
    this.emit("event" as string, { type: "polling" } as WatchEvent);

    this.pollTimer = setTimeout(async () => {
      try {
        const currentMap = await this.scanFiles();
        const changes = this.detectChanges(currentMap);

        if (changes.length > 0) {
          const fingerprint = this.computeFingerprint(changes);
          this.emit("event" as string, { type: "change-detected", fingerprint } as WatchEvent);
          this.emit("change" as string, { files: changes, fingerprint });

          this.emit("event" as string, { type: "settling" } as WatchEvent);
          await this.delay(this.config.settleDelay ?? WATCH_SETTLE_DELAY_MS);

          const postSettleMap = await this.scanFiles();
          const postSettleChanges = this.detectChanges(postSettleMap);

          if (postSettleChanges.length > 0) {
            const newFingerprint = this.computeFingerprint(postSettleChanges);
            this.emit("event" as string, { type: "run-starting", fingerprint: newFingerprint } as WatchEvent);
            this.emit("run" as string, { files: postSettleChanges, fingerprint: newFingerprint });
          }

          this.fileMap = currentMap;
        }
      } catch (error) {
        this.emit("event" as string, { type: "error", error: String(error) } as WatchEvent);
      }

      this.poll();
    }, this.config.pollInterval ?? WATCH_POLL_INTERVAL_MS);
  }

  private async scanFiles(): Promise<Map<string, FileEntry>> {
    const map = new Map<string, FileEntry>();
    const cwd = this.config.cwd;
    const include = this.config.include ?? ["**/*.{ts,tsx,js,jsx}"];
    const exclude = this.config.exclude ?? [];

    await this.scanDirectory(cwd, cwd, include, exclude, map);
    return map;
  }

  private async scanDirectory(
    root: string,
    dir: string,
    _include: string[],
    exclude: string[],
    map: Map<string, FileEntry>,
  ): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(root, fullPath);

        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name) || exclude.some((e) => relPath.includes(e))) continue;
          await this.scanDirectory(root, fullPath, _include, exclude, map);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (IGNORED_EXTS.has(ext)) continue;

          const fileStat = await stat(fullPath);
          const hash = await this.hashFile(fullPath);
          map.set(relPath, {
            path: relPath,
            hash,
            mtime: fileStat.mtimeMs,
            size: fileStat.size,
          });
        }
      }
    } catch {
      // ignore permission errors
    }
  }

  private async hashFile(path: string): Promise<string> {
    const content = await readFile(path, "utf-8");
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private detectChanges(currentMap: Map<string, FileEntry>): FileEntry[] {
    const changes: FileEntry[] = [];

    for (const [path, entry] of currentMap) {
      const previous = this.fileMap.get(path);
      if (!previous || previous.hash !== entry.hash || previous.mtime !== entry.mtime) {
        changes.push(entry);
      }
    }

    for (const path of this.fileMap.keys()) {
      if (!currentMap.has(path)) {
        changes.push({ path, hash: "deleted", mtime: Date.now(), size: 0 });
      }
    }

    return changes;
  }

  private computeFingerprint(changes: FileEntry[]): string {
    const sorted = changes.map((c) => `${c.path}:${c.hash}`).sort().join("|");
    return createHash("sha256").update(sorted).digest("hex").slice(0, 12);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
