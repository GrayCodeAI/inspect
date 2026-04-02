# Agent Loop Service Integration Guide

This document describes how to wire real services into the Agent Loop framework. The current implementation has placeholder functions that simulate browser interactions and LLM calls. This guide shows how to integrate real services.

## Current State

The Agent Loop (`agent-loop.ts`) implements a complete four-phase loop:

1. **OBSERVE** — Capture browser state (DOM, screenshots)
2. **THINK** — Call LLM to plan next action
3. **ACT** — Execute action on browser
4. **FINALIZE** — Record results and check completion

All phases currently use mock/simulation implementations that allow the loop to run and be tested without external dependencies.

## Integration Points

### Phase 1: OBSERVE — observePhase()

**Current:** Returns mock DOM string

**To Integrate Real Browser:**

```typescript
async function observePhase(page: Page | undefined) {
  if (!page)
    return [
      /* mock observation */
    ];

  const observations: Observation[] = [];

  // Get DOM snapshot
  const ariaBuilder = new AriaSnapshotBuilder();
  const tree = await ariaBuilder.buildTree(page);
  const formatted = ariaBuilder.getFormattedTree(); // Get formatted DOM
  observations.push(
    new Observation({
      type: "dom",
      content: formatted,
      timestamp: Date.now(),
    }),
  );

  // Get screenshot
  const screenshotCapture = new ScreenshotCapture();
  const buffer = await screenshotCapture.capture(page);
  observations.push(
    new Observation({
      type: "screenshot",
      content: buffer.toString("base64"),
      timestamp: Date.now(),
    }),
  );

  return observations;
}
```

**Services Needed:**

- `@inspect/browser`: `AriaSnapshotBuilder`, `ScreenshotCapture`
- Requires active Playwright `Page` object

### Phase 2: THINK — thinkPhase()

**Current:** Returns mock action based on step number

**To Integrate Real LLM:**

```typescript
async function thinkPhase(state: AgentState, observations: Observation[], config: AgentLoopConfig) {
  // Format observations for LLM
  const domObservations = observations.find((o) => o.type === "dom")?.content || "";

  // Build prompt
  const systemPrompt = `You are a web testing agent...`;
  const userMessage = `${state.goal}. Current step: ${state.currentStep}/${config.maxSteps}`;

  // Call LLM
  const provider = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-3-5-sonnet-20241022",
  });

  const response = await provider.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    undefined,
    {
      temperature: config.temperature,
      maxTokens: 500,
    },
  );

  // Parse response as JSON
  const actionData = JSON.parse(response.text);
  return new AgentAction({
    id: `action-${Date.now()}`,
    name: actionData.name,
    params: actionData.params,
    description: actionData.description,
  });
}
```

**Services Needed:**

- `@inspect/llm`: `ClaudeProvider` (or other LLM providers)
- Environment variable: `ANTHROPIC_API_KEY`
- LLM should return structured JSON with action name, params, and description

### Phase 3: ACT — actPhase()

**Current:** Returns mock success

**To Integrate Real Browser Actions:**

```typescript
async function actPhase(action: AgentAction, page: Page | undefined) {
  if (!page) return mockResult(action);

  const startTime = Date.now();
  let success = true;
  let output = null;
  let error: string | undefined;

  try {
    switch (action.name) {
      case "navigate":
        await page.goto((action.params as any).url, { waitUntil: "networkidle" });
        output = { navigated: (action.params as any).url };
        break;

      case "click":
        await page.click((action.params as any).selector);
        output = { clicked: (action.params as any).selector };
        break;

      case "type":
        await page.fill((action.params as any).selector, (action.params as any).text);
        output = { typed: (action.params as any).text };
        break;

      case "extract":
        output = await page.evaluate((action.params as any).script);
        break;

      default:
        output = { action: action.name };
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
  }

  return new ActionResult({
    success,
    output,
    error,
    duration: Date.now() - startTime,
  });
}
```

**Services Needed:**

- Playwright `Page` object from browser
- Page must be navigated to target URL before loop starts
- Support for common actions: navigate, click, type, extract, verify

### Browser Launch

**Current:** Loop doesn't launch a browser

**To Integrate:**

```typescript
async function launchBrowser(config: AgentLoopConfig) {
  const browserManager = new BrowserManager();
  const context = await browserManager.launchBrowser({
    name: "chromium",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  if (config.url) {
    await page.goto(config.url, { waitUntil: "networkidle" });
  }

  return { page, context, browserManager };
}
```

**Services Needed:**

- `@inspect/browser`: `BrowserManager`
- Requires Chrome/Chromium installed
- Config should include target `url`

## Effect-TS Integration Challenges

The main challenge is that Effect-TS generators don't support native `async/await`. The current workarounds:

### Option 1: Use Effect.promise()

```typescript
yield * Effect.promise(() => asyncOperation());
```

### Option 2: Wrap async functions and call them before Effects

```typescript
const result = await asyncFunction(); // Outside effect
yield * Effect.succeed(result); // Inside effect
```

### Option 3: Don't use generators for async code

Create non-generator wrapper functions that handle async operations, then call them from Effects.

## Implementation Order

1. **Wire BrowserManager** (observe phase)
   - Launch browser at loop start
   - Pass page through executeStep
   - Capture real DOM and screenshots

2. **Wire LLMProviderService** (think phase)
   - Create ClaudeProvider with API key
   - Call with observations
   - Parse structured JSON response

3. **Wire Page Actions** (act phase)
   - Click, type, navigate, extract
   - Handle errors gracefully
   - Return action results

4. **Add real completion detection** (finalize phase)
   - Check DOM for goal-related content
   - Use LLM to verify goal achievement
   - Don't just count steps

## Testing

Current integration tests pass with mock implementations. To test with real services:

```bash
# Set environment variable
export ANTHROPIC_API_KEY=sk-...

# Create new test that requires real browser
# Tests should use headless mode and clean up resources
```

## Metrics

- **Current LOC**: ~360 lines (agent-loop.ts)
- **Test Coverage**: 4 integration tests, all passing
- **Service Dependencies**: 0 (all optional)
- **Type Safety**: Full TypeScript strict mode
- **Effect-TS Patterns**: Proper service definition, layer support

## Next Steps

1. Create integration test with real BrowserManager
2. Add ClaudeProvider integration to think phase
3. Implement page action handlers
4. Add real completion detection logic
5. Performance optimization and error recovery
