// ──────────────────────────────────────────────────────────────────────────────
// Resource Monitor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { AutoScalerError } from "./errors.js";

export class ResourceMetrics extends Schema.Class<ResourceMetrics>("ResourceMetrics")({
  cpuUsage: Schema.Number,
  memoryUsage: Schema.Number,
  totalMemory: Schema.Number,
  activeProcesses: Schema.Number,
  timestamp: Schema.Number,
}) {}

export class ResourceThresholds extends Schema.Class<ResourceThresholds>(
  "ResourceThresholds",
)({
  cpuHigh: Schema.Number,
  cpuCritical: Schema.Number,
  memoryHigh: Schema.Number,
  memoryCritical: Schema.Number,
}) {}

export interface ResourceMonitorService {
  readonly getMetrics: () => Effect.Effect<ResourceMetrics, AutoScalerError>;
  readonly isHealthy: (
    metrics: ResourceMetrics,
  ) => Effect.Effect<boolean>;
  readonly getSystemLoad: () => Effect.Effect<number, AutoScalerError>;
}

export class ResourceMonitor extends ServiceMap.Service<
  ResourceMonitor,
  ResourceMonitorService
>()("@inspect/ResourceMonitor") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const thresholds = new ResourceThresholds({
        cpuHigh: 0.8,
        cpuCritical: 0.95,
        memoryHigh: 0.8,
        memoryCritical: 0.9,
      });

      const getMetrics = () =>
        Effect.gen(function* () {
          const os = yield* Effect.sync(() => import("node:os"));

          const cpus = os.cpus();
          const cpuCount = cpus.length;

          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const memoryUsage = usedMem / totalMem;

          const loadAvg = os.loadavg();
          const systemLoad = loadAvg[0] / cpuCount;

          return new ResourceMetrics({
            cpuUsage: Math.min(systemLoad, 1),
            memoryUsage,
            totalMemory: totalMem,
            activeProcesses: Math.ceil(loadAvg[0]),
            timestamp: Date.now(),
          });
        }).pipe(
          Effect.catchTag("NoSuchElementError", (cause) =>
            Effect.fail(
              new AutoScalerError({
                message: `Failed to get resource metrics: ${String(cause)}`,
                component: "resource-monitor",
                cause,
              }),
            ),
          ),
          Effect.withSpan("ResourceMonitor.getMetrics"),
        );

      const isHealthy = (metrics: ResourceMetrics) =>
        Effect.sync(() => {
          return (
            metrics.cpuUsage < thresholds.cpuCritical &&
            metrics.memoryUsage < thresholds.memoryCritical
          );
        }).pipe(Effect.withSpan("ResourceMonitor.isHealthy"));

      const getSystemLoad = () =>
        Effect.gen(function* () {
          const metrics = yield* getMetrics();
          return (metrics.cpuUsage + metrics.memoryUsage) / 2;
        }).pipe(Effect.withSpan("ResourceMonitor.getSystemLoad"));

      return { getMetrics, isHealthy, getSystemLoad } as const;
    }),
  );
}
