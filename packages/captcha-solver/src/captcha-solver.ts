import { Config, ConfigProvider, Effect, Layer, ServiceMap } from "effect";
import { CaptchaError } from "./errors.js";

const solverConfig = Config.all({
  provider: Config.withDefault(Config.string("CAPTCHA_SOLVER_PROVIDER"), "2captcha"),
  apiKey: Config.string("CAPTCHA_SOLVER_API_KEY"),
  timeoutMs: Config.withDefault(Config.int("CAPTCHA_SOLVER_TIMEOUT_MS"), 120_000),
  pollingIntervalMs: Config.withDefault(Config.int("CAPTCHA_SOLVER_POLLING_MS"), 5_000),
});

export type SolverConfig = Config.Success<typeof solverConfig>;

export interface CaptchaSolution {
  readonly token: string;
  readonly solvedAt: Date;
  readonly provider: string;
  readonly taskId: string;
}

export class CaptchaSolver extends ServiceMap.Service<CaptchaSolver>()("@captcha/CaptchaSolver", {
  make: Effect.gen(function* () {
    const config = yield* solverConfig.parse(ConfigProvider.fromEnv());

    const solveReCaptcha = Effect.fn("CaptchaSolver.solveReCaptcha")(function* (
      siteKey: string,
      pageUrl: string,
    ) {
      return yield* solveWithProvider(config, {
        type: "recaptchav2",
        siteKey,
        pageUrl,
      });
    });

    const solveHCaptcha = Effect.fn("CaptchaSolver.solveHCaptcha")(function* (
      siteKey: string,
      pageUrl: string,
    ) {
      return yield* solveWithProvider(config, {
        type: "hcaptcha",
        siteKey,
        pageUrl,
      });
    });

    const solveCloudflare = Effect.fn("CaptchaSolver.solveCloudflare")(function* (
      siteKey: string,
      pageUrl: string,
    ) {
      return yield* solveWithProvider(config, {
        type: "turnstile",
        siteKey,
        pageUrl,
      });
    });

    return {
      solveReCaptcha,
      solveHCaptcha,
      solveCloudflare,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

const solveWithProvider = Effect.fn("CaptchaSolver.solveWithProvider")(function* (
  config: SolverConfig,
  params: { type: string; siteKey: string; pageUrl: string },
) {
  switch (config.provider) {
    case "2captcha":
      return yield* solveVia2Captcha(config, params);
    case "anti-captcha":
      return yield* new CaptchaError({
        captchaType: params.type,
        cause: "Anti-Captcha integration not yet implemented",
      });
    case "capmonster":
      return yield* new CaptchaError({
        captchaType: params.type,
        cause: "CapMonster integration not yet implemented",
      });
    default:
      return yield* new CaptchaError({
        captchaType: params.type,
        cause: `Unsupported captcha provider: ${config.provider}`,
      });
  }
});

const solveVia2Captcha = Effect.fn("solveVia2Captcha")(function* (
  config: SolverConfig,
  params: { type: string; siteKey: string; pageUrl: string },
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const createResponse = await fetch("https://2captcha.com/in.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          key: config.apiKey,
          method: "userrecaptcha",
          googlekey: params.siteKey,
          pageurl: params.pageUrl,
          json: "1",
        }),
      });

      const createData = (await createResponse.json()) as {
        status: number;
        request: string;
        error_text?: string;
      };

      if (createData.status !== 1) {
        throw new Error(`2captcha create error: ${createData.error_text}`);
      }

      const taskId = createData.request;
      const solution = await poll2CaptchaResult(taskId, config);

      return {
        token: solution,
        solvedAt: new Date(),
        provider: "2captcha",
        taskId,
      } satisfies CaptchaSolution;
    },
    catch: (cause: unknown) =>
      new CaptchaError({
        captchaType: params.type,
        cause,
      }),
  });
});

async function poll2CaptchaResult(taskId: string, config: SolverConfig): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < config.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, config.pollingIntervalMs));

    const response = await fetch(
      `https://2captcha.com/res.php?key=${config.apiKey}&action=get&id=${taskId}&json=1`,
    );

    const data = (await response.json()) as {
      status: number;
      request: string;
      error_text?: string;
    };

    if (data.status === 1) {
      return data.request;
    }

    if (data.error_text === "CAPCHA_NOT_READY") {
      continue;
    }

    throw new Error(`2captcha result error: ${data.error_text}`);
  }

  throw new Error("2captcha polling timeout");
}
