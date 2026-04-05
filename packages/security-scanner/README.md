# @inspect/security-scanner

Security scanning for web applications. Detects common vulnerabilities (XSS, CSRF, insecure headers, etc.) during inspect test runs.

## Usage

```ts
import { SecurityScanner } from "@inspect/security-scanner/security-scanner.js";
```

## Key Exports

- `SecurityScanner` — runs security audits against pages
- `VulnerabilityReport` — schema for security findings
