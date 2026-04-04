import { Effect, Layer, ServiceMap } from "effect";
import { WorkflowTriggerError } from "./workflow-errors.js";

interface WebhookEntry {
  id: string;
  url: string;
  jobId: string;
  createdAt: number;
}

interface GitPushEntry {
  id: string;
  branch: string;
  jobId: string;
  createdAt: number;
}

interface OnFailureEntry {
  id: string;
  failedJobId: string;
  onFailureJobId: string;
  createdAt: number;
}

export class WorkflowTriggerManager extends ServiceMap.Service<WorkflowTriggerManager>()(
  "@workflow/WorkflowTriggerManager",
  {
    make: Effect.gen(function* () {
      const webhooks = new Map<string, WebhookEntry>();
      const gitPushTriggers = new Map<string, GitPushEntry>();
      const onFailureTriggers = new Map<string, OnFailureEntry>();

      const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const registerWebhook = (url: string, jobId: string) =>
        Effect.gen(function* () {
          const id = generateId();
          const entry: WebhookEntry = {
            id,
            url,
            jobId,
            createdAt: Date.now(),
          };
          webhooks.set(id, entry);
          return entry;
        });

      const registerGitPush = (branch: string, jobId: string) =>
        Effect.gen(function* () {
          const id = generateId();
          const entry: GitPushEntry = {
            id,
            branch,
            jobId,
            createdAt: Date.now(),
          };
          gitPushTriggers.set(id, entry);
          return entry;
        });

      const registerOnFailure = (jobId: string, onFailureJobId: string) =>
        Effect.gen(function* () {
          const id = generateId();
          const entry: OnFailureEntry = {
            id,
            failedJobId: jobId,
            onFailureJobId,
            createdAt: Date.now(),
          };
          onFailureTriggers.set(id, entry);
          return entry;
        });

      const fireWebhook = (webhookId: string, payload?: unknown) =>
        Effect.gen(function* () {
          const entry = webhooks.get(webhookId);
          if (!entry) {
            return yield* new WorkflowTriggerError({
              triggerId: webhookId,
              cause: "Webhook not found",
            });
          }

          yield* Effect.tryPromise({
            try: () =>
              fetch(entry.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  triggerId: webhookId,
                  jobId: entry.jobId,
                  payload,
                  timestamp: Date.now(),
                }),
              }),
            catch: (cause) =>
              new WorkflowTriggerError({
                triggerId: webhookId,
                cause: String(cause),
              }),
          });

          return { fired: true, jobId: entry.jobId };
        });

      const fireGitPush = (branch: string, commitSha: string) =>
        Effect.gen(function* () {
          const matchingTriggers = Array.from(gitPushTriggers.values()).filter(
            (t) => t.branch === branch,
          );

          if (matchingTriggers.length === 0) {
            return { fired: false, matchedJobs: [] as string[] };
          }

          const matchedJobs = matchingTriggers.map((t) => t.jobId);

          return { fired: true, matchedJobs, commitSha, branch };
        });

      const fireOnFailure = (failedJobId: string) =>
        Effect.gen(function* () {
          const matchingTriggers = Array.from(onFailureTriggers.values()).filter(
            (t) => t.failedJobId === failedJobId,
          );

          if (matchingTriggers.length === 0) {
            return { fired: false, onFailureJobs: [] as string[] };
          }

          const onFailureJobs = matchingTriggers.map((t) => t.onFailureJobId);

          return { fired: true, onFailureJobs, failedJobId };
        });

      const getTriggersForJob = (jobId: string) =>
        Effect.gen(function* () {
          const webhookTriggers = Array.from(webhooks.values())
            .filter((w) => w.jobId === jobId)
            .map((w) => ({
              id: w.id,
              type: "webhook" as const,
              url: w.url,
              createdAt: w.createdAt,
            }));

          const gitPushEntries = Array.from(gitPushTriggers.values())
            .filter((g) => g.jobId === jobId)
            .map((g) => ({
              id: g.id,
              type: "git-push" as const,
              branch: g.branch,
              createdAt: g.createdAt,
            }));

          const onFailureEntries = Array.from(onFailureTriggers.values())
            .filter((o) => o.failedJobId === jobId)
            .map((o) => ({
              id: o.id,
              type: "on-failure" as const,
              onFailureJobId: o.onFailureJobId,
              createdAt: o.createdAt,
            }));

          return [...webhookTriggers, ...gitPushEntries, ...onFailureEntries];
        });

      return {
        registerWebhook,
        registerGitPush,
        registerOnFailure,
        fireWebhook,
        fireGitPush,
        fireOnFailure,
        getTriggersForJob,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
