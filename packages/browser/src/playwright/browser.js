// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Browser automation with Playwright and Lightpanda
// ──────────────────────────────────────────────────────────────────────────────
import { Effect, ServiceMap, Layer } from "effect";
import { WebKitBackend } from "./backends/webkit";
/**
 * Manages Playwright browser lifecycle: launch, context creation, page management,
 * stealth mode, cookie injection, init scripts, and storage state.
 */
export class BrowserManager extends ServiceMap.Service()("@inspect/BrowserManager", {
    make: Effect.gen(function* () {
        let browser = null;
        let context = null;
        let config = null;
        const backend = yield* WebKitBackend;
        const launchBrowser = (cfg) => Effect.gen(function* () {
            config = cfg;
            // ── Connect to existing browser via CDP ──────────────────────────────
            if (config.cdpEndpoint) {
                const result = yield* backend.launch({
                    cdpEndpoint: config.cdpEndpoint,
                });
                context = result.context;
                browser = result.browser;
                yield* applyContextConfig(context, config);
                return context;
            }
            // ── Build launch options ─────────────────────────────────────────────
            const launchOptions = {
                headless: config.headless,
                slowMo: config.slowMo,
                args: buildLaunchArgs(config),
            };
            if (config.executablePath) {
                launchOptions.executablePath = config.executablePath;
            }
            if (config.downloadsPath) {
                launchOptions.downloadsPath = config.downloadsPath;
            }
            if (config.proxy) {
                const p = config.proxy;
                launchOptions.proxy = {
                    server: p.server,
                    username: p.username,
                    password: p.password,
                    bypass: p.bypass,
                };
            }
            // ── Launch with persistent context (user data dir) or fresh ─────────
            if (config.userDataDir) {
                context = yield* backend.launch({
                    ...launchOptions,
                    userDataDir: config.userDataDir,
                    viewport: config.viewport,
                    locale: config.locale,
                    timezone: config.timezone,
                    geolocation: config.geolocation,
                    permissions: config.permissions ? [...config.permissions] : undefined,
                    ignoreHTTPSErrors: config.ignoreHTTPSErrors,
                    deviceScaleFactor: config.deviceScaleFactor,
                    isMobile: config.isMobile,
                    hasTouch: config.hasTouch,
                    extraHTTPHeaders: config.extraHTTPHeaders,
                });
                // Persistent context owns its own browser — set to null to avoid double-close
                browser = null;
            }
            else {
                browser = yield* backend.launch({
                    ...launchOptions,
                    executablePath: config.executablePath,
                    downloadsPath: config.downloadsPath,
                });
                context = yield* browser.newContext({
                    viewport: config.viewport,
                    locale: config.locale,
                    timezoneId: config.timezone,
                    geolocation: config.geolocation,
                    permissions: config.permissions ? [...config.permissions] : undefined,
                    ignoreHTTPSErrors: config.ignoreHTTPSErrors,
                    deviceScaleFactor: config.deviceScaleFactor,
                    isMobile: config.isMobile,
                    hasTouch: config.hasTouch,
                    extraHTTPHeaders: config.extraHTTPHeaders,
                    storageState: config.storageStatePath ?? undefined,
                });
            }
            yield* applyContextConfig(context, config);
            return context;
        });
        const closeBrowser = Effect.gen(function* () {
            if (context) {
                yield* Effect.tryPromise({
                    try: () => context.close(),
                    catch: (err) => Effect.sync(() => {
                        // logger.warn("Failed to close context", { err: err?.message });
                    }),
                });
                context = null;
            }
            if (browser) {
                yield* Effect.tryPromise({
                    try: () => browser.close(),
                    catch: (err) => Effect.sync(() => {
                        // logger.warn("Failed to close browser", { err: err?.message });
                    }),
                });
                browser = null;
            }
        });
        context = null;
    }),
    if(browser) {
        yield * Effect.tryPromise({
            try: () => browser.close(),
            catch: (err) => Effect.sync(() => logger.warn("Failed to close browser", { err: err?.message })),
        });
        browser = null;
    }
}) {
}
const getContext = Effect.gen(function* () {
    if (!context) {
        return yield* Effect.die(new Error("Browser not launched. Call launchBrowser() first."));
    }
    return context;
});
const newPage = Effect.gen(function* () {
    const ctx = yield* getContext();
    return ctx.newPage();
});
const exportStorageState = (path) => Effect.gen(function* () {
    const ctx = yield* getContext();
    const state = yield* ctx.storageState({ path });
    return JSON.stringify(state, null, 2);
});
const importStorageState = (stateOrPath) => Effect.gen(function* () {
    if (!browser) {
        return yield* Effect.die(new Error("Cannot import storage state on persistent context. Use storageStatePath in config."));
    }
    // Close existing context
    if (context) {
        yield* context.close();
    }
    // Determine if it's a file path or JSON string
    let storageState;
    try {
        storageState = JSON.parse(stateOrPath);
    }
    catch (error) {
        logger.debug("Storage state is not JSON, treating as file path", { error });
        storageState = stateOrPath;
    }
    context = yield* browser.newContext({
        viewport: config?.viewport ?? { width: 1280, height: 720 },
        locale: config?.locale,
        timezoneId: config?.timezone,
        storageState: storageState,
    });
    if (config) {
        yield* applyContextConfig(context, config);
    }
});
// ── Private helpers ──────────────────────────────────────────────────────
const buildLaunchArgs = (config) => {
    // Implementation...
    return [];
};
const applyContextConfig = Effect.gen(function* (context, config) {
    // Implementation...
});
return {
    launchBrowser,
    closeBrowser,
    getContext,
    newPage,
    exportStorageState,
    importStorageState,
};
{
    layer = Layer.effect(this, this.make).pipe(Layer.provide(WebKitBackend.layer));
}
