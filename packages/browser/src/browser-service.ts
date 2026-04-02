import { Effect, Layer, Scope, ServiceMap } from "effect";
import { BrowserError, NavigationError, ElementNotFoundError, TimeoutError } from "@inspect/shared";

export interface BrowserSession {
  readonly navigate: (url: string) => Effect.Effect<void, NavigationError>;
  readonly close: Effect.Effect<void>;
  readonly url: Effect.Effect<string>;
  readonly title: Effect.Effect<string>;
  readonly screenshot: (path?: string) => Effect.Effect<string>;
  readonly evaluate: <T>(script: string) => Effect.Effect<T>;
  readonly waitForSelector: (selector: string, timeout?: number) => Effect.Effect<void, ElementNotFoundError | TimeoutError>;
  readonly click: (selector: string) => Effect.Effect<void, ElementNotFoundError>;
  readonly type: (selector: string, text: string) => Effect.Effect<void, ElementNotFoundError>;
  readonly getText: (selector: string) => Effect.Effect<string, ElementNotFoundError>;
  readonly getAttribute: (selector: string, attr: string) => Effect.Effect<string, ElementNotFoundError>;
  readonly isVisible: (selector: string) => Effect.Effect<boolean>;
  readonly count: (selector: string) => Effect.Effect<number>;
  readonly consoleLogs: Effect.Effect<readonly string[]>;
  readonly networkRequests: Effect.Effect<readonly unknown[]>;
}

export class BrowserManager extends ServiceMap.Service<BrowserManager, {
  readonly launch: (options?: { headless?: boolean; channel?: string }) => Effect.Effect<BrowserSession, BrowserError, Scope.Scope>;
  readonly closeAll: () => Effect.Effect<void>;
  readonly sessionCount: () => Effect.Effect<number>;
}>()("@inspect/BrowserManager") {
  static layer = Layer.effect(this,
    Effect.gen(function* () {
      const sessions = new Set<BrowserSession>();

      const launch = (_options?: { headless?: boolean; channel?: string }): Effect.Effect<BrowserSession, BrowserError, Scope.Scope> => {
        const session: BrowserSession = {
          navigate: (_url: string) => Effect.succeed(undefined),
          close: Effect.sync(() => { sessions.delete(session); }),
          url: Effect.succeed("about:blank"),
          title: Effect.succeed(""),
          screenshot: (_path?: string) => Effect.succeed(""),
          evaluate: <T>(_script: string) => Effect.succeed(undefined as unknown as T),
          waitForSelector: (_selector: string, _timeout?: number) => Effect.void,
          click: (_selector: string) => Effect.void,
          type: (_selector: string, _text: string) => Effect.void,
          getText: (_selector: string) => Effect.succeed(""),
          getAttribute: (_selector: string, _attr: string) => Effect.succeed(""),
          isVisible: (_selector: string) => Effect.succeed(true),
          count: (_selector: string) => Effect.succeed(0),
          consoleLogs: Effect.succeed([] as const),
          networkRequests: Effect.succeed([] as const),
        };
        sessions.add(session);
        return Effect.succeed(session);
      };

      const closeAll = (): Effect.Effect<void> => {
        return Effect.sync(() => {
          sessions.clear();
        });
      };

      const sessionCount = (): Effect.Effect<number> => Effect.sync(() => sessions.size);

      return { launch, closeAll, sessionCount } as const;
    }),
  );
}
