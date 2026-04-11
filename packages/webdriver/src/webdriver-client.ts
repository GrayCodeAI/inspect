import { Effect, Layer, Ref, Scope, Schema, ServiceMap } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { WebDriverError, SessionError, ElementNotFoundError, NavigationError } from "./errors.js";

export interface W3CCapabilities {
  alwaysMatch: Record<string, unknown>;
  firstMatch: Record<string, unknown>[];
}

export interface SessionResponse {
  sessionId: string;
  capabilities: Record<string, unknown>;
}

export interface WebElement {
  elementId: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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
    ) => Effect.Effect<SessionResponse, SessionError>;
    readonly deleteSession: (
      sessionId: string,
    ) => Effect.Effect<void, WebDriverError>;
    readonly getStatus: Effect.Effect<Record<string, unknown>, WebDriverError>;
    readonly navigateTo: (
      sessionId: string,
      url: string,
    ) => Effect.Effect<void, NavigationError>;
    readonly getCurrentUrl: (
      sessionId: string,
    ) => Effect.Effect<string, WebDriverError>;
    readonly getTitle: (
      sessionId: string,
    ) => Effect.Effect<string, WebDriverError>;
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
    readonly takeScreenshot: (
      sessionId: string,
    ) => Effect.Effect<string, WebDriverError>;
    readonly getCookies: (
      sessionId: string,
    ) => Effect.Effect<Cookie[], WebDriverError>;
    readonly addCookie: (
      sessionId: string,
      cookie: Cookie,
    ) => Effect.Effect<void, WebDriverError>;
    readonly deleteCookies: (
      sessionId: string,
    ) => Effect.Effect<void, WebDriverError>;
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
    const httpClient = yield* HttpClient.HttpClient;
    const baseUrlRef = yield* Ref.make(DEFAULT_WEBDRIVER_URL);

    const baseUrl = (url: string) => Ref.set(baseUrlRef, url);

    const executeCommand = <T>(
      sessionId: string,
      method: string,
      command: string,
      body?: unknown,
    ) =>
      Effect.gen(function* () {
        const baseUrl = yield* Ref.get(baseUrlRef);
        const url = `${baseUrl}/session/${sessionId}/${command}`;

        const request = HttpClientRequest.json(method)(url).pipe(
          body ? HttpClientRequest.bodyJson(body) : (r: typeof request) => r,
        );

        const response = yield* httpClient.execute(request).pipe(
          Effect.catchCause((cause) => new WebDriverError({ command, cause })),
        );

        const responseBody = yield* response.json.pipe(
          Effect.catchCause((cause) => new WebDriverError({ command, cause })),
        );

        if (responseBody.error) {
          return yield* new WebDriverError({
            command,
            cause: `${responseBody.error}: ${responseBody.message ?? ""}`,
          });
        }

        return responseBody.value as T;
      }).pipe(Effect.withSpan(`WebDriverClient.${command}`));

    const executeCommandNoSession = <T>(method: string, command: string, body?: unknown) =>
      Effect.gen(function* () {
        const baseUrl = yield* Ref.get(baseUrlRef);
        const url = `${baseUrl}/${command}`;

        const request = HttpClientRequest.json(method)(url).pipe(
          body ? HttpClientRequest.bodyJson(body) : (r: typeof request) => r,
        );

        const response = yield* httpClient.execute(request).pipe(
          Effect.catchCause((cause) => new WebDriverError({ command, cause })),
        );

        const responseBody = yield* response.json.pipe(
          Effect.catchCause((cause) => new WebDriverError({ command, cause })),
        );

        if (responseBody.error) {
          return yield* new WebDriverError({
            command,
            cause: `${responseBody.error}: ${responseBody.message ?? ""}`,
          });
        }

        return responseBody.value as T;
      });

    const newSession = (capabilities: W3CCapabilities) =>
      executeCommandNoSession<SessionResponse>("POST", "session", {
        capabilities,
      }).pipe(
        Effect.catchCause((cause) =>
          new SessionError({
            reason: "Failed to create session",
            cause,
          }).asEffect(),
        ),
        Effect.tap((session) =>
          Effect.logInfo("WebDriver session created", {
            sessionId: session.sessionId,
          }),
        ),
      );

    const deleteSession = (sessionId: string) =>
      Effect.gen(function* () {
        const baseUrl = yield* Ref.get(baseUrlRef);
        const url = `${baseUrl}/session/${sessionId}`;

        yield* httpClient
          .delete_(url)
          .pipe(Effect.catchCause((cause) => new WebDriverError({ command: "deleteSession", cause })));

        yield* Effect.logDebug("WebDriver session deleted", { sessionId });
      }).pipe(Effect.withSpan("WebDriverClient.deleteSession"));

    const getStatus = executeCommandNoSession<Record<string, unknown>>("GET", "status");

    const navigateTo = (sessionId: string, url: string) =>
      executeCommand<void>(sessionId, "POST", "url", { url }).pipe(
        Effect.catchCause((cause) => new NavigationError({ url, cause }).asEffect()),
      );

    const getCurrentUrl = (sessionId: string) =>
      executeCommand<string>(sessionId, "GET", "url");

    const getTitle = (sessionId: string) => executeCommand<string>(sessionId, "GET", "title");

    const findElement = (sessionId: string, strategy: string, selector: string) =>
      executeCommand<WebElement>(sessionId, "POST", "element", {
        using: strategy,
        value: selector,
      }).pipe(
        Effect.catchTag("WebDriverError", (error) =>
          new ElementNotFoundError({ strategy, selector, sessionId }).asEffect(),
        ),
      );

    const findElements = (sessionId: string, strategy: string, selector: string) =>
      executeCommand<WebElement[]>(sessionId, "POST", "elements", {
        using: strategy,
        value: selector,
      });

    const getElementText = (sessionId: string, elementId: string) =>
      executeCommand<string>(sessionId, "GET", `element/${elementId}/text`);

    const elementClick = (sessionId: string, elementId: string) =>
      executeCommand<void>(sessionId, "POST", `element/${elementId}/click`);

    const elementSendKeys = (sessionId: string, elementId: string, text: string) =>
      executeCommand<void>(sessionId, "POST", `element/${elementId}/value`, { text });

    const takeScreenshot = (sessionId: string) =>
      executeCommand<string>(sessionId, "GET", "screenshot");

    const getCookies = (sessionId: string) =>
      executeCommand<Cookie[]>(sessionId, "GET", "cookie");

    const addCookie = (sessionId: string, cookie: Cookie) =>
      executeCommand<void>(sessionId, "POST", "cookie", { cookie });

    const deleteCookies = (sessionId: string) =>
      executeCommand<void>(sessionId, "DELETE", "cookie");

    const executeScript = (sessionId: string, script: string, args?: unknown[]) =>
      executeCommand<unknown>(sessionId, "POST", "execute/sync", {
        script,
        args: args ?? [],
      });

    const setTimeouts = (
      sessionId: string,
      timeouts: { implicit?: number; pageLoad?: number; script?: number },
    ) => executeCommand<void>(sessionId, "POST", "timeouts", timeouts);

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

  static layer = Layer.effect(this, this.make).pipe(Layer.provide(HttpClient.layer));
}

const DEFAULT_WEBDRIVER_URL = "http://localhost:4444";
