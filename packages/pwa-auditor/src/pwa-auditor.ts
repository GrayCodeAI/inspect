// ──────────────────────────────────────────────────────────────────────────────
// PWA Auditor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { PWAAuditError } from "./errors.js";
import {
  checkManifest,
  checkServiceWorker,
  checkOfflineCapability,
  checkHttps,
  CheckResult,
} from "./pwa-checks.js";

export class AuditConfig extends Schema.Class<AuditConfig>("AuditConfig")({
  url: Schema.String,
  pageContent: Schema.String,
  includeCategories: Schema.Array(
    Schema.Literals(["manifest", "service-worker", "offline", "performance", "security"] as const),
  ),
}) {}

export class AuditReport extends Schema.Class<AuditReport>("AuditReport")({
  url: Schema.String,
  score: Schema.Number,
  checks: Schema.Array(CheckResult),
  passed: Schema.Number,
  failed: Schema.Number,
  duration: Schema.Number,
  timestamp: Schema.Number,
}) {}

export interface PWAAuditorService {
  readonly audit: (
    config: AuditConfig,
  ) => Effect.Effect<AuditReport, PWAAuditError>;
}

export class PWAAuditor extends ServiceMap.Service<
  PWAAuditor,
  PWAAuditorService
>()("@inspect/PWAAuditor") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const audit = (config: AuditConfig) =>
        Effect.gen(function* () {
          const startTime = Date.now();

          yield* Effect.annotateCurrentSpan({ url: config.url });

          yield* Effect.logInfo("Starting PWA audit", { url: config.url });

          const checks: CheckResult[] = [];

          if (config.includeCategories.includes("manifest")) {
            const manifestCheck = yield* checkManifest(config.pageContent);
            checks.push(manifestCheck);
          }

          if (config.includeCategories.includes("service-worker")) {
            const swCheck = yield* checkServiceWorker(config.pageContent);
            checks.push(swCheck);
          }

          if (config.includeCategories.includes("offline")) {
            const offlineCheck = yield* checkOfflineCapability(config.pageContent);
            checks.push(offlineCheck);
          }

          if (config.includeCategories.includes("security")) {
            const httpsCheck = yield* checkHttps(config.url);
            checks.push(httpsCheck);
          }

          const passed = checks.filter((c) => c.passed).length;
          const failed = checks.filter((c) => !c.passed).length;
          const totalScore =
            checks.length > 0
              ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
              : 0;

          const report = new AuditReport({
            url: config.url,
            score: totalScore,
            checks,
            passed,
            failed,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          });

          yield* Effect.logInfo("PWA audit completed", {
            url: config.url,
            score: totalScore,
            passed,
            failed,
          });

          return report;
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new PWAAuditError({
                message: `PWA audit failed: ${String(cause)}`,
                cause,
              }),
            ),
          ),
          Effect.withSpan("PWAAuditor.audit"),
        );

      return { audit } as const;
    }),
  );
}
