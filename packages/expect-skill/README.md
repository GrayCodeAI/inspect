# @inspect/expect-skill

AI agent skill for browser testing with inspect. Provides SKILL.md instructions for coding agents to write and execute browser-based tests.

## Usage

```ts
// The skill is consumed via SKILL.md, not as a code import
import { readFileSync } from "fs";
const skill = readFileSync("node_modules/@inspect/expect-skill/SKILL.md", "utf-8");
```

## Key Exports

- `SKILL.md` — agent skill instructions for browser testing
