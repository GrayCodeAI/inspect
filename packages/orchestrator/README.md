# @inspect/orchestrator

Central orchestration engine for inspect. Owns all state management, agent lifecycle, git operations, and coordinates test plan generation and execution.

## Usage

```ts
import { Orchestrator } from "@inspect/orchestrator/orchestrator.js";
```

## Key Exports

- `Orchestrator` — central test orchestration service
- `TestPlan` — generated test plan schema
- `ExecutionEngine` — executes test plans against live browsers
