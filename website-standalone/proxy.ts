import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MARKDOWN_PAGES: Record<string, string> = {
  "/": `# Expect

> Let agents test your code in a real browser.

Expect is a CLI tool that lets coding agents (Claude Code, Codex CLI, Cursor) automatically test code changes in a real browser.

## How it works

1. Run \`npx expect-cli\` in your terminal
2. Expect scans your unstaged git changes or branch diff
3. An AI agent generates a test plan describing how to validate the changes
4. You review and approve the plan in an interactive TUI
5. The agent executes the test plan against a live browser instance
6. Results are displayed with pass/fail status and session recordings

## Links

- [Privacy Policy](/privacy)
- [Terms of Service](/terms)
- [Security Policy](/security)

## Installation

\`\`\`bash
npx expect-cli
\`\`\`

## Contact

- support@million.dev
`,

  "/privacy": `# Privacy Policy

Last updated Dec 13, 2025

Million Software, Inc. ("Million Software", "we" or "us") maintains strong commitment to respecting privacy and securing shared information. This Privacy Policy explains how the company collects, uses, discloses, and processes personal data when using Million Software's software, platform, APIs, Documentation, and related tools, including the website, and all related software for building, deploying, hosting, and managing software projects ("Service").

For the full privacy policy, visit [https://www.expect.dev/privacy](https://www.expect.dev/privacy).

## Contact

- support@million.dev
`,

  "/terms": `# Terms of Service

Last updated Dec 13, 2025

These Terms of Service govern your access to and use of Million Software's software, platform, APIs, Documentation, and related tools, including the website, and all related software made available by Million Software to build, deploy, host, and manage software projects ("Service").

For the full terms of service, visit [https://www.expect.dev/terms](https://www.expect.dev/terms).

## Contact

- support@million.dev
`,

  "/security": `# Security Policy

Thank you for helping us keep Expect secure!

## Reporting Security Issues

The security of our systems and user data is our top priority. We appreciate the work of security researchers acting in good faith in identifying and reporting potential vulnerabilities.

Please report any security issues to support@million.dev.
`,
};

export const proxy = (request: NextRequest) => {
  const accept = request.headers.get("accept") ?? "";
  const pathname = request.nextUrl.pathname;

  if (accept.includes("text/markdown") && pathname in MARKDOWN_PAGES) {
    return new NextResponse(MARKDOWN_PAGES[pathname], {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Vary", "Accept");
  return response;
};

export const config = {
  matcher: ["/", "/privacy", "/terms", "/security"],
};
