// Flow Storage — save, list, and manage test flows with YAML frontmatter
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createLogger } from "@inspect/observability";

const logger = createLogger("cli/flow-storage");

export interface SavedFlow {
  slug: string;
  name: string;
  instruction: string;
  target: "unstaged" | "branch" | "changes";
  url?: string;
  agent?: string;
  mode?: string;
  devices?: string;
  tags: string[];
  createdAt: string;
  lastRun?: string;
  runCount: number;
}

export class FlowStorage {
  private storageDir: string;

  constructor(storageDir = ".inspect/flows") {
    this.storageDir = storageDir;
    mkdirSync(storageDir, { recursive: true });
  }

  save(flow: Omit<SavedFlow, "slug" | "createdAt" | "runCount">): SavedFlow {
    const slug = this.generateSlug(flow.name);
    const saved: SavedFlow = {
      ...flow,
      slug,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };

    const yaml = this.serializeToYaml(saved);
    const filePath = join(this.storageDir, `${slug}.yaml`);
    writeFileSync(filePath, yaml);
    logger.info("Flow saved", { slug, name: flow.name });
    return saved;
  }

  load(slug: string): SavedFlow | null {
    const filePath = join(this.storageDir, `${slug}.yaml`);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, "utf-8");
      return this.parseYaml(content);
    } catch {
      return null;
    }
  }

  list(): SavedFlow[] {
    if (!existsSync(this.storageDir)) return [];
    const files = readdirSync(this.storageDir).filter((f) => f.endsWith(".yaml"));
    return files
      .map((f) => this.load(f.replace(".yaml", "")))
      .filter((f): f is SavedFlow => f !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  delete(slug: string): boolean {
    const filePath = join(this.storageDir, `${slug}.yaml`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  recordRun(slug: string): void {
    const flow = this.load(slug);
    if (!flow) return;
    flow.runCount++;
    flow.lastRun = new Date().toISOString();
    const yaml = this.serializeToYaml(flow);
    writeFileSync(join(this.storageDir, `${slug}.yaml`), yaml);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  private serializeToYaml(flow: SavedFlow): string {
    let yaml = "---\n";
    yaml += `name: "${flow.name}"\n`;
    yaml += `instruction: "${flow.instruction}"\n`;
    yaml += `target: ${flow.target}\n`;
    if (flow.url) yaml += `url: "${flow.url}"\n`;
    if (flow.agent) yaml += `agent: ${flow.agent}\n`;
    if (flow.mode) yaml += `mode: ${flow.mode}\n`;
    if (flow.devices) yaml += `devices: "${flow.devices}"\n`;
    yaml += `tags: [${flow.tags.join(", ")}]\n`;
    yaml += `created_at: "${flow.createdAt}"\n`;
    if (flow.lastRun) yaml += `last_run: "${flow.lastRun}"\n`;
    yaml += `run_count: ${flow.runCount}\n`;
    yaml += "---\n";
    return yaml;
  }

  private parseYaml(content: string): SavedFlow | null {
    try {
      const match = content.match(/---\n([\s\S]*?)\n---/);
      if (!match) return null;
      const lines = match[1].split("\n");
      const data: Record<string, string> = {};
      for (const line of lines) {
        const [key, ...valueParts] = line.split(":");
        if (key && valueParts.length > 0) {
          data[key.trim()] = valueParts.join(":").trim().replace(/^"|"$/g, "");
        }
      }
      return {
        slug: "",
        name: data["name"] ?? "",
        instruction: data["instruction"] ?? "",
        target: (data["target"] as SavedFlow["target"]) ?? "changes",
        url: data["url"],
        agent: data["agent"],
        mode: data["mode"],
        devices: data["devices"],
        tags: data["tags"]
          ? data["tags"]
              .replace(/[\[\]]/g, "")
              .split(", ")
              .map((t) => t.trim())
          : [],
        createdAt: data["created_at"] ?? new Date().toISOString(),
        lastRun: data["last_run"],
        runCount: parseInt(data["run_count"] ?? "0", 10),
      };
    } catch {
      return null;
    }
  }
}
