import { Effect, Fiber, Layer, Schedule, ServiceMap } from "effect";
import {
  WorkflowExecutionError,
  WorkflowNotFoundError,
  WorkflowAlreadyRunningError,
} from "./workflow-errors.js";
import {
  WorkflowJob,
  WorkflowRun,
  WorkflowRunStatus,
  DeviceResult,
  AgentResult,
  AuditResult,
} from "./workflow-types.js";

interface RunEntry {
  run: WorkflowRun;
  fiber: Fiber.Fiber<WorkflowRun, WorkflowExecutionError> | undefined;
}

export class WorkflowExecutor extends ServiceMap.Service<WorkflowExecutor>()(
  "@workflow/WorkflowExecutor",
  {
    make: Effect.gen(function* () {
      const runs = new Map<string, RunEntry>();
      const runningJobs = new Set<string>();

      const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const buildDeviceResult = (
        deviceName: string,
        status: WorkflowRunStatus,
        duration?: number,
        error?: string,
      ): DeviceResult => ({
        deviceName,
        status,
        duration,
        error,
        artifacts: [],
      });

      const buildAgentResult = (
        agentId: string,
        status: WorkflowRunStatus,
        stepsExecuted?: number,
        duration?: number,
        error?: string,
      ): AgentResult => ({
        agentId,
        status,
        stepsExecuted,
        duration,
        error,
      });

      const buildAuditResult = (
        type: AuditResult["type"],
        passed: boolean,
        score?: number,
        violations?: string[],
        duration?: number,
      ): AuditResult => ({
        type,
        score,
        passed,
        violations,
        duration,
      });

      const executeDeviceTest = (
        job: WorkflowJob,
        device: (typeof job.devices)[number],
      ): Effect.Effect<DeviceResult, WorkflowExecutionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            jobId: job.id,
            deviceName: device.name,
            url: job.url,
          });

          const startTime = Date.now();

          yield* Effect.tryPromise({
            try: () =>
              fetch(job.url, {
                method: "HEAD",
                signal: AbortSignal.timeout(job.timeout),
              }),
            catch: (cause) =>
              new WorkflowExecutionError({
                workflowId: job.id,
                runId: generateId(),
                cause: String(cause),
              }),
          });

          const duration = Date.now() - startTime;

          return buildDeviceResult(device.name, "completed", duration);
        });

      const executeAgentTest = (
        job: WorkflowJob,
        agent: (typeof job.agents)[number],
      ): Effect.Effect<AgentResult, WorkflowExecutionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            jobId: job.id,
            agentId: agent.id,
            url: job.url,
          });

          const startTime = Date.now();

          yield* Effect.logDebug("Executing agent test", {
            agentId: agent.id,
            url: job.url,
          });

          const duration = Date.now() - startTime;

          return buildAgentResult(agent.id, "completed", 0, duration);
        });

      const executeQualityAudit = (
        job: WorkflowJob,
        audit: (typeof job.qualityAudits)[number],
      ): Effect.Effect<AuditResult, WorkflowExecutionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            jobId: job.id,
            auditType: audit.type,
          });

          const startTime = Date.now();

          yield* Effect.logDebug("Running quality audit", {
            auditType: audit.type,
            url: job.url,
          });

          const duration = Date.now() - startTime;

          return buildAuditResult(audit.type, true, undefined, undefined, duration);
        });

      const execute = (job: WorkflowJob) =>
        Effect.gen(function* () {
          if (runningJobs.has(job.id)) {
            return yield* new WorkflowAlreadyRunningError({
              workflowId: job.id,
            });
          }

          runningJobs.add(job.id);
          const runId = generateId();
          const startedAt = Date.now();

          const run = new WorkflowRun({
            id: runId,
            jobId: job.id,
            trigger: undefined,
            status: "running",
            startedAt,
            completedAt: undefined,
            results: {
              devices: [],
              agents: [],
              audits: [],
            },
            duration: undefined,
            error: undefined,
          });

          runs.set(runId, { run, fiber: undefined });

          const deviceResults = yield* Effect.forEach(
            job.devices,
            (device) =>
              executeDeviceTest(job, device).pipe(
                Effect.catchTag("WorkflowExecutionError", (error) =>
                  Effect.succeed(buildDeviceResult(device.name, "failed", undefined, error.cause)),
                ),
              ),
            { concurrency: "unbounded" },
          );

          const agentResults = yield* Effect.forEach(
            job.agents,
            (agent) =>
              executeAgentTest(job, agent).pipe(
                Effect.catchTag("WorkflowExecutionError", (error) =>
                  Effect.succeed(
                    buildAgentResult(agent.id, "failed", undefined, undefined, error.cause),
                  ),
                ),
              ),
            { concurrency: "unbounded" },
          );

          const auditResults = yield* Effect.forEach(
            job.qualityAudits,
            (audit) =>
              executeQualityAudit(job, audit).pipe(
                Effect.catchTag("WorkflowExecutionError", (error) =>
                  Effect.succeed(buildAuditResult(audit.type, false, undefined, [error.cause])),
                ),
              ),
            { concurrency: "unbounded" },
          );

          const completedAt = Date.now();
          const duration = completedAt - startedAt;

          const hasFailures =
            deviceResults.some((r) => r.status === "failed") ||
            agentResults.some((r) => r.status === "failed") ||
            auditResults.some((r) => !r.passed);

          const finalStatus: WorkflowRunStatus = hasFailures ? "failed" : "completed";

          const completedRun = new WorkflowRun({
            ...run,
            status: finalStatus,
            completedAt,
            duration,
            results: {
              devices: deviceResults,
              agents: agentResults,
              audits: auditResults,
            },
            error: hasFailures ? "One or more checks failed" : undefined,
          });

          runs.set(runId, { run: completedRun, fiber: undefined });
          runningJobs.delete(job.id);

          yield* Effect.logInfo("Workflow execution completed", {
            runId,
            jobId: job.id,
            status: finalStatus,
            duration,
          });

          return completedRun;
        }).pipe(
          Effect.timeout(job.timeout),
          Effect.catchTag("TimeoutError", () =>
            Effect.gen(function* () {
              const timedOutRunId = generateId();
              const timedOutStartedAt = Date.now() - job.timeout;
              runningJobs.delete(job.id);
              const timedOutRun = new WorkflowRun({
                id: timedOutRunId,
                jobId: job.id,
                trigger: undefined,
                status: "timed-out",
                startedAt: timedOutStartedAt,
                completedAt: Date.now(),
                results: {
                  devices: [],
                  agents: [],
                  audits: [],
                },
                duration: job.timeout,
                error: `Execution timed out after ${job.timeout}ms`,
              });
              runs.set(timedOutRunId, { run: timedOutRun, fiber: undefined });
              return timedOutRun;
            }),
          ),
          Effect.withSpan("WorkflowExecutor.execute"),
        );

      const executeParallel = (jobs: WorkflowJob[]) =>
        Effect.gen(function* () {
          const results = yield* Effect.forEach(jobs, (job) => execute(job), {
            concurrency: "unbounded",
          });
          return results;
        }).pipe(Effect.withSpan("WorkflowExecutor.executeParallel"));

      const executeWithRetry = (job: WorkflowJob, retries: number) =>
        execute(job).pipe(
          Effect.retry({
            times: retries,
            schedule: Schedule.exponential("1 second"),
          }),
          Effect.catchTag("WorkflowAlreadyRunningError", (err) => Effect.fail(err)),
          Effect.withSpan("WorkflowExecutor.executeWithRetry"),
        );

      const getRun = (runId: string) =>
        Effect.gen(function* () {
          const entry = runs.get(runId);
          if (!entry) {
            return yield* new WorkflowNotFoundError({ workflowId: runId });
          }
          return entry.run;
        });

      const getRunsForJob = (jobId: string) =>
        Effect.gen(function* () {
          const jobRuns = Array.from(runs.values())
            .filter((e) => e.run.jobId === jobId)
            .map((e) => e.run);
          return jobRuns;
        });

      const cancelRun = (runId: string) =>
        Effect.gen(function* () {
          const entry = runs.get(runId);
          if (!entry) {
            return yield* new WorkflowNotFoundError({ workflowId: runId });
          }

          if (entry.fiber) {
            yield* Fiber.interrupt(entry.fiber);
          }

          const cancelledRun = new WorkflowRun({
            ...entry.run,
            status: "cancelled",
            completedAt: Date.now(),
            duration: Date.now() - entry.run.startedAt,
          });

          runs.set(runId, { run: cancelledRun, fiber: undefined });

          return cancelledRun;
        }).pipe(Effect.withSpan("WorkflowExecutor.cancelRun"));

      return {
        execute,
        executeParallel,
        executeWithRetry,
        getRun,
        getRunsForJob,
        cancelRun,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
