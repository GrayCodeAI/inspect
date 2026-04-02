# Inspect: Quick Start Reference (2026-04-02)

## 📊 One-Page Summary

| Metric | Value |
|--------|-------|
| **Project Status** | 7% complete (120/1,700 tasks) |
| **Code Remaining** | ~23,000 LOC |
| **P0 Complete** | 10/10 ✅ |
| **Wave 1 Status** | 50/190 (26%) |
| **Timeline** | 10 weeks (Wave 1) → 24 weeks (Production) |
| **Parallel Developers** | 3-4 recommended |
| **Critical Path** | Phase 0 (2-3 hr) → Phase 1 (10 min) → Phases 2-9 (10 weeks) |

---

## 🎯 Next 7 Days

### Day 1-2: Phase 0 (Code Fixes)
```bash
# Files to fix:
1. packages/agent/src/agent-loop/brain.ts (line 152)
2. packages/agent/src/agent-loop/history.ts (lines 17, 19, 56, 290-301)
3. packages/agent/src/agent-loop/llm-integration.ts (multiple)
4. packages/agent/src/agent-loop/loop-full.ts (lines 8-9, 55)

# Estimated time: 2-3 hours
# See: ACTION-ITEMS-IMMEDIATE.md (Section "Critical Issues to Fix")
```

### Day 2: Phase 1 (Build Verification)
```bash
pnpm build          # All 37 packages must build ✅
npx vitest run      # 1,600+ tests must pass ✅
npm run lint        # 0 errors ✅
```

### Day 3-7: Phases 2-6 (Start Main Development)
```
Start in parallel:
- Dev-A: Phase 2 #3 (Finalize) + Phase 3 #4 (Act)
- Dev-B: Phase 6 #7 (LLM Retry)
- Dev-C: Phase 7 #8 (Memory Manager)
```

---

## 📚 Essential Documents (Read in Order)

1. **CLAUDE.md** (project conventions)
2. **ACTION-ITEMS-IMMEDIATE.md** (next 6 hours)
3. **IMPLEMENTATION-ROADMAP-2026-04-02.md** (10-week plan)
4. **STATUS-PARALLEL-EXECUTION.md** (this doc)
5. **WAVE1-IMPLEMENTATION-KICKOFF.md** (detailed implementation)

---

## 🚀 Commands Cheat Sheet

```bash
# Install & Build
pnpm install
pnpm build

# Run Tests
npx vitest run          # All tests
npx vitest              # Watch mode
npx vitest run --coverage  # With coverage

# Run Specific Package
pnpm build --filter @inspect/agent
npx vitest @inspect/agent

# Lint & Format
npm run lint
npm run format

# CLI
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js doctor
```

---

## 📋 10-Week Timeline (Wave 1)

```
Week 1:    Phase 0-1  (Code fixes + Build)           ✅ Critical
Week 2-3:  Phase 3-6  (Finalize + Act + Prepare + LLM) 🟡 Parallel
Week 3-4:  Phase 7-8  (Memory + Browser)             🟡 Parallel
Week 4-5:  Phase 9    (Browser enhancements)         🟡 Parallel
Week 5-6:  Phase 10   (Full integration + E2E)       🟡 Critical
Week 6-10: Phase 10 + Buffer (Polish + P1 start)     ✅ Flex
```

---

## 🎯 Phase Status (Current)

| # | Phase | Status | LOC | Est Days | Parallel? |
|---|-------|--------|-----|----------|-----------|
| 0 | Fix Code Issues | ⏳ PENDING | 100 | 1 | ❌ |
| 1 | Verify Build | ⏳ PENDING | 0 | 0.1 | ❌ |
| 2 | Finalize | ⏳ PENDING | 50-80 | 1 | ✅ |
| 3 | Act | ⏳ PENDING | 80-120 | 1.5 | ✅ |
| 4 | Think | ⏳ PENDING | 100-150 | 2 | ✅ |
| 5 | Prepare | ⏳ PENDING | 30-50 | 0.5 | ✅ |
| 6 | LLM | ⏳ PENDING | 150-200 | 2.5 | ✅ |
| 7 | Memory | ⏳ PENDING | 200-250 | 3 | ✅ |
| 8 | Browser | ⏳ PENDING | 300-400 | 4 | ✅ |
| 9 | Integration | ⏳ PENDING | 100-150 | 3 | ✅ |

---

## ⚡ Dependencies at a Glance

```
Phase 0 (Code Fixes)
   ↓
Phase 1 (Build)
   ├─→ Phase 2 (Finalize)
   ├─→ Phase 3 (Act)
   ├─→ Phase 4 (Think) ← NEEDS Phase 6 + 7
   ├─→ Phase 5 (Prepare)
   ├─→ Phase 6 (LLM)
   ├─→ Phase 7 (Memory)
   └─→ Phase 8 (Browser)
        ↓
   Phase 9 (Integration)
```

**Parallel Groups:**
- Group A (Week 2-3): Phases 2, 3, 5 (small phases)
- Group B (Week 3-4): Phases 6, 7 (infrastructure)
- Group C (Week 4-5): Phase 8 (browser)
- Group D (Week 5-6): Phase 9 (integration)

---

## 🏗️ Architecture Reference

### Core Packages (37 total)

**Foundation (Critical):**
- `@inspect/shared` - Types & utils
- `@inspect/browser` - Playwright + vision
- `@inspect/llm` - LLM providers
- `@inspect/agent` - Agent loop & memory
- `@inspect/agent-memory` - Memory systems

**Support:**
- `@inspect/agent-tools` - Tool registry
- `@inspect/agent-watchdogs` - Crash detection
- `@inspect/observability` - Logging & metrics
- `@inspect/git` - Git operations

**Domains:**
- `@inspect/orchestrator` - Test execution
- `@inspect/workflow` - YAML workflows
- `@inspect/api` - HTTP API
- `@inspect/reporter` - Report generation
- 20+ others

---

## 🧪 Testing Quick Reference

### Unit Tests (by phase)
```bash
# Phase 2 (Finalize)
npx vitest run packages/agent/src/agent-loop/phases/finalize.test.ts

# Phase 3 (Act)
npx vitest run packages/agent/src/agent-loop/phases/act.test.ts

# etc...
```

### Integration Tests
```bash
# Full loop after Phase 9
npx vitest run packages/agent/src/agent-loop/integration.test.ts
```

### E2E Tests
```bash
# After Phase 9 integration
npx vitest run e2e/
```

---

## 💡 Tips & Tricks

### Build Faster
```bash
# Build only changed packages
pnpm build --filter "@inspect/{agent,browser,llm}"

# Skip type checking (dev only)
# Add --no-strict to tsconfig
```

### Find Files Quickly
```bash
# Find where something is defined
grep -r "findDefinition" packages/

# Find all tests for a module
find packages/agent -name "*.test.ts"
```

### Debug Agent Loop
```bash
# Add INSPECT_LOG_LEVEL=debug
INSPECT_LOG_LEVEL=debug node apps/cli/dist/index.js doctor

# Watch for crashes
npx vitest --reporter=verbose
```

---

## ⚠️ Common Issues & Fixes

### Build Fails
```
→ Check: Are all package.json files in packages/*/ ?
→ Check: Do they have correct dependencies?
→ Fix: pnpm install && pnpm build --filter @inspect/shared first
```

### Tests Fail After Changes
```
→ Check: Did you run pnpm install?
→ Check: Is dist/ folder deleted?
→ Fix: pnpm build --filter <changed-package>
→ Fix: npx vitest run <test-file>
```

### Type Errors
```
→ Never use 'any' - use 'as unknown as Type'
→ Check: Are you importing from barrel (index.ts)?
→ Check: Is the type exported in @inspect/shared?
```

### Performance Issues
```
→ Reduce LLM calls: Check message compaction
→ Reduce tokens: Check freeze mask usage
→ Profile: Add INSPECT_LOG_LEVEL=debug
```

---

## 📞 Who to Talk To

**Code Issues?** → See WAVE1-IMPLEMENTATION-KICKOFF.md  
**Architecture Questions?** → See PROJECT-ASSESSMENT-2026-04-02.md  
**Build Problems?** → See BUILD-FIX-PLAN.md  
**Overall Status?** → See EXECUTIVE-SUMMARY-2026-04-02.md  

---

## 🎯 Success Checklist

### Week 1 (Phases 0-1)
- [ ] All 4 code files fixed
- [ ] Build passes: `pnpm build`
- [ ] Tests pass: `npx vitest run`
- [ ] CLI works: `node apps/cli/dist/index.js --help`

### Week 2-3 (Phases 2-5)
- [ ] Finalize phase: Unit tests ✅
- [ ] Act phase: Unit tests ✅
- [ ] Prepare phase: Unit tests ✅
- [ ] Think phase: Unit tests ✅ (needs Phase 6+7)

### Week 3-5 (Phases 6-9)
- [ ] LLM retry: Tests + benchmarks
- [ ] Memory manager: Tests + 20%+ compression
- [ ] Browser enhancements: 100+ elements, bounding boxes
- [ ] Full integration: 3/3 test scenarios pass

### Week 10 (Polish)
- [ ] Documentation complete
- [ ] Code coverage >80%
- [ ] Zero lint errors
- [ ] Ready for Wave 2

---

## 🚀 Start Now

```bash
# Step 1: Read docs (30 min)
cat ACTION-ITEMS-IMMEDIATE.md
cat IMPLEMENTATION-ROADMAP-2026-04-02.md

# Step 2: Fix code (2-3 hours)
# Apply 4 fixes from Phase 0
# See ACTION-ITEMS-IMMEDIATE.md details

# Step 3: Verify (10 min)
pnpm install
pnpm build
npx vitest run

# Step 4: Commit
git add .
git commit -m "chore: fix critical code issues in agent-loop"

# Step 5: Start Phase 2
# Create packages/agent/src/agent-loop/phases/finalize.ts
```

---

**Status:** 🟢 Ready to Execute  
**Next Action:** Read ACTION-ITEMS-IMMEDIATE.md  
**Timeline:** 10 weeks to Wave 1 complete  
**Your Role:** Fix Phase 0 code issues → Start Phase 2-9 in parallel

**Good luck! 💪**
