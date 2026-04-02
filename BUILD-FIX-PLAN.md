# Build Error Fix Plan
**Date:** 2026-04-02  
**Status:** CRITICAL BLOCKER  
**Effort:** ~1 hour

---

## Problem Summary

The `@inspect/agent` package has 50+ TypeScript compilation errors:

1. **Missing exports from agent-tools** (10+ types)
2. **Duplicate identifiers** in agent/index.ts exports
3. **Type mismatches** between packages
4. **Browser APIs in Node** environment

---

## Root Causes

### Issue 1: Missing Exports in agent-tools/src/index.ts

The index.ts only exports from 4 files but 7+ files have public APIs:

**Currently exported:**
- tools-service.js
- loop-detector/index.js
- actions/index.js
- judge/index.js

**Missing exports:**
- loop/index.js (ActionRecord, LoopDetection, LoopNudge, ActionLoopConfig, ActionLoopNudge, ReplanConfig, ReplanResult)
- tools/token-tracker.ts (TokenBudget, TokenUsageEntry, TokenSummary, TokenTracker)
- tools/judge.ts (JudgeInput, JudgeVerdict, etc.)

### Issue 2: Duplicate Exports in agent/index.ts

**Lines 39 & 240-245:** ActionCache duplicated
**Lines 49 & 241:** CachedAction duplicated
**Lines 93 & 208:** ActionRecord duplicated
**Lines 7-30 & 210:** LLMProvider duplicated

### Issue 3: Browser APIs in Node Context

**Files:**
- agent/src/self-healing/healer.ts — imports 'playwright', references window/document
- agent/src/speculative/planner.ts — imports 'playwright', references window/document

**Problem:** These files execute in Node.js, not browser context. The window/document references should either:
1. Be conditional (only in browser mode)
2. Be removed (not needed)
3. Be moved to a browser-context module

---

## Fix Steps

### Step 1: Update agent-tools/src/index.ts

Add missing exports:

```typescript
// File: packages/agent-tools/src/index.ts

export * from "./tools-service.js";
export * from "./loop-detector/index.js";
export * from "./actions/index.js";
export * from "./judge/index.js";
export * from "./loop/index.js";  // ADD THIS
export * from "./tools/token-tracker.js";  // ADD THIS
```

### Step 2: Update agent/src/index.ts

Remove duplicate exports:

**DELETE:** Lines 93-99 (duplicate ActionRecord, LoopDetection, LoopNudge, etc.)
- These are already exported from @inspect/agent-tools above

**DELETE:** Lines 239-245 (duplicate ActionCache, CachedAction)
- These should come from @inspect/agent-memory or be removed if unused

**DELETE:** Line 210 (duplicate LLMProvider)
- Already exported from @inspect/llm

### Step 3: Fix Browser API References

**Option A - Conditional Imports (Recommended)**

In healer.ts and planner.ts, wrap browser API usage:

```typescript
// Before: 
import type { Page } from 'playwright';

// After:
let playwright: typeof import('playwright') | null = null;
if (typeof window === 'undefined') {
  // Node.js environment
  playwright = null;
} else {
  // Browser environment
  playwright = require('playwright');
}
```

**Option B - Remove if Unnecessary**

Check if window/document usage is actually needed:
- healer.ts line 119-193: Check if injected code is necessary
- planner.ts line 94-113: Check if DOM queries are necessary

If they're for analyzing page state, they should be in a browser context module, not healer.ts.

### Step 4: Fix TypeScript Config

Ensure DOM lib is available when needed:

```json
// tsconfig.json at packages/agent level
{
  "compilerOptions": {
    "lib": ["ES2020", "DOM"],  // Add DOM if using window/document
    "target": "ES2020"
  }
}
```

OR

Remove DOM references from Node-only files.

---

## Execution Order

1. **Highest Priority:** Update agent-tools/src/index.ts (fixes 10 export errors)
2. **High Priority:** Remove duplicate exports from agent/index.ts (fixes 5 errors)
3. **High Priority:** Fix browser API references in healer.ts & planner.ts
4. **Check:** Verify Effect.js version compatibility

---

## Files to Modify

| File | Changes | Effort |
|------|---------|--------|
| packages/agent-tools/src/index.ts | Add 2 export lines | 2 min |
| packages/agent/src/index.ts | Remove ~8 duplicate lines | 5 min |
| packages/agent/src/self-healing/healer.ts | Conditional imports or removal | 15 min |
| packages/agent/src/speculative/planner.ts | Conditional imports or removal | 15 min |
| packages/agent/tsconfig.json | Update lib if needed | 2 min |

**Total Effort:** ~40 minutes

---

## Verification

After fixes, run:

```bash
pnpm build

# Should see:
# ✓ @inspect/agent builds successfully
# ✓ All 37 packages compile
```

Run tests to confirm no regressions:

```bash
npx vitest run
```

---

## Detailed Changes Required

### 1. packages/agent-tools/src/index.ts

**Current:**
```typescript
export * from "./tools-service.js";
export * from "./loop-detector/index.js";
export * from "./actions/index.js";
export * from "./judge/index.js";
```

**New:**
```typescript
export * from "./tools-service.js";
export * from "./loop-detector/index.js";
export * from "./loop/index.js";  // ADD: LoopDetection, LoopNudge, ActionRecord, ActionLoopConfig, ActionLoopNudge, ReplanConfig, ReplanResult
export * from "./actions/index.js";
export * from "./judge/index.js";
export * from "./tools/token-tracker.js";  // ADD: TokenBudget, TokenUsageEntry, TokenSummary, TokenTracker
```

### 2. packages/agent/src/index.ts

**Remove from lines 87-99:**
```typescript
  type TokenBudget,
  type TokenUsageEntry,
  type TokenSummary,
  type JudgeInput,
  type JudgeVerdict,
  type UserToolDefinition,
  type ActionRecord,  // DUPLICATE
  type LoopDetection,  // DUPLICATE
  type LoopNudge,  // DUPLICATE
  type ActionLoopConfig,  // DUPLICATE
  type ActionLoopNudge,  // DUPLICATE
  type ReplanConfig,  // DUPLICATE
  type ReplanResult,  // DUPLICATE
```

**Remove from lines 239-245:**
```typescript
  ActionCache,  // DUPLICATE
  type CachedAction,  // DUPLICATE
```

**Remove line 210:**
```typescript
  type LLMProvider,  // DUPLICATE from @inspect/llm
```

### 3. packages/agent/src/self-healing/healer.ts

**Option 1: Remove Playwright import** (if not actually used)
```typescript
// Remove: import type { Page } from "playwright";
```

**Option 2: Conditional Import**
```typescript
let playwright: any = null;
try {
  if (typeof window === 'undefined') {
    playwright = require('playwright');
  }
} catch {
  // Playwright not available
}
```

### 4. packages/agent/src/speculative/planner.ts

Same as healer.ts — either remove or make conditional.

---

## Expected Outcome

After applying all fixes:
- ✅ @inspect/agent compiles successfully
- ✅ All 37 packages build without errors
- ✅ Type checking passes
- ✅ No duplicate identifier warnings
- ✅ Ready to proceed with development

---

## Next Steps After Build Fix

1. Run `pnpm test` to verify no regressions
2. Start Phase 1 work (agent loop completion)
3. Update IMPLEMENTATION-PROGRESS.md with new status
