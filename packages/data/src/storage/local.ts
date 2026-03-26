// ============================================================================
// @inspect/data - Local File Storage
// ============================================================================

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

/** Local storage file metadata */
export interface LocalFileMetadata {
  name: string;
  path: string;
  size: number;
  hash: string;
  contentType: string;
  createdAt: number;
  modifiedAt: number;
}

/**
 * LocalStorage manages files in the .inspect/storage/ directory.
 * Provides save, load, list, and delete operations with optional
 * content-based hashing for deduplication.
 */
export class LocalStorage {
  private storageDir: string;

  constructor(basePath?: string) {
    const base = basePath ?? process.cwd();
    this.storageDir = path.join(base, ".inspect", "storage");
    this.ensureDir(this.storageDir);
  }

  /**
   * Save a file to local storage.
   *
   * @param name - File name (can include subdirectories)
   * @param data - File content
   * @param options - Save options
   * @returns File metadata
   */
  async save(
    name: string,
    data: Buffer | string,
    options?: { contentType?: string; overwrite?: boolean },
  ): Promise<LocalFileMetadata> {
    const filePath = path.join(this.storageDir, name);
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });

    if (!options?.overwrite && fs.existsSync(filePath)) {
      throw new Error(`File already exists: ${name}`);
    }

    const buffer =
      typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    await fsp.writeFile(filePath, buffer);

    const hash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const stat = await fsp.stat(filePath);

    return {
      name,
      path: filePath,
      size: stat.size,
      hash,
      contentType:
        options?.contentType ?? this.detectContentType(name),
      createdAt: stat.birthtimeMs,
      modifiedAt: stat.mtimeMs,
    };
  }

  /**
   * Load a file from local storage.
   */
  async load(name: string): Promise<Buffer> {
    const filePath = path.join(this.storageDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${name}`);
    }
    return fsp.readFile(filePath);
  }

  /**
   * Load a file as a string.
   */
  async loadText(
    name: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<string> {
    const buffer = await this.load(name);
    return buffer.toString(encoding);
  }

  /**
   * List files in storage, optionally filtered by prefix/pattern.
   */
  async list(options?: {
    prefix?: string;
    pattern?: RegExp;
    recursive?: boolean;
  }): Promise<LocalFileMetadata[]> {
    const recursive = options?.recursive ?? true;
    const searchDir = options?.prefix
      ? path.join(this.storageDir, options.prefix)
      : this.storageDir;

    if (!fs.existsSync(searchDir)) return [];

    const files = await this.walkDir(searchDir, recursive);
    let results: LocalFileMetadata[] = [];

    for (const filePath of files) {
      const relativeName = path.relative(this.storageDir, filePath);
      const stat = await fsp.stat(filePath);

      if (options?.pattern && !options.pattern.test(relativeName)) {
        continue;
      }

      results.push({
        name: relativeName,
        path: filePath,
        size: stat.size,
        hash: "", // Computed on demand
        contentType: this.detectContentType(relativeName),
        createdAt: stat.birthtimeMs,
        modifiedAt: stat.mtimeMs,
      });
    }

    // Sort by modification time (newest first)
    results = results.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return results;
  }

  /**
   * Delete a file from storage.
   */
  async delete(name: string): Promise<boolean> {
    const filePath = path.join(this.storageDir, name);
    if (!fs.existsSync(filePath)) return false;

    await fsp.unlink(filePath);

    // Clean up empty parent directories
    let dir = path.dirname(filePath);
    while (dir !== this.storageDir) {
      try {
        const entries = await fsp.readdir(dir);
        if (entries.length === 0) {
          await fsp.rmdir(dir);
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return true;
  }

  /**
   * Check if a file exists.
   */
  exists(name: string): boolean {
    return fs.existsSync(path.join(this.storageDir, name));
  }

  /**
   * Get file metadata without loading content.
   */
  async getMetadata(name: string): Promise<LocalFileMetadata | null> {
    const filePath = path.join(this.storageDir, name);
    if (!fs.existsSync(filePath)) return null;

    const stat = await fsp.stat(filePath);
    const content = await fsp.readFile(filePath);
    const hash = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");

    return {
      name,
      path: filePath,
      size: stat.size,
      hash,
      contentType: this.detectContentType(name),
      createdAt: stat.birthtimeMs,
      modifiedAt: stat.mtimeMs,
    };
  }

  /**
   * Get the total size of all files in storage.
   */
  async getTotalSize(): Promise<number> {
    const files = await this.list();
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Copy a file within storage.
   */
  async copy(source: string, destination: string): Promise<LocalFileMetadata> {
    const data = await this.load(source);
    return this.save(destination, data, { overwrite: true });
  }

  /**
   * Move/rename a file.
   */
  async move(source: string, destination: string): Promise<LocalFileMetadata> {
    const metadata = await this.copy(source, destination);
    await this.delete(source);
    return metadata;
  }

  /**
   * Get the storage directory path.
   */
  getStorageDir(): string {
    return this.storageDir;
  }

  /**
   * Recursively walk a directory to find all files.
   */
  private async walkDir(
    dir: string,
    recursive: boolean,
  ): Promise<string[]> {
    const files: string[] = [];
    const entries = await fsp.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        files.push(...(await this.walkDir(fullPath, true)));
      }
    }

    return files;
  }

  /**
   * Detect content type from file extension.
   */
  private detectContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
      ".json": "application/json",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
      ".txt": "text/plain",
      ".html": "text/html",
      ".xml": "application/xml",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".zip": "application/zip",
      ".gz": "application/gzip",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".yaml": "application/yaml",
      ".yml": "application/yaml",
      ".md": "text/markdown",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".har": "application/json",
    };
    return types[ext] ?? "application/octet-stream";
  }

  /**
   * Ensure directory exists.
   */
  private ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }
}
