# NL Parser API Documentation

Natural Language Parser for browser automation instructions.

## Overview

The NL Parser converts natural language instructions into structured browser automation actions. It supports 50+ action patterns with entity extraction and confidence scoring.

## Installation

```bash
pnpm add @inspect/agent-tools
```

## Quick Start

```typescript
import { NLParser, createNLParser, parseInstruction } from "@inspect/agent-tools/nl-parser";

// Simple usage
const result = parseInstruction("Click the login button");
console.log(result.bestMatch);
// { type: "click", params: { target: "login button" }, confidence: 0.95 }

// With custom config
const parser = createNLParser({
  minConfidence: 0.8,
  fuzzyMatching: true,
});

const result2 = parser.parse("Fill the email field with test@example.com");
```

## Supported Actions

### Click Actions

| Pattern       | Example                   | Parsed Result                                |
| ------------- | ------------------------- | -------------------------------------------- |
| `click`       | "Click the submit button" | `{ type: "click", target: "submit button" }` |
| `doubleClick` | "Double-click the file"   | `{ type: "doubleClick", target: "file" }`    |
| `rightClick`  | "Right-click on the menu" | `{ type: "rightClick", target: "menu" }`     |

### Type Actions

| Pattern | Example                               | Parsed Result                                               |
| ------- | ------------------------------------- | ----------------------------------------------------------- |
| `type`  | `Type "hello" in the search box`      | `{ type: "type", target: "search box", value: "hello" }`    |
| `fill`  | `Fill the email with "test@test.com"` | `{ type: "type", target: "email", value: "test@test.com" }` |
| `clear` | "Clear the input field"               | `{ type: "clear", target: "input field" }`                  |

### Select Actions

| Pattern   | Example                            | Parsed Result                                            |
| --------- | ---------------------------------- | -------------------------------------------------------- |
| `select`  | "Select 'Large' from the dropdown" | `{ type: "select", target: "dropdown", value: "Large" }` |
| `check`   | "Check the terms checkbox"         | `{ type: "check", target: "terms checkbox" }`            |
| `uncheck` | "Uncheck the newsletter"           | `{ type: "uncheck", target: "newsletter" }`              |

### Navigation

| Pattern     | Example                     | Parsed Result                                      |
| ----------- | --------------------------- | -------------------------------------------------- |
| `navigate`  | "Go to https://example.com" | `{ type: "navigate", url: "https://example.com" }` |
| `goBack`    | "Go back"                   | `{ type: "goBack" }`                               |
| `goForward` | "Go forward"                | `{ type: "goForward" }`                            |
| `refresh`   | "Refresh the page"          | `{ type: "refresh" }`                              |

### Scroll

| Pattern    | Example                | Parsed Result                                              |
| ---------- | ---------------------- | ---------------------------------------------------------- |
| `scroll`   | "Scroll down by 500"   | `{ type: "scroll", direction: "down", numericValue: 500 }` |
| `scrollTo` | "Scroll to the footer" | `{ type: "scrollTo", target: "footer" }`                   |

### Wait

| Pattern | Example              | Parsed Result                       |
| ------- | -------------------- | ----------------------------------- |
| `wait`  | "Wait 3 seconds"     | `{ type: "wait", timeout: 3000 }`   |
| `wait`  | "Wait for the modal" | `{ type: "wait", target: "modal" }` |

### Keyboard

| Pattern    | Example        | Parsed Result                         |
| ---------- | -------------- | ------------------------------------- |
| `press`    | "Press Enter"  | `{ type: "press", key: "Enter" }`     |
| `keyCombo` | "Press Ctrl+S" | `{ type: "keyCombo", key: "Ctrl+S" }` |

### Assertions

| Pattern  | Example                         | Parsed Result                                                               |
| -------- | ------------------------------- | --------------------------------------------------------------------------- |
| `assert` | "Verify the button is visible"  | `{ type: "assert", target: "button", assertion: "visible" }`                |
| `assert` | "Check URL contains /dashboard" | `{ type: "assert", assertion: "urlContains", expectedValue: "/dashboard" }` |

## API Reference

### NLParser

Main parser class.

#### Constructor

```typescript
const parser = new NLParser(config?: Partial<ParserConfig>)
```

**Config Options:**

| Option              | Type    | Default | Description                   |
| ------------------- | ------- | ------- | ----------------------------- |
| `fuzzyMatching`     | boolean | true    | Enable fuzzy pattern matching |
| `minConfidence`     | number  | 0.6     | Minimum confidence threshold  |
| `maxParseTime`      | number  | 100     | Max parsing time in ms        |
| `entityRecognition` | boolean | true    | Extract entities from text    |
| `caseSensitive`     | boolean | false   | Case-sensitive matching       |

#### Methods

##### parse(instruction: string): ParseResult

Parse a single instruction.

```typescript
const result = parser.parse("Click the login button");

if (result.success) {
  console.log(result.bestMatch?.type); // "click"
  console.log(result.bestMatch?.params.target); // "login button"
  console.log(result.bestMatch?.confidence); // 0.95
}
```

**Returns:**

```typescript
interface ParseResult {
  bestMatch: ParsedAction | null;
  alternatives: ParsedAction[];
  success: boolean;
  error?: string;
  parseTime: number;
}
```

##### parseBatch(instructions: string[]): ParseResult[]

Parse multiple instructions.

```typescript
const results = parser.parseBatch(["Click the button", "Fill the input", "Scroll down"]);
```

##### validate(instruction: string): ValidationResult

Validate if an instruction can be parsed.

```typescript
const validation = parser.validate("Clik the button");
// { valid: false, suggestion: "Did you mean: 'click'?" }
```

##### parseElementDescriptor(text: string): ElementDescriptor

Extract element information from text.

```typescript
const descriptor = parser.parseElementDescriptor("Click the first submit button");
// { role: "button", index: 0, text: "submit" }
```

##### addCustomPatterns(patterns: GrammarPattern[]): void

Add custom parsing patterns.

```typescript
parser.addCustomPatterns([
  {
    name: "custom_login",
    actionType: "click",
    patterns: [/login as (.+)/i],
    extractors: [(match) => ({ value: match[1] })],
    priority: 100,
    examples: ["login as admin"],
  },
]);
```

##### getStats(): ParserStats

Get parser statistics.

```typescript
const stats = parser.getStats();
// { patternCount: 50, customPatternCount: 1, config: {...} }
```

### Convenience Functions

#### parseInstruction(instruction: string): ParseResult

One-shot parser without creating instance.

```typescript
import { parseInstruction } from "@inspect/agent-tools/nl-parser";

const result = parseInstruction("Click the button");
```

#### createNLParser(config?: Partial<ParserConfig>): NLParser

Create parser with custom config.

```typescript
import { createNLParser } from "@inspect/agent-tools/nl-parser";

const parser = createNLParser({ minConfidence: 0.9 });
```

#### getSupportedPatterns(): GrammarPattern[]

Get all supported patterns.

```typescript
import { getSupportedPatterns } from "@inspect/agent-tools/nl-parser";

const patterns = getSupportedPatterns();
console.log(patterns.length); // 50+
```

## Types

### ParsedAction

```typescript
interface ParsedAction {
  type: ActionType; // "click", "type", "navigate", etc.
  params: ActionParams; // Action parameters
  confidence: number; // 0-1 confidence score
  originalInstruction: string;
  matchedPattern: string;
  entities: ExtractedEntity[];
}
```

### ActionParams

```typescript
interface ActionParams {
  target?: string; // Element to interact with
  selector?: string; // CSS selector
  value?: string; // Text value
  numericValue?: number; // Number value
  url?: string; // URL for navigation
  direction?: "up" | "down" | "left" | "right";
  key?: string; // Keyboard key
  timeout?: number; // Wait timeout in ms
  assertion?: string; // Assertion type
  expectedValue?: string;
  // ... and more
}
```

### ExtractedEntity

```typescript
interface ExtractedEntity {
  type: "url" | "email" | "number" | "text";
  value: string;
  position: { start: number; end: number };
  confidence: number;
}
```

## Entity Extraction

The parser automatically extracts entities from instructions:

```typescript
const result = parser.parse("Go to https://example.com and fill test@example.com in 5 seconds");

// Extracted entities:
// [
//   { type: "url", value: "https://example.com", position: { start: 7, end: 26 } },
//   { type: "email", value: "test@example.com", position: { start: 36, end: 52 } },
//   { type: "number", value: "5", position: { start: 59, end: 60 } }
// ]
```

## Confidence Scoring

Each parsed action includes a confidence score (0-1):

- `0.95+`: Exact pattern match
- `0.8-0.95`: High confidence (similar pattern)
- `0.6-0.8`: Medium confidence (fuzzy match)
- `< 0.6`: Below threshold (rejected)

```typescript
const result = parser.parse("Click button");

if (result.bestMatch && result.bestMatch.confidence >= 0.8) {
  // High confidence - safe to execute
} else if (result.bestMatch) {
  // Low confidence - might need confirmation
}
```

## Custom Patterns

Add domain-specific patterns:

```typescript
import { NLParser, type GrammarPattern } from "@inspect/agent-tools/nl-parser";

const parser = new NLParser();

const customPatterns: GrammarPattern[] = [
  {
    name: "ecommerce_add_to_cart",
    actionType: "click",
    patterns: [/add (.+?) to cart/i, /add (.+?) to basket/i],
    extractors: [
      (match) => ({
        target: `Add to cart button for ${match[1]}`,
        metadata: { product: match[1] },
      }),
    ],
    priority: 100,
    examples: ["Add iPhone to cart", "Add MacBook to basket"],
  },
];

parser.addCustomPatterns(customPatterns);

const result = parser.parse("Add iPhone 15 to cart");
// { type: "click", target: "Add to cart button for iPhone 15", ... }
```

## Error Handling

```typescript
const result = parser.parse("Do something completely random");

if (!result.success) {
  console.log(result.error); // "No matching pattern found"
  console.log(result.alternatives); // Similar patterns if any
}

// Validation with suggestions
const validation = parser.validate("Clik the buton");
if (!validation.valid) {
  console.log(validation.suggestion); // "Did you mean: 'click'?"
}
```

## Integration with Agent Loop

```typescript
import { runAgentLoop } from "@inspect/cli/agents";
import { NLParser } from "@inspect/agent-tools/nl-parser";

const nlParser = new NLParser();

const result = await runAgentLoop({
  page,
  url: "https://example.com",
  llm,
  onProgress: (level, message) => {
    // Parse natural language progress messages
    const parsed = nlParser.parse(message);
    if (parsed.bestMatch) {
      console.log(`Action: ${parsed.bestMatch.type}`);
    }
  },
  maxSteps: 50,
});
```

## Performance

- **Parse Time**: < 1ms per instruction (typical)
- **Memory**: ~500KB for parser instance
- **Patterns**: 50+ built-in patterns
- **Custom Patterns**: Unlimited

## Testing

```typescript
import { describe, it, expect } from "vitest";
import { NLParser } from "@inspect/agent-tools/nl-parser";

describe("NL Parser", () => {
  const parser = new NLParser();

  it("should parse click actions", () => {
    const result = parser.parse("Click the button");
    expect(result.bestMatch?.type).toBe("click");
    expect(result.bestMatch?.params.target).toBe("button");
  });

  it("should extract URLs", () => {
    const result = parser.parse("Go to https://example.com");
    const urlEntity = result.bestMatch?.entities.find((e) => e.type === "url");
    expect(urlEntity?.value).toBe("https://example.com");
  });
});
```

## License

MIT
