"""Quality analysis operations (a11y, Lighthouse, visual diff)."""

from __future__ import annotations

import httpx

from inspect.config import Config
from inspect.errors import NetworkError, QualityError
from inspect.models import QualityMetrics


class QualityClient:
    """Client for quality analysis operations."""

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

    async def run_a11y(self, url: str) -> QualityMetrics:
        """Run accessibility analysis on a URL."""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/quality/a11y",
                json={"url": url},
            )
            response.raise_for_status()
            return QualityMetrics.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise QualityError(
                f"Accessibility analysis failed: {e.response.text}",
                analysis_type="a11y",
            ) from e
        except httpx.RequestError as e:
            raise QualityError(f"Accessibility analysis request failed: {e!s}") from e

    async def run_lighthouse(self, url: str) -> QualityMetrics:
        """Run Lighthouse analysis on a URL."""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/quality/lighthouse",
                json={"url": url},
            )
            response.raise_for_status()
            return QualityMetrics.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise QualityError(
                f"Lighthouse analysis failed: {e.response.text}",
                analysis_type="lighthouse",
            ) from e
        except httpx.RequestError as e:
            raise QualityError(f"Lighthouse analysis request failed: {e!s}") from e

    async def run_visual_diff(self, url: str, baseline: str) -> QualityMetrics:
        """Run visual diff against a baseline."""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/quality/visual-diff",
                json={"url": url, "baseline": baseline},
            )
            response.raise_for_status()
            return QualityMetrics.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise QualityError(
                f"Visual diff failed: {e.response.text}",
                analysis_type="visual",
            ) from e
        except httpx.RequestError as e:
            raise QualityError(f"Visual diff request failed: {e!s}") from e
