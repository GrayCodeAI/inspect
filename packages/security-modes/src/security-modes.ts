import { Data, Effect, Layer, Match, Ref, Schema, ServiceMap } from "effect";
import {
  PolicyViolationError,
  RestrictedOperationError,
  SecurityModeError,
  UnauthorizedAccessError,
} from "./errors.js";
import { PolicyEnforcer, type SecurityPolicy, type Permission } from "./policy-enforcer.js";
import { Sandbox, type SandboxConfig, type ResourceLimits } from "./sandbox.js";

export type SecurityMode = Data.TaggedEnum<{
  Executor: { policies: SecurityPolicy[] };
  Data: { allowedDomains: string[]; blockedPatterns: string[] };
  API: { rateLimit: number; allowedEndpoints: string[] };
  Restricted: { allowedOperations: string[] };
}>;
export const SecurityMode = Data.taggedEnum<SecurityMode>();

export interface SecurityContext {
  mode: SecurityMode;
  tenantId: string;
  permissions: Permission[];
  sessionId: string;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: SecurityModeError;
  policyChecks: PolicyCheckResult[];
  resourceUsage: ResourceUsage;
}

export interface PolicyCheckResult {
  policy: string;
  passed: boolean;
  message: string;
}

export interface ResourceUsage {
  memoryUsed: number;
  cpuTimeMs: number;
  networkRequests: number;
  diskIOBytes: number;
}

export class SecurityModes extends ServiceMap.Service<
  SecurityModes,
  {
    readonly initialize: (
      mode: SecurityMode,
      context: SecurityContext,
    ) => Effect.Effect<void, SecurityModeError>;
    readonly execute: <T>(
      operation: string,
      effect: Effect.Effect<T, SecurityModeError>,
    ) => Effect.Effect<ExecutionResult<T>, SecurityModeError>;
    readonly checkPermission: (
      resource: string,
      permission: Permission,
    ) => Effect.Effect<void, UnauthorizedAccessError>;
    readonly getMode: Effect.Effect<SecurityMode | undefined, SecurityModeError>;
    readonly getContext: Effect.Effect<SecurityContext | undefined, SecurityModeError>;
  }
>()("@inspect/security-modes/SecurityModes") {
  static make = Effect.gen(function* () {
    const policyEnforcer = yield* PolicyEnforcer;
    const sandbox = yield* Sandbox;
    const modeRef = yield* Ref.make<SecurityMode | undefined>(undefined);
    const contextRef = yield* Ref.make<SecurityContext | undefined>(undefined);

    const initialize = (mode: SecurityMode, context: SecurityContext) =>
      Effect.gen(function* () {
        yield* Ref.set(modeRef, mode);
        yield* Ref.set(contextRef, context);

        // Load policies based on mode
        const policies = extractPolicies(mode);
        yield* policyEnforcer.loadPolicies(policies);

        // Initialize sandbox with mode-specific limits
        const sandboxConfig = extractSandboxConfig(mode);
        yield* sandbox.configure(sandboxConfig);

        yield* Effect.logInfo("Security mode initialized", {
          mode: mode._tag,
          tenantId: context.tenantId,
          policyCount: policies.length,
        });
      }).pipe(Effect.withSpan("SecurityModes.initialize"));

    const execute = <T>(
      operation: string,
      effect: Effect.Effect<T, SecurityModeError>,
    ) =>
      Effect.gen(function* () {
        const mode = yield* Ref.get(modeRef);
        const context = yield* Ref.get(contextRef);

        if (!mode || !context) {
          return yield* new SecurityModeError({
            mode: "uninitialized",
            reason: "Security mode not initialized. Call initialize() first.",
            cause: null,
          });
        }

        const policyChecks: PolicyCheckResult[] = [];

        // Pre-execution policy checks
        const preCheck = yield* runPreExecutionChecks(mode, operation, context);
        policyChecks.push(...preCheck);

        const failedChecks = preCheck.filter((check) => !check.passed);
        if (failedChecks.length > 0) {
          return {
            success: false,
            error: new PolicyViolationError({
              policy: failedChecks[0].policy,
              action: operation,
              details: failedChecks[0].message,
            }),
            policyChecks,
            resourceUsage: {
              memoryUsed: 0,
              cpuTimeMs: 0,
              networkRequests: 0,
              diskIOBytes: 0,
            },
          };
        }

        // Execute within sandbox
        const startTime = Date.now();
        const result = yield* effect.pipe(
          Effect.catchTag("SecurityModeError", (error) =>
            Effect.succeed({ success: false, error, policyChecks, resourceUsage: EMPTY_RESOURCE_USAGE }),
          ),
        );

        // If result is already wrapped execution result, return it
        if ("success" in result) {
          return result;
        }

        const endTime = Date.now();

        // Collect resource usage
        const resourceUsage = yield* sandbox.getResourceUsage();

        return {
          success: true,
          data: result,
          policyChecks,
          resourceUsage: {
            ...resourceUsage,
            cpuTimeMs: endTime - startTime,
          },
        };
      }).pipe(Effect.withSpan("SecurityModes.execute"));

    const checkPermission = (resource: string, permission: Permission) =>
      Effect.gen(function* () {
        const context = yield* Ref.get(contextRef);

        if (!context) {
          return yield* new UnauthorizedAccessError({
            requestedResource: resource,
            requiredPermission: permission,
          });
        }

        const hasPermission = context.permissions.includes(permission);
        if (!hasPermission) {
          return yield* new UnauthorizedAccessError({
            requestedResource: resource,
            requiredPermission: permission,
          });
        }

        yield* Effect.logDebug("Permission granted", {
          resource,
          permission,
          tenantId: context.tenantId,
        });
      }).pipe(Effect.withSpan("SecurityModes.checkPermission"));

    const getMode = Ref.get(modeRef);
    const getContext = Ref.get(contextRef);

    return {
      initialize,
      execute,
      checkPermission,
      getMode,
      getContext,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(PolicyEnforcer.layer),
    Layer.provide(Sandbox.layer),
  );
}

function extractPolicies(mode: SecurityMode): SecurityPolicy[] {
  return Match.value(mode).pipe(
    Match.when({ _tag: "Executor" }, (m) => m.policies),
    Match.when({ _tag: "Data" }, () => [DATA_ISOLATION_POLICY]),
    Match.when({ _tag: "API" }, () => [API_RATE_LIMIT_POLICY, API_ENDPOINT_POLICY]),
    Match.when({ _tag: "Restricted" }, () => [RESTRICTED_OPERATIONS_POLICY]),
    Match.exhaustive,
  );
}

function extractSandboxConfig(mode: SecurityMode): SandboxConfig {
  return Match.value(mode).pipe(
    Match.when({ _tag: "Executor" }, () => DEFAULT_SANDBOX_CONFIG),
    Match.when({ _tag: "Data" }, () => ({
      ...DEFAULT_SANDBOX_CONFIG,
      limits: {
        ...DEFAULT_SANDBOX_CONFIG.limits,
        networkRequests: 100,
        allowedDomains: ["*.example.com"],
      },
    })),
    Match.when({ _tag: "API" }, () => ({
      ...DEFAULT_SANDBOX_CONFIG,
      limits: {
        ...DEFAULT_SANDBOX_CONFIG.limits,
        networkRequests: 1000,
        memoryMB: 256,
      },
    })),
    Match.when({ _tag: "Restricted" }, () => ({
      ...DEFAULT_SANDBOX_CONFIG,
      limits: {
        ...DEFAULT_SANDBOX_CONFIG.limits,
        memoryMB: 64,
        cpuTimeMs: 5000,
        networkRequests: 10,
        diskIOBytes: 1024,
      },
    })),
    Match.exhaustive,
  );
}

function runPreExecutionChecks(
  mode: SecurityMode,
  operation: string,
  context: SecurityContext,
): Effect.Effect<PolicyCheckResult[], never> {
  return Match.value(mode).pipe(
    Match.when({ _tag: "Restricted" }, (m) => {
      const allowed = m.allowedOperations.includes(operation);
      return Effect.succeed([
        {
          policy: RESTRICTED_OPERATIONS_POLICY,
          passed: allowed,
          message: allowed
            ? `Operation "${operation}" is allowed`
            : `Operation "${operation}" is not in allowed list`,
        },
      ]);
    }),
    Match.when({ _tag: "API" }, (m) => {
      const endpointAllowed = m.allowedEndpoints.some((endpoint) =>
        operation.includes(endpoint),
      );
      return Effect.succeed([
        {
          policy: API_ENDPOINT_POLICY,
          passed: endpointAllowed,
          message: endpointAllowed
            ? `Endpoint "${operation}" is allowed`
            : `Endpoint "${operation}" is not in allowed list`,
        },
      ]);
    }),
    Match.when({ _tag: "Data" }, (m) => {
      const isBlocked = m.blockedPatterns.some((pattern) =>
        operation.includes(pattern),
      );
      return Effect.succeed([
        {
          policy: DATA_ISOLATION_POLICY,
          passed: !isBlocked,
          message: isBlocked
            ? `Operation "${operation}" matches blocked pattern`
            : `No blocked patterns matched`,
        },
      ]);
    }),
    Match.when({ _tag: "Executor" }, () =>
      Effect.succeed([
        {
          policy: EXECUTOR_POLICY,
          passed: true,
          message: "Executor mode allows all operations subject to policies",
        },
      ]),
    ),
    Match.exhaustive,
  );
}

const DATA_ISOLATION_POLICY = "data-isolation";
const API_RATE_LIMIT_POLICY = "api-rate-limit";
const API_ENDPOINT_POLICY = "api-endpoint-restriction";
const RESTRICTED_OPERATIONS_POLICY = "restricted-operations";
const EXECUTOR_POLICY = "executor-base";

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  limits: {
    memoryMB: 512,
    cpuTimeMs: 30000,
    networkRequests: 500,
    diskIOBytes: 10485760,
  },
};

const EMPTY_RESOURCE_USAGE: ResourceUsage = {
  memoryUsed: 0,
  cpuTimeMs: 0,
  networkRequests: 0,
  diskIOBytes: 0,
};
