/**
 * Basic test coverage tracking.
 * Tracks which URLs/routes were visited during test execution.
 */

export interface CoverageReport {
  /** URLs visited during testing */
  visitedUrls: string[];
  /** Unique routes (paths without query params) */
  uniqueRoutes: string[];
  /** Total page navigations */
  totalNavigations: number;
  /** Unique interactive elements found */
  elementsFound: number;
  /** Elements interacted with */
  elementsInteracted: number;
  /** Interaction coverage percentage */
  interactionCoverage: number;
}

/**
 * Build a coverage report from test execution data.
 */
export function buildCoverageReport(data: {
  visitedUrls: string[];
  elementsFound: number;
  elementsInteracted: number;
}): CoverageReport {
  const uniqueRoutes = [
    ...new Set(
      data.visitedUrls.map((url) => {
        try {
          const parsed = new URL(url);
          return `${parsed.origin}${parsed.pathname}`;
        } catch {
          return url;
        }
      }),
    ),
  ];

  const interactionCoverage =
    data.elementsFound > 0 ? Math.round((data.elementsInteracted / data.elementsFound) * 100) : 0;

  return {
    visitedUrls: data.visitedUrls,
    uniqueRoutes,
    totalNavigations: data.visitedUrls.length,
    elementsFound: data.elementsFound,
    elementsInteracted: data.elementsInteracted,
    interactionCoverage,
  };
}

/**
 * Format a coverage report for terminal display.
 */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];

  lines.push("Coverage Report:");
  lines.push(`  Pages visited:        ${report.totalNavigations}`);
  lines.push(`  Unique routes:        ${report.uniqueRoutes.length}`);
  lines.push(`  Elements found:       ${report.elementsFound}`);
  lines.push(`  Elements interacted:  ${report.elementsInteracted}`);
  lines.push(`  Interaction coverage: ${report.interactionCoverage}%`);

  if (report.uniqueRoutes.length > 0) {
    lines.push("");
    lines.push("  Routes:");
    for (const route of report.uniqueRoutes.slice(0, 20)) {
      lines.push(`    ${route}`);
    }
    if (report.uniqueRoutes.length > 20) {
      lines.push(`    ... and ${report.uniqueRoutes.length - 20} more`);
    }
  }

  return lines.join("\n");
}
