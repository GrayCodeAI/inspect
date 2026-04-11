"""Configuration for Inspect SDK."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    """SDK configuration."""

    api_url: str = field(
        default_factory=lambda: os.getenv("INSPECT_API_URL", "http://localhost:3000"),
    )
    api_key: str = field(default_factory=lambda: os.getenv("INSPECT_API_KEY", ""))
    timeout: float = float(os.getenv("INSPECT_TIMEOUT", "30"))
    retries: int = int(os.getenv("INSPECT_RETRIES", "3"))
    defaults: dict[str, object] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> Config:
        """Create config from environment variables."""
        return cls()

    def validate(self) -> None:
        """Validate configuration."""
        from inspect.errors import ConfigurationError

        if not self.api_url:
            raise ConfigurationError("API URL is required", key="api_url")

        if not self.api_url.startswith(("http://", "https://")):
            raise ConfigurationError(
                f"API URL must start with http:// or https://, got: {self.api_url}",
                key="api_url",
            )

    def with_api_key(self, api_key: str) -> Config:
        """Return a new config with the given API key."""
        return Config(
            api_url=self.api_url,
            api_key=api_key,
            timeout=self.timeout,
            retries=self.retries,
            defaults=self.defaults,
        )

    def with_timeout(self, timeout: float) -> Config:
        """Return a new config with the given timeout."""
        return Config(
            api_url=self.api_url,
            api_key=self.api_key,
            timeout=timeout,
            retries=self.retries,
            defaults=self.defaults,
        )

    def with_retries(self, retries: int) -> Config:
        """Return a new config with the given retry count."""
        return Config(
            api_url=self.api_url,
            api_key=self.api_key,
            timeout=self.timeout,
            retries=retries,
            defaults=self.defaults,
        )
