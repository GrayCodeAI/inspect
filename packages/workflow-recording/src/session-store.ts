import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Workflow } from "./types.js";

const DEFAULT_DIR = ".inspect/workflows";

export class WorkflowSessionStore {
  async save(workflow: Workflow, dir?: string): Promise<string> {
    const targetDir = dir ?? DEFAULT_DIR;
    await mkdir(targetDir, { recursive: true });

    const filePath = join(targetDir, `${workflow.id}.json`);
    const content = JSON.stringify(workflow, null, 2);
    await writeFile(filePath, content, "utf-8");

    return filePath;
  }

  async load(path: string): Promise<Workflow> {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as Workflow;
  }

  async list(dir?: string): Promise<Workflow[]> {
    const targetDir = dir ?? DEFAULT_DIR;

    try {
      const entries = await readdir(targetDir);
      const jsonFiles = entries.filter((entry) => extname(entry) === ".json");

      const workflows: Workflow[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await readFile(join(targetDir, file), "utf-8");
          const workflow = JSON.parse(content) as Workflow;
          workflows.push(workflow);
        } catch {
          // Skip corrupted files
        }
      }

      return workflows;
    } catch {
      return [];
    }
  }

  async delete(workflowId: string, dir?: string): Promise<void> {
    const targetDir = dir ?? DEFAULT_DIR;
    const filePath = join(targetDir, `${workflowId}.json`);

    try {
      await unlink(filePath);
    } catch {
      // File may not exist, ignore
    }
  }
}
