# Inspect v2.1 — Remaining Competitive Gaps (Tasks 101-160)

## From OSS Analysis: Missing Patterns

### Sensitive Data Masking
- [ ] 101. Create `SensitiveDataMasker` — strip passwords/tokens before sending to LLM
- [ ] 102. Support `sensitive_data: { password: "xxx" }` config
- [ ] 103. Auto-detect sensitive fields (password, token, secret, key)

### Judge LLM (verify task actually succeeded)
- [ ] 104. Create `JudgeLLM` class — separate LLM validates results
- [ ] 105. Judge prompt: "Did the agent actually accomplish the goal?"
- [ ] 106. Confidence scoring (0-1) on task completion

### Flash Mode (cheaper LLMs)
- [ ] 107. Create `FlashMode` — simplified output schema (action only, skip thinking)
- [ ] 108. Auto-detect flash-capable models
- [ ] 109. Config: `agent.flashMode: true`

### Message Compaction
- [ ] 110. Create `MessageCompactor` — compress old conversation history
- [ ] 111. Keep last N steps full, summarize older ones
- [ ] 112. Stay within model context window

### Custom Tool Registration
- [ ] 113. Create `ToolRegistry` for user-defined tools
- [ ] 114. Decorator pattern: `@tool("description")`
- [ ] 115. Inject custom tools into agent's available actions
- [ ] 116. Tests for custom tool registration

### Replan on Stall
- [ ] 117. Detect agent stalling (no progress for N steps)
- [ ] 118. Auto-generate new plan with different approach
- [ ] 119. Inject replan nudge into LLM context

### Captcha Solving Integration
- [ ] 120. Detect CAPTCHA type (reCAPTCHA, hCaptcha, image)
- [ ] 121. Integration with 2Captcha/Anti-Captcha API
- [ ] 122. Config: `captcha.solver: "2captcha"` with API key

### OTP/2FA Email Polling
- [ ] 123. Create `EmailOTPPoller` — poll inbox for OTP codes
- [ ] 124. Support IMAP/Gmail API
- [ ] 125. Auto-fill OTP field when code received

### Proxy & Geo-targeting
- [ ] 126. Per-session proxy support
- [ ] 127. Geo-targeted proxy (country code)
- [ ] 128. Proxy rotation on rate limit

### Domain Restriction (Security)
- [ ] 129. Create `DomainGuard` — restrict agent to allowed domains
- [ ] 130. Block navigation to unauthorized URLs
- [ ] 131. Config: `security.allowedDomains: ["example.com"]`

### File Upload Testing
- [ ] 132. Detect file upload inputs
- [ ] 133. Generate test files (PDF, image, CSV)
- [ ] 134. Test upload with various file types and sizes

### Drag and Drop
- [ ] 135. Implement drag-and-drop action via Playwright
- [ ] 136. Support drag by element ref or coordinates
- [ ] 137. Add to MCP tool definitions

### Prompt Caching (Anthropic/Google)
- [ ] 138. Cache static prompt parts across LLM calls
- [ ] 139. Reuse system prompt + page context tokens
- [ ] 140. Track cache hit rate and savings

### Cloud Browser Mode
- [ ] 141. Connect to remote CDP endpoint
- [ ] 142. Config: `browser.cdpUrl: "wss://..."`
- [ ] 143. Session management for cloud browsers

### Artifact Bundling
- [ ] 144. Bundle screenshots per step efficiently
- [ ] 145. Compress artifacts (gzip)
- [ ] 146. Link artifacts in report

### Agent Memory (cross-session learning)
- [ ] 147. Remember successful patterns across runs
- [ ] 148. Store learned selectors per domain
- [ ] 149. Prioritize previously successful actions

### Concurrent Multi-Page Testing
- [ ] 150. Open multiple tabs simultaneously
- [ ] 151. Agent switches between tabs for testing
- [ ] 152. Report per-tab results

### Network Interception
- [ ] 153. Mock API responses during testing
- [ ] 154. Block specific requests (ads, analytics)
- [ ] 155. Record HAR file during test

### Accessibility-First Execution
- [ ] 156. Use ARIA tree as primary (not DOM)
- [ ] 157. Fall back to vision only when ARIA insufficient
- [ ] 158. Config: `execution.mode: "aria" | "vision" | "hybrid"`

### Tests for Everything
- [ ] 159. Tests for SensitiveDataMasker
- [ ] 160. Tests for DomainGuard, MessageCompactor, JudgeLLM
