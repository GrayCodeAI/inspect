import { createLogger } from "@inspect/observability";

const _logger = createLogger("enterprise/rbac");

export enum Role {
  VIEWER = "viewer",
  TESTER = "tester",
  ADMIN = "admin",
  SECURITY = "security",
  SUPER_ADMIN = "super_admin",
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface RBACPolicy {
  role: Role;
  permissions: Permission[];
  allowedCommands: string[];
  allowedProviders: string[];
  maxConcurrentTests: number;
  costBudget: number;
}

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId?: string;
}

const DEFAULT_POLICIES: Record<Role, RBACPolicy> = {
  [Role.VIEWER]: {
    role: Role.VIEWER,
    permissions: [{ resource: "reports", actions: ["read"] }, { resource: "dashboard", actions: ["read"] }],
    allowedCommands: ["show-report", "show-trace", "devices", "models"],
    allowedProviders: [],
    maxConcurrentTests: 0,
    costBudget: 0,
  },
  [Role.TESTER]: {
    role: Role.TESTER,
    permissions: [
      { resource: "tests", actions: ["read", "create", "execute"] },
      { resource: "reports", actions: ["read"] },
      { resource: "workflows", actions: ["read", "execute"] },
    ],
    allowedCommands: ["test", "run", "open", "screenshot", "pdf", "codegen", "replay", "compare", "show-report"],
    allowedProviders: ["anthropic", "openai", "gemini", "deepseek", "ollama"],
    maxConcurrentTests: 5,
    costBudget: 50,
  },
  [Role.ADMIN]: {
    role: Role.ADMIN,
    permissions: [
      { resource: "*", actions: ["read", "create", "update", "delete"] },
    ],
    allowedCommands: ["*"],
    allowedProviders: ["anthropic", "openai", "gemini", "deepseek", "ollama"],
    maxConcurrentTests: 20,
    costBudget: 500,
  },
  [Role.SECURITY]: {
    role: Role.SECURITY,
    permissions: [
      { resource: "tests", actions: ["read", "create", "execute"] },
      { resource: "security", actions: ["read", "create", "execute"] },
      { resource: "reports", actions: ["read"] },
    ],
    allowedCommands: ["test", "security", "a11y", "screenshot", "show-report"],
    allowedProviders: ["anthropic", "openai", "gemini", "deepseek"],
    maxConcurrentTests: 10,
    costBudget: 100,
  },
  [Role.SUPER_ADMIN]: {
    role: Role.SUPER_ADMIN,
    permissions: [{ resource: "*", actions: ["*"] }],
    allowedCommands: ["*"],
    allowedProviders: ["*"],
    maxConcurrentTests: 100,
    costBudget: 10000,
  },
};

/**
 * Role-Based Access Control manager.
 */
export class RBACManager {
  private policies: Map<Role, RBACPolicy>;
  private users = new Map<string, UserIdentity>();

  constructor(customPolicies?: Partial<Record<Role, Partial<RBACPolicy>>>) {
    this.policies = new Map();
    for (const [role, defaultPolicy] of Object.entries(DEFAULT_POLICIES)) {
      const custom = customPolicies?.[role as Role];
      this.policies.set(role as Role, custom ? { ...defaultPolicy, ...custom } : defaultPolicy);
    }
  }

  /**
   * Check if a user can execute a command.
   */
  canExecuteCommand(user: UserIdentity, command: string): boolean {
    const policy = this.policies.get(user.role);
    if (!policy) return false;
    if (policy.allowedCommands.includes("*")) return true;
    return policy.allowedCommands.includes(command);
  }

  /**
   * Check if a user can use a provider.
   */
  canUseProvider(user: UserIdentity, provider: string): boolean {
    const policy = this.policies.get(user.role);
    if (!policy) return false;
    if (policy.allowedProviders.includes("*")) return true;
    return policy.allowedProviders.includes(provider);
  }

  /**
   * Check if a user has permission for a resource action.
   */
  hasPermission(user: UserIdentity, resource: string, action: string): boolean {
    const policy = this.policies.get(user.role);
    if (!policy) return false;
    return policy.permissions.some((p) => {
      const resourceMatch = p.resource === "*" || p.resource === resource;
      const actionMatch = p.actions.includes("*") || p.actions.includes(action);
      return resourceMatch && actionMatch;
    });
  }

  /**
   * Get user's cost budget.
   */
  getCostBudget(user: UserIdentity): number {
    return this.policies.get(user.role)?.costBudget ?? 0;
  }

  /**
   * Register a user.
   */
  registerUser(user: UserIdentity): void {
    this.users.set(user.id, user);
  }

  getUser(id: string): UserIdentity | undefined {
    return this.users.get(id);
  }

  getPolicy(role: Role): RBACPolicy | undefined {
    return this.policies.get(role);
  }
}
