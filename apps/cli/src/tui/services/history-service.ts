import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ProjectPaths } from "../../utils/project-context.js";

export interface HistoryEntry {
  file: string;
  url: string;
  title: string;
  score: number;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: string;
  tokens?: number;
}

export function loadHistory(): HistoryEntry[] {
  const dir = ProjectPaths.reports();
  if (!existsSync(dir)) return [];

  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const entries: HistoryEntry[] = [];

    for (const file of files.slice(0, 50)) {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        entries.push({
          file,
          url: data.url ?? "",
          title: data.title ?? "",
          score: data.summary?.overallScore ?? 0,
          passed: data.summary?.passed ?? 0,
          failed: data.summary?.failed ?? 0,
          total: data.summary?.total ?? 0,
          duration: data.summary?.duration ?? 0,
          timestamp: data.timestamp ?? "",
          tokens: data.cost?.tokens,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}
