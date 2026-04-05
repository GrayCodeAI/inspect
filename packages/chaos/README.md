# @inspect/chaos

Chaos engineering for web applications. Injects failures (network drops, slow responses, errors) to test application resilience during inspect runs.

## Usage

```ts
import { ChaosEngine } from "@inspect/chaos/chaos-engine.js";
```

## Key Exports

- `ChaosEngine` — orchestrates failure injection scenarios
- `ChaosStrategy` — defines chaos experiment parameters
