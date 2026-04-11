"""Pydantic models for Inspect SDK."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TestStep(BaseModel):
    """A single step in a test plan."""

    step_id: str
    action: str
    selector: str | None = None
    value: str | None = None
    expected: str | None = None
    status: str = "pending"
    error: str | None = None
    duration_ms: int | None = None


class TestResult(BaseModel):
    """Result of a test execution."""

    test_id: str
    test_name: str
    status: str  # passed, failed, skipped
    steps: list[TestStep] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    error: str | None = None
    screenshot_url: str | None = None
    recording_url: str | None = None


class CoverageReport(BaseModel):
    """Code coverage report."""

    url: str
    total_lines: int
    covered_lines: int
    uncovered_lines: int
    coverage_percentage: float
    files: dict[str, FileCoverage] = Field(default_factory=dict)


class FileCoverage(BaseModel):
    """Coverage for a single file."""

    path: str
    total_lines: int
    covered_lines: int
    uncovered_lines: list[int] = Field(default_factory=list)


class QualityMetrics(BaseModel):
    """Quality metrics from analysis."""

    url: str
    analysis_type: str  # a11y, lighthouse, visual
    score: float | None = None
    issues: list[QualityIssue] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class QualityIssue(BaseModel):
    """A single quality issue found."""

    severity: str  # critical, serious, moderate, minor
    description: str
    selector: str | None = None
    wcag_criteria: str | None = None
    impact: str | None = None


class SessionInfo(BaseModel):
    """Information about a test session."""

    session_id: str
    status: str  # active, completed, failed
    created_at: datetime
    browser: str | None = None
    url: str | None = None
    test_count: int = 0
    passed_count: int = 0
    failed_count: int = 0


class Workflow(BaseModel):
    """A test workflow definition."""

    workflow_id: str
    name: str
    description: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkflowStep(BaseModel):
    """A step in a workflow."""

    step_id: str
    action: str
    selector: str | None = None
    value: str | None = None
    timeout_ms: int | None = None
    retries: int = 0


class Block(BaseModel):
    """A block of test steps that run together."""

    block_id: str
    name: str
    steps: list[TestStep] = Field(default_factory=list)
    status: str = "pending"
    created_at: datetime = Field(default_factory=datetime.now)
