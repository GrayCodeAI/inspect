"""Type definitions for the Inspect Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TokenUsage:
    """Token usage metrics from an LLM call."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class ActionSuggestion:
    """A suggested action from observe()."""

    action: str
    selector: Optional[str] = None
    description: str = ""
    confidence: float = 0.0


@dataclass
class ActResult:
    """Result from an act() call."""

    success: bool
    action: str = ""
    selector: Optional[str] = None
    error: Optional[str] = None
    duration_ms: int = 0
    token_usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class ExtractResult:
    """Result from an extract() call."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    duration_ms: int = 0
    token_usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class ObserveResult:
    """Result from an observe() call."""

    success: bool
    actions: list[ActionSuggestion] = field(default_factory=list)
    error: Optional[str] = None
    duration_ms: int = 0
    token_usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class AgentStep:
    """A single step in an agent execution."""

    action: str
    reasoning: str = ""
    result: str = ""
    success: bool = True
    duration_ms: int = 0


@dataclass
class AgentResult:
    """Result from an agent() call."""

    success: bool
    steps: list[AgentStep] = field(default_factory=list)
    summary: str = ""
    error: Optional[str] = None
    duration_ms: int = 0
    token_usage: TokenUsage = field(default_factory=TokenUsage)
