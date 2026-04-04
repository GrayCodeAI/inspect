// ============================================================================
// @inspect/quality - Lighthouse Score History
// ============================================================================

import type { LighthouseReport, LighthouseScore } from "@inspect/shared";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/lighthouse-history");

/** Historical score entry */
export interface ScoreEntry {
  /** Timestamp of the audit */
  timestamp: number;
  /** URL that was audited */
  url: string;
  /** Category scores */
  scores: LighthouseScore;
  /** Device used for the audit */
  device: "mobile" | "desktop";
  /** Key performance metric values */
  metrics: {
    FCP: number;
    LCP: number;
    CLS: number;
    TBT: number;
    SI: number;
    TTI: number;
  };
}

/** Score trend analysis */
export interface ScoreTrend {
  /** Direction of the trend */
  direction: "improving" | "declining" | "stable";
  /** Average change per entry */
  averageChange: number;
  /** Latest score */
  latest: number;
  /** Previous score */
  previous: number;
  /** Best score in history */
  best: number;
  /** Worst score in history */
  worst: number;
}

const DATA_DIR = ".inspect/lighthouse";

/**
 * ScoreHistory persists and retrieves Lighthouse score history
 * for trend analysis and regression detection.
 */
export class ScoreHistory {
  private readonly dataDir: string;

  constructor(baseDir?: string) {
    this.dataDir = baseDir ? join(baseDir, DATA_DIR) : DATA_DIR;
  }

  /**
   * Save a Lighthouse report to the score history.
   */
  async save(url: string, report: LighthouseReport): Promise<void> {
    const key = this.urlToKey(url);
    const filePath = join(this.dataDir, `${key}.json`);

    // Load existing history
    const history = await this.loadHistory(key);

    // Create score entry
    const entry: ScoreEntry = {
      timestamp: report.timestamp,
      url,
      scores: report.scores,
      device: report.device,
      metrics: {
        FCP: report.metrics.FCP.value,
        LCP: report.metrics.LCP.value,
        CLS: report.metrics.CLS.value,
        TBT: report.metrics.TBT.value,
        SI: report.metrics.SI.value,
        TTI: report.metrics.TTI.value,
      },
    };

    history.push(entry);

    // Keep last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    // Ensure directory exists
    await mkdir(this.dataDir, { recursive: true });

    // Write to file
    await writeFile(filePath, JSON.stringify(history, null, 2), "utf-8");
  }

  /**
   * Load score history for a URL.
   */
  async load(url: string): Promise<ScoreEntry[]> {
    const key = this.urlToKey(url);
    return this.loadHistory(key);
  }

  /**
   * Get the full history entries for a URL.
   */
  async getHistory(url: string): Promise<ScoreEntry[]> {
    return this.load(url);
  }

  /**
   * Get trend analysis for a URL's performance score.
   */
  async getTrend(
    url: string,
    category: keyof LighthouseScore = "performance",
  ): Promise<ScoreTrend | null> {
    const history = await this.load(url);
    if (history.length < 2) return null;

    const scores = history.map((entry) => entry.scores[category] ?? 0);
    const latest = scores[scores.length - 1];
    const previous = scores[scores.length - 2];
    const best = Math.max(...scores);
    const worst = Math.min(...scores);

    // Calculate average change
    let totalChange = 0;
    for (let i = 1; i < scores.length; i++) {
      totalChange += scores[i] - scores[i - 1];
    }
    const averageChange = totalChange / (scores.length - 1);

    let direction: "improving" | "declining" | "stable";
    if (Math.abs(averageChange) < 1) {
      direction = "stable";
    } else if (averageChange > 0) {
      direction = "improving";
    } else {
      direction = "declining";
    }

    return {
      direction,
      averageChange: Math.round(averageChange * 100) / 100,
      latest,
      previous,
      best,
      worst,
    };
  }

  /**
   * Check if the latest score regressed compared to the previous entry.
   * Returns the regression amount (negative means improvement).
   */
  async checkRegression(
    url: string,
    category: keyof LighthouseScore = "performance",
    threshold: number = 5,
  ): Promise<{ regressed: boolean; amount: number } | null> {
    const history = await this.load(url);
    if (history.length < 2) return null;

    const latest = history[history.length - 1].scores[category] ?? 0;
    const previous = history[history.length - 2].scores[category] ?? 0;
    const amount = previous - latest;

    return {
      regressed: amount >= threshold,
      amount,
    };
  }

  /**
   * Clear history for a URL.
   */
  async clear(url: string): Promise<void> {
    const key = this.urlToKey(url);
    const filePath = join(this.dataDir, `${key}.json`);
    try {
      await writeFile(filePath, "[]", "utf-8");
    } catch (error) {
      logger.warn("Failed to clear score history file", { filePath, error });
    }
  }

  /**
   * List all URLs that have recorded history.
   */
  async listTrackedUrls(): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    try {
      const files = await readdir(this.dataDir);
      const urls: string[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await readFile(join(this.dataDir, file), "utf-8");
            const entries = JSON.parse(content) as ScoreEntry[];
            if (entries.length > 0) {
              urls.push(entries[0].url);
            }
          } catch (error) {
            logger.debug("Failed to read score history file, skipping", { file, error });
          }
        }
      }
      return urls;
    } catch (error) {
      logger.debug("Failed to list tracked URL directory", { dataDir: this.dataDir, error });
      return [];
    }
  }

  /**
   * Load history from file by key.
   */
  private async loadHistory(key: string): Promise<ScoreEntry[]> {
    const filePath = join(this.dataDir, `${key}.json`);
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as ScoreEntry[];
    } catch (error) {
      logger.debug("Failed to load score history file", { filePath, error });
      return [];
    }
  }

  /**
   * Convert a URL to a filesystem-safe key.
   */
  private urlToKey(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 16);
  }
}
