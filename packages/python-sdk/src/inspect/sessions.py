"""Session management operations."""

from __future__ import annotations

import httpx

from inspect.config import Config
from inspect.errors import NetworkError
from inspect.models import SessionInfo


class SessionClient:
    """Client for session management operations."""

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

    async def list_sessions(self) -> list[SessionInfo]:
        """List all active sessions."""
        client = await self._get_client()

        try:
            response = await client.get("/api/sessions")
            response.raise_for_status()
            data = response.json()
            sessions = data if isinstance(data, list) else data.get("sessions", [])
            return [SessionInfo.model_validate(s) for s in sessions]
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to list sessions: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to list sessions: {e!s}") from e

    async def create_session(
        self,
        browser: str | None = None,
        url: str | None = None,
    ) -> SessionInfo:
        """Create a new test session."""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/sessions",
                json={"browser": browser, "url": url},
            )
            response.raise_for_status()
            return SessionInfo.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to create session: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to create session: {e!s}") from e

    async def close_session(self, session_id: str) -> None:
        """Close a test session."""
        client = await self._get_client()

        try:
            response = await client.delete(f"/api/sessions/{session_id}")
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to close session: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to close session: {e!s}") from e
