# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes |
| 0.2.x   | Yes |
| < 0.2   | No  |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email: security@graycode.ai

### Response Timeline
- Acknowledgment: 48 hours
- Initial assessment: 5 business days
- Fix: 7-30 days depending on severity

## Security Considerations

- inspect makes HTTP requests to user-specified URLs
- SSRF protection blocks private IP ranges by default (WithBlockPrivateIPs)
- Rate limiting prevents accidental DoS of target sites
- No credentials are stored by the library
- Browser engine (rod) is an optional sub-module with separate security surface
- Crawled page content is processed locally, never transmitted externally
