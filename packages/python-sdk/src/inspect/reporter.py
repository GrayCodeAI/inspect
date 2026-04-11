"""Report generation utilities."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class Reporter:
    """Generate and save test reports in various formats."""

    def __init__(self, output_dir: str = ".") -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def save_json(self, data: dict[str, Any], filename: str = "report.json") -> Path:
        """Save report as JSON."""
        output_path = self.output_dir / filename
        output_path.write_text(
            json.dumps(data, indent=2, default=str),
            encoding="utf-8",
        )
        return output_path

    def save_html(
        self,
        content: str,
        filename: str = "report.html",
    ) -> Path:
        """Save report as HTML."""
        output_path = self.output_dir / filename
        output_path.write_text(content, encoding="utf-8")
        return output_path

    def save_markdown(
        self,
        content: str,
        filename: str = "report.md",
    ) -> Path:
        """Save report as Markdown."""
        output_path = self.output_dir / filename
        output_path.write_text(content, encoding="utf-8")
        return output_path

    def save_test_results(
        self,
        results: dict[str, Any],
        format: str = "json",
        filename: str | None = None,
    ) -> Path:
        """Save test results in the specified format."""
        if format == "json":
            return self.save_json(results, filename or "test-results.json")
        elif format == "html":
            html_content = self._generate_html_report(results)
            return self.save_html(html_content, filename or "test-results.html")
        elif format == "markdown":
            md_content = self._generate_markdown_report(results)
            return self.save_markdown(md_content, filename or "test-results.md")
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _generate_html_report(self, results: dict[str, Any]) -> str:
        """Generate a simple HTML report from results."""
        test_count = len(results.get("tests", []))
        passed = sum(1 for t in results.get("tests", []) if t.get("status") == "passed")
        failed = test_count - passed

        return f"""<!DOCTYPE html>
<html>
<head>
    <title>Test Results</title>
    <style>
        body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }}
        .passed {{ color: green; }}
        .failed {{ color: red; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f5f5f5; }}
    </style>
</head>
<body>
    <h1>Test Results</h1>
    <p>Total: {test_count} | Passed: <span class="passed">{passed}</span> | Failed: <span class="failed">{failed}</span></p>
    <table>
        <tr><th>Test</th><th>Status</th><th>Duration (ms)</th></tr>
        {"".join(f'<tr><td>{t.get("name", "Unknown")}</td><td class="{t.get("status", "unknown")}">{t.get("status", "unknown")}</td><td>{t.get("duration_ms", "N/A")}</td></tr>' for t in results.get("tests", []))}
    </table>
</body>
</html>"""

    def _generate_markdown_report(self, results: dict[str, Any]) -> str:
        """Generate a Markdown report from results."""
        test_count = len(results.get("tests", []))
        passed = sum(1 for t in results.get("tests", []) if t.get("status") == "passed")
        failed = test_count - passed

        lines = [
            "# Test Results\n",
            f"Total: {test_count} | Passed: {passed} | Failed: {failed}\n",
            "| Test | Status | Duration (ms) |",
            "|------|--------|---------------|",
        ]

        for test in results.get("tests", []):
            name = test.get("name", "Unknown")
            status = test.get("status", "unknown")
            duration = test.get("duration_ms", "N/A")
            lines.append(f"| {name} | {status} | {duration} |")

        return "\n".join(lines)
