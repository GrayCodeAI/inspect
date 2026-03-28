# Inspect v2.0 — 100 Task Implementation Plan
# Based on deep analysis of Browser Use, Stagehand, Skyvern, Shortest, Playwright MCP, LaVague, Zerostep, Steel Browser

## Phase 1: Core Agent Intelligence (Tasks 1-20)

### Act Caching (save 90% tokens on repeat runs)
- [ ] 1. Create `ActionCache` class — hash(instruction + url) → cached action
- [ ] 2. Add cache storage backend (JSON files in `.inspect/cache/`)
- [ ] 3. Integrate cache lookup into agent loop (before LLM call)
- [ ] 4. Add cache replay with UI validation (verify element still exists)
- [ ] 5. Add cache invalidation (TTL, URL change, DOM change)
- [ ] 6. Write tests for ActionCache (10+ tests)

### Loop Detection (fix "Click Play" x4 problem)
- [ ] 7. Create `LoopDetector` class — track action hashes in rolling window
- [ ] 8. Detect repetition (same action 3x = loop)
- [ ] 9. Inject nudge message to LLM ("You seem stuck, try different approach")
- [ ] 10. Add max-loop-count config (default: 3)
- [ ] 11. Write tests for LoopDetector

### Two-Step Actions (fix dropdown/modal failures)
- [ ] 12. Detect when click triggers new elements (DOM diff)
- [ ] 13. Capture DOM diff after first action
- [ ] 14. Run second LLM call on only the new/changed elements
- [ ] 15. Handle multi-level menus (nested dropdowns)

### Fallback LLM (auto-switch on failure)
- [ ] 16. Add `fallbackProvider` config to agent options
- [ ] 17. Detect retriable errors (429, 500, timeout)
- [ ] 18. Auto-switch to fallback provider on failure
- [ ] 19. Switch back to primary after cooldown
- [ ] 20. Write tests for fallback logic

## Phase 2: Vision + DOM Fusion (Tasks 21-35)

### Annotated Screenshots (Skyvern-style)
- [ ] 21. Draw bounding boxes on screenshots with element IDs
- [ ] 22. Create `AnnotatedScreenshot` class
- [ ] 23. Send both screenshot + HTML to LLM (dual context)
- [ ] 24. Config: `vision: true/false/auto`
- [ ] 25. Only use vision when ARIA snapshot fails

### Hybrid DOM + Accessibility Snapshot (Stagehand-style)
- [ ] 26. Merge DOM tree + accessibility tree into unified structure
- [ ] 27. Add XPath + CSS selector generation per element
- [ ] 28. Add element visibility scoring
- [ ] 29. Add interactive element filtering with confidence
- [ ] 30. Format hybrid tree for LLM consumption

### Speculative Planning (30-40% faster)
- [ ] 31. Pre-snapshot page while current step executes
- [ ] 32. Pre-build LLM prompt for next step
- [ ] 33. If page didn't change unexpectedly, use pre-built prompt
- [ ] 34. Track hit rate for speculative plans
- [ ] 35. Config: `speculative: true/false`

## Phase 3: Reliability + Cost (Tasks 36-55)

### Test Run Caching (near-zero cost repeats)
- [ ] 36. Save entire successful test run as JSON
- [ ] 37. On repeat, replay each step with UI validation
- [ ] 38. If UI changed, fallback to fresh LLM call
- [ ] 39. Cache key: hash(url + instruction + device)
- [ ] 40. Add `--replay` CLI flag
- [ ] 41. Write tests for run caching

### Session Resume (crash recovery)
- [ ] 42. Checkpoint agent state after each step
- [ ] 43. Save checkpoint to `.inspect/checkpoints/`
- [ ] 44. On crash, detect incomplete run
- [ ] 45. Resume from last checkpoint
- [ ] 46. Add `--resume` CLI flag

### Token Budget Improvements
- [ ] 47. Show estimated cost BEFORE run starts
- [ ] 48. Real-time token counter in TUI during execution
- [ ] 49. Warning at 80% budget
- [ ] 50. Hard stop at 100% with graceful cleanup
- [ ] 51. Per-step token tracking in report

### Structured Output
- [ ] 52. Add `outputSchema` option (Zod schema)
- [ ] 53. Agent extracts typed data matching schema
- [ ] 54. Include structured output in report
- [ ] 55. Write tests for schema extraction

## Phase 4: Agent Loop Improvements (Tasks 56-70)

### Better Prompts
- [ ] 56. System prompt: add "you are testing, not browsing" context
- [ ] 57. Include previous step results in prompt (what worked/failed)
- [ ] 58. Add page type context (login page, form, listing, etc.)
- [ ] 59. Add error context (why last action failed)
- [ ] 60. Limit prompt size with smart truncation

### Smarter Step Execution
- [ ] 61. Wait for DOM to settle before taking action (MutationObserver)
- [ ] 62. Verify element is in viewport before clicking
- [ ] 63. Scroll element into view if needed
- [ ] 64. Handle overlays/modals blocking clicks
- [ ] 65. Dismiss cookie banners before testing

### Watchdog Integration
- [ ] 66. Wire captcha detection into agent loop
- [ ] 67. Wire popup auto-dismiss into agent loop
- [ ] 68. Wire crash detection with auto-restart
- [ ] 69. Wire download monitoring
- [ ] 70. Add watchdog status to progress output

## Phase 5: Output + Reporting (Tasks 71-85)

### Clean Output (Claude Code style)
- [ ] 71. Suppress all remaining sub-agent noise
- [ ] 72. Single-line progress for each step (icon + description + result)
- [ ] 73. Collapse verbose errors to one line + detail on expand
- [ ] 74. Show real-time token cost in status bar
- [ ] 75. Add elapsed time per step

### Report Improvements
- [ ] 76. Add screenshot gallery to HTML report
- [ ] 77. Add step-by-step timeline visualization
- [ ] 78. Add error root cause in report (from ErrorClassifier)
- [ ] 79. Add performance metrics (LCP, CLS) to report
- [ ] 80. Add responsive issues summary to report

### Export
- [ ] 81. Auto-export Playwright .spec.ts after each run
- [ ] 82. Export test plan as YAML workflow
- [ ] 83. Export results as GitHub PR comment
- [ ] 84. Export results as Slack message
- [ ] 85. Export results as JUnit XML (improve existing)

## Phase 6: CLI + DX (Tasks 86-95)

### Commands
- [ ] 86. `inspect run <url>` — simplified one-shot command
- [ ] 87. `inspect replay <report-id>` — replay from cached run
- [ ] 88. `inspect diff <url>` — only test changed components
- [ ] 89. `inspect export <report-id> --format playwright` — export to Playwright
- [ ] 90. `inspect cost` — show token usage history and costs

### Config
- [ ] 91. Load `inspect.config.ts` in all commands (use loadConfigAsync)
- [ ] 92. Add `agent.maxSteps` to config
- [ ] 93. Add `agent.cache: true/false` to config
- [ ] 94. Add `notifications.slack` to config
- [ ] 95. Add `ci.autoApprove` to config

## Phase 7: Testing + Quality (Tasks 96-100)

- [ ] 96. Tests for act caching (cache hit, miss, invalidation)
- [ ] 97. Tests for loop detection (detect, nudge, recover)
- [ ] 98. Tests for two-step actions (dropdown, modal)
- [ ] 99. Tests for fallback LLM (switch, coolback, recover)
- [ ] 100. Integration test: full pipeline URL → report with caching
