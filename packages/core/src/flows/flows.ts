import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface SavedFlow {
  id: string;
  name: string;
  description: string;
  instruction: string;
  baseUrl?: string;
  cookieBrowsers: string[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  runCount: number;
  tags: string[];
}

const FLOWS_DIR = ".inspect/flows";

export class FlowManager {
  private flowsDir: string;

  constructor(cwd: string = process.cwd()) {
    this.flowsDir = join(cwd, FLOWS_DIR);
  }

  async init(): Promise<void> {
    if (!existsSync(this.flowsDir)) {
      await mkdir(this.flowsDir, { recursive: true });
    }
  }

  async save(flow: Omit<SavedFlow, "id" | "createdAt" | "updatedAt" | "runCount">): Promise<SavedFlow> {
    await this.init();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const saved: SavedFlow = { ...flow, id, createdAt: now, updatedAt: now, runCount: 0 };
    await this.writeFlowFile(id, saved);
    return saved;
  }

  async update(id: string, updates: Partial<Omit<SavedFlow, "id" | "createdAt">>): Promise<SavedFlow> {
    const existing = await this.load(id);
    const updated: SavedFlow = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.writeFlowFile(id, updated);
    return updated;
  }

  async load(id: string): Promise<SavedFlow> {
    const filePath = join(this.flowsDir, `${id}.json`);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as SavedFlow;
  }

  async list(): Promise<SavedFlow[]> {
    await this.init();
    const files = await readdir(this.flowsDir);
    const flows: SavedFlow[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(join(this.flowsDir, file), "utf-8");
        flows.push(JSON.parse(content) as SavedFlow);
      } catch { /* skip corrupted */ }
    }
    return flows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const filePath = join(this.flowsDir, `${id}.json`);
    if (existsSync(filePath)) await unlink(filePath);
  }

  async recordRun(id: string): Promise<void> {
    const flow = await this.load(id);
    await this.update(id, { lastRunAt: new Date().toISOString(), runCount: flow.runCount + 1 });
  }

  private async writeFlowFile(id: string, flow: SavedFlow): Promise<void> {
    await writeFile(join(this.flowsDir, `${id}.json`), JSON.stringify(flow, null, 2), "utf-8");
  }
}
