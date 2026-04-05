# @inspect/self-healing

Self-healing selectors that adapt to DOM changes. Automatically recovers broken test selectors when application UI evolves.

## Usage

```ts
import { SelfHealingSelector } from "@inspect/self-healing/self-healing-selector.js";
```

## Key Exports

- `SelfHealingSelector` — adaptive selector resolution
- `SelectorHealer` — finds alternative selectors when originals fail
