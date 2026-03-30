/**
 * Multi-tenancy support for enterprise deployments.
 * Provides tenant isolation, quota enforcement, and usage tracking.
 */

import { createLogger } from "@inspect/observability";

const logger = createLogger("enterprise/tenant");

export type TenantPlan = "free" | "team" | "enterprise";

export interface TenantConfig {
  /** Max concurrent tests */
  maxConcurrentTests: number;
  /** Monthly token budget */
  monthlyTokenBudget: number;
  /** Monthly cost budget in USD */
  monthlyCostBudget: number;
  /** Allowed LLM providers */
  allowedProviders: string[];
  /** Max team members */
  maxUsers: number;
  /** Custom features */
  features: string[];
}

export interface TenantUser {
  userId: string;
  email: string;
  role: string;
  addedAt: number;
}

export interface TenantUsage {
  testsRun: number;
  tokensUsed: number;
  costIncurred: number;
  period: { start: number; end: number };
}

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  config: TenantConfig;
  users: TenantUser[];
  usage: TenantUsage;
  createdAt: number;
  active: boolean;
}

const PLAN_DEFAULTS: Record<TenantPlan, TenantConfig> = {
  free: {
    maxConcurrentTests: 2,
    monthlyTokenBudget: 100_000,
    monthlyCostBudget: 10,
    allowedProviders: ["ollama"],
    maxUsers: 1,
    features: ["basic-testing"],
  },
  team: {
    maxConcurrentTests: 10,
    monthlyTokenBudget: 1_000_000,
    monthlyCostBudget: 100,
    allowedProviders: ["anthropic", "openai", "gemini", "ollama"],
    maxUsers: 10,
    features: ["basic-testing", "reports", "scheduling", "ci-cd"],
  },
  enterprise: {
    maxConcurrentTests: 50,
    monthlyTokenBudget: 10_000_000,
    monthlyCostBudget: 1000,
    allowedProviders: ["anthropic", "openai", "gemini", "deepseek", "ollama"],
    maxUsers: 100,
    features: [
      "basic-testing",
      "reports",
      "scheduling",
      "ci-cd",
      "sso",
      "rbac",
      "audit",
      "priority-support",
    ],
  },
};

/**
 * TenantManager handles multi-tenant isolation and resource management.
 */
export class TenantManager {
  private tenants = new Map<string, Tenant>();

  /**
   * Create a new tenant.
   */
  createTenant(name: string, plan: TenantPlan = "free"): Tenant {
    const id = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const tenant: Tenant = {
      id,
      name,
      plan,
      config: { ...PLAN_DEFAULTS[plan] },
      users: [],
      usage: {
        testsRun: 0,
        tokensUsed: 0,
        costIncurred: 0,
        period: { start: now, end: now + 30 * 24 * 60 * 60 * 1000 },
      },
      createdAt: now,
      active: true,
    };

    this.tenants.set(id, tenant);
    logger.info("Tenant created", { id, name, plan });
    return tenant;
  }

  /**
   * Get a tenant by ID.
   */
  getTenant(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  /**
   * Update tenant configuration.
   */
  updateConfig(id: string, config: Partial<TenantConfig>): void {
    const tenant = this.tenants.get(id);
    if (!tenant) throw new Error(`Tenant "${id}" not found`);
    tenant.config = { ...tenant.config, ...config };
    logger.debug("Tenant config updated", { id });
  }

  /**
   * Add a user to a tenant.
   */
  addUser(tenantId: string, user: Omit<TenantUser, "addedAt">): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found`);
    if (tenant.users.length >= tenant.config.maxUsers) {
      throw new Error(`Tenant "${tenantId}" has reached max users (${tenant.config.maxUsers})`);
    }
    tenant.users.push({ ...user, addedAt: Date.now() });
  }

  /**
   * Remove a user from a tenant.
   */
  removeUser(tenantId: string, userId: string): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found`);
    tenant.users = tenant.users.filter((u) => u.userId !== userId);
  }

  /**
   * Record usage for a tenant.
   */
  recordUsage(tenantId: string, tokens: number, cost: number): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return;

    tenant.usage.tokensUsed += tokens;
    tenant.usage.costIncurred += cost;
    tenant.usage.testsRun++;
  }

  /**
   * Check if a tenant has exceeded its quotas.
   */
  enforceQuotas(tenantId: string): { allowed: boolean; reason?: string } {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { allowed: false, reason: "Tenant not found" };
    if (!tenant.active) return { allowed: false, reason: "Tenant is deactivated" };

    if (tenant.usage.tokensUsed >= tenant.config.monthlyTokenBudget) {
      return { allowed: false, reason: "Monthly token budget exceeded" };
    }
    if (tenant.usage.costIncurred >= tenant.config.monthlyCostBudget) {
      return { allowed: false, reason: "Monthly cost budget exceeded" };
    }

    return { allowed: true };
  }

  /**
   * Check if a provider is allowed for a tenant.
   */
  isProviderAllowed(tenantId: string, provider: string): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    return tenant.config.allowedProviders.includes(provider);
  }

  /**
   * Upgrade a tenant's plan.
   */
  upgradePlan(tenantId: string, newPlan: TenantPlan): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found`);
    tenant.plan = newPlan;
    tenant.config = { ...PLAN_DEFAULTS[newPlan] };
    logger.info("Tenant plan upgraded", { id: tenantId, plan: newPlan });
  }

  /**
   * Deactivate a tenant.
   */
  deactivate(tenantId: string): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found`);
    tenant.active = false;
    logger.info("Tenant deactivated", { id: tenantId });
  }

  /**
   * List all tenants.
   */
  listTenants(): Tenant[] {
    return [...this.tenants.values()];
  }

  /**
   * Get usage summary across all tenants.
   */
  getUsageSummary(): {
    totalTenants: number;
    activeTenants: number;
    totalTests: number;
    totalTokens: number;
    totalCost: number;
  } {
    let totalTests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let activeTenants = 0;

    for (const tenant of this.tenants.values()) {
      if (tenant.active) activeTenants++;
      totalTests += tenant.usage.testsRun;
      totalTokens += tenant.usage.tokensUsed;
      totalCost += tenant.usage.costIncurred;
    }

    return {
      totalTenants: this.tenants.size,
      activeTenants,
      totalTests,
      totalTokens,
      totalCost,
    };
  }
}
