"""
Inspect Python SDK

A Python client for the Inspect AI-powered browser testing platform.
Communicates with the Inspect API server (started via `inspect serve`).
"""

from .client import Inspect, InspectConfig
from .types import ActResult, ExtractResult, ObserveResult, AgentResult

__all__ = [
    "Inspect",
    "InspectConfig",
    "ActResult",
    "ExtractResult",
    "ObserveResult",
    "AgentResult",
]

__version__ = "0.1.0"
