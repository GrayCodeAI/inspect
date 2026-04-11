"""Workflow management operations."""

from __future__ import annotations

import httpx

from inspect.config import Config
from inspect.errors import NetworkError
from inspect.models import Workflow


class WorkflowClient:
    """Client for workflow management operations."""

    def __init__(self, config: Config | None = None) -> None:
        self.config = config or Config.from_env()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.api_url,
                timeout=self.config.timeout,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                },
            )
        return self._client

    async def create_workflow(
        self,
        name: str,
        steps: list[dict[str, object]],
        description: str | None = None,
    ) -> Workflow:
        """Create a new workflow."""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/workflows",
                json={
                    "name": name,
                    "description": description,
                    "steps": steps,
                },
            )
            response.raise_for_status()
            return Workflow.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to create workflow: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to create workflow: {e!s}") from e

    async def run_workflow(
        self,
        workflow_id: str,
        session_id: str | None = None,
    ) -> dict[str, object]:
        """Run a workflow by ID."""
        client = await self._get_client()

        try:
            response = await client.post(
                f"/api/workflows/{workflow_id}/run",
                json={"session_id": session_id},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to run workflow: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to run workflow: {e!s}") from e

    async def list_workflows(self) -> list[Workflow]:
        """List all workflows."""
        client = await self._get_client()

        try:
            response = await client.get("/api/workflows")
            response.raise_for_status()
            data = response.json()
            workflows = data if isinstance(data, list) else data.get("workflows", [])
            return [Workflow.model_validate(w) for w in workflows]
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to list workflows: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to list workflows: {e!s}") from e
