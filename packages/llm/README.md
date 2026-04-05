# @inspect/llm

LLM abstraction layer. Provides a unified interface for interacting with different language model providers (OpenAI, Anthropic, Google, etc.).

## Usage

```ts
import { LlmClient } from "@inspect/llm/llm-client.js";
```

## Key Exports

- `LlmClient` — unified LLM interface
- `LlmProvider` — provider abstraction for model backends
- `ChatMessage` — schema for chat conversation messages
