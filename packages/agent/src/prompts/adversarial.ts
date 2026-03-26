// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Adversarial Testing Prompts
// ──────────────────────────────────────────────────────────────────────────────

/** Adversarial testing context passed to the prompt builder */
export interface AdversarialContext {
  /** URL of the application under test */
  url: string;
  /** Brief description of what the application does */
  appDescription?: string;
  /** Technology stack hints */
  techStack?: string[];
  /** Known vulnerabilities or patterns to probe */
  knownPatterns?: string[];
  /** Previous test results to learn from */
  previousResults?: Array<{
    instruction: string;
    outcome: "pass" | "fail";
    finding?: string;
  }>;
}

/** Elements / targets for adversarial testing */
export interface AdversarialElements {
  /** Form fields to fuzz */
  inputFields?: Array<{ ref: string; role: string; name: string; type?: string }>;
  /** Navigation links/buttons to probe */
  navigation?: Array<{ ref: string; name: string; href?: string }>;
  /** API endpoints discovered */
  apiEndpoints?: Array<{ method: string; url: string }>;
  /** Authentication-related elements */
  authElements?: Array<{ ref: string; role: string; name: string }>;
}

/**
 * System prompt for adversarial testing mode.
 * This prompt instructs the agent to think like a security researcher
 * and QA specialist who tries to break things.
 */
export const SYSTEM_PROMPT = `You are an adversarial testing agent. Your job is to find bugs, edge cases, security issues, and unexpected behaviors in web applications.

## Mindset
- Think like a malicious user, a distracted user, and an impatient user simultaneously
- Every input is an opportunity to test boundaries
- Every workflow has an unhappy path that might not be handled
- Race conditions, state inconsistencies, and error handling gaps are common

## Testing Strategies
1. **Boundary Testing**: Min/max values, empty strings, extremely long input, special characters
2. **Injection Testing**: SQL injection patterns, XSS payloads, command injection, path traversal
3. **State Manipulation**: Back button after submit, multiple tabs, expired sessions, stale tokens
4. **Race Conditions**: Double-click submit, concurrent requests, rapid navigation
5. **Error Paths**: Network failures, invalid data, missing required fields, malformed requests
6. **Authorization**: Access pages without auth, modify other users' data, privilege escalation
7. **Business Logic**: Negative quantities, zero-price items, self-referential data, circular dependencies

## Reporting
For each finding, provide:
- **Severity**: critical / high / medium / low / info
- **Category**: security / functionality / ux / performance / accessibility
- **Steps to reproduce**: Exact sequence of actions
- **Expected vs Actual**: What should happen vs what did happen
- **Impact**: What could go wrong if this reaches production

## Rules
- Never perform destructive actions on production systems
- Focus on the test environment only
- Document everything, even if a test passes (negative results are valuable)
- If you find a critical security issue, flag it immediately`;

/**
 * Build an adversarial test prompt for a specific test scenario.
 */
export function buildTestPrompt(
  context: AdversarialContext,
  instruction: string,
  elements?: AdversarialElements,
): string {
  const parts: string[] = [];

  parts.push(`## Target Application`);
  parts.push(`URL: ${context.url}`);
  if (context.appDescription) {
    parts.push(`Description: ${context.appDescription}`);
  }
  if (context.techStack?.length) {
    parts.push(`Tech Stack: ${context.techStack.join(", ")}`);
  }

  parts.push("");
  parts.push(`## Test Instruction`);
  parts.push(instruction);

  if (elements) {
    if (elements.inputFields?.length) {
      parts.push("");
      parts.push(`## Available Input Fields`);
      for (const field of elements.inputFields) {
        parts.push(`- [${field.ref}] ${field.role}: "${field.name}"${field.type ? ` (type: ${field.type})` : ""}`);
      }
    }

    if (elements.navigation?.length) {
      parts.push("");
      parts.push(`## Navigation Elements`);
      for (const nav of elements.navigation) {
        parts.push(`- [${nav.ref}] "${nav.name}"${nav.href ? ` -> ${nav.href}` : ""}`);
      }
    }

    if (elements.apiEndpoints?.length) {
      parts.push("");
      parts.push(`## Discovered API Endpoints`);
      for (const ep of elements.apiEndpoints) {
        parts.push(`- ${ep.method} ${ep.url}`);
      }
    }

    if (elements.authElements?.length) {
      parts.push("");
      parts.push(`## Authentication Elements`);
      for (const el of elements.authElements) {
        parts.push(`- [${el.ref}] ${el.role}: "${el.name}"`);
      }
    }
  }

  if (context.knownPatterns?.length) {
    parts.push("");
    parts.push(`## Known Patterns to Probe`);
    for (const pattern of context.knownPatterns) {
      parts.push(`- ${pattern}`);
    }
  }

  if (context.previousResults?.length) {
    parts.push("");
    parts.push(`## Previous Test Results (learn from these)`);
    for (const result of context.previousResults) {
      const icon = result.outcome === "fail" ? "BUG" : "OK";
      parts.push(`- [${icon}] ${result.instruction}`);
      if (result.finding) {
        parts.push(`  Finding: ${result.finding}`);
      }
    }
  }

  parts.push("");
  parts.push("## Instructions");
  parts.push("Analyze the target, devise adversarial test cases, and execute them. Report all findings.");

  return parts.join("\n");
}

/**
 * Generate common adversarial payloads for input fuzzing.
 */
export function getAdversarialPayloads(fieldType?: string): string[] {
  const universal = [
    "",                                      // empty
    " ",                                     // whitespace only
    "a".repeat(10000),                       // very long string
    "<script>alert(1)</script>",             // XSS basic
    "'\"><img src=x onerror=alert(1)>",      // XSS attribute breakout
    "{{7*7}}",                               // SSTI
    "${7*7}",                                // Template injection
    "' OR '1'='1' --",                       // SQL injection
    "'; DROP TABLE users; --",               // SQL injection destructive
    "../../../etc/passwd",                   // Path traversal
    "null",                                  // null string
    "undefined",                             // undefined string
    "NaN",                                   // NaN string
    "-1",                                    // negative number
    "0",                                     // zero
    "99999999999999999",                     // large number
    "1e308",                                 // float overflow
    "\0",                                    // null byte
    "\n\r\n",                                // newlines
    "\t\t\t",                                // tabs
    "test@test.com\nBcc: victim@evil.com",   // email header injection
    "Robert'); DROP TABLE Students;--",      // Bobby Tables
  ];

  const byType: Record<string, string[]> = {
    email: [
      "notanemail",
      "@missing-local.com",
      "local@",
      "a@b.c",
      "test@[127.0.0.1]",
      '"test test"@example.com',
      "test+tag@example.com",
    ],
    number: [
      "-0",
      "0.1 + 0.2",
      "Infinity",
      "-Infinity",
      "1.7976931348623157E+10308",
      "0x1A",
      "0b1010",
      "0o17",
    ],
    url: [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//evil.com",
      "https://evil.com\\@good.com",
    ],
    date: [
      "0000-00-00",
      "9999-12-31",
      "2024-13-01",
      "2024-02-30",
      "not-a-date",
    ],
    phone: [
      "000-000-0000",
      "+0000000000000000",
      "911",
      "+1 (555) 123-4567 ext. 999999",
    ],
  };

  return [...universal, ...(byType[fieldType ?? ""] ?? [])];
}
