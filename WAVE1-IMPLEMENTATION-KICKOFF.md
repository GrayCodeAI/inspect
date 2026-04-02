# Wave 1 Implementation Kickoff
**Date:** 2026-04-02  
**Phase:** Foundation (Weeks 1-10)  
**Status:** Build blockers RESOLVED → Ready for Code Implementation

---

## Quick Status

✅ **Build Blockers Fixed** (export/import issues)  
⚠️ **Code Implementation Issues Found** (agent-loop files need fixes)  
📋 **140 tasks remaining** to complete Wave 1  
📊 **3,500 LOC** to write

---

## Critical Issues to Fix (This Week)

### Priority 1: Fix agent-loop Implementation Files

These files have syntax and type errors that need immediate fixes:

#### 1. `packages/agent/src/agent-loop/brain.ts` (Line 152)
**Error:** `A spread argument must either have a tuple type or be passed to a rest parameter`
```typescript
// Current (broken):
// Line 152 - spread argument issue in function call
```
**Fix:** Review spread argument usage, ensure tuple/rest parameter compatibility

#### 2. `packages/agent/src/agent-loop/history.ts` (Multiple Lines)
**Errors:**
- Line 17, 19, 56, 290: Wrong argument count for Effect.Service methods
- Lines 291-301: Properties not initialized (add/getAll/getLast/atStep/urls/etc)
- Line 304: Parameter 'entry' has implicit any type

**Root Cause:** History class is using Effect.Service but not properly constructing the service

**Fix:**
```typescript
// This class needs to properly implement Effect.Service pattern
// OR convert to standard class with Effect usage

class History {
  // Properties should be initialized OR declared as ! 
  add!: (entry: HistoryEntry) => Effect<void>;
  getAll!: () => HistoryEntry[];
  // ... etc
}
```

#### 3. `packages/agent/src/agent-loop/llm-integration.ts` (Multiple Lines)
**Errors:**
- Line 41: `Schedule.upTo()` doesn't exist
- Line 46, 69, 78, 129, 160, 357: `LLMProvider.chat()` doesn't exist
- Line 72: `Effect.catchAll()` doesn't exist  
- Line 168: `for await` not in async context
- Type mismatch issues with Effect generics

**Root Cause:** LLMProvider interface is from @inspect/llm but has different method names

**Fix:** Check actual LLMProvider interface in @inspect/llm/src/index.ts, update method calls

#### 4. `packages/agent/src/agent-loop/loop-full.ts` (Lines 8-9, 55)
**Errors:**
- Line 8: Missing `Either` export from effect
- Line 9: Cannot find 'playwright' module
- Line 55: Wrong argument count (Expected 2-3, got 1)

**Fix:**
- Use `Effect.Either` or `Result` instead of `Either`
- Replace Playwright import with type definition (like healer.ts/planner.ts)
- Check Effect.Service constructor call signature

---

## Implementation Order for Wave 1

### Week 1: Fix & Validate (Days 1-5)
1. **Day 1-2:** Fix agent-loop implementation files
   - brain.ts spread argument issue
   - history.ts Effect.Service pattern
   - llm-integration.ts method names and scheduling
   - loop-full.ts Either/Playwright issues

2. **Day 3:** Verify build passes
   ```bash
   pnpm build
   pnpm test
   ```

3. **Day 4-5:** Begin agent-loop phases implementation
   - Start with simpler phases (act, finalize)
   - Then thinking and observing

### Week 2-3: Agent Loop Phases (Tasks 121-150)
Complete the four phases of the agent loop:

1. **prepare** phase (30-50 LOC)
   - Load memory from cache
   - Set up initial state
   - Extract goal from task

2. **think** phase (100-150 LOC)
   - Process observations
   - Plan next action
   - Evaluate confidence

3. **act** phase (80-120 LOC)
   - Execute planned action
   - Record result
   - Update state

4. **finalize** phase (50-80 LOC)
   - Update history
   - Save observations
   - Reset state

**Files to create/update:**
- agent-loop/phases/prepare.ts
- agent-loop/phases/think.ts
- agent-loop/phases/act.ts
- agent-loop/phases/finalize.ts
- agent-loop/index.ts (export phases)

### Week 4-5: LLM Integration (Tasks 166-190)
Implement retry logic, fallback chains, structured output parsing:

1. **Structured Output Parsing** (80-100 LOC)
   - Parse AgentBrain schema from LLM response
   - Validate JSON structure
   - Extract thinking, evaluation, nextGoal

2. **Token Budgeting** (60-80 LOC)
   - Track tokens used
   - Enforce budget limits
   - Warn at thresholds

3. **Retry & Fallback** (120-160 LOC)
   - Retry with exponential backoff
   - Fallback to secondary provider
   - Handle rate limits

4. **Streaming Support** (40-60 LOC)
   - Process tokens as they arrive
   - Build response incrementally
   - Support streaming APIs

**Files to create:**
- agent-loop/llm-integration/parsing.ts
- agent-loop/llm-integration/budgeting.ts
- agent-loop/llm-integration/retry.ts
- agent-loop/llm-integration/streaming.ts

### Week 6: Message Manager (Tasks 144-150)
Implement context window management:

1. **Message Compaction** (100-150 LOC)
   - Remove redundant observations
   - Summarize old interactions
   - Preserve important context

2. **History Truncation** (60-80 LOC)
   - Keep recent N steps
   - Archive older steps
   - Load on demand

**Files to create:**
- agent-memory/src/message-manager.ts
- agent-memory/src/compaction.ts

### Week 7-8: Browser DOM Enhancements (Tasks 240-290)
Improve page understanding:

1. **Visibility Detection** (100-120 LOC)
   - Check viewport visibility
   - Detect scrolled-out elements
   - Filter non-visible elements

2. **Interactability Checks** (80-100 LOC)
   - Test element clickability
   - Detect disabled states
   - Check pointer events

3. **Form Context** (60-80 LOC)
   - Extract form field relationships
   - Understand form structure
   - Identify required fields

**Files to create:**
- browser/src/dom/visibility.ts
- browser/src/dom/interactability.ts
- browser/src/dom/form-context.ts

### Week 9-10: Stability Detection (Tasks 291-320)
Implement two-phase stability checking:

1. **Network Stability** (80-100 LOC)
   - Monitor network requests
   - Detect complete network idle
   - Track XHR/fetch completion

2. **Visual Stability** (80-100 LOC)
   - Compare DOM snapshots
   - Detect layout thrashing
   - Track visual changes

3. **Combined Check** (40-60 LOC)
   - Use both phases
   - Timeout gracefully
   - Report stability status

**Files to create:**
- browser/src/stability/network-detector.ts
- browser/src/stability/visual-detector.ts
- browser/src/stability/combined.ts

---

## Expected Progress Timeline

| Week | Phase | Files | LOC | Status |
|------|-------|-------|-----|--------|
| 1 | Bug fixes & validation | 4 fixed | 200 | In Progress |
| 2-3 | Agent loop phases | 4 new | 350 | Pending |
| 4-5 | LLM integration | 4 new | 500 | Pending |
| 6 | Message manager | 2 new | 250 | Pending |
| 7-8 | DOM enhancements | 3 new | 360 | Pending |
| 9-10 | Stability detection | 3 new | 350 | Pending |
| **TOTAL** | **Wave 1 Complete** | **~20 files** | **~3,500** | **25% → 100%** |

---

## Key Code Patterns to Follow

### 1. Effect-TS Service Pattern (for browser context)
```typescript
import { Effect, Schema, Layer } from "effect";

export class MyService extends Schema.Class<MyService>("MyService")({
  field1: Schema.String,
  field2: Schema.Number,
}) {
  static readonly layer = Layer.effect(this, this.makeDefault);
  
  static readonly make = Effect.gen(function* () {
    return new MyService({ field1: "value", field2: 0 });
  });
}
```

### 2. Async Browser Operations
```typescript
// Use page.evaluate() for browser context
async function captureState(page: Page): Promise<PageState> {
  return page.evaluate(() => ({
    url: window.location.href,
    // window/document only exist here
  }));
}
```

### 3. Type-Safe LLM Calls
```typescript
// With structured output parsing
const response = await llm.chat(messages);
const parsed = AgentBrain.decode(response.content);
// parsed is typed AgentBrain with thinking, evaluation, nextGoal
```

---

## Testing Strategy

### Unit Tests (Weeks 1-8)
- Test each phase independently
- Mock browser/LLM for speed
- Target 80%+ coverage

### Integration Tests (Weeks 5-9)
- Test agent loop end-to-end
- Use real browser (Playwright)
- Real LLM calls (with rate limits)

### E2E Tests (Week 10)
- Full agent test on real website
- Measure latency, accuracy
- Validate all components

---

## Success Criteria for Wave 1

✅ **Code Quality:**
- All files compile without errors
- TypeScript strict mode passes
- No `any` types (use `unknown` + narrowing)

✅ **Functionality:**
- Agent loop executes 4 phases correctly
- LLM integration with retry/fallback works
- Message manager compaction reduces context by 30%+

✅ **Testing:**
- 100+ unit tests, all passing
- 10+ integration tests covering critical paths
- E2E test: agent completes 5/10 simple tasks

✅ **Documentation:**
- Inline code comments for complex logic
- Architecture overview in README
- Example usage in docs/

---

## Unblocked Dependencies

These are now ready to start in parallel once agent-loop is fixed:

1. **browser package enhancements** (visibility, interactability, form context)
2. **agent-memory enhancements** (message manager, compaction)
3. **Tests for all new code**

---

## Next Immediate Actions

1. **Today:**
   - [ ] Read and understand agent-loop/*.ts file structure
   - [ ] Identify exact line numbers and fixes needed

2. **Tomorrow:**
   - [ ] Apply fixes to brain.ts, history.ts, llm-integration.ts, loop-full.ts
   - [ ] Verify build passes

3. **This Week:**
   - [ ] Begin agent loop phases implementation
   - [ ] Write unit tests for each phase

---

## Resources & References

### Related Files
- `PLAN.md` - Overall 1,700 task plan
- `PROJECT-ASSESSMENT-2026-04-02.md` - Full assessment
- `BUILD-FIX-PLAN.md` - Export/import fixes (COMPLETED)

### OSS Patterns to Reference
- **browser-use** - Agent loop phases, AgentBrain pattern
- **Skyvern** - Speculative planning, vision-first
- **Stagehand** - Self-healing, DOM understanding

### Documentation
- Effect-TS: https://effect.website
- Playwright: https://playwright.dev
- Claude API: https://docs.anthropic.com

---

## Velocity Estimates

**Based on complexity and team size:**

| Scenario | Velocity | Wave 1 Completion |
|----------|----------|-------------------|
| 1 developer (experienced) | 350 LOC/day | Week 10-11 |
| 2 developers | 450 LOC/day | Week 8-9 |
| 3 developers (parallel) | 600 LOC/day | Week 6-7 |

---

**Status:** Ready to implement. First step: fix agent-loop code issues.  
**ETA to Wave 1 completion:** 8-10 weeks with 1-2 developers  
**ETA to Production (Waves 1-3):** 24 weeks total
