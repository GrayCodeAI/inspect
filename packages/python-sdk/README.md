# Inspect SDK - Python Client

Python SDK for [Inspect](https://github.com/your-org/inspect) - automated browser testing for coding agents.

## Installation

```bash
pip install inspect-sdk
```

Or from source:

```bash
cd packages/python-sdk
pip install -e ".[dev]"
```

## Quick Start

```python
import asyncio
from inspect import InspectClient, Config

async def main():
    async with InspectClient() as client:
        # Authenticate
        await client.authenticate("your-api-key")

        # Health check
        health = await client.health_check()
        print(f"API status: {health}")

asyncio.run(main())
```

## Configuration

Set environment variables or pass a `Config` object:

```python
from inspect import Config

config = Config(
    api_url="http://localhost:3000",
    api_key="your-api-key",
    timeout=30.0,
    retries=3,
)
```

Environment variables:
- `INSPECT_API_URL` - API base URL (default: `http://localhost:3000`)
- `INSPECT_API_KEY` - API authentication key
- `INSPECT_TIMEOUT` - Request timeout in seconds (default: `30`)
- `INSPECT_RETRIES` - Number of retries (default: `3`)

## Browser Automation

```python
from inspect import BrowserClient

async with BrowserClient(config=config, session_id="sess-123") as browser:
    # Navigate to a page
    await browser.navigate("page-1", "https://example.com")

    # Take a screenshot
    screenshot = await browser.screenshot("page-1")
    with open("screenshot.png", "wb") as f:
        f.write(screenshot)

    # Perform actions
    await browser.act("page-1", "click", selector="#login-button")
    await browser.act("page-1", "sendKeys", selector="#username", value="user@example.com")

    # Observe page state
    state = await browser.observe("page-1")
    print(f"Page elements: {state}")

    # Extract data using a schema
    data = await browser.extract("page-1", {
        "title": {"type": "string", "selector": "h1"},
        "links": {"type": "array", "selector": "a"}
    })
```

## Workflows

```python
from inspect import WorkflowClient

workflow_client = WorkflowClient(config=config)

# Create a workflow
workflow = await workflow_client.create_workflow(
    name="Login Test",
    description="Test the login flow",
    steps=[
        {"action": "navigate", "value": "https://app.example.com/login"},
        {"action": "sendKeys", "selector": "#email", "value": "user@example.com"},
        {"action": "sendKeys", "selector": "#password", "value": "secret"},
        {"action": "click", "selector": "#submit"},
    ]
)

# Run the workflow
result = await workflow_client.run_workflow(workflow.workflow_id)

# List all workflows
workflows = await workflow_client.list_workflows()
```

## Quality Analysis

```python
from inspect import QualityClient

quality = QualityClient(config=config)

# Run accessibility audit
a11y_results = await quality.run_a11y("https://example.com")
print(f"A11y score: {a11y_results.score}")
print(f"Issues: {len(a11y_results.issues)}")

# Run Lighthouse audit
lighthouse = await quality.run_lighthouse("https://example.com")
print(f"Performance score: {lighthouse.metrics.get('performance')}")

# Run visual diff
visual = await quality.run_visual_diff(
    "https://example.com",
    baseline="baseline-screenshot-id"
)
```

## Session Management

```python
from inspect import SessionClient

session_client = SessionClient(config=config)

# List sessions
sessions = await session_client.list_sessions()

# Create a session
session = await session_client.create_session(
    browser="chrome",
    url="https://example.com"
)
print(f"Session ID: {session.session_id}")

# Close a session
await session_client.close_session(session.session_id)
```

## Reporting

```python
from inspect import Reporter

reporter = Reporter(output_dir="./reports")

# Save as JSON
reporter.save_json(test_results, "results.json")

# Save as HTML
reporter.save_html(html_content, "report.html")

# Save as Markdown
reporter.save_markdown(markdown_content, "report.md")

# Auto-generate from test results
reporter.save_test_results(results, format="html")
```

## Error Handling

All SDK methods raise specific exception types:

```python
from inspect.errors import (
    InspectError,
    BrowserError,
    TestError,
    NetworkError,
    AuthenticationError,
)

try:
    await client.authenticate("invalid-key")
except AuthenticationError as e:
    print(f"Auth failed: {e.message}")

try:
    await browser.navigate("page-1", "https://invalid-url")
except NetworkError as e:
    print(f"Network error: {e.message}, status: {e.status_code}")
```

## Models

The SDK includes Pydantic models for type-safe API interactions:

- `TestResult` - Test execution results
- `TestStep` - Individual test steps
- `CoverageReport` - Code coverage data
- `QualityMetrics` - Quality analysis results
- `SessionInfo` - Session metadata
- `Workflow` - Workflow definitions
- `Block` - Test step blocks

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run with verbose output
pytest -v

# Lint
ruff check .

# Format
ruff format .
```

## License

MIT
