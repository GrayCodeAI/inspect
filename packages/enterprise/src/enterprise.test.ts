import { describe, it, expect } from "vitest";
import { RBACManager, Role } from "./rbac.js";
import { HybridRouter } from "./hybrid-router.js";
import { TenantManager } from "./tenant.js";
import { SSOManager } from "./sso.js";

describe("RBACManager", () => {
  it("should allow tester to execute test command", () => {
    const rbac = new RBACManager();
    const user = { id: "1", email: "test@example.com", name: "Tester", role: Role.TESTER };
    expect(rbac.canExecuteCommand(user, "test")).toBe(true);
    expect(rbac.canExecuteCommand(user, "doctor")).toBe(false);
  });

  it("should allow admin to execute any command", () => {
    const rbac = new RBACManager();
    const user = { id: "1", email: "admin@example.com", name: "Admin", role: Role.ADMIN };
    expect(rbac.canExecuteCommand(user, "anything")).toBe(true);
  });

  it("should deny viewer from executing test", () => {
    const rbac = new RBACManager();
    const user = { id: "1", email: "viewer@example.com", name: "Viewer", role: Role.VIEWER };
    expect(rbac.canExecuteCommand(user, "test")).toBe(false);
    expect(rbac.canExecuteCommand(user, "show-report")).toBe(true);
  });

  it("should check provider permissions", () => {
    const rbac = new RBACManager();
    const tester = { id: "1", email: "t@e.com", name: "T", role: Role.TESTER };
    expect(rbac.canUseProvider(tester, "anthropic")).toBe(true);
    expect(rbac.canUseProvider(tester, "unknown")).toBe(false);
  });

  it("should check resource permissions", () => {
    const rbac = new RBACManager();
    const tester = { id: "1", email: "t@e.com", name: "T", role: Role.TESTER };
    expect(rbac.hasPermission(tester, "tests", "create")).toBe(true);
    expect(rbac.hasPermission(tester, "tests", "delete")).toBe(false);
  });

  it("should return cost budget", () => {
    const rbac = new RBACManager();
    expect(rbac.getCostBudget({ id: "1", email: "", name: "", role: Role.TESTER })).toBe(50);
    expect(rbac.getCostBudget({ id: "1", email: "", name: "", role: Role.SUPER_ADMIN })).toBe(
      10000,
    );
  });
});

describe("HybridRouter", () => {
  const mockLocalProvider = { getName: () => "ollama", getModel: () => "llama3.1" } as unknown;
  const mockCloudProvider = { getName: () => "anthropic", getModel: () => "claude-sonnet" } as unknown;

  it("should route sensitive data to local", async () => {
    const router = new HybridRouter({
      localProvider: mockLocalProvider,
      cloudProvider: mockCloudProvider,
      localForSensitive: true,
      localLoadThreshold: 0.8,
      preferLocal: false,
    });

    const decision = await router.route({ containsSensitiveData: true });
    expect(decision.isLocal).toBe(true);
    expect(decision.estimatedCost).toBe(0);
  });

  it("should route vision to cloud", async () => {
    const router = new HybridRouter({
      localProvider: mockLocalProvider,
      cloudProvider: mockCloudProvider,
      localForSensitive: true,
      localLoadThreshold: 0.8,
      preferLocal: false,
    });

    const decision = await router.route({ requiresVision: true });
    expect(decision.isLocal).toBe(false);
  });

  it("should route to local when load is low", async () => {
    const router = new HybridRouter({
      localProvider: mockLocalProvider,
      cloudProvider: mockCloudProvider,
      localForSensitive: false,
      localLoadThreshold: 0.8,
      preferLocal: false,
    });

    router.setLocalLoad(0.3);
    const decision = await router.route({});
    expect(decision.isLocal).toBe(true);
  });

  it("should track routing statistics", async () => {
    const router = new HybridRouter({
      localProvider: mockLocalProvider,
      cloudProvider: mockCloudProvider,
      localForSensitive: false,
      localLoadThreshold: 0.8,
      preferLocal: true,
    });

    await router.route({});
    await router.route({});
    const stats = router.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.localRequests).toBe(2);
    expect(stats.localPercentage).toBe(100);
  });
});

// ─── TenantManager ──────────────────────────────────────────────────────────

describe("TenantManager", () => {
  it("creates a tenant with default free plan", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme Corp");

    expect(tenant.id).toBeTruthy();
    expect(tenant.name).toBe("Acme Corp");
    expect(tenant.plan).toBe("free");
    expect(tenant.active).toBe(true);
    expect(tenant.config.maxUsers).toBe(1);
  });

  it("creates a tenant with enterprise plan", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Big Corp", "enterprise");

    expect(tenant.plan).toBe("enterprise");
    expect(tenant.config.maxUsers).toBe(100);
    expect(tenant.config.features).toContain("sso");
  });

  it("adds users to tenant", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme", "team");

    mgr.addUser(tenant.id, { userId: "u1", email: "a@acme.com", role: "tester" });
    mgr.addUser(tenant.id, { userId: "u2", email: "b@acme.com", role: "admin" });

    const updated = mgr.getTenant(tenant.id)!;
    expect(updated.users).toHaveLength(2);
  });

  it("enforces max users limit", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Small", "free"); // maxUsers = 1

    mgr.addUser(tenant.id, { userId: "u1", email: "a@b.com", role: "tester" });

    expect(() =>
      mgr.addUser(tenant.id, { userId: "u2", email: "b@b.com", role: "tester" }),
    ).toThrow("max users");
  });

  it("records and enforces quotas", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme", "free");

    const check1 = mgr.enforceQuotas(tenant.id);
    expect(check1.allowed).toBe(true);

    mgr.recordUsage(tenant.id, 200_000, 5); // free budget = 100,000 tokens

    const check2 = mgr.enforceQuotas(tenant.id);
    expect(check2.allowed).toBe(false);
    expect(check2.reason).toContain("token budget");
  });

  it("checks provider access", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme", "free");

    expect(mgr.isProviderAllowed(tenant.id, "ollama")).toBe(true);
    expect(mgr.isProviderAllowed(tenant.id, "anthropic")).toBe(false);
  });

  it("upgrades plan", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme", "free");

    mgr.upgradePlan(tenant.id, "enterprise");

    const updated = mgr.getTenant(tenant.id)!;
    expect(updated.plan).toBe("enterprise");
    expect(updated.config.maxUsers).toBe(100);
  });

  it("deactivates tenant", () => {
    const mgr = new TenantManager();
    const tenant = mgr.createTenant("Acme");

    mgr.deactivate(tenant.id);

    expect(mgr.enforceQuotas(tenant.id).allowed).toBe(false);
    expect(mgr.enforceQuotas(tenant.id).reason).toContain("deactivated");
  });

  it("provides usage summary", () => {
    const mgr = new TenantManager();
    mgr.createTenant("A");
    mgr.createTenant("B", "team");
    mgr.recordUsage(mgr.listTenants()[0].id, 100, 5);

    const summary = mgr.getUsageSummary();
    expect(summary.totalTenants).toBe(2);
    expect(summary.totalTests).toBe(1);
    expect(summary.totalTokens).toBe(100);
  });
});

// ─── SSOManager ─────────────────────────────────────────────────────────────

describe("SSOManager", () => {
  it("initiates OIDC auth flow", () => {
    const sso = new SSOManager({
      provider: "oidc",
      entityId: "my-app",
      ssoUrl: "https://auth.example.com/authorize",
      callbackUrl: "https://app.example.com/callback",
      clientId: "client-123",
    });

    const request = sso.initiateAuth();
    expect(request.redirectUrl).toContain("auth.example.com");
    expect(request.redirectUrl).toContain("client_id=client-123");
    expect(request.state).toBeTruthy();
    expect(request.provider).toBe("oidc");
  });

  it("creates session from callback", () => {
    const sso = new SSOManager({
      provider: "saml",
      entityId: "my-app",
      ssoUrl: "https://auth.example.com/sso",
      callbackUrl: "https://app.example.com/callback",
    });

    const request = sso.initiateAuth();
    const session = sso.handleCallback(request.state, {
      userId: "user-1",
      email: "user@example.com",
      displayName: "Test User",
      roles: ["tester"],
    });

    expect(session.userId).toBe("user-1");
    expect(session.email).toBe("user@example.com");
    expect(session.roles).toContain("tester");
    expect(session.sessionId).toBeTruthy();
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("validates sessions", () => {
    const sso = new SSOManager({
      provider: "oidc",
      entityId: "my-app",
      ssoUrl: "https://auth.example.com",
      callbackUrl: "https://app.example.com/callback",
    });

    const request = sso.initiateAuth();
    const session = sso.handleCallback(request.state, {
      userId: "u1",
      email: "u1@test.com",
    });

    expect(sso.validateSession(session.sessionId)).toBeTruthy();
    expect(sso.validateSession("nonexistent")).toBeNull();
  });

  it("revokes sessions", () => {
    const sso = new SSOManager({
      provider: "oidc",
      entityId: "my-app",
      ssoUrl: "https://auth.example.com",
      callbackUrl: "https://app.example.com/callback",
    });

    const request = sso.initiateAuth();
    const session = sso.handleCallback(request.state, {
      userId: "u1",
      email: "u1@test.com",
    });

    expect(sso.revokeSession(session.sessionId)).toBe(true);
    expect(sso.validateSession(session.sessionId)).toBeNull();
    expect(sso.revokeSession(session.sessionId)).toBe(false);
  });

  it("generates SAML metadata", () => {
    const xml = SSOManager.generateSAMLMetadata(
      "https://my-app.example.com",
      "https://my-app.example.com/callback",
    );

    expect(xml).toContain("EntityDescriptor");
    expect(xml).toContain("SPSSODescriptor");
    expect(xml).toContain("https://my-app.example.com/callback");
  });
});
