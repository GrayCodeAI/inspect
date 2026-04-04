import { Effect, Layer, ServiceMap } from "effect";
import {
  InvalidCronExpressionError,
  WorkflowNotFoundError,
  WorkflowTriggerError,
} from "./workflow-errors.js";
import { WorkflowJob, WorkflowTrigger, WorkflowSchedule } from "./workflow-types.js";
import { isValid, nextRun } from "./cron-parser.js";

interface ScheduledEntry {
  job: WorkflowJob;
  schedule: WorkflowSchedule;
  trigger: WorkflowTrigger;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface MutableSchedule {
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRun: number | undefined;
  lastRun: number | undefined;
}

interface MutableTrigger {
  id: string;
  type: string;
  enabled: boolean;
  lastFired: number | undefined;
}

export class WorkflowScheduler extends ServiceMap.Service<WorkflowScheduler>()(
  "@workflow/WorkflowScheduler",
  {
    make: Effect.gen(function* () {
      const scheduledJobs = new Map<string, ScheduledEntry>();
      const mutableSchedules = new Map<string, MutableSchedule>();
      const mutableTriggers = new Map<string, MutableTrigger>();

      const calculateNextRun = (cronExpression: string, _timezone: string) => {
        if (!isValid(cronExpression)) {
          return Effect.fail(new InvalidCronExpressionError({ expression: cronExpression }));
        }
        const next = nextRun(cronExpression);
        return Effect.succeed(next.getTime());
      };

      const startTimer = (jobId: string) => {
        const entry = scheduledJobs.get(jobId);
        const schedule = mutableSchedules.get(jobId);
        if (!entry || !schedule) {
          return;
        }
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
        if (!schedule.enabled || !schedule.nextRun) {
          return;
        }
        const delay = schedule.nextRun - Date.now();
        if (delay > 0) {
          entry.timer = setTimeout(() => {
            const current = mutableSchedules.get(jobId);
            if (current) {
              current.lastRun = Date.now();
              current.nextRun = undefined;
              current.enabled = false;
            }
          }, delay);
        }
      };

      const schedule = (job: WorkflowJob, trigger: WorkflowTrigger) =>
        Effect.gen(function* () {
          if (trigger.type !== "cron") {
            return yield* new WorkflowTriggerError({
              triggerId: trigger.id,
              cause: "Trigger is not a cron trigger",
            });
          }

          const cronConfig = trigger.config;
          if (cronConfig.type !== "cron") {
            return yield* new WorkflowTriggerError({
              triggerId: trigger.id,
              cause: "Trigger config is not cron type",
            });
          }

          const cronExpression = cronConfig.cronExpression;
          const timezone = cronConfig.timezone;

          if (!isValid(cronExpression)) {
            return yield* new InvalidCronExpressionError({ expression: cronExpression });
          }

          const nextRunTime = yield* calculateNextRun(cronExpression, timezone);

          const scheduleObj = new WorkflowSchedule({
            cron: cronExpression,
            timezone,
            enabled: true,
            nextRun: nextRunTime,
            lastRun: undefined,
          });

          mutableSchedules.set(job.id, {
            cron: cronExpression,
            timezone,
            enabled: true,
            nextRun: nextRunTime,
            lastRun: undefined,
          });

          mutableTriggers.set(trigger.id, {
            id: trigger.id,
            type: trigger.type,
            enabled: true,
            lastFired: undefined,
          });

          const entry: ScheduledEntry = {
            job,
            schedule: scheduleObj,
            trigger,
            timer: undefined,
          };

          scheduledJobs.set(job.id, entry);
          startTimer(job.id);

          return entry;
        });

      const unschedule = (jobId: string) =>
        Effect.gen(function* () {
          const entry = scheduledJobs.get(jobId);
          if (!entry) {
            return yield* new WorkflowNotFoundError({ workflowId: jobId });
          }

          if (entry.timer) {
            clearTimeout(entry.timer);
          }
          scheduledJobs.delete(jobId);
          mutableSchedules.delete(jobId);
        });

      const runNow = (jobId: string) =>
        Effect.gen(function* () {
          const entry = scheduledJobs.get(jobId);
          if (!entry) {
            return yield* new WorkflowNotFoundError({ workflowId: jobId });
          }

          if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
          }

          const mutableTrigger = mutableTriggers.get(entry.trigger.id);
          if (mutableTrigger) {
            mutableTrigger.lastFired = Date.now();
          }

          const mutableSchedule = mutableSchedules.get(jobId);
          if (mutableSchedule) {
            mutableSchedule.lastRun = Date.now();
            const nextRunTime = yield* calculateNextRun(
              mutableSchedule.cron,
              mutableSchedule.timezone,
            );
            mutableSchedule.nextRun = nextRunTime;
            mutableSchedule.enabled = true;
          }

          startTimer(jobId);

          return entry.job;
        });

      const getNextRuns = (limit = 10) =>
        Effect.gen(function* () {
          const entries = Array.from(scheduledJobs.entries())
            .filter(([jobId]) => {
              const schedule = mutableSchedules.get(jobId);
              return schedule?.enabled && schedule.nextRun;
            })
            .sort((a, b) => {
              const aSchedule = mutableSchedules.get(a[0]);
              const bSchedule = mutableSchedules.get(b[0]);
              return (aSchedule?.nextRun ?? Infinity) - (bSchedule?.nextRun ?? Infinity);
            })
            .slice(0, limit)
            .map(([jobId, entry]) => {
              const schedule = mutableSchedules.get(jobId);
              return {
                jobId: entry.job.id,
                jobName: entry.job.name,
                nextRun: schedule?.nextRun,
                cron: schedule?.cron ?? "",
              };
            });

          return entries;
        });

      const getSchedule = (jobId: string) =>
        Effect.gen(function* () {
          const entry = scheduledJobs.get(jobId);
          if (!entry) {
            return yield* new WorkflowNotFoundError({ workflowId: jobId });
          }
          return entry.schedule;
        });

      const enableTrigger = (triggerId: string) =>
        Effect.gen(function* () {
          let found = false;
          for (const [jobId, entry] of scheduledJobs.entries()) {
            if (entry.trigger.id === triggerId) {
              const mutableSchedule = mutableSchedules.get(jobId);
              const mutableTrigger = mutableTriggers.get(triggerId);
              if (mutableSchedule) {
                mutableSchedule.enabled = true;
                const nextRunTime = yield* calculateNextRun(
                  mutableSchedule.cron,
                  mutableSchedule.timezone,
                );
                mutableSchedule.nextRun = nextRunTime;
              }
              if (mutableTrigger) {
                mutableTrigger.enabled = true;
              }
              startTimer(jobId);
              found = true;
            }
          }
          if (!found) {
            return yield* new WorkflowTriggerError({
              triggerId,
              cause: "Trigger not found",
            });
          }
        });

      const disableTrigger = (triggerId: string) =>
        Effect.gen(function* () {
          let found = false;
          for (const [jobId, entry] of scheduledJobs.entries()) {
            if (entry.trigger.id === triggerId) {
              const mutableSchedule = mutableSchedules.get(jobId);
              const mutableTrigger = mutableTriggers.get(triggerId);
              if (mutableSchedule) {
                mutableSchedule.enabled = false;
              }
              if (mutableTrigger) {
                mutableTrigger.enabled = false;
              }
              if (entry.timer) {
                clearTimeout(entry.timer);
                entry.timer = undefined;
              }
              found = true;
            }
          }
          if (!found) {
            return yield* new WorkflowTriggerError({
              triggerId,
              cause: "Trigger not found",
            });
          }
        });

      const getActiveJobs = () =>
        Effect.gen(function* () {
          const activeJobs = Array.from(scheduledJobs.entries())
            .filter(([jobId]) => {
              const schedule = mutableSchedules.get(jobId);
              return schedule?.enabled;
            })
            .map(([, entry]) => entry.job);
          return activeJobs;
        });

      return {
        schedule,
        unschedule,
        runNow,
        getNextRuns,
        getSchedule,
        enableTrigger,
        disableTrigger,
        getActiveJobs,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
