import { Effect, Layer, Schema, ServiceMap } from "effect";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface EnvironmentConfig {
  readonly name: string;
  readonly composeFile?: string;
  readonly dockerfile?: string;
  readonly envVars: Record<string, string>;
  readonly portMappings: Array<{
    readonly containerPort: number;
    readonly hostPort?: number;
  }>;
  readonly ttlMinutes: number;
}

export interface EnvironmentInstance {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly status: "provisioning" | "running" | "terminating" | "terminated";
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly logs: string[];
}

export class EnvironmentNotFoundError extends Schema.ErrorClass<EnvironmentNotFoundError>(
  "EnvironmentNotFoundError",
)({
  _tag: Schema.tag("EnvironmentNotFoundError"),
  envId: Schema.String,
}) {
  message = `Environment not found: ${this.envId}`;
}

export class EnvironmentProvisioningError extends Schema.ErrorClass<EnvironmentProvisioningError>(
  "EnvironmentProvisioningError",
)({
  _tag: Schema.tag("EnvironmentProvisioningError"),
  name: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to provision environment: ${this.name}`;
}

export class EnvironmentTerminationError extends Schema.ErrorClass<EnvironmentTerminationError>(
  "EnvironmentTerminationError",
)({
  _tag: Schema.tag("EnvironmentTerminationError"),
  envId: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to terminate environment: ${this.envId}`;
}

export class HealthCheckError extends Schema.ErrorClass<HealthCheckError>("HealthCheckError")({
  _tag: Schema.tag("HealthCheckError"),
  envId: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Health check failed for environment: ${this.envId}`;
}

const generateEnvironmentId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `env-${timestamp}-${random}`;
};

const findAvailablePort = async (): Promise<number> => {
  return new Promise((resolve) => {
    const server = require("node:net").createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
};

export class EphemeralEnvironmentManager extends ServiceMap.Service<EphemeralEnvironmentManager>()(
  "@inspect/EphemeralEnvironmentManager",
  {
    make: Effect.gen(function* () {
      const environments = new Map<string, EnvironmentInstance>();

      const provision = Effect.fn("EphemeralEnvironmentManager.provision")(function* (
        config: EnvironmentConfig,
      ) {
        const id = generateEnvironmentId();
        const createdAt = Date.now();
        const expiresAt = createdAt + config.ttlMinutes * 60 * 1000;

        const instance: EnvironmentInstance = {
          id,
          name: config.name,
          url: "",
          status: "provisioning",
          createdAt,
          expiresAt,
          logs: [],
        };

        environments.set(id, instance);

        yield* Effect.logInfo("Provisioning environment", { id, name: config.name });

        const result = yield* Effect.tryPromise({
          try: async () => {
            if (config.composeFile) {
              const projectName = `inspect-${id}`;
              const envString = Object.entries(config.envVars)
                .map(([key, value]) => `-e ${key}=${value}`)
                .join(" ");

              const { stdout, stderr } = await execAsync(
                `docker-compose -f ${config.composeFile} -p ${projectName} up -d ${envString}`,
              );

              return { stdout: stdout + stderr, projectName };
            } else if (config.dockerfile) {
              const imageTag = `inspect-env-${id}`;
              const hostPort = config.portMappings[0]?.hostPort ?? (await findAvailablePort());
              const containerPort = config.portMappings[0]?.containerPort ?? 3000;

              const buildCmd = `docker build -f ${config.dockerfile} -t ${imageTag} .`;
              const { stdout: buildOut, stderr: buildErr } = await execAsync(buildCmd);

              const envString = Object.entries(config.envVars)
                .map(([key, value]) => `-e ${key}=${value}`)
                .join(" ");

              const runCmd = `docker run -d --name ${id} -p ${hostPort}:${containerPort} ${envString} ${imageTag}`;
              const { stdout: runOut, stderr: runErr } = await execAsync(runCmd);

              return {
                stdout: buildOut + buildErr + runOut + runErr,
                hostPort,
                containerName: id,
              };
            } else {
              const hostPort = config.portMappings[0]?.hostPort ?? (await findAvailablePort());
              const containerPort = config.portMappings[0]?.containerPort ?? 3000;

              const envString = Object.entries(config.envVars)
                .map(([key, value]) => `-e ${key}=${value}`)
                .join(" ");

              const imageName = config.name;
              const runCmd = `docker run -d --name ${id} -p ${hostPort}:${containerPort} ${envString} ${imageName}`;
              const { stdout, stderr } = await execAsync(runCmd);

              return {
                stdout: stdout + stderr,
                hostPort,
                containerName: id,
              };
            }
          },
          catch: (cause) => new EnvironmentProvisioningError({ name: config.name, cause }),
        });

        const fallbackPort = yield* Effect.promise(() => findAvailablePort());
        const hostPort =
          typeof result === "object" && "hostPort" in result ? result.hostPort : fallbackPort;

        const updatedInstance: EnvironmentInstance = {
          ...instance,
          status: "running",
          url: `http://localhost:${hostPort}`,
          logs: [result.stdout],
        };

        environments.set(id, updatedInstance);

        yield* Effect.logInfo("Environment provisioned", { id, url: updatedInstance.url });

        return updatedInstance;
      });

      const terminate = Effect.fn("EphemeralEnvironmentManager.terminate")(function* (
        envId: string,
      ) {
        const instance = environments.get(envId);
        if (!instance) {
          return yield* new EnvironmentNotFoundError({ envId });
        }

        const updatedInstance: EnvironmentInstance = {
          ...instance,
          status: "terminating",
        };
        environments.set(envId, updatedInstance);

        yield* Effect.logInfo("Terminating environment", { envId });

        yield* Effect.tryPromise({
          try: async () => {
            try {
              await execAsync(`docker stop ${envId}`);
              await execAsync(`docker rm ${envId}`);
            } catch {
              const projectName = `inspect-${envId}`;
              await execAsync(`docker-compose -p ${projectName} down`);
            }
          },
          catch: (cause) => new EnvironmentTerminationError({ envId, cause }),
        });

        const terminatedInstance: EnvironmentInstance = {
          ...updatedInstance,
          status: "terminated",
        };
        environments.set(envId, terminatedInstance);

        yield* Effect.logInfo("Environment terminated", { envId });
      });

      const get = (envId: string): EnvironmentInstance | null => {
        return environments.get(envId) ?? null;
      };

      const list = (): EnvironmentInstance[] => {
        return Array.from(environments.values());
      };

      const getUrl = (envId: string): string | null => {
        const instance = environments.get(envId);
        if (instance?.status === "running") {
          return instance.url;
        }
        return null;
      };

      const extendTtl = Effect.fn("EphemeralEnvironmentManager.extendTtl")(function* (
        envId: string,
        additionalMinutes: number,
      ) {
        const instance = environments.get(envId);
        if (!instance) {
          return yield* new EnvironmentNotFoundError({ envId });
        }

        const newExpiresAt = instance.expiresAt + additionalMinutes * 60 * 1000;
        const updatedInstance: EnvironmentInstance = {
          ...instance,
          expiresAt: newExpiresAt,
        };
        environments.set(envId, updatedInstance);

        yield* Effect.logInfo("Extended environment TTL", { envId, newExpiresAt });
      });

      const runHealthCheck = Effect.fn("EphemeralEnvironmentManager.runHealthCheck")(function* (
        envId: string,
      ) {
        const instance = environments.get(envId);
        if (!instance) {
          return yield* new EnvironmentNotFoundError({ envId });
        }

        if (instance.status !== "running") {
          return yield* new HealthCheckError({ envId, cause: "Environment is not running" });
        }

        const startTime = Date.now();

        const result = yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch(instance.url);
            return response.ok;
          },
          catch: (cause) => new HealthCheckError({ envId, cause }),
        });

        const responseTime = Date.now() - startTime;

        return { healthy: result, responseTime };
      });

      const autoCleanup = (): Effect.Effect<void> => {
        return Effect.gen(function* () {
          const now = Date.now();
          const expiredEnvironments: string[] = [];

          for (const [id, instance] of environments) {
            if (instance.status === "running" && instance.expiresAt < now) {
              expiredEnvironments.push(id);
            }
          }

          if (expiredEnvironments.length > 0) {
            yield* Effect.logInfo("Auto-cleanup: terminating expired environments", {
              count: expiredEnvironments.length,
            });

            for (const envId of expiredEnvironments) {
              yield* Effect.ignore(terminate(envId));
            }
          }
        });
      };

      const startAutoCleanup = Effect.sync(() => {
        const interval = setInterval(() => {
          Effect.runSync(Effect.ignore(autoCleanup()));
        }, 60000);

        return () => clearInterval(interval);
      });

      return {
        provision,
        terminate,
        get,
        list,
        getUrl,
        extendTtl,
        runHealthCheck,
        autoCleanup,
        startAutoCleanup,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
