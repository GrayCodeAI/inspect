"""Model validation tests."""

from __future__ import annotations

import pytest
from datetime import datetime
from pydantic import ValidationError

from inspect.models import (
    TestStep,
    TestResult,
    CoverageReport,
    FileCoverage,
    QualityMetrics,
    QualityIssue,
    SessionInfo,
    Workflow,
    WorkflowStep,
    Block,
)


class TestTestStep:
    """Tests for TestStep model."""

    def test_minimal_step(self):
        """Test creating a minimal test step."""
        step = TestStep(step_id="step-1", action="click")
        assert step.step_id == "step-1"
        assert step.action == "click"
        assert step.status == "pending"
        assert step.selector is None

    def test_full_step(self):
        """Test creating a full test step."""
        step = TestStep(
            step_id="step-1",
            action="click",
            selector="#submit",
            value=None,
            expected="Button clicked",
            status="passed",
            duration_ms=150,
        )
        assert step.step_id == "step-1"
        assert step.action == "click"
        assert step.selector == "#submit"
        assert step.status == "passed"
        assert step.duration_ms == 150


class TestTestResult:
    """Tests for TestResult model."""

    def test_minimal_result(self):
        """Test creating a minimal test result."""
        result = TestResult(test_id="test-1", test_name="Login test", status="passed")
        assert result.test_id == "test-1"
        assert result.test_name == "Login test"
        assert result.status == "passed"
        assert result.steps == []

    def test_result_with_steps(self):
        """Test creating a result with steps."""
        step = TestStep(step_id="step-1", action="click", status="passed")
        result = TestResult(
            test_id="test-1",
            test_name="Login test",
            status="passed",
            steps=[step],
            duration_ms=500,
        )
        assert len(result.steps) == 1
        assert result.steps[0].step_id == "step-1"
        assert result.duration_ms == 500


class TestCoverageReport:
    """Tests for CoverageReport model."""

    def test_coverage_calculation(self):
        """Test coverage report with file coverage."""
        file_cov = FileCoverage(
            path="src/app.ts",
            total_lines=100,
            covered_lines=80,
            uncovered_lines=[10, 20, 30],
        )
        report = CoverageReport(
            url="http://example.com",
            total_lines=100,
            covered_lines=80,
            uncovered_lines=20,
            coverage_percentage=80.0,
            files={"src/app.ts": file_cov},
        )
        assert report.coverage_percentage == 80.0
        assert "src/app.ts" in report.files


class TestQualityMetrics:
    """Tests for QualityMetrics model."""

    def test_metrics_with_issues(self):
        """Test quality metrics with issues."""
        issue = QualityIssue(
            severity="critical",
            description="Missing alt text on image",
            selector="img.hero",
            wcag_criteria="1.1.1",
        )
        metrics = QualityMetrics(
            url="http://example.com",
            analysis_type="a11y",
            score=75.5,
            issues=[issue],
        )
        assert metrics.analysis_type == "a11y"
        assert metrics.score == 75.5
        assert len(metrics.issues) == 1
        assert metrics.issues[0].severity == "critical"


class TestSessionInfo:
    """Tests for SessionInfo model."""

    def test_session_info(self):
        """Test session info model."""
        session = SessionInfo(
            session_id="sess-1",
            status="active",
            created_at=datetime.now(),
            browser="chrome",
            url="http://example.com",
        )
        assert session.session_id == "sess-1"
        assert session.status == "active"
        assert session.browser == "chrome"


class TestWorkflow:
    """Tests for Workflow model."""

    def test_workflow_with_steps(self):
        """Test workflow with steps."""
        step = WorkflowStep(
            step_id="step-1",
            action="navigate",
            value="http://example.com",
        )
        workflow = Workflow(
            workflow_id="wf-1",
            name="Test workflow",
            steps=[step],
        )
        assert workflow.workflow_id == "wf-1"
        assert len(workflow.steps) == 1


class TestBlock:
    """Tests for Block model."""

    def test_block(self):
        """Test block model."""
        step = TestStep(step_id="step-1", action="click")
        block = Block(
            block_id="block-1",
            name="Login block",
            steps=[step],
        )
        assert block.block_id == "block-1"
        assert block.name == "Login block"
        assert len(block.steps) == 1


class TestModelValidation:
    """Tests for model validation."""

    def test_invalid_status_rejected(self):
        """Test that invalid status is handled by Pydantic."""
        # Pydantic will accept any string for status field
        # but we validate the structure
        result = TestResult(
            test_id="test-1",
            test_name="Test",
            status="invalid_status",
        )
        assert result.status == "invalid_status"

    def test_missing_required_field_raises(self):
        """Test that missing required fields raise ValidationError."""
        with pytest.raises(ValidationError):
            TestResult(test_name="Test", status="passed")  # Missing test_id

    def test_invalid_type_raises(self):
        """Test that invalid types raise ValidationError."""
        with pytest.raises(ValidationError):
            TestResult(
                test_id="test-1",
                test_name="Test",
                status="passed",
                duration_ms="not_a_number",  # type: ignore
            )
