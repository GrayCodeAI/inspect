// ============================================================================
// API Scanning Agent — OpenAPI/GraphQL security and conformance scanning
// ============================================================================

import type { Page } from "@inspect/browser";
import { safeEvaluate } from "./evaluate.js";
import type { ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface APIEndpoint {
  url: string;
  method: string;
  contentType: string;
  status?: number;
}

export interface OpenAPISpec {
  title: string;
  version: string;
  endpoints: Array<{
    path: string;
    method: string;
    parameters: string[];
    responses: string[];
  }>;
}

export interface GraphQLSchema {
  types: string[];
  queries: string[];
  mutations: string[];
  hasIntrospection: boolean;
}

export interface APIScanResult {
  endpoint: string;
  test: string;
  passed: boolean;
  severity: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Common OpenAPI spec paths to probe
// ---------------------------------------------------------------------------

const OPENAPI_PATHS = [
  "/openapi.json",
  "/swagger.json",
  "/api-docs",
  "/v2/api-docs",
  "/v3/api-docs",
  "/api/openapi.json",
  "/api/swagger.json",
  "/swagger/v1/swagger.json",
  "/api/v1/openapi.json",
];

// ---------------------------------------------------------------------------
// Common GraphQL endpoint paths to probe
// ---------------------------------------------------------------------------

const GRAPHQL_PATHS = [
  "/graphql",
  "/api/graphql",
  "/gql",
  "/api/gql",
  "/graphql/v1",
];

// ---------------------------------------------------------------------------
// GraphQL introspection query
// ---------------------------------------------------------------------------

const INTROSPECTION_QUERY = JSON.stringify({
  query: `{
    __schema {
      types { name }
      queryType { fields { name } }
      mutationType { fields { name } }
    }
  }`,
});

// ---------------------------------------------------------------------------
// 1. fetchOpenAPISpec — discover and parse OpenAPI/Swagger spec
// ---------------------------------------------------------------------------

export async function fetchOpenAPISpec(
  page: Page,
  baseUrl: string,
): Promise<OpenAPISpec | null> {
  // Normalize base URL (remove trailing slash)
  const base = baseUrl.replace(/\/+$/, "");

  for (const specPath of OPENAPI_PATHS) {
    const specUrl = base + specPath;

    const result = await safeEvaluate<{ status: number; body: string } | null>(
      page,
      `(async () => {
        try {
          const res = await fetch(${JSON.stringify(specUrl)}, {
            method: "GET",
            headers: { "Accept": "application/json" },
          });
          if (res.status !== 200) return null;
          const body = await res.text();
          return { status: res.status, body };
        } catch {
          return null;
        }
      })()`,
      null,
      15_000,
    );

    if (!result || !result.body) continue;

    // Try to parse as JSON
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(result.body) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Validate it looks like an OpenAPI/Swagger spec
    const isSwagger = typeof spec["swagger"] === "string";
    const isOpenAPI = typeof spec["openapi"] === "string";
    if (!isSwagger && !isOpenAPI) continue;

    // Extract info
    const info = (spec["info"] ?? {}) as Record<string, unknown>;
    const title = (info["title"] as string) ?? "Unknown API";
    const version = (info["version"] as string) ?? "unknown";

    // Extract endpoints from paths
    const paths = (spec["paths"] ?? {}) as Record<string, Record<string, unknown>>;
    const endpoints: OpenAPISpec["endpoints"] = [];

    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || methods === null) continue;

      for (const [method, definition] of Object.entries(methods)) {
        // Skip non-HTTP method keys like "parameters", "summary", etc.
        const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];
        if (!httpMethods.includes(method.toLowerCase())) continue;

        const def = definition as Record<string, unknown>;

        // Extract parameters
        const params: string[] = [];
        const paramList = (def["parameters"] ?? []) as Array<Record<string, unknown>>;
        for (const param of paramList) {
          const name = param["name"] as string;
          const required = param["required"] as boolean;
          if (name) {
            params.push(required ? `${name} (required)` : name);
          }
        }

        // Also extract request body parameters (OpenAPI 3.x)
        const requestBody = def["requestBody"] as Record<string, unknown> | undefined;
        if (requestBody) {
          const content = requestBody["content"] as Record<string, unknown> | undefined;
          if (content) {
            for (const [mediaType, schemaWrapper] of Object.entries(content)) {
              const wrapper = schemaWrapper as Record<string, unknown>;
              const schema = wrapper["schema"] as Record<string, unknown> | undefined;
              if (schema && schema["properties"]) {
                const props = schema["properties"] as Record<string, unknown>;
                for (const propName of Object.keys(props)) {
                  params.push(`body.${propName}`);
                }
              }
            }
          }
        }

        // Extract response codes
        const responseDefs = (def["responses"] ?? {}) as Record<string, unknown>;
        const responses = Object.keys(responseDefs);

        endpoints.push({
          path,
          method: method.toUpperCase(),
          parameters: params,
          responses,
        });
      }
    }

    return { title, version, endpoints };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. testGraphQLIntrospection — probe GraphQL endpoints
// ---------------------------------------------------------------------------

export async function testGraphQLIntrospection(
  page: Page,
  url: string,
): Promise<GraphQLSchema | null> {
  const base = url.replace(/\/+$/, "");

  for (const gqlPath of GRAPHQL_PATHS) {
    const gqlUrl = base + gqlPath;

    const result = await safeEvaluate<{ status: number; body: string } | null>(
      page,
      `(async () => {
        try {
          const res = await fetch(${JSON.stringify(gqlUrl)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: ${JSON.stringify(INTROSPECTION_QUERY)},
          });
          const body = await res.text();
          return { status: res.status, body };
        } catch {
          return null;
        }
      })()`,
      null,
      15_000,
    );

    if (!result || !result.body) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.body) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Check if it's a valid GraphQL response
    const data = parsed["data"] as Record<string, unknown> | undefined;
    const errors = parsed["errors"] as unknown[] | undefined;

    // If we get errors but no data, introspection might be disabled
    if (!data && errors) {
      return {
        types: [],
        queries: [],
        mutations: [],
        hasIntrospection: false,
      };
    }

    if (!data) continue;

    const schema = data["__schema"] as Record<string, unknown> | undefined;
    if (!schema) continue;

    // Extract types
    const typesRaw = (schema["types"] ?? []) as Array<Record<string, unknown>>;
    const types = typesRaw
      .map((t) => t["name"] as string)
      .filter((name) => name && !name.startsWith("__"));

    // Extract query fields
    const queryType = schema["queryType"] as Record<string, unknown> | undefined;
    const queryFields = (queryType?.["fields"] ?? []) as Array<Record<string, unknown>>;
    const queries = queryFields
      .map((f) => f["name"] as string)
      .filter(Boolean);

    // Extract mutation fields
    const mutationType = schema["mutationType"] as Record<string, unknown> | undefined;
    const mutationFields = (mutationType?.["fields"] ?? []) as Array<Record<string, unknown>>;
    const mutations = mutationFields
      .map((f) => f["name"] as string)
      .filter(Boolean);

    return {
      types,
      queries,
      mutations,
      hasIntrospection: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. scanOpenAPIEndpoints — security & conformance tests for REST endpoints
// ---------------------------------------------------------------------------

export async function scanOpenAPIEndpoints(
  page: Page,
  spec: OpenAPISpec,
  baseUrl: string,
  onProgress: ProgressCallback,
): Promise<APIScanResult[]> {
  const results: APIScanResult[] = [];
  const base = baseUrl.replace(/\/+$/, "");
  const total = spec.endpoints.length;
  let current = 0;

  for (const endpoint of spec.endpoints) {
    current++;
    onProgress(
      "step",
      `  Testing endpoint ${current}/${total}: ${endpoint.method} ${endpoint.path}`,
    );

    const fullUrl = base + endpoint.path;

    // --- Test 1: Missing required parameters should return 400, not 500 ---
    const requiredParams = endpoint.parameters.filter((p) => p.includes("(required)"));

    if (requiredParams.length > 0) {
      const missingParamResult = await safeEvaluate<{ status: number } | null>(
        page,
        `(async () => {
          try {
            const res = await fetch(${JSON.stringify(fullUrl)}, {
              method: ${JSON.stringify(endpoint.method)},
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
            });
            return { status: res.status };
          } catch {
            return null;
          }
        })()`,
        null,
        10_000,
      );

      if (missingParamResult) {
        const status = missingParamResult.status;
        if (status >= 500) {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Missing required parameters",
            passed: false,
            severity: "high",
            details: `Server returned ${status} instead of 400 when required parameters were omitted. ` +
              `Required: ${requiredParams.join(", ")}. ` +
              `The server should validate input and return 400 Bad Request.`,
          });
        } else if (status === 400 || status === 422) {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Missing required parameters",
            passed: true,
            severity: "info",
            details: `Server correctly returned ${status} when required parameters were omitted.`,
          });
        } else if (status === 401 || status === 403) {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Missing required parameters",
            passed: true,
            severity: "info",
            details: `Server returned ${status} (auth required) — parameter validation could not be tested.`,
          });
        }
      }
    }

    // --- Test 2: Wrong types should return 400, not 500 ---
    if (endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "PATCH") {
      const wrongTypeResult = await safeEvaluate<{ status: number } | null>(
        page,
        `(async () => {
          try {
            const res = await fetch(${JSON.stringify(fullUrl)}, {
              method: ${JSON.stringify(endpoint.method)},
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ _invalid_type_test: "not_a_number", count: "should_be_int", enabled: "not_bool" }),
            });
            return { status: res.status };
          } catch {
            return null;
          }
        })()`,
        null,
        10_000,
      );

      if (wrongTypeResult) {
        const status = wrongTypeResult.status;
        if (status >= 500) {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Wrong parameter types",
            passed: false,
            severity: "medium",
            details: `Server returned ${status} when given wrong types in request body. ` +
              `The server should validate types and return 400 Bad Request.`,
          });
        } else {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Wrong parameter types",
            passed: true,
            severity: "info",
            details: `Server returned ${status} when given wrong types — no unhandled error.`,
          });
        }
      }
    }

    // --- Test 3: Extra-long strings should not crash the server ---
    if (endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "PATCH") {
      const longString = "A".repeat(100_000);
      const longStringPayload = JSON.stringify({ data: longString, name: longString });

      const overflowResult = await safeEvaluate<{ status: number } | null>(
        page,
        `(async () => {
          try {
            const res = await fetch(${JSON.stringify(fullUrl)}, {
              method: ${JSON.stringify(endpoint.method)},
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: ${JSON.stringify(longStringPayload)},
            });
            return { status: res.status };
          } catch {
            return null;
          }
        })()`,
        null,
        15_000,
      );

      if (overflowResult) {
        const status = overflowResult.status;
        if (status >= 500) {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Extra-long string input",
            passed: false,
            severity: "medium",
            details: `Server returned ${status} when given a 100K character string payload. ` +
              `The server should enforce payload size limits and return 400 or 413.`,
          });
        } else {
          results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            test: "Extra-long string input",
            passed: true,
            severity: "info",
            details: `Server returned ${status} for oversized payload — handled gracefully.`,
          });
        }
      }
    }

    // --- Test 4: Auth-protected endpoints without auth should return 401/403 ---
    const authTestResult = await safeEvaluate<{ status: number } | null>(
      page,
      `(async () => {
        try {
          const res = await fetch(${JSON.stringify(fullUrl)}, {
            method: ${JSON.stringify(endpoint.method)},
            headers: { "Accept": "application/json" },
            credentials: "omit",
          });
          return { status: res.status };
        } catch {
          return null;
        }
      })()`,
      null,
      10_000,
    );

    if (authTestResult) {
      const status = authTestResult.status;
      // If endpoint returns 200 without auth, it might be an open endpoint
      // Check if responses list suggests auth is expected (401/403 in spec)
      const expectsAuth =
        endpoint.responses.includes("401") || endpoint.responses.includes("403");

      if (expectsAuth && status === 200) {
        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          test: "Authentication enforcement",
          passed: false,
          severity: "high",
          details: `Endpoint returned 200 without authentication, but the spec defines ` +
            `401/403 responses. The endpoint may be missing auth middleware.`,
        });
      } else if (status === 401 || status === 403) {
        results.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          test: "Authentication enforcement",
          passed: true,
          severity: "info",
          details: `Endpoint correctly returned ${status} without authentication.`,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. scanGraphQLSecurity — security tests for GraphQL endpoints
// ---------------------------------------------------------------------------

export async function scanGraphQLSecurity(
  page: Page,
  url: string,
  onProgress: ProgressCallback,
): Promise<APIScanResult[]> {
  const results: APIScanResult[] = [];
  const base = url.replace(/\/+$/, "");

  // Find the active GraphQL endpoint
  let activeGqlUrl: string | null = null;
  for (const gqlPath of GRAPHQL_PATHS) {
    const gqlUrl = base + gqlPath;
    const probe = await safeEvaluate<boolean>(
      page,
      `(async () => {
        try {
          const res = await fetch(${JSON.stringify(gqlUrl)}, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "{ __typename }" }),
          });
          return res.status < 500;
        } catch {
          return false;
        }
      })()`,
      false,
      10_000,
    );

    if (probe) {
      activeGqlUrl = gqlUrl;
      break;
    }
  }

  if (!activeGqlUrl) {
    onProgress("info", "  No active GraphQL endpoint found");
    return results;
  }

  onProgress("step", `  Found GraphQL endpoint: ${activeGqlUrl}`);

  // --- Test 1: Introspection enabled in production ---
  onProgress("step", "  Testing introspection access...");
  const introspectionResult = await safeEvaluate<{ hasData: boolean; status: number } | null>(
    page,
    `(async () => {
      try {
        const res = await fetch(${JSON.stringify(activeGqlUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: ${JSON.stringify(INTROSPECTION_QUERY)},
        });
        const body = await res.json();
        const hasData = !!(body.data && body.data.__schema);
        return { hasData, status: res.status };
      } catch {
        return null;
      }
    })()`,
    null,
    10_000,
  );

  if (introspectionResult) {
    if (introspectionResult.hasData) {
      results.push({
        endpoint: activeGqlUrl,
        test: "Introspection enabled",
        passed: false,
        severity: "medium",
        details: "GraphQL introspection is enabled. In production, introspection should be " +
          "disabled to prevent attackers from discovering the entire API schema. " +
          "Disable introspection in your GraphQL server configuration.",
      });
    } else {
      results.push({
        endpoint: activeGqlUrl,
        test: "Introspection enabled",
        passed: true,
        severity: "info",
        details: "GraphQL introspection is disabled — the schema is not exposed.",
      });
    }
  }

  // --- Test 2: Query depth attack ---
  onProgress("step", "  Testing query depth limits...");

  // Build a deeply nested query (20 levels)
  let deepQuery = "{ __typename ";
  let closeParens = " }";
  for (let i = 0; i < 20; i++) {
    deepQuery += `... on Query { __typename `;
    closeParens += " }";
  }
  deepQuery += closeParens;

  const depthResult = await safeEvaluate<{ status: number; hasErrors: boolean; errorMessage: string } | null>(
    page,
    `(async () => {
      try {
        const res = await fetch(${JSON.stringify(activeGqlUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ query: ${JSON.stringify(deepQuery)} }),
        });
        const body = await res.json();
        const errors = body.errors || [];
        const hasErrors = errors.length > 0;
        const errorMessage = hasErrors ? (errors[0].message || "") : "";
        return { status: res.status, hasErrors, errorMessage };
      } catch {
        return null;
      }
    })()`,
    null,
    15_000,
  );

  if (depthResult) {
    const depthRejected =
      depthResult.status === 400 ||
      depthResult.status === 429 ||
      (depthResult.hasErrors &&
        (depthResult.errorMessage.toLowerCase().includes("depth") ||
          depthResult.errorMessage.toLowerCase().includes("complexity") ||
          depthResult.errorMessage.toLowerCase().includes("too many")));

    if (depthRejected) {
      results.push({
        endpoint: activeGqlUrl,
        test: "Query depth limit",
        passed: true,
        severity: "info",
        details: `Deeply nested query was rejected (status ${depthResult.status}). ` +
          `Server enforces query depth limits.`,
      });
    } else {
      results.push({
        endpoint: activeGqlUrl,
        test: "Query depth limit",
        passed: false,
        severity: "medium",
        details: "Deeply nested query (20 levels) was accepted. The server should enforce " +
          "query depth limits to prevent resource exhaustion attacks. Consider using " +
          "graphql-depth-limit or equivalent middleware.",
      });
    }
  }

  // --- Test 3: Batch query attack ---
  onProgress("step", "  Testing batch query limits...");

  // Send 50 queries in a single batch
  const batchQueries = Array.from({ length: 50 }, (_, i) => ({
    query: `{ __typename }`,
    operationName: null,
  }));

  const batchResult = await safeEvaluate<{ status: number; responseCount: number } | null>(
    page,
    `(async () => {
      try {
        const res = await fetch(${JSON.stringify(activeGqlUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: ${JSON.stringify(JSON.stringify(batchQueries))},
        });
        const body = await res.json();
        const responseCount = Array.isArray(body) ? body.length : 1;
        return { status: res.status, responseCount };
      } catch {
        return null;
      }
    })()`,
    null,
    15_000,
  );

  if (batchResult) {
    const batchRejected =
      batchResult.status === 400 ||
      batchResult.status === 429 ||
      batchResult.responseCount < 50;

    if (batchRejected) {
      results.push({
        endpoint: activeGqlUrl,
        test: "Batch query limit",
        passed: true,
        severity: "info",
        details: `Batch of 50 queries was limited or rejected (status ${batchResult.status}, ` +
          `${batchResult.responseCount} response(s)). Server enforces batch limits.`,
      });
    } else {
      results.push({
        endpoint: activeGqlUrl,
        test: "Batch query limit",
        passed: false,
        severity: "medium",
        details: `Batch of 50 queries was fully executed (${batchResult.responseCount} responses). ` +
          "The server should enforce batch query limits to prevent denial-of-service. " +
          "Consider limiting the number of operations per request.",
      });
    }
  }

  // --- Test 4: Field suggestion exposure ---
  onProgress("step", "  Testing field suggestion exposure...");

  const suggestionResult = await safeEvaluate<{ hasErrors: boolean; errorMessage: string; hasSuggestion: boolean } | null>(
    page,
    `(async () => {
      try {
        const res = await fetch(${JSON.stringify(activeGqlUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ query: "{ nonExistentFieldXyz123 }" }),
        });
        const body = await res.json();
        const errors = body.errors || [];
        const hasErrors = errors.length > 0;
        const errorMessage = hasErrors ? JSON.stringify(errors) : "";
        const hasSuggestion = errorMessage.toLowerCase().includes("did you mean") ||
          errorMessage.toLowerCase().includes("suggestion") ||
          errorMessage.toLowerCase().includes("similar");
        return { hasErrors, errorMessage: errorMessage.slice(0, 500), hasSuggestion };
      } catch {
        return null;
      }
    })()`,
    null,
    10_000,
  );

  if (suggestionResult && suggestionResult.hasErrors) {
    if (suggestionResult.hasSuggestion) {
      results.push({
        endpoint: activeGqlUrl,
        test: "Field suggestion exposure",
        passed: false,
        severity: "low",
        details: "GraphQL error messages include field suggestions (e.g., 'Did you mean...'). " +
          "This reveals schema information to attackers through error messages. " +
          "Consider disabling field suggestions in production.",
      });
    } else {
      results.push({
        endpoint: activeGqlUrl,
        test: "Field suggestion exposure",
        passed: true,
        severity: "info",
        details: "GraphQL error messages do not include field suggestions — schema is not " +
          "leaked through error messages.",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. runAPIScan — full orchestrated scan
// ---------------------------------------------------------------------------

export async function runAPIScan(
  page: Page,
  url: string,
  onProgress: ProgressCallback,
): Promise<APIScanResult[]> {
  onProgress("info", "Starting API security & conformance scan...");

  const allResults: APIScanResult[] = [];

  // --- Phase 1: Try OpenAPI spec discovery ---
  onProgress("step", "Phase 1: Discovering OpenAPI/Swagger specification...");
  const openAPISpec = await fetchOpenAPISpec(page, url);

  if (openAPISpec) {
    onProgress(
      "pass",
      `  Found OpenAPI spec: "${openAPISpec.title}" v${openAPISpec.version} ` +
        `(${openAPISpec.endpoints.length} endpoints)`,
    );

    // Scan OpenAPI endpoints
    onProgress("step", "  Running endpoint conformance tests...");
    const openAPIResults = await scanOpenAPIEndpoints(page, openAPISpec, url, onProgress);
    allResults.push(...openAPIResults);

    const openAPIPassed = openAPIResults.filter((r) => r.passed).length;
    const openAPIFailed = openAPIResults.length - openAPIPassed;
    if (openAPIFailed > 0) {
      onProgress("warn", `  OpenAPI scan: ${openAPIPassed} passed, ${openAPIFailed} failed`);
    } else {
      onProgress("pass", `  OpenAPI scan: all ${openAPIPassed} test(s) passed`);
    }
  } else {
    onProgress("info", "  No OpenAPI/Swagger spec found");
  }

  // --- Phase 2: Try GraphQL discovery ---
  onProgress("step", "Phase 2: Probing for GraphQL endpoints...");
  const gqlSchema = await testGraphQLIntrospection(page, url);

  if (gqlSchema) {
    if (gqlSchema.hasIntrospection) {
      onProgress(
        "warn",
        `  Found GraphQL endpoint with introspection enabled ` +
          `(${gqlSchema.types.length} types, ${gqlSchema.queries.length} queries, ` +
          `${gqlSchema.mutations.length} mutations)`,
      );
    } else {
      onProgress("pass", "  Found GraphQL endpoint (introspection disabled)");
    }

    // Run GraphQL security tests
    onProgress("step", "  Running GraphQL security tests...");
    const gqlResults = await scanGraphQLSecurity(page, url, onProgress);
    allResults.push(...gqlResults);

    const gqlPassed = gqlResults.filter((r) => r.passed).length;
    const gqlFailed = gqlResults.length - gqlPassed;
    if (gqlFailed > 0) {
      onProgress("warn", `  GraphQL scan: ${gqlPassed} passed, ${gqlFailed} failed`);
    } else if (gqlResults.length > 0) {
      onProgress("pass", `  GraphQL scan: all ${gqlPassed} test(s) passed`);
    }
  } else {
    onProgress("info", "  No GraphQL endpoint found");
  }

  // --- Phase 3: Generic API discovery from network traffic ---
  onProgress("step", "Phase 3: Discovering API endpoints from network traffic...");

  // Navigate to the page and capture network traffic
  const discoveredEndpoints = await discoverEndpointsFromTraffic(page, url);

  if (discoveredEndpoints.length > 0) {
    onProgress(
      "info",
      `  Discovered ${discoveredEndpoints.length} API endpoint(s) from network traffic`,
    );

    // Run basic checks on discovered endpoints
    for (const ep of discoveredEndpoints) {
      // Check for missing auth on API endpoints
      if (ep.status && ep.status === 200 && isApiPath(ep.url)) {
        const noAuthResult = await safeEvaluate<{ status: number } | null>(
          page,
          `(async () => {
            try {
              const res = await fetch(${JSON.stringify(ep.url)}, {
                method: ${JSON.stringify(ep.method)},
                headers: { "Accept": "application/json" },
                credentials: "omit",
              });
              return { status: res.status };
            } catch {
              return null;
            }
          })()`,
          null,
          10_000,
        );

        if (noAuthResult && noAuthResult.status === 200) {
          allResults.push({
            endpoint: `${ep.method} ${truncateUrl(ep.url)}`,
            test: "Unauthenticated API access",
            passed: false,
            severity: "medium",
            details: `API endpoint returns 200 without credentials. ` +
              `Verify this endpoint should be publicly accessible.`,
          });
        }
      }

      // Check for sensitive data in response headers
      if (ep.status && ep.status < 400) {
        const headerCheck = await safeEvaluate<{ server: string | null; poweredBy: string | null } | null>(
          page,
          `(async () => {
            try {
              const res = await fetch(${JSON.stringify(ep.url)}, {
                method: "HEAD",
                credentials: "omit",
              });
              return {
                server: res.headers.get("server"),
                poweredBy: res.headers.get("x-powered-by"),
              };
            } catch {
              return null;
            }
          })()`,
          null,
          10_000,
        );

        if (headerCheck) {
          if (headerCheck.poweredBy) {
            allResults.push({
              endpoint: `${ep.method} ${truncateUrl(ep.url)}`,
              test: "Server technology exposure",
              passed: false,
              severity: "low",
              details: `X-Powered-By header exposes server technology: "${headerCheck.poweredBy}". ` +
                `Remove this header to reduce information leakage.`,
            });
          }
        }
      }
    }
  } else {
    onProgress("info", "  No API endpoints discovered from network traffic");
  }

  // --- Summary ---
  const totalPassed = allResults.filter((r) => r.passed).length;
  const totalFailed = allResults.length - totalPassed;

  if (allResults.length === 0) {
    onProgress("info", "No API endpoints found to scan.");
  } else if (totalFailed === 0) {
    onProgress("pass", `API scan complete: all ${totalPassed} test(s) passed`);
  } else {
    onProgress(
      "warn",
      `API scan complete: ${totalPassed} passed, ${totalFailed} failed out of ${allResults.length} test(s)`,
    );
  }

  onProgress("done", "API security & conformance scan finished");

  return allResults;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Discover API endpoints by navigating to the page and monitoring network
 * traffic for XHR/fetch requests.
 */
async function discoverEndpointsFromTraffic(
  page: Page,
  url: string,
): Promise<APIEndpoint[]> {
  const endpoints: APIEndpoint[] = [];
  const seen = new Set<string>();

  /** File extensions indicating static assets */
  const STATIC_PATTERN =
    /\.(js|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|map|mp4|webm|ogg|mp3|wav|pdf|zip|wasm)(\?|#|$)/i;

  // Set up response listener before navigation
  const onResponse = (response: any): void => {
    try {
      const resUrl = response.url() as string;
      const status = response.status() as number;

      if (STATIC_PATTERN.test(resUrl)) return;

      // Get content type from headers
      let contentType = "";
      try {
        const headers = response.headers() as Record<string, string>;
        contentType = headers["content-type"] ?? headers["Content-Type"] ?? "";
      } catch {
        // Headers unavailable
      }

      const isApiLike =
        contentType.includes("json") ||
        contentType.includes("xml") ||
        contentType.includes("graphql") ||
        contentType.includes("text/plain");

      if (!isApiLike && contentType !== "") return;

      // Find matching request method
      let method = "GET";
      try {
        const request = response.request();
        method = request.method() as string;
      } catch {
        // Use default GET
      }

      // Deduplicate by method + pathname
      let dedupeKey: string;
      try {
        const parsed = new URL(resUrl);
        dedupeKey = `${method}:${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
      } catch {
        dedupeKey = `${method}:${resUrl}`;
      }

      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      endpoints.push({ url: resUrl, method, contentType, status });
    } catch {
      // Skip problematic responses
    }
  };

  page.on("response", onResponse);

  // Navigate to trigger network requests
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    } catch {
      // Continue with whatever loaded
    }
  }

  // Wait for additional async API calls
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  // Clean up listener
  try {
    page.removeListener("response", onResponse);
  } catch {
    // Listener removal may fail if page is closed
  }

  return endpoints;
}

/**
 * Check if a URL path looks like an API endpoint.
 */
function isApiPath(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.includes("/api/") ||
      path.includes("/api-") ||
      path.startsWith("/v1/") ||
      path.startsWith("/v2/") ||
      path.startsWith("/v3/") ||
      path.includes("/graphql") ||
      path.includes("/rest/") ||
      path.includes("/rpc/")
    );
  } catch {
    return false;
  }
}

/**
 * Truncate a URL for display in scan results.
 */
function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    return path.length > 80 ? path.slice(0, 77) + "..." : path;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + "..." : url;
  }
}
