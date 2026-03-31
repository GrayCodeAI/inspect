import { describe, it, expect } from "vitest";
import {
  rest,
  graphql,
  response,
  HttpResponse,
  delay,
  passthrough,
  isPassthrough,
  matchUrl,
  parseQuery,
  parseGraphQLOperation,
} from "./handlers.js";

describe("HttpResponse", () => {
  it("creates JSON response", () => {
    const res = HttpResponse.json({ name: "Alice" });
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.body).toEqual({ name: "Alice" });
  });

  it("creates JSON with custom status", () => {
    const res = HttpResponse.json({ error: "Not found" }, { status: 404 });
    expect(res.status).toBe(404);
  });

  it("creates text response", () => {
    const res = HttpResponse.text("hello");
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/plain");
    expect(res.body).toBe("hello");
  });

  it("creates HTML response", () => {
    const res = HttpResponse.html("<h1>Hi</h1>");
    expect(res.headers["Content-Type"]).toBe("text/html");
  });

  it("creates XML response", () => {
    const res = HttpResponse.xml("<root/>");
    expect(res.headers["Content-Type"]).toBe("application/xml");
  });

  it("creates error response", () => {
    const res = HttpResponse.error();
    expect(res.status).toBe(500);
    expect(res.body).toBeNull();
  });

  it("creates error with custom status", () => {
    const res = HttpResponse.error({ status: 503 });
    expect(res.status).toBe(503);
  });
});

describe("delay", () => {
  it("resolves after specified ms", async () => {
    const start = Date.now();
    await delay(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("resolves with random delay when no arg", async () => {
    const start = Date.now();
    await delay();
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
  });
});

describe("passthrough", () => {
  it("creates a passthrough response", () => {
    const res = passthrough();
    expect(isPassthrough(res)).toBe(true);
  });

  it("normal responses are not passthrough", () => {
    const res = HttpResponse.json({});
    expect(isPassthrough(res)).toBe(false);
  });

  it("response() helper is not passthrough", () => {
    const res = response(200, "ok");
    expect(isPassthrough(res)).toBe(false);
  });
});

describe("rest handlers", () => {
  it("creates GET handler", () => {
    const handler = rest.get("/api/users", () => HttpResponse.json([]));
    expect(handler.type).toBe("rest");
    expect(handler.method).toBe("GET");
    expect(handler.pattern).toBe("/api/users");
    expect(handler.callCount).toBe(0);
  });

  it("creates POST handler", () => {
    const handler = rest.post("/api/users", () => HttpResponse.json({}));
    expect(handler.method).toBe("POST");
  });

  it("creates all-method handler", () => {
    const handler = rest.all("/api/*", () => HttpResponse.json({}));
    expect(handler.method).toBe("*");
  });
});

describe("graphql handlers", () => {
  it("creates query handler", () => {
    const handler = graphql.query("GetUser", () => HttpResponse.json({ data: {} }));
    expect(handler.type).toBe("graphql");
    expect(handler.pattern).toBe("GetUser");
  });

  it("creates mutation handler", () => {
    const handler = graphql.mutation("CreateUser", () => HttpResponse.json({ data: {} }));
    expect(handler.pattern).toBe("CreateUser");
  });

  it("creates wildcard operation handler", () => {
    const handler = graphql.operation(() => HttpResponse.json({ data: {} }));
    expect(handler.pattern).toBe("*");
  });
});

describe("matchUrl", () => {
  it("matches exact paths", () => {
    expect(matchUrl("/api/users", "/api/users").matched).toBe(true);
  });

  it("rejects different paths", () => {
    expect(matchUrl("/api/users", "/api/posts").matched).toBe(false);
  });

  it("extracts path params", () => {
    const result = matchUrl("/api/users/:id", "/api/users/123");
    expect(result.matched).toBe(true);
    expect(result.params.id).toBe("123");
  });

  it("extracts multiple params", () => {
    const result = matchUrl("/api/users/:userId/posts/:postId", "/api/users/1/posts/42");
    expect(result.matched).toBe(true);
    expect(result.params.userId).toBe("1");
    expect(result.params.postId).toBe("42");
  });

  it("matches wildcard", () => {
    expect(matchUrl("*", "/anything").matched).toBe(true);
  });

  it("matches glob patterns", () => {
    expect(matchUrl("/api/*", "/api/users").matched).toBe(true);
  });
});

describe("parseQuery", () => {
  it("parses query parameters", () => {
    const q = parseQuery("http://localhost/api?page=1&limit=10");
    expect(q.page).toBe("1");
    expect(q.limit).toBe("10");
  });

  it("returns empty for no query", () => {
    expect(parseQuery("http://localhost/api")).toEqual({});
  });
});

describe("parseGraphQLOperation", () => {
  it("extracts operation name from body", () => {
    const result = parseGraphQLOperation({
      query: "query GetUser($id: ID!) { user(id: $id) { name } }",
      variables: { id: "1" },
    });
    expect(result?.operationName).toBe("GetUser");
    expect(result?.variables?.id).toBe("1");
  });

  it("uses explicit operationName", () => {
    const result = parseGraphQLOperation({
      query: "{ user { name } }",
      operationName: "MyQuery",
    });
    expect(result?.operationName).toBe("MyQuery");
  });

  it("returns null for non-GraphQL body", () => {
    expect(parseGraphQLOperation({ name: "not graphql" })).toBeNull();
    expect(parseGraphQLOperation(null)).toBeNull();
  });
});
