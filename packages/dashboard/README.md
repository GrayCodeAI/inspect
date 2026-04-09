# @inspect/dashboard

Real-time Web Dashboard for Inspect test execution monitoring.

## Features

- **WebSocket Server**: Real-time bidirectional communication for test updates
- **Live Dashboard UI**: Dark-themed web interface with real-time stats
- **Test History**: Persistent storage of test executions
- **Auto-Reconnect**: Client automatically reconnects on connection loss

## Installation

```bash
pnpm add @inspect/dashboard
```

## Quick Start

### Start the Dashboard Server

```bash
# Using CLI
inspect dashboard:ws

# With custom port
inspect dashboard:ws --port 3001 --host localhost
```

### Access the Dashboard

Open your browser to: `http://localhost:3001`

## Usage

### WebSocket Server

```typescript
import { DashboardWebSocketServer } from "@inspect/dashboard/server";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const server = yield* DashboardWebSocketServer;
  yield* server.start;

  // Emit test events
  yield* server.emit({
    type: "test:started",
    sessionId: "test-123",
    testId: "test-123",
    testName: "Login Flow Test",
    url: "https://example.com",
    startTime: Date.now(),
  });

  // More events...
  yield* server.emit({
    type: "step:completed",
    sessionId: "test-123",
    stepId: "step-1",
    success: true,
    duration: 1500,
  });

  yield* server.emit({
    type: "test:completed",
    sessionId: "test-123",
    testId: "test-123",
    success: true,
    duration: 5000,
    stepCount: 5,
  });

  // Stop server
  yield* server.stop;
});

Effect.runPromise(program.pipe(Effect.provide(DashboardWebSocketServer.layer)));
```

### Dashboard Client

```typescript
import { createDashboardClient } from "@inspect/dashboard/client";

const client = createDashboardClient({
  url: "ws://localhost:3001",
  reconnectInterval: 5000,
  maxReconnects: 10,
});

// Connect
await client.connect();

// Subscribe to test session
client.subscribe("test-123");

// Listen for messages
client.onMessage((message) => {
  switch (message.type) {
    case "test:started":
      console.log(`Test started: ${message.testName}`);
      break;
    case "step:completed":
      console.log(`Step completed: ${message.success ? "✓" : "✗"}`);
      break;
    case "test:completed":
      console.log(`Test finished: ${message.success ? "PASSED" : "FAILED"}`);
      break;
  }
});

// Get test history
client.getHistory();

// Cleanup
client.disconnect();
```

### Integration with Agent Loop

```typescript
import { runAgentLoop } from "@inspect/cli/agents";

const result = await runAgentLoop({
  page,
  url: "https://example.com",
  llm,
  onProgress: (level, message) => console.log(`[${level}] ${message}`),
  maxSteps: 50,
  dashboardEmitter: (event) => {
    // Forward to dashboard server
    wsServer.emit(event);
  },
  testId: "test-123",
  testName: "Example Test",
});
```

## Message Types

### Test Events

```typescript
// Test started
{
  type: "test:started",
  sessionId: string;
  testId: string;
  testName: string;
  url: string;
  startTime: number;
}

// Test completed
{
  type: "test:completed",
  sessionId: string;
  testId: string;
  success: boolean;
  duration: number;
  stepCount: number;
  error?: string;
}
```

### Step Events

```typescript
// Step started
{
  type: "step:started",
  sessionId: string;
  stepId: string;
  stepNumber: number;
  totalSteps: number;
  instruction: string;
}

// Step completed
{
  type: "step:completed",
  sessionId: string;
  stepId: string;
  success: boolean;
  duration: number;
  action?: AgentAction;
  error?: string;
}
```

### Agent Events

```typescript
// Agent thinking
{
  type: "agent:thinking",
  sessionId: string;
  thought: string;
}

// Agent action
{
  type: "agent:action",
  sessionId: string;
  action: AgentAction;
  result: ActionResult;
}
```

### Stats Events

```typescript
{
  type: "stats:update",
  sessionId: string;
  stats: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    cacheHitRate: number;
  };
}
```

## Configuration

```typescript
interface DashboardConfig {
  port: number; // Default: 3001
  host: string; // Default: "localhost"
  maxConnections: number; // Default: 100
  enableCors: boolean; // Default: true
  historyRetention: number; // Days to retain history (default: 30)
}
```

## API Reference

### DashboardWebSocketServer

| Method                       | Description                           |
| ---------------------------- | ------------------------------------- |
| `start()`                    | Start the WebSocket server            |
| `stop()`                     | Stop the server and close connections |
| `emit(message)`              | Broadcast a message to subscribers    |
| `getTestHistory(sessionId?)` | Get test execution history            |
| `getConnectedClients()`      | Get number of connected clients       |
| `subscribe()`                | Subscribe to message stream           |

### DashboardClient

| Method                   | Description                 |
| ------------------------ | --------------------------- |
| `connect()`              | Connect to WebSocket server |
| `disconnect()`           | Close connection            |
| `subscribe(sessionId)`   | Subscribe to test session   |
| `unsubscribe(sessionId)` | Unsubscribe from session    |
| `getHistory()`           | Request test history        |
| `onMessage(handler)`     | Register message handler    |
| `onConnect(handler)`     | Register connect handler    |
| `onDisconnect(handler)`  | Register disconnect handler |
| `isConnected()`          | Check connection status     |

## Dashboard UI

The dashboard UI is served at `http://localhost:3001` and includes:

- **Stats Cards**: Active tests, completed, failed, cache hit rate
- **Test List**: Real-time test execution list with status
- **Live Logs**: Stream of test events
- **Connection Status**: Shows WebSocket connection state

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Browser   │ ◄────────────────► │  Dashboard UI   │
│  (Dashboard)│                    │  (HTML/CSS/JS)  │
└─────────────┘                    └─────────────────┘
                                          │
                                          │ HTTP
                                          ▼
                                   ┌─────────────────┐
                                   │  Static Server  │
                                   │   (Node.js)     │
                                   └─────────────────┘
                                          │
                                          │ Effect
                                          ▼
┌─────────────┐     WebSocket      ┌─────────────────┐
│  Agent Loop │ ────────────────►  │ WebSocket Server│
│  (Tests)    │    Events          │   (Effect-TS)   │
└─────────────┘                    └─────────────────┘
```

## Development

```bash
# Start dev server
cd packages/dashboard
pnpm dev

# Build
pnpm build

# Test
pnpm test
```

## License

MIT
