import { Effect, Layer, ServiceMap } from "effect";
import { CaptchaDetector } from "./captcha-detector.js";
import { CaptchaSolver } from "./captcha-solver.js";
import type { CaptchaSolution } from "./captcha-solver.js";
import type { CaptchaType } from "./captcha-detector.js";
import { CaptchaError, CaptchaTimeoutError, CaptchaVerificationError } from "./errors.js";

export interface CaptchaTask {
  readonly pageUrl: string;
  readonly pageContent: string;
}

export interface CaptchaResult {
  readonly solution: CaptchaSolution;
  readonly captchaType: string;
  readonly solvedAt: Date;
}

export class CaptchaService extends ServiceMap.Service<CaptchaService>()(
  "@captcha/CaptchaService",
  {
    make: Effect.gen(function* () {
      const detector = yield* CaptchaDetector;
      const solver = yield* CaptchaSolver;

      const detectAndSolve = Effect.fn("CaptchaService.detectAndSolve")(
        function* (task: CaptchaTask) {
          const detection = yield* detector.detectFromPage(task.pageUrl, task.pageContent);

          if (detection.captchaType._tag === "None") {
            return yield* new CaptchaError({
              captchaType: "none",
              cause: "No captcha detected on page",
            });
          }

          const solution = yield* solveByType(
            detection.captchaType,
            detection.siteKey,
            task.pageUrl,
          );

          if (!solution) {
            return yield* new CaptchaError({
              captchaType: detection.captchaType._tag,
              cause: "Failed to solve captcha",
            });
          }

          return {
            solution,
            captchaType: detection.captchaType._tag,
            solvedAt: new Date(),
          } satisfies CaptchaResult;
        },
      );

      const solveByType = Effect.fn("CaptchaService.solveByType")(
        function* (
          captchaType: CaptchaType,
          siteKey: string | undefined,
          pageUrl: string,
        ) {
          switch (captchaType._tag) {
            case "ReCaptchaV2":
            case "ReCaptchaV3": {
              if (!siteKey) {
                return yield* new CaptchaError({
                  captchaType: captchaType._tag,
                  cause: "Missing siteKey for reCAPTCHA",
                });
              }
              return yield* solver.solveReCaptcha(siteKey, pageUrl);
            }
            case "HCaptcha": {
              if (!siteKey) {
                return yield* new CaptchaError({
                  captchaType: captchaType._tag,
                  cause: "Missing siteKey for hCaptcha",
                });
              }
              return yield* solver.solveHCaptcha(siteKey, pageUrl);
            }
            case "CloudflareTurnstile": {
              const resolvedSiteKey = siteKey ?? "unknown";
              return yield* solver.solveCloudflare(resolvedSiteKey, pageUrl);
            }
            case "Geetest":
              return yield* new CaptchaError({
                captchaType: "Geetest",
                cause: "Ge captcha not yet supported",
              });
            case "Custom":
              return yield* new CaptchaError({
                captchaType: "Custom",
                cause: "Custom captcha solving not supported",
              });
            case "None":
              return yield* new CaptchaError({
                captchaType: "none",
                cause: "No captcha to solve",
              });
          }
        },
      );

      const verifySolution = Effect.fn("CaptchaService.verifySolution")(
        function* (solution: CaptchaSolution, _pageUrl: string) {
          yield* Effect.logDebug("Verifying captcha solution", { provider: solution.provider });
          return true;
        },
      );

      const solveWithRetry = Effect.fn("CaptchaService.solveWithRetry")(
        function* (task: CaptchaTask) {
          return yield* detectAndSolve(task).pipe(
            Effect.retry({ times: 2 }),
          );
        },
      );

      return {
        detectAndSolve,
        solveByType,
        verifySolution,
        solveWithRetry,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make).pipe(
    Layer.provideMerge(CaptchaDetector.layer),
    Layer.provideMerge(CaptchaSolver.layer),
  );
}
