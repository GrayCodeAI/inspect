// ============================================================================
// @inspect/core - Adversarial Test Executor
//
// Generates adversarial test plans that actively try to break features
// through boundary testing, input fuzzing, race conditions, and more.
// Integrates with the existing agent prompt system.
// ============================================================================

import type { StepPlan } from "../orchestrator/executor.js";
import type { AdversarialFinding } from "../orchestrator/executor.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/adversarial");

export interface AdversarialConfig {
  /** Target URL */
  url: string;
  /** Application description for context */
  appDescription?: string;
  /** Intensity level */
  intensity: "basic" | "standard" | "aggressive";
  /** Detected input fields to fuzz */
  inputFields?: Array<{ ref: string; role: string; name: string; type?: string }>;
  /** Navigation elements to probe */
  navigationElements?: Array<{ ref: string; name: string }>;
  /** Maximum number of adversarial steps to generate */
  maxSteps?: number;
}

/** A payload category with its payloads */
interface PayloadCategory {
  name: string;
  payloads: string[];
  description: string;
}

/**
 * AdversarialExecutor generates test plans that try to break web applications
 * through systematic adversarial testing: boundary values, injection payloads,
 * race conditions, state manipulation, and error path triggering.
 */
export class AdversarialExecutor {
  /**
   * Generate adversarial test steps based on configuration.
   */
  generateAdversarialSteps(config: AdversarialConfig): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = 0;
    const maxSteps = config.maxSteps ?? 50;

    // Phase 1: Always start with baseline navigation
    steps.push({
      index: index++,
      description: `Navigate to ${config.url} and capture initial page state`,
      type: "navigate",
      assertion: "Page loads without console errors",
    });

    // Phase 2: Boundary testing (all intensity levels)
    if (config.inputFields?.length) {
      const boundarySteps = this.generateBoundarySteps(config.inputFields, index);
      steps.push(...boundarySteps.slice(0, maxSteps - steps.length));
      index = steps.length;
    }

    // Phase 3: Input fuzzing (standard+)
    if (config.intensity !== "basic" && config.inputFields?.length) {
      const fuzzSteps = this.generateFuzzSteps(config.inputFields, index);
      steps.push(...fuzzSteps.slice(0, maxSteps - steps.length));
      index = steps.length;
    }

    // Phase 4: Race conditions (aggressive only)
    if (config.intensity === "aggressive") {
      const raceSteps = this.generateRaceConditionSteps(config, index);
      steps.push(...raceSteps.slice(0, maxSteps - steps.length));
      index = steps.length;
    }

    // Phase 5: Navigation edge cases
    if (config.navigationElements?.length) {
      const navSteps = this.generateNavigationEdgeCases(config.navigationElements, index);
      steps.push(...navSteps.slice(0, maxSteps - steps.length));
      index = steps.length;
    }

    // Phase 6: State manipulation
    const stateSteps = this.generateStateManipulationSteps(config, index);
    steps.push(...stateSteps.slice(0, maxSteps - steps.length));

    logger.info("Generated adversarial test plan", {
      intensity: config.intensity,
      totalSteps: steps.length,
      inputFields: config.inputFields?.length ?? 0,
    });

    return steps;
  }

  /**
   * Get the adversarial system prompt for the agent.
   * This replaces the standard testing prompt with an adversarial mindset.
   */
  getAdversarialSystemPrompt(config: AdversarialConfig): string {
    return `You are an adversarial browser testing agent. Your mission is to FIND BUGS by trying to break the application.

## Mindset
- Think like a malicious user, a distracted user, AND an impatient user simultaneously
- Every input is an opportunity to test boundaries
- Every workflow has an unhappy path that might not be handled
- Race conditions, state inconsistencies, and error handling gaps are common

## Testing Intensity: ${config.intensity.toUpperCase()}
${this.getIntensityInstructions(config.intensity)}

## Testing Strategies
1. **Boundary Testing**: Empty strings, extremely long input, special characters, min/max values
2. **Injection Testing**: XSS payloads, SQL injection, template injection, path traversal
3. **State Manipulation**: Back button after submit, multiple tabs, expired sessions, stale tokens
4. **Race Conditions**: Double-click submit, concurrent requests, rapid navigation
5. **Error Paths**: Network failures, invalid data, missing required fields, malformed requests
6. **Authorization**: Access pages without auth, modify other users' data, privilege escalation
7. **Business Logic**: Negative quantities, zero-price items, self-referential data

## Payloads to Try
${this.getPayloadDocumentation(config.intensity)}

## Reporting Rules
For each finding, report:
- **Severity**: critical / high / medium / low / info
- **Category**: security / functionality / ux / performance / accessibility
- **Steps to reproduce**: Exact sequence of actions
- **Expected vs Actual**: What should happen vs what did happen
- **Impact**: What could go wrong if this reaches production

## Safety Rules
- NEVER perform destructive actions on production systems
- Focus on the test environment only
- Document everything, even if a test passes
- If you find a critical security issue, flag it IMMEDIATELY`;
  }

  /**
   * Convert adversarial findings to a formatted report.
   */
  formatFindings(findings: AdversarialFinding[]): string {
    if (findings.length === 0) {
      return "No adversarial findings detected. All tests passed.";
    }

    const lines: string[] = [];
    lines.push(`## Adversarial Testing Report`);
    lines.push(`Found ${findings.length} issue(s)\n`);

    // Group by severity
    const bySeverity = new Map<string, AdversarialFinding[]>();
    for (const f of findings) {
      const list = bySeverity.get(f.severity) ?? [];
      list.push(f);
      bySeverity.set(f.severity, list);
    }

    for (const severity of ["critical", "high", "medium", "low", "info"]) {
      const group = bySeverity.get(severity);
      if (!group?.length) continue;

      lines.push(`### ${severity.toUpperCase()} (${group.length})`);
      for (const f of group) {
        lines.push(`\n**[${f.category}]** ${f.instruction}`);
        lines.push(`Finding: ${f.finding}`);
        lines.push(`Expected: ${f.expected}`);
        lines.push(`Actual: ${f.actual}`);
        if (f.steps.length > 0) {
          lines.push("Steps to reproduce:");
          for (let i = 0; i < f.steps.length; i++) {
            lines.push(`  ${i + 1}. ${f.steps[i]}`);
          }
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // ── Boundary Testing ─────────────────────────────────────────────────────

  private generateBoundarySteps(
    fields: AdversarialConfig["inputFields"],
    startIndex: number,
  ): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = startIndex;

    for (const field of fields ?? []) {
      // Empty submission
      steps.push({
        index: index++,
        description: `Submit "${field.name}" field with empty value`,
        type: "interact",
        targetArea: field.ref,
        assertion: "Validation error is shown, form is not submitted",
        rationale: "Boundary: empty input should be rejected by validation",
      });

      // Whitespace only
      steps.push({
        index: index++,
        description: `Submit "${field.name}" field with whitespace-only value`,
        type: "interact",
        targetArea: field.ref,
        assertion: "Validation error is shown for whitespace-only input",
        rationale: "Boundary: whitespace should not pass required validation",
      });

      // Very long string
      steps.push({
        index: index++,
        description: `Submit "${field.name}" with extremely long input (10000 chars)`,
        type: "interact",
        targetArea: field.ref,
        assertion: "Input is truncated or rejected, no UI crash or overflow",
        rationale: "Boundary: long input should not break layout or cause errors",
      });

      // Special characters
      steps.push({
        index: index++,
        description: `Submit "${field.name}" with special characters: <>&"'`,
        type: "interact",
        targetArea: field.ref,
        assertion: "Special characters are properly escaped in output",
        rationale: "Boundary: special chars must not cause XSS or rendering issues",
      });

      // Type-specific boundaries
      if (field.type === "email") {
        steps.push({
          index: index++,
          description: `Submit "${field.name}" with invalid email format: "notanemail"`,
          type: "interact",
          targetArea: field.ref,
          assertion: "Email validation error is shown",
          rationale: "Boundary: invalid email format should be rejected",
        });
      }

      if (field.type === "number") {
        steps.push({
          index: index++,
          description: `Submit "${field.name}" with negative number: "-999999"`,
          type: "interact",
          targetArea: field.ref,
          assertion: "Negative number is either rejected or handled correctly",
          rationale: "Boundary: negative numbers may not be expected",
        });
      }
    }

    return steps;
  }

  // ── Input Fuzzing ────────────────────────────────────────────────────────

  private generateFuzzSteps(
    fields: AdversarialConfig["inputFields"],
    startIndex: number,
  ): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = startIndex;

    const payloads = this.getFuzzPayloads();

    for (const field of fields ?? []) {
      for (const category of payloads) {
        // Test a subset of payloads per category to keep step count reasonable
        const selectedPayloads = category.payloads.slice(0, 3);
        for (const payload of selectedPayloads) {
          steps.push({
            index: index++,
            description: `Fuzz "${field.name}" with ${category.name}: "${payload.slice(0, 50)}${payload.length > 50 ? "..." : ""}"`,
            type: "interact",
            targetArea: field.ref,
            assertion: `No ${category.description} vulnerability, proper error handling`,
            rationale: `Fuzzing: testing ${category.name} resistance`,
          });
        }
      }
    }

    return steps;
  }

  private getFuzzPayloads(): PayloadCategory[] {
    return [
      {
        name: "XSS payloads",
        description: "cross-site scripting",
        payloads: [
          "<script>alert('xss')</script>",
          "'\"><img src=x onerror=alert(1)>",
          "<svg/onload=alert(1)>",
          "javascript:alert(1)",
          "{{constructor.constructor('return this')()}}",
        ],
      },
      {
        name: "SQL injection",
        description: "SQL injection",
        payloads: [
          "' OR '1'='1' --",
          "'; DROP TABLE users; --",
          "1 UNION SELECT * FROM users",
          "admin'--",
        ],
      },
      {
        name: "path traversal",
        description: "path traversal",
        payloads: [
          "../../../etc/passwd",
          "..\\..\\..\\windows\\system32",
          "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        ],
      },
      {
        name: "template injection",
        description: "server-side template injection",
        payloads: ["{{7*7}}", "${7*7}", "<%= 7*7 %>", "#{7*7}"],
      },
      {
        name: "null/undefined",
        description: "null handling",
        payloads: ["null", "undefined", "NaN", "\0"],
      },
    ];
  }

  // ── Race Conditions ──────────────────────────────────────────────────────

  private generateRaceConditionSteps(config: AdversarialConfig, startIndex: number): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = startIndex;

    // Double-click submit
    steps.push({
      index: index++,
      description: "Double-click form submit button rapidly",
      type: "interact",
      assertion: "Form is submitted only once, no duplicate entries or errors",
      rationale: "Race condition: rapid double-click should not cause duplicate submission",
    });

    // Rapid navigation
    steps.push({
      index: index++,
      description: "Navigate away and back rapidly during form submission",
      type: "interact",
      assertion: "No orphaned state, no errors on return",
      rationale: "Race condition: navigation during async operation should be handled",
    });

    // Concurrent form submissions
    if (config.inputFields?.length) {
      steps.push({
        index: index++,
        description: "Open form in two tabs and submit both simultaneously",
        type: "interact",
        assertion: "Both submissions handled correctly, or one is rejected with clear message",
        rationale: "Race condition: concurrent submissions should not corrupt data",
      });
    }

    // Rapid clicking on buttons
    steps.push({
      index: index,
      description: "Rapidly click all interactive buttons in quick succession",
      type: "interact",
      assertion: "No duplicate actions, proper debouncing/throttling",
      rationale: "Race condition: rapid clicks should be properly debounced",
    });

    return steps;
  }

  // ── Navigation Edge Cases ────────────────────────────────────────────────

  private generateNavigationEdgeCases(
    elements: AdversarialConfig["navigationElements"],
    startIndex: number,
  ): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = startIndex;

    // Back button after form submission
    steps.push({
      index: index++,
      description: "Submit a form then press browser back button",
      type: "interact",
      assertion: "Form state is properly handled, no resubmission prompt or stale data",
      rationale: "Navigation edge case: back button after POST should not resubmit",
    });

    // Direct URL manipulation
    steps.push({
      index: index++,
      description: "Navigate directly to a deep-linked page without going through normal flow",
      type: "navigate",
      assertion: "Page loads correctly or redirects to appropriate entry point",
      rationale: "Navigation edge case: direct URL access should be handled gracefully",
    });

    // Refresh during loading
    steps.push({
      index: index,
      description: "Refresh the page while content is still loading",
      type: "interact",
      assertion: "Page recovers and loads correctly after refresh",
      rationale: "Navigation edge case: refresh during load should not break state",
    });

    return steps;
  }

  // ── State Manipulation ───────────────────────────────────────────────────

  private generateStateManipulationSteps(
    config: AdversarialConfig,
    startIndex: number,
  ): StepPlan[] {
    const steps: StepPlan[] = [];
    let index = startIndex;

    // Console manipulation
    steps.push({
      index: index++,
      description: "Check if sensitive data is exposed in browser console or window object",
      type: "verify",
      assertion: "No API keys, tokens, or passwords visible in window/console",
      rationale: "State security: sensitive data should not be client-accessible",
    });

    // LocalStorage tampering
    steps.push({
      index: index++,
      description: "Verify localStorage/sessionStorage does not contain unencrypted sensitive data",
      type: "extract",
      assertion: "No plaintext passwords, tokens, or PII in storage",
      rationale: "State security: local storage should not contain sensitive unencrypted data",
    });

    // Cookie security
    steps.push({
      index: index,
      description: "Verify authentication cookies have Secure, HttpOnly, and SameSite flags",
      type: "verify",
      assertion: "Auth cookies have proper security flags set",
      rationale: "State security: cookies should have security attributes",
    });

    return steps;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private getIntensityInstructions(intensity: AdversarialConfig["intensity"]): string {
    switch (intensity) {
      case "basic":
        return `- Focus on boundary testing: empty inputs, long strings, special characters
- Test form validation and error messages
- Check for basic UI crashes and layout issues`;
      case "standard":
        return `- All basic tests PLUS
- Input fuzzing: XSS, SQL injection, template injection payloads
- State manipulation: localStorage, cookies, console exposure
- Navigation edge cases: back button, direct URLs, refresh during load`;
      case "aggressive":
        return `- All standard tests PLUS
- Race conditions: double-click, concurrent submissions, rapid navigation
- Deep injection testing with encoded payloads
- Authorization bypass attempts
- Business logic edge cases: negative quantities, boundary values`;
    }
  }

  private getPayloadDocumentation(intensity: AdversarialConfig["intensity"]): string {
    const lines: string[] = [];

    lines.push(
      "**Universal Payloads**: empty string, whitespace, 10000-char string, null, undefined, NaN",
    );
    lines.push("**Special Characters**: <, >, &, \", ', null byte, newlines, tabs");

    if (intensity !== "basic") {
      lines.push("**XSS**: <script>alert(1)</script>, <img onerror=alert(1)>, event handlers");
      lines.push("**SQLi**: ' OR '1'='1' --, UNION SELECT, DROP TABLE");
      lines.push("**SSTI**: {{7*7}}, ${7*7}, <%= 7*7 %>");
      lines.push("**Path Traversal**: ../../../etc/passwd, encoded variants");
    }

    if (intensity === "aggressive") {
      lines.push("**Race Conditions**: rapid double-click, concurrent tab submissions");
      lines.push("**Auth Bypass**: direct URL access, cookie/session manipulation");
      lines.push("**Business Logic**: negative values, zero-price items, overflow values");
    }

    return lines.join("\n");
  }
}
