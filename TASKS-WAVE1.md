# Wave 1 Implementation Tasks - Active

**Goal:** Complete the foundation for a production-ready agent loop
**Timeline:** 8-10 weeks
**Status:** In Progress

---

## Phase 1: Agent Loop Core (Priority: CRITICAL)

### Task 1.1: Complete Agent Loop Implementation
**File:** `packages/agent/src/agent-loop/loop.ts` (exists, needs enhancement)
**Status:** 🔄 Partial - Core exists, needs full integration

**Missing pieces:**
- [ ] Step timeout with `Effect.timeout`
- [ ] Consecutive failure counter with `maxFailures` break
- [ ] Catch-all error handler delegating to `_handleStepError()`
- [ ] Page-change guard in `_executeActions()`
- [ ] `terminatesSequence` flag for navigation actions
- [ ] Runtime URL comparison after each action
- [ ] Runtime focus target comparison

### Task 1.2: Agent State Management
**File:** `packages/agent/src/agent-loop/state.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Define `AgentState` class with:
  - `nSteps`: number
  - `consecutiveFailures`: number
  - `lastResult`: ActionResult
  - `plan`: TestPlan
  - `loopDetector`: LoopDetectorState
  - `messageManagerState`: MessageManagerState
- [ ] Implement state clearing after context preparation
- [ ] Prevent stale data propagation

### Task 1.3: Agent Output Schema
**File:** `packages/agent/src/agent-loop/output.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Define `AgentOutput` Schema.Class with:
  - `brain`: AgentBrain
  - `actions`: AgentAction[]
  - `plan`: Optional plan update
- [ ] Implement dynamic action model extension
- [ ] Filter actions by page URL domain patterns

### Task 1.4: Message Manager
**File:** `packages/agent/src/agent-loop/messages.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Context window management with threshold detection
- [ ] Message compaction when context grows past threshold
- [ ] LLM-based summarization of old history
- [ ] Keep last N steps intact during compaction

---

## Phase 2: Structured Thinking (Priority: HIGH)

### Task 2.1: AgentBrain Implementation
**File:** `packages/shared/src/types/agent.ts` (exists, needs AgentBrain)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Define `AgentBrain` schema with:
  - `evaluation`: Previous goal success/failure
  - `memory`: Important observations to persist
  - `nextGoal`: What to do next
- [ ] Inject AgentBrain fields into every LLM call prompt
- [ ] Validate AgentBrain output schema on every response

### Task 2.2: Flash Mode
**File:** `packages/agent/src/agent-loop/flash-mode.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Strip thinking fields (evaluation, nextGoal) for token savings
- [ ] Keep only memory + action in flash mode
- [ ] Add flash mode toggle in agent settings

### Task 2.3: Nudge Injection System
**File:** `packages/agent/src/agent-loop/nudges.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Define escalating nudge messages (5, 8, 12 repetitions)
- [ ] Nudge 1: Gentle reminder of goal
- [ ] Nudge 2: Suggest different approach
- [ ] Nudge 3: Force different action type
- [ ] Planning nudge injection when no plan exists

---

## Phase 3: LLM Integration (Priority: HIGH)

### Task 3.1: Retry & Fallback
**File:** `packages/agent/src/agent-loop/llm.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] `_getLLMWithRetry()` with exponential backoff
- [ ] `_trySwitchToFallbackLLM()` on rate-limit/provider errors
- [ ] Register fallback LLM for token cost tracking
- [ ] Structured output validation on LLM responses
- [ ] Retry empty actions once, then insert safe "done" noop

### Task 3.2: Token & Cost Tracking
**File:** `packages/agent/src/agent-loop/tracking.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Token usage tracking per LLM call
- [ ] Cost tracking per LLM call (provider-specific pricing)
- [ ] Prompt caching with freeze mask
- [ ] Freeze mask for previously-rendered observations
- [ ] Prompt cache stability across steps

### Task 3.3: Speculative Planning Execution
**File:** `packages/agent/src/speculative/executor.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Pre-compute next LLM call while current action executes
- [ ] Run next step's scrape + LLM concurrently with current action
- [ ] `SpeculativePlan` dataclass with scraped page, prompt, response

---

## Phase 4: History & Trajectory (Priority: MEDIUM)

### Task 4.1: History Recording
**File:** `packages/agent/src/agent-loop/history.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Define `AgentHistory` with:
  - `modelOutput`: LLM response
  - `results`: Action results
  - `browserState`: Page state snapshot
  - `metadata`: Timing, tokens, cost
- [ ] Define `AgentHistoryList` with 30+ query methods
- [ ] Implement `urls()`, `screenshots()`, `errors()`, `actions()`
- [ ] Implement `stepDurations()`, `totalDuration()`, `tokenUsage()`, `cost()`

### Task 4.2: History Persistence
**File:** `packages/agent/src/agent-loop/persistence.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Persist history to disk after each step
- [ ] History compression for long runs
- [ ] History pruning — keep only last N steps in memory
- [ ] History export to JSONL format

### Task 4.3: History Replay
**File:** `packages/agent/src/agent-loop/replay.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] `rerunHistory()` — replay saved history
- [ ] 5-level element matching: exact hash, stable hash, xpath, ax_name, attribute
- [ ] Exponential backoff retries during replay
- [ ] AI summary generation after replay

---

## Phase 5: Browser Understanding (Priority: HIGH)

### Task 5.1: Multi-Tree DOM Collection
**File:** `packages/browser/src/dom/multi-tree.ts` (exists, verify completeness)
**Status:** ✅ Implemented - verify against PLAN.md tasks 221-260

**Verification checklist:**
- [x] `_getAllTrees()` — fire 3 CDP requests in parallel
- [x] `DOMSnapshot.captureSnapshot` — layout, paint order, DOM rects
- [x] `DOM.getDocument` — full DOM tree
- [x] `Accessibility.getFullAXTree` — accessibility tree
- [x] 10s timeout per CDP request
- [x] Single retry with 2s timeout
- [x] Viewport ratio detection
- [x] JS click listener detection

### Task 5.2: Enhanced DOM Tree
**File:** `packages/browser/src/dom/element-tree.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] `EnhancedDOMTreeNode` merging DOM + AX + Snapshot data
- [ ] DOM data: tag, attributes, styles
- [ ] AX data: role, name, description
- [ ] Snapshot data: bounds, paint order, computed styles
- [ ] `_constructEnhancedNode()` — recursive tree builder
- [ ] Track absolute positions across iframe coordinate systems
- [ ] Handle shadow DOM, content documents, cross-origin iframes

### Task 5.3: Visibility & Interactability
**File:** `packages/browser/src/dom/visibility.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Compute visibility using CSS styles + viewport intersection
- [ ] `isElementVisibleAccordingToAllParents()`
- [ ] Check CSS display, visibility, opacity properties
- [ ] Viewport bounds with configurable threshold (1000px beyond)
- [ ] Iframe depth limit (default 5)
- [ ] Iframe quantity limit (default 100)

### Task 5.4: Serializer
**File:** `packages/browser/src/dom/serializer.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Filter out non-displayable nodes (style, script, SVG decorative)
- [ ] Remove elements hidden behind others
- [ ] Remove elements outside viewport
- [ ] Assign numeric `[index]` to clickable elements
- [ ] Generate selector map mapping element indices to nodes
- [ ] Format output as indented text outline: `[index] role: name`

---

## Phase 6: Vision-First (Priority: HIGH)

### Task 6.1: Screenshot Capture
**File:** `packages/browser/src/vision/screenshot-capture.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] DPR-normalized screenshots
- [ ] Resize screenshots by `devicePixelRatio` before sending to LLM
- [ ] Convert coordinates back after LLM returns click positions

### Task 6.2: Bounding Box Overlay
**File:** `packages/browser/src/vision/bounding-box-overlay.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Draw numbered boxes around interactable elements on screenshots
- [ ] Different box colors for different element types
- [ ] Box transparency for readability

### Task 6.3: Coordinate Transformation
**File:** `packages/browser/src/vision/coordinate-transform.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Map LLM coordinates to Playwright clicks
- [ ] Handle DPR scaling in coordinate transformation
- [ ] Handle iframe coordinate offsets
- [ ] Handle scroll position in coordinate transformation

---

## Phase 7: Stability Detection (Priority: MEDIUM)

### Task 7.1: Stability Detector
**File:** `packages/browser/src/stability/detector.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Network stability monitoring
- [ ] Monitor relevant requests: document, CSS, JS, images, fonts, XHR
- [ ] Filter out analytics, ad requests, WebSocket
- [ ] Wait for 500ms of no relevant activity
- [ ] Visual stability: screenshots at 100ms intervals
- [ ] Pixel diff with `sharp` library
- [ ] 3 consecutive stable frames below 0.01 difference

### Task 7.2: Tab Manager
**File:** `packages/browser/src/tabs/manager.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Multi-tab management
- [ ] Inject `__tabActivityTime` into each page
- [ ] Poll activity every 200ms
- [ ] Auto-switch to most recently active tab
- [ ] Track tab creation, close events

---

## Phase 8: Dynamic Action System (Priority: MEDIUM)

### Task 8.1: Tool Registry Enhancement
**File:** `packages/agent-tools/src/actions/registry.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Dynamic action model creation
- [ ] Action registration via decorator pattern
- [ ] Signature normalization
- [ ] Separate "special params" from "action params"
- [ ] Auto-generate param model from signature

### Task 8.2: Domain Filtering
**File:** `packages/agent-tools/src/actions/domains.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Dynamic Union of individual action models
- [ ] Each action becomes single-field model
- [ ] Wrap Union in RootModel with `getIndex()`/`setIndex()`
- [ ] Domain-filtered actions
- [ ] Actions declare `domains`/`allowedDomains`

### Task 8.3: Special Parameter Injection
**File:** `packages/agent-tools/src/actions/injection.ts` (NEW)
**Status:** ⏳ Not started

**Requirements:**
- [ ] Inject `browserSession` into actions that declare it
- [ ] Inject `pageExtractionLLM` into actions that declare it
- [ ] Inject `fileSystem` into actions that declare it
- [ ] Inject `availableFilePaths` into actions that declare it
- [ ] Inject `pageUrl` into actions that declare it
- [ ] Sensitive data replacement at execution time

---

## Summary

| Phase | Tasks | Priority | Est. Time |
|-------|-------|----------|-----------|
| 1. Agent Loop | 4 | CRITICAL | 2 weeks |
| 2. Structured Thinking | 3 | HIGH | 1 week |
| 3. LLM Integration | 3 | HIGH | 2 weeks |
| 4. History | 3 | MEDIUM | 1 week |
| 5. Browser DOM | 4 | HIGH | 2 weeks |
| 6. Vision-First | 3 | HIGH | 1 week |
| 7. Stability | 2 | MEDIUM | 1 week |
| 8. Dynamic Actions | 3 | MEDIUM | 1 week |
| **Total** | **25** | | **11 weeks** |

---

## Current Status

- [x] P0 Features: 10/10 complete
- [x] Core agent loop scaffold: Complete
- [x] Speculative planning: Complete
- [x] Self-healing: Complete
- [x] Action caching: Complete
- [x] Multi-tree DOM: Complete
- [x] Vision screenshots: Complete
- [x] Coordinate interaction: Complete

### Next Actions:
1. Implement Agent State management
2. Complete Agent Output schema with AgentBrain
3. Build Message Manager with compaction
4. Implement history recording and persistence
5. Enhance browser DOM with visibility detection
