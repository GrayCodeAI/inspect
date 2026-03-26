// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Security Specialist Prompt
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Security specialist system prompt supplement.
 * When active, the agent performs security-focused testing.
 */
export const SECURITY_SPECIALIST_PROMPT = `## Security Specialist Mode

You are also acting as a security testing specialist. In addition to functional testing, probe for:

### Input Validation
- Test all input fields with XSS payloads: \`<script>alert(1)</script>\`, \`" onmouseover="alert(1)\`, \`javascript:alert(1)\`
- Test SQL injection: \`' OR '1'='1\`, \`'; DROP TABLE--\`, \`1 UNION SELECT\`
- Test command injection: \`; ls -la\`, \`| cat /etc/passwd\`, \`\$(whoami)\`
- Test path traversal: \`../../../etc/passwd\`, \`..\\..\\..\\windows\\system32\`
- Test SSTI: \`{{7*7}}\`, \`\${7*7}\`, \`<%= 7*7 %>\`
- Check for NoSQL injection: \`{"$gt": ""}\`, \`{"$ne": null}\`

### Authentication & Authorization
- Test login with common default credentials
- Check session management (cookie flags: HttpOnly, Secure, SameSite)
- Verify CSRF tokens are present on state-changing requests
- Test for IDOR by modifying resource IDs in URLs
- Check if password reset tokens are predictable
- Verify logout actually invalidates the session

### HTTP Security Headers
- Check for: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options
- Verify Strict-Transport-Security is set
- Check Referrer-Policy and Permissions-Policy
- Look for information leakage in Server/X-Powered-By headers

### Data Exposure
- Check if sensitive data appears in URLs
- Look for PII in page source or JavaScript
- Check if API responses include unnecessary fields
- Verify error pages don't leak stack traces or internal paths
- Check for exposed source maps

### Client-Side Security
- Check for sensitive data in localStorage/sessionStorage
- Look for credentials in JavaScript source
- Verify Content Security Policy blocks inline scripts
- Check for prototype pollution vectors
- Look for unsafe eval() or innerHTML usage

### Business Logic
- Test for race conditions in critical operations (payments, stock)
- Check if client-side validation can be bypassed
- Test negative values in quantities/amounts
- Verify rate limiting on sensitive endpoints
- Check for mass assignment vulnerabilities

### Reporting
For each security finding, provide:
- **Severity**: critical / high / medium / low / informational
- **OWASP Category**: e.g., A01:2021 - Broken Access Control
- **CWE ID**: if applicable
- **Evidence**: exact payload and response
- **Remediation**: specific fix recommendation`;

/**
 * Common XSS payloads for testing.
 */
export const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '"><script>alert("XSS")</script>',
  "'\"><img src=x onerror=alert('XSS')>",
  '<svg onload=alert("XSS")>',
  "javascript:alert('XSS')",
  '<img src="x" onerror="alert(\'XSS\')">',
  "<body onload=alert('XSS')>",
  '"><iframe src="javascript:alert(\'XSS\')">',
  "'-alert('XSS')-'",
  "${alert('XSS')}",
  "{{constructor.constructor('alert(1)')()}}",
] as const;

/**
 * Common SQL injection payloads.
 */
export const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "' UNION SELECT NULL--",
  "1' ORDER BY 1--",
  "' AND 1=1--",
  "' AND 1=2--",
  "admin'--",
  "' WAITFOR DELAY '0:0:5'--",
  "1; SELECT pg_sleep(5)--",
] as const;

/**
 * Security headers to check.
 */
export const REQUIRED_SECURITY_HEADERS = [
  { name: "Content-Security-Policy", description: "Prevents XSS and data injection" },
  { name: "X-Frame-Options", description: "Prevents clickjacking", expected: "DENY" },
  { name: "X-Content-Type-Options", description: "Prevents MIME sniffing", expected: "nosniff" },
  { name: "Strict-Transport-Security", description: "Forces HTTPS" },
  { name: "Referrer-Policy", description: "Controls referrer information" },
  { name: "Permissions-Policy", description: "Controls browser features" },
] as const;

/**
 * Build a security-focused test instruction.
 */
export function buildSecurityInstruction(baseInstruction: string, focusAreas?: string[]): string {
  const focus = focusAreas?.length
    ? `\nFocus areas: ${focusAreas.join(", ")}`
    : "";

  return `${baseInstruction}

Additionally, while performing this test:
1. Test all input fields with injection payloads
2. Check HTTP security headers on each page load
3. Verify authentication and authorization at each step
4. Look for sensitive data exposure in responses
5. Note any client-side security issues in the page source${focus}`;
}
