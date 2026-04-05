# @inspect/human-in-the-loop

Human approval checkpoints for autonomous test execution. Pauses test runs at configurable points to request user confirmation before proceeding.

## Usage

```ts
import { ApprovalGate } from "@inspect/human-in-the-loop/approval-gate.js";
```

## Key Exports

- `ApprovalGate` — manages human approval checkpoints
- `ApprovalRequest` — schema for user approval prompts
