// @inspect/mocking — Network and WebSocket mocking
// Split from @inspect/quality to follow Single Responsibility Principle

export {
  NetworkInterceptor,
  type InterceptorOptions,
  type InterceptedRequest,
} from "./mocking/interceptor.js";
export {
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
  type MockHandler,
  type MockRequest,
  type MockResponse,
  type HandlerFn,
} from "./mocking/handlers.js";
export { MockGenerator } from "./mocking/generators.js";
export { FakeData } from "./mocking/faker.js";
export {
  ws,
  WsMockBuilder,
  WsHandlerBuilder,
  WsMessageMatcher,
  MockWsConnection,
  WsRecorder,
  type WsMessageHandlerFn,
} from "./mocking/ws.js";
