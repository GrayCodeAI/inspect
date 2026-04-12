import { Effect, Layer, ServiceMap } from "effect";
import { CaptchaDetectionError } from "./errors.js";

export type CaptchaType =
  | { readonly _tag: "ReCaptchaV2" }
  | { readonly _tag: "ReCaptchaV3" }
  | { readonly _tag: "HCaptcha" }
  | { readonly _tag: "CloudflareTurnstile" }
  | { readonly _tag: "Geetest" }
  | { readonly _tag: "Custom"; readonly selector: string }
  | { readonly _tag: "None" };

export interface CaptchaDetectionResult {
  readonly captchaType: CaptchaType;
  readonly siteKey?: string;
  readonly action?: string;
  readonly detectedOn: Date;
}

export class CaptchaDetector extends ServiceMap.Service<CaptchaDetector>()(
  "@captcha/CaptchaDetector",
  {
    make: Effect.gen(function* () {
      const detectFromPage = Effect.fn("CaptchaDetector.detectFromPage")(function* (
        _pageUrl: string,
        _pageContent: string,
      ) {
        return yield* Effect.try({
          try: () => {
            return analyzeContent(_pageContent);
          },
          catch: (cause) =>
            new CaptchaDetectionError({
              pageUrl: _pageUrl,
              cause,
            }),
        });
      });

      const detectReCaptcha = Effect.fn("CaptchaDetector.detectReCaptcha")(function* (
        content: string,
      ) {
        const v2Pattern = /g-recaptcha[^>]*data-sitekey=["']([^"']+)["']/i;
        const v3Pattern = /grecaptcha\.execute/i;

        const v2Match = content.match(v2Pattern);
        if (v2Match) {
          return {
            captchaType: { _tag: "ReCaptchaV2" },
            siteKey: v2Match[1],
            detectedOn: new Date(),
          };
        }

        if (v3Pattern.test(content)) {
          return {
            captchaType: { _tag: "ReCaptchaV3" },
            action: "unknown",
            detectedOn: new Date(),
          };
        }

        return {
          captchaType: { _tag: "None" },
          detectedOn: new Date(),
        };
      });

      const detectHCaptcha = Effect.fn("CaptchaDetector.detectHCaptcha")(function* (
        content: string,
      ) {
        const pattern = /h-captcha[^>]*data-sitekey=["']([^"']+)["']/i;
        const match = content.match(pattern);

        if (match) {
          return {
            captchaType: { _tag: "HCaptcha" },
            siteKey: match[1],
            detectedOn: new Date(),
          };
        }

        return {
          captchaType: { _tag: "None" },
          detectedOn: new Date(),
        };
      });

      const detectCloudflare = Effect.fn("CaptchaDetector.detectCloudflare")(function* (
        content: string,
      ) {
        const pattern = /cf-turnstile|turnstile\.render/i;

        if (pattern.test(content)) {
          return {
            captchaType: { _tag: "CloudflareTurnstile" },
            detectedOn: new Date(),
          };
        }

        return {
          captchaType: { _tag: "None" },
          detectedOn: new Date(),
        };
      });

      return {
        detectFromPage,
        detectReCaptcha,
        detectHCaptcha,
        detectCloudflare,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}

function analyzeContent(content: string): CaptchaDetectionResult {
  const checks = [
    { pattern: /g-recaptcha|recaptcha\.net/i, type: "ReCaptchaV2" as const },
    { pattern: /h-captcha|hcaptcha\.com/i, type: "HCaptcha" as const },
    { pattern: /cf-turnstile|turnstile\.render/i, type: "CloudflareTurnstile" as const },
    { pattern: /geetest\.com|gt\.js/i, type: "Geetest" as const },
  ];

  for (const check of checks) {
    if (check.pattern.test(content)) {
      return {
        captchaType: { _tag: check.type },
        detectedOn: new Date(),
      };
    }
  }

  return {
    captchaType: { _tag: "None" },
    detectedOn: new Date(),
  };
}
