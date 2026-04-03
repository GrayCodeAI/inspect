/**
 * AuditTrail — records agent actions for compliance and debugging.
 * Stub implementation for CLI compilation.
 */

export interface AuditEntry {
  timestamp: number;
  sessionId: string;
  action: string;
  input: string;
  toolCalls: Array<{ name: string; duration: number }>;
  cost: number;
  tokens: number;
}

export interface AuditQuery {
  sessionId?: string;
  startTime?: number;
  endTime?: number;
}

export interface ComplianceReport {
  generatedAt: string;
  standard: string;
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

export class AuditTrail {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  record(_entry: Omit<AuditEntry, "timestamp">): void {
    // Stub
  }

  query(_query: AuditQuery): AuditEntry[] {
    return [];
  }

  generateComplianceReport(
    _standard: "eu-ai-act" | "soc2" | "iso27001",
    _sessionId?: string,
  ): ComplianceReport {
    return {
      generatedAt: new Date().toISOString(),
      standard: _standard,
      summary: {
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        totalCost: 0,
        totalTokens: 0,
        agentCount: 0,
        sessionCount: 0,
      },
      sections: [],
    };
  }
}
