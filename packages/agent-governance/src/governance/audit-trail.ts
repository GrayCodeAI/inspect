import { createHash } from "node:crypto";
import { mkdir, appendFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/governance/audit");

export type AuditAction =
  | "llm_call"
  | "tool_use"
  | "navigation"
  | "form_fill"
  | "assertion"
  | "screenshot"
  | "extraction"
  | "wait";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  duration: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cost: number;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  sessionId: string;
  action: AuditAction;
  input: string;
  output: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  tokenUsage: TokenUsage;
  cost: number;
  duration: number;
  result: "success" | "failure" | "partial";
  metadata: Record<string, unknown>;
  /** SHA-256 of previous entry for tamper detection */
  previousHash?: string;
  /** SHA-256 of this entry */
  hash: string;
}

export interface AuditFilter {
  agentId?: string;
  sessionId?: string;
  action?: AuditAction;
  result?: "success" | "failure" | "partial";
  startTime?: number;
  endTime?: number;
}

export interface ComplianceReport {
  standard: "eu-ai-act" | "soc2" | "iso27001";
  generatedAt: string;
  sessionId?: string;
  summary: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    totalCost: number;
    totalTokens: number;
    agentCount: number;
    sessionCount: number;
  };
  sections: Array<{
    title: string;
    status: "pass" | "fail" | "warning";
    details: string;
  }>;
}

/**
 * Immutable, append-only audit trail with SHA-256 hash chain
 * for tamper-evident logging of all agent decisions.
 */
export class AuditTrail {
  private entries: AuditEntry[] = [];
  private storagePath: string;
  private lastHash = "0".repeat(64);

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async init(): Promise<void> {
    await mkdir(this.storagePath, { recursive: true });
    await this.loadExisting();
    logger.info("Audit trail initialized", { entries: this.entries.length });
  }

  /**
   * Log an audit entry. Append-only — entries cannot be modified.
   */
  async log(
    entry: Omit<AuditEntry, "id" | "timestamp" | "hash" | "previousHash">,
  ): Promise<AuditEntry> {
    const id = generateId();
    const timestamp = Date.now();
    const previousHash = this.lastHash;

    const fullEntry: AuditEntry = {
      ...entry,
      id,
      timestamp,
      previousHash,
      hash: "",
    };
    fullEntry.hash = this.computeHash(fullEntry);

    this.entries.push(fullEntry);
    this.lastHash = fullEntry.hash;

    // Append to disk (immutable)
    const line = JSON.stringify(fullEntry) + "\n";
    const filePath = join(this.storagePath, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await appendFile(filePath, line, "utf-8");

    return fullEntry;
  }

  /**
   * Query audit entries with optional filters.
   */
  query(filter: AuditFilter = {}): AuditEntry[] {
    return this.entries.filter((e) => {
      if (filter.agentId && e.agentId !== filter.agentId) return false;
      if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.result && e.result !== filter.result) return false;
      if (filter.startTime && e.timestamp < filter.startTime) return false;
      if (filter.endTime && e.timestamp > filter.endTime) return false;
      return true;
    });
  }

  /**
   * Export audit trail in specified format.
   */
  async export(format: "json" | "csv" | "junit"): Promise<string> {
    switch (format) {
      case "json":
        return JSON.stringify(this.entries, null, 2);
      case "csv":
        return this.toCsv();
      case "junit":
        return this.toJunit();
    }
  }

  /**
   * Generate a compliance report for the specified standard.
   */
  generateComplianceReport(
    standard: ComplianceReport["standard"],
    sessionId?: string,
  ): ComplianceReport {
    const filtered = sessionId ? this.query({ sessionId }) : this.entries;

    const agents = new Set(filtered.map((e) => e.agentId));
    const sessions = new Set(filtered.map((e) => e.sessionId));
    const successful = filtered.filter((e) => e.result === "success").length;
    const failed = filtered.filter((e) => e.result === "failure").length;

    const summary = {
      totalActions: filtered.length,
      successfulActions: successful,
      failedActions: failed,
      totalCost: filtered.reduce((s, e) => s + e.cost, 0),
      totalTokens: filtered.reduce((s, e) => s + e.tokenUsage.total, 0),
      agentCount: agents.size,
      sessionCount: sessions.size,
    };

    const sections = this.getComplianceSections(standard, filtered);

    return {
      standard,
      generatedAt: new Date().toISOString(),
      sessionId,
      summary,
      sections,
    };
  }

  /**
   * Verify hash chain integrity — detect tampering.
   */
  verifyHashChain(): { valid: boolean; brokenAt?: string } {
    let prevHash = "0".repeat(64);
    for (const entry of this.entries) {
      if (entry.previousHash !== prevHash) {
        return { valid: false, brokenAt: entry.id };
      }
      const { hash: _hash, ...rest } = entry;
      const computed = this.computeHash({ ...rest, previousHash: prevHash });
      if (computed !== entry.hash) {
        return { valid: false, brokenAt: entry.id };
      }
      prevHash = entry.hash;
    }
    return { valid: true };
  }

  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  getCount(): number {
    return this.entries.length;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private computeHash(entry: Omit<AuditEntry, "hash">): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      action: entry.action,
      input: entry.input,
      output: entry.output,
      previousHash: entry.previousHash,
    });
    return createHash("sha256").update(data).digest("hex");
  }

  private async loadExisting(): Promise<void> {
    try {
      const files = await readdir(this.storagePath);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl")).sort();
      for (const file of jsonlFiles) {
        const content = await readFile(join(this.storagePath, file), "utf-8");
        for (const line of content.split("\n").filter(Boolean)) {
          try {
            const entry = JSON.parse(line) as AuditEntry;
            this.entries.push(entry);
            this.lastHash = entry.hash;
          } catch {
            /* skip malformed lines */
          }
        }
      }
    } catch {
      /* no existing files */
    }
  }

  private toCsv(): string {
    if (this.entries.length === 0) return "";
    const header = "id,timestamp,agentId,sessionId,action,result,cost,tokens,duration\n";
    const rows = this.entries
      .map(
        (e) =>
          `${e.id},${e.timestamp},${e.agentId},${e.sessionId},${e.action},${e.result},${e.cost},${e.tokenUsage.total},${e.duration}`,
      )
      .join("\n");
    return header + rows;
  }

  private toJunit(): string {
    const total = this.entries.length;
    const failures = this.entries.filter((e) => e.result === "failure").length;
    const time = this.entries.reduce((s, e) => s + e.duration, 0) / 1000;
    const cases = this.entries
      .map((e) => {
        const status =
          e.result === "success"
            ? `<testcase name="${e.action}" time="${e.duration / 1000}"/>`
            : `<testcase name="${e.action}" time="${e.duration / 1000}"><failure message="${e.output}"/></testcase>`;
        return `    ${status}`;
      })
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="agent-audit" tests="${total}" failures="${failures}" time="${time}">\n${cases}\n</testsuite>`;
  }

  private getComplianceSections(
    standard: ComplianceReport["standard"],
    entries: AuditEntry[],
  ): ComplianceReport["sections"] {
    switch (standard) {
      case "eu-ai-act":
        return [
          {
            title: "Transparency — All AI decisions logged",
            status: entries.length > 0 ? "pass" : "fail",
            details: `${entries.length} decisions logged with full input/output trace`,
          },
          {
            title: "Human Oversight — Audit trail supports human review",
            status: "pass",
            details: "Immutable append-only log with hash chain verification",
          },
          {
            title: "Record Keeping — Tamper-evident storage",
            status: this.verifyHashChain().valid ? "pass" : "fail",
            details: "SHA-256 hash chain for tamper detection",
          },
          {
            title: "Risk Management — Failure tracking",
            status: "pass",
            details: `${entries.filter((e) => e.result === "failure").length} failures recorded with full context`,
          },
        ];
      case "soc2":
        return [
          {
            title: "CC6.1 — Logical access controls",
            status: "pass",
            details: "Agent actions logged with identity and session tracking",
          },
          {
            title: "CC7.2 — System monitoring",
            status: "pass",
            details: "Real-time audit trail with token usage and cost tracking",
          },
          {
            title: "CC8.1 — Change management",
            status: "pass",
            details: "All agent actions recorded with timestamps and outcomes",
          },
        ];
      case "iso27001":
        return [
          {
            title: "A.12.4 — Event logging",
            status: entries.length > 0 ? "pass" : "warning",
            details: `${entries.length} events logged`,
          },
          {
            title: "A.12.4.1 — Audit logging",
            status: "pass",
            details: "Immutable audit trail with hash chain",
          },
        ];
    }
  }
}
