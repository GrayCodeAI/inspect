"""Inspect SDK - Python client for automated browser testing."""

from inspect.client import InspectClient
from inspect import errors, models
from inspect.browser import BrowserClient
from inspect.workflow import WorkflowClient
from inspect.quality import QualityClient
from inspect.reporter import Reporter
from inspect.sessions import SessionClient

__version__ = "0.1.0"
__all__ = [
    "InspectClient",
    "errors",
    "models",
    "BrowserClient",
    "WorkflowClient",
    "QualityClient",
    "Reporter",
    "SessionClient",
]
