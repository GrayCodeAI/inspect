import { Effect, Layer, ServiceMap, Schema } from "effect";
import { BrowserError } from "@inspect/shared";

export class WebKitBackend extends ServiceMap.Service<WebKitBackend>()("@inspect/WebKitBackend", {
  make: Effect.gen(function* () {
    const launch = (config: {
      executablePath?: string;
      headless: boolean;
      slowMo?: number;
      args: string[];
      viewport?: { width: number; height: number };
      locale?: string;
      timezone?: string;
      geolocation?: { longitude: number; latitude: number };
      permissions?: string[];
      ignoreHTTPSErrors?: boolean;
      deviceScaleFactor?: number;
      isMobile?: boolean;
      hasTouch?: boolean;
      extraHTTPHeaders?: Record<string, string>;
      userDataDir?: string;
      downloadsPath?: string;
      maxDownloadSize?: number;
      storageStatePath?: string;
    }) =>
      Effect.tryPromise({
        try: async () => {
          const { webkit } = await import("playwright");
          if (config.userDataDir) {
            return webkit.launchPersistentContext(config.userDataDir, {
              headless: config.headless,
              slowMo: config.slowMo,
              args: config.args,
              viewport: config.viewport,
              locale: config.locale,
              timezoneId: config.timezone,
              geolocation: config.geolocation,
              permissions: config.permissions,
              ignoreHTTPSErrors: config.ignoreHTTPSErrors,
              deviceScaleFactor: config.deviceScaleFactor,
              isMobile: config.isMobile,
              hasTouch: config.hasTouch,
              extraHTTPHeaders: config.extraHTTPHeaders,
            });
          } else {
            const browser = await webkit.launch({
              headless: config.headless,
              slowMo: config.slowMo,
              args: config.args,
              executablePath: config.executablePath,
              downloadsPath: config.downloadsPath,
            });
            return browser.newContext({
              viewport: config.viewport,
              locale: config.locale,
              timezoneId: config.timezone,
              geolocation: config.geolocation,
              permissions: config.permissions,
              ignoreHTTPSErrors: config.ignoreHTTPSErrors,
              deviceScaleFactor: config.deviceScaleFactor,
              isMobile: config.isMobile,
              hasTouch: config.hasTouch,
              extraHTTPHeaders: config.extraHTTPHeaders,
              storageState: config.storageStatePath,
            });
          }
        },
        catch: (cause) =>
          Effect.fail(
            new BrowserError({
              browser: "webkit",
              cause,
            }),
          ),
      });

    const close = () => Effect.succeed(undefined);

    return { launch, close };
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
