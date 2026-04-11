"""Inspect API client."""

from __future__ import annotations

import httpx

from inspect.config import Config
from inspect.errors import AuthenticationError, NetworkError
from inspect.models import SessionInfo


class InspectClient:
    """Async client for the Inspect API."""

    def __init__(self, config: Config | None = None) -> None:
        self.config = config or Config.from_env()
        self.config.validate()
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> InspectClient:
        self._client = httpx.AsyncClient(
            base_url=self.config.api_url,
            timeout=self.config.timeout,
            headers=self._build_headers(),
        )
        return self

    async def __aexit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        if self._client:
            await self._client.aclose()

    def _build_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.api_url,
                timeout=self.config.timeout,
                headers=self._build_headers(),
            )
        return self._client

    async def authenticate(self, api_key: str) -> None:
        """Authenticate with the API using the provided key."""
        self.config = self.config.with_api_key(api_key)
        client = await self._get_client()
        client.headers["Authorization"] = f"Bearer {api_key}"

        try:
            response = await client.post("/api/auth/validate")
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise AuthenticationError(f"Authentication failed: {e.response.text}") from e
        except httpx.RequestError as e:
            raise NetworkError(f"Authentication request failed: {e!s}") from e

    async def health_check(self) -> dict[str, object]:
        """Check the health of the Inspect API."""
        client = await self._get_client()

        try:
            response = await client.get("/api/health")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Health check failed: {e.response.text}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Health check request failed: {e!s}") from e

    async def get_session(self, session_id: str) -> SessionInfo:
        """Get information about a test session."""
        client = await self._get_client()

        try:
            response = await client.get(f"/api/sessions/{session_id}")
            response.raise_for_status()
            return SessionInfo.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise NetworkError(
                f"Failed to get session: {e.response.text}",
                url=f"/api/sessions/{session_id}",
                status_code=e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise NetworkError(f"Failed to get session: {e!s}") from e
