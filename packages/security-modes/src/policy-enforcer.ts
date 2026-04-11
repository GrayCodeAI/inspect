import { Data, Effect, Layer, Ref, Schema, ServiceMap } from "effect";
import { PolicyViolationError, SecurityModeError } from "./errors.js";

export type Permission = Data.TaggedEnum<{
  NetworkAccess: { domains: string[] };
  FileSystemAccess: { paths: string[]; readOnly: boolean };
  ProcessExecution: { commands: string[] };
  DataIsolation: { tenantId: string };
  APIAccess: { endpoints: string[]; rateLimit: number };
  BrowserAutomation: { allowedActions: string[] };
}>;
export const Permission = Data.taggedEnum<Permission>();

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enforced: boolean;
}

export interface PolicyRule {
  condition: string;
  action: "allow" | "deny" | "audit";
  message: string;
}

export interface PolicyEvaluationResult {
  policyId: string;
  passed: boolean;
  violations: PolicyViolation[];
}

export interface PolicyViolation {
  rule: PolicyRule;
  context: unknown;
}

export class PolicyEnforcer extends ServiceMap.Service<
  PolicyEnforcer,
  {
    readonly loadPolicies: (
      policies: SecurityPolicy[],
    ) => Effect.Effect<void, SecurityModeError>;
    readonly evaluate: (
      policyId: string,
      context: Record<string, unknown>,
    ) => Effect.Effect<PolicyEvaluationResult, SecurityModeError>;
    readonly enforce: (
      policyId: string,
      action: string,
      context: Record<string, unknown>,
    ) => Effect.Effect<void, PolicyViolationError>;
    readonly getPolicies: Effect.Effect<SecurityPolicy[], SecurityModeError>;
    readonly hasPermission: (
      permission: Permission,
    ) => Effect.Effect<boolean, SecurityModeError>;
  }
>()("@inspect/security-modes/PolicyEnforcer") {
  static make = Effect.gen(function* () {
    const policiesRef = yield* Ref.make<Map<string, SecurityPolicy>>(new Map());
    const permissionsRef = yield* Ref.make<Permission[]>([]);

    const loadPolicies = (policies: SecurityPolicy[]) =>
      Effect.gen(function* () {
        const policyMap = new Map(policies.map((p) => [p.id, p]));
        yield* Ref.set(policiesRef, policyMap);

        yield* Effect.logInfo("Security policies loaded", {
          policyCount: policies.length,
          policyIds: policies.map((p) => p.id),
        });
      }).pipe(Effect.withSpan("PolicyEnforcer.loadPolicies"));

    const evaluate = (policyId: string, context: Record<string, unknown>) =>
      Effect.gen(function* () {
        const policies = yield* Ref.get(policiesRef);
        const policy = policies.get(policyId);

        if (!policy) {
          return yield* new SecurityModeError({
            mode: "policy-enforcer",
            reason: `Policy "${policyId}" not found`,
            cause: null,
          });
        }

        const violations: PolicyViolation[] = [];

        for (const rule of policy.rules) {
          const matches = evaluateRule(rule, context);

          if (matches && rule.action === "deny") {
            violations.push({ rule, context });
          }
        }

        return {
          policyId,
          passed: violations.length === 0,
          violations,
        };
      }).pipe(Effect.withSpan("PolicyEnforcer.evaluate"));

    const enforce = (policyId: string, action: string, context: Record<string, unknown>) =>
      Effect.gen(function* () {
        const evaluation = yield* evaluate(policyId, context);

        if (!evaluation.passed) {
          const violation = evaluation.violations[0];
          return yield* new PolicyViolationError({
            policy: policyId,
            action,
            details: {
              rule: violation.rule.message,
              context: violation.context,
            },
          });
        }

        yield* Effect.logDebug("Policy enforced: passed", {
          policyId,
          action,
        });
      }).pipe(Effect.withSpan("PolicyEnforcer.enforce"));

    const getPolicies = Effect.gen(function* () {
      const policies = yield* Ref.get(policiesRef);
      return Array.from(policies.values());
    });

    const hasPermission = (permission: Permission) =>
      Effect.gen(function* () {
        const permissions = yield* Ref.get(permissionsRef);

        // Check if any loaded permission matches
        return permissions.some((p) => permissionsMatch(p, permission));
      }).pipe(Effect.withSpan("PolicyEnforcer.hasPermission"));

    return {
      loadPolicies,
      evaluate,
      enforce,
      getPolicies,
      hasPermission,
    } as const;
  });

  static layer = Layer.effect(this, this.make);
}

function evaluateRule(
  rule: PolicyRule,
  context: Record<string, unknown>,
): boolean {
  // Simple rule evaluation based on condition string
  // In production, this would use a proper rule engine or DSL
  const condition = rule.condition.toLowerCase();

  if (condition === "always") {
    return true;
  }

  if (condition.startsWith("domain:")) {
    const domain = condition.replace("domain:", "").trim();
    return context.domain === domain;
  }

  if (condition.startsWith("path:")) {
    const path = condition.replace("path:", "").trim();
    return String(context.path ?? "").startsWith(path);
  }

  if (condition.startsWith("action:")) {
    const action = condition.replace("action:", "").trim();
    return context.action === action;
  }

  if (condition.startsWith("tenant:")) {
    const tenant = condition.replace("tenant:", "").trim();
    return context.tenantId === tenant;
  }

  // Default: deny if condition doesn't match known patterns
  return false;
}

function permissionsMatch(
  existing: Permission,
  requested: Permission,
): boolean {
  // Check if permissions have the same tag
  if (existing._tag !== requested._tag) {
    return false;
  }

  // Tag-specific matching
  switch (existing._tag) {
    case "NetworkAccess":
      return requested._tag === "NetworkAccess";
    case "FileSystemAccess":
      return requested._tag === "FileSystemAccess";
    case "ProcessExecution":
      return requested._tag === "ProcessExecution";
    case "DataIsolation":
      return requested._tag === "DataIsolation";
    case "APIAccess":
      return requested._tag === "APIAccess";
    case "BrowserAutomation":
      return requested._tag === "BrowserAutomation";
  }
}
