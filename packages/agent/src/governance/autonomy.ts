/**
 * AutonomyManager — controls agent autonomy levels.
 * Stub implementation for CLI compilation.
 */

export enum AutonomyLevel {
  AUGMENTATION = 1,
  SUPERVISION = 2,
  DELEGATION = 3,
  AUTONOMY = 4,
}

export interface AutonomyConfig {
  level: AutonomyLevel;
  maxCostPerSession: number;
  maxStepsPerSession: number;
  requireApprovalFor: string[];
  autoEscalate: {
    onFailureCount: number;
    onCostThreshold: number;
    onSensitiveAction: boolean;
  };
}

export class AutonomyManager {
  private config: AutonomyConfig;

  constructor(config?: {
    level?: number;
    maxCostPerSession?: number;
    maxStepsPerSession?: number;
  }) {
    this.config = {
      level: config?.level ?? AutonomyLevel.SUPERVISION,
      maxCostPerSession: config?.maxCostPerSession ?? 1.0,
      maxStepsPerSession: config?.maxStepsPerSession ?? 100,
      requireApprovalFor: ["file_write", "shell_command", "network_request"],
      autoEscalate: {
        onFailureCount: 3,
        onCostThreshold: 0.5,
        onSensitiveAction: true,
      },
    };
  }

  getConfig(): AutonomyConfig {
    return this.config;
  }
}
