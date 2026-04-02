# Inspect Implementation Roadmap - Wave 1 Complete Breakdown
**Date:** 2026-04-02  
**Prepared for:** High-parallelization implementation  
**Total Remaining Code:** ~23,000 LOC  
**Timeline:** 10 weeks (Wave 1) → 24 weeks (Waves 1-3 = Production Ready)

---

## 📊 Project Completion Status

### Overall Progress
```
Phase          Status      Completion  Remaining LOC
────────────────────────────────────────────────────
P0 (Core)      ✅ DONE     10/10 (100%)  0 LOC
Wave 1 (Arch)  ⏳ STARTED  50/190 (26%)  ~3,500 LOC
Wave 2 (Scale) 🔴 BLOCKED  15/240 (5%)   ~4,500 LOC
Wave 3 (Polish)🔴 BLOCKED  0/280 (0%)    ~5,000 LOC
────────────────────────────────────────────────────
TOTAL          🟡 PROGRESS 120/1,700 (7%) ~23,000 LOC
```

### Code Distribution by Wave
| Wave | Focus | Tasks | LOC | Effort |
|------|-------|-------|-----|--------|
| **Wave 1** | Agent loop, memory, browser | 190 | 3,500 | 10 weeks |
| **Wave 2** | CI/CD, scale, observability | 240 | 4,500 | 8 weeks |
| **Wave 3** | Testing capabilities | 280 | 5,000 | 6 weeks |
| **Wave 4** | Enterprise/compliance | 220 | 3,500 | 4 weeks |
| **Wave 5** | Advanced features | 760 | 6,500 | 4 weeks |

---

## 🎯 Wave 1: Foundation (10 weeks) — EXECUTION PLAN

### Week 1: Code Fixes & Build Verification

**Tasks:**
- **#1** Fix 4 critical code issues in agent-loop (2-3 hours)
- **#2** Verify build & tests (10-15 min)

**Deliverables:**
- ✅ All 37 packages build without errors
- ✅ 1,600+ tests passing
- ✅ Zero TypeScript/ESLint errors

**Effort:** 1 developer, 5-10 hours

---

### Weeks 2-3: Agent Loop Core (280-350 LOC)

**Parallel Track A: Base Phases (can run in parallel)**

| Week | Phase | LOC | Task | Notes |
|------|-------|-----|------|-------|
| **2** | #3 Finalize | 50-80 | Extract results, populate output | ✅ Can start immediately |
| **2** | #4 Act | 80-120 | Execute actions, call interaction API | ✅ Can start immediately |
| **2-3** | #5 Think | 100-150 | LLM call, structured output | ⚠️ Needs LLM integration (parallel) |
| **3** | #6 Prepare | 30-50 | Initialize state, setup watchdogs | ⏳ Unblocks rest of loop |

**Effort:** 3 developers (1 per phase + overlap) = 3 weeks @ 8 hrs/day

**Success Criteria:**
- [ ] Each phase has unit tests (80%+ coverage)
- [ ] Phases compose correctly in main loop
- [ ] No runtime errors when agents loop

---

### Weeks 3-5: Supporting Systems (350-450 LOC)

**Parallel Track B: Infrastructure (can run in parallel)**

| Week | Component | LOC | Task | Dependencies |
|------|-----------|-----|------|--------------|
| **3-4** | #7 LLM Retry/Fallback | 150-200 | Provider chains, exponential backoff | → Unblocks Phase 5 |
| **3-4** | #8 Memory Manager | 200-250 | Compaction, retention, freeze mask | → Unblocks Phase 5 |
| **4-5** | #9 Browser Enhancements | 300-400 | Multi-tree DOM, annotated screenshots | → Core capability |

**Effort:** 3 developers (1 per component) = 3 weeks @ 8 hrs/day

**Success Criteria:**
- [ ] LLM integration supports 4+ provider chains
- [ ] Memory manager reduces token usage by 20%+
- [ ] Browser can extract 100+ interactable elements from complex pages

---

### Week 5-6: Agent Loop Integration (100-150 LOC)

**Task #10: Full E2E Integration**

- Compose all phases into working agent loop
- Run 3 reference test scenarios
- Measure performance (latency, tokens, cost)
- Document known issues

**Success Criteria:**
- [ ] Agent loop executes 10 steps without crashing
- [ ] Latency: <2s per step (after LLM calls)
- [ ] Tokens: <500 per step (after compression)
- [ ] 3 test scenarios: 100% pass rate

**Effort:** 2 developers × 2 weeks = 4 weeks

---

## 🚀 Parallelization Strategy

### Sequential (MUST be done in order)
```
[#1] Code Fixes
        ↓
[#2] Build Verification
        ↓
   [#3] [#4] [#5] [#6]  ← Run in parallel!
   [#7] [#8] [#9]       ← Run in parallel!
        ↓
[#10] Full Integration
```

### Optimal Parallelization (3-4 developers)

**Developer A: Agent Loop Core**
- Week 2: #3 Finalize Phase
- Week 2-3: #4 Act Phase + unit tests
- Week 3: #6 Prepare Phase
- Week 5-6: #10 Integration lead

**Developer B: LLM & Memory**
- Week 3: #7 LLM Retry/Fallback
- Week 3-4: #8 Memory Manager
- Week 5-6: #10 Integration (memory)

**Developer C: Browser**
- Week 4-5: #9 Browser Enhancements
- Week 5-6: #10 Integration (browser)

**Developer D (Optional): Oversight**
- Code review & integration points
- Unblock issues
- Write E2E tests

---

## 📝 Implementation Checklist

### Phase 0: Code Fixes (#1)
- [ ] Fix brain.ts spread argument (line 152)
- [ ] Fix history.ts Effect.Service pattern (lines 17, 19, 56, 290-301)
- [ ] Fix llm-integration.ts method names & Effect.Schedule (multiple)
- [ ] Fix loop-full.ts Either import & types (lines 8-9, 55)
- [ ] Run `pnpm build` successfully

### Phase 1: Verify Build (#2)
- [ ] `pnpm build` → All 37 packages ✅
- [ ] `npx vitest run` → 1,600+ tests ✅
- [ ] `npm run lint` → 0 errors ✅
- [ ] CLI starts: `node apps/cli/dist/index.js --help` ✅

### Phase 2: Finalize Phase (#3)
- [ ] Create `packages/agent/src/agent-loop/phases/finalize.ts`
- [ ] Extract success signals from ActionResult
- [ ] Handle attachments (screenshots, HAR)
- [ ] Emit 'StepCompleted' event
- [ ] Write unit tests (80%+ coverage)
- [ ] Integration test with other phases

### Phase 3: Act Phase (#4)
- [ ] Create `packages/agent/src/agent-loop/phases/act.ts`
- [ ] Implement coordinate-based interaction
- [ ] Add DOM selector fallback
- [ ] Integrate with WatchdogManager
- [ ] Write unit tests
- [ ] Performance test (>50 actions/min)

### Phase 4: Think Phase (#5)
- [ ] Create `packages/agent/src/agent-loop/phases/think.ts`
- [ ] Implement LLM calling
- [ ] Generate dynamic action union
- [ ] Message compaction
- [ ] Structured output (AgentBrain)
- [ ] Write unit tests + integration test

### Phase 5: Prepare Phase (#6)
- [ ] Create `packages/agent/src/agent-loop/phases/prepare.ts`
- [ ] State validation
- [ ] Watchdog initialization
- [ ] Memory manager setup
- [ ] Write unit tests

### Phase 6: LLM Integration (#7)
- [ ] Create `packages/agent/src/llm-integration/retry.ts`
- [ ] Implement exponential backoff
- [ ] Provider fallback chain
- [ ] Token limit handling
- [ ] Cost tracking
- [ ] Observability hooks
- [ ] Write unit tests + chaos tests

### Phase 7: Memory Manager (#8)
- [ ] Create `packages/agent/src/memory-manager/manager.ts`
- [ ] Implement short/long-term memory
- [ ] Message compaction
- [ ] Freeze mask for caching
- [ ] Retention policies
- [ ] Write unit tests

### Phase 8: Browser Enhancements (#9)
- [ ] Multi-tree DOM collection
- [ ] Annotated screenshots
- [ ] Coordinate-based interaction
- [ ] Visibility & interactability detection
- [ ] Write unit tests

### Phase 9: Integration (#10)
- [ ] Compose all phases
- [ ] Write 3 reference E2E tests
- [ ] Measure performance
- [ ] Document results
- [ ] Create production handoff

---

## 📊 Estimated Timeline (Best Case)

```
Week 1:    Phase 0-1      (Code + Build)
Week 2-3:  Phases 3-6     (Loop cores in parallel)
Week 4:    Phases 7-8     (Support systems)
Week 5:    Phase 9        (Browser)
Week 6-10: Phase 10 + P1  (Integration + Buffer)

TOTAL: 10 weeks → Production-ready Wave 1
```

---

## 💰 Resource Estimate

| Resource | Duration | FTE | Cost (Est) |
|----------|----------|-----|-----------|
| Development | 10 weeks | 3.0 | 3 devs |
| Code Review | 10 weeks | 0.5 | Code lead |
| QA/Testing | 10 weeks | 0.5 | QA engineer |
| DevOps | 2 weeks | 0.3 | Release eng |
| **Total** | **10 weeks** | **4.3** | **~$150-200k** |

---

## 🎯 Success Metrics

### Code Quality
- ✅ TypeScript strict mode: 0 errors
- ✅ Test coverage: >80% for new code
- ✅ ESLint: 0 errors
- ✅ No `any` types (use `as unknown as Type` only)

### Performance
- ✅ Agent loop latency: <2s per step
- ✅ Token usage: <500 per step
- ✅ Cost: <$0.10 per test execution
- ✅ Memory: <500MB per browser session

### Functionality
- ✅ Agent completes 3/3 test scenarios
- ✅ Handles failures gracefully
- ✅ Memory compaction active
- ✅ All watchdogs functional

### Documentation
- ✅ All modules have JSDoc comments
- ✅ README in each package
- ✅ Architecture decision records (ADRs)
- ✅ Contributing guide updated

---

## 📚 Reference Documents

**To understand the scope:**
1. `PLAN.md` (original 1,700-task plan)
2. `PROJECT-ASSESSMENT-2026-04-02.md` (detailed analysis)
3. `OSS-REF-ANALYSIS.md` (27-repo competitive analysis)

**To get started:**
1. Read this file (you are here)
2. Review `CLAUDE.md` (project conventions)
3. Start with Phase 0 fixes
4. Follow checklist above

**For detailed implementation:**
See `WAVE1-IMPLEMENTATION-KICKOFF.md` for:
- File-by-file code patterns
- Testing strategy
- Dependency graph
- Known issues to watch

---

## ⚠️ Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LLM API rate limits | Medium | High | Implement backoff + provider fallback |
| Browser crashes | Medium | High | Watchdog system + crash recovery |
| Token explosion | High | High | Message compaction + freeze mask |
| Type errors in Effect | Medium | Medium | Use `@inspect/cookies` as template |
| Performance regression | Low | High | Benchmark at each phase |

---

## 🚀 Next Steps

1. **TODAY:** Read this file + ACTION-ITEMS-IMMEDIATE.md
2. **TOMORROW:** Fix Phase 0 code issues (2-3 hours)
3. **TOMORROW AFTERNOON:** Verify build passes (#1-2)
4. **WEEK 2:** Start Phases 3-6 in parallel

**Questions?** See CLAUDE.md or reach out to team.

---

**Status:** 🟢 Ready to Execute  
**Date Prepared:** 2026-04-02  
**Last Updated:** 2026-04-02 End of Day
