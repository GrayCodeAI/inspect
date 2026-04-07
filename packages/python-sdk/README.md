# Inspect Python SDK

Python SDK for browser automation and AI testing.

## Installation

```bash
pip install inspect-python
```

## Quick Start

```python
from inspect import Inspect

# Initialize
agent = Inspect()

# Execute actions
result = await agent.act("Click the login button")
result = await agent.type("email", "user@example.com")

# Extract structured data
data = await agent.extract("Get product prices", {"prices": ["str"]})

# Run autonomous agent
result = await agent.agent("Complete the checkout flow")

# Visual assertions
result = await agent.check("User is logged in")

agent.close()
```

## Configuration

```python
from inspect import Inspect, Config

config = Config(
    model="claude-sonnet-4-20250514",
    headless=True,
    browser="chromium",  # chromium, firefox, webkit
)

agent = Inspect(config)
```

## Environment Variables

- `INSPECT_API_KEY` - API key for cloud services
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENAI_API_KEY` - OpenAI API key
- `INSPECT_BASE_URL` - Base URL for self-hosted

## Features

- Natural language actions
- AI-powered assertions
- Multi-browser support
- Session recording
- Cookie management
- MCP protocol support

## Documentation

See https://docs.inspect.dev for full documentation.
