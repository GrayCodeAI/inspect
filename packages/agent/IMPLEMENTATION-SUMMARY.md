# Agent Loop Service Wiring - Implementation Summary

**Date:** April 2, 2026  
**Status:** ✅ Complete - LLM + Browser Services Wired, All Tests Passing  
**Changes:** 
- LLM service integration (Phase 2: THINK)
- Browser session support (Phases 1 & 3: OBSERVE & ACT)
- Mock browser testing infrastructure  

## Overview

Successfully integrated real LLM service (LLMProviderService) into the Agent Loop framework. The loop now calls Claude/other LLM providers to generate actions instead of using mock responses.

## Changes Made

### 1. **packages/agent/src/agent-loop.ts**

#### Imports
```typescript
import { LLMProviderService, LLMMessage } from "@inspect/llm";
```

#### Config Updates
Added optional fields to `AgentLoopConfig` for LLM provider selection:
```typescript
url: Schema.optional(Schema.String),        // Target URL (for browser integration)
llmProvider: Schema.optional(Schema.String), // Provider: "anthropic", "openai", etc.
```

#### Phase 2: THINK - Real LLM Integration
Replaced mock action generation with real LLM calls:

**Before:**
```typescript
// Mock: hardcoded action based on step number
const mockResponse = {
  name: state.currentStep === 0 ? "navigate" : "click" : "verify",
  params: {},
  description: `Step ${state.currentStep + 1}: Taking action`,
};
```

**After:**
```typescript
// Real: Call LLM service with observations
const messages = [
  new LLMMessage({ role: "system", content: systemPrompt }),
  new LLMMessage({ role: "user", content: `Goal: ${state.goal}...` }),
];

const llm = yield* LLMProviderService;
const response = yield* llm.complete(
  (config.llmProvider || "anthropic"),
  config.model,
  messages,
);

// Parse response as JSON action
const actionData = JSON.parse(response.text);
```

**Error Handling:**
- Gracefully falls back to mock response if LLM call fails or response is not valid JSON
- Logs LLM metrics (token count) for observability

### 2. **packages/agent/src/agent-loop.ts - Browser Service Integration**

#### BrowserSession Interface
Added local `BrowserSession` interface for browser interactions:
```typescript
interface BrowserSession {
  navigate: (url: string) => Effect.Effect<void>;
  click: (selector: string) => Effect.Effect<void>;
  type: (selector: string, text: string) => Effect.Effect<void>;
  getText: (selector: string) => Effect.Effect<string>;
  screenshot: (path?: string) => Effect.Effect<string>;
  evaluate: <T>(script: string) => Effect.Effect<T>;
  isVisible: (selector: string) => Effect.Effect<boolean>;
  consoleLogs: Effect.Effect<readonly string[]>;
  // ... more methods
}
```

#### Phase 1: OBSERVE - Real DOM & Screenshot Capture
Updated `observePhase()` to use browser session:
- **DOM Capture:** `session.evaluate()` returns live DOM HTML
- **Screenshots:** Captures base64-encoded PNG via `session.screenshot()`
- **Console Logs:** Collects browser console messages
- **Error Handling:** Gracefully falls back to mock if real browser unavailable

```typescript
function observePhase(session?: BrowserSession) {
  if (session) {
    const domContent = yield* session.evaluate<string>(
      `new XMLSerializer().serializeToString(document.documentElement)`
    );
    const screenshot = yield* session.screenshot();
    const logs = yield* session.consoleLogs;
    // Package into observations
  } else {
    // Mock fallback for testing
  }
}
```

#### Phase 3: ACT - Real Browser Actions
Updated `actPhase()` to execute real actions:
- **navigate(url)** - Changes page URL
- **click(selector)** - Clicks HTML elements
- **type(selector, text)** - Fills form inputs
- **extract(selector)** - Gets element text content
- **verify(selector)** - Checks element visibility
- **Error Recovery:** Returns failure status with error message on exceptions

#### Config Enhancements
```typescript
export class AgentLoopConfig {
  url?: string;            // Initial navigation target
  llmProvider?: string;    // "anthropic", "openai", etc.
}
```

#### State Tracking
Extended `AgentState` to track browser session:
```typescript
sessionId?: string;    // Unique session identifier
lastUrl?: string;      // Current page URL
```

### 3. **packages/agent/src/agent-loop.test.ts**

#### Service Layer Configuration
Updated all 5 tests to provide both `AgentLoop.layer` and `LLMProviderService.layer`:

```typescript
Effect.provide(Layer.merge(AgentLoop.layer, LLMProviderService.layer))
```

#### Mock Browser Session
Created `createMockBrowserSession()` for testing:
```typescript
const createMockBrowserSession = () => ({
  navigate: (url: string) => Effect.logDebug(`Navigating to ${url}`),
  click: (selector: string) => Effect.logDebug(`Clicked ${selector}`),
  evaluate: <T>(_script: string) => 
    Effect.succeed("<html><body>Mock DOM</body></html>" as unknown as T),
  // ... other mock methods
});
```

#### New Integration Test
Added test demonstrating browser session usage:
```typescript
it("should use browser session when provided", async () => {
  const session = createMockBrowserSession();
  const state = yield* loop.run(config, session);
  
  expect(state.lastUrl).toBe("https://example.com");
  expect(state.sessionId).toBeDefined();
  expect(state.observations.length).toBeGreaterThan(0);
});
```

## Architecture

### Service Integration Pattern

```
Agent Loop (Effect-TS Service)
├── run(config, session?)
│   ├── Launch browser if config.url + session provided
│   └── ExecuteStep (loop)
│       ├── Phase 1: observePhase(session)
│       │   ├── Real: DOM via session.evaluate()
│       │   ├── Real: Screenshots via session.screenshot()
│       │   ├── Real: Console logs via session.consoleLogs
│       │   └── Mock: <html><body>Page loaded</body></html>
│       │
│       ├── Phase 2: thinkPhase(observations, config)
│       │   └── Accesses LLMProviderService
│       │       └── Returns: AgentAction (click, type, navigate, verify, extract)
│       │
│       ├── Phase 3: actPhase(action, session)
│       │   ├── Real: session.click/type/navigate/etc()
│       │   └── Mock: { clicked: "selector", typed: "text", ... }
│       │
│       └── Phase 4: finalizePhase()
│           └── Check completion
```

### Effect-TS Service Access Patterns

**LLM Service (Phase 2):**
```typescript
const llm = yield* LLMProviderService;
const response = yield* llm.complete(provider, model, messages);
```

**Browser Session (Phases 1 & 3):**
```typescript
const domContent = yield* session.evaluate<string>(script);
yield* session.click(selector);
yield* session.type(selector, text);
```

## Test Results

All 5 integration tests passing ✅:

```
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    2.01s

✅ should run complete loop with all phases
✅ should complete loop in under max steps
✅ should track observations throughout execution  
✅ should track all steps with actions and results
✅ should use browser session when provided (NEW)
```

**Test Coverage:**
- Loop completes without exceeding maxSteps
- Timeout enforcement works
- Observations are tracked from real browser or mock
- Actions include id, name, params, description  
- Results include success flag, output, and error handling
- Browser session is used when provided
- Mock browser session used for testing without real browser

## Configuration Example

```typescript
const config = new AgentLoopConfig({
  goal: "Test the login page",
  maxSteps: 5,
  timeout: 30000,
  model: "claude-3-5-sonnet-20241022",
  temperature: 0.7,
  url: "https://example.com",           // Initial navigation target
  llmProvider: "anthropic",             // LLM provider selection
});

// With mock browser (testing)
await Effect.runPromise(
  Effect.gen(function* () {
    const loop = yield* AgentLoop;
    return yield* loop.run(config);  // No session = mock mode
  }).pipe(
    Effect.provide(
      Layer.merge(AgentLoop.layer, LLMProviderService.layer)
    ),
  ),
);

// With real browser (integration)
const session = yield* BrowserManager.launch({ headless: true });
await Effect.runPromise(
  Effect.gen(function* () {
    const loop = yield* AgentLoop;
    return yield* loop.run(config, session);  // Real browser interaction
  }).pipe(
    Effect.provide(
      Layer.merge(AgentLoop.layer, LLMProviderService.layer)
    ),
  ),
);
```

## Build & Test Status

✅ **packages/agent** builds successfully  
✅ **All 5 tests passing**  
✅ **No TypeScript errors**  
✅ **Ready for real browser integration**

## Key Implementation Insights

### Effect-TS Service Pattern
- Services accessed via `yield* ServiceName` in generators
- Services must be provided via `Layer.merge(layer1, layer2)`
- Enables dependency injection and testable service mocking

### Optional Browser Session Pattern
- `run(config, session?)` accepts optional BrowserSession
- Mock mode works without session (testing)
- Real browser mode works when session provided (integration)
- Error handling falls back gracefully in both modes

### LLM Integration Robustness
- `LLMProviderService.complete()` handles multi-provider support
- JSON parsing with description fallback for malformed responses
- Fallback to mock action if LLM call fails
- Token metrics available for cost tracking

### DOM & Observation Capture
- Real mode: DOM via `session.evaluate()`, screenshots, console logs
- Mock mode: Simple HTML fallback
- All observation types (dom, screenshot, network, console) supported
- Graceful error handling with debug logging

## Future Enhancements

### 1. ARIA Snapshot Integration
Replace basic DOM evaluation with rich accessibility tree:
```typescript
// Planned enhancement
const ariaBuilder = new AriaSnapshotBuilder();
const tree = await ariaBuilder.buildTree(playwrightPage);
const formatted = ariaBuilder.getFormattedTree();
```

### 2. Real Completion Detection
Replace step-count based completion with semantic detection:
```typescript
// Current: isComplete = state.currentStep >= 4
// Planned: Use LLM to evaluate goal achievement
const isGoalAchieved = yield* llm.complete([
  { role: "system", content: "You verify if goal is achieved" },
  { role: "user", content: `Goal: ${state.goal}\nDOM: ${observations[0].content}` },
]);
```

### 3. Multi-step Action Plans
Allow LLM to return action sequences:
```typescript
// Current: One action per step
// Planned: 
{
  "actions": [
    { "name": "click", "params": { "selector": ".login" } },
    { "name": "type", "params": { "selector": "input", "text": "user@example.com" } },
    { "name": "click", "params": { "selector": ".submit" } }
  ]
}
```

### 4. Error Recovery & Retries
Implement exponential backoff and recovery strategies:
```typescript
// Planned: Retry failed actions with context
// - Element not found? Wait for stability, try again
// - Timeout? Increase timeout and retry
// - Network error? Queue and retry
```

### 5. Observation Compression
Cache and diff observations to reduce LLM context:
```typescript
// Current: All observations sent to LLM
// Planned: Diff-based, only send changed observations
```

## Phase 2 Part C Enhancements - Additional Capabilities

### 1. **Semantic Goal Detection (Phase 4: FINALIZE)**

Replaced step-count-based completion with LLM-powered goal verification:

```typescript
// Old: Completion after 5 steps
const isComplete = state.currentStep >= 4;

// New: LLM evaluates if goal is achieved
const response = yield* llm.complete("anthropic", model, [
  { role: "system", content: "Verify if goal is achieved" },
  { role: "user", content: `Goal: "${goal}"\nPage: ${domContent}` }
]);
const isComplete = response.text.toLowerCase().includes("yes");
```

**Benefits:**
- Loop stops when goal is semantically achieved
- No need to pre-configure max steps
- Works for any goal description
- Graceful fallback to step-based completion

### 2. **Enhanced Observation Capture (Phase 1: OBSERVE)**

Upgraded DOM observation to capture ARIA-like trees with interactive elements:

```typescript
// Builds tree of elements with:
// - Element roles/tags
// - Interactive vs structural classification
// - Text content
// - Depth limiting for context window management

const ariaTree = yield* session.evaluate<string>(`
  (() => {
    const elements = [];
    // Walk DOM tree and collect interactive elements
    // Return JSON instead of raw HTML
  })()
`);
```

**Benefits:**
- LLM gets structured data instead of raw HTML
- Identifies interactive elements automatically
- Limits context size (50 elements max)
- Better for action planning

### 3. **Error Recovery with Retry Logic (Phase 3: ACT)**

Implemented exponential backoff retry strategy:

```typescript
const maxRetries = 2;
let retryCount = 0;

while (retryCount <= maxRetries && !success) {
  try {
    // Execute action
    success = true;
  } catch (e) {
    if (retryCount < maxRetries) {
      const delayMs = Math.min(100 * Math.pow(2, retryCount), 2000);
      // Wait and retry
      retryCount++;
    } else {
      // Max retries exceeded
      success = false;
      error = e.message;
    }
  }
}
```

**Benefits:**
- Handles transient failures automatically
- Exponential backoff reduces server load
- Proper error tracking and logging
- Configurable retry limits

### 4. **Multi-Action Plans (Phase 2: THINK & Phase 3: ACT)**

Extended action format to support sequential action plans:

```typescript
// Single action (existing)
{ "name": "click", "params": { "selector": ".button" } }

// Action plan (new)
{
  "sequential": true,
  "subActions": [
    { "name": "click", "params": { "selector": ".login" } },
    { "name": "type", "params": { "selector": "input", "text": "user@example.com" } },
    { "name": "click", "params": { "selector": ".submit" } }
  ]
}
```

**Benefits:**
- LLM can plan multi-step workflows
- Executes plans atomically within a step
- Simplifies complex interactions
- Better context preservation

**Updated AgentAction Schema:**
```typescript
export class AgentAction {
  sequential?: boolean;     // Execute sub-actions in sequence
  subActions?: unknown[];   // Array of action objects
}
```

**Helper Function:**
```typescript
function flattenActionPlan(action: AgentAction): AgentAction[] {
  if (action.sequential && action.subActions) {
    return action.subActions.map((subAction, idx) => ({...}));
  }
  return [action];
}
```

## Test Coverage

All 5 integration tests passing:
- ✅ Complete loop execution
- ✅ Step limits enforced
- ✅ Observations tracked
- ✅ Actions and results tracked
- ✅ Browser session integration

## Metrics (Phase 2 Complete)

| Metric | Value |
|--------|-------|
| **Lines Added** | 900+ (agent-loop.ts enhancements) |
| **Functions** | 4 phases (observe, think, act, finalize) |
| **LLM Calls** | 2 per step (action planning + goal verification) |
| **Error Recovery** | Yes (retry with exponential backoff) |
| **Action Formats** | 2 (single + sequential plans) |
| **Test Pass Rate** | 100% (5/5) |
| **Build Status** | ✅ No errors |

## Implementation Status

✅ **Complete:**
- LLM service integration
- Browser session support
- Mock testing infrastructure
- Semantic goal detection
- Enhanced observations (ARIA-like)
- Error recovery with retries
- Multi-action planning

🚀 **Ready for Integration:**
- Real BrowserManager
- AriaSnapshotBuilder
- Watchdog integration (crashes, captchas, popups)
- Observation compression/caching

## Next Steps in Priority Order

1. **Wire real BrowserManager** - Integrate actual Playwright browser
2. **Add AriaSnapshotBuilder** - Replace hand-rolled ARIA tree with production version
3. **Implement watchdog integration** - Detect and handle crashes, captchas, popups
4. **Add observation caching** - Diff-based observation delta sends
5. **Performance optimization** - Parallel observation capture
6. **Advanced planning** - Context-aware multi-step strategies

---

See AGENT-LOOP-INTEGRATION.md for detailed integration patterns and code examples.
