import type { Page, Route, Request } from "playwright";
import { Schema } from "effect";

export class RouteMockNotFoundError extends Schema.ErrorClass<RouteMockNotFoundError>(
  "RouteMockNotFoundError",
)({
  _tag: Schema.tag("RouteMockNotFoundError"),
  urlPattern: Schema.String,
}) {
  message = `No route mock found for pattern: ${this.urlPattern}`;
}

export interface RouteMock {
  urlPattern: string | RegExp;
  method?: string;
  status: number;
  body?: string | object;
  headers?: Record<string, string>;
  delay?: number;
}

interface ActiveMock {
  config: RouteMock;
  handler: (route: Route, request: Request) => Promise<void>;
  once: boolean;
  used: boolean;
}

export class RouteMocker {
  private activeMocks: Map<string, ActiveMock> = new Map();

  private mockKey = (urlPattern: string | RegExp): string =>
    typeof urlPattern === "string" ? urlPattern : urlPattern.source;

  mock = async (page: Page, config: RouteMock): Promise<void> => {
    const key = this.mockKey(config.urlPattern);

    const handler = async (route: Route, request: Request): Promise<void> => {
      if (config.method && request.method() !== config.method.toUpperCase()) {
        await route.continue();
        return;
      }

      const delay = config.delay ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const responseBody =
        typeof config.body === "string" ? config.body : JSON.stringify(config.body);

      await route.fulfill({
        status: config.status,
        body: responseBody,
        headers: {
          "content-type": "application/json",
          ...config.headers,
        },
      });
    };

    this.activeMocks.set(key, { config, handler, once: false, used: false });

    await page.route(config.urlPattern, handler);
  };

  mockOnce = async (page: Page, config: RouteMock): Promise<void> => {
    const key = this.mockKey(config.urlPattern);

    const handler = async (route: Route, request: Request): Promise<void> => {
      if (config.method && request.method() !== config.method.toUpperCase()) {
        await route.continue();
        return;
      }

      const delay = config.delay ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const responseBody =
        typeof config.body === "string" ? config.body : JSON.stringify(config.body);

      await route.fulfill({
        status: config.status,
        body: responseBody,
        headers: {
          "content-type": "application/json",
          ...config.headers,
        },
      });

      await this.unmock(page, config.urlPattern);
    };

    this.activeMocks.set(key, { config, handler, once: true, used: false });

    await page.route(config.urlPattern, handler);
  };

  unmock = async (page: Page, urlPattern: string | RegExp): Promise<void> => {
    const key = this.mockKey(urlPattern);
    const mock = this.activeMocks.get(key);

    if (!mock) {
      return;
    }

    await page.unroute(urlPattern, mock.handler);
    this.activeMocks.delete(key);
  };

  unmockAll = async (page: Page): Promise<void> => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    this.activeMocks.clear();
  };

  listMocks = (): RouteMock[] => {
    return Array.from(this.activeMocks.values()).map((mock) => mock.config);
  };

  simulateError = async (
    page: Page,
    urlPattern: string | RegExp,
    status: number,
    body?: string,
  ): Promise<void> => {
    await this.mock(page, {
      urlPattern,
      status,
      body: body ?? JSON.stringify({ error: "Simulated error" }),
      headers: { "content-type": "application/json" },
    });
  };

  simulateSlowResponse = async (
    page: Page,
    urlPattern: string | RegExp,
    delay: number,
    body?: string,
  ): Promise<void> => {
    await this.mock(page, {
      urlPattern,
      status: 200,
      body: body ?? JSON.stringify({ delayed: true }),
      headers: { "content-type": "application/json" },
      delay,
    });
  };
}
