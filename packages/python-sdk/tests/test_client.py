"""Async tests for InspectClient."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from inspect.client import InspectClient
from inspect.config import Config
from inspect.errors import AuthenticationError, NetworkError


@pytest.fixture
def mock_config():
    """Create a mock config for testing."""
    return Config(
        api_url="http://test.example.com",
        api_key="test-key",
        timeout=5.0,
        retries=1,
    )


@pytest.mark.asyncio
async def test_client_initialization(mock_config):
    """Test client initializes with config."""
    client = InspectClient(config=mock_config)
    assert client.config.api_url == "http://test.example.com"
    assert client.config.api_key == "test-key"


@pytest.mark.asyncio
async def test_client_context_manager(mock_config):
    """Test client works as async context manager."""
    async with InspectClient(config=mock_config) as client:
        assert client._client is not None
    assert client._client is not None  # Client exists but is closed


@pytest.mark.asyncio
async def test_authenticate_success(mock_config):
    """Test successful authentication."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response

    async with InspectClient(config=mock_config) as client:
        client._client = mock_client
        await client.authenticate("new-api-key")

    mock_client.post.assert_called_with("/api/auth/validate")
    assert client.config.api_key == "new-api-key"


@pytest.mark.asyncio
async def test_authenticate_failure(mock_config):
    """Test authentication failure raises AuthenticationError."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Invalid API key"

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Unauthorized", request=MagicMock(), response=mock_response,
    )

    async with InspectClient(config=mock_config) as client:
        client._client = mock_client
        with pytest.raises(AuthenticationError):
            await client.authenticate("invalid-key")


@pytest.mark.asyncio
async def test_health_check_success(mock_config):
    """Test successful health check."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"status": "ok", "version": "1.0.0"}

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response

    async with InspectClient(config=mock_config) as client:
        client._client = mock_client
        result = await client.health_check()

    assert result["status"] == "ok"
    assert result["version"] == "1.0.0"
    mock_client.get.assert_called_with("/api/health")


@pytest.mark.asyncio
async def test_health_check_network_error(mock_config):
    """Test network error during health check raises NetworkError."""
    import httpx

    mock_client = AsyncMock()
    mock_client.get.side_effect = httpx.ConnectError("Connection refused")

    async with InspectClient(config=mock_config) as client:
        client._client = mock_client
        with pytest.raises(NetworkError):
            await client.health_check()


@pytest.mark.asyncio
async def test_build_headers_with_api_key(mock_config):
    """Test headers include authorization when API key is set."""
    client = InspectClient(config=mock_config)
    headers = client._build_headers()
    assert headers["Authorization"] == "Bearer test-key"
    assert headers["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_build_headers_without_api_key():
    """Test headers work without API key."""
    config = Config(api_url="http://test.example.com", api_key="")
    client = InspectClient(config=config)
    headers = client._build_headers()
    assert "Authorization" not in headers
    assert headers["Content-Type"] == "application/json"
