// ──────────────────────────────────────────────────────────────────────────────
// @inspect/mocking - HTTP/WebSocket mocking utilities
// ──────────────────────────────────────────────────────────────────────────────

// HTTP Mocking
export {
  type MockRequest,
  type MockResponse,
  type HandlerFn,
  type MockHandler,
  response,
  HttpResponse,
  delay,
  passthrough,
  isPassthrough,
  rest,
  graphql,
  matchUrl,
  parseQuery,
  parseGraphQLOperation,
} from "./mocking/handlers.js";

// WebSocket Mocking
export {
  type WsMessageHandlerFn,
  WsMockBuilder,
  WsHandlerBuilder,
  ws,
  WsMessageMatcher,
  MockWsConnection,
  WsRecorder,
} from "./mocking/ws.js";

// Network Interception
export {
  type InterceptorOptions,
  type InterceptedRequest,
  NetworkInterceptor,
} from "./mocking/interceptor.js";

// Data Generation
export { FakeData } from "./mocking/faker.js";
export { MockGenerator } from "./mocking/generators.js";
