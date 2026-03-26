"""
Inspect Python SDK Client

Communicates with the Inspect API server to execute browser testing operations.
Start the server with: `inspect serve --port 4100`

Usage:
    from inspect_sdk import Inspect

    client = Inspect(base_url="http://localhost:4100")
    result = client.act("Click the login button", url="https://example.com")
    data = client.extract("Get all product prices", url="https://example.com")
    client.close()
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Any, Optional

from .types import (
    ActResult,
    AgentResult,
    AgentStep,
    ExtractResult,
    ObserveResult,
    ActionSuggestion,
    TokenUsage,
)


@dataclass
class InspectConfig:
    """Configuration for the Inspect SDK client."""

    base_url: str = "http://localhost:4100"
    api_key: Optional[str] = None
    timeout: int = 60
    default_model: str = "claude"


class Inspect:
    """
    Inspect Python SDK client.

    Provides act(), extract(), observe(), and agent() methods that
    communicate with the Inspect API server over HTTP.

    Example:
        client = Inspect(base_url="http://localhost:4100")
        result = client.act("Click the Submit button", url="https://example.com")
        print(result.success)
        client.close()
    """

    def __init__(
        self,
        base_url: str = "http://localhost:4100",
        api_key: Optional[str] = None,
        config: Optional[InspectConfig] = None,
    ):
        if config:
            self.base_url = config.base_url.rstrip("/")
            self.api_key = config.api_key
            self.timeout = config.timeout
        else:
            self.base_url = base_url.rstrip("/")
            self.api_key = api_key
            self.timeout = 60

        self._run_id: Optional[str] = None

    def act(
        self,
        instruction: str,
        *,
        url: Optional[str] = None,
        model: Optional[str] = None,
    ) -> ActResult:
        """
        Execute a single browser action.

        Args:
            instruction: Natural language instruction (e.g., "Click the login button")
            url: Target URL (uses current page if not provided)
            model: LLM model override
        """
        payload = {
            "type": "act",
            "instruction": instruction,
            "url": url,
            "model": model,
        }
        data = self._post("/api/runs", payload)
        return ActResult(
            success=data.get("status") != "error",
            action=instruction,
            error=data.get("error"),
            duration_ms=data.get("duration", 0),
        )

    def extract(
        self,
        instruction: str,
        *,
        url: Optional[str] = None,
        schema: Optional[dict[str, Any]] = None,
        model: Optional[str] = None,
    ) -> ExtractResult:
        """
        Extract structured data from a web page.

        Args:
            instruction: What to extract (e.g., "Get all product names and prices")
            url: Target URL
            schema: JSON schema for the expected data shape
            model: LLM model override
        """
        payload = {
            "type": "extract",
            "instruction": instruction,
            "url": url,
            "schema": schema,
            "model": model,
        }
        data = self._post("/api/runs", payload)
        return ExtractResult(
            success=data.get("status") != "error",
            data=data.get("result"),
            error=data.get("error"),
            duration_ms=data.get("duration", 0),
        )

    def observe(
        self,
        instruction: str,
        *,
        url: Optional[str] = None,
        model: Optional[str] = None,
    ) -> ObserveResult:
        """
        Observe a page and get action suggestions.

        Args:
            instruction: Context about what you're trying to do
            url: Target URL
            model: LLM model override
        """
        payload = {
            "type": "observe",
            "instruction": instruction,
            "url": url,
            "model": model,
        }
        data = self._post("/api/runs", payload)
        actions = [
            ActionSuggestion(
                action=a.get("action", ""),
                selector=a.get("selector"),
                description=a.get("description", ""),
                confidence=a.get("confidence", 0.0),
            )
            for a in data.get("actions", [])
        ]
        return ObserveResult(
            success=data.get("status") != "error",
            actions=actions,
            error=data.get("error"),
            duration_ms=data.get("duration", 0),
        )

    def agent(
        self,
        instruction: str,
        *,
        url: Optional[str] = None,
        max_steps: int = 20,
        model: Optional[str] = None,
    ) -> AgentResult:
        """
        Run a multi-step autonomous agent.

        Args:
            instruction: High-level goal description
            url: Starting URL
            max_steps: Maximum number of steps
            model: LLM model override
        """
        payload = {
            "type": "agent",
            "instruction": instruction,
            "url": url,
            "maxSteps": max_steps,
            "model": model,
        }
        data = self._post("/api/runs", payload)
        steps = [
            AgentStep(
                action=s.get("action", ""),
                reasoning=s.get("reasoning", ""),
                result=s.get("result", ""),
                success=s.get("status") != "failed",
                duration_ms=s.get("duration", 0),
            )
            for s in data.get("steps", [])
        ]
        return AgentResult(
            success=data.get("status") != "error",
            steps=steps,
            summary=data.get("summary", ""),
            error=data.get("error"),
            duration_ms=data.get("duration", 0),
        )

    def health(self) -> dict[str, Any]:
        """Check if the Inspect API server is running."""
        return self._get("/api/health")

    def close(self) -> None:
        """Clean up resources."""
        self._run_id = None

    # ── HTTP helpers ─────────────────────────────────────────────────────

    def _get(self, path: str) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, method="GET")
        self._set_headers(req)
        return self._send(req)

    def _post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        self._set_headers(req)
        return self._send(req)

    def _set_headers(self, req: urllib.request.Request) -> None:
        if self.api_key:
            req.add_header("Authorization", f"Bearer {self.api_key}")

    def _send(self, req: urllib.request.Request) -> dict[str, Any]:
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8") if e.fp else ""
            error_data = json.loads(body) if body else {}
            return {"status": "error", "error": error_data.get("error", str(e))}
        except urllib.error.URLError as e:
            return {"status": "error", "error": f"Connection failed: {e.reason}"}
