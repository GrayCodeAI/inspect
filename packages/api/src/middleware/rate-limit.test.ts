import { describe, it, expect, afterEach } from "vitest";
import { RateLimiter } from "./rate-limit.js";
import type { APIRequest, APIResponse } from "../server.js";

/** Create a minimal mock APIRequest. */
function mockRequest(overrides: Partial<APIRequest> = {}): APIRequest {
  return {
    method: "GET",
    url: "/api/data",
    path: "/api/data",
    params: {},
    query: {},
    headers: {},
    body: null,
    rawBody: "",
    raw: { socket: { remoteAddress: "127.0.0.1" } } as unknown,
    ...overrides,
  };
}

/** Create a minimal mock APIResponse that tracks status/headers/json calls. */
function mockResponse(): APIResponse & {
  _status: number;
  _headers: Record<string, string>;
  _json: unknown;
  _sent: boolean;
} {
  const res: unknown = {
    statusCode: 200,
    _status: 200,
    _headers: {} as Record<string, string>,
    _json: undefined as unknown,
    _sent: false,
    headers: {},
    status(code: number) {
      res.statusCode = code;
      res._status = code;
      return res;
    },
    header(name: string, value: string) {
      res._headers[name] = value;
      res.headers[name] = value;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      res._sent = true;
    },
    send() {
      res._sent = true;
    },
    sendStatus(code: number) {
      res._status = code;
      res._sent = true;
    },
    end() {
      res._sent = true;
    },
  };
  return res;
}

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  describe("default configuration", () => {
    it("allows requests under the limit", async () => {
      limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
      const mw = limiter.middleware();
      const req = mockRequest();
      const res = mockResponse();
      let nextCalled = false;

      await mw(req, res, async () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(res._status).toBe(200);
    });

    it("returns 429 when limit is exceeded", async () => {
      limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });
      const mw = limiter.middleware();

      // First two requests should pass
      for (let i = 0; i < 2; i++) {
        const res = mockResponse();
        await mw(mockRequest(), res, async () => {});
        expect(res._status).toBe(200);
      }

      // Third request should be rejected
      const res = mockResponse();
      let nextCalled = false;
      await mw(mockRequest(), res, async () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(429);
      expect(res._json).toBeDefined();
      expect((res._json as unknown).retryAfter).toBeGreaterThan(0);
    });
  });

  describe("getCount and reset", () => {
    it("tracks request count per key", async () => {
      limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
      const mw = limiter.middleware();

      await mw(mockRequest(), mockResponse(), async () => {});
      await mw(mockRequest(), mockResponse(), async () => {});
      await mw(mockRequest(), mockResponse(), async () => {});

      expect(limiter.getCount("127.0.0.1")).toBe(3);
    });

    it("returns 0 for unknown keys", () => {
      limiter = new RateLimiter();
      expect(limiter.getCount("unknown-ip")).toBe(0);
    });

    it("resets count for a specific key", async () => {
      limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
      const mw = limiter.middleware();

      await mw(mockRequest(), mockResponse(), async () => {});
      expect(limiter.getCount("127.0.0.1")).toBe(1);

      limiter.reset("127.0.0.1");
      expect(limiter.getCount("127.0.0.1")).toBe(0);
    });
  });

  describe("skip paths", () => {
    it("skips rate limiting for configured paths", async () => {
      limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60_000,
        skipPaths: ["/api/health"],
      });
      const mw = limiter.middleware();

      // Exhaust the limit on a normal path
      await mw(mockRequest({ path: "/api/data" }), mockResponse(), async () => {});

      // Second normal request should be blocked
      const blockedRes = mockResponse();
      await mw(mockRequest({ path: "/api/data" }), blockedRes, async () => {});
      expect(blockedRes._status).toBe(429);

      // Health path should still work
      const healthRes = mockResponse();
      let nextCalled = false;
      await mw(
        mockRequest({ path: "/api/health" }),
        healthRes,
        async () => { nextCalled = true; },
      );
      expect(nextCalled).toBe(true);
      expect(healthRes._status).toBe(200);
    });

    it("uses default skip paths /api/health and /api/status", async () => {
      limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      const mw = limiter.middleware();

      // Exhaust limit
      await mw(mockRequest({ path: "/api/other" }), mockResponse(), async () => {});

      // Default skip paths should bypass the limiter
      for (const skipPath of ["/api/health", "/api/status"]) {
        let nextCalled = false;
        await mw(
          mockRequest({ path: skipPath }),
          mockResponse(),
          async () => { nextCalled = true; },
        );
        expect(nextCalled).toBe(true);
      }
    });
  });

  describe("rate limit headers", () => {
    it("sets rate limit headers when enabled", async () => {
      limiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60_000,
        headers: true,
      });
      const mw = limiter.middleware();
      const res = mockResponse();

      await mw(mockRequest(), res, async () => {});

      expect(res._headers["X-RateLimit-Limit"]).toBe("10");
      expect(res._headers["X-RateLimit-Remaining"]).toBe("9");
      expect(res._headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("decrements remaining count with each request", async () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 60_000,
        headers: true,
      });
      const mw = limiter.middleware();

      const res1 = mockResponse();
      await mw(mockRequest(), res1, async () => {});
      expect(res1._headers["X-RateLimit-Remaining"]).toBe("4");

      const res2 = mockResponse();
      await mw(mockRequest(), res2, async () => {});
      expect(res2._headers["X-RateLimit-Remaining"]).toBe("3");
    });

    it("includes Retry-After header on 429 responses", async () => {
      limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      const mw = limiter.middleware();

      await mw(mockRequest(), mockResponse(), async () => {});
      const res = mockResponse();
      await mw(mockRequest(), res, async () => {});

      expect(res._status).toBe(429);
      expect(res._headers["Retry-After"]).toBeDefined();
      expect(Number(res._headers["Retry-After"])).toBeGreaterThan(0);
    });
  });

  describe("custom key extractor", () => {
    it("groups requests by custom key", async () => {
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60_000,
        keyExtractor: (req) => req.headers["x-api-key"] as string ?? "anonymous",
      });
      const mw = limiter.middleware();

      // Two requests from user-a
      await mw(mockRequest({ headers: { "x-api-key": "user-a" } }), mockResponse(), async () => {});
      await mw(mockRequest({ headers: { "x-api-key": "user-a" } }), mockResponse(), async () => {});

      // Third request from user-a should be blocked
      const blockedRes = mockResponse();
      await mw(mockRequest({ headers: { "x-api-key": "user-a" } }), blockedRes, async () => {});
      expect(blockedRes._status).toBe(429);

      // user-b should still be allowed
      const allowedRes = mockResponse();
      let nextCalled = false;
      await mw(
        mockRequest({ headers: { "x-api-key": "user-b" } }),
        allowedRes,
        async () => { nextCalled = true; },
      );
      expect(nextCalled).toBe(true);
    });
  });

  describe("window expiry", () => {
    it("resets count after window expires", async () => {
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 50, // 50ms window for testing
      });
      const mw = limiter.middleware();

      // Exhaust the limit
      await mw(mockRequest(), mockResponse(), async () => {});
      await mw(mockRequest(), mockResponse(), async () => {});

      const blockedRes = mockResponse();
      await mw(mockRequest(), blockedRes, async () => {});
      expect(blockedRes._status).toBe(429);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 80));

      // Should be allowed again
      const res = mockResponse();
      let nextCalled = false;
      await mw(mockRequest(), res, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(res._status).toBe(200);
    });
  });

  describe("concurrent requests from different IPs", () => {
    it("tracks limits independently per IP", async () => {
      limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      const mw = limiter.middleware();

      const reqA = mockRequest({ raw: { socket: { remoteAddress: "10.0.0.1" } } as unknown });
      const reqB = mockRequest({ raw: { socket: { remoteAddress: "10.0.0.2" } } as unknown });

      // Both IPs should be allowed their first request
      const resA = mockResponse();
      let nextA = false;
      await mw(reqA, resA, async () => { nextA = true; });
      expect(nextA).toBe(true);

      const resB = mockResponse();
      let nextB = false;
      await mw(reqB, resB, async () => { nextB = true; });
      expect(nextB).toBe(true);

      // Second request from A should be blocked
      const resA2 = mockResponse();
      await mw(
        mockRequest({ raw: { socket: { remoteAddress: "10.0.0.1" } } as unknown }),
        resA2,
        async () => {},
      );
      expect(resA2._status).toBe(429);

      // Second request from B should also be blocked
      const resB2 = mockResponse();
      await mw(
        mockRequest({ raw: { socket: { remoteAddress: "10.0.0.2" } } as unknown }),
        resB2,
        async () => {},
      );
      expect(resB2._status).toBe(429);
    });
  });

  describe("destroy", () => {
    it("cleans up the interval timer", () => {
      limiter = new RateLimiter();
      // Should not throw
      limiter.destroy();
      limiter.destroy(); // Idempotent
    });
  });
});
