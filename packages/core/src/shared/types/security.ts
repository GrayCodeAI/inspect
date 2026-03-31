// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Security Types
// ──────────────────────────────────────────────────────────────────────────────

/** Risk level classification */
export type SecurityRisk = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** Security alert from scanning */
export interface SecurityAlert {
  risk: SecurityRisk;
  name: string;
  description: string;
  solution: string;
  url: string;
  evidence: string;
  cweid: number;
  wascid?: number;
  param?: string;
  attack?: string;
  confidence?: 'confirmed' | 'high' | 'medium' | 'low' | 'false_positive';
  references?: string[];
  source?: 'zap' | 'nuclei' | 'custom';
  owaspCategory?: string;
}

/** Security scan report */
export interface SecurityReport {
  alerts: SecurityAlert[];
  scannedUrls: string[];
  duration: number;
  timestamp: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

/** Safety handler configuration */
export interface SafetyConfig {
  excludeActions?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  requireConfirmation: boolean;
  masking?: {
    patterns: string[];
    domains?: Record<string, string[]>;
    maskInScreenshots: boolean;
    maskInLogs: boolean;
  };
}

/** Database configuration */
export interface DatabaseConfig {
  connectionString: string;
  poolSize: number;
  maxOverflow: number;
  statementTimeout: number;
  replicaUrl?: string;
}

/** Cache configuration */
export interface CacheConfig {
  redisUrl?: string;
  defaultTTL: number;
  cacheTypes: {
    actions: boolean;
    llmResponses: boolean;
    pageContent: boolean;
    prompts: boolean;
  };
}
