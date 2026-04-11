import { Effect, Layer, Schema, Scope, ServiceMap } from "effect";
import { WebDriverClient, type W3CCapabilities, type SessionResponse } from "./webdriver-client.js";
import { WebDriverError, SessionError } from "./errors.js";

export interface BrowserOptions {
  browserName: string;
  browserVersion?: string;
  platformName?: string;
  acceptInsecureCerts?: boolean;
  pageLoadStrategy?: "normal" | "eager" | "none";
  timeouts?: {
    implicit?: number;
    pageLoad?: number;
    script?: number;
  };
  [key: string]: unknown;
}

export class WebDriverBrowser extends ServiceMap.Service<
  WebDriverBrowser,
  {
    readonly sessionId: string;
    readonly capabilities: Record<string, unknown>;
    readonly close: Effect.Effect<void, WebDriverError>;
  } & ReturnType<typeof createBrowserApi>
>()("@inspect/webdriver/WebDriverBrowser") {
  static create = (options: BrowserOptions) =>
    Effect.gen(function* () {
      const client = yield* WebDriverClient;

      const capabilities: W3CCapabilities = {
        alwaysMatch: {
          browserName: options.browserName,
          browserVersion: options.browserVersion,
          platformName: options.platformName,
          acceptInsecureCerts: options.acceptInsecureCerts ?? false,
          pageLoadStrategy: options.pageLoadStrategy ?? "normal",
          ...options,
        },
        firstMatch: [{}],
      };

      const session = yield* client.newSession(capabilities);

      if (options.timeouts) {
        yield* client.setTimeouts(session.sessionId, options.timeouts);
      }

      const browserApi = createBrowserApi(session, client);

      return Object.assign(browserApi, {
        sessionId: session.sessionId,
        capabilities: session.capabilities,
        close: client.deleteSession(session.sessionId),
      });
    }).pipe(
      Effect.withSpan("WebDriverBrowser.create"),
      Effect.annotateCurrentSpan({ browserName: options.browserName }),
    );

  static scoped = (options: BrowserOptions) =>
    Effect.acquireRelease(
      WebDriverBrowser.create(options),
      (browser) => browser.close,
    );
}

function createBrowserApi(session: SessionResponse, client: WebDriverClient) {
  const sessionId = session.sessionId;

  const navigate = (url: string) => client.navigateTo(sessionId, url);

  const getUrl = () => client.getCurrentUrl(sessionId);

  const getTitle = () => client.getTitle(sessionId);

  const find = (strategy: string, selector: string) =>
    client.findElement(sessionId, strategy, selector);

  const findAll = (strategy: string, selector: string) =>
    client.findElements(sessionId, strategy, selector);

  const screenshot = () => client.takeScreenshot(sessionId);

  const execute = (script: string, args?: unknown[]) =>
    client.executeScript(sessionId, script, args);

  const getCookies = () => client.getCookies(sessionId);

  const addCookie = (cookie: import("./webdriver-client.js").Cookie) =>
    client.addCookie(sessionId, cookie);

  const deleteCookies = () => client.deleteCookies(sessionId);

  return {
    navigate,
    getUrl,
    getTitle,
    find,
    findAll,
    screenshot,
    execute,
    getCookies,
    addCookie,
    deleteCookies,
  } as const;
}
