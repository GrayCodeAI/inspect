import { Effect, Layer, Ref, ServiceMap } from "effect";
import { WebDriverError, ElementNotFoundError } from "./errors.js";

export interface W3CCapabilities {
  alwaysMatch: Record<string, unknown>;
  firstMatch: Array<Record<string, unknown>>;
}

export interface SessionResponse {
  sessionId: string;
  capabilities: Record<string, unknown>;
}

export interface WebElement {
  "element-6066-11e4-a52e-4f735466cecf": string;
  ELEMENT: string;
}

export interface Cookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expiry?: number;
}

export class WebDriverClient extends ServiceMap.Service<
  WebDriverClient,
  {
    readonly newSession: (
      capabilities: W3CCapabilities,
    ) => Effect.Effect<SessionResponse, WebDriverError>;
    readonly deleteSession: (sessionId: string) => Effect.Effect<void, WebDriverError>;
    readonly getStatus: Effect.Effect<Record<string, unknown>, WebDriverError>;
    readonly navigateTo: (sessionId: string, url: string) => Effect.Effect<void, WebDriverError>;
    readonly getCurrentUrl: (sessionId: string) => Effect.Effect<string, WebDriverError>;
    readonly getTitle: (sessionId: string) => Effect.Effect<string, WebDriverError>;
    readonly findElement: (
      sessionId: string,
      strategy: string,
      selector: string,
    ) => Effect.Effect<WebElement, ElementNotFoundError | WebDriverError>;
    readonly findElements: (
      sessionId: string,
      strategy: string,
      selector: string,
    ) => Effect.Effect<WebElement[], WebDriverError>;
    readonly getElementText: (
      sessionId: string,
      elementId: string,
    ) => Effect.Effect<string, WebDriverError>;
    readonly elementClick: (
      sessionId: string,
      elementId: string,
    ) => Effect.Effect<void, WebDriverError>;
    readonly elementSendKeys: (
      sessionId: string,
      elementId: string,
      text: string,
    ) => Effect.Effect<void, WebDriverError>;
    readonly takeScreenshot: (sessionId: string) => Effect.Effect<string, WebDriverError>;
    readonly getCookies: (sessionId: string) => Effect.Effect<Cookie[], WebDriverError>;
    readonly addCookie: (sessionId: string, cookie: Cookie) => Effect.Effect<void, WebDriverError>;
    readonly deleteCookies: (sessionId: string) => Effect.Effect<void, WebDriverError>;
    readonly executeScript: (
      sessionId: string,
      script: string,
      args?: unknown[],
    ) => Effect.Effect<unknown, WebDriverError>;
    readonly setTimeouts: (
      sessionId: string,
      timeouts: { implicit?: number; pageLoad?: number; script?: number },
    ) => Effect.Effect<void, WebDriverError>;
  }
>()("@inspect/webdriver/WebDriverClient") {
  static make = Effect.gen(function* () {
    const baseUrlRef = yield* Ref.make(DEFAULT_WEBDRIVER_URL);

    const baseUrl = (url: string) => Ref.set(baseUrlRef, url);

    const exec = <T>(
      sessionId: string,
      method: string,
      command: string,
      body?: unknown,
    ): Effect.Effect<T, WebDriverError> =>
      Effect.tryPromise({
        try: async () => {
          const base = await Effect.runPromise(Ref.get(baseUrlRef));
          const url = `${base}/session/${sessionId}/${command}`;
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          });
          return response.json() as Promise<Record<string, unknown>>;
        },
        catch: (cause) => new WebDriverError({ command, cause: String(cause) }),
      }).pipe(
        Effect.flatMap((rb) => {
          if (rb.error) {
            return Effect.fail(
              new WebDriverError({
                command,
                cause: `${rb.error}: ${rb.message ?? ""}`,
              }),
            );
          }
          return Effect.succeed(rb.value as T);
        }),
      );

    const execNoSession = <T>(
      method: string,
      command: string,
      body?: unknown,
    ): Effect.Effect<T, WebDriverError> =>
      Effect.tryPromise({
        try: async () => {
          const base = await Effect.runPromise(Ref.get(baseUrlRef));
          const url = `${base}/${command}`;
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          });
          return response.json() as Promise<Record<string, unknown>>;
        },
        catch: (cause) => new WebDriverError({ command, cause: String(cause) }),
      }).pipe(
        Effect.flatMap((rb) => {
          if (rb.error) {
            return Effect.fail(
              new WebDriverError({
                command,
                cause: `${rb.error}: ${rb.message ?? ""}`,
              }),
            );
          }
          return Effect.succeed(rb.value as T);
        }),
      );

    const newSession = (capabilities: W3CCapabilities) =>
      Effect.gen(function* () {
        const session = yield* execNoSession<SessionResponse>("POST", "session", {
          capabilities,
        });

        yield* Effect.logInfo("WebDriver session created", {
          sessionId: session.sessionId,
        });

        return session;
      });

    const deleteSession = (sessionId: string) =>
      Effect.tryPromise({
        try: async () => {
          const base = await Effect.runPromise(Ref.get(baseUrlRef));
          const url = `${base}/session/${sessionId}`;
          await fetch(url, { method: "DELETE" });
        },
        catch: (cause) => new WebDriverError({ command: "deleteSession", cause: String(cause) }),
      });

    const getStatus = execNoSession<Record<string, unknown>>("GET", "status");

    const navigateTo = (sessionId: string, url: string) =>
      exec<void>(sessionId, "POST", "url", { url });

    const getCurrentUrl = (sessionId: string) => exec<string>(sessionId, "GET", "url");

    const getTitle = (sessionId: string) => exec<string>(sessionId, "GET", "title");

    const findElement = (sessionId: string, strategy: string, selector: string) =>
      exec<WebElement>(sessionId, "POST", "element", {
        using: strategy,
        value: selector,
      });

    const findElements = (sessionId: string, strategy: string, selector: string) =>
      exec<WebElement[]>(sessionId, "POST", "elements", {
        using: strategy,
        value: selector,
      });

    const getElementText = (sessionId: string, elementId: string) =>
      exec<string>(sessionId, "GET", `element/${elementId}/text`);

    const elementClick = (sessionId: string, elementId: string) =>
      exec<void>(sessionId, "POST", `element/${elementId}/click`);

    const elementSendKeys = (sessionId: string, elementId: string, text: string) =>
      exec<void>(sessionId, "POST", `element/${elementId}/value`, { text });

    const takeScreenshot = (sessionId: string) => exec<string>(sessionId, "GET", "screenshot");

    const getCookies = (sessionId: string) => exec<Cookie[]>(sessionId, "GET", "cookie");

    const addCookie = (sessionId: string, cookie: Cookie) =>
      exec<void>(sessionId, "POST", "cookie", { cookie });

    const deleteCookies = (sessionId: string) => exec<void>(sessionId, "DELETE", "cookie");

    const executeScript = (sessionId: string, script: string, args?: unknown[]) =>
      exec<unknown>(sessionId, "POST", "execute/sync", {
        script,
        args: args ?? [],
      });

    const setTimeouts = (
      sessionId: string,
      timeouts: { implicit?: number; pageLoad?: number; script?: number },
    ) => exec<void>(sessionId, "POST", "timeouts", timeouts);

    return {
      baseUrl,
      newSession,
      deleteSession,
      getStatus,
      navigateTo,
      getCurrentUrl,
      getTitle,
      findElement,
      findElements,
      getElementText,
      elementClick,
      elementSendKeys,
      takeScreenshot,
      getCookies,
      addCookie,
      deleteCookies,
      executeScript,
      setTimeouts,
    } as const;
  });

  static layer = Layer.effect(this, this.make);
}

const DEFAULT_WEBDRIVER_URL = "http://localhost:4444";
