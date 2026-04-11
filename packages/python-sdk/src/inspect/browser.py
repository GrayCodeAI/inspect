"""Browser automation operations."""

from __future__ import annotations

from typing import Any

from inspect.config import Config
from inspect.errors import BrowserError, NetworkError

import httpx


class BrowserClient:
    """Client for browser automation operations."""

    def __init__(self, config: Config | None = None, session_id: str | None = None) -> None:
        self.config = config or Config.from_env()
        self.session_id = session_id
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

    async def navigate(self, page_id: str, url: str) -> dict[str, object]:
        """Navigate to a URL in the specified page."""
        client = await self._get_client()

        try:
            response = await client.post(
                f"/api/browser/{page_id}/navigate",
                json={"url": url},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise BrowserError(
                f"Navigation failed: {e.response.text}",
                url=url,
            ) from e
        except httpx.RequestError as e:
            raise BrowserError(f"Navigation request failed: {e!s}", url=url) from e

    async def act(self, page_id: str, action: str, selector: str | None = None, value: str | None = None) -> dict[str, object]:
        """Perform an action on the page."""
        client = await self._get_client()

        try:
            response = await client.post(
                f"/api/browser/{page_id}/act",
                json={"action": action, "selector": selector, "value": value},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise BrowserError(
                f"Action failed: {e.response.text}",
                page=page_id,
            ) from e
        except httpx.RequestError as e:
            raise BrowserError(f"Action request failed: {e!s}") from e

    async def observe(self, page_id: str) -> dict[str, object]:
        """Observe the current state of the page."""
        client = await self._get_client()

        try:
            response = await client.get(f"/api/browser/{page_id}/observe")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise BrowserError(
                f"Observe failed: {e.response.text}",
                page=page_id,
            ) from e
        except httpx.RequestError as e:
            raise BrowserError(f"Observe request failed: {e!s}") from e

    async def extract(self, page_id: str, schema: dict[str, object]) -> dict[str, object]:
        """Extract data from the page using a schema."""
        client = await self._get_client()

        try:
            response = await client.post(
                f"/api/browser/{page_id}/extract",
                json={"schema": schema},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise BrowserError(
                f"Extract failed: {e.response.text}",
                page=page_id,
            ) from e
        except httpx.RequestError as e:
            raise BrowserError(f"Extract request failed: {e!s}") from e

    async def screenshot(self, page_id: str, full_page: bool = False) -> bytes:
        """Take a screenshot of the page."""
        client = await self._get_client()

        try:
            response = await client.get(
                f"/api/browser/{page_id}/screenshot",
                params={"full_page": full_page},
            )
            response.raise_for_status()
            return response.content
        except httpx.HTTPStatusError as e:
            raise BrowserError(
                f"Screenshot failed: {e.response.text}",
                page=page_id,
            ) from e
        except httpx.RequestError as e:
            raise BrowserError(f"Screenshot request failed: {e!s}") from e
