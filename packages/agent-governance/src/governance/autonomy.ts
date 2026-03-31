/**
 * Graduated autonomy levels for agent execution.
 * Controls how much independence an agent has.
 */
export enum AutonomyLevel {
  /** Agent suggests, human approves every action */
  AUGMENTATION = 1,
  /** Agent acts, human monitors, can intervene */
  SUPERVISION = 2,
  /** Agent acts independently, reports results */
  DELEGATION = 3,
  /** Agent acts independently, only reports failures */
  AUTONOMY = 4,
}

export interface AutonomyConfig {
  level: AutonomyLevel;
  /** USD cost limit per session */
  maxCostPerSession: number;
  /** Max steps per session */
  maxStepsPerSession: number;
  /** Actions requiring human approval */
  requireApprovalFor: string[];
  autoEscalate: {
    /** Escalate after N failures */
    onFailureCount: number;
    /** Escalate at $X cost */
    onCostThreshold: number;
    /** Always escalate for sensitive actions */
    onSensitiveAction: boolean;
  };
}

const DEFAULT_CONFIG: AutonomyConfig = {
  level: AutonomyLevel.SUPERVISION,
  maxCostPerSession: 5.0,
  maxStepsPerSession: 50,
  requireApprovalFor: [],
  autoEscalate: {
    onFailureCount: 3,
    onCostThreshold: 2.0,
    onSensitiveAction: true,
  },
};

/**
 * Manages agent autonomy levels with escalation triggers.
 */
export class AutonomyManager {
  private config: AutonomyConfig;
  private failureCount = 0;
  private currentCost = 0;
  private escalated = false;

  constructor(config: Partial<AutonomyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getLevel(): AutonomyLevel {
    return this.config.level;
  }

  getConfig(): AutonomyConfig {
    return { ...this.config };
  }

  /**
   * Check if an action can proceed at the current autonomy level.
   */
  canProceed(action: string): { allowed: boolean; requiresApproval: boolean; reason?: string } {
    if (this.escalated) {
      return { allowed: false, requiresApproval: true, reason: "Agent has been escalated — human approval required" };
    }

    if (this.config.requireApprovalFor.includes(action)) {
      return { allowed: true, requiresApproval: true, reason: "Action requires human approval per policy" };
    }

    if (this.currentCost >= this.config.maxCostPerSession) {
      return { allowed: false, requiresApproval: true, reason: `Cost limit reached ($${this.currentCost.toFixed(2)})` };
    }

    switch (this.config.level) {
      case AutonomyLevel.AUGMENTATION:
        return { allowed: true, requiresApproval: true, reason: "Augmentation mode — all actions need approval" };
      case AutonomyLevel.SUPERVISION:
        return { allowed: true, requiresApproval: false };
      case AutonomyLevel.DELEGATION:
        return { allowed: true, requiresApproval: false };
      case AutonomyLevel.AUTONOMY:
        return { allowed: true, requiresApproval: false };
    }
  }

  /**
   * Record a failure and check if escalation is needed.
   */
  recordFailure(): boolean {
    this.failureCount++;
    if (this.failureCount >= this.config.autoEscalate.onFailureCount) {
      this.escalated = true;
      return true;
    }
    return false;
  }

  /**
   * Record cost and check if threshold exceeded.
   */
  recordCost(amount: number): boolean {
    this.currentCost += amount;
    if (this.currentCost >= this.config.autoEscalate.onCostThreshold) {
      this.escalated = true;
      return true;
    }
    return false;
  }

  /**
   * Record a sensitive action and check if escalation needed.
   */
  recordSensitiveAction(): boolean {
    if (this.config.autoEscalate.onSensitiveAction) {
      this.escalated = true;
      return true;
    }
    return false;
  }

  isEscalated(): boolean {
    return this.escalated;
  }

  reset(): void {
    this.failureCount = 0;
    this.currentCost = 0;
    this.escalated = false;
  }
}
