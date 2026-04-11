"""Error types for Inspect SDK."""

from __future__ import annotations


class InspectError(Exception):
    """Base error for all Inspect SDK operations."""

    def __init__(self, message: str, code: str | None = None) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class BrowserError(InspectError):
    """Error during browser automation operations."""

    def __init__(
        self,
        message: str,
        browser: str | None = None,
        page: str | None = None,
        url: str | None = None,
    ) -> None:
        self.browser = browser
        self.page = page
        self.url = url
        super().__init__(message, code="browser_error")


class TestError(InspectError):
    """Error during test execution."""

    def __init__(self, message: str, step_id: str | None = None) -> None:
        self.step_id = step_id
        super().__init__(message, code="test_error")


class CoverageError(InspectError):
    """Error during coverage analysis."""

    def __init__(self, message: str, url: str | None = None) -> None:
        self.url = url
        super().__init__(message, code="coverage_error")


class QualityError(InspectError):
    """Error during quality analysis (a11y, lighthouse, visual)."""

    def __init__(self, message: str, analysis_type: str | None = None) -> None:
        self.analysis_type = analysis_type
        super().__init__(message, code="quality_error")


class NetworkError(InspectError):
    """Error during network operations."""

    def __init__(
        self,
        message: str,
        url: str | None = None,
        status_code: int | None = None,
    ) -> None:
        self.url = url
        self.status_code = status_code
        super().__init__(message, code="network_error")


class AuthenticationError(InspectError):
    """Error during authentication."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="authentication_error")


class ConfigurationError(InspectError):
    """Error in SDK configuration."""

    def __init__(self, message: str, key: str | None = None) -> None:
        self.key = key
        super().__init__(message, code="configuration_error")
